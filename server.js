// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const OpenAI = require('openai');
const crypto = require('crypto');
const db = require('./db');
const nexusV2 = require('./nexus-v2');
const nexusV35 = require('./nexus-v3.5');
const nexusProduction = require('./nexus-production');

const app = express();
const PORT = process.env.PORT || 3000;

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/images', express.static('images')); // Serve background slideshow images
app.use(session({
  secret: process.env.SESSION_SECRET || 'rotary-networking-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: false, // Allow cookies over HTTP and HTTPS (needed for Render)
    httpOnly: true,
    sameSite: 'lax' // Allow cookies to work across page navigations
  }
}));

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/reg.html');
});

// Health check endpoint for Render
app.get('/healthz', async (req, res) => {
  try {
    // Test database connection
    await db.query('SELECT 1');
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ status: 'error', message: 'Database connection failed' });
  }
});

// Database probe endpoint - TEMPORARY for debugging
// TODO: Remove this after verifying DB connection works
app.get('/db/count', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM members');
    res.json({ members: rows[0].c });
  } catch (error) {
    console.error('DB COUNT ERROR:', error);
    res.status(500).json({
      error: 'db_connect_failed',
      message: error.message,
      code: error.code
    });
  }
});

// Admin session check endpoint - TEMPORARY for debugging
// TODO: Remove this after verifying session works
app.get('/api/admin/session-check', (req, res) => {
  res.json({
    hasSession: !!req.session,
    sessionID: req.sessionID,
    adminId: req.session?.adminId || null,
    isAuthenticated: !!req.session?.adminId,
    cookie: req.session?.cookie
  });
});

