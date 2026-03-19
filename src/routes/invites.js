const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db, logActivity } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requirePermission, grantPropertyAccess } = require('../middleware/permissions');

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

// POST / — Create invitation
router.post('/', authenticate, requirePermission('users:create'), (req, res) => {
  try {
    const { email, role, team_id, property_ids } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const pendingInvite = db.prepare(
      'SELECT id FROM invite_tokens WHERE email = ? AND accepted_at IS NULL AND expires_at > datetime(\'now\')'
    ).get(email);
    if (pendingInvite) {
      return res.status(409).json({ error: 'A pending invitation already exists for this email' });
    }

    // property_ids can be an array [1,2,3] or a single id
    const propIds = Array.isArray(property_ids) ? property_ids : (property_ids ? [property_ids] : []);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const result = db.prepare(
      'INSERT INTO invite_tokens (email, token, role, team_id, invited_by, expires_at, property_ids) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(email, token, role || 'technician', team_id || null, req.user.id, expiresAt, propIds.length > 0 ? JSON.stringify(propIds) : null);

    const invite = db.prepare('SELECT * FROM invite_tokens WHERE id = ?').get(result.lastInsertRowid);

    logActivity('invite', invite.id, 'created', `Invitation sent to ${email}`, req.user.id);

    res.status(201).json(invite);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create invitation', details: err.message });
  }
});

// GET / — List pending invitations
router.get('/', authenticate, requirePermission('users:view'), (req, res) => {
  try {
    const invites = db.prepare(
      'SELECT * FROM invite_tokens WHERE accepted_at IS NULL AND expires_at > datetime(\'now\') ORDER BY created_at DESC'
    ).all();

    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invitations', details: err.message });
  }
});

// DELETE /:id — Revoke pending invitation
router.delete('/:id', authenticate, requirePermission('users:create'), (req, res) => {
  try {
    const invite = db.prepare('SELECT * FROM invite_tokens WHERE id = ?').get(req.params.id);
    if (!invite) {
      return res.status(404).json({ error: 'Invitation not found' });
    }
    if (invite.accepted_at) {
      return res.status(400).json({ error: 'Invitation has already been accepted' });
    }

    db.prepare('DELETE FROM invite_tokens WHERE id = ?').run(req.params.id);

    logActivity('invite', invite.id, 'revoked', `Invitation to ${invite.email} revoked`, req.user.id);

    res.json({ message: 'Invitation revoked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke invitation', details: err.message });
  }
});

// GET /validate — Public: validate invite token (used by invite.html)
router.get('/validate', (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const invite = db.prepare('SELECT * FROM invite_tokens WHERE token = ?').get(token);
    if (!invite) return res.status(404).json({ error: 'Invalid invitation link' });
    if (invite.accepted_at) return res.status(410).json({ error: 'This invitation has already been used' });
    if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'This invitation has expired' });

    // Include property names so the invitee knows what they're joining
    let properties = [];
    if (invite.property_ids) {
      try {
        const ids = JSON.parse(invite.property_ids);
        if (ids.length > 0) {
          const ph = ids.map(() => '?').join(',');
          properties = db.prepare(`SELECT id, name FROM properties WHERE id IN (${ph})`).all(...ids);
        }
      } catch (_) {}
    }

    res.json({ email: invite.email, role: invite.role, properties });
  } catch (err) {
    res.status(500).json({ error: 'Validation failed', details: err.message });
  }
});

// POST /accept — Public: accept invitation
router.post('/accept', async (req, res) => {
  try {
    const { token, name, password } = req.body;

    if (!token || !name || !password) {
      return res.status(400).json({ error: 'Token, name, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const invite = db.prepare('SELECT * FROM invite_tokens WHERE token = ?').get(token);
    if (!invite) {
      return res.status(404).json({ error: 'Invalid invitation token' });
    }
    if (invite.accepted_at) {
      return res.status(400).json({ error: 'Invitation has already been accepted' });
    }
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(invite.email);
    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = db.prepare(
      'INSERT INTO users (email, password_hash, name, role, status) VALUES (?, ?, ?, ?, ?)'
    ).run(invite.email, passwordHash, name, invite.role, 'active');

    const newUserId = userResult.lastInsertRowid;

    // Add to team if specified
    if (invite.team_id) {
      db.prepare('INSERT OR IGNORE INTO user_teams (user_id, team_id) VALUES (?, ?)').run(newUserId, invite.team_id);
    }

    // Grant property access from the invite
    if (invite.property_ids) {
      try {
        const propIds = JSON.parse(invite.property_ids);
        for (const pid of propIds) {
          grantPropertyAccess(newUserId, pid, invite.invited_by);
        }
      } catch (_) {}
    }

    db.prepare('UPDATE invite_tokens SET accepted_at = CURRENT_TIMESTAMP WHERE id = ?').run(invite.id);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userResult.lastInsertRowid);
    const jwtToken = generateToken(user);

    logActivity('user', user.id, 'created', `User ${name} joined via invitation`, user.id);

    res.status(201).json({ token: jwtToken, user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to accept invitation', details: err.message });
  }
});

module.exports = router;
