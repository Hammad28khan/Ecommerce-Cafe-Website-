// clear-orders.js
// Run with: npm run clear-orders
// Deletes ALL orders and order items — leaves your menu, comments, and
// admin login untouched. Use this to wipe out test orders before going live,
// or just to start your order history fresh.
require('dotenv').config();
const db = require('./db');

const orderCount = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;

if (orderCount === 0) {
  console.log('No orders to clear.');
  process.exit(0);
}

db.exec('DELETE FROM order_items;');
db.exec('DELETE FROM orders;');

console.log(`Cleared ${orderCount} order(s) and their line items.`);
console.log('Menu items, comments, and admin logins were left untouched.');
