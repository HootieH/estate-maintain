const { db } = require('../db');

// Reuse encryption from billcom service
const BillcomService = require('./billcom');
const { encrypt, decrypt } = BillcomService;

function getConfig(key) {
  const row = db.prepare('SELECT config_value, is_secret FROM integration_configs WHERE provider = ? AND config_key = ?').get('google_drive', key);
  if (!row) return null;
  return row.is_secret ? decrypt(row.config_value) : row.config_value;
}

function setConfig(key, value, isSecret = false) {
  const stored = isSecret ? encrypt(value) : value;
  db.prepare(`
    INSERT INTO integration_configs (provider, config_key, config_value, is_secret, updated_at)
    VALUES ('google_drive', ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(provider, config_key) DO UPDATE SET config_value = ?, is_secret = ?, updated_at = CURRENT_TIMESTAMP
  `).run(key, stored, isSecret ? 1 : 0, stored, isSecret ? 1 : 0);
}

function logSync(entityType, entityId, externalId, direction, status, details, errorMessage) {
  db.prepare(
    'INSERT INTO sync_log (provider, entity_type, entity_id, external_id, direction, status, details, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('google_drive', entityType, entityId, externalId, direction, status, details || null, errorMessage || null);
}

async function apiRequest(method, endpoint, body, isUpload = false) {
  const accessToken = getConfig('access_token');
  if (!accessToken) throw new Error('Google Drive not connected. Go to Integrations to set up.');

  const baseUrl = 'https://www.googleapis.com';
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  const headers = {
    'Authorization': `Bearer ${accessToken}`
  };

  if (!isUpload) {
    headers['Content-Type'] = 'application/json';
  }

  const options = { method, headers };
  if (body && !isUpload) options.body = JSON.stringify(body);
  if (body && isUpload) options.body = body;

  const response = await fetch(url, options);

  if (response.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed) return apiRequest(method, endpoint, body, isUpload);
    throw new Error('Google Drive token expired. Reconnect in Integrations.');
  }

  const data = await response.json();
  if (!response.ok) {
    const errMsg = data.error?.message || data.error || `Drive API error: ${response.status}`;
    throw new Error(errMsg);
  }

  return data;
}

