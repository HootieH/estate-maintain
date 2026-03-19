const express = require('express');
const { db } = require('../db');
const { getPropertyScope } = require('../middleware/permissions');

const router = express.Router();

// GET /
router.get('/', (req, res) => {
  try {
    // Property scoping — users only see dashboard data from properties they have access to
    const scope = req.user ? getPropertyScope(req.user.id) : null;
    if (scope !== null && scope.length === 0) {
      return res.json({
        totalProperties: 0,
        totalAssets: 0,
        openWorkOrders: 0,
        overdueWorkOrders: 0,
        completedThisMonth: 0,
        workOrdersByPriority: { low: 0, medium: 0, high: 0, critical: 0 },
        workOrdersByStatus: { open: 0, in_progress: 0, on_hold: 0, completed: 0, cancelled: 0 },
        upcomingPreventive: [],
        lowStockParts: [],
        recentActivity: [],
        assetsDown: 0,
        createdTrend: [],
        completedTrend: [],
      });
    }

    // Build scope SQL fragments
    const hasScopeFilter = scope !== null;
    const propFilter = hasScopeFilter ? ` WHERE id IN (${scope.map(() => '?').join(',')})` : '';
    const propParams = hasScopeFilter ? [...scope] : [];
    const woFilter = hasScopeFilter ? ` AND property_id IN (${scope.map(() => '?').join(',')})` : '';
    const woFilterWhere = hasScopeFilter ? ` WHERE property_id IN (${scope.map(() => '?').join(',')})` : '';
    const woParams = hasScopeFilter ? [...scope] : [];

    const totalProperties = db.prepare(`SELECT COUNT(*) AS count FROM properties${propFilter}`).get(...propParams).count;
    const totalAssets = db.prepare(`SELECT COUNT(*) AS count FROM assets${hasScopeFilter ? ` WHERE property_id IN (${scope.map(() => '?').join(',')})` : ''}`).get(...woParams).count;
    const openWorkOrders = db.prepare(
      `SELECT COUNT(*) AS count FROM work_orders WHERE status IN ('open','in_progress','on_hold')${woFilter}`
    ).get(...woParams).count;

    const today = new Date().toISOString().split('T')[0];
    const overdueWorkOrders = db.prepare(
      `SELECT COUNT(*) AS count FROM work_orders WHERE due_date < ? AND status NOT IN ('completed','cancelled')${woFilter}`
    ).get(today, ...woParams).count;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const completedThisMonth = db.prepare(
      `SELECT COUNT(*) AS count FROM work_orders WHERE status = 'completed' AND completed_at >= ?${woFilter}`
    ).get(startOfMonth.toISOString(), ...woParams).count;

    const priorityCounts = db.prepare(`
      SELECT priority, COUNT(*) AS count FROM work_orders
      WHERE status NOT IN ('completed','cancelled')${woFilter}
      GROUP BY priority
    `).all(...woParams);
    const workOrdersByPriority = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const row of priorityCounts) {
      workOrdersByPriority[row.priority] = row.count;
    }

    const statusCounts = db.prepare(
      `SELECT status, COUNT(*) AS count FROM work_orders${woFilterWhere} GROUP BY status`
    ).all(...woParams);
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
      WHERE ps.is_active = 1 AND ps.next_due <= ?${hasScopeFilter ? ` AND ps.property_id IN (${scope.map(() => '?').join(',')})` : ''}
      ORDER BY ps.next_due ASC
    `).all(sevenDaysFromNow.toISOString().split('T')[0], ...woParams);

    const lowStockParts = db.prepare(`
      SELECT pt.*, p.name AS property_name
      FROM parts pt
      LEFT JOIN properties p ON pt.property_id = p.id
      WHERE pt.quantity <= pt.min_quantity${hasScopeFilter ? ` AND pt.property_id IN (${scope.map(() => '?').join(',')})` : ''}
      ORDER BY pt.name
    `).all(...woParams);

    const recentActivity = db.prepare(`
      SELECT al.*, u.name AS user_name
      FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 20
    `).all();

    // Downtime summary
    const activeDowntime = db.prepare(`SELECT COUNT(*) AS count FROM asset_downtime WHERE ended_at IS NULL${hasScopeFilter ? ` AND asset_id IN (SELECT id FROM assets WHERE property_id IN (${scope.map(() => '?').join(',')}))` : ''}`).get(...woParams);

    // Recent 7 day trend
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const trendStart = sevenDaysAgo.toISOString().split('T')[0];
    const createdTrend = db.prepare(`SELECT DATE(created_at) AS date, COUNT(*) AS count FROM work_orders WHERE created_at >= ?${woFilter} GROUP BY DATE(created_at)`).all(trendStart, ...woParams);
    const completedTrend = db.prepare(`SELECT DATE(completed_at) AS date, COUNT(*) AS count FROM work_orders WHERE completed_at IS NOT NULL AND completed_at >= ?${woFilter} GROUP BY DATE(completed_at)`).all(trendStart, ...woParams);

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
      assetsDown: activeDowntime.count,
      createdTrend,
      completedTrend,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dashboard data', details: err.message });
  }
});

module.exports = router;
