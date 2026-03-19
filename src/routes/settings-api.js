const express = require('express');
const { db } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

// GET / - Get all system settings (public for some, auth for all)
router.get('/', authenticate, (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM system_settings').all();
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    res.json(obj);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings', details: err.message });
  }
});

// PUT / - Update settings (admin only)
router.put('/', authenticate, requireRole('admin'), (req, res) => {
  try {
    const updates = req.body;
    const upsert = db.prepare('INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP');
    for (const [key, value] of Object.entries(updates)) {
      upsert.run(key, String(value), String(value));
    }
    res.json({ message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings', details: err.message });
  }
});

// GET /preferences - Get user preferences
router.get('/preferences', authenticate, (req, res) => {
  try {
    let prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.id);
    if (!prefs) {
      db.prepare('INSERT OR IGNORE INTO user_preferences (user_id) VALUES (?)').run(req.user.id);
      prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.id);
    }
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch preferences', details: err.message });
  }
});

// PUT /preferences - Update user preferences
router.put('/preferences', authenticate, (req, res) => {
  try {
    const { theme, notifications_enabled, email_notifications, default_property_id, sidebar_collapsed } = req.body;
    db.prepare('INSERT OR IGNORE INTO user_preferences (user_id) VALUES (?)').run(req.user.id);

    const updates = [];
    const values = [];
    if (theme !== undefined) { updates.push('theme = ?'); values.push(theme); }
    if (notifications_enabled !== undefined) { updates.push('notifications_enabled = ?'); values.push(notifications_enabled ? 1 : 0); }
    if (email_notifications !== undefined) { updates.push('email_notifications = ?'); values.push(email_notifications ? 1 : 0); }
    if (default_property_id !== undefined) { updates.push('default_property_id = ?'); values.push(default_property_id); }
    if (sidebar_collapsed !== undefined) { updates.push('sidebar_collapsed = ?'); values.push(sidebar_collapsed ? 1 : 0); }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(req.user.id);
      db.prepare(`UPDATE user_preferences SET ${updates.join(', ')} WHERE user_id = ?`).run(...values);
    }

    const prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.id);
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update preferences', details: err.message });
  }
});

module.exports = router;
