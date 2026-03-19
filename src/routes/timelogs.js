const express = require('express');
const { db, logActivity } = require('../db');

const router = express.Router();

// GET / — list time logs (optionally filtered by work_order_id)
router.get('/', (req, res) => {
  try {
    const { work_order_id } = req.query;

    let sql = `
      SELECT tl.*, u.name AS user_name
      FROM time_logs tl
      JOIN users u ON tl.user_id = u.id
    `;
    const params = [];

    if (work_order_id) {
      sql += ' WHERE tl.work_order_id = ?';
      params.push(work_order_id);
    }

    sql += ' ORDER BY tl.logged_at DESC';

    const logs = db.prepare(sql).all(...params);

    let total_hours = 0;
    if (work_order_id) {
      const result = db.prepare(
        'SELECT COALESCE(SUM(hours), 0) AS total FROM time_logs WHERE work_order_id = ?'
      ).get(work_order_id);
      total_hours = result.total;
    } else {
      const result = db.prepare(
        'SELECT COALESCE(SUM(hours), 0) AS total FROM time_logs'
      ).get();
      total_hours = result.total;
    }

    res.json({ logs, total_hours });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch time logs', details: err.message });
  }
});

// POST /time-logs — create time log entry
router.post('/', (req, res) => {
  try {
    const { work_order_id, hours, description } = req.body;

    if (!work_order_id || !hours) {
      return res.status(400).json({ error: 'work_order_id and hours are required' });
    }

    if (typeof hours !== 'number' || hours <= 0) {
      return res.status(400).json({ error: 'hours must be a positive number' });
    }

    // Verify work order exists
    const wo = db.prepare('SELECT id FROM work_orders WHERE id = ?').get(work_order_id);
    if (!wo) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const result = db.prepare(
      'INSERT INTO time_logs (work_order_id, user_id, hours, description) VALUES (?, ?, ?, ?)'
    ).run(work_order_id, req.user.id, hours, description || null);

    logActivity('time_log', result.lastInsertRowid, 'created',
      `Logged ${hours}h on work order #${work_order_id}`, req.user.id);

    const entry = db.prepare('SELECT * FROM time_logs WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create time log', details: err.message });
  }
});

// GET /time-logs/work-order/:id — get time logs for a work order
router.get('/work-order/:id', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT tl.*, u.name AS user_name
      FROM time_logs tl
      JOIN users u ON tl.user_id = u.id
      WHERE tl.work_order_id = ?
      ORDER BY tl.logged_at DESC
    `).all(req.params.id);

    const totalHours = db.prepare(
      'SELECT COALESCE(SUM(hours), 0) AS total FROM time_logs WHERE work_order_id = ?'
    ).get(req.params.id);

    res.json({
      logs,
      total_hours: totalHours.total
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch time logs', details: err.message });
  }
});

module.exports = router;
