// ============================================================================
// NEXUS V2 - Advanced Multi-Layer AI Matchmaking Engine
// ============================================================================
// Revolutionary parallel multi-agent architecture for business networking
//
// Architecture:
// - Layer 1: 8 parallel data gathering calls
// - Layer 2: 5 specialized agent analyses
// - Layer 3: Master synthesis & conflict resolution
// - Layer 4: Quality control & fact-checking
// - Layer 5: Enhanced scoring & visualization
// ============================================================================

const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ============================================================================
// LAYER 1: PARALLEL DATA GATHERING
// ============================================================================

async function layer1_gatherIntelligence(member1, member2) {
  console.log(`\n🔍 LAYER 1: Gathering intelligence in parallel...`);
  const startTime = Date.now();

  const calls = [];

  // Call 1: Member 1 Company News
  calls.push(
    searchCompanyNews(member1)
      .catch(err => ({ member: 1, type: 'company_news', data: null, error: err.message }))
  );

  // Call 2: Member 2 Company News
  calls.push(
    searchCompanyNews(member2)
      .catch(err => ({ member: 2, type: 'company_news', data: null, error: err.message }))
  );

  // Call 3: Member 1 Industry Trends
  calls.push(
    searchIndustryTrends(member1.industry)
      .catch(err => ({ industry: member1.industry, type: 'trends', data: null, error: err.message }))
  );

  // Call 4: Member 2 Industry Trends (if different)
  if (member1.industry !== member2.industry) {
    calls.push(
      searchIndustryTrends(member2.industry)
        .catch(err => ({ industry: member2.industry, type: 'trends', data: null, error: err.message }))
    );
  }

  // Call 5: Cross-Industry Partnerships
  calls.push(
    searchCrossIndustryPartnerships(member1.industry, member2.industry)
      .catch(err => ({ type: 'partnerships', data: null, error: err.message }))
  );

  // Call 6: AI Profile Deep Analysis - Member 1
  calls.push(
    deepProfileAnalysis(member1, 1)
      .catch(err => ({ member: 1, type: 'profile_analysis', data: null, error: err.message }))
  );

  // Call 7: AI Profile Deep Analysis - Member 2
  calls.push(
    deepProfileAnalysis(member2, 2)
      .catch(err => ({ member: 2, type: 'profile_analysis', data: null, error: err.message }))
  );

  // Call 8: Market Context Analysis
  calls.push(
    analyzeMarketContext(member1, member2)
      .catch(err => ({ type: 'market_context', data: null, error: err.message }))
  );

  // Execute all in parallel with 45-second timeout
  const results = await Promise.race([
    Promise.allSettled(calls),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Layer 1 timeout after 45 seconds')), 45000)
    )
  ]);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ LAYER 1 complete: ${results.length} data sources gathered in ${elapsed}s`);

  // Process results
  const intelligence = {
    member1_company_news: null,
    member2_company_news: null,
    member1_industry_trends: null,
    member2_industry_trends: null,
    cross_industry_partnerships: null,
    member1_profile_analysis: null,
    member2_profile_analysis: null,
    market_context: null,
    errors: []
  };

  results.forEach((result, idx) => {
    if (result.status === 'fulfilled' && result.value) {
      const data = result.value;
      if (data.error) {
        intelligence.errors.push(data.error);
      } else if (data.type === 'company_news') {
        if (data.member === 1) intelligence.member1_company_news = data.data;
        if (data.member === 2) intelligence.member2_company_news = data.data;
      } else if (data.type === 'trends') {
        if (data.industry === member1.industry) intelligence.member1_industry_trends = data.data;
        if (data.industry === member2.industry) intelligence.member2_industry_trends = data.data;
      } else if (data.type === 'partnerships') {
        intelligence.cross_industry_partnerships = data.data;
      } else if (data.type === 'profile_analysis') {
        if (data.member === 1) intelligence.member1_profile_analysis = data.data;
        if (data.member === 2) intelligence.member2_profile_analysis = data.data;
      } else if (data.type === 'market_context') {
        intelligence.market_context = data.data;
      }
    }
  });

  return intelligence;
}

// Helper: Search company news
async function searchCompanyNews(member) {
  // Simulate web search (in production, use WebSearch tool or API)
  const prompt = `Based on your knowledge, provide recent context about ${member.org} in ${member.industry} industry. Include any known achievements, market position, or recent developments. If unknown, state "No public information available." Keep response under 200 words.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 300
  });

  return {
    member: member.member_id,
    type: 'company_news',
    data: response.choices[0].message.content
  };
}

