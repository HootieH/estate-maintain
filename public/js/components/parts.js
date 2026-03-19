const Parts = {
  _showLowOnly: false,
  _currentPage: 1,
  _pagination: null,

  async list(page) {
    this._currentPage = page || 1;
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading inventory...</p></div>';

    try {
      const params = new URLSearchParams({ page: this._currentPage, limit: 25 });
      if (this._showLowOnly) params.set('low_stock', '1');

      const data = await API.get(`/parts?${params.toString()}`);
      const { items: parts, pagination } = Pagination.extract(data, 'parts');
      this._pagination = pagination;

      container.innerHTML = `
        <div class="page-header">
          <h1>Parts & Inventory <span class="tip-trigger" data-tip="parts"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
          <button class="btn btn-primary" onclick="Router.navigate('#/parts/new')">
            <i data-lucide="plus"></i> Add Part
          </button>
        </div>

        <div class="filters-bar">
          <div class="filter-controls">
            <label class="toggle-filter">
              <input type="checkbox" id="low-stock-toggle" onchange="Parts.toggleLowStock(this.checked)">
              <span>Show Low Stock Only</span>
            </label>
          </div>
        </div>

        <div class="card">
          <div class="card-body no-padding">
            ${parts.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">
                  <i data-lucide="package"></i>
                </div>
                <h2>No Parts in Inventory</h2>
                <p class="empty-state-desc">Keep track of spare parts, supplies, and materials across all your properties. Never run out of critical supplies again.</p>
                <div class="empty-state-features">
                  <div class="empty-state-feature">
                    <i data-lucide="alert-triangle"></i>
                    <div>
                      <strong>Low Stock Alerts</strong>
                      <span>Get notified when inventory drops below minimum levels</span>
                    </div>
                  </div>
                  <div class="empty-state-feature">
                    <i data-lucide="package"></i>
                    <div>
                      <strong>Track by Property</strong>
                      <span>Organize inventory by property for easy management</span>
                    </div>
                  </div>
                  <div class="empty-state-feature">
                    <i data-lucide="shopping-cart"></i>
                    <div>
                      <strong>Purchase Orders</strong>
                      <span>Create purchase orders to restock from your vendors</span>
                    </div>
                  </div>
                </div>
                <div class="empty-state-connections">
                  <span class="empty-state-conn"><i data-lucide="link"></i> Restocked via Purchase Orders from Vendors</span>
                </div>
                <button class="btn btn-primary" onclick="Router.navigate('#/parts/new')">
                  <i data-lucide="plus"></i> Add Your First Part
                </button>
              </div>
            ` : `
              <table class="table" id="parts-table">
                <thead>
                  <tr>
                    <th>Part Name</th>
                    <th>Location</th>
                    <th>Quantity</th>
                    <th>Min Qty</th>
                    <th>Unit Cost</th>
                    <th>Quick Adjust</th>
                  </tr>
                </thead>
                <tbody id="parts-tbody">
                </tbody>
              </table>
              <div id="parts-empty" class="empty-state-sm" style="display:none">No parts match your filter</div>
              ${Pagination.render(pagination, 'Parts')}
            `}
          </div>
        </div>
      `;

      this._parts = parts;
      this._showLowOnly = this._showLowOnly || false;
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

  toggleLowStock(checked) {
    this._showLowOnly = checked;
    this.list(1);
  },

  renderRows() {
    const tbody = document.getElementById('parts-tbody');
    const empty = document.getElementById('parts-empty');
    if (!tbody) return;

    const filtered = (this._parts || []).filter(p => {
      if (this._showLowOnly && p.quantity > (p.min_quantity || 0)) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
    } else {
      if (empty) empty.style.display = 'none';
      tbody.innerHTML = filtered.map(p => {
        const isLow = p.quantity <= (p.min_quantity || 0);
        const isCritical = p.quantity <= 0;
        const rowClass = isCritical ? 'row-critical' : (isLow ? 'row-warning' : '');
        return `
          <tr class="${rowClass} clickable-row" onclick="Router.navigate('#/parts/${p.id}')">
            <td><strong>${p.name}</strong></td>
            <td>${p.location || p.property_name || '-'}</td>
            <td>
              <span class="${isLow ? 'text-danger font-bold' : ''}">${p.quantity}</span>
            </td>
            <td>${p.min_quantity || 0}</td>
            <td>${p.unit_cost ? '$' + Number(p.unit_cost).toFixed(2) : '-'}</td>
            <td class="quick-adjust" onclick="event.stopPropagation()">
              <button class="btn btn-sm btn-secondary" onclick="Parts.adjustQty('${p.id}', -1)" title="Decrease">
                <i data-lucide="minus"></i>
              </button>
              <button class="btn btn-sm btn-secondary" onclick="Parts.adjustQty('${p.id}', 1)" title="Increase">
                <i data-lucide="plus"></i>
              </button>
              <button class="btn btn-sm btn-secondary" onclick="Parts.customAdjust('${p.id}', '${p.name}')" title="Custom">
                <i data-lucide="edit-3"></i>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
    lucide.createIcons();
  },

  async adjustQty(id, delta) {
    try {
      const reason = delta > 0 ? 'Manual increase' : 'Manual decrease';
      await API.put(`/parts/${id}/adjust`, { adjustment: delta, reason });
      const part = this._parts.find(p => String(p.id) === String(id));
      if (part) part.quantity = (part.quantity || 0) + delta;
      this.renderRows();
      App.toast(`Quantity ${delta > 0 ? 'increased' : 'decreased'}`, 'success');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  customAdjust(id, name) {
    const modal = document.getElementById('modal-overlay');
    const title = modal.querySelector('.modal-title');
    const body = modal.querySelector('.modal-body');
    const footer = modal.querySelector('.modal-footer');

    title.textContent = `Adjust: ${name}`;
    body.innerHTML = `
      <div class="form-group">
        <label for="adjust-qty">Quantity Change</label>
        <input type="number" id="adjust-qty" class="form-control" placeholder="e.g., 5 or -3" required>
        <small class="form-hint">Use negative numbers to decrease</small>
      </div>
      <div class="form-group">
        <label for="adjust-reason">Reason</label>
        <input type="text" id="adjust-reason" class="form-control" placeholder="e.g., Restocked from supplier">
      </div>
    `;
    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Parts.submitAdjust('${id}')">Apply</button>
    `;
    modal.style.display = 'flex';
    lucide.createIcons();
    document.getElementById('adjust-qty').focus();
  },

  async submitAdjust(id) {
    const qty = parseInt(document.getElementById('adjust-qty').value);
    const reason = document.getElementById('adjust-reason').value || 'Manual adjustment';
    if (isNaN(qty) || qty === 0) {
      App.toast('Enter a valid quantity', 'error');
      return;
    }
    try {
      await API.put(`/parts/${id}/adjust`, { adjustment: qty, reason });
      const part = this._parts.find(p => String(p.id) === String(id));
      if (part) part.quantity = (part.quantity || 0) + qty;
      this.renderRows();
      App.closeModal();
      App.toast('Quantity adjusted', 'success');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async detail(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const part = await API.get(`/parts/${params.id}`);
      const isLow = part.quantity <= (part.min_quantity || 0);

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/parts')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>${part.name}</h1>
            ${isLow ? '<span class="badge badge-critical">Low Stock</span>' : ''}
          </div>
          <div class="page-header-actions">
            <button class="btn btn-secondary" onclick="Parts.edit('${params.id}')">
              <i data-lucide="edit"></i> Edit
            </button>
            <button class="btn btn-danger" onclick="Parts.remove('${params.id}')">
              <i data-lucide="trash-2"></i> Delete
            </button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="card">
            <div class="card-header"><h3>Part Details</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field">
                  <label>Current Quantity</label>
                  <p class="${isLow ? 'text-danger font-bold' : ''}">${part.quantity || 0}</p>
                </div>
                <div class="detail-field">
                  <label>Minimum Quantity</label>
                  <p>${part.min_quantity || 0}</p>
                </div>
                <div class="detail-field">
                  <label>Unit Cost</label>
                  <p>${part.unit_cost ? '$' + Number(part.unit_cost).toFixed(2) : '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Location / Property</label>
                  <p>${part.location || part.property_name || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Supplier</label>
                  <p>${part.supplier || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Part Number</label>
                  <p>${part.part_number || '-'}</p>
                </div>
                <div class="detail-field detail-field-full">
                  <label>Notes</label>
                  <p>${part.notes || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Adjustment History</h3></div>
          <div class="card-body">
            ${(part.adjustments && part.adjustments.length > 0) ? `
              <table class="table">
                <thead>
                  <tr><th>Date</th><th>Change</th><th>Reason</th><th>By</th></tr>
                </thead>
                <tbody>
                  ${part.adjustments.map(a => `
                    <tr>
                      <td>${Dashboard.formatDate(a.created_at)}</td>
                      <td class="${a.quantity_change > 0 ? 'text-success' : 'text-danger'}">${a.quantity_change > 0 ? '+' : ''}${a.quantity_change}</td>
                      <td>${a.reason || '-'}</td>
                      <td>${a.user_name || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<div class="empty-state-sm">No adjustment history</div>'}
          </div>
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async form() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const propData = await API.get('/properties').catch(() => []);
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/parts')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>New Part</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="part-form" onsubmit="Parts.handleCreate(event)">
              <div class="form-row">
                <div class="form-group">
                  <label for="part-name">Part Name *</label>
                  <input type="text" id="part-name" class="form-control" required placeholder="e.g., HVAC Filter 20x25">
                </div>
                <div class="form-group">
                  <label for="part-number">Part Number</label>
                  <input type="text" id="part-number" class="form-control" placeholder="SKU or part #">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="part-qty">Initial Quantity *</label>
                  <input type="number" id="part-qty" class="form-control" required min="0" value="0">
                </div>
                <div class="form-group">
                  <label for="part-min">Minimum Quantity</label>
                  <input type="number" id="part-min" class="form-control" min="0" value="0">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="part-cost">Unit Cost ($)</label>
                  <input type="number" id="part-cost" class="form-control" step="0.01" min="0" placeholder="0.00">
                </div>
                <div class="form-group">
                  <label for="part-property">Property</label>
                  <select id="part-property" class="form-control">
                    <option value="">No specific property</option>
                    ${properties.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="part-location">Storage Location</label>
                  <input type="text" id="part-location" class="form-control" placeholder="e.g., Garage shelf A3">
                </div>
                <div class="form-group">
                  <label for="part-supplier">Supplier</label>
                  <input type="text" id="part-supplier" class="form-control" placeholder="Supplier name">
                </div>
              </div>
              <div class="form-group">
                <label for="part-notes">Notes</label>
                <textarea id="part-notes" class="form-control" rows="3" placeholder="Any additional notes..."></textarea>
              </div>
              <div id="part-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/parts')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="part-submit">Add Part</button>
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

  async handleCreate(e) {
    e.preventDefault();
    const btn = document.getElementById('part-submit');
    const errorEl = document.getElementById('part-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
      const body = {
        name: document.getElementById('part-name').value,
        part_number: document.getElementById('part-number').value || null,
        quantity: parseInt(document.getElementById('part-qty').value) || 0,
        min_quantity: parseInt(document.getElementById('part-min').value) || 0,
        unit_cost: document.getElementById('part-cost').value ? parseFloat(document.getElementById('part-cost').value) : null,
        property_id: document.getElementById('part-property').value || null,
        location: document.getElementById('part-location').value || null,
        supplier: document.getElementById('part-supplier').value || null,
        notes: document.getElementById('part-notes').value || null
      };
      const result = await API.post('/parts', body);
      App.toast('Part added', 'success');
      Router.navigate(`#/parts/${result.id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add Part';
    }
  },

  async edit(id) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const [part, propData] = await Promise.all([
        API.get(`/parts/${id}`),
        API.get('/properties').catch(() => [])
      ]);
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/parts/${id}')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>Edit Part</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="part-edit-form" onsubmit="Parts.handleUpdate(event, '${id}')">
              <div class="form-row">
                <div class="form-group">
                  <label for="part-name">Part Name *</label>
                  <input type="text" id="part-name" class="form-control" required value="${part.name || ''}">
                </div>
                <div class="form-group">
                  <label for="part-number">Part Number</label>
                  <input type="text" id="part-number" class="form-control" value="${part.part_number || ''}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="part-min">Minimum Quantity</label>
                  <input type="number" id="part-min" class="form-control" min="0" value="${part.min_quantity || 0}">
                </div>
                <div class="form-group">
                  <label for="part-cost">Unit Cost ($)</label>
                  <input type="number" id="part-cost" class="form-control" step="0.01" min="0" value="${part.unit_cost || ''}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="part-property">Property</label>
                  <select id="part-property" class="form-control">
                    <option value="">No specific property</option>
                    ${properties.map(p => `<option value="${p.id}" ${String(part.property_id) === String(p.id) ? 'selected' : ''}>${p.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="part-location">Storage Location</label>
                  <input type="text" id="part-location" class="form-control" value="${part.location || ''}">
                </div>
              </div>
              <div class="form-group">
                <label for="part-supplier">Supplier</label>
                <input type="text" id="part-supplier" class="form-control" value="${part.supplier || ''}">
              </div>
              <div class="form-group">
                <label for="part-notes">Notes</label>
                <textarea id="part-notes" class="form-control" rows="3">${part.notes || ''}</textarea>
              </div>
              <div id="part-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/parts/${id}')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="part-submit">Save Changes</button>
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
    const btn = document.getElementById('part-submit');
    const errorEl = document.getElementById('part-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const body = {
        name: document.getElementById('part-name').value,
        part_number: document.getElementById('part-number').value || null,
        min_quantity: parseInt(document.getElementById('part-min').value) || 0,
        unit_cost: document.getElementById('part-cost').value ? parseFloat(document.getElementById('part-cost').value) : null,
        property_id: document.getElementById('part-property').value || null,
        location: document.getElementById('part-location').value || null,
        supplier: document.getElementById('part-supplier').value || null,
        notes: document.getElementById('part-notes').value || null
      };
      await API.put(`/parts/${id}`, body);
      App.toast('Part updated', 'success');
      Router.navigate(`#/parts/${id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  },

  async remove(id) {
    if (!confirm('Are you sure you want to delete this part?')) return;
    try {
      await API.delete(`/parts/${id}`);
      App.toast('Part deleted', 'success');
      Router.navigate('#/parts');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
