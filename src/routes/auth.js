const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db, logActivity } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

// POST /register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, team_id } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Determine role: first user becomes admin, otherwise default technician
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    let assignedRole = 'technician';

    if (userCount === 0) {
      assignedRole = 'admin';
    } else if (role && (role === 'manager' || role === 'admin')) {
      // Only admins can create manager/admin users
      let requestingUser = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          requestingUser = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        } catch (_) {
          // Invalid token, ignore
        }
      }
      if (!requestingUser || requestingUser.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can create manager or admin users' });
      }
      assignedRole = role;
    } else if (role === 'technician') {
      assignedRole = 'technician';
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = db.prepare(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
    ).run(email, passwordHash, name, assignedRole);

    // If team_id provided, add to junction table
    if (team_id) {
      db.prepare('INSERT OR IGNORE INTO user_teams (user_id, team_id) VALUES (?, ?)').run(result.lastInsertRowid, team_id);
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = generateToken(user);

    logActivity('user', user.id, 'created', `User ${name} registered`, user.id);

    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ? AND (is_active = 1 OR status = 'active')").get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check user status
    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account is suspended. Contact your administrator.' });
    }
    if (user.status === 'deactivated') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user);
    db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // Record login history
    try {
      db.prepare('INSERT INTO login_history (user_id, method, ip_address, user_agent) VALUES (?, ?, ?, ?)')
        .run(user.id, 'password', req.ip, req.headers['user-agent'] || null);
    } catch (_) {}

    const response = { token, user: sanitizeUser(user) };
    if (user.force_password_reset) {
      response.force_password_reset = true;
    }
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

// GET /me
router.get('/me', authenticate, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(sanitizeUser(user));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user', details: err.message });
  }
});

// PUT /me
router.put('/me', authenticate, (req, res) => {
  try {
    const { name, email, avatar_color } = req.body;
    const updates = [];
    const values = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (email) { updates.push('email = ?'); values.push(email); }
    if (avatar_color) { updates.push('avatar_color = ?'); values.push(avatar_color); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    logActivity('user', req.user.id, 'updated', 'Profile updated', req.user.id);

    res.json(sanitizeUser(user));
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: 'Failed to update profile', details: err.message });
  }
});

// GET /users
router.get('/users', authenticate, (req, res) => {
  try {
    const users = db.prepare('SELECT id, email, name, role, avatar_color, created_at FROM users WHERE is_active = 1 ORDER BY name').all();

    // Batch-fetch team memberships for all users
    if (users.length > 0) {
      const placeholders = users.map(() => '?').join(',');
      const userIds = users.map(u => u.id);
      const teamRows = db.prepare(`
        SELECT ut.user_id, t.id, t.name
        FROM user_teams ut
        JOIN teams t ON ut.team_id = t.id
        WHERE ut.user_id IN (${placeholders})
      `).all(...userIds);

      const teamsByUser = {};
      for (const row of teamRows) {
        if (!teamsByUser[row.user_id]) teamsByUser[row.user_id] = [];
        teamsByUser[row.user_id].push({ id: row.id, name: row.name });
      }

      for (const user of users) {
        user.teams = teamsByUser[user.id] || [];
      }
    }

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

// GET /me/permissions - client permission set for sidebar gating
router.get('/me/permissions', authenticate, (req, res) => {
  try {
    res.json({ permissions: Array.from(req.user.permissions) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch permissions', details: err.message });
  }
});

// PUT /password
router.put('/password', authenticate, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const newHash = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
    logActivity('user', req.user.id, 'password_changed', 'Password changed', req.user.id);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update password', details: err.message });
  }
});

module.exports = router;
