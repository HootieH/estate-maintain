const express = require('express');
const { db, logActivity, createNotification, ensureChannel, postSystemMessage } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { getPropertyScope } = require('../middleware/permissions');

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

    // Property scoping — users only see work orders from properties they have access to
    const scope = getPropertyScope(req.user.id);
    if (scope !== null) {
      if (scope.length === 0) {
        return res.json({ data: [], total: 0, page: 1, limit: 25 });
      }
      conditions.push(`wo.property_id IN (${scope.map(() => '?').join(',')})`);
      params.push(...scope);
    }

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

// POST /bulk/status - Bulk update work order status
router.post('/bulk/status', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { work_order_ids, status } = req.body;
    if (!work_order_ids || !Array.isArray(work_order_ids) || !status) {
      return res.status(400).json({ error: 'work_order_ids array and status are required' });
    }

    const validStatuses = ['open', 'in_progress', 'on_hold', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const completedAt = status === 'completed' ? new Date().toISOString() : null;
    const stmt = db.prepare('UPDATE work_orders SET status = ?, completed_at = COALESCE(?, completed_at), updated_at = CURRENT_TIMESTAMP WHERE id = ?');

    let updated = 0;
    for (const id of work_order_ids) {
      const result = stmt.run(status, completedAt, id);
      if (result.changes > 0) updated++;
    }

    logActivity('work_order', 0, 'bulk_status_change', `Bulk status change to ${status} for ${updated} work orders`, req.user.id);
    res.json({ updated, total: work_order_ids.length });
  } catch (err) {
    res.status(500).json({ error: 'Bulk update failed', details: err.message });
  }
});

