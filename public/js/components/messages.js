const Messages = {
  _pollInterval: null,
  _currentChannel: null,
  _lastMessageId: null,

  async render() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading messages...</p></div>';

    try {
      const channels = await API.get('/messages/channels');
      const users = await API.get('/auth/users').catch(() => []);

      container.innerHTML = `
        <div class="page-header">
          <h1>Messages <span class="tip-trigger" data-tip="messages"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
          <button class="btn btn-primary" onclick="Messages.showNewDM()">
            <i data-lucide="plus"></i> New Message
          </button>
        </div>
        <div class="messages-layout">
          <div class="messages-sidebar">
            <div class="messages-sidebar-header">
              <input type="text" class="form-control form-control-sm" placeholder="Search channels..." oninput="Messages.filterChannels(this.value)">
            </div>
            <div class="channel-list" id="channel-list">
              ${Messages._renderChannelList(channels)}
            </div>
          </div>
          <div class="messages-chat" id="messages-chat">
            <div class="messages-empty-chat">
              <i data-lucide="message-circle" class="empty-icon"></i>
              <h2>Select a conversation</h2>
              <p>Choose a channel from the left or start a new message.</p>
            </div>
          </div>
        </div>
      `;
      this._allChannels = channels;
      this._allUsers = Array.isArray(users) ? users : (users.data || users.users || []);
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  _renderChannelList(channels) {
    const directChannels = channels.filter(c => c.channel_type === 'direct');
    const teamChannels = channels.filter(c => c.channel_type === 'team');
    const woChannels = channels.filter(c => c.channel_type === 'work_order');

    let html = '';

    if (directChannels.length > 0) {
      html += '<div class="channel-group-label">Direct Messages</div>';
      html += directChannels.map(c => Messages._channelItem(c)).join('');
    }

    if (teamChannels.length > 0) {
      html += '<div class="channel-group-label">Team Channels</div>';
      html += teamChannels.map(c => Messages._channelItem(c)).join('');
    }

    if (woChannels.length > 0) {
      html += '<div class="channel-group-label">Work Order Threads</div>';
      html += woChannels.map(c => Messages._channelItem(c)).join('');
    }

    if (channels.length === 0) {
      html = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <i data-lucide="message-circle"></i>
          </div>
          <h2>No Conversations Yet</h2>
          <p class="empty-state-desc">Message your team directly, chat within teams, or discuss specific work orders. All communication stays organized and in context.</p>
          <div class="empty-state-features">
            <div class="empty-state-feature">
              <i data-lucide="user"></i>
              <div>
                <strong>Direct Messages</strong>
                <span>Private conversations with any team member</span>
              </div>
            </div>
            <div class="empty-state-feature">
              <i data-lucide="users"></i>
              <div>
                <strong>Team Channels</strong>
                <span>Group chat for each team</span>
              </div>
            </div>
            <div class="empty-state-feature">
              <i data-lucide="clipboard-list"></i>
              <div>
                <strong>Work Order Chat</strong>
                <span>Discuss specific tasks with everyone involved</span>
              </div>
            </div>
          </div>
          <div class="empty-state-connections">
            <span class="empty-state-conn"><i data-lucide="link"></i> Organized by direct, team, and work order channels</span>
          </div>
        </div>
      `;
    }

    return html;
  },

  _channelItem(channel) {
    const active = this._currentChannel &&
      this._currentChannel.type === channel.channel_type &&
      this._currentChannel.id === channel.channel_id ? ' active' : '';
    const preview = channel.last_message
      ? `<span class="channel-preview">${channel.last_message.sender_name}: ${Messages._truncate(channel.last_message.content, 40)}</span>`
      : '<span class="channel-preview text-muted">No messages yet</span>';
    const unread = channel.unread_count > 0
      ? `<span class="channel-unread-badge">${channel.unread_count}</span>`
      : '';
    const icon = channel.channel_type === 'direct' ? 'user' :
      channel.channel_type === 'team' ? 'users' : 'clipboard-list';
    const time = channel.last_message ? Messages._shortTime(channel.last_message.created_at) : '';

    return `
      <div class="channel-item${active}" onclick="Messages.openChannel('${channel.channel_type}', '${channel.channel_id}')">
        <div class="channel-icon"><i data-lucide="${icon}"></i></div>
        <div class="channel-info">
          <div class="channel-name-row">
            <span class="channel-name">${Messages._escapeHtml(channel.name)}</span>
            <span class="channel-time">${time}</span>
          </div>
          <div class="channel-preview-row">
            ${preview}
            ${unread}
          </div>
        </div>
      </div>
    `;
  },

  filterChannels(query) {
    const list = document.getElementById('channel-list');
    if (!list) return;
    const q = query.toLowerCase();
    const filtered = (this._allChannels || []).filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.last_message && c.last_message.content.toLowerCase().includes(q))
    );
    list.innerHTML = Messages._renderChannelList(filtered);
    lucide.createIcons({ nodes: [list] });
  },

  async openChannel(type, id) {
    this._currentChannel = { type, id };
    this._stopPolling();

    // Update active state in sidebar
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const items = document.querySelectorAll('.channel-item');
    items.forEach(el => {
      if (el.onclick && el.onclick.toString().includes(`'${type}', '${id}'`)) {
        el.classList.add('active');
      }
    });

    // Update URL without triggering full re-render
    window.history.replaceState(null, '', `#/messages/${type}/${id}`);

    const chatArea = document.getElementById('messages-chat');
    if (!chatArea) return;
    chatArea.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const messages = await API.get(`/messages/channels/${type}/${id}`);

      // Mark as read
      API.post(`/messages/read/${type}/${id}`).catch(() => {});
      Messages._updateUnreadBadge();

      // Get channel name
      let channelName = id;
      const ch = (this._allChannels || []).find(c => c.channel_type === type && c.channel_id === id);
      if (ch) channelName = ch.name;

      const currentUser = API.getUser();

      chatArea.innerHTML = `
        <div class="chat-header">
          <div class="chat-header-info">
            <i data-lucide="${type === 'direct' ? 'user' : type === 'team' ? 'users' : 'clipboard-list'}"></i>
            <h3>${Messages._escapeHtml(channelName)}</h3>
          </div>
          ${type === 'work_order' ? `<a href="#/workorders/${id.replace('wo_', '')}" class="btn btn-secondary btn-sm"><i data-lucide="external-link"></i> View WO</a>` : ''}
        </div>
        <div class="chat-messages" id="chat-messages">
          ${messages.length === 0
            ? '<div class="empty-state-sm">No messages yet. Start the conversation!</div>'
            : messages.map(m => Messages._renderMessage(m, currentUser)).join('')
          }
        </div>
        <form class="chat-input-form" onsubmit="Messages.sendMessage(event)">
          <textarea id="msg-input" class="form-control" rows="1" placeholder="Type a message..." onkeydown="Messages.handleKeyDown(event)"></textarea>
          <button type="submit" class="btn btn-primary">
            <i data-lucide="send"></i>
          </button>
        </form>
      `;

      lucide.createIcons({ nodes: [chatArea] });
      this._scrollToBottom();
      this._lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

      // Start polling
      this._startPolling();

      // Update the sidebar unread badge for this channel
      if (ch && ch.unread_count > 0) {
        ch.unread_count = 0;
        const channelList = document.getElementById('channel-list');
        if (channelList) {
          channelList.innerHTML = Messages._renderChannelList(this._allChannels || []);
          lucide.createIcons({ nodes: [channelList] });
        }
      }
    } catch (e) {
      chatArea.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  _renderMessage(msg, currentUser) {
    const isOwn = currentUser && msg.sender_id === currentUser.id;
    const avatarColor = msg.sender_avatar_color || '#3B82F6';
    const initial = (msg.sender_name || 'U').charAt(0).toUpperCase();
    const time = Messages._formatTime(msg.created_at);

    return `
      <div class="chat-message ${isOwn ? 'chat-message-own' : 'chat-message-other'}">
        ${!isOwn ? `<div class="chat-avatar" style="background:${avatarColor}">${initial}</div>` : ''}
        <div class="chat-bubble">
          ${!isOwn ? `<div class="chat-sender">${Messages._escapeHtml(msg.sender_name || 'Unknown')}</div>` : ''}
          <div class="chat-text">${Messages._escapeHtml(msg.content)}</div>
          <div class="chat-time">${time}</div>
        </div>
        ${isOwn ? `<div class="chat-avatar" style="background:${avatarColor}">${initial}</div>` : ''}
      </div>
    `;
  },

  async sendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('msg-input');
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;
    if (!this._currentChannel) return;

    input.value = '';
    input.style.height = 'auto';

    try {
      const { type, id } = this._currentChannel;
      const msg = await API.post(`/messages/channels/${type}/${id}`, { content });

      const chatMessages = document.getElementById('chat-messages');
      if (chatMessages) {
        // Remove empty state if present
        const emptyState = chatMessages.querySelector('.empty-state-sm');
        if (emptyState) emptyState.remove();

        const currentUser = API.getUser();
        chatMessages.insertAdjacentHTML('beforeend', Messages._renderMessage(msg, currentUser));
        this._scrollToBottom();
        this._lastMessageId = msg.id;
      }

      // Refresh channel list
      this._refreshChannelList();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      Messages.sendMessage(e);
    }
    // Auto-resize textarea
    const textarea = e.target;
    setTimeout(() => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }, 0);
  },

  async showNewDM() {
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
        <input type="text" class="form-control" id="dm-user-search" placeholder="Search users..." oninput="Messages._filterUserList(this.value)">
      </div>
      <div class="dm-user-list" id="dm-user-list">
        ${users.filter(u => u.id !== currentUser.id && u.is_active !== 0).map(u => `
          <div class="dm-user-item" onclick="Messages._startDM(${u.id})">
            <div class="chat-avatar" style="background:${u.avatar_color || '#3B82F6'}">${(u.name || 'U').charAt(0).toUpperCase()}</div>
            <div>
              <div class="dm-user-name">${Messages._escapeHtml(u.name)}</div>
              <div class="dm-user-email text-muted">${Messages._escapeHtml(u.email)}</div>
            </div>
          </div>
        `).join('')}
        ${users.filter(u => u.id !== currentUser.id).length === 0 ? '<div class="empty-state-sm">No other users found</div>' : ''}
      </div>
    `;
    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
    `;

    overlay.style.display = 'flex';
    lucide.createIcons({ nodes: [overlay] });
  },

  _filterUserList(query) {
    const list = document.getElementById('dm-user-list');
    if (!list) return;
    const currentUser = API.getUser();
    const q = query.toLowerCase();
    const filtered = (this._allUsers || []).filter(u =>
      u.id !== currentUser.id &&
      u.is_active !== 0 &&
      (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    );

    list.innerHTML = filtered.map(u => `
      <div class="dm-user-item" onclick="Messages._startDM(${u.id})">
        <div class="chat-avatar" style="background:${u.avatar_color || '#3B82F6'}">${(u.name || 'U').charAt(0).toUpperCase()}</div>
        <div>
          <div class="dm-user-name">${Messages._escapeHtml(u.name)}</div>
          <div class="dm-user-email text-muted">${Messages._escapeHtml(u.email)}</div>
        </div>
      </div>
    `).join('');

    if (filtered.length === 0) {
      list.innerHTML = '<div class="empty-state-sm">No users match your search</div>';
    }
  },

  async _startDM(otherUserId) {
    App.closeModal();
    const currentUser = API.getUser();
    const ids = [currentUser.id, otherUserId].sort((a, b) => a - b);
    const channelId = `${ids[0]}_${ids[1]}`;

    // Add to channels list if not there
    const existing = (this._allChannels || []).find(
      c => c.channel_type === 'direct' && c.channel_id === channelId
    );
    if (!existing) {
      const otherUser = (this._allUsers || []).find(u => u.id === otherUserId);
      this._allChannels = this._allChannels || [];
      this._allChannels.unshift({
        channel_type: 'direct',
        channel_id: channelId,
        name: otherUser ? otherUser.name : 'User',
        last_message: null,
        unread_count: 0
      });
      const channelList = document.getElementById('channel-list');
      if (channelList) {
        channelList.innerHTML = Messages._renderChannelList(this._allChannels);
        lucide.createIcons({ nodes: [channelList] });
      }
    }

    Messages.openChannel('direct', channelId);
  },

  async openChannelDirect(type, id) {
    // Called when navigating directly via URL
    await this.render();
    // Small delay to let the DOM render
    setTimeout(() => {
      this.openChannel(type, id);
    }, 100);
  },

  _startPolling() {
    this._stopPolling();
    this._pollInterval = setInterval(() => {
      Messages._pollNewMessages();
    }, 15000);
  },

  _stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  },

  async _pollNewMessages() {
    if (!this._currentChannel) return;
    const { type, id } = this._currentChannel;

    try {
      const messages = await API.get(`/messages/channels/${type}/${id}`);
      const chatMessages = document.getElementById('chat-messages');
      if (!chatMessages) return;

      const currentUser = API.getUser();
      const lastId = this._lastMessageId || 0;
      const newMessages = messages.filter(m => m.id > lastId);

      if (newMessages.length > 0) {
        const emptyState = chatMessages.querySelector('.empty-state-sm');
        if (emptyState) emptyState.remove();

        newMessages.forEach(m => {
          chatMessages.insertAdjacentHTML('beforeend', Messages._renderMessage(m, currentUser));
        });
        this._lastMessageId = newMessages[newMessages.length - 1].id;
        this._scrollToBottom();

        // Mark as read
        API.post(`/messages/read/${type}/${id}`).catch(() => {});
      }

      // Refresh channel list too
      this._refreshChannelList();
    } catch (e) {
      // Silently fail on poll errors
    }
  },

  async _refreshChannelList() {
    try {
      const channels = await API.get('/messages/channels');
      this._allChannels = channels;
      const channelList = document.getElementById('channel-list');
      if (channelList) {
        channelList.innerHTML = Messages._renderChannelList(channels);
        lucide.createIcons({ nodes: [channelList] });
      }
    } catch (e) {
      // Silently fail
    }
  },

  _scrollToBottom() {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  },

  // Global unread badge update (called from app.js)
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

  _updateUnreadBadge() {
    Messages.updateUnreadBadge();
  },

  cleanup() {
    this._stopPolling();
    this._currentChannel = null;
  },

  // Utilities
  _truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  },

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  _formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const oneDay = 86400000;

    if (diff < oneDay && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 2 * oneDay) {
      return 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  },

  _shortTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const oneDay = 86400000;

    if (diff < oneDay && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 7 * oneDay) {
      return d.toLocaleDateString([], { weekday: 'short' });
    } else {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }
};