// Helper: Search industry trends
async function searchIndustryTrends(industry) {
  const prompt = `What are the top 3 trends in ${industry} industry in 2024-2025? Focus on business implications and opportunities. Keep under 200 words.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 300
  });

  return {
    industry,
    type: 'trends',
    data: response.choices[0].message.content
  };
}

// Helper: Search cross-industry partnerships
async function searchCrossIndustryPartnerships(industry1, industry2) {
  if (industry1 === industry2) {
    return {
      type: 'partnerships',
      data: `Same industry - focus on peer collaboration and co-opetition models.`
    };
  }

  const prompt = `Give 2 real-world examples of successful partnerships between ${industry1} and ${industry2} companies. Include why they succeeded. Keep under 200 words.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 300
  });

  return {
    type: 'partnerships',
    data: response.choices[0].message.content
  };
}

// Helper: Deep profile analysis
async function deepProfileAnalysis(member, memberNum) {
  const prompt = `Analyze this business professional's profile and identify:
1. Core competencies and unique value
2. Hidden assets they might not realize (connections, experience, knowledge)
3. Unstated challenges based on their role/industry
4. Strategic positioning opportunities

Profile:
- Name: ${member.name}
- Role: ${member.role} at ${member.org}
- Industry: ${member.industry}
- Location: ${member.city}
- Revenue Model: ${member.rev_driver || 'Not specified'}
- Challenge: ${member.current_constraint || 'Not specified'}
- Assets: ${member.assets || 'Not specified'}
- Needs: ${member.needs || 'Not specified'}
- Notable: ${member.fun_fact || 'Not specified'}

Provide analysis in JSON format:
{
  "core_competencies": ["...", "..."],
  "hidden_assets": ["...", "..."],
  "unstated_challenges": ["...", "..."],
  "strategic_opportunities": ["...", "..."]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    max_tokens: 500,
    response_format: { type: 'json_object' }
  });

  return {
    member: memberNum,
    type: 'profile_analysis',
    data: JSON.parse(response.choices[0].message.content)
  };
}

// Helper: Market context analysis
async function analyzeMarketContext(member1, member2) {
  const prompt = `Analyze the market context for a potential partnership between:
- ${member1.name} (${member1.role} at ${member1.org}, ${member1.industry})
- ${member2.name} (${member2.role} at ${member2.org}, ${member2.industry})

Consider:
1. Current market conditions for both industries
2. Timing factors (why now vs. 6 months ago or 6 months from now)
3. Competitive landscape
4. Regulatory or technological factors

Provide in JSON:
{
  "market_conditions": "...",
  "timing_factors": "...",
  "competitive_landscape": "...",
  "external_factors": "..."
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.6,
    max_tokens: 600,
    response_format: { type: 'json_object' }
  });

  return {
    type: 'market_context',
    data: JSON.parse(response.choices[0].message.content)
  };
}

// ============================================================================
// LAYER 2: MULTI-AGENT ANALYSIS
// ============================================================================

