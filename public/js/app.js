const App = {
  init() {
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
    Router.add('/settings', () => Settings.render());

    Router.init();

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
    }
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
