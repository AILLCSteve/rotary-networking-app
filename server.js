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
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true
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
    return { score: 0, breakdown: [{ factor: 'Self-match', points: 0, description: 'Cannot match with yourself' }] };
  }

  // 1. Semantic similarity (0-40 points)
  const semanticPoints = Math.round(similarity * 40);
  breakdown.push({
    factor: 'Semantic Similarity',
    points: semanticPoints,
    description: 'AI analysis of profile compatibility'
  });
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

  const complementaryPoints = Math.min(complementaryMatches * 6, 30);
  if (complementaryPoints > 0) {
    breakdown.push({
      factor: 'Complementary Match',
      points: complementaryPoints,
      description: `${complementaryMatches} complementary need/asset pairs found`
    });
    totalScore += complementaryPoints;
  }

  // 3. Location match (0-15 points)
  if (member1.city && member2.city && member1.city.toLowerCase() === member2.city.toLowerCase()) {
    const locationPoints = 15;
    breakdown.push({
      factor: 'Same Location',
      points: locationPoints,
      description: `Both in ${member1.city} - easier to meet`
    });
    totalScore += locationPoints;
  }

  // 4. Industry synergy (0-10 points)
  if (member1.industry && member2.industry) {
    const ind1 = member1.industry.toLowerCase();
    const ind2 = member2.industry.toLowerCase();
    if (ind1 !== ind2) {
      const industryPoints = 10;
      breakdown.push({
        factor: 'Cross-Industry Synergy',
        points: industryPoints,
        description: `${member1.industry} + ${member2.industry} = fresh perspectives`
      });
      totalScore += industryPoints;
    } else {
      const industryPoints = 3;
      breakdown.push({
        factor: 'Same Industry',
        points: industryPoints,
        description: 'Shared industry knowledge and contacts'
      });
      totalScore += industryPoints;
    }
  }

  // 5. Constraint alignment (0-5 points)
  if (member1.current_constraint && member2.assets) {
    const constraint1 = member1.current_constraint.toLowerCase();
    const hasAlignment = member2Assets.some(asset =>
      constraint1.includes(asset) || asset.includes(constraint1.split(' ')[0])
    );
    if (hasAlignment) {
      const constraintPoints = 5;
      breakdown.push({
        factor: 'Constraint Relief',
        points: constraintPoints,
        description: 'They can help with your current challenge'
      });
      totalScore += constraintPoints;
    }
  }

  // Normalize to 100 points max
  const normalizedScore = Math.min(totalScore, 100);

  return {
    score: normalizedScore,
    breakdown,
    matches: matches.slice(0, 3) // Top 3 specific matches
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

    // Build profile string for embedding
    const profile = `${member.industry || ''} | ${member.rev_driver || ''} | ${member.current_constraint || ''} | assets: ${member.assets || ''} | needs: ${member.needs || ''} | ${member.city || ''}`;

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

    // Get member and their embedding
    const member = await db.get('SELECT * FROM members WHERE member_id = $1', [memberId]);
    const memberVector = await db.get('SELECT embedding_ops FROM vectors WHERE member_id = $1', [memberId]);

    if (!member || !memberVector) {
      return res.status(400).json({ error: 'Member data not ready' });
    }

    const memberEmbedding = JSON.parse(memberVector.embedding_ops);

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

    // Filter out self-matches and sort
    const filtered = scored.filter(s => s.score > 0);
    filtered.sort((a, b) => b.score - a.score);
    const top3 = filtered.slice(0, 3);

    // Generate rationales for each match
    for (const match of top3) {
      const rationale = await generateMatchRationale(member, match, true); // true = use GPT-4

      // Log the rationale to debug
      console.log('Generated rationale:', JSON.stringify(rationale, null, 2));

      // Ensure intro_basis is a string (handle if AI returns object)
      let introBasisString = rationale.intro_basis;
      if (typeof introBasisString === 'object') {
        console.log('intro_basis is an object, converting to string');
        introBasisString = JSON.stringify(introBasisString);
      }

      const introId = generateId('intro');
      await db.run(`
        INSERT INTO intros (intro_id, for_member_id, to_member_id, tier, score, score_breakdown, rationale_ops, creative_angle, intro_basis)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (for_member_id, to_member_id, tier)
        DO UPDATE SET score = $5, score_breakdown = $6, rationale_ops = $7, creative_angle = $8, intro_basis = $9
      `, [introId, memberId, match.member_id, 'top3', match.score, JSON.stringify(match.breakdown), rationale.rationale_ops, rationale.creative_angle, introBasisString]);
    }

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

    // Get member and their embedding
    const member = await db.get('SELECT * FROM members WHERE member_id = $1', [memberId]);
    const memberVector = await db.get('SELECT embedding_ops FROM vectors WHERE member_id = $1', [memberId]);

    if (!member || !memberVector) {
      return res.status(400).json({ error: 'Member data not ready' });
    }

    const memberEmbedding = JSON.parse(memberVector.embedding_ops);

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
    for (const match of brainstorm) {
      const rationale = await generateMatchRationale(member, match, false); // false = use GPT-3.5

      // Ensure intro_basis is a string (handle if AI returns object)
      let introBasisString = rationale.intro_basis;
      if (typeof introBasisString === 'object') {
        introBasisString = JSON.stringify(introBasisString);
      }

      const introId = generateId('intro');
      await db.run(`
        INSERT INTO intros (intro_id, for_member_id, to_member_id, tier, score, score_breakdown, rationale_ops, creative_angle, intro_basis)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (for_member_id, to_member_id, tier)
        DO UPDATE SET score = $5, score_breakdown = $6, rationale_ops = $7, creative_angle = $8, intro_basis = $9
      `, [introId, memberId, match.member_id, 'brainstorm', match.score, JSON.stringify(match.breakdown), rationale.rationale_ops, rationale.creative_angle, introBasisString]);
    }

    res.json({ success: true, count: brainstorm.length });
  } catch (error) {
    console.error('Generate brainstorm error:', error);
    res.status(500).json({ error: 'Failed to generate brainstorm matches' });
  }
});

