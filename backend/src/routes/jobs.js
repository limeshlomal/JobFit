const express = require('express');
const { v5: uuidv5 } = require('uuid');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const jobSearchService = require('../services/jobSearchService');

const router = express.Router();

// Namespace used to derive a stable UUID from an external job listing's id,
// so re-fetching the same live listing always maps to the same DB row
// (applications.job_id has a FK to jobs.id, so every job shown to a user
// must exist in the jobs table).
const JOB_ID_NAMESPACE = '9c3b1d2e-1c1a-4b8e-9f0a-2a6f1c9b0a11';

// Fallback jobs used when no RAPIDAPI_KEY is configured or the live job
// search fails/returns nothing. Fixed IDs so they only ever need to be
// upserted once.
const FALLBACK_JOBS = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    title: 'Senior Product Manager',
    company: 'TechCorp Solutions',
    location: 'San Francisco, CA',
    salaryMin: 180000,
    salaryMax: 220000,
    matchScore: 92,
    source: 'linkedin',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    title: 'Product Manager',
    company: 'Innovation Labs',
    location: 'New York, NY',
    salaryMin: 160000,
    salaryMax: 200000,
    matchScore: 87,
    source: 'indeed',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    title: 'Program Manager',
    company: 'Enterprise Systems Inc',
    location: 'Remote',
    salaryMin: 150000,
    salaryMax: 190000,
    matchScore: 78,
    source: 'workable',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440004',
    title: 'Director of Product',
    company: 'Unicorn Startup',
    location: 'San Francisco, CA',
    salaryMin: 200000,
    salaryMax: 260000,
    matchScore: 85,
    source: 'linkedin',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440005',
    title: 'Product Strategy Lead',
    company: 'FinTech Solutions',
    location: 'Boston, MA',
    salaryMin: 170000,
    salaryMax: 210000,
    matchScore: 81,
    source: 'indeed',
  },
];

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

async function upsertJob(client, job) {
  await client.query(
    `INSERT INTO jobs (id, title, company_name, location, salary_min, salary_max, match_score, source, job_url, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       match_score = EXCLUDED.match_score,
       salary_min = EXCLUDED.salary_min,
       salary_max = EXCLUDED.salary_max,
       description = COALESCE(EXCLUDED.description, jobs.description)`,
    [
      job.id,
      job.title,
      job.company,
      job.location,
      job.salaryMin,
      job.salaryMax,
      job.matchScore,
      job.source,
      job.jobUrl || null,
      job.description || null,
    ]
  );
}

function rowToJob(row) {
  return {
    id: row.id,
    title: row.title,
    company: row.company_name,
    location: row.location,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    matchScore: row.match_score,
    source: row.source,
    jobUrl: row.job_url,
  };
}

// Get recommended jobs — free tier: up to 5 new vacancies per calendar day.
// The same 5 are returned for repeat requests on the same day; a fresh
// batch is only fetched once the day rolls over.
router.get('/recommendations', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { cvId } = req.query;

    if (!cvId) {
      return res.status(400).json({ error: 'CV ID required' });
    }

    const today = todayDateString();

    const existingFeed = await pool.query(
      'SELECT job_ids FROM daily_job_feed WHERE user_id = $1 AND feed_date = $2',
      [userId, today]
    );

    if (existingFeed.rows.length > 0) {
      const jobIds = existingFeed.rows[0].job_ids;
      const jobsResult = await pool.query('SELECT * FROM jobs WHERE id = ANY($1)', [jobIds]);
      const byId = new Map(jobsResult.rows.map((row) => [row.id, rowToJob(row)]));
      const ordered = jobIds.map((id) => byId.get(id)).filter(Boolean);

      return res.json({ data: ordered, total: ordered.length, source: 'cached' });
    }

    // No feed generated for today yet — pull the CV's parsed skills to
    // steer the search, then fetch a fresh batch.
    const cvResult = await pool.query(
      'SELECT parsed_content FROM cvs WHERE id = $1 AND user_id = $2',
      [cvId, userId]
    );

    if (cvResult.rows.length === 0) {
      return res.status(404).json({ error: 'CV not found' });
    }

    const skills = cvResult.rows[0].parsed_content?.skills || [];

    let jobsToUse;
    let source;

    const liveJobs = await jobSearchService.fetchLiveJobs({ skills });

    if (liveJobs && liveJobs.length > 0) {
      jobsToUse = liveJobs.map((job) => ({
        ...job,
        id: uuidv5(job.externalId, JOB_ID_NAMESPACE),
      }));
      source = 'live';
    } else {
      jobsToUse = FALLBACK_JOBS;
      source = 'fallback';
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const job of jobsToUse) {
        await upsertJob(client, job);
      }
      await client.query(
        `INSERT INTO daily_job_feed (user_id, feed_date, job_ids) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, feed_date) DO NOTHING`,
        [userId, today, jobsToUse.map((j) => j.id)]
      );
      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    res.json({
      data: jobsToUse.map(({ description, externalId, ...job }) => job),
      total: jobsToUse.length,
      source,
    });

  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get single job
router.get('/:jobId', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.jobId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(rowToJob(result.rows[0]));

  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

module.exports = router;
