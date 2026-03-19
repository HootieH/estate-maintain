const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { getPropertyScope } = require('../middleware/permissions');

const router = express.Router();

// PUBLIC: Validate a property for the request form
router.get('/property/:id', (req, res) => {
  try {
    const property = db.prepare('SELECT id, name, address, type FROM properties WHERE id = ?').get(req.params.id);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    res.json(property);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch property', details: err.message });
  }
});

// PUBLIC: Submit a work request (no auth)
router.post('/submit', (req, res) => {
  try {
    const { title, description, property_id, location, priority, requester_name, requester_email, requester_phone } = req.body;

    if (!title || !requester_name) {
      return res.status(400).json({ error: 'Title and requester name are required' });
    }

    const result = db.prepare(`
      INSERT INTO work_requests (title, description, property_id, location, priority, requester_name, requester_email, requester_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      description || null,
      property_id || null,
      location || null,
      priority || 'medium',
      requester_name,
      requester_email || null,
      requester_phone || null
    );

    const request = db.prepare('SELECT * FROM work_requests WHERE id = ?').get(result.lastInsertRowid);
    logActivity('work_request', request.id, 'submitted', `Work request "${title}" submitted by ${requester_name}`, null);

    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit request', details: err.message });
  }
});

// --- All routes below require authentication ---
router.use(authenticate);

// GET / — list all requests (supports status filter)
router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT wr.*,
        p.name AS property_name,
        u.name AS approved_by_name
      FROM work_requests wr
      LEFT JOIN properties p ON wr.property_id = p.id
      LEFT JOIN users u ON wr.approved_by = u.id
    `;
    const conditions = [];
    const params = [];

    // Property scoping — users only see requests from properties they have access to
    const scope = getPropertyScope(req.user.id);
    if (scope !== null) {
      if (scope.length === 0) {
        return res.json({ data: [], total: 0, page: 1, limit: 25 });
      }
      conditions.push(`wr.property_id IN (${scope.map(() => '?').join(',')})`);
      params.push(...scope);
    }

    if (req.query.status) {
      conditions.push('wr.status = ?');
      params.push(req.query.status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY wr.created_at DESC';

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;

    let countSql = `SELECT COUNT(*) as total FROM work_requests wr`;
    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
    }
    const { total } = db.prepare(countSql).get(...params);

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const requests = db.prepare(sql).all(...params);
    res.json({
      data: requests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests', details: err.message });
  }
});

// GET /pending-count — get count of pending requests (for badge)
router.get('/pending-count', (req, res) => {
  try {
    const row = db.prepare('SELECT COUNT(*) AS count FROM work_requests WHERE status = ?').get('pending');
    res.json({ count: row.count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending count', details: err.message });
  }
});

// GET /:id — get request details
router.get('/:id', (req, res) => {
  try {
    const request = db.prepare(`
      SELECT wr.*,
        p.name AS property_name,
        u.name AS approved_by_name
      FROM work_requests wr
      LEFT JOIN properties p ON wr.property_id = p.id
      LEFT JOIN users u ON wr.approved_by = u.id
      WHERE wr.id = ?
    `).get(req.params.id);

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    res.json(request);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch request', details: err.message });
  }
});

// POST /:id/approve — approve request and create work order
router.post('/:id/approve', requireRole('admin', 'manager'), (req, res) => {
  try {
    const request = db.prepare('SELECT * FROM work_requests WHERE id = ?').get(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }

    const { title, description, property_id, priority, assigned_to, assigned_team_id, category, due_date } = req.body;

    // Create work order from request
    const woResult = db.prepare(`
      INSERT INTO work_orders (title, description, property_id, priority, assigned_to, assigned_team_id, category, due_date, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
    `).run(
      title || request.title,
      description || request.description || null,
      property_id || request.property_id,
      priority || request.priority || 'medium',
      assigned_to || null,
      assigned_team_id || null,
      category || null,
      due_date || null,
      req.user.id
    );

    const workOrderId = woResult.lastInsertRowid;

    // Update request status
    db.prepare(`
      UPDATE work_requests SET status = 'approved', approved_by = ?, work_order_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.user.id, workOrderId, req.params.id);

    const updatedRequest = db.prepare('SELECT * FROM work_requests WHERE id = ?').get(req.params.id);
    const workOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(workOrderId);

    logActivity('work_request', request.id, 'approved', `Request approved by ${req.user.name}`, req.user.id);
    logActivity('work_order', workOrderId, 'created', `Created from work request #${request.id}`, req.user.id);

    res.json({ request: updatedRequest, work_order: workOrder });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve request', details: err.message });
  }
});

// POST /:id/decline — decline request
router.post('/:id/decline', requireRole('admin', 'manager'), (req, res) => {
  try {
    const request = db.prepare('SELECT * FROM work_requests WHERE id = ?').get(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }

    db.prepare(`
      UPDATE work_requests SET status = 'declined', approved_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.user.id, req.params.id);

    const updatedRequest = db.prepare('SELECT * FROM work_requests WHERE id = ?').get(req.params.id);
    logActivity('work_request', request.id, 'declined', `Request declined by ${req.user.name}`, req.user.id);

    res.json(updatedRequest);
  } catch (err) {
    res.status(500).json({ error: 'Failed to decline request', details: err.message });
  }
});

// DELETE /:id
router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM work_requests WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Request not found' });
    }

    db.prepare('DELETE FROM work_requests WHERE id = ?').run(req.params.id);
    logActivity('work_request', parseInt(req.params.id), 'deleted', `Work request "${existing.title}" deleted`, req.user.id);

    res.json({ message: 'Request deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete request', details: err.message });
  }
});

module.exports = router;
