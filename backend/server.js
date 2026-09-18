const app = require('./src/app');
const pool = require('./src/config/database');
const ensureSchema = require('./src/db/ensureSchema');

const PORT = process.env.PORT || 5000;

// Test database connection
pool.query('SELECT NOW()', async (err, result) => {
  if (err) {
    console.error('✗ Database connection failed:', err);
    process.exit(1);
  } else {
    console.log('✓ Database connection successful');

    try {
      await ensureSchema();
    } catch (schemaError) {
      console.error('✗ Schema check failed:', schemaError);
      process.exit(1);
    }

    // Start server
    app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
    });
  }
});