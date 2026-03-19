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

    // Milestones
    const milestones = db.prepare('SELECT * FROM project_milestones WHERE project_id = ? ORDER BY sort_order, due_date').all(req.params.id);
    project.milestones = milestones;

    // Change orders
    const changeOrders = db.prepare('SELECT co.*, u.name AS created_by_name FROM change_orders co LEFT JOIN users u ON co.created_by = u.id WHERE co.project_id = ? ORDER BY co.created_at DESC').all(req.params.id);
    project.change_orders = changeOrders;
    project.change_order_total = changeOrders.filter(co => co.status === 'approved').reduce((s, co) => s + co.amount, 0);

    // Invitations
    const invitations = db.prepare('SELECT bi.*, v.name AS vendor_name, v.specialty AS vendor_specialty FROM bid_invitations bi JOIN vendors v ON bi.vendor_id = v.id WHERE bi.project_id = ?').all(req.params.id);
    project.invitations = invitations;

    // Bid scores summary per bid
    for (const bid of bids) {
      const scores = db.prepare('SELECT criterion, AVG(score) AS avg_score FROM bid_scores WHERE bid_id = ? GROUP BY criterion').all(bid.id);
      bid.scores = scores;
      bid.avg_score = scores.length > 0 ? Math.round(scores.reduce((s, sc) => s + sc.avg_score, 0) / scores.length * 10) / 10 : null;
      // Cost per day
      bid.cost_per_day = bid.timeline_days ? Math.round(bid.total_amount / bid.timeline_days) : null;
      // Comment count
      const cc = db.prepare('SELECT COUNT(*) AS c FROM bid_comments WHERE bid_id = ?').get(bid.id);
      bid.comment_count = cc.c;
    }

    // Activity
    const activity = db.prepare("SELECT al.*, u.name AS user_name FROM activity_log al LEFT JOIN users u ON al.user_id = u.id WHERE al.entity_type = 'project' AND al.entity_id = ? ORDER BY al.created_at DESC LIMIT 10").all(req.params.id);
    project.activity = activity;

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

// POST /:id/status - Advance project status
router.post('/:id/status', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['draft', 'bidding', 'evaluating', 'awarded', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    db.prepare('UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
    logActivity('project', parseInt(req.params.id), 'status_changed', `Status changed to ${status}`, req.user.id);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status', details: err.message });
  }
});

// POST /:id/progress - Update project progress percentage
router.post('/:id/progress', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { progress } = req.body;
    db.prepare('UPDATE projects SET progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Math.min(100, Math.max(0, progress || 0)), req.params.id);
    res.json({ message: 'Progress updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update progress', details: err.message });
  }
});

// --- Bid Comments ---
router.post('/:id/bids/:bidId/comments', (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment) return res.status(400).json({ error: 'Comment is required' });
    const result = db.prepare('INSERT INTO bid_comments (bid_id, project_id, user_id, comment) VALUES (?, ?, ?, ?)').run(req.params.bidId, req.params.id, req.user.id, comment);
    const entry = db.prepare('SELECT bc.*, u.name AS user_name FROM bid_comments bc JOIN users u ON bc.user_id = u.id WHERE bc.id = ?').get(result.lastInsertRowid);
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add comment', details: err.message });
  }
});

router.get('/:id/bids/:bidId/comments', (req, res) => {
  try {
    const comments = db.prepare('SELECT bc.*, u.name AS user_name, u.avatar_color FROM bid_comments bc JOIN users u ON bc.user_id = u.id WHERE bc.bid_id = ? ORDER BY bc.created_at ASC').all(req.params.bidId);
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch comments', details: err.message });
  }
});

// --- Bid Scoring ---
router.post('/:id/bids/:bidId/scores', (req, res) => {
  try {
    const { scores } = req.body; // [{criterion, score, notes}]
    if (!scores || !Array.isArray(scores)) return res.status(400).json({ error: 'scores array is required' });

    const upsert = db.prepare('INSERT INTO bid_scores (bid_id, criterion, score, notes, scored_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(bid_id, criterion, scored_by) DO UPDATE SET score = ?, notes = ?');
    for (const s of scores) {
      upsert.run(req.params.bidId, s.criterion, s.score, s.notes || null, req.user.id, s.score, s.notes || null);
    }

    // Calculate average score and update bid
    const avg = db.prepare('SELECT AVG(score) AS avg_score FROM bid_scores WHERE bid_id = ?').get(req.params.bidId);
    db.prepare('UPDATE bids SET score = ? WHERE id = ?').run(Math.round((avg.avg_score || 0) * 10) / 10, req.params.bidId);

    res.json({ message: 'Scores saved', averageScore: avg.avg_score });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save scores', details: err.message });
  }
});