// POST /bulk/assign - Bulk assign work orders
router.post('/bulk/assign', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { work_order_ids, assigned_to, assigned_team_id } = req.body;
    if (!work_order_ids || !Array.isArray(work_order_ids)) {
      return res.status(400).json({ error: 'work_order_ids array is required' });
    }

    const stmt = db.prepare('UPDATE work_orders SET assigned_to = ?, assigned_team_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    let updated = 0;
    for (const id of work_order_ids) {
      const result = stmt.run(assigned_to || null, assigned_team_id || null, id);
      if (result.changes > 0) updated++;
    }

    res.json({ updated, total: work_order_ids.length });
  } catch (err) {
    res.status(500).json({ error: 'Bulk assign failed', details: err.message });
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

    // Parts used
    const partsUsed = db.prepare(`
      SELECT wop.*, p.name AS part_name, p.sku FROM work_order_parts wop
      JOIN parts p ON wop.part_id = p.id WHERE wop.work_order_id = ?
    `).all(req.params.id);
    workOrder.parts_used = partsUsed;
    workOrder.parts_cost = partsUsed.reduce((sum, p) => sum + (p.quantity_used * p.unit_cost), 0);

    // Sign-off info
    if (workOrder.signed_off_by) {
      const signer = db.prepare('SELECT name FROM users WHERE id = ?').get(workOrder.signed_off_by);
      workOrder.signed_off_by_name = signer ? signer.name : null;
    }

    // Time logs summary
    const timeLogs = db.prepare('SELECT SUM(hours) AS total_hours FROM time_logs WHERE work_order_id = ?').get(req.params.id);
    workOrder.total_hours = timeLogs ? timeLogs.total_hours : 0;

    // Tags
    const tags = db.prepare('SELECT t.* FROM tags t JOIN entity_tags et ON t.id = et.tag_id WHERE et.entity_type = ? AND et.entity_id = ?').all('work_order', req.params.id);
    workOrder.tags = tags;

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
    const id = req.params.id;
    const existing = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const { title, description, property_id, asset_id, assigned_to, assigned_team_id, priority, status, category, due_date } = req.body;

    const newStatus = status || existing.status;

    // Completion validation: check for incomplete required procedure steps
    if (newStatus === 'completed' && existing.status !== 'completed') {
      const incomplete = db.prepare(`
        SELECT ps.title FROM work_order_procedures wop
        JOIN procedure_steps ps ON ps.procedure_id = wop.procedure_id
        WHERE wop.work_order_id = ? AND ps.is_required = 1
        AND ps.id NOT IN (SELECT procedure_step_id FROM procedure_responses WHERE work_order_procedure_id = wop.id)
      `).all(id);
      if (incomplete.length > 0) {
        return res.status(400).json({ error: 'Required checklist steps not completed', incomplete_steps: incomplete.map(s => s.title) });
      }
    }

    let completedAt = existing.completed_at;
    if (newStatus === 'completed' && existing.status !== 'completed') {
      completedAt = new Date().toISOString();
    } else if (newStatus !== 'completed') {
      completedAt = null;
    }

    // Set started_at when status changes to in_progress (if not already set)
    let startedAt = existing.started_at;
    if (newStatus === 'in_progress' && !existing.started_at) {
      startedAt = new Date().toISOString();
    }

    db.prepare(`
      UPDATE work_orders SET
        title = ?, description = ?, property_id = ?, asset_id = ?,
        assigned_to = ?, assigned_team_id = ?, priority = ?, status = ?,
        category = ?, due_date = ?, completed_at = ?, started_at = COALESCE(?, started_at),
        updated_at = CURRENT_TIMESTAMP
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
      startedAt,
      id
    );

    const workOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
    logActivity('work_order', workOrder.id, 'updated', `Work order "${workOrder.title}" updated`, req.user.id);

    // Post system message and notify on status changes
    if (status && status !== existing.status) {
      postSystemMessage('work_order', 'wo_' + id, `Status changed to ${newStatus} by ${req.user.name}`);

      // Notify creator if status changed
      if (existing.created_by && existing.created_by !== req.user.id) {
        createNotification(existing.created_by, 'status_change', `Work order status changed to ${status}: ${workOrder.title}`, null, 'work_order', workOrder.id);
      }

      // Auto-submit for review when a PM work order is completed
      if (newStatus === 'completed' && workOrder.preventive_schedule_id) {
        let reviewerId = null;
        if (workOrder.assigned_team_id) {
          const lead = db.prepare('SELECT u.id FROM users u JOIN user_teams ut ON u.id = ut.user_id WHERE ut.team_id = ? AND u.is_team_lead = 1 LIMIT 1').get(workOrder.assigned_team_id);
          if (lead) reviewerId = lead.id;
        }
        if (!reviewerId) {
          const mgr = db.prepare("SELECT id FROM users WHERE role = 'manager' AND status = 'active' LIMIT 1").get();
          if (mgr) reviewerId = mgr.id;
        }
        if (reviewerId) {
          db.prepare("INSERT INTO work_order_reviews (work_order_id, reviewer_id, status) VALUES (?, ?, 'pending')").run(id, reviewerId);
          createNotification(reviewerId, 'assignment', `PM work order needs review: ${workOrder.title}`, null, 'work_order', workOrder.id);
        }
      }
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

// POST /:id/parts - Add part used to work order
router.post('/:id/parts', (req, res) => {
  try {
    const { part_id, quantity_used } = req.body;
    if (!part_id || !quantity_used) return res.status(400).json({ error: 'part_id and quantity_used are required' });

    const wo = db.prepare('SELECT id FROM work_orders WHERE id = ?').get(req.params.id);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });

    const part = db.prepare('SELECT * FROM parts WHERE id = ?').get(part_id);
    if (!part) return res.status(404).json({ error: 'Part not found' });

    // Deduct from inventory
    const newQty = part.quantity - quantity_used;
    if (newQty < 0) return res.status(400).json({ error: `Insufficient stock. Available: ${part.quantity}` });

    db.prepare('UPDATE parts SET quantity = ? WHERE id = ?').run(newQty, part_id);

    const result = db.prepare(
      'INSERT INTO work_order_parts (work_order_id, part_id, quantity_used, unit_cost, added_by) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.id, part_id, quantity_used, part.unit_cost, req.user.id);

    logActivity('work_order', parseInt(req.params.id), 'part_used', `Used ${quantity_used}x ${part.name}`, req.user.id);

    const entry = db.prepare('SELECT wop.*, p.name AS part_name, p.sku FROM work_order_parts wop JOIN parts p ON wop.part_id = p.id WHERE wop.id = ?').get(result.lastInsertRowid);
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add part', details: err.message });
  }
});

// GET /:id/parts - Get parts used on work order
router.get('/:id/parts', (req, res) => {
  try {
    const parts = db.prepare(`
      SELECT wop.*, p.name AS part_name, p.sku, u.name AS added_by_name
      FROM work_order_parts wop
      JOIN parts p ON wop.part_id = p.id
      LEFT JOIN users u ON wop.added_by = u.id
      WHERE wop.work_order_id = ?
      ORDER BY wop.created_at DESC
    `).all(req.params.id);

    const totalCost = parts.reduce((sum, p) => sum + (p.quantity_used * p.unit_cost), 0);
    res.json({ parts, totalCost });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch parts used', details: err.message });
  }
});

// DELETE /:id/parts/:partEntryId - Remove part from work order (restore inventory)
router.delete('/:id/parts/:partEntryId', requireRole('admin', 'manager'), (req, res) => {
  try {
    const entry = db.prepare('SELECT * FROM work_order_parts WHERE id = ? AND work_order_id = ?').get(req.params.partEntryId, req.params.id);
    if (!entry) return res.status(404).json({ error: 'Part entry not found' });

    // Restore inventory
    db.prepare('UPDATE parts SET quantity = quantity + ? WHERE id = ?').run(entry.quantity_used, entry.part_id);
    db.prepare('DELETE FROM work_order_parts WHERE id = ?').run(entry.id);

    res.json({ message: 'Part removed and inventory restored' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove part', details: err.message });
  }
});

// POST /:id/sign-off - Digital sign-off on completed work order
router.post('/:id/sign-off', (req, res) => {
  try {
    const wo = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });
    if (wo.status !== 'completed') return res.status(400).json({ error: 'Work order must be completed before sign-off' });
    if (wo.signed_off_by) return res.status(400).json({ error: 'Work order already signed off' });

    db.prepare('UPDATE work_orders SET signed_off_by = ?, signed_off_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.user.id, req.params.id);
    logActivity('work_order', parseInt(req.params.id), 'signed_off', `Signed off by ${req.user.name}`, req.user.id);

    const updated = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to sign off', details: err.message });
  }
});

// POST /:id/duplicate - Duplicate a work order
router.post('/:id/duplicate', (req, res) => {
  try {
    const wo = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });

    const result = db.prepare(`
      INSERT INTO work_orders (title, description, property_id, asset_id, assigned_to, assigned_team_id, priority, status, category, estimated_hours, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `).run(
      `[Copy] ${wo.title}`, wo.description, wo.property_id, wo.asset_id,
      wo.assigned_to, wo.assigned_team_id, wo.priority, wo.category, wo.estimated_hours, req.user.id
    );

    const newWo = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(result.lastInsertRowid);
    logActivity('work_order', newWo.id, 'created', `Duplicated from WO #${wo.id}`, req.user.id);
    res.status(201).json(newWo);
  } catch (err) {
    res.status(500).json({ error: 'Failed to duplicate work order', details: err.message });
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
