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

module.exports = router;
