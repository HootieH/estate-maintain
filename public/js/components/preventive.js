const Preventive = {
  async list() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading schedules...</p></div>';

    try {
      const data = await API.get('/preventive');
      const schedules = Array.isArray(data) ? data : (data.data || data.schedules || []);

      container.innerHTML = `
        <div class="page-header">
          <h1>Preventive Maintenance</h1>
          <button class="btn btn-primary" onclick="Router.navigate('#/preventive/new')">
            <i data-lucide="plus"></i> New Schedule
          </button>
        </div>

        <div class="card">
          <div class="card-body no-padding">
            ${schedules.length === 0 ? `
              <div class="empty-state">
                <i data-lucide="calendar-clock" class="empty-icon"></i>
                <h2>No Preventive Maintenance Schedules</h2>
                <p>Set up recurring maintenance to keep your assets in top shape.</p>
                <button class="btn btn-primary" onclick="Router.navigate('#/preventive/new')">
                  <i data-lucide="plus"></i> Create Schedule
                </button>
              </div>
            ` : `
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
            `}
          </div>
        </div>
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
      const [assetData, userData] = await Promise.all([
        API.get('/assets').catch(() => []),
        API.get('/users').catch(() => [])
      ]);
      const assets = Array.isArray(assetData) ? assetData : (assetData.data || assetData.assets || []);
      const users = Array.isArray(userData) ? userData : (userData.data || userData.users || []);

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
                  <label for="pm-asset">Asset</label>
                  <select id="pm-asset" class="form-control">
                    <option value="">Select asset...</option>
                    ${assets.map(a => `<option value="${a.id}">${a.name} (${a.property_name || 'No property'})</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="pm-assigned">Assign To</label>
                  <select id="pm-assigned" class="form-control">
                    <option value="">Unassigned</option>
                    ${users.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
                  </select>
                </div>
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
                    <option value="semiannually">Semi-Annually</option>
                    <option value="annually">Annually</option>
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
        asset_id: document.getElementById('pm-asset').value || null,
        assigned_to: document.getElementById('pm-assigned').value || null,
        frequency: document.getElementById('pm-frequency').value,
        next_due: document.getElementById('pm-next-due').value
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
      const [pm, assetData, userData] = await Promise.all([
        API.get(`/preventive/${id}`),
        API.get('/assets').catch(() => []),
        API.get('/users').catch(() => [])
      ]);
      const assets = Array.isArray(assetData) ? assetData : (assetData.data || assetData.assets || []);
      const users = Array.isArray(userData) ? userData : (userData.data || userData.users || []);
      const frequencies = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannually', 'annually'];

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
        next_due: document.getElementById('pm-next-due').value
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
      semiannually: 'Semi-Annually',
      annually: 'Annually'
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
  }
};
