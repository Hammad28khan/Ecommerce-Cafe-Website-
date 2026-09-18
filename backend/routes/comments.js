// routes/comments.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const router = express.Router();

const postLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });

// GET /api/comments — public, newest first
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM comments ORDER BY created_at DESC LIMIT 100').all();
  res.json(rows);
});

// POST /api/comments — public
router.post('/', postLimiter, (req, res) => {
  const { authorName, body } = req.body || {};
  const name = (authorName || '').trim();
  const text = (body || '').trim();
  if (!name || !text) {
    return res.status(400).json({ error: 'authorName and body are required.' });
  }
  if (text.length > 500) {
    return res.status(400).json({ error: 'Comment is too long (max 500 characters).' });
  }
  const info = db.prepare('INSERT INTO comments (author_name, body) VALUES (?, ?)').run(name, text);
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(comment);
});

// POST /api/comments/:id/like — public, simple increment (no per-user tracking without accounts)
router.post('/:id/like', (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });
  db.prepare('UPDATE comments SET likes = likes + 1 WHERE id = ?').run(comment.id);
  const updated = db.prepare('SELECT * FROM comments WHERE id = ?').get(comment.id);
  res.json(updated);
});

// DELETE /api/comments/:id — public in the original frontend (author-only in practice);
// left open here to match existing behavior, but consider protecting with requireAdmin later.
router.delete('/:id', (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
  res.status(204).send();
});

module.exports = router;
