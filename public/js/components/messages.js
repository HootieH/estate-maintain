const REACTIONS = {
  thumbsup: '\ud83d\udc4d', check: '\u2705', eyes: '\ud83d\udc40',
  heart: '\u2764\ufe0f', thinking: '\ud83e\udd14', fire: '\ud83d\udd25'
};

const Messages = {
  // --- State ---
  _currentView: 'stream',
  _currentChannel: null,
  _channels: [],
  _pollInterval: null,
  _unreadPollInterval: null,
  _lastMessageId: null,
  _activityFilter: 'all',
  _threadParentId: null,
  _mentionCandidates: [],
  _attachments: [],
  _allUsers: [],
  _mentionDropdownIndex: -1,
  _searchDebounceTimer: null,
  _channelSearchQuery: '',
  _showPinned: false,
  _activityCursor: null,
  _activityItems: [],
  _collapsedGroups: {},

  // ============================================================
  // PUBLIC ENTRY POINTS
  // ============================================================

  async render() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading messages...</p></div>';

    try {
      const [channels, users] = await Promise.all([
        API.get('/messages/channels'),
        API.get('/auth/users').catch(() => [])
      ]);

      this._channels = channels || [];
      this._allUsers = Array.isArray(users) ? users : (users.data || users.users || []);

      container.innerHTML = `
        <div class="page-header">
          <h1>Messages <span class="tip-trigger" data-tip="messages"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
          <div class="page-header-actions">
            <button class="btn btn-secondary btn-sm" onclick="Messages._openSearch()">
              <i data-lucide="search"></i> Search
            </button>
            ${Permissions.has('messages:announce') ? `
              <button class="btn btn-secondary btn-sm" onclick="Messages._showNewAnnouncement()">
                <i data-lucide="megaphone"></i> Announcement
              </button>
            ` : ''}
            <button class="btn btn-primary" onclick="Messages._showNewDM()">
              <i data-lucide="plus"></i> New Message
            </button>
          </div>
        </div>
        <div class="messages-layout">
          <div class="messages-sidebar" id="messages-sidebar">
            <div class="messages-sidebar-header">
              <input type="text" class="form-control form-control-sm" placeholder="Search channels..."
                oninput="Messages._filterChannelsSidebar(this.value)">
            </div>
            <div class="channel-list" id="channel-list">
              ${this._renderChannelGroups(this._channels)}
            </div>
          </div>
          <div class="messages-main" id="messages-main">
            <!-- Activity stream or channel view rendered here -->
          </div>
        </div>
      `;

      lucide.createIcons();

      // Default to activity stream
      this._currentView = 'stream';
      this._currentChannel = null;
      this._activityFilter = 'all';
      this._activityItems = [];
      this._activityCursor = null;
      this._renderActivityStream();

      // Start unread polling
      this._startUnreadPolling();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${this._escapeHtml(e.message)}</p></div>`;
    }
  },

  async openChannelDirect(type, id) {
    await this.render();
    setTimeout(() => {
      this._openChannel(type, id);
    }, 100);
  },

  cleanup() {
    this._stopPolling();
    this._stopUnreadPolling();
    this._currentView = 'stream';
    this._currentChannel = null;
    this._lastMessageId = null;
    this._threadParentId = null;
    this._attachments = [];
    this._mentionCandidates = [];
    this._activityItems = [];
    this._activityCursor = null;
  },

  async updateUnreadBadge() {
    try {
      const data = await API.get('/messages/unread');
      const badge = document.getElementById('messages-unread-badge');
      if (badge) {
        if (data.unread_count > 0) {
          badge.textContent = data.unread_count > 99 ? '99+' : data.unread_count;
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      }
    } catch (e) {
      // Silently fail
    }
  },

  // ============================================================
  // 1. ACTIVITY STREAM
  // ============================================================

  async _renderActivityStream() {
    const main = document.getElementById('messages-main');
    if (!main) return;

    this._currentView = 'stream';
    this._currentChannel = null;
    this._stopPolling();

    const tabs = ['all', 'direct', 'team', 'work_order', 'property', 'announcement'];
    const tabLabels = { all: 'All', direct: 'DMs', team: 'Teams', work_order: 'Work Orders', property: 'Properties', announcement: 'Announcements' };

    main.innerHTML = `
      <div class="activity-stream">
        <div class="stream-tabs">
          ${tabs.map(t => `
            <button class="status-tab ${this._activityFilter === t ? 'active' : ''}"
              onclick="Messages._setActivityFilter('${t}')">
              ${tabLabels[t]}
            </button>
          `).join('')}
        </div>
        <div class="stream-items" id="stream-items">
          <div class="loading"><div class="spinner"></div></div>
        </div>
      </div>
    `;

    lucide.createIcons({ nodes: [main] });
    await this._loadActivityStream(false);
  },

  async _loadActivityStream(append) {
    const streamItems = document.getElementById('stream-items');
    if (!streamItems) return;

    if (!append) {
      streamItems.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      this._activityItems = [];
      this._activityCursor = null;
    }

    try {
      let url = '/messages/activity-stream?limit=30';
      if (this._activityFilter !== 'all') {
        url += `&type=${encodeURIComponent(this._activityFilter)}`;
      }
      if (this._activityCursor) {
        url += `&before=${encodeURIComponent(this._activityCursor)}`;
      }

      const data = await API.get(url);
      const items = Array.isArray(data) ? data : (data.items || data.messages || []);

      this._activityItems = this._activityItems.concat(items);
      if (items.length > 0) {
        this._activityCursor = items[items.length - 1].id;
      }

      if (!append) {
        streamItems.innerHTML = '';
      } else {
        const loadMoreBtn = streamItems.querySelector('.stream-load-more');
        if (loadMoreBtn) loadMoreBtn.remove();
      }

      if (this._activityItems.length === 0) {
        streamItems.innerHTML = `
          <div class="empty-state-sm">
            <i data-lucide="message-circle" style="width:32px;height:32px;margin-bottom:8px;opacity:0.4"></i>
            <p>No messages yet. Start a conversation!</p>
          </div>
        `;
        lucide.createIcons({ nodes: [streamItems] });
        return;
      }

      items.forEach(item => {
        streamItems.insertAdjacentHTML('beforeend', this._renderStreamItem(item));
      });

      if (items.length >= 30) {
        streamItems.insertAdjacentHTML('beforeend', `
          <div class="stream-load-more">
            <button class="btn btn-secondary btn-sm" onclick="Messages._loadActivityStream(true)">
              Load more
            </button>
          </div>
        `);
      }

      lucide.createIcons({ nodes: [streamItems] });
    } catch (e) {
      if (!append) {
        streamItems.innerHTML = `<div class="error-state"><p>${this._escapeHtml(e.message)}</p></div>`;
      } else {
        App.toast('Failed to load more messages', 'error');
      }
    }
  },

  _renderStreamItem(item) {
    const channelType = item.channel_type || 'direct';
    const channelIcon = this._channelTypeIcon(channelType);
    const channelName = this._escapeHtml(item.channel_name || item.channel_key || 'Unknown');
    const senderName = this._escapeHtml(item.sender_name || 'Unknown');
    const avatarColor = item.sender_avatar_color || '#3B82F6';
    const initial = (item.sender_name || 'U').charAt(0).toUpperCase();
    const content = this._truncate(item.content || '', 120);
    const time = this._relativeTime(item.created_at);
    const isAnnouncement = channelType === 'announcement';
    const channelTypeStr = item.channel_type || '';
    const channelId = item.channel_id || '';

    return `
      <div class="stream-message ${isAnnouncement ? 'announcement-banner' : ''}"
        onclick="Messages._openChannel('${this._escapeHtml(channelTypeStr)}', '${this._escapeHtml(String(channelId))}')">
        <div class="stream-message-header">
          <span class="stream-channel-badge" title="${this._escapeHtml(channelType)}">
            <i data-lucide="${channelIcon}"></i>
            <span>${channelName}</span>
          </span>
          <span class="stream-time">${time}</span>
        </div>
        <div class="stream-message-body">
          <div class="chat-avatar" style="background:${avatarColor}">${initial}</div>
          <div class="stream-message-content">
            <span class="stream-sender">${senderName}</span>
            <span class="stream-text">${this._escapeHtml(content)}</span>
          </div>
        </div>
      </div>
    `;
  },

  _setActivityFilter(filter) {
    this._activityFilter = filter;
    this._activityCursor = null;
    this._activityItems = [];
    this._renderActivityStream();
  },

  // ============================================================
  // 2. CHANNEL SIDEBAR
  // ============================================================

  _renderChannelGroups(channels) {
    const groups = {
      starred: { label: 'Starred', icon: 'star', items: [] },
      direct: { label: 'Direct Messages', icon: 'user', items: [] },
      team: { label: 'Teams', icon: 'users', items: [] },
      property: { label: 'Properties', icon: 'building-2', items: [] },
      work_order: { label: 'Work Orders', icon: 'clipboard-list', items: [] }
    };

    (channels || []).forEach(c => {
      if (c.starred) {
        groups.starred.items.push(c);
      }
      const type = c.channel_type || 'direct';
      if (groups[type]) {
        groups[type].items.push(c);
      }
    });

    let html = '';
    const q = this._channelSearchQuery.toLowerCase();

    for (const [key, group] of Object.entries(groups)) {
      let items = group.items;
      if (q) {
        items = items.filter(c =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.last_message && c.last_message.content && c.last_message.content.toLowerCase().includes(q))
        );
      }
      if (items.length === 0 && key !== 'starred') continue;
      if (items.length === 0) continue;

      const unreadCount = items.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      const collapsed = this._collapsedGroups[key] ? ' collapsed' : '';

      html += `
        <div class="channel-group${collapsed}" data-group="${key}">
          <div class="channel-group-header" onclick="Messages._toggleGroup('${key}')">
            <i data-lucide="chevron-right" class="group-chevron"></i>
            <i data-lucide="${group.icon}"></i>
            <span class="channel-group-label">${group.label}</span>
            ${unreadCount > 0 ? `<span class="channel-unread-badge">${unreadCount}</span>` : ''}
          </div>
          <div class="channel-group-items">
            ${items.map(c => this._renderChannelItem(c)).join('')}
          </div>
        </div>
      `;
    }

    if (!html) {
      html = '<div class="empty-state-sm">No channels found</div>';
    }

    return html;
  },

  _renderChannelItem(channel) {
    const isActive = this._currentChannel &&
      this._currentChannel.type === channel.channel_type &&
      this._currentChannel.id === String(channel.channel_id);
    const icon = this._channelTypeIcon(channel.channel_type);
    const preview = channel.last_message
      ? `${this._escapeHtml(this._truncate(channel.last_message.sender_name || '', 12))}: ${this._escapeHtml(this._truncate(channel.last_message.content || '', 30))}`
      : '<span class="text-muted">No messages yet</span>';
    const time = channel.last_message ? this._relativeTime(channel.last_message.created_at) : '';
    const unread = (channel.unread_count || 0) > 0
      ? `<span class="channel-unread-badge">${channel.unread_count}</span>`
      : '';

    return `
      <div class="channel-item${isActive ? ' active' : ''}"
        onclick="Messages._openChannel('${this._escapeHtml(channel.channel_type)}', '${this._escapeHtml(String(channel.channel_id))}')">
        <div class="channel-icon"><i data-lucide="${icon}"></i></div>
        <div class="channel-info">
          <div class="channel-name-row">
            <span class="channel-name">${this._escapeHtml(channel.name || 'Unknown')}</span>
            <span class="channel-time">${time}</span>
          </div>
          <div class="channel-preview-row">
            <span class="channel-preview">${preview}</span>
            ${unread}
          </div>
        </div>
      </div>
    `;
  },

  _toggleGroup(key) {
    this._collapsedGroups[key] = !this._collapsedGroups[key];
    const group = document.querySelector(`.channel-group[data-group="${key}"]`);
    if (group) {
      group.classList.toggle('collapsed');
    }
  },

  _filterChannelsSidebar(query) {
    this._channelSearchQuery = query;
    const list = document.getElementById('channel-list');
    if (!list) return;
    list.innerHTML = this._renderChannelGroups(this._channels);
    lucide.createIcons({ nodes: [list] });
  },

  async _refreshChannelList() {
    try {
      const channels = await API.get('/messages/channels');
      this._channels = channels || [];
      const list = document.getElementById('channel-list');
      if (list) {
        list.innerHTML = this._renderChannelGroups(this._channels);
        lucide.createIcons({ nodes: [list] });
      }
    } catch (e) {
      // Silently fail
    }
  },

  // ============================================================
  // 3. CHANNEL VIEW
  // ============================================================

  async _openChannel(type, id) {
    if (!type || !id) return;
    this._currentView = 'channel';
    this._currentChannel = { type, id, key: `${type}_${id}` };
    this._threadParentId = null;
    this._showPinned = false;
    this._stopPolling();

    // Update URL
    window.history.replaceState(null, '', `#/messages/${type}/${id}`);

    // Mark active in sidebar
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));

    const main = document.getElementById('messages-main');
    if (!main) return;
    main.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const [messages, channelInfo] = await Promise.all([
        API.get(`/messages/channels/${type}/${id}`),
        this._getChannelInfo(type, id)
      ]);

      // Mark as read
      API.post(`/messages/read/${type}/${id}`).catch(() => {});
      this.updateUnreadBadge();

      const channelName = channelInfo.name || id;
      const memberCount = channelInfo.member_count || '';
      const currentUser = API.getUser();
      const msgArray = Array.isArray(messages) ? messages : (messages.messages || messages.data || []);

      main.innerHTML = `
        <div class="chat-header">
          <div class="chat-header-left">
            <button class="btn btn-ghost btn-sm" onclick="Messages._backToStream()" title="Back to stream">
              <i data-lucide="arrow-left"></i>
            </button>
            <i data-lucide="${this._channelTypeIcon(type)}"></i>
            <h3>${this._escapeHtml(channelName)}</h3>
            ${memberCount ? `<span class="chat-member-count">${memberCount} members</span>` : ''}
          </div>
          <div class="chat-header-actions">
            <button class="btn btn-ghost btn-sm" onclick="Messages._togglePinned()" title="Pinned messages">
              <i data-lucide="pin"></i> Pins
            </button>
            ${type === 'work_order' ? `
              <a href="#/workorders/${this._escapeHtml(String(id).replace('wo_', ''))}" class="btn btn-secondary btn-sm">
                <i data-lucide="external-link"></i> View WO
              </a>
            ` : ''}
          </div>
        </div>
        <div class="chat-pinned" id="chat-pinned" style="display:none"></div>
        <div class="chat-messages" id="chat-messages">
          ${msgArray.length === 0
            ? '<div class="empty-state-sm">No messages yet. Start the conversation!</div>'
            : msgArray.map(m => this._renderMessage(m, currentUser)).join('')
          }
        </div>
        <div class="thread-panel" id="thread-panel" style="display:none"></div>
        ${this._renderCompose()}
      `;

      lucide.createIcons({ nodes: [main] });
      this._scrollToBottom();
      this._lastMessageId = msgArray.length > 0 ? msgArray[msgArray.length - 1].id : null;

      // Update sidebar active state
      this._refreshSidebarActiveState();

      // Clear unread for this channel
      const ch = this._channels.find(c => c.channel_type === type && String(c.channel_id) === String(id));
      if (ch && ch.unread_count > 0) {
        ch.unread_count = 0;
        this._refreshChannelList();
      }

      // Start polling for new messages
      this._startPolling();

      // Load mention candidates
      this._loadMentionCandidates();
    } catch (e) {
      main.innerHTML = `
        <div class="chat-header">
          <div class="chat-header-left">
            <button class="btn btn-ghost btn-sm" onclick="Messages._backToStream()">
              <i data-lucide="arrow-left"></i>
            </button>
            <h3>Channel</h3>
          </div>
        </div>
        <div class="error-state"><p>${this._escapeHtml(e.message)}</p></div>
      `;
      lucide.createIcons({ nodes: [main] });
    }
  },

  _getChannelInfo(type, id) {
    const ch = (this._channels || []).find(c => c.channel_type === type && String(c.channel_id) === String(id));
    return Promise.resolve({
      name: ch ? ch.name : id,
      member_count: ch ? ch.member_count : null
    });
  },

  _refreshSidebarActiveState() {
    const list = document.getElementById('channel-list');
    if (list) {
      list.innerHTML = this._renderChannelGroups(this._channels);
      lucide.createIcons({ nodes: [list] });
    }
  },

  _backToStream() {
    window.history.replaceState(null, '', '#/messages');
    this._currentView = 'stream';
    this._currentChannel = null;
    this._stopPolling();
    this._refreshSidebarActiveState();
    this._renderActivityStream();
  },

  _renderMessage(msg, currentUser) {
    const isOwn = currentUser && msg.sender_id === currentUser.id;
    const isSystem = msg.message_type === 'system';

    if (isSystem) {
      return `
        <div class="chat-message chat-message-system" data-msg-id="${msg.id}">
          <div class="chat-system-text">${this._escapeHtml(msg.content)}</div>
          <div class="chat-time">${this._relativeTime(msg.created_at)}</div>
        </div>
      `;
    }

    const avatarColor = msg.sender_avatar_color || '#3B82F6';
    const initial = (msg.sender_name || 'U').charAt(0).toUpperCase();
    const time = this._relativeTime(msg.created_at);
    const edited = msg.edited_at ? '<span class="chat-edited">(edited)</span>' : '';
    const content = this._renderMentions(this._escapeHtml(msg.content || ''));
    const reactions = this._renderReactionBar(msg);
    const threadIndicator = (msg.reply_count && msg.reply_count > 0)
      ? `<div class="thread-indicator" onclick="event.stopPropagation(); Messages._openThread(${msg.id})">
           <i data-lucide="message-square"></i> ${msg.reply_count} ${msg.reply_count === 1 ? 'reply' : 'replies'}
         </div>`
      : '';
    const attachments = this._renderAttachments(msg.attachments);
    const readReceipts = isOwn ? this._renderReadReceipts(msg) : '';
    const canPin = Permissions.has('messages:pin') || Permissions.has('admin');

    return `
      <div class="chat-message ${isOwn ? 'chat-message-own' : 'chat-message-other'}" data-msg-id="${msg.id}">
        ${!isOwn ? `<div class="chat-avatar" style="background:${avatarColor}">${initial}</div>` : ''}
        <div class="chat-bubble-wrapper">
          <div class="chat-bubble">
            ${!isOwn ? `<div class="chat-sender">${this._escapeHtml(msg.sender_name || 'Unknown')}</div>` : ''}
            <div class="chat-text">${content}</div>
            ${attachments}
            <div class="chat-meta">
              <span class="chat-time">${time}</span>
              ${edited}
            </div>
          </div>
          <div class="message-actions">
            <button class="message-action-btn" onclick="event.stopPropagation(); Messages._showReactionPicker(${msg.id}, this)" title="React">
              <i data-lucide="smile"></i>
            </button>
            <button class="message-action-btn" onclick="event.stopPropagation(); Messages._openThread(${msg.id})" title="Reply in thread">
              <i data-lucide="message-square"></i>
            </button>
            ${canPin ? `
              <button class="message-action-btn" onclick="event.stopPropagation(); Messages._togglePin(${msg.id})" title="Pin">
                <i data-lucide="pin"></i>
              </button>
            ` : ''}
          </div>
          ${reactions}
          ${threadIndicator}
          ${readReceipts}
        </div>
        ${isOwn ? `<div class="chat-avatar" style="background:${avatarColor}">${initial}</div>` : ''}
      </div>
    `;
  },

  _renderAttachments(attachments) {
    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) return '';
    return `
      <div class="message-attachment">
        ${attachments.map(att => `
          <img src="${this._escapeHtml(att.url || att.thumbnail_url || '')}"
            class="message-attachment-img"
            alt="attachment"
            onclick="event.stopPropagation(); Messages._openLightbox('${this._escapeHtml(att.url || att.thumbnail_url || '')}')"
            loading="lazy">
        `).join('')}
      </div>
    `;
  },

  _openLightbox(url) {
    const existing = document.querySelector('.lightbox-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.onclick = () => overlay.remove();
    overlay.innerHTML = `<img src="${this._escapeHtml(url)}" alt="Full size">`;
    document.body.appendChild(overlay);
  },

  _renderReadReceipts(msg) {
    if (!msg.read_by || !Array.isArray(msg.read_by) || msg.read_by.length === 0) return '';
    const dots = msg.read_by.slice(0, 5).map(r => {
      const color = r.avatar_color || '#3B82F6';
      const initial = (r.name || 'U').charAt(0).toUpperCase();
      return `<span class="read-receipt-dot" style="background:${color}" title="${this._escapeHtml(r.name || 'User')}">${initial}</span>`;
    }).join('');
    return `<div class="read-receipts">${dots}</div>`;
  },

  // ============================================================
  // 4. COMPOSE AREA
  // ============================================================

  _renderCompose() {
    return `
      <form class="chat-input-form" onsubmit="Messages._sendMessage(event)">
        <div class="attachment-strip" id="attachment-strip" style="display:none"></div>
        <div class="compose-row">
          <button type="button" class="btn btn-ghost btn-sm" onclick="Messages._triggerFileInput()" title="Attach images">
            <i data-lucide="paperclip"></i>
          </button>
          <div class="compose-input-wrapper">
            <textarea id="msg-input" class="form-control" rows="1"
              placeholder="Type a message..."
              onkeydown="Messages._handleKeyDown(event)"
              oninput="Messages._handleInput(event)"></textarea>
            <div class="mention-dropdown" id="mention-dropdown" style="display:none"></div>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">
            <i data-lucide="send"></i>
          </button>
        </div>
        <input type="file" id="msg-file-input" accept="image/*" multiple style="display:none"
          onchange="Messages._handleFileSelect(event)">
      </form>
    `;
  },

  _handleKeyDown(e) {
    const dropdown = document.getElementById('mention-dropdown');
    const isDropdownVisible = dropdown && dropdown.style.display !== 'none';

    if (isDropdownVisible) {
      const items = dropdown.querySelectorAll('.mention-dropdown-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._mentionDropdownIndex = Math.min(this._mentionDropdownIndex + 1, items.length - 1);
        this._highlightMentionItem(items);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._mentionDropdownIndex = Math.max(this._mentionDropdownIndex - 1, 0);
        this._highlightMentionItem(items);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this._mentionDropdownIndex >= 0 && items[this._mentionDropdownIndex]) {
          items[this._mentionDropdownIndex].click();
        }
        return;
      }
      if (e.key === 'Escape') {
        this._closeMentionDropdown();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._sendMessage(e);
      return;
    }

    // Auto-resize textarea
    const textarea = e.target;
    setTimeout(() => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }, 0);
  },

  _handleInput(e) {
    const textarea = e.target;
    const val = textarea.value;
    const cursorPos = textarea.selectionStart;

    // Auto-resize
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';

    // Detect @mention trigger
    const textBeforeCursor = val.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@([^\s@]*)$/);

    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase();
      this._showMentionDropdown(query);
    } else {
      this._closeMentionDropdown();
    }
  },

  // --- @mention autocomplete ---

  async _loadMentionCandidates() {
    if (!this._currentChannel) return;
    const { type, id } = this._currentChannel;
    try {
      const data = await API.get(`/messages/channels/${type}/${id}/mention-candidates`);
      this._mentionCandidates = Array.isArray(data) ? data : (data.candidates || data.users || []);
    } catch (e) {
      // Fall back to all users
      this._mentionCandidates = this._allUsers || [];
    }
  },

  _showMentionDropdown(query) {
    const dropdown = document.getElementById('mention-dropdown');
    if (!dropdown) return;

    const candidates = (this._mentionCandidates.length > 0 ? this._mentionCandidates : this._allUsers)
      .filter(u => {
        const name = (u.name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        return name.includes(query) || email.includes(query);
      })
      .slice(0, 8);

    if (candidates.length === 0) {
      this._closeMentionDropdown();
      return;
    }

    this._mentionDropdownIndex = 0;
    dropdown.innerHTML = candidates.map((u, i) => {
      const color = u.avatar_color || '#3B82F6';
      const initial = (u.name || 'U').charAt(0).toUpperCase();
      return `
        <div class="mention-dropdown-item ${i === 0 ? 'active' : ''}"
          onclick="Messages._selectMention(${u.id}, '${this._escapeHtml(u.name || 'User')}')">
          <div class="chat-avatar" style="background:${color};width:24px;height:24px;font-size:11px">${initial}</div>
          <span>${this._escapeHtml(u.name || 'Unknown')}</span>
        </div>
      `;
    }).join('');
    dropdown.style.display = 'block';
  },

  _highlightMentionItem(items) {
    items.forEach((item, i) => {
      item.classList.toggle('active', i === this._mentionDropdownIndex);
    });
  },

  _selectMention(userId, displayName) {
    const textarea = document.getElementById('msg-input');
    if (!textarea) return;

    const val = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBefore = val.substring(0, cursorPos);
    const textAfter = val.substring(cursorPos);

    // Replace the @query with the mention token
    const newBefore = textBefore.replace(/@([^\s@]*)$/, `@[${userId}:${displayName}] `);
    textarea.value = newBefore + textAfter;
    textarea.selectionStart = textarea.selectionEnd = newBefore.length;
    textarea.focus();

    this._closeMentionDropdown();
  },

  _closeMentionDropdown() {
    const dropdown = document.getElementById('mention-dropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
    }
    this._mentionDropdownIndex = -1;
  },

  // --- File attachments ---

  _triggerFileInput() {
    const input = document.getElementById('msg-file-input');
    if (input) input.click();
  },

  _handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    const maxFiles = 4;
    const maxSize = 2 * 1024 * 1024; // 2MB

    files.forEach(file => {
      if (this._attachments.length >= maxFiles) {
        App.toast(`Maximum ${maxFiles} images allowed`, 'warning');
        return;
      }
      if (file.size > maxSize) {
        App.toast(`${file.name} exceeds 2MB limit`, 'warning');
        return;
      }
      if (!file.type.startsWith('image/')) {
        App.toast('Only images are supported', 'warning');
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        this._attachments.push({
          name: file.name,
          type: file.type,
          data: ev.target.result
        });
        this._renderAttachmentStrip();
      };
      reader.readAsDataURL(file);
    });

    // Reset file input
    e.target.value = '';
  },

  _renderAttachmentStrip() {
    const strip = document.getElementById('attachment-strip');
    if (!strip) return;

    if (this._attachments.length === 0) {
      strip.style.display = 'none';
      strip.innerHTML = '';
      return;
    }

    strip.style.display = 'flex';
    strip.innerHTML = this._attachments.map((att, i) => `
      <div class="attachment-thumb">
        <img src="${att.data}" alt="${this._escapeHtml(att.name)}">
        <button class="attachment-remove" onclick="Messages._removeAttachment(${i})" title="Remove">&times;</button>
      </div>
    `).join('');
  },

  _removeAttachment(index) {
    this._attachments.splice(index, 1);
    this._renderAttachmentStrip();
  },

  // --- Send message ---

  async _sendMessage(e) {
    if (e && e.preventDefault) e.preventDefault();
    const input = document.getElementById('msg-input');
    if (!input) return;
    const content = input.value.trim();
    if (!content && this._attachments.length === 0) return;
    if (!this._currentChannel) return;

    input.value = '';
    input.style.height = 'auto';

    const body = { content };
    if (this._attachments.length > 0) {
      body.attachments = this._attachments.map(att => ({
        name: att.name,
        type: att.type,
        data: att.data
      }));
    }

    this._attachments = [];
    this._renderAttachmentStrip();

    try {
      const { type, id } = this._currentChannel;

      // If replying in a thread
      if (this._threadParentId) {
        body.parent_id = this._threadParentId;
      }

      const msg = await API.post(`/messages/channels/${type}/${id}`, body);

      if (this._threadParentId) {
        // Append to thread panel
        this._appendThreadMessage(msg);
      } else {
        // Append to main chat
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
          const emptyState = chatMessages.querySelector('.empty-state-sm');
          if (emptyState) emptyState.remove();

          const currentUser = API.getUser();
          chatMessages.insertAdjacentHTML('beforeend', this._renderMessage(msg, currentUser));
          lucide.createIcons({ nodes: [chatMessages.lastElementChild] });
          this._scrollToBottom();
          this._lastMessageId = msg.id;
        }
      }

      this._refreshChannelList();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  // ============================================================
  // 5. REACTIONS
  // ============================================================

  _showReactionPicker(messageId, buttonEl) {
    // Remove any existing picker
    const existing = document.querySelector('.reaction-picker');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.innerHTML = Object.entries(REACTIONS).map(([key, emoji]) =>
      `<button class="reaction-pick-btn" onclick="event.stopPropagation(); Messages._toggleReaction(${messageId}, '${key}')" title="${key}">${emoji}</button>`
    ).join('');

    // Position near the button
    buttonEl.closest('.chat-bubble-wrapper').appendChild(picker);

    // Close on outside click
    const closeHandler = (e) => {
      if (!picker.contains(e.target) && e.target !== buttonEl) {
        picker.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  },

  async _toggleReaction(messageId, reaction) {
    // Remove picker
    const picker = document.querySelector('.reaction-picker');
    if (picker) picker.remove();

    try {
      await API.post(`/messages/${messageId}/reactions`, { reaction });
      // Refresh the channel to update reaction display
      if (this._currentChannel) {
        this._pollNewMessages();
      }
    } catch (e) {
      App.toast('Failed to react', 'error');
    }
  },

  _renderReactionBar(msg) {
    if (!msg.reactions || !Array.isArray(msg.reactions) || msg.reactions.length === 0) return '';
    const currentUser = API.getUser();
    const currentUserId = currentUser ? currentUser.id : null;

    const pills = msg.reactions.map(r => {
      const emoji = REACTIONS[r.reaction] || r.reaction;
      const count = r.count || 1;
      const isMine = r.user_ids && Array.isArray(r.user_ids) && r.user_ids.includes(currentUserId);
      return `
        <button class="reaction-pill ${isMine ? 'reaction-mine' : ''}"
          onclick="event.stopPropagation(); Messages._toggleReaction(${msg.id}, '${this._escapeHtml(r.reaction)}')">
          ${emoji} ${count}
        </button>
      `;
    }).join('');

    return `<div class="reaction-bar">${pills}</div>`;
  },

  // ============================================================
  // 6. SEARCH
  // ============================================================

  _openSearch() {
    const overlay = document.getElementById('modal-overlay');
    const title = overlay.querySelector('.modal-title');
    const body = overlay.querySelector('.modal-body');
    const footer = overlay.querySelector('.modal-footer');

    title.textContent = 'Search Messages';
    body.innerHTML = `
      <div class="form-group">
        <input type="text" class="form-control" id="msg-search-input"
          placeholder="Search messages..."
          oninput="Messages._debounceSearch(this.value)">
      </div>
      <div class="message-search-results" id="msg-search-results">
        <p class="text-muted" style="text-align:center;padding:24px">Type to search across all messages</p>
      </div>
    `;
    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
    `;

    overlay.style.display = 'flex';
    lucide.createIcons({ nodes: [overlay] });

    setTimeout(() => {
      const input = document.getElementById('msg-search-input');
      if (input) input.focus();
    }, 100);
  },

  _debounceSearch(query) {
    if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
    this._searchDebounceTimer = setTimeout(() => {
      this._executeSearch(query);
    }, 300);
  },

  async _executeSearch(query) {
    const results = document.getElementById('msg-search-results');
    if (!results) return;

    if (!query || query.trim().length < 2) {
      results.innerHTML = '<p class="text-muted" style="text-align:center;padding:24px">Type at least 2 characters to search</p>';
      return;
    }

    results.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const data = await API.get(`/messages/search?q=${encodeURIComponent(query.trim())}`);
      const items = Array.isArray(data) ? data : (data.results || data.messages || []);

      if (items.length === 0) {
        results.innerHTML = '<p class="text-muted" style="text-align:center;padding:24px">No messages found</p>';
        return;
      }

      results.innerHTML = items.map(item => {
        const highlighted = this._highlightText(this._escapeHtml(item.content || ''), query);
        const channelName = this._escapeHtml(item.channel_name || '');
        const senderName = this._escapeHtml(item.sender_name || 'Unknown');
        const time = this._relativeTime(item.created_at);
        const channelType = item.channel_type || '';
        const channelId = item.channel_id || '';

        return `
          <div class="search-result-item"
            onclick="App.closeModal(); Messages._openChannel('${this._escapeHtml(channelType)}', '${this._escapeHtml(String(channelId))}')">
            <div class="search-result-header">
              <span class="search-result-channel">${channelName}</span>
              <span class="search-result-time">${time}</span>
            </div>
            <div class="search-result-body">
              <span class="search-result-sender">${senderName}:</span>
              <span class="search-result-content">${highlighted}</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      results.innerHTML = `<p class="text-muted" style="text-align:center;padding:24px">${this._escapeHtml(e.message)}</p>`;
    }
  },

  _highlightText(text, query) {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return text.replace(regex, '<span class="search-highlight">$1</span>');
  },

  // ============================================================
  // 7. ANNOUNCEMENTS
  // ============================================================

  async _showNewAnnouncement() {
    const overlay = document.getElementById('modal-overlay');
    const title = overlay.querySelector('.modal-title');
    const body = overlay.querySelector('.modal-body');
    const footer = overlay.querySelector('.modal-footer');

    // Load properties and teams for scope
    let properties = [];
    let teams = [];
    try {
      const [propData, teamData] = await Promise.all([
        API.get('/properties').catch(() => []),
        API.get('/teams').catch(() => [])
      ]);
      properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);
      teams = Array.isArray(teamData) ? teamData : (teamData.data || teamData.teams || []);
    } catch (e) {
      // Continue with empty lists
    }

    title.textContent = 'New Announcement';
    body.innerHTML = `
      <div class="form-group">
        <label>Content</label>
        <textarea class="form-control" id="announce-content" rows="4" placeholder="Write your announcement..."></textarea>
      </div>
      <div class="form-group">
        <label>Scope</label>
        <select class="form-control" id="announce-scope" onchange="Messages._onAnnounceScopeChange()">
          <option value="all">All Users</option>
          <option value="property">Specific Property</option>
          <option value="team">Specific Team</option>
        </select>
      </div>
      <div class="form-group" id="announce-scope-id-group" style="display:none">
        <label id="announce-scope-id-label">Select</label>
        <select class="form-control" id="announce-scope-id">
          <option value="">-- Select --</option>
          ${properties.map(p => `<option value="${p.id}" data-scope="property">${this._escapeHtml(p.name)}</option>`).join('')}
          ${teams.map(t => `<option value="${t.id}" data-scope="team">${this._escapeHtml(t.name)}</option>`).join('')}
        </select>
      </div>
    `;
    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Messages._submitAnnouncement()">Post Announcement</button>
    `;

    overlay.style.display = 'flex';
    this._announceProps = properties;
    this._announceTeams = teams;
    lucide.createIcons({ nodes: [overlay] });
  },

  _onAnnounceScopeChange() {
    const scope = document.getElementById('announce-scope').value;
    const group = document.getElementById('announce-scope-id-group');
    const label = document.getElementById('announce-scope-id-label');
    const select = document.getElementById('announce-scope-id');

    if (scope === 'all') {
      group.style.display = 'none';
      return;
    }

    group.style.display = 'block';
    const items = scope === 'property' ? (this._announceProps || []) : (this._announceTeams || []);
    label.textContent = scope === 'property' ? 'Property' : 'Team';
    select.innerHTML = `
      <option value="">-- Select --</option>
      ${items.map(item => `<option value="${item.id}">${this._escapeHtml(item.name)}</option>`).join('')}
    `;
  },

  async _submitAnnouncement() {
    const content = (document.getElementById('announce-content') || {}).value || '';
    const scope = (document.getElementById('announce-scope') || {}).value || 'all';
    const scopeId = (document.getElementById('announce-scope-id') || {}).value || null;

    if (!content.trim()) {
      App.toast('Please enter announcement content', 'warning');
      return;
    }

    if (scope !== 'all' && !scopeId) {
      App.toast('Please select a scope target', 'warning');
      return;
    }

    try {
      const body = { content: content.trim(), scope };
      if (scopeId) body.scope_id = scopeId;
      await API.post('/messages/announcements', body);
      App.closeModal();
      App.toast('Announcement posted', 'success');

      // Refresh stream if viewing
      if (this._currentView === 'stream') {
        this._renderActivityStream();
      }
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  // ============================================================
  // 8. NEW DM
  // ============================================================

  _showNewDM() {
    const users = this._allUsers || [];
    const currentUser = API.getUser();

    const overlay = document.getElementById('modal-overlay');
    const title = overlay.querySelector('.modal-title');
    const body = overlay.querySelector('.modal-body');
    const footer = overlay.querySelector('.modal-footer');

    title.textContent = 'New Direct Message';
    body.innerHTML = `
      <div class="form-group">
        <label>Select User</label>
        <input type="text" class="form-control" id="dm-user-search" placeholder="Search users..."
          oninput="Messages._filterDMUserList(this.value)">
      </div>
      <div class="dm-user-list" id="dm-user-list">
        ${this._renderDMUserList(users, currentUser, '')}
      </div>
    `;
    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
    `;

    overlay.style.display = 'flex';
    lucide.createIcons({ nodes: [overlay] });

    setTimeout(() => {
      const input = document.getElementById('dm-user-search');
      if (input) input.focus();
    }, 100);
  },

  _renderDMUserList(users, currentUser, query) {
    const q = query.toLowerCase();
    const filtered = users.filter(u =>
      u.id !== (currentUser ? currentUser.id : null) &&
      u.is_active !== 0 &&
      (!q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
    );

    if (filtered.length === 0) {
      return '<div class="empty-state-sm">No users match your search</div>';
    }

    return filtered.map(u => `
      <div class="dm-user-item" onclick="Messages._startDM(${u.id})">
        <div class="chat-avatar" style="background:${u.avatar_color || '#3B82F6'}">${(u.name || 'U').charAt(0).toUpperCase()}</div>
        <div>
          <div class="dm-user-name">${this._escapeHtml(u.name || 'Unknown')}</div>
          <div class="dm-user-email text-muted">${this._escapeHtml(u.email || '')}</div>
        </div>
      </div>
    `).join('');
  },

  _filterDMUserList(query) {
    const list = document.getElementById('dm-user-list');
    if (!list) return;
    const currentUser = API.getUser();
    list.innerHTML = this._renderDMUserList(this._allUsers || [], currentUser, query);
  },

  async _startDM(otherUserId) {
    App.closeModal();

    try {
      const result = await API.post('/messages/channels', {
        channel_type: 'direct',
        member_ids: [otherUserId]
      });

      const channelId = result.channel_id || result.id;
      const channelType = result.channel_type || 'direct';

      // Refresh channels and open
      await this._refreshChannelList();
      this._openChannel(channelType, channelId);
    } catch (e) {
      // Fall back to computed channel ID for direct messages
      const currentUser = API.getUser();
      if (!currentUser) {
        App.toast(e.message, 'error');
        return;
      }
      const ids = [currentUser.id, otherUserId].sort((a, b) => a - b);
      const channelId = `${ids[0]}_${ids[1]}`;

      // Add to local channels if not there
      const existing = this._channels.find(c => c.channel_type === 'direct' && String(c.channel_id) === channelId);
      if (!existing) {
        const otherUser = (this._allUsers || []).find(u => u.id === otherUserId);
        this._channels.unshift({
          channel_type: 'direct',
          channel_id: channelId,
          name: otherUser ? otherUser.name : 'User',
          last_message: null,
          unread_count: 0
        });
        this._refreshSidebarActiveState();
      }

      this._openChannel('direct', channelId);
    }
  },

  // ============================================================
  // 9. POLLING
  // ============================================================

  _startPolling() {
    this._stopPolling();
    this._pollInterval = setInterval(() => {
      this._pollNewMessages();
    }, 10000);
  },

  _stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  },

  _startUnreadPolling() {
    this._stopUnreadPolling();
    this._unreadPollInterval = setInterval(() => {
      this.updateUnreadBadge();
    }, 30000);
  },

  _stopUnreadPolling() {
    if (this._unreadPollInterval) {
      clearInterval(this._unreadPollInterval);
      this._unreadPollInterval = null;
    }
  },

  async _pollNewMessages() {
    if (!this._currentChannel) return;
    const { type, id } = this._currentChannel;

    try {
      const data = await API.get(`/messages/channels/${type}/${id}`);
      const messages = Array.isArray(data) ? data : (data.messages || data.data || []);
      const chatMessages = document.getElementById('chat-messages');
      if (!chatMessages) return;

      const currentUser = API.getUser();
      const lastId = this._lastMessageId || 0;
      const newMessages = messages.filter(m => m.id > lastId);

      if (newMessages.length > 0) {
        const emptyState = chatMessages.querySelector('.empty-state-sm');
        if (emptyState) emptyState.remove();

        // Check if user is scrolled to bottom before appending
        const isAtBottom = this._isScrolledToBottom();

        newMessages.forEach(m => {
          chatMessages.insertAdjacentHTML('beforeend', this._renderMessage(m, currentUser));
        });
        lucide.createIcons({ nodes: [chatMessages] });
        this._lastMessageId = newMessages[newMessages.length - 1].id;

        // Auto-scroll only if user was at bottom
        if (isAtBottom) {
          this._scrollToBottom();
        }

        // Mark as read
        API.post(`/messages/read/${type}/${id}`).catch(() => {});
      }

      this._refreshChannelList();
    } catch (e) {
      // Silently fail on poll errors
    }
  },

  _isScrolledToBottom() {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return true;
    return chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 50;
  },

  _scrollToBottom() {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  },

  // ============================================================
  // PINNED MESSAGES
  // ============================================================

  async _togglePinned() {
    this._showPinned = !this._showPinned;
    const pinned = document.getElementById('chat-pinned');
    if (!pinned) return;

    if (!this._showPinned) {
      pinned.style.display = 'none';
      pinned.innerHTML = '';
      return;
    }

    if (!this._currentChannel) return;
    const { type, id } = this._currentChannel;

    pinned.style.display = 'block';
    pinned.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const data = await API.get(`/messages/channels/${type}/${id}/pins`);
      const pins = Array.isArray(data) ? data : (data.pins || data.messages || []);

      if (pins.length === 0) {
        pinned.innerHTML = '<div class="empty-state-sm">No pinned messages</div>';
        return;
      }

      pinned.innerHTML = `
        <div class="pinned-header">
          <i data-lucide="pin"></i> Pinned Messages
          <button class="btn btn-ghost btn-sm" onclick="Messages._togglePinned()" style="margin-left:auto">&times;</button>
        </div>
        ${pins.map(p => `
          <div class="pinned-item">
            <div class="pinned-sender">${this._escapeHtml(p.sender_name || 'Unknown')}</div>
            <div class="pinned-content">${this._escapeHtml(this._truncate(p.content || '', 100))}</div>
            <div class="pinned-time">${this._relativeTime(p.created_at)}</div>
          </div>
        `).join('')}
      `;
      lucide.createIcons({ nodes: [pinned] });
    } catch (e) {
      pinned.innerHTML = `<div class="error-state"><p>${this._escapeHtml(e.message)}</p></div>`;
    }
  },

  async _togglePin(messageId) {
    if (!this._currentChannel) return;

    try {
      await API.post(`/messages/${messageId}/pin`);
      App.toast('Pin toggled', 'success');
      if (this._showPinned) {
        this._showPinned = false;
        this._togglePinned(); // Re-open to refresh
      }
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  // ============================================================
  // THREAD PANEL
  // ============================================================

  async _openThread(parentId) {
    this._threadParentId = parentId;
    const panel = document.getElementById('thread-panel');
    if (!panel || !this._currentChannel) return;

    const { type, id } = this._currentChannel;

    panel.style.display = 'flex';
    panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const data = await API.get(`/messages/channels/${type}/${id}/threads/${parentId}`);
      const thread = Array.isArray(data) ? data : (data.messages || data.replies || []);
      const currentUser = API.getUser();

      panel.innerHTML = `
        <div class="thread-header">
          <h4>Thread</h4>
          <button class="btn btn-ghost btn-sm" onclick="Messages._closeThread()">&times;</button>
        </div>
        <div class="thread-messages" id="thread-messages">
          ${thread.map(m => this._renderMessage(m, currentUser)).join('')}
        </div>
        <form class="chat-input-form thread-compose" onsubmit="Messages._sendMessage(event)">
          <div class="compose-row">
            <textarea id="msg-input" class="form-control" rows="1"
              placeholder="Reply in thread..."
              onkeydown="Messages._handleKeyDown(event)"></textarea>
            <button type="submit" class="btn btn-primary btn-sm">
              <i data-lucide="send"></i>
            </button>
          </div>
        </form>
      `;

      lucide.createIcons({ nodes: [panel] });

      // Scroll thread to bottom
      const threadMessages = document.getElementById('thread-messages');
      if (threadMessages) {
        threadMessages.scrollTop = threadMessages.scrollHeight;
      }
    } catch (e) {
      panel.innerHTML = `
        <div class="thread-header">
          <h4>Thread</h4>
          <button class="btn btn-ghost btn-sm" onclick="Messages._closeThread()">&times;</button>
        </div>
        <div class="error-state"><p>${this._escapeHtml(e.message)}</p></div>
      `;
    }
  },

  _closeThread() {
    this._threadParentId = null;
    const panel = document.getElementById('thread-panel');
    if (panel) {
      panel.style.display = 'none';
      panel.innerHTML = '';
    }
  },

  _appendThreadMessage(msg) {
    const threadMessages = document.getElementById('thread-messages');
    if (!threadMessages) return;

    const currentUser = API.getUser();
    threadMessages.insertAdjacentHTML('beforeend', this._renderMessage(msg, currentUser));
    lucide.createIcons({ nodes: [threadMessages.lastElementChild] });
    threadMessages.scrollTop = threadMessages.scrollHeight;
  },

  // ============================================================
  // HELPER / UTILITY METHODS
  // ============================================================

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  _renderMentions(content) {
    if (!content) return '';
    // Replace @[userId:Display Name] with highlighted span
    return content.replace(/@\[(\d+):([^\]]+)\]/g, '<span class="mention">@$2</span>');
  },

  _relativeTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24 && d.getDate() === now.getDate()) return `${diffHr}h ago`;
    if (diffDay === 1 || (diffDay === 0 && d.getDate() !== now.getDate())) return 'Yesterday';
    if (diffDay < 7) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  },

  _truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  },

  _channelTypeIcon(type) {
    const icons = {
      direct: 'user',
      team: 'users',
      work_order: 'clipboard-list',
      property: 'building-2',
      announcement: 'megaphone'
    };
    return icons[type] || 'message-circle';
  }
};
