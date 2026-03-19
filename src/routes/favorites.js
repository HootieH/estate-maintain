const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

// GET / - List user's favorites
router.get('/', (req, res) => {
  try {
    const favorites = db.prepare('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    // Enrich with entity names
    const enriched = favorites.map(f => {
      let name = '';
      try {
        if (f.entity_type === 'work_order') {
          const wo = db.prepare('SELECT title FROM work_orders WHERE id = ?').get(f.entity_id);
          name = wo ? wo.title : 'Deleted';
        } else if (f.entity_type === 'property') {
          const p = db.prepare('SELECT name FROM properties WHERE id = ?').get(f.entity_id);
          name = p ? p.name : 'Deleted';
        } else if (f.entity_type === 'asset') {
          const a = db.prepare('SELECT name FROM assets WHERE id = ?').get(f.entity_id);
          name = a ? a.name : 'Deleted';
        }
      } catch (e) { /* ignore */ }
      return { ...f, entity_name: name };
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch favorites', details: err.message });
  }
});

// POST / - Add favorite
router.post('/', (req, res) => {
  try {
    const { entity_type, entity_id } = req.body;
    if (!entity_type || !entity_id) return res.status(400).json({ error: 'entity_type and entity_id are required' });
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, entity_type, entity_id) VALUES (?, ?, ?)').run(req.user.id, entity_type, entity_id);
    res.status(201).json({ message: 'Added to favorites' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add favorite', details: err.message });
  }
});

// DELETE /:type/:id - Remove favorite
router.delete('/:type/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND entity_type = ? AND entity_id = ?').run(req.user.id, req.params.type, req.params.id);
    res.json({ message: 'Removed from favorites' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove favorite', details: err.message });
  }
});

// GET /check/:type/:id - Check if favorited
router.get('/check/:type/:id', (req, res) => {
  try {
    const fav = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND entity_type = ? AND entity_id = ?').get(req.user.id, req.params.type, req.params.id);
    res.json({ favorited: !!fav });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check favorite', details: err.message });
  }
});

module.exports = router;
