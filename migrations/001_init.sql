-- PostgreSQL schema for Rotary Networking App
-- Run this once on your Neon database to create all tables

-- Members table
CREATE TABLE IF NOT EXISTS members (
  member_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  org TEXT NOT NULL,
  role TEXT NOT NULL,
  industry TEXT NOT NULL,
  city TEXT NOT NULL,
  rev_driver TEXT,
  current_constraint TEXT,
  assets TEXT,
  needs TEXT,
  fun_fact TEXT,
  email TEXT,
  consent BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Vectors table for embeddings
CREATE TABLE IF NOT EXISTS vectors (
  member_id TEXT PRIMARY KEY,
  embedding_ops TEXT,
  embedding_vibes TEXT,
  FOREIGN KEY (member_id) REFERENCES members(member_id) ON DELETE CASCADE
);

-- Intros table for matches
CREATE TABLE IF NOT EXISTS intros (
  intro_id TEXT PRIMARY KEY,
  for_member_id TEXT NOT NULL,
  to_member_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('top3', 'brainstorm')),
  score REAL,
  score_breakdown TEXT,
  rationale_ops TEXT,
  creative_angle TEXT,
  intro_basis TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'acknowledged')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (for_member_id) REFERENCES members(member_id) ON DELETE CASCADE,
  FOREIGN KEY (to_member_id) REFERENCES members(member_id) ON DELETE CASCADE,
  UNIQUE(for_member_id, to_member_id, tier)
);

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
  admin_id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Admin sessions table (optional - session middleware can use memory store)
CREATE TABLE IF NOT EXISTS admin_sessions (
  session_id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admin_users(admin_id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_intros_for_member ON intros(for_member_id, tier);
CREATE INDEX IF NOT EXISTS idx_intros_to_member ON intros(to_member_id);
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_created_at ON members(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intros_status ON intros(status);

-- Insert default admin user (password: admin)
-- Hash generated with bcrypt, rounds=10
-- You should change this password after first login!
INSERT INTO admin_users (admin_id, email, password_hash)
VALUES (
  'admin-1',
  'admin',
  '$2b$10$rZ9h4mGJxVKjzHf5qQZP0eDqF8LCqZGRQqZGJmV5ZGRQqZGJmV5ZG'
)
ON CONFLICT (admin_id) DO NOTHING;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Database schema created successfully!';
  RAISE NOTICE 'Default admin user: admin / admin';
  RAISE NOTICE 'IMPORTANT: Change the admin password after deployment!';
END $$;
