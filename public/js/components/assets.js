const Assets = {
  _currentPage: 1,
  _pagination: null,

  async list(page) {
    this._currentPage = page || 1;
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading assets...</p></div>';

    try {
      const params = new URLSearchParams({ page: this._currentPage, limit: 25 });
      if (this._filterProp && this._filterProp !== 'all') params.set('property_id', this._filterProp);
      if (this._filterStatus && this._filterStatus !== 'all') params.set('status', this._filterStatus);

      const [assetData, propData] = await Promise.all([
        API.get(`/assets?${params.toString()}`),
        API.get('/properties').catch(() => [])
      ]);
      const { items: assets, pagination } = Pagination.extract(assetData, 'assets');
      this._pagination = pagination;
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);

      container.innerHTML = `
        <div class="page-header">
          <h1>Assets <span class="tip-trigger" data-tip="asset"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
          <button class="btn btn-secondary" onclick="QRCodes.printPropertyAssets(Assets._filterProp || '', 'All Properties')" title="Print QR Labels">
            <i data-lucide="qr-code"></i> Print QR Labels
          </button>
          <button class="btn btn-primary" onclick="Router.navigate('#/assets/new')">
            <i data-lucide="plus"></i> Add Asset
          </button>
        </div>

        <div class="filters-bar">
          <div class="filter-controls">
            <select class="form-control form-control-sm" id="asset-prop-filter" onchange="Assets.filterByProperty(this.value)">
              <option value="all">All Properties</option>
              ${properties.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
            <select class="form-control form-control-sm" id="asset-status-filter" onchange="Assets.filterByStatus(this.value)">
              <option value="all">All Statuses</option>
              <option value="operational">Operational</option>
              <option value="needs_repair">Needs Repair</option>
              <option value="out_of_service">Out of Service</option>
              <option value="retired">Retired</option>
            </select>
          </div>
        </div>

        <div class="card">
          <div class="card-body no-padding">
            <table class="table" id="assets-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Property</th>
                  <th>Status</th>
                  <th>Install Date</th>
                </tr>
              </thead>
              <tbody id="assets-tbody"></tbody>
            </table>
            <div id="assets-empty" class="empty-state" style="display:none">
              <i data-lucide="wrench" class="empty-icon"></i>
              <h2>No Assets</h2>
              <p>No assets match your filters.</p>
            </div>
            ${Pagination.render(pagination, 'Assets')}
          </div>
        </div>
      `;

      this._assets = assets;
      this._filterProp = this._filterProp || 'all';
      this._filterStatus = this._filterStatus || 'all';
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

  filterByProperty(val) {
    this._filterProp = val;
    this.list(1);
  },

  filterByStatus(val) {
    this._filterStatus = val;
    this.list(1);
  },

  applyFilters() {
    const filtered = (this._assets || []).filter(a => {
      if (this._filterProp !== 'all' && String(a.property_id) !== String(this._filterProp)) return false;
      if (this._filterStatus !== 'all' && a.status !== this._filterStatus) return false;
      return true;
    });

    const tbody = document.getElementById('assets-tbody');
    const empty = document.getElementById('assets-empty');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
    } else {
      if (empty) empty.style.display = 'none';
      tbody.innerHTML = filtered.map(a => `
        <tr class="clickable-row" onclick="Router.navigate('#/assets/${a.id}')">
          <td><strong>${a.name}</strong></td>
          <td>${a.category || '-'}</td>
          <td>${a.property_name || '-'}</td>
          <td><span class="badge badge-asset-${(a.status || 'operational').replace(/\s+/g, '_')}">${(a.status || 'operational').replace(/_/g, ' ')}</span></td>
          <td>${Dashboard.formatDate(a.install_date)}</td>
        </tr>
      `).join('');
    }
  },

  async detail(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const asset = await API.get(`/assets/${params.id}`);
      const [woData, metersData] = await Promise.all([
        API.get(`/workorders?asset_id=${params.id}`).catch(() => []),
        API.get(`/meters?asset_id=${params.id}`).catch(() => [])
      ]);
      const workorders = Array.isArray(woData) ? woData : (woData.data || woData.workorders || []);
      const meters = Array.isArray(metersData) ? metersData : [];

      // Build location breadcrumb if asset has a location_id
      let locationBreadcrumb = '';
      if (asset.location_id) {
        try {
          const loc = await API.get(`/locations/${asset.location_id}`);
          if (loc && loc.breadcrumb) {
            locationBreadcrumb = loc.breadcrumb.map(b => b.name).join(' > ');
          }
        } catch (e) { /* ignore */ }
      }

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/assets')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>${asset.name}</h1>
            <span class="badge badge-asset-${(asset.status || 'operational').replace(/\s+/g, '_')}">${(asset.status || 'operational').replace(/_/g, ' ')}</span>
            ${asset.criticality ? `<span class="badge badge-${asset.criticality === 'critical' ? 'critical' : asset.criticality === 'high' ? 'high' : 'medium'}">${asset.criticality} criticality</span>` : ''}
          </div>
          <div class="page-header-actions">
            ${QRCodes.button('asset', params.id, asset.name, asset.category + ' | ' + (asset.property_name || ''))}
            <button class="btn btn-secondary" onclick="Assets.edit('${params.id}')">
              <i data-lucide="edit"></i> Edit
            </button>
            <button class="btn btn-danger" onclick="Assets.remove('${params.id}')">
              <i data-lucide="trash-2"></i> Delete
            </button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="card">
            <div class="card-header"><h3>Asset Details</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field">
                  <label>Category</label>
                  <p>${asset.category || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Property</label>
                  <p>${asset.property_name ? `<a href="#/properties/${asset.property_id}">${asset.property_name}</a>` : '-'}</p>
                </div>
                ${locationBreadcrumb ? `
                <div class="detail-field">
                  <label>Location</label>
                  <p>${locationBreadcrumb}</p>
                </div>
                ` : ''}
                <div class="detail-field">
                  <label>Make / Model</label>
                  <p>${[asset.make, asset.model].filter(Boolean).join(' / ') || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Serial Number</label>
                  <p>${asset.serial_number || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Install Date</label>
                  <p>${Dashboard.formatDate(asset.install_date)}</p>
                </div>
                <div class="detail-field">
                  <label>Warranty Expiry</label>
                  <p>${Dashboard.formatDate(asset.warranty_expiry)}</p>
                </div>
                <div class="detail-field">
                  <label>Criticality</label>
                  <p>${asset.criticality || 'Not set'}</p>
                </div>
                <div class="detail-field">
                  <label>Replacement Cost</label>
                  <p>${asset.replacement_cost ? '$' + asset.replacement_cost.toLocaleString() : '-'}</p>
                </div>
                <div class="detail-field detail-field-full">
                  <label>Notes</label>
                  <p>${asset.notes || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3>Meters</h3>
            <button class="btn btn-primary btn-sm" onclick="Assets.showAddMeterModal('${params.id}')">
              <i data-lucide="plus"></i> Add Meter
            </button>
          </div>
          <div class="card-body">
            ${meters.length === 0 ? '<div class="empty-state-sm">No meters for this asset. Add one to track usage.</div>' : `
              <div id="meters-list">
                ${meters.map(m => `
                  <div class="meter-item" style="border:1px solid var(--border-color);border-radius:8px;padding:16px;margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                      <div>
                        <strong>${m.name}</strong>
                        <span class="text-muted" style="margin-left:8px;">${m.current_reading} ${m.unit}</span>
                      </div>
                      <div style="display:flex;gap:8px;">
                        <button class="btn btn-primary btn-sm" onclick="Assets.showRecordReadingModal('${m.id}', '${m.name}', '${m.unit}')">
                          Record Reading
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="Assets.toggleReadingHistory('${m.id}')">
                          <i data-lucide="history"></i> History
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="Assets.deleteMeter('${m.id}', '${params.id}')">
                          <i data-lucide="trash-2"></i>
                        </button>
                      </div>
                    </div>
                    <div id="meter-history-${m.id}" style="display:none;margin-top:12px;">
                      <div class="loading"><div class="spinner"></div></div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>

        <div class="card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3>Downtime</h3>
            ${asset.active_downtime ? `
              <button class="btn btn-success btn-sm" onclick="Assets.endDowntime('${params.id}')">
                <i data-lucide="play"></i> End Downtime
              </button>
            ` : `
              <button class="btn btn-danger btn-sm" onclick="Assets.startDowntime('${params.id}')">
                <i data-lucide="pause"></i> Record Downtime
              </button>
            `}
          </div>
          <div class="card-body">
            ${asset.active_downtime ? `
              <div style="padding:12px;background:var(--danger-bg);border-radius:8px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
                <i data-lucide="alert-circle" style="color:var(--danger);width:20px;height:20px"></i>
                <div>
                  <strong style="color:var(--danger)">Currently Down</strong>
                  <p style="margin:0;font-size:13px;color:var(--text-muted)">Since ${Dashboard.formatDate(asset.active_downtime.started_at)} ${asset.active_downtime.reason ? '— ' + asset.active_downtime.reason : ''}</p>
                </div>
              </div>
            ` : ''}
            <div id="downtime-history">
              <button class="btn btn-sm btn-secondary" onclick="Assets.loadDowntimeHistory('${params.id}')">
                <i data-lucide="history"></i> View History
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Related Work Orders</h3>
          </div>
          <div class="card-body">
            ${workorders.length === 0 ? '<div class="empty-state-sm">No work orders for this asset</div>' : `
              <table class="table">
                <thead>
                  <tr><th>Title</th><th>Priority</th><th>Status</th><th>Due Date</th></tr>
                </thead>
                <tbody>
                  ${workorders.map(wo => `
                    <tr class="clickable-row" onclick="Router.navigate('#/workorders/${wo.id}')">
                      <td>${wo.title}</td>
                      <td><span class="badge badge-${wo.priority}">${wo.priority}</span></td>
                      <td><span class="badge badge-status-${(wo.status || '').replace(/\s+/g, '_')}">${wo.status}</span></td>
                      <td>${Dashboard.formatDate(wo.due_date)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        </div>

        ${Attachments.placeholder('asset', params.id)}
      `;
      lucide.createIcons();
      Attachments.load('asset', params.id);
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  showAddMeterModal(assetId) {
    const overlay = document.getElementById('modal-overlay');
    overlay.querySelector('.modal-title').textContent = 'Add Meter';
    overlay.querySelector('.modal-body').innerHTML = `
      <form id="add-meter-form" onsubmit="Assets.handleAddMeter(event, '${assetId}')">
        <div class="form-group">
          <label for="meter-name">Meter Name *</label>
          <input type="text" id="meter-name" class="form-control" required placeholder="e.g., Run Hours">
        </div>
        <div class="form-group">
          <label for="meter-unit">Unit *</label>
          <select id="meter-unit" class="form-control" required>
            <option value="">Select unit...</option>
            <option value="hours">Hours</option>
            <option value="miles">Miles</option>
            <option value="km">Kilometers</option>
            <option value="cycles">Cycles</option>
            <option value="gallons">Gallons</option>
            <option value="liters">Liters</option>
            <option value="kwh">kWh</option>
          </select>
        </div>
        <div id="meter-form-error" class="form-error" style="display:none"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="meter-submit">Add Meter</button>
        </div>
      </form>
    `;
    overlay.querySelector('.modal-footer').innerHTML = '';
    overlay.style.display = 'flex';
    lucide.createIcons();
  },

  async handleAddMeter(e, assetId) {
    e.preventDefault();
    const btn = document.getElementById('meter-submit');
    const errorEl = document.getElementById('meter-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
      await API.post('/meters', {
        asset_id: parseInt(assetId),
        name: document.getElementById('meter-name').value,
        unit: document.getElementById('meter-unit').value
      });
      App.closeModal();
      App.toast('Meter added', 'success');
      Assets.detail({ id: assetId });
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add Meter';
    }
  },

  showRecordReadingModal(meterId, meterName, meterUnit) {
    const overlay = document.getElementById('modal-overlay');
    overlay.querySelector('.modal-title').textContent = `Record Reading - ${meterName}`;
    overlay.querySelector('.modal-body').innerHTML = `
      <form id="record-reading-form" onsubmit="Assets.handleRecordReading(event, '${meterId}')">
        <div class="form-group">
          <label for="reading-value">Value (${meterUnit}) *</label>
          <input type="number" id="reading-value" class="form-control" required step="any" placeholder="Enter current reading">
        </div>
        <div class="form-group">
          <label for="reading-notes">Notes</label>
          <textarea id="reading-notes" class="form-control" rows="3" placeholder="Optional notes..."></textarea>
        </div>
        <div id="reading-form-error" class="form-error" style="display:none"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="reading-submit">Record</button>
        </div>
      </form>
    `;
    overlay.querySelector('.modal-footer').innerHTML = '';
    overlay.style.display = 'flex';
    lucide.createIcons();
  },

  async handleRecordReading(e, meterId) {
    e.preventDefault();
    const btn = document.getElementById('reading-submit');
    const errorEl = document.getElementById('reading-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Recording...';

    try {
      const result = await API.post(`/meters/${meterId}/readings`, {
        value: parseFloat(document.getElementById('reading-value').value),
        notes: document.getElementById('reading-notes').value || null
      });
      App.closeModal();
      let msg = 'Reading recorded';
      if (result.triggered && result.triggered.length > 0) {
        msg += `. Triggered: ${result.triggered.join(', ')}`;
      }
      App.toast(msg, 'success');
      // Refresh the current page
      const hash = window.location.hash;
      const match = hash.match(/#\/assets\/(\d+)/);
      if (match) {
        Assets.detail({ id: match[1] });
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Record';
    }
  },

  async toggleReadingHistory(meterId) {
    const el = document.getElementById(`meter-history-${meterId}`);
    if (!el) return;

    if (el.style.display === 'none') {
      el.style.display = 'block';
      el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      try {
        const readings = await API.get(`/meters/${meterId}/readings`);
        const list = Array.isArray(readings) ? readings : [];
        if (list.length === 0) {
          el.innerHTML = '<div class="empty-state-sm">No readings recorded yet.</div>';
        } else {
          el.innerHTML = `
            <table class="table table-sm">
              <thead>
                <tr><th>Value</th><th>Recorded By</th><th>Date</th><th>Notes</th></tr>
              </thead>
              <tbody>
                ${list.map(r => `
                  <tr>
                    <td><strong>${r.value}</strong></td>
                    <td>${r.recorded_by_name || '-'}</td>
                    <td>${Dashboard.formatDate(r.recorded_at)}</td>
                    <td>${r.notes || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
        }
      } catch (err) {
        el.innerHTML = `<div class="error-state"><p>${err.message}</p></div>`;
      }
    } else {
      el.style.display = 'none';
    }
  },

  async deleteMeter(meterId, assetId) {
    if (!confirm('Delete this meter and all its readings?')) return;
    try {
      await API.delete(`/meters/${meterId}`);
      App.toast('Meter deleted', 'success');
      Assets.detail({ id: assetId });
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async startDowntime(assetId) {
    const reason = prompt('Reason for downtime:');
    if (reason === null) return;

    const category = 'breakdown';
    try {
      await API.post(`/assets/${assetId}/downtime`, { reason, category });
      App.toast('Downtime started', 'success');
      Assets.detail({ id: assetId });
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async endDowntime(assetId) {
    try {
      await API.put(`/assets/${assetId}/downtime/end`);
      App.toast('Downtime ended', 'success');
      Assets.detail({ id: assetId });
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async loadDowntimeHistory(assetId) {
    const el = document.getElementById('downtime-history');
    if (!el) return;
    el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const data = await API.get(`/assets/${assetId}/downtime`);
      if (!data.history || data.history.length === 0) {
        el.innerHTML = '<div class="empty-state-sm">No downtime recorded</div>';
        return;
      }

      el.innerHTML = `
        <div style="margin-bottom:8px;font-size:13px;color:var(--text-muted)">Total Downtime: <strong>${data.totalHours} hours</strong></div>
        <table class="table table-sm">
          <thead><tr><th>Started</th><th>Ended</th><th>Duration</th><th>Reason</th><th>Category</th></tr></thead>
          <tbody>
            ${data.history.map(d => {
              const start = new Date(d.started_at);
              const end = d.ended_at ? new Date(d.ended_at) : new Date();
              const hours = ((end - start) / (1000 * 60 * 60)).toFixed(1);
              return `
                <tr>
                  <td>${Dashboard.formatDate(d.started_at)}</td>
                  <td>${d.ended_at ? Dashboard.formatDate(d.ended_at) : '<span class="badge badge-critical">Active</span>'}</td>
                  <td>${hours}h</td>
                  <td>${d.reason || '-'}</td>
                  <td>${d.category || '-'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      el.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async form() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const propData = await API.get('/properties').catch(() => []);
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/assets')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>New Asset</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="asset-form" onsubmit="Assets.handleCreate(event)">
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-name">Name *</label>
                  <input type="text" id="asset-name" class="form-control" required placeholder="e.g., HVAC Unit #1">
                </div>
                <div class="form-group">
                  <label for="asset-category">Category</label>
                  <select id="asset-category" class="form-control">
                    <option value="">Select...</option>
                    <option value="HVAC">HVAC</option>
                    <option value="Plumbing">Plumbing</option>
                    <option value="Electrical">Electrical</option>
                    <option value="Appliance">Appliance</option>
                    <option value="Roofing">Roofing</option>
                    <option value="Landscaping">Landscaping</option>
                    <option value="Security">Security</option>
                    <option value="Pool">Pool</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-property">Property *</label>
                  <select id="asset-property" class="form-control" required onchange="Assets.loadLocationsForProperty(this.value)">
                    <option value="">Select property...</option>
                    ${properties.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="asset-location">Location</label>
                  <select id="asset-location" class="form-control">
                    <option value="">Select location...</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-status">Status</label>
                  <select id="asset-status" class="form-control">
                    <option value="operational">Operational</option>
                    <option value="needs_repair">Needs Repair</option>
                    <option value="out_of_service">Out of Service</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="asset-criticality">Criticality</label>
                  <select id="asset-criticality" class="form-control">
                    <option value="low">Low</option>
                    <option value="medium" selected>Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-make">Make</label>
                  <input type="text" id="asset-make" class="form-control" placeholder="Manufacturer">
                </div>
                <div class="form-group">
                  <label for="asset-model">Model</label>
                  <input type="text" id="asset-model" class="form-control" placeholder="Model number">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-serial">Serial Number</label>
                  <input type="text" id="asset-serial" class="form-control" placeholder="Serial number">
                </div>
                <div class="form-group">
                  <label for="asset-install">Install Date</label>
                  <input type="date" id="asset-install" class="form-control">
                </div>
              </div>
              <div class="form-group">
                <label for="asset-warranty">Warranty Expiry</label>
                <input type="date" id="asset-warranty" class="form-control">
              </div>
              <div class="form-group">
                <label for="asset-notes">Notes</label>
                <textarea id="asset-notes" class="form-control" rows="3" placeholder="Any additional notes..."></textarea>
              </div>
              <div id="asset-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/assets')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="asset-submit">Create Asset</button>
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

  async loadLocationsForProperty(propertyId) {
    const locationSelect = document.getElementById('asset-location');
    if (!locationSelect) return;
    locationSelect.innerHTML = '<option value="">Select location...</option>';
    if (!propertyId) return;

    try {
      const locations = await API.get(`/locations?property_id=${propertyId}`);
      const list = Array.isArray(locations) ? locations : [];
      // Build indented flat list from hierarchy
      const sorted = Assets._buildFlatLocationList(list);
      sorted.forEach(loc => {
        const indent = '\u00A0\u00A0'.repeat(loc._depth || 0);
        locationSelect.innerHTML += `<option value="${loc.id}">${indent}${loc.name}</option>`;
      });
    } catch (e) { /* ignore */ }
  },

  _buildFlatLocationList(locations) {
    const map = {};
    const roots = [];
    locations.forEach(loc => { map[loc.id] = { ...loc, _children: [] }; });
    locations.forEach(loc => {
      if (loc.parent_location_id && map[loc.parent_location_id]) {
        map[loc.parent_location_id]._children.push(map[loc.id]);
      } else {
        roots.push(map[loc.id]);
      }
    });
    const result = [];
    function walk(nodes, depth) {
      nodes.forEach(n => {
        result.push({ ...n, _depth: depth });
        walk(n._children, depth + 1);
      });
    }
    walk(roots, 0);
    return result;
  },

  async handleCreate(e) {
    e.preventDefault();
    const btn = document.getElementById('asset-submit');
    const errorEl = document.getElementById('asset-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const body = {
        name: document.getElementById('asset-name').value,
        category: document.getElementById('asset-category').value || null,
        property_id: document.getElementById('asset-property').value,
        location_id: document.getElementById('asset-location').value || null,
        status: document.getElementById('asset-status').value,
        criticality: document.getElementById('asset-criticality').value,
        make: document.getElementById('asset-make').value || null,
        model: document.getElementById('asset-model').value || null,
        serial_number: document.getElementById('asset-serial').value || null,
        install_date: document.getElementById('asset-install').value || null,
        warranty_expiry: document.getElementById('asset-warranty').value || null,
        notes: document.getElementById('asset-notes').value || null
      };
      const result = await API.post('/assets', body);
      App.toast('Asset created', 'success');
      Router.navigate(`#/assets/${result.id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Asset';
    }
  },

  async edit(id) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const [asset, propData] = await Promise.all([
        API.get(`/assets/${id}`),
        API.get('/properties').catch(() => [])
      ]);
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);

      // Load locations for the asset's property
      let locations = [];
      if (asset.property_id) {
        try {
          const locData = await API.get(`/locations?property_id=${asset.property_id}`);
          locations = Array.isArray(locData) ? locData : [];
        } catch (e) { /* ignore */ }
      }
      const flatLocations = Assets._buildFlatLocationList(locations);

      const categories = ['HVAC', 'Plumbing', 'Electrical', 'Appliance', 'Roofing', 'Landscaping', 'Security', 'Pool', 'Other'];

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/assets/${id}')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>Edit Asset</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="asset-edit-form" onsubmit="Assets.handleUpdate(event, '${id}')">
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-name">Name *</label>
                  <input type="text" id="asset-name" class="form-control" required value="${asset.name || ''}">
                </div>
                <div class="form-group">
                  <label for="asset-category">Category</label>
                  <select id="asset-category" class="form-control">
                    <option value="">Select...</option>
                    ${categories.map(c => `<option value="${c}" ${asset.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-property">Property *</label>
                  <select id="asset-property" class="form-control" required onchange="Assets.loadLocationsForProperty(this.value)">
                    <option value="">Select property...</option>
                    ${properties.map(p => `<option value="${p.id}" ${String(asset.property_id) === String(p.id) ? 'selected' : ''}>${p.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="asset-location">Location</label>
                  <select id="asset-location" class="form-control">
                    <option value="">Select location...</option>
                    ${flatLocations.map(loc => {
                      const indent = '\u00A0\u00A0'.repeat(loc._depth || 0);
                      return `<option value="${loc.id}" ${String(asset.location_id) === String(loc.id) ? 'selected' : ''}>${indent}${loc.name}</option>`;
                    }).join('')}
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-status">Status</label>
                  <select id="asset-status" class="form-control">
                    <option value="operational" ${asset.status === 'operational' ? 'selected' : ''}>Operational</option>
                    <option value="needs_repair" ${asset.status === 'needs_repair' ? 'selected' : ''}>Needs Repair</option>
                    <option value="out_of_service" ${asset.status === 'out_of_service' ? 'selected' : ''}>Out of Service</option>
                    <option value="retired" ${asset.status === 'retired' ? 'selected' : ''}>Retired</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-make">Make</label>
                  <input type="text" id="asset-make" class="form-control" value="${asset.make || ''}">
                </div>
                <div class="form-group">
                  <label for="asset-model">Model</label>
                  <input type="text" id="asset-model" class="form-control" value="${asset.model || ''}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="asset-serial">Serial Number</label>
                  <input type="text" id="asset-serial" class="form-control" value="${asset.serial_number || ''}">
                </div>
                <div class="form-group">
                  <label for="asset-install">Install Date</label>
                  <input type="date" id="asset-install" class="form-control" value="${asset.install_date ? asset.install_date.split('T')[0] : ''}">
                </div>
              </div>
              <div class="form-group">
                <label for="asset-warranty">Warranty Expiry</label>
                <input type="date" id="asset-warranty" class="form-control" value="${asset.warranty_expiry ? asset.warranty_expiry.split('T')[0] : ''}">
              </div>
              <div class="form-group">
                <label for="asset-notes">Notes</label>
                <textarea id="asset-notes" class="form-control" rows="3">${asset.notes || ''}</textarea>
              </div>
              <div id="asset-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/assets/${id}')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="asset-submit">Save Changes</button>
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
    const btn = document.getElementById('asset-submit');
    const errorEl = document.getElementById('asset-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const body = {
        name: document.getElementById('asset-name').value,
        category: document.getElementById('asset-category').value || null,
        property_id: document.getElementById('asset-property').value,
        location_id: document.getElementById('asset-location').value || null,
        status: document.getElementById('asset-status').value,
        make: document.getElementById('asset-make').value || null,
        model: document.getElementById('asset-model').value || null,
        serial_number: document.getElementById('asset-serial').value || null,
        install_date: document.getElementById('asset-install').value || null,
        warranty_expiry: document.getElementById('asset-warranty').value || null,
        notes: document.getElementById('asset-notes').value || null
      };
      await API.put(`/assets/${id}`, body);
      App.toast('Asset updated', 'success');
      Router.navigate(`#/assets/${id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  },

  async remove(id) {
    if (!confirm('Are you sure you want to delete this asset?')) return;
    try {
      await API.delete(`/assets/${id}`);
      App.toast('Asset deleted', 'success');
      Router.navigate('#/assets');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
