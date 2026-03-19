const LocationDetail = {
  async render(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const location = await API.get(`/locations/${params.id}`);
      const assets = location.assets || [];
      const procedures = location.procedures || [];
      const workOrders = location.work_orders || [];
      const children = location.children || [];
      const breadcrumb = location.breadcrumb || [];

      // Get property name from breadcrumb or parent
      let propertyName = '';
      if (location.property_id) {
        try {
          const prop = await API.get(`/properties/${location.property_id}`);
          propertyName = prop.name;
        } catch {}
      }

      const breadcrumbHtml = breadcrumb.length > 0
        ? breadcrumb.map(b => `<a href="#/locations/${b.id}">${b.name}</a>`).join(' <span style="color:var(--text-light);margin:0 4px">/</span> ')
        : '';

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/properties/${location.property_id}')">
              <i data-lucide="arrow-left"></i> Back to Property
            </button>
            <h1>${location.name}</h1>
          </div>
          <div class="page-header-actions">
            ${typeof QRCodes !== 'undefined' ? QRCodes.button('location', params.id, location.name, propertyName) : ''}
          </div>
        </div>

        ${breadcrumbHtml ? `
          <div style="margin-bottom:16px;font-size:13px;color:var(--text-muted)">
            ${propertyName ? `<a href="#/properties/${location.property_id}">${propertyName}</a> <span style="color:var(--text-light);margin:0 4px">/</span> ` : ''}
            ${breadcrumbHtml}
          </div>
        ` : ''}

        ${location.description ? `<p style="color:var(--text-muted);margin-bottom:20px">${location.description}</p>` : ''}

        <!-- Quick stats -->
        <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
          <div class="prop-stat" style="min-width:100px">
            <div class="prop-stat-value">${assets.length}</div>
            <div class="prop-stat-label">Assets Here</div>
          </div>
          <div class="prop-stat" style="min-width:100px">
            <div class="prop-stat-value">${procedures.length}</div>
            <div class="prop-stat-label">Procedures</div>
          </div>
          <div class="prop-stat" style="min-width:100px">
            <div class="prop-stat-value">${workOrders.filter(wo => ['open','in_progress'].includes(wo.status)).length}</div>
            <div class="prop-stat-label">Active WOs</div>
          </div>
          ${children.length > 0 ? `
            <div class="prop-stat" style="min-width:100px">
              <div class="prop-stat-value">${children.length}</div>
              <div class="prop-stat-label">Sub-Locations</div>
            </div>
          ` : ''}
        </div>

        <!-- Procedures Section (Primary - this is why you scan the QR) -->
        ${procedures.length > 0 ? `
          <div class="card" style="border:2px solid var(--primary-lighter);margin-bottom:16px">
            <div class="card-header" style="background:var(--primary-lighter)">
              <h3 style="color:var(--primary)"><i data-lucide="clipboard-check" style="width:18px;height:18px;vertical-align:middle"></i> Procedures for This Location</h3>
            </div>
            <div class="card-body">
              <div class="location-procedures-grid">
                ${procedures.map(p => `
                  <div class="location-procedure-card" onclick="Router.navigate('#/procedures/${p.id}')">
                    <div class="location-procedure-icon">
                      <i data-lucide="clipboard-check"></i>
                    </div>
                    <div class="location-procedure-info">
                      <strong>${p.title}</strong>
                      ${p.description ? `<span>${p.description}</span>` : ''}
                      <span class="text-muted" style="font-size:11px">${p.step_count || 0} steps ${p.category ? '· ' + p.category : ''}</span>
                    </div>
                    <i data-lucide="chevron-right" style="color:var(--text-light);width:18px;height:18px;flex-shrink:0"></i>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        ` : `
          <div class="card" style="margin-bottom:16px">
            <div class="card-header">
              <h3>Procedures</h3>
              <button class="btn btn-sm btn-primary" onclick="LocationDetail.showLinkProcedure('${params.id}')">
                <i data-lucide="plus"></i> Link Procedure
              </button>
            </div>
            <div class="card-body">
              <div class="empty-state-sm">No procedures linked to this location. Link a procedure so staff can scan and start a checklist here.</div>
            </div>
          </div>
        `}

        ${procedures.length > 0 ? `
          <div style="margin-bottom:16px;text-align:right">
            <button class="btn btn-sm btn-secondary" onclick="LocationDetail.showLinkProcedure('${params.id}')">
              <i data-lucide="plus"></i> Link Another Procedure
            </button>
          </div>
        ` : ''}

        <!-- Assets Section -->
        <div class="card" style="margin-bottom:16px">
          <div class="card-header">
            <h3>Assets at This Location</h3>
          </div>
          <div class="card-body">
            ${assets.length === 0 ? '<div class="empty-state-sm">No assets at this location</div>' : `
              <table class="table">
                <thead><tr><th>Name</th><th>Category</th><th>Status</th></tr></thead>
                <tbody>
                  ${assets.map(a => `
                    <tr class="clickable-row" onclick="Router.navigate('#/assets/${a.id}')">
                      <td><strong>${a.name}</strong></td>
                      <td>${a.category || '-'}</td>
                      <td><span class="badge badge-asset-${(a.status || 'operational').replace(/\\s+/g, '_')}">${(a.status || 'operational').replace(/_/g, ' ')}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        </div>

        <!-- Recent Work Orders -->
        ${workOrders.length > 0 ? `
          <div class="card" style="margin-bottom:16px">
            <div class="card-header"><h3>Recent Work Orders</h3></div>
            <div class="card-body">
              <table class="table">
                <thead><tr><th>Title</th><th>Asset</th><th>Priority</th><th>Status</th></tr></thead>
                <tbody>
                  ${workOrders.slice(0, 5).map(wo => `
                    <tr class="clickable-row" onclick="Router.navigate('#/workorders/${wo.id}')">
                      <td>${wo.title}</td>
                      <td>${wo.asset_name || '-'}</td>
                      <td><span class="badge badge-${wo.priority}">${wo.priority}</span></td>
                      <td><span class="badge badge-status-${(wo.status || '').replace(/\\s+/g, '_')}">${wo.status}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <!-- Child Locations -->
        ${children.length > 0 ? `
          <div class="card">
            <div class="card-header"><h3>Sub-Locations</h3></div>
            <div class="card-body">
              ${children.map(c => `
                <div class="prop-wo-item clickable-row" onclick="Router.navigate('#/locations/${c.id}')">
                  <div class="prop-wo-info">
                    <strong>${c.name}</strong>
                    ${c.description ? `<span class="text-muted" style="font-size:12px">${c.description}</span>` : ''}
                  </div>
                  <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text-light)"></i>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async showLinkProcedure(locationId) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Link Procedure to Location';
    modal.querySelector('.modal-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';

    try {
      const procData = await API.get('/procedures');
      const procedures = Array.isArray(procData) ? procData : (procData.data || procData.procedures || []);

      modal.querySelector('.modal-body').innerHTML = `
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Select a procedure to make available at this location. Staff will see it when they scan the QR code.</p>
        <div class="form-group">
          <label>Procedure</label>
          <select id="link-procedure-select" class="form-control">
            <option value="">Choose a procedure...</option>
            ${procedures.map(p => `<option value="${p.id}">${p.title}${p.category ? ' (' + p.category + ')' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Notes (optional)</label>
          <input type="text" id="link-procedure-notes" class="form-control" placeholder="e.g., Run this every morning">
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="LocationDetail.handleLinkProcedure('${locationId}')">Link Procedure</button>
        </div>
      `;
    } catch (e) {
      modal.querySelector('.modal-body').innerHTML = `<p class="text-danger">${e.message}</p>`;
    }
    lucide.createIcons();
  },

  async handleLinkProcedure(locationId) {
    const procedureId = document.getElementById('link-procedure-select').value;
    if (!procedureId) { App.toast('Select a procedure', 'error'); return; }
    const notes = document.getElementById('link-procedure-notes').value;

    try {
      await API.post(`/locations/${locationId}/procedures`, { procedure_id: parseInt(procedureId), notes: notes || null });
      App.closeModal();
      App.toast('Procedure linked', 'success');
      LocationDetail.render({ id: locationId });
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
