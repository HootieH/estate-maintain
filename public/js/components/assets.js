const Assets = {
  async list() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading assets...</p></div>';

    try {
      const [assetData, propData] = await Promise.all([
        API.get('/assets'),
        API.get('/properties').catch(() => [])
      ]);
      const assets = Array.isArray(assetData) ? assetData : (assetData.data || assetData.assets || []);
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);

      container.innerHTML = `
        <div class="page-header">
          <h1>Assets</h1>
          <button class="btn btn-primary" onclick="Router.navigate('#/assets/new')">
            <i data-lucide="plus"></i> Add Asset
          </button>
        </div>

        <div class="filters-bar">
          <div class="filter-controls">
            <select class="form-control form-control-sm" id="asset-prop-filter" onchange="Assets.filterByProperty(this.value)">
              <option value="all">All Properties</option>
              ${properties.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
            <select class="form-control form-control-sm" id="asset-status-filter" onchange="Assets.filterByStatus(this.value)">
              <option value="all">All Statuses</option>
              <option value="operational">Operational</option>
              <option value="needs_repair">Needs Repair</option>
              <option value="out_of_service">Out of Service</option>
              <option value="retired">Retired</option>
            </select>
          </div>
        </div>

        <div class="card">
          <div class="card-body no-padding">
            <table class="table" id="assets-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Property</th>
                  <th>Status</th>
                  <th>Install Date</th>
                </tr>
              </thead>
              <tbody id="assets-tbody"></tbody>
            </table>
            <div id="assets-empty" class="empty-state" style="display:none">
              <i data-lucide="wrench" class="empty-icon"></i>
              <h2>No Assets</h2>
              <p>No assets match your filters.</p>
            </div>
          </div>
        </div>
      `;

      this._assets = assets;
      this._filterProp = 'all';
      this._filterStatus = 'all';
      this.applyFilters();
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  filterByProperty(val) {
    this._filterProp = val;
    this.applyFilters();
  },

  filterByStatus(val) {
    this._filterStatus = val;
    this.applyFilters();
  },

  applyFilters() {
    const filtered = (this._assets || []).filter(a => {
      if (this._filterProp !== 'all' && String(a.property_id) !== String(this._filterProp)) return false;
      if (this._filterStatus !== 'all' && a.status !== this._filterStatus) return false;
      return true;
    });

    const tbody = document.getElementById('assets-tbody');
    const empty = document.getElementById('assets-empty');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
    } else {
      if (empty) empty.style.display = 'none';
      tbody.innerHTML = filtered.map(a => `
        <tr class="clickable-row" onclick="Router.navigate('#/assets/${a.id}')">
          <td><strong>${a.name}</strong></td>
          <td>${a.category || '-'}</td>
          <td>${a.property_name || '-'}</td>
          <td><span class="badge badge-asset-${(a.status || 'operational').replace(/\s+/g, '_')}">${(a.status || 'operational').replace(/_/g, ' ')}</span></td>
          <td>${Dashboard.formatDate(a.install_date)}</td>
        </tr>
      `).join('');
    }
  },

  async detail(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const asset = await API.get(`/assets/${params.id}`);
      const woData = await API.get(`/assets/${params.id}/workorders`).catch(() => []);
      const workorders = Array.isArray(woData) ? woData : (woData.data || woData.workorders || []);

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/assets')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>${asset.name}</h1>
            <span class="badge badge-asset-${(asset.status || 'operational').replace(/\s+/g, '_')}">${(asset.status || 'operational').replace(/_/g, ' ')}</span>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-secondary" onclick="Assets.edit('${params.id}')">
              <i data-lucide="edit"></i> Edit
            </button>
            <button class="btn btn-danger" onclick="Assets.remove('${params.id}')">
              <i data-lucide="trash-2"></i> Delete
            </button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="card">
            <div class="card-header"><h3>Asset Details</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field">
                  <label>Category</label>
                  <p>${asset.category || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Property</label>
                  <p>${asset.property_name ? `<a href="#/properties/${asset.property_id}">${asset.property_name}</a>` : '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Make / Model</label>
                  <p>${[asset.make, asset.model].filter(Boolean).join(' / ') || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Serial Number</label>
                  <p>${asset.serial_number || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Install Date</label>
                  <p>${Dashboard.formatDate(asset.install_date)}</p>
                </div>
                <div class="detail-field">
                  <label>Warranty Expiry</label>
                  <p>${Dashboard.formatDate(asset.warranty_expiry)}</p>
                </div>
                <div class="detail-field detail-field-full">
                  <label>Notes</label>
                  <p>${asset.notes || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Related Work Orders</h3>
          </div>
          <div class="card-body">
            ${workorders.length === 0 ? '<div class="empty-state-sm">No work orders for this asset</div>' : `
              <table class="table">
                <thead>
                  <tr><th>Title</th><th>Priority</th><th>Status</th><th>Due Date</th></tr>
                </thead>
                <tbody>
                  ${workorders.map(wo => `
                    <tr class="clickable-row" onclick="Router.navigate('#/workorders/${wo.id}')">
                      <td>${wo.title}</td>
                      <td><span class="badge badge-${wo.priority}">${wo.priority}</span></td>
                      <td><span class="badge badge-status-${(wo.status || '').replace(/\s+/g, '_')}">${wo.status}</span></td>
                      <td>${Dashboard.formatDate(wo.due_date)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
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
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/assets')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>New Asset</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="asset-form" onsubmit="Assets.handleCreate(event)">
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-name">Name *</label>
                  <input type="text" id="asset-name" class="form-control" required placeholder="e.g., HVAC Unit #1">
                </div>
                <div class="form-group">
                  <label for="asset-category">Category</label>
                  <select id="asset-category" class="form-control">
                    <option value="">Select...</option>
                    <option value="HVAC">HVAC</option>
                    <option value="Plumbing">Plumbing</option>
                    <option value="Electrical">Electrical</option>
                    <option value="Appliance">Appliance</option>
                    <option value="Roofing">Roofing</option>
                    <option value="Landscaping">Landscaping</option>
                    <option value="Security">Security</option>
                    <option value="Pool">Pool</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-property">Property *</label>
                  <select id="asset-property" class="form-control" required>
                    <option value="">Select property...</option>
                    ${properties.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="asset-status">Status</label>
                  <select id="asset-status" class="form-control">
                    <option value="operational">Operational</option>
                    <option value="needs_repair">Needs Repair</option>
                    <option value="out_of_service">Out of Service</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-make">Make</label>
                  <input type="text" id="asset-make" class="form-control" placeholder="Manufacturer">
                </div>
                <div class="form-group">
                  <label for="asset-model">Model</label>
                  <input type="text" id="asset-model" class="form-control" placeholder="Model number">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-serial">Serial Number</label>
                  <input type="text" id="asset-serial" class="form-control" placeholder="Serial number">
                </div>
                <div class="form-group">
                  <label for="asset-install">Install Date</label>
                  <input type="date" id="asset-install" class="form-control">
                </div>
              </div>
              <div class="form-group">
                <label for="asset-warranty">Warranty Expiry</label>
                <input type="date" id="asset-warranty" class="form-control">
              </div>
              <div class="form-group">
                <label for="asset-notes">Notes</label>
                <textarea id="asset-notes" class="form-control" rows="3" placeholder="Any additional notes..."></textarea>
              </div>
              <div id="asset-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/assets')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="asset-submit">Create Asset</button>
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
    const btn = document.getElementById('asset-submit');
    const errorEl = document.getElementById('asset-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const body = {
        name: document.getElementById('asset-name').value,
        category: document.getElementById('asset-category').value || null,
        property_id: document.getElementById('asset-property').value,
        status: document.getElementById('asset-status').value,
        make: document.getElementById('asset-make').value || null,
        model: document.getElementById('asset-model').value || null,
        serial_number: document.getElementById('asset-serial').value || null,
        install_date: document.getElementById('asset-install').value || null,
        warranty_expiry: document.getElementById('asset-warranty').value || null,
        notes: document.getElementById('asset-notes').value || null
      };
      const result = await API.post('/assets', body);
      App.toast('Asset created', 'success');
      Router.navigate(`#/assets/${result.id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Asset';
    }
  },

  async edit(id) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const [asset, propData] = await Promise.all([
        API.get(`/assets/${id}`),
        API.get('/properties').catch(() => [])
      ]);
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);

      const categories = ['HVAC', 'Plumbing', 'Electrical', 'Appliance', 'Roofing', 'Landscaping', 'Security', 'Pool', 'Other'];

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/assets/${id}')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>Edit Asset</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="asset-edit-form" onsubmit="Assets.handleUpdate(event, '${id}')">
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-name">Name *</label>
                  <input type="text" id="asset-name" class="form-control" required value="${asset.name || ''}">
                </div>
                <div class="form-group">
                  <label for="asset-category">Category</label>
                  <select id="asset-category" class="form-control">
                    <option value="">Select...</option>
                    ${categories.map(c => `<option value="${c}" ${asset.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-property">Property *</label>
                  <select id="asset-property" class="form-control" required>
                    <option value="">Select property...</option>
                    ${properties.map(p => `<option value="${p.id}" ${String(asset.property_id) === String(p.id) ? 'selected' : ''}>${p.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="asset-status">Status</label>
                  <select id="asset-status" class="form-control">
                    <option value="operational" ${asset.status === 'operational' ? 'selected' : ''}>Operational</option>
                    <option value="needs_repair" ${asset.status === 'needs_repair' ? 'selected' : ''}>Needs Repair</option>
                    <option value="out_of_service" ${asset.status === 'out_of_service' ? 'selected' : ''}>Out of Service</option>
                    <option value="retired" ${asset.status === 'retired' ? 'selected' : ''}>Retired</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-make">Make</label>
                  <input type="text" id="asset-make" class="form-control" value="${asset.make || ''}">
                </div>
                <div class="form-group">
                  <label for="asset-model">Model</label>
                  <input type="text" id="asset-model" class="form-control" value="${asset.model || ''}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-serial">Serial Number</label>
                  <input type="text" id="asset-serial" class="form-control" value="${asset.serial_number || ''}">
                </div>
                <div class="form-group">
                  <label for="asset-install">Install Date</label>
                  <input type="date" id="asset-install" class="form-control" value="${asset.install_date ? asset.install_date.split('T')[0] : ''}">
                </div>
              </div>
              <div class="form-group">
                <label for="asset-warranty">Warranty Expiry</label>
                <input type="date" id="asset-warranty" class="form-control" value="${asset.warranty_expiry ? asset.warranty_expiry.split('T')[0] : ''}">
              </div>
              <div class="form-group">
                <label for="asset-notes">Notes</label>
                <textarea id="asset-notes" class="form-control" rows="3">${asset.notes || ''}</textarea>
              </div>
              <div id="asset-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/assets/${id}')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="asset-submit">Save Changes</button>
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
    const btn = document.getElementById('asset-submit');
    const errorEl = document.getElementById('asset-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const body = {
        name: document.getElementById('asset-name').value,
        category: document.getElementById('asset-category').value || null,
        property_id: document.getElementById('asset-property').value,
        status: document.getElementById('asset-status').value,
        make: document.getElementById('asset-make').value || null,
        model: document.getElementById('asset-model').value || null,
        serial_number: document.getElementById('asset-serial').value || null,
        install_date: document.getElementById('asset-install').value || null,
        warranty_expiry: document.getElementById('asset-warranty').value || null,
        notes: document.getElementById('asset-notes').value || null
      };
      await API.put(`/assets/${id}`, body);
      App.toast('Asset updated', 'success');
      Router.navigate(`#/assets/${id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  },

  async remove(id) {
    if (!confirm('Are you sure you want to delete this asset?')) return;
    try {
      await API.delete(`/assets/${id}`);
      App.toast('Asset deleted', 'success');
      Router.navigate('#/assets');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
