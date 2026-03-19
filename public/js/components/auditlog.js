const AuditLog = {
  _currentPage: 1,
  _pagination: null,
  _filters: { user_id: 'all', action: 'all', entity_type: 'all', start_date: '', end_date: '' },

  async render(page) {
    this._currentPage = page || 1;
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading audit log...</p></div>';

    try {
      const params = new URLSearchParams({ page: this._currentPage, limit: 25 });
      const f = this._filters;
      if (f.user_id !== 'all') params.set('user_id', f.user_id);
      if (f.action !== 'all') params.set('action', f.action);
      if (f.entity_type !== 'all') params.set('entity_type', f.entity_type);
      if (f.start_date) params.set('start_date', f.start_date);
      if (f.end_date) params.set('end_date', f.end_date);

      const [auditData, userData] = await Promise.all([
        API.get('/audit?' + params.toString()),
        API.get('/auth/users').catch(() => API.get('/users').catch(() => []))
      ]);
      const { items: entries, pagination } = Pagination.extract(auditData, 'entries');
      this._pagination = pagination;
      const users = Array.isArray(userData) ? userData : (userData.data || userData.users || []);

      const actionTypes = ['created', 'updated', 'deleted', 'approved', 'rejected', 'password_changed', 'login', 'logout', 'invited', 'suspended', 'deactivated'];
      const entityTypes = ['work_order', 'property', 'asset', 'user', 'invoice', 'team', 'part', 'vendor', 'approval', 'setting'];

      const actionColors = {
        created: '#10B981', updated: '#3B82F6', deleted: '#EF4444', approved: '#10B981',
        rejected: '#F59E0B', password_changed: '#8B5CF6', login: '#6B7280', logout: '#6B7280',
        invited: '#06B6D4', suspended: '#F59E0B', deactivated: '#EF4444'
      };

      container.innerHTML = `
        <div class="page-header">
          <h1>Audit Log</h1>
          <button class="btn btn-secondary" onclick="AuditLog.exportCSV()">
            <i data-lucide="download"></i> Export CSV
          </button>
        </div>

        <div class="filters-bar">
          <div class="filter-controls">
            <select class="form-control form-control-sm" onchange="AuditLog.filterUser(this.value)">
              <option value="all" ${f.user_id === 'all' ? 'selected' : ''}>All Users</option>
              ${users.map(u => `<option value="${u.id}" ${f.user_id === String(u.id) ? 'selected' : ''}>${u.name || u.email}</option>`).join('')}
            </select>
            <select class="form-control form-control-sm" onchange="AuditLog.filterAction(this.value)">
              <option value="all" ${f.action === 'all' ? 'selected' : ''}>All Actions</option>
              ${actionTypes.map(a => `<option value="${a}" ${f.action === a ? 'selected' : ''}>${a.replace(/_/g, ' ')}</option>`).join('')}
            </select>
            <select class="form-control form-control-sm" onchange="AuditLog.filterEntityType(this.value)">
              <option value="all" ${f.entity_type === 'all' ? 'selected' : ''}>All Entity Types</option>
              ${entityTypes.map(t => `<option value="${t}" ${f.entity_type === t ? 'selected' : ''}>${t.replace(/_/g, ' ')}</option>`).join('')}
            </select>
            <input type="date" class="form-control form-control-sm" value="${f.start_date}" onchange="AuditLog.filterStartDate(this.value)" title="Start date">
            <input type="date" class="form-control form-control-sm" value="${f.end_date}" onchange="AuditLog.filterEndDate(this.value)" title="End date">
          </div>
        </div>

        <div class="card">
          <div class="card-body no-padding">
            ${entries.length === 0 ? `
              <div class="empty-state">
                <i data-lucide="scroll-text" class="empty-icon"></i>
                <h2>No Audit Entries</h2>
                <p>No entries match the current filters.</p>
              </div>
            ` : `
              <table class="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Entity Type</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${entries.map(e => `
                    <tr>
                      <td class="text-sm">${new Date(e.timestamp || e.created_at).toLocaleString()}</td>
                      <td>
                        <div class="user-cell">
                          <div class="user-avatar-sm" style="background:${e.user_avatar_color || '#6B7280'}">${(e.user_name || 'U').charAt(0).toUpperCase()}</div>
                          <span>${e.user_name || e.user_email || '-'}</span>
                        </div>
                      </td>
                      <td>
                        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;color:#fff;background:${actionColors[e.action] || '#6B7280'}">
                          ${(e.action || '-').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td class="text-sm">${(e.entity_type || '-').replace(/_/g, ' ')}</td>
                      <td class="text-sm text-muted">${e.details || e.description || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              ${Pagination.render(pagination, 'AuditLog')}
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
    this.render(page);
  },

  filterUser(val) {
    this._filters.user_id = val;
    this.render(1);
  },

  filterAction(val) {
    this._filters.action = val;
    this.render(1);
  },

  filterEntityType(val) {
    this._filters.entity_type = val;
    this.render(1);
  },

  filterStartDate(val) {
    this._filters.start_date = val;
    this.render(1);
  },

  filterEndDate(val) {
    this._filters.end_date = val;
    this.render(1);
  },

  async exportCSV() {
    try {
      const params = new URLSearchParams();
      const f = this._filters;
      if (f.user_id !== 'all') params.set('user_id', f.user_id);
      if (f.action !== 'all') params.set('action', f.action);
      if (f.entity_type !== 'all') params.set('entity_type', f.entity_type);
      if (f.start_date) params.set('start_date', f.start_date);
      if (f.end_date) params.set('end_date', f.end_date);

      const headers = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('token');
      if (token) headers['Authorization'] = 'Bearer ' + token;

      const res = await fetch('/api/audit/export?' + params.toString(), { headers });
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-log-' + new Date().toISOString().split('T')[0] + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      App.toast('CSV exported', 'success');
    } catch (e) {
      App.toast(e.message || 'Export failed', 'error');
    }
  }
};
