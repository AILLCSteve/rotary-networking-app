// db.js - PostgreSQL database connection using pg Pool
require('dotenv').config();
const { Pool } = require('pg');

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false  // Required for Neon and most cloud Postgres providers
  } : false
});

// Test connection on startup
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

// Helper function to run a query
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Helper function to get a single row (like SQLite db.get())
async function get(text, params) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

// Helper function to get all rows (like SQLite db.all())
async function all(text, params) {
  const result = await query(text, params);
  return result.rows;
}

// Helper function to run insert/update/delete (like SQLite db.run())
async function run(text, params) {
  const result = await query(text, params);
  return {
    lastID: result.rows[0]?.id,
    changes: result.rowCount
  };
}

// Test database connection
async function testConnection() {
  try {
    const result = await query('SELECT NOW() as now');
    console.log('Database connection test successful:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

module.exports = {
  pool,
  query,
  get,
  all,
  run,
  testConnection
};
