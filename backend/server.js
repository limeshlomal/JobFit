const app = require('./src/app');
const pool = require('./src/config/database');

const PORT = process.env.PORT || 5000;

// Test database connection
pool.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('✗ Database connection failed:', err);
    process.exit(1);
  } else {
    console.log('✓ Database connection successful');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
    });
  }
});