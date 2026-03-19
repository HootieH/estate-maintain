const { db } = require('../db');
const BillcomService = require('./billcom');
const QuickBooksService = require('./quickbooks');

const SyncService = {
  async pushInvoiceToBillcom(invoiceId) {
    const invoice = db.prepare(`
      SELECT i.*, v.name AS vendor_name, v.id AS vendor_id
      FROM invoices i
      JOIN vendors v ON i.vendor_id = v.id
      WHERE i.id = ?
    `).get(invoiceId);

    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status !== 'approved') throw new Error('Invoice must be approved before sending to Bill.com');
    if (!BillcomService.isConnected()) throw new Error('Bill.com is not connected. Go to Integrations settings.');

    // Ensure vendor exists in Bill.com
    const billcomVendorId = await BillcomService.ensureVendor(invoice.vendor_id);

    // Get line items
    const lineItems = db.prepare(`
      SELECT ili.*, gl.name AS gl_account_name, gl.qbo_account_id
      FROM invoice_line_items ili
      LEFT JOIN gl_accounts gl ON ili.gl_account_id = gl.id
      WHERE ili.invoice_id = ?
    `).all(invoiceId);

    // Create bill in Bill.com
    const billcomBillId = await BillcomService.createBill(invoice, lineItems, billcomVendorId);

    // Update invoice with Bill.com ID
    db.prepare('UPDATE invoices SET billcom_bill_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(billcomBillId, 'sent_to_billcom', invoiceId);

    // Update PO payment status
    if (invoice.purchase_order_id) {
      db.prepare('UPDATE purchase_orders SET payment_status = ? WHERE id = ?')
        .run('sent_to_billcom', invoice.purchase_order_id);
    }

    return { billcomBillId, status: 'sent_to_billcom' };
  },

  async pollPaymentStatuses() {
    const pendingInvoices = db.prepare(
      "SELECT * FROM invoices WHERE status IN ('sent_to_billcom', 'processing') AND billcom_bill_id IS NOT NULL"
    ).all();

    const results = [];
    for (const invoice of pendingInvoices) {
      try {
        const billStatus = await BillcomService.getBillStatus(invoice.billcom_bill_id);

        let newStatus = invoice.status;
        if (billStatus === 'paid' || billStatus === 'Paid') {
          newStatus = 'paid';
          db.prepare('UPDATE invoices SET status = ?, paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run('paid', invoice.id);
          if (invoice.purchase_order_id) {
            db.prepare('UPDATE purchase_orders SET payment_status = ? WHERE id = ?')
              .run('paid', invoice.purchase_order_id);
          }
        } else if (billStatus === 'processing' || billStatus === 'scheduled') {
          newStatus = 'processing';
          db.prepare('UPDATE invoices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run('processing', invoice.id);
        }

        results.push({ invoiceId: invoice.id, oldStatus: invoice.status, newStatus, billcomStatus: billStatus });
      } catch (e) {
        results.push({ invoiceId: invoice.id, error: e.message });
      }
    }
    return results;
  },

  async syncGLAccounts() {
    if (!QuickBooksService.isConnected()) throw new Error('QuickBooks is not connected');
    return QuickBooksService.syncChartOfAccounts();
  },

  async syncClasses() {
    if (!QuickBooksService.isConnected()) throw new Error('QuickBooks is not connected');
    return QuickBooksService.syncClasses();
  },

  getConnectionStatus() {
    const billcomConnected = BillcomService.isConnected();
    const qboConnected = QuickBooksService.isConnected();
    const billcomConnectedAt = BillcomService.getConfig('connected_at');
    const qboConnectedAt = QuickBooksService.getConfig('connected_at');

    const lastBillcomSync = db.prepare("SELECT created_at FROM sync_log WHERE provider = 'billcom' AND status = 'success' ORDER BY created_at DESC LIMIT 1").get();
    const lastQboSync = db.prepare("SELECT created_at FROM sync_log WHERE provider = 'quickbooks' AND status = 'success' ORDER BY created_at DESC LIMIT 1").get();

    return {
      billcom: { connected: billcomConnected, connectedAt: billcomConnectedAt, lastSync: lastBillcomSync?.created_at },
      quickbooks: { connected: qboConnected, connectedAt: qboConnectedAt, lastSync: lastQboSync?.created_at }
    };
  }
};

module.exports = SyncService;
