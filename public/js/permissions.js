const Permissions = {
  _perms: new Set(),
  _loaded: false,

  async fetch() {
    try {
      const data = await API.get('/auth/me/permissions');
      this._perms = new Set(data.permissions || []);
      this._loaded = true;
    } catch (e) {
      console.error('Failed to load permissions:', e);
      this._perms = new Set();
    }
  },

  has(perm) {
    if (!this._loaded) return true; // allow until loaded (avoid flash-hide)
    return this._perms.has(perm);
  },

  hasAny(...perms) {
    return perms.some(p => this.has(p));
  },

  gateSidebar() {
    document.querySelectorAll('.nav-item[data-permission]').forEach(item => {
      const perm = item.getAttribute('data-permission');
      item.style.display = this.has(perm) ? '' : 'none';
    });
  },

  clear() {
    this._perms = new Set();
    this._loaded = false;
  }
};
