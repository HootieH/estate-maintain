const { db } = require('../db');

// Reuse encryption from billcom service
const BillcomService = require('./billcom');
const { encrypt, decrypt } = BillcomService;

function getConfig(key) {
  const row = db.prepare('SELECT config_value, is_secret FROM integration_configs WHERE provider = ? AND config_key = ?').get('quickbooks', key);
  if (!row) return null;
  return row.is_secret ? decrypt(row.config_value) : row.config_value;
}

function setConfig(key, value, isSecret = false) {
  const stored = isSecret ? encrypt(value) : value;
  db.prepare(`
    INSERT INTO integration_configs (provider, config_key, config_value, is_secret, updated_at)
    VALUES ('quickbooks', ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(provider, config_key) DO UPDATE SET config_value = ?, is_secret = ?, updated_at = CURRENT_TIMESTAMP
  `).run(key, stored, isSecret ? 1 : 0, stored, isSecret ? 1 : 0);
}

function logSync(entityType, entityId, externalId, direction, status, details, errorMessage) {
  db.prepare(
    'INSERT INTO sync_log (provider, entity_type, entity_id, external_id, direction, status, details, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('quickbooks', entityType, entityId, externalId, direction, status, details || null, errorMessage || null);
}

async function apiRequest(method, endpoint, body) {
  const realmId = getConfig('realm_id');
  const accessToken = getConfig('access_token');
  if (!accessToken || !realmId) throw new Error('QuickBooks not connected. Configure credentials in Integrations settings.');

  const baseUrl = getConfig('api_base_url') || 'https://sandbox-quickbooks.api.intuit.com';
  const url = `${baseUrl}/v3/company/${realmId}${endpoint}`;

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) return apiRequest(method, endpoint, body);
    }
    const fault = data.Fault?.Error?.[0]?.Detail || data.message || `QBO API error: ${response.status}`;
    throw new Error(fault);
  }

  return data;
}

async function refreshToken() {
  const refreshTokenVal = getConfig('refresh_token');
  const clientId = getConfig('client_id');
  const clientSecret = getConfig('client_secret');
  if (!refreshTokenVal || !clientId || !clientSecret) return false;

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshTokenVal
      })
    });
    const data = await response.json();
    if (data.access_token) {
      setConfig('access_token', data.access_token, true);
      if (data.refresh_token) setConfig('refresh_token', data.refresh_token, true);
      return true;
    }
  } catch (e) {
    logSync('auth', null, null, 'pull', 'error', 'Token refresh failed', e.message);
  }
  return false;
}

const QuickBooksService = {
  getConfig,
  setConfig,

  isConnected() {
    return !!getConfig('access_token') && !!getConfig('realm_id');
  },

  getAuthorizationUrl() {
    const clientId = getConfig('client_id');
    const redirectUri = getConfig('redirect_uri') || 'http://localhost:3000/api/integrations/quickbooks/callback';
    if (!clientId) throw new Error('QuickBooks Client ID not configured. Go to Integrations settings.');
    return `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=com.intuit.quickbooks.accounting&state=qbo`;
  },

  async handleCallback(code, realmId) {
    const clientId = getConfig('client_id');
    const clientSecret = getConfig('client_secret');
    const redirectUri = getConfig('redirect_uri') || 'http://localhost:3000/api/integrations/quickbooks/callback';

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      })
    });
    const data = await response.json();
    if (!data.access_token) throw new Error('Failed to get access token from QuickBooks');

    setConfig('access_token', data.access_token, true);
    if (data.refresh_token) setConfig('refresh_token', data.refresh_token, true);
    setConfig('realm_id', realmId, false);
    setConfig('connected_at', new Date().toISOString(), false);

    logSync('auth', null, null, 'pull', 'success', 'OAuth connected');
    return true;
  },

  disconnect() {
    db.prepare("DELETE FROM integration_configs WHERE provider = 'quickbooks' AND config_key IN ('access_token', 'refresh_token', 'connected_at', 'realm_id')").run();
    logSync('auth', null, null, 'push', 'success', 'Disconnected');
  },

  async syncChartOfAccounts() {
    try {
      const data = await apiRequest('GET', "/query?query=SELECT * FROM Account WHERE AccountType IN ('Expense', 'Cost of Goods Sold', 'Other Current Asset', 'Other Current Liability') MAXRESULTS 200");
      const accounts = data.QueryResponse?.Account || [];

      let synced = 0;
      for (const acct of accounts) {
        const existing = db.prepare('SELECT id FROM gl_accounts WHERE qbo_account_id = ?').get(String(acct.Id));
        if (existing) {
          db.prepare('UPDATE gl_accounts SET name = ?, account_number = ?, account_type = ?, is_active = ? WHERE id = ?')
            .run(acct.FullyQualifiedName || acct.Name, acct.AccountNumber || null,
              acct.AccountType === 'Expense' ? 'expense' : acct.AccountType === 'Cost of Goods Sold' ? 'cogs' : 'asset',
              acct.Active ? 1 : 0, existing.id);
        } else {
          db.prepare('INSERT INTO gl_accounts (name, account_number, qbo_account_id, account_type, is_active) VALUES (?, ?, ?, ?, ?)')
            .run(acct.FullyQualifiedName || acct.Name, acct.AccountNumber || null, String(acct.Id),
              acct.AccountType === 'Expense' ? 'expense' : acct.AccountType === 'Cost of Goods Sold' ? 'cogs' : 'asset',
              acct.Active ? 1 : 0);
        }
        synced++;
      }

      logSync('gl_account', null, null, 'pull', 'success', `Synced ${synced} accounts`);
      return synced;
    } catch (e) {
      logSync('gl_account', null, null, 'pull', 'error', null, e.message);
      throw e;
    }
  },

  async syncClasses() {
    try {
      const data = await apiRequest('GET', "/query?query=SELECT * FROM Class MAXRESULTS 100");
      const classes = data.QueryResponse?.Class || [];

      let synced = 0;
      for (const cls of classes) {
        // Try to match to a property by name
        const property = db.prepare('SELECT id FROM properties WHERE name = ? OR name LIKE ?').get(cls.Name, `%${cls.Name}%`);
        if (property) {
          db.prepare('UPDATE properties SET qbo_class_id = ? WHERE id = ?').run(String(cls.Id), property.id);
          synced++;
        }
      }

      logSync('class', null, null, 'pull', 'success', `Synced ${synced} classes to properties`);
      return { totalClasses: classes.length, mapped: synced };
    } catch (e) {
      logSync('class', null, null, 'pull', 'error', null, e.message);
      throw e;
    }
  }
};

module.exports = QuickBooksService;
