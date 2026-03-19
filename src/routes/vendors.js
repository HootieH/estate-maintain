const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET /
router.get('/', (req, res) => {
  try {
    let sql = 'SELECT * FROM vendors';
    const conditions = [];
    const params = [];

    if (req.query.search) {
      conditions.push('(name LIKE ? OR contact_name LIKE ? OR email LIKE ? OR specialty LIKE ?)');
      const term = `%${req.query.search}%`;
      params.push(term, term, term, term);
    }
    if (req.query.is_active !== undefined) {
      conditions.push('is_active = ?');
      params.push(req.query.is_active);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY name';

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;

    let countSql = `SELECT COUNT(*) as total FROM vendors`;
    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
    }
    const { total } = db.prepare(countSql).get(...params);

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const vendors = db.prepare(sql).all(...params);
    res.json({
      data: vendors,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vendors', details: err.message });
  }
});

// GET /:id
router.get('/:id', (req, res) => {
  try {
    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const purchaseOrders = db.prepare(`
      SELECT po.*, p.name AS property_name
      FROM purchase_orders po
      LEFT JOIN properties p ON po.property_id = p.id
      WHERE po.vendor_id = ?
      ORDER BY po.created_at DESC
    `).all(req.params.id);

    res.json({ ...vendor, purchase_orders: purchaseOrders });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vendor', details: err.message });
  }
});

// POST /
router.post('/', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { name, contact_name, email, phone, address, specialty, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Vendor name is required' });
    }

    const result = db.prepare(`
      INSERT INTO vendors (name, contact_name, email, phone, address, specialty, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, contact_name || null, email || null, phone || null,
      address || null, specialty || null, notes || null
    );

    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(result.lastInsertRowid);
    logActivity('vendor', vendor.id, 'created', `Vendor "${name}" created`, req.user.id);

    res.status(201).json(vendor);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create vendor', details: err.message });
  }
});

// PUT /:id
router.put('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const { name, contact_name, email, phone, address, specialty, notes } = req.body;

    db.prepare(`
      UPDATE vendors SET name = ?, contact_name = ?, email = ?, phone = ?,
        address = ?, specialty = ?, notes = ?
      WHERE id = ?
    `).run(
      name || existing.name,
      contact_name !== undefined ? contact_name : existing.contact_name,
      email !== undefined ? email : existing.email,
      phone !== undefined ? phone : existing.phone,
      address !== undefined ? address : existing.address,
      specialty !== undefined ? specialty : existing.specialty,
      notes !== undefined ? notes : existing.notes,
      req.params.id
    );

    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
    logActivity('vendor', vendor.id, 'updated', `Vendor "${vendor.name}" updated`, req.user.id);

    res.json(vendor);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update vendor', details: err.message });
  }
});

// DELETE /:id — soft delete
router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    db.prepare('UPDATE vendors SET is_active = 0 WHERE id = ?').run(req.params.id);
    logActivity('vendor', parseInt(req.params.id), 'deactivated', `Vendor "${existing.name}" deactivated`, req.user.id);

    res.json({ message: 'Vendor deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate vendor', details: err.message });
  }
});

module.exports = router;
