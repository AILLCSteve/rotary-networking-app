-- ============================================================================
-- Add agent_thompson_stats table for NEXUS V3.5+ Thompson Sampling
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_thompson_stats (
  agent TEXT NOT NULL,
  context_key TEXT NOT NULL,
  alpha INTEGER DEFAULT 1,
  beta INTEGER DEFAULT 1,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agent, context_key)
);

-- Initialize stats for 5 NEXUS Production agents with default context
INSERT INTO agent_thompson_stats (agent, context_key, alpha, beta) VALUES
  ('business_synergy', 'default', 1, 1),
  ('creative_collaboration', 'default', 1, 1),
  ('risk_compatibility', 'default', 1, 1),
  ('strategic_growth', 'default', 1, 1),
  ('tactical_connection', 'default', 1, 1)
ON CONFLICT (agent, context_key) DO NOTHING;
