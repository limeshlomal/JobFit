// One-off convenience script to flip a user's plan until real payment
// collection exists. Usage:
//   npm run set-subscription -- someone@example.com premium
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/config/database');

async function main() {
  const [, , email, plan] = process.argv;

  if (!email || !plan) {
    console.log('Usage: node scripts/set-subscription.js <email> <free|premium>');
    process.exit(1);
  }

  if (!['free', 'premium'].includes(plan)) {
    console.log('Plan must be "free" or "premium"');
    process.exit(1);
  }

  const result = await pool.query(
    `UPDATE users SET subscription_type = $1, updated_at = NOW()
     WHERE email = $2
     RETURNING id, email, subscription_type`,
    [plan, email]
  );

  if (result.rows.length === 0) {
    console.log(`No user found with email "${email}"`);
  } else {
    console.log('Updated:', result.rows[0]);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
