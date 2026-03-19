const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

function generatePONumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const existing = db.prepare(
    "SELECT COUNT(*) AS cnt FROM purchase_orders WHERE po_number LIKE ?"
  ).get(`PO-${dateStr}-%`);
  const seq = String((existing.cnt || 0) + 1).padStart(3, '0');
  return `PO-${dateStr}-${seq}`;
}

// GET /
router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT po.*, v.name AS vendor_name, p.name AS property_name,
        u.name AS created_by_name
      FROM purchase_orders po
      LEFT JOIN vendors v ON po.vendor_id = v.id
      LEFT JOIN properties p ON po.property_id = p.id
      LEFT JOIN users u ON po.created_by = u.id
    `;
    const conditions = [];
    const params = [];

    if (req.query.status) {
      conditions.push('po.status = ?');
      params.push(req.query.status);
    }
    if (req.query.vendor_id) {
      conditions.push('po.vendor_id = ?');
      params.push(req.query.vendor_id);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY po.created_at DESC';

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;

    let countSql = `SELECT COUNT(*) as total FROM purchase_orders po`;
    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
    }
    const { total } = db.prepare(countSql).get(...params);

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const orders = db.prepare(sql).all(...params);
    res.json({
      data: orders,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch purchase orders', details: err.message });
  }
});

// GET /:id
router.get('/:id', (req, res) => {
  try {
    const po = db.prepare(`
      SELECT po.*, v.name AS vendor_name, v.email AS vendor_email, v.phone AS vendor_phone,
        p.name AS property_name,
        u.name AS created_by_name, a.name AS approved_by_name
      FROM purchase_orders po
      LEFT JOIN vendors v ON po.vendor_id = v.id
      LEFT JOIN properties p ON po.property_id = p.id
      LEFT JOIN users u ON po.created_by = u.id
      LEFT JOIN users a ON po.approved_by = a.id
      WHERE po.id = ?
    `).get(req.params.id);

    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    const items = db.prepare(`
      SELECT poi.*, pt.name AS part_name, pt.sku AS part_sku
      FROM purchase_order_items poi
      LEFT JOIN parts pt ON poi.part_id = pt.id
      WHERE poi.purchase_order_id = ?
    `).all(req.params.id);

    res.json({ ...po, items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch purchase order', details: err.message });
  }
});

// POST /
router.post('/', (req, res) => {
  try {
    const { vendor_id, property_id, notes, items } = req.body;

    if (!vendor_id) {
      return res.status(400).json({ error: 'Vendor is required' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required' });
    }

    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(vendor_id);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const po_number = generatePONumber();
    let total_cost = 0;
    for (const item of items) {
      total_cost += (item.quantity || 1) * (item.unit_cost || 0);
    }

    const insertPO = db.prepare(`
      INSERT INTO purchase_orders (po_number, vendor_id, property_id, status, total_cost, notes, created_by)
      VALUES (?, ?, ?, 'draft', ?, ?, ?)
    `);

    const insertItem = db.prepare(`
      INSERT INTO purchase_order_items (purchase_order_id, part_id, description, quantity, unit_cost)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      const result = insertPO.run(
        po_number, vendor_id, property_id || null,
        total_cost, notes || null, req.user.id
      );
      const poId = result.lastInsertRowid;

      for (const item of items) {
        insertItem.run(
          poId, item.part_id || null, item.description,
          item.quantity || 1, item.unit_cost || 0
        );
      }

      return poId;
    });

    const poId = transaction();
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId);
    logActivity('purchase_order', poId, 'created', `PO ${po_number} created`, req.user.id);

    res.status(201).json(po);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create purchase order', details: err.message });
  }
});