// DEBUG ENDPOINT - Get complete scoring breakdown for a member
// TEMPORARY: Shows ALL candidates with detailed scores
app.get('/api/debug/matches/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    console.log(`🐛 DEBUG: Analyzing all matches for ${memberId}`);

    const member = await db.get('SELECT * FROM members WHERE member_id = $1', [memberId]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Check if embedding exists
    let memberVector = await db.get('SELECT embedding_ops FROM vectors WHERE member_id = $1', [memberId]);

    const debugInfo = {
      member: {
        id: member.member_id,
        name: member.name,
        org: member.org,
        industry: member.industry,
        city: member.city,
        hasEmbedding: !!memberVector,
        embeddingSize: memberVector ? JSON.parse(memberVector.embedding_ops).length : 0
      },
      candidates: [],
      summary: {}
    };

    if (!memberVector) {
      console.log('⚠️  No embedding found, generating...');
      await generateEmbedding(memberId);
      memberVector = await db.get('SELECT embedding_ops FROM vectors WHERE member_id = $1', [memberId]);
      debugInfo.member.hasEmbedding = !!memberVector;
      debugInfo.member.embeddingGenerated = true;
    }

    if (!memberVector) {
      return res.json({
        ...debugInfo,
        error: 'Could not generate embedding'
      });
    }

    const memberEmbedding = JSON.parse(memberVector.embedding_ops);

    // Get ALL candidates
    const candidates = await db.all(`
      SELECT m.*, v.embedding_ops
      FROM members m
      JOIN vectors v ON m.member_id = v.member_id
      WHERE m.member_id != $1 AND m.consent = true
    `, [memberId]);

    console.log(`🐛 Found ${candidates.length} candidates`);

    // Score each one with detailed breakdown
    const scored = candidates.map((candidate, idx) => {
      try {
        const candidateEmbedding = JSON.parse(candidate.embedding_ops);
        const similarity = cosineSimilarity(memberEmbedding, candidateEmbedding);
        const scoreData = calculateMatchScore(member, candidate, similarity);

        return {
          rank: idx + 1,
          name: candidate.name,
          org: candidate.org,
          industry: candidate.industry,
          city: candidate.city,
          score: scoreData.score,
          similarity: similarity.toFixed(4),
          fullBreakdown: scoreData.fullBreakdown,
          summary: scoreData.summary,
          isValidMatch: scoreData.score > 0, // Only excludes self-matches (score = 0)
          qualityTier: scoreData.score >= 75 ? 'excellent' : scoreData.score >= 60 ? 'strong' : scoreData.score >= 50 ? 'good' : scoreData.score >= 40 ? 'moderate' : 'baseline'
        };
      } catch (error) {
        return {
          rank: idx + 1,
          name: candidate.name,
          org: candidate.org,
          error: error.message,
          score: 0
        };
      }
    });

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    debugInfo.candidates = scored;
    // Score Diagnostics
    const validScores = scored.filter(s => typeof s.score === 'number' && isFinite(s.score)).map(s => s.score);
    const invalidCount = scored.filter(s => typeof s.score !== 'number' || !isFinite(s.score)).length;

    let scoreStats = {};
    if (validScores.length > 0) {
      validScores.sort((a, b) => a - b);
      const mean = validScores.reduce((sum, s) => sum + s, 0) / validScores.length;
      const median = validScores[Math.floor(validScores.length / 2)];
      const variance = validScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / validScores.length;
      scoreStats = {
        min: Math.round(validScores[0] * 10) / 10,
        max: Math.round(validScores[validScores.length - 1] * 10) / 10,
        mean: Math.round(mean * 10) / 10,
        median: Math.round(median * 10) / 10,
        std: Math.round(Math.sqrt(variance) * 10) / 10
      };
    }

    debugInfo.summary = {
      totalCandidates: scored.length,
      validMatches: scored.filter(s => s.score > 0).length,
      invalidScores: invalidCount,
      averageScore: (scored.reduce((sum, s) => sum + s.score, 0) / scored.length).toFixed(2),
      averageSimilarity: (scored.reduce((sum, s) => sum + parseFloat(s.similarity || 0), 0) / scored.length).toFixed(4),
      scoreStats,
      scoreDistribution: {
        excellent: scored.filter(s => s.score >= 75).length,
        strong: scored.filter(s => s.score >= 60 && s.score < 75).length,
        good: scored.filter(s => s.score >= 50 && s.score < 60).length,
        moderate: scored.filter(s => s.score >= 40 && s.score < 50).length,
        baseline: scored.filter(s => s.score >= 30 && s.score < 40).length
      },
      philosophy: 'NO FILTERING - All valid matches included (every business professional has networking potential)'
    };

    console.log(`🐛 Summary: ${debugInfo.summary.validMatches} valid matches (no filtering - all included)`);

    res.json(debugInfo);
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Helper functions
function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Calculate cosine similarity
function cosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// Calculate match score with detailed breakdown (100-point system)
// PHILOSOPHY: Every business professional has networking potential - score reflects quality/synergy depth
function calculateMatchScore(member1, member2, similarity, complementaryValueResearch = null) {
  const breakdown = [];
  const fullBreakdown = [];
  let totalScore = 0;

  // Prevent self-matching
  if (member1.member_id === member2.member_id) {
    return { score: 0, breakdown: [], fullBreakdown: [], summary: { earned: 0, possible: 100, percentage: 0, grade: 'N/A' } };
  }

  // ============================================================================
  // 1. UNIVERSAL BUSINESS POTENTIAL (30 points BASELINE)
  // ============================================================================
  // Every attendee gets this - represents fundamental networking value
  const universalPoints = 30;

  // Build SPECIFIC universal value reasons based on actual profile data
  const universalReasons = [];

  // Reason 1: Role-specific strategic value
  const roleA = (member1.role || '').toLowerCase();
  const roleB = (member2.role || '').toLowerCase();
  if (roleA.includes('ceo') || roleA.includes('founder') || roleA.includes('owner')) {
    if (roleB.includes('ceo') || roleB.includes('founder') || roleB.includes('owner')) {
      universalReasons.push(`Both decision-makers: Can authorize partnerships, investments, or strategic deals on the spot`);
    } else {
      universalReasons.push(`Decision-maker meeting specialist: Direct path to implementation without bureaucracy`);
    }
  } else {
    universalReasons.push(`Operational expertise: Both understand the day-to-day realities of executing business strategy`);
  }

  // Reason 2: Revenue model knowledge transfer
  const revA = member1.rev_driver || '';
  const revB = member2.rev_driver || '';
  if (revA && revB) {
    universalReasons.push(`Revenue model exchange: "${revA.substring(0, 40)}..." can inform "${revB.substring(0, 40)}..." and vice versa`);
  } else {
    universalReasons.push(`Business model innovation: Opportunity to learn how different companies generate revenue`);
  }

  // Reason 3: Constraint as teaching opportunity
  const constraintA = member1.current_constraint || '';
  const constraintB = member2.current_constraint || '';
  if (constraintA && constraintB) {
    universalReasons.push(`Parallel challenges: Both facing "${constraintA.substring(0, 35)}..." and "${constraintB.substring(0, 35)}..." - shared problem-solving opportunity`);
  } else if (constraintA || constraintB) {
    universalReasons.push(`Growth mindset: One party's solved problem may be the other's current challenge`);
  } else {
    universalReasons.push(`Proven operators: No stated constraints suggests sophisticated problem-solving capabilities`);
  }

  // Reason 4: Network effect multiplication (always true)
  universalReasons.push(`Network multiplication: Each person's Rolodex becomes accessible (clients, vendors, investors, mentors, talent)`);

  const universalCategory = {
    factor: 'Universal Business Potential',
    points: universalPoints,
    maxPoints: 30,
    earned: universalPoints,
    percentage: 100,
    description: `Baseline value from business leadership connection: knowledge transfer, network access, strategic positioning`,
    status: 'baseline',
    reasoning: universalReasons
  };
  breakdown.push(universalCategory);
  fullBreakdown.push(universalCategory);
  totalScore += universalPoints;

  // ============================================================================
  // 2. SEMANTIC PROFILE SIMILARITY (0-20 points)
  // ============================================================================
  const maxSemanticPoints = 20;
  const semanticPoints = Math.round(similarity * maxSemanticPoints);
  const semanticCategory = {
    factor: 'Semantic Profile Similarity',
    points: semanticPoints,
    maxPoints: maxSemanticPoints,
    earned: semanticPoints,
    percentage: Math.round((semanticPoints / maxSemanticPoints) * 100),
    description: 'AI embedding analysis of overall profile compatibility',
    status: semanticPoints > 14 ? 'strong' : semanticPoints > 8 ? 'moderate' : 'complementary',
    rawSimilarity: similarity.toFixed(4)
  };
  breakdown.push(semanticCategory);
  fullBreakdown.push(semanticCategory);
  totalScore += semanticPoints;

  // Parse needs and assets for multiple categories
  const member1Needs = member1.needs ? member1.needs.split(',').map(n => n.trim().toLowerCase()) : [];
  const member1Assets = member1.assets ? member1.assets.split(',').map(a => a.trim().toLowerCase()) : [];
  const member2Needs = member2.needs ? member2.needs.split(',').map(n => n.trim().toLowerCase()) : [];
  const member2Assets = member2.assets ? member2.assets.split(',').map(a => a.trim().toLowerCase()) : [];

  // ============================================================================
  // 3. COMPLEMENTARY VALUE EXCHANGE (0-20 points) - ENHANCED MATCHING
  // ============================================================================
  let complementaryMatches = 0;
  const matches = [];

  // Enhanced matching with synonyms and semantic clusters
  const matchesNeedAsset = (need, asset) => {
    // Direct substring match
    if (asset.includes(need) || need.includes(asset)) return true;

    // Keyword-based semantic matching
    const keywords = {
      // Marketing cluster
      'marketing': ['seo', 'social media', 'content', 'brand', 'advertising', 'promotion', 'digital marketing', 'pr', 'public relations', 'campaign'],
      'seo': ['marketing', 'digital marketing', 'google', 'search', 'content', 'web'],
      'social media': ['marketing', 'content creation', 'brand', 'instagram', 'facebook', 'linkedin', 'tiktok'],
      'branding': ['marketing', 'design', 'logo', 'identity', 'brand strategy'],
      'content': ['marketing', 'writing', 'blog', 'social media', 'video', 'copywriting'],

      // Sales cluster
      'sales': ['lead generation', 'business development', 'revenue', 'customers', 'pipeline'],
      'lead generation': ['sales', 'marketing', 'outreach', 'prospecting', 'demand generation'],
      'business development': ['sales', 'partnerships', 'growth', 'revenue', 'clients'],

      // Technical cluster
      'tech': ['technology', 'software', 'development', 'engineering', 'it', 'technical'],
      'software': ['tech', 'development', 'app', 'platform', 'saas', 'coding'],
      'web development': ['tech', 'software', 'website', 'coding', 'programming', 'web design'],
      'app development': ['tech', 'software', 'mobile', 'coding'],
      'automation': ['tech', 'software', 'efficiency', 'tools', 'systems'],

      // Financial cluster
      'finance': ['accounting', 'bookkeeping', 'cfo', 'financial planning', 'capital'],
      'funding': ['capital', 'investment', 'money', 'financing', 'fundraising'],
      'investment': ['capital', 'funding', 'money', 'financing', 'venture'],

      // Operational cluster
      'operations': ['management', 'efficiency', 'process', 'logistics', 'systems'],
      'logistics': ['operations', 'supply chain', 'shipping', 'delivery', 'distribution'],
      'hiring': ['talent', 'recruitment', 'hr', 'staffing', 'team building'],
      'talent': ['hiring', 'recruitment', 'team', 'employees', 'hr'],

      // Strategic cluster
      'strategy': ['planning', 'consulting', 'advisory', 'business strategy', 'growth strategy'],
      'consulting': ['advisory', 'strategy', 'expertise', 'guidance'],
      'partnerships': ['collaboration', 'alliances', 'business development', 'joint venture']
    };

    // Check if need and asset are in the same semantic cluster
    const needLower = need.toLowerCase();
    const assetLower = asset.toLowerCase();

    for (const [key, synonyms] of Object.entries(keywords)) {
      if ((needLower.includes(key) || synonyms.some(syn => needLower.includes(syn))) &&
          (assetLower.includes(key) || synonyms.some(syn => assetLower.includes(syn)))) {
        return true;
      }
    }

    // Check for common business need patterns
    const needPatterns = [
      { need: /customer|client|lead/i, asset: /sales|marketing|business development|crm/i },
      { need: /revenue|money|profit/i, asset: /sales|marketing|finance|pricing|monetization/i },
      { need: /website|web|online/i, asset: /web|development|design|digital|tech/i },
      { need: /brand|awareness|visibility/i, asset: /marketing|pr|social|media|branding/i },
      { need: /scale|growth|expand/i, asset: /strategy|consulting|automation|systems|operations/i },
      { need: /team|hire|talent/i, asset: /hr|recruitment|staffing|hiring/i },
      { need: /legal|contract|compliance/i, asset: /law|attorney|legal/i },
      { need: /capital|funding|money/i, asset: /investment|finance|funding|capital/i }
    ];

    for (const pattern of needPatterns) {
      if (pattern.need.test(need) && pattern.asset.test(asset)) {
        return true;
      }
    }

    return false;
  };

  // Check if member1's assets match member2's needs (with enhanced matching)
  for (const asset of member1Assets) {
    for (const need of member2Needs) {
      if (matchesNeedAsset(need, asset)) {
        complementaryMatches++;
        matches.push(`Your "${asset}" addresses their need for "${need}"`);
      }
    }
  }

  // Check if member2's assets match member1's needs (with enhanced matching)
  for (const asset of member2Assets) {
    for (const need of member1Needs) {
      if (matchesNeedAsset(need, asset)) {
        complementaryMatches++;
        matches.push(`Their "${asset}" addresses your need for "${need}"`);
      }
    }
  }

  // Also check constraint-to-asset matching (constraint often indicates deeper need)
  const constraint1Lower = (member1.current_constraint || '').toLowerCase();
  const constraint2Lower = (member2.current_constraint || '').toLowerCase();

  if (constraint2Lower) {
    for (const asset of member1Assets) {
      if (matchesNeedAsset(constraint2Lower, asset)) {
        complementaryMatches++;
        matches.push(`Your "${asset}" can help solve their stated challenge: "${member2.current_constraint.substring(0, 50)}..."`);
      }
    }
  }

  if (constraint1Lower) {
    for (const asset of member2Assets) {
      if (matchesNeedAsset(constraint1Lower, asset)) {
        complementaryMatches++;
        matches.push(`Their "${asset}" can help solve your stated challenge: "${member1.current_constraint.substring(0, 50)}..."`);
      }
    }
  }

  const maxComplementaryPoints = 20;
  let complementaryPoints = Math.min(complementaryMatches * 4, maxComplementaryPoints); // 4 points per match (was 5, adjusted for more matches)

  // ENHANCED: If we have deep complementary value research with CREATIVE COLLABORATION IDEAS, use it to improve scoring
  let researchFindings = [];
  if (complementaryValueResearch) {
    // PRIMARY: Check for creative collaboration ideas (this is the main value we're looking for!)
    const creativeIdeas = complementaryValueResearch.creative_collaboration_ideas || [];
    const creativeIdeasCount = Array.isArray(creativeIdeas) ? creativeIdeas.length : 0;

    // Award points based on research quality AND creative ideas
    const valueRating = (complementaryValueResearch.value_rating || '').toLowerCase();

    // PRIORITY 1: Creative collaboration ideas drive the score
    if (creativeIdeasCount >= 4) {
      complementaryPoints = Math.max(complementaryPoints, 16); // 4+ creative ideas = high value
      researchFindings.push(`🎨 ${creativeIdeasCount} creative collaboration opportunities identified`);
    } else if (creativeIdeasCount >= 2) {
      complementaryPoints = Math.max(complementaryPoints, 12); // 2-3 creative ideas = good value
      researchFindings.push(`🎨 ${creativeIdeasCount} creative collaboration opportunities identified`);
    } else if (creativeIdeasCount >= 1) {
      complementaryPoints = Math.max(complementaryPoints, 8); // 1 creative idea = baseline value
      researchFindings.push(`🎨 ${creativeIdeasCount} creative collaboration opportunity identified`);
    }

    // PRIORITY 2: Overall value rating (if creative ideas don't already set score high)
    if (valueRating === 'high') {
      complementaryPoints = Math.max(complementaryPoints, 14); // Ensure at least 14/20 for high-value matches
      if (!researchFindings.some(f => f.includes('creative collaboration'))) {
        researchFindings.push(`🔬 Research confirms HIGH complementary value potential`);
      }
    } else if (valueRating === 'medium') {
      complementaryPoints = Math.max(complementaryPoints, 9); // Ensure at least 9/20 for medium-value
      if (!researchFindings.some(f => f.includes('creative collaboration'))) {
        researchFindings.push(`🔬 Research indicates MEDIUM complementary value potential`);
      }
    } else if (valueRating === 'low' && creativeIdeasCount === 0) {
      // Even "low" rating should get SOME points - every business has collaboration potential
      complementaryPoints = Math.max(complementaryPoints, 4);
      researchFindings.push(`💡 Exploratory collaboration potential - ideas to bring to the table`);
    }

    // DISPLAY: Show the actual creative ideas (PRIMARY focus)
    if (creativeIdeas.length > 0) {
      creativeIdeas.slice(0, 3).forEach((idea, idx) => {
        researchFindings.push(`${idx + 1}. ${idea}`);
      });
    }

    // Add top opportunities from research (if they exist and aren't already covered by creative ideas)
    if (complementaryValueResearch.top_3_opportunities && complementaryValueResearch.top_3_opportunities.length > 0) {
      if (creativeIdeas.length === 0) {
        // Only show top_3_opportunities if creative_collaboration_ideas wasn't provided
        complementaryValueResearch.top_3_opportunities.slice(0, 3).forEach((opp, idx) => {
          researchFindings.push(`${idx + 1}. ${opp}`);
        });
      }
    }

    // Add direct matches from research (secondary info)
    if (complementaryValueResearch.direct_matches && researchFindings.length < 4) {
      const directMatchesSummary = typeof complementaryValueResearch.direct_matches === 'string'
        ? complementaryValueResearch.direct_matches.substring(0, 120)
        : JSON.stringify(complementaryValueResearch.direct_matches).substring(0, 120);
      if (directMatchesSummary && directMatchesSummary.length > 10) {
        researchFindings.push(`Direct matches: ${directMatchesSummary}...`);
      }
    }

    // Add network value (highly relevant for creative collaboration)
    if (complementaryValueResearch.network_value && researchFindings.length < 5) {
      const networkValueSummary = typeof complementaryValueResearch.network_value === 'string'
        ? complementaryValueResearch.network_value.substring(0, 120)
        : JSON.stringify(complementaryValueResearch.network_value).substring(0, 120);
      if (networkValueSummary && networkValueSummary.length > 10) {
        researchFindings.push(`Network value: ${networkValueSummary}...`);
      }
    }
  }

  // Combine semantic matches with research findings (prioritize research)
  const allDetails = [...researchFindings.slice(0, 4), ...matches.slice(0, 2)];

  const complementaryCategory = {
    factor: 'Complementary Value Exchange',
    points: complementaryPoints,
    maxPoints: maxComplementaryPoints,
    earned: complementaryPoints,
    percentage: Math.round((complementaryPoints / maxComplementaryPoints) * 100),
    description: complementaryValueResearch
      ? `AI-researched creative collaboration opportunities (${complementaryValueResearch.creative_collaboration_ideas?.length || 0} ideas generated)`
      : complementaryPoints > 0
        ? `${complementaryMatches} asset/need alignments via semantic analysis`
        : 'Potential for creative collaboration beyond explicit needs/assets',
    status: complementaryPoints > 12 ? 'strong' : complementaryPoints > 6 ? 'moderate' : 'exploratory',
    details: allDetails.length > 0 ? allDetails : ['Creative collaboration opportunities to be explored in conversation'],
    researchBacked: !!complementaryValueResearch
  };
  breakdown.push(complementaryCategory);
  fullBreakdown.push(complementaryCategory);
  totalScore += complementaryPoints;

  // ============================================================================
  // 4. MARKET ALIGNMENT (0-15 points) - INFERRED BUSINESS INTELLIGENCE
  // ============================================================================
  let marketPoints = 0;
  const marketInsights = [];

  // Infer B2B vs B2C from revenue driver
  const rev1 = (member1.rev_driver || '').toLowerCase();
  const rev2 = (member2.rev_driver || '').toLowerCase();
  const isB2B1 = rev1.includes('b2b') || rev1.includes('enterprise') || rev1.includes('saas') || rev1.includes('consulting') || rev1.includes('agency');
  const isB2B2 = rev2.includes('b2b') || rev2.includes('enterprise') || rev2.includes('saas') || rev2.includes('consulting') || rev2.includes('agency');
  const isB2C1 = rev1.includes('retail') || rev1.includes('consumer') || rev1.includes('ecommerce') || rev1.includes('subscription');
  const isB2C2 = rev2.includes('retail') || rev2.includes('consumer') || rev2.includes('ecommerce') || rev2.includes('subscription');

  if ((isB2B1 && isB2B2) || (isB2C1 && isB2C2)) {
    marketPoints += 5;
    marketInsights.push('Similar business model (both B2B or both B2C)');
  } else if ((isB2B1 && isB2C2) || (isB2C1 && isB2B2)) {
    marketPoints += 3;
    marketInsights.push('Complementary business models - can learn from each other');
  }

  // Infer business maturity/scale from role + fun facts
  const role1 = (member1.role || '').toLowerCase();
  const role2 = (member2.role || '').toLowerCase();
  const funfact1 = (member1.fun_fact || '').toLowerCase();
  const funfact2 = (member2.fun_fact || '').toLowerCase();

  const isFounder1 = role1.includes('founder') || role1.includes('ceo') || role1.includes('owner');
  const isFounder2 = role2.includes('founder') || role2.includes('ceo') || role2.includes('owner');
  const isEstablished1 = funfact1.match(/\$\d+[mk]|\d+ year|million|billion|national|awarded/i);
  const isEstablished2 = funfact2.match(/\$\d+[mk]|\d+ year|million|billion|national|awarded/i);

  if (isFounder1 && isFounder2) {
    marketPoints += 5;
    marketInsights.push('Both founders/CEOs - shared leadership perspective');
  }

  if (isEstablished1 && isEstablished2) {
    marketPoints += 3;
    marketInsights.push('Both have proven track records of success');
  } else if ((isEstablished1 && !isEstablished2) || (!isEstablished1 && isEstablished2)) {
    marketPoints += 2;
    marketInsights.push('Mentorship opportunity - different growth stages');
  }

  // Infer revenue growth mindset (everyone in business wants to grow)
  if (member1.current_constraint && member2.current_constraint) {
    marketPoints += 2;
    marketInsights.push('Both actively working to overcome growth constraints');
  }

  const maxMarketPoints = 15;
  marketPoints = Math.min(marketPoints, maxMarketPoints);
  const marketCategory = {
    factor: 'Market Alignment',
    points: marketPoints,
    maxPoints: maxMarketPoints,
    earned: marketPoints,
    percentage: Math.round((marketPoints / maxMarketPoints) * 100),
    description: 'Inferred compatibility based on business model, scale, and growth stage',
    status: marketPoints > 10 ? 'strong' : marketPoints > 5 ? 'moderate' : 'foundational',
    insights: marketInsights
  };
  breakdown.push(marketCategory);
  fullBreakdown.push(marketCategory);
  totalScore += marketPoints;

  // ============================================================================
  // 5. GEOGRAPHIC & LOGISTICAL SYNERGY (0-5 points) - REDUCED WEIGHT
  // ============================================================================
  // NOTE: Location is now 5% of total score (was 10%). Business relevance > geographic proximity.
  // We don't want to match dentists with sewer companies just because they're in the same city.
  const maxLocationPoints = 5;
  let locationPoints = 0;
  let locationDescription = '';

  const city1 = (member1.city || '').toLowerCase().trim();
  const city2 = (member2.city || '').toLowerCase().trim();

  if (city1 && city2) {
    if (city1 === city2) {
      locationPoints = 5; // Same city = small bonus, not primary factor
      locationDescription = `Both in ${member1.city} - option for in-person meetings`;
    } else {
      // Different cities - still perfectly viable for collaboration in 2024
      locationPoints = 2;
      locationDescription = `Different locations (${member1.city} / ${member2.city}) - remote collaboration is standard`;
    }
  } else {
    locationPoints = 2;
    locationDescription = 'Geography-independent - modern collaboration transcends location';
  }

  const locationCategory = {
    factor: 'Geographic & Logistical Synergy',
    points: locationPoints,
    maxPoints: maxLocationPoints,
    earned: locationPoints,
    percentage: Math.round((locationPoints / maxLocationPoints) * 100),
    description: locationDescription,
    status: locationPoints >= 5 ? 'local' : 'remote-friendly'
  };
  breakdown.push(locationCategory);
  fullBreakdown.push(locationCategory);
  totalScore += locationPoints;

  // ============================================================================
  // 6. STRATEGIC GROWTH OPPORTUNITIES (0-10 points) - BUSINESS RELEVANCE OVER GEOGRAPHY
  // ============================================================================
  // NOTE: Increased from 5 to 10 points (compensating for location reduction).
  // Business strategic fit should matter MORE than being in the same city.
  let strategyPoints = 0;
  const strategyInsights = [];

  // Industry cross-pollination with SPECIFIC strategic value
  const ind1 = (member1.industry || '').toLowerCase();
  const ind2 = (member2.industry || '').toLowerCase();

  // Define specific cross-industry synergies (not generic!)
  const crossIndustrySynergies = {
    'technology-marketing': 'Tech can build tools marketing needs; Marketing can bring tech to market',
    'technology-finance': 'Tech provides fintech innovation; Finance provides investment capital',
    'technology-real estate': 'Tech enables PropTech solutions; Real estate provides distribution channels',
    'marketing-real estate': 'Marketing drives property visibility; Real estate provides case studies',
    'marketing-finance': 'Marketing drives client acquisition; Finance provides campaign capital',
    'marketing-food & hospitality': 'Marketing fills seats/tables; F&B provides authentic brand stories',
    'technology-food & hospitality': 'Tech streamlines operations/ordering; F&B provides user testing ground',
    'real estate-legal': 'Real estate needs legal for transactions; Legal needs real estate clients',
    'finance-legal': 'Finance needs legal for compliance; Legal needs finance for M&A deals',
    'online education-marketing': 'Education needs student acquisition; Marketing needs training content',
    'consulting-*': 'Consulting can analyze ANY business; Every business can provide consulting case studies'
  };

  if (ind1 && ind2 && ind1 !== ind2) {
    const pair1 = `${ind1}-${ind2}`.toLowerCase();
    const pair2 = `${ind2}-${ind1}`.toLowerCase();
    const wildcard1 = `${ind1}-*`.toLowerCase();
    const wildcard2 = `${ind2}-*`.toLowerCase();

    let synergyFound = false;
    if (crossIndustrySynergies[pair1]) {
      strategyInsights.push(`${member1.industry} × ${member2.industry}: ${crossIndustrySynergies[pair1]}`);
      strategyPoints += 6; // Increased from 3 to 6 (doubled weight)
      synergyFound = true;
    } else if (crossIndustrySynergies[pair2]) {
      strategyInsights.push(`${member1.industry} × ${member2.industry}: ${crossIndustrySynergies[pair2]}`);
      strategyPoints += 6; // Increased from 3 to 6
      synergyFound = true;
    } else if (crossIndustrySynergies[wildcard1]) {
      strategyInsights.push(`${member1.industry} advantage: ${crossIndustrySynergies[wildcard1]}`);
      strategyPoints += 4; // Increased from 2 to 4
      synergyFound = true;
    } else if (crossIndustrySynergies[wildcard2]) {
      strategyInsights.push(`${member2.industry} advantage: ${crossIndustrySynergies[wildcard2]}`);
      strategyPoints += 4; // Increased from 2 to 4
      synergyFound = true;
    }

    if (!synergyFound) {
      // Generic cross-industry benefit
      strategyInsights.push(`Cross-industry perspective: Each brings blind spots the other can illuminate`);
      strategyPoints += 2; // Increased from 1 to 2
    }
  } else if (ind1 && ind2 && ind1 === ind2) {
    // Same industry - specific value based on actual industry (HIGHER VALUE than different cities!)
    const sameIndustryValue = {
      'technology': 'Peer benchmarking on metrics, tech stack choices, and hiring strategies',
      'marketing': 'Share what campaigns worked, avoid each other\'s mistakes, co-pitch large clients',
      'real estate': 'Off-market deal sharing, co-investing opportunities, market intelligence',
      'finance': 'Deal flow sharing, co-investment opportunities, risk mitigation strategies',
      'consulting': 'Niche specialization referrals, subcontracting overflow work',
      'food & hospitality': 'Supplier negotiations leverage, event cross-promotion, crisis management playbook',
      'legal': 'Referrals for specialty areas, overflow capacity during busy seasons',
      'online education': 'Course co-creation, student cross-promotion, platform technology sharing',
      'construction': 'Subcontracting opportunities, vendor relationships, equipment sharing, joint bidding',
      'manufacturing': 'Supply chain optimization, bulk purchasing power, overflow capacity',
      'healthcare': 'Cross-referrals for specialties, shared compliance knowledge, patient coordination'
    };

    const industryValue = sameIndustryValue[ind1] || 'Industry peer insights, competitive intelligence, potential collaboration on shared challenges';
    strategyInsights.push(`Same industry (${member1.industry}): ${industryValue}`);
    strategyPoints += 4; // Increased from 2 to 4 - same industry > same city!
  }

  // Constraint-solution strategic partnerships (SPECIFIC)
  if (member1.current_constraint && member2Assets.length > 0) {
    // Check if any of member2's assets could plausibly address member1's constraint
    const constraint1Words = constraint1Lower.split(/\s+/);
    const assetMatches = member2Assets.filter(asset =>
      constraint1Words.some(word => word.length > 3 && asset.includes(word))
    );

    if (assetMatches.length > 0) {
      strategyInsights.push(`Solution partnership: Their ${assetMatches[0]} may address your "${member1.current_constraint.substring(0, 40)}..." challenge`);
      strategyPoints += 3; // Increased from 2 to 3
    }
  }

  if (member2.current_constraint && member1Assets.length > 0) {
    const constraint2Words = constraint2Lower.split(/\s+/);
    const assetMatches = member1Assets.filter(asset =>
      constraint2Words.some(word => word.length > 3 && asset.includes(word))
    );

    if (assetMatches.length > 0) {
      strategyInsights.push(`Value opportunity: Your ${assetMatches[0]} may address their "${member2.current_constraint.substring(0, 40)}..." challenge`);
      strategyPoints += 3; // Increased from 2 to 3
    }
  }

  const maxStrategyPoints = 10; // Increased from 5 to 10 - strategic fit matters MORE than geography
  strategyPoints = Math.min(strategyPoints, maxStrategyPoints);
  const strategyCategory = {
    factor: 'Strategic Growth Opportunities',
    points: strategyPoints,
    maxPoints: maxStrategyPoints,
    earned: strategyPoints,
    percentage: Math.round((strategyPoints / maxStrategyPoints) * 100),
    description: 'Specific long-term strategic value and growth potential based on industry synergies',
    status: strategyPoints >= 4 ? 'high-value' : strategyPoints >= 2 ? 'valuable' : 'exploratory',
    insights: strategyInsights.length > 0 ? strategyInsights : ['Explore potential for industry knowledge transfer and network expansion']
  };
  breakdown.push(strategyCategory);
  fullBreakdown.push(strategyCategory);
  totalScore += strategyPoints;

  // ============================================================================
  // FINAL SCORE CALCULATION
  // ============================================================================
  const maxPossiblePoints = 100;
  const normalizedScore = Math.min(totalScore, maxPossiblePoints);
  const overallPercentage = Math.round((normalizedScore / maxPossiblePoints) * 100);

  return {
    score: normalizedScore,
    breakdown, // Concise version
    fullBreakdown, // Complete transparency
    matches: matches.slice(0, 3), // Top specific asset/need matches
    summary: {
      earned: normalizedScore,
      possible: maxPossiblePoints,
      percentage: overallPercentage,
      grade: overallPercentage >= 85 ? 'A+' : overallPercentage >= 75 ? 'A' : overallPercentage >= 65 ? 'B+' : overallPercentage >= 55 ? 'B' : 'C+'
    }
  };
}

// API Routes

// Register new member
app.post('/api/register', async (req, res) => {
  try {
    const memberId = generateId('member');
    const { name, org, role, industry, city, rev_driver, current_constraint, assets, needs, fun_fact, email } = req.body;

    // Insert member
    await db.run(`
      INSERT INTO members (member_id, name, org, role, industry, city, rev_driver, current_constraint, assets, needs, fun_fact, email)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [memberId, name, org, role, industry, city, rev_driver, current_constraint, assets, needs, fun_fact, email]);

    // Generate embedding asynchronously
    generateEmbedding(memberId);

    res.json({ success: true, memberId });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ENHANCEMENT: Communication Style Analysis
function analyzeCommunicationStyle(memberText) {
  const text = (memberText || '').toLowerCase();

  // Analyze writing style indicators
  const indicators = {
    analytical: /data|metric|roi|analyz|measur|kpi|benchmark|statistic/gi,
    creative: /innovat|creativ|imagin|vision|disrupt|pioneer|unique|transform/gi,
    direct: /straightforward|efficient|practical|simple|clear|direct|result/gi,
    collaborative: /partner|together|collaborate|team|community|network|share|mutual/gi,
    formal: /professional|corporate|enterprise|strategic|executive|official/gi,
    casual: /love|passion|excited|awesome|cool|great|fun|enjoy/gi
  };

  const scores = {};
  for (const [style, pattern] of Object.entries(indicators)) {
    const matches = text.match(pattern) || [];
    scores[style] = matches.length;
  }

  // Determine primary style
  const primary = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const totalMatches = Object.values(scores).reduce((sum, val) => sum + val, 0);

  return {
    primary_style: totalMatches > 0 ? primary : 'balanced',
    style_scores: scores,
    formality_index: scores.formal / Math.max(scores.casual, 1),
    collaboration_orientation: scores.collaborative + scores.creative
  };
}

// Generate embedding for a member
async function generateEmbedding(memberId) {
  try {
    const member = await db.get('SELECT * FROM members WHERE member_id = $1', [memberId]);

    // ENHANCEMENT: Analyze communication style
    const fullText = `${member.rev_driver} ${member.current_constraint} ${member.assets} ${member.needs} ${member.fun_fact}`;
    const commStyle = analyzeCommunicationStyle(fullText);

    // Build RICH profile string for embedding - include everything for better semantic matching
    const profile = `
      ${member.name} | ${member.role} at ${member.org}
      Industry: ${member.industry || ''} | Location: ${member.city || ''}
      Revenue Model: ${member.rev_driver || ''}
      Current Challenge: ${member.current_constraint || ''}
      What I Bring: ${member.assets || ''}
      What I Need: ${member.needs || ''}
      About Me: ${member.fun_fact || ''}
      Communication Style: ${commStyle.primary_style}
    `.trim();

    // Generate embedding using OpenAI
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small', // Using smaller model for cost efficiency
      input: profile
    });

    const embedding = response.data[0].embedding;

    // Store embedding with communication style metadata (PostgreSQL ON CONFLICT syntax)
    await db.run(`
      INSERT INTO vectors (member_id, embedding_ops)
      VALUES ($1, $2)
      ON CONFLICT (member_id) DO UPDATE SET embedding_ops = $2
    `, [memberId, JSON.stringify(embedding)]);

    // Store communication style in members table if column exists
    try {
      await db.run(`UPDATE members SET communication_style = $1 WHERE member_id = $2`,
        [JSON.stringify(commStyle), memberId]
      );
    } catch (e) {
      // Column might not exist yet, that's okay
    }

    console.log(`✅ Embedding generated for ${member.name} (${member.org}) - Style: ${commStyle.primary_style}`);
  } catch (error) {
    console.error('Embedding generation error:', error);
  }
}

// Get member dashboard
app.get('/api/member/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;

    const member = await db.get('SELECT * FROM members WHERE member_id = $1', [memberId]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Get matches
    const top3 = await db.all(`
      SELECT i.*, m.name, m.org, m.role, m.city
      FROM intros i
      JOIN members m ON i.to_member_id = m.member_id
      WHERE i.for_member_id = $1 AND i.tier = 'top3'
      ORDER BY i.score DESC
      LIMIT 3
    `, [memberId]);

    const brainstorm = await db.all(`
      SELECT i.*, m.name, m.org, m.role, m.city
      FROM intros i
      JOIN members m ON i.to_member_id = m.member_id
      WHERE i.for_member_id = $1 AND i.tier = 'brainstorm'
      ORDER BY i.score DESC
      LIMIT 30
    `, [memberId]);

    res.json({
      member,
      top3,
      brainstorm
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// Deep opportunity analysis - triggered from Layer 3 opportunity cards
app.post('/api/analyze-opportunity', async (req, res) => {
  try {
    const { memberId, matchMemberId, matchName, matchOrg, opportunityIndex, opportunityText } = req.body;
    console.log(`🔍 Deep opportunity analysis requested:`);
    console.log(`   Member: ${memberId} -> Match: ${matchName} (${matchOrg})`);
    console.log(`   Opportunity #${opportunityIndex + 1}: ${opportunityText.substring(0, 100)}...`);

    // Get both members' data for context
    const member = await db.get('SELECT * FROM members WHERE member_id = $1', [memberId]);
    const matchMember = await db.get('SELECT * FROM members WHERE member_id = $1', [matchMemberId]);

    if (!member) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    // Build rich context for the analysis
    const memberContext = member ? `
Your Name: ${member.name}
Your Organization: ${member.org}
Your Role: ${member.role}
Your Industry: ${member.industry || 'Not specified'}
Your Needs: ${member.needs || 'Not specified'}
Your Offers: ${member.offers || 'Not specified'}
` : '';

    const matchContext = matchMember ? `
Match Name: ${matchMember.name}
Match Organization: ${matchMember.org}
Match Role: ${matchMember.role}
Match Industry: ${matchMember.industry || 'Not specified'}
Match Needs: ${matchMember.needs || 'Not specified'}
Match Offers: ${matchMember.offers || 'Not specified'}
` : `Match: ${matchName} at ${matchOrg}`;

    const prompt = `You are an elite business strategist and networking advisor. A professional wants a DEEP, SPECIFIC analysis of a potential collaboration opportunity with another professional.

## YOUR MEMBER (the one requesting analysis):
${memberContext}

## POTENTIAL CONNECTION:
${matchContext}

## OPPORTUNITY TO ANALYZE:
"${opportunityText}"

## YOUR TASK:
Provide an INTENSIVE, SPECIFIC analysis of how to capitalize on this opportunity. Be CONCRETE and ACTIONABLE.

Structure your response as follows:

**🎯 OPPORTUNITY BREAKDOWN**
Explain exactly what makes this opportunity valuable and why it's strategically important for both parties.

**📋 IMMEDIATE ACTION STEPS (Next 7 Days)**
List 3-4 specific, concrete actions to take THIS WEEK to move forward:
- Who to contact and what to say
- What to prepare or research
- Specific meeting agenda items

**💰 VALUE CREATION PATHWAYS**
Identify 2-3 specific ways this collaboration could generate tangible value:
- Revenue opportunities with rough estimates if possible
- Cost savings or efficiency gains
- Market positioning advantages

**⚠️ POTENTIAL OBSTACLES & SOLUTIONS**
Flag 2-3 potential challenges and how to preemptively address them.

**🗓️ 90-DAY ROADMAP**
Outline a realistic timeline with milestones:
- Week 1-2: Initial steps
- Month 1: Key milestone
- Month 2-3: Expected outcomes

**💬 CONVERSATION SCRIPT**
Write 2-3 sentences of exactly what to say when reaching out to initiate this opportunity.

Be specific to these actual people and organizations. No generic advice.`;

    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000
    });

    const analysis = response.choices[0].message.content;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ Opportunity analysis complete in ${elapsed}s`);

    res.json({
      success: true,
      analysis: analysis,
      processingTime: elapsed
    });

  } catch (error) {
    console.error('Opportunity analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate top 3 matches
app.post('/api/generate-top3/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    console.log(`🎯 Generating top 3 matches for member: ${memberId}`);

    // Get member and their embedding
    const member = await db.get('SELECT * FROM members WHERE member_id = $1', [memberId]);
    if (!member) {
      console.error(`❌ Member not found: ${memberId}`);
      return res.status(404).json({ error: 'Member not found' });
    }

    let memberVector = await db.get('SELECT embedding_ops FROM vectors WHERE member_id = $1', [memberId]);

    // Auto-generate embedding if missing (for test data or new members)
    if (!memberVector || !memberVector.embedding_ops) {
      console.log(`⚡ No embedding found for ${member.name}, generating now...`);
      await generateEmbedding(memberId);
      memberVector = await db.get('SELECT embedding_ops FROM vectors WHERE member_id = $1', [memberId]);

      if (!memberVector || !memberVector.embedding_ops) {
        console.error(`❌ Failed to generate embedding for ${member.name}`);
        return res.status(500).json({ error: 'Failed to generate embedding. Please try again.' });
      }
      console.log(`✅ Embedding generated for ${member.name}`);
    }

    const memberEmbedding = JSON.parse(memberVector.embedding_ops);
    console.log(`📊 Processing ${member.name} against all candidates...`);

    // Get all other members with embeddings
    const candidates = await db.all(`
      SELECT m.*, v.embedding_ops
      FROM members m
      JOIN vectors v ON m.member_id = v.member_id
      WHERE m.member_id != $1 AND m.consent = true
    `, [memberId]);

    console.log(`📊 TOP3: Found ${candidates.length} candidates with embeddings (excluding self)`);

    // Calculate scores with error handling
    console.log(`⚙️  Calculating match scores for ${candidates.length} candidates...`);
    const scored = candidates.map((candidate, idx) => {
      try {
        const candidateEmbedding = JSON.parse(candidate.embedding_ops);
        const similarity = cosineSimilarity(memberEmbedding, candidateEmbedding);
        const scoreData = calculateMatchScore(member, candidate, similarity);

        return {
          ...candidate,
          score: scoreData.score,
          breakdown: scoreData.breakdown,
          fullBreakdown: scoreData.fullBreakdown,
          matches: scoreData.matches,
          summary: scoreData.summary,
          similarity
        };
      } catch (error) {
        console.error(`   ❌ Error scoring candidate ${idx + 1} (${candidate.name}):`, error.message);
        // Return a zero-score entry so we can continue
        return {
          ...candidate,
          score: 0,
          breakdown: [],
          fullBreakdown: [],
          matches: [],
          summary: { earned: 0, possible: 100, percentage: 0, grade: 'F' },
          similarity: 0,
          error: error.message
        };
      }
    });
    console.log(`✅ Scoring complete`);

    // Filter out self-matches and sort by initial scores
    // Only filter invalid scores (NaN/Infinity), keep ALL valid scores including 0
    const filtered = scored.filter(s => typeof s.score === 'number' && isFinite(s.score));
    filtered.sort((a, b) => b.score - a.score);

    console.log(`📊 Initial scoring: ${scored.length} candidates, ${filtered.length} valid matches`);

    // RESEARCH-BACKED SELECTION: Take top 10 candidates, research them, re-score, then pick final top 3
    const topCandidates = filtered.slice(0, Math.min(10, filtered.length));
    console.log(`🔬 Researching top ${topCandidates.length} candidates to determine final top 3...`);

    // Research each candidate and re-score with research
    const researchedCandidates = [];
    for (let i = 0; i < topCandidates.length; i++) {
      const candidate = topCandidates[i];
      console.log(`   [${i + 1}/${topCandidates.length}] Researching ${candidate.name}...`);

      try {
        // STAGE 0: Deep complementary value & creative collaboration research
        const complementaryValueResearch = await researchComplementaryValue(member, candidate);
        console.log(`   ✅ Research complete for ${candidate.name}: ${complementaryValueResearch.creative_collaboration_ideas?.length || 0} creative ideas found`);

        // RE-SCORE with research included
        const similarity = candidate.similarity;
        const researchedScore = calculateMatchScore(member, candidate, similarity, complementaryValueResearch);

        researchedCandidates.push({
          ...candidate,
          score: researchedScore.score, // Updated score with research
          breakdown: researchedScore.breakdown,
          fullBreakdown: researchedScore.fullBreakdown,
          matches: researchedScore.matches,
          summary: researchedScore.summary,
          complementaryValueResearch // Store for later use
        });

        console.log(`   📊 ${candidate.name}: ${candidate.score} → ${researchedScore.score} (${researchedScore.score > candidate.score ? '+' : ''}${researchedScore.score - candidate.score} after research)`);
      } catch (error) {
        console.error(`   ❌ Research failed for ${candidate.name}:`, error.message);
        // Keep original score if research fails
        researchedCandidates.push(candidate);
      }
    }

    // Sort by RESEARCH-BACKED scores and select final top 3
    researchedCandidates.sort((a, b) => b.score - a.score);
    const top3 = researchedCandidates.slice(0, 3);

    console.log(`✅ Final top 3 selected after research-backed re-scoring:`);
    top3.forEach((s, i) => {
      const change = researchedCandidates.findIndex(c => c.member_id === s.member_id);
      console.log(`   ${i + 1}. ${s.name} (${s.org}): ${s.score}/100 (${s.summary?.grade || '?'}) - ${s.complementaryValueResearch?.creative_collaboration_ideas?.length || 0} creative ideas`);
    });

    // Generate NEXUS Production matches for each top 3 (using V3.5+ engine with V2 output)
    console.log(`🚀 Generating NEXUS Production matches for ${top3.length} top 3...`);
    for (let i = 0; i < top3.length; i++) {
      const match = top3[i];
      console.log(`   [${i + 1}/${top3.length}] NEXUS Production: ${member.name} ↔ ${match.name}...`);

      try {
        // ====================================================================
        // USE NEXUS PRODUCTION ENGINE (V3.5+ Speed + V2 Rich Output)
        // ====================================================================
        const nexusResult = await nexusProduction.generateProductionMatch(member, match);

        const introId = generateId('intro');

        // Create intro_basis from synthesis narrative
        const introBasisString = nexusResult.synthesis?.strategic_narrative ||
                                 nexusResult.synthesis?.confidence_weighted_recommendation ||
                                 'High-value strategic connection identified';

        // Store COMPLETE NEXUS V2 analysis (direct passthrough)
        const scoreData = {
          // Core V2 structure
          score: nexusResult.score,
          grade: nexusResult.grade,
          processing_time: nexusResult.processing_time,

          // V2 Output Fields
          intelligence: nexusResult.intelligence,
          agent_outputs: nexusResult.agent_outputs,
          synthesis: nexusResult.synthesis,
          quality_control: nexusResult.quality_control,
          scoring: nexusResult.scoring,

          // Metadata
          pipeline_version: nexusResult.pipeline_version,
          semantic_cache_hit: nexusResult.semantic_cache_hit,
          generated_at: nexusResult.generated_at
        };

        // Create simple text summaries for legacy fields
        const creativeAngle = nexusResult.synthesis?.strategic_narrative ||
                             nexusResult.synthesis?.top_5_opportunities?.[0] ||
                             'Strategic collaboration opportunity';

        const rationaleOps = nexusResult.synthesis?.strategic_narrative ||
                            (nexusResult.synthesis?.consensus_points || []).join('. ') ||
                            'Strategic match identified by NEXUS Production';

        await db.run(`
          INSERT INTO intros (intro_id, for_member_id, to_member_id, tier, score, score_breakdown, rationale_ops, creative_angle, intro_basis)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (for_member_id, to_member_id, tier)
          DO UPDATE SET score = $5, score_breakdown = $6, rationale_ops = $7, creative_angle = $8, intro_basis = $9
        `, [introId, memberId, match.member_id, 'top3', nexusResult.score, JSON.stringify(scoreData), rationaleOps, creativeAngle, introBasisString]);

        console.log(`   ✅ NEXUS Production complete: ${match.name} (${nexusResult.score}/100, ${nexusResult.grade}) [${nexusResult.processing_time}s]`);
      } catch (error) {
        console.error(`   ❌ NEXUS Production failed for ${match.name}:`, error.message);
        // Continue with other matches even if one fails
      }
    }

    console.log(`✅ Successfully generated ${top3.length} top 3 matches for ${member.name}`);
    res.json({ success: true, count: top3.length });
  } catch (error) {
    console.error('Generate top3 error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to generate matches',
      message: error.message,
      details: error.stack
    });
  }
});

// Generate brainstorm matches
app.post('/api/generate-brainstorm/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    console.log(`🌟 Generating brainstorm matches for member: ${memberId}`);

    // Get member and their embedding
    const member = await db.get('SELECT * FROM members WHERE member_id = $1', [memberId]);
    if (!member) {
      console.error(`❌ Member not found: ${memberId}`);
      return res.status(404).json({ error: 'Member not found' });
    }

    let memberVector = await db.get('SELECT embedding_ops FROM vectors WHERE member_id = $1', [memberId]);

    // Auto-generate embedding if missing (for test data or new members)
    if (!memberVector || !memberVector.embedding_ops) {
      console.log(`⚡ No embedding found for ${member.name}, generating now...`);
      await generateEmbedding(memberId);
      memberVector = await db.get('SELECT embedding_ops FROM vectors WHERE member_id = $1', [memberId]);

      if (!memberVector || !memberVector.embedding_ops) {
        console.error(`❌ Failed to generate embedding for ${member.name}`);
        return res.status(500).json({ error: 'Failed to generate embedding. Please try again.' });
      }
      console.log(`✅ Embedding generated for ${member.name}`);
    }

    const memberEmbedding = JSON.parse(memberVector.embedding_ops);
    console.log(`📊 Processing ${member.name} against all candidates for brainstorm...`);

    // Get all other members with embeddings
    const candidates = await db.all(`
      SELECT m.*, v.embedding_ops
      FROM members m
      JOIN vectors v ON m.member_id = v.member_id
      WHERE m.member_id != $1 AND m.consent = true
    `, [memberId]);

    console.log(`📊 BRAINSTORM: Found ${candidates.length} candidates with embeddings (excluding self)`);

    // Calculate scores with error handling
    console.log(`⚙️  Calculating match scores for ${candidates.length} candidates...`);
    const scored = candidates.map((candidate, idx) => {
      try {
        const candidateEmbedding = JSON.parse(candidate.embedding_ops);
        const similarity = cosineSimilarity(memberEmbedding, candidateEmbedding);
        const scoreData = calculateMatchScore(member, candidate, similarity);

        return {
          ...candidate,
          score: scoreData.score,
          breakdown: scoreData.breakdown,
          fullBreakdown: scoreData.fullBreakdown,
          matches: scoreData.matches,
          summary: scoreData.summary,
          similarity
        };
      } catch (error) {
        console.error(`   ❌ Error scoring candidate ${idx + 1} (${candidate.name}):`, error.message);
        return {
          ...candidate,
          score: 0,
          breakdown: [],
          fullBreakdown: [],
          matches: [],
          summary: { earned: 0, possible: 100, percentage: 0, grade: 'F' },
          similarity: 0,
          error: error.message
        };
      }
    });
    console.log(`✅ Scoring complete`);

    // Filter only to exclude self-matches (score = 0), then sort by score
    // NO THRESHOLD - every business professional has networking potential
    // Only filter invalid scores (NaN/Infinity), keep ALL valid scores including 0
    const filtered = scored.filter(c => typeof c.score === 'number' && isFinite(c.score));
    filtered.sort((a, b) => b.score - a.score);

    // EXCLUDE TOP 3 from brainstorm - they're already shown separately
    // Get existing top 3 member IDs to avoid duplicates
    const existingTop3 = await db.all(`
      SELECT to_member_id FROM intros
      WHERE for_member_id = $1 AND tier = 'top3'
    `, [memberId]);
    const top3MemberIds = new Set(existingTop3.map(i => i.to_member_id));

    // Brainstorm = everyone except top 3
    const brainstorm = filtered.filter(m => !top3MemberIds.has(m.member_id));

    // Log score distribution to understand quality range
    const scoreRanges = {
      excellent: scored.filter(s => s.score >= 75).length,
      strong: scored.filter(s => s.score >= 60 && s.score < 75).length,
      good: scored.filter(s => s.score >= 50 && s.score < 60).length,
      moderate: scored.filter(s => s.score >= 40 && s.score < 50).length,
      baseline: scored.filter(s => s.score >= 30 && s.score < 40).length,
      low: scored.filter(s => s.score > 0 && s.score < 30).length,
      zero: scored.filter(s => s.score === 0).length
    };
    console.log(`📊 Score Distribution: 75+:${scoreRanges.excellent}, 60-74:${scoreRanges.strong}, 50-59:${scoreRanges.good}, 40-49:${scoreRanges.moderate}, 30-39:${scoreRanges.baseline}, 1-29:${scoreRanges.low}, 0:${scoreRanges.zero}`);
    console.log(`📊 Brainstorm: ${scored.length} total candidates, ${filtered.length} valid matches (all included - no filtering)`);

    // Generate NEXUS Production matches for all brainstorm (using V3.5+ engine with V2 output)
    console.log(`🚀 Generating NEXUS Production for ${brainstorm.length} brainstorm matches (fast with caching!)...`);
    for (let i = 0; i < brainstorm.length; i++) {
      const match = brainstorm[i];
      console.log(`   [${i + 1}/${brainstorm.length}] NEXUS Production: ${member.name} ↔ ${match.name}...`);

      try {
        // ====================================================================
        // USE NEXUS PRODUCTION ENGINE (V3.5+ Speed + V2 Rich Output)
        // ====================================================================
        const nexusResult = await nexusProduction.generateProductionMatch(member, match);

        const introId = generateId('intro');

        // Create intro_basis from synthesis narrative
        const introBasisString = nexusResult.synthesis?.strategic_narrative ||
                                 nexusResult.synthesis?.confidence_weighted_recommendation ||
                                 'High-value strategic connection identified';

        // Store COMPLETE NEXUS V2 analysis (direct passthrough)
        const scoreData = {
          // Core V2 structure
          score: nexusResult.score,
          grade: nexusResult.grade,
          processing_time: nexusResult.processing_time,

          // V2 Output Fields
          intelligence: nexusResult.intelligence,
          agent_outputs: nexusResult.agent_outputs,
          synthesis: nexusResult.synthesis,
          quality_control: nexusResult.quality_control,
          scoring: nexusResult.scoring,

          // Metadata
          pipeline_version: nexusResult.pipeline_version,
          semantic_cache_hit: nexusResult.semantic_cache_hit,
          generated_at: nexusResult.generated_at
        };

        // Create simple text summaries for legacy fields
        const creativeAngle = nexusResult.synthesis?.strategic_narrative ||
                             nexusResult.synthesis?.top_5_opportunities?.[0] ||
                             'Strategic collaboration opportunity';

        const rationaleOps = nexusResult.synthesis?.strategic_narrative ||
                            (nexusResult.synthesis?.consensus_points || []).join('. ') ||
                            'Strategic match identified by NEXUS Production';

        await db.run(`
          INSERT INTO intros (intro_id, for_member_id, to_member_id, tier, score, score_breakdown, rationale_ops, creative_angle, intro_basis)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (for_member_id, to_member_id, tier)
          DO UPDATE SET score = $5, score_breakdown = $6, rationale_ops = $7, creative_angle = $8, intro_basis = $9
        `, [introId, memberId, match.member_id, 'brainstorm', nexusResult.score, JSON.stringify(scoreData), rationaleOps, creativeAngle, introBasisString]);

        console.log(`   ✅ NEXUS Production complete: ${match.name} (${nexusResult.score}/100) [${nexusResult.processing_time}s, cache: ${nexusResult.semantic_cache_hit ? 'HIT' : 'MISS'}]`);
      } catch (error) {
        console.error(`   ❌ NEXUS Production failed for ${match.name}:`, error.message);
        // Continue with other matches even if one fails
      }
    }

    console.log(`✅ Successfully generated ${brainstorm.length} brainstorm matches for ${member.name}`);
    res.json({ success: true, count: brainstorm.length });
  } catch (error) {
    console.error('Generate brainstorm error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to generate brainstorm matches',
      message: error.message,
      details: error.stack
    });
  }
});

// STAGE 1: Industry & Market Research

// Acknowledge intro
app.post('/api/acknowledge-intro/:introId', async (req, res) => {
  try {
    await db.run(`
      UPDATE intros SET status = 'acknowledged' WHERE intro_id = $1
    `, [req.params.introId]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to acknowledge intro' });
  }
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Admin login attempt:', email);

    const admin = await db.get('SELECT * FROM admin_users WHERE email = $1', [email]);
    if (!admin) {
      console.log('Admin not found:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      console.log('Invalid password for admin:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.adminId = admin.admin_id;
    console.log('Admin login successful:', email, 'Session ID:', req.sessionID);
    res.json({ success: true, message: 'Logged in successfully' });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Admin dashboard
app.get('/api/admin/members', async (req, res) => {
  console.log('Admin members request - Session ID:', req.sessionID, 'Admin ID:', req.session.adminId);

  if (!req.session.adminId) {
    console.log('Admin not authenticated - no session');
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const members = await db.all(`
      SELECT
        m.*,
        (SELECT COUNT(*)::int FROM intros WHERE for_member_id = m.member_id AND tier = 'top3') as top3_count,
        (SELECT COUNT(*)::int FROM intros WHERE for_member_id = m.member_id AND tier = 'brainstorm') as brainstorm_count,
        (SELECT COUNT(*)::int FROM intros WHERE for_member_id = m.member_id AND status = 'acknowledged') as acknowledged_count
      FROM members m
      ORDER BY m.created_at DESC
    `);

    console.log(`Admin members loaded: ${members.length} members found`);
    res.json(members);
  } catch (error) {
    console.error('Admin members error:', error);
    res.status(500).json({ error: 'Failed to load members', details: error.message });
  }
});

// Delete a single member (admin only)
app.delete('/api/admin/member/:memberId', async (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { memberId } = req.params;

  try {
    // Delete all intros for this member (both as creator and recipient)
    await db.run('DELETE FROM intros WHERE for_member_id = $1 OR to_member_id = $1', [memberId]);

    // Delete vectors
    await db.run('DELETE FROM vectors WHERE member_id = $1', [memberId]);

    // Delete member
    await db.run('DELETE FROM members WHERE member_id = $1', [memberId]);

    res.json({ success: true, message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

// Delete all members (admin only)
app.delete('/api/admin/members/all', async (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Delete all data
    await db.run('DELETE FROM intros');
    await db.run('DELETE FROM vectors');
    await db.run('DELETE FROM members');

    res.json({ success: true, message: 'All members deleted successfully' });
  } catch (error) {
    console.error('Delete all members error:', error);
    res.status(500).json({ error: 'Failed to delete all members' });
  }
});

// Dashboard stats for live display
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const stats = await db.get(`
      SELECT
        (SELECT COUNT(*)::int FROM members) as total_members,
        (SELECT COUNT(*)::int FROM intros WHERE tier = 'top3') as total_top3,
        (SELECT COUNT(*)::int FROM intros WHERE tier = 'brainstorm') as total_brainstorm,
        (SELECT COUNT(*)::int FROM intros WHERE status = 'acknowledged') as total_acknowledged
    `);

    const recentActivity = await db.all(`
      SELECT * FROM (
        SELECT m.name, m.org, 'registered' as action, m.created_at as timestamp
        FROM members m
        UNION ALL
        SELECT m.name, m.org, 'acknowledged intro' as action, i.created_at as timestamp
        FROM intros i
        JOIN members m ON i.for_member_id = m.member_id
        WHERE i.status = 'acknowledged'
      ) activities
      ORDER BY timestamp DESC
      LIMIT 10
    `);

    res.json({ stats, recentActivity });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// Diagnostic: Check embedding status
app.get('/api/admin/embedding-status', async (req, res) => {
  try {
    const totalMembers = await db.get('SELECT COUNT(*)::int as count FROM members');
    const membersWithEmbeddings = await db.get('SELECT COUNT(*)::int as count FROM vectors');
    const totalIntros = await db.get('SELECT COUNT(*)::int as count FROM intros');
    const membersWithoutEmbeddings = await db.all(`
      SELECT m.member_id, m.name, m.org
      FROM members m
      LEFT JOIN vectors v ON m.member_id = v.member_id
      WHERE v.member_id IS NULL
    `);

    res.json({
      totalMembers: totalMembers.count,
      withEmbeddings: membersWithEmbeddings.count,
      withoutEmbeddings: membersWithoutEmbeddings.length,
      totalIntros: totalIntros.count,
      missingList: membersWithoutEmbeddings.map(m => ({ name: m.name, org: m.org, id: m.member_id }))
    });
  } catch (error) {
    console.error('Embedding status check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Reset all matches and clear caches
app.post('/api/admin/reset-matches', async (req, res) => {
  // Check authentication
  if (!req.session.adminId) {
    console.log('Reset matches request denied - not authenticated');
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    console.log('🔧 ADMIN: Resetting all matches and clearing caches...');

    // Delete all intros
    await db.run('DELETE FROM intros');

    const totalMembers = await db.get('SELECT COUNT(*)::int as count FROM members');
    const totalEmbeddings = await db.get('SELECT COUNT(*)::int as count FROM vectors');

    console.log(`✅ All matches reset. ${totalMembers.count} members remain with ${totalEmbeddings.count} embeddings`);

    res.json({
      success: true,
      message: 'All matches and caches cleared',
      membersRetained: totalMembers.count,
      embeddingsRetained: totalEmbeddings.count
    });

  } catch (error) {
    console.error('❌ Reset matches error:', error);
    res.status(500).json({ error: 'Failed to reset matches', details: error.message });
  }
});

// Admin: Generate embeddings for all members who don't have them
app.post('/api/admin/generate-all-embeddings', async (req, res) => {
  // Check authentication
  if (!req.session.adminId) {
    console.log('Generate embeddings request denied - not authenticated');
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    console.log('🔧 ADMIN: Generating embeddings for all members without embeddings...');

    // Find all members who don't have embeddings
    const membersWithoutEmbeddings = await db.all(`
      SELECT m.member_id, m.name, m.org
      FROM members m
      LEFT JOIN vectors v ON m.member_id = v.member_id
      WHERE v.member_id IS NULL
    `);

    console.log(`📊 Found ${membersWithoutEmbeddings.length} members without embeddings`);

    if (membersWithoutEmbeddings.length === 0) {
      return res.json({
        success: true,
        message: 'All members already have embeddings',
        generated: 0,
        total: 0
      });
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;

    // Generate embeddings for each member
    for (let i = 0; i < membersWithoutEmbeddings.length; i++) {
      const member = membersWithoutEmbeddings[i];
      console.log(`   [${i + 1}/${membersWithoutEmbeddings.length}] Generating embedding for ${member.name} (${member.org})...`);

      try {
        await generateEmbedding(member.member_id);
        successCount++;
        results.push({
          member_id: member.member_id,
          name: member.name,
          status: 'success'
        });
        console.log(`      ✅ Success`);
      } catch (error) {
        failCount++;
        results.push({
          member_id: member.member_id,
          name: member.name,
          status: 'failed',
          error: error.message
        });
        console.error(`      ❌ Failed: ${error.message}`);
      }
    }

    console.log(`\n✅ Embedding generation complete: ${successCount} succeeded, ${failCount} failed`);

    res.json({
      success: true,
      message: `Generated ${successCount} embeddings (${failCount} failed)`,
      generated: successCount,
      failed: failCount,
      total: membersWithoutEmbeddings.length,
      results
    });

  } catch (error) {
    console.error('❌ Generate all embeddings error:', error);
    res.status(500).json({ error: 'Failed to generate embeddings', details: error.message });
  }
});

// ============================================================================
// NEXUS V2 API ENDPOINTS
// ============================================================================

// Get all members for NEXUS V2 selector
app.get('/api/v2/members', async (req, res) => {
  try {
    const members = await db.all('SELECT member_id, name, org, role, industry, city FROM members ORDER BY name');
    res.json({ members });
  } catch (error) {
    console.error('Error fetching members for V2:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Generate NEXUS V2 match analysis
app.post('/api/v2/generate-match', async (req, res) => {
  try {
    const { member1_id, member2_id } = req.body;

    if (!member1_id || !member2_id) {
      return res.status(400).json({ error: 'Both member IDs required' });
    }

    console.log(`\n🚀 NEXUS V2 Request: ${member1_id} ↔ ${member2_id}`);

    // Fetch both members from database
    const member1 = await db.get('SELECT * FROM members WHERE member_id = $1', [member1_id]);
    const member2 = await db.get('SELECT * FROM members WHERE member_id = $1', [member2_id]);

    if (!member1 || !member2) {
      return res.status(404).json({ error: 'One or both members not found' });
    }

    // Run NEXUS V2 pipeline
    const result = await nexusV2.generateNexusV2Match(member1, member2);

    // Optionally save to database (new table: nexus_v2_matches)
    try {
      await db.run(`
        CREATE TABLE IF NOT EXISTS nexus_v2_matches (
          id SERIAL PRIMARY KEY,
          member1_id VARCHAR(255),
          member2_id VARCHAR(255),
          score INTEGER,
          grade VARCHAR(10),
          result JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(member1_id, member2_id)
        )
      `);

      await db.run(`
        INSERT INTO nexus_v2_matches (member1_id, member2_id, score, grade, result)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (member1_id, member2_id)
        DO UPDATE SET score = $3, grade = $4, result = $5, created_at = CURRENT_TIMESTAMP
      `, [member1_id, member2_id, result.score, result.grade, JSON.stringify(result)]);
    } catch (dbError) {
      console.warn('Failed to save V2 result to database:', dbError.message);
      // Non-blocking - continue even if DB save fails
    }

    res.json(result);
  } catch (error) {
    console.error('NEXUS V2 generation error:', error);
    res.status(500).json({
      error: 'Failed to generate NEXUS V2 match',
      details: error.message
    });
  }
});

// Get previous NEXUS V2 match result
app.get('/api/v2/match/:member1_id/:member2_id', async (req, res) => {
  try {
    const { member1_id, member2_id } = req.params;

    const result = await db.get(
      'SELECT * FROM nexus_v2_matches WHERE member1_id = $1 AND member2_id = $2 ORDER BY created_at DESC LIMIT 1',
      [member1_id, member2_id]
    );

    if (!result) {
      return res.status(404).json({ error: 'No NEXUS V2 match found for these members' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching V2 match:', error);
    res.status(500).json({ error: 'Failed to fetch match' });
  }
});

// ============================================================================
// NEXUS V3.5+ API ENDPOINTS
// ============================================================================

// Get all members for NEXUS V3.5+ selector
app.get('/api/v3.5/members', async (req, res) => {
  try {
    const members = await db.all('SELECT member_id, name, org, role, industry, city FROM members ORDER BY name');
    res.json({ members });
  } catch (error) {
    console.error('Error fetching members for V3.5+:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// SSE Streaming endpoint for NEXUS V3.5+
app.get('/api/v3.5/stream-match/:member1_id/:member2_id', async (req, res) => {
  try {
    const { member1_id, member2_id } = req.params;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    console.log(`\n🌊 NEXUS V3.5+ SSE Stream: ${member1_id} ↔ ${member2_id}`);

    // Fetch both members
    const member1 = await db.get('SELECT * FROM members WHERE member_id = $1', [member1_id]);
    const member2 = await db.get('SELECT * FROM members WHERE member_id = $1', [member2_id]);

    if (!member1 || !member2) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'One or both members not found' })}\n\n`);
      return res.end();
    }

    // SSE emit function
    const emit = (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Run NEXUS V3.5+ pipeline with streaming
    const result = await nexusV35.generateMatch(member1, member2, emit);

    // Save to database
    try {
      await db.run(`
        CREATE TABLE IF NOT EXISTS nexus_v35_matches (
          id SERIAL PRIMARY KEY,
          member1_id VARCHAR(255),
          member2_id VARCHAR(255),
          score INTEGER,
          grade VARCHAR(10),
          result JSONB,
          semantic_cache_hit BOOLEAN DEFAULT FALSE,
          processing_time NUMERIC,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(member1_id, member2_id)
        )
      `);

      await db.run(`
        INSERT INTO nexus_v35_matches (member1_id, member2_id, score, grade, result, semantic_cache_hit, processing_time)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (member1_id, member2_id)
        DO UPDATE SET score = $3, grade = $4, result = $5, semantic_cache_hit = $6, processing_time = $7, created_at = CURRENT_TIMESTAMP
      `, [member1_id, member2_id, result.score, result.grade, JSON.stringify(result), result.semantic_cache_hit, result.processing_time]);
    } catch (dbError) {
      console.warn('Failed to save V3.5+ result to database:', dbError.message);
    }

    res.end();
  } catch (error) {
    console.error('NEXUS V3.5+ streaming error:', error);
    try {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.end();
    } catch (e) {
      // Response already closed
    }
  }
});

