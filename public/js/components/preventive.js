const Preventive = {
  _currentPage: 1,
  _pagination: null,
  _viewMode: 'list',

  async list(page) {
    this._currentPage = page || 1;
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading schedules...</p></div>';

    try {
      const params = new URLSearchParams({ page: this._currentPage, limit: 25 });
      const data = await API.get(`/preventive?${params.toString()}`);
      const { items: schedules, pagination } = Pagination.extract(data, 'schedules');
      this._pagination = pagination;

      container.innerHTML = `
        <div class="page-header">
          <h1>Preventive Maintenance <span class="tip-trigger" data-tip="preventive-maintenance"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
          <button class="btn btn-primary" onclick="Router.navigate('#/preventive/new')">
            <i data-lucide="plus"></i> New Schedule
          </button>
        </div>

        <div class="view-toggle">
          <button class="view-btn ${this._viewMode !== 'calendar' ? 'active' : ''}" onclick="Preventive._viewMode='list';Preventive.list()">
            <i data-lucide="list"></i> List
          </button>
          <button class="view-btn ${this._viewMode === 'calendar' ? 'active' : ''}" onclick="Preventive._viewMode='calendar';Preventive.list()">
            <i data-lucide="calendar"></i> Calendar
          </button>
        </div>

        <div class="card">
          <div class="card-body no-padding">
            ${schedules.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">
                  <i data-lucide="calendar-clock"></i>
                </div>
                <h2>No Preventive Maintenance Schedules</h2>
                <p class="empty-state-desc">Stop reacting to breakdowns — schedule recurring maintenance to catch problems early. The system auto-creates work orders when tasks come due.</p>
                <div class="empty-state-features">
                  <div class="empty-state-feature">
                    <i data-lucide="repeat"></i>
                    <div>
                      <strong>Recurring Schedules</strong>
                      <span>Daily, weekly, monthly, quarterly, or annual frequencies</span>
                    </div>
                  </div>
                  <div class="empty-state-feature">
                    <i data-lucide="zap"></i>
                    <div>
                      <strong>Auto-Generated Work Orders</strong>
                      <span>Tasks are automatically created when maintenance is due</span>
                    </div>
                  </div>
                  <div class="empty-state-feature">
                    <i data-lucide="gauge"></i>
                    <div>
                      <strong>Meter-Based Triggers</strong>
                      <span>Trigger maintenance based on asset usage, not just time</span>
                    </div>
                  </div>
                </div>
                <div class="empty-state-connections">
                  <span class="empty-state-conn"><i data-lucide="link"></i> Creates Work Orders automatically for your Assets</span>
                </div>
                <button class="btn btn-primary" onclick="Router.navigate('#/preventive/new')">
                  <i data-lucide="plus"></i> Create First Schedule
                </button>
              </div>
            ` : this._viewMode === 'calendar' ? Preventive.renderCalendar(schedules) : `
              <table class="table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Asset</th>
                    <th>Property</th>
                    <th>Frequency</th>
                    <th>Next Due</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${schedules.map(pm => {
                    const dueClass = Preventive.getDueClass(pm.next_due);
                    return `
                      <tr class="clickable-row" onclick="Router.navigate('#/preventive/${pm.id}')">
                        <td><strong>${pm.title || pm.name || ''}</strong></td>
                        <td>${pm.asset_name || '-'}</td>
                        <td>${pm.property_name || '-'}</td>
                        <td>${Preventive.formatFrequency(pm.frequency)}</td>
                        <td><span class="text-${dueClass}">${Dashboard.formatDate(pm.next_due)}</span></td>
                        <td>
                          <button class="btn btn-sm btn-success" onclick="event.stopPropagation(); Preventive.markComplete('${pm.id}')">
                            <i data-lucide="check"></i> Complete
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
              ${Pagination.render(pagination, 'Preventive')}
            `}
          </div>
        </div>
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
      const pm = await API.get(`/preventive/${params.id}`);
      const dueClass = Preventive.getDueClass(pm.next_due);

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/preventive')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>${pm.title || pm.name || 'Schedule Detail'}</h1>
          </div>
          <div class="page-header-actions">
            ${QRCodes.button('pm', params.id, pm.title || pm.name || '', pm.frequency || '')}
            <button class="btn btn-success" onclick="Preventive.markComplete('${params.id}')">
              <i data-lucide="check"></i> Mark Complete
            </button>
            <button class="btn btn-secondary" onclick="Preventive.edit('${params.id}')">
              <i data-lucide="edit"></i> Edit
            </button>
            <button class="btn btn-danger" onclick="Preventive.remove('${params.id}')">
              <i data-lucide="trash-2"></i> Delete
            </button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="card">
            <div class="card-header"><h3>Schedule Details</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field">
                  <label>Asset</label>
                  <p>${pm.asset_name ? `<a href="#/assets/${pm.asset_id}">${pm.asset_name}</a>` : '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Property</label>
                  <p>${pm.property_name ? `<a href="#/properties/${pm.property_id}">${pm.property_name}</a>` : '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Frequency</label>
                  <p>${Preventive.formatFrequency(pm.frequency)}</p>
                </div>
                <div class="detail-field">
                  <label>Next Due</label>
                  <p><span class="text-${dueClass}">${Dashboard.formatDate(pm.next_due)}</span></p>
                </div>
                <div class="detail-field">
                  <label>Last Completed</label>
                  <p>${Dashboard.formatDate(pm.last_completed)}</p>
                </div>
                <div class="detail-field">
                  <label>Assigned To</label>
                  <p>${pm.assigned_to_name || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Procedure</label>
                  <p>${pm.procedure_title ? `<a href="#/procedures/${pm.procedure_id}">${pm.procedure_title}</a>` : 'None attached'}</p>
                </div>
                <div class="detail-field detail-field-full">
                  <label>Description</label>
                  <p>${pm.description || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Completion History</h3></div>
          <div class="card-body">
            ${(pm.history && pm.history.length > 0) ? `
              <table class="table">
                <thead>
                  <tr><th>Completed Date</th><th>Completed By</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  ${pm.history.map(h => `
                    <tr>
                      <td>${Dashboard.formatDate(h.completed_at)}</td>
                      <td>${h.completed_by_name || '-'}</td>
                      <td>${h.notes || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<div class="empty-state-sm">No completion history yet</div>'}
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
      const [assetData, propData, userData, procData] = await Promise.all([
        API.get('/assets').catch(() => []),
        API.get('/properties').catch(() => []),
        API.get('/users').catch(() => []),
        API.get('/procedures').catch(() => [])
      ]);
      const assets = Array.isArray(assetData) ? assetData : (assetData.data || assetData.assets || []);
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);
      const users = Array.isArray(userData) ? userData : (userData.data || userData.users || []);
      const procedures = Array.isArray(procData) ? procData : (procData.data || procData.procedures || []);

      // Store assets for property auto-select
      Preventive._formAssets = assets;

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/preventive')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>New Preventive Maintenance</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="pm-form" onsubmit="Preventive.handleCreate(event)">
              <div class="form-group">
                <label for="pm-title">Task Title *</label>
                <input type="text" id="pm-title" class="form-control" required placeholder="e.g., HVAC Filter Replacement">
              </div>
              <div class="form-group">
                <label for="pm-description">Description</label>
                <textarea id="pm-description" class="form-control" rows="3" placeholder="Details about the maintenance task..."></textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="pm-property">Property *</label>
                  <select id="pm-property" class="form-control" required>
                    <option value="">Select property...</option>
                    ${properties.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="pm-asset">Asset</label>
                  <select id="pm-asset" class="form-control" onchange="Preventive.onAssetChange(this.value)">
                    <option value="">Select asset...</option>
                    ${assets.map(a => `<option value="${a.id}" data-property-id="${a.property_id}">${a.name} (${a.property_name || 'No property'})</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="pm-assigned">Assign To</label>
                  <select id="pm-assigned" class="form-control">
                    <option value="">Unassigned</option>
                    ${users.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label for="pm-procedure">Procedure <span class="tip-trigger" data-tip="procedure"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></label>
                <select id="pm-procedure" class="form-control">
                  <option value="">No procedure</option>
                  ${procedures.map(p => `<option value="${p.id}">${p.title}</option>`).join('')}
                </select>
                <small style="color:var(--text-muted);font-size:12px">Attached procedure will auto-apply to work orders created from this schedule</small>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="pm-frequency">Frequency *</label>
                  <select id="pm-frequency" class="form-control" required>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-Weekly</option>
                    <option value="monthly" selected>Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="semiannual">Semi-Annual</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="pm-next-due">Next Due Date *</label>
                  <input type="date" id="pm-next-due" class="form-control" required>
                </div>
              </div>
              <div id="pm-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/preventive')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="pm-submit">Create Schedule</button>
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

  onAssetChange(assetId) {
    if (!assetId) return;
    const asset = (Preventive._formAssets || []).find(a => String(a.id) === String(assetId));
    if (asset && asset.property_id) {
      const propSelect = document.getElementById('pm-property');
      if (propSelect) propSelect.value = String(asset.property_id);
    }
  },

  async handleCreate(e) {
    e.preventDefault();
    const btn = document.getElementById('pm-submit');
    const errorEl = document.getElementById('pm-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const body = {
        title: document.getElementById('pm-title').value,
        description: document.getElementById('pm-description').value || null,
        property_id: document.getElementById('pm-property').value,
        asset_id: document.getElementById('pm-asset').value || null,
        assigned_to: document.getElementById('pm-assigned').value || null,
        frequency: document.getElementById('pm-frequency').value,
        next_due: document.getElementById('pm-next-due').value,
        procedure_id: document.getElementById('pm-procedure').value || null
      };
      const result = await API.post('/preventive', body);
      App.toast('Schedule created', 'success');
      Router.navigate(`#/preventive/${result.id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Schedule';
    }
  },

  async edit(id) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const [pm, assetData, userData, procData] = await Promise.all([
        API.get(`/preventive/${id}`),
        API.get('/assets').catch(() => []),
        API.get('/users').catch(() => []),
        API.get('/procedures').catch(() => [])
      ]);
      const assets = Array.isArray(assetData) ? assetData : (assetData.data || assetData.assets || []);
      const users = Array.isArray(userData) ? userData : (userData.data || userData.users || []);
      const procedures = Array.isArray(procData) ? procData : (procData.data || procData.procedures || []);
      const frequencies = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual'];

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/preventive/${id}')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>Edit Schedule</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="pm-edit-form" onsubmit="Preventive.handleUpdate(event, '${id}')">
              <div class="form-group">
                <label for="pm-title">Task Title *</label>
                <input type="text" id="pm-title" class="form-control" required value="${pm.title || pm.name || ''}">
              </div>
              <div class="form-group">
                <label for="pm-description">Description</label>
                <textarea id="pm-description" class="form-control" rows="3">${pm.description || ''}</textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="pm-asset">Asset</label>
                  <select id="pm-asset" class="form-control">
                    <option value="">Select asset...</option>
                    ${assets.map(a => `<option value="${a.id}" ${String(pm.asset_id) === String(a.id) ? 'selected' : ''}>${a.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="pm-assigned">Assign To</label>
                  <select id="pm-assigned" class="form-control">
                    <option value="">Unassigned</option>
                    ${users.map(u => `<option value="${u.id}" ${String(pm.assigned_to) === String(u.id) ? 'selected' : ''}>${u.name}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label for="pm-procedure">Procedure <span class="tip-trigger" data-tip="procedure"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></label>
                <select id="pm-procedure" class="form-control">
                  <option value="">No procedure</option>
                  ${procedures.map(p => `<option value="${p.id}" ${String(pm.procedure_id) === String(p.id) ? 'selected' : ''}>${p.title}</option>`).join('')}
                </select>
                <small style="color:var(--text-muted);font-size:12px">Attached procedure will auto-apply to work orders created from this schedule</small>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="pm-frequency">Frequency *</label>
                  <select id="pm-frequency" class="form-control" required>
                    ${frequencies.map(f => `<option value="${f}" ${pm.frequency === f ? 'selected' : ''}>${Preventive.formatFrequency(f)}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="pm-next-due">Next Due Date *</label>
                  <input type="date" id="pm-next-due" class="form-control" required value="${pm.next_due ? pm.next_due.split('T')[0] : ''}">
                </div>
              </div>
              <div id="pm-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/preventive/${id}')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="pm-submit">Save Changes</button>
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
    const btn = document.getElementById('pm-submit');
    const errorEl = document.getElementById('pm-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const body = {
        title: document.getElementById('pm-title').value,
        description: document.getElementById('pm-description').value || null,
        asset_id: document.getElementById('pm-asset').value || null,
        assigned_to: document.getElementById('pm-assigned').value || null,
        frequency: document.getElementById('pm-frequency').value,
        next_due: document.getElementById('pm-next-due').value,
        procedure_id: document.getElementById('pm-procedure').value || null
      };
      await API.put(`/preventive/${id}`, body);
      App.toast('Schedule updated', 'success');
      Router.navigate(`#/preventive/${id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  },

  async markComplete(id) {
    try {
      await API.post(`/preventive/${id}/complete`, {});
      App.toast('Marked as complete', 'success');
      const hash = window.location.hash;
      if (hash.includes(id)) {
        Preventive.detail({ id });
      } else {
        Preventive.list();
      }
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async remove(id) {
    if (!confirm('Are you sure you want to delete this maintenance schedule?')) return;
    try {
      await API.delete(`/preventive/${id}`);
      App.toast('Schedule deleted', 'success');
      Router.navigate('#/preventive');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  formatFrequency(freq) {
    const map = {
      daily: 'Daily',
      weekly: 'Weekly',
      biweekly: 'Bi-Weekly',
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      semiannual: 'Semi-Annual',
      annual: 'Annual'
    };
    return map[freq] || freq || '-';
  },

  getDueClass(dateStr) {
    if (!dateStr) return 'muted';
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dateStr);
    due.setHours(0, 0, 0, 0);
    const diff = (due - now) / (1000 * 60 * 60 * 24);
    if (diff < 0) return 'danger';
    if (diff <= 2) return 'warning';
    return 'muted';
  },

  renderCalendar(schedules) {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Map schedules to dates
    const byDate = {};
    schedules.forEach(s => {
      if (s.next_due) {
        const d = s.next_due.split('T')[0];
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(s);
      }
    });

    let cells = '';
    // Empty cells for days before first of month
    for (let i = 0; i < firstDay; i++) cells += '<div class="cal-cell cal-empty"></div>';

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const items = byDate[dateStr] || [];
      const isToday = day === today.getDate() && month === today.getMonth();

      cells += `
        <div class="cal-cell ${isToday ? 'cal-today' : ''} ${items.length > 0 ? 'cal-has-items' : ''}">
          <span class="cal-day">${day}</span>
          ${items.slice(0, 2).map(s => `
            <div class="cal-item" onclick="Router.navigate('#/preventive/${s.id}')" title="${s.title}">
              <span class="cal-item-dot" style="background:${s.priority === 'critical' ? 'var(--critical)' : s.priority === 'high' ? 'var(--high)' : 'var(--primary-light)'}"></span>
              <span class="cal-item-text">${s.title}</span>
            </div>
          `).join('')}
          ${items.length > 2 ? `<div class="cal-more">+${items.length - 2} more</div>` : ''}
        </div>
      `;
    }

    return `
      <div class="calendar-view">
        <div class="cal-header">
          <h3>${monthName}</h3>
        </div>
        <div class="cal-weekdays">
          ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="cal-weekday">${d}</div>`).join('')}
        </div>
        <div class="cal-grid">${cells}</div>
      </div>
    `;
  }
};
