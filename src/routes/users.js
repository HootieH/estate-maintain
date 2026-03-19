const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

// GET / — List users with filters and pagination
router.get('/', authenticate, requirePermission('users:view'), (req, res) => {
  try {
    const { search, role, team_id, status, property_id, page = 1, limit = 25 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const pageLimit = Math.min(100, Math.max(1, parseInt(limit)));

    const conditions = [];
    const params = [];

    if (search) {
      conditions.push("(u.name LIKE ? OR u.email LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (role) {
      conditions.push("u.role = ?");
      params.push(role);
    }
    if (team_id) {
      conditions.push("u.id IN (SELECT user_id FROM user_teams WHERE team_id = ?)");
      params.push(parseInt(team_id));
    }
    if (status) {
      conditions.push("u.status = ?");
      params.push(status);
    }
    if (property_id) {
      conditions.push("u.id IN (SELECT user_id FROM user_property_access WHERE property_id = ?)");
      params.push(parseInt(property_id));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM users u ${where}`).get(...params);
    const total = countRow.total;

    const users = db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.is_owner,
             u.status, u.avatar_color, u.is_team_lead,
             u.last_login_at, u.created_at,
             (SELECT COUNT(*) FROM user_passkeys WHERE user_id = u.id) as passkey_count
      FROM users u
      ${where}
      ORDER BY u.name
      LIMIT ? OFFSET ?
    `).all(...params, pageLimit, offset);

    // Batch-fetch team memberships for returned users
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

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: pageLimit,
        total,
        pages: Math.ceil(total / pageLimit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

// GET /compare — Side-by-side performance comparison for multiple users
router.get('/compare', authenticate, requirePermission('users:view'), (req, res) => {
  try {
    const { ids, start, end } = req.query;
    if (!ids) {
      return res.status(400).json({ error: 'ids query parameter is required' });
    }

    const userIds = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (userIds.length === 0) {
      return res.status(400).json({ error: 'No valid user IDs provided' });
    }

    const placeholders = userIds.map(() => '?').join(',');
    const dateConditions = [];
    const dateParams = [];
    if (start) {
      dateConditions.push('wo.completed_at >= ?');
      dateParams.push(start);
    }
    if (end) {
      dateConditions.push('wo.completed_at <= ?');
      dateParams.push(end);
    }
    const dateWhere = dateConditions.length > 0 ? `AND ${dateConditions.join(' AND ')}` : '';

    const timeDateConditions = [];
    const timeDateParams = [];
    if (start) {
      timeDateConditions.push('tl.logged_at >= ?');
      timeDateParams.push(start);
    }
    if (end) {
      timeDateConditions.push('tl.logged_at <= ?');
      timeDateParams.push(end);
    }
    const timeDateWhere = timeDateConditions.length > 0 ? `AND ${timeDateConditions.join(' AND ')}` : '';

    const partDateConditions = [];
    const partDateParams = [];
    if (start) {
      partDateConditions.push('wop.created_at >= ?');
      partDateParams.push(start);
    }
    if (end) {
      partDateConditions.push('wop.created_at <= ?');
      partDateParams.push(end);
    }
    const partDateWhere = partDateConditions.length > 0 ? `AND ${partDateConditions.join(' AND ')}` : '';

    const results = userIds.map(userId => {
      const user = db.prepare('SELECT id, name, email, role, avatar_color FROM users WHERE id = ?').get(userId);
      if (!user) return { user_id: userId, error: 'User not found' };

      const completed = db.prepare(`
        SELECT COUNT(*) as count FROM work_orders wo
        WHERE wo.assigned_to = ? AND wo.status = 'completed' ${dateWhere}
      `).get(userId, ...dateParams);

      const avgCompletion = db.prepare(`
        SELECT AVG(CAST((julianday(wo.completed_at) - julianday(wo.created_at)) * 24 AS REAL)) as avg_hours
        FROM work_orders wo
        WHERE wo.assigned_to = ? AND wo.status = 'completed' AND wo.completed_at IS NOT NULL ${dateWhere}
      `).get(userId, ...dateParams);

      const totalHours = db.prepare(`
        SELECT COALESCE(SUM(tl.hours), 0) as total
        FROM time_logs tl
        WHERE tl.user_id = ? ${timeDateWhere}
      `).get(userId, ...timeDateParams);

      const onTimeRow = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN wo.completed_at <= wo.due_date THEN 1 ELSE 0 END) as on_time
        FROM work_orders wo
        WHERE wo.assigned_to = ? AND wo.status = 'completed' AND wo.due_date IS NOT NULL ${dateWhere}
      `).get(userId, ...dateParams);

      const partsCost = db.prepare(`
        SELECT COALESCE(SUM(wop.quantity_used * wop.unit_cost), 0) as total
        FROM work_order_parts wop
        JOIN work_orders wo ON wop.work_order_id = wo.id
        WHERE wo.assigned_to = ? ${partDateWhere}
      `).get(userId, ...partDateParams);

      return {
        user,
        metrics: {
          work_orders_completed: completed.count,
          avg_completion_hours: avgCompletion.avg_hours ? Math.round(avgCompletion.avg_hours * 100) / 100 : null,
          total_hours_logged: totalHours.total,
          on_time_rate: onTimeRow.total > 0 ? Math.round((onTimeRow.on_time / onTimeRow.total) * 100) : null,
          parts_cost: Math.round(partsCost.total * 100) / 100,
        },
      };
    });

    res.json({ comparisons: results, date_range: { start: start || null, end: end || null } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compare users', details: err.message });
  }
});

// GET /:id — Full user detail
router.get('/:id', authenticate, requirePermission('users:view'), (req, res) => {
  try {
    const user = db.prepare(`
      SELECT u.*
      FROM users u
      WHERE u.id = ?
    `).get(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const teams = db.prepare(`
      SELECT t.id, t.name
      FROM user_teams ut
      JOIN teams t ON ut.team_id = t.id
      WHERE ut.user_id = ?
      ORDER BY t.name
    `).all(req.params.id);

    const properties = db.prepare(`
      SELECT p.id, p.name, p.address, upa.created_at as granted_at
      FROM user_property_access upa
      JOIN properties p ON upa.property_id = p.id
      WHERE upa.user_id = ?
      ORDER BY p.name
    `).all(req.params.id);

    const passkeyCount = db.prepare(
      'SELECT COUNT(*) as count FROM user_passkeys WHERE user_id = ?'
    ).get(req.params.id).count;

    const permissionOverrides = db.prepare(`
      SELECT p.resource, p.action, upo.grant_type
      FROM user_permission_overrides upo
      JOIN permissions p ON upo.permission_id = p.id
      WHERE upo.user_id = ?
    `).all(req.params.id);

    res.json({
      ...sanitizeUser(user),
      teams,
      assigned_properties: properties,
      passkey_count: passkeyCount,
      permission_overrides: permissionOverrides,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user', details: err.message });
  }
});

// GET /:id/activity — Paginated activity feed
router.get('/:id/activity', authenticate, requirePermission('users:view'), (req, res) => {
  try {
    const { page = 1, limit = 25 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const pageLimit = Math.min(100, Math.max(1, parseInt(limit)));

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const countRow = db.prepare(
      'SELECT COUNT(*) as total FROM activity_log WHERE user_id = ?'
    ).get(req.params.id);

    const activities = db.prepare(`
      SELECT * FROM activity_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.params.id, pageLimit, offset);

    res.json({
      activities,
      pagination: {
        page: parseInt(page),
        limit: pageLimit,
        total: countRow.total,
        pages: Math.ceil(countRow.total / pageLimit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity', details: err.message });
  }
});

// GET /:id/performance — Performance metrics
router.get('/:id/performance', authenticate, requirePermission('users:view'), (req, res) => {
  try {
    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

    const weekStr = startOfWeek.toISOString();
    const monthStr = startOfMonth.toISOString();
    const quarterStr = startOfQuarter.toISOString();

    const completedThisWeek = db.prepare(`
      SELECT COUNT(*) as count FROM work_orders
      WHERE assigned_to = ? AND status = 'completed' AND completed_at >= ?
    `).get(req.params.id, weekStr).count;

    const completedThisMonth = db.prepare(`
      SELECT COUNT(*) as count FROM work_orders
      WHERE assigned_to = ? AND status = 'completed' AND completed_at >= ?
    `).get(req.params.id, monthStr).count;

    const completedThisQuarter = db.prepare(`
      SELECT COUNT(*) as count FROM work_orders
      WHERE assigned_to = ? AND status = 'completed' AND completed_at >= ?
    `).get(req.params.id, quarterStr).count;

    const avgCompletion = db.prepare(`
      SELECT AVG(CAST((julianday(completed_at) - julianday(created_at)) * 24 AS REAL)) as avg_hours
      FROM work_orders
      WHERE assigned_to = ? AND status = 'completed' AND completed_at IS NOT NULL
    `).get(req.params.id);

    const totalHours = db.prepare(`
      SELECT COALESCE(SUM(hours), 0) as total FROM time_logs WHERE user_id = ?
    `).get(req.params.id);

    const onTimeRow = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN completed_at <= due_date THEN 1 ELSE 0 END) as on_time
      FROM work_orders
      WHERE assigned_to = ? AND status = 'completed' AND due_date IS NOT NULL
    `).get(req.params.id);

    const partsCost = db.prepare(`
      SELECT COALESCE(SUM(wop.quantity_used * wop.unit_cost), 0) as total
      FROM work_order_parts wop
      JOIN work_orders wo ON wop.work_order_id = wo.id
      WHERE wo.assigned_to = ?
    `).get(req.params.id);

    res.json({
      user_id: user.id,
      user_name: user.name,
      work_orders_completed: {
        this_week: completedThisWeek,
        this_month: completedThisMonth,
        this_quarter: completedThisQuarter,
      },
      avg_completion_hours: avgCompletion.avg_hours ? Math.round(avgCompletion.avg_hours * 100) / 100 : null,
      total_hours_logged: totalHours.total,
      on_time_completion_rate: onTimeRow.total > 0
        ? Math.round((onTimeRow.on_time / onTimeRow.total) * 100)
        : null,
      parts_cost: Math.round(partsCost.total * 100) / 100,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch performance metrics', details: err.message });
  }
});

// GET /:id/login-history — Paginated login history
router.get('/:id/login-history', authenticate, requirePermission('users:view'), (req, res) => {
  try {
    const { page = 1, limit = 25 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const pageLimit = Math.min(100, Math.max(1, parseInt(limit)));

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const countRow = db.prepare(
      'SELECT COUNT(*) as total FROM login_history WHERE user_id = ?'
    ).get(req.params.id);

    const history = db.prepare(`
      SELECT * FROM login_history
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.params.id, pageLimit, offset);

    res.json({
      history,
      pagination: {
        page: parseInt(page),
        limit: pageLimit,
        total: countRow.total,
        pages: Math.ceil(countRow.total / pageLimit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch login history', details: err.message });
  }
});

// PUT /:id — Update user fields (team membership managed via teams routes)
router.put('/:id', authenticate, requirePermission('users:edit'), (req, res) => {
  try {
    const { name, email, role, avatar_color } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only admins can change role
    if (role && role !== user.role && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change user roles' });
    }

    const updates = [];
    const values = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (email) { updates.push('email = ?'); values.push(email); }
    if (role) { updates.push('role = ?'); values.push(role); }
    if (avatar_color) { updates.push('avatar_color = ?'); values.push(avatar_color); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

    const teams = db.prepare(`
      SELECT t.id, t.name
      FROM user_teams ut
      JOIN teams t ON ut.team_id = t.id
      WHERE ut.user_id = ?
      ORDER BY t.name
    `).all(req.params.id);

    logActivity('user', parseInt(req.params.id), 'updated', `User updated by ${req.user.name}`, req.user.id);

    res.json({ ...sanitizeUser(updated), teams });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: 'Failed to update user', details: err.message });
  }
});

// PUT /:id/status — Change user status
router.put('/:id/status', authenticate, (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !['active', 'suspended', 'deactivated'].includes(status)) {
      return res.status(400).json({ error: 'Valid status required: active, suspended, deactivated' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-deactivation/suspension
    if (parseInt(req.params.id) === req.user.id && status !== 'active') {
      return res.status(400).json({ error: 'Cannot change your own status' });
    }

    // Check correct permission based on target status
    if (status === 'suspended' || (status === 'active' && user.status === 'suspended')) {
      if (!req.user.permissions.has('users:suspend')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }
    if (status === 'deactivated' || (status === 'active' && user.status === 'deactivated')) {
      if (!req.user.permissions.has('users:deactivate')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    const isActive = status === 'active' ? 1 : 0;
    db.prepare('UPDATE users SET status = ?, is_active = ? WHERE id = ?').run(status, isActive, req.params.id);

    logActivity('user', parseInt(req.params.id), `status_${status}`, `User ${status} by ${req.user.name}`, req.user.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    res.json(sanitizeUser(updated));
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status', details: err.message });
  }
});

// POST /:id/force-reset — Force password reset on next login
router.post('/:id/force-reset', authenticate, requirePermission('users:force_reset'), (req, res) => {
  try {
    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.prepare('UPDATE users SET force_password_reset = 1 WHERE id = ?').run(req.params.id);

    logActivity('user', parseInt(req.params.id), 'force_reset', `Password reset forced by ${req.user.name}`, req.user.id);

    res.json({ message: `Password reset forced for ${user.name}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to force password reset', details: err.message });
  }
});

// POST /:id/team-lead — Toggle is_team_lead
router.post('/:id/team-lead', authenticate, requirePermission('users:edit'), (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newValue = user.is_team_lead ? 0 : 1;
    db.prepare('UPDATE users SET is_team_lead = ? WHERE id = ?').run(newValue, req.params.id);

    logActivity('user', parseInt(req.params.id), 'team_lead_toggled',
      `Team lead ${newValue ? 'granted' : 'revoked'} by ${req.user.name}`, req.user.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    res.json(sanitizeUser(updated));
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle team lead', details: err.message });
  }
});

// POST /:id/god-mode — Toggle god mode (owner only)
router.post('/:id/god-mode', authenticate, (req, res) => {
  try {
    if (!req.user.is_owner) {
      return res.status(403).json({ error: 'Only god mode users can promote others' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newValue = user.is_owner ? 0 : 1;
    db.prepare('UPDATE users SET is_owner = ? WHERE id = ?').run(newValue, req.params.id);

    logActivity('user', parseInt(req.params.id), newValue ? 'god_mode_granted' : 'god_mode_revoked',
      `God mode ${newValue ? 'granted to' : 'revoked from'} ${user.name} by ${req.user.name}`, req.user.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    res.json(sanitizeUser(updated));
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle god mode', details: err.message });
  }
});

// POST /bulk/role — Bulk update role
router.post('/bulk/role', authenticate, requirePermission('users:edit'), (req, res) => {
  try {
    const { user_ids, role } = req.body;
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'user_ids array is required' });
    }
    if (!role || !['admin', 'manager', 'technician'].includes(role)) {
      return res.status(400).json({ error: 'Valid role required: admin, manager, technician' });
    }
    // Only admins can change roles
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change user roles' });
    }

    const update = db.prepare('UPDATE users SET role = ? WHERE id = ?');
    const bulkUpdate = db.transaction(() => {
      for (const id of user_ids) {
        update.run(role, id);
      }
    });
    bulkUpdate();

    logActivity('user', 0, 'bulk_role_update',
      `Roles set to ${role} for ${user_ids.length} users by ${req.user.name}`, req.user.id);

    res.json({ message: `Updated role to ${role} for ${user_ids.length} users`, user_ids });
  } catch (err) {
    res.status(500).json({ error: 'Failed to bulk update roles', details: err.message });
  }
});

// POST /bulk/team — Bulk add/remove team memberships
router.post('/bulk/team', authenticate, requirePermission('users:edit'), (req, res) => {
  try {
    const { user_ids, team_ids, team_id, action = 'add' } = req.body;
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'user_ids array is required' });
    }
    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({ error: 'action must be add or remove' });
    }

    // Support both team_ids (array) and team_id (single) for backwards compatibility
    const resolvedTeamIds = team_ids || (team_id ? [team_id] : []);
    if (resolvedTeamIds.length === 0) {
      return res.status(400).json({ error: 'team_ids array or team_id is required' });
    }

    // Validate all teams exist
    for (const tid of resolvedTeamIds) {
      const team = db.prepare('SELECT id FROM teams WHERE id = ?').get(tid);
      if (!team) {
        return res.status(404).json({ error: `Team ${tid} not found` });
      }
    }

    const addStmt = db.prepare('INSERT OR IGNORE INTO user_teams (user_id, team_id) VALUES (?, ?)');
    const removeStmt = db.prepare('DELETE FROM user_teams WHERE user_id = ? AND team_id = ?');

    const bulkUpdate = db.transaction(() => {
      for (const userId of user_ids) {
        for (const tid of resolvedTeamIds) {
          if (action === 'add') {
            addStmt.run(userId, tid);
          } else {
            removeStmt.run(userId, tid);
          }
        }
      }
    });
    bulkUpdate();

    logActivity('user', 0, 'bulk_team_update',
      `Team membership ${action} for ${user_ids.length} users on ${resolvedTeamIds.length} teams by ${req.user.name}`, req.user.id);

    res.json({
      message: `${action === 'add' ? 'Added' : 'Removed'} team membership for ${user_ids.length} users on ${resolvedTeamIds.length} teams`,
      user_ids,
      team_ids: resolvedTeamIds,
      action,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to bulk update teams', details: err.message });
  }
});

// POST /bulk/status — Bulk update status
router.post('/bulk/status', authenticate, requirePermission('users:suspend'), (req, res) => {
  try {
    const { user_ids, status } = req.body;
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'user_ids array is required' });
    }
    if (!status || !['active', 'suspended', 'deactivated'].includes(status)) {
      return res.status(400).json({ error: 'Valid status required: active, suspended, deactivated' });
    }

    // Prevent self-modification
    if (user_ids.includes(req.user.id)) {
      return res.status(400).json({ error: 'Cannot change your own status in bulk operations' });
    }

    // Deactivation requires higher permission
    if (status === 'deactivated' && !req.user.permissions.has('users:deactivate')) {
      return res.status(403).json({ error: 'Insufficient permissions to deactivate users' });
    }

    const isActive = status === 'active' ? 1 : 0;
    const update = db.prepare('UPDATE users SET status = ?, is_active = ? WHERE id = ?');
    const bulkUpdate = db.transaction(() => {
      for (const id of user_ids) {
        update.run(status, isActive, id);
      }
    });
    bulkUpdate();

    logActivity('user', 0, `bulk_status_${status}`,
      `Status set to ${status} for ${user_ids.length} users by ${req.user.name}`, req.user.id);

    res.json({ message: `Updated status to ${status} for ${user_ids.length} users`, user_ids });
  } catch (err) {
    res.status(500).json({ error: 'Failed to bulk update status', details: err.message });
  }
});

// POST /bulk/property-access — Bulk grant/revoke property access
router.post('/bulk/property-access', authenticate, requirePermission('users:edit'), (req, res) => {
  try {
    const { user_ids, property_ids, action } = req.body;
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'user_ids array is required' });
    }
    if (!property_ids || !Array.isArray(property_ids) || property_ids.length === 0) {
      return res.status(400).json({ error: 'property_ids array is required' });
    }
    if (!action || !['grant', 'revoke'].includes(action)) {
      return res.status(400).json({ error: 'action must be grant or revoke' });
    }

    const grant = db.prepare(
      'INSERT OR IGNORE INTO user_property_access (user_id, property_id, granted_by) VALUES (?, ?, ?)'
    );
    const revoke = db.prepare(
      'DELETE FROM user_property_access WHERE user_id = ? AND property_id = ?'
    );

    const bulkUpdate = db.transaction(() => {
      for (const userId of user_ids) {
        for (const propertyId of property_ids) {
          if (action === 'grant') {
            grant.run(userId, propertyId, req.user.id);
          } else {
            revoke.run(userId, propertyId);
          }
        }
      }
    });
    bulkUpdate();

    logActivity('user', 0, `bulk_property_${action}`,
      `Property access ${action}ed for ${user_ids.length} users on ${property_ids.length} properties by ${req.user.name}`,
      req.user.id);

    res.json({
      message: `Property access ${action}ed for ${user_ids.length} users on ${property_ids.length} properties`,
      user_ids,
      property_ids,
      action,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update property access', details: err.message });
  }
});

module.exports = router;
