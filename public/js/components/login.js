const Login = {
  render() {
    const view = document.getElementById('login-view');
    const passkeySupported = window.PublicKeyCredential !== undefined;

    // Check for invite token in URL
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('token');
    if (inviteToken) {
      // Redirect to invite page
      window.location.href = '/invite?token=' + encodeURIComponent(inviteToken);
      return;
    }

    view.innerHTML = `
      <div class="login-container">
        <div class="login-card">
          <div class="login-brand">
            <i data-lucide="home" class="login-brand-icon"></i>
            <h1>Estatecraft</h1>
            <p>Private estate portfolio management</p>
          </div>
          ${passkeySupported ? `
          <button class="btn btn-secondary btn-block passkey-login-btn" id="passkey-login-btn" onclick="Login.handlePasskeyLogin()">
            <i data-lucide="fingerprint"></i> Sign in with Passkey
          </button>
          <div class="login-divider"><span>or</span></div>
          ` : ''}
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

          <!-- Register: invite code first -->
          <div id="register-form" style="display:none">
            <div id="register-invite-step">
              <p class="text-muted" style="margin-bottom:16px;font-size:0.9rem">Have an invite link or code? Paste it below to join an existing estate.</p>
              <div class="form-group">
                <label for="register-invite-code">Invite Code or Link</label>
                <input type="text" id="register-invite-code" class="form-control" placeholder="Paste invite link or code">
              </div>
              <button class="btn btn-primary btn-block" onclick="Login.validateInvite()">Continue with Invite</button>
              <div class="login-divider" style="margin:20px 0"><span>or</span></div>
              <button class="btn btn-secondary btn-block" onclick="Login.showNewAdminForm()">
                <i data-lucide="plus"></i> Create a New Estate
              </button>
            </div>

            <!-- New admin registration (hidden until clicked) -->
            <form id="register-admin-form" style="display:none" onsubmit="Login.handleRegister(event)">
              <div class="register-admin-warning">
                <i data-lucide="alert-triangle"></i>
                <div>
                  <strong>You are creating a new estate account.</strong>
                  <p>This makes you the administrator. You can invite your team after setup.</p>
                </div>
              </div>
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
              <button type="submit" class="btn btn-primary btn-block" id="register-submit">Create Estate Account</button>
              <button type="button" class="btn btn-secondary btn-block" style="margin-top:8px" onclick="Login.showInviteStep()">Back</button>
            </form>
          </div>
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
    if (tab === 'register') {
      this.showInviteStep();
    }
    document.getElementById('login-error').style.display = 'none';
  },

  showInviteStep() {
    document.getElementById('register-invite-step').style.display = 'block';
    document.getElementById('register-admin-form').style.display = 'none';
  },

  showNewAdminForm() {
    document.getElementById('register-invite-step').style.display = 'none';
    document.getElementById('register-admin-form').style.display = 'block';
  },

  validateInvite() {
    const input = document.getElementById('register-invite-code').value.trim();
    if (!input) return;

    // Extract token from URL or use raw code
    let token = input;
    try {
      const url = new URL(input);
      token = url.searchParams.get('token') || input;
    } catch (_) {
      // Not a URL, use as-is
    }

    window.location.href = '/invite?token=' + encodeURIComponent(token);
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
      localStorage.setItem('just_registered', '1');
      App.showMain();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Estate Account';
    }
  },

  async handlePasskeyLogin() {
    const btn = document.getElementById('passkey-login-btn');
    const errorEl = document.getElementById('login-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader"></i> Waiting for passkey...';
    lucide.createIcons();

    try {
      const options = await API.post('/passkeys/login-options', {});
      const credential = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options });
      const data = await API.post('/passkeys/login-verify', { credential, challenge: options.challenge });

      API.setToken(data.token);
      API.setUser(data.user);
      App.showMain();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        // User cancelled
      } else {
        errorEl.textContent = err.message || 'Passkey authentication failed';
        errorEl.style.display = 'block';
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="fingerprint"></i> Sign in with Passkey';
      lucide.createIcons();
    }
  }
};
