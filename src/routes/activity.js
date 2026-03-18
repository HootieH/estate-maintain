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

    sql += ' ORDER BY al.created_at DESC LIMIT 50';
    const activities = db.prepare(sql).all(...params);
    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity log', details: err.message });
  }
});

module.exports = router;
