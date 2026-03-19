const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET /
router.get('/', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;

    const { total } = db.prepare(`SELECT COUNT(*) as total FROM teams`).get();

    const teams = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM users u WHERE u.team_id = t.id AND u.is_active = 1) AS member_count,
        (SELECT COUNT(*) FROM properties p WHERE p.team_id = t.id) AS property_count
      FROM teams t
      ORDER BY t.name
      LIMIT ? OFFSET ?
    `).all(limit, offset);
    res.json({
      data: teams,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch teams', details: err.message });
  }
});

// GET /:id
router.get('/:id', (req, res) => {
  try {
    const team = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM properties p WHERE p.team_id = t.id) AS property_count
      FROM teams t WHERE t.id = ?
    `).get(req.params.id);

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const members = db.prepare(
      'SELECT id, email, name, role, avatar_color, created_at FROM users WHERE team_id = ? AND is_active = 1 ORDER BY name'
    ).all(req.params.id);

    const properties = db.prepare(
      'SELECT id, name, type, address FROM properties WHERE team_id = ? ORDER BY name'
    ).all(req.params.id);

    res.json({ ...team, members, properties });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch team', details: err.message });
  }
});

// POST /
router.post('/', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const result = db.prepare('INSERT INTO teams (name, description) VALUES (?, ?)').run(name, description || null);
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(result.lastInsertRowid);

    logActivity('team', team.id, 'created', `Team "${name}" created`, req.user.id);

    res.status(201).json(team);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create team', details: err.message });
  }
});

// PUT /:id
router.put('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { name, description } = req.body;
    const existing = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Team not found' });
    }

    db.prepare('UPDATE teams SET name = ?, description = ? WHERE id = ?').run(
      name || existing.name,
      description !== undefined ? description : existing.description,
      req.params.id
    );

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
    logActivity('team', team.id, 'updated', `Team "${team.name}" updated`, req.user.id);

    res.json(team);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update team', details: err.message });
  }
});

// POST /:id/members — add member to team
router.post('/:id/members', requireRole('admin', 'manager'), (req, res) => {
  try {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const user = db.prepare('SELECT id, name, email, role, team_id FROM users WHERE id = ?').get(user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.prepare('UPDATE users SET team_id = ? WHERE id = ?').run(req.params.id, user_id);
    logActivity('team', parseInt(req.params.id), 'member_added', `User "${user.name}" added to team "${team.name}"`, req.user.id);

    const updatedUser = db.prepare('SELECT id, email, name, role, avatar_color, team_id FROM users WHERE id = ?').get(user_id);
    res.status(201).json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add team member', details: err.message });
  }
});

// DELETE /:id/members/:userId — remove member from team
router.delete('/:id/members/:userId', requireRole('admin', 'manager'), (req, res) => {
  try {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const user = db.prepare('SELECT id, name, team_id FROM users WHERE id = ? AND team_id = ?').get(req.params.userId, req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found in this team' });
    }

    db.prepare('UPDATE users SET team_id = NULL WHERE id = ?').run(req.params.userId);
    logActivity('team', parseInt(req.params.id), 'member_removed', `User "${user.name}" removed from team "${team.name}"`, req.user.id);

    res.json({ message: 'Member removed from team' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove team member', details: err.message });
  }
});

// POST /:id/properties — assign property to team
router.post('/:id/properties', requireRole('admin', 'manager'), (req, res) => {
  try {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const { property_id } = req.body;
    if (!property_id) {
      return res.status(400).json({ error: 'property_id is required' });
    }

    const property = db.prepare('SELECT id, name FROM properties WHERE id = ?').get(property_id);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    db.prepare('UPDATE properties SET team_id = ? WHERE id = ?').run(req.params.id, property_id);
    logActivity('team', parseInt(req.params.id), 'property_assigned', `Property "${property.name}" assigned to team "${team.name}"`, req.user.id);

    const updatedProperty = db.prepare('SELECT id, name, type, address, team_id FROM properties WHERE id = ?').get(property_id);
    res.status(201).json(updatedProperty);
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign property to team', details: err.message });
  }
});

// DELETE /:id
router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Team not found' });
    }

    db.prepare('UPDATE users SET team_id = NULL WHERE team_id = ?').run(req.params.id);
    db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);

    logActivity('team', parseInt(req.params.id), 'deleted', `Team "${existing.name}" deleted`, req.user.id);

    res.json({ message: 'Team deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete team', details: err.message });
  }
});

module.exports = router;
