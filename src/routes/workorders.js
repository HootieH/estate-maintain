const express = require('express');
const { db, logActivity, createNotification } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET /
router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT wo.*,
        p.name AS property_name,
        a.name AS asset_name,
        u.name AS assigned_user_name,
        t.name AS assigned_team_name,
        cb.name AS created_by_name
      FROM work_orders wo
      LEFT JOIN properties p ON wo.property_id = p.id
      LEFT JOIN assets a ON wo.asset_id = a.id
      LEFT JOIN users u ON wo.assigned_to = u.id
      LEFT JOIN teams t ON wo.assigned_team_id = t.id
      LEFT JOIN users cb ON wo.created_by = cb.id
    `;
    const conditions = [];
    const params = [];

    if (req.query.status) {
      conditions.push('wo.status = ?');
      params.push(req.query.status);
    }
    if (req.query.priority) {
      conditions.push('wo.priority = ?');
      params.push(req.query.priority);
    }
    if (req.query.property_id) {
      conditions.push('wo.property_id = ?');
      params.push(req.query.property_id);
    }
    if (req.query.assigned_to) {
      conditions.push('wo.assigned_to = ?');
      params.push(req.query.assigned_to);
    }
    if (req.query.asset_id) {
      conditions.push('wo.asset_id = ?');
      params.push(req.query.asset_id);
    }
    if (req.query.assigned_team_id) {
      conditions.push('wo.assigned_team_id = ?');
      params.push(req.query.assigned_team_id);
    }
    if (req.query.search) {
      conditions.push('wo.title LIKE ?');
      params.push(`%${req.query.search}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY wo.created_at DESC';

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;

    let countSql = `SELECT COUNT(*) as total FROM work_orders wo`;
    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
    }
    const { total } = db.prepare(countSql).get(...params);

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const workOrders = db.prepare(sql).all(...params);
    res.json({
      data: workOrders,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch work orders', details: err.message });
  }
});

// GET /:id
router.get('/:id', (req, res) => {
  try {
    const workOrder = db.prepare(`
      SELECT wo.*,
        p.name AS property_name,
        a.name AS asset_name,
        u.name AS assigned_user_name,
        t.name AS assigned_team_name,
        cb.name AS created_by_name
      FROM work_orders wo
      LEFT JOIN properties p ON wo.property_id = p.id
      LEFT JOIN assets a ON wo.asset_id = a.id
      LEFT JOIN users u ON wo.assigned_to = u.id
      LEFT JOIN teams t ON wo.assigned_team_id = t.id
      LEFT JOIN users cb ON wo.created_by = cb.id
      WHERE wo.id = ?
    `).get(req.params.id);

    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const comments = db.prepare(`
      SELECT woc.*, u.name AS user_name, u.avatar_color
      FROM work_order_comments woc
      LEFT JOIN users u ON woc.user_id = u.id
      WHERE woc.work_order_id = ?
      ORDER BY woc.created_at ASC
    `).all(req.params.id);

    const procedures = db.prepare(`
      SELECT wop.*, proc.title, proc.description AS procedure_description, proc.category
      FROM work_order_procedures wop
      JOIN procedures proc ON wop.procedure_id = proc.id
      WHERE wop.work_order_id = ?
      ORDER BY wop.id ASC
    `).all(req.params.id);

    res.json({ ...workOrder, comments, procedures });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch work order', details: err.message });
  }
});

// POST /
router.post('/', (req, res) => {
  try {
    const { title, description, property_id, asset_id, assigned_to, assigned_team_id, priority, status, category, due_date } = req.body;

    if (!title || !property_id) {
      return res.status(400).json({ error: 'Title and property_id are required' });
    }

    const result = db.prepare(`
      INSERT INTO work_orders (title, description, property_id, asset_id, assigned_to, assigned_team_id, priority, status, category, due_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, description || null, property_id,
      asset_id || null, assigned_to || null, assigned_team_id || null,
      priority || 'medium', status || 'open', category || null,
      due_date || null, req.user.id
    );

    const workOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(result.lastInsertRowid);
    logActivity('work_order', workOrder.id, 'created', `Work order "${title}" created`, req.user.id);

    // Notify assigned user
    if (assigned_to && assigned_to !== req.user.id) {
      createNotification(assigned_to, 'assignment', `You've been assigned a work order: ${title}`, null, 'work_order', workOrder.id);
    }

    res.status(201).json(workOrder);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create work order', details: err.message });
  }
});

