const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET / — list locations (optionally filtered by property), supports tree format
router.get('/', (req, res) => {
  try {
    let sql = 'SELECT * FROM locations';
    const params = [];

    if (req.query.property_id) {
      sql += ' WHERE property_id = ?';
      params.push(req.query.property_id);
    }

    sql += ' ORDER BY name';
    const locations = db.prepare(sql).all(...params);

    if (req.query.format === 'tree') {
      const tree = buildTree(locations);
      return res.json(tree);
    }

    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch locations', details: err.message });
  }
});

// GET /:id — get location with children
router.get('/:id', (req, res) => {
  try {
    const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const children = db.prepare('SELECT * FROM locations WHERE parent_location_id = ? ORDER BY name').all(req.params.id);
    const assets = db.prepare('SELECT id, name, category, status FROM assets WHERE location_id = ?').all(req.params.id);

    // Build breadcrumb
    const breadcrumb = [];
    let current = location;
    while (current) {
      breadcrumb.unshift({ id: current.id, name: current.name });
      if (current.parent_location_id) {
        current = db.prepare('SELECT * FROM locations WHERE id = ?').get(current.parent_location_id);
      } else {
        current = null;
      }
    }

    // Linked procedures
    const procedures = db.prepare(`
      SELECT p.id, p.title, p.description, p.category,
        (SELECT COUNT(*) FROM procedure_steps WHERE procedure_id = p.id) AS step_count
      FROM procedures p
      JOIN location_procedures lp ON p.id = lp.procedure_id
      WHERE lp.location_id = ?
      ORDER BY p.title
    `).all(req.params.id);
    location.procedures = procedures;

    // Recent work orders for assets at this location
    const workOrders = db.prepare(`
      SELECT wo.id, wo.title, wo.status, wo.priority, wo.due_date, wo.created_at,
        a.name AS asset_name
      FROM work_orders wo
      JOIN assets a ON wo.asset_id = a.id
      WHERE a.location_id = ?
      ORDER BY wo.created_at DESC
      LIMIT 10
    `).all(req.params.id);
    location.work_orders = workOrders;

    res.json({ ...location, children, assets, breadcrumb });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch location', details: err.message });
  }
});

// POST / — create location
router.post('/', requireRole('admin', 'manager', 'technician'), (req, res) => {
  try {
    const { property_id, parent_location_id, name, description } = req.body;

    if (!property_id || !name) {
      return res.status(400).json({ error: 'property_id and name are required' });
    }

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(property_id);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    if (parent_location_id) {
      const parent = db.prepare('SELECT * FROM locations WHERE id = ?').get(parent_location_id);
      if (!parent) {
        return res.status(404).json({ error: 'Parent location not found' });
      }
    }

    const result = db.prepare(
      'INSERT INTO locations (property_id, parent_location_id, name, description) VALUES (?, ?, ?, ?)'
    ).run(property_id, parent_location_id || null, name, description || null);

    const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(result.lastInsertRowid);
    logActivity('location', location.id, 'created', `Location "${name}" created`, req.user.id);

    res.status(201).json(location);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create location', details: err.message });
  }
});

// PUT /:id — update location
router.put('/:id', requireRole('admin', 'manager', 'technician'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const { name, parent_location_id, description } = req.body;

    // Prevent setting parent to self
    if (parent_location_id && parseInt(parent_location_id) === parseInt(req.params.id)) {
      return res.status(400).json({ error: 'A location cannot be its own parent' });
    }

    db.prepare('UPDATE locations SET name = ?, parent_location_id = ?, description = ? WHERE id = ?').run(
      name || existing.name,
      parent_location_id !== undefined ? (parent_location_id || null) : existing.parent_location_id,
      description !== undefined ? description : existing.description,
      req.params.id
    );

    const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
    logActivity('location', location.id, 'updated', `Location "${location.name}" updated`, req.user.id);

    res.json(location);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update location', details: err.message });
  }
});

// DELETE /:id — delete location (only if no children/assets reference it)
router.delete('/:id', requireRole('admin', 'manager', 'technician'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const childCount = db.prepare('SELECT COUNT(*) AS count FROM locations WHERE parent_location_id = ?').get(req.params.id).count;
    if (childCount > 0) {
      return res.status(400).json({ error: 'Cannot delete location with sub-locations. Remove children first.' });
    }

    const assetCount = db.prepare('SELECT COUNT(*) AS count FROM assets WHERE location_id = ?').get(req.params.id).count;
    if (assetCount > 0) {
      return res.status(400).json({ error: 'Cannot delete location with assigned assets. Reassign assets first.' });
    }

    db.prepare('DELETE FROM locations WHERE id = ?').run(req.params.id);
    logActivity('location', parseInt(req.params.id), 'deleted', `Location "${existing.name}" deleted`, req.user.id);

    res.json({ message: 'Location deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete location', details: err.message });
  }
});

function buildTree(locations) {
  const map = {};
  const roots = [];

  locations.forEach(loc => {
    map[loc.id] = { ...loc, children: [] };
  });

  locations.forEach(loc => {
    if (loc.parent_location_id && map[loc.parent_location_id]) {
      map[loc.parent_location_id].children.push(map[loc.id]);
    } else {
      roots.push(map[loc.id]);
    }
  });

  return roots;
}

// POST /:id/procedures - Link a procedure to a location
router.post('/:id/procedures', authenticate, (req, res) => {
  try {
    const { procedure_id, notes } = req.body;
    if (!procedure_id) return res.status(400).json({ error: 'procedure_id is required' });

    const location = db.prepare('SELECT id FROM locations WHERE id = ?').get(req.params.id);
    if (!location) return res.status(404).json({ error: 'Location not found' });

    db.prepare('INSERT OR IGNORE INTO location_procedures (location_id, procedure_id, notes) VALUES (?, ?, ?)')
      .run(req.params.id, procedure_id, notes || null);

    res.status(201).json({ message: 'Procedure linked to location' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to link procedure', details: err.message });
  }
});

// DELETE /:id/procedures/:procedureId - Unlink a procedure from a location
router.delete('/:id/procedures/:procedureId', authenticate, (req, res) => {
  try {
    db.prepare('DELETE FROM location_procedures WHERE location_id = ? AND procedure_id = ?')
      .run(req.params.id, req.params.procedureId);
    res.json({ message: 'Procedure unlinked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unlink procedure', details: err.message });
  }
});

// GET /:id/procedures - List procedures for a location
router.get('/:id/procedures', (req, res) => {
  try {
    const procedures = db.prepare(`
      SELECT p.*, lp.notes AS link_notes,
        (SELECT COUNT(*) FROM procedure_steps WHERE procedure_id = p.id) AS step_count
      FROM procedures p
      JOIN location_procedures lp ON p.id = lp.procedure_id
      WHERE lp.location_id = ?
      ORDER BY p.title
    `).all(req.params.id);
    res.json(procedures);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch procedures', details: err.message });
  }
});

module.exports = router;
