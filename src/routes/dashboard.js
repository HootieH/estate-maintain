const express = require('express');
const { db } = require('../db');

const router = express.Router();

// GET /
router.get('/', (req, res) => {
  try {
    const totalProperties = db.prepare('SELECT COUNT(*) AS count FROM properties').get().count;
    const totalAssets = db.prepare('SELECT COUNT(*) AS count FROM assets').get().count;
    const openWorkOrders = db.prepare(
      "SELECT COUNT(*) AS count FROM work_orders WHERE status IN ('open','in_progress','on_hold')"
    ).get().count;

    const today = new Date().toISOString().split('T')[0];
    const overdueWorkOrders = db.prepare(
      "SELECT COUNT(*) AS count FROM work_orders WHERE due_date < ? AND status NOT IN ('completed','cancelled')"
    ).get(today).count;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const completedThisMonth = db.prepare(
      "SELECT COUNT(*) AS count FROM work_orders WHERE status = 'completed' AND completed_at >= ?"
    ).get(startOfMonth.toISOString()).count;

    const priorityCounts = db.prepare(`
      SELECT priority, COUNT(*) AS count FROM work_orders
      WHERE status NOT IN ('completed','cancelled')
      GROUP BY priority
    `).all();
    const workOrdersByPriority = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const row of priorityCounts) {
      workOrdersByPriority[row.priority] = row.count;
    }

    const statusCounts = db.prepare(
      'SELECT status, COUNT(*) AS count FROM work_orders GROUP BY status'
    ).all();
    const workOrdersByStatus = { open: 0, in_progress: 0, on_hold: 0, completed: 0, cancelled: 0 };
    for (const row of statusCounts) {
      workOrdersByStatus[row.status] = row.count;
    }

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const upcomingPreventive = db.prepare(`
      SELECT ps.*, p.name AS property_name
      FROM preventive_schedules ps
      LEFT JOIN properties p ON ps.property_id = p.id
      WHERE ps.is_active = 1 AND ps.next_due <= ?
      ORDER BY ps.next_due ASC
    `).all(sevenDaysFromNow.toISOString().split('T')[0]);

    const lowStockParts = db.prepare(`
      SELECT pt.*, p.name AS property_name
      FROM parts pt
      LEFT JOIN properties p ON pt.property_id = p.id
      WHERE pt.quantity <= pt.min_quantity
      ORDER BY pt.name
    `).all();

    const recentActivity = db.prepare(`
      SELECT al.*, u.name AS user_name
      FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 20
    `).all();

    res.json({
      totalProperties,
      totalAssets,
      openWorkOrders,
      overdueWorkOrders,
      completedThisMonth,
      workOrdersByPriority,
      workOrdersByStatus,
      upcomingPreventive,
      lowStockParts,
      recentActivity,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dashboard data', details: err.message });
  }
});

module.exports = router;
