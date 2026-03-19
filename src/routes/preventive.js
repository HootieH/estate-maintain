const express = require('express');
const { db, logActivity, createNotification, ensureChannel, postSystemMessage } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { getPropertyScope } = require('../middleware/permissions');

const router = express.Router();

router.use(authenticate);

function calculateNextDue(frequency, fromDate) {
  const date = fromDate ? new Date(fromDate) : new Date();
  switch (frequency) {
    case 'daily': date.setDate(date.getDate() + 1); break;
    case 'weekly': date.setDate(date.getDate() + 7); break;
    case 'biweekly': date.setDate(date.getDate() + 14); break;
    case 'monthly': date.setMonth(date.getMonth() + 1); break;
    case 'quarterly': date.setMonth(date.getMonth() + 3); break;
    case 'semiannual': date.setMonth(date.getMonth() + 6); break;
    case 'annual': date.setFullYear(date.getFullYear() + 1); break;
  }
  return date.toISOString().split('T')[0];
}

// GET /
router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT ps.*, p.name AS property_name, a.name AS asset_name, t.name AS team_name, pr.title AS procedure_title
      FROM preventive_schedules ps
      LEFT JOIN properties p ON ps.property_id = p.id
      LEFT JOIN assets a ON ps.asset_id = a.id
      LEFT JOIN teams t ON ps.assigned_team_id = t.id
      LEFT JOIN procedures pr ON ps.procedure_id = pr.id
    `;
    const conditions = [];
    const params = [];

    // Property scoping — users only see schedules from properties they have access to
    const scope = getPropertyScope(req.user.id);
    if (scope !== null) {
      if (scope.length === 0) {
        return res.json({ data: [], total: 0, page: 1, limit: 25 });
      }
      conditions.push(`ps.property_id IN (${scope.map(() => '?').join(',')})`);
      params.push(...scope);
    }

    if (req.query.property_id) {
      conditions.push('ps.property_id = ?');
      params.push(req.query.property_id);
    }
    if (req.query.is_active !== undefined) {
      conditions.push('ps.is_active = ?');
      params.push(req.query.is_active);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY ps.next_due ASC';

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;

    let countSql = `SELECT COUNT(*) as total FROM preventive_schedules ps`;
    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
    }
    const { total } = db.prepare(countSql).get(...params);

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const schedules = db.prepare(sql).all(...params);
    res.json({
      data: schedules,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch preventive schedules', details: err.message });
  }
});

// GET /:id
router.get('/:id', (req, res) => {
  try {
    const schedule = db.prepare(`
      SELECT ps.*, p.name AS property_name, a.name AS asset_name, t.name AS team_name, pr.title AS procedure_title
      FROM preventive_schedules ps
      LEFT JOIN properties p ON ps.property_id = p.id
      LEFT JOIN assets a ON ps.asset_id = a.id
      LEFT JOIN teams t ON ps.assigned_team_id = t.id
      LEFT JOIN procedures pr ON ps.procedure_id = pr.id
      WHERE ps.id = ?
    `).get(req.params.id);

    if (!schedule) {
      return res.status(404).json({ error: 'Preventive schedule not found' });
    }

    // Fetch completion history from linked work orders
    const history = db.prepare(`
      SELECT id, title, status, completed_at, assigned_to, signed_off_by
      FROM work_orders
      WHERE preventive_schedule_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(req.params.id);

    res.json({ ...schedule, history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch preventive schedule', details: err.message });
  }
});

