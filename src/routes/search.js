const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

// GET /?q=query - Global search across all entities
router.get('/', (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json({ results: [] });
    const like = `%${q}%`;
    const limit = parseInt(req.query.limit) || 20;

    const results = [];

    // Work Orders
    const wos = db.prepare("SELECT id, title, 'work_order' AS type, status, priority FROM work_orders WHERE title LIKE ? OR description LIKE ? LIMIT ?").all(like, like, 5);
    wos.forEach(wo => results.push({ ...wo, label: wo.title, route: `#/workorders/${wo.id}`, icon: 'clipboard-list' }));

    // Properties
    const props = db.prepare("SELECT id, name, 'property' AS type, address FROM properties WHERE name LIKE ? OR address LIKE ? LIMIT ?").all(like, like, 5);
    props.forEach(p => results.push({ ...p, label: p.name, route: `#/properties/${p.id}`, icon: 'building-2' }));

    // Assets
    const assets = db.prepare("SELECT id, name, 'asset' AS type, category, status FROM assets WHERE name LIKE ? OR category LIKE ? OR serial_number LIKE ? LIMIT ?").all(like, like, like, 5);
    assets.forEach(a => results.push({ ...a, label: a.name, route: `#/assets/${a.id}`, icon: 'wrench' }));

    // Parts
    const parts = db.prepare("SELECT id, name, 'part' AS type, sku, category FROM parts WHERE name LIKE ? OR sku LIKE ? LIMIT ?").all(like, like, 5);
    parts.forEach(p => results.push({ ...p, label: p.name, route: `#/parts/${p.id}`, icon: 'package' }));

    // Teams
    const teams = db.prepare("SELECT id, name, 'team' AS type FROM teams WHERE name LIKE ? LIMIT ?").all(like, 3);
    teams.forEach(t => results.push({ ...t, label: t.name, route: `#/teams/${t.id}`, icon: 'users' }));

    // Vendors
    const vendors = db.prepare("SELECT id, name, 'vendor' AS type, specialty FROM vendors WHERE (name LIKE ? OR specialty LIKE ?) AND is_active = 1 LIMIT ?").all(like, like, 3);
    vendors.forEach(v => results.push({ ...v, label: v.name, route: `#/vendors/${v.id}`, icon: 'truck' }));

    // Users
    const users = db.prepare("SELECT id, name, 'user' AS type, email, role FROM users WHERE (name LIKE ? OR email LIKE ?) AND is_active = 1 LIMIT ?").all(like, like, 3);
    users.forEach(u => results.push({ ...u, label: u.name, route: `#/settings`, icon: 'user' }));

    // Procedures
    const procs = db.prepare("SELECT id, title AS name, 'procedure' AS type FROM procedures WHERE title LIKE ? LIMIT ?").all(like, 3);
    procs.forEach(p => results.push({ ...p, label: p.name, route: `#/procedures/${p.id}`, icon: 'clipboard-check' }));

    res.json({ results: results.slice(0, limit), total: results.length });
  } catch (err) {
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
});

module.exports = router;
