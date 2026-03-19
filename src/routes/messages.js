const express = require('express');
const { db, logActivity, createNotification, ensureChannel } = require('../db');
const { requirePermission, getPropertyScope } = require('../middleware/permissions');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_REACTIONS = ['thumbsup', 'check', 'eyes', 'heart', 'thinking', 'fire'];

/** Check if user is a member of a channel */
function isMember(channelId, userId) {
  return !!db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(channelId, userId);
}

/** Look up a channel by integer id, return row or null */
function getChannel(channelId) {
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) || null;
}

/** Build the full message object with sender, reactions, attachments, thread count */
function enrichMessage(msg, currentUserId) {
  // sender info
  let sender = null;
  if (msg.sender_id) {
    sender = db.prepare('SELECT id, name, avatar_color FROM users WHERE id = ?').get(msg.sender_id);
  }

  // reactions grouped
  const rawReactions = db.prepare(
    'SELECT reaction, user_id FROM message_reactions WHERE message_id = ?'
  ).all(msg.id);
  const reactionMap = {};
  for (const r of rawReactions) {
    if (!reactionMap[r.reaction]) reactionMap[r.reaction] = { reaction: r.reaction, count: 0, reacted: false };
    reactionMap[r.reaction].count++;
    if (r.user_id === currentUserId) reactionMap[r.reaction].reacted = true;
  }
  const reactions = Object.values(reactionMap);

  // attachments
  const attachments = db.prepare(
    'SELECT id, filename, mime_type, size_bytes, created_at FROM message_attachments WHERE message_id = ?'
  ).all(msg.id);

  // thread reply count (only for top-level messages)
  let reply_count = 0;
  if (!msg.parent_message_id) {
    const rc = db.prepare('SELECT COUNT(*) AS c FROM messages WHERE parent_message_id = ?').get(msg.id);
    reply_count = rc ? rc.c : 0;
  }

  // mentions (user ids mentioned in this message)
  const mentions = db.prepare('SELECT user_id FROM message_mentions WHERE message_id = ?').all(msg.id).map(r => r.user_id);

  return {
    id: msg.id,
    sender_id: msg.sender_id,
    sender_name: sender ? sender.name : null,
    sender_avatar_color: sender ? sender.avatar_color : null,
    channel_type: msg.channel_type,
    channel_id: msg.channel_id,
    content: msg.content,
    parent_message_id: msg.parent_message_id || null,
    message_type: msg.message_type || 'user',
    is_edited: !!msg.is_edited,
    edited_at: msg.edited_at || null,
    created_at: msg.created_at,
    reactions,
    attachments,
    reply_count,
    mentions,
  };
}

/** Parse @mentions from content. Pattern: @[userId:name] */
function parseMentions(content) {
  const mentions = [];
  const regex = /@\[(\d+):[^\]]+\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const userId = parseInt(match[1], 10);
    if (!mentions.includes(userId)) mentions.push(userId);
  }
  return mentions;
}

