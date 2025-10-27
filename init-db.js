// init-db.js
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'networking.db'));

db.serialize(() => {
  // Members table
  db.run(`
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
      consent BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Vectors table for embeddings
  db.run(`
    CREATE TABLE IF NOT EXISTS vectors (
      member_id TEXT PRIMARY KEY,
      embedding_ops TEXT,
      embedding_vibes TEXT,
      FOREIGN KEY (member_id) REFERENCES members(member_id)
    )
  `);

  // Intros table for matches
  db.run(`
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (for_member_id) REFERENCES members(member_id),
      FOREIGN KEY (to_member_id) REFERENCES members(member_id),
      UNIQUE(for_member_id, to_member_id, tier)
    )
  `);

  // Admin users table
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      admin_id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Admin sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      session_id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admin_users(admin_id)
    )
  `);

  // Create indexes for performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_intros_for_member ON intros(for_member_id, tier)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_intros_to_member ON intros(to_member_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_members_email ON members(email)`);

  // Insert default admin user (password: admin)
  const defaultPassword = 'admin';
  bcrypt.hash(defaultPassword, 10, (err, hash) => {
    if (err) {
      console.error('Error hashing password:', err);
      db.close(() => {
        console.log('Database initialized with errors!');
      });
      return;
    }

    db.run(`
      INSERT OR IGNORE INTO admin_users (admin_id, email, password_hash)
      VALUES (?, ?, ?)
    `, ['admin-1', 'admin', hash], (err) => {
      if (err) {
        console.error('Error creating admin user:', err);
      } else {
        console.log('Default admin created: admin / admin');
      }

      // Close database after admin user is created
      db.close(() => {
        console.log('Database initialized successfully!');
      });
    });
  });
});
