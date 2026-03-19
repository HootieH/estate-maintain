const Integrations = {
  async render() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading integrations...</p></div>';

    try {
      const [status, config] = await Promise.all([
        API.get('/integrations/status').catch(() => ({ billcom: {}, quickbooks: {} })),
        Promise.resolve({}) // configs loaded per-card
      ]);

      container.innerHTML = `
        <div class="page-header">
          <h1><i data-lucide="plug-zap" style="width:24px;height:24px;margin-right:8px;vertical-align:middle"></i> Integrations</h1>
        </div>

        <p style="color:var(--text-muted);margin-bottom:24px;max-width:640px">
          Connect your accounting tools to streamline the payment workflow. Approved invoices flow to Bill.com for payment, and Bill.com syncs with QuickBooks for accounting records.
        </p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:32px">
          ${this.renderBillcomCard(status.billcom)}
          ${this.renderQBOCard(status.quickbooks)}
        </div>

        <div class="card" style="margin-bottom:24px">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3>GL Account Mapping</h3>
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm btn-secondary" onclick="Integrations.syncGLAccounts()"><i data-lucide="refresh-cw"></i> Sync from QuickBooks</button>
              <button class="btn btn-sm btn-primary" onclick="Integrations.showAddGLAccount()"><i data-lucide="plus"></i> Add Manual</button>
            </div>
          </div>
          <div class="card-body" id="gl-accounts-list">
            <div class="loading"><div class="spinner"></div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3>Sync Log</h3>
            <button class="btn btn-sm btn-secondary" onclick="Integrations.refreshSyncLog()"><i data-lucide="refresh-cw"></i> Refresh</button>
          </div>
          <div class="card-body" id="sync-log-list">
            <div class="loading"><div class="spinner"></div></div>
          </div>
        </div>
      `;

      lucide.createIcons();
      this.loadGLAccounts();
      this.loadSyncLog();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  renderBillcomCard(status) {
    const connected = status.connected;
    return `
      <div class="card integration-card">
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <div style="width:48px;height:48px;border-radius:12px;background:#00C853;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:16px">B</div>
            <div>
              <strong style="font-size:16px">Bill.com</strong>
              <div style="font-size:12px;color:${connected ? 'var(--success)' : 'var(--text-muted)'}">
                <i data-lucide="${connected ? 'check-circle' : 'circle'}" style="width:12px;height:12px;vertical-align:middle"></i>
                ${connected ? 'Connected' : 'Not connected'}
              </div>
            </div>
          </div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Send approved invoices to Bill.com for vendor payment via ACH or check.</p>
          ${!connected ? `
            <div style="margin-bottom:12px">
              <div class="form-group" style="margin-bottom:8px">
                <label style="font-size:12px">Client ID</label>
                <input type="text" id="billcom-client-id" class="form-control" placeholder="Your Bill.com Client ID">
              </div>
              <div class="form-group" style="margin-bottom:8px">
                <label style="font-size:12px">Client Secret</label>
                <input type="password" id="billcom-client-secret" class="form-control" placeholder="Your Bill.com Client Secret">
              </div>
              <div class="form-group" style="margin-bottom:8px">
                <label style="font-size:12px">Redirect URI</label>
                <input type="text" id="billcom-redirect-uri" class="form-control" value="${window.location.origin}/api/integrations/billcom/callback">
              </div>
              <button class="btn btn-primary btn-sm" onclick="Integrations.connectBillcom()"><i data-lucide="link"></i> Save & Connect</button>
            </div>
          ` : `
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">
              ${status.lastSync ? `Last sync: ${Dashboard.formatDate(status.lastSync)}` : 'No syncs yet'}
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm btn-secondary" onclick="Integrations.syncPaymentStatus()"><i data-lucide="refresh-cw"></i> Sync Payments</button>
              <button class="btn btn-sm btn-danger" onclick="Integrations.disconnectBillcom()"><i data-lucide="unplug"></i> Disconnect</button>
            </div>
          `}
        </div>
      </div>
    `;
  },

  renderQBOCard(status) {
    const connected = status.connected;
    return `
      <div class="card integration-card">
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <div style="width:48px;height:48px;border-radius:12px;background:#2CA01C;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px">QB</div>
            <div>
              <strong style="font-size:16px">QuickBooks Online</strong>
              <div style="font-size:12px;color:${connected ? 'var(--success)' : 'var(--text-muted)'}">
                <i data-lucide="${connected ? 'check-circle' : 'circle'}" style="width:12px;height:12px;vertical-align:middle"></i>
                ${connected ? 'Connected' : 'Not connected'}
              </div>
            </div>
          </div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Sync GL accounts for expense categorization. Bill.com handles the accounting sync.</p>
          ${!connected ? `
            <div style="margin-bottom:12px">
              <div class="form-group" style="margin-bottom:8px">
                <label style="font-size:12px">Client ID</label>
                <input type="text" id="qbo-client-id" class="form-control" placeholder="Your Intuit Client ID">
              </div>
              <div class="form-group" style="margin-bottom:8px">
                <label style="font-size:12px">Client Secret</label>
                <input type="password" id="qbo-client-secret" class="form-control" placeholder="Your Intuit Client Secret">
              </div>
              <div class="form-group" style="margin-bottom:8px">
                <label style="font-size:12px">Redirect URI</label>
                <input type="text" id="qbo-redirect-uri" class="form-control" value="${window.location.origin}/api/integrations/quickbooks/callback">
              </div>
              <button class="btn btn-primary btn-sm" onclick="Integrations.connectQBO()"><i data-lucide="link"></i> Save & Connect</button>
            </div>
          ` : `
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">
              ${status.lastSync ? `Last sync: ${Dashboard.formatDate(status.lastSync)}` : 'No syncs yet'}
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm btn-secondary" onclick="Integrations.syncGLAccounts()"><i data-lucide="refresh-cw"></i> Sync Accounts</button>
              <button class="btn btn-sm btn-secondary" onclick="Integrations.syncClasses()"><i data-lucide="refresh-cw"></i> Sync Classes</button>
              <button class="btn btn-sm btn-danger" onclick="Integrations.disconnectQBO()"><i data-lucide="unplug"></i> Disconnect</button>
            </div>
          `}
        </div>
      </div>
    `;
  },

  async connectBillcom() {
    try {
      await API.post('/integrations/billcom/config', {
        client_id: document.getElementById('billcom-client-id').value,
        client_secret: document.getElementById('billcom-client-secret').value,
        redirect_uri: document.getElementById('billcom-redirect-uri').value
      });
      const { url } = await API.get('/integrations/billcom/auth');
      window.location.href = url;
    } catch (e) { App.toast(e.message, 'error'); }
  },

  async connectQBO() {
    try {
      await API.post('/integrations/quickbooks/config', {
        client_id: document.getElementById('qbo-client-id').value,
        client_secret: document.getElementById('qbo-client-secret').value,
        redirect_uri: document.getElementById('qbo-redirect-uri').value
      });
      const { url } = await API.get('/integrations/quickbooks/auth');
      window.location.href = url;
    } catch (e) { App.toast(e.message, 'error'); }
  },

  async disconnectBillcom() {
    if (!confirm('Disconnect Bill.com?')) return;
    try { await API.post('/integrations/billcom/disconnect'); App.toast('Disconnected', 'success'); this.render(); } catch (e) { App.toast(e.message, 'error'); }
  },

  async disconnectQBO() {
    if (!confirm('Disconnect QuickBooks?')) return;
    try { await API.post('/integrations/quickbooks/disconnect'); App.toast('Disconnected', 'success'); this.render(); } catch (e) { App.toast(e.message, 'error'); }
  },

  async syncPaymentStatus() {
    try {
      const result = await API.post('/integrations/sync/payment-status');
      App.toast(`Checked ${result.updated} invoices`, 'success');
    } catch (e) { App.toast(e.message, 'error'); }
  },

  async syncGLAccounts() {
    try {
      const result = await API.post('/integrations/sync/gl-accounts');
      App.toast(result.message || 'GL accounts synced', 'success');
      this.loadGLAccounts();
    } catch (e) { App.toast(e.message, 'error'); }
  },

  async syncClasses() {
    try {
      const result = await API.post('/integrations/sync/classes');
      App.toast(`Mapped ${result.mapped} of ${result.totalClasses} classes to properties`, 'success');
    } catch (e) { App.toast(e.message, 'error'); }
  },

  async loadGLAccounts() {
    const el = document.getElementById('gl-accounts-list');
    if (!el) return;
    try {
      const accounts = await API.get('/integrations/gl-accounts');
      if (accounts.length === 0) {
        el.innerHTML = '<div class="empty-state-sm">No GL accounts. Sync from QuickBooks or add manually.</div>';
        return;
      }
      el.innerHTML = `
        <table class="table table-sm">
          <thead><tr><th>Account #</th><th>Name</th><th>Type</th><th>QBO ID</th></tr></thead>
          <tbody>
            ${accounts.map(a => `
              <tr>
                <td>${a.account_number || '-'}</td>
                <td>${a.name}</td>
                <td>${a.account_type}</td>
                <td>${a.qbo_account_id || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) { el.innerHTML = `<p>${e.message}</p>`; }
  },

  async loadSyncLog() {
    const el = document.getElementById('sync-log-list');
    if (!el) return;
    try {
      const data = await API.get('/integrations/sync/log?limit=20');
      const logs = data.data || [];
      if (logs.length === 0) {
        el.innerHTML = '<div class="empty-state-sm">No sync activity yet.</div>';
        return;
      }
      el.innerHTML = `
        <table class="table table-sm">
          <thead><tr><th>Time</th><th>Provider</th><th>Type</th><th>Direction</th><th>Status</th><th>Details</th></tr></thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td style="white-space:nowrap">${Dashboard.formatDate(l.created_at)}</td>
                <td><span class="badge" style="background:${l.provider === 'billcom' ? '#00C853' : '#2CA01C'}20;color:${l.provider === 'billcom' ? '#00C853' : '#2CA01C'}">${l.provider}</span></td>
                <td>${l.entity_type}</td>
                <td>${l.direction || '-'}</td>
                <td><span class="badge badge-status-${l.status === 'success' ? 'completed' : l.status === 'error' ? 'cancelled' : 'open'}">${l.status}</span></td>
                <td style="font-size:12px;color:var(--text-muted)">${l.error_message || l.details || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) { el.innerHTML = `<p>${e.message}</p>`; }
  },

  refreshSyncLog() { this.loadSyncLog(); },

  showAddGLAccount() {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Add GL Account';
    modal.querySelector('.modal-body').innerHTML = `
      <form onsubmit="Integrations.handleAddGLAccount(event)">
        <div class="form-group"><label>Account Name *</label><input type="text" id="gl-name" class="form-control" required placeholder="e.g., Maintenance Supplies"></div>
        <div class="form-group"><label>Account Number</label><input type="text" id="gl-number" class="form-control" placeholder="e.g., 6200"></div>
        <div class="form-group"><label>Type</label>
          <select id="gl-type" class="form-control">
            <option value="expense">Expense</option>
            <option value="cogs">Cost of Goods Sold</option>
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Account</button>
        </div>
      </form>
    `;
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';
  },

  async handleAddGLAccount(e) {
    e.preventDefault();
    try {
      await API.post('/integrations/gl-accounts', {
        name: document.getElementById('gl-name').value,
        account_number: document.getElementById('gl-number').value || null,
        account_type: document.getElementById('gl-type').value
      });
      App.closeModal();
      App.toast('GL account added', 'success');
      this.loadGLAccounts();
    } catch (e) { App.toast(e.message, 'error'); }
  }
};
