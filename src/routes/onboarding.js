const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /status - Get onboarding status and setup checklist
router.get('/status', authenticate, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, role, onboarding_completed FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Build setup checklist with counts
    const propertyCount = db.prepare('SELECT COUNT(*) as count FROM properties').get().count;
    const assetCount = db.prepare('SELECT COUNT(*) as count FROM assets').get().count;
    const teamCount = db.prepare('SELECT COUNT(*) as count FROM teams').get().count;
    const memberCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count;
    const workOrderCount = db.prepare('SELECT COUNT(*) as count FROM work_orders').get().count;
    const pmCount = db.prepare('SELECT COUNT(*) as count FROM preventive_schedules WHERE is_active = 1').get().count;
    const vendorCount = db.prepare('SELECT COUNT(*) as count FROM vendors WHERE is_active = 1').get().count;
    const partCount = db.prepare('SELECT COUNT(*) as count FROM parts').get().count;

    res.json({
      onboarding_completed: user.onboarding_completed || 0,
      role: user.role,
      name: user.name,
      checklist: {
        properties: propertyCount,
        assets: assetCount,
        teams: teamCount,
        members: memberCount,
        work_orders: workOrderCount,
        preventive_schedules: pmCount,
        vendors: vendorCount,
        parts: partCount
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get onboarding status', details: err.message });
  }
});

// PUT /complete - Mark onboarding as complete
router.put('/complete', authenticate, (req, res) => {
  try {
    db.prepare('UPDATE users SET onboarding_completed = 1 WHERE id = ?').run(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update onboarding status', details: err.message });
  }
});

module.exports = router;
