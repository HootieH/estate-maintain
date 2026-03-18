const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET /
router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT p.*,
        (SELECT COUNT(*) FROM assets a WHERE a.property_id = p.id) AS asset_count,
        (SELECT COUNT(*) FROM work_orders wo WHERE wo.property_id = p.id AND wo.status IN ('open','in_progress','on_hold')) AS open_work_order_count
      FROM properties p
    `;
    const conditions = [];
    const params = [];

    if (req.query.team_id) {
      conditions.push('p.team_id = ?');
      params.push(req.query.team_id);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY p.name';
    const properties = db.prepare(sql).all(...params);
    res.json(properties);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch properties', details: err.message });
  }
});

// GET /:id
router.get('/:id', (req, res) => {
  try {
    const property = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM assets a WHERE a.property_id = p.id) AS asset_count,
        (SELECT COUNT(*) FROM work_orders wo WHERE wo.property_id = p.id AND wo.status IN ('open','in_progress','on_hold')) AS open_work_order_count
      FROM properties p WHERE p.id = ?
    `).get(req.params.id);

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    res.json(property);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch property', details: err.message });
  }
});

// POST /
router.post('/', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { name, address, type, notes, team_id, image_url } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Property name is required' });
    }

    const result = db.prepare(
      'INSERT INTO properties (name, address, type, notes, team_id, image_url) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, address || null, type || 'estate', notes || null, team_id || null, image_url || null);

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid);
    logActivity('property', property.id, 'created', `Property "${name}" created`, req.user.id);

    res.status(201).json(property);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create property', details: err.message });
  }
});

// PUT /:id
router.put('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const { name, address, type, notes, team_id, image_url } = req.body;

    db.prepare(`
      UPDATE properties SET name = ?, address = ?, type = ?, notes = ?, team_id = ?, image_url = ?
      WHERE id = ?
    `).run(
      name || existing.name,
      address !== undefined ? address : existing.address,
      type || existing.type,
      notes !== undefined ? notes : existing.notes,
      team_id !== undefined ? team_id : existing.team_id,
      image_url !== undefined ? image_url : existing.image_url,
      req.params.id
    );

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    logActivity('property', property.id, 'updated', `Property "${property.name}" updated`, req.user.id);

    res.json(property);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update property', details: err.message });
  }
});

// DELETE /:id
router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Property not found' });
    }

    db.prepare('DELETE FROM properties WHERE id = ?').run(req.params.id);
    logActivity('property', parseInt(req.params.id), 'deleted', `Property "${existing.name}" deleted`, req.user.id);

    res.json({ message: 'Property deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete property', details: err.message });
  }
});

module.exports = router;