// Regular (non-streaming) endpoint for NEXUS V3.5+
app.post('/api/v3.5/generate-match', async (req, res) => {
  try {
    const { member1_id, member2_id } = req.body;

    if (!member1_id || !member2_id) {
      return res.status(400).json({ error: 'Both member IDs required' });
    }

    console.log(`\n🚀 NEXUS V3.5+ Request: ${member1_id} ↔ ${member2_id}`);

    const member1 = await db.get('SELECT * FROM members WHERE member_id = $1', [member1_id]);
    const member2 = await db.get('SELECT * FROM members WHERE member_id = $1', [member2_id]);

    if (!member1 || !member2) {
      return res.status(404).json({ error: 'One or both members not found' });
    }

    // Run NEXUS V3.5+ pipeline without streaming
    const result = await nexusV35.generateMatch(member1, member2);

    // Save to database
    try {
      await db.run(`
        CREATE TABLE IF NOT EXISTS nexus_v35_matches (
          id SERIAL PRIMARY KEY,
          member1_id VARCHAR(255),
          member2_id VARCHAR(255),
          score INTEGER,
          grade VARCHAR(10),
          result JSONB,
          semantic_cache_hit BOOLEAN DEFAULT FALSE,
          processing_time NUMERIC,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(member1_id, member2_id)
        )
      `);

      await db.run(`
        INSERT INTO nexus_v35_matches (member1_id, member2_id, score, grade, result, semantic_cache_hit, processing_time)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (member1_id, member2_id)
        DO UPDATE SET score = $3, grade = $4, result = $5, semantic_cache_hit = $6, processing_time = $7, created_at = CURRENT_TIMESTAMP
      `, [member1_id, member2_id, result.score, result.grade, JSON.stringify(result), result.semantic_cache_hit, result.processing_time]);
    } catch (dbError) {
      console.warn('Failed to save V3.5+ result to database:', dbError.message);
    }

    res.json(result);
  } catch (error) {
    console.error('NEXUS V3.5+ generation error:', error);
    res.status(500).json({
      error: 'Failed to generate NEXUS V3.5+ match',
      details: error.message
    });
  }
});

// Get previous NEXUS V3.5+ match result
app.get('/api/v3.5/match/:member1_id/:member2_id', async (req, res) => {
  try {
    const { member1_id, member2_id } = req.params;

    const result = await db.get(
      'SELECT * FROM nexus_v35_matches WHERE member1_id = $1 AND member2_id = $2 ORDER BY created_at DESC LIMIT 1',
      [member1_id, member2_id]
    );

    if (!result) {
      return res.status(404).json({ error: 'No NEXUS V3.5+ match found for these members' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching V3.5+ match:', error);
    res.status(500).json({ error: 'Failed to fetch match' });
  }
});

// ============================================================================

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Make sure to run "npm run init-db" to initialize the database');
  console.log('Set OPENAI_API_KEY in .env file for AI features');
  console.log('🚀 NEXUS V2 API available at /api/v2/*');
  console.log('⚡ NEXUS V3.5+ API available at /api/v3.5/* (with SSE streaming)');

  // Initialize Thompson Sampling stats
  try {
    await nexusV35.initializeThompsonStats();
  } catch (err) {
    console.log('⚠️  Thompson stats initialization skipped (will initialize on first use)');
  }
});
