// set-admin-password.js
// Run with: npm run set-admin-password -- your-email@example.com YourNewPassword123
//
// Changes an existing admin's password WITHOUT touching menu items, orders,
// comments, or ratings — unlike re-running the seed script, which only
// creates a default admin and won't overwrite one that already exists.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

const [, , email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.log('Usage: npm run set-admin-password -- <email> <new-password>');
  console.log('Example: npm run set-admin-password -- owner@brewandbliss.local MyRealPassword!42');
  process.exit(1);
}

if (newPassword.length < 8) {
  console.log('Please choose a password that is at least 8 characters long.');
  process.exit(1);
}

const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email.toLowerCase().trim());

if (!admin) {
  console.log(`No admin found with email "${email}".`);
  const all = db.prepare('SELECT email FROM admins').all();
  if (all.length) {
    console.log('Existing admin emails:', all.map(a => a.email).join(', '));
  }
  process.exit(1);
}

const hash = bcrypt.hashSync(newPassword, 10);
db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, admin.id);

console.log(`Password updated for ${admin.email}. Log in with the new password next time.`);
