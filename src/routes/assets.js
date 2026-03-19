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

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;

    let countSql = `SELECT COUNT(*) as total FROM assets a`;
    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
    }
    const { total } = db.prepare(countSql).get(...params);

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const assets = db.prepare(sql).all(...params);
    res.json({
      data: assets,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
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

    // Active downtime
    const activeDowntime = db.prepare('SELECT * FROM asset_downtime WHERE asset_id = ? AND ended_at IS NULL').get(req.params.id);
    asset.active_downtime = activeDowntime || null;

    // Child assets
    const children = db.prepare('SELECT id, name, category, status FROM assets WHERE parent_asset_id = ?').all(req.params.id);
    asset.children = children;

    // Parent asset
    if (asset.parent_asset_id) {
      const parent = db.prepare('SELECT id, name FROM assets WHERE id = ?').get(asset.parent_asset_id);
      asset.parent_asset = parent || null;
    }

    res.json(asset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch asset', details: err.message });
  }
});

// POST /
router.post('/', requireRole('admin', 'manager', 'technician'), (req, res) => {
  try {
    const { name, category, property_id, location_id, location_description, make, model, serial_number, install_date, warranty_expiry, status, notes } = req.body;

    if (!name || !category || !property_id) {
      return res.status(400).json({ error: 'Name, category, and property_id are required' });
    }

    const result = db.prepare(`
      INSERT INTO assets (name, category, property_id, location_id, location_description, make, model, serial_number, install_date, warranty_expiry, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, category, property_id,
      location_id || null, location_description || null, make || null, model || null,
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

    const { name, category, property_id, location_id, location_description, make, model, serial_number, install_date, warranty_expiry, status, notes } = req.body;

    db.prepare(`
      UPDATE assets SET name = ?, category = ?, property_id = ?, location_id = ?, location_description = ?, make = ?, model = ?,
        serial_number = ?, install_date = ?, warranty_expiry = ?, status = ?, notes = ?
      WHERE id = ?
    `).run(
      name || existing.name,
      category || existing.category,
      property_id || existing.property_id,
      location_id !== undefined ? (location_id || null) : existing.location_id,
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

// POST /:id/downtime - Start downtime tracking
router.post('/:id/downtime', (req, res) => {
  try {
    const asset = db.prepare('SELECT id FROM assets WHERE id = ?').get(req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    // Check if there's an active downtime (no ended_at)
    const active = db.prepare('SELECT id FROM asset_downtime WHERE asset_id = ? AND ended_at IS NULL').get(req.params.id);
    if (active) return res.status(400).json({ error: 'Asset already has active downtime' });

    const { reason, category, work_order_id } = req.body;
    const result = db.prepare(
      'INSERT INTO asset_downtime (asset_id, reason, category, work_order_id, reported_by) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.id, reason || null, category || 'breakdown', work_order_id || null, req.user.id);

    // Update asset status
    db.prepare("UPDATE assets SET status = 'out_of_service' WHERE id = ?").run(req.params.id);
    logActivity('asset', parseInt(req.params.id), 'downtime_started', `Downtime started: ${reason || 'No reason given'}`, req.user.id);

    const entry = db.prepare('SELECT * FROM asset_downtime WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to start downtime', details: err.message });
  }
});

// PUT /:id/downtime/end - End active downtime
router.put('/:id/downtime/end', (req, res) => {
  try {
    const active = db.prepare('SELECT * FROM asset_downtime WHERE asset_id = ? AND ended_at IS NULL').get(req.params.id);
    if (!active) return res.status(404).json({ error: 'No active downtime found' });

    db.prepare('UPDATE asset_downtime SET ended_at = CURRENT_TIMESTAMP WHERE id = ?').run(active.id);
    db.prepare("UPDATE assets SET status = 'operational' WHERE id = ?").run(req.params.id);
    logActivity('asset', parseInt(req.params.id), 'downtime_ended', 'Downtime ended', req.user.id);

    const updated = db.prepare('SELECT * FROM asset_downtime WHERE id = ?').get(active.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to end downtime', details: err.message });
  }
});

// GET /:id/downtime - Get downtime history
router.get('/:id/downtime', (req, res) => {
  try {
    const history = db.prepare(`
      SELECT ad.*, u.name AS reported_by_name
      FROM asset_downtime ad
      LEFT JOIN users u ON ad.reported_by = u.id
      WHERE ad.asset_id = ? ORDER BY ad.started_at DESC LIMIT 50
    `).all(req.params.id);

    // Calculate total downtime hours
    let totalHours = 0;
    history.forEach(d => {
      const end = d.ended_at ? new Date(d.ended_at) : new Date();
      const start = new Date(d.started_at);
      totalHours += (end - start) / (1000 * 60 * 60);
    });

    res.json({ history, totalHours: Math.round(totalHours * 10) / 10 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch downtime', details: err.message });
  }
});

// GET /:id/children - Get child assets
router.get('/:id/children', (req, res) => {
  try {
    const children = db.prepare('SELECT * FROM assets WHERE parent_asset_id = ?').all(req.params.id);
    res.json(children);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch child assets', details: err.message });
  }
});

module.exports = router;
