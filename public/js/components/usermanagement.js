const UserManagement = {
  _currentPage: 1,
  _pagination: null,
  _searchTimeout: null,
  _filters: { search: '', role: 'all', status: 'all', team_id: 'all' },
  _teams: [],
  _selectedIds: [],

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

  async list(page) {
    if (!Permissions.has('users:view')) {
      document.getElementById('main-content').innerHTML = '<div class="error-state"><p>You do not have permission to view users.</p></div>';
      return;
    }

    this._currentPage = page || 1;
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading users...</p></div>';

    try {
      const params = new URLSearchParams({ page: this._currentPage, limit: 25 });
      const f = this._filters;
      if (f.search) params.set('search', f.search);
      if (f.role !== 'all') params.set('role', f.role);
      if (f.status !== 'all') params.set('status', f.status);
      if (f.team_id !== 'all') params.set('team_id', f.team_id);

      const [userData, teamData] = await Promise.all([
        API.get('/users?' + params.toString()),
        API.get('/teams').catch(() => [])
      ]);
      const { items: users, pagination } = Pagination.extract(userData, 'users');
      this._pagination = pagination;
      this._teams = Array.isArray(teamData) ? teamData : (teamData.data || teamData.teams || []);
      this._selectedIds = [];

      container.innerHTML = `
        <div class="page-header">
          <h1>User Management</h1>
          <div class="page-header-actions">
            <button class="btn btn-secondary" onclick="UserManagement.showImportModal()">
              <i data-lucide="upload"></i> Import CSV
            </button>
            <button class="btn btn-primary" onclick="UserManagement.showInviteModal()">
              <i data-lucide="user-plus"></i> Invite User
            </button>
          </div>
        </div>

        <div class="filters-bar">
          <div class="filter-controls">
            <input type="text" class="form-control form-control-sm" placeholder="Search users..."
              value="${f.search}" oninput="UserManagement.handleSearch(this.value)">
            <select class="form-control form-control-sm" onchange="UserManagement.filterRole(this.value)">
              <option value="all" ${f.role === 'all' ? 'selected' : ''}>All Roles</option>
              <option value="admin" ${f.role === 'admin' ? 'selected' : ''}>Admin</option>
              <option value="manager" ${f.role === 'manager' ? 'selected' : ''}>Manager</option>
              <option value="technician" ${f.role === 'technician' ? 'selected' : ''}>Technician</option>
            </select>
            <select class="form-control form-control-sm" onchange="UserManagement.filterStatus(this.value)">
              <option value="all" ${f.status === 'all' ? 'selected' : ''}>All Statuses</option>
              <option value="invited" ${f.status === 'invited' ? 'selected' : ''}>Invited</option>
              <option value="active" ${f.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="suspended" ${f.status === 'suspended' ? 'selected' : ''}>Suspended</option>
              <option value="deactivated" ${f.status === 'deactivated' ? 'selected' : ''}>Deactivated</option>
            </select>
            <select class="form-control form-control-sm" onchange="UserManagement.filterTeam(this.value)">
              <option value="all" ${f.team_id === 'all' ? 'selected' : ''}>All Teams</option>
              ${this._teams.map(t => `<option value="${t.id}" ${f.team_id === String(t.id) ? 'selected' : ''}>${t.name}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="bulk-bar" id="um-bulk-bar" style="display:none">
          <span id="um-bulk-count">0 selected</span>
          <button class="btn btn-sm btn-secondary" onclick="UserManagement.showBulkRoleModal()">Change Role</button>
          <button class="btn btn-sm btn-secondary" onclick="UserManagement.showBulkTeamModal()">Add/Remove Team</button>
          <button class="btn btn-sm btn-secondary" onclick="UserManagement.showBulkStatusModal()">Change Status</button>
        </div>

        <div class="card">
          <div class="card-body no-padding">
            ${users.length === 0 ? `
              <div class="empty-state">
                <i data-lucide="users" class="empty-icon"></i>
                <h2>No Users Found</h2>
                <p>No users match the current filters, or invite your first user to get started.</p>
                <button class="btn btn-primary" onclick="UserManagement.showInviteModal()">
                  <i data-lucide="user-plus"></i> Invite User
                </button>
              </div>
            ` : `
              <table class="table">
                <thead>
                  <tr>
                    <th style="width:40px"><input type="checkbox" onchange="UserManagement.toggleSelectAll(this.checked)"></th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Teams</th>
                    <th>Status</th>
                    <th>Last Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${users.map(u => `
                    <tr>
                      <td onclick="event.stopPropagation()">
                        <input type="checkbox" class="um-select" value="${u.id}" onchange="UserManagement.updateBulkBar()">
                      </td>
                      <td>
                        <a href="#/users/${u.id}" class="user-cell" style="text-decoration:none;color:inherit">
                          <div class="user-avatar-sm" style="background:${u.avatar_color || '#3B82F6'}">${(u.name || u.email || 'U').charAt(0).toUpperCase()}</div>
                          <span>${u.name || u.email}</span>
                        </a>
                      </td>
                      <td>${u.email || '-'}</td>
                      <td>${u.is_owner ? '<span class="god-badge">god mode</span>' : `<span class="role-badge role-${u.role || 'technician'}">${u.role || 'technician'}</span>`}</td>
                      <td>${u.teams && u.teams.length ? u.teams.map(t => '<span class="team-tag">' + t.name + '</span>').join('') : '<span class="text-muted">No teams</span>'}</td>
                      <td><span class="status-badge status-${u.status || 'active'}">${u.status || 'active'}</span></td>
                      <td class="text-muted text-sm">${UserManagement._relativeTime(u.last_active_at)}</td>
                      <td onclick="event.stopPropagation()">
                        <button class="btn btn-sm btn-secondary" onclick="Router.navigate('#/users/${u.id}')" title="Edit">
                          <i data-lucide="edit" style="width:14px;height:14px"></i>
                        </button>
                        ${u.status === 'active' ? `
                          <button class="btn btn-sm btn-secondary" onclick="UserManagement.quickSuspend('${u.id}')" title="Suspend">
                            <i data-lucide="pause-circle" style="width:14px;height:14px"></i>
                          </button>
                        ` : ''}
                        ${u.status === 'suspended' ? `
                          <button class="btn btn-sm btn-secondary" onclick="UserManagement.quickActivate('${u.id}')" title="Activate">
                            <i data-lucide="play-circle" style="width:14px;height:14px"></i>
                          </button>
                        ` : ''}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              ${Pagination.render(pagination, 'UserManagement')}
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

  handleSearch(val) {
    clearTimeout(this._searchTimeout);
    this._searchTimeout = setTimeout(() => {
      this._filters.search = val;
      this.list(1);
    }, 300);
  },

  filterRole(val) {
    this._filters.role = val;
    this.list(1);
  },

  filterStatus(val) {
    this._filters.status = val;
    this.list(1);
  },

  filterTeam(val) {
    this._filters.team_id = val;
    this.list(1);
  },

  toggleSelectAll(checked) {
    document.querySelectorAll('.um-select').forEach(cb => { cb.checked = checked; });
    this.updateBulkBar();
  },

  updateBulkBar() {
    const selected = document.querySelectorAll('.um-select:checked');
    const bar = document.getElementById('um-bulk-bar');
    const count = document.getElementById('um-bulk-count');
    if (!bar) return;
    this._selectedIds = Array.from(selected).map(cb => cb.value);
    if (selected.length > 0) {
      bar.style.display = 'flex';
      count.textContent = selected.length + ' selected';
    } else {
      bar.style.display = 'none';
    }
  },

  async showInviteModal() {
    const modal = document.getElementById('modal-overlay');
    const title = modal.querySelector('.modal-title');
    const body = modal.querySelector('.modal-body');
    const footer = modal.querySelector('.modal-footer');

    title.textContent = 'Invite User';
    footer.innerHTML = '';

    let teams = this._teams;
    if (!teams.length) {
      try { const td = await API.get('/teams'); teams = Array.isArray(td) ? td : (td.data || td.teams || []); } catch (e) { teams = []; }
    }

    body.innerHTML = `
      <form id="invite-form" onsubmit="UserManagement.handleInvite(event)">
        <div class="form-group">
          <label for="invite-email">Email Address *</label>
          <input type="email" id="invite-email" class="form-control" required placeholder="user@example.com">
        </div>
        <div class="form-group">
          <label for="invite-role">Role</label>
          <select id="invite-role" class="form-control">
            <option value="technician">Technician</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="form-group">
          <label for="invite-team">Team</label>
          <select id="invite-team" class="form-control">
            <option value="">No team</option>
            ${teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
        </div>
        <div id="invite-error" class="form-error" style="display:none"></div>
        <div id="invite-success" style="display:none;padding:12px;background:var(--bg-success,#ECFDF5);border-radius:8px;margin-top:12px">
          <p style="margin:0 0 8px;font-weight:600;color:var(--text-success,#065F46)">Invite sent!</p>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="text" id="invite-link" class="form-control" readonly style="font-size:0.8rem">
            <button type="button" class="btn btn-sm btn-secondary" onclick="UserManagement.copyInviteLink()">Copy</button>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="invite-submit">Send Invite</button>
        </div>
      </form>
    `;
    modal.style.display = 'flex';
    lucide.createIcons();
  },

  async handleInvite(e) {
    e.preventDefault();
    const btn = document.getElementById('invite-submit');
    const errorEl = document.getElementById('invite-error');
    const successEl = document.getElementById('invite-success');
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      const body = {
        email: document.getElementById('invite-email').value,
        role: document.getElementById('invite-role').value,
        team_id: document.getElementById('invite-team').value || null
      };
      const result = await API.post('/invites', body);
      const link = result.invite_link || result.link || (window.location.origin + '/invite/' + (result.token || ''));
      document.getElementById('invite-link').value = link;
      successEl.style.display = 'block';
      App.toast('Invite sent', 'success');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Invite';
    }
  },

  copyInviteLink() {
    const input = document.getElementById('invite-link');
    if (!input) return;
    navigator.clipboard.writeText(input.value).then(() => {
      App.toast('Link copied to clipboard', 'success');
    }).catch(() => {
      input.select();
      document.execCommand('copy');
      App.toast('Link copied', 'success');
    });
  },

  showImportModal() {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Import Users from CSV';
    modal.querySelector('.modal-body').innerHTML = `
      <div class="form-group">
        <label>Upload CSV File</label>
        <p class="text-muted text-sm">CSV should have columns: email, name, role, team</p>
        <input type="file" id="csv-file" class="form-control" accept=".csv">
      </div>
    `;
    modal.querySelector('.modal-footer').innerHTML = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="UserManagement.handleImportCSV()">Import</button>
    `;
    modal.style.display = 'flex';
  },

  async handleImportCSV() {
    const fileInput = document.getElementById('csv-file');
    if (!fileInput || !fileInput.files[0]) {
      App.toast('Please select a CSV file', 'error');
      return;
    }
    App.toast('CSV import is not yet implemented', 'info');
    App.closeModal();
  },

  async quickSuspend(userId) {
    if (!confirm('Suspend this user?')) return;
    try {
      await API.put('/users/' + userId, { status: 'suspended' });
      App.toast('User suspended', 'success');
      this.list(this._currentPage);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async quickActivate(userId) {
    try {
      await API.put('/users/' + userId, { status: 'active' });
      App.toast('User activated', 'success');
      this.list(this._currentPage);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  showBulkRoleModal() {
    if (this._selectedIds.length === 0) return;
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Change Role';
    modal.querySelector('.modal-body').innerHTML = `
      <p>${this._selectedIds.length} user(s) selected</p>
      <div class="form-group">
        <label for="bulk-role">New Role</label>
        <select id="bulk-role" class="form-control">
          <option value="technician">Technician</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
      </div>
    `;
    modal.querySelector('.modal-footer').innerHTML = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="UserManagement.applyBulkRole()">Apply</button>
    `;
    modal.style.display = 'flex';
  },

  async applyBulkRole() {
    const role = document.getElementById('bulk-role').value;
    try {
      await API.post('/users/bulk/role', { user_ids: this._selectedIds, role });
      App.closeModal();
      App.toast('Roles updated', 'success');
      this.list(this._currentPage);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  showBulkTeamModal() {
    if (this._selectedIds.length === 0) return;
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Add/Remove Team';
    modal.querySelector('.modal-body').innerHTML = `
      <p>${this._selectedIds.length} user(s) selected</p>
      <div class="form-group">
        <label for="bulk-team-action">Action</label>
        <select id="bulk-team-action" class="form-control">
          <option value="add">Add to team</option>
          <option value="remove">Remove from team</option>
        </select>
      </div>
      <div class="form-group">
        <label for="bulk-team">Team</label>
        <select id="bulk-team" class="form-control" multiple size="5" style="min-height:100px">
          ${this._teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
        </select>
        <span class="form-hint">Hold Ctrl/Cmd to select multiple teams</span>
      </div>
    `;
    modal.querySelector('.modal-footer').innerHTML = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="UserManagement.applyBulkTeam()">Apply</button>
    `;
    modal.style.display = 'flex';
  },

  async applyBulkTeam() {
    const action = document.getElementById('bulk-team-action').value;
    const sel = document.getElementById('bulk-team');
    const team_ids = Array.from(sel.selectedOptions).map(o => o.value);
    if (team_ids.length === 0) { App.toast('Select at least one team', 'error'); return; }
    try {
      await API.post('/users/bulk/team', { user_ids: this._selectedIds, team_ids, action });
      App.closeModal();
      App.toast('Teams updated', 'success');
      this.list(this._currentPage);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  showBulkStatusModal() {
    if (this._selectedIds.length === 0) return;
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Change Status';
    modal.querySelector('.modal-body').innerHTML = `
      <p>${this._selectedIds.length} user(s) selected</p>
      <div class="form-group">
        <label for="bulk-status">New Status</label>
        <select id="bulk-status" class="form-control">
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
        </select>
      </div>
    `;
    modal.querySelector('.modal-footer').innerHTML = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="UserManagement.applyBulkStatus()">Apply</button>
    `;
    modal.style.display = 'flex';
  },

  async applyBulkStatus() {
    const status = document.getElementById('bulk-status').value;
    try {
      await API.post('/users/bulk/status', { user_ids: this._selectedIds, status });
      App.closeModal();
      App.toast('Statuses updated', 'success');
      this.list(this._currentPage);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
