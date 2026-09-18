const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const CVParser = require('../services/cvParser');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

const MIME_EXTENSIONS = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || 
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOCX files are allowed'));
    }
  }
});

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

// Serve the original uploaded file (for the CV preview panel)
router.get('/:cvId/file', authMiddleware, async (req, res) => {
  try {
    const { cvId } = req.params;
    const userId = req.user.userId;

    const result = await pool.query(
      'SELECT file_name, file_url FROM cvs WHERE id = $1 AND user_id = $2',
      [cvId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'CV not found' });
    }

    const { file_name: fileName, file_url: fileUrl } = result.rows[0];

    if (!fileUrl) {
      return res.status(404).json({ error: 'No stored file for this CV' });
    }

    const absolutePath = path.join(__dirname, '../../', fileUrl);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'File no longer available' });
    }

    const extension = path.extname(absolutePath).toLowerCase();
    const contentType = extension === '.pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.sendFile(absolutePath);

  } catch (error) {
    console.error('Get CV file error:', error);
    res.status(500).json({ error: 'Failed to fetch CV file' });
  }
});

// Upload CV with real parsing
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'File is required' });
    }

    console.log(`📄 Parsing CV: ${file.originalname}`);

    // Parse PDF
    let parsedCV;
    try {
      parsedCV = await CVParser.parseCV(file.buffer);
    } catch (parseError) {
      console.error('Parse error:', parseError);
      // If parsing fails, use default data
      parsedCV = {
        fullName: 'Unknown',
        email: null,
        phone: null,
        skills: [],
        experience: [],
        education: [],
      };
    }

    // Calculate ATS score
    const atsScore = CVParser.calculateATSScore(parsedCV);
    console.log(`📊 ATS Score: ${atsScore}/100`);

    // Generate suggestions based on parsed data
    const suggestions = generateSuggestions(parsedCV, atsScore);

    // Persist the raw file to disk so it can be previewed later.
    const cvId = uuidv4();
    const extension = MIME_EXTENSIONS[file.mimetype] || path.extname(file.originalname) || '';
    const storedFileName = `${cvId}${extension}`;
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, storedFileName), file.buffer);
    const fileUrl = `uploads/${storedFileName}`;

    // Save CV to database
    await pool.query(
      `INSERT INTO cvs (id, user_id, file_name, file_url, ats_score, parsed_content)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [cvId, userId, file.originalname, fileUrl, atsScore, JSON.stringify(parsedCV)]
    );

    // Save suggestions
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

    console.log(`✅ CV saved with ${suggestions.length} suggestions`);

    res.status(201).json({
      message: 'CV uploaded successfully',
      cvId,
      atsScore,
      suggestions,
      parsedCV,
    });

  } catch (error) {
    console.error('Upload CV error:', error);
    res.status(500).json({ error: 'Failed to upload CV' });
  }
});

// Helper function to generate suggestions
function generateSuggestions(parsedCV, atsScore) {
  const suggestions = [];

  if (!parsedCV.email) {
    suggestions.push({
      type: 'contact',
      priority: 'high',
      title: 'Add Email Address',
      description: 'Email address is missing',
      impact: 10,
    });
  }

  if (!parsedCV.phone) {
    suggestions.push({
      type: 'contact',
      priority: 'high',
      title: 'Add Phone Number',
      description: 'Phone number is missing',
      impact: 8,
    });
  }

  if (!parsedCV.skills || parsedCV.skills.length < 5) {
    suggestions.push({
      type: 'skill',
      priority: 'high',
      title: 'Add More Skills',
      description: `Add at least 5-8 relevant skills. Currently has ${parsedCV.skills?.length || 0}`,
      impact: 15,
    });
  }

  if (!parsedCV.experience || parsedCV.experience.length === 0) {
    suggestions.push({
      type: 'experience',
      priority: 'high',
      title: 'Add Work Experience',
      description: 'Include job titles, companies, and achievements',
      impact: 20,
    });
  }

  if (!parsedCV.education || parsedCV.education.length === 0) {
    suggestions.push({
      type: 'education',
      priority: 'medium',
      title: 'Add Education Details',
      description: 'Include degree, school, and graduation year',
      impact: 10,
    });
  }

  // Keyword suggestions
  const importantKeywords = ['Agile', 'Leadership', 'Analytics', 'Project Management'];
  const missingKeywords = importantKeywords.filter(
    kw => !parsedCV.skills?.includes(kw)
  );

  if (missingKeywords.length > 0) {
    suggestions.push({
      type: 'keyword',
      priority: 'medium',
      title: `Add Keywords: ${missingKeywords.join(', ')}`,
      description: `These keywords are important: ${missingKeywords.join(', ')}`,
      impact: 8,
    });
  }

  return suggestions;
}

module.exports = router;