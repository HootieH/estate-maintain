const express = require('express');
const { db } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

// GET /status - Connection status for all integrations
router.get('/status', (req, res) => {
  try {
    const SyncService = require('../services/sync');
    res.json(SyncService.getConnectionStatus());
  } catch (err) {
    res.status(500).json({ error: 'Failed to get status', details: err.message });
  }
});

// POST /billcom/config - Save Bill.com credentials (admin only)
router.post('/billcom/config', requireRole('admin'), (req, res) => {
  try {
    const BillcomService = require('../services/billcom');
    const { client_id, client_secret, redirect_uri, api_base_url } = req.body;
    if (client_id) BillcomService.setConfig('client_id', client_id, true);
    if (client_secret) BillcomService.setConfig('client_secret', client_secret, true);
    if (redirect_uri) BillcomService.setConfig('redirect_uri', redirect_uri, false);
    if (api_base_url) BillcomService.setConfig('api_base_url', api_base_url, false);
    res.json({ message: 'Bill.com configuration saved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save config', details: err.message });
  }
});

// GET /billcom/auth - Get OAuth URL
router.get('/billcom/auth', requireRole('admin'), (req, res) => {
  try {
    const BillcomService = require('../services/billcom');
    const url = BillcomService.getAuthorizationUrl();
    res.json({ url });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /billcom/callback - OAuth callback
router.get('/billcom/callback', async (req, res) => {
  try {
    const BillcomService = require('../services/billcom');
    await BillcomService.handleCallback(req.query.code);
    res.redirect('/#/integrations?billcom=connected');
  } catch (err) {
    res.redirect(`/#/integrations?billcom=error&message=${encodeURIComponent(err.message)}`);
  }
});

// POST /billcom/disconnect
router.post('/billcom/disconnect', requireRole('admin'), (req, res) => {
  try {
    const BillcomService = require('../services/billcom');
    BillcomService.disconnect();
    res.json({ message: 'Bill.com disconnected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect', details: err.message });
  }
});

// POST /quickbooks/config - Save QBO credentials
router.post('/quickbooks/config', requireRole('admin'), (req, res) => {
  try {
    const QBOService = require('../services/quickbooks');
    const { client_id, client_secret, redirect_uri, api_base_url } = req.body;
    if (client_id) QBOService.setConfig('client_id', client_id, true);
    if (client_secret) QBOService.setConfig('client_secret', client_secret, true);
    if (redirect_uri) QBOService.setConfig('redirect_uri', redirect_uri, false);
    if (api_base_url) QBOService.setConfig('api_base_url', api_base_url, false);
    res.json({ message: 'QuickBooks configuration saved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save config', details: err.message });
  }
});

// GET /quickbooks/auth - Get OAuth URL
router.get('/quickbooks/auth', requireRole('admin'), (req, res) => {
  try {
    const QBOService = require('../services/quickbooks');
    const url = QBOService.getAuthorizationUrl();
    res.json({ url });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /quickbooks/callback - OAuth callback
router.get('/quickbooks/callback', async (req, res) => {
  try {
    const QBOService = require('../services/quickbooks');
    await QBOService.handleCallback(req.query.code, req.query.realmId);
    res.redirect('/#/integrations?quickbooks=connected');
  } catch (err) {
    res.redirect(`/#/integrations?quickbooks=error&message=${encodeURIComponent(err.message)}`);
  }
});

// POST /quickbooks/disconnect
router.post('/quickbooks/disconnect', requireRole('admin'), (req, res) => {
  try {
    const QBOService = require('../services/quickbooks');
    QBOService.disconnect();
    res.json({ message: 'QuickBooks disconnected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect', details: err.message });
  }
});

// POST /sync/gl-accounts - Sync chart of accounts from QBO
router.post('/sync/gl-accounts', requireRole('admin'), async (req, res) => {
  try {
    const SyncService = require('../services/sync');
    const count = await SyncService.syncGLAccounts();
    res.json({ message: `Synced ${count} GL accounts from QuickBooks` });
  } catch (err) {
    res.status(500).json({ error: 'GL sync failed', details: err.message });
  }
});

// POST /sync/classes - Sync classes (map to properties)
router.post('/sync/classes', requireRole('admin'), async (req, res) => {
  try {
    const SyncService = require('../services/sync');
    const result = await SyncService.syncClasses();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Class sync failed', details: err.message });
  }
});

// POST /sync/payment-status - Poll Bill.com for payment updates
router.post('/sync/payment-status', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const SyncService = require('../services/sync');
    const results = await SyncService.pollPaymentStatuses();
    res.json({ updated: results.length, results });
  } catch (err) {
    res.status(500).json({ error: 'Payment status sync failed', details: err.message });
  }
});

// GET /gl-accounts - List GL accounts
router.get('/gl-accounts', (req, res) => {
  try {
    const accounts = db.prepare('SELECT * FROM gl_accounts WHERE is_active = 1 ORDER BY account_number, name').all();
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch GL accounts', details: err.message });
  }
});

// POST /gl-accounts - Create GL account manually
router.post('/gl-accounts', requireRole('admin'), (req, res) => {
  try {
    const { name, account_number, account_type, category } = req.body;
    if (!name) return res.status(400).json({ error: 'Account name is required' });
    const result = db.prepare('INSERT INTO gl_accounts (name, account_number, account_type, category) VALUES (?, ?, ?, ?)')
      .run(name, account_number || null, account_type || 'expense', category || null);
    const account = db.prepare('SELECT * FROM gl_accounts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(account);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create GL account', details: err.message });
  }
});

// GET /sync/log - Recent sync log
router.get('/sync/log', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const logs = db.prepare('SELECT * FROM sync_log ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
    const { total } = db.prepare('SELECT COUNT(*) as total FROM sync_log').get();
    res.json({ data: logs, pagination: { page, limit, total } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sync log', details: err.message });
  }
});

// GET /config/:provider - Get non-secret config for a provider (admin only)
router.get('/config/:provider', requireRole('admin'), (req, res) => {
  try {
    const configs = db.prepare('SELECT config_key, config_value, is_secret, updated_at FROM integration_configs WHERE provider = ?').all(req.params.provider);
    const result = {};
    configs.forEach(c => {
      result[c.config_key] = c.is_secret ? '••••••••' : c.config_value;
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch config', details: err.message });
  }
});

module.exports = router;