async function layer2_multiAgentAnalysis(member1, member2, intelligence) {
  console.log(`\n🤖 LAYER 2: Running 5 specialized agents in parallel...`);
  const startTime = Date.now();

  const agentCalls = [
    runAgent_BusinessSynergy(member1, member2, intelligence),
    runAgent_CreativeCollaboration(member1, member2, intelligence),
    runAgent_RiskCompatibility(member1, member2, intelligence),
    runAgent_StrategicGrowth(member1, member2, intelligence),
    runAgent_TacticalConnection(member1, member2, intelligence)
  ];

  const results = await Promise.race([
    Promise.allSettled(agentCalls),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Layer 2 timeout after 90 seconds')), 90000)
    )
  ]);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ LAYER 2 complete: 5 agents analyzed in ${elapsed}s`);

  const agentOutputs = {
    business_synergy: results[0].status === 'fulfilled' ? results[0].value : null,
    creative_collaboration: results[1].status === 'fulfilled' ? results[1].value : null,
    risk_compatibility: results[2].status === 'fulfilled' ? results[2].value : null,
    strategic_growth: results[3].status === 'fulfilled' ? results[3].value : null,
    tactical_connection: results[4].status === 'fulfilled' ? results[4].value : null
  };

  return agentOutputs;
}

// Agent A: Business Synergy Analyst
async function runAgent_BusinessSynergy(member1, member2, intel) {
  const systemPrompt = `You are a Business Synergy Analyst specializing in identifying direct value exchange opportunities between companies.

Your focus:
- Complementary capabilities (what each can provide the other)
- Resource sharing potential (cost savings, efficiency gains)
- Direct asset-need matching
- Transactional value (immediate exchangeable services/products)

Be specific and quantifiable where possible.`;

  const userPrompt = `Analyze business synergy between:

**${member1.name}** (${member1.role} at ${member1.org})
Industry: ${member1.industry}
Assets: ${member1.assets || 'Not specified'}
Needs: ${member1.needs || 'Not specified'}
Challenge: ${member1.current_constraint || 'Not specified'}

**${member2.name}** (${member2.role} at ${member2.org})
Industry: ${member2.industry}
Assets: ${member2.assets || 'Not specified'}
Needs: ${member2.needs || 'Not specified'}
Challenge: ${member2.current_constraint || 'Not specified'}

Intelligence Gathered:
${JSON.stringify(intel, null, 2)}

Provide analysis in JSON:
{
  "direct_value_exchanges": ["specific exchange 1", "specific exchange 2", ...],
  "resource_sharing_opportunities": ["opportunity 1", "opportunity 2", ...],
  "asset_need_matches": ["match 1", "match 2", ...],
  "quantifiable_benefits": "Estimated value/savings/impact",
  "synergy_score": 0-100,
  "confidence": 0-100
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.6,
    max_tokens: 1000,
    response_format: { type: 'json_object' }
  });

  return JSON.parse(response.choices[0].message.content);
}

