const Invoices = {
  _currentPage: 1,
  _pagination: null,
  _statusFilter: 'all',

  statusColors: {
    draft: '#6B7280', matched: '#3B82F6', approved: '#8B5CF6',
    sent_to_billcom: '#F59E0B', processing: '#F97316', paid: '#10B981', void: '#EF4444'
  },

  async list(page) {
    this._currentPage = page || 1;
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading invoices...</p></div>';

    try {
      const params = new URLSearchParams({ page: this._currentPage, limit: 25 });
      if (this._statusFilter !== 'all') params.set('status', this._statusFilter);

      const data = await API.get(`/invoices?${params.toString()}`);
      const { items: invoices, pagination } = Pagination.extract(data, 'invoices');
      this._pagination = pagination;

      const statuses = ['all', 'draft', 'matched', 'approved', 'sent_to_billcom', 'processing', 'paid', 'void'];
      const statusLabels = { all: 'All', draft: 'Draft', matched: 'Matched', approved: 'Approved', sent_to_billcom: 'Sent to Bill.com', processing: 'Processing', paid: 'Paid', void: 'Void' };

      container.innerHTML = `
        <div class="page-header">
          <h1>Invoices <span class="tip-trigger" data-tip="invoice"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
          <button class="btn btn-primary" onclick="Router.navigate('#/invoices/new')">
            <i data-lucide="plus"></i> New Invoice
          </button>
        </div>

        <div class="filters-bar">
          <div class="filter-controls">
            ${statuses.map(s => `
              <button class="filter-chip ${this._statusFilter === s ? 'active' : ''}" onclick="Invoices._statusFilter='${s}';Invoices.list()">
                ${statusLabels[s]}
              </button>
            `).join('')}
          </div>
        </div>

        ${invoices.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon"><i data-lucide="receipt"></i></div>
            <h2>No Invoices Yet</h2>
            <p class="empty-state-desc">Invoices track what vendors bill you. Create one from a received Purchase Order, or enter one manually.</p>
            <div class="empty-state-features">
              <div class="empty-state-feature">
                <i data-lucide="check-circle"></i>
                <div><strong>3-Way Matching</strong><span>Auto-compare PO, received goods, and invoice amounts</span></div>
              </div>
              <div class="empty-state-feature">
                <i data-lucide="send"></i>
                <div><strong>Bill.com Integration</strong><span>Send approved invoices to Bill.com for payment</span></div>
              </div>
            </div>
          </div>
        ` : `
          <div class="card">
            <div class="card-body no-padding">
              <table class="table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Vendor</th>
                    <th>PO #</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  ${invoices.map(inv => `
                    <tr class="clickable-row" onclick="Router.navigate('#/invoices/${inv.id}')">
                      <td><strong>${inv.invoice_number || '-'}</strong></td>
                      <td>${inv.vendor_name || '-'}</td>
                      <td>${inv.po_number || '-'}</td>
                      <td>$${(inv.total_amount || 0).toFixed(2)}</td>
                      <td><span class="badge" style="background:${this.statusColors[inv.status]}15;color:${this.statusColors[inv.status]}">${(inv.status || '').replace(/_/g, ' ')}</span></td>
                      <td>${Dashboard.formatDate(inv.invoice_date)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              ${Pagination.render(pagination, 'Invoices')}
            </div>
          </div>
        `}
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  goToPage(page) { this.list(page); },

  async detail(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const inv = await API.get(`/invoices/${params.id}`);

      const actionButtons = [];
      if (['draft', 'matched'].includes(inv.status)) {
        actionButtons.push(`<button class="btn btn-primary" onclick="Invoices.approve('${inv.id}')"><i data-lucide="check"></i> Approve</button>`);
      }
      if (inv.status === 'approved') {
        actionButtons.push(`<button class="btn btn-primary" onclick="Invoices.sendToBillcom('${inv.id}')"><i data-lucide="send"></i> Send to Bill.com</button>`);
      }
      if (!['paid', 'void'].includes(inv.status)) {
        actionButtons.push(`<button class="btn btn-danger" onclick="Invoices.voidInvoice('${inv.id}')"><i data-lucide="x-circle"></i> Void</button>`);
      }

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/invoices')"><i data-lucide="arrow-left"></i> Back</button>
            <h1>Invoice ${inv.invoice_number || ''}</h1>
            <span class="badge" style="background:${this.statusColors[inv.status]}15;color:${this.statusColors[inv.status]};padding:6px 14px;font-size:13px">${(inv.status || '').replace(/_/g, ' ')}</span>
          </div>
          <div class="page-header-actions">${actionButtons.join('')}</div>
        </div>

        ${inv.po_match ? `
        <div class="card" style="margin-bottom:20px">
          <div class="card-header"><h3>3-Way Match</h3></div>
          <div class="card-body">
            <div class="match-grid">
              <div class="match-item">
                <div class="match-label">PO Total</div>
                <div class="match-value">$${(inv.po_match.po_total || 0).toFixed(2)}</div>
              </div>
              <div class="match-arrow"><i data-lucide="arrow-right"></i></div>
              <div class="match-item">
                <div class="match-label">Invoice Total</div>
                <div class="match-value">$${(inv.total_amount || 0).toFixed(2)}</div>
              </div>
              <div class="match-result ${(inv.matched_discrepancy || 0) <= 1 ? 'match-ok' : 'match-warn'}">
                <i data-lucide="${(inv.matched_discrepancy || 0) <= 1 ? 'check-circle' : 'alert-triangle'}"></i>
                <span>${(inv.matched_discrepancy || 0) <= 1 ? 'Matched' : `${inv.matched_discrepancy}% discrepancy`}</span>
              </div>
            </div>
          </div>
        </div>
        ` : ''}

        <div class="detail-grid">
          <div class="card">
            <div class="card-header"><h3>Invoice Details</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field"><label>Vendor</label><p>${inv.vendor_name ? `<a href="#/vendors/${inv.vendor_id}">${inv.vendor_name}</a>` : '-'}</p></div>
                <div class="detail-field"><label>Invoice Date</label><p>${Dashboard.formatDate(inv.invoice_date)}</p></div>
                <div class="detail-field"><label>Due Date</label><p>${Dashboard.formatDate(inv.due_date)}</p></div>
                <div class="detail-field"><label>Purchase Order</label><p>${inv.po_number ? `<a href="#/purchaseorders/${inv.purchase_order_id}">${inv.po_number}</a>` : 'None'}</p></div>
                ${inv.approved_by_name ? `<div class="detail-field"><label>Approved By</label><p>${inv.approved_by_name}</p></div>` : ''}
                ${inv.billcom_bill_id ? `<div class="detail-field"><label>Bill.com ID</label><p>${inv.billcom_bill_id}</p></div>` : ''}
                ${inv.paid_at ? `<div class="detail-field"><label>Paid At</label><p>${Dashboard.formatDate(inv.paid_at)}</p></div>` : ''}
                ${inv.notes ? `<div class="detail-field detail-field-full"><label>Notes</label><p>${inv.notes}</p></div>` : ''}
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Line Items</h3></div>
          <div class="card-body no-padding">
            <table class="table">
              <thead><tr><th>Description</th><th>GL Account</th><th>Qty</th><th>Unit Cost</th><th>Amount</th></tr></thead>
              <tbody>
                ${(inv.line_items || []).map(li => `
                  <tr>
                    <td>${li.description}</td>
                    <td>${li.gl_account_name || '-'}</td>
                    <td>${li.quantity}</td>
                    <td>$${(li.unit_cost || 0).toFixed(2)}</td>
                    <td><strong>$${(li.amount || 0).toFixed(2)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div style="text-align:right;padding:12px 16px;border-top:1px solid var(--border)">
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                <span style="font-size:13px;color:var(--text-muted)">Subtotal: $${(inv.subtotal || 0).toFixed(2)}</span>
                ${inv.tax_amount ? `<span style="font-size:13px;color:var(--text-muted)">Tax: $${inv.tax_amount.toFixed(2)}</span>` : ''}
                <span style="font-size:16px;font-weight:700">Total: $${(inv.total_amount || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        ${Attachments.placeholder('invoice', params.id)}
      `;
      lucide.createIcons();
      Attachments.load('invoice', params.id);
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async form() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      // Check if creating from PO
      const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const poId = urlParams.get('po_id');

      if (poId) {
        // Create from PO
        const result = await API.post(`/invoices/from-po/${poId}`);
        App.toast('Invoice created from PO', 'success');
        Router.navigate(`#/invoices/${result.id}`);
        return;
      }

      const [vendorData, glData] = await Promise.all([
        API.get('/vendors').catch(() => []),
        API.get('/integrations/gl-accounts').catch(() => [])
      ]);
      const vendors = Array.isArray(vendorData) ? vendorData : (vendorData.data || []);
      const glAccounts = Array.isArray(glData) ? glData : [];

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/invoices')"><i data-lucide="arrow-left"></i> Back</button>
            <h1>New Invoice</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="invoice-form" onsubmit="Invoices.handleCreate(event)">
              <div class="form-row">
                <div class="form-group">
                  <label for="inv-vendor">Vendor *</label>
                  <select id="inv-vendor" class="form-control" required>
                    <option value="">Select vendor...</option>
                    ${vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="inv-number">Invoice Number</label>
                  <input type="text" id="inv-number" class="form-control" placeholder="Auto-generated if blank">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="inv-date">Invoice Date</label>
                  <input type="date" id="inv-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group">
                  <label for="inv-due">Due Date</label>
                  <input type="date" id="inv-due" class="form-control">
                </div>
              </div>
              <div class="form-group">
                <label>Line Items</label>
                <div id="inv-line-items">
                  <div class="inv-line-item" data-index="0">
                    <div class="form-row">
                      <div class="form-group" style="flex:3"><input type="text" class="form-control li-desc" placeholder="Description" required></div>
                      <div class="form-group" style="flex:1"><input type="number" class="form-control li-qty" placeholder="Qty" value="1" min="0" step="any"></div>
                      <div class="form-group" style="flex:1"><input type="number" class="form-control li-cost" placeholder="Unit Cost" step="0.01" min="0"></div>
                      <div class="form-group" style="flex:2">
                        <select class="form-control li-gl">
                          <option value="">GL Account...</option>
                          ${glAccounts.map(gl => `<option value="${gl.id}">${gl.account_number ? gl.account_number + ' - ' : ''}${gl.name}</option>`).join('')}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
                <button type="button" class="btn btn-sm btn-secondary" onclick="Invoices.addLineItem()" style="margin-top:8px">
                  <i data-lucide="plus"></i> Add Line
                </button>
              </div>
              <div class="form-group">
                <label for="inv-tax">Tax Amount</label>
                <input type="number" id="inv-tax" class="form-control" step="0.01" min="0" value="0" style="max-width:200px">
              </div>
              <div class="form-group">
                <label for="inv-notes">Notes</label>
                <textarea id="inv-notes" class="form-control" rows="2"></textarea>
              </div>
              <div id="inv-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/invoices')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="inv-submit">Create Invoice</button>
              </div>
            </form>
          </div>
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  _lineItemCount: 1,

  addLineItem() {
    const container = document.getElementById('inv-line-items');
    if (!container) return;
    const glOptions = container.querySelector('.li-gl').innerHTML;
    const div = document.createElement('div');
    div.className = 'inv-line-item';
    div.innerHTML = `
      <div class="form-row">
        <div class="form-group" style="flex:3"><input type="text" class="form-control li-desc" placeholder="Description" required></div>
        <div class="form-group" style="flex:1"><input type="number" class="form-control li-qty" placeholder="Qty" value="1" min="0" step="any"></div>
        <div class="form-group" style="flex:1"><input type="number" class="form-control li-cost" placeholder="Unit Cost" step="0.01" min="0"></div>
        <div class="form-group" style="flex:2"><select class="form-control li-gl">${glOptions}</select></div>
        <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('.inv-line-item').remove()" style="margin-top:24px"><i data-lucide="trash-2"></i></button>
      </div>
    `;
    container.appendChild(div);
    lucide.createIcons({ nodes: [div] });
  },

  async handleCreate(e) {
    e.preventDefault();
    const btn = document.getElementById('inv-submit');
    const errorEl = document.getElementById('inv-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const lineItems = [];
      document.querySelectorAll('.inv-line-item').forEach(row => {
        const desc = row.querySelector('.li-desc').value;
        const qty = parseFloat(row.querySelector('.li-qty').value) || 1;
        const cost = parseFloat(row.querySelector('.li-cost').value) || 0;
        const gl = row.querySelector('.li-gl').value;
        if (desc) lineItems.push({ description: desc, quantity: qty, unit_cost: cost, gl_account_id: gl || null });
      });

      const body = {
        vendor_id: parseInt(document.getElementById('inv-vendor').value),
        invoice_number: document.getElementById('inv-number').value || null,
        invoice_date: document.getElementById('inv-date').value || null,
        due_date: document.getElementById('inv-due').value || null,
        tax_amount: parseFloat(document.getElementById('inv-tax').value) || 0,
        notes: document.getElementById('inv-notes').value || null,
        line_items: lineItems
      };

      const result = await API.post('/invoices', body);
      App.toast('Invoice created', 'success');
      Router.navigate(`#/invoices/${result.id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Invoice';
    }
  },

  async approve(id) {
    if (!confirm('Approve this invoice for payment?')) return;
    try {
      await API.post(`/invoices/${id}/approve`);
      App.toast('Invoice approved', 'success');
      this.detail({ id });
    } catch (e) { App.toast(e.message, 'error'); }
  },

  async sendToBillcom(id) {
    if (!confirm('Send this invoice to Bill.com for payment?')) return;
    try {
      await API.post(`/invoices/${id}/send-to-billcom`);
      App.toast('Sent to Bill.com', 'success');
      this.detail({ id });
    } catch (e) { App.toast(e.message, 'error'); }
  },

  async voidInvoice(id) {
    if (!confirm('Void this invoice? This cannot be undone.')) return;
    try {
      await API.post(`/invoices/${id}/void`);
      App.toast('Invoice voided', 'success');
      Router.navigate('#/invoices');
    } catch (e) { App.toast(e.message, 'error'); }
  }
};
