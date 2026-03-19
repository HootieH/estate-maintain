const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);

// GET /:entityType/:entityId - List attachments for an entity
router.get('/:entityType/:entityId', async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    // Get stored attachment records
    const attachments = db.prepare(
      'SELECT a.*, u.name AS uploaded_by_name FROM attachments a LEFT JOIN users u ON a.uploaded_by = u.id WHERE a.entity_type = ? AND a.entity_id = ? ORDER BY a.created_at DESC'
    ).all(entityType, entityId);

    // Get folder link if exists
    const folder = db.prepare('SELECT folder_id FROM attachment_folders WHERE entity_type = ? AND entity_id = ?').get(entityType, entityId);
    const folderLink = folder ? `https://drive.google.com/drive/folders/${folder.folder_id}` : null;

    res.json({ attachments, folderLink });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attachments', details: err.message });
  }
});

// POST /:entityType/:entityId/upload - Upload a file
router.post('/:entityType/:entityId/upload', async (req, res) => {
  try {
    const GoogleDriveService = require('../services/google-drive');
    if (!GoogleDriveService.isConnected()) {
      return res.status(400).json({ error: 'Google Drive not connected', needsSetup: true });
    }

    const { entityType, entityId } = req.params;

    // Handle base64 file upload from frontend
    const { filename, mimeType, data } = req.body;
    if (!filename || !data) {
      return res.status(400).json({ error: 'filename and data (base64) are required' });
    }

    const fileBuffer = Buffer.from(data, 'base64');
    const result = await GoogleDriveService.uploadFile(entityType, entityId, fileBuffer, filename, mimeType || 'application/octet-stream');

    // Store attachment record
    const dbResult = db.prepare(`
      INSERT INTO attachments (entity_type, entity_id, provider, external_file_id, filename, mime_type, thumbnail_url, web_view_link, web_content_link, size_bytes, uploaded_by)
      VALUES (?, ?, 'google_drive', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(entityType, entityId, result.fileId, result.filename, result.mimeType, result.thumbnailUrl, result.webViewLink, result.webContentLink, result.size, req.user.id);

    const attachment = db.prepare('SELECT a.*, u.name AS uploaded_by_name FROM attachments a LEFT JOIN users u ON a.uploaded_by = u.id WHERE a.id = ?').get(dbResult.lastInsertRowid);
    res.status(201).json(attachment);
  } catch (err) {
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// DELETE /:entityType/:entityId/:attachmentId - Delete attachment
router.delete('/:entityType/:entityId/:attachmentId', async (req, res) => {
  try {
    const attachment = db.prepare('SELECT * FROM attachments WHERE id = ? AND entity_type = ? AND entity_id = ?').get(req.params.attachmentId, req.params.entityType, req.params.entityId);
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

    // Delete from Google Drive if connected
    if (attachment.external_file_id) {
      try {
        const GoogleDriveService = require('../services/google-drive');
        if (GoogleDriveService.isConnected()) {
          await GoogleDriveService.deleteFile(attachment.external_file_id);
        }
      } catch (e) {
        // Continue even if Drive delete fails
      }
    }

    db.prepare('DELETE FROM attachments WHERE id = ?').run(attachment.id);
    res.json({ message: 'Attachment deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed', details: err.message });
  }
});

// GET /:entityType/:entityId/folder-link - Get Drive folder link
router.get('/:entityType/:entityId/folder-link', async (req, res) => {
  try {
    const GoogleDriveService = require('../services/google-drive');
    const link = await GoogleDriveService.getEntityFolderLink(req.params.entityType, req.params.entityId);
    res.json({ folderLink: link });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get folder link', details: err.message });
  }
});

// GET /status - Check if Google Drive is connected
router.get('/status/check', async (req, res) => {
  try {
    const GoogleDriveService = require('../services/google-drive');
    res.json({
      connected: GoogleDriveService.isConnected(),
      rootFolderId: GoogleDriveService.getConfig('root_folder_id'),
      connectedAt: GoogleDriveService.getConfig('connected_at'),
      useSharedDrive: GoogleDriveService.getConfig('use_shared_drive') === 'true'
    });
  } catch (err) {
    res.json({ connected: false });
  }
});

module.exports = router;
