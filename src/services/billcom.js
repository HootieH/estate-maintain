const crypto = require('crypto');
const { db } = require('../db');

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) return null;
  return crypto.createHash('sha256').update(key).digest();
}

function encrypt(text) {
  const key = getEncryptionKey();
  if (!key) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

function decrypt(text) {
  const key = getEncryptionKey();
  if (!key || !text || !text.includes(':')) return text;
  try {
    const [ivHex, authTagHex, encryptedHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return text;
  }
}

function getConfig(key) {
  const row = db.prepare('SELECT config_value, is_secret FROM integration_configs WHERE provider = ? AND config_key = ?').get('billcom', key);
  if (!row) return null;
  return row.is_secret ? decrypt(row.config_value) : row.config_value;
}

function setConfig(key, value, isSecret = false) {
  const stored = isSecret ? encrypt(value) : value;
  db.prepare(`
    INSERT INTO integration_configs (provider, config_key, config_value, is_secret, updated_at)
    VALUES ('billcom', ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(provider, config_key) DO UPDATE SET config_value = ?, is_secret = ?, updated_at = CURRENT_TIMESTAMP
  `).run(key, stored, isSecret ? 1 : 0, stored, isSecret ? 1 : 0);
}

function logSync(entityType, entityId, externalId, direction, status, details, errorMessage) {
  db.prepare(
    'INSERT INTO sync_log (provider, entity_type, entity_id, external_id, direction, status, details, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('billcom', entityType, entityId, externalId, direction, status, details || null, errorMessage || null);
}

async function apiRequest(method, endpoint, body) {
  const baseUrl = getConfig('api_base_url') || 'https://api-sandbox.bill.com/api/v2';
  const accessToken = getConfig('access_token');
  if (!accessToken) throw new Error('Bill.com not connected. Configure credentials in Integrations settings.');

  const url = `${baseUrl}${endpoint}`;
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
    // Try token refresh on 401
    if (response.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) return apiRequest(method, endpoint, body);
    }
    throw new Error(data.message || data.error || `Bill.com API error: ${response.status}`);
  }

  return data;
}

async function refreshToken() {
  const refreshTokenVal = getConfig('refresh_token');
  const clientId = getConfig('client_id');
  const clientSecret = getConfig('client_secret');
  if (!refreshTokenVal || !clientId || !clientSecret) return false;

  try {
    const response = await fetch('https://oauth.bill.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshTokenVal,
        client_id: clientId,
        client_secret: clientSecret
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

const BillcomService = {
  encrypt,
  decrypt,
  getConfig,
  setConfig,

  isConnected() {
    return !!getConfig('access_token');
  },

  getAuthorizationUrl() {
    const clientId = getConfig('client_id');
    const redirectUri = getConfig('redirect_uri') || 'http://localhost:3000/api/integrations/billcom/callback';
    if (!clientId) throw new Error('Bill.com Client ID not configured. Go to Integrations settings.');
    return `https://oauth.bill.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read write`;
  },

  async handleCallback(code) {
    const clientId = getConfig('client_id');
    const clientSecret = getConfig('client_secret');
    const redirectUri = getConfig('redirect_uri') || 'http://localhost:3000/api/integrations/billcom/callback';

    const response = await fetch('https://oauth.bill.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri
      })
    });
    const data = await response.json();
    if (!data.access_token) throw new Error('Failed to get access token from Bill.com');

    setConfig('access_token', data.access_token, true);
    if (data.refresh_token) setConfig('refresh_token', data.refresh_token, true);
    if (data.organization_id) setConfig('organization_id', data.organization_id, false);
    setConfig('connected_at', new Date().toISOString(), false);

    logSync('auth', null, null, 'pull', 'success', 'OAuth connected');
    return true;
  },

  disconnect() {
    db.prepare("DELETE FROM integration_configs WHERE provider = 'billcom' AND config_key IN ('access_token', 'refresh_token', 'connected_at', 'organization_id')").run();
    logSync('auth', null, null, 'push', 'success', 'Disconnected');
  },

  async ensureVendor(vendorId) {
    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(vendorId);
    if (!vendor) throw new Error('Vendor not found');

    if (vendor.billcom_vendor_id) return vendor.billcom_vendor_id;

    try {
      const result = await apiRequest('POST', '/vendor', {
        name: vendor.name,
        email: vendor.email || undefined,
        phone: vendor.phone || undefined,
        address: vendor.address || undefined
      });

      const billcomId = result.id || result.data?.id;
      if (billcomId) {
        db.prepare('UPDATE vendors SET billcom_vendor_id = ? WHERE id = ?').run(billcomId, vendorId);
        logSync('vendor', vendorId, billcomId, 'push', 'success', `Vendor "${vendor.name}" synced`);
      }
      return billcomId;
    } catch (e) {
      logSync('vendor', vendorId, null, 'push', 'error', null, e.message);
      throw e;
    }
  },

  async createBill(invoice, lineItems, billcomVendorId) {
    try {
      const result = await apiRequest('POST', '/bill', {
        vendorId: billcomVendorId,
        invoiceNumber: invoice.invoice_number,
        invoiceDate: invoice.invoice_date,
        dueDate: invoice.due_date,
        amount: invoice.total_amount,
        lineItems: lineItems.map(li => ({
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unit_cost,
          amount: li.amount
        }))
      });

      const billId = result.id || result.data?.id;
      logSync('invoice', invoice.id, billId, 'push', 'success', `Bill created for invoice #${invoice.invoice_number}`);
      return billId;
    } catch (e) {
      logSync('invoice', invoice.id, null, 'push', 'error', null, e.message);
      throw e;
    }
  },

  async getBillStatus(billcomBillId) {
    try {
      const result = await apiRequest('GET', `/bill/${billcomBillId}`);
      const status = result.paymentStatus || result.data?.paymentStatus || result.status;
      logSync('bill', null, billcomBillId, 'pull', 'success', `Status: ${status}`);
      return status;
    } catch (e) {
      logSync('bill', null, billcomBillId, 'pull', 'error', null, e.message);
      throw e;
    }
  }
};

module.exports = BillcomService;
