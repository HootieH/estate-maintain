const express = require('express');
const { db, logActivity, createNotification } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

router.use(authenticate);

// GET /queue — Pending reviews for the current user (or all if admin)
router.get('/queue', requirePermission('workorders:review'), (req, res) => {
  try {
    let sql = `
      SELECT r.*, wo.title AS work_order_title, wo.property_id,
        p.name AS property_name, wo.assigned_to,
        u.name AS assigned_user_name, wo.status AS work_order_status
      FROM work_order_reviews r
      JOIN work_orders wo ON r.work_order_id = wo.id
      LEFT JOIN properties p ON wo.property_id = p.id
      LEFT JOIN users u ON wo.assigned_to = u.id
      WHERE r.status = 'pending'
    `;
    const params = [];

    if (req.user.role !== 'admin') {
      sql += ' AND r.reviewer_id = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY r.created_at DESC';

    const reviews = db.prepare(sql).all(...params);
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch review queue', details: err.message });
  }
});

// GET /count — Count of pending reviews (for badge)
router.get('/count', requirePermission('workorders:review'), (req, res) => {
  try {
    let sql = `SELECT COUNT(*) AS count FROM work_order_reviews WHERE status = 'pending'`;
    const params = [];

    if (req.user.role !== 'admin') {
      sql += ' AND reviewer_id = ?';
      params.push(req.user.id);
    }

    const result = db.prepare(sql).get(...params);
    res.json({ count: result.count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch review count', details: err.message });
  }
});

// POST / — Submit a completed work order for review
router.post('/', requirePermission('workorders:edit'), (req, res) => {
  try {
    const { work_order_id } = req.body;

    if (!work_order_id) {
      return res.status(400).json({ error: 'work_order_id is required' });
    }

    const wo = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(work_order_id);
    if (!wo) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    // Check if there's already a pending review
    const existing = db.prepare(
      "SELECT id FROM work_order_reviews WHERE work_order_id = ? AND status = 'pending'"
    ).get(work_order_id);
    if (existing) {
      return res.status(409).json({ error: 'A pending review already exists for this work order' });
    }

    // Auto-assign reviewer: team lead if WO has a team, otherwise any manager
    let reviewerId = null;

    if (wo.assigned_team_id) {
      const teamLead = db.prepare(
        'SELECT u.id FROM users u JOIN user_teams ut ON u.id = ut.user_id WHERE ut.team_id = ? AND u.is_team_lead = 1 AND u.is_active = 1 LIMIT 1'
      ).get(wo.assigned_team_id);
      if (teamLead) {
        reviewerId = teamLead.id;
      }
    }

    if (!reviewerId) {
      const manager = db.prepare(
        "SELECT id FROM users WHERE role IN ('manager', 'admin') AND is_active = 1 ORDER BY id LIMIT 1"
      ).get();
      if (manager) {
        reviewerId = manager.id;
      }
    }

    if (!reviewerId) {
      return res.status(400).json({ error: 'No eligible reviewer found' });
    }

    const result = db.prepare(
      'INSERT INTO work_order_reviews (work_order_id, reviewer_id, status) VALUES (?, ?, ?)'
    ).run(work_order_id, reviewerId, 'pending');

    const review = db.prepare('SELECT * FROM work_order_reviews WHERE id = ?').get(result.lastInsertRowid);

    logActivity('work_order_review', review.id, 'created', `Review submitted for WO #${work_order_id}`, req.user.id);
    createNotification(reviewerId, 'assignment', 'Review Requested', `Work order "${wo.title}" is ready for review`, 'work_order_review', review.id);

    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit review', details: err.message });
  }
});

// POST /:id/approve — Approve a review
router.post('/:id/approve', requirePermission('workorders:review'), (req, res) => {
  try {
    const review = db.prepare('SELECT * FROM work_order_reviews WHERE id = ?').get(req.params.id);
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (review.status !== 'pending') {
      return res.status(400).json({ error: 'Review is not pending' });
    }

    const { notes } = req.body;

    db.prepare(
      "UPDATE work_order_reviews SET status = 'approved', notes = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(notes || null, review.id);

    // Sign off the work order
    db.prepare(
      'UPDATE work_orders SET signed_off_by = ?, signed_off_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(req.user.id, review.work_order_id);

    logActivity('work_order_review', review.id, 'approved', notes || 'Review approved', req.user.id);

    const updated = db.prepare('SELECT * FROM work_order_reviews WHERE id = ?').get(review.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve review', details: err.message });
  }
});

// POST /:id/rework — Request rework
router.post('/:id/rework', requirePermission('workorders:review'), (req, res) => {
  try {
    const review = db.prepare('SELECT * FROM work_order_reviews WHERE id = ?').get(req.params.id);
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    if (review.status !== 'pending') {
      return res.status(400).json({ error: 'Review is not pending' });
    }

    const { notes } = req.body;
    if (!notes) {
      return res.status(400).json({ error: 'Notes are required when requesting rework' });
    }

    db.prepare(
      "UPDATE work_order_reviews SET status = 'rework_requested', notes = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(notes, review.id);

    // Reopen the work order
    db.prepare(
      "UPDATE work_orders SET status = 'in_progress' WHERE id = ?"
    ).run(review.work_order_id);

    logActivity('work_order_review', review.id, 'rework_requested', notes, req.user.id);

    // Notify the assigned technician
    const wo = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(review.work_order_id);
    if (wo && wo.assigned_to) {
      createNotification(wo.assigned_to, 'status_change', 'Rework Requested', `Work order "${wo.title}" requires rework: ${notes}`, 'work_order', wo.id);
    }

    const updated = db.prepare('SELECT * FROM work_order_reviews WHERE id = ?').get(review.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to request rework', details: err.message });
  }
});

module.exports = router;
