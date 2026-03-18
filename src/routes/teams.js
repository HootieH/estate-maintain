const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET /
router.get('/', (req, res) => {
  try {
    const teams = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM users u WHERE u.team_id = t.id AND u.is_active = 1) AS member_count,
        (SELECT COUNT(*) FROM properties p WHERE p.team_id = t.id) AS property_count
      FROM teams t
      ORDER BY t.name
    `).all();
    res.json(teams);
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

    res.json({ ...team, members });
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
