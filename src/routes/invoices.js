const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

// GET / - List invoices
router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT i.*, v.name AS vendor_name, po.po_number,
        u.name AS created_by_name, ap.name AS approved_by_name
      FROM invoices i
      LEFT JOIN vendors v ON i.vendor_id = v.id
      LEFT JOIN purchase_orders po ON i.purchase_order_id = po.id
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN users ap ON i.approved_by = ap.id
    `;
    const conditions = [];
    const params = [];

    if (req.query.status) { conditions.push('i.status = ?'); params.push(req.query.status); }
    if (req.query.vendor_id) { conditions.push('i.vendor_id = ?'); params.push(req.query.vendor_id); }
    if (req.query.purchase_order_id) { conditions.push('i.purchase_order_id = ?'); params.push(req.query.purchase_order_id); }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY i.created_at DESC';

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;

    let countSql = 'SELECT COUNT(*) as total FROM invoices i';
    if (conditions.length > 0) countSql += ' WHERE ' + conditions.join(' AND ');
    const { total } = db.prepare(countSql).get(...params);

    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const invoices = db.prepare(sql).all(...params);
    res.json({ data: invoices, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invoices', details: err.message });
  }
});

// GET /:id - Invoice detail
router.get('/:id', (req, res) => {
  try {
    const invoice = db.prepare(`
      SELECT i.*, v.name AS vendor_name, v.email AS vendor_email,
        po.po_number, po.status AS po_status,
        u.name AS created_by_name, ap.name AS approved_by_name
      FROM invoices i
      LEFT JOIN vendors v ON i.vendor_id = v.id
      LEFT JOIN purchase_orders po ON i.purchase_order_id = po.id
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN users ap ON i.approved_by = ap.id
      WHERE i.id = ?
    `).get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // Line items
    const lineItems = db.prepare(`
      SELECT ili.*, gl.name AS gl_account_name, poi.description AS po_item_description
      FROM invoice_line_items ili
      LEFT JOIN gl_accounts gl ON ili.gl_account_id = gl.id
      LEFT JOIN purchase_order_items poi ON ili.purchase_order_item_id = poi.id
      WHERE ili.invoice_id = ?
      ORDER BY ili.id
    `).all(req.params.id);
    invoice.line_items = lineItems;

    // PO match data if linked
    if (invoice.purchase_order_id) {
      const poItems = db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?').all(invoice.purchase_order_id);
      const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(invoice.purchase_order_id);
      invoice.po_match = {
        po_total: po ? po.total_cost : 0,
        po_items: poItems,
        invoice_total: invoice.total_amount,
        discrepancy: invoice.matched_discrepancy
      };
    }

    res.json(invoice);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invoice', details: err.message });
  }
});

// POST /from-po/:poId - Create invoice from received PO
router.post('/from-po/:poId', requireRole('admin', 'manager'), (req, res) => {
  try {
    const po = db.prepare(`
      SELECT po.*, v.name AS vendor_name
      FROM purchase_orders po
      LEFT JOIN vendors v ON po.vendor_id = v.id
      WHERE po.id = ?
    `).get(req.params.poId);
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    if (po.status !== 'received') return res.status(400).json({ error: 'PO must be received before creating an invoice' });

    // Check if invoice already exists for this PO
    const existing = db.prepare('SELECT id FROM invoices WHERE purchase_order_id = ?').get(po.id);
    if (existing) return res.status(409).json({ error: 'Invoice already exists for this PO', invoice_id: existing.id });

    const poItems = db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?').all(po.id);

    // Create invoice
    const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;
    const subtotal = poItems.reduce((sum, item) => sum + (item.received_quantity * item.unit_cost), 0);

    const result = db.prepare(`
      INSERT INTO invoices (invoice_number, purchase_order_id, vendor_id, invoice_date, due_date, subtotal, tax_amount, total_amount, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'draft', ?)
    `).run(
      invoiceNumber, po.id, po.vendor_id,
      new Date().toISOString().split('T')[0],
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      subtotal, subtotal, req.user.id
    );

    const invoiceId = result.lastInsertRowid;

    // Create line items from PO items
    const insertItem = db.prepare(`
      INSERT INTO invoice_line_items (invoice_id, purchase_order_item_id, description, quantity, unit_cost, amount)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const item of poItems) {
      const qty = item.received_quantity || item.quantity;
      insertItem.run(invoiceId, item.id, item.description, qty, item.unit_cost, qty * item.unit_cost);
    }

    // Run 3-way match
    const discrepancy = Math.abs(subtotal - po.total_cost) / Math.max(po.total_cost, 0.01) * 100;
    const matchStatus = discrepancy <= 1 ? 'matched' : 'draft';
    db.prepare('UPDATE invoices SET matched_discrepancy = ?, status = ? WHERE id = ?').run(Math.round(discrepancy * 100) / 100, matchStatus, invoiceId);

    // Update PO
    db.prepare('UPDATE purchase_orders SET invoice_status = ? WHERE id = ?').run('invoiced', po.id);

    logActivity('invoice', invoiceId, 'created', `Invoice ${invoiceNumber} created from PO ${po.po_number}`, req.user.id);

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    res.status(201).json(invoice);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create invoice', details: err.message });
  }
});

