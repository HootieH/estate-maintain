const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

router.use(authenticate);

// GET / — List delegations. Admins see all, others see own (as delegator or delegate).
router.get('/', (req, res) => {
  try {
    let sql, params;

    if (req.user.role === 'admin') {
      sql = `
        SELECT d.*, dr.name AS delegator_name, de.name AS delegate_name, cb.name AS created_by_name
        FROM delegations d
        LEFT JOIN users dr ON d.delegator_id = dr.id
        LEFT JOIN users de ON d.delegate_id = de.id
        LEFT JOIN users cb ON d.created_by = cb.id
        ORDER BY d.created_at DESC
      `;
      params = [];
    } else {
      sql = `
        SELECT d.*, dr.name AS delegator_name, de.name AS delegate_name, cb.name AS created_by_name
        FROM delegations d
        LEFT JOIN users dr ON d.delegator_id = dr.id
        LEFT JOIN users de ON d.delegate_id = de.id
        LEFT JOIN users cb ON d.created_by = cb.id
        WHERE d.delegator_id = ? OR d.delegate_id = ?
        ORDER BY d.created_at DESC
      `;
      params = [req.user.id, req.user.id];
    }

    const delegations = db.prepare(sql).all(...params);
    res.json(delegations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch delegations', details: err.message });
  }
});

// POST / — Create delegation
router.post('/', requirePermission('approvals:delegate'), (req, res) => {
  try {
    const { delegate_id, reason, starts_at, ends_at, delegator_id } = req.body;

    if (!delegate_id || !starts_at || !ends_at) {
      return res.status(400).json({ error: 'delegate_id, starts_at, and ends_at are required' });
    }

    // Determine the delegator: current user, or specified by admin
    let effectiveDelegator = req.user.id;
    if (delegator_id && delegator_id !== req.user.id) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delegate on behalf of another user' });
      }
      effectiveDelegator = delegator_id;
    }

    if (effectiveDelegator === delegate_id) {
      return res.status(400).json({ error: 'Cannot delegate to yourself' });
    }

    // Verify delegate exists
    const delegate = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(delegate_id);
    if (!delegate) {
      return res.status(404).json({ error: 'Delegate user not found' });
    }

    const result = db.prepare(
      'INSERT INTO delegations (delegator_id, delegate_id, reason, starts_at, ends_at, is_active, created_by) VALUES (?, ?, ?, ?, ?, 1, ?)'
    ).run(effectiveDelegator, delegate_id, reason || null, starts_at, ends_at, req.user.id);

    const delegation = db.prepare('SELECT * FROM delegations WHERE id = ?').get(result.lastInsertRowid);
    logActivity('delegation', delegation.id, 'created', `Delegation created: user ${effectiveDelegator} to user ${delegate_id}`, req.user.id);

    res.status(201).json(delegation);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create delegation', details: err.message });
  }
});

// PUT /:id — Update delegation (dates, reason)
router.put('/:id', requirePermission('approvals:delegate'), (req, res) => {
  try {
    const delegation = db.prepare('SELECT * FROM delegations WHERE id = ?').get(req.params.id);
    if (!delegation) {
      return res.status(404).json({ error: 'Delegation not found' });
    }

    // Only the delegator or admin can update
    if (delegation.delegator_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the delegator or an admin can update this delegation' });
    }

    const { reason, starts_at, ends_at } = req.body;
    const updates = [];
    const values = [];

    if (reason !== undefined) { updates.push('reason = ?'); values.push(reason); }
    if (starts_at) { updates.push('starts_at = ?'); values.push(starts_at); }
    if (ends_at) { updates.push('ends_at = ?'); values.push(ends_at); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    db.prepare(`UPDATE delegations SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM delegations WHERE id = ?').get(req.params.id);
    logActivity('delegation', updated.id, 'updated', 'Delegation updated', req.user.id);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update delegation', details: err.message });
  }
});

// DELETE /:id — Cancel delegation (set is_active=0)
router.delete('/:id', requirePermission('approvals:delegate'), (req, res) => {
  try {
    const delegation = db.prepare('SELECT * FROM delegations WHERE id = ?').get(req.params.id);
    if (!delegation) {
      return res.status(404).json({ error: 'Delegation not found' });
    }

    // Only the delegator or admin can cancel
    if (delegation.delegator_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the delegator or an admin can cancel this delegation' });
    }

    db.prepare('UPDATE delegations SET is_active = 0 WHERE id = ?').run(req.params.id);
    logActivity('delegation', delegation.id, 'cancelled', 'Delegation cancelled', req.user.id);

    res.json({ message: 'Delegation cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel delegation', details: err.message });
  }
});

module.exports = router;
