const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

// GET / — Paginated, filterable audit log
router.get('/', authenticate, requirePermission('audit_log:view'), (req, res) => {
  try {
    const {
      user_id,
      action,
      entity_type,
      start_date,
      end_date,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (user_id) {
      conditions.push('al.user_id = ?');
      params.push(user_id);
    }
    if (action) {
      conditions.push('al.action = ?');
      params.push(action);
    }
    if (entity_type) {
      conditions.push('al.entity_type = ?');
      params.push(entity_type);
    }
    if (start_date) {
      conditions.push('al.created_at >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('al.created_at <= ?');
      params.push(end_date);
    }
    if (search) {
      conditions.push('(al.details LIKE ? OR u.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db.prepare(`
      SELECT COUNT(*) as total FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
    `).get(...params);

    const rows = db.prepare(`
      SELECT al.*, u.name as user_name, u.avatar_color as user_avatar
      FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    res.json({
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countRow.total,
        total_pages: Math.ceil(countRow.total / limitNum),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit log', details: err.message });
  }
});

// GET /export — CSV export of filtered audit log
router.get('/export', authenticate, requirePermission('audit_log:export'), (req, res) => {
  try {
    const {
      user_id,
      action,
      entity_type,
      start_date,
      end_date,
      search,
    } = req.query;

    const conditions = [];
    const params = [];

    if (user_id) {
      conditions.push('al.user_id = ?');
      params.push(user_id);
    }
    if (action) {
      conditions.push('al.action = ?');
      params.push(action);
    }
    if (entity_type) {
      conditions.push('al.entity_type = ?');
      params.push(entity_type);
    }
    if (start_date) {
      conditions.push('al.created_at >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('al.created_at <= ?');
      params.push(end_date);
    }
    if (search) {
      conditions.push('(al.details LIKE ? OR u.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT al.id, al.entity_type, al.entity_id, al.action, al.details,
             al.created_at, u.name as user_name
      FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      ORDER BY al.created_at DESC
    `).all(...params);

    const header = 'ID,Timestamp,User,Entity Type,Entity ID,Action,Details';
    const csvRows = rows.map(r => {
      const details = (r.details || '').replace(/"/g, '""');
      const userName = (r.user_name || '').replace(/"/g, '""');
      return `${r.id},"${r.created_at}","${userName}","${r.entity_type}",${r.entity_id},"${r.action}","${details}"`;
    });

    const csv = [header, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit_log.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export audit log', details: err.message });
  }
});

module.exports = router;