// PUT /:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const { title, description, property_id, asset_id, assigned_to, assigned_team_id, priority, status, category, due_date } = req.body;

    const newStatus = status || existing.status;
    let completedAt = existing.completed_at;
    if (newStatus === 'completed' && existing.status !== 'completed') {
      completedAt = new Date().toISOString();
    } else if (newStatus !== 'completed') {
      completedAt = null;
    }

    db.prepare(`
      UPDATE work_orders SET
        title = ?, description = ?, property_id = ?, asset_id = ?,
        assigned_to = ?, assigned_team_id = ?, priority = ?, status = ?,
        category = ?, due_date = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title || existing.title,
      description !== undefined ? description : existing.description,
      property_id || existing.property_id,
      asset_id !== undefined ? asset_id : existing.asset_id,
      assigned_to !== undefined ? assigned_to : existing.assigned_to,
      assigned_team_id !== undefined ? assigned_team_id : existing.assigned_team_id,
      priority || existing.priority,
      newStatus,
      category !== undefined ? category : existing.category,
      due_date !== undefined ? due_date : existing.due_date,
      completedAt,
      req.params.id
    );

    const workOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    logActivity('work_order', workOrder.id, 'updated', `Work order "${workOrder.title}" updated`, req.user.id);

    // Notify creator if status changed
    if (status && status !== existing.status && existing.created_by && existing.created_by !== req.user.id) {
      createNotification(existing.created_by, 'status_change', `Work order status changed to ${status}: ${workOrder.title}`, null, 'work_order', workOrder.id);
    }

    res.json(workOrder);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update work order', details: err.message });
  }
});

// POST /:id/comments
router.post('/:id/comments', (req, res) => {
  try {
    const workOrder = db.prepare('SELECT id, title, created_by, assigned_to FROM work_orders WHERE id = ?').get(req.params.id);
    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const { comment } = req.body;
    if (!comment) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const result = db.prepare(
      'INSERT INTO work_order_comments (work_order_id, user_id, comment) VALUES (?, ?, ?)'
    ).run(req.params.id, req.user.id, comment);

    // Update work order's updated_at
    db.prepare('UPDATE work_orders SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    const newComment = db.prepare(`
      SELECT woc.*, u.name AS user_name, u.avatar_color
      FROM work_order_comments woc
      LEFT JOIN users u ON woc.user_id = u.id
      WHERE woc.id = ?
    `).get(result.lastInsertRowid);

    logActivity('work_order', parseInt(req.params.id), 'comment_added', `Comment added to work order`, req.user.id);

    // Notify creator and assignee (except the commenter)
    const notifyUsers = new Set();
    if (workOrder.created_by && workOrder.created_by !== req.user.id) notifyUsers.add(workOrder.created_by);
    if (workOrder.assigned_to && workOrder.assigned_to !== req.user.id) notifyUsers.add(workOrder.assigned_to);
    for (const userId of notifyUsers) {
      createNotification(userId, 'comment', `New comment on work order: ${workOrder.title}`, null, 'work_order', workOrder.id);
    }

    res.status(201).json(newComment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add comment', details: err.message });
  }
});

// GET /:id/comments — list comments for a work order
router.get('/:id/comments', (req, res) => {
  try {
    const workOrder = db.prepare('SELECT id FROM work_orders WHERE id = ?').get(req.params.id);
    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const comments = db.prepare(`
      SELECT woc.*, u.name AS user_name, u.avatar_color
      FROM work_order_comments woc
      LEFT JOIN users u ON woc.user_id = u.id
      WHERE woc.work_order_id = ?
      ORDER BY woc.created_at ASC
    `).all(req.params.id);

    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch comments', details: err.message });
  }
});

// POST /:id/procedures — attach a procedure to a work order
router.post('/:id/procedures', (req, res) => {
  try {
    const workOrder = db.prepare('SELECT id FROM work_orders WHERE id = ?').get(req.params.id);
    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const { procedure_id } = req.body;
    if (!procedure_id) {
      return res.status(400).json({ error: 'procedure_id is required' });
    }

    const procedure = db.prepare('SELECT id, title FROM procedures WHERE id = ?').get(procedure_id);
    if (!procedure) {
      return res.status(404).json({ error: 'Procedure not found' });
    }

    // Check if already attached
    const existing = db.prepare(
      'SELECT id FROM work_order_procedures WHERE work_order_id = ? AND procedure_id = ?'
    ).get(req.params.id, procedure_id);
    if (existing) {
      return res.status(400).json({ error: 'Procedure already attached to this work order' });
    }

    const result = db.prepare(
      'INSERT INTO work_order_procedures (work_order_id, procedure_id) VALUES (?, ?)'
    ).run(req.params.id, procedure_id);

    const wop = db.prepare('SELECT * FROM work_order_procedures WHERE id = ?').get(result.lastInsertRowid);
    logActivity('work_order', parseInt(req.params.id), 'procedure_attached', `Procedure "${procedure.title}" attached to work order`, req.user.id);

    res.status(201).json(wop);
  } catch (err) {
    res.status(500).json({ error: 'Failed to attach procedure', details: err.message });
  }
});

// DELETE /:id
router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    db.prepare('DELETE FROM work_orders WHERE id = ?').run(req.params.id);
    logActivity('work_order', parseInt(req.params.id), 'deleted', `Work order "${existing.title}" deleted`, req.user.id);

    res.json({ message: 'Work order deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete work order', details: err.message });
  }
});

module.exports = router;
