const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Get all CVs for user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      'SELECT id, file_name, ats_score, created_at, is_primary FROM cvs WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.json({
      data: result.rows,
      total: result.rows.length,
    });

  } catch (error) {
    console.error('Get CVs error:', error);
    res.status(500).json({ error: 'Failed to fetch CVs' });
  }
});

// Get CV analysis
router.get('/:cvId/analysis', authMiddleware, async (req, res) => {
  try {
    const { cvId } = req.params;
    const userId = req.user.userId;

    const result = await pool.query(
      'SELECT * FROM cvs WHERE id = $1 AND user_id = $2',
      [cvId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'CV not found' });
    }

    const cv = result.rows[0];

    // Get suggestions
    const suggestionsResult = await pool.query(
      'SELECT * FROM cv_suggestions WHERE cv_id = $1',
      [cvId]
    );

    res.json({
      cv,
      suggestions: suggestionsResult.rows,
    });

  } catch (error) {
    console.error('Get CV analysis error:', error);
    res.status(500).json({ error: 'Failed to fetch CV analysis' });
  }
});

// Upload CV (simplified - just store metadata for now)
router.post('/upload', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { fileName } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: 'File name required' });
    }

    // For demo, we'll generate fake ATS score
    const atsScore = Math.floor(Math.random() * 30) + 50; // 50-80

    // Mock parsed content
    const parsedContent = {
      fullName: 'John Doe',
      email: 'john@example.com',
      phone: '+1-555-0000',
      skills: ['Project Management', 'Python', 'Data Analysis', 'Leadership'],
      experience: [
        {
          jobTitle: 'Senior PM',
          company: 'Tech Corp',
          years: 3,
        },
      ],
    };

    // Mock suggestions
    const suggestions = [
      {
        type: 'format',
        priority: 'high',
        title: 'Remove Header Image',
        description: 'ATS cannot parse images',
        impact: 8,
      },
      {
        type: 'keyword',
        priority: 'high',
        title: 'Add Agile/Scrum Keywords',
        description: 'Missing from 87% of PM roles',
        impact: 6,
      },
    ];

    const cvId = uuidv4();
    await pool.query(
      `INSERT INTO cvs (id, user_id, file_name, ats_score, parsed_content) 
       VALUES ($1, $2, $3, $4, $5)`,
      [cvId, userId, fileName, atsScore, JSON.stringify(parsedContent)]
    );

    // Insert suggestions
    for (const suggestion of suggestions) {
      await pool.query(
        `INSERT INTO cv_suggestions (cv_id, suggestion_type, suggestion_text, priority, impact_on_score)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          cvId,
          suggestion.type,
          suggestion.title,
          suggestion.priority,
          suggestion.impact,
        ]
      );
    }

    res.status(201).json({
      message: 'CV uploaded successfully',
      cvId,
      atsScore,
      suggestions,
      parsedContent,
    });

  } catch (error) {
    console.error('Upload CV error:', error);
    res.status(500).json({ error: 'Failed to upload CV' });
  }
});

module.exports = router;