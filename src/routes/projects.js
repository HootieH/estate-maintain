const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

// GET / - List projects
router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT p.*, pr.name AS property_name, u.name AS created_by_name,
        (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id) AS bid_count,
        (SELECT MIN(b2.total_amount) FROM bids b2 WHERE b2.project_id = p.id AND b2.status IN ('submitted','under_review','selected')) AS lowest_bid,
        (SELECT MAX(b3.total_amount) FROM bids b3 WHERE b3.project_id = p.id AND b3.status IN ('submitted','under_review','selected')) AS highest_bid
      FROM projects p
      LEFT JOIN properties pr ON p.property_id = pr.id
      LEFT JOIN users u ON p.created_by = u.id
    `;
    const conditions = [];
    const params = [];

    if (req.query.status) { conditions.push('p.status = ?'); params.push(req.query.status); }
    if (req.query.property_id) { conditions.push('p.property_id = ?'); params.push(req.query.property_id); }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY p.created_at DESC';

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;

    let countSql = 'SELECT COUNT(*) as total FROM projects p';
    if (conditions.length > 0) countSql += ' WHERE ' + conditions.join(' AND ');
    const { total } = db.prepare(countSql).get(...params);

    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const projects = db.prepare(sql).all(...params);

    res.json({ data: projects, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects', details: err.message });
  }
});

// GET /:id - Project detail with all bids
router.get('/:id', (req, res) => {
  try {
    const project = db.prepare(`
      SELECT p.*, pr.name AS property_name, pr.address AS property_address,
        u.name AS created_by_name
      FROM projects p
      LEFT JOIN properties pr ON p.property_id = pr.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `).get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Get all bids with vendor info
    const bids = db.prepare(`
      SELECT b.*, v.name AS vendor_name, v.email AS vendor_email, v.phone AS vendor_phone, v.specialty AS vendor_specialty
      FROM bids b
      JOIN vendors v ON b.vendor_id = v.id
      WHERE b.project_id = ?
      ORDER BY b.total_amount ASC
    `).all(req.params.id);

    // Get line items for each bid
    for (const bid of bids) {
      bid.items = db.prepare('SELECT * FROM bid_items WHERE bid_id = ? ORDER BY sort_order, category').all(bid.id);
    }

    project.bids = bids;

    // Compute leveling summary: aggregate by category across all bids
    const allCategories = ['materials', 'labor', 'equipment', 'permits', 'subcontractors', 'overhead', 'other'];
    const leveling = allCategories.map(cat => {
      const row = { category: cat };
      bids.forEach(bid => {
        const catTotal = (bid.items || [])
          .filter(i => i.category === cat)
          .reduce((sum, i) => sum + (i.amount || 0), 0);
        row['bid_' + bid.id] = catTotal;
      });
      return row;
    });
    project.leveling = leveling;

    // Find awarded bid details
    if (project.awarded_bid_id) {
      const awarded = bids.find(b => b.id === project.awarded_bid_id);
      project.awarded_bid = awarded || null;
    }

    res.json(project);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project', details: err.message });
  }
});

// POST / - Create project
router.post('/', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { title, description, scope_of_work, property_id, category, budget_min, budget_max, deadline, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const result = db.prepare(`
      INSERT INTO projects (title, description, scope_of_work, property_id, category, budget_min, budget_max, deadline, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, description || null, scope_of_work || null, property_id || null, category || null,
      budget_min || null, budget_max || null, deadline || null, notes || null, req.user.id);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
    logActivity('project', project.id, 'created', `Project "${title}" created`, req.user.id);
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project', details: err.message });
  }
});