async function refreshToken() {
  const refreshTokenVal = getConfig('refresh_token');
  const clientId = getConfig('client_id');
  const clientSecret = getConfig('client_secret');
  if (!refreshTokenVal || !clientId || !clientSecret) return false;

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
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

// Build the folder path for an entity
function getFolderPath(entityType, entityId) {
  switch (entityType) {
    case 'property': {
      const p = db.prepare('SELECT name FROM properties WHERE id = ?').get(entityId);
      return ['Properties', p ? p.name : `Property ${entityId}`];
    }
    case 'asset': {
      const a = db.prepare('SELECT a.name, p.name AS prop_name FROM assets a LEFT JOIN properties p ON a.property_id = p.id WHERE a.id = ?').get(entityId);
      return ['Properties', a?.prop_name || 'Unknown Property', 'Assets', a?.name || `Asset ${entityId}`];
    }
    case 'work_order': {
      const wo = db.prepare('SELECT wo.id, wo.title, p.name AS prop_name FROM work_orders wo LEFT JOIN properties p ON wo.property_id = p.id WHERE wo.id = ?').get(entityId);
      return ['Properties', wo?.prop_name || 'Unknown Property', 'Work Orders', `WO-${entityId} ${wo?.title || ''}`];
    }
    case 'project': {
      const proj = db.prepare('SELECT pr.title, p.name AS prop_name FROM projects pr LEFT JOIN properties p ON pr.property_id = p.id WHERE pr.id = ?').get(entityId);
      return ['Properties', proj?.prop_name || 'Unknown Property', 'Projects', proj?.title || `Project ${entityId}`];
    }
    case 'bid': {
      const bid = db.prepare('SELECT b.id, pr.title AS proj_title, v.name AS vendor_name, p.name AS prop_name FROM bids b JOIN projects pr ON b.project_id = pr.id JOIN vendors v ON b.vendor_id = v.id LEFT JOIN properties p ON pr.property_id = p.id WHERE b.id = ?').get(entityId);
      return ['Properties', bid?.prop_name || 'Unknown Property', 'Projects', bid?.proj_title || 'Unknown Project', `Bid - ${bid?.vendor_name || 'Unknown Vendor'}`];
    }
    case 'procedure': {
      const proc = db.prepare('SELECT title FROM procedures WHERE id = ?').get(entityId);
      return ['Procedures', proc?.title || `Procedure ${entityId}`];
    }
    case 'invoice': {
      const inv = db.prepare('SELECT invoice_number FROM invoices WHERE id = ?').get(entityId);
      return ['Invoices', inv?.invoice_number || `Invoice ${entityId}`];
    }
    case 'purchase_order': {
      const po = db.prepare('SELECT po_number FROM purchase_orders WHERE id = ?').get(entityId);
      return ['Purchase Orders', po?.po_number || `PO ${entityId}`];
    }
    case 'part': {
      const part = db.prepare('SELECT name FROM parts WHERE id = ?').get(entityId);
      return ['Inventory', part?.name || `Part ${entityId}`];
    }
    case 'location': {
      const loc = db.prepare('SELECT l.name, p.name AS prop_name FROM locations l LEFT JOIN properties p ON l.property_id = p.id WHERE l.id = ?').get(entityId);
      return ['Properties', loc?.prop_name || 'Unknown Property', 'Locations', loc?.name || `Location ${entityId}`];
    }
    default:
      return ['Other', `${entityType}-${entityId}`];
  }
}

const GoogleDriveService = {
  getConfig,
  setConfig,

  isConnected() {
    return !!getConfig('access_token');
  },

  getAuthorizationUrl() {
    const clientId = getConfig('client_id');
    const redirectUri = getConfig('redirect_uri') || 'http://localhost:3003/api/integrations/google-drive/callback';
    if (!clientId) throw new Error('Google Drive Client ID not configured.');

    const scopes = [
      'https://www.googleapis.com/auth/drive.file'
    ].join(' ');

    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;
  },

  async handleCallback(code) {
    const clientId = getConfig('client_id');
    const clientSecret = getConfig('client_secret');
    const redirectUri = getConfig('redirect_uri') || 'http://localhost:3003/api/integrations/google-drive/callback';

    const response = await fetch('https://oauth2.googleapis.com/token', {
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
    if (!data.access_token) throw new Error('Failed to get access token from Google');

    setConfig('access_token', data.access_token, true);
    if (data.refresh_token) setConfig('refresh_token', data.refresh_token, true);
    setConfig('connected_at', new Date().toISOString(), false);

    // Create or find root folder
    await this.ensureRootFolder();

    logSync('auth', null, null, 'pull', 'success', 'Google Drive connected');
    return true;
  },

  disconnect() {
    db.prepare("DELETE FROM integration_configs WHERE provider = 'google_drive' AND config_key IN ('access_token', 'refresh_token', 'connected_at', 'root_folder_id')").run();
    logSync('auth', null, null, 'push', 'success', 'Google Drive disconnected');
  },

  async ensureRootFolder() {
    let rootId = getConfig('root_folder_id');
    if (rootId) {
      // Verify it still exists
      try {
        await apiRequest('GET', `/drive/v3/files/${rootId}?fields=id,name`);
        return rootId;
      } catch {
        // Folder gone, recreate
      }
    }

    // Check for Shared Drive first
    const useSharedDrive = getConfig('use_shared_drive') === 'true';
    let driveId = getConfig('shared_drive_id');

    if (useSharedDrive && !driveId) {
      // Create a Shared Drive
      try {
        const orgName = getConfig('organization_name') || 'Estate Maintain';
        const drive = await apiRequest('POST', '/drive/v3/drives', {
          name: orgName
        });
        driveId = drive.id;
        setConfig('shared_drive_id', driveId, false);
      } catch (e) {
        // Shared Drive creation may fail if not Workspace admin
        // Fall back to regular folder
        logSync('folder', null, null, 'push', 'error', 'Shared Drive creation failed, using My Drive', e.message);
      }
    }

    // Create root folder
    const folderMeta = {
      name: 'Estate Maintain',
      mimeType: 'application/vnd.google-apps.folder'
    };

    if (driveId) {
      folderMeta.parents = [driveId];
    }

    const folder = await apiRequest('POST', '/drive/v3/files?supportsAllDrives=true', folderMeta);
    rootId = folder.id;
    setConfig('root_folder_id', rootId, false);

    logSync('folder', null, rootId, 'push', 'success', 'Root folder created');
    return rootId;
  },

  async ensureEntityFolder(entityType, entityId) {
    // Check if we already have a folder for this entity
    const existing = db.prepare('SELECT folder_id FROM attachment_folders WHERE entity_type = ? AND entity_id = ? AND provider = ?').get(entityType, entityId, 'google_drive');
    if (existing) return existing.folder_id;

    const rootId = await this.ensureRootFolder();
    const pathParts = getFolderPath(entityType, entityId);

    // Walk the path, creating folders as needed
    let parentId = rootId;
    for (const part of pathParts) {
      parentId = await this.findOrCreateFolder(part, parentId);
    }

    // Store the mapping
    db.prepare('INSERT OR REPLACE INTO attachment_folders (entity_type, entity_id, provider, folder_id, folder_name) VALUES (?, ?, ?, ?, ?)').run(entityType, entityId, 'google_drive', parentId, pathParts[pathParts.length - 1]);

    return parentId;
  },

  async findOrCreateFolder(name, parentId) {
    // Search for existing folder
    const query = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const search = await apiRequest('GET', `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`);

    if (search.files && search.files.length > 0) {
      return search.files[0].id;
    }

    // Create folder
    const folder = await apiRequest('POST', '/drive/v3/files?supportsAllDrives=true', {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    });

    return folder.id;
  },

  async uploadFile(entityType, entityId, fileBuffer, filename, mimeType) {
    const folderId = await this.ensureEntityFolder(entityType, entityId);

    // Multipart upload
    const boundary = 'estate_maintain_boundary';
    const metadata = JSON.stringify({
      name: filename,
      parents: [folderId]
    });

    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const bodyEnd = `\r\n--${boundary}--`;

    const multipartBody = Buffer.concat([
      Buffer.from(body),
      fileBuffer,
      Buffer.from(bodyEnd)
    ]);

    const result = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,thumbnailLink,webViewLink,webContentLink', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getConfig('access_token')}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    });

    if (result.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) return this.uploadFile(entityType, entityId, fileBuffer, filename, mimeType);
      throw new Error('Google Drive token expired');
    }

    const file = await result.json();
    if (!file.id) throw new Error('Upload failed: ' + JSON.stringify(file));

    logSync('file', null, file.id, 'push', 'success', `Uploaded ${filename}`);

    return {
      fileId: file.id,
      filename: file.name,
      mimeType: file.mimeType,
      size: file.size ? parseInt(file.size) : null,
      thumbnailUrl: file.thumbnailLink || null,
      webViewLink: file.webViewLink || null,
      webContentLink: file.webContentLink || null
    };
  },

  async listFiles(folderId) {
    const query = `'${folderId}' in parents and trashed=false`;
    const result = await apiRequest('GET', `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,thumbnailLink,webViewLink,webContentLink,createdTime)&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=createdTime desc`);
    return result.files || [];
  },

  async deleteFile(fileId) {
    await apiRequest('DELETE', `/drive/v3/files/${fileId}?supportsAllDrives=true`);
    logSync('file', null, fileId, 'push', 'success', 'File deleted');
  },

  async getEntityFolderLink(entityType, entityId) {
    const folder = db.prepare('SELECT folder_id FROM attachment_folders WHERE entity_type = ? AND entity_id = ?').get(entityType, entityId);
    if (!folder) return null;
    return `https://drive.google.com/drive/folders/${folder.folder_id}`;
  }
};

module.exports = GoogleDriveService;