// PUT /:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    if (existing.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft purchase orders can be edited' });
    }

    const { vendor_id, property_id, notes, items } = req.body;

    const transaction = db.transaction(() => {
      if (items && Array.isArray(items)) {
        // Recalculate total
        let total_cost = 0;
        for (const item of items) {
          total_cost += (item.quantity || 1) * (item.unit_cost || 0);
        }

        // Replace items
        db.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id = ?').run(req.params.id);
        const insertItem = db.prepare(`
          INSERT INTO purchase_order_items (purchase_order_id, part_id, description, quantity, unit_cost)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const item of items) {
          insertItem.run(
            req.params.id, item.part_id || null, item.description,
            item.quantity || 1, item.unit_cost || 0
          );
        }

        db.prepare(`
          UPDATE purchase_orders SET vendor_id = ?, property_id = ?, notes = ?, total_cost = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          vendor_id || existing.vendor_id,
          property_id !== undefined ? property_id : existing.property_id,
          notes !== undefined ? notes : existing.notes,
          total_cost,
          req.params.id
        );
      } else {
        db.prepare(`
          UPDATE purchase_orders SET vendor_id = ?, property_id = ?, notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          vendor_id || existing.vendor_id,
          property_id !== undefined ? property_id : existing.property_id,
          notes !== undefined ? notes : existing.notes,
          req.params.id
        );
      }
    });

    transaction();

    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    logActivity('purchase_order', po.id, 'updated', `PO ${po.po_number} updated`, req.user.id);

    res.json(po);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update purchase order', details: err.message });
  }
});

// POST /:id/submit
router.post('/:id/submit', (req, res) => {
  try {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    if (po.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft purchase orders can be submitted' });
    }

    db.prepare("UPDATE purchase_orders SET status = 'submitted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    logActivity('purchase_order', po.id, 'submitted', `PO ${po.po_number} submitted`, req.user.id);

    const updated = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit purchase order', details: err.message });
  }
});

// POST /:id/approve
router.post('/:id/approve', requireRole('admin', 'manager'), (req, res) => {
  try {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    if (po.status !== 'submitted') {
      return res.status(400).json({ error: 'Only submitted purchase orders can be approved' });
    }

    db.prepare(
      "UPDATE purchase_orders SET status = 'approved', approved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(req.user.id, req.params.id);
    logActivity('purchase_order', po.id, 'approved', `PO ${po.po_number} approved`, req.user.id);

    const updated = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve purchase order', details: err.message });
  }
});

// POST /:id/receive
router.post('/:id/receive', (req, res) => {
  try {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    if (po.status !== 'approved') {
      return res.status(400).json({ error: 'Only approved purchase orders can be received' });
    }

    const { items } = req.body;

    const transaction = db.transaction(() => {
      if (items && Array.isArray(items) && items.length > 0) {
        for (const item of items) {
          // Update received_quantity on item
          db.prepare(
            'UPDATE purchase_order_items SET received_quantity = ? WHERE id = ?'
          ).run(item.received_quantity || 0, item.id);

          // If item links to a part, add received_quantity to part stock
          const poItem = db.prepare('SELECT * FROM purchase_order_items WHERE id = ?').get(item.id);
          if (poItem && poItem.part_id && item.received_quantity > 0) {
            db.prepare('UPDATE parts SET quantity = quantity + ? WHERE id = ?')
              .run(item.received_quantity, poItem.part_id);
            logActivity('part', poItem.part_id, 'adjusted',
              `+${item.received_quantity} received from PO ${po.po_number}`, req.user.id);
          }
        }
      } else {
        // No items specified — auto-receive all items at ordered quantity
        const poItems = db.prepare(
          'SELECT * FROM purchase_order_items WHERE purchase_order_id = ?'
        ).all(req.params.id);
        for (const poItem of poItems) {
          db.prepare(
            'UPDATE purchase_order_items SET received_quantity = ? WHERE id = ?'
          ).run(poItem.quantity, poItem.id);

          if (poItem.part_id && poItem.quantity > 0) {
            db.prepare('UPDATE parts SET quantity = quantity + ? WHERE id = ?')
              .run(poItem.quantity, poItem.part_id);
            logActivity('part', poItem.part_id, 'adjusted',
              `+${poItem.quantity} received from PO ${po.po_number}`, req.user.id);
          }
        }
      }

      db.prepare(
        "UPDATE purchase_orders SET status = 'received', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(req.params.id);
    });

    transaction();
    logActivity('purchase_order', po.id, 'received', `PO ${po.po_number} received`, req.user.id);

    const updated = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to receive purchase order', details: err.message });
  }
});

// DELETE /:id
router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    if (po.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft purchase orders can be deleted' });
    }

    db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(req.params.id);
    logActivity('purchase_order', parseInt(req.params.id), 'deleted', `PO ${po.po_number} deleted`, req.user.id);

    res.json({ message: 'Purchase order deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete purchase order', details: err.message });
  }
});

module.exports = router;
