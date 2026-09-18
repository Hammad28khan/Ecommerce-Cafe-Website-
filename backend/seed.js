// seed.js
// Run with: npm run seed
// - Seeds menu_items from data/menu-seed.json (extracted from the existing frontend)
// - Creates a default OWNER admin account (change the password immediately after first login)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

function seedMenu() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM menu_items').get().c;
  if (count > 0) {
    console.log(`menu_items already has ${count} rows — skipping menu seed.`);
    return;
  }
  const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'menu-seed.json'), 'utf-8'));
  const insert = db.prepare(`
    INSERT INTO menu_items (name, category, price, original_price, description, image_url, icon, avg_rating, rating_count, combo_config)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of items) {
    insert.run(
      item.name, item.category, item.price, item.original_price ?? null,
      item.description || null, item.image_url || null, item.icon || null,
      item.avg_rating ?? 0, item.rating_count ?? 0,
      item.combo_config ? JSON.stringify(item.combo_config) : null
    );
  }
  console.log(`Seeded ${items.length} menu items.`);
}

function seedAdmin() {
  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get('owner@brewandbliss.local');
  if (existing) {
    console.log('Default owner admin already exists — skipping.');
    return;
  }
  const defaultPassword = process.env.DEFAULT_OWNER_PASSWORD || 'ChangeMe123!';
  const hash = bcrypt.hashSync(defaultPassword, 10);
  db.prepare(`
    INSERT INTO admins (name, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `).run('Owner', 'owner@brewandbliss.local', hash, 'owner');
  console.log('Created default owner admin:');
  console.log('  email:    owner@brewandbliss.local');
  console.log(`  password: ${defaultPassword}`);
  console.log('  >>> Log in and change this password immediately in production. <<<');
}

seedMenu();
seedAdmin();
console.log('Seeding complete.');
