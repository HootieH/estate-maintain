const Vendors = {
  _currentPage: 1,
  _pagination: null,

  async list(page) {
    this._currentPage = page || 1;
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading vendors...</p></div>';

    try {
      const params = new URLSearchParams({ page: this._currentPage, limit: 25 });
      if (this._activeOnly) params.set('is_active', '1');
      if (this._searchTerm) params.set('search', this._searchTerm);

      const data = await API.get(`/vendors?${params.toString()}`);
      const { items: vendors, pagination } = Pagination.extract(data, 'vendors');
      this._pagination = pagination;

      container.innerHTML = `
        <div class="page-header">
          <h1>Vendors <span class="tip-trigger" data-tip="vendor"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
          <button class="btn btn-primary" onclick="Router.navigate('#/vendors/new')">
            <i data-lucide="plus"></i> Add Vendor
          </button>
        </div>

        <div class="filters-bar">
          <div class="filter-controls">
            <input type="text" id="vendor-search" class="form-control" placeholder="Search vendors..."
              onkeyup="Vendors.search(this.value)">
            <label class="toggle-filter">
              <input type="checkbox" id="vendor-active-toggle" onchange="Vendors.toggleActive(this.checked)" checked>
              <span>Active Only</span>
            </label>
          </div>
        </div>

        <div class="card">
          <div class="card-body no-padding">
            ${vendors.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">
                  <i data-lucide="truck"></i>
                </div>
                <h2>No Vendors Yet</h2>
                <p class="empty-state-desc">Keep a directory of your trusted suppliers and service providers. Link vendors to purchase orders for streamlined procurement.</p>
                <div class="empty-state-features">
                  <div class="empty-state-feature">
                    <i data-lucide="phone"></i>
                    <div>
                      <strong>Contact Directory</strong>
                      <span>Store contact details, specialties, and notes for each vendor</span>
                    </div>
                  </div>
                  <div class="empty-state-feature">
                    <i data-lucide="shopping-cart"></i>
                    <div>
                      <strong>Purchase Orders</strong>
                      <span>Create and track orders to vendors with approval workflows</span>
                    </div>
                  </div>
                  <div class="empty-state-feature">
                    <i data-lucide="star"></i>
                    <div>
                      <strong>Specialties</strong>
                      <span>Categorize vendors by specialty for quick lookup</span>
                    </div>
                  </div>
                </div>
                <div class="empty-state-connections">
                  <span class="empty-state-conn"><i data-lucide="link"></i> Linked to Purchase Orders for parts procurement</span>
                </div>
                <button class="btn btn-primary" onclick="Router.navigate('#/vendors/new')">
                  <i data-lucide="plus"></i> Add Your First Vendor
                </button>
              </div>
            ` : `
              <table class="table" id="vendors-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Specialty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody id="vendors-tbody">
                </tbody>
              </table>
              <div id="vendors-empty" class="empty-state-sm" style="display:none">No vendors match your filter</div>
              ${Pagination.render(pagination, 'Vendors')}
            `}
          </div>
        </div>
      `;

      this._vendors = vendors;
      this._searchTerm = this._searchTerm || '';
      this._activeOnly = this._activeOnly !== undefined ? this._activeOnly : true;
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

  search(term) {
    this._searchTerm = term.toLowerCase();
    this.renderRows();
  },

  toggleActive(checked) {
    this._activeOnly = checked;
    this.list(1);
  },

  renderRows() {
    const tbody = document.getElementById('vendors-tbody');
    const empty = document.getElementById('vendors-empty');
    if (!tbody) return;

    const filtered = (this._vendors || []).filter(v => {
      if (this._activeOnly && !v.is_active) return false;
      if (this._searchTerm) {
        const s = this._searchTerm;
        return (v.name || '').toLowerCase().includes(s) ||
          (v.contact_name || '').toLowerCase().includes(s) ||
          (v.email || '').toLowerCase().includes(s) ||
          (v.specialty || '').toLowerCase().includes(s);
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
    } else {
      if (empty) empty.style.display = 'none';
      tbody.innerHTML = filtered.map(v => `
        <tr class="clickable-row" onclick="Router.navigate('#/vendors/${v.id}')">
          <td><strong>${v.name}</strong></td>
          <td>${v.contact_name || '-'}</td>
          <td>${v.email || '-'}</td>
          <td>${v.phone || '-'}</td>
          <td>${v.specialty || '-'}</td>
          <td><span class="badge ${v.is_active ? 'badge-success' : 'badge-secondary'}">${v.is_active ? 'Active' : 'Inactive'}</span></td>
        </tr>
      `).join('');
    }
    lucide.createIcons();
  },

  async detail(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const vendor = await API.get(`/vendors/${params.id}`);
      const pos = vendor.purchase_orders || [];

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/vendors')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>${vendor.name}</h1>
            <span class="badge ${vendor.is_active ? 'badge-success' : 'badge-secondary'}">${vendor.is_active ? 'Active' : 'Inactive'}</span>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-secondary" onclick="Vendors.edit('${params.id}')">
              <i data-lucide="edit"></i> Edit
            </button>
            ${vendor.is_active ? `
              <button class="btn btn-danger" onclick="Vendors.remove('${params.id}')">
                <i data-lucide="trash-2"></i> Deactivate
              </button>
            ` : ''}
          </div>
        </div>

        <div class="detail-grid">
          <div class="card">
            <div class="card-header"><h3>Vendor Details</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field">
                  <label>Contact Name</label>
                  <p>${vendor.contact_name || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Email</label>
                  <p>${vendor.email ? `<a href="mailto:${vendor.email}">${vendor.email}</a>` : '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Phone</label>
                  <p>${vendor.phone || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Specialty</label>
                  <p>${vendor.specialty || '-'}</p>
                </div>
                <div class="detail-field detail-field-full">
                  <label>Address</label>
                  <p>${vendor.address || '-'}</p>
                </div>
                <div class="detail-field detail-field-full">
                  <label>Notes</label>
                  <p>${vendor.notes || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Purchase Orders</h3>
            <button class="btn btn-primary btn-sm" onclick="Router.navigate('#/purchaseorders/new?vendor_id=${params.id}')">
              <i data-lucide="plus"></i> New PO
            </button>
          </div>
          <div class="card-body no-padding">
            ${pos.length === 0 ? `
              <div class="empty-state-sm">No purchase orders for this vendor</div>
            ` : `
              <table class="table">
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Property</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  ${pos.map(po => `
                    <tr class="clickable-row" onclick="Router.navigate('#/purchaseorders/${po.id}')">
                      <td><strong>${po.po_number}</strong></td>
                      <td>${PurchaseOrders.statusBadge(po.status)}</td>
                      <td>$${Number(po.total_cost || 0).toFixed(2)}</td>
                      <td>${po.property_name || '-'}</td>
                      <td>${Dashboard.formatDate(po.created_at)}</td>
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
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async form(editId) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      let vendor = null;
      if (editId) {
        vendor = await API.get(`/vendors/${editId}`);
      }

      const isEdit = !!vendor;
      const title = isEdit ? 'Edit Vendor' : 'New Vendor';
      const backUrl = isEdit ? `#/vendors/${editId}` : '#/vendors';

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('${backUrl}')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>${title}</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="vendor-form" onsubmit="Vendors.handleSubmit(event, ${editId ? `'${editId}'` : 'null'})">
              <div class="form-row">
                <div class="form-group">
                  <label for="vendor-name">Vendor Name *</label>
                  <input type="text" id="vendor-name" class="form-control" required value="${vendor ? vendor.name : ''}" placeholder="Company name">
                </div>
                <div class="form-group">
                  <label for="vendor-contact">Contact Name</label>
                  <input type="text" id="vendor-contact" class="form-control" value="${vendor ? (vendor.contact_name || '') : ''}" placeholder="Primary contact">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="vendor-email">Email</label>
                  <input type="email" id="vendor-email" class="form-control" value="${vendor ? (vendor.email || '') : ''}" placeholder="email@example.com">
                </div>
                <div class="form-group">
                  <label for="vendor-phone">Phone</label>
                  <input type="text" id="vendor-phone" class="form-control" value="${vendor ? (vendor.phone || '') : ''}" placeholder="(555) 123-4567">
                </div>
              </div>
              <div class="form-group">
                <label for="vendor-address">Address</label>
                <input type="text" id="vendor-address" class="form-control" value="${vendor ? (vendor.address || '') : ''}" placeholder="Full address">
              </div>
              <div class="form-group">
                <label for="vendor-specialty">Specialty</label>
                <input type="text" id="vendor-specialty" class="form-control" value="${vendor ? (vendor.specialty || '') : ''}" placeholder="e.g., HVAC, Plumbing, Electrical">
              </div>
              <div class="form-group">
                <label for="vendor-notes">Notes</label>
                <textarea id="vendor-notes" class="form-control" rows="3" placeholder="Additional notes...">${vendor ? (vendor.notes || '') : ''}</textarea>
              </div>
              <div id="vendor-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('${backUrl}')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="vendor-submit">${isEdit ? 'Save Changes' : 'Add Vendor'}</button>
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

  async edit(id) {
    this.form(id);
  },

  async handleSubmit(e, editId) {
    e.preventDefault();
    const btn = document.getElementById('vendor-submit');
    const errorEl = document.getElementById('vendor-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = editId ? 'Saving...' : 'Adding...';

    try {
      const body = {
        name: document.getElementById('vendor-name').value,
        contact_name: document.getElementById('vendor-contact').value || null,
        email: document.getElementById('vendor-email').value || null,
        phone: document.getElementById('vendor-phone').value || null,
        address: document.getElementById('vendor-address').value || null,
        specialty: document.getElementById('vendor-specialty').value || null,
        notes: document.getElementById('vendor-notes').value || null
      };

      if (editId) {
        await API.put(`/vendors/${editId}`, body);
        App.toast('Vendor updated', 'success');
        Router.navigate(`#/vendors/${editId}`);
      } else {
        const result = await API.post('/vendors', body);
        App.toast('Vendor added', 'success');
        Router.navigate(`#/vendors/${result.id}`);
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = editId ? 'Save Changes' : 'Add Vendor';
    }
  },

  async remove(id) {
    if (!confirm('Are you sure you want to deactivate this vendor?')) return;
    try {
      await API.delete(`/vendors/${id}`);
      App.toast('Vendor deactivated', 'success');
      Router.navigate('#/vendors');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
