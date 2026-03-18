const Login = {
  render() {
    const view = document.getElementById('login-view');
    view.innerHTML = `
      <div class="login-container">
        <div class="login-card">
          <div class="login-brand">
            <i data-lucide="home" class="login-brand-icon"></i>
            <h1>Estate Maintain</h1>
            <p>Private estate portfolio management</p>
          </div>
          <div class="login-tabs">
            <button class="login-tab active" data-tab="login" onclick="Login.switchTab('login')">Sign In</button>
            <button class="login-tab" data-tab="register" onclick="Login.switchTab('register')">Register</button>
          </div>
          <form id="login-form" onsubmit="Login.handleLogin(event)">
            <div class="form-group">
              <label for="login-email">Email</label>
              <input type="email" id="login-email" class="form-control" placeholder="you@example.com" required autofocus>
            </div>
            <div class="form-group">
              <label for="login-password">Password</label>
              <input type="password" id="login-password" class="form-control" placeholder="Your password" required>
            </div>
            <div id="login-error" class="form-error" style="display:none"></div>
            <button type="submit" class="btn btn-primary btn-block" id="login-submit">Sign In</button>
          </form>
          <form id="register-form" style="display:none" onsubmit="Login.handleRegister(event)">
            <div class="form-group">
              <label for="register-name">Full Name</label>
              <input type="text" id="register-name" class="form-control" placeholder="John Smith" required>
            </div>
            <div class="form-group">
              <label for="register-email">Email</label>
              <input type="email" id="register-email" class="form-control" placeholder="you@example.com" required>
            </div>
            <div class="form-group">
              <label for="register-password">Password</label>
              <input type="password" id="register-password" class="form-control" placeholder="Min 6 characters" required minlength="6">
            </div>
            <div id="register-error" class="form-error" style="display:none"></div>
            <button type="submit" class="btn btn-primary btn-block" id="register-submit">Create Account</button>
          </form>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  switchTab(tab) {
    document.querySelectorAll('.login-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('register-error').style.display = 'none';
  },

  async handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('login-submit');
    const errorEl = document.getElementById('login-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      const data = await API.post('/auth/login', {
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value
      });
      API.setToken(data.token);
      API.setUser(data.user);
      App.showMain();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  },

  async handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('register-submit');
    const errorEl = document.getElementById('register-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
      const data = await API.post('/auth/register', {
        name: document.getElementById('register-name').value,
        email: document.getElementById('register-email').value,
        password: document.getElementById('register-password').value
      });
      API.setToken(data.token);
      API.setUser(data.user);
      App.showMain();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  }
};
