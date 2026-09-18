const pool = require('../config/database');

// This project has no migration tool, so schema additions are applied here,
// idempotently, on server startup. Existing tables (users, cvs, jobs,
// applications, cv_suggestions) were provisioned outside this codebase and
// are left untouched.
async function ensureSchema() {
  // Tracks which job vacancies were shown to a user on a given day, so the
  // free tier's "5 new vacancies per day" limit persists across requests.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_job_feed (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      feed_date DATE NOT NULL,
      job_ids UUID[] NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, feed_date)
    )
  `);

  // Live job fetches originally discarded the job description after using it
  // for match scoring. CV tailoring needs that text, so it's now persisted.
  await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description TEXT`);

  // Stores AI-tailored resume bullets + cover letter per (cv, job) pair.
  // Re-running a tailoring request for the same pair overwrites this row
  // rather than calling the LLM again, so re-viewing a result is free.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cv_tailoring (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      cv_id UUID NOT NULL REFERENCES cvs(id) ON DELETE CASCADE,
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      tailored_summary TEXT,
      tailored_bullets JSONB,
      cover_letter TEXT,
      keywords_added JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (cv_id, job_id)
    )
  `);

  console.log('✓ Schema check complete');
}

module.exports = ensureSchema;
