const Reports = {
  currentTab: 'work-orders',
  data: null,

  async render() {
    const container = document.getElementById('main-content');
    container.innerHTML = `
      <div class="page-header">
        <h1>Reports & Analytics</h1>
        <button class="btn btn-secondary" onclick="Reports.exportCSV()">
          <i data-lucide="download"></i> Export CSV
        </button>
      </div>

      <div class="report-tabs">
        <button class="status-tab active" data-tab="work-orders" onclick="Reports.switchTab(this, 'work-orders')">Work Orders</button>
        <button class="status-tab" data-tab="assets" onclick="Reports.switchTab(this, 'assets')">Assets</button>
        <button class="status-tab" data-tab="teams" onclick="Reports.switchTab(this, 'teams')">Teams</button>
        <button class="status-tab" data-tab="parts" onclick="Reports.switchTab(this, 'parts')">Parts</button>
        <button class="status-tab" data-tab="preventive" onclick="Reports.switchTab(this, 'preventive')">PM Compliance</button>
      </div>

      <div class="report-filters" id="report-filters"></div>
      <div id="report-content">
        <div class="loading"><div class="spinner"></div><p>Loading report...</p></div>
      </div>
    `;
    lucide.createIcons();
    await this.loadTab('work-orders');
  },

  async switchTab(el, tab) {
    el.parentElement.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    this.currentTab = tab;
    await this.loadTab(tab);
  },

  async loadTab(tab) {
    const content = document.getElementById('report-content');
    const filters = document.getElementById('report-filters');
    content.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading report...</p></div>';

    try {
      switch (tab) {
        case 'work-orders': await this.loadWorkOrders(content, filters); break;
        case 'assets': await this.loadAssets(content, filters); break;
        case 'teams': await this.loadTeams(content, filters); break;
        case 'parts': await this.loadParts(content, filters); break;
        case 'preventive': await this.loadPreventive(content, filters); break;
      }
      lucide.createIcons();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><h2>Error loading report</h2><p>${e.message}</p></div>`;
    }
  },

  buildDateFilters(showProperty) {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startVal = thirtyDaysAgo.toISOString().split('T')[0];
    const endVal = today.toISOString().split('T')[0];

    return `
      <div class="filter-controls">
        <div class="form-group form-group-inline">
          <label>Start Date</label>
          <input type="date" id="report-start" class="form-control form-control-sm" value="${startVal}">
        </div>
        <div class="form-group form-group-inline">
          <label>End Date</label>
          <input type="date" id="report-end" class="form-control form-control-sm" value="${endVal}">
        </div>
        ${showProperty ? '<div class="form-group form-group-inline"><label>Property</label><select id="report-property" class="form-control form-control-sm"><option value="">All Properties</option></select></div>' : ''}
        <button class="btn btn-primary btn-sm" onclick="Reports.applyFilters()">Apply</button>
      </div>
    `;
  },

  async applyFilters() {
    await this.loadTab(this.currentTab);
  },

  getFilterParams() {
    const startEl = document.getElementById('report-start');
    const endEl = document.getElementById('report-end');
    const propEl = document.getElementById('report-property');
    const params = new URLSearchParams();
    if (startEl && startEl.value) params.set('start_date', startEl.value);
    if (endEl && endEl.value) params.set('end_date', endEl.value);
    if (propEl && propEl.value) params.set('property_id', propEl.value);
    return params.toString() ? '?' + params.toString() : '';
  },

  async loadProperties(selectEl) {
    if (!selectEl) return;
    try {
      const propData = await API.get('/properties');
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);
      properties.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        selectEl.appendChild(opt);
      });
    } catch (e) { /* ignore */ }
  },

  buildBarChart(items, colorClass) {
    if (!items || items.length === 0) return '<div class="empty-state-sm">No data available</div>';
    const maxVal = Math.max(...items.map(i => i.count || i.value || 0), 1);
    return `
      <div class="bar-chart">
        ${items.map(item => {
          const val = item.count || item.value || 0;
          const label = item.label || item.name || item.category || item.priority || item.status || item.frequency || 'Unknown';
          const barClass = colorClass || Reports.getBarColor(label);
          return `
            <div class="bar-row">
              <span class="bar-label">${label}</span>
              <div class="bar-track">
                <div class="bar-fill ${barClass}" style="width: ${(val / maxVal) * 100}%"></div>
              </div>
              <span class="bar-value">${val}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  getBarColor(label) {
    const l = (label || '').toLowerCase();
    if (l === 'critical') return 'bar-critical';
    if (l === 'high') return 'bar-high';
    if (l === 'medium') return 'bar-medium';
    if (l === 'low') return 'bar-low';
    if (l === 'open') return 'bar-open';
    if (l === 'in_progress' || l === 'in progress') return 'bar-in-progress';
    if (l === 'on_hold' || l === 'on hold') return 'bar-on-hold';
    if (l === 'completed') return 'bar-completed';
    if (l === 'operational') return 'bar-completed';
    if (l === 'needs_repair' || l === 'needs repair') return 'bar-high';
    if (l === 'out_of_service' || l === 'out of service') return 'bar-critical';
    if (l === 'retired') return 'bar-on-hold';
    // Default colors cycle
    const colors = ['bar-open', 'bar-in-progress', 'bar-completed', 'bar-on-hold', 'bar-medium'];
    return colors[Math.abs(Reports.hashStr(l)) % colors.length];
  },

  hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
    return h;
  },

  // ============ WORK ORDERS REPORT ============
  async loadWorkOrders(content, filters) {
    filters.innerHTML = this.buildDateFilters(true);
    await this.loadProperties(document.getElementById('report-property'));

    const data = await API.get('/reports/work-orders' + this.getFilterParams());
    this.data = data;

    const priorityItems = (data.by_priority || []).map(r => ({ label: r.priority, count: r.count }));
    const categoryItems = (data.by_category || []).map(r => ({ label: r.category, count: r.count }));
    const propertyItems = (data.by_property || []).map(r => ({ label: r.property_name || 'Unassigned', count: r.count }));

    content.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background: #DBEAFE; color: #1E40AF;"><i data-lucide="clipboard-list"></i></div>
          <div class="stat-info"><div class="stat-value">${data.total}</div><div class="stat-label">Total Work Orders</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: #D1FAE5; color: #059669;"><i data-lucide="check-circle-2"></i></div>
          <div class="stat-info"><div class="stat-value">${data.completed}</div><div class="stat-label">Completed</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: #FEF3C7; color: #D97706;"><i data-lucide="clock"></i></div>
          <div class="stat-info"><div class="stat-value">${data.avg_completion_time_hours}h</div><div class="stat-label">Avg Completion Time</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: #E0E7FF; color: #4F46E5;"><i data-lucide="percent"></i></div>
          <div class="stat-info"><div class="stat-value">${data.completion_rate}%</div><div class="stat-label">Completion Rate</div></div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header"><h3>By Priority</h3></div>
          <div class="card-body">${this.buildBarChart(priorityItems)}</div>
        </div>
        <div class="card">
          <div class="card-header"><h3>By Category</h3></div>
          <div class="card-body">${this.buildBarChart(categoryItems)}</div>
        </div>
        <div class="card card-full">
          <div class="card-header"><h3>By Property</h3></div>
          <div class="card-body">${this.buildBarChart(propertyItems)}</div>
        </div>
      </div>
    `;
  },

  // ============ ASSETS REPORT ============
  async loadAssets(content, filters) {
    filters.innerHTML = `
      <div class="filter-controls">
        <div class="form-group form-group-inline">
          <label>Property</label>
          <select id="report-property" class="form-control form-control-sm"><option value="">All Properties</option></select>
        </div>
        <button class="btn btn-primary btn-sm" onclick="Reports.applyFilters()">Apply</button>
      </div>
    `;
    await this.loadProperties(document.getElementById('report-property'));

    const propEl = document.getElementById('report-property');
    const params = propEl && propEl.value ? `?property_id=${propEl.value}` : '';
    const data = await API.get('/reports/assets' + params);
    this.data = data;

    const statusItems = (data.by_status || []).map(r => ({ label: r.status, count: r.count }));
    const categoryItems = (data.by_category || []).map(r => ({ label: r.category, count: r.count }));

    content.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background: #DBEAFE; color: #1E40AF;"><i data-lucide="wrench"></i></div>
          <div class="stat-info"><div class="stat-value">${data.total_assets}</div><div class="stat-label">Total Assets</div></div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header"><h3>By Status</h3></div>
          <div class="card-body">${this.buildBarChart(statusItems)}</div>
        </div>
        <div class="card">
          <div class="card-header"><h3>By Category</h3></div>
          <div class="card-body">${this.buildBarChart(categoryItems)}</div>
        </div>
        <div class="card card-full">
          <div class="card-header"><h3>Assets with Most Work Orders</h3></div>
          <div class="card-body">
            ${(data.assets_with_most_work_orders || []).length === 0 ? '<div class="empty-state-sm">No data</div>' : `
              <table class="table">
                <thead>
                  <tr><th>Asset</th><th>Status</th><th>Work Orders</th></tr>
                </thead>
                <tbody>
                  ${data.assets_with_most_work_orders.map(a => `
                    <tr class="clickable-row" onclick="Router.navigate('#/assets/${a.id}')">
                      <td><strong>${a.name}</strong></td>
                      <td><span class="badge badge-status-${(a.status || '').replace(/\s+/g, '_')}">${a.status}</span></td>
                      <td>${a.work_order_count}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        </div>
      </div>
    `;
  },

  // ============ TEAMS REPORT ============
  async loadTeams(content, filters) {
    filters.innerHTML = '';
    const data = await API.get('/reports/teams');
    this.data = data;

    const teams = data.teams || [];

    content.innerHTML = `
      <div class="card">
        <div class="card-header"><h3>Team Performance</h3></div>
        <div class="card-body">
          ${teams.length === 0 ? '<div class="empty-state-sm">No teams found</div>' : `
            <table class="table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Assigned</th>
                  <th>Completed</th>
                  <th>Completion Rate</th>
                  <th>Avg Completion (hrs)</th>
                </tr>
              </thead>
              <tbody>
                ${teams.map(t => `
                  <tr class="clickable-row" onclick="Router.navigate('#/teams/${t.id}')">
                    <td><strong>${t.name}</strong></td>
                    <td>${t.work_orders_assigned}</td>
                    <td>${t.completed}</td>
                    <td>
                      <div class="progress-inline">
                        <div class="progress-bar-inline" style="width: ${t.completion_rate}%"></div>
                        <span>${t.completion_rate}%</span>
                      </div>
                    </td>
                    <td>${t.avg_completion_hours}h</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header"><h3>Work Orders by Team</h3></div>
          <div class="card-body">
            ${this.buildBarChart(teams.map(t => ({ label: t.name, count: t.work_orders_assigned })))}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Completion Rate by Team</h3></div>
          <div class="card-body">
            ${this.buildBarChart(teams.map(t => ({ label: t.name, count: t.completion_rate })), 'bar-completed')}
          </div>
        </div>
      </div>
    `;
  },

  // ============ PARTS REPORT ============
  async loadParts(content, filters) {
    filters.innerHTML = '';
    const data = await API.get('/reports/parts');
    this.data = data;

    const categoryItems = (data.by_category || []).map(r => ({ label: r.category, count: r.count }));

    content.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background: #DBEAFE; color: #1E40AF;"><i data-lucide="package"></i></div>
          <div class="stat-info"><div class="stat-value">${data.total_parts}</div><div class="stat-label">Total Parts</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: #D1FAE5; color: #059669;"><i data-lucide="dollar-sign"></i></div>
          <div class="stat-info"><div class="stat-value">$${(data.total_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div><div class="stat-label">Total Inventory Value</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: #FEE2E2; color: #DC2626;"><i data-lucide="alert-triangle"></i></div>
          <div class="stat-info"><div class="stat-value">${data.low_stock_count}</div><div class="stat-label">Low Stock Items</div></div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header"><h3>Parts by Category</h3></div>
          <div class="card-body">${this.buildBarChart(categoryItems)}</div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Category Value</h3></div>
          <div class="card-body">
            ${(data.by_category || []).length === 0 ? '<div class="empty-state-sm">No data</div>' : `
              <table class="table">
                <thead><tr><th>Category</th><th>Count</th><th>Value</th></tr></thead>
                <tbody>
                  ${(data.by_category || []).map(c => `
                    <tr>
                      <td><strong>${c.category}</strong></td>
                      <td>${c.count}</td>
                      <td>$${(c.category_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        </div>
      </div>
    `;
  },

  // ============ PREVENTIVE REPORT ============
  async loadPreventive(content, filters) {
    filters.innerHTML = this.buildDateFilters(false);
    const data = await API.get('/reports/preventive' + this.getFilterParams());
    this.data = data;

    const freqItems = (data.by_frequency || []).map(r => ({ label: r.frequency, count: r.count }));

    content.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background: #DBEAFE; color: #1E40AF;"><i data-lucide="calendar-clock"></i></div>
          <div class="stat-info"><div class="stat-value">${data.total_schedules}</div><div class="stat-label">Total Schedules</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: #D1FAE5; color: #059669;"><i data-lucide="check-circle-2"></i></div>
          <div class="stat-info"><div class="stat-value">${data.active_schedules}</div><div class="stat-label">Active Schedules</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: #E0E7FF; color: #4F46E5;"><i data-lucide="shield-check"></i></div>
          <div class="stat-info"><div class="stat-value">${data.compliance_rate}%</div><div class="stat-label">Compliance Rate</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: #FEE2E2; color: #DC2626;"><i data-lucide="alert-triangle"></i></div>
          <div class="stat-info"><div class="stat-value">${data.overdue_count}</div><div class="stat-label">Overdue</div></div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card card-full">
          <div class="card-header"><h3>Schedules by Frequency</h3></div>
          <div class="card-body">${this.buildBarChart(freqItems)}</div>
        </div>
      </div>
    `;
  },

  // ============ CSV EXPORT ============
  exportCSV() {
    if (!this.data) {
      App.toast('No data to export', 'warning');
      return;
    }

    let csv = '';
    const tab = this.currentTab;

    if (tab === 'work-orders') {
      csv = 'Metric,Value\n';
      csv += `Total Work Orders,${this.data.total}\n`;
      csv += `Completed,${this.data.completed}\n`;
      csv += `Completion Rate,${this.data.completion_rate}%\n`;
      csv += `Avg Completion Time (hrs),${this.data.avg_completion_time_hours}\n`;
      csv += '\nBy Priority\nPriority,Count\n';
      (this.data.by_priority || []).forEach(r => { csv += `${r.priority},${r.count}\n`; });
      csv += '\nBy Category\nCategory,Count\n';
      (this.data.by_category || []).forEach(r => { csv += `${r.category},${r.count}\n`; });
      csv += '\nBy Property\nProperty,Count\n';
      (this.data.by_property || []).forEach(r => { csv += `"${r.property_name || 'Unassigned'}",${r.count}\n`; });
    } else if (tab === 'assets') {
      csv = 'Metric,Value\n';
      csv += `Total Assets,${this.data.total_assets}\n`;
      csv += '\nBy Status\nStatus,Count\n';
      (this.data.by_status || []).forEach(r => { csv += `${r.status},${r.count}\n`; });
      csv += '\nBy Category\nCategory,Count\n';
      (this.data.by_category || []).forEach(r => { csv += `${r.category},${r.count}\n`; });
      csv += '\nTop Assets by Work Orders\nAsset,Status,Work Orders\n';
      (this.data.assets_with_most_work_orders || []).forEach(a => { csv += `"${a.name}",${a.status},${a.work_order_count}\n`; });
    } else if (tab === 'teams') {
      csv = 'Team,Assigned,Completed,Completion Rate,Avg Hours\n';
      (this.data.teams || []).forEach(t => {
        csv += `"${t.name}",${t.work_orders_assigned},${t.completed},${t.completion_rate}%,${t.avg_completion_hours}\n`;
      });
    } else if (tab === 'parts') {
      csv = 'Metric,Value\n';
      csv += `Total Parts,${this.data.total_parts}\n`;
      csv += `Total Value,$${this.data.total_value}\n`;
      csv += `Low Stock,${this.data.low_stock_count}\n`;
      csv += '\nBy Category\nCategory,Count,Value\n';
      (this.data.by_category || []).forEach(c => { csv += `"${c.category}",${c.count},${c.category_value || 0}\n`; });
    } else if (tab === 'preventive') {
      csv = 'Metric,Value\n';
      csv += `Total Schedules,${this.data.total_schedules}\n`;
      csv += `Active,${this.data.active_schedules}\n`;
      csv += `Compliance Rate,${this.data.compliance_rate}%\n`;
      csv += `Overdue,${this.data.overdue_count}\n`;
      csv += '\nBy Frequency\nFrequency,Count\n';
      (this.data.by_frequency || []).forEach(r => { csv += `${r.frequency},${r.count}\n`; });
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${tab}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    App.toast('Report exported', 'success');
  }
};
