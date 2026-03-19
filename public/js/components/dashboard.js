const Dashboard = {
  async render() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading dashboard...</p></div>';

    try {
      const [stats, workorders, preventive, parts, onboardingStatus] = await Promise.all([
        API.get('/dashboard').catch(() => null),
        API.get('/workorders?limit=10').catch(() => []),
        API.get('/preventive?upcoming=7').catch(() => []),
        API.get('/parts?low_stock=true').catch(() => []),
        API.get('/onboarding/status').catch(() => null)
      ]);

      const s = stats || { totalProperties: 0, openWorkOrders: 0, overdueWorkOrders: 0, completedThisMonth: 0, workOrdersByPriority: {}, workOrdersByStatus: {} };
      const woList = Array.isArray(workorders) ? workorders : (workorders.data || workorders.workorders || []);
      const pmList = Array.isArray(preventive) ? preventive : (preventive.data || preventive.schedules || []);
      const partsList = Array.isArray(parts) ? parts : (parts.data || parts.parts || []);

      const byPriority = s.workOrdersByPriority || {};
      const byStatus = s.workOrdersByStatus || {};
      const maxPriority = Math.max(byPriority.critical || 0, byPriority.high || 0, byPriority.medium || 0, byPriority.low || 0, 1);
      const maxStatus = Math.max(byStatus.open || 0, byStatus.in_progress || 0, byStatus.on_hold || 0, byStatus.completed || 0, 1);

      container.innerHTML = `
        ${this.renderSetupChecklist(onboardingStatus)}
        ${this.renderWelcomeBack(s)}
        ${this.renderNextSteps(onboardingStatus)}
        <div class="page-header">
          <h1>Dashboard</h1>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon" style="background: #DBEAFE; color: #1E40AF;">
              <i data-lucide="building-2"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value">${s.totalProperties || 0}</div>
              <div class="stat-label">Total Properties</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: #FEF3C7; color: #D97706;">
              <i data-lucide="clipboard-list"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value">${s.openWorkOrders || 0}</div>
              <div class="stat-label">Open Work Orders</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: #FEE2E2; color: #DC2626;">
              <i data-lucide="alert-triangle"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value">${s.overdueWorkOrders || 0}</div>
              <div class="stat-label">Overdue</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon" style="background: #D1FAE5; color: #059669;">
              <i data-lucide="check-circle-2"></i>
            </div>
            <div class="stat-info">
              <div class="stat-value">${s.completedThisMonth || 0}</div>
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
      this.animateStats();
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

  renderSetupChecklist(status) {
    if (!status || status.onboarding_completed === undefined) return '';
    const user = API.getUser();
    if (!user || user.role !== 'admin') return '';

    const cl = status.checklist || {};
    const items = [
      { key: 'properties', label: 'Add a property', desc: 'Create your first estate property', route: '#/properties/new', done: cl.properties > 0 },
      { key: 'assets', label: 'Add assets', desc: 'Track equipment and systems', route: '#/assets/new', done: cl.assets > 0 },
      { key: 'teams', label: 'Create a team', desc: 'Organize your maintenance staff', route: '#/teams/new', done: cl.teams > 0 },
      { key: 'members', label: 'Add team members', desc: 'Invite staff to collaborate', route: '#/teams', done: cl.members > 1 },
      { key: 'work_orders', label: 'Create a work order', desc: 'Track your first maintenance task', route: '#/workorders/new', done: cl.work_orders > 0 },
      { key: 'preventive', label: 'Set up preventive maintenance', desc: 'Schedule recurring tasks', route: '#/preventive/new', done: cl.preventive_schedules > 0 }
    ];

    const completed = items.filter(i => i.done).length;
    const total = items.length;
    const pct = Math.round((completed / total) * 100);

    // Don't show if all complete and dismissed
    if (completed === total) return '';
    if (localStorage.getItem('setup_checklist_dismissed')) return '';

    return `
      <div class="setup-checklist">
        <div class="setup-checklist-header">
          <div>
            <h3>Get Your Estate Set Up</h3>
            <p>${completed} of ${total} steps completed</p>
          </div>
          <button class="setup-checklist-dismiss" onclick="Dashboard.dismissChecklist()" title="Dismiss">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="setup-checklist-progress">
          <div class="setup-checklist-progress-bar" style="width: ${pct}%"></div>
        </div>
        <div class="setup-checklist-items">
          ${items.map(i => `
            <a href="${i.route}" class="setup-checklist-item ${i.done ? 'completed' : ''}">
              <div class="setup-item-check">
                <i data-lucide="check"></i>
              </div>
              <div class="setup-item-text">
                <strong>${i.label}</strong>
                <span>${i.desc}</span>
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  },

  dismissChecklist() {
    localStorage.setItem('setup_checklist_dismissed', '1');
    const el = document.querySelector('.setup-checklist');
    if (el) {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-10px)';
      setTimeout(() => el.remove(), 300);
    }
  },

  renderNextSteps(status) {
    if (!status) return '';
    const cl = status.checklist || {};
    const user = API.getUser();
    const role = user?.role || 'technician';

    const suggestions = [];

    if (role === 'admin' || role === 'manager') {
      if (cl.properties === 0) {
        suggestions.push({ icon: 'building-2', color: '#8B5CF6', title: 'Add Your First Property', desc: 'Properties are the foundation — start by adding a residence or building.', route: '#/properties/new' });
      }
      if (cl.properties > 0 && cl.assets === 0) {
        suggestions.push({ icon: 'wrench', color: '#3B82F6', title: 'Register Your Assets', desc: 'Track equipment and systems so you can schedule maintenance.', route: '#/assets/new' });
      }
      if (cl.properties > 0 && cl.preventive_schedules === 0) {
        suggestions.push({ icon: 'calendar-clock', color: '#10B981', title: 'Set Up Preventive Maintenance', desc: 'Schedule recurring tasks so nothing falls through the cracks.', route: '#/preventive/new' });
      }
      if (cl.teams === 0) {
        suggestions.push({ icon: 'users', color: '#F59E0B', title: 'Create a Team', desc: 'Organize your staff by specialty for efficient task assignment.', route: '#/teams/new' });
      }
      if (cl.vendors === 0) {
        suggestions.push({ icon: 'truck', color: '#EC4899', title: 'Add Your Vendors', desc: 'Keep a directory of suppliers for easy procurement.', route: '#/vendors/new' });
      }
      if (cl.work_orders === 0 && cl.properties > 0) {
        suggestions.push({ icon: 'clipboard-list', color: '#EF4444', title: 'Create a Work Order', desc: 'Start tracking your first maintenance task.', route: '#/workorders/new' });
      }
    }

    // Don't show if nothing to suggest or too many things already set up
    if (suggestions.length === 0) return '';

    // Show max 3
    const shown = suggestions.slice(0, 3);

    return `
      <div class="next-steps-section">
        <h3 class="next-steps-title"><i data-lucide="lightbulb"></i> Suggested Next Steps</h3>
        <div class="next-steps-grid">
          ${shown.map(s => `
            <a href="${s.route}" class="next-step-card">
              <div class="next-step-icon" style="background: ${s.color}12; color: ${s.color}">
                <i data-lucide="${s.icon}"></i>
              </div>
              <div class="next-step-text">
                <strong>${s.title}</strong>
                <span>${s.desc}</span>
              </div>
              <i data-lucide="arrow-right" class="next-step-arrow"></i>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  },

  renderWelcomeBack(stats) {
    const user = API.getUser();
    if (!user) return '';

    // Only show if user has completed onboarding and there's activity
    const s = stats || {};
    const hasActivity = (s.openWorkOrders || 0) > 0 || (s.overdueWorkOrders || 0) > 0;
    if (!hasActivity) return '';

    // Don't show if dismissed today
    const dismissKey = 'welcome_back_' + new Date().toISOString().split('T')[0];
    if (localStorage.getItem(dismissKey)) return '';

    const firstName = (user.name || 'there').split(' ')[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const alerts = [];
    if (s.overdueWorkOrders > 0) alerts.push(`<span class="wb-alert wb-alert-danger"><i data-lucide="alert-triangle"></i> ${s.overdueWorkOrders} overdue</span>`);
    if (s.openWorkOrders > 0) alerts.push(`<span class="wb-alert wb-alert-info"><i data-lucide="clipboard-list"></i> ${s.openWorkOrders} open work orders</span>`);

    return `
      <div class="welcome-back-card" id="welcome-back">
        <div class="wb-content">
          <div class="wb-greeting">
            <strong>${greeting}, ${firstName}</strong>
            <span>Here's what needs your attention today</span>
          </div>
          <div class="wb-alerts">${alerts.join('')}</div>
        </div>
        <button class="wb-dismiss" onclick="Dashboard.dismissWelcomeBack()" title="Dismiss">
          <i data-lucide="x"></i>
        </button>
      </div>
    `;
  },

  dismissWelcomeBack() {
    const dismissKey = 'welcome_back_' + new Date().toISOString().split('T')[0];
    localStorage.setItem(dismissKey, '1');
    const el = document.getElementById('welcome-back');
    if (el) {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-10px)';
      setTimeout(() => el.remove(), 300);
    }
  },

  animateStats() {
    document.querySelectorAll('.stat-value').forEach(el => {
      const target = parseInt(el.textContent) || 0;
      if (target === 0) return;

      el.textContent = '0';
      const duration = 800;
      const start = performance.now();

      function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased);
        if (progress < 1) requestAnimationFrame(update);
      }
      requestAnimationFrame(update);
    });
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
