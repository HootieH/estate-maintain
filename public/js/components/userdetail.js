const UserDetail = {
  _user: null,
  _activeTab: 'profile',

  _relativeTime(dateStr) {
    if (!dateStr) return '-';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  async render(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const user = await API.get('/users/' + params.id);
      this._user = user;
      this._activeTab = 'profile';

      const isAdmin = Permissions.has('users:manage_permissions');
      const canManage = Permissions.has('users:edit');

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/users')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <div class="user-avatar-lg" style="background:${user.avatar_color || '#3B82F6'}">
              ${(user.name || user.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 style="margin:0">${user.name || user.email}</h1>
              <div style="display:flex;gap:8px;margin-top:4px">
                ${user.is_owner ? '<span class="god-badge">god mode</span>' : `<span class="role-badge role-${user.role || 'technician'}">${user.role || 'technician'}</span>`}
                <span class="status-badge status-${user.status || 'active'}">${user.status || 'active'}</span>
              </div>
            </div>
          </div>
          ${canManage ? `
            <div class="page-header-actions">
              <button class="btn btn-secondary" onclick="UserDetail.switchTab(null, 'profile')">
                <i data-lucide="edit"></i> Edit
              </button>
              ${user.status === 'active' ? `
                <button class="btn btn-secondary" onclick="UserDetail.toggleStatus('${params.id}', 'suspended')">
                  <i data-lucide="pause-circle"></i> Suspend
                </button>
              ` : user.status === 'suspended' ? `
                <button class="btn btn-secondary" onclick="UserDetail.toggleStatus('${params.id}', 'active')">
                  <i data-lucide="play-circle"></i> Activate
                </button>
              ` : ''}
              <button class="btn btn-secondary" onclick="UserDetail.forcePasswordReset('${params.id}')">
                <i data-lucide="key"></i> Force Password Reset
              </button>
              <button class="btn btn-danger" onclick="UserDetail.deactivate('${params.id}')">
                <i data-lucide="user-x"></i> Deactivate
              </button>
              ${API.getUser()?.is_owner ? `
                <button class="btn ${user.is_owner ? 'btn-secondary' : 'btn-god'}" onclick="UserDetail.toggleGodMode('${params.id}')">
                  <i data-lucide="zap"></i> ${user.is_owner ? 'Revoke God Mode' : 'Grant God Mode'}
                </button>
              ` : ''}
            </div>
          ` : ''}
        </div>

        <div class="tabs">
          <button class="tab active" onclick="UserDetail.switchTab(this, 'profile')">Profile</button>
          ${isAdmin ? '<button class="tab" onclick="UserDetail.switchTab(this, \'permissions\')">Permissions</button>' : ''}
          <button class="tab" onclick="UserDetail.switchTab(this, 'activity')">Activity</button>
          <button class="tab" onclick="UserDetail.switchTab(this, 'performance')">Performance</button>
          <button class="tab" onclick="UserDetail.switchTab(this, 'login-history')">Login History</button>
        </div>

        <div id="tab-profile" class="tab-content active"></div>
        <div id="tab-permissions" class="tab-content"></div>
        <div id="tab-activity" class="tab-content"></div>
        <div id="tab-performance" class="tab-content"></div>
        <div id="tab-login-history" class="tab-content"></div>
      `;
      lucide.createIcons();
      this.loadProfileTab(params.id);
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  switchTab(el, tabId) {
    document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    if (el) el.classList.add('active');
    else document.querySelector(`.tabs .tab`).classList.add('active');

    const panel = document.getElementById('tab-' + tabId);
    if (panel) panel.classList.add('active');
    this._activeTab = tabId;

    const userId = this._user && this._user.id;
    if (!userId) return;

    if (tabId === 'profile') this.loadProfileTab(userId);
    else if (tabId === 'permissions') this.loadPermissionsTab(userId);
    else if (tabId === 'activity') this.loadActivityTab(userId);
    else if (tabId === 'performance') this.loadPerformanceTab(userId);
    else if (tabId === 'login-history') this.loadLoginHistoryTab(userId);
  },

  async loadProfileTab(userId) {
    const panel = document.getElementById('tab-profile');
    if (!panel) return;
    panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const [user, teamData, propData] = await Promise.all([
        this._user || API.get('/users/' + userId),
        API.get('/teams').catch(() => []),
        API.get('/properties').catch(() => [])
      ]);
      const teams = Array.isArray(teamData) ? teamData : (teamData.data || teamData.teams || []);
      const allProperties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);
      const assignedProperties = user.properties || [];

      panel.innerHTML = `
        <div class="card">
          <div class="card-header"><h3>User Information</h3></div>
          <div class="card-body">
            <form id="user-profile-form" onsubmit="UserDetail.saveProfile(event, '${userId}')">
              <div class="form-row">
                <div class="form-group">
                  <label for="ud-name">Full Name</label>
                  <input type="text" id="ud-name" class="form-control" value="${user.name || ''}" required>
                </div>
                <div class="form-group">
                  <label for="ud-email">Email</label>
                  <input type="email" id="ud-email" class="form-control" value="${user.email || ''}" required>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="ud-role">Role</label>
                  <select id="ud-role" class="form-control">
                    <option value="technician" ${user.role === 'technician' ? 'selected' : ''}>Technician</option>
                    <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Teams</label>
                  <div class="team-tags" id="ud-team-tags">
                    ${(user.teams || []).map(t => `<span class="team-tag">${t.name} <button onclick="UserDetail.removeTeam('${userId}', '${t.id}')">&times;</button></span>`).join('')}
                    <select onchange="UserDetail.addTeam('${userId}', this.value); this.value='';">
                      <option value="">+ Add team...</option>
                      ${teams.filter(t => !(user.teams || []).find(ut => String(ut.id) === String(t.id))).map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                    </select>
                  </div>
                </div>
              </div>
              <div id="profile-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="submit" class="btn btn-primary" id="ud-profile-submit">Save Changes</button>
              </div>
            </form>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Assigned Properties</h3>
            <div class="form-group" style="margin:0;display:flex;gap:8px;align-items:center">
              <select id="ud-add-property" class="form-control form-control-sm" style="width:auto">
                <option value="">Add property...</option>
                ${allProperties.filter(p => !assignedProperties.find(ap => String(ap.id) === String(p.id))).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
              </select>
              <button class="btn btn-sm btn-primary" onclick="UserDetail.addProperty('${userId}')">
                <i data-lucide="plus" style="width:14px;height:14px"></i> Add
              </button>
            </div>
          </div>
          <div class="card-body">
            ${assignedProperties.length === 0 ? '<div class="empty-state-sm">No properties assigned</div>' : `
              <table class="table">
                <thead><tr><th>Property</th><th>Type</th><th>Actions</th></tr></thead>
                <tbody>
                  ${assignedProperties.map(p => `
                    <tr>
                      <td><a href="#/properties/${p.id}">${p.name}</a></td>
                      <td>${p.type || '-'}</td>
                      <td>
                        <button class="btn btn-sm btn-danger" onclick="UserDetail.removeProperty('${userId}', '${p.id}')">
                          <i data-lucide="x" style="width:14px;height:14px"></i>
                        </button>
                      </td>
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
      panel.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async saveProfile(e, userId) {
    e.preventDefault();
    const btn = document.getElementById('ud-profile-submit');
    const errorEl = document.getElementById('profile-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const body = {
        name: document.getElementById('ud-name').value,
        email: document.getElementById('ud-email').value,
        role: document.getElementById('ud-role').value
      };
      const updated = await API.put('/users/' + userId, body);
      this._user = updated || Object.assign(this._user, body);
      App.toast('Profile updated', 'success');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  },

  async addTeam(userId, teamId) {
    if (!teamId) return;
    try {
      await API.post('/teams/' + teamId + '/members', { user_id: userId });
      App.toast('Added to team', 'success');
      this._user = await API.get('/users/' + userId);
      this.loadProfileTab(userId);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async removeTeam(userId, teamId) {
    try {
      await API.delete('/teams/' + teamId + '/members/' + userId);
      App.toast('Removed from team', 'success');
      this._user = await API.get('/users/' + userId);
      this.loadProfileTab(userId);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async addProperty(userId) {
    const sel = document.getElementById('ud-add-property');
    if (!sel || !sel.value) { App.toast('Select a property', 'error'); return; }
    try {
      await API.post('/users/' + userId + '/properties', { property_id: sel.value });
      App.toast('Property assigned', 'success');
      this._user = await API.get('/users/' + userId);
      this.loadProfileTab(userId);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async removeProperty(userId, propId) {
    if (!confirm('Remove this property assignment?')) return;
    try {
      await API.delete('/users/' + userId + '/properties/' + propId);
      App.toast('Property removed', 'success');
      this._user = await API.get('/users/' + userId);
      this.loadProfileTab(userId);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async loadPermissionsTab(userId) {
    const panel = document.getElementById('tab-permissions');
    if (!panel) return;
    panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const data = await API.get('/users/' + userId + '/permissions');
      const permGroups = data.groups || data.permissions || {};
      const overrides = data.overrides || {};
      const templates = data.templates || [];

      const resources = Object.keys(permGroups);

      panel.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3>Permissions</h3>
            ${templates.length > 0 ? `
              <div style="display:flex;gap:8px;align-items:center">
                <select id="perm-template" class="form-control form-control-sm" style="width:auto">
                  <option value="">Apply Template...</option>
                  ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                </select>
                <button class="btn btn-sm btn-primary" onclick="UserDetail.applyPermTemplate('${userId}')">Apply</button>
              </div>
            ` : ''}
          </div>
          <div class="card-body">
            <p class="text-muted text-sm" style="margin-bottom:16px">Grayed-out checkboxes are role defaults. Yellow-highlighted checkboxes are custom overrides.</p>
            <div style="overflow-x:auto">
              <table class="table">
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>View</th>
                    <th>Create</th>
                    <th>Edit</th>
                    <th>Delete</th>
                    <th>Manage</th>
                  </tr>
                </thead>
                <tbody>
                  ${resources.map(resource => {
                    const actions = permGroups[resource] || {};
                    const resOverrides = overrides[resource] || {};
                    return `
                      <tr>
                        <td><strong>${resource}</strong></td>
                        ${['view', 'create', 'edit', 'delete', 'manage'].map(action => {
                          const isDefault = actions[action] || false;
                          const isOverride = resOverrides[action] !== undefined;
                          const checked = isOverride ? resOverrides[action] : isDefault;
                          const highlight = isOverride ? 'background:#FEF3C7;' : '';
                          return `
                            <td style="${highlight}padding:8px;text-align:center">
                              <input type="checkbox" ${checked ? 'checked' : ''} ${!isOverride && isDefault ? 'disabled' : ''}
                                onchange="UserDetail.togglePermission('${userId}', '${resource}', '${action}', this.checked)">
                            </td>
                          `;
                        }).join('')}
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      panel.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async togglePermission(userId, resource, action, value) {
    try {
      await API.put('/users/' + userId + '/permissions', { resource, action, value });
      App.toast('Permission updated', 'success');
    } catch (e) {
      App.toast(e.message, 'error');
      this.loadPermissionsTab(userId);
    }
  },

  async applyPermTemplate(userId) {
    const sel = document.getElementById('perm-template');
    if (!sel || !sel.value) { App.toast('Select a template', 'error'); return; }
    try {
      await API.post('/users/' + userId + '/permissions/template', { template_id: sel.value });
      App.toast('Template applied', 'success');
      this.loadPermissionsTab(userId);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  _activityPage: 1,
  _activityPagination: null,

  async loadActivityTab(userId, page) {
    const panel = document.getElementById('tab-activity');
    if (!panel) return;
    this._activityPage = page || 1;
    panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const data = await API.get('/users/' + userId + '/activity?page=' + this._activityPage + '&limit=25');
      const { items: activities, pagination } = Pagination.extract(data, 'activity');
      this._activityPagination = pagination;

      panel.innerHTML = `
        <div class="card">
          <div class="card-header"><h3>Activity Feed</h3></div>
          <div class="card-body">
            ${activities.length === 0 ? '<div class="empty-state-sm">No activity recorded</div>' : `
              <div class="activity-feed">
                ${activities.map(a => `
                  <div class="activity-item" style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
                    <div class="text-muted text-sm" style="min-width:120px;white-space:nowrap">${UserDetail._relativeTime(a.timestamp || a.created_at)}</div>
                    <div>
                      <span class="status-badge status-${a.action_type || 'active'}" style="font-size:0.75rem">${a.action || a.action_type || 'action'}</span>
                    </div>
                    <div style="flex:1">${a.details || a.description || '-'}</div>
                  </div>
                `).join('')}
              </div>
              ${Pagination.render(pagination, 'UserDetail._activityGoToPage')}
            `}
          </div>
        </div>
      `;
    } catch (e) {
      panel.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  _activityGoToPage(page) {
    if (!UserDetail._user) return;
    UserDetail.loadActivityTab(UserDetail._user.id, page);
  },

  async loadPerformanceTab(userId) {
    const panel = document.getElementById('tab-performance');
    if (!panel) return;
    panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const perf = await API.get('/users/' + userId + '/performance');

      panel.innerHTML = `
        <div class="card">
          <div class="card-header"><h3>Performance Metrics</h3></div>
          <div class="card-body">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">
              <div style="background:var(--bg-secondary,#F3F4F6);border-radius:12px;padding:20px;text-align:center">
                <div class="text-muted text-sm">WOs Completed (Week)</div>
                <div style="font-size:2rem;font-weight:700;color:var(--primary,#3B82F6)">${perf.wo_completed_week || 0}</div>
              </div>
              <div style="background:var(--bg-secondary,#F3F4F6);border-radius:12px;padding:20px;text-align:center">
                <div class="text-muted text-sm">WOs Completed (Month)</div>
                <div style="font-size:2rem;font-weight:700;color:var(--primary,#3B82F6)">${perf.wo_completed_month || 0}</div>
              </div>
              <div style="background:var(--bg-secondary,#F3F4F6);border-radius:12px;padding:20px;text-align:center">
                <div class="text-muted text-sm">WOs Completed (Quarter)</div>
                <div style="font-size:2rem;font-weight:700;color:var(--primary,#3B82F6)">${perf.wo_completed_quarter || 0}</div>
              </div>
              <div style="background:var(--bg-secondary,#F3F4F6);border-radius:12px;padding:20px;text-align:center">
                <div class="text-muted text-sm">Avg Completion Time</div>
                <div style="font-size:2rem;font-weight:700;color:var(--text)">${perf.avg_completion_time || '-'}</div>
              </div>
              <div style="background:var(--bg-secondary,#F3F4F6);border-radius:12px;padding:20px;text-align:center">
                <div class="text-muted text-sm">Total Hours Logged</div>
                <div style="font-size:2rem;font-weight:700;color:var(--text)">${perf.total_hours_logged != null ? perf.total_hours_logged.toFixed(1) : '0'}</div>
              </div>
              <div style="background:var(--bg-secondary,#F3F4F6);border-radius:12px;padding:20px;text-align:center">
                <div class="text-muted text-sm">On-Time Rate</div>
                <div style="font-size:2rem;font-weight:700;color:${(perf.on_time_rate || 0) >= 80 ? '#10B981' : '#F59E0B'}">${perf.on_time_rate != null ? perf.on_time_rate + '%' : '-'}</div>
              </div>
              <div style="background:var(--bg-secondary,#F3F4F6);border-radius:12px;padding:20px;text-align:center">
                <div class="text-muted text-sm">Parts Cost</div>
                <div style="font-size:2rem;font-weight:700;color:var(--text)">$${perf.parts_cost != null ? perf.parts_cost.toFixed(2) : '0.00'}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (e) {
      panel.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  _loginPage: 1,
  _loginPagination: null,

  async loadLoginHistoryTab(userId, page) {
    const panel = document.getElementById('tab-login-history');
    if (!panel) return;
    this._loginPage = page || 1;
    panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const data = await API.get('/users/' + userId + '/login-history?page=' + this._loginPage + '&limit=25');
      const { items: logins, pagination } = Pagination.extract(data, 'logins');
      this._loginPagination = pagination;

      panel.innerHTML = `
        <div class="card">
          <div class="card-header"><h3>Login History</h3></div>
          <div class="card-body">
            ${logins.length === 0 ? '<div class="empty-state-sm">No login history</div>' : `
              <table class="table">
                <thead>
                  <tr><th>Timestamp</th><th>Method</th><th>IP Address</th></tr>
                </thead>
                <tbody>
                  ${logins.map(l => `
                    <tr>
                      <td>${new Date(l.timestamp || l.created_at).toLocaleString()}</td>
                      <td>
                        ${l.method === 'passkey' ? '<i data-lucide="fingerprint" style="width:14px;height:14px;vertical-align:middle"></i>' : '<i data-lucide="key-round" style="width:14px;height:14px;vertical-align:middle"></i>'}
                        ${l.method || 'password'}
                      </td>
                      <td class="text-muted">${l.ip_address || l.ip || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              ${Pagination.render(pagination, 'UserDetail._loginGoToPage')}
            `}
          </div>
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      panel.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  _loginGoToPage(page) {
    if (!UserDetail._user) return;
    UserDetail.loadLoginHistoryTab(UserDetail._user.id, page);
  },

  async toggleStatus(userId, newStatus) {
    const label = newStatus === 'suspended' ? 'Suspend' : 'Activate';
    if (!confirm(label + ' this user?')) return;
    try {
      await API.put('/users/' + userId, { status: newStatus });
      App.toast('User ' + newStatus, 'success');
      this.render({ id: userId });
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async forcePasswordReset(userId) {
    if (!confirm('Force a password reset for this user?')) return;
    try {
      await API.post('/users/' + userId + '/force-password-reset');
      App.toast('Password reset email sent', 'success');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async deactivate(userId) {
    if (!confirm('Deactivate this user? They will lose access immediately.')) return;
    try {
      await API.put('/users/' + userId, { status: 'deactivated' });
      App.toast('User deactivated', 'success');
      this.render({ id: userId });
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async toggleGodMode(userId) {
    const user = this._user;
    const action = user && user.is_owner ? 'revoke' : 'grant';
    if (!confirm(`${action === 'grant' ? 'Grant' : 'Revoke'} god mode for ${user ? user.name : 'this user'}? This gives full cross-estate system access.`)) return;
    try {
      await API.post(`/users/${userId}/god-mode`);
      App.toast(`God mode ${action === 'grant' ? 'granted' : 'revoked'}`, 'success');
      // Update cached user if it's ourselves
      const me = API.getUser();
      if (me && String(me.id) === String(userId)) {
        me.is_owner = action === 'grant' ? 1 : 0;
        API.setUser(me);
      }
      this.render({ id: userId });
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