// Generate match rationale using OpenAI with advanced prompt engineering and web research
async function generateMatchRationale(member1, member2, useGPT4 = false) {
  try {
    // Build dynamic industry-specific expert persona
    const industries = [member1.industry, member2.industry].filter(Boolean);
    const industryExpertise = industries.length > 0
      ? `You possess deep expertise in ${industries.join(' and ')}, having consulted for Fortune 500 companies and startups alike in these sectors.`
      : 'You have cross-industry expertise spanning technology, services, healthcare, finance, and more.';

    const systemPrompt = `You are a composite expert persona combining:
1. **Master Business Networking Strategist** - 20+ years connecting executives and entrepreneurs
2. **${member1.industry || 'Business'} Industry Expert** - Deep knowledge of ${member1.org}'s sector
3. **${member2.industry || 'Business'} Industry Specialist** - Intimate understanding of ${member2.org}'s market
4. **Market Intelligence Analyst** - Access to recent news, trends, and company developments

${industryExpertise}

YOUR MISSION: Create a personalized, research-backed networking introduction that speaks directly to ${member1.name} about why connecting with ${member2.name} from ${member2.org} will drive tangible business value.

CRITICAL VOICE & TONE REQUIREMENTS:
- Speak TO ${member1.name} in second person ("you", "your business")
- Speak ABOUT ${member2.name} in third person ("they", "their company", "${member2.name}")
- Be conversational yet professional
- Show genuine enthusiasm for the connection potential
- Reference specific, concrete details from their profiles

RESEARCH EXPECTATIONS:
- If you have knowledge of ${member1.org}, ${member2.org}, or the individuals, USE IT
- Reference any known recent activities, news, achievements, or market positioning
- Incorporate industry trends relevant to both parties
- Draw on knowledge of similar successful partnerships in these industries

ANALYSIS FRAMEWORK:
1. **Constraint-Solution Mapping**: How does ${member2.name}'s expertise solve ${member1.name}'s stated constraint?
2. **Complementary Value Exchange**: What specific assets/needs align between them?
3. **Revenue Multiplication**: How could this partnership create 1+1=3 opportunities?
4. **Relationship Catalysts**: What makes THIS introduction timely and relevant NOW?
5. **Trust Builders**: What credentials/achievements make ${member2.name} credible?`;

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

✨ Notable Context: ${member1.fun_fact || 'Not disclosed'}

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

✨ Notable Context: ${member2.fun_fact || 'Not disclosed'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**🎯 YOUR TASK:**

Generate THREE components addressing ${member1.name} directly:

**1. STRATEGIC RATIONALE** (3-4 sentences speaking directly to ${member1.name})
- Start with "You should connect with ${member2.name} because..."
- Explain the SPECIFIC business value this connection offers YOU
- Reference YOUR stated constraint and how THEY can help
- Cite any relevant industry knowledge, company news, or market context
- Quantify potential impact where possible

**2. UNIQUE COLLABORATION ANGLE** (2-3 sentences to ${member1.name})
- Present a creative, unexpected way you could work with ${member2.org}
- Go beyond obvious transactional exchanges
- Reference specific assets, backgrounds, or achievements
- Make it memorable and intriguing

**3. THREE CONVERSATION APPROACHES** (Write in second-person, giving ${member1.name} options)
Format as a numbered list, each approach being 2-3 sentences:

Approach #1: [The Direct Value Pitch]
"You could open with... [specific conversation starter mentioning their constraint/need]..."

Approach #2: [The Collaborative Exploration]
"You could take a partnership angle by... [specific collaboration idea]..."

Approach #3: [The Personal Connection]
"You could build rapport by... [reference to fun facts, shared background, or achievements]..."

**IMPORTANT**:
- Use "you/your" when addressing ${member1.name}
- Use "they/their/${member2.name}/${member2.org}" when referring to the match
- Be specific - mention actual company names, roles, assets, constraints
- If you have ANY knowledge of these companies or individuals, reference it!

Return as JSON with keys: rationale_ops, creative_angle, intro_basis`;

    // Choose model based on tier - GPT-4o has better research capabilities
    const model = useGPT4 ? 'gpt-4o' : 'gpt-3.5-turbo';

    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.85, // Slightly higher for creativity while maintaining accuracy
      max_tokens: 1200, // Increased for three approaches
      response_format: { type: 'json_object' }
    });

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

    const admin = await db.get('SELECT * FROM admin_users WHERE email = $1', [email]);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.adminId = admin.admin_id;
    res.json({ success: true });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Admin dashboard
app.get('/api/admin/members', async (req, res) => {
  if (!req.session.adminId) {
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

    res.json(members);
  } catch (error) {
    console.error('Admin members error:', error);
    res.status(500).json({ error: 'Failed to load members' });
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