router.get('/:id/bids/:bidId/scores', (req, res) => {
  try {
    const scores = db.prepare('SELECT bs.*, u.name AS scored_by_name FROM bid_scores bs LEFT JOIN users u ON bs.scored_by = u.id WHERE bs.bid_id = ?').all(req.params.bidId);
    res.json(scores);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scores', details: err.message });
  }
});

// --- Bid Reject with Reason ---
router.post('/:id/bids/:bidId/reject', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { reason } = req.body;
    db.prepare("UPDATE bids SET status = 'rejected', rejection_reason = ? WHERE id = ? AND project_id = ?").run(reason || null, req.params.bidId, req.params.id);
    logActivity('project', parseInt(req.params.id), 'bid_rejected', `Bid ${req.params.bidId} rejected${reason ? ': ' + reason : ''}`, req.user.id);
    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(req.params.bidId);
    res.json(bid);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject bid', details: err.message });
  }
});

// --- Bid Withdraw ---
router.post('/:id/bids/:bidId/withdraw', (req, res) => {
  try {
    db.prepare("UPDATE bids SET status = 'withdrawn' WHERE id = ? AND project_id = ?").run(req.params.bidId, req.params.id);
    logActivity('project', parseInt(req.params.id), 'bid_withdrawn', `Bid ${req.params.bidId} withdrawn`, req.user.id);
    res.json({ message: 'Bid withdrawn' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to withdraw bid', details: err.message });
  }
});

// --- Milestones ---
router.get('/:id/milestones', (req, res) => {
  try {
    const milestones = db.prepare('SELECT pm.*, u.name AS completed_by_name FROM project_milestones pm LEFT JOIN users u ON pm.completed_by = u.id WHERE pm.project_id = ? ORDER BY pm.sort_order, pm.due_date').all(req.params.id);
    res.json(milestones);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch milestones', details: err.message });
  }
});

router.post('/:id/milestones', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { title, description, due_date, sort_order } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const count = db.prepare('SELECT COUNT(*) AS c FROM project_milestones WHERE project_id = ?').get(req.params.id).c;
    const result = db.prepare('INSERT INTO project_milestones (project_id, title, description, due_date, sort_order) VALUES (?, ?, ?, ?, ?)').run(req.params.id, title, description || null, due_date || null, sort_order !== undefined ? sort_order : count);
    const milestone = db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(milestone);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create milestone', details: err.message });
  }
});

router.post('/:id/milestones/:msId/complete', (req, res) => {
  try {
    db.prepare('UPDATE project_milestones SET completed_at = CURRENT_TIMESTAMP, completed_by = ? WHERE id = ? AND project_id = ?').run(req.user.id, req.params.msId, req.params.id);
    const ms = db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(req.params.msId);
    res.json(ms);
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete milestone', details: err.message });
  }
});

// --- Change Orders ---
router.get('/:id/change-orders', (req, res) => {
  try {
    const orders = db.prepare('SELECT co.*, u.name AS created_by_name, au.name AS approved_by_name FROM change_orders co LEFT JOIN users u ON co.created_by = u.id LEFT JOIN users au ON co.approved_by = au.id WHERE co.project_id = ? ORDER BY co.created_at DESC').all(req.params.id);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch change orders', details: err.message });
  }
});

router.post('/:id/change-orders', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { title, description, amount } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const result = db.prepare('INSERT INTO change_orders (project_id, title, description, amount, created_by) VALUES (?, ?, ?, ?, ?)').run(req.params.id, title, description || null, amount || 0, req.user.id);
    logActivity('project', parseInt(req.params.id), 'change_order', `Change order "${title}" ($${(amount || 0).toFixed(2)})`, req.user.id);
    const co = db.prepare('SELECT * FROM change_orders WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(co);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create change order', details: err.message });
  }
});

