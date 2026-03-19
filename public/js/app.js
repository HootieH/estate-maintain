const App = {
  init() {
    this.initTheme();
    Router.add('/login', () => Login.render());
    Router.add('/dashboard', () => Dashboard.render());
    Router.add('/workorders', () => WorkOrders.list());
    Router.add('/workorders/new', () => WorkOrders.form());
    Router.add('/workorders/:id', (p) => WorkOrders.detail(p));
    Router.add('/properties', () => Properties.list());
    Router.add('/properties/new', () => Properties.form());
    Router.add('/properties/:id', (p) => Properties.detail(p));
    Router.add('/assets', () => Assets.list());
    Router.add('/assets/new', () => Assets.form());
    Router.add('/assets/:id', (p) => Assets.detail(p));
    Router.add('/preventive', () => Preventive.list());
    Router.add('/preventive/new', () => Preventive.form());
    Router.add('/preventive/:id', (p) => Preventive.detail(p));
    Router.add('/parts', () => Parts.list());
    Router.add('/parts/new', () => Parts.form());
    Router.add('/parts/:id', (p) => Parts.detail(p));
    Router.add('/teams', () => Teams.list());
    Router.add('/teams/new', () => Teams.form());
    Router.add('/teams/:id', (p) => Teams.detail(p));
    Router.add('/procedures', () => Procedures.list());
    Router.add('/procedures/new', () => Procedures.form());
    Router.add('/procedures/:id', (p) => Procedures.detail(p));
    Router.add('/messages', () => { Messages.cleanup(); Messages.render(); });
    Router.add('/messages/:type/:id', (p) => { Messages.cleanup(); Messages.openChannelDirect(p.type, p.id); });
    Router.add('/requests', () => Requests.list());
    Router.add('/requests/:id', (p) => Requests.detail(p));
    Router.add('/vendors', () => Vendors.list());
    Router.add('/vendors/new', () => Vendors.form());
    Router.add('/vendors/:id', (p) => Vendors.detail(p));
    Router.add('/purchaseorders', () => PurchaseOrders.list());
    Router.add('/purchaseorders/new', () => PurchaseOrders.form());
    Router.add('/purchaseorders/:id', (p) => PurchaseOrders.detail(p));
    Router.add('/reports', () => Reports.render());
    Router.add('/settings', () => Settings.render());
    Router.add('/invoices', () => Invoices.list());
    Router.add('/invoices/new', () => Invoices.form());
    Router.add('/invoices/:id', (p) => Invoices.detail(p));
    Router.add('/integrations', () => Integrations.render());
    Router.add('/projects', () => Projects.list());
    Router.add('/projects/new', () => Projects.form());
    Router.add('/projects/:id', (p) => Projects.detail(p));
    Router.add('/guide', () => Guide.render());

    Router.init();

    // Inject section banners and track visits on navigation
    window.addEventListener('hashchange', () => {
      const section = (window.location.hash.slice(2) || 'dashboard').split('/')[0];
      this.trackSectionVisit(section);
      // Inject banner after a short delay to let the route render
      setTimeout(() => {
        const container = document.getElementById('main-content');
        if (!container) return;
        const banner = this.getSectionBanner(section);
        if (banner) {
          const existing = document.getElementById('section-banner');
          if (existing) existing.remove();
          container.insertAdjacentHTML('afterbegin', banner);
          lucide.createIcons();
        }
      }, 100);
    });

    if (API.token) {
      this.showMain();
    } else {
      this.showLogin();
    }
  },

  showLogin() {
    document.getElementById('login-view').style.display = 'block';
    document.getElementById('main-view').style.display = 'none';
    Login.render();
    // Hide onboarding if showing
    const obOverlay = document.getElementById('onboarding-overlay');
    if (obOverlay) obOverlay.style.display = 'none';
  },

  showMain() {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('main-view').style.display = 'flex';
    this.updateSidebarUser();
    lucide.createIcons();

    if (!window.location.hash || window.location.hash === '#/login') {
      window.location.hash = '#/dashboard';
    } else {
      Router.resolve();
      // Track initial section visit
      const initialSection = (window.location.hash.slice(1) || '/dashboard').split('/')[1];
      this.trackSectionVisit(initialSection);
    }

    // Poll for unread messages every 30 seconds
    if (typeof Messages !== 'undefined') {
      Messages.updateUnreadBadge();
      this._unreadPollInterval = setInterval(() => {
        Messages.updateUnreadBadge();
      }, 30000);
    }

    // Update pending requests badge
    if (typeof Requests !== 'undefined') {
      Requests.updatePendingBadge();
    }

    // Initialize notifications polling
    if (typeof Notifications !== 'undefined') {
      Notifications.init();
    }

    // Check if onboarding needed for new users
    if (typeof Onboarding !== 'undefined') {
      Onboarding.check();
    }

    // Initialize sidebar discovery indicators
    this.updateSidebarDiscovery();
  },

  updateSidebarUser() {
    const user = API.getUser();
    if (!user) return;
    const nameEl = document.getElementById('sidebar-user-name');
    const emailEl = document.getElementById('sidebar-user-email');
    const avatarEl = document.getElementById('sidebar-avatar');
    if (nameEl) nameEl.textContent = user.name || 'User';
    if (emailEl) emailEl.textContent = user.email || '';
    if (avatarEl) {
      avatarEl.style.background = user.avatar_color || '#3B82F6';
      avatarEl.textContent = (user.name || 'U').charAt(0).toUpperCase();
    }
  },

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: 'check-circle-2', error: 'alert-circle', info: 'info', warning: 'alert-triangle' };
    toast.innerHTML = `<i data-lucide="${icons[type] || 'info'}"></i><span>${message}</span>`;
    container.appendChild(toast);
    lucide.createIcons({ nodes: [toast] });

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      toast.classList.remove('show');
      toast.addEventListener('transitionend', () => toast.remove());
    }, 3500);
  },

  trackSectionVisit(section) {
    if (!section || section === 'login') return;
    const visited = JSON.parse(localStorage.getItem('visited_sections') || '[]');
    if (!visited.includes(section)) {
      visited.push(section);
      localStorage.setItem('visited_sections', JSON.stringify(visited));
    }
    this.updateSidebarDiscovery();
  },

  updateSidebarDiscovery() {
    const visited = JSON.parse(localStorage.getItem('visited_sections') || '[]');
    const allSections = ['dashboard','workorders','requests','properties','assets','preventive',
                         'procedures','parts','vendors','purchaseorders','invoices','projects','messages','teams','reports','settings','integrations'];

    document.querySelectorAll('.nav-item').forEach(item => {
      const route = item.dataset.route;
      if (!route) return;
      if (!visited.includes(route) && route !== 'dashboard') {
        item.classList.add('nav-item-new');
      } else {
        item.classList.remove('nav-item-new');
      }
    });
  },

  getSectionBanner(section) {
    const bannerDismissed = JSON.parse(localStorage.getItem('dismissed_banners') || '[]');
    if (bannerDismissed.includes(section)) return '';

    const banners = {
      workorders: {
        icon: 'clipboard-list',
        title: 'Work Orders',
        text: 'The core of your maintenance operation. Every task lives here — whether created manually, generated from a preventive maintenance schedule, built from a template, or approved from a work request. Track assignments, priorities, parts used, time logged, and procedures.',
        color: '#3B82F6'
      },
      properties: {
        icon: 'building-2',
        title: 'Your Properties',
        text: 'Each property in your portfolio lives here. Add locations, link assets, and see all related work orders at a glance.',
        color: '#8B5CF6'
      },
      assets: {
        icon: 'wrench',
        title: 'Asset Registry',
        text: 'Every piece of equipment and system you maintain. Track make, model, warranty, and attach meters to monitor usage over time.',
        color: '#10B981'
      },
      preventive: {
        icon: 'calendar-clock',
        title: 'Preventive Maintenance',
        text: 'Schedule recurring maintenance BEFORE things break. Set frequencies from daily to annual — the system auto-creates work orders when tasks come due. Attach a procedure to each schedule so technicians always know exactly what steps to follow.',
        color: '#F59E0B'
      },
      parts: {
        icon: 'package',
        title: 'Parts & Inventory',
        text: 'Track spare parts and supplies across properties. Set minimum stock levels to catch shortages early, and reorder through purchase orders.',
        color: '#EF4444'
      },
      teams: {
        icon: 'users',
        title: 'Teams',
        text: 'Organize your maintenance staff by specialty. Assign properties and work to teams so the right people handle the right tasks.',
        color: '#6366F1'
      },
      vendors: {
        icon: 'truck',
        title: 'Vendor Directory',
        text: 'Your trusted suppliers and contractors. Track contact info, specialties, and link vendors to purchase orders for organized procurement.',
        color: '#EC4899'
      },
      purchaseorders: {
        icon: 'shopping-cart',
        title: 'Purchase Orders',
        text: 'Formalize your procurement process. Draft orders, route for approval, and when you receive goods, inventory updates automatically.',
        color: '#14B8A6'
      },
      invoices: {
        icon: 'receipt',
        title: 'Invoices',
        text: 'Track vendor invoices, match them to purchase orders with 3-way matching, and send approved invoices to Bill.com for payment. The bridge between receiving goods and paying vendors.',
        color: '#8B5CF6'
      },
      projects: {
        icon: 'briefcase',
        title: 'Projects & Competitive Bidding',
        text: 'Define a scope of work, collect bids from multiple vendors, level them side by side with category breakdowns, and award the winner. Awarding auto-creates a Purchase Order that flows through your normal procurement pipeline.',
        color: '#6366F1'
      },
      integrations: {
        icon: 'plug-zap',
        title: 'Integrations',
        text: 'Connect to Bill.com for vendor payments and QuickBooks for accounting. Configure credentials, sync GL accounts, and monitor sync activity.',
        color: '#10B981'
      },
      procedures: {
        icon: 'clipboard-check',
        title: 'Procedures',
        text: 'Procedures define HOW to do a task — step-by-step checklists that ensure consistent quality. Create procedure templates here, then attach them to work orders or preventive maintenance schedules. When a PM schedule fires, its procedure auto-attaches to the new work order.',
        color: '#F97316'
      },
      requests: {
        icon: 'inbox',
        title: 'Work Requests',
        text: 'This is your intake queue. Residents, tenants, and guests submit requests through a public form — no login needed. You review each request and either approve it (which creates a real work order) or decline it. Requests are NOT work orders until you approve them.',
        color: '#06B6D4'
      },
      messages: {
        icon: 'message-circle',
        title: 'Messages',
        text: 'Direct messages, team channels, and work order discussions — all in one place. Keep communication organized and in context.',
        color: '#8B5CF6'
      },
      reports: {
        icon: 'bar-chart-3',
        title: 'Reports & Analytics',
        text: 'Track completion rates, response times, costs, and team performance. Data-driven insights to optimize your maintenance operations.',
        color: '#10B981'
      }
    };

    const banner = banners[section];
    if (!banner) return '';

    return `
      <div class="section-intro-banner" id="section-banner" style="--banner-color: ${banner.color}">
        <div class="section-intro-icon" style="background: ${banner.color}15; color: ${banner.color}">
          <i data-lucide="${banner.icon}"></i>
        </div>
        <div class="section-intro-text">
          <strong>${banner.title}</strong>
          <p>${banner.text}</p>
        </div>
        <button class="section-intro-dismiss" onclick="App.dismissBanner('${section}')" title="Got it">
          <i data-lucide="x"></i>
        </button>
      </div>
    `;
  },

  dismissBanner(section) {
    const dismissed = JSON.parse(localStorage.getItem('dismissed_banners') || '[]');
    if (!dismissed.includes(section)) {
      dismissed.push(section);
      localStorage.setItem('dismissed_banners', JSON.stringify(dismissed));
    }
    const el = document.getElementById('section-banner');
    if (el) {
      el.style.transition = 'opacity 0.3s, transform 0.3s, max-height 0.3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-8px)';
      el.style.maxHeight = '0';
      el.style.overflow = 'hidden';
      el.style.marginBottom = '0';
      el.style.padding = '0';
      setTimeout(() => el.remove(), 300);
    }
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    // Update preference on server
    API.put('/settings-api/preferences', { theme: next }).catch(() => {});
    lucide.createIcons();
  },

  initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
    }
  },

  closeModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-overlay').style.display = 'none';
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    App.closeModal();
  }
});
