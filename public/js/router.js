const Router = {
  routes: [],

  add(pattern, handler) {
    const paramNames = [];
    const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    this.routes.push({
      pattern,
      regex: new RegExp(`^${regexStr}$`),
      paramNames,
      handler
    });
  },

  navigate(hash) {
    window.location.hash = hash;
  },

  getParams() {
    return this._currentParams || {};
  },

  async resolve() {
    const hash = window.location.hash.slice(1) || '/dashboard';
    const path = hash.split('?')[0];

    for (const route of this.routes) {
      const match = path.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });
        this._currentParams = params;
        this.updateActiveNav(path);
        this.updateBreadcrumb(path);
        try {
          await route.handler(params);
        } catch (e) {
          console.error('Route handler error:', e);
          const main = document.getElementById('main-content');
          if (main) {
            main.innerHTML = `<div class="empty-state"><h2>Something went wrong</h2><p>${e.message}</p></div>`;
          }
        }
        lucide.createIcons();
        return;
      }
    }

    const main = document.getElementById('main-content');
    if (main) {
      main.innerHTML = '<div class="empty-state"><h2>Page Not Found</h2><p>The page you are looking for does not exist.</p><a href="#/dashboard" class="btn btn-primary">Go to Dashboard</a></div>';
    }
  },

  updateActiveNav(path) {
    const section = path.split('/')[1] || 'dashboard';
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.route === section);
    });
  },

  updateBreadcrumb(path) {
    const parts = path.split('/').filter(Boolean);
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;

    const crumbs = [];
    const labels = {
      dashboard: 'Dashboard',
      workorders: 'Work Orders',
      properties: 'Properties',
      assets: 'Assets',
      preventive: 'Schedules',
      parts: 'Parts & Inventory',
      procedures: 'Checklists',
      messages: 'Messages',
      requests: 'Work Requests',
      teams: 'Teams',
      settings: 'Settings',
      invoices: 'Invoices',
      projects: 'Projects & Bids',
      integrations: 'Integrations',
      users: 'User Management',
      audit: 'Audit Log',
      reviews: 'Review Queue',
      approvals: 'Approvals',
      locations: 'Locations',
      new: 'New'
    };

    let href = '#';
    parts.forEach((part, i) => {
      href += '/' + part;
      const label = labels[part] || (i > 0 && parts[i - 1] ? `Detail` : part);
      const isLast = i === parts.length - 1;
      if (isLast) {
        crumbs.push(`<span class="breadcrumb-current">${label}</span>`);
      } else {
        crumbs.push(`<a href="${href}" class="breadcrumb-link">${label}</a>`);
      }
    });

    breadcrumb.innerHTML = crumbs.join('<span class="breadcrumb-sep">/</span>');
  },

  init() {
    window.addEventListener('hashchange', () => this.resolve());
  }
};
