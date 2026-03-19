const express = require('express');
const { db } = require('../db');

const router = express.Router();

// GET / — list user's notifications
router.get('/', (req, res) => {
  try {
    let sql = 'SELECT * FROM notifications WHERE user_id = ?';
    const params = [req.user.id];

    if (req.query.unread === 'true') {
      sql += ' AND is_read = 0';
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(req.query.limit) || 50);

    const notifications = db.prepare(sql).all(...params);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications', details: err.message });
  }
});

// GET /count — unread count
router.get('/count', (req, res) => {
  try {
    const row = db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id);
    res.json({ count: row.count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notification count', details: err.message });
  }
});

// PUT /:id/read — mark single as read
router.put('/:id/read', (req, res) => {
  try {
    const result = db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification as read', details: err.message });
  }
});

// POST /read-all — mark all as read
router.post('/read-all', (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.user.id);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notifications as read', details: err.message });
  }
});

module.exports = router;
