// routes/admin.js
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

// GET /api/admin/stats — dashboard summary
router.get('/stats', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const todayRevenue = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
    FROM orders
    WHERE date(placed_at) = ? AND payment_status IN ('paid', 'pending')
  `).get(today);

  const last7DaysRevenue = db.prepare(`
    SELECT date(placed_at) AS day, COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
    FROM orders
    WHERE placed_at >= datetime('now', '-7 days')
    GROUP BY date(placed_at)
    ORDER BY day
  `).all();

  const activeOrders = db.prepare(`
    SELECT COUNT(*) AS count FROM orders
    WHERE status NOT IN ('delivered', 'ready', 'cancelled')
  `).get();

  const topItems = db.prepare(`
    SELECT name, SUM(qty) AS total_qty, SUM(qty * price) AS total_revenue
    FROM order_items
    GROUP BY name
    ORDER BY total_qty DESC
    LIMIT 5
  `).all();

  const lowStock = db.prepare(`
    SELECT id, name, stock FROM menu_items
    WHERE stock IS NOT NULL AND stock <= 5
    ORDER BY stock ASC
  `).all();

  res.json({
    todayRevenue: todayRevenue.total,
    todayOrderCount: todayRevenue.count,
    activeOrders: activeOrders.count,
    last7Days: last7DaysRevenue,
    topItems,
    lowStock,
  });
});

module.exports = router;