// POST /
router.post('/', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { title, description, property_id, asset_id, assigned_team_id, assigned_to, frequency, next_due, category, priority, is_active, procedure_id, estimated_cost } = req.body;

    if (!title || !property_id || !frequency) {
      return res.status(400).json({ error: 'Title, property_id, and frequency are required' });
    }

    const computedNextDue = next_due || calculateNextDue(frequency);

    const result = db.prepare(`
      INSERT INTO preventive_schedules (title, description, property_id, asset_id, assigned_team_id, assigned_to, frequency, next_due, category, priority, is_active, procedure_id, estimated_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, description || null, property_id,
      asset_id || null, assigned_team_id || null,
      assigned_to || null,
      frequency, computedNextDue, category || null,
      priority || 'medium', is_active !== undefined ? is_active : 1,
      procedure_id || null, estimated_cost || null
    );

    const schedule = db.prepare('SELECT * FROM preventive_schedules WHERE id = ?').get(result.lastInsertRowid);
    logActivity('preventive_schedule', schedule.id, 'created', `Preventive schedule "${title}" created`, req.user.id);

    res.status(201).json(schedule);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create preventive schedule', details: err.message });
  }
});

// PUT /:id
router.put('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM preventive_schedules WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Preventive schedule not found' });
    }

    const { title, description, property_id, asset_id, assigned_team_id, assigned_to, frequency, next_due, category, priority, is_active, procedure_id, estimated_cost } = req.body;

    db.prepare(`
      UPDATE preventive_schedules SET
        title = ?, description = ?, property_id = ?, asset_id = ?, assigned_team_id = ?,
        assigned_to = ?, frequency = ?, next_due = ?, category = ?, priority = ?, is_active = ?,
        procedure_id = ?, estimated_cost = ?
      WHERE id = ?
    `).run(
      title || existing.title,
      description !== undefined ? description : existing.description,
      property_id || existing.property_id,
      asset_id !== undefined ? asset_id : existing.asset_id,
      assigned_team_id !== undefined ? assigned_team_id : existing.assigned_team_id,
      assigned_to !== undefined ? assigned_to : existing.assigned_to,
      frequency || existing.frequency,
      next_due !== undefined ? next_due : existing.next_due,
      category !== undefined ? category : existing.category,
      priority || existing.priority,
      is_active !== undefined ? is_active : existing.is_active,
      procedure_id !== undefined ? procedure_id : existing.procedure_id,
      estimated_cost !== undefined ? estimated_cost : existing.estimated_cost,
      req.params.id
    );

    const schedule = db.prepare('SELECT * FROM preventive_schedules WHERE id = ?').get(req.params.id);
    logActivity('preventive_schedule', schedule.id, 'updated', `Preventive schedule "${schedule.title}" updated`, req.user.id);

    res.json(schedule);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update preventive schedule', details: err.message });
  }
});

// POST /:id/complete
router.post('/:id/complete', (req, res) => {
  try {
    const schedule = db.prepare('SELECT * FROM preventive_schedules WHERE id = ?').get(req.params.id);
    if (!schedule) {
      return res.status(404).json({ error: 'Preventive schedule not found' });
    }

    const now = new Date().toISOString();
    const nextDue = calculateNextDue(schedule.frequency);

    db.prepare(
      'UPDATE preventive_schedules SET last_completed = ?, next_due = ? WHERE id = ?'
    ).run(now, nextDue, req.params.id);

    let workOrder = null;
    if (req.query.create_wo === 'true') {
      const woResult = db.prepare(`
        INSERT INTO work_orders (title, description, property_id, asset_id, assigned_team_id, priority, status, category, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)
      `).run(
        `[PM] ${schedule.title}`,
        schedule.description || `Preventive maintenance: ${schedule.title}`,
        schedule.property_id,
        schedule.asset_id,
        schedule.assigned_team_id,
        schedule.priority || 'medium',
        schedule.category,
        req.user.id
      );

      // Auto-attach procedure if schedule has one
      if (schedule.procedure_id) {
        db.prepare('INSERT INTO work_order_procedures (work_order_id, procedure_id) VALUES (?, ?)').run(woResult.lastInsertRowid, schedule.procedure_id);
      }

      workOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(woResult.lastInsertRowid);
      db.prepare('UPDATE work_orders SET completed_at = CURRENT_TIMESTAMP WHERE id = ?').run(workOrder.id);
      logActivity('work_order', workOrder.id, 'created', `Work order created from preventive schedule`, req.user.id);
    }

    logActivity('preventive_schedule', schedule.id, 'completed', `Preventive schedule "${schedule.title}" completed`, req.user.id);

    const updated = db.prepare('SELECT * FROM preventive_schedules WHERE id = ?').get(req.params.id);
    res.json({ schedule: updated, work_order: workOrder });
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete preventive schedule', details: err.message });
  }
});

// DELETE /:id
router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM preventive_schedules WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Preventive schedule not found' });
    }

    db.prepare('DELETE FROM preventive_schedules WHERE id = ?').run(req.params.id);
    logActivity('preventive_schedule', parseInt(req.params.id), 'deleted', `Preventive schedule "${existing.title}" deleted`, req.user.id);

    res.json({ message: 'Preventive schedule deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete preventive schedule', details: err.message });
  }
});

module.exports = router;
