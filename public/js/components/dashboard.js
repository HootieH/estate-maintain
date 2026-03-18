const Dashboard = {
  async render() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading dashboard...</p></div>';

    try {
      const [stats, workorders, preventive, parts] = await Promise.all([
        API.get('/dashboard/stats').catch(() => null),
        API.get('/workorders?limit=10').catch(() => []),
        API.get('/preventive?upcoming=7').catch(() => []),
        API.get('/parts?low_stock=true').catch(() => [])
      ]);

      const s = stats || { total_properties: 0, open_workorders: 0, overdue_workorders: 0, completed_this_month: 0, by_priority: {}, by_status: {} };
      const woList = Array.isArray(workorders) ? workorders : (workorders.data || workorders.workorders || []);
      const pmList = Array.isArray(preventive) ? preventive : (preventive.data || preventive.schedules || []);
      const partsList = Array.isArray(parts) ? parts : (parts.data || parts.parts || []);

      const byPriority = s.by_priority || {};
      const byStatus = s.by_status || {};
      const maxPriority = Math.max(byPriority.critical || 0, byPriority.high || 0, byPriority.medium || 0, byPriority.low || 0, 1);
      const maxStatus = Math.max(byStatus.open || 0, byStatus.in_progress || 0, byStatus.on_hold || 0, byStatus.completed || 0, 1);

      container.innerHTML = `
        <div class="page-header">
          <h1>Dashboard</h1>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon" style="background: #DBEAFE; color: #1E40AF;">
              <i data-lucide="building-2"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value">${s.total_properties || 0}</div>
              <div class="stat-label">Total Properties</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: #FEF3C7; color: #D97706;">
              <i data-lucide="clipboard-list"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value">${s.open_workorders || 0}</div>
              <div class="stat-label">Open Work Orders</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: #FEE2E2; color: #DC2626;">
              <i data-lucide="alert-triangle"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value">${s.overdue_workorders || 0}</div>
              <div class="stat-label">Overdue</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: #D1FAE5; color: #059669;">
              <i data-lucide="check-circle-2"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value">${s.completed_this_month || 0}</div>
              <div class="stat-label">Completed This Month</div>
            </div>
          </div>
        </div>

        <div class="dashboard-grid">
          <div class="card">
            <div class="card-header">
              <h3>Work Orders by Priority</h3>
            </div>
            <div class="card-body">
              <div class="bar-chart">
                <div class="bar-row">
                  <span class="bar-label">Critical</span>
                  <div class="bar-track">
                    <div class="bar-fill bar-critical" style="width: ${((byPriority.critical || 0) / maxPriority) * 100}%"></div>
                  </div>
                  <span class="bar-value">${byPriority.critical || 0}</span>
                </div>
                <div class="bar-row">
                  <span class="bar-label">High</span>
                  <div class="bar-track">
                    <div class="bar-fill bar-high" style="width: ${((byPriority.high || 0) / maxPriority) * 100}%"></div>
                  </div>
                  <span class="bar-value">${byPriority.high || 0}</span>
                </div>
                <div class="bar-row">
                  <span class="bar-label">Medium</span>
                  <div class="bar-track">
                    <div class="bar-fill bar-medium" style="width: ${((byPriority.medium || 0) / maxPriority) * 100}%"></div>
                  </div>
                  <span class="bar-value">${byPriority.medium || 0}</span>
                </div>
                <div class="bar-row">
                  <span class="bar-label">Low</span>
                  <div class="bar-track">
                    <div class="bar-fill bar-low" style="width: ${((byPriority.low || 0) / maxPriority) * 100}%"></div>
                  </div>
                  <span class="bar-value">${byPriority.low || 0}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3>Work Orders by Status</h3>
            </div>
            <div class="card-body">
              <div class="bar-chart">
                <div class="bar-row">
                  <span class="bar-label">Open</span>
                  <div class="bar-track">
                    <div class="bar-fill bar-open" style="width: ${((byStatus.open || 0) / maxStatus) * 100}%"></div>
                  </div>
                  <span class="bar-value">${byStatus.open || 0}</span>
                </div>
                <div class="bar-row">
                  <span class="bar-label">In Progress</span>
                  <div class="bar-track">
                    <div class="bar-fill bar-in-progress" style="width: ${((byStatus.in_progress || 0) / maxStatus) * 100}%"></div>
                  </div>
                  <span class="bar-value">${byStatus.in_progress || 0}</span>
                </div>
                <div class="bar-row">
                  <span class="bar-label">On Hold</span>
                  <div class="bar-track">
                    <div class="bar-fill bar-on-hold" style="width: ${((byStatus.on_hold || 0) / maxStatus) * 100}%"></div>
                  </div>
                  <span class="bar-value">${byStatus.on_hold || 0}</span>
                </div>
                <div class="bar-row">
                  <span class="bar-label">Completed</span>
                  <div class="bar-track">
                    <div class="bar-fill bar-completed" style="width: ${((byStatus.completed || 0) / maxStatus) * 100}%"></div>
                  </div>
                  <span class="bar-value">${byStatus.completed || 0}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3>Upcoming Preventive Maintenance</h3>
              <a href="#/preventive" class="btn btn-sm btn-secondary">View All</a>
            </div>
            <div class="card-body">
              ${pmList.length === 0 ? '<div class="empty-state-sm">No upcoming maintenance in the next 7 days</div>' : `
                <table class="table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Asset</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${pmList.slice(0, 5).map(pm => {
                      const dueClass = Dashboard.getDueClass(pm.next_due);
                      return `
                        <tr class="clickable-row" onclick="Router.navigate('#/preventive/${pm.id}')">
                          <td>${pm.title || pm.name || ''}</td>
                          <td>${pm.asset_name || ''}</td>
                          <td><span class="text-${dueClass}">${Dashboard.formatDate(pm.next_due)}</span></td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              `}
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3>Low Stock Alerts</h3>
              <a href="#/parts" class="btn btn-sm btn-secondary">View All</a>
            </div>
            <div class="card-body">
              ${partsList.length === 0 ? '<div class="empty-state-sm">All parts are sufficiently stocked</div>' : `
                <table class="table">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Qty</th>
                      <th>Min</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${partsList.slice(0, 5).map(p => `
                      <tr class="clickable-row ${p.quantity <= 0 ? 'row-critical' : 'row-warning'}" onclick="Router.navigate('#/parts/${p.id}')">
                        <td>${p.name}</td>
                        <td><strong>${p.quantity}</strong></td>
                        <td>${p.min_quantity}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `}
            </div>
          </div>

          <div class="card card-full">
            <div class="card-header">
              <h3>Recent Work Orders</h3>
              <a href="#/workorders" class="btn btn-sm btn-secondary">View All</a>
            </div>
            <div class="card-body">
              ${woList.length === 0 ? '<div class="empty-state-sm">No work orders yet. <a href="#/workorders/new">Create one</a></div>' : `
                <table class="table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Property</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${woList.slice(0, 10).map(wo => `
                      <tr class="clickable-row" onclick="Router.navigate('#/workorders/${wo.id}')">
                        <td>${wo.title}</td>
                        <td>${wo.property_name || ''}</td>
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
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><h2>Error loading dashboard</h2><p>${e.message}</p></div>`;
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