// Agent B: Creative Collaboration Architect
async function runAgent_CreativeCollaboration(member1, member2, intel) {
  const systemPrompt = `You are a Creative Collaboration Architect who discovers non-obvious partnership opportunities.

Your focus:
- Co-creation and joint ventures
- Network effects and introduction opportunities
- Cross-pollination of ideas/methods from different industries
- Unexpected commonalities (fun facts, backgrounds, philosophies)
- "What if?" scenarios

Be imaginative but realistic.`;

  const userPrompt = `Discover creative collaboration opportunities between:

**${member1.name}** (${member1.role} at ${member1.org})
Industry: ${member1.industry}
Fun Fact: ${member1.fun_fact || 'Not specified'}
Profile Analysis: ${JSON.stringify(intel.member1_profile_analysis)}

**${member2.name}** (${member2.role} at ${member2.org})
Industry: ${member2.industry}
Fun Fact: ${member2.fun_fact || 'Not specified'}
Profile Analysis: ${JSON.stringify(intel.member2_profile_analysis)}

Market Context: ${JSON.stringify(intel.market_context)}

Provide analysis in JSON:
{
  "co_creation_ideas": ["idea 1", "idea 2", ...],
  "network_multiplication": ["who they could introduce each other to and why"],
  "unexpected_synergies": ["non-obvious connection 1", "connection 2", ...],
  "innovation_potential": "How could they innovate together?",
  "creativity_score": 0-100,
  "confidence": 0-100
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.9,  // Higher creativity
    max_tokens: 1000,
    response_format: { type: 'json_object' }
  });

  return JSON.parse(response.choices[0].message.content);
}

// Agent C: Risk & Compatibility Assessor
async function runAgent_RiskCompatibility(member1, member2, intel) {
  const systemPrompt = `You are a Risk & Compatibility Assessor who identifies potential conflicts and compatibility issues.

Your focus:
- Competitive conflicts (do they compete for same customers?)
- Cultural/communication style mismatches
- Resource constraints that could hinder collaboration
- Reputational risks
- Legal/regulatory barriers

Be honest about red flags.`;

  const userPrompt = `Assess risks and compatibility between:

**${member1.name}** (${member1.role} at ${member1.org})
Industry: ${member1.industry}
Location: ${member1.city}
Constraint: ${member1.current_constraint || 'Not specified'}

**${member2.name}** (${member2.role} at ${member2.org})
Industry: ${member2.industry}
Location: ${member2.city}
Constraint: ${member2.current_constraint || 'Not specified'}

Company News:
M1: ${intel.member1_company_news || 'None'}
M2: ${intel.member2_company_news || 'None'}

Provide analysis in JSON:
{
  "competitive_conflicts": ["conflict 1 or 'None identified'", ...],
  "cultural_fit": "High/Medium/Low and why",
  "resource_barriers": ["barrier 1 or 'None'", ...],
  "red_flags": ["flag 1 or 'None'", ...],
  "compatibility_score": 0-100 (higher = more compatible),
  "risk_score": 0-100 (higher = more risky),
  "confidence": 0-100
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.4,  // Lower temp for risk assessment
    max_tokens: 1000,
    response_format: { type: 'json_object' }
  });

  return JSON.parse(response.choices[0].message.content);
}

// Agent D: Strategic Growth Advisor
async function runAgent_StrategicGrowth(member1, member2, intel) {
  const systemPrompt = `You are a Strategic Growth Advisor focused on long-term value and market expansion.

Your focus:
- Market expansion opportunities (new geographies, customer segments)
- Industry positioning and thought leadership
- Long-term strategic value (3-5 year horizon)
- How this connection multiplies over time

Think big picture and future-oriented.`;

  const userPrompt = `Analyze strategic growth potential between:

**${member1.name}** (${member1.role} at ${member1.org})
Industry: ${member1.industry}
Revenue Model: ${member1.rev_driver || 'Not specified'}

**${member2.name}** (${member2.role} at ${member2.org})
Industry: ${member2.industry}
Revenue Model: ${member2.rev_driver || 'Not specified'}

Industry Trends:
M1 Industry: ${intel.member1_industry_trends || 'None'}
M2 Industry: ${intel.member2_industry_trends || 'None'}

Cross-Industry Examples: ${intel.cross_industry_partnerships || 'None'}

Provide analysis in JSON:
{
  "market_expansion_opportunities": ["opportunity 1", "opportunity 2", ...],
  "strategic_positioning": "How this partnership elevates both",
  "long_term_value_potential": "3-5 year projection",
  "growth_multipliers": ["multiplier 1", "multiplier 2", ...],
  "strategic_score": 0-100,
  "confidence": 0-100
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 1000,
    response_format: { type: 'json_object' }
  });

  return JSON.parse(response.choices[0].message.content);
}

// Agent E: Tactical Connection Planner
async function runAgent_TacticalConnection(member1, member2, intel) {
  const systemPrompt = `You are a Tactical Connection Planner who creates actionable next steps for networking.

Your focus:
- Specific conversation starters (referencing research, fun facts, recent news)
- Immediate action items (within 1 week, 1 month)
- Meeting format recommendations (coffee, video call, conference, etc.)
- Follow-up cadence

Be practical and immediately actionable.`;

  const userPrompt = `Create tactical connection plan for:

**${member1.name}** → Meeting → **${member2.name}**

Context:
M1: ${member1.name}, ${member1.role} at ${member1.org}
Fun Fact: ${member1.fun_fact || 'None'}
M2: ${member2.name}, ${member2.role} at ${member2.org}
Fun Fact: ${member2.fun_fact || 'None'}

All Intelligence: ${JSON.stringify(intel, null, 2)}

Provide tactical plan in JSON:
{
  "conversation_starters": ["opener 1 (specific to research)", "opener 2", "opener 3"],
  "immediate_actions": ["action within 1 week", "action within 1 month"],
  "meeting_format": "Recommended format and why",
  "follow_up_cadence": "Suggested timeline",
  "tactical_score": 0-100 (ease of connection),
  "confidence": 0-100
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.8,
    max_tokens: 1000,
    response_format: { type: 'json_object' }
  });

  return JSON.parse(response.choices[0].message.content);
}

