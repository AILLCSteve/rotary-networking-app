// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const OpenAI = require('openai');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use(express.json());
app.use(express.static('public'));
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
function calculateMatchScore(member1, member2, similarity) {
  const breakdown = [];
  let totalScore = 0;

  // Prevent self-matching
  if (member1.member_id === member2.member_id) {
    return { score: 0, breakdown: [{ factor: 'Self-match', points: 0, maxPoints: 0, earned: 0, description: 'Cannot match with yourself' }], fullBreakdown: [] };
  }

  // Track all scoring categories for full transparency
  const fullBreakdown = [];

  // 1. Semantic similarity (0-40 points) - ALWAYS show this
  const maxSemanticPoints = 40;
  const semanticPoints = Math.round(similarity * maxSemanticPoints);
  const semanticCategory = {
    factor: 'Semantic Similarity',
    points: semanticPoints,
    maxPoints: maxSemanticPoints,
    earned: semanticPoints,
    percentage: Math.round((semanticPoints / maxSemanticPoints) * 100),
    description: 'AI analysis of profile compatibility based on embeddings',
    status: semanticPoints > 25 ? 'strong' : semanticPoints > 15 ? 'moderate' : 'weak'
  };
  breakdown.push(semanticCategory);
  fullBreakdown.push(semanticCategory);
  totalScore += semanticPoints;

  // Parse needs and assets
  const member1Needs = member1.needs ? member1.needs.split(',').map(n => n.trim().toLowerCase()) : [];
  const member1Assets = member1.assets ? member1.assets.split(',').map(a => a.trim().toLowerCase()) : [];
  const member2Needs = member2.needs ? member2.needs.split(',').map(n => n.trim().toLowerCase()) : [];
  const member2Assets = member2.assets ? member2.assets.split(',').map(a => a.trim().toLowerCase()) : [];

  // 2. Complementary needs/assets (0-30 points)
  let complementaryMatches = 0;
  const matches = [];

  // Check if member1's assets match member2's needs
  for (const asset of member1Assets) {
    for (const need of member2Needs) {
      if (asset.includes(need) || need.includes(asset)) {
        complementaryMatches++;
        matches.push(`Your "${asset}" helps their need for "${need}"`);
      }
    }
  }

  // Check if member2's assets match member1's needs
  for (const asset of member2Assets) {
    for (const need of member1Needs) {
      if (asset.includes(need) || need.includes(asset)) {
        complementaryMatches++;
        matches.push(`Their "${asset}" helps your need for "${need}"`);
      }
    }
  }

  const maxComplementaryPoints = 30;
  const complementaryPoints = Math.min(complementaryMatches * 6, maxComplementaryPoints);
  const complementaryCategory = {
    factor: 'Complementary Assets/Needs',
    points: complementaryPoints,
    maxPoints: maxComplementaryPoints,
    earned: complementaryPoints,
    percentage: Math.round((complementaryPoints / maxComplementaryPoints) * 100),
    description: complementaryPoints > 0
      ? `${complementaryMatches} complementary need/asset pairs found`
      : 'No direct asset/need overlap identified',
    status: complementaryPoints > 18 ? 'strong' : complementaryPoints > 6 ? 'moderate' : 'none',
    details: matches.slice(0, 3)
  };
  breakdown.push(complementaryCategory);
  fullBreakdown.push(complementaryCategory);
  totalScore += complementaryPoints;

  // 3. Location match (0-15 points) - ALWAYS show this
  const maxLocationPoints = 15;
  const sameLocation = member1.city && member2.city && member1.city.toLowerCase() === member2.city.toLowerCase();
  const locationPoints = sameLocation ? maxLocationPoints : 0;
  const locationCategory = {
    factor: 'Geographic Proximity',
    points: locationPoints,
    maxPoints: maxLocationPoints,
    earned: locationPoints,
    percentage: Math.round((locationPoints / maxLocationPoints) * 100),
    description: sameLocation
      ? `Both in ${member1.city} - easier to meet in person`
      : `Different locations: ${member1.city || 'Unknown'} vs ${member2.city || 'Unknown'}`,
    status: locationPoints > 0 ? 'match' : 'different'
  };
  breakdown.push(locationCategory);
  fullBreakdown.push(locationCategory);
  totalScore += locationPoints;

  // 4. Industry synergy (0-10 points) - ALWAYS show this
  const maxIndustryPoints = 10;
  let industryPoints = 0;
  let industryDescription = '';
  let industryStatus = 'unknown';

  if (member1.industry && member2.industry) {
    const ind1 = member1.industry.toLowerCase();
    const ind2 = member2.industry.toLowerCase();
    if (ind1 !== ind2) {
      industryPoints = maxIndustryPoints;
      industryDescription = `${member1.industry} + ${member2.industry} = cross-industry insights`;
      industryStatus = 'cross-industry';
    } else {
      industryPoints = 3;
      industryDescription = `Both in ${member1.industry} - shared knowledge and contacts`;
      industryStatus = 'same-industry';
    }
  } else {
    industryDescription = 'Industry information missing for comparison';
    industryStatus = 'incomplete';
  }

  const industryCategory = {
    factor: 'Industry Alignment',
    points: industryPoints,
    maxPoints: maxIndustryPoints,
    earned: industryPoints,
    percentage: Math.round((industryPoints / maxIndustryPoints) * 100),
    description: industryDescription,
    status: industryStatus
  };
  breakdown.push(industryCategory);
  fullBreakdown.push(industryCategory);
  totalScore += industryPoints;

  // 5. Constraint alignment (0-5 points) - ALWAYS show this
  const maxConstraintPoints = 5;
  let constraintPoints = 0;
  let constraintDescription = '';
  let constraintStatus = 'none';

  if (member1.current_constraint && member2.assets) {
    const constraint1 = member1.current_constraint.toLowerCase();
    const hasAlignment = member2Assets.some(asset =>
      constraint1.includes(asset) || asset.includes(constraint1.split(' ')[0])
    );
    if (hasAlignment) {
      constraintPoints = maxConstraintPoints;
      constraintDescription = 'Their assets directly address your stated constraint';
      constraintStatus = 'aligned';
    } else {
      constraintDescription = 'No direct asset match for your constraint';
      constraintStatus = 'unmatched';
    }
  } else {
    constraintDescription = 'Constraint or asset information missing';
    constraintStatus = 'incomplete';
  }

  const constraintCategory = {
    factor: 'Constraint Solution',
    points: constraintPoints,
    maxPoints: maxConstraintPoints,
    earned: constraintPoints,
    percentage: Math.round((constraintPoints / maxConstraintPoints) * 100),
    description: constraintDescription,
    status: constraintStatus
  };
  breakdown.push(constraintCategory);
  fullBreakdown.push(constraintCategory);
  totalScore += constraintPoints;

  // Calculate summary statistics
  const maxPossiblePoints = 100;
  const normalizedScore = Math.min(totalScore, maxPossiblePoints);
  const overallPercentage = Math.round((normalizedScore / maxPossiblePoints) * 100);

  return {
    score: normalizedScore,
    breakdown, // Concise version for quick display
    fullBreakdown, // Complete transparency showing all categories
    matches: matches.slice(0, 3), // Top 3 specific asset/need matches
    summary: {
      earned: normalizedScore,
      possible: maxPossiblePoints,
      percentage: overallPercentage,
      grade: overallPercentage >= 70 ? 'A' : overallPercentage >= 50 ? 'B' : overallPercentage >= 30 ? 'C' : 'D'
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

// Generate embedding for a member
async function generateEmbedding(memberId) {
  try {
    const member = await db.get('SELECT * FROM members WHERE member_id = $1', [memberId]);

    // Build RICH profile string for embedding - include everything for better semantic matching
    const profile = `
      ${member.name} | ${member.role} at ${member.org}
      Industry: ${member.industry || ''} | Location: ${member.city || ''}
      Revenue Model: ${member.rev_driver || ''}
      Current Challenge: ${member.current_constraint || ''}
      What I Bring: ${member.assets || ''}
      What I Need: ${member.needs || ''}
      About Me: ${member.fun_fact || ''}
    `.trim();

    // Generate embedding using OpenAI
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small', // Using smaller model for cost efficiency
      input: profile
    });

    const embedding = response.data[0].embedding;

    // Store embedding (PostgreSQL ON CONFLICT syntax)
    await db.run(`
      INSERT INTO vectors (member_id, embedding_ops)
      VALUES ($1, $2)
      ON CONFLICT (member_id) DO UPDATE SET embedding_ops = $2
    `, [memberId, JSON.stringify(embedding)]);

    console.log(`✅ Embedding generated for ${member.name} (${member.org})`);
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

    // Calculate scores
    const scored = candidates.map(candidate => {
      const candidateEmbedding = JSON.parse(candidate.embedding_ops);
      const similarity = cosineSimilarity(memberEmbedding, candidateEmbedding);
      const scoreData = calculateMatchScore(member, candidate, similarity);

      return {
        ...candidate,
        score: scoreData.score,
        breakdown: scoreData.breakdown,
        matches: scoreData.matches,
        similarity
      };
    });

    // Log all scores for debugging
    console.log(`📊 Calculated ${scored.length} match scores:`);
    scored.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.name} (${s.org}): ${s.score}/100 points (${s.summary.grade} grade)`);
      console.log(`      Breakdown: Semantic=${s.breakdown[0].points}/40, Complementary=${s.breakdown[1].points}/30, Location=${s.breakdown[2].points}/15, Industry=${s.breakdown[3].points}/10, Constraint=${s.breakdown[4].points}/5`);
    });

    // Filter out self-matches and sort
    const filtered = scored.filter(s => s.score > 0);
    filtered.sort((a, b) => b.score - a.score);
    const top3 = filtered.slice(0, 3);

    console.log(`✅ Selected top ${top3.length} matches (from ${filtered.length} candidates with score > 0)`);

    // Generate rationales for each match (with progress logging)
    console.log(`🤖 Generating AI intros for ${top3.length} matches...`);
    for (let i = 0; i < top3.length; i++) {
      const match = top3[i];
      console.log(`   [${i + 1}/${top3.length}] Generating intro for ${member.name} → ${match.name}...`);

      try {
        const rationale = await generateMatchRationale(member, match, true); // true = use GPT-4

        // Ensure intro_basis is a string (handle if AI returns object)
        let introBasisString = rationale.intro_basis;
        if (typeof introBasisString === 'object') {
          console.log('   ⚠️  intro_basis is an object, converting to string');
          introBasisString = JSON.stringify(introBasisString);
        }

        const introId = generateId('intro');

        // Store both concise breakdown and full breakdown for complete transparency
        const scoreData = {
          score: match.score,
          breakdown: match.breakdown, // Concise for display
          fullBreakdown: match.fullBreakdown, // Complete objective matrix
          summary: match.summary // Grade and percentage
        };

        await db.run(`
          INSERT INTO intros (intro_id, for_member_id, to_member_id, tier, score, score_breakdown, rationale_ops, creative_angle, intro_basis)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (for_member_id, to_member_id, tier)
          DO UPDATE SET score = $5, score_breakdown = $6, rationale_ops = $7, creative_angle = $8, intro_basis = $9
        `, [introId, memberId, match.member_id, 'top3', match.score, JSON.stringify(scoreData), rationale.rationale_ops, rationale.creative_angle, introBasisString]);

        console.log(`   ✅ Generated intro for ${match.name}`);
      } catch (error) {
        console.error(`   ❌ Failed to generate intro for ${match.name}:`, error.message);
        // Continue with other matches even if one fails
      }
    }

    console.log(`✅ Successfully generated ${top3.length} top 3 matches for ${member.name}`);
    res.json({ success: true, count: top3.length });
  } catch (error) {
    console.error('Generate top3 error:', error);
    res.status(500).json({ error: 'Failed to generate matches' });
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

    // Calculate scores
    const scored = candidates.map(candidate => {
      const candidateEmbedding = JSON.parse(candidate.embedding_ops);
      const similarity = cosineSimilarity(memberEmbedding, candidateEmbedding);
      const scoreData = calculateMatchScore(member, candidate, similarity);

      return {
        ...candidate,
        score: scoreData.score,
        breakdown: scoreData.breakdown,
        matches: scoreData.matches,
        similarity
      };
    });

    // Filter by threshold and sort (exclude self-matches)
    const threshold = 40; // Minimum score threshold
    const filtered = scored.filter(c => c.score >= threshold);
    filtered.sort((a, b) => b.score - a.score);
    const brainstorm = filtered.slice(0, 20); // Limit to 20 for quality AI generation

    // Generate AI rationales for brainstorm matches (using GPT-3.5 for speed/cost balance)
    console.log(`🤖 Generating AI intros for ${brainstorm.length} brainstorm matches (this may take a minute)...`);
    for (let i = 0; i < brainstorm.length; i++) {
      const match = brainstorm[i];
      console.log(`   [${i + 1}/${brainstorm.length}] Generating intro for ${member.name} → ${match.name}...`);

      try {
        const rationale = await generateMatchRationale(member, match, false); // false = use GPT-3.5

        // Ensure intro_basis is a string (handle if AI returns object)
        let introBasisString = rationale.intro_basis;
        if (typeof introBasisString === 'object') {
          console.log('   ⚠️  intro_basis is an object, converting to string');
          introBasisString = JSON.stringify(introBasisString);
        }

        const introId = generateId('intro');

        // Store both concise breakdown and full breakdown for complete transparency
        const scoreData = {
          score: match.score,
          breakdown: match.breakdown, // Concise for display
          fullBreakdown: match.fullBreakdown, // Complete objective matrix
          summary: match.summary // Grade and percentage
        };

        await db.run(`
          INSERT INTO intros (intro_id, for_member_id, to_member_id, tier, score, score_breakdown, rationale_ops, creative_angle, intro_basis)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (for_member_id, to_member_id, tier)
          DO UPDATE SET score = $5, score_breakdown = $6, rationale_ops = $7, creative_angle = $8, intro_basis = $9
        `, [introId, memberId, match.member_id, 'brainstorm', match.score, JSON.stringify(scoreData), rationale.rationale_ops, rationale.creative_angle, introBasisString]);

        console.log(`   ✅ Generated intro for ${match.name}`);
      } catch (error) {
        console.error(`   ❌ Failed to generate intro for ${match.name}:`, error.message);
        // Continue with other matches even if one fails
      }
    }

    console.log(`✅ Successfully generated ${brainstorm.length} brainstorm matches for ${member.name}`);
    res.json({ success: true, count: brainstorm.length });
  } catch (error) {
    console.error('Generate brainstorm error:', error);
    res.status(500).json({ error: 'Failed to generate brainstorm matches' });
  }
});

// Generate match rationale using OpenAI with advanced prompt engineering and web research
async function generateMatchRationale(member1, member2, useGPT4 = false) {
  try {
    // Build RICH industry-specific expert persona with strategic context
    const industries = [member1.industry, member2.industry].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i); // unique

    // Industry-specific language patterns and success metrics
    const getIndustryContext = (industry) => {
      const contexts = {
        'Technology': 'You understand CAC, LTV, ARR, churn metrics, product-market fit, and tech stack decisions.',
        'Digital Marketing': 'You speak fluently about CTR, ROAS, conversion funnels, attribution models, and content strategy.',
        'Real Estate': 'You know cap rates, NOI, market cycles, zoning, and the importance of location-based networks.',
        'Finance': 'You understand deal structuring, due diligence, portfolio diversification, and risk mitigation.',
        'E-commerce': 'You know inventory turnover, AOV, conversion optimization, logistics, and marketplace dynamics.',
        'Legal Services': 'You understand billable hours, retainer models, case law, regulatory compliance, and client acquisition.',
        'Food & Hospitality': 'You know food cost percentages, table turns, labor management, and the power of local reputation.',
        'Beauty': 'You understand customer retention, service-based revenue, product lines, and franchise economics.',
        'Online Education': 'You know course completion rates, student lifetime value, community engagement, and scalable learning platforms.',
        'Consulting': 'You understand value-based pricing, thought leadership, referral networks, and outcome-driven engagements.',
        'Media': 'You know audience metrics, content distribution, monetization models, and platform algorithms.'
      };
      return contexts[industry] || `You understand ${industry} business models, key metrics, and growth drivers.`;
    };

    const industryContexts = industries.map(ind => getIndustryContext(ind)).join(' ');
    const crossIndustryNote = industries.length > 1
      ? `\n\n🔥 CROSS-INDUSTRY ADVANTAGE: You recognize that ${member1.industry}-to-${member2.industry} connections often create breakthrough opportunities because each brings blind spots the other can illuminate.`
      : '';

    // Role/seniority awareness for appropriate tone
    const roleContext = (member1.role && member2.role)
      ? `\nCONTEXT: ${member1.role} meeting ${member2.role} - calibrate your tone to match peer, mentor, or partnership dynamics appropriately.`
      : '';

    const systemPrompt = `You are a composite expert persona combining:
1. **Master Business Networking Strategist** - 20+ years connecting executives and entrepreneurs at Rotary, YPO, and Vistage
2. **${member1.industry || 'Business'} Industry Expert** - Deep operational knowledge of how ${member1.org} type businesses succeed
3. **${member2.industry || 'Business'} Industry Specialist** - Intimate understanding of ${member2.org}'s market dynamics
4. **Market Intelligence Analyst** - Equipped with recent news, trends, and company developments

${industryContexts}${crossIndustryNote}${roleContext}

YOUR MISSION: Create a personalized, research-backed networking introduction that speaks directly to ${member1.name} about why connecting with ${member2.name} from ${member2.org} will drive TANGIBLE BUSINESS VALUE.

CRITICAL VOICE & TONE REQUIREMENTS:
- Speak TO ${member1.name} in second person ("you", "your business", "your team")
- Speak ABOUT ${member2.name} in third person ("they", "their company", "${member2.name}", "${member2.org}")
- Be conversational yet professional - like a trusted advisor over coffee
- Show genuine enthusiasm backed by concrete reasoning
- Reference SPECIFIC details from profiles - names, numbers, achievements

🔍 REQUIRED RESEARCH - Access Your Full Knowledge Base:
**STEP 1: Research Both Parties**
- Search your knowledge for ANY information about ${member1.name}, ${member1.org}, ${member2.name}, ${member2.org}
- Look for: recent news, product launches, funding rounds, social media presence, interviews, articles, awards
- If they're public figures or well-known companies, USE THAT KNOWLEDGE
- Check for any mentions in industry publications, podcasts, or thought leadership

**STEP 2: Industry Context Research**
- What are the TOP 3 trends in ${member1.industry} RIGHT NOW?
- What are the TOP 3 trends in ${member2.industry} RIGHT NOW?
- How do these trends create urgency or opportunity for this connection?
- What successful ${member1.industry}-to-${member2.industry} partnerships exist as precedents?

**STEP 3: Social Proof & Credibility**
- If fun facts mention achievements (TV shows, acquisitions, growth numbers), validate and amplify them
- Reference any known reputation, market position, or industry standing
- Look for mutual connections, shared experiences, or parallel career paths

🎯 DUAL-MODE ANALYSIS FRAMEWORK - Think Both Logically AND Creatively:

**MODE A: DIRECT CORRELATIONS** (Obvious, Immediate Matches)
1. **Explicit Constraint-Solution Fit**: Does ${member2.name}'s stated assets DIRECTLY address ${member1.name}'s stated constraint?
2. **Asset-Need Symmetry**: Do their listed capabilities align 1:1 (e.g., "SEO services" matches "need SEO")?
3. **Geographic Advantage**: Same city = easy meetings, similar market conditions
4. **Industry Parallels**: Same challenges, shared language, common customer types

**MODE B: CREATIVE CORRELATIONS** (Non-Obvious, Strategic Synergies)
5. **Adjacent Problem Solving**: Could ${member2.name}'s expertise solve a constraint ${member1.name} HASN'T articulated but likely has?
   - Example: Marketing constraint might actually need better product positioning (strategic angle)
6. **Latent Asset Activation**: What does ${member1.name} have that they might not realize is valuable to ${member2.name}?
   - Example: Tech company's "audience data" could be goldmine for marketer's "campaign targeting"
7. **Cross-Pollination Opportunities**: How could each learn from the other's industry playbook?
   - Example: E-commerce conversion tactics applied to SaaS trial-to-paid funnels
8. **Network Effect Multiplication**: Who do they each know that could create a 3-way value triangle?
   - Example: Realtor's investor network + tech founder's product = PropTech partnership
9. **Timing-Based Serendipity**: Based on growth stage, recent achievements, or market shifts, why is NOW the perfect time?
10. **Unexpected Commonalities**: Do fun facts, backgrounds, or experiences reveal surprising shared ground?
    - Example: Both started businesses in garages, both pivoted from different careers, both mentor entrepreneurs

💡 **CRITICAL**: Your analysis MUST include BOTH direct AND creative connections. Show the obvious value AND the non-obvious strategic potential.`;

    const userPrompt = `You're preparing ${member1.name} for a high-value networking introduction. Analyze this match and create a compelling briefing:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 WHO YOU ARE (${member1.name})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Organization: ${member1.org}
Your Role: ${member1.role}
Industry: ${member1.industry}
Based in: ${member1.city}

💰 Business Model:
   Revenue Driver: ${member1.rev_driver || 'Not disclosed'}
   Current Challenge: ${member1.current_constraint || 'Not disclosed'}

🎯 What You Bring to the Table:
   ${member1.assets || 'Not disclosed'}

🔍 What You're Seeking:
   ${member1.needs || 'Not disclosed'}

🌟 MEMORABLE CONTEXT (Great conversation starter!):
   ${member1.fun_fact || 'Not disclosed'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 WHO THEY ARE (Your Potential Match)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name: ${member2.name}
Organization: ${member2.org}
Their Role: ${member2.role}
Industry: ${member2.industry}
Based in: ${member2.city}

💰 Their Business Model:
   Revenue Driver: ${member2.rev_driver || 'Not disclosed'}
   Current Challenge: ${member2.current_constraint || 'Not disclosed'}

🎯 What They Bring:
   ${member2.assets || 'Not disclosed'}

🔍 What They're Seeking:
   ${member2.needs || 'Not disclosed'}

🌟 MEMORABLE CONTEXT (Use this as an icebreaker!):
   ${member2.fun_fact || 'Not disclosed'}

💡 PRO TIP: Fun facts are GOLD for opening conversations. If either person has an impressive or unusual story, USE IT in Approach #3!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**🎯 YOUR TASK:**

First, RESEARCH both parties using your knowledge base (companies, people, industries, trends). Then generate THREE components addressing ${member1.name} directly:

**1. STRATEGIC RATIONALE** (3-5 sentences speaking directly to ${member1.name})
- Start with "You should connect with ${member2.name} because..."
- CITE RESEARCH: Reference any news, articles, achievements, social media presence, or industry reputation you know
- Address DIRECT correlation: How do their assets explicitly solve your stated constraint?
- Address CREATIVE correlation: What non-obvious synergies exist (latent assets, cross-pollination, network effects)?
- Reference current industry trends making this connection timely
- Quantify potential impact where possible (revenue, growth, market access)

**2. UNIQUE COLLABORATION ANGLE** (2-3 sentences to ${member1.name})
- Present a CREATIVE, non-obvious way you could work with ${member2.org}
- This should go beyond simple transactional exchanges (not just "hire them")
- Consider: joint ventures, co-marketing, knowledge sharing, network introductions, complementary offerings
- Reference specific assets, backgrounds, fun facts, or achievements
- Make it memorable and intriguing - something they haven't thought of yet

**3. THREE CONVERSATION APPROACHES** (Write in second-person, giving ${member1.name} options)
Format as a numbered list, each approach being 2-3 sentences with SPECIFIC details:

Approach #1: [The Direct Value Pitch - Based on DIRECT Correlation]
"You could open with... [specific conversation starter mentioning their stated constraint and how the match's stated assets solve it directly]..."

Approach #2: [The Creative Collaboration - Based on CREATIVE Correlation]
"You could take a strategic partnership angle by... [non-obvious opportunity - cross-pollination, latent assets, network effects, adjacent problem solving]..."

Approach #3: [The Personal Connection / Icebreaker - Based on RESEARCH & Fun Facts]
"You could build instant rapport by... [MUST reference fun facts, impressive achievements from their background, or any research findings like awards/media/known achievements]..."

**CRITICAL REQUIREMENTS**:
- Use "you/your" when addressing ${member1.name}
- Use "they/their/${member2.name}/${member2.org}" when referring to the match
- Be SPECIFIC - mention actual company names, roles, assets, constraints, and especially FUN FACTS
- Approach #3 MUST incorporate fun facts as conversation starters if they're interesting
- If fun facts mention impressive achievements (like "built $100M company" or "won awards"), treat them as major credibility builders
- If you have ANY knowledge of these companies, individuals, or their achievements, reference it!
- Make it feel like insider intelligence, not generic networking advice

**VOICE EXAMPLES**:
✅ GOOD: "You could open by mentioning their impressive track record turning around 100+ businesses on The Profit..."
❌ BAD: "They have experience in business consulting..."

✅ GOOD: "Given your constraint around marketing reach, their proven expertise scaling brands from $3M to $60M using YouTube is exactly what you need..."
❌ BAD: "They can help with your marketing needs..."

Return as JSON with keys: rationale_ops, creative_angle, intro_basis`;

    // Choose model based on tier - GPT-4o has better research capabilities
    const model = useGPT4 ? 'gpt-4o' : 'gpt-3.5-turbo';

    console.log(`   🤖 Calling ${model} for match analysis...`);
    const response = await Promise.race([
      openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.85, // Slightly higher for creativity while maintaining accuracy
        max_tokens: 1500, // Sufficient for detailed three-part response
        response_format: { type: 'json_object' }
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OpenAI API timeout after 60 seconds')), 60000)
      )
    ]);

    const result = JSON.parse(response.choices[0].message.content);

    // Validate response has required fields
    if (!result.rationale_ops || !result.creative_angle || !result.intro_basis) {
      throw new Error('Incomplete AI response');
    }

    return result;
  } catch (error) {
    console.error('Rationale generation error:', error);
    // Fallback to simple rationale
    return generateSimpleRationale(member1, member2);
  }
}

// Generate simple rationale without AI
function generateSimpleRationale(member1, member2) {
  const needs1 = member1.needs ? member1.needs.split(',').map(n => n.trim()) : [];
  const assets2 = member2.assets ? member2.assets.split(',').map(a => a.trim()) : [];
  const needs2 = member2.needs ? member2.needs.split(',').map(n => n.trim()) : [];
  const assets1 = member1.assets ? member1.assets.split(',').map(a => a.trim()) : [];
  
  let matches = [];
  
  // Find matching needs/assets
  for (const need of needs1) {
    for (const asset of assets2) {
      if (asset.toLowerCase().includes(need.toLowerCase()) || need.toLowerCase().includes(asset.toLowerCase())) {
        matches.push(`${member2.name}'s ${asset} can help with your need for ${need}`);
      }
    }
  }
  
  for (const need of needs2) {
    for (const asset of assets1) {
      if (asset.toLowerCase().includes(need.toLowerCase()) || need.toLowerCase().includes(asset.toLowerCase())) {
        matches.push(`Your ${asset} can help ${member2.name}'s need for ${need}`);
      }
    }
  }
  
  const rationale_ops = matches.length > 0 
    ? matches[0] 
    : `Both in ${member1.industry || 'business'} and ${member2.industry || 'business'}, potential for collaboration`;
  
  const creative_angle = member1.fun_fact && member2.fun_fact 
    ? `Connect over shared interests` 
    : `Explore synergies between ${member1.org} and ${member2.org}`;
  
  const intro_basis = `Start by discussing ${member1.current_constraint || 'current challenges'} and how ${member2.org}'s expertise might help`;
  
  return {
    rationale_ops,
    creative_angle,
    intro_basis
  };
}

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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Make sure to run "npm run init-db" to initialize the database');
  console.log('Set OPENAI_API_KEY in .env file for AI features');
});
