const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET /
router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT a.*, p.name AS property_name
      FROM assets a
      LEFT JOIN properties p ON a.property_id = p.id
    `;
    const conditions = [];
    const params = [];

    if (req.query.property_id) {
      conditions.push('a.property_id = ?');
      params.push(req.query.property_id);
    }
    if (req.query.status) {
      conditions.push('a.status = ?');
      params.push(req.query.status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY a.name';
    const assets = db.prepare(sql).all(...params);
    res.json(assets);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch assets', details: err.message });
  }
});

// GET /:id
router.get('/:id', (req, res) => {
  try {
    const asset = db.prepare(`
      SELECT a.*, p.name AS property_name
      FROM assets a
      LEFT JOIN properties p ON a.property_id = p.id
      WHERE a.id = ?
    `).get(req.params.id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json(asset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch asset', details: err.message });
  }
});

// POST /
router.post('/', requireRole('admin', 'manager', 'technician'), (req, res) => {
  try {
    const { name, category, property_id, location_description, make, model, serial_number, install_date, warranty_expiry, status, notes } = req.body;

    if (!name || !category || !property_id) {
      return res.status(400).json({ error: 'Name, category, and property_id are required' });
    }

    const result = db.prepare(`
      INSERT INTO assets (name, category, property_id, location_description, make, model, serial_number, install_date, warranty_expiry, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, category, property_id,
      location_description || null, make || null, model || null,
      serial_number || null, install_date || null, warranty_expiry || null,
      status || 'operational', notes || null
    );

    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(result.lastInsertRowid);
    logActivity('asset', asset.id, 'created', `Asset "${name}" created`, req.user.id);

    res.status(201).json(asset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create asset', details: err.message });
  }
});

// PUT /:id
router.put('/:id', requireRole('admin', 'manager', 'technician'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const { name, category, property_id, location_description, make, model, serial_number, install_date, warranty_expiry, status, notes } = req.body;

    db.prepare(`
      UPDATE assets SET name = ?, category = ?, property_id = ?, location_description = ?, make = ?, model = ?,
        serial_number = ?, install_date = ?, warranty_expiry = ?, status = ?, notes = ?
      WHERE id = ?
    `).run(
      name || existing.name,
      category || existing.category,
      property_id || existing.property_id,
      location_description !== undefined ? location_description : existing.location_description,
      make !== undefined ? make : existing.make,
      model !== undefined ? model : existing.model,
      serial_number !== undefined ? serial_number : existing.serial_number,
      install_date !== undefined ? install_date : existing.install_date,
      warranty_expiry !== undefined ? warranty_expiry : existing.warranty_expiry,
      status || existing.status,
      notes !== undefined ? notes : existing.notes,
      req.params.id
    );

    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
    logActivity('asset', asset.id, 'updated', `Asset "${asset.name}" updated`, req.user.id);

    res.json(asset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update asset', details: err.message });
  }
});

// DELETE /:id
router.delete('/:id', requireRole('admin', 'manager', 'technician'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
    logActivity('asset', parseInt(req.params.id), 'deleted', `Asset "${existing.name}" deleted`, req.user.id);

    res.json({ message: 'Asset deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete asset', details: err.message });
  }
});

module.exports = router;