// ============================================================================
// LAYER 3: SYNTHESIS & CONFLICT RESOLUTION
// ============================================================================

async function layer3_synthesize(member1, member2, intelligence, agentOutputs) {
  console.log(`\n🧠 LAYER 3: Master synthesizer combining all insights...`);
  const startTime = Date.now();

  const systemPrompt = `You are a Master Synthesizer AI responsible for combining insights from 5 specialized agents.

Your tasks:
1. Identify where agents AGREE (consensus = high confidence)
2. Identify where agents DISAGREE (investigate further, note uncertainty)
3. Resolve conflicts by weighing agent confidence scores
4. Create a unified, coherent strategic narrative
5. Highlight unique insights that only one agent noticed

Be clear about consensus vs. unique perspectives.`;

  const userPrompt = `Synthesize insights for match between ${member1.name} and ${member2.name}.

AGENT OUTPUTS:
${JSON.stringify(agentOutputs, null, 2)}

RAW INTELLIGENCE:
${JSON.stringify(intelligence, null, 2)}

Provide synthesis in JSON:
{
  "consensus_points": ["all agents agree on X", ...],
  "unique_insights": ["only Agent B noticed Y", ...],
  "conflicting_views": ["Agent A says X, but Agent C says Y", ...],
  "confidence_weighted_recommendation": "Overall recommendation considering all agent confidence scores",
  "strategic_narrative": "3-4 paragraphs synthesizing all insights into coherent story",
  "top_5_opportunities": ["ranked by agent consensus + uniqueness", ...],
  "overall_quality_score": 0-100,
  "synthesis_confidence": 0-100
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.5,
    max_tokens: 2000,
    response_format: { type: 'json_object' }
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ LAYER 3 complete: Synthesis generated in ${elapsed}s`);

  return JSON.parse(response.choices[0].message.content);
}

// ============================================================================
// LAYER 4: QUALITY CONTROL & FACT-CHECKING
// ============================================================================

async function layer4_qualityControl(member1, member2, intelligence, agentOutputs, synthesis) {
  console.log(`\n✅ LAYER 4: Quality control and fact-checking...`);
  const startTime = Date.now();

  const systemPrompt = `You are a Quality Controller responsible for fact-checking and validation.

Your tasks:
1. Verify every factual claim against raw intelligence data
2. Remove or flag unsubstantiated assertions
3. Ensure all recommendations are actionable
4. Check for logical consistency
5. Add confidence tags to each statement

RULES:
- If a claim isn't in raw data, mark it as [INFERENCE] or remove it
- Flag any logical contradictions
- Ensure conversation starters reference real data
- All numbers/dates must be verified`;

  const userPrompt = `Fact-check this synthesis:

SYNTHESIS TO VERIFY:
${JSON.stringify(synthesis, null, 2)}

RAW DATA TO VERIFY AGAINST:
Intelligence: ${JSON.stringify(intelligence, null, 2)}
Agent Outputs: ${JSON.stringify(agentOutputs, null, 2)}

Member Profiles:
M1: ${member1.name}, ${member1.role} at ${member1.org}, ${member1.industry}, ${member1.city}
M2: ${member2.name}, ${member2.role} at ${member2.org}, ${member2.industry}, ${member2.city}

Provide fact-checked output in JSON:
{
  "verified_synthesis": "Cleaned version with unsubstantiated claims removed",
  "verified_opportunities": ["only verified opportunities"],
  "confidence_tagged_narrative": "Narrative with [HIGH/MEDIUM/LOW CONFIDENCE] tags",
  "removed_claims": ["claim 1 was removed because X", ...],
  "verification_score": 0-100 (% of claims verified),
  "quality_score": 0-100
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,  // Low temp for fact-checking
    max_tokens: 2000,
    response_format: { type: 'json_object' }
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ LAYER 4 complete: Quality control finished in ${elapsed}s`);

  return JSON.parse(response.choices[0].message.content);
}

