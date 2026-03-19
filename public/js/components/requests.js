const Requests = {
  _currentTab: 'all',
  _currentPage: 1,
  _pagination: null,

  async list(page) {
    this._currentPage = page || 1;
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading requests...</p></div>';

    try {
      const params = new URLSearchParams({ page: this._currentPage, limit: 25 });
      if (this._currentTab !== 'all') params.set('status', this._currentTab);

      const data = await API.get(`/requests?${params.toString()}`);
      const { items: requests, pagination } = Pagination.extract(data);
      this._pagination = pagination;

      const counts = { all: requests.length, pending: 0, approved: 0, declined: 0 };
      requests.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });

      // Fetch properties for the portal links
      const propData = await API.get('/properties').catch(() => []);
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);

      container.innerHTML = `
        <div class="page-header">
          <h1>Work Requests <span class="tip-trigger" data-tip="work-request"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
        </div>

        <!-- Request Portal Links -->
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <h3><i data-lucide="globe" style="width:16px;height:16px;vertical-align:middle;margin-right:6px"></i> Public Request Forms</h3>
            <span class="text-muted" style="font-size:12px">Share these links with residents — no login needed to submit</span>
          </div>
          <div class="card-body">
            ${properties.length === 0 ? '<div class="empty-state-sm">No properties yet. <a href="#/properties/new">Add a property</a> to generate request form links.</div>' : `
              <div class="request-portal-grid">
                ${properties.map(p => {
                  const url = `${window.location.origin}/request/${p.id}`;
                  return `
                    <div class="request-portal-card">
                      <div class="request-portal-info">
                        <strong>${p.name}</strong>
                        <span>${p.address || p.type || ''}</span>
                      </div>
                      <div class="request-portal-actions">
                        <button class="btn btn-sm btn-secondary" onclick="Requests.copyLink('${url}')" title="Copy link">
                          <i data-lucide="copy"></i>
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="QRCodes.showModal('request', '${p.id}', '${p.name.replace(/'/g, "\\'")} — Request Form', '${(p.address || '').replace(/'/g, "\\'")}')" title="QR Code">
                          <i data-lucide="qr-code"></i>
                        </button>
                        <a href="${url}" target="_blank" class="btn btn-sm btn-primary" title="Open form">
                          <i data-lucide="external-link"></i> Open
                        </a>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>
        </div>

        <!-- Incoming Requests -->
        <div class="filters-bar">
          <div class="status-tabs">
            <button class="status-tab ${this._currentTab === 'all' ? 'active' : ''}" onclick="Requests.filterTab('all')">
              All <span class="tab-count">${counts.all}</span>
            </button>
            <button class="status-tab ${this._currentTab === 'pending' ? 'active' : ''}" onclick="Requests.filterTab('pending')">
              Pending <span class="tab-count">${counts.pending}</span>
            </button>
            <button class="status-tab ${this._currentTab === 'approved' ? 'active' : ''}" onclick="Requests.filterTab('approved')">
              Approved <span class="tab-count">${counts.approved}</span>
            </button>
            <button class="status-tab ${this._currentTab === 'declined' ? 'active' : ''}" onclick="Requests.filterTab('declined')">
              Declined <span class="tab-count">${counts.declined}</span>
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card-body no-padding">
            ${requests.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">
                  <i data-lucide="inbox"></i>
                </div>
                <h2>No Work Requests</h2>
                <p class="empty-state-desc">Residents and staff can submit maintenance requests without needing an account. Review incoming requests and approve them into tracked work orders.</p>
                <div class="empty-state-features">
                  <div class="empty-state-feature">
                    <i data-lucide="globe"></i>
                    <div>
                      <strong>Public Submission</strong>
                      <span>Share a simple form — no login required to submit requests</span>
                    </div>
                  </div>
                  <div class="empty-state-feature">
                    <i data-lucide="check-circle-2"></i>
                    <div>
                      <strong>Review & Approve</strong>
                      <span>Approve requests to create work orders, or decline with a reason</span>
                    </div>
                  </div>
                  <div class="empty-state-feature">
                    <i data-lucide="link"></i>
                    <div>
                      <strong>Tracked End-to-End</strong>
                      <span>Every request links to its resulting work order</span>
                    </div>
                  </div>
                </div>
                <div class="empty-state-connections">
                  <span class="empty-state-conn"><i data-lucide="link"></i> Approved requests become Work Orders</span>
                </div>
              </div>
            ` : `
              <table class="table" id="requests-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Requester</th>
                    <th>Property</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody id="requests-tbody">
                </tbody>
              </table>
              <div id="requests-empty" class="empty-state-sm" style="display:none">No requests match this filter</div>
              ${Pagination.render(pagination, 'Requests')}
            `}
          </div>
        </div>
      `;

      this._requests = requests;
      this.renderRows();
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  goToPage(page) {
    if (page < 1 || (this._pagination && page > this._pagination.totalPages)) return;
    this.list(page);
  },

  filterTab(tab) {
    this._currentTab = tab;
    this.list(1);
  },

  renderRows() {
    const tbody = document.getElementById('requests-tbody');
    const empty = document.getElementById('requests-empty');
    if (!tbody) return;

    const filtered = (this._requests || []).filter(r => {
      if (this._currentTab === 'all') return true;
      return r.status === this._currentTab;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
    } else {
      if (empty) empty.style.display = 'none';
      tbody.innerHTML = filtered.map(r => {
        const statusClass = { pending: 'badge-warning', approved: 'badge-success', declined: 'badge-critical' }[r.status] || '';
        const priorityClass = { critical: 'badge-critical', high: 'badge-danger', medium: 'badge-warning', low: 'badge-info' }[r.priority] || '';
        return `
          <tr class="clickable-row" onclick="Router.navigate('#/requests/${r.id}')">
            <td>#${r.id}</td>
            <td><strong>${this.escapeHtml(r.title)}</strong></td>
            <td>${this.escapeHtml(r.requester_name)}</td>
            <td>${r.property_name || '-'}</td>
            <td><span class="badge ${priorityClass}">${r.priority}</span></td>
            <td><span class="badge ${statusClass}">${r.status}</span></td>
            <td>${this.formatDate(r.created_at)}</td>
          </tr>
        `;
      }).join('');
    }
    lucide.createIcons();
  },

  async detail(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const r = await API.get(`/requests/${params.id}`);

      const statusClass = { pending: 'badge-warning', approved: 'badge-success', declined: 'badge-critical' }[r.status] || '';
      const priorityClass = { critical: 'badge-critical', high: 'badge-danger', medium: 'badge-warning', low: 'badge-info' }[r.priority] || '';

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/requests')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>Request #${r.id}</h1>
            <span class="badge ${statusClass}">${r.status}</span>
          </div>
          <div class="page-header-actions">
            ${r.status === 'pending' ? `
              <button class="btn btn-primary" onclick="Requests.showApproveModal(${r.id})">
                <i data-lucide="check"></i> Approve
              </button>
              <button class="btn btn-danger" onclick="Requests.decline(${r.id})">
                <i data-lucide="x"></i> Decline
              </button>
            ` : ''}
            ${r.work_order_id ? `
              <button class="btn btn-secondary" onclick="Router.navigate('#/workorders/${r.work_order_id}')">
                <i data-lucide="clipboard-list"></i> View Work Order
              </button>
            ` : ''}
            <button class="btn btn-danger btn-sm" onclick="Requests.remove(${r.id})">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="card">
            <div class="card-header"><h3>Request Details</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field">
                  <label>Title</label>
                  <p>${this.escapeHtml(r.title)}</p>
                </div>
                <div class="detail-field">
                  <label>Priority</label>
                  <p><span class="badge ${priorityClass}">${r.priority}</span></p>
                </div>
                <div class="detail-field">
                  <label>Property</label>
                  <p>${r.property_name || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Location</label>
                  <p>${r.location || '-'}</p>
                </div>
                <div class="detail-field detail-field-full">
                  <label>Description</label>
                  <p>${r.description ? this.escapeHtml(r.description) : '-'}</p>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3>Requester Information</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field">
                  <label>Name</label>
                  <p>${this.escapeHtml(r.requester_name)}</p>
                </div>
                <div class="detail-field">
                  <label>Email</label>
                  <p>${r.requester_email ? `<a href="mailto:${r.requester_email}">${this.escapeHtml(r.requester_email)}</a>` : '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Phone</label>
                  <p>${r.requester_phone ? `<a href="tel:${r.requester_phone}">${this.escapeHtml(r.requester_phone)}</a>` : '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Submitted</label>
                  <p>${this.formatDate(r.created_at)}</p>
                </div>
              </div>
            </div>
          </div>

          ${r.status !== 'pending' ? `
          <div class="card">
            <div class="card-header"><h3>Resolution</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field">
                  <label>Status</label>
                  <p><span class="badge ${statusClass}">${r.status}</span></p>
                </div>
                <div class="detail-field">
                  <label>${r.status === 'approved' ? 'Approved' : 'Declined'} By</label>
                  <p>${r.approved_by_name || '-'}</p>
                </div>
                ${r.work_order_id ? `
                <div class="detail-field">
                  <label>Work Order</label>
                  <p><a href="#/workorders/${r.work_order_id}" class="link">#${r.work_order_id}</a></p>
                </div>
                ` : ''}
              </div>
            </div>
          </div>
          ` : ''}
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async showApproveModal(id) {
    try {
      const request = await API.get(`/requests/${id}`);
      const [propData, teamData] = await Promise.all([
        API.get('/properties').catch(() => []),
        API.get('/teams').catch(() => [])
      ]);
      const properties = Array.isArray(propData) ? propData : (propData.data || []);
      const teams = Array.isArray(teamData) ? teamData : (teamData.data || []);

      const modal = document.getElementById('modal-overlay');
      const title = modal.querySelector('.modal-title');
      const body = modal.querySelector('.modal-body');
      const footer = modal.querySelector('.modal-footer');

      title.textContent = 'Approve & Create Work Order';
      body.innerHTML = `
        <div class="form-group">
          <label for="approve-title">Work Order Title *</label>
          <input type="text" id="approve-title" class="form-control" value="${this.escapeAttr(request.title)}">
        </div>
        <div class="form-group">
          <label for="approve-desc">Description</label>
          <textarea id="approve-desc" class="form-control" rows="3">${request.description || ''}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="approve-property">Property *</label>
            <select id="approve-property" class="form-control">
              <option value="">Select property</option>
              ${properties.map(p => `<option value="${p.id}" ${String(request.property_id) === String(p.id) ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="approve-priority">Priority</label>
            <select id="approve-priority" class="form-control">
              <option value="low" ${request.priority === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${request.priority === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${request.priority === 'high' ? 'selected' : ''}>High</option>
              <option value="critical" ${request.priority === 'critical' ? 'selected' : ''}>Critical</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="approve-team">Assign Team</label>
            <select id="approve-team" class="form-control">
              <option value="">Unassigned</option>
              ${teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="approve-category">Category</label>
            <input type="text" id="approve-category" class="form-control" placeholder="e.g., Plumbing, HVAC">
          </div>
        </div>
        <div class="form-group">
          <label for="approve-due">Due Date</label>
          <input type="date" id="approve-due" class="form-control">
        </div>
      `;
      footer.innerHTML = `
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="Requests.submitApproval(${id})">Approve & Create Work Order</button>
      `;
      modal.style.display = 'flex';
      lucide.createIcons();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async submitApproval(id) {
    try {
      const property_id = document.getElementById('approve-property').value;
      if (!property_id) {
        App.toast('Please select a property', 'error');
        return;
      }

      const body = {
        title: document.getElementById('approve-title').value,
        description: document.getElementById('approve-desc').value || null,
        property_id: property_id,
        priority: document.getElementById('approve-priority').value,
        assigned_team_id: document.getElementById('approve-team').value || null,
        category: document.getElementById('approve-category').value || null,
        due_date: document.getElementById('approve-due').value || null
      };

      const result = await API.post(`/requests/${id}/approve`, body);
      App.closeModal();
      App.toast('Request approved - Work order created', 'success');
      Requests.updatePendingBadge();
      Router.navigate(`#/requests/${id}`);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async decline(id) {
    if (!confirm('Are you sure you want to decline this request?')) return;
    try {
      await API.post(`/requests/${id}/decline`);
      App.toast('Request declined', 'success');
      Requests.updatePendingBadge();
      Router.navigate(`#/requests/${id}`);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async remove(id) {
    if (!confirm('Are you sure you want to delete this request?')) return;
    try {
      await API.delete(`/requests/${id}`);
      App.toast('Request deleted', 'success');
      Requests.updatePendingBadge();
      Router.navigate('#/requests');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async updatePendingBadge() {
    try {
      const data = await API.get('/requests/pending-count');
      const badge = document.getElementById('requests-pending-badge');
      if (badge) {
        if (data.count > 0) {
          badge.textContent = data.count;
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      }
    } catch (e) {
      // silently fail
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  async copyLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      App.toast('Link copied to clipboard', 'success');
    } catch {
      App.toast('Failed to copy', 'error');
    }
  },

  escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};
