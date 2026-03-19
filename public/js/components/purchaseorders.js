const PurchaseOrders = {
  _statusFilter: '',
  _currentPage: 1,
  _pagination: null,

  statusBadge(status) {
    const colors = {
      draft: 'badge-secondary',
      submitted: 'badge-info',
      approved: 'badge-success',
      received: 'badge-primary',
      cancelled: 'badge-danger'
    };
    const labels = {
      draft: 'Draft',
      submitted: 'Submitted',
      approved: 'Approved',
      received: 'Received',
      cancelled: 'Cancelled'
    };
    return `<span class="badge ${colors[status] || 'badge-secondary'}">${labels[status] || status}</span>`;
  },

  async list(page) {
    this._currentPage = page || 1;
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading purchase orders...</p></div>';

    try {
      const params = new URLSearchParams({ page: this._currentPage, limit: 25 });
      if (this._statusFilter) params.set('status', this._statusFilter);

      const data = await API.get(`/purchaseorders?${params.toString()}`);
      const { items: orders, pagination } = Pagination.extract(data, 'orders');
      this._pagination = pagination;

      container.innerHTML = `
        <div class="page-header">
          <h1>Purchase Orders <span class="tip-trigger" data-tip="purchase-order"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
          <button class="btn btn-primary" onclick="Router.navigate('#/purchaseorders/new')">
            <i data-lucide="plus"></i> New Purchase Order
          </button>
        </div>

        <div class="filters-bar">
          <div class="filter-tabs">
            <button class="filter-tab active" onclick="PurchaseOrders.filterStatus('', this)">All</button>
            <button class="filter-tab" onclick="PurchaseOrders.filterStatus('draft', this)">Draft</button>
            <button class="filter-tab" onclick="PurchaseOrders.filterStatus('submitted', this)">Submitted</button>
            <button class="filter-tab" onclick="PurchaseOrders.filterStatus('approved', this)">Approved</button>
            <button class="filter-tab" onclick="PurchaseOrders.filterStatus('received', this)">Received</button>
          </div>
        </div>

        <div class="card">
          <div class="card-body no-padding">
            ${orders.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">
                  <i data-lucide="shopping-cart"></i>
                </div>
                <h2>No Purchase Orders</h2>
                <p class="empty-state-desc">Manage procurement with a clear workflow: Draft your order, submit for approval, then receive goods to auto-update inventory.</p>
                <div class="empty-state-features">
                  <div class="empty-state-feature">
                    <i data-lucide="file-text"></i>
                    <div>
                      <strong>Approval Workflow</strong>
                      <span>Draft → Submit → Approve → Receive with full audit trail</span>
                    </div>
                  </div>
                  <div class="empty-state-feature">
                    <i data-lucide="package"></i>
                    <div>
                      <strong>Auto-Update Inventory</strong>
                      <span>Receiving a PO automatically updates your parts stock levels</span>
                    </div>
                  </div>
                  <div class="empty-state-feature">
                    <i data-lucide="truck"></i>
                    <div>
                      <strong>Vendor Tracking</strong>
                      <span>Link each order to a vendor for organized procurement</span>
                    </div>
                  </div>
                </div>
                <div class="empty-state-connections">
                  <span class="empty-state-conn"><i data-lucide="link"></i> Links Vendors to your Parts inventory</span>
                </div>
                <button class="btn btn-primary" onclick="Router.navigate('#/purchaseorders/new')">
                  <i data-lucide="plus"></i> Create Purchase Order
                </button>
              </div>
            ` : `
              <table class="table" id="po-table">
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Vendor</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Property</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody id="po-tbody">
                </tbody>
              </table>
              <div id="po-empty" class="empty-state-sm" style="display:none">No purchase orders match your filter</div>
              ${Pagination.render(pagination, 'PurchaseOrders')}
            `}
          </div>
        </div>
      `;

      this._orders = orders;
      this._statusFilter = this._statusFilter || '';
      this.renderRows();
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  goToPage(page) {
    if (page < 1 || (this._pagination && page > this._pagination.totalPages)) return;
    this.list(page);
  },

  filterStatus(status, btn) {
    this._statusFilter = status;
    this.list(1);
  },

  renderRows() {
    const tbody = document.getElementById('po-tbody');
    const empty = document.getElementById('po-empty');
    if (!tbody) return;

    const filtered = (this._orders || []).filter(po => {
      if (this._statusFilter && po.status !== this._statusFilter) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
    } else {
      if (empty) empty.style.display = 'none';
      tbody.innerHTML = filtered.map(po => `
        <tr class="clickable-row" onclick="Router.navigate('#/purchaseorders/${po.id}')">
          <td><strong>${po.po_number}</strong></td>
          <td>${po.vendor_name || '-'}</td>
          <td>${this.statusBadge(po.status)}</td>
          <td>$${Number(po.total_cost || 0).toFixed(2)}</td>
          <td>${po.property_name || '-'}</td>
          <td>${Dashboard.formatDate(po.created_at)}</td>
        </tr>
      `).join('');
    }
    lucide.createIcons();
  },

  async detail(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const po = await API.get(`/purchaseorders/${params.id}`);
      const items = po.items || [];
      const user = API.getUser();
      const isAdminOrManager = user && (user.role === 'admin' || user.role === 'manager');

      let actionButtons = '';
      if (po.status === 'draft') {
        actionButtons += `
          <button class="btn btn-primary" onclick="PurchaseOrders.submitPO('${params.id}')">
            <i data-lucide="send"></i> Submit
          </button>
          <button class="btn btn-secondary" onclick="PurchaseOrders.editForm('${params.id}')">
            <i data-lucide="edit"></i> Edit
          </button>
          ${isAdminOrManager ? `
            <button class="btn btn-danger" onclick="PurchaseOrders.remove('${params.id}')">
              <i data-lucide="trash-2"></i> Delete
            </button>
          ` : ''}
        `;
      } else if (po.status === 'submitted' && isAdminOrManager) {
        actionButtons += `
          <button class="btn btn-success" onclick="PurchaseOrders.approvePO('${params.id}')">
            <i data-lucide="check-circle"></i> Approve
          </button>
        `;
      } else if (po.status === 'approved') {
        actionButtons += `
          <button class="btn btn-primary" onclick="PurchaseOrders.receiveForm('${params.id}')">
            <i data-lucide="package-check"></i> Receive
          </button>
        `;
      }

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/purchaseorders')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>${po.po_number}</h1>
            ${this.statusBadge(po.status)}
            ${po.invoice_status ? `<span class="badge" style="background:#8B5CF615;color:#8B5CF6">${po.invoice_status}</span>` : ''}
            ${po.payment_status ? `<span class="badge" style="background:${po.payment_status === 'paid' ? '#10B981' : '#F59E0B'}15;color:${po.payment_status === 'paid' ? '#10B981' : '#F59E0B'}">${po.payment_status.replace(/_/g, ' ')}</span>` : ''}
          </div>
          <div class="page-header-actions">
            ${actionButtons}
            ${po.status === 'received' ? `
              <button class="btn btn-primary" onclick="Router.navigate('#/invoices/new?po_id=${params.id}')">
                <i data-lucide="receipt"></i> Create Invoice
              </button>
            ` : ''}
          </div>
        </div>

        <div class="detail-grid">
          <div class="card">
            <div class="card-header"><h3>PO Details</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field">
                  <label>Vendor</label>
                  <p><a href="#/vendors/${po.vendor_id}" class="link">${po.vendor_name || '-'}</a></p>
                </div>
                <div class="detail-field">
                  <label>Property</label>
                  <p>${po.property_name || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Total Cost</label>
                  <p><strong>$${Number(po.total_cost || 0).toFixed(2)}</strong></p>
                </div>
                <div class="detail-field">
                  <label>Created By</label>
                  <p>${po.created_by_name || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Approved By</label>
                  <p>${po.approved_by_name || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Created</label>
                  <p>${Dashboard.formatDate(po.created_at)}</p>
                </div>
                <div class="detail-field detail-field-full">
                  <label>Notes</label>
                  <p>${po.notes || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Line Items</h3></div>
          <div class="card-body no-padding">
            <table class="table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Part</th>
                  <th>Qty</th>
                  <th>Unit Cost</th>
                  <th>Total</th>
                  ${po.status === 'received' ? '<th>Received</th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${items.map(item => `
                  <tr>
                    <td>${item.description}</td>
                    <td>${item.part_name || '-'}</td>
                    <td>${item.quantity}</td>
                    <td>$${Number(item.unit_cost || 0).toFixed(2)}</td>
                    <td>$${(item.quantity * (item.unit_cost || 0)).toFixed(2)}</td>
                    ${po.status === 'received' ? `<td>${item.received_quantity || 0}</td>` : ''}
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="${po.status === 'received' ? 4 : 3}" style="text-align:right"><strong>Total:</strong></td>
                  <td><strong>$${Number(po.total_cost || 0).toFixed(2)}</strong></td>
                  ${po.status === 'received' ? '<td></td>' : ''}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        ${Attachments.placeholder('purchase_order', params.id)}
      `;
      lucide.createIcons();
      Attachments.load('purchase_order', params.id);
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async form() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const [vendorData, propData, partData] = await Promise.all([
        API.get('/vendors?is_active=1').catch(() => []),
        API.get('/properties').catch(() => []),
        API.get('/parts').catch(() => [])
      ]);
      const vendors = Array.isArray(vendorData) ? vendorData : (vendorData.data || []);
      const properties = Array.isArray(propData) ? propData : (propData.data || []);
      const parts = Array.isArray(partData) ? partData : (partData.data || []);

      // Check for vendor_id in URL query
      const hash = window.location.hash;
      const vendorMatch = hash.match(/vendor_id=(\d+)/);
      const preselectedVendor = vendorMatch ? vendorMatch[1] : '';

      this._formParts = parts;

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/purchaseorders')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>New Purchase Order</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="po-form" onsubmit="PurchaseOrders.handleCreate(event)">
              <div class="form-row">
                <div class="form-group">
                  <label for="po-vendor">Vendor *</label>
                  <select id="po-vendor" class="form-control" required>
                    <option value="">Select vendor...</option>
                    ${vendors.map(v => `<option value="${v.id}" ${String(v.id) === preselectedVendor ? 'selected' : ''}>${v.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="po-property">Property</label>
                  <select id="po-property" class="form-control">
                    <option value="">No specific property</option>
                    ${properties.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label for="po-notes">Notes</label>
                <textarea id="po-notes" class="form-control" rows="2" placeholder="PO notes..."></textarea>
              </div>

              <div class="form-group">
                <label>Line Items *</label>
                <div id="po-items-container">
                  <div class="po-item-row" data-index="0">
                    <div class="form-row">
                      <div class="form-group" style="flex:2">
                        <select class="form-control po-item-part" onchange="PurchaseOrders.partSelected(this, 0)">
                          <option value="">Custom item</option>
                          ${parts.map(p => `<option value="${p.id}" data-cost="${p.unit_cost || 0}">${p.name}${p.sku ? ' (' + p.sku + ')' : ''}</option>`).join('')}
                        </select>
                      </div>
                      <div class="form-group" style="flex:2">
                        <input type="text" class="form-control po-item-desc" placeholder="Description *" required>
                      </div>
                      <div class="form-group" style="flex:1">
                        <input type="number" class="form-control po-item-qty" placeholder="Qty" min="1" value="1" required onchange="PurchaseOrders.calcTotal()">
                      </div>
                      <div class="form-group" style="flex:1">
                        <input type="number" class="form-control po-item-cost" placeholder="Unit $" step="0.01" min="0" value="0" required onchange="PurchaseOrders.calcTotal()">
                      </div>
                      <button type="button" class="btn btn-danger btn-sm btn-icon" onclick="PurchaseOrders.removeItem(this)" title="Remove" style="align-self:flex-end;margin-bottom:1rem">
                        <i data-lucide="x"></i>
                      </button>
                    </div>
                  </div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="PurchaseOrders.addItem()" style="margin-top:0.5rem">
                  <i data-lucide="plus"></i> Add Line Item
                </button>
              </div>

              <div class="form-group">
                <label>Total: <strong id="po-total">$0.00</strong></label>
              </div>

              <div id="po-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/purchaseorders')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="po-submit">Create Purchase Order</button>
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

  _itemIndex: 1,

  addItem() {
    const container = document.getElementById('po-items-container');
    const parts = this._formParts || [];
    const idx = this._itemIndex++;
    const div = document.createElement('div');
    div.className = 'po-item-row';
    div.dataset.index = idx;
    div.innerHTML = `
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <select class="form-control po-item-part" onchange="PurchaseOrders.partSelected(this, ${idx})">
            <option value="">Custom item</option>
            ${parts.map(p => `<option value="${p.id}" data-cost="${p.unit_cost || 0}">${p.name}${p.sku ? ' (' + p.sku + ')' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="flex:2">
          <input type="text" class="form-control po-item-desc" placeholder="Description *" required>
        </div>
        <div class="form-group" style="flex:1">
          <input type="number" class="form-control po-item-qty" placeholder="Qty" min="1" value="1" required onchange="PurchaseOrders.calcTotal()">
        </div>
        <div class="form-group" style="flex:1">
          <input type="number" class="form-control po-item-cost" placeholder="Unit $" step="0.01" min="0" value="0" required onchange="PurchaseOrders.calcTotal()">
        </div>
        <button type="button" class="btn btn-danger btn-sm btn-icon" onclick="PurchaseOrders.removeItem(this)" title="Remove" style="align-self:flex-end;margin-bottom:1rem">
          <i data-lucide="x"></i>
        </button>
      </div>
    `;
    container.appendChild(div);
    lucide.createIcons();
  },

  removeItem(btn) {
    const row = btn.closest('.po-item-row');
    const container = document.getElementById('po-items-container');
    if (container.children.length > 1) {
      row.remove();
      this.calcTotal();
    } else {
      App.toast('At least one line item is required', 'warning');
    }
  },

  partSelected(select, idx) {
    const row = select.closest('.po-item-row');
    const descInput = row.querySelector('.po-item-desc');
    const costInput = row.querySelector('.po-item-cost');
    const opt = select.options[select.selectedIndex];

    if (select.value) {
      const part = (this._formParts || []).find(p => String(p.id) === select.value);
      if (part) {
        descInput.value = part.name;
        costInput.value = part.unit_cost || 0;
        this.calcTotal();
      }
    }
  },

  calcTotal() {
    const rows = document.querySelectorAll('.po-item-row');
    let total = 0;
    rows.forEach(row => {
      const qty = parseFloat(row.querySelector('.po-item-qty').value) || 0;
      const cost = parseFloat(row.querySelector('.po-item-cost').value) || 0;
      total += qty * cost;
    });
    const totalEl = document.getElementById('po-total');
    if (totalEl) totalEl.textContent = '$' + total.toFixed(2);
  },

  getFormItems() {
    const rows = document.querySelectorAll('.po-item-row');
    const items = [];
    rows.forEach(row => {
      const partSelect = row.querySelector('.po-item-part');
      items.push({
        part_id: partSelect.value || null,
        description: row.querySelector('.po-item-desc').value,
        quantity: parseInt(row.querySelector('.po-item-qty').value) || 1,
        unit_cost: parseFloat(row.querySelector('.po-item-cost').value) || 0
      });
    });
    return items;
  },

  async handleCreate(e) {
    e.preventDefault();
    const btn = document.getElementById('po-submit');
    const errorEl = document.getElementById('po-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const body = {
        vendor_id: document.getElementById('po-vendor').value,
        property_id: document.getElementById('po-property').value || null,
        notes: document.getElementById('po-notes').value || null,
        items: this.getFormItems()
      };

      const result = await API.post('/purchaseorders', body);
      App.toast('Purchase order created', 'success');
      Router.navigate(`#/purchaseorders/${result.id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Purchase Order';
    }
  },

  async editForm(id) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const [po, vendorData, propData, partData] = await Promise.all([
        API.get(`/purchaseorders/${id}`),
        API.get('/vendors?is_active=1').catch(() => []),
        API.get('/properties').catch(() => []),
        API.get('/parts').catch(() => [])
      ]);
      const vendors = Array.isArray(vendorData) ? vendorData : (vendorData.data || []);
      const properties = Array.isArray(propData) ? propData : (propData.data || []);
      const parts = Array.isArray(partData) ? partData : (partData.data || []);
      const items = po.items || [];

      this._formParts = parts;
      this._itemIndex = items.length;

      const itemRowsHtml = items.map((item, idx) => `
        <div class="po-item-row" data-index="${idx}">
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <select class="form-control po-item-part" onchange="PurchaseOrders.partSelected(this, ${idx})">
                <option value="">Custom item</option>
                ${parts.map(p => `<option value="${p.id}" ${String(item.part_id) === String(p.id) ? 'selected' : ''} data-cost="${p.unit_cost || 0}">${p.name}${p.sku ? ' (' + p.sku + ')' : ''}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="flex:2">
              <input type="text" class="form-control po-item-desc" placeholder="Description *" required value="${item.description || ''}">
            </div>
            <div class="form-group" style="flex:1">
              <input type="number" class="form-control po-item-qty" placeholder="Qty" min="1" value="${item.quantity || 1}" required onchange="PurchaseOrders.calcTotal()">
            </div>
            <div class="form-group" style="flex:1">
              <input type="number" class="form-control po-item-cost" placeholder="Unit $" step="0.01" min="0" value="${item.unit_cost || 0}" required onchange="PurchaseOrders.calcTotal()">
            </div>
            <button type="button" class="btn btn-danger btn-sm btn-icon" onclick="PurchaseOrders.removeItem(this)" title="Remove" style="align-self:flex-end;margin-bottom:1rem">
              <i data-lucide="x"></i>
            </button>
          </div>
        </div>
      `).join('');

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/purchaseorders/${id}')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>Edit ${po.po_number}</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="po-edit-form" onsubmit="PurchaseOrders.handleUpdate(event, '${id}')">
              <div class="form-row">
                <div class="form-group">
                  <label for="po-vendor">Vendor *</label>
                  <select id="po-vendor" class="form-control" required>
                    <option value="">Select vendor...</option>
                    ${vendors.map(v => `<option value="${v.id}" ${String(po.vendor_id) === String(v.id) ? 'selected' : ''}>${v.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="po-property">Property</label>
                  <select id="po-property" class="form-control">
                    <option value="">No specific property</option>
                    ${properties.map(p => `<option value="${p.id}" ${String(po.property_id) === String(p.id) ? 'selected' : ''}>${p.name}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label for="po-notes">Notes</label>
                <textarea id="po-notes" class="form-control" rows="2">${po.notes || ''}</textarea>
              </div>

              <div class="form-group">
                <label>Line Items *</label>
                <div id="po-items-container">
                  ${itemRowsHtml}
                </div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="PurchaseOrders.addItem()" style="margin-top:0.5rem">
                  <i data-lucide="plus"></i> Add Line Item
                </button>
              </div>

              <div class="form-group">
                <label>Total: <strong id="po-total">$${Number(po.total_cost || 0).toFixed(2)}</strong></label>
              </div>

              <div id="po-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/purchaseorders/${id}')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="po-submit">Save Changes</button>
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

  async handleUpdate(e, id) {
    e.preventDefault();
    const btn = document.getElementById('po-submit');
    const errorEl = document.getElementById('po-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const body = {
        vendor_id: document.getElementById('po-vendor').value,
        property_id: document.getElementById('po-property').value || null,
        notes: document.getElementById('po-notes').value || null,
        items: this.getFormItems()
      };

      await API.put(`/purchaseorders/${id}`, body);
      App.toast('Purchase order updated', 'success');
      Router.navigate(`#/purchaseorders/${id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  },

  async submitPO(id) {
    if (!confirm('Submit this purchase order for approval?')) return;
    try {
      await API.post(`/purchaseorders/${id}/submit`);
      App.toast('Purchase order submitted', 'success');
      this.detail({ id });
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async approvePO(id) {
    if (!confirm('Approve this purchase order?')) return;
    try {
      await API.post(`/purchaseorders/${id}/approve`);
      App.toast('Purchase order approved', 'success');
      this.detail({ id });
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async receiveForm(id) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const po = await API.get(`/purchaseorders/${id}`);
      const items = po.items || [];

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="PurchaseOrders.detail({id: '${id}'})">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>Receive ${po.po_number}</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <p>Enter the received quantity for each line item. Linked parts will have their inventory updated automatically.</p>
            <form id="receive-form" onsubmit="PurchaseOrders.handleReceive(event, '${id}')">
              <table class="table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Part</th>
                    <th>Ordered</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map(item => `
                    <tr>
                      <td>${item.description}</td>
                      <td>${item.part_name || '-'}</td>
                      <td>${item.quantity}</td>
                      <td>
                        <input type="number" class="form-control receive-qty" data-item-id="${item.id}"
                          min="0" max="${item.quantity}" value="${item.quantity}" style="width:80px">
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div id="receive-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="PurchaseOrders.detail({id: '${id}'})">Cancel</button>
                <button type="submit" class="btn btn-primary" id="receive-submit">Confirm Receipt</button>
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

  async handleReceive(e, id) {
    e.preventDefault();
    const btn = document.getElementById('receive-submit');
    const errorEl = document.getElementById('receive-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
      const inputs = document.querySelectorAll('.receive-qty');
      const items = [];
      inputs.forEach(input => {
        items.push({
          id: parseInt(input.dataset.itemId),
          received_quantity: parseInt(input.value) || 0
        });
      });

      await API.post(`/purchaseorders/${id}/receive`, { items });
      App.toast('Purchase order received - inventory updated', 'success');
      this.detail({ id });
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirm Receipt';
    }
  },

  async remove(id) {
    if (!confirm('Delete this draft purchase order?')) return;
    try {
      await API.delete(`/purchaseorders/${id}`);
      App.toast('Purchase order deleted', 'success');
      Router.navigate('#/purchaseorders');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
