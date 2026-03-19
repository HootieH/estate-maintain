const Onboarding = {
  _step: 0,
  _steps: [],
  _data: {},
  _role: null,
  _checklist: null,

  async check() {
    try {
      const status = await API.get('/onboarding/status');
      if (!status.onboarding_completed) {
        this._role = status.role;
        this._checklist = status.checklist;
        this._data = { userName: status.name };

        if (status.role === 'admin') {
          this._steps = ['welcome', 'property', 'assets', 'team', 'complete'];
        } else if (status.role === 'manager') {
          this._steps = ['welcome', 'overview', 'complete'];
        } else {
          this._steps = ['welcome', 'complete'];
        }

        this._step = 0;
        this.show();
      }
    } catch (e) {
      // Onboarding endpoint not available, skip silently
    }
  },

  show() {
    let overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    overlay.innerHTML = '';

    const step = this._steps[this._step];
    const progressPct = ((this._step) / (this._steps.length - 1)) * 100;

    const container = document.createElement('div');
    container.className = 'ob-container';

    // Add progress bar for non-welcome and non-complete steps
    if (step !== 'welcome' && step !== 'complete') {
      container.innerHTML = `
        <div class="ob-progress">
          <div class="ob-progress-bar" style="width: ${progressPct}%"></div>
        </div>
        <div class="ob-step-indicator">Step ${this._step} of ${this._steps.length - 2}</div>
      `;
    }

    const content = document.createElement('div');
    content.className = 'ob-content';
    container.appendChild(content);
    overlay.appendChild(container);

    switch (step) {
      case 'welcome': this._renderWelcome(content); break;
      case 'property': this._renderProperty(content); break;
      case 'assets': this._renderAssets(content); break;
      case 'team': this._renderTeam(content); break;
      case 'overview': this._renderOverview(content); break;
      case 'complete': this._renderComplete(content); break;
    }

    lucide.createIcons();

    // Trigger entrance animation
    requestAnimationFrame(() => {
      container.classList.add('ob-visible');
    });
  },

  _renderWelcome(el) {
    const user = API.getUser();
    const firstName = (this._data.userName || user?.name || 'there').split(' ')[0];

    const roleMessages = {
      admin: {
        subtitle: 'Estate Administrator',
        description: 'You have full control over your estate portfolio. Let\'s set up your properties, teams, and maintenance workflows in just a few steps.',
        cta: 'Set Up Your Estate'
      },
      manager: {
        subtitle: 'Estate Manager',
        description: 'You\'ll oversee maintenance operations, manage work orders, and coordinate teams across your assigned properties.',
        cta: 'Take a Quick Tour'
      },
      technician: {
        subtitle: 'Maintenance Technician',
        description: 'You\'ll receive work assignments, log your time, and keep the estate running smoothly. Everything you need is right here.',
        cta: 'Get Started'
      }
    };

    const msg = roleMessages[this._role] || roleMessages.technician;

    el.innerHTML = `
      <div class="ob-welcome">
        <div class="ob-welcome-icon">
          <div class="ob-icon-ring ob-icon-ring-1"></div>
          <div class="ob-icon-ring ob-icon-ring-2"></div>
          <div class="ob-icon-ring ob-icon-ring-3"></div>
          <div class="ob-icon-center">
            <i data-lucide="home"></i>
          </div>
        </div>
        <h1 class="ob-title">Welcome, ${firstName}</h1>
        <span class="ob-role-badge ob-role-${this._role}">${msg.subtitle}</span>
        <p class="ob-description">${msg.description}</p>
        <div class="ob-welcome-actions">
          <button class="btn btn-primary btn-lg ob-cta" onclick="Onboarding.next()">
            ${msg.cta}
            <i data-lucide="arrow-right"></i>
          </button>
        </div>
        ${this._role === 'admin' ? `
          <button class="ob-skip-all" onclick="Onboarding.skipAll()">
            I'll set things up myself
          </button>
        ` : ''}
      </div>
    `;
  },

  _renderProperty(el) {
    const types = [
      { value: 'estate', icon: 'castle', label: 'Estate', desc: 'Grand residence with grounds' },
      { value: 'villa', icon: 'home', label: 'Villa', desc: 'Luxury standalone home' },
      { value: 'apartment', icon: 'building-2', label: 'Apartment', desc: 'Multi-unit building' },
      { value: 'cottage', icon: 'trees', label: 'Cottage', desc: 'Country retreat' },
      { value: 'commercial', icon: 'store', label: 'Commercial', desc: 'Business property' },
      { value: 'land', icon: 'map', label: 'Land', desc: 'Undeveloped grounds' }
    ];

    el.innerHTML = `
      <div class="ob-step-content">
        <div class="ob-step-header">
          <div class="ob-step-icon">
            <i data-lucide="building-2"></i>
          </div>
          <h2>Add Your First Property</h2>
          <p>Properties are the foundation of your estate portfolio. Start with your primary residence or any property you manage.</p>
        </div>

        <div class="ob-type-grid">
          ${types.map(t => `
            <button class="ob-type-card ${this._data.propertyType === t.value ? 'selected' : ''}"
                    onclick="Onboarding.selectPropertyType('${t.value}', this)">
              <i data-lucide="${t.icon}"></i>
              <strong>${t.label}</strong>
              <span>${t.desc}</span>
            </button>
          `).join('')}
        </div>

        <form class="ob-form" id="ob-property-form" onsubmit="Onboarding.handlePropertySubmit(event)">
          <div class="ob-form-row">
            <div class="ob-form-group">
              <label for="ob-prop-name">Property Name <span class="required">*</span></label>
              <input type="text" id="ob-prop-name" class="form-control" required
                     placeholder="e.g., Harrington Manor" value="${this._data.propertyName || ''}">
            </div>
          </div>
          <div class="ob-form-group">
            <label for="ob-prop-address">Address</label>
            <input type="text" id="ob-prop-address" class="form-control"
                   placeholder="e.g., 123 Estate Drive, Hampshire" value="${this._data.propertyAddress || ''}">
          </div>

          <div id="ob-prop-error" class="form-error" style="display:none"></div>

          <div class="ob-actions">
            <button type="button" class="btn btn-secondary" onclick="Onboarding.skip()">Skip for now</button>
            <button type="submit" class="btn btn-primary" id="ob-prop-submit">
              <span>Create Property</span>
              <i data-lucide="arrow-right"></i>
            </button>
          </div>
        </form>
      </div>
    `;
  },

  selectPropertyType(type, btnEl) {
    this._data.propertyType = type;
    document.querySelectorAll('.ob-type-card').forEach(c => c.classList.remove('selected'));
    if (btnEl) btnEl.classList.add('selected');
  },

  async handlePropertySubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('ob-prop-submit');
    const errorEl = document.getElementById('ob-prop-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<span>Creating...</span>';

    try {
      const result = await API.post('/properties', {
        name: document.getElementById('ob-prop-name').value,
        type: this._data.propertyType || 'estate',
        address: document.getElementById('ob-prop-address').value || null
      });
      this._data.propertyId = result.id;
      this._data.propertyName = document.getElementById('ob-prop-name').value;
      App.toast('Property created!', 'success');
      this.next();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '<span>Create Property</span><i data-lucide="arrow-right"></i>';
      lucide.createIcons();
    }
  },

  _renderAssets(el) {
    const categories = [
      { value: 'HVAC', icon: 'thermometer', label: 'HVAC System', checked: false },
      { value: 'Plumbing', icon: 'droplets', label: 'Plumbing', checked: false },
      { value: 'Electrical', icon: 'zap', label: 'Electrical', checked: false },
      { value: 'Security', icon: 'shield', label: 'Security System', checked: false },
      { value: 'Pool', icon: 'waves', label: 'Pool / Spa', checked: false },
      { value: 'Appliance', icon: 'refrigerator', label: 'Appliances', checked: false },
      { value: 'Landscaping', icon: 'tree-pine', label: 'Landscaping', checked: false },
      { value: 'Roofing', icon: 'umbrella', label: 'Roofing', checked: false }
    ];

    if (!this._data.propertyId) {
      // No property created, skip to team
      this.next();
      return;
    }

    el.innerHTML = `
      <div class="ob-step-content">
        <div class="ob-step-header">
          <div class="ob-step-icon">
            <i data-lucide="wrench"></i>
          </div>
          <h2>What does ${this._data.propertyName || 'your property'} have?</h2>
          <p>Select the systems and equipment at this property. We'll create asset records for each one so you can track maintenance.</p>
        </div>

        <div class="ob-asset-grid">
          ${categories.map(c => `
            <label class="ob-asset-card" data-category="${c.value}">
              <input type="checkbox" value="${c.value}" class="ob-asset-check">
              <div class="ob-asset-card-inner">
                <i data-lucide="${c.icon}"></i>
                <span>${c.label}</span>
              </div>
              <div class="ob-checkmark">
                <i data-lucide="check"></i>
              </div>
            </label>
          `).join('')}
        </div>

        <div class="ob-actions">
          <button type="button" class="btn btn-secondary" onclick="Onboarding.skip()">Skip for now</button>
          <button type="button" class="btn btn-primary" id="ob-assets-submit" onclick="Onboarding.handleAssetsSubmit()">
            <span>Add Selected Assets</span>
            <i data-lucide="arrow-right"></i>
          </button>
        </div>
      </div>
    `;
  },

  async handleAssetsSubmit() {
    const btn = document.getElementById('ob-assets-submit');
    const checked = document.querySelectorAll('.ob-asset-check:checked');

    if (checked.length === 0) {
      this.next();
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span>Creating assets...</span>';

    const results = [];
    for (const cb of checked) {
      try {
        await API.post('/assets', {
          name: cb.value + ' System',
          category: cb.value,
          property_id: this._data.propertyId,
          status: 'operational'
        });
        results.push(cb.value);
      } catch (e) {
        // Continue with others
      }
    }

    if (results.length > 0) {
      this._data.assetsCreated = results.length;
      App.toast(`${results.length} asset${results.length > 1 ? 's' : ''} created!`, 'success');
    }
    this.next();
  },

  _renderTeam(el) {
    el.innerHTML = `
      <div class="ob-step-content">
        <div class="ob-step-header">
          <div class="ob-step-icon">
            <i data-lucide="users"></i>
          </div>
          <h2>Create Your First Team</h2>
          <p>Teams help you organize your maintenance staff by specialty. Assign properties and work orders to teams for efficient operations.</p>
        </div>

        <div class="ob-team-suggestions">
          <p class="ob-suggestion-label">Popular team setups:</p>
          <div class="ob-suggestion-chips">
            <button class="ob-chip" onclick="Onboarding.fillTeam('Grounds & Landscaping', 'Exterior maintenance, gardens, and landscaping', this)">Grounds & Landscaping</button>
            <button class="ob-chip" onclick="Onboarding.fillTeam('Interior Maintenance', 'Indoor repairs, HVAC, plumbing, and electrical', this)">Interior Maintenance</button>
            <button class="ob-chip" onclick="Onboarding.fillTeam('Security & Systems', 'Security systems, access control, and IT', this)">Security & Systems</button>
            <button class="ob-chip" onclick="Onboarding.fillTeam('Housekeeping', 'Cleaning, organization, and hospitality prep', this)">Housekeeping</button>
          </div>
        </div>

        <form class="ob-form" id="ob-team-form" onsubmit="Onboarding.handleTeamSubmit(event)">
          <div class="ob-form-group">
            <label for="ob-team-name">Team Name <span class="required">*</span></label>
            <input type="text" id="ob-team-name" class="form-control" required
                   placeholder="e.g., Grounds & Landscaping" value="${this._data.teamName || ''}">
          </div>
          <div class="ob-form-group">
            <label for="ob-team-desc">Description</label>
            <textarea id="ob-team-desc" class="form-control" rows="2"
                      placeholder="What does this team handle?">${this._data.teamDesc || ''}</textarea>
          </div>

          <div id="ob-team-error" class="form-error" style="display:none"></div>

          <div class="ob-actions">
            <button type="button" class="btn btn-secondary" onclick="Onboarding.skip()">Skip for now</button>
            <button type="submit" class="btn btn-primary" id="ob-team-submit">
              <span>Create Team</span>
              <i data-lucide="arrow-right"></i>
            </button>
          </div>
        </form>
      </div>
    `;
  },

  fillTeam(name, desc, btnEl) {
    document.getElementById('ob-team-name').value = name;
    document.getElementById('ob-team-desc').value = desc;
    this._data.teamName = name;
    this._data.teamDesc = desc;
    // Highlight selected chip
    document.querySelectorAll('.ob-chip').forEach(c => c.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
  },

  async handleTeamSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('ob-team-submit');
    const errorEl = document.getElementById('ob-team-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<span>Creating...</span>';

    try {
      const result = await API.post('/teams', {
        name: document.getElementById('ob-team-name').value,
        description: document.getElementById('ob-team-desc').value || null
      });
      this._data.teamId = result.id;
      this._data.teamName = document.getElementById('ob-team-name').value;
      App.toast('Team created!', 'success');
      this.next();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '<span>Create Team</span><i data-lucide="arrow-right"></i>';
      lucide.createIcons();
    }
  },

  _renderOverview(el) {
    // Manager overview step
    const sections = [
      { icon: 'clipboard-list', title: 'Work Orders', desc: 'Create, assign, and track maintenance tasks', route: '#/workorders' },
      { icon: 'building-2', title: 'Properties', desc: 'View and manage your assigned properties', route: '#/properties' },
      { icon: 'calendar-clock', title: 'Preventive Maintenance', desc: 'Schedule recurring maintenance to prevent breakdowns', route: '#/preventive' },
      { icon: 'inbox', title: 'Work Requests', desc: 'Review and approve requests from residents and staff', route: '#/requests' },
      { icon: 'users', title: 'Teams', desc: 'Manage your maintenance teams and assignments', route: '#/teams' },
      { icon: 'bar-chart-3', title: 'Reports', desc: 'Track performance, costs, and completion rates', route: '#/reports' }
    ];

    el.innerHTML = `
      <div class="ob-step-content">
        <div class="ob-step-header">
          <div class="ob-step-icon">
            <i data-lucide="compass"></i>
          </div>
          <h2>Your Key Areas</h2>
          <p>Here's a quick look at the tools you'll use most as a manager.</p>
        </div>

        <div class="ob-overview-grid">
          ${sections.map(s => `
            <div class="ob-overview-card">
              <div class="ob-overview-icon">
                <i data-lucide="${s.icon}"></i>
              </div>
              <div class="ob-overview-text">
                <strong>${s.title}</strong>
                <span>${s.desc}</span>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="ob-actions">
          <button class="btn btn-primary btn-lg" onclick="Onboarding.next()">
            <span>Let's Go</span>
            <i data-lucide="arrow-right"></i>
          </button>
        </div>
      </div>
    `;
  },

  _renderComplete(el) {
    const summary = [];
    if (this._data.propertyName) summary.push({ icon: 'building-2', text: `Created property: ${this._data.propertyName}` });
    if (this._data.assetsCreated) summary.push({ icon: 'wrench', text: `Added ${this._data.assetsCreated} asset${this._data.assetsCreated > 1 ? 's' : ''}` });
    if (this._data.teamName) summary.push({ icon: 'users', text: `Created team: ${this._data.teamName}` });

    const quickActions = this._role === 'admin' ? [
      { icon: 'clipboard-list', label: 'Create Work Order', route: '#/workorders/new', color: '#3B82F6' },
      { icon: 'building-2', label: 'Add Another Property', route: '#/properties/new', color: '#8B5CF6' },
      { icon: 'user-plus', label: 'Invite Team Members', route: '#/teams', color: '#10B981' },
      { icon: 'calendar-clock', label: 'Set Up Preventive Maintenance', route: '#/preventive/new', color: '#F59E0B' }
    ] : this._role === 'manager' ? [
      { icon: 'clipboard-list', label: 'View Work Orders', route: '#/workorders', color: '#3B82F6' },
      { icon: 'building-2', label: 'View Properties', route: '#/properties', color: '#8B5CF6' },
      { icon: 'inbox', label: 'Check Requests', route: '#/requests', color: '#10B981' }
    ] : [
      { icon: 'clipboard-list', label: 'View My Work', route: '#/workorders', color: '#3B82F6' },
      { icon: 'message-circle', label: 'Messages', route: '#/messages', color: '#10B981' }
    ];

    el.innerHTML = `
      <div class="ob-complete">
        <div class="ob-complete-animation">
          <div class="ob-confetti"></div>
          <div class="ob-check-circle">
            <svg viewBox="0 0 52 52">
              <circle class="ob-check-bg" cx="26" cy="26" r="25" fill="none"/>
              <path class="ob-check-mark" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
          </div>
        </div>

        <h1 class="ob-title">You're All Set!</h1>
        <p class="ob-description">Your estate management system is ready to go.</p>

        ${summary.length > 0 ? `
          <div class="ob-summary">
            ${summary.map(s => `
              <div class="ob-summary-item">
                <i data-lucide="${s.icon}"></i>
                <span>${s.text}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="ob-quick-actions">
          <p class="ob-quick-label">What would you like to do next?</p>
          <div class="ob-quick-grid">
            ${quickActions.map(a => `
              <button class="ob-quick-card" onclick="Onboarding.goTo('${a.route}')">
                <div class="ob-quick-icon" style="background: ${a.color}15; color: ${a.color}">
                  <i data-lucide="${a.icon}"></i>
                </div>
                <span>${a.label}</span>
                <i data-lucide="chevron-right" class="ob-quick-arrow"></i>
              </button>
            `).join('')}
          </div>
        </div>

        <button class="btn btn-primary btn-lg ob-cta" onclick="Onboarding.finish()">
          <i data-lucide="layout-dashboard"></i>
          <span>Go to Dashboard</span>
        </button>
      </div>
    `;
  },

  next() {
    if (this._step < this._steps.length - 1) {
      this._step++;
      this.show();
    }
  },

  skip() {
    this.next();
  },

  async skipAll() {
    await this.finish();
  },

  async goTo(route) {
    await this._complete();
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) overlay.style.display = 'none';
    Router.navigate(route);
  },

  async finish() {
    await this._complete();
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) overlay.style.display = 'none';
    // Refresh dashboard
    if (window.location.hash === '#/dashboard' || !window.location.hash) {
      Dashboard.render();
    }
  },

  async _complete() {
    try {
      await API.put('/onboarding/complete');
      // Update local user data
      const user = API.getUser();
      if (user) {
        user.onboarding_completed = 1;
        API.setUser(user);
      }
    } catch (e) {
      // Silently fail
    }
  }
};
