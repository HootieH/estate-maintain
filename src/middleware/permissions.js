const { db } = require('../db');

/**
 * Get the effective permission set for a user (role defaults + overrides).
 * Returns a Set of "resource:action" strings.
 */
function getEffectivePermissions(userId) {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  if (!user) return new Set();

  // Get role-based permissions
  const rolePerms = db.prepare(`
    SELECT p.resource, p.action FROM role_permissions rp
    JOIN permissions p ON rp.permission_id = p.id
    WHERE rp.role = ?
  `).all(user.role);

  const permSet = new Set(rolePerms.map(p => `${p.resource}:${p.action}`));

  // Apply user-specific overrides
  const overrides = db.prepare(`
    SELECT p.resource, p.action, upo.grant_type FROM user_permission_overrides upo
    JOIN permissions p ON upo.permission_id = p.id
    WHERE upo.user_id = ?
  `).all(userId);

  for (const o of overrides) {
    const key = `${o.resource}:${o.action}`;
    if (o.grant_type === 'grant') {
      permSet.add(key);
    } else {
      permSet.delete(key);
    }
  }

  return permSet;
}

/**
 * Middleware: require one or more permissions (any match = allowed).
 * Usage: requirePermission('workorders:create')
 *        requirePermission('workorders:edit', 'workorders:delete')
 */
function requirePermission(...perms) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!req.user.permissions) {
      return res.status(403).json({ error: 'Permissions not loaded' });
    }
    const has = perms.some(p => req.user.permissions.has(p));
    if (!has) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Get property IDs a user has access to.
 * - Owner (is_owner=1): null (sees everything — system-level access, set only via CLI)
 * - Everyone else: scoped to their user_property_access records
 * - Empty records = empty view (user sees nothing until granted access or creates a property)
 */
function getPropertyScope(userId) {
  const user = db.prepare('SELECT is_owner FROM users WHERE id = ?').get(userId);
  if (user && user.is_owner) return null; // owner sees all
  const rows = db.prepare('SELECT property_id FROM user_property_access WHERE user_id = ?').all(userId);
  return rows.map(r => r.property_id);
}

/**
 * Grant a user access to a property. Idempotent.
 */
function grantPropertyAccess(userId, propertyId, grantedBy) {
  db.prepare('INSERT OR IGNORE INTO user_property_access (user_id, property_id, granted_by) VALUES (?, ?, ?)')
    .run(userId, propertyId, grantedBy || null);
}

/**
 * Build a SQL WHERE clause fragment for property scoping.
 * Returns { clause: string, params: array } or null if no scoping needed.
 * columnName is the property_id column in the target table.
 */
function propertyScopeClause(userId, columnName = 'property_id') {
  const ids = getPropertyScope(userId);
  if (ids === null) return null;
  if (ids.length === 0) return { clause: `${columnName} IN ()`, params: [] }; // empty = no access
  const placeholders = ids.map(() => '?').join(',');
  return { clause: `${columnName} IN (${placeholders})`, params: ids };
}

module.exports = { getEffectivePermissions, requirePermission, getPropertyScope, propertyScopeClause, grantPropertyAccess };
