const Properties = {
  async list() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading properties...</p></div>';

    try {
      const data = await API.get('/properties');
      const properties = Array.isArray(data) ? data : (data.data || data.properties || []);

      container.innerHTML = `
        <div class="page-header">
          <h1>Properties</h1>
          <button class="btn btn-primary" onclick="Router.navigate('#/properties/new')">
            <i data-lucide="plus"></i> Add Property
          </button>
        </div>
        ${properties.length === 0 ? `
          <div class="empty-state">
            <i data-lucide="building-2" class="empty-icon"></i>
            <h2>No Properties Yet</h2>
            <p>Add your first property to start managing your estate portfolio.</p>
            <button class="btn btn-primary" onclick="Router.navigate('#/properties/new')">
              <i data-lucide="plus"></i> Add Property
            </button>
          </div>
        ` : `
          <div class="card-grid">
            ${properties.map(p => `
              <div class="card property-card clickable" onclick="Router.navigate('#/properties/${p.id}')">
                <div class="card-header">
                  <span class="badge badge-property-${(p.type || 'other').toLowerCase()}">${p.type || 'Other'}</span>
                </div>
                <div class="card-body">
                  <h3>${p.name}</h3>
                  <p class="text-muted">${p.address || 'No address'}</p>
                  <div class="card-stats">
                    <span><i data-lucide="wrench" class="icon-sm"></i> ${p.asset_count || 0} assets</span>
                    <span><i data-lucide="clipboard-list" class="icon-sm"></i> ${p.open_wo_count || 0} open WOs</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async detail(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const property = await API.get(`/properties/${params.id}`);
      const [assets, workorders] = await Promise.all([
        API.get(`/properties/${params.id}/assets`).catch(() => []),
        API.get(`/properties/${params.id}/workorders`).catch(() => [])
      ]);
      const assetList = Array.isArray(assets) ? assets : (assets.data || assets.assets || []);
      const woList = Array.isArray(workorders) ? workorders : (workorders.data || workorders.workorders || []);

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/properties')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>${property.name}</h1>
            <span class="badge badge-property-${(property.type || 'other').toLowerCase()}">${property.type || 'Other'}</span>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-secondary" onclick="Properties.edit('${params.id}')">
              <i data-lucide="edit"></i> Edit
            </button>
            <button class="btn btn-danger" onclick="Properties.remove('${params.id}')">
              <i data-lucide="trash-2"></i> Delete
            </button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="card">
            <div class="card-header"><h3>Property Details</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field">
                  <label>Address</label>
                  <p>${property.address || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Type</label>
                  <p>${property.type || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Year Built</label>
                  <p>${property.year_built || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Square Footage</label>
                  <p>${property.square_footage ? property.square_footage.toLocaleString() + ' sq ft' : '-'}</p>
                </div>
                <div class="detail-field detail-field-full">
                  <label>Notes</label>
                  <p>${property.notes || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="tabs">
          <button class="tab active" onclick="Properties.switchTab(this, 'assets-tab')">Assets (${assetList.length})</button>
          <button class="tab" onclick="Properties.switchTab(this, 'wo-tab')">Work Orders (${woList.length})</button>
        </div>

        <div id="assets-tab" class="tab-content active">
          ${assetList.length === 0 ? `
            <div class="empty-state-sm">No assets at this property. <a href="#/assets/new">Add one</a></div>
          ` : `
            <table class="table">
              <thead>
                <tr><th>Name</th><th>Category</th><th>Status</th></tr>
              </thead>
              <tbody>
                ${assetList.map(a => `
                  <tr class="clickable-row" onclick="Router.navigate('#/assets/${a.id}')">
                    <td>${a.name}</td>
                    <td>${a.category || '-'}</td>
                    <td><span class="badge badge-asset-${(a.status || 'operational').replace(/\s+/g, '_')}">${a.status || 'operational'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        <div id="wo-tab" class="tab-content">
          ${woList.length === 0 ? `
            <div class="empty-state-sm">No work orders for this property.</div>
          ` : `
            <table class="table">
              <thead>
                <tr><th>Title</th><th>Priority</th><th>Status</th><th>Due Date</th></tr>
              </thead>
              <tbody>
                ${woList.map(wo => `
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
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  switchTab(el, tabId) {
    el.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
  },

  async form() {
    const container = document.getElementById('main-content');
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/properties')">
            <i data-lucide="arrow-left"></i> Back
          </button>
          <h1>New Property</h1>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <form id="property-form" onsubmit="Properties.handleCreate(event)">
            <div class="form-row">
              <div class="form-group">
                <label for="prop-name">Property Name *</label>
                <input type="text" id="prop-name" class="form-control" required placeholder="e.g., Main Residence">
              </div>
              <div class="form-group">
                <label for="prop-type">Type</label>
                <select id="prop-type" class="form-control">
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="vacation">Vacation</option>
                  <option value="ranch">Ranch</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label for="prop-address">Address</label>
              <input type="text" id="prop-address" class="form-control" placeholder="Full address">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="prop-year">Year Built</label>
                <input type="number" id="prop-year" class="form-control" placeholder="e.g., 2005">
              </div>
              <div class="form-group">
                <label for="prop-sqft">Square Footage</label>
                <input type="number" id="prop-sqft" class="form-control" placeholder="e.g., 5000">
              </div>
            </div>
            <div class="form-group">
              <label for="prop-notes">Notes</label>
              <textarea id="prop-notes" class="form-control" rows="3" placeholder="Any additional notes..."></textarea>
            </div>
            <div id="property-form-error" class="form-error" style="display:none"></div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/properties')">Cancel</button>
              <button type="submit" class="btn btn-primary" id="prop-submit">Create Property</button>
            </div>
          </form>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  async handleCreate(e) {
    e.preventDefault();
    const btn = document.getElementById('prop-submit');
    const errorEl = document.getElementById('property-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const body = {
        name: document.getElementById('prop-name').value,
        type: document.getElementById('prop-type').value,
        address: document.getElementById('prop-address').value,
        year_built: document.getElementById('prop-year').value ? parseInt(document.getElementById('prop-year').value) : null,
        square_footage: document.getElementById('prop-sqft').value ? parseInt(document.getElementById('prop-sqft').value) : null,
        notes: document.getElementById('prop-notes').value
      };
      const result = await API.post('/properties', body);
      App.toast('Property created successfully', 'success');
      Router.navigate(`#/properties/${result.id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Property';
    }
  },

  async edit(id) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const property = await API.get(`/properties/${id}`);
      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/properties/${id}')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>Edit Property</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="property-edit-form" onsubmit="Properties.handleUpdate(event, '${id}')">
              <div class="form-row">
                <div class="form-group">
                  <label for="prop-name">Property Name *</label>
                  <input type="text" id="prop-name" class="form-control" required value="${property.name || ''}">
                </div>
                <div class="form-group">
                  <label for="prop-type">Type</label>
                  <select id="prop-type" class="form-control">
                    <option value="residential" ${property.type === 'residential' ? 'selected' : ''}>Residential</option>
                    <option value="commercial" ${property.type === 'commercial' ? 'selected' : ''}>Commercial</option>
                    <option value="vacation" ${property.type === 'vacation' ? 'selected' : ''}>Vacation</option>
                    <option value="ranch" ${property.type === 'ranch' ? 'selected' : ''}>Ranch</option>
                    <option value="other" ${property.type === 'other' ? 'selected' : ''}>Other</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label for="prop-address">Address</label>
                <input type="text" id="prop-address" class="form-control" value="${property.address || ''}">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="prop-year">Year Built</label>
                  <input type="number" id="prop-year" class="form-control" value="${property.year_built || ''}">
                </div>
                <div class="form-group">
                  <label for="prop-sqft">Square Footage</label>
                  <input type="number" id="prop-sqft" class="form-control" value="${property.square_footage || ''}">
                </div>
              </div>
              <div class="form-group">
                <label for="prop-notes">Notes</label>
                <textarea id="prop-notes" class="form-control" rows="3">${property.notes || ''}</textarea>
              </div>
              <div id="property-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/properties/${id}')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="prop-submit">Save Changes</button>
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
    const btn = document.getElementById('prop-submit');
    const errorEl = document.getElementById('property-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const body = {
        name: document.getElementById('prop-name').value,
        type: document.getElementById('prop-type').value,
        address: document.getElementById('prop-address').value,
        year_built: document.getElementById('prop-year').value ? parseInt(document.getElementById('prop-year').value) : null,
        square_footage: document.getElementById('prop-sqft').value ? parseInt(document.getElementById('prop-sqft').value) : null,
        notes: document.getElementById('prop-notes').value
      };
      await API.put(`/properties/${id}`, body);
      App.toast('Property updated successfully', 'success');
      Router.navigate(`#/properties/${id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  },

  async remove(id) {
    if (!confirm('Are you sure you want to delete this property? This action cannot be undone.')) return;
    try {
      await API.delete(`/properties/${id}`);
      App.toast('Property deleted', 'success');
      Router.navigate('#/properties');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
