const Properties = {
  _currentPage: 1,
  _pagination: null,

  async list(page) {
    this._currentPage = page || 1;
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading properties...</p></div>';

    try {
      const params = new URLSearchParams({ page: this._currentPage, limit: 25 });
      const data = await API.get(`/properties?${params.toString()}`);
      const { items: properties, pagination } = Pagination.extract(data, 'properties');
      this._pagination = pagination;

      container.innerHTML = `
        <div class="page-header">
          <h1>Properties <span class="tip-trigger" data-tip="property"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
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
          ${Pagination.render(pagination, 'Properties')}
        `}
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  goToPage(page) {
    if (page < 1 || (this._pagination && page > this._pagination.totalPages)) return;
    this.list(page);
  },

  async detail(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const property = await API.get(`/properties/${params.id}`);
      const [assets, workorders, locationsData] = await Promise.all([
        API.get(`/assets?property_id=${params.id}`).catch(() => []),
        API.get(`/workorders?property_id=${params.id}`).catch(() => []),
        API.get(`/locations?property_id=${params.id}&format=tree`).catch(() => [])
      ]);
      const assetList = Array.isArray(assets) ? assets : (assets.data || assets.assets || []);
      const woList = Array.isArray(workorders) ? workorders : (workorders.data || workorders.workorders || []);
      const locationTree = Array.isArray(locationsData) ? locationsData : [];

      let flatLocations = [];
      try {
        const flatData = await API.get(`/locations?property_id=${params.id}`);
        flatLocations = Array.isArray(flatData) ? flatData : [];
      } catch (e) { /* ignore */ }

      const as = property.asset_stats || {};
      const ws = property.wo_stats || {};
      const ps = property.pm_stats || {};
      const pjs = property.project_stats || {};
      const pts = property.part_stats || {};
      const totalSpend = (property.parts_spend || 0) + (property.po_spend || 0);

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
            ${QRCodes.button('property', params.id, property.name, property.address || property.type || '')}
            <button class="btn btn-primary" onclick="Router.navigate('#/workorders/new')">
              <i data-lucide="plus"></i> New Work Order
            </button>
            <button class="btn btn-secondary" onclick="Properties.edit('${params.id}')">
              <i data-lucide="edit"></i> Edit
            </button>
            <button class="btn btn-danger" onclick="Properties.remove('${params.id}')">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>

        <!-- Property Info Bar -->
        <div class="prop-info-bar">
          ${property.address ? `<span><i data-lucide="map-pin" class="icon-xs"></i> ${property.address}</span>` : ''}
          ${property.year_built ? `<span><i data-lucide="calendar" class="icon-xs"></i> Built ${property.year_built}</span>` : ''}
          ${property.square_footage ? `<span><i data-lucide="ruler" class="icon-xs"></i> ${property.square_footage.toLocaleString()} sq ft</span>` : ''}
          ${property.team_name ? `<span><i data-lucide="users" class="icon-xs"></i> ${property.team_name}</span>` : ''}
        </div>

        <!-- Stats Row -->
        <div class="prop-stats-row">
          <div class="prop-stat">
            <div class="prop-stat-value">${as.total || 0}</div>
            <div class="prop-stat-label">Assets</div>
            ${property.assets_down > 0 ? `<div class="prop-stat-alert">${property.assets_down} down</div>` : ''}
          </div>
          <div class="prop-stat">
            <div class="prop-stat-value">${(ws.open || 0) + (ws.in_progress || 0)}</div>
            <div class="prop-stat-label">Active WOs</div>
            ${ws.overdue > 0 ? `<div class="prop-stat-alert">${ws.overdue} overdue</div>` : ''}
          </div>
          <div class="prop-stat">
            <div class="prop-stat-value">${ps.active || 0}</div>
            <div class="prop-stat-label">PM Schedules</div>
            ${ps.overdue > 0 ? `<div class="prop-stat-alert">${ps.overdue} overdue</div>` : ''}
          </div>
          <div class="prop-stat">
            <div class="prop-stat-value">${pjs.active || 0}</div>
            <div class="prop-stat-label">Active Projects</div>
          </div>
          <div class="prop-stat">
            <div class="prop-stat-value">${pts.total || 0}</div>
            <div class="prop-stat-label">Parts in Stock</div>
            ${pts.low_stock > 0 ? `<div class="prop-stat-alert">${pts.low_stock} low</div>` : ''}
          </div>
          <div class="prop-stat">
            <div class="prop-stat-value">$${totalSpend > 999 ? (totalSpend / 1000).toFixed(1) + 'k' : totalSpend.toFixed(0)}</div>
            <div class="prop-stat-label">Total Spend</div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="tabs" style="margin-bottom:0">
          <button class="tab active" onclick="Properties.switchTab(this, 'overview-tab')">Overview</button>
          <button class="tab" onclick="Properties.switchTab(this, 'assets-tab')">Assets (${as.total || 0})</button>
          <button class="tab" onclick="Properties.switchTab(this, 'wo-tab')">Work Orders (${ws.total || 0})</button>
          <button class="tab" onclick="Properties.switchTab(this, 'pm-tab')">PM Schedules (${ps.total || 0})</button>
          <button class="tab" onclick="Properties.switchTab(this, 'projects-tab')">Projects (${pjs.total || 0})</button>
          <button class="tab" onclick="Properties.switchTab(this, 'locations-tab')">Locations</button>
          <button class="tab" onclick="Properties.switchTab(this, 'team-tab')">Team</button>
        </div>

        <!-- Overview Tab -->
        <div id="overview-tab" class="tab-content active">
          <div class="prop-overview-grid">
            <!-- Upcoming PM -->
            <div class="card">
              <div class="card-header">
                <h3>Upcoming Maintenance</h3>
                <a href="#/preventive" class="btn btn-sm btn-secondary">View All</a>
              </div>
              <div class="card-body">
                ${(property.upcoming_pm || []).length === 0 ? '<div class="empty-state-sm">No upcoming maintenance</div>' : `
                  ${property.upcoming_pm.map(pm => {
                    const isOverdue = new Date(pm.next_due) < new Date();
                    return `
                      <div class="prop-pm-item clickable-row" onclick="Router.navigate('#/preventive/${pm.id}')">
                        <div class="prop-pm-info">
                          <span class="badge badge-${pm.priority}" style="font-size:10px">${pm.priority}</span>
                          <strong>${pm.title}</strong>
                          ${pm.asset_name ? `<span class="text-muted" style="font-size:12px">${pm.asset_name}</span>` : ''}
                        </div>
                        <span class="${isOverdue ? 'text-danger' : 'text-muted'}" style="font-size:12px;font-weight:500">${Dashboard.formatDate(pm.next_due)}</span>
                      </div>
                    `;
                  }).join('')}
                `}
              </div>
            </div>

            <!-- Recent Work Orders -->
            <div class="card">
              <div class="card-header">
                <h3>Recent Work Orders</h3>
                <a href="#/workorders" class="btn btn-sm btn-secondary">View All</a>
              </div>
              <div class="card-body">
                ${(property.recent_work_orders || []).length === 0 ? '<div class="empty-state-sm">No work orders</div>' : `
                  ${property.recent_work_orders.slice(0, 5).map(wo => `
                    <div class="prop-wo-item clickable-row" onclick="Router.navigate('#/workorders/${wo.id}')">
                      <div class="prop-wo-info">
                        <strong>${wo.title}</strong>
                        ${wo.assigned_to_name ? `<span class="text-muted" style="font-size:12px">${wo.assigned_to_name}</span>` : ''}
                      </div>
                      <div style="display:flex;gap:6px;align-items:center">
                        <span class="badge badge-${wo.priority}" style="font-size:10px">${wo.priority}</span>
                        <span class="badge badge-status-${(wo.status || '').replace(/\\s+/g, '_')}" style="font-size:10px">${wo.status}</span>
                      </div>
                    </div>
                  `).join('')}
                `}
              </div>
            </div>

            <!-- Active Projects -->
            <div class="card">
              <div class="card-header">
                <h3>Active Projects</h3>
                <a href="#/projects" class="btn btn-sm btn-secondary">View All</a>
              </div>
              <div class="card-body">
                ${(property.active_projects || []).length === 0 ? `
                  <div class="empty-state-sm">No active projects. <a href="#/projects/new">Start one</a></div>
                ` : `
                  ${property.active_projects.map(p => `
                    <div class="prop-wo-item clickable-row" onclick="Router.navigate('#/projects/${p.id}')">
                      <div class="prop-wo-info">
                        <strong>${p.title}</strong>
                        <span class="text-muted" style="font-size:12px">${p.bid_count} bid${p.bid_count !== 1 ? 's' : ''} ${p.budget_max ? '| Budget: $' + p.budget_max.toLocaleString() : ''}</span>
                      </div>
                      <span class="badge" style="background:${p.status === 'awarded' ? '#10B981' : '#3B82F6'}15;color:${p.status === 'awarded' ? '#10B981' : '#3B82F6'};font-size:10px">${p.status}</span>
                    </div>
                  `).join('')}
                `}
              </div>
            </div>

            <!-- Recent Activity -->
            <div class="card">
              <div class="card-header"><h3>Recent Activity</h3></div>
              <div class="card-body">
                ${(property.recent_activity || []).length === 0 ? '<div class="empty-state-sm">No recent activity</div>' : `
                  ${property.recent_activity.slice(0, 8).map(a => `
                    <div class="prop-activity-item">
                      <div class="prop-activity-dot"></div>
                      <div class="prop-activity-text">
                        <span>${a.details || a.action}</span>
                        <span class="text-muted" style="font-size:11px">${a.user_name ? a.user_name + ' · ' : ''}${Dashboard.formatDate(a.created_at)}</span>
                      </div>
                    </div>
                  `).join('')}
                `}
              </div>
            </div>
          </div>

          <!-- Property Details Card -->
          <div class="card" style="margin-top:16px">
            <div class="card-header"><h3>Property Details</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field"><label>Address</label><p>${property.address || '-'}</p></div>
                <div class="detail-field"><label>Type</label><p>${property.type || '-'}</p></div>
                <div class="detail-field"><label>Year Built</label><p>${property.year_built || '-'}</p></div>
                <div class="detail-field"><label>Square Footage</label><p>${property.square_footage ? property.square_footage.toLocaleString() + ' sq ft' : '-'}</p></div>
                <div class="detail-field"><label>Assigned Team</label><p>${property.team_name || 'None'}</p></div>
                <div class="detail-field"><label>Inventory Value</label><p>$${(pts.total_value || 0).toLocaleString()}</p></div>
                ${property.notes ? `<div class="detail-field detail-field-full"><label>Notes</label><p>${property.notes}</p></div>` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Assets Tab -->
        <div id="assets-tab" class="tab-content">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div style="display:flex;gap:8px">
              ${as.operational > 0 ? `<span class="badge" style="background:#D1FAE5;color:#059669">${as.operational} operational</span>` : ''}
              ${as.needs_repair > 0 ? `<span class="badge" style="background:#FEF3C7;color:#D97706">${as.needs_repair} needs repair</span>` : ''}
              ${as.out_of_service > 0 ? `<span class="badge" style="background:#FEE2E2;color:#DC2626">${as.out_of_service} out of service</span>` : ''}
            </div>
            <button class="btn btn-secondary btn-sm" onclick="QRCodes.printPropertyAssets('${params.id}', '${property.name}')">
              <i data-lucide="qr-code"></i> Print All QR
            </button>
            <button class="btn btn-primary btn-sm" onclick="Router.navigate('#/assets/new')"><i data-lucide="plus"></i> Add Asset</button>
          </div>
          ${assetList.length === 0 ? `
            <div class="empty-state-sm">No assets at this property. <a href="#/assets/new">Add one</a></div>
          ` : `
            <table class="table">
              <thead><tr><th>Name</th><th>Category</th><th>Status</th><th>Criticality</th></tr></thead>
              <tbody>
                ${assetList.map(a => `
                  <tr class="clickable-row" onclick="Router.navigate('#/assets/${a.id}')">
                    <td><strong>${a.name}</strong></td>
                    <td>${a.category || '-'}</td>
                    <td><span class="badge badge-asset-${(a.status || 'operational').replace(/\\s+/g, '_')}">${(a.status || 'operational').replace(/_/g, ' ')}</span></td>
                    <td>${a.criticality ? `<span class="badge badge-${a.criticality === 'critical' ? 'critical' : a.criticality === 'high' ? 'high' : 'medium'}">${a.criticality}</span>` : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        <!-- Work Orders Tab -->
        <div id="wo-tab" class="tab-content">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div style="display:flex;gap:8px">
              ${ws.open > 0 ? `<span class="badge" style="background:#DBEAFE;color:#1E40AF">${ws.open} open</span>` : ''}
              ${ws.in_progress > 0 ? `<span class="badge" style="background:#FEF3C7;color:#D97706">${ws.in_progress} in progress</span>` : ''}
              ${ws.overdue > 0 ? `<span class="badge" style="background:#FEE2E2;color:#DC2626">${ws.overdue} overdue</span>` : ''}
            </div>
            <button class="btn btn-primary btn-sm" onclick="Router.navigate('#/workorders/new')"><i data-lucide="plus"></i> New Work Order</button>
          </div>
          ${woList.length === 0 ? `
            <div class="empty-state-sm">No work orders for this property.</div>
          ` : `
            <table class="table">
              <thead><tr><th>Title</th><th>Assigned</th><th>Priority</th><th>Status</th><th>Due Date</th></tr></thead>
              <tbody>
                ${woList.map(wo => `
                  <tr class="clickable-row" onclick="Router.navigate('#/workorders/${wo.id}')">
                    <td><strong>${wo.title}</strong></td>
                    <td>${wo.assigned_to_name || wo.team_name || '-'}</td>
                    <td><span class="badge badge-${wo.priority}">${wo.priority}</span></td>
                    <td><span class="badge badge-status-${(wo.status || '').replace(/\\s+/g, '_')}">${wo.status}</span></td>
                    <td>${Dashboard.formatDate(wo.due_date)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        <!-- PM Tab -->
        <div id="pm-tab" class="tab-content">
          <div class="empty-state-sm">
            <a href="#/preventive" class="btn btn-sm btn-primary">Manage PM Schedules</a>
            <p style="margin-top:8px">View and manage all preventive maintenance schedules for this property in the PM section.</p>
          </div>
        </div>

        <!-- Projects Tab -->
        <div id="projects-tab" class="tab-content">
          <div style="margin-bottom:16px;text-align:right">
            <button class="btn btn-primary btn-sm" onclick="Router.navigate('#/projects/new')"><i data-lucide="plus"></i> New Project</button>
          </div>
          ${(property.active_projects || []).length === 0 ? `
            <div class="empty-state-sm">No projects for this property. <a href="#/projects/new">Start a project</a> to collect competitive bids.</div>
          ` : `
            <table class="table">
              <thead><tr><th>Project</th><th>Bids</th><th>Budget</th><th>Status</th></tr></thead>
              <tbody>
                ${property.active_projects.map(p => `
                  <tr class="clickable-row" onclick="Router.navigate('#/projects/${p.id}')">
                    <td><strong>${p.title}</strong></td>
                    <td>${p.bid_count} bid${p.bid_count !== 1 ? 's' : ''}</td>
                    <td>${p.budget_max ? '$' + p.budget_max.toLocaleString() : '-'}</td>
                    <td><span class="badge" style="background:${p.status === 'awarded' ? '#10B981' : '#3B82F6'}15;color:${p.status === 'awarded' ? '#10B981' : '#3B82F6'}">${p.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        <!-- Locations Tab -->
        <div id="locations-tab" class="tab-content">
          <div style="margin-bottom:16px;">
            <button class="btn btn-primary btn-sm" onclick="Properties.showAddLocationModal('${params.id}')">
              <i data-lucide="plus"></i> Add Location
            </button>
          </div>
          <div id="locations-tree">
            ${locationTree.length === 0 ? `
              <div class="empty-state-sm">No locations defined. Add buildings, floors, and rooms to organize this property.</div>
            ` : Properties._renderLocationTree(locationTree, params.id)}
          </div>
        </div>

        <!-- Team Tab -->
        <div id="team-tab" class="tab-content">
          ${property.team_name ? `
            <div style="margin-bottom:16px">
              <strong style="font-size:15px">${property.team_name}</strong>
              <span class="text-muted" style="margin-left:8px">${(property.team_members || []).length} member${(property.team_members || []).length !== 1 ? 's' : ''}</span>
            </div>
            ${(property.team_members || []).length === 0 ? '<div class="empty-state-sm">No team members</div>' : `
              <div class="prop-team-grid">
                ${property.team_members.map(m => `
                  <div class="prop-team-card">
                    <div class="user-avatar-sm" style="background:${m.avatar_color || '#3B82F6'}">${(m.name || 'U').charAt(0).toUpperCase()}</div>
                    <div>
                      <strong>${m.name}</strong>
                      <span class="text-muted" style="font-size:12px">${m.role} ${m.email ? '· ' + m.email : ''}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          ` : `
            <div class="empty-state-sm">No team assigned to this property. <a href="#/teams">Manage teams</a></div>
          `}
        </div>
      `;

      Properties._currentPropertyId = params.id;
      Properties._flatLocations = flatLocations;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  _renderLocationTree(nodes, propertyId, depth) {
    depth = depth || 0;
    return nodes.map(node => `
      <div class="location-tree-item" style="margin-left:${depth * 24}px;padding:8px 12px;border:1px solid var(--border-color);border-radius:6px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          ${depth > 0 ? '<span style="color:var(--text-muted);margin-right:4px;">&#8627;</span>' : ''}
          <strong>${node.name}</strong>
          ${node.description ? `<span class="text-muted" style="margin-left:8px;">${node.description}</span>` : ''}
        </div>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-danger btn-sm" onclick="Properties.deleteLocation('${node.id}', '${propertyId}')" title="Delete">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
      ${node.children && node.children.length > 0 ? Properties._renderLocationTree(node.children, propertyId, depth + 1) : ''}
    `).join('');
  },

  showAddLocationModal(propertyId) {
    const flatLocations = Properties._flatLocations || [];
    const overlay = document.getElementById('modal-overlay');
    overlay.querySelector('.modal-title').textContent = 'Add Location';
    overlay.querySelector('.modal-body').innerHTML = `
      <form id="add-location-form" onsubmit="Properties.handleAddLocation(event, '${propertyId}')">
        <div class="form-group">
          <label for="location-name">Name *</label>
          <input type="text" id="location-name" class="form-control" required placeholder="e.g., Building A, Floor 2, Room 101">
        </div>
        <div class="form-group">
          <label for="location-parent">Parent Location</label>
          <select id="location-parent" class="form-control">
            <option value="">None (top level)</option>
            ${flatLocations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="location-description">Description</label>
          <textarea id="location-description" class="form-control" rows="2" placeholder="Optional description..."></textarea>
        </div>
        <div id="location-form-error" class="form-error" style="display:none"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="location-submit">Add Location</button>
        </div>
      </form>
    `;
    overlay.querySelector('.modal-footer').innerHTML = '';
    overlay.style.display = 'flex';
    lucide.createIcons();
  },

  async handleAddLocation(e, propertyId) {
    e.preventDefault();
    const btn = document.getElementById('location-submit');
    const errorEl = document.getElementById('location-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
      await API.post('/locations', {
        property_id: parseInt(propertyId),
        parent_location_id: document.getElementById('location-parent').value || null,
        name: document.getElementById('location-name').value,
        description: document.getElementById('location-description').value || null
      });
      App.closeModal();
      App.toast('Location added', 'success');
      Properties.detail({ id: propertyId });
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add Location';
    }
  },

  async deleteLocation(locationId, propertyId) {
    if (!confirm('Delete this location?')) return;
    try {
      await API.delete(`/locations/${locationId}`);
      App.toast('Location deleted', 'success');
      Properties.detail({ id: propertyId });
    } catch (e) {
      App.toast(e.message, 'error');
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
                  <option value="estate">Estate</option>
                  <option value="villa">Villa</option>
                  <option value="apartment">Apartment</option>
                  <option value="cottage">Cottage</option>
                  <option value="commercial">Commercial</option>
                  <option value="land">Land</option>
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
                    <option value="estate" ${property.type === 'estate' ? 'selected' : ''}>Estate</option>
                    <option value="villa" ${property.type === 'villa' ? 'selected' : ''}>Villa</option>
                    <option value="apartment" ${property.type === 'apartment' ? 'selected' : ''}>Apartment</option>
                    <option value="cottage" ${property.type === 'cottage' ? 'selected' : ''}>Cottage</option>
                    <option value="commercial" ${property.type === 'commercial' ? 'selected' : ''}>Commercial</option>
                    <option value="land" ${property.type === 'land' ? 'selected' : ''}>Land</option>
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
