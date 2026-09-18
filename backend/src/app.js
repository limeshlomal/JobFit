const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Import routes (we'll create these next)
const authRoutes = require('./routes/auth');
const cvRoutes = require('./routes/cvs');
const jobRoutes = require('./routes/jobs');
const applicationRoutes = require('./routes/applications');
const tailoringRoutes = require('./routes/tailoring');

// Use routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/cvs', cvRoutes);
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/applications', applicationRoutes);
app.use('/api/v1/tailoring', tailoringRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

module.exports = app;