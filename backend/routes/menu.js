// routes/menu.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const rateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// menu_items stores combo_config as a raw JSON string — parse it back into
// an object for API responses so the frontend doesn't have to.
function withParsedCombo(row) {
  if (!row) return row;
  let combo_config = null;
  if (row.combo_config) {
    try { combo_config = JSON.parse(row.combo_config); } catch { combo_config = null; }
  }
  return { ...row, combo_config };
}

// GET /api/menu — public, only available items
router.get('/', (req, res) => {
  const { category } = req.query;
  let rows;
  if (category) {
    rows = db.prepare('SELECT * FROM menu_items WHERE is_available = 1 AND category = ? ORDER BY id').all(category);
  } else {
    rows = db.prepare('SELECT * FROM menu_items WHERE is_available = 1 ORDER BY id').all();
  }
  res.json(rows.map(withParsedCombo));
});

// GET /api/menu/all — admin, includes unavailable/out-of-stock items
router.get('/all', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM menu_items ORDER BY id').all();
  res.json(rows.map(withParsedCombo));
});

// Basic shape validation for combo_config — doesn't check the category names
// against real data (that's checked live at order time instead, since the
// menu can change), just that the structure itself makes sense.
function validateComboConfig(combo_config) {
  if (combo_config === undefined || combo_config === null) return null;
  if (typeof combo_config !== 'object' || !Array.isArray(combo_config.slots)) {
    throw new Error('combo_config must be an object with a "slots" array.');
  }
  for (const slot of combo_config.slots) {
    if (!slot.label || !slot.category) {
      throw new Error('Each combo slot needs a "label" and a "category".');
    }
    if (slot.nameContains && !Array.isArray(slot.nameContains)) {
      throw new Error('slot.nameContains must be an array of strings if provided.');
    }
  }
  return combo_config;
}

// POST /api/menu — admin, create item
router.post('/', requireAdmin, (req, res) => {
  const { name, category, price, original_price, description, image_url, icon, stock, combo_config } = req.body || {};
  if (!name || typeof price !== 'number' || price <= 0) {
    return res.status(400).json({ error: 'name and a positive numeric price are required.' });
  }
  if (original_price !== undefined && original_price !== null && original_price <= price) {
    return res.status(400).json({ error: 'original_price must be greater than price (it\'s the "was" price).' });
  }
  let validCombo;
  try {
    validCombo = validateComboConfig(combo_config);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const info = db.prepare(`
    INSERT INTO menu_items (name, category, price, original_price, description, image_url, icon, stock, combo_config)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, category || 'coffee', price, original_price ?? null, description || null,
    image_url || null, icon || null, stock ?? null,
    validCombo ? JSON.stringify(validCombo) : null
  );

  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(withParsedCombo(item));
});

// PUT /api/menu/:id — admin, update item (price changes, availability toggle, stock, etc.)
router.put('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Menu item not found.' });

  const fields = ['name', 'category', 'price', 'original_price', 'description', 'image_url', 'icon', 'is_available', 'stock'];
  const updates = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  const merged = { ...existing, ...updates };

  if (merged.original_price !== null && merged.original_price !== undefined && merged.original_price <= merged.price) {
    return res.status(400).json({ error: 'original_price must be greater than price (it\'s the "was" price).' });
  }

  // combo_config is handled separately since it needs JSON parsing/validation,
  // and "undefined" (field omitted) should mean "leave unchanged", not "clear it".
  let comboConfigToStore = existing.combo_config; // unchanged by default
  if (req.body.combo_config !== undefined) {
    try {
      const validCombo = validateComboConfig(req.body.combo_config);
      comboConfigToStore = validCombo ? JSON.stringify(validCombo) : null;
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  db.prepare(`
    UPDATE menu_items
    SET name = ?, category = ?, price = ?, original_price = ?, description = ?, image_url = ?, icon = ?, is_available = ?, stock = ?, combo_config = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    merged.name, merged.category, merged.price, merged.original_price ?? null, merged.description,
    merged.image_url, merged.icon, merged.is_available ? 1 : 0, merged.stock, comboConfigToStore, id
  );

  const updated = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  res.json(withParsedCombo(updated));
});

// POST /api/menu/:id/rate — public. A visitor submits (or updates) a 1-5 star rating.
// raterToken is a random ID the browser generates once and stores in localStorage —
// it's how a repeat visitor updates their own rating instead of it counting twice.
// This isn't bulletproof against someone clearing localStorage to vote again, but it
// matches what most sites without full accounts do, and stops accidental double-clicks
// or page-refresh double-counts.
router.post('/:id/rate', rateLimiter, (req, res) => {
  const { id } = req.params;
  const { rating, raterToken } = req.body || {};

  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'Menu item not found.' });

  const stars = Number(rating);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'rating must be a whole number from 1 to 5.' });
  }
  if (!raterToken || typeof raterToken !== 'string' || raterToken.length < 8) {
    return res.status(400).json({ error: 'A valid raterToken is required.' });
  }

  const existingVote = db.prepare(
    'SELECT * FROM ratings WHERE menu_item_id = ? AND rater_token = ?'
  ).get(id, raterToken);

  if (existingVote) {
    // This browser already rated this item — update their vote instead of adding a new one.
    // Average shifts by (new - old) / count; the count itself doesn't change.
    if (existingVote.rating !== stars) {
      db.prepare(
        `UPDATE ratings SET rating = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(stars, existingVote.id);

      const newAvg = item.rating_count > 0
        ? (item.avg_rating * item.rating_count - existingVote.rating + stars) / item.rating_count
        : stars;

      db.prepare(
        `UPDATE menu_items SET avg_rating = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(newAvg, id);
    }
  } else {
    // A brand-new voter for this item.
    db.prepare(
      'INSERT INTO ratings (menu_item_id, rating, rater_token) VALUES (?, ?, ?)'
    ).run(id, stars, raterToken);

    const newCount = item.rating_count + 1;
    const newAvg = (item.avg_rating * item.rating_count + stars) / newCount;

    db.prepare(
      `UPDATE menu_items SET avg_rating = ?, rating_count = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(newAvg, newCount, id);
  }

  const updated = db.prepare('SELECT id, avg_rating, rating_count FROM menu_items WHERE id = ?').get(id);
  res.json({ ...updated, your_rating: stars });
});

// DELETE /api/menu/:id — admin
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Menu item not found.' });
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
  res.status(204).send();
});

module.exports = router;
