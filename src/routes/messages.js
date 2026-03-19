const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication (applied at app.use level in server.js)

// Helper: build direct channel_id from two user IDs (sorted)
function directChannelId(userId1, userId2) {
  const ids = [parseInt(userId1), parseInt(userId2)].sort((a, b) => a - b);
  return `${ids[0]}_${ids[1]}`;
}

// GET /channels — list all channels the user has messages in
router.get('/channels', (req, res) => {
  try {
    const userId = req.user.id;

    // Get all distinct channels the user has sent or received messages in
    const channels = db.prepare(`
      SELECT DISTINCT m.channel_type, m.channel_id
      FROM messages m
      WHERE m.sender_id = ?
        OR (m.channel_type = 'direct' AND (
          m.channel_id LIKE ? || '_%' OR m.channel_id LIKE '%_' || ?
        ))
        OR (m.channel_type = 'team' AND m.channel_id = 'team_' || ?)
        OR m.channel_type = 'work_order'
    `).all(userId, userId, userId, req.user.team_id || -1);

    // Better approach: get all channels where user participated
    const allChannels = db.prepare(`
      SELECT DISTINCT channel_type, channel_id FROM messages
      WHERE sender_id = ?
      UNION
      SELECT DISTINCT channel_type, channel_id FROM messages
      WHERE channel_type = 'direct'
        AND (channel_id LIKE ? || '_%' OR channel_id LIKE '%_' || ?)
      UNION
      SELECT DISTINCT channel_type, channel_id FROM messages
      WHERE channel_type = 'team'
        AND channel_id = ?
      UNION
      SELECT DISTINCT channel_type, channel_id FROM messages
      WHERE channel_type = 'work_order'
        AND channel_id IN (
          SELECT 'wo_' || id FROM work_orders
          WHERE assigned_to = ? OR created_by = ?
        )
    `).all(
      userId,
      userId, userId,
      'team_' + (req.user.team_id || -1),
      userId, userId
    );

    const result = allChannels.map(ch => {
      // Get last message
      const lastMessage = db.prepare(`
        SELECT m.*, u.name AS sender_name
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.channel_type = ? AND m.channel_id = ?
        ORDER BY m.created_at DESC LIMIT 1
      `).get(ch.channel_type, ch.channel_id);

      // Get unread count
      const unreadCount = db.prepare(`
        SELECT COUNT(*) AS count FROM messages m
        WHERE m.channel_type = ? AND m.channel_id = ?
          AND m.sender_id != ?
          AND m.id NOT IN (
            SELECT mr.message_id FROM message_reads mr WHERE mr.user_id = ?
          )
      `).get(ch.channel_type, ch.channel_id, userId, userId);

      // Get channel display name
      let name = ch.channel_id;
      if (ch.channel_type === 'direct') {
        const otherUserId = ch.channel_id.split('_').find(id => parseInt(id) !== userId);
        if (otherUserId) {
          const otherUser = db.prepare('SELECT name, avatar_color FROM users WHERE id = ?').get(otherUserId);
          if (otherUser) {
            name = otherUser.name;
          }
        }
      } else if (ch.channel_type === 'team') {
        const teamId = ch.channel_id.replace('team_', '');
        const team = db.prepare('SELECT name FROM teams WHERE id = ?').get(teamId);
        if (team) name = team.name;
      } else if (ch.channel_type === 'work_order') {
        const woId = ch.channel_id.replace('wo_', '');
        const wo = db.prepare('SELECT title FROM work_orders WHERE id = ?').get(woId);
        if (wo) name = wo.title;
      }

      return {
        channel_type: ch.channel_type,
        channel_id: ch.channel_id,
        name,
        last_message: lastMessage || null,
        unread_count: unreadCount ? unreadCount.count : 0
      };
    });

    // Sort by last message time (most recent first)
    result.sort((a, b) => {
      const aTime = a.last_message ? new Date(a.last_message.created_at).getTime() : 0;
      const bTime = b.last_message ? new Date(b.last_message.created_at).getTime() : 0;
      return bTime - aTime;
    });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;
    const total = result.length;
    const paginatedResult = result.slice(offset, offset + limit);

    res.json({
      data: paginatedResult,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch channels', details: err.message });
  }
});

// GET /channels/:type/:id — get messages for a channel
router.get('/channels/:type/:id', (req, res) => {
  try {
    const { type, id } = req.params;
    const before = req.query.before;
    const limit = parseInt(req.query.limit) || 50;

    let sql = `
      SELECT m.*, u.name AS sender_name, u.avatar_color AS sender_avatar_color
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.channel_type = ? AND m.channel_id = ?
    `;
    const params = [type, id];

    if (before) {
      sql += ' AND m.id < ?';
      params.push(before);
    }

    sql += ' ORDER BY m.created_at DESC LIMIT ?';
    params.push(limit);

    const messages = db.prepare(sql).all(...params);

    // Return in chronological order
    messages.reverse();

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages', details: err.message });
  }
});

// POST /channels/:type/:id — send message to channel
router.post('/channels/:type/:id', (req, res) => {
  try {
    const { type, id } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Validate channel_type
    if (!['direct', 'team', 'work_order'].includes(type)) {
      return res.status(400).json({ error: 'Invalid channel type' });
    }

    const result = db.prepare(
      'INSERT INTO messages (sender_id, channel_type, channel_id, content) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, type, id, content.trim());

    const message = db.prepare(`
      SELECT m.*, u.name AS sender_name, u.avatar_color AS sender_avatar_color
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `).get(result.lastInsertRowid);

    // Auto-mark as read for sender
    db.prepare(
      'INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)'
    ).run(message.id, req.user.id);

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
});

// GET /unread — get total unread count
router.get('/unread', (req, res) => {
  try {
    const userId = req.user.id;

    // Count unread messages across all channels the user participates in
    // Direct messages addressed to this user
    const directUnread = db.prepare(`
      SELECT COUNT(*) AS count FROM messages m
      WHERE m.channel_type = 'direct'
        AND m.sender_id != ?
        AND (m.channel_id LIKE ? || '_%' OR m.channel_id LIKE '%_' || ?)
        AND m.id NOT IN (SELECT mr.message_id FROM message_reads mr WHERE mr.user_id = ?)
    `).get(userId, userId, userId, userId);

    // Team messages
    let teamUnread = { count: 0 };
    if (req.user.team_id) {
      teamUnread = db.prepare(`
        SELECT COUNT(*) AS count FROM messages m
        WHERE m.channel_type = 'team'
          AND m.channel_id = ?
          AND m.sender_id != ?
          AND m.id NOT IN (SELECT mr.message_id FROM message_reads mr WHERE mr.user_id = ?)
      `).get('team_' + req.user.team_id, userId, userId);
    }

    // Work order messages for user's assigned/created WOs
    const woUnread = db.prepare(`
      SELECT COUNT(*) AS count FROM messages m
      WHERE m.channel_type = 'work_order'
        AND m.sender_id != ?
        AND m.channel_id IN (
          SELECT 'wo_' || id FROM work_orders WHERE assigned_to = ? OR created_by = ?
        )
        AND m.id NOT IN (SELECT mr.message_id FROM message_reads mr WHERE mr.user_id = ?)
    `).get(userId, userId, userId, userId);

    const total = (directUnread?.count || 0) + (teamUnread?.count || 0) + (woUnread?.count || 0);

    res.json({ unread_count: total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch unread count', details: err.message });
  }
});

// POST /read/:type/:id — mark all messages in channel as read
router.post('/read/:type/:id', (req, res) => {
  try {
    const { type, id } = req.params;
    const userId = req.user.id;

    const unreadMessages = db.prepare(`
      SELECT m.id FROM messages m
      WHERE m.channel_type = ? AND m.channel_id = ?
        AND m.sender_id != ?
        AND m.id NOT IN (SELECT mr.message_id FROM message_reads mr WHERE mr.user_id = ?)
    `).all(type, id, userId, userId);

    const insertRead = db.prepare(
      'INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)'
    );

    const markAll = db.transaction((messages) => {
      for (const msg of messages) {
        insertRead.run(msg.id, userId);
      }
    });

    markAll(unreadMessages);

    res.json({ marked: unreadMessages.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark messages as read', details: err.message });
  }
});

module.exports = router;
