const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

router.use(authenticate);

// --- Approval Rules ---

// GET /rules — List active approval rules
router.get('/rules', requirePermission('approvals:manage_rules'), (req, res) => {
  try {
    const rules = db.prepare(
      'SELECT * FROM approval_rules WHERE is_active = 1 ORDER BY entity_type, created_at'
    ).all();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch approval rules', details: err.message });
  }
});

// POST /rules — Create rule
router.post('/rules', requirePermission('approvals:manage_rules'), (req, res) => {
  try {
    const { entity_type, condition_field, condition_operator, condition_value, required_role, description } = req.body;

    if (!entity_type || !condition_field || !condition_operator || !condition_value || !required_role) {
      return res.status(400).json({ error: 'entity_type, condition_field, condition_operator, condition_value, and required_role are required' });
    }

    const result = db.prepare(
      'INSERT INTO approval_rules (entity_type, condition_field, condition_operator, condition_value, required_role, description, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(entity_type, condition_field, condition_operator, condition_value, required_role, description || null, req.user.id);

    const rule = db.prepare('SELECT * FROM approval_rules WHERE id = ?').get(result.lastInsertRowid);
    logActivity('approval_rule', rule.id, 'created', `Approval rule created: ${description || entity_type}`, req.user.id);

    res.status(201).json(rule);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create approval rule', details: err.message });
  }
});

// PUT /rules/:id — Update rule
router.put('/rules/:id', requirePermission('approvals:manage_rules'), (req, res) => {
  try {
    const rule = db.prepare('SELECT * FROM approval_rules WHERE id = ?').get(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: 'Approval rule not found' });
    }

    const { entity_type, condition_field, condition_operator, condition_value, required_role, description } = req.body;
    const updates = [];
    const values = [];

    if (entity_type) { updates.push('entity_type = ?'); values.push(entity_type); }
    if (condition_field) { updates.push('condition_field = ?'); values.push(condition_field); }
    if (condition_operator) { updates.push('condition_operator = ?'); values.push(condition_operator); }
    if (condition_value !== undefined) { updates.push('condition_value = ?'); values.push(condition_value); }
    if (required_role) { updates.push('required_role = ?'); values.push(required_role); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    db.prepare(`UPDATE approval_rules SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM approval_rules WHERE id = ?').get(req.params.id);
    logActivity('approval_rule', updated.id, 'updated', 'Approval rule updated', req.user.id);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update approval rule', details: err.message });
  }
});

// DELETE /rules/:id — Deactivate rule
router.delete('/rules/:id', requirePermission('approvals:manage_rules'), (req, res) => {
  try {
    const rule = db.prepare('SELECT * FROM approval_rules WHERE id = ?').get(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: 'Approval rule not found' });
    }

    db.prepare('UPDATE approval_rules SET is_active = 0 WHERE id = ?').run(req.params.id);
    logActivity('approval_rule', rule.id, 'deactivated', 'Approval rule deactivated', req.user.id);

    res.json({ message: 'Approval rule deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate approval rule', details: err.message });
  }
});

// --- Approval Requests ---

// GET /pending — Pending approvals for current user (including delegated)
router.get('/pending', (req, res) => {
  try {
    // Find active delegations where current user is the delegate
    const delegators = db.prepare(`
      SELECT delegator_id FROM delegations
      WHERE delegate_id = ? AND is_active = 1
        AND starts_at <= CURRENT_TIMESTAMP AND ends_at >= CURRENT_TIMESTAMP
    `).all(req.user.id).map(d => d.delegator_id);

    const userIds = [req.user.id, ...delegators];
    const placeholders = userIds.map(() => '?').join(',');

    const approvals = db.prepare(`
      SELECT ar.*, r.entity_type AS rule_entity_type, r.description AS rule_description,
        u.name AS requested_by_name
      FROM approval_requests ar
      LEFT JOIN approval_rules r ON ar.rule_id = r.id
      LEFT JOIN users u ON ar.requested_by = u.id
      WHERE ar.status = 'pending' AND ar.assigned_to IN (${placeholders})
      ORDER BY ar.created_at DESC
    `).all(...userIds);

    res.json(approvals);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending approvals', details: err.message });
  }
});

// GET /count — Count of pending approvals (for badge)
router.get('/count', (req, res) => {
  try {
    const delegators = db.prepare(`
      SELECT delegator_id FROM delegations
      WHERE delegate_id = ? AND is_active = 1
        AND starts_at <= CURRENT_TIMESTAMP AND ends_at >= CURRENT_TIMESTAMP
    `).all(req.user.id).map(d => d.delegator_id);

    const userIds = [req.user.id, ...delegators];
    const placeholders = userIds.map(() => '?').join(',');

    const result = db.prepare(`
      SELECT COUNT(*) AS count FROM approval_requests
      WHERE status = 'pending' AND assigned_to IN (${placeholders})
    `).get(...userIds);

    res.json({ count: result.count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch approval count', details: err.message });
  }
});

// POST /:id/approve — Approve a request
router.post('/:id/approve', (req, res) => {
  try {
    const approval = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(req.params.id);
    if (!approval) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    if (approval.status !== 'pending') {
      return res.status(400).json({ error: 'Approval request is not pending' });
    }

    // Check that the user is the assigned_to or an active delegate
    const isAssignee = approval.assigned_to === req.user.id;
    let isDelegate = false;
    if (!isAssignee) {
      const delegation = db.prepare(`
        SELECT id FROM delegations
        WHERE delegator_id = ? AND delegate_id = ? AND is_active = 1
          AND starts_at <= CURRENT_TIMESTAMP AND ends_at >= CURRENT_TIMESTAMP
      `).get(approval.assigned_to, req.user.id);
      isDelegate = !!delegation;
    }

    if (!isAssignee && !isDelegate) {
      return res.status(403).json({ error: 'You are not authorized to act on this approval' });
    }

    const { notes } = req.body;

    db.prepare(
      "UPDATE approval_requests SET status = 'approved', notes = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE id = ?"
    ).run(notes || null, req.user.id, approval.id);

    logActivity('approval_request', approval.id, 'approved', notes || 'Approval granted', req.user.id);

    const updated = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(approval.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve request', details: err.message });
  }
});

// POST /:id/reject — Reject a request
router.post('/:id/reject', (req, res) => {
  try {
    const approval = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(req.params.id);
    if (!approval) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    if (approval.status !== 'pending') {
      return res.status(400).json({ error: 'Approval request is not pending' });
    }

    const { notes } = req.body;
    if (!notes) {
      return res.status(400).json({ error: 'Notes are required when rejecting' });
    }

    // Check that the user is the assigned_to or an active delegate
    const isAssignee = approval.assigned_to === req.user.id;
    let isDelegate = false;
    if (!isAssignee) {
      const delegation = db.prepare(`
        SELECT id FROM delegations
        WHERE delegator_id = ? AND delegate_id = ? AND is_active = 1
          AND starts_at <= CURRENT_TIMESTAMP AND ends_at >= CURRENT_TIMESTAMP
      `).get(approval.assigned_to, req.user.id);
      isDelegate = !!delegation;
    }

    if (!isAssignee && !isDelegate) {
      return res.status(403).json({ error: 'You are not authorized to act on this approval' });
    }

    db.prepare(
      "UPDATE approval_requests SET status = 'rejected', notes = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE id = ?"
    ).run(notes, req.user.id, approval.id);

    logActivity('approval_request', approval.id, 'rejected', notes, req.user.id);

    const updated = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(approval.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject request', details: err.message });
  }
});

// --- Helper: checkApprovalRules ---

/**
 * Check all active approval rules for a given entity type, evaluate conditions,
 * and create approval_requests for any that trigger.
 * Returns true if approvals were created (action should be held pending).
 */
function checkApprovalRules(entityType, entity, requestedBy) {
  const rules = db.prepare(
    "SELECT * FROM approval_rules WHERE entity_type = ? AND is_active = 1"
  ).all(entityType);

  let approvalsCreated = false;

  for (const rule of rules) {
    const fieldValue = entity[rule.condition_field];
    if (fieldValue === undefined || fieldValue === null) continue;

    const numericField = Number(fieldValue);
    const numericCondition = Number(rule.condition_value);
    let triggered = false;

    switch (rule.condition_operator) {
      case '>':  triggered = numericField > numericCondition; break;
      case '>=': triggered = numericField >= numericCondition; break;
      case '<':  triggered = numericField < numericCondition; break;
      case '<=': triggered = numericField <= numericCondition; break;
      case '=':  triggered = String(fieldValue) === String(rule.condition_value); break;
    }

    if (triggered) {
      // Find an eligible approver with the required role
      const approver = db.prepare(
        "SELECT id FROM users WHERE role = ? AND is_active = 1 ORDER BY id LIMIT 1"
      ).get(rule.required_role);

      db.prepare(
        'INSERT INTO approval_requests (rule_id, entity_type, entity_id, requested_by, assigned_to, status) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(rule.id, entityType, entity.id, requestedBy, approver ? approver.id : null, 'pending');

      approvalsCreated = true;
    }
  }

  return approvalsCreated;
}

module.exports = router;
module.exports.checkApprovalRules = checkApprovalRules;
