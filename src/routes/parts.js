const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET /
router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT pt.*, p.name AS property_name
      FROM parts pt
      LEFT JOIN properties p ON pt.property_id = p.id
    `;
    const conditions = [];
    const params = [];

    if (req.query.property_id) {
      conditions.push('pt.property_id = ?');
      params.push(req.query.property_id);
    }
    if (req.query.low_stock === 'true') {
      conditions.push('pt.quantity <= pt.min_quantity');
    }
    if (req.query.search) {
      conditions.push('(pt.name LIKE ? OR pt.sku LIKE ?)');
      params.push(`%${req.query.search}%`, `%${req.query.search}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY pt.name';
    const parts = db.prepare(sql).all(...params);
    res.json(parts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch parts', details: err.message });
  }
});

// GET /:id
router.get('/:id', (req, res) => {
  try {
    const part = db.prepare(`
      SELECT pt.*, p.name AS property_name
      FROM parts pt
      LEFT JOIN properties p ON pt.property_id = p.id
      WHERE pt.id = ?
    `).get(req.params.id);

    if (!part) {
      return res.status(404).json({ error: 'Part not found' });
    }

    res.json(part);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch part', details: err.message });
  }
});

// POST /
router.post('/', (req, res) => {
  try {
    const { name, sku, category, quantity, min_quantity, unit_cost, location, property_id, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Part name is required' });
    }

    const result = db.prepare(`
      INSERT INTO parts (name, sku, category, quantity, min_quantity, unit_cost, location, property_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, sku || null, category || null,
      quantity || 0, min_quantity || 0, unit_cost || 0,
      location || null, property_id || null, notes || null
    );

    const part = db.prepare('SELECT * FROM parts WHERE id = ?').get(result.lastInsertRowid);
    logActivity('part', part.id, 'created', `Part "${name}" created`, req.user.id);

    res.status(201).json(part);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create part', details: err.message });
  }
});

// PUT /:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Part not found' });
    }

    const { name, sku, category, quantity, min_quantity, unit_cost, location, property_id, notes } = req.body;

    db.prepare(`
      UPDATE parts SET name = ?, sku = ?, category = ?, quantity = ?, min_quantity = ?,
        unit_cost = ?, location = ?, property_id = ?, notes = ?
      WHERE id = ?
    `).run(
      name || existing.name,
      sku !== undefined ? sku : existing.sku,
      category !== undefined ? category : existing.category,
      quantity !== undefined ? quantity : existing.quantity,
      min_quantity !== undefined ? min_quantity : existing.min_quantity,
      unit_cost !== undefined ? unit_cost : existing.unit_cost,
      location !== undefined ? location : existing.location,
      property_id !== undefined ? property_id : existing.property_id,
      notes !== undefined ? notes : existing.notes,
      req.params.id
    );

    const part = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
    logActivity('part', part.id, 'updated', `Part "${part.name}" updated`, req.user.id);

    res.json(part);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update part', details: err.message });
  }
});

// PUT /:id/adjust
router.put('/:id/adjust', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Part not found' });
    }

    const { adjustment, reason } = req.body;
    if (adjustment === undefined || typeof adjustment !== 'number') {
      return res.status(400).json({ error: 'Adjustment amount is required and must be a number' });
    }

    const newQuantity = existing.quantity + adjustment;
    if (newQuantity < 0) {
      return res.status(400).json({ error: 'Adjustment would result in negative quantity' });
    }

    db.prepare('UPDATE parts SET quantity = ? WHERE id = ?').run(newQuantity, req.params.id);

    const direction = adjustment > 0 ? 'added' : 'removed';
    logActivity('part', existing.id, 'adjusted', `${Math.abs(adjustment)} ${direction} (${reason || 'no reason'})`, req.user.id);

    const part = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
    res.json(part);
  } catch (err) {
    res.status(500).json({ error: 'Failed to adjust part quantity', details: err.message });
  }
});

// DELETE /:id
router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Part not found' });
    }

    db.prepare('DELETE FROM parts WHERE id = ?').run(req.params.id);
    logActivity('part', parseInt(req.params.id), 'deleted', `Part "${existing.name}" deleted`, req.user.id);

    res.json({ message: 'Part deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete part', details: err.message });
  }
});

module.exports = router;
