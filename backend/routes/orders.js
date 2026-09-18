// routes/orders.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { processPayment } = require('../lib/mockPayment');

const router = express.Router();

const TAX_RATE = 0.08;
const DELIVERY_FEE = 2.5;

const VALID_STATUSES = ['placed', 'confirmed', 'preparing', 'on-the-way', 'ready', 'delivered', 'cancelled'];

function generateOrderId() {
  return 'BB-' + Math.floor(100000 + Math.random() * 900000);
}

// Validates a combo item's chosen sub-items against its combo_config rules —
// checked live against the current menu, so admin price/availability changes
// are always respected (never trust the client's own idea of what's valid).
function validateComboSelections(menuItem, comboSelections) {
  if (!menuItem.combo_config) return null; // not a combo item — nothing to validate

  let config;
  try {
    config = JSON.parse(menuItem.combo_config);
  } catch {
    return null; // malformed config on the server side — treat as no config rather than crash
  }
  if (!config || !Array.isArray(config.slots) || config.slots.length === 0) return null;

  if (!Array.isArray(comboSelections) || comboSelections.length !== config.slots.length) {
    throw new Error(
      `"${menuItem.name}" requires you to choose ${config.slots.length} item(s): ${config.slots.map(s => s.label).join(', ')}.`
    );
  }

  const chosenNames = [];
  for (let i = 0; i < config.slots.length; i++) {
    const slot = config.slots[i];
    const chosenName = String(comboSelections[i] || '').trim();
    if (!chosenName) {
      throw new Error(`Please choose an option for "${slot.label}" in "${menuItem.name}".`);
    }

    const candidate = db.prepare(
      `SELECT * FROM menu_items WHERE is_available = 1 AND category = ? AND TRIM(name) = TRIM(?) COLLATE NOCASE`
    ).get(slot.category, chosenName);

    if (!candidate) {
      throw new Error(`"${chosenName}" is not a valid, available choice for "${slot.label}" in "${menuItem.name}".`);
    }

    if (slot.nameContains && slot.nameContains.length > 0) {
      const nameLower = candidate.name.toLowerCase();
      const matches = slot.nameContains.some(kw => nameLower.includes(String(kw).toLowerCase()));
      if (!matches) {
        throw new Error(`"${candidate.name}" isn't one of the allowed options for "${slot.label}" in "${menuItem.name}".`);
      }
    }

    chosenNames.push(candidate.name);
  }

  return chosenNames;
}

const placeOrderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/orders — place a new order (guest checkout, no account required)
router.post('/', placeOrderLimiter, (req, res) => {
  const {
    items, deliveryMode, customerName, customerPhone, customerEmail,
    deliveryAddress, paymentMethod, cardNumber, upiId,
  } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must include at least one item.' });
  }
  if (!['delivery', 'pickup'].includes(deliveryMode)) {
    return res.status(400).json({ error: 'deliveryMode must be "delivery" or "pickup".' });
  }
  if (!['card', 'upi', 'cod'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'paymentMethod must be "card", "upi", or "cod".' });
  }
  if (deliveryMode === 'delivery' && !deliveryAddress) {
    return res.status(400).json({ error: 'deliveryAddress is required for delivery orders.' });
  }

  // Re-price against the DB — never trust client-sent prices.
  const menuStmt = db.prepare('SELECT * FROM menu_items WHERE id = ? AND is_available = 1');
  const resolvedItems = [];
  for (const it of items) {
    const qty = Number(it.qty) || 1;
    if (qty < 1) return res.status(400).json({ error: `Invalid quantity for item "${it.name}".` });

    let menuItem = null;
    if (it.menuItemId) menuItem = menuStmt.get(it.menuItemId);
    if (!menuItem && it.name) {
      const cleanName = String(it.name).trim();
      menuItem = db.prepare(
        `SELECT * FROM menu_items WHERE is_available = 1 AND TRIM(name) = TRIM(?) COLLATE NOCASE`
      ).get(cleanName);
    }
    if (!menuItem) {
      return res.status(400).json({ error: `Menu item "${it.name || it.menuItemId}" is unavailable or not found.` });
    }
    if (menuItem.stock !== null && menuItem.stock < qty) {
      return res.status(409).json({ error: `"${menuItem.name}" is out of stock.` });
    }

    let selections = null;
    try {
      selections = validateComboSelections(menuItem, it.comboSelections);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    resolvedItems.push({ menuItem, qty, selections });
  }

  const subtotal = resolvedItems.reduce((s, { menuItem, qty }) => s + menuItem.price * qty, 0);
  const deliveryFee = deliveryMode === 'delivery' ? DELIVERY_FEE : 0;
  const tax = subtotal * TAX_RATE;
  const total = subtotal + deliveryFee + tax;

  const payment = processPayment({ method: paymentMethod, cardNumber, upiId });
  if (!payment.success) {
    return res.status(402).json({ error: payment.reason || 'Payment failed.', paymentRef: payment.ref });
  }

  const orderId = generateOrderId();

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, customer_name, customer_phone, customer_email, delivery_mode, delivery_address,
      subtotal, delivery_fee, tax, total, payment_method, payment_status, payment_ref, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'placed')
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, menu_item_id, name, price, qty, selections) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const decrementStock = db.prepare(`
    UPDATE menu_items SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL
  `);

  insertOrder.run(
    orderId, customerName || null, customerPhone || null, customerEmail || null,
    deliveryMode, deliveryAddress || null, subtotal, deliveryFee, tax, total,
    paymentMethod, payment.status, payment.ref
  );
  for (const { menuItem, qty, selections } of resolvedItems) {
    insertItem.run(orderId, menuItem.id, menuItem.name, menuItem.price, qty, selections ? JSON.stringify(selections) : null);
    decrementStock.run(qty, menuItem.id);
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const orderItems = db.prepare('SELECT name, price, qty, selections FROM order_items WHERE order_id = ?').all(orderId)
    .map(i => ({ ...i, selections: i.selections ? JSON.parse(i.selections) : null }));

  res.status(201).json({ ...order, items: orderItems });
});

// GET /api/orders/:id — track a single order (public — order ID acts as the lookup secret)
router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id.toUpperCase());
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const items = db.prepare('SELECT name, price, qty, selections FROM order_items WHERE order_id = ?').all(order.id)
    .map(i => ({ ...i, selections: i.selections ? JSON.parse(i.selections) : null }));
  res.json({ ...order, items });
});

// GET /api/orders — admin, list/filter all orders
router.get('/', requireAdmin, (req, res) => {
  const { status, mode, from, to } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (mode) { sql += ' AND delivery_mode = ?'; params.push(mode); }
  if (from) { sql += ' AND placed_at >= ?'; params.push(from); }
  if (to) { sql += ' AND placed_at <= ?'; params.push(to); }
  sql += ' ORDER BY placed_at DESC LIMIT 200';
  const orders = db.prepare(sql).all(...params);

  const itemsStmt = db.prepare('SELECT name, price, qty, selections FROM order_items WHERE order_id = ?');
  const withItems = orders.map(order => ({
    ...order,
    items: itemsStmt.all(order.id).map(i => ({ ...i, selections: i.selections ? JSON.parse(i.selections) : null })),
  }));

  res.json(withItems);
});

// PATCH /api/orders/:id/status — admin, advance/cancel an order
router.patch('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id.toUpperCase());
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(status, order.id);

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  res.json(updated);
});

module.exports = router;
