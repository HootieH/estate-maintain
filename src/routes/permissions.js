const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requirePermission, getEffectivePermissions } = require('../middleware/permissions');

const router = express.Router();

// GET / — List all permissions grouped by resource
router.get('/', authenticate, requirePermission('users:manage_permissions'), (req, res) => {
  try {
    const perms = db.prepare('SELECT * FROM permissions ORDER BY resource, action').all();

    const grouped = {};
    for (const p of perms) {
      if (!grouped[p.resource]) grouped[p.resource] = [];
      grouped[p.resource].push(p);
    }

    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch permissions', details: err.message });
  }
});

// GET /roles — Get role-to-permission mappings
router.get('/roles', authenticate, requirePermission('users:manage_permissions'), (req, res) => {
  try {
    const roles = ['admin', 'manager', 'technician'];
    const result = {};

    for (const role of roles) {
      const perms = db.prepare(`
        SELECT p.resource, p.action FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role = ?
        ORDER BY p.resource, p.action
      `).all(role);

      result[role] = perms.map(p => `${p.resource}:${p.action}`);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch role permissions', details: err.message });
  }
});

// GET /templates — List role templates
router.get('/templates', authenticate, requirePermission('users:manage_permissions'), (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM role_templates ORDER BY is_system DESC, name').all();

    for (const t of templates) {
      const perms = db.prepare(`
        SELECT p.id, p.resource, p.action FROM role_template_permissions rtp
        JOIN permissions p ON rtp.permission_id = p.id
        WHERE rtp.template_id = ?
        ORDER BY p.resource, p.action
      `).all(t.id);

      t.permissions = perms;
    }

    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch templates', details: err.message });
  }
});

// POST /templates — Create custom template
router.post('/templates', authenticate, requirePermission('users:manage_permissions'), (req, res) => {
  try {
    const { name, description, permission_ids } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    if (!permission_ids || !Array.isArray(permission_ids) || permission_ids.length === 0) {
      return res.status(400).json({ error: 'At least one permission is required' });
    }

    const result = db.prepare(
      'INSERT INTO role_templates (name, description, is_system, created_by) VALUES (?, ?, 0, ?)'
    ).run(name, description || null, req.user.id);

    const templateId = result.lastInsertRowid;
    const insertPerm = db.prepare('INSERT INTO role_template_permissions (template_id, permission_id) VALUES (?, ?)');
    const insertTx = db.transaction(() => {
      for (const permId of permission_ids) {
        insertPerm.run(templateId, permId);
      }
    });
    insertTx();

    const template = db.prepare('SELECT * FROM role_templates WHERE id = ?').get(templateId);
    const perms = db.prepare(`
      SELECT p.id, p.resource, p.action FROM role_template_permissions rtp
      JOIN permissions p ON rtp.permission_id = p.id
      WHERE rtp.template_id = ?
    `).all(templateId);
    template.permissions = perms;

    logActivity('role_template', templateId, 'created', `Template "${name}" created`, req.user.id);

    res.status(201).json(template);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A template with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create template', details: err.message });
  }
});

// PUT /templates/:id — Update template
router.put('/templates/:id', authenticate, requirePermission('users:manage_permissions'), (req, res) => {
  try {
    const template = db.prepare('SELECT * FROM role_templates WHERE id = ?').get(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    if (template.is_system) {
      return res.status(403).json({ error: 'System templates cannot be edited' });
    }

    const { name, description, permission_ids } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }

    if (updates.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE role_templates SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    if (permission_ids && Array.isArray(permission_ids)) {
      const updatePermsTx = db.transaction(() => {
        db.prepare('DELETE FROM role_template_permissions WHERE template_id = ?').run(req.params.id);
        const insertPerm = db.prepare('INSERT INTO role_template_permissions (template_id, permission_id) VALUES (?, ?)');
        for (const permId of permission_ids) {
          insertPerm.run(req.params.id, permId);
        }
      });
      updatePermsTx();
    }

    const updated = db.prepare('SELECT * FROM role_templates WHERE id = ?').get(req.params.id);
    const perms = db.prepare(`
      SELECT p.id, p.resource, p.action FROM role_template_permissions rtp
      JOIN permissions p ON rtp.permission_id = p.id
      WHERE rtp.template_id = ?
    `).all(req.params.id);
    updated.permissions = perms;

    logActivity('role_template', template.id, 'updated', `Template "${updated.name}" updated`, req.user.id);

    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'A template with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to update template', details: err.message });
  }
});

// DELETE /templates/:id — Delete template
router.delete('/templates/:id', authenticate, requirePermission('users:manage_permissions'), (req, res) => {
  try {
    const template = db.prepare('SELECT * FROM role_templates WHERE id = ?').get(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    if (template.is_system) {
      return res.status(403).json({ error: 'System templates cannot be deleted' });
    }

    db.prepare('DELETE FROM role_templates WHERE id = ?').run(req.params.id);

    logActivity('role_template', template.id, 'deleted', `Template "${template.name}" deleted`, req.user.id);

    res.json({ message: 'Template deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete template', details: err.message });
  }
});

// POST /templates/:id/apply/:userId — Apply template permissions as overrides
router.post('/templates/:id/apply/:userId', authenticate, requirePermission('users:manage_permissions'), (req, res) => {
  try {
    const template = db.prepare('SELECT * FROM role_templates WHERE id = ?').get(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const targetUser = db.prepare('SELECT id, role, name FROM users WHERE id = ?').get(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get template permissions
    const templatePermIds = db.prepare(
      'SELECT permission_id FROM role_template_permissions WHERE template_id = ?'
    ).all(template.id).map(r => r.permission_id);

    // Get user's role permissions
    const rolePermIds = db.prepare(
      'SELECT permission_id FROM role_permissions WHERE role = ?'
    ).all(targetUser.role).map(r => r.permission_id);

    const templatePermSet = new Set(templatePermIds);
    const rolePermSet = new Set(rolePermIds);

    const applyTx = db.transaction(() => {
      // Clear existing overrides
      db.prepare('DELETE FROM user_permission_overrides WHERE user_id = ?').run(targetUser.id);

      const insertOverride = db.prepare(
        'INSERT INTO user_permission_overrides (user_id, permission_id, grant_type, granted_by) VALUES (?, ?, ?, ?)'
      );

      // Grant permissions in template that the role doesn't have
      for (const permId of templatePermIds) {
        if (!rolePermSet.has(permId)) {
          insertOverride.run(targetUser.id, permId, 'grant', req.user.id);
        }
      }

      // Revoke role permissions not in the template
      for (const permId of rolePermIds) {
        if (!templatePermSet.has(permId)) {
          insertOverride.run(targetUser.id, permId, 'revoke', req.user.id);
        }
      }
    });
    applyTx();

    const effectivePerms = getEffectivePermissions(targetUser.id);

    logActivity('user', targetUser.id, 'permissions_updated',
      `Template "${template.name}" applied to ${targetUser.name}`, req.user.id);

    res.json({
      message: `Template "${template.name}" applied to user`,
      permissions: Array.from(effectivePerms),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to apply template', details: err.message });
  }
});

module.exports = router;
