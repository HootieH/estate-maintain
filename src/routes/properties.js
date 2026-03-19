const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { grantPropertyAccess, getPropertyScope } = require('../middleware/permissions');

const router = express.Router();

router.use(authenticate);

// GET /
router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT p.*,
        (SELECT COUNT(*) FROM assets a WHERE a.property_id = p.id) AS asset_count,
        (SELECT COUNT(*) FROM work_orders wo WHERE wo.property_id = p.id AND wo.status IN ('open','in_progress','on_hold')) AS open_work_order_count
      FROM properties p
    `;
    const conditions = [];
    const params = [];

    // Property scoping — users only see properties they have access to
    const scope = getPropertyScope(req.user.id);
    if (scope !== null) {
      if (scope.length === 0) {
        return res.json({ data: [], total: 0, page: 1, limit: 25 });
      }
      conditions.push(`p.id IN (${scope.map(() => '?').join(',')})`);
      params.push(...scope);
    }

    if (req.query.team_id) {
      conditions.push('p.team_id = ?');
      params.push(req.query.team_id);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY p.name';

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;

    let countSql = `SELECT COUNT(*) as total FROM properties p`;
    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
    }
    const { total } = db.prepare(countSql).get(...params);

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const properties = db.prepare(sql).all(...params);
    res.json({
      data: properties,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch properties', details: err.message });
  }
});

// GET /:id - Property hub with comprehensive stats
router.get('/:id', (req, res) => {
  try {
    const property = db.prepare(`
      SELECT p.*, t.name AS team_name
      FROM properties p
      LEFT JOIN teams t ON p.team_id = t.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Asset stats
    const assetStats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'operational' THEN 1 ELSE 0 END) AS operational,
        SUM(CASE WHEN status = 'needs_repair' THEN 1 ELSE 0 END) AS needs_repair,
        SUM(CASE WHEN status = 'out_of_service' THEN 1 ELSE 0 END) AS out_of_service,
        SUM(CASE WHEN status = 'retired' THEN 1 ELSE 0 END) AS retired
      FROM assets WHERE property_id = ?
    `).get(req.params.id);
    property.asset_stats = assetStats;

    // Active downtime
    const downtimeCount = db.prepare(`
      SELECT COUNT(*) AS count FROM asset_downtime ad
      JOIN assets a ON ad.asset_id = a.id
      WHERE a.property_id = ? AND ad.ended_at IS NULL
    `).get(req.params.id);
    property.assets_down = downtimeCount.count;

    // Work order stats
    const woStats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN status = 'on_hold' THEN 1 ELSE 0 END) AS on_hold,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status IN ('open','in_progress','on_hold') AND due_date < DATE('now') THEN 1 ELSE 0 END) AS overdue
      FROM work_orders WHERE property_id = ?
    `).get(req.params.id);
    property.wo_stats = woStats;

    // PM stats
    const pmStats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN is_active = 1 AND next_due <= DATE('now') THEN 1 ELSE 0 END) AS overdue
      FROM preventive_schedules WHERE property_id = ?
    `).get(req.params.id);
    property.pm_stats = pmStats;

    // Active projects
    const projectStats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('draft','bidding','evaluating') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'awarded' THEN 1 ELSE 0 END) AS awarded
      FROM projects WHERE property_id = ?
    `).get(req.params.id);
    property.project_stats = projectStats;

    // Parts at this property
    const partStats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN quantity <= min_quantity THEN 1 ELSE 0 END) AS low_stock,
        COALESCE(SUM(quantity * unit_cost), 0) AS total_value
      FROM parts WHERE property_id = ?
    `).get(req.params.id);
    property.part_stats = partStats;

    // Spending: parts used on WOs for this property
    const spending = db.prepare(`
      SELECT COALESCE(SUM(wop.quantity_used * wop.unit_cost), 0) AS parts_spend
      FROM work_order_parts wop
      JOIN work_orders wo ON wop.work_order_id = wo.id
      WHERE wo.property_id = ?
    `).get(req.params.id);
    property.parts_spend = spending.parts_spend;

    // PO spending for this property
    const poSpend = db.prepare(`
      SELECT COALESCE(SUM(total_cost), 0) AS po_spend
      FROM purchase_orders WHERE property_id = ? AND status = 'received'
    `).get(req.params.id);
    property.po_spend = poSpend.po_spend;

    // Upcoming PM (next 14 days)
    const upcomingPM = db.prepare(`
      SELECT ps.id, ps.title, ps.frequency, ps.next_due, ps.priority, a.name AS asset_name
      FROM preventive_schedules ps
      LEFT JOIN assets a ON ps.asset_id = a.id
      WHERE ps.property_id = ? AND ps.is_active = 1 AND ps.next_due <= DATE('now', '+14 days')
      ORDER BY ps.next_due ASC
      LIMIT 5
    `).all(req.params.id);
    property.upcoming_pm = upcomingPM;

    // Recent work orders (last 10)
    const recentWOs = db.prepare(`
      SELECT wo.id, wo.title, wo.priority, wo.status, wo.created_at, wo.due_date,
        u.name AS assigned_to_name
      FROM work_orders wo
      LEFT JOIN users u ON wo.assigned_to = u.id
      WHERE wo.property_id = ?
      ORDER BY wo.created_at DESC
      LIMIT 10
    `).all(req.params.id);
    property.recent_work_orders = recentWOs;

    // Recent activity for this property
    const recentActivity = db.prepare(`
      SELECT al.*, u.name AS user_name
      FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE (al.entity_type = 'property' AND al.entity_id = ?)
        OR (al.entity_type = 'work_order' AND al.entity_id IN (SELECT id FROM work_orders WHERE property_id = ?))
        OR (al.entity_type = 'asset' AND al.entity_id IN (SELECT id FROM assets WHERE property_id = ?))
      ORDER BY al.created_at DESC
      LIMIT 10
    `).all(req.params.id, req.params.id, req.params.id);
    property.recent_activity = recentActivity;

    // Active projects for this property
    const activeProjects = db.prepare(`
      SELECT p.id, p.title, p.status, p.budget_min, p.budget_max,
        (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id) AS bid_count
      FROM projects p
      WHERE p.property_id = ? AND p.status NOT IN ('completed', 'cancelled')
      ORDER BY p.created_at DESC
      LIMIT 5
    `).all(req.params.id);
    property.active_projects = activeProjects;

    // Team members (if team assigned)
    if (property.team_id) {
      const members = db.prepare(`
        SELECT u.id, u.name, u.role, u.avatar_color, u.email
        FROM users u JOIN user_teams ut ON u.id = ut.user_id
        WHERE ut.team_id = ? AND u.is_active = 1
        ORDER BY u.name
      `).all(property.team_id);
      property.team_members = members;
    } else {
      property.team_members = [];
    }

    res.json(property);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch property', details: err.message });
  }
});

// POST /
router.post('/', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { name, address, type, notes, team_id, image_url, year_built, square_footage } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Property name is required' });
    }

    const result = db.prepare(
      'INSERT INTO properties (name, address, type, notes, team_id, image_url, year_built, square_footage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(name, address || null, type || 'estate', notes || null, team_id || null, image_url || null, year_built || null, square_footage || null);

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid);

    // Auto-grant property access to the creator
    grantPropertyAccess(req.user.id, property.id, req.user.id);

    logActivity('property', property.id, 'created', `Property "${name}" created`, req.user.id);

    res.status(201).json(property);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create property', details: err.message });
  }
});

// PUT /:id
router.put('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const { name, address, type, notes, team_id, image_url, year_built, square_footage } = req.body;

    db.prepare(`
      UPDATE properties SET name = ?, address = ?, type = ?, notes = ?, team_id = ?, image_url = ?, year_built = ?, square_footage = ?
      WHERE id = ?
    `).run(
      name || existing.name,
      address !== undefined ? address : existing.address,
      type || existing.type,
      notes !== undefined ? notes : existing.notes,
      team_id !== undefined ? team_id : existing.team_id,
      image_url !== undefined ? image_url : existing.image_url,
      year_built !== undefined ? year_built : existing.year_built,
      square_footage !== undefined ? square_footage : existing.square_footage,
      req.params.id
    );

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    logActivity('property', property.id, 'updated', `Property "${property.name}" updated`, req.user.id);

    res.json(property);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update property', details: err.message });
  }
});

// DELETE /:id
router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Property not found' });
    }

    db.prepare('DELETE FROM properties WHERE id = ?').run(req.params.id);
    logActivity('property', parseInt(req.params.id), 'deleted', `Property "${existing.name}" deleted`, req.user.id);

    res.json({ message: 'Property deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete property', details: err.message });
  }
});

module.exports = router;
