const Teams = {
  _currentPage: 1,
  _pagination: null,

  async list(page) {
    this._currentPage = page || 1;
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading teams...</p></div>';

    try {
      const params = new URLSearchParams({ page: this._currentPage, limit: 25 });
      const data = await API.get(`/teams?${params.toString()}`);
      const { items: teams, pagination } = Pagination.extract(data, 'teams');
      this._pagination = pagination;

      container.innerHTML = `
        <div class="page-header">
          <h1>Teams <span class="tip-trigger" data-tip="team"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
          <button class="btn btn-primary" onclick="Router.navigate('#/teams/new')">
            <i data-lucide="plus"></i> Create Team
          </button>
        </div>
        ${teams.length === 0 ? `
          <div class="empty-state">
            <i data-lucide="users" class="empty-icon"></i>
            <h2>No Teams Yet</h2>
            <p>Create teams to organize your maintenance staff.</p>
            <button class="btn btn-primary" onclick="Router.navigate('#/teams/new')">
              <i data-lucide="plus"></i> Create Team
            </button>
          </div>
        ` : `
          <div class="card-grid">
            ${teams.map(t => `
              <div class="card team-card clickable" onclick="Router.navigate('#/teams/${t.id}')">
                <div class="card-body">
                  <div class="team-icon">
                    <i data-lucide="users"></i>
                  </div>
                  <h3>${t.name}</h3>
                  <p class="text-muted">${t.description || ''}</p>
                  <div class="card-stats">
                    <span><i data-lucide="user" class="icon-sm"></i> ${t.member_count || 0} members</span>
                    <span><i data-lucide="building-2" class="icon-sm"></i> ${t.property_count || 0} properties</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          ${Pagination.render(pagination, 'Teams')}
        `}
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  goToPage(page) {
    if (page < 1 || (this._pagination && page > this._pagination.totalPages)) return;
    this.list(page);
  },

  async detail(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const team = await API.get(`/teams/${params.id}`);
      const members = team.members || [];
      const properties = team.properties || [];

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/teams')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>${team.name}</h1>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-secondary" onclick="Teams.edit('${params.id}')">
              <i data-lucide="edit"></i> Edit
            </button>
            <button class="btn btn-danger" onclick="Teams.remove('${params.id}')">
              <i data-lucide="trash-2"></i> Delete
            </button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="card">
            <div class="card-header"><h3>Team Info</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field detail-field-full">
                  <label>Description</label>
                  <p>${team.description || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="tabs">
          <button class="tab active" onclick="Properties.switchTab(this, 'members-tab')">Members (${members.length})</button>
          <button class="tab" onclick="Properties.switchTab(this, 'properties-tab')">Properties (${properties.length})</button>
        </div>

        <div id="members-tab" class="tab-content active">
          <div class="card">
            <div class="card-header">
              <h3>Team Members</h3>
              <button class="btn btn-sm btn-primary" onclick="Teams.showAddMember('${params.id}')">
                <i data-lucide="user-plus"></i> Add Member
              </button>
            </div>
            <div class="card-body">
              ${members.length === 0 ? '<div class="empty-state-sm">No members in this team yet</div>' : `
                <table class="table">
                  <thead>
                    <tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    ${members.map(m => `
                      <tr>
                        <td>
                          <div class="user-cell">
                            <div class="user-avatar-sm" style="background: ${m.avatar_color || '#3B82F6'}">${(m.name || 'U').charAt(0).toUpperCase()}</div>
                            <span>${m.name || m.email}</span>
                          </div>
                        </td>
                        <td>${m.email || '-'}</td>
                        <td>${m.role || 'member'}</td>
                        <td>
                          <button class="btn btn-sm btn-danger" onclick="Teams.removeMember('${params.id}', '${m.id}')">
                            <i data-lucide="user-minus"></i>
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `}
            </div>
          </div>
        </div>

        <div id="properties-tab" class="tab-content">
          <div class="card">
            <div class="card-header">
              <h3>Assigned Properties</h3>
              <button class="btn btn-sm btn-primary" onclick="Teams.showAddProperty('${params.id}')">
                <i data-lucide="plus"></i> Assign Property
              </button>
            </div>
            <div class="card-body">
              ${properties.length === 0 ? '<div class="empty-state-sm">No properties assigned to this team</div>' : `
                <table class="table">
                  <thead>
                    <tr><th>Property</th><th>Type</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    ${properties.map(p => `
                      <tr>
                        <td><a href="#/properties/${p.id}">${p.name}</a></td>
                        <td>${p.type || '-'}</td>
                        <td>
                          <button class="btn btn-sm btn-danger" onclick="Teams.removeProperty('${params.id}', '${p.id}')">
                            <i data-lucide="x"></i>
                          </button>
                        </td>
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
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async form() {
    const container = document.getElementById('main-content');

    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/teams')">
            <i data-lucide="arrow-left"></i> Back
          </button>
          <h1>Create Team</h1>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <form id="team-form" onsubmit="Teams.handleCreate(event)">
            <div class="form-group">
              <label for="team-name">Team Name *</label>
              <input type="text" id="team-name" class="form-control" required placeholder="e.g., Groundskeeping">
            </div>
            <div class="form-group">
              <label for="team-desc">Description</label>
              <textarea id="team-desc" class="form-control" rows="3" placeholder="Team description..."></textarea>
            </div>
            <div id="team-form-error" class="form-error" style="display:none"></div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/teams')">Cancel</button>
              <button type="submit" class="btn btn-primary" id="team-submit">Create Team</button>
            </div>
          </form>
        </div>
      </div>
    `;
    lucide.createIcons();
  },

  async handleCreate(e) {
    e.preventDefault();
    const btn = document.getElementById('team-submit');
    const errorEl = document.getElementById('team-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const body = {
        name: document.getElementById('team-name').value,
        description: document.getElementById('team-desc').value || null
      };
      const result = await API.post('/teams', body);
      App.toast('Team created', 'success');
      Router.navigate(`#/teams/${result.id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Team';
    }
  },

  async edit(id) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const team = await API.get(`/teams/${id}`);

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/teams/${id}')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>Edit Team</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="team-edit-form" onsubmit="Teams.handleUpdate(event, '${id}')">
              <div class="form-group">
                <label for="team-name">Team Name *</label>
                <input type="text" id="team-name" class="form-control" required value="${team.name || ''}">
              </div>
              <div class="form-group">
                <label for="team-desc">Description</label>
                <textarea id="team-desc" class="form-control" rows="3">${team.description || ''}</textarea>
              </div>
              <div id="team-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/teams/${id}')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="team-submit">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async handleUpdate(e, id) {
    e.preventDefault();
    const btn = document.getElementById('team-submit');
    const errorEl = document.getElementById('team-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const body = {
        name: document.getElementById('team-name').value,
        description: document.getElementById('team-desc').value || null
      };
      await API.put(`/teams/${id}`, body);
      App.toast('Team updated', 'success');
      Router.navigate(`#/teams/${id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  },

  async showAddMember(teamId) {
    const modal = document.getElementById('modal-overlay');
    const title = modal.querySelector('.modal-title');
    const body = modal.querySelector('.modal-body');
    const footer = modal.querySelector('.modal-footer');

    title.textContent = 'Add Team Member';
    body.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    footer.innerHTML = '';
    modal.style.display = 'flex';

    try {
      const userData = await API.get('/users').catch(() => []);
      const users = Array.isArray(userData) ? userData : (userData.data || userData.users || []);

      body.innerHTML = `
        <div class="form-group">
          <label for="member-select">Select User</label>
          <select id="member-select" class="form-control">
            <option value="">Choose a user...</option>
            ${users.map(u => `<option value="${u.id}">${u.name} (${u.email})</option>`).join('')}
          </select>
        </div>
      `;
      footer.innerHTML = `
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="Teams.addMember('${teamId}')">Add</button>
      `;
    } catch (e) {
      body.innerHTML = `<p class="text-danger">${e.message}</p>`;
      footer.innerHTML = '<button class="btn btn-secondary" onclick="App.closeModal()">Close</button>';
    }
    lucide.createIcons();
  },

  async addMember(teamId) {
    const userId = document.getElementById('member-select').value;
    if (!userId) { App.toast('Select a user', 'error'); return; }
    try {
      await API.post(`/teams/${teamId}/members`, { user_id: userId });
      App.closeModal();
      App.toast('Member added', 'success');
      Teams.detail({ id: teamId });
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async removeMember(teamId, userId) {
    if (!confirm('Remove this member from the team?')) return;
    try {
      await API.delete(`/teams/${teamId}/members/${userId}`);
      App.toast('Member removed', 'success');
      Teams.detail({ id: teamId });
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async showAddProperty(teamId) {
    const modal = document.getElementById('modal-overlay');
    const title = modal.querySelector('.modal-title');
    const body = modal.querySelector('.modal-body');
    const footer = modal.querySelector('.modal-footer');

    title.textContent = 'Assign Property';
    body.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    footer.innerHTML = '';
    modal.style.display = 'flex';

    try {
      const propData = await API.get('/properties').catch(() => []);
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);

      body.innerHTML = `
        <div class="form-group">
          <label for="property-select">Select Property</label>
          <select id="property-select" class="form-control">
            <option value="">Choose a property...</option>
            ${properties.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>
      `;
      footer.innerHTML = `
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="Teams.addProperty('${teamId}')">Assign</button>
      `;
    } catch (e) {
      body.innerHTML = `<p class="text-danger">${e.message}</p>`;
      footer.innerHTML = '<button class="btn btn-secondary" onclick="App.closeModal()">Close</button>';
    }
    lucide.createIcons();
  },

  async addProperty(teamId) {
    const propId = document.getElementById('property-select').value;
    if (!propId) { App.toast('Select a property', 'error'); return; }
    try {
      await API.post(`/teams/${teamId}/properties`, { property_id: propId });
      App.closeModal();
      App.toast('Property assigned', 'success');
      Teams.detail({ id: teamId });
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async removeProperty(teamId, propId) {
    if (!confirm('Remove this property from the team?')) return;
    try {
      await API.delete(`/teams/${teamId}/properties/${propId}`);
      App.toast('Property removed', 'success');
      Teams.detail({ id: teamId });
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async remove(id) {
    if (!confirm('Are you sure you want to delete this team?')) return;
    try {
      await API.delete(`/teams/${id}`);
      App.toast('Team deleted', 'success');
      Router.navigate('#/teams');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
