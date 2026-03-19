const express = require('express');
const { db, logActivity } = require('../db');

const router = express.Router();

// GET /reports/work-orders
router.get('/work-orders', (req, res) => {
  try {
    const { start_date, end_date, property_id } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (start_date) {
      whereClause += ' AND wo.created_at >= ?';
      params.push(start_date);
    }
    if (end_date) {
      whereClause += ' AND wo.created_at <= ?';
      params.push(end_date + ' 23:59:59');
    }
    if (property_id) {
      whereClause += ' AND wo.property_id = ?';
      params.push(property_id);
    }

    const total = db.prepare(`SELECT COUNT(*) AS count FROM work_orders wo WHERE ${whereClause}`).get(...params).count;

    const completed = db.prepare(
      `SELECT COUNT(*) AS count FROM work_orders wo WHERE ${whereClause} AND wo.status = 'completed'`
    ).get(...params).count;

    const avgCompletion = db.prepare(`
      SELECT AVG((julianday(wo.completed_at) - julianday(wo.created_at)) * 24) AS avg_hours
      FROM work_orders wo
      WHERE ${whereClause} AND wo.status = 'completed' AND wo.completed_at IS NOT NULL
    `).get(...params);

    const byPriority = db.prepare(`
      SELECT wo.priority, COUNT(*) AS count
      FROM work_orders wo
      WHERE ${whereClause}
      GROUP BY wo.priority
    `).all(...params);

    const byCategory = db.prepare(`
      SELECT COALESCE(wo.category, 'Uncategorized') AS category, COUNT(*) AS count
      FROM work_orders wo
      WHERE ${whereClause}
      GROUP BY wo.category
    `).all(...params);

    const byProperty = db.prepare(`
      SELECT p.name AS property_name, COUNT(*) AS count
      FROM work_orders wo
      LEFT JOIN properties p ON wo.property_id = p.id
      WHERE ${whereClause}
      GROUP BY wo.property_id
    `).all(...params);

    const completion_rate = total > 0 ? Math.round((completed / total) * 100) : 0;

    res.json({
      total,
      completed,
      avg_completion_time_hours: avgCompletion.avg_hours ? Math.round(avgCompletion.avg_hours * 10) / 10 : 0,
      by_priority: byPriority,
      by_category: byCategory,
      by_property: byProperty,
      completion_rate
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch work order reports', details: err.message });
  }
});

// GET /reports/assets
router.get('/assets', (req, res) => {
  try {
    const { property_id } = req.query;
    let whereClause = '1=1';
    const params = [];

    if (property_id) {
      whereClause += ' AND a.property_id = ?';
      params.push(property_id);
    }

    const total_assets = db.prepare(`SELECT COUNT(*) AS count FROM assets a WHERE ${whereClause}`).get(...params).count;

    const byStatus = db.prepare(`
      SELECT a.status, COUNT(*) AS count
      FROM assets a
      WHERE ${whereClause}
      GROUP BY a.status
    `).all(...params);

    const assetsWithMostWO = db.prepare(`
      SELECT a.id, a.name, a.status, COUNT(wo.id) AS work_order_count
      FROM assets a
      LEFT JOIN work_orders wo ON wo.asset_id = a.id
      WHERE ${whereClause.replace(/a\./g, 'a.')}
      GROUP BY a.id
      ORDER BY work_order_count DESC
      LIMIT 10
    `).all(...params);

    const byCategory = db.prepare(`
      SELECT COALESCE(a.category, 'Uncategorized') AS category, COUNT(*) AS count
      FROM assets a
      WHERE ${whereClause}
      GROUP BY a.category
    `).all(...params);

    res.json({
      total_assets,
      by_status: byStatus,
      assets_with_most_work_orders: assetsWithMostWO,
      by_category: byCategory
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch asset reports', details: err.message });
  }
});

// GET /reports/teams
router.get('/teams', (req, res) => {
  try {
    const teams = db.prepare(`
      SELECT
        t.id,
        t.name,
        COUNT(wo.id) AS work_orders_assigned,
        SUM(CASE WHEN wo.status = 'completed' THEN 1 ELSE 0 END) AS completed,
        CASE
          WHEN COUNT(wo.id) > 0
          THEN ROUND(SUM(CASE WHEN wo.status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(wo.id))
          ELSE 0
        END AS completion_rate,
        AVG(
          CASE WHEN wo.status = 'completed' AND wo.completed_at IS NOT NULL
          THEN (julianday(wo.completed_at) - julianday(wo.created_at)) * 24
          ELSE NULL END
        ) AS avg_completion_hours
      FROM teams t
      LEFT JOIN work_orders wo ON wo.assigned_team_id = t.id
      GROUP BY t.id
      ORDER BY t.name
    `).all();

    res.json({
      teams: teams.map(t => ({
        ...t,
        avg_completion_hours: t.avg_completion_hours ? Math.round(t.avg_completion_hours * 10) / 10 : 0
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch team reports', details: err.message });
  }
});

// GET /reports/parts
router.get('/parts', (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const total_parts = db.prepare('SELECT COUNT(*) AS count FROM parts').get().count;

    const totalValue = db.prepare('SELECT SUM(quantity * unit_cost) AS total FROM parts').get();

    const low_stock_count = db.prepare(
      'SELECT COUNT(*) AS count FROM parts WHERE quantity <= min_quantity'
    ).get().count;

    const byCategory = db.prepare(`
      SELECT COALESCE(category, 'Uncategorized') AS category, COUNT(*) AS count,
        SUM(quantity * unit_cost) AS category_value
      FROM parts
      GROUP BY category
    `).all();

    res.json({
      total_parts,
      total_value: totalValue.total || 0,
      low_stock_count,
      by_category: byCategory
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch parts reports', details: err.message });
  }
});

// GET /reports/preventive
router.get('/preventive', (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const total_schedules = db.prepare('SELECT COUNT(*) AS count FROM preventive_schedules').get().count;
    const active_schedules = db.prepare(
      'SELECT COUNT(*) AS count FROM preventive_schedules WHERE is_active = 1'
    ).get().count;

    const today = new Date().toISOString().split('T')[0];
    const overdue_count = db.prepare(
      "SELECT COUNT(*) AS count FROM preventive_schedules WHERE is_active = 1 AND next_due < ?"
    ).get(today).count;

    // Compliance: completed PM work orders vs total PM work orders generated
    let complianceWhere = "wo.title LIKE '[PM]%'";
    const complianceParams = [];
    if (start_date) {
      complianceWhere += ' AND wo.created_at >= ?';
      complianceParams.push(start_date);
    }
    if (end_date) {
      complianceWhere += ' AND wo.created_at <= ?';
      complianceParams.push(end_date + ' 23:59:59');
    }

    const pmTotal = db.prepare(
      `SELECT COUNT(*) AS count FROM work_orders wo WHERE ${complianceWhere}`
    ).get(...complianceParams).count;

    const pmCompleted = db.prepare(
      `SELECT COUNT(*) AS count FROM work_orders wo WHERE ${complianceWhere} AND wo.status = 'completed'`
    ).get(...complianceParams).count;

    const compliance_rate = pmTotal > 0 ? Math.round((pmCompleted / pmTotal) * 100) : 100;

    const byFrequency = db.prepare(`
      SELECT frequency, COUNT(*) AS count
      FROM preventive_schedules
      GROUP BY frequency
    `).all();

    res.json({
      total_schedules,
      active_schedules,
      compliance_rate,
      overdue_count,
      by_frequency: byFrequency
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch preventive reports', details: err.message });
  }
});

// GET /reports/time-logs
router.get('/time-logs', (req, res) => {
  try {
    const { start_date, end_date, user_id } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (start_date) {
      whereClause += ' AND tl.logged_at >= ?';
      params.push(start_date);
    }
    if (end_date) {
      whereClause += ' AND tl.logged_at <= ?';
      params.push(end_date + ' 23:59:59');
    }
    if (user_id) {
      whereClause += ' AND tl.user_id = ?';
      params.push(user_id);
    }

    const totalHours = db.prepare(
      `SELECT COALESCE(SUM(tl.hours), 0) AS total FROM time_logs tl WHERE ${whereClause}`
    ).get(...params);

    const byUser = db.prepare(`
      SELECT u.name, u.id AS user_id, SUM(tl.hours) AS total_hours, COUNT(tl.id) AS entries
      FROM time_logs tl
      JOIN users u ON tl.user_id = u.id
      WHERE ${whereClause}
      GROUP BY tl.user_id
      ORDER BY total_hours DESC
    `).all(...params);

    const byWorkOrder = db.prepare(`
      SELECT wo.title, wo.id AS work_order_id, SUM(tl.hours) AS total_hours, COUNT(tl.id) AS entries
      FROM time_logs tl
      JOIN work_orders wo ON tl.work_order_id = wo.id
      WHERE ${whereClause}
      GROUP BY tl.work_order_id
      ORDER BY total_hours DESC
      LIMIT 20
    `).all(...params);

    res.json({
      total_hours: totalHours.total,
      by_user: byUser,
      by_work_order: byWorkOrder
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch time log reports', details: err.message });
  }
});

// POST /time-logs (mounted at /api/time-logs)
// GET /time-logs/work-order/:id (mounted at /api/time-logs)
// These are handled by a separate mini-router exported alongside

// GET /mtbf-mttr - Mean Time Between Failures and Mean Time To Repair
router.get('/mtbf-mttr', (req, res) => {
  try {
    // Get assets with downtime history
    const assets = db.prepare(`
      SELECT a.id, a.name, a.category, p.name AS property_name,
        COUNT(ad.id) AS failure_count,
        AVG(CASE WHEN ad.ended_at IS NOT NULL
          THEN (julianday(ad.ended_at) - julianday(ad.started_at)) * 24
          ELSE NULL END) AS avg_repair_hours
      FROM assets a
      LEFT JOIN asset_downtime ad ON a.id = ad.asset_id
      LEFT JOIN properties p ON a.property_id = p.id
      GROUP BY a.id
      HAVING failure_count > 0
      ORDER BY failure_count DESC
    `).all();

    res.json(assets);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate MTBF/MTTR report', details: err.message });
  }
});

// GET /costs - Cost analysis
router.get('/costs', (req, res) => {
  try {
    const { start_date, end_date, property_id } = req.query;

    let woPartsCostSql = `
      SELECT COALESCE(SUM(wop.quantity_used * wop.unit_cost), 0) AS parts_cost
      FROM work_order_parts wop
      JOIN work_orders wo ON wop.work_order_id = wo.id
      WHERE 1=1
    `;
    const params = [];
    if (start_date) { woPartsCostSql += ' AND wo.created_at >= ?'; params.push(start_date); }
    if (end_date) { woPartsCostSql += ' AND wo.created_at <= ?'; params.push(end_date); }
    if (property_id) { woPartsCostSql += ' AND wo.property_id = ?'; params.push(property_id); }

    const partsCost = db.prepare(woPartsCostSql).get(...params);

    // Cost by property
    const byProperty = db.prepare(`
      SELECT p.name, COALESCE(SUM(wop.quantity_used * wop.unit_cost), 0) AS cost
      FROM properties p
      LEFT JOIN work_orders wo ON wo.property_id = p.id
      LEFT JOIN work_order_parts wop ON wop.work_order_id = wo.id
      GROUP BY p.id ORDER BY cost DESC
    `).all();

    // Cost by category
    const byCategory = db.prepare(`
      SELECT wo.category, COALESCE(SUM(wop.quantity_used * wop.unit_cost), 0) AS cost
      FROM work_orders wo
      LEFT JOIN work_order_parts wop ON wop.work_order_id = wo.id
      WHERE wo.category IS NOT NULL
      GROUP BY wo.category ORDER BY cost DESC
    `).all();

    // PO spending
    const poSpending = db.prepare("SELECT COALESCE(SUM(total_cost), 0) AS total FROM purchase_orders WHERE status = 'received'").get();

    res.json({
      parts_cost: partsCost.parts_cost,
      po_spending: poSpending.total,
      by_property: byProperty,
      by_category: byCategory
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate cost report', details: err.message });
  }
});

// GET /trends - Work order trends over time
router.get('/trends', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().split('T')[0];

    // Created per day
    const created = db.prepare(`
      SELECT DATE(created_at) AS date, COUNT(*) AS count
      FROM work_orders WHERE created_at >= ?
      GROUP BY DATE(created_at) ORDER BY date
    `).all(startStr);

    // Completed per day
    const completed = db.prepare(`
      SELECT DATE(completed_at) AS date, COUNT(*) AS count
      FROM work_orders WHERE completed_at IS NOT NULL AND completed_at >= ?
      GROUP BY DATE(completed_at) ORDER BY date
    `).all(startStr);

    res.json({ created, completed, days });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate trends', details: err.message });
  }
});

module.exports = router;