// ============================================================================
// LAYER 5: ENHANCED SCORING WITH ENTROPY DIFFERENTIATION
// ============================================================================

function layer5_calculateEnhancedScore(agentOutputs, synthesis, qualityControl) {
  console.log(`\n📊 LAYER 5: Calculating enhanced multi-dimensional scores...`);

  // Extract agent scores
  const scores = {
    strategic_synergy: agentOutputs.business_synergy?.synergy_score || 50,
    tactical_value: agentOutputs.tactical_connection?.tactical_score || 50,
    innovation_potential: agentOutputs.creative_collaboration?.creativity_score || 50,
    risk_compatibility: 100 - (agentOutputs.risk_compatibility?.risk_score || 50), // Inverse risk
    network_effects: agentOutputs.strategic_growth?.strategic_score || 50,
    temporal_urgency: calculateTemporalUrgency(agentOutputs)
  };

  // Calculate base score (weighted average)
  const baseScore =
    (scores.strategic_synergy * 0.25) +
    (scores.tactical_value * 0.20) +
    (scores.innovation_potential * 0.20) +
    (scores.risk_compatibility * 0.15) +
    (scores.network_effects * 0.15) +
    (scores.temporal_urgency * 0.05);

  // Calculate uniqueness coefficient (entropy boost)
  const uniquenessCoefficient = calculateUniqueness(agentOutputs, synthesis);

  // Apply entropy-based differentiation
  const entropyBoostedScore = baseScore * (1 + uniquenessCoefficient);

  // Calculate agent consensus
  const agentConfidences = [
    agentOutputs.business_synergy?.confidence || 50,
    agentOutputs.creative_collaboration?.confidence || 50,
    agentOutputs.risk_compatibility?.confidence || 50,
    agentOutputs.strategic_growth?.confidence || 50,
    agentOutputs.tactical_connection?.confidence || 50
  ];
  const avgConfidence = agentConfidences.reduce((a, b) => a + b, 0) / 5;
  const consensusWeight = Math.pow(avgConfidence / 100, 1.5); // Exponential weight

  // Final score with consensus weighting
  const finalScore = Math.min(Math.round(entropyBoostedScore * consensusWeight), 100);

  // Confidence breakdown
  const confidenceBreakdown = {
    data_quality: qualityControl.verification_score || 70,
    agent_consensus: avgConfidence,
    synthesis_quality: synthesis.synthesis_confidence || 70,
    overall: Math.round((qualityControl.verification_score + avgConfidence + synthesis.synthesis_confidence) / 3)
  };

  console.log(`✅ LAYER 5 complete: Final score ${finalScore}/100 (base: ${Math.round(baseScore)}, entropy boost: +${Math.round((uniquenessCoefficient * 100))}%, consensus: ${Math.round(consensusWeight * 100)}%)`);

  return {
    final_score: finalScore,
    dimension_scores: scores,
    base_score: Math.round(baseScore),
    entropy_boost: Math.round(uniquenessCoefficient * 100),
    consensus_weight: Math.round(consensusWeight * 100),
    confidence: confidenceBreakdown,
    grade: calculateGrade(finalScore)
  };
}

