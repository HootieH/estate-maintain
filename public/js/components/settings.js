const Settings = {
  avatarColors: [
    '#1E40AF', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7',
    '#D946EF', '#EC4899', '#F43F5E', '#EF4444', '#F97316',
    '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#10B981',
    '#14B8A6', '#06B6D4', '#0EA5E9', '#6B7280', '#334155'
  ],

  async render() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const user = await API.get('/auth/me').catch(() => API.getUser() || {});

      container.innerHTML = `
        <div class="page-header">
          <h1>Settings</h1>
        </div>

        <div class="settings-grid">
          <div class="card">
            <div class="card-header"><h3>Profile</h3></div>
            <div class="card-body">
              <form id="profile-form" onsubmit="Settings.updateProfile(event)">
                <div class="form-group">
                  <label for="settings-name">Full Name</label>
                  <input type="text" id="settings-name" class="form-control" value="${user.name || ''}" required>
                </div>
                <div class="form-group">
                  <label for="settings-email">Email</label>
                  <input type="email" id="settings-email" class="form-control" value="${user.email || ''}" required>
                </div>
                <div id="profile-error" class="form-error" style="display:none"></div>
                <button type="submit" class="btn btn-primary" id="profile-submit">Save Profile</button>
              </form>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3>Avatar Color</h3></div>
            <div class="card-body">
              <div class="avatar-preview">
                <div class="user-avatar-lg" id="avatar-preview" style="background: ${user.avatar_color || '#3B82F6'}">
                  ${(user.name || 'U').charAt(0).toUpperCase()}
                </div>
              </div>
              <div class="color-picker-grid">
                ${Settings.avatarColors.map(color => `
                  <button class="color-swatch ${user.avatar_color === color ? 'active' : ''}"
                    style="background: ${color}"
                    onclick="Settings.selectColor('${color}')"
                    title="${color}">
                  </button>
                `).join('')}
              </div>
              <input type="hidden" id="settings-color" value="${user.avatar_color || '#3B82F6'}">
              <button class="btn btn-primary" style="margin-top: 16px" onclick="Settings.saveColor()">Save Color</button>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3>Change Password</h3></div>
            <div class="card-body">
              <form id="password-form" onsubmit="Settings.updatePassword(event)">
                <div class="form-group">
                  <label for="current-password">Current Password</label>
                  <input type="password" id="current-password" class="form-control" required>
                </div>
                <div class="form-group">
                  <label for="new-password">New Password</label>
                  <input type="password" id="new-password" class="form-control" required minlength="6">
                </div>
                <div class="form-group">
                  <label for="confirm-password">Confirm New Password</label>
                  <input type="password" id="confirm-password" class="form-control" required minlength="6">
                </div>
                <div id="password-error" class="form-error" style="display:none"></div>
                <button type="submit" class="btn btn-primary" id="password-submit">Update Password</button>
              </form>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3>Account</h3></div>
            <div class="card-body">
              <p class="text-muted">Signed in as <strong>${user.email || ''}</strong></p>
              <p class="text-muted">Role: <strong>${user.role || 'user'}</strong></p>
              <hr>
              <button class="btn btn-danger" onclick="API.logout()">
                <i data-lucide="log-out"></i> Sign Out
              </button>
            </div>
          </div>
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  selectColor(color) {
    document.getElementById('settings-color').value = color;
    document.getElementById('avatar-preview').style.background = color;
    document.querySelectorAll('.color-swatch').forEach(s => {
      s.classList.toggle('active', s.style.backgroundColor === color || s.title === color);
    });
  },

  async saveColor() {
    const color = document.getElementById('settings-color').value;
    try {
      await API.put('/auth/me', { avatar_color: color });
      const user = API.getUser();
      if (user) {
        user.avatar_color = color;
        API.setUser(user);
      }
      App.updateSidebarUser();
      App.toast('Avatar color updated', 'success');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async updateProfile(e) {
    e.preventDefault();
    const btn = document.getElementById('profile-submit');
    const errorEl = document.getElementById('profile-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const body = {
        name: document.getElementById('settings-name').value,
        email: document.getElementById('settings-email').value
      };
      const updated = await API.put('/auth/me', body);
      if (updated) API.setUser(updated);
      App.updateSidebarUser();
      App.toast('Profile updated', 'success');
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Profile';
    }
  },

  async updatePassword(e) {
    e.preventDefault();
    const btn = document.getElementById('password-submit');
    const errorEl = document.getElementById('password-error');
    errorEl.style.display = 'none';

    const newPw = document.getElementById('new-password').value;
    const confirmPw = document.getElementById('confirm-password').value;

    if (newPw !== confirmPw) {
      errorEl.textContent = 'Passwords do not match';
      errorEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
      await API.put('/auth/password', {
        current_password: document.getElementById('current-password').value,
        new_password: newPw
      });
      App.toast('Password updated', 'success');
      document.getElementById('password-form').reset();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Update Password';
    }
  }
};
