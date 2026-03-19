const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

// GET / - List templates
router.get('/', (req, res) => {
  try {
    const templates = db.prepare(`
      SELECT wot.*, p.name AS property_name, a.name AS asset_name, u.name AS assigned_to_name, t.name AS team_name
      FROM work_order_templates wot
      LEFT JOIN properties p ON wot.property_id = p.id
      LEFT JOIN assets a ON wot.asset_id = a.id
      LEFT JOIN users u ON wot.assigned_to = u.id
      LEFT JOIN teams t ON wot.assigned_team_id = t.id
      ORDER BY wot.title
    `).all();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch templates', details: err.message });
  }
});

// GET /:id
router.get('/:id', (req, res) => {
  try {
    const template = db.prepare(`
      SELECT wot.*, p.name AS property_name, a.name AS asset_name
      FROM work_order_templates wot
      LEFT JOIN properties p ON wot.property_id = p.id
      LEFT JOIN assets a ON wot.asset_id = a.id
      WHERE wot.id = ?
    `).get(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    // Get recurring schedule if any
    const recurring = db.prepare('SELECT * FROM recurring_schedules WHERE template_id = ?').get(template.id);
    template.recurring = recurring || null;

    res.json(template);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch template', details: err.message });
  }
});

// POST / - Create template
router.post('/', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { title, description, property_id, asset_id, priority, category, assigned_to, assigned_team_id, estimated_hours, procedure_id, recurring } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const result = db.prepare(`
      INSERT INTO work_order_templates (title, description, property_id, asset_id, priority, category, assigned_to, assigned_team_id, estimated_hours, procedure_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, description || null, property_id || null, asset_id || null, priority || 'medium', category || null, assigned_to || null, assigned_team_id || null, estimated_hours || null, procedure_id || null, req.user.id);

    const template = db.prepare('SELECT * FROM work_order_templates WHERE id = ?').get(result.lastInsertRowid);

    // Create recurring schedule if specified
    if (recurring && recurring.frequency) {
      const nextDue = recurring.next_due || new Date().toISOString().split('T')[0];
      db.prepare('INSERT INTO recurring_schedules (template_id, frequency, next_due) VALUES (?, ?, ?)').run(template.id, recurring.frequency, nextDue);
    }

    logActivity('template', template.id, 'created', `Template "${title}" created`, req.user.id);
    res.status(201).json(template);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create template', details: err.message });
  }
});

// POST /:id/create-wo - Create work order from template
router.post('/:id/create-wo', (req, res) => {
  try {
    const template = db.prepare('SELECT * FROM work_order_templates WHERE id = ?').get(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const overrides = req.body || {};
    const result = db.prepare(`
      INSERT INTO work_orders (title, description, property_id, asset_id, assigned_to, assigned_team_id, priority, status, category, template_id, estimated_hours, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
    `).run(
      overrides.title || template.title,
      overrides.description || template.description,
      overrides.property_id || template.property_id,
      overrides.asset_id || template.asset_id,
      overrides.assigned_to || template.assigned_to,
      overrides.assigned_team_id || template.assigned_team_id,
      overrides.priority || template.priority,
      overrides.category || template.category,
      template.id,
      template.estimated_hours,
      req.user.id
    );

    const wo = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(result.lastInsertRowid);

    // Auto-attach procedure if template has one
    if (template.procedure_id) {
      db.prepare('INSERT INTO work_order_procedures (work_order_id, procedure_id) VALUES (?, ?)').run(wo.id, template.procedure_id);
    }

    logActivity('work_order', wo.id, 'created', `Created from template "${template.title}"`, req.user.id);
    res.status(201).json(wo);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create work order from template', details: err.message });
  }
});

// PUT /:id
router.put('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { title, description, property_id, asset_id, priority, category, assigned_to, assigned_team_id, estimated_hours, procedure_id } = req.body;
    db.prepare(`
      UPDATE work_order_templates SET title = ?, description = ?, property_id = ?, asset_id = ?, priority = ?, category = ?, assigned_to = ?, assigned_team_id = ?, estimated_hours = ?, procedure_id = ?
      WHERE id = ?
    `).run(title, description, property_id, asset_id, priority, category, assigned_to, assigned_team_id, estimated_hours, procedure_id, req.params.id);
    const template = db.prepare('SELECT * FROM work_order_templates WHERE id = ?').get(req.params.id);
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update template', details: err.message });
  }
});

// DELETE /:id
router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    db.prepare('DELETE FROM work_order_templates WHERE id = ?').run(req.params.id);
    res.json({ message: 'Template deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete template', details: err.message });
  }
});

module.exports = router;