// PUT /:id - Update project
router.put('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const { title, description, scope_of_work, property_id, category, budget_min, budget_max, deadline, status, notes } = req.body;

    db.prepare(`
      UPDATE projects SET title = ?, description = ?, scope_of_work = ?, property_id = ?, category = ?,
        budget_min = ?, budget_max = ?, deadline = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title || existing.title, description !== undefined ? description : existing.description,
      scope_of_work !== undefined ? scope_of_work : existing.scope_of_work,
      property_id !== undefined ? property_id : existing.property_id,
      category !== undefined ? category : existing.category,
      budget_min !== undefined ? budget_min : existing.budget_min,
      budget_max !== undefined ? budget_max : existing.budget_max,
      deadline !== undefined ? deadline : existing.deadline,
      status || existing.status, notes !== undefined ? notes : existing.notes,
      req.params.id
    );

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    logActivity('project', parseInt(req.params.id), 'updated', `Project "${project.title}" updated`, req.user.id);
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update project', details: err.message });
  }
});

// POST /:id/bids - Add a bid to a project
router.post('/:id/bids', requireRole('admin', 'manager'), (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { vendor_id, total_amount, timeline_days, start_date, completion_date, warranty_terms, payment_terms, inclusions, exclusions, notes, items } = req.body;
    if (!vendor_id) return res.status(400).json({ error: 'Vendor is required' });

    // Check for duplicate vendor bid
    const existing = db.prepare('SELECT id FROM bids WHERE project_id = ? AND vendor_id = ?').get(req.params.id, vendor_id);
    if (existing) return res.status(409).json({ error: 'This vendor already has a bid on this project' });

    const calculatedTotal = items && items.length > 0
      ? items.reduce((sum, i) => sum + ((i.quantity || 1) * (i.unit_cost || 0)), 0)
      : (total_amount || 0);

    const result = db.prepare(`
      INSERT INTO bids (project_id, vendor_id, status, total_amount, timeline_days, start_date, completion_date, warranty_terms, payment_terms, inclusions, exclusions, notes, submitted_at, created_by)
      VALUES (?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `).run(req.params.id, vendor_id, calculatedTotal, timeline_days || null, start_date || null,
      completion_date || null, warranty_terms || null, payment_terms || null,
      inclusions || null, exclusions || null, notes || null, req.user.id);

    const bidId = result.lastInsertRowid;

    // Insert line items
    if (items && items.length > 0) {
      const insertItem = db.prepare('INSERT INTO bid_items (bid_id, category, description, quantity, unit, unit_cost, amount, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      items.forEach((item, i) => {
        const qty = item.quantity || 1;
        const cost = item.unit_cost || 0;
        insertItem.run(bidId, item.category || 'other', item.description, qty, item.unit || null, cost, qty * cost, item.notes || null, i);
      });
    }

    // Update project status to bidding if still draft
    if (project.status === 'draft') {
      db.prepare("UPDATE projects SET status = 'bidding', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    }

    const vendor = db.prepare('SELECT name FROM vendors WHERE id = ?').get(vendor_id);
    logActivity('project', parseInt(req.params.id), 'bid_received', `Bid received from ${vendor ? vendor.name : 'vendor'}: $${calculatedTotal.toFixed(2)}`, req.user.id);

    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId);
    bid.items = db.prepare('SELECT * FROM bid_items WHERE bid_id = ? ORDER BY sort_order').all(bidId);
    res.status(201).json(bid);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add bid', details: err.message });
  }
});

// PUT /:id/bids/:bidId - Update a bid
router.put('/:id/bids/:bidId', requireRole('admin', 'manager'), (req, res) => {
  try {
    const bid = db.prepare('SELECT * FROM bids WHERE id = ? AND project_id = ?').get(req.params.bidId, req.params.id);
    if (!bid) return res.status(404).json({ error: 'Bid not found' });

    const { total_amount, timeline_days, start_date, completion_date, warranty_terms, payment_terms, inclusions, exclusions, notes, score, items } = req.body;

    let calculatedTotal = total_amount;
    if (items && items.length > 0) {
      calculatedTotal = items.reduce((sum, i) => sum + ((i.quantity || 1) * (i.unit_cost || 0)), 0);
      // Replace items
      db.prepare('DELETE FROM bid_items WHERE bid_id = ?').run(bid.id);
      const insertItem = db.prepare('INSERT INTO bid_items (bid_id, category, description, quantity, unit, unit_cost, amount, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      items.forEach((item, i) => {
        const qty = item.quantity || 1;
        const cost = item.unit_cost || 0;
        insertItem.run(bid.id, item.category || 'other', item.description, qty, item.unit || null, cost, qty * cost, item.notes || null, i);
      });
    }

    db.prepare(`
      UPDATE bids SET total_amount = ?, timeline_days = ?, start_date = ?, completion_date = ?, warranty_terms = ?, payment_terms = ?,
        inclusions = ?, exclusions = ?, notes = ?, score = ?
      WHERE id = ?
    `).run(
      calculatedTotal !== undefined ? calculatedTotal : bid.total_amount,
      timeline_days !== undefined ? timeline_days : bid.timeline_days,
      start_date !== undefined ? start_date : bid.start_date,
      completion_date !== undefined ? completion_date : bid.completion_date,
      warranty_terms !== undefined ? warranty_terms : bid.warranty_terms,
      payment_terms !== undefined ? payment_terms : bid.payment_terms,
      inclusions !== undefined ? inclusions : bid.inclusions,
      exclusions !== undefined ? exclusions : bid.exclusions,
      notes !== undefined ? notes : bid.notes,
      score !== undefined ? score : bid.score,
      bid.id
    );

    const updated = db.prepare('SELECT * FROM bids WHERE id = ?').get(bid.id);
    updated.items = db.prepare('SELECT * FROM bid_items WHERE bid_id = ? ORDER BY sort_order').all(bid.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update bid', details: err.message });
  }
});

// POST /:id/award/:bidId - Award a bid (creates PO)
router.post('/:id/award/:bidId', requireRole('admin', 'manager'), (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.awarded_bid_id) return res.status(400).json({ error: 'Project already has an awarded bid' });

    const bid = db.prepare('SELECT b.*, v.name AS vendor_name FROM bids b JOIN vendors v ON b.vendor_id = v.id WHERE b.id = ? AND b.project_id = ?').get(req.params.bidId, req.params.id);
    if (!bid) return res.status(404).json({ error: 'Bid not found' });

    const bidItems = db.prepare('SELECT * FROM bid_items WHERE bid_id = ? ORDER BY sort_order').all(bid.id);

    // Create PO from bid
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const poCount = db.prepare("SELECT COUNT(*) as c FROM purchase_orders WHERE po_number LIKE ?").get(`PO-${today}%`).c;
    const poNumber = `PO-${today}-${String(poCount + 1).padStart(3, '0')}`;

    const poResult = db.prepare(`
      INSERT INTO purchase_orders (po_number, vendor_id, property_id, status, total_cost, notes, created_by)
      VALUES (?, ?, ?, 'draft', ?, ?, ?)
    `).run(poNumber, bid.vendor_id, project.property_id, bid.total_amount,
      `Auto-created from project "${project.title}" - Bid by ${bid.vendor_name}`, req.user.id);

    const poId = poResult.lastInsertRowid;

    // Create PO line items from bid items
    const insertPOItem = db.prepare('INSERT INTO purchase_order_items (purchase_order_id, description, quantity, unit_cost) VALUES (?, ?, ?, ?)');
    for (const item of bidItems) {
      insertPOItem.run(poId, `[${item.category}] ${item.description}`, item.quantity, item.unit_cost);
    }

    // Update bid status
    db.prepare("UPDATE bids SET status = 'selected' WHERE id = ?").run(bid.id);

    // Reject other bids
    db.prepare("UPDATE bids SET status = 'rejected' WHERE project_id = ? AND id != ?").run(req.params.id, bid.id);

    // Update project
    db.prepare("UPDATE projects SET status = 'awarded', awarded_bid_id = ?, purchase_order_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(bid.id, poId, req.params.id);

    logActivity('project', parseInt(req.params.id), 'bid_awarded', `Awarded to ${bid.vendor_name} for $${bid.total_amount.toFixed(2)}. PO ${poNumber} created.`, req.user.id);

    res.json({
      message: `Bid awarded to ${bid.vendor_name}`,
      purchase_order_id: poId,
      po_number: poNumber
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to award bid', details: err.message });
  }
});

// DELETE /:id - Delete project (draft only)
router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!['draft', 'cancelled'].includes(project.status)) return res.status(400).json({ error: 'Only draft or cancelled projects can be deleted' });

    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    logActivity('project', parseInt(req.params.id), 'deleted', `Project "${project.title}" deleted`, req.user.id);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project', details: err.message });
  }
});

// GET /:id/compare - Bid leveling comparison data
router.get('/:id/compare', (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const bids = db.prepare(`
      SELECT b.*, v.name AS vendor_name
      FROM bids b JOIN vendors v ON b.vendor_id = v.id
      WHERE b.project_id = ? AND b.status IN ('submitted', 'under_review', 'selected')
      ORDER BY b.total_amount ASC
    `).all(req.params.id);

    for (const bid of bids) {
      bid.items = db.prepare('SELECT * FROM bid_items WHERE bid_id = ? ORDER BY sort_order, category').all(bid.id);
      // Aggregate by category
      bid.by_category = {};
      for (const item of bid.items) {
        if (!bid.by_category[item.category]) bid.by_category[item.category] = 0;
        bid.by_category[item.category] += item.amount;
      }
    }

    // Find lowest per category
    const categories = ['materials', 'labor', 'equipment', 'permits', 'subcontractors', 'overhead', 'other'];
    const lowestByCategory = {};
    categories.forEach(cat => {
      let min = Infinity;
      bids.forEach(bid => {
        const val = bid.by_category[cat] || 0;
        if (val > 0 && val < min) min = val;
      });
      lowestByCategory[cat] = min === Infinity ? 0 : min;
    });

    res.json({
      project: { id: project.id, title: project.title, budget_min: project.budget_min, budget_max: project.budget_max },
      bids,
      categories,
      lowestByCategory,
      lowestTotal: bids.length > 0 ? bids[0].total_amount : 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate comparison', details: err.message });
  }
});

module.exports = router;
