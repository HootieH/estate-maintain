const WorkOrders = {
  currentFilters: { status: 'all', priority: 'all', property: 'all', search: '' },

  async list() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading work orders...</p></div>';

    try {
      const [woData, propData] = await Promise.all([
        API.get('/workorders'),
        API.get('/properties').catch(() => [])
      ]);
      const workorders = Array.isArray(woData) ? woData : (woData.data || woData.workorders || []);
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);

      container.innerHTML = `
        <div class="page-header">
          <h1>Work Orders</h1>
          <button class="btn btn-primary" onclick="Router.navigate('#/workorders/new')">
            <i data-lucide="plus"></i> New Work Order
          </button>
        </div>

        <div class="filters-bar">
          <div class="status-tabs">
            <button class="status-tab active" data-status="all" onclick="WorkOrders.filterStatus(this, 'all')">All</button>
            <button class="status-tab" data-status="open" onclick="WorkOrders.filterStatus(this, 'open')">Open</button>
            <button class="status-tab" data-status="in_progress" onclick="WorkOrders.filterStatus(this, 'in_progress')">In Progress</button>
            <button class="status-tab" data-status="on_hold" onclick="WorkOrders.filterStatus(this, 'on_hold')">On Hold</button>
            <button class="status-tab" data-status="completed" onclick="WorkOrders.filterStatus(this, 'completed')">Completed</button>
          </div>
          <div class="filter-controls">
            <select class="form-control form-control-sm" onchange="WorkOrders.filterPriority(this.value)">
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select class="form-control form-control-sm" onchange="WorkOrders.filterProperty(this.value)">
              <option value="all">All Properties</option>
              ${properties.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
            <input type="text" class="form-control form-control-sm" placeholder="Search..." oninput="WorkOrders.filterSearch(this.value)">
          </div>
        </div>

        <div class="card">
          <div class="card-body no-padding">
            <table class="table" id="wo-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Property</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assigned To</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody id="wo-tbody">
              </tbody>
            </table>
            <div id="wo-empty" class="empty-state" style="display:none">
              <i data-lucide="clipboard-list" class="empty-icon"></i>
              <h2>No Work Orders</h2>
              <p>No work orders match your filters.</p>
            </div>
          </div>
        </div>
      `;

      this._workorders = workorders;
      this.applyFilters();
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  filterStatus(el, status) {
    el.parentElement.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    this.currentFilters.status = status;
    this.applyFilters();
  },

  filterPriority(val) {
    this.currentFilters.priority = val;
    this.applyFilters();
  },

  filterProperty(val) {
    this.currentFilters.property = val;
    this.applyFilters();
  },

  filterSearch(val) {
    this.currentFilters.search = val.toLowerCase();
    this.applyFilters();
  },

  applyFilters() {
    const f = this.currentFilters;
    const filtered = (this._workorders || []).filter(wo => {
      if (f.status !== 'all' && wo.status !== f.status) return false;
      if (f.priority !== 'all' && wo.priority !== f.priority) return false;
      if (f.property !== 'all' && String(wo.property_id) !== String(f.property)) return false;
      if (f.search && !wo.title.toLowerCase().includes(f.search) && !(wo.property_name || '').toLowerCase().includes(f.search)) return false;
      return true;
    });

    const tbody = document.getElementById('wo-tbody');
    const empty = document.getElementById('wo-empty');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
    } else {
      if (empty) empty.style.display = 'none';
      tbody.innerHTML = filtered.map(wo => `
        <tr class="clickable-row" onclick="Router.navigate('#/workorders/${wo.id}')">
          <td><strong>${wo.title}</strong></td>
          <td>${wo.property_name || '-'}</td>
          <td><span class="badge badge-${wo.priority}">${wo.priority}</span></td>
          <td><span class="badge badge-status-${(wo.status || '').replace(/\s+/g, '_')}">${wo.status}</span></td>
          <td>${wo.assigned_to_name || '-'}</td>
          <td>${Dashboard.formatDate(wo.due_date)}</td>
        </tr>
      `).join('');
    }
  },

  async detail(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const [wo, comments] = await Promise.all([
        API.get(`/workorders/${params.id}`),
        API.get(`/workorders/${params.id}/comments`).catch(() => [])
      ]);
      const commentList = Array.isArray(comments) ? comments : (comments.data || comments.comments || []);

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/workorders')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>${wo.title}</h1>
            <span class="badge badge-${wo.priority}">${wo.priority}</span>
            <span class="badge badge-status-${(wo.status || '').replace(/\s+/g, '_')}">${wo.status}</span>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-secondary" onclick="WorkOrders.edit('${params.id}')">
              <i data-lucide="edit"></i> Edit
            </button>
            <button class="btn btn-danger" onclick="WorkOrders.remove('${params.id}')">
              <i data-lucide="trash-2"></i> Delete
            </button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="card">
            <div class="card-header"><h3>Details</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field">
                  <label>Property</label>
                  <p>${wo.property_name ? `<a href="#/properties/${wo.property_id}">${wo.property_name}</a>` : '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Asset</label>
                  <p>${wo.asset_name ? `<a href="#/assets/${wo.asset_id}">${wo.asset_name}</a>` : '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Priority</label>
                  <p><span class="badge badge-${wo.priority}">${wo.priority}</span></p>
                </div>
                <div class="detail-field">
                  <label>Status</label>
                  <p>
                    <select class="form-control form-control-sm inline-select" onchange="WorkOrders.updateStatus('${params.id}', this.value)">
                      <option value="open" ${wo.status === 'open' ? 'selected' : ''}>Open</option>
                      <option value="in_progress" ${wo.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                      <option value="on_hold" ${wo.status === 'on_hold' ? 'selected' : ''}>On Hold</option>
                      <option value="completed" ${wo.status === 'completed' ? 'selected' : ''}>Completed</option>
                    </select>
                  </p>
                </div>
                <div class="detail-field">
                  <label>Assigned To</label>
                  <p>${wo.assigned_to_name || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Due Date</label>
                  <p>${Dashboard.formatDate(wo.due_date)}</p>
                </div>
                <div class="detail-field">
                  <label>Created</label>
                  <p>${Dashboard.formatDate(wo.created_at)}</p>
                </div>
                <div class="detail-field">
                  <label>Updated</label>
                  <p>${Dashboard.formatDate(wo.updated_at)}</p>
                </div>
                <div class="detail-field detail-field-full">
                  <label>Description</label>
                  <p>${wo.description || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Comments</h3></div>
          <div class="card-body">
            <div class="comments-list" id="comments-list">
              ${commentList.length === 0 ? '<div class="empty-state-sm">No comments yet</div>' : commentList.map(c => `
                <div class="comment">
                  <div class="comment-avatar" style="background: ${c.user_color || '#3B82F6'}">${(c.user_name || 'U').charAt(0).toUpperCase()}</div>
                  <div class="comment-content">
                    <div class="comment-header">
                      <strong>${c.user_name || 'Unknown'}</strong>
                      <span class="text-muted">${Dashboard.formatDate(c.created_at)}</span>
                    </div>
                    <p>${c.text || c.content || ''}</p>
                  </div>
                </div>
              `).join('')}
            </div>
            <form class="comment-form" onsubmit="WorkOrders.addComment(event, '${params.id}')">
              <textarea id="comment-text" class="form-control" rows="2" placeholder="Add a comment..." required></textarea>
              <button type="submit" class="btn btn-primary btn-sm">
                <i data-lucide="send"></i> Comment
              </button>
            </form>
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
      const [propData, assetData, userData, teamData] = await Promise.all([
        API.get('/properties').catch(() => []),
        API.get('/assets').catch(() => []),
        API.get('/users').catch(() => []),
        API.get('/teams').catch(() => [])
      ]);
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);
      const assets = Array.isArray(assetData) ? assetData : (assetData.data || assetData.assets || []);
      const users = Array.isArray(userData) ? userData : (userData.data || userData.users || []);
      const teams = Array.isArray(teamData) ? teamData : (teamData.data || teamData.teams || []);

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/workorders')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>New Work Order</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="wo-form" onsubmit="WorkOrders.handleCreate(event)">
              <div class="form-group">
                <label for="wo-title">Title *</label>
                <input type="text" id="wo-title" class="form-control" required placeholder="Brief description of the work needed">
              </div>
              <div class="form-group">
                <label for="wo-description">Description</label>
                <textarea id="wo-description" class="form-control" rows="3" placeholder="Detailed description..."></textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="wo-property">Property</label>
                  <select id="wo-property" class="form-control" onchange="WorkOrders.filterAssetsByProperty(this.value)">
                    <option value="">Select property...</option>
                    ${properties.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="wo-asset">Asset</label>
                  <select id="wo-asset" class="form-control">
                    <option value="">Select asset...</option>
                    ${assets.map(a => `<option value="${a.id}" data-property="${a.property_id}">${a.name}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="wo-priority">Priority</label>
                  <select id="wo-priority" class="form-control">
                    <option value="low">Low</option>
                    <option value="medium" selected>Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="wo-status">Status</label>
                  <select id="wo-status" class="form-control">
                    <option value="open" selected>Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="on_hold">On Hold</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="wo-assigned">Assign To</label>
                  <select id="wo-assigned" class="form-control">
                    <option value="">Unassigned</option>
                    ${users.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="wo-team">Team</label>
                  <select id="wo-team" class="form-control">
                    <option value="">No team</option>
                    ${teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label for="wo-due">Due Date</label>
                <input type="date" id="wo-due" class="form-control">
              </div>
              <div id="wo-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/workorders')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="wo-submit">Create Work Order</button>
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

  filterAssetsByProperty(propId) {
    const assetSelect = document.getElementById('wo-asset');
    if (!assetSelect) return;
    const options = assetSelect.querySelectorAll('option[data-property]');
    options.forEach(opt => {
      opt.style.display = (!propId || opt.dataset.property === String(propId)) ? '' : 'none';
    });
  },

  async handleCreate(e) {
    e.preventDefault();
    const btn = document.getElementById('wo-submit');
    const errorEl = document.getElementById('wo-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const body = {
        title: document.getElementById('wo-title').value,
        description: document.getElementById('wo-description').value,
        property_id: document.getElementById('wo-property').value || null,
        asset_id: document.getElementById('wo-asset').value || null,
        priority: document.getElementById('wo-priority').value,
        status: document.getElementById('wo-status').value,
        assigned_to: document.getElementById('wo-assigned').value || null,
        team_id: document.getElementById('wo-team').value || null,
        due_date: document.getElementById('wo-due').value || null
      };
      const result = await API.post('/workorders', body);
      App.toast('Work order created', 'success');
      Router.navigate(`#/workorders/${result.id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Work Order';
    }
  },

  async edit(id) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const [wo, propData, assetData, userData, teamData] = await Promise.all([
        API.get(`/workorders/${id}`),
        API.get('/properties').catch(() => []),
        API.get('/assets').catch(() => []),
        API.get('/users').catch(() => []),
        API.get('/teams').catch(() => [])
      ]);
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);
      const assets = Array.isArray(assetData) ? assetData : (assetData.data || assetData.assets || []);
      const users = Array.isArray(userData) ? userData : (userData.data || userData.users || []);
      const teams = Array.isArray(teamData) ? teamData : (teamData.data || teamData.teams || []);

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/workorders/${id}')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>Edit Work Order</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="wo-edit-form" onsubmit="WorkOrders.handleUpdate(event, '${id}')">
              <div class="form-group">
                <label for="wo-title">Title *</label>
                <input type="text" id="wo-title" class="form-control" required value="${wo.title || ''}">
              </div>
              <div class="form-group">
                <label for="wo-description">Description</label>
                <textarea id="wo-description" class="form-control" rows="3">${wo.description || ''}</textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="wo-property">Property</label>
                  <select id="wo-property" class="form-control">
                    <option value="">Select property...</option>
                    ${properties.map(p => `<option value="${p.id}" ${String(wo.property_id) === String(p.id) ? 'selected' : ''}>${p.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="wo-asset">Asset</label>
                  <select id="wo-asset" class="form-control">
                    <option value="">Select asset...</option>
                    ${assets.map(a => `<option value="${a.id}" ${String(wo.asset_id) === String(a.id) ? 'selected' : ''}>${a.name}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="wo-priority">Priority</label>
                  <select id="wo-priority" class="form-control">
                    <option value="low" ${wo.priority === 'low' ? 'selected' : ''}>Low</option>
                    <option value="medium" ${wo.priority === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="high" ${wo.priority === 'high' ? 'selected' : ''}>High</option>
                    <option value="critical" ${wo.priority === 'critical' ? 'selected' : ''}>Critical</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="wo-status">Status</label>
                  <select id="wo-status" class="form-control">
                    <option value="open" ${wo.status === 'open' ? 'selected' : ''}>Open</option>
                    <option value="in_progress" ${wo.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="on_hold" ${wo.status === 'on_hold' ? 'selected' : ''}>On Hold</option>
                    <option value="completed" ${wo.status === 'completed' ? 'selected' : ''}>Completed</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="wo-assigned">Assign To</label>
                  <select id="wo-assigned" class="form-control">
                    <option value="">Unassigned</option>
                    ${users.map(u => `<option value="${u.id}" ${String(wo.assigned_to) === String(u.id) ? 'selected' : ''}>${u.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="wo-team">Team</label>
                  <select id="wo-team" class="form-control">
                    <option value="">No team</option>
                    ${teams.map(t => `<option value="${t.id}" ${String(wo.team_id) === String(t.id) ? 'selected' : ''}>${t.name}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label for="wo-due">Due Date</label>
                <input type="date" id="wo-due" class="form-control" value="${wo.due_date ? wo.due_date.split('T')[0] : ''}">
              </div>
              <div id="wo-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/workorders/${id}')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="wo-submit">Save Changes</button>
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
    const btn = document.getElementById('wo-submit');
    const errorEl = document.getElementById('wo-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const body = {
        title: document.getElementById('wo-title').value,
        description: document.getElementById('wo-description').value,
        property_id: document.getElementById('wo-property').value || null,
        asset_id: document.getElementById('wo-asset').value || null,
        priority: document.getElementById('wo-priority').value,
        status: document.getElementById('wo-status').value,
        assigned_to: document.getElementById('wo-assigned').value || null,
        team_id: document.getElementById('wo-team').value || null,
        due_date: document.getElementById('wo-due').value || null
      };
      await API.put(`/workorders/${id}`, body);
      App.toast('Work order updated', 'success');
      Router.navigate(`#/workorders/${id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  },

  async updateStatus(id, status) {
    try {
      await API.put(`/workorders/${id}`, { status });
      App.toast('Status updated', 'success');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async addComment(e, id) {
    e.preventDefault();
    const text = document.getElementById('comment-text').value;
    if (!text.trim()) return;

    try {
      await API.post(`/workorders/${id}/comments`, { text });
      document.getElementById('comment-text').value = '';
      App.toast('Comment added', 'success');
      WorkOrders.detail({ id });
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  async remove(id) {
    if (!confirm('Are you sure you want to delete this work order?')) return;
    try {
      await API.delete(`/workorders/${id}`);
      App.toast('Work order deleted', 'success');
      Router.navigate('#/workorders');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
