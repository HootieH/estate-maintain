const WorkOrders = {
  currentFilters: { status: 'all', priority: 'all', property: 'all', search: '' },
  _currentPage: 1,
  _pagination: null,
  _viewMode: 'list',

  async list(page) {
    this._currentPage = page || 1;
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading work orders...</p></div>';

    try {
      // Build query params with filters and pagination
      const params = new URLSearchParams({ page: this._currentPage, limit: 25 });
      const f = this.currentFilters;
      if (f.status !== 'all') params.set('status', f.status);
      if (f.priority !== 'all') params.set('priority', f.priority);
      if (f.property !== 'all') params.set('property_id', f.property);
      if (f.search) params.set('search', f.search);

      const [woData, propData] = await Promise.all([
        API.get(`/workorders?${params.toString()}`),
        API.get('/properties').catch(() => [])
      ]);
      const { items: workorders, pagination } = Pagination.extract(woData, 'workorders');
      this._pagination = pagination;
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);

      container.innerHTML = `
        <div class="page-header">
          <h1>Work Orders <span class="tip-trigger" data-tip="work-order"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
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

        <div class="view-toggle">
          <button class="view-btn ${this._viewMode !== 'kanban' ? 'active' : ''}" onclick="WorkOrders._viewMode='list';WorkOrders.list()">
            <i data-lucide="list"></i> List
          </button>
          <button class="view-btn ${this._viewMode === 'kanban' ? 'active' : ''}" onclick="WorkOrders._viewMode='kanban';WorkOrders.list()">
            <i data-lucide="columns-3"></i> Board
          </button>
        </div>

        ${this._viewMode === 'kanban' ? this.renderKanban(workorders) : `
        <div class="card">
          <div class="card-body no-padding">
            <table class="table" id="wo-table">
              <thead>
                <tr>
                  <th style="width:40px"><input type="checkbox" onchange="WorkOrders.toggleSelectAll(this.checked)"></th>
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
              <div class="empty-state-icon">
                <i data-lucide="clipboard-list"></i>
              </div>
              <h2>No Work Orders Yet</h2>
              <p class="empty-state-desc">Work orders are the heart of your maintenance operation. Track repairs, inspections, and tasks from creation to completion.</p>
              <div class="empty-state-features">
                <div class="empty-state-feature">
                  <i data-lucide="target"></i>
                  <div>
                    <strong>Assign & Track</strong>
                    <span>Assign to team members with priority levels and due dates</span>
                  </div>
                </div>
                <div class="empty-state-feature">
                  <i data-lucide="clock"></i>
                  <div>
                    <strong>Time Logging</strong>
                    <span>Track hours spent on each task for accurate cost reporting</span>
                  </div>
                </div>
                <div class="empty-state-feature">
                  <i data-lucide="message-circle"></i>
                  <div>
                    <strong>Collaboration</strong>
                    <span>Add comments and updates for real-time team communication</span>
                  </div>
                </div>
              </div>
              <div class="empty-state-connections">
                <span class="empty-state-conn"><i data-lucide="link"></i> Linked to Properties, Assets, and Teams</span>
              </div>
              <button class="btn btn-primary" onclick="Router.navigate('#/workorders/new')">
                <i data-lucide="plus"></i> Create Your First Work Order
              </button>
            </div>
            <div class="bulk-bar" id="wo-bulk-bar" style="display:none">
              <span id="wo-bulk-count">0 selected</span>
              <select id="wo-bulk-status" class="form-control form-control-sm" style="width:auto">
                <option value="">Change status...</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button class="btn btn-sm btn-primary" onclick="WorkOrders.bulkStatusChange()">Apply</button>
            </div>
            ${Pagination.render(pagination, 'WorkOrders')}
          </div>
        </div>
        `}
      `;

      this._workorders = workorders;
      this.applyFilters();
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  goToPage(page) {
    if (page < 1 || (this._pagination && page > this._pagination.totalPages)) return;
    this.list(page);
  },

  filterStatus(el, status) {
    el.parentElement.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    this.currentFilters.status = status;
    this.list(1);
  },

  filterPriority(val) {
    this.currentFilters.priority = val;
    this.list(1);
  },

  filterProperty(val) {
    this.currentFilters.property = val;
    this.list(1);
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
          <td onclick="event.stopPropagation()"><input type="checkbox" class="wo-select" value="${wo.id}" onchange="WorkOrders.updateBulkBar()"></td>
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
      const wo = await API.get(`/workorders/${params.id}`);
      const commentList = wo.comments || [];

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
            <button class="btn btn-secondary" onclick="WorkOrders.duplicate('${params.id}')">
              <i data-lucide="copy"></i> Duplicate
            </button>
            <button class="btn btn-secondary" onclick="WorkOrders.edit('${params.id}')">
              <i data-lucide="edit"></i> Edit
            </button>
            <button class="btn btn-danger" onclick="WorkOrders.remove('${params.id}')">
              <i data-lucide="trash-2"></i> Delete
            </button>
            ${wo.status === 'completed' && !wo.signed_off_by ? `
              <button class="btn btn-success" onclick="WorkOrders.signOff('${params.id}')">
                <i data-lucide="pen-line"></i> Sign Off
              </button>
            ` : ''}
            ${wo.signed_off_by ? `
              <span class="badge badge-status-completed" style="padding:8px 12px">
                <i data-lucide="check-circle-2" style="width:14px;height:14px"></i> Signed off by ${wo.signed_off_by_name || 'Unknown'}
              </span>
            ` : ''}
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
                <div class="detail-field">
                  <label>Estimated Hours</label>
                  <p>${wo.estimated_hours || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Hours Logged</label>
                  <p>${wo.total_hours ? wo.total_hours.toFixed(1) + ' hrs' : '-'}</p>
                </div>
                <div class="detail-field detail-field-full">
                  <label>Description</label>
                  <p>${wo.description || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="wo-procedures-section"></div>

        <div class="card">
          <div class="card-header">
            <h3>Time Logs</h3>
            <button class="btn btn-primary btn-sm" onclick="WorkOrders.showLogTimeModal('${params.id}')">
              <i data-lucide="clock"></i> Log Time
            </button>
          </div>
          <div class="card-body" id="wo-time-logs">
            <div class="loading"><div class="spinner"></div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Messages</h3>
            <a href="#/messages/work_order/wo_${params.id}" class="btn btn-primary btn-sm">
              <i data-lucide="message-circle"></i> Open Thread
            </a>
          </div>
          <div class="card-body">
            <p class="text-muted" style="font-size:0.875rem">Discuss this work order with your team in a dedicated message thread.</p>
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
                    <p>${c.comment || c.text || c.content || ''}</p>
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

        <div class="card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3>Parts Used</h3>
            ${wo.status !== 'completed' && wo.status !== 'cancelled' ? `
              <button class="btn btn-sm btn-primary" onclick="WorkOrders.showAddPartModal('${params.id}')">
                <i data-lucide="plus"></i> Add Part
              </button>
            ` : ''}
          </div>
          <div class="card-body">
            ${(wo.parts_used && wo.parts_used.length > 0) ? `
              <table class="table">
                <thead><tr><th>Part</th><th>SKU</th><th>Qty</th><th>Unit Cost</th><th>Total</th></tr></thead>
                <tbody>
                  ${wo.parts_used.map(p => `
                    <tr>
                      <td>${p.part_name}</td>
                      <td>${p.sku || '-'}</td>
                      <td>${p.quantity_used}</td>
                      <td>$${(p.unit_cost || 0).toFixed(2)}</td>
                      <td><strong>$${(p.quantity_used * (p.unit_cost || 0)).toFixed(2)}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div style="text-align:right;padding:8px 16px;font-weight:600;color:var(--text)">
                Total Parts Cost: $${(wo.parts_cost || 0).toFixed(2)}
              </div>
            ` : '<div class="empty-state-sm">No parts used yet</div>'}
          </div>
        </div>

        ${Attachments.placeholder('work_order', params.id)}
      `;
      lucide.createIcons();
      Attachments.load('work_order', params.id);

      // Load time logs
      WorkOrders.loadTimeLogs(params.id);

      // Load attached procedures
      const procContainer = document.getElementById('wo-procedures-section');
      if (procContainer && typeof Procedures !== 'undefined') {
        Procedures.renderWorkOrderProcedures(params.id, procContainer);
      }
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
              <div class="form-group">
                <label for="wo-est-hours">Estimated Hours</label>
                <input type="number" id="wo-est-hours" class="form-control" step="0.5" min="0" placeholder="e.g., 2.5">
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
        due_date: document.getElementById('wo-due').value || null,
        estimated_hours: document.getElementById('wo-est-hours').value ? parseFloat(document.getElementById('wo-est-hours').value) : null
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
      await API.post(`/workorders/${id}/comments`, { comment: text });
      document.getElementById('comment-text').value = '';
      App.toast('Comment added', 'success');
      WorkOrders.detail({ id });
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  async loadTimeLogs(woId) {
    const container = document.getElementById('wo-time-logs');
    if (!container) return;

    try {
      const data = await API.get(`/time-logs/work-order/${woId}`);
      const logs = data.logs || [];
      const totalHours = data.total_hours || 0;

      container.innerHTML = `
        <div class="time-log-summary">
          <strong>Total: ${totalHours}h logged</strong>
        </div>
        ${logs.length === 0 ? '<div class="empty-state-sm">No time logged yet</div>' : `
          <table class="table">
            <thead>
              <tr><th>User</th><th>Hours</th><th>Description</th><th>Date</th></tr>
            </thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td>${l.user_name}</td>
                  <td><strong>${l.hours}h</strong></td>
                  <td>${l.description || '-'}</td>
                  <td>${Dashboard.formatDate(l.logged_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      `;
    } catch (e) {
      container.innerHTML = '<div class="empty-state-sm">Failed to load time logs</div>';
    }
  },

  showLogTimeModal(woId) {
    const overlay = document.getElementById('modal-overlay');
    overlay.style.display = 'flex';
    overlay.querySelector('.modal-title').textContent = 'Log Time';
    overlay.querySelector('.modal-body').innerHTML = `
      <form id="log-time-form" onsubmit="WorkOrders.submitTimeLog(event, '${woId}')">
        <div class="form-group">
          <label for="tl-hours">Hours *</label>
          <input type="number" id="tl-hours" class="form-control" step="0.25" min="0.25" required placeholder="e.g. 1.5">
        </div>
        <div class="form-group">
          <label for="tl-description">Description</label>
          <textarea id="tl-description" class="form-control" rows="3" placeholder="What was done..."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="tl-submit">Log Time</button>
        </div>
      </form>
    `;
    overlay.querySelector('.modal-footer').innerHTML = '';
    lucide.createIcons();
  },

  async submitTimeLog(e, woId) {
    e.preventDefault();
    const btn = document.getElementById('tl-submit');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const hours = parseFloat(document.getElementById('tl-hours').value);
      const description = document.getElementById('tl-description').value;
      await API.post('/time-logs', { work_order_id: parseInt(woId), hours, description });
      App.closeModal();
      App.toast('Time logged', 'success');
      WorkOrders.loadTimeLogs(woId);
    } catch (err) {
      App.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Log Time';
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
  },

  renderKanban(workorders) {
    const statuses = ['open', 'in_progress', 'on_hold', 'completed'];
    const labels = { open: 'Open', in_progress: 'In Progress', on_hold: 'On Hold', completed: 'Completed' };
    const colors = { open: '#3B82F6', in_progress: '#F59E0B', on_hold: '#8B5CF6', completed: '#10B981' };

    return `
      <div class="kanban-board">
        ${statuses.map(status => {
          const items = workorders.filter(wo => wo.status === status);
          return `
            <div class="kanban-column">
              <div class="kanban-column-header" style="border-top: 3px solid ${colors[status]}">
                <span class="kanban-column-title">${labels[status]}</span>
                <span class="kanban-column-count">${items.length}</span>
              </div>
              <div class="kanban-column-body">
                ${items.length === 0 ? '<div class="kanban-empty">No work orders</div>' : items.map(wo => `
                  <div class="kanban-card" onclick="Router.navigate('#/workorders/${wo.id}')">
                    <div class="kanban-card-header">
                      <span class="badge badge-${wo.priority}">${wo.priority}</span>
                      <span class="kanban-card-id">#${wo.id}</span>
                    </div>
                    <div class="kanban-card-title">${wo.title}</div>
                    ${wo.property_name ? `<div class="kanban-card-meta"><i data-lucide="building-2" class="icon-xs"></i> ${wo.property_name}</div>` : ''}
                    ${wo.assigned_to_name ? `<div class="kanban-card-meta"><i data-lucide="user" class="icon-xs"></i> ${wo.assigned_to_name}</div>` : ''}
                    ${wo.due_date ? `<div class="kanban-card-meta"><i data-lucide="calendar" class="icon-xs"></i> ${Dashboard.formatDate(wo.due_date)}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  async showAddPartModal(woId) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Add Part Used';
    modal.querySelector('.modal-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';

    try {
      const partsData = await API.get('/parts');
      const parts = Array.isArray(partsData) ? partsData : (partsData.data || partsData.parts || []);

      modal.querySelector('.modal-body').innerHTML = `
        <form id="add-part-form" onsubmit="WorkOrders.handleAddPart(event, '${woId}')">
          <div class="form-group">
            <label for="wo-part-select">Part *</label>
            <select id="wo-part-select" class="form-control" required>
              <option value="">Select part...</option>
              ${parts.map(p => `<option value="${p.id}" data-stock="${p.quantity}" data-cost="${p.unit_cost}">${p.name} (${p.sku || 'No SKU'}) - Stock: ${p.quantity}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="wo-part-qty">Quantity Used *</label>
            <input type="number" id="wo-part-qty" class="form-control" required min="0.01" step="any" value="1">
          </div>
          <div id="add-part-error" class="form-error" style="display:none"></div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="add-part-submit">Add Part</button>
          </div>
        </form>
      `;
    } catch (e) {
      modal.querySelector('.modal-body').innerHTML = `<p class="text-danger">${e.message}</p>`;
    }
    lucide.createIcons();
  },

  async handleAddPart(e, woId) {
    e.preventDefault();
    const btn = document.getElementById('add-part-submit');
    const errorEl = document.getElementById('add-part-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
      await API.post(`/workorders/${woId}/parts`, {
        part_id: parseInt(document.getElementById('wo-part-select').value),
        quantity_used: parseFloat(document.getElementById('wo-part-qty').value)
      });
      App.closeModal();
      App.toast('Part added', 'success');
      WorkOrders.detail({ id: woId });
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add Part';
    }
  },

  async signOff(id) {
    if (!confirm('Sign off on this completed work order?')) return;
    try {
      await API.post(`/workorders/${id}/sign-off`);
      App.toast('Work order signed off', 'success');
      WorkOrders.detail({ id });
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async duplicate(id) {
    try {
      const result = await API.post(`/workorders/${id}/duplicate`);
      App.toast('Work order duplicated', 'success');
      Router.navigate(`#/workorders/${result.id}`);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  toggleSelectAll(checked) {
    document.querySelectorAll('.wo-select').forEach(cb => { cb.checked = checked; });
    this.updateBulkBar();
  },

  updateBulkBar() {
    const selected = document.querySelectorAll('.wo-select:checked');
    const bar = document.getElementById('wo-bulk-bar');
    const count = document.getElementById('wo-bulk-count');
    if (!bar) return;
    if (selected.length > 0) {
      bar.style.display = 'flex';
      count.textContent = `${selected.length} selected`;
    } else {
      bar.style.display = 'none';
    }
  },

  async bulkStatusChange() {
    const status = document.getElementById('wo-bulk-status').value;
    if (!status) { App.toast('Select a status', 'error'); return; }
    const ids = Array.from(document.querySelectorAll('.wo-select:checked')).map(cb => parseInt(cb.value));
    if (ids.length === 0) return;
    try {
      const result = await API.post('/workorders/bulk/status', { work_order_ids: ids, status });
      App.toast(`Updated ${result.updated} work orders`, 'success');
      this.list();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
