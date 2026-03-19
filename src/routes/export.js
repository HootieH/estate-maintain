const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

function toCSV(rows, columns) {
  if (!rows.length) return '';
  const cols = columns || Object.keys(rows[0]);
  const header = cols.join(',');
  const lines = rows.map(row => cols.map(c => {
    let val = row[c];
    if (val === null || val === undefined) val = '';
    val = String(val).replace(/"/g, '""');
    if (val.includes(',') || val.includes('"') || val.includes('\n')) val = `"${val}"`;
    return val;
  }).join(','));
  return header + '\n' + lines.join('\n');
}

// GET /work-orders
router.get('/work-orders', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT wo.id, wo.title, wo.description, wo.priority, wo.status, wo.category, wo.due_date, wo.completed_at, wo.created_at,
        p.name AS property, a.name AS asset, u.name AS assigned_to, t.name AS team
      FROM work_orders wo
      LEFT JOIN properties p ON wo.property_id = p.id
      LEFT JOIN assets a ON wo.asset_id = a.id
      LEFT JOIN users u ON wo.assigned_to = u.id
      LEFT JOIN teams t ON wo.assigned_team_id = t.id
      ORDER BY wo.created_at DESC
    `).all();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="work-orders.csv"');
    res.send(toCSV(rows));
  } catch (err) {
    res.status(500).json({ error: 'Export failed', details: err.message });
  }
});

// GET /assets
router.get('/assets', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT a.id, a.name, a.category, a.status, a.make, a.model, a.serial_number, a.install_date, a.warranty_expiry,
        p.name AS property, a.criticality, a.purchase_date, a.replacement_cost
      FROM assets a LEFT JOIN properties p ON a.property_id = p.id ORDER BY a.name
    `).all();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="assets.csv"');
    res.send(toCSV(rows));
  } catch (err) {
    res.status(500).json({ error: 'Export failed', details: err.message });
  }
});

// GET /parts
router.get('/parts', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.id, p.name, p.sku, p.category, p.quantity, p.min_quantity, p.reorder_point, p.unit_cost,
        pr.name AS property, v.name AS preferred_vendor
      FROM parts p
      LEFT JOIN properties pr ON p.property_id = pr.id
      LEFT JOIN vendors v ON p.preferred_vendor_id = v.id
      ORDER BY p.name
    `).all();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="parts.csv"');
    res.send(toCSV(rows));
  } catch (err) {
    res.status(500).json({ error: 'Export failed', details: err.message });
  }
});

// GET /preventive
router.get('/preventive', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT ps.id, ps.title, ps.frequency, ps.next_due, ps.last_completed, ps.priority, ps.is_active, ps.estimated_cost,
        p.name AS property, a.name AS asset
      FROM preventive_schedules ps
      LEFT JOIN properties p ON ps.property_id = p.id
      LEFT JOIN assets a ON ps.asset_id = a.id
      ORDER BY ps.next_due
    `).all();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="preventive-maintenance.csv"');
    res.send(toCSV(rows));
  } catch (err) {
    res.status(500).json({ error: 'Export failed', details: err.message });
  }
});

// GET /properties
router.get('/properties', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, name, address, type, year_built, square_footage, notes FROM properties ORDER BY name').all();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="properties.csv"');
    res.send(toCSV(rows));
  } catch (err) {
    res.status(500).json({ error: 'Export failed', details: err.message });
  }
});

// GET /vendors
router.get('/vendors', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, name, contact_name, email, phone, address, specialty FROM vendors WHERE is_active = 1 ORDER BY name').all();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vendors.csv"');
    res.send(toCSV(rows));
  } catch (err) {
    res.status(500).json({ error: 'Export failed', details: err.message });
  }
});

module.exports = router;