// ===========================================================================
// 1. GET /channels — List channels user is a member of
// ===========================================================================
router.get('/channels', (req, res) => {
  try {
    const userId = req.user.id;

    // --- Auto-create missing channels ---

    // Team channels
    const teamIds = req.user.team_ids || [];
    for (const tid of teamIds) {
      const team = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(tid);
      if (team) {
        const memberRows = db.prepare('SELECT user_id FROM user_teams WHERE team_id = ?').all(tid);
        const memberIds = memberRows.map(r => r.user_id);
        ensureChannel('team', `team_${tid}`, team.name, memberIds, null);
      }
    }

    // Property channels
    const propertyIds = getPropertyScope(userId);
    const properties = propertyIds === null
      ? db.prepare('SELECT id, name FROM properties').all()
      : (propertyIds.length > 0
        ? db.prepare(`SELECT id, name FROM properties WHERE id IN (${propertyIds.map(() => '?').join(',')})`).all(...propertyIds)
        : []);
    for (const prop of properties) {
      // All users with access to this property
      const accessRows = db.prepare('SELECT user_id FROM user_property_access WHERE property_id = ?').all(prop.id);
      const memberIds = accessRows.map(r => r.user_id);
      if (!memberIds.includes(userId)) memberIds.push(userId);
      ensureChannel('property', `property_${prop.id}`, prop.name, memberIds, null);
    }

    // --- Fetch all channels user belongs to ---
    const channels = db.prepare(`
      SELECT c.id, c.channel_type, c.channel_key, c.name, cm.is_starred
      FROM channels c
      JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
      WHERE c.is_archived = 0
    `).all(userId);

    const result = channels.map(ch => {
      // Last message
      const lastMsg = db.prepare(`
        SELECT m.id, m.content, u.name AS sender_name, m.created_at
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.channel_type = ? AND m.channel_id = ?
        ORDER BY m.created_at DESC LIMIT 1
      `).get(ch.channel_type, ch.channel_key);

      // Unread count
      const unread = db.prepare(`
        SELECT COUNT(*) AS count FROM messages m
        WHERE m.channel_type = ? AND m.channel_id = ?
          AND m.sender_id != ?
          AND m.id NOT IN (SELECT mr.message_id FROM message_reads mr WHERE mr.user_id = ?)
      `).get(ch.channel_type, ch.channel_key, userId, userId);

      // Member count
      const mc = db.prepare('SELECT COUNT(*) AS count FROM channel_members WHERE channel_id = ?').get(ch.id);

      // Display name — for DMs, show the other user's name
      let name = ch.name;
      if (ch.channel_type === 'direct') {
        const parts = ch.channel_key.split('_');
        const otherUserId = parts.find(id => parseInt(id, 10) !== userId);
        if (otherUserId) {
          const other = db.prepare('SELECT name FROM users WHERE id = ?').get(parseInt(otherUserId, 10));
          if (other) name = other.name;
        }
      }

      return {
        id: ch.id,
        channel_type: ch.channel_type,
        channel_key: ch.channel_key,
        name: name || ch.channel_key,
        last_message: lastMsg ? { id: lastMsg.id, content: lastMsg.content, sender_name: lastMsg.sender_name, created_at: lastMsg.created_at } : null,
        unread_count: unread ? unread.count : 0,
        is_starred: !!ch.is_starred,
        member_count: mc ? mc.count : 0,
      };
    });

    // Sort: starred first, then by last message time descending
    result.sort((a, b) => {
      if (a.is_starred && !b.is_starred) return -1;
      if (!a.is_starred && b.is_starred) return 1;
      const aTime = a.last_message ? new Date(a.last_message.created_at).getTime() : 0;
      const bTime = b.last_message ? new Date(b.last_message.created_at).getTime() : 0;
      return bTime - aTime;
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch channels', details: err.message });
  }
});

// ===========================================================================
// 2. POST /channels — Create a channel (DM or custom)
// ===========================================================================
router.post('/channels', (req, res) => {
  try {
    const { channel_type, name, member_ids } = req.body;
    if (!channel_type) {
      return res.status(400).json({ error: 'channel_type is required' });
    }

    let channelKey;
    let channelName = name;
    let memberIds = Array.isArray(member_ids) ? [...member_ids] : [];

    if (channel_type === 'direct') {
      // DM requires exactly one other user
      if (!memberIds.length) {
        return res.status(400).json({ error: 'member_ids required for direct channels' });
      }
      const allIds = [...new Set([req.user.id, ...memberIds.map(Number)])];
      if (allIds.length !== 2) {
        return res.status(400).json({ error: 'Direct channels require exactly 2 participants' });
      }
      channelKey = allIds.sort((a, b) => a - b).join('_');
      // Name defaults to other user's name
      const otherId = allIds.find(id => id !== req.user.id);
      const other = db.prepare('SELECT name FROM users WHERE id = ?').get(otherId);
      channelName = channelName || (other ? other.name : `DM ${channelKey}`);
      memberIds = allIds;
    } else {
      // Custom / group channel
      channelKey = `custom_${Date.now()}_${req.user.id}`;
      if (!memberIds.includes(req.user.id)) memberIds.push(req.user.id);
    }

    const channel = ensureChannel(channel_type, channelKey, channelName, memberIds, req.user.id);
    res.status(201).json(channel);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create channel', details: err.message });
  }
});

// ===========================================================================
// 3. POST /channels/:id/star — Toggle is_starred
// ===========================================================================
router.post('/channels/:id/star', (req, res) => {
  try {
    const channelId = parseInt(req.params.id, 10);
    const membership = db.prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?').get(channelId, req.user.id);
    if (!membership) {
      return res.status(404).json({ error: 'Not a member of this channel' });
    }
    const newVal = membership.is_starred ? 0 : 1;
    db.prepare('UPDATE channel_members SET is_starred = ? WHERE channel_id = ? AND user_id = ?').run(newVal, channelId, req.user.id);
    res.json({ is_starred: !!newVal });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle star', details: err.message });
  }
});

// ===========================================================================
// 4. GET /channels/:id/members — List members
// ===========================================================================
router.get('/channels/:id/members', (req, res) => {
  try {
    const channelId = parseInt(req.params.id, 10);
    const members = db.prepare(`
      SELECT u.id, u.name, u.avatar_color
      FROM channel_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.channel_id = ?
      ORDER BY u.name
    `).all(channelId);
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members', details: err.message });
  }
});

// ===========================================================================
// 5. GET /channels/:id/mention-candidates — Autocomplete list
// ===========================================================================
router.get('/channels/:id/mention-candidates', (req, res) => {
  try {
    const channelId = parseInt(req.params.id, 10);
    const members = db.prepare(`
      SELECT u.id, u.name, u.avatar_color
      FROM channel_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.channel_id = ? AND u.id != ?
      ORDER BY u.name
    `).all(channelId, req.user.id);
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch mention candidates', details: err.message });
  }
});

// ===========================================================================
// 6. GET /channels/:id/messages — Get messages (membership required)
// ===========================================================================
router.get('/channels/:id/messages', (req, res) => {
  try {
    const channelId = parseInt(req.params.id, 10);
    const channel = getChannel(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    if (!isMember(channelId, req.user.id)) {
      return res.status(403).json({ error: 'Not a member of this channel' });
    }

    const before = req.query.before ? parseInt(req.query.before, 10) : null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    let sql = `
      SELECT m.*
      FROM messages m
      WHERE m.channel_type = ? AND m.channel_id = ? AND m.parent_message_id IS NULL
    `;
    const params = [channel.channel_type, channel.channel_key];

    if (before) {
      sql += ' AND m.id < ?';
      params.push(before);
    }

    sql += ' ORDER BY m.created_at DESC, m.id DESC LIMIT ?';
    params.push(limit);

    const raw = db.prepare(sql).all(...params);
    // Return in chronological order
    raw.reverse();

    const messages = raw.map(m => enrichMessage(m, req.user.id));
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages', details: err.message });
  }
});

// ===========================================================================
// 7. POST /channels/:id/messages — Send a message
// ===========================================================================
router.post('/channels/:id/messages', (req, res) => {
  try {
    const channelId = parseInt(req.params.id, 10);
    const channel = getChannel(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    if (!isMember(channelId, req.user.id)) {
      return res.status(403).json({ error: 'Not a member of this channel' });
    }

    const { content, parent_message_id, attachments } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Insert message
    const result = db.prepare(`
      INSERT INTO messages (sender_id, channel_type, channel_id, content, parent_message_id, message_type)
      VALUES (?, ?, ?, ?, ?, 'user')
    `).run(req.user.id, channel.channel_type, channel.channel_key, content.trim(), parent_message_id || null);

    const messageId = result.lastInsertRowid;

    // Parse and create mentions
    const mentionedIds = parseMentions(content);
    const insertMention = db.prepare('INSERT OR IGNORE INTO message_mentions (message_id, user_id) VALUES (?, ?)');
    for (const uid of mentionedIds) {
      insertMention.run(messageId, uid);
      // Create notification for mentioned user (skip self-mention)
      if (uid !== req.user.id) {
        createNotification(
          uid, 'mention',
          `${req.user.name} mentioned you`,
          content.trim().substring(0, 200),
          'message', messageId
        );
      }
    }

    // Store attachments
    if (Array.isArray(attachments) && attachments.length > 0) {
      const insertAtt = db.prepare(
        'INSERT INTO message_attachments (message_id, filename, mime_type, data, size_bytes) VALUES (?, ?, ?, ?, ?)'
      );
      for (const att of attachments) {
        if (att.filename && att.mime_type && att.data) {
          const sizeBytes = Buffer.byteLength(att.data, 'base64') || att.data.length;
          insertAtt.run(messageId, att.filename, att.mime_type, att.data, sizeBytes);
        }
      }
    }

    // Auto-mark as read for sender
    db.prepare('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)').run(messageId, req.user.id);

    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    res.status(201).json(enrichMessage(msg, req.user.id));
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
});

// ===========================================================================
// 8. PUT /messages/:id — Edit own message
// ===========================================================================
router.put('/messages/:id', (req, res) => {
  try {
    const messageId = parseInt(req.params.id, 10);
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    if (msg.sender_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the message author can edit' });
    }

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    db.prepare('UPDATE messages SET content = ?, is_edited = 1, edited_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(content.trim(), messageId);

    const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    res.json(enrichMessage(updated, req.user.id));
  } catch (err) {
    res.status(500).json({ error: 'Failed to edit message', details: err.message });
  }
});

// ===========================================================================
// 9. DELETE /messages/:id — Soft-delete
// ===========================================================================
router.delete('/messages/:id', (req, res) => {
  try {
    const messageId = parseInt(req.params.id, 10);
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const isOwner = msg.sender_id === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'manager';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    db.prepare("UPDATE messages SET content = '[deleted]', message_type = 'system' WHERE id = ?").run(messageId);
    res.json({ message: 'Message deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete message', details: err.message });
  }
});

// ===========================================================================
// 10. GET /activity-stream — Unified feed across all user channels
// ===========================================================================
router.get('/activity-stream', (req, res) => {
  try {
    const userId = req.user.id;
    const type = req.query.type || 'all';
    const before = req.query.before ? parseInt(req.query.before, 10) : null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

    // Get all channel ids user is a member of
    let channelRows = db.prepare(`
      SELECT c.id, c.channel_type, c.channel_key, c.name
      FROM channels c
      JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
    `).all(userId);

    // Filter by type
    if (type !== 'all') {
      channelRows = channelRows.filter(ch => ch.channel_type === type);
    }

    if (channelRows.length === 0) {
      return res.json([]);
    }

    // Build query for messages across these channels
    const conditions = channelRows.map(() => '(m.channel_type = ? AND m.channel_id = ?)');
    const params = [];
    for (const ch of channelRows) {
      params.push(ch.channel_type, ch.channel_key);
    }

    let sql = `
      SELECT m.*, c.name AS channel_name, c.channel_type AS ch_type, c.channel_key AS ch_key
      FROM messages m
      LEFT JOIN channels c ON c.channel_type = m.channel_type AND c.channel_key = m.channel_id
      WHERE (${conditions.join(' OR ')})
    `;

    if (before) {
      sql += ' AND m.id < ?';
      params.push(before);
    }

    sql += ' ORDER BY m.created_at DESC, m.id DESC LIMIT ?';
    params.push(limit);

    const raw = db.prepare(sql).all(...params);

    const messages = raw.map(m => {
      const enriched = enrichMessage(m, userId);
      enriched.channel_name = m.channel_name || m.channel_id;
      enriched.channel_key = m.ch_key || m.channel_id;
      return enriched;
    });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity stream', details: err.message });
  }
});

// ===========================================================================
// 11. POST /messages/:id/reactions — Toggle reaction
// ===========================================================================
router.post('/messages/:id/reactions', (req, res) => {
  try {
    const messageId = parseInt(req.params.id, 10);
    const { reaction } = req.body;

    if (!reaction || !VALID_REACTIONS.includes(reaction)) {
      return res.status(400).json({ error: `Invalid reaction. Must be one of: ${VALID_REACTIONS.join(', ')}` });
    }

    const msg = db.prepare('SELECT id FROM messages WHERE id = ?').get(messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    // Toggle: if exists delete, if not insert
    const existing = db.prepare(
      'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND reaction = ?'
    ).get(messageId, req.user.id, reaction);

    if (existing) {
      db.prepare('DELETE FROM message_reactions WHERE id = ?').run(existing.id);
    } else {
      db.prepare('INSERT INTO message_reactions (message_id, user_id, reaction) VALUES (?, ?, ?)')
        .run(messageId, req.user.id, reaction);
    }

    // Return updated reaction list
    const rawReactions = db.prepare('SELECT reaction, user_id FROM message_reactions WHERE message_id = ?').all(messageId);
    const reactionMap = {};
    for (const r of rawReactions) {
      if (!reactionMap[r.reaction]) reactionMap[r.reaction] = { reaction: r.reaction, count: 0, reacted: false };
      reactionMap[r.reaction].count++;
      if (r.user_id === req.user.id) reactionMap[r.reaction].reacted = true;
    }

    res.json(Object.values(reactionMap));
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle reaction', details: err.message });
  }
});

// ===========================================================================
// 12. GET /channels/:id/pins — Pinned messages
// ===========================================================================
router.get('/channels/:id/pins', (req, res) => {
  try {
    const channelId = parseInt(req.params.id, 10);
    const pins = db.prepare(`
      SELECT m.*, pm.pinned_by, pm.created_at AS pinned_at
      FROM pinned_messages pm
      JOIN messages m ON pm.message_id = m.id
      WHERE pm.channel_id = ?
      ORDER BY pm.created_at DESC
    `).all(channelId);

    const result = pins.map(p => {
      const enriched = enrichMessage(p, req.user.id);
      enriched.pinned_by = p.pinned_by;
      enriched.pinned_at = p.pinned_at;
      return enriched;
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pins', details: err.message });
  }
});

// ===========================================================================
// 13. POST /channels/:id/pins — Pin a message
// ===========================================================================
router.post('/channels/:id/pins', requirePermission('messages:pin'), (req, res) => {
  try {
    const channelId = parseInt(req.params.id, 10);
    const { message_id } = req.body;
    if (!message_id) return res.status(400).json({ error: 'message_id is required' });

    const msg = db.prepare('SELECT id FROM messages WHERE id = ?').get(message_id);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    db.prepare('INSERT OR IGNORE INTO pinned_messages (channel_id, message_id, pinned_by) VALUES (?, ?, ?)')
      .run(channelId, message_id, req.user.id);

    res.status(201).json({ message: 'Message pinned' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pin message', details: err.message });
  }
});

// ===========================================================================
// 14. DELETE /channels/:id/pins/:messageId — Unpin
// ===========================================================================
router.delete('/channels/:id/pins/:messageId', (req, res) => {
  try {
    const channelId = parseInt(req.params.id, 10);
    const messageId = parseInt(req.params.messageId, 10);
    db.prepare('DELETE FROM pinned_messages WHERE channel_id = ? AND message_id = ?').run(channelId, messageId);
    res.json({ message: 'Message unpinned' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unpin message', details: err.message });
  }
});

// ===========================================================================
// 15. GET /messages/:id/replies — Thread replies
// ===========================================================================
router.get('/messages/:id/replies', (req, res) => {
  try {
    const parentId = parseInt(req.params.id, 10);
    const parent = db.prepare('SELECT id FROM messages WHERE id = ?').get(parentId);
    if (!parent) return res.status(404).json({ error: 'Message not found' });

    const replies = db.prepare(`
      SELECT m.* FROM messages m
      WHERE m.parent_message_id = ?
      ORDER BY m.created_at ASC, m.id ASC
    `).all(parentId);

    res.json(replies.map(m => enrichMessage(m, req.user.id)));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch replies', details: err.message });
  }
});

// ===========================================================================
// 16. GET /search — Search messages in user's channels
// ===========================================================================
router.get('/search', (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const userId = req.user.id;

    // Get channel keys user belongs to
    const memberChannels = db.prepare(`
      SELECT c.channel_type, c.channel_key, c.name
      FROM channels c
      JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
    `).all(userId);

    if (memberChannels.length === 0) return res.json([]);

    const conditions = memberChannels.map(() => '(m.channel_type = ? AND m.channel_id = ?)');
    const params = [];
    for (const ch of memberChannels) {
      params.push(ch.channel_type, ch.channel_key);
    }

    const searchPattern = `%${q}%`;

    const sql = `
      SELECT m.*, u.name AS sender_name, u.avatar_color AS sender_avatar_color,
             c.name AS channel_name, c.channel_type AS ch_type, c.channel_key AS ch_key
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      LEFT JOIN channels c ON c.channel_type = m.channel_type AND c.channel_key = m.channel_id
      WHERE (${conditions.join(' OR ')})
        AND m.content LIKE ?
      ORDER BY m.created_at DESC
      LIMIT ?
    `;
    params.push(searchPattern, limit);

    const results = db.prepare(sql).all(...params);

    const messages = results.map(m => ({
      id: m.id,
      content: m.content,
      sender_id: m.sender_id,
      sender_name: m.sender_name,
      sender_avatar_color: m.sender_avatar_color,
      channel_name: m.channel_name || m.channel_id,
      channel_type: m.ch_type || m.channel_type,
      channel_key: m.ch_key || m.channel_id,
      created_at: m.created_at,
    }));

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to search messages', details: err.message });
  }
});

// ===========================================================================
// 17. POST /channels/:id/read — Mark all messages as read
// ===========================================================================
router.post('/channels/:id/read', (req, res) => {
  try {
    const channelId = parseInt(req.params.id, 10);
    const channel = getChannel(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const userId = req.user.id;

    const unread = db.prepare(`
      SELECT m.id FROM messages m
      WHERE m.channel_type = ? AND m.channel_id = ?
        AND m.sender_id != ?
        AND m.id NOT IN (SELECT mr.message_id FROM message_reads mr WHERE mr.user_id = ?)
    `).all(channel.channel_type, channel.channel_key, userId, userId);

    const insertRead = db.prepare('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)');
    const markAll = db.transaction((msgs) => {
      for (const m of msgs) {
        insertRead.run(m.id, userId);
      }
    });
    markAll(unread);

    res.json({ marked: unread.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as read', details: err.message });
  }
});

// ===========================================================================
// 18. GET /messages/:id/reads — Who read this message
// ===========================================================================
router.get('/messages/:id/reads', (req, res) => {
  try {
    const messageId = parseInt(req.params.id, 10);
    const reads = db.prepare(`
      SELECT u.id, u.name, u.avatar_color, mr.read_at
      FROM message_reads mr
      JOIN users u ON mr.user_id = u.id
      WHERE mr.message_id = ?
      ORDER BY mr.read_at ASC
    `).all(messageId);
    res.json(reads);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch read receipts', details: err.message });
  }
});

// ===========================================================================
// 19. GET /unread — Total unread count across all channels
// ===========================================================================
router.get('/unread', (req, res) => {
  try {
    const userId = req.user.id;

    // Get all channel keys user belongs to
    const memberChannels = db.prepare(`
      SELECT c.channel_type, c.channel_key
      FROM channels c
      JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
    `).all(userId);

    if (memberChannels.length === 0) {
      return res.json({ unread_count: 0 });
    }

    const conditions = memberChannels.map(() => '(m.channel_type = ? AND m.channel_id = ?)');
    const params = [];
    for (const ch of memberChannels) {
      params.push(ch.channel_type, ch.channel_key);
    }

    const sql = `
      SELECT COUNT(*) AS count FROM messages m
      WHERE (${conditions.join(' OR ')})
        AND m.sender_id != ?
        AND m.id NOT IN (SELECT mr.message_id FROM message_reads mr WHERE mr.user_id = ?)
    `;
    params.push(userId, userId);

    const result = db.prepare(sql).all(...params);
    const count = result[0] ? result[0].count : 0;

    res.json({ unread_count: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch unread count', details: err.message });
  }
});

// ===========================================================================
// 20. POST /announcements — Create announcement
// ===========================================================================
router.post('/announcements', requirePermission('messages:announce'), (req, res) => {
  try {
    const { content, scope, scope_id } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }
    if (!scope || !['all', 'property', 'team'].includes(scope)) {
      return res.status(400).json({ error: "scope must be 'all', 'property', or 'team'" });
    }

    let channelKey;
    let channelName;
    let memberIds = [];

    if (scope === 'all') {
      channelKey = 'announcement_all';
      channelName = 'Announcements';
      // All active users
      const allUsers = db.prepare("SELECT id FROM users WHERE is_active = 1 OR status = 'active'").all();
      memberIds = allUsers.map(u => u.id);
    } else if (scope === 'property') {
      if (!scope_id) return res.status(400).json({ error: 'scope_id required for property announcements' });
      const prop = db.prepare('SELECT id, name FROM properties WHERE id = ?').get(scope_id);
      if (!prop) return res.status(404).json({ error: 'Property not found' });
      channelKey = `announcement_property_${scope_id}`;
      channelName = `Announcements - ${prop.name}`;
      const accessRows = db.prepare('SELECT user_id FROM user_property_access WHERE property_id = ?').all(scope_id);
      memberIds = accessRows.map(r => r.user_id);
    } else if (scope === 'team') {
      if (!scope_id) return res.status(400).json({ error: 'scope_id required for team announcements' });
      const team = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(scope_id);
      if (!team) return res.status(404).json({ error: 'Team not found' });
      channelKey = `announcement_team_${scope_id}`;
      channelName = `Announcements - ${team.name}`;
      const teamMembers = db.prepare('SELECT user_id FROM user_teams WHERE team_id = ?').all(scope_id);
      memberIds = teamMembers.map(r => r.user_id);
    }

    // Ensure sender is included
    if (!memberIds.includes(req.user.id)) memberIds.push(req.user.id);

    const channel = ensureChannel('announcement', channelKey, channelName, memberIds, req.user.id);

    // Post the announcement message
    const result = db.prepare(`
      INSERT INTO messages (sender_id, channel_type, channel_id, content, message_type)
      VALUES (?, 'announcement', ?, ?, 'announcement')
    `).run(req.user.id, channel.channel_key, content.trim());

    const messageId = result.lastInsertRowid;

    // Auto-mark as read for sender
    db.prepare('INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)').run(messageId, req.user.id);

    // Create notifications for all members except sender
    for (const uid of memberIds) {
      if (uid !== req.user.id) {
        createNotification(uid, 'comment', `Announcement from ${req.user.name}`, content.trim().substring(0, 200), 'message', messageId);
      }
    }

    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    res.status(201).json({
      channel,
      message: enrichMessage(msg, req.user.id),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create announcement', details: err.message });
  }
});

module.exports = router;
