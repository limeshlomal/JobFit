const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const tailoringService = require('../services/tailoringService');

const router = express.Router();

function rowToTailoring(row) {
  return {
    id: row.id,
    cvId: row.cv_id,
    jobId: row.job_id,
    tailoredSummary: row.tailored_summary,
    tailoredBullets: row.tailored_bullets || [],
    keywordsToAdd: row.keywords_added || [],
    coverLetter: row.cover_letter,
    updatedAt: row.updated_at,
  };
}

// Generate (or return a cached) tailored CV + cover letter for a job.
// Re-requesting the same cvId/jobId pair returns the stored result instead
// of calling the model again, unless force=true — regeneration costs real
// money, so it's opt-in.
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { cvId, jobId, force } = req.body;

    if (!cvId || !jobId) {
      return res.status(400).json({ error: 'cvId and jobId are required' });
    }

    // CV tailoring calls a paid LLM per request — premium only. Looked up
    // fresh from the DB rather than trusted from the JWT, so an upgrade
    // takes effect immediately without needing to log in again.
    const userRow = await pool.query('SELECT subscription_type FROM users WHERE id = $1', [userId]);
    if (userRow.rows[0]?.subscription_type !== 'premium') {
      return res.status(402).json({
        error: 'CV tailoring and cover letter generation is a premium feature. Upgrade to unlock it.',
        upgradeRequired: true,
      });
    }

    if (!force) {
      const existing = await pool.query(
        'SELECT * FROM cv_tailoring WHERE cv_id = $1 AND job_id = $2 AND user_id = $3',
        [cvId, jobId, userId]
      );
      if (existing.rows.length > 0) {
        return res.json({ ...rowToTailoring(existing.rows[0]), cached: true });
      }
    }

    const cvResult = await pool.query(
      'SELECT parsed_content FROM cvs WHERE id = $1 AND user_id = $2',
      [cvId, userId]
    );
    if (cvResult.rows.length === 0) {
      return res.status(404).json({ error: 'CV not found' });
    }

    const jobResult = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const parsedCV = cvResult.rows[0].parsed_content || {};
    const jobRow = jobResult.rows[0];
    const job = {
      title: jobRow.title,
      company: jobRow.company_name,
      location: jobRow.location,
      description: jobRow.description,
    };

    const tailored = await tailoringService.tailorForJob({ parsedCV, job });

    const upserted = await pool.query(
      `INSERT INTO cv_tailoring (user_id, cv_id, job_id, tailored_summary, tailored_bullets, cover_letter, keywords_added, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (cv_id, job_id) DO UPDATE SET
         tailored_summary = EXCLUDED.tailored_summary,
         tailored_bullets = EXCLUDED.tailored_bullets,
         cover_letter = EXCLUDED.cover_letter,
         keywords_added = EXCLUDED.keywords_added,
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        cvId,
        jobId,
        tailored.tailoredSummary,
        JSON.stringify(tailored.tailoredBullets),
        tailored.coverLetter,
        JSON.stringify(tailored.keywordsToAdd),
      ]
    );

    res.json({ ...rowToTailoring(upserted.rows[0]), cached: false });

  } catch (error) {
    console.error('Tailoring error:', error);
    res.status(500).json({ error: 'Failed to generate tailored CV' });
  }
});

module.exports = router;