// POST / - Create manual invoice
router.post('/', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { vendor_id, invoice_number, invoice_date, due_date, notes, line_items, tax_amount, purchase_order_id } = req.body;
    if (!vendor_id) return res.status(400).json({ error: 'Vendor is required' });
    if (!line_items || !line_items.length) return res.status(400).json({ error: 'At least one line item is required' });

    const subtotal = line_items.reduce((sum, li) => sum + ((li.quantity || 1) * (li.unit_cost || 0)), 0);
    const tax = tax_amount || 0;
    const total = subtotal + tax;
    const invNum = invoice_number || `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;

    const result = db.prepare(`
      INSERT INTO invoices (invoice_number, purchase_order_id, vendor_id, invoice_date, due_date, subtotal, tax_amount, total_amount, status, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
    `).run(invNum, purchase_order_id || null, vendor_id, invoice_date || new Date().toISOString().split('T')[0],
      due_date || null, subtotal, tax, total, notes || null, req.user.id);

    const invoiceId = result.lastInsertRowid;
    const insertItem = db.prepare('INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_cost, amount, gl_account_id) VALUES (?, ?, ?, ?, ?, ?)');
    for (const li of line_items) {
      const qty = li.quantity || 1;
      const cost = li.unit_cost || 0;
      insertItem.run(invoiceId, li.description, qty, cost, qty * cost, li.gl_account_id || null);
    }

    logActivity('invoice', invoiceId, 'created', `Invoice ${invNum} created`, req.user.id);
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    res.status(201).json(invoice);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create invoice', details: err.message });
  }
});

// POST /:id/approve
router.post('/:id/approve', requireRole('admin', 'manager'), (req, res) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (!['draft', 'matched'].includes(invoice.status)) return res.status(400).json({ error: 'Only draft or matched invoices can be approved' });

    db.prepare('UPDATE invoices SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('approved', req.user.id, req.params.id);

    logActivity('invoice', parseInt(req.params.id), 'approved', `Invoice ${invoice.invoice_number} approved`, req.user.id);
    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve invoice', details: err.message });
  }
});

// POST /:id/send-to-billcom
router.post('/:id/send-to-billcom', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const SyncService = require('../services/sync');
    const result = await SyncService.pushInvoiceToBillcom(parseInt(req.params.id));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send to Bill.com', details: err.message });
  }
});

// POST /:id/void
router.post('/:id/void', requireRole('admin', 'manager'), (req, res) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (['paid', 'void'].includes(invoice.status)) return res.status(400).json({ error: 'Cannot void a paid or already voided invoice' });

    db.prepare('UPDATE invoices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('void', req.params.id);
    logActivity('invoice', parseInt(req.params.id), 'voided', `Invoice ${invoice.invoice_number} voided`, req.user.id);
    res.json({ message: 'Invoice voided' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to void invoice', details: err.message });
  }
});

// DELETE /:id - Only draft
router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status !== 'draft') return res.status(400).json({ error: 'Only draft invoices can be deleted' });

    db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
    logActivity('invoice', parseInt(req.params.id), 'deleted', `Invoice ${invoice.invoice_number} deleted`, req.user.id);
    res.json({ message: 'Invoice deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete invoice', details: err.message });
  }
});

module.exports = router;
