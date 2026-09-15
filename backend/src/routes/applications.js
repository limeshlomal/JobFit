const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Submit applications
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobIds, cvId } = req.body;

    if (!jobIds || !cvId) {
      return res.status(400).json({ error: 'Job IDs and CV ID required' });
    }

    // Check free tier limit
    const usedResult = await pool.query(
      'SELECT COUNT(*) FROM applications WHERE user_id = $1 AND DATE_TRUNC(\'month\', created_at) = DATE_TRUNC(\'month\', CURRENT_DATE)',
      [userId]
    );

    const used = parseInt(usedResult.rows[0].count);
    if (used >= 5) {
      return res.status(402).json({ 
        error: 'Free tier limit reached. Upgrade to premium for unlimited applications.' 
      });
    }

    // Insert applications
    const applications = [];
    for (const jobId of jobIds) {
      const appId = uuidv4();
      await pool.query(
        `INSERT INTO applications (id, user_id, job_id, cv_id, status, applied_at) 
         VALUES ($1, $2, $3, $4, 'applied', NOW())`,
        [appId, userId, jobId, cvId]
      );

      applications.push({
        id: appId,
        jobId,
        status: 'applied',
      });
    }

    res.status(201).json({
      message: 'Applications submitted successfully',
      applications,
      applicationsRemaining: 5 - (used + jobIds.length),
    });

  } catch (error) {
    console.error('Submit applications error:', error);
    res.status(500).json({ error: 'Failed to submit applications' });
  }
});

// Get user applications
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      'SELECT * FROM applications WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.json({
      data: result.rows,
      total: result.rows.length,
    });

  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

module.exports = router;