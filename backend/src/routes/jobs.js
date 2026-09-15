const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Mock job data
const mockJobs = [
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

// Get recommended jobs
router.get('/recommendations', authMiddleware, async (req, res) => {
  try {
    const { cvId } = req.query;

    if (!cvId) {
      return res.status(400).json({ error: 'CV ID required' });
    }

    // Return mock jobs
    res.json({
      data: mockJobs,
      total: mockJobs.length,
    });

  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get single job
router.get('/:jobId', authMiddleware, async (req, res) => {
  try {
    const job = mockJobs.find(j => j.id === req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);

  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

module.exports = router;