// Helper: Calculate temporal urgency (0-100)
function calculateTemporalUrgency(agentOutputs) {
  // Parse market context for timing indicators
  const strategicGrowth = agentOutputs.strategic_growth || {};
  const longTermValue = strategicGrowth.long_term_value_potential || '';

  // Simple heuristic: look for urgency keywords
  const urgencyKeywords = ['now', 'urgent', 'window', 'opportunity', 'timing', 'momentum', 'trend', 'emerging'];
  const urgencyScore = urgencyKeywords.reduce((score, keyword) => {
    return score + (longTermValue.toLowerCase().includes(keyword) ? 10 : 0);
  }, 50); // Start at 50 (moderate urgency)

  return Math.min(urgencyScore, 100);
}

// Helper: Calculate uniqueness coefficient (0-0.5 range)
function calculateUniqueness(agentOutputs, synthesis) {
  let uniqueness = 0;

  // Factor 1: Unusual industry pairing
  const creative = agentOutputs.creative_collaboration || {};
  const unexpectedSynergies = creative.unexpected_synergies || [];
  uniqueness += Math.min(unexpectedSynergies.length * 0.05, 0.15);

  // Factor 2: Unique insights (only one agent noticed)
  const uniqueInsights = synthesis.unique_insights || [];
  uniqueness += Math.min(uniqueInsights.length * 0.05, 0.15);

  // Factor 3: High innovation potential
  const innovationScore = creative.creativity_score || 50;
  if (innovationScore > 80) uniqueness += 0.1;

  // Factor 4: Network effects multiplier
  const networkMultipliers = agentOutputs.strategic_growth?.growth_multipliers || [];
  uniqueness += Math.min(networkMultipliers.length * 0.03, 0.10);

  return Math.min(uniqueness, 0.5); // Cap at 0.5 (50% boost max)
}

// Helper: Calculate letter grade
function calculateGrade(score) {
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'B-';
  if (score >= 60) return 'C+';
  if (score >= 55) return 'C';
  return 'C-';
}

// ============================================================================
// MASTER ORCHESTRATOR: NEXUS V2 PIPELINE
// ============================================================================

async function generateNexusV2Match(member1, member2) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 NEXUS V2: Analyzing ${member1.name} ↔ ${member2.name}`);
  console.log(`${'='.repeat(70)}`);

  const pipelineStart = Date.now();

  try {
    // LAYER 1: Parallel data gathering
    const intelligence = await layer1_gatherIntelligence(member1, member2);

    // LAYER 2: Multi-agent analysis
    const agentOutputs = await layer2_multiAgentAnalysis(member1, member2, intelligence);

    // LAYER 3: Synthesis & conflict resolution
    const synthesis = await layer3_synthesize(member1, member2, intelligence, agentOutputs);

    // LAYER 4: Quality control & fact-checking
    const qualityControl = await layer4_qualityControl(member1, member2, intelligence, agentOutputs, synthesis);

    // LAYER 5: Enhanced scoring
    const scoring = layer5_calculateEnhancedScore(agentOutputs, synthesis, qualityControl);

    const totalTime = ((Date.now() - pipelineStart) / 1000).toFixed(1);
    console.log(`\n✅ NEXUS V2 COMPLETE: ${totalTime}s total processing time`);
    console.log(`   Final Score: ${scoring.final_score}/100 (${scoring.grade})`);
    console.log(`   Confidence: ${scoring.confidence.overall}%`);
    console.log(`${'='.repeat(70)}\n`);

    return {
      member1_id: member1.member_id,
      member2_id: member2.member_id,
      score: scoring.final_score,
      grade: scoring.grade,
      processing_time: totalTime,

      // Layer outputs
      intelligence,
      agent_outputs: agentOutputs,
      synthesis,
      quality_control: qualityControl,
      scoring,

      // Metadata
      generated_at: new Date().toISOString(),
      pipeline_version: 'NEXUS V2.0',
      total_ai_calls: 15  // 8 in Layer 1 + 5 in Layer 2 + 1 synthesis + 1 QC
    };
  } catch (error) {
    console.error(`❌ NEXUS V2 FAILED:`, error.message);
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  generateNexusV2Match,
  layer1_gatherIntelligence,
  layer2_multiAgentAnalysis,
  layer3_synthesize,
  layer4_qualityControl,
  layer5_calculateEnhancedScore
};