router.post('/:id/change-orders/:coId/approve', requireRole('admin', 'manager'), (req, res) => {
  try {
    db.prepare("UPDATE change_orders SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.user.id, req.params.coId);
    res.json({ message: 'Change order approved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve change order', details: err.message });
  }
});

// --- Bid Invitations ---
router.post('/:id/invite', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { vendor_ids } = req.body;
    if (!vendor_ids || !Array.isArray(vendor_ids)) return res.status(400).json({ error: 'vendor_ids array required' });
    const stmt = db.prepare('INSERT OR IGNORE INTO bid_invitations (project_id, vendor_id) VALUES (?, ?)');
    let invited = 0;
    for (const vid of vendor_ids) {
      const r = stmt.run(req.params.id, vid);
      if (r.changes > 0) invited++;
    }
    if (invited > 0) {
      db.prepare("UPDATE projects SET status = CASE WHEN status = 'draft' THEN 'bidding' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    }
    logActivity('project', parseInt(req.params.id), 'vendors_invited', `${invited} vendors invited to bid`, req.user.id);
    res.json({ invited });
  } catch (err) {
    res.status(500).json({ error: 'Failed to invite vendors', details: err.message });
  }
});

router.get('/:id/invitations', (req, res) => {
  try {
    const invitations = db.prepare('SELECT bi.*, v.name AS vendor_name, v.email AS vendor_email, v.phone AS vendor_phone, v.specialty AS vendor_specialty FROM bid_invitations bi JOIN vendors v ON bi.vendor_id = v.id WHERE bi.project_id = ? ORDER BY bi.invited_at DESC').all(req.params.id);
    res.json(invitations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invitations', details: err.message });
  }
});

// --- Duplicate Bid ---
router.post('/:id/bids/:bidId/duplicate', requireRole('admin', 'manager'), (req, res) => {
  try {
    const bid = db.prepare('SELECT * FROM bids WHERE id = ? AND project_id = ?').get(req.params.bidId, req.params.id);
    if (!bid) return res.status(404).json({ error: 'Bid not found' });
    const items = db.prepare('SELECT * FROM bid_items WHERE bid_id = ?').all(bid.id);

    const result = db.prepare(`
      INSERT INTO bids (project_id, vendor_id, status, total_amount, timeline_days, start_date, completion_date, warranty_terms, payment_terms, inclusions, exclusions, notes, revised_from_id, created_by)
      VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(bid.project_id, bid.vendor_id, bid.total_amount, bid.timeline_days, bid.start_date, bid.completion_date, bid.warranty_terms, bid.payment_terms, bid.inclusions, bid.exclusions, `[Revision of bid #${bid.id}] ${bid.notes || ''}`, bid.id, req.user.id);

    const newBidId = result.lastInsertRowid;
    const insertItem = db.prepare('INSERT INTO bid_items (bid_id, category, description, quantity, unit, unit_cost, amount, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const item of items) {
      insertItem.run(newBidId, item.category, item.description, item.quantity, item.unit, item.unit_cost, item.amount, item.notes, item.sort_order);
    }

    const newBid = db.prepare('SELECT * FROM bids WHERE id = ?').get(newBidId);
    newBid.items = db.prepare('SELECT * FROM bid_items WHERE bid_id = ?').all(newBidId);
    res.status(201).json(newBid);
  } catch (err) {
    res.status(500).json({ error: 'Failed to duplicate bid', details: err.message });
  }
});

// --- Project Activity Feed ---
router.get('/:id/activity', (req, res) => {
  try {
    const activity = db.prepare("SELECT al.*, u.name AS user_name FROM activity_log al LEFT JOIN users u ON al.user_id = u.id WHERE al.entity_type = 'project' AND al.entity_id = ? ORDER BY al.created_at DESC LIMIT 30").all(req.params.id);
    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity', details: err.message });
  }
});

// --- Bid Analytics ---
router.get('/:id/analytics', (req, res) => {
  try {
    const bids = db.prepare("SELECT b.*, v.name AS vendor_name FROM bids b JOIN vendors v ON b.vendor_id = v.id WHERE b.project_id = ? AND b.status IN ('submitted','under_review','selected')").all(req.params.id);
    if (bids.length === 0) return res.json({ bids: [], stats: {} });

    const amounts = bids.map(b => b.total_amount);
    const stats = {
      count: bids.length,
      lowest: Math.min(...amounts),
      highest: Math.max(...amounts),
      average: amounts.reduce((a, b) => a + b, 0) / amounts.length,
      spread: Math.max(...amounts) - Math.min(...amounts),
      spreadPercent: Math.round(((Math.max(...amounts) - Math.min(...amounts)) / Math.min(...amounts)) * 100)
    };

    // Per-category breakdown
    const categories = ['materials', 'labor', 'equipment', 'permits', 'subcontractors', 'overhead', 'other'];
    const categoryStats = {};
    for (const cat of categories) {
      const vals = [];
      for (const bid of bids) {
        const items = db.prepare('SELECT * FROM bid_items WHERE bid_id = ? AND category = ?').all(bid.id, cat);
        const total = items.reduce((s, i) => s + i.amount, 0);
        if (total > 0) vals.push({ vendor: bid.vendor_name, amount: total });
      }
      if (vals.length > 0) {
        categoryStats[cat] = {
          values: vals,
          lowest: Math.min(...vals.map(v => v.amount)),
          highest: Math.max(...vals.map(v => v.amount)),
          average: vals.reduce((s, v) => s + v.amount, 0) / vals.length
        };
      }
    }

    // Cost per day
    bids.forEach(b => {
      b.cost_per_day = b.timeline_days ? Math.round(b.total_amount / b.timeline_days) : null;
    });

    // Change orders total
    const coTotal = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM change_orders WHERE project_id = ? AND status = 'approved'").get(req.params.id);
    stats.change_order_total = coTotal.total;

    res.json({ bids, stats, categoryStats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate analytics', details: err.message });
  }
});

module.exports = router;
