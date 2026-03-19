const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { getEffectivePermissions } = require('./permissions');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Check user is still active
    const user = db.prepare('SELECT id, status, role, is_team_lead, is_owner FROM users WHERE id = ?').get(payload.id);
    if (!user || (user.status !== 'active' && user.status !== null)) {
      // Allow null status for backwards compatibility before migration
      if (user && user.status !== null) {
        return res.status(403).json({ error: 'Account is ' + (user.status || 'inactive') });
      }
    }

    // Fetch team memberships from junction table
    const teamRows = user
      ? db.prepare('SELECT team_id FROM user_teams WHERE user_id = ?').all(payload.id)
      : [];
    const team_ids = teamRows.map(r => r.team_id);

    req.user = {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: user ? user.role : payload.role,
      team_ids,
      is_team_lead: user ? !!user.is_team_lead : false,
      is_owner: user ? !!user.is_owner : false,
      permissions: getEffectivePermissions(payload.id),
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
