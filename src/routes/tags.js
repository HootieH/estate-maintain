const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

// GET / - List all tags
router.get('/', (req, res) => {
  try {
    const tags = db.prepare('SELECT * FROM tags ORDER BY name').all();
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tags', details: err.message });
  }
});

// POST / - Create tag
router.post('/', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Tag name is required' });
    const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name.trim(), color || '#6B7280');
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(tag);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Tag already exists' });
    res.status(500).json({ error: 'Failed to create tag', details: err.message });
  }
});

// DELETE /:id
router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
    res.json({ message: 'Tag deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete tag', details: err.message });
  }
});

// POST /assign - Assign tag to entity
router.post('/assign', (req, res) => {
  try {
    const { tag_id, entity_type, entity_id } = req.body;
    if (!tag_id || !entity_type || !entity_id) return res.status(400).json({ error: 'tag_id, entity_type, and entity_id are required' });
    db.prepare('INSERT OR IGNORE INTO entity_tags (tag_id, entity_type, entity_id) VALUES (?, ?, ?)').run(tag_id, entity_type, entity_id);
    res.status(201).json({ message: 'Tag assigned' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign tag', details: err.message });
  }
});

// DELETE /assign - Remove tag from entity
router.delete('/assign', (req, res) => {
  try {
    const { tag_id, entity_type, entity_id } = req.body;
    db.prepare('DELETE FROM entity_tags WHERE tag_id = ? AND entity_type = ? AND entity_id = ?').run(tag_id, entity_type, entity_id);
    res.json({ message: 'Tag removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove tag', details: err.message });
  }
});

// GET /entity/:type/:id - Get tags for an entity
router.get('/entity/:type/:id', (req, res) => {
  try {
    const tags = db.prepare(`
      SELECT t.* FROM tags t
      JOIN entity_tags et ON t.id = et.tag_id
      WHERE et.entity_type = ? AND et.entity_id = ?
      ORDER BY t.name
    `).all(req.params.type, req.params.id);
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tags', details: err.message });
  }
});

module.exports = router;
