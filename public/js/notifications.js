const Notifications = {
  _pollInterval: null,

  init() {
    this.pollCount();
    this._pollInterval = setInterval(() => this.pollCount(), 30000);

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('notification-panel');
      const bell = document.getElementById('notification-bell');
      if (panel && panel.style.display !== 'none' &&
          !panel.contains(e.target) && !bell.contains(e.target)) {
        panel.style.display = 'none';
      }
    });
  },

  destroy() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  },

  async pollCount() {
    if (!API.token) return;
    try {
      const data = await API.get('/notifications/count');
      const badge = document.getElementById('notification-badge');
      if (!badge) return;
      if (data.count > 0) {
        badge.textContent = data.count > 99 ? '99+' : data.count;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    } catch (e) {
      // silently fail polling
    }
  },

  async toggle() {
    const panel = document.getElementById('notification-panel');
    if (!panel) return;
    if (panel.style.display === 'none') {
      panel.style.display = 'block';
      await this.loadNotifications();
    } else {
      panel.style.display = 'none';
    }
  },

  async loadNotifications() {
    const list = document.getElementById('notification-list');
    if (!list) return;
    list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const notifications = await API.get('/notifications?limit=20');
      if (notifications.length === 0) {
        list.innerHTML = '<div class="empty-state-sm">No notifications</div>';
        return;
      }

      list.innerHTML = notifications.map(n => {
        const time = this.timeAgo(n.created_at);
        const unreadClass = n.is_read ? '' : ' notification-item-unread';
        const link = n.entity_type === 'work_order' && n.entity_id
          ? `onclick="Notifications.goTo('${n.entity_type}', ${n.entity_id}, ${n.id})"`
          : `onclick="Notifications.markRead(${n.id})"`;

        const iconMap = {
          assignment: 'user-check',
          status_change: 'refresh-cw',
          comment: 'message-square',
          due_soon: 'clock',
          overdue: 'alert-triangle',
          request: 'inbox',
          pm_due: 'calendar-clock'
        };
        const icon = iconMap[n.type] || 'bell';

        return `
          <div class="notification-item${unreadClass}" ${link}>
            <div class="notification-item-icon"><i data-lucide="${icon}"></i></div>
            <div class="notification-item-content">
              <div class="notification-item-title">${this.escapeHtml(n.title)}</div>
              ${n.message ? `<div class="notification-item-message">${this.escapeHtml(n.message)}</div>` : ''}
              <div class="notification-item-time">${time}</div>
            </div>
          </div>
        `;
      }).join('');

      lucide.createIcons({ nodes: [list] });
    } catch (e) {
      list.innerHTML = '<div class="empty-state-sm">Failed to load notifications</div>';
    }
  },

  async goTo(entityType, entityId, notificationId) {
    // Mark as read and navigate
    try {
      await API.put(`/notifications/${notificationId}/read`);
    } catch (e) { /* ignore */ }

    document.getElementById('notification-panel').style.display = 'none';
    this.pollCount();

    if (entityType === 'work_order') {
      Router.navigate(`#/workorders/${entityId}`);
    }
  },

  async markRead(notificationId) {
    try {
      await API.put(`/notifications/${notificationId}/read`);
      await this.loadNotifications();
      this.pollCount();
    } catch (e) { /* ignore */ }
  },

  async markAllRead() {
    try {
      await API.post('/notifications/read-all');
      await this.loadNotifications();
      this.pollCount();
    } catch (e) { /* ignore */ }
  },

  timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr + (dateStr.includes('Z') ? '' : 'Z'));
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
