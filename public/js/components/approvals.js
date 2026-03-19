const Approvals = {
  _activeTab: 'pending',

  async render() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading approvals...</p></div>';

    const canManageRules = Permissions.has('approvals:manage_rules');

    container.innerHTML = `
      <div class="page-header">
        <h1>Approvals <span class="tip-trigger" data-tip="approvals"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
      </div>

      <div class="tabs">
        <button class="tab active" onclick="Approvals.switchTab(this, 'pending')">Pending</button>
        ${canManageRules ? '<button class="tab" onclick="Approvals.switchTab(this, \'rules\')">Rules</button>' : ''}
      </div>

      <div id="approvals-tab-pending" class="tab-content active"></div>
      <div id="approvals-tab-rules" class="tab-content"></div>
    `;

    this._activeTab = 'pending';
    this.loadPendingTab();
  },

  switchTab(el, tabId) {
    document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    if (el) el.classList.add('active');
    const panel = document.getElementById('approvals-tab-' + tabId);
    if (panel) panel.classList.add('active');
    this._activeTab = tabId;

    if (tabId === 'pending') this.loadPendingTab();
    else if (tabId === 'rules') this.loadRulesTab();
  },

  async loadPendingTab() {
    const panel = document.getElementById('approvals-tab-pending');
    if (!panel) return;
    panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const data = await API.get('/approvals/pending');
      const items = Array.isArray(data) ? data : (data.data || data.approvals || []);

      // Update sidebar badge
      const badge = document.getElementById('approvals-pending-badge');
      if (badge) {
        badge.textContent = items.length;
        badge.style.display = items.length > 0 ? 'inline-flex' : 'none';
      }

      const typeColors = { PO: '#8B5CF6', Invoice: '#3B82F6', WO: '#F59E0B', po: '#8B5CF6', invoice: '#3B82F6', work_order: '#F59E0B' };
      const typeLabels = { po: 'PO', purchase_order: 'PO', invoice: 'Invoice', work_order: 'WO' };

      if (items.length === 0) {
        panel.innerHTML = `
          <div class="empty-state">
            <i data-lucide="check-circle" class="empty-icon"></i>
            <h2>No Pending Approvals</h2>
            <p>All items have been reviewed. Check back later.</p>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      panel.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:16px">
          ${items.map(item => {
            const typeKey = (item.entity_type || item.type || '').toLowerCase();
            const typeLabel = typeLabels[typeKey] || item.entity_type || item.type || 'Item';
            const typeColor = typeColors[typeKey] || typeColors[typeLabel] || '#6B7280';

            return `
              <div class="card">
                <div class="card-body" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
                  <div style="flex:1;min-width:200px">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                      <span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:0.75rem;font-weight:700;color:#fff;background:${typeColor}">${typeLabel}</span>
                      <strong>${item.title || item.identifier || item.entity_title || 'Untitled'}</strong>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:0.875rem;color:var(--text-muted)">
                      ${item.requested_by_name || item.requester_name ? `
                        <span class="user-cell" style="display:inline-flex;align-items:center;gap:4px">
                          <div class="user-avatar-sm" style="background:${item.requester_avatar_color || '#3B82F6'};width:20px;height:20px;font-size:0.625rem">
                            ${((item.requested_by_name || item.requester_name || 'U').charAt(0)).toUpperCase()}
                          </div>
                          ${item.requested_by_name || item.requester_name}
                        </span>
                      ` : ''}
                      ${item.created_at ? `
                        <span>${new Date(item.created_at).toLocaleDateString()}</span>
                      ` : ''}
                      ${item.amount != null ? `
                        <span style="font-weight:600">$${Number(item.amount).toFixed(2)}</span>
                      ` : ''}
                      ${item.value != null && item.amount == null ? `
                        <span style="font-weight:600">${item.value}</span>
                      ` : ''}
                    </div>
                  </div>
                  <div style="display:flex;gap:8px;flex-shrink:0">
                    <button class="btn btn-sm" style="background:#10B981;color:#fff;border:none" onclick="Approvals.approve('${item.id}')">
                      <i data-lucide="check" style="width:14px;height:14px"></i> Approve
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="Approvals.showRejectModal('${item.id}')">
                      <i data-lucide="x" style="width:14px;height:14px"></i> Reject
                    </button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      panel.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async approve(id) {
    if (!confirm('Approve this item?')) return;
    try {
      await API.post('/approvals/' + id + '/approve');
      App.toast('Approved', 'success');
      this.loadPendingTab();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  showRejectModal(id) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Reject Approval';
    modal.querySelector('.modal-body').innerHTML = `
      <div class="form-group">
        <label for="reject-notes">Reason for rejection *</label>
        <textarea id="reject-notes" class="form-control" rows="4" required placeholder="Provide a reason for rejection..."></textarea>
      </div>
    `;
    modal.querySelector('.modal-footer').innerHTML = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="Approvals.reject('${id}')">Reject</button>
    `;
    modal.style.display = 'flex';
  },

  async reject(id) {
    const notes = document.getElementById('reject-notes');
    if (!notes || !notes.value.trim()) {
      App.toast('Please provide a reason for rejection', 'error');
      return;
    }
    try {
      await API.post('/approvals/' + id + '/reject', { notes: notes.value });
      App.closeModal();
      App.toast('Rejected', 'success');
      this.loadPendingTab();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async loadRulesTab() {
    const panel = document.getElementById('approvals-tab-rules');
    if (!panel) return;
    panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const data = await API.get('/approvals/rules');
      const rules = Array.isArray(data) ? data : (data.data || data.rules || []);

      panel.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3>Approval Rules</h3>
            <button class="btn btn-sm btn-primary" onclick="Approvals.showRuleModal()">
              <i data-lucide="plus"></i> Add Rule
            </button>
          </div>
          <div class="card-body no-padding">
            ${rules.length === 0 ? `
              <div class="empty-state">
                <i data-lucide="shield" class="empty-icon"></i>
                <h2>No Approval Rules</h2>
                <p>Create rules to require approval for certain actions.</p>
              </div>
            ` : `
              <table class="table">
                <thead>
                  <tr>
                    <th>Entity Type</th>
                    <th>Condition</th>
                    <th>Required Role</th>
                    <th>Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${rules.map(rule => `
                    <tr>
                      <td><strong>${(rule.entity_type || '-').replace(/_/g, ' ')}</strong></td>
                      <td>${rule.description || rule.condition_description || ((rule.condition_field || '') + ' ' + (rule.operator || '') + ' ' + (rule.value || ''))}</td>
                      <td><span class="role-badge role-${rule.required_role || 'admin'}">${rule.required_role || 'admin'}</span></td>
                      <td>
                        <label style="display:flex;align-items:center;cursor:pointer">
                          <input type="checkbox" ${rule.active !== false ? 'checked' : ''} onchange="Approvals.toggleRule('${rule.id}', this.checked)">
                        </label>
                      </td>
                      <td>
                        <button class="btn btn-sm btn-secondary" onclick="Approvals.showRuleModal('${rule.id}')">
                          <i data-lucide="edit" style="width:14px;height:14px"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="Approvals.deleteRule('${rule.id}')">
                          <i data-lucide="trash-2" style="width:14px;height:14px"></i>
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      panel.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async showRuleModal(ruleId) {
    const modal = document.getElementById('modal-overlay');
    const isEdit = !!ruleId;
    modal.querySelector('.modal-title').textContent = isEdit ? 'Edit Approval Rule' : 'Add Approval Rule';
    modal.querySelector('.modal-footer').innerHTML = '';

    let rule = { entity_type: 'work_order', condition_field: '', operator: '>', value: '', required_role: 'admin', description: '', active: true };

    if (isEdit) {
      modal.querySelector('.modal-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      modal.style.display = 'flex';
      try {
        const data = await API.get('/approvals/rules/' + ruleId);
        rule = data || rule;
      } catch (e) {
        // use defaults
      }
    }

    modal.querySelector('.modal-body').innerHTML = `
      <form id="rule-form" onsubmit="Approvals.saveRule(event, ${isEdit ? "'" + ruleId + "'" : 'null'})">
        <div class="form-group">
          <label for="rule-entity-type">Entity Type</label>
          <select id="rule-entity-type" class="form-control">
            <option value="work_order" ${rule.entity_type === 'work_order' ? 'selected' : ''}>Work Order</option>
            <option value="purchase_order" ${rule.entity_type === 'purchase_order' ? 'selected' : ''}>Purchase Order</option>
            <option value="invoice" ${rule.entity_type === 'invoice' ? 'selected' : ''}>Invoice</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="rule-field">Condition Field</label>
            <input type="text" id="rule-field" class="form-control" value="${rule.condition_field || ''}" placeholder="e.g., total, amount">
          </div>
          <div class="form-group">
            <label for="rule-operator">Operator</label>
            <select id="rule-operator" class="form-control">
              <option value=">" ${rule.operator === '>' ? 'selected' : ''}>Greater than (>)</option>
              <option value=">=" ${rule.operator === '>=' ? 'selected' : ''}>Greater or equal (>=)</option>
              <option value="<" ${rule.operator === '<' ? 'selected' : ''}>Less than (<)</option>
              <option value="=" ${rule.operator === '=' ? 'selected' : ''}>Equal (=)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="rule-value">Value</label>
            <input type="text" id="rule-value" class="form-control" value="${rule.value || ''}" placeholder="e.g., 5000">
          </div>
        </div>
        <div class="form-group">
          <label for="rule-role">Required Approver Role</label>
          <select id="rule-role" class="form-control">
            <option value="admin" ${rule.required_role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="manager" ${rule.required_role === 'manager' ? 'selected' : ''}>Manager</option>
          </select>
        </div>
        <div class="form-group">
          <label for="rule-desc">Description</label>
          <input type="text" id="rule-desc" class="form-control" value="${rule.description || ''}" placeholder="e.g., Total > $5,000">
        </div>
        <div id="rule-form-error" class="form-error" style="display:none"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="rule-submit">${isEdit ? 'Save Changes' : 'Add Rule'}</button>
        </div>
      </form>
    `;
    modal.style.display = 'flex';
    lucide.createIcons();
  },

  async saveRule(e, ruleId) {
    e.preventDefault();
    const btn = document.getElementById('rule-submit');
    const errorEl = document.getElementById('rule-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const body = {
        entity_type: document.getElementById('rule-entity-type').value,
        condition_field: document.getElementById('rule-field').value,
        operator: document.getElementById('rule-operator').value,
        value: document.getElementById('rule-value').value,
        required_role: document.getElementById('rule-role').value,
        description: document.getElementById('rule-desc').value,
        active: true
      };

      if (ruleId) {
        await API.put('/approvals/rules/' + ruleId, body);
      } else {
        await API.post('/approvals/rules', body);
      }

      App.closeModal();
      App.toast(ruleId ? 'Rule updated' : 'Rule created', 'success');
      this.loadRulesTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = ruleId ? 'Save Changes' : 'Add Rule';
    }
  },

  async toggleRule(ruleId, active) {
    try {
      await API.put('/approvals/rules/' + ruleId, { active });
      App.toast(active ? 'Rule activated' : 'Rule deactivated', 'success');
    } catch (e) {
      App.toast(e.message, 'error');
      this.loadRulesTab();
    }
  },

  async deleteRule(ruleId) {
    if (!confirm('Delete this approval rule?')) return;
    try {
      await API.delete('/approvals/rules/' + ruleId);
      App.toast('Rule deleted', 'success');
      this.loadRulesTab();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
