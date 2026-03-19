const express = require('express');
const { db } = require('../db');

const router = express.Router();

// GET /
router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT al.*, u.name AS user_name
      FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
    `;
    const conditions = [];
    const params = [];

    if (req.query.entity_type) {
      conditions.push('al.entity_type = ?');
      params.push(req.query.entity_type);
    }
    if (req.query.entity_id) {
      conditions.push('al.entity_id = ?');
      params.push(req.query.entity_id);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY al.created_at DESC';

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;

    let countSql = `SELECT COUNT(*) as total FROM activity_log al`;
    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
    }
    const { total } = db.prepare(countSql).get(...params);

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const activities = db.prepare(sql).all(...params);
    res.json({
      data: activities,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity log', details: err.message });
  }
});

module.exports = router;
