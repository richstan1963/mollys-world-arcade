/* Chat View — V6 Social Arcade Real-Time Chat */
window.ChatView = {
    currentChannel: { type: 'global', id: null },
    eventSource: null,
    messages: [],

    async render() {
        const app = document.getElementById('app');
        const players = await API.players().catch(() => []);
        const activePlayer = ArcadeEngine?.getActivePlayer?.();
        const onlinePlayers = await API.chatOnline().catch(() => []);

        app.innerHTML = `
            <div class="pro-view chat-view">
                <div class="pro-view-header">
                    <h1>\u{1F4AC} Arcade Chat</h1>
                    <p class="pro-view-sub">Talk with the family in real-time</p>
                </div>
                <div class="chat-layout">
                    <!-- Left sidebar: channels + online players -->
                    <div class="chat-sidebar" id="chatSidebar">
                        <div class="chat-channels">
                            <div class="chat-section-label">Channels</div>
                            <button class="chat-channel active" data-type="global" onclick="ChatView.switchChannel('global')">
                                \u{1F30D} Global Lobby
                            </button>
                            ${this.renderClanChannels(players, activePlayer)}
                        </div>
                        <div class="chat-online">
                            <div class="chat-section-label">Online Now (${onlinePlayers.length})</div>
                            ${onlinePlayers.map(p => `
                                <div class="chat-online-player">
                                    <span class="chat-presence-dot ${H.escHtml(p.status || 'online')}"></span>
                                    <span class="chat-player-emoji">${H.escHtml(p.emoji || '\u{1F3AE}')}</span>
                                    <span class="chat-player-name">${H.escHtml(p.name)}</span>
                                    ${p.current_game ? `<span class="chat-playing">\u{1F3AE} ${H.escHtml(p.current_game)}</span>` : ''}
                                </div>
                            `).join('')}
                            ${onlinePlayers.length === 0 ? '<div class="chat-empty">No one online yet</div>' : ''}
                        </div>
                        <div class="chat-dm-section">
                            <div class="chat-section-label">Direct Messages</div>
                            <button class="chat-new-dm-btn" onclick="ChatView.showNewDM()">+ New Message</button>
                            <div id="dmChannels"></div>
                        </div>
                    </div>

                    <!-- Main chat area -->
                    <div class="chat-main">
                        <div class="chat-header">
                            <button class="chat-sidebar-toggle" onclick="ChatView.toggleSidebar()">\u2630</button>
                            <span class="chat-header-icon">\u{1F30D}</span>
                            <span class="chat-header-title" id="chatTitle">Global Lobby</span>
                            <span class="chat-header-count" id="chatOnlineCount">${onlinePlayers.length} online</span>
                        </div>
                        <div class="chat-messages" id="chatMessages">
                            <div class="chat-welcome">
                                <span class="chat-welcome-emoji">\u{1F4AC}</span>
                                <span>Welcome to the arcade chat! Be nice, have fun.</span>
                            </div>
                        </div>
                        <div class="chat-input-bar">
                            ${activePlayer ? `
                                <span class="chat-input-avatar">${H.escHtml(activePlayer.emoji || '\u{1F3AE}')}</span>
                                <input type="text" id="chatInput" class="chat-input" placeholder="Type a message..." maxlength="500"
                                    onkeydown="if(event.key==='Enter')ChatView.send()">
                                <button class="chat-send-btn" onclick="ChatView.send()">Send</button>
                            ` : `
                                <div class="chat-login-prompt">Select a player profile to chat</div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.loadMessages();
        this.connectStream();
        if (activePlayer) this.loadDMChannels(activePlayer.id);

        // Update presence
        if (activePlayer) {
            API.chatPresence(activePlayer.id, 'online').catch(() => {});
        }
    },

    renderClanChannels(players, activePlayer) {
        // If active player has a clan, show clan channel
        // Populated from clan data when available
        return '';
    },

    async loadMessages() {
        try {
            const msgs = await API.chatMessages(this.currentChannel.type, this.currentChannel.id);
            this.messages = Array.isArray(msgs) ? msgs : (msgs.messages || []);
            this.renderMessages();
        } catch { /* silent */ }
    },

    renderMessages() {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        const welcome = this.messages.length === 0 ? `
            <div class="chat-welcome">
                <span class="chat-welcome-emoji">\u{1F4AC}</span>
                <span>No messages yet. Start the conversation!</span>
            </div>
        ` : '';

        container.innerHTML = welcome + this.messages.map(m => `
            <div class="chat-msg ${m.is_self ? 'chat-msg-self' : ''}">
                <span class="chat-msg-avatar" style="background:${H.escHtml(m.sender_color || '#666')}">${H.escHtml(m.sender_emoji || '\u{1F3AE}')}</span>
                <div class="chat-msg-body">
                    <div class="chat-msg-header">
                        <span class="chat-msg-name" style="color:${H.escHtml(m.sender_color || '#fff')}">${H.escHtml(m.sender_name)}</span>
                        <span class="chat-msg-time">${H.timeAgo(m.created_at)}</span>
                    </div>
                    <div class="chat-msg-text">${H.escHtml(m.message)}</div>
                </div>
            </div>
        `).join('');

        container.scrollTop = container.scrollHeight;
    },

    connectStream() {
        if (this.eventSource) this.eventSource.close();
        const params = new URLSearchParams({
            channel_type: this.currentChannel.type,
            channel_id: this.currentChannel.id || '',
        });
        this.eventSource = new EventSource(`/api/chat/stream?${params}`);
        this.eventSource.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.type === 'message') {
                    this.messages.push(data);
                    this.renderMessages();
                    if (typeof SFX !== 'undefined') SFX.click?.();
                }
            } catch { /* ignore parse errors */ }
        };
        this.eventSource.onerror = () => {
            // Silently handle — will auto-reconnect
        };
    },

    async send() {
        const input = document.getElementById('chatInput');
        if (!input || !input.value.trim()) return;
        const activePlayer = ArcadeEngine?.getActivePlayer?.();
        if (!activePlayer) return H.toast('Select a player first', 'warning');

        const message = input.value.trim();
        input.value = '';
        input.focus();

        try {
            await API.chatSend({
                channel_type: this.currentChannel.type,
                channel_id: this.currentChannel.id,
                sender_id: activePlayer.id,
                message: message,
            });
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    switchChannel(type, id, title) {
        this.currentChannel = { type, id: id || null };
        // Update active channel button styling
        document.querySelectorAll('.chat-channel').forEach(b => b.classList.remove('active'));
        const clicked = event?.target?.closest?.('.chat-channel');
        if (clicked) clicked.classList.add('active');
        // Update header
        const titleEl = document.getElementById('chatTitle');
        const iconMap = { global: '\u{1F30D}', clan: '\u2694\uFE0F', dm: '\u{1F4E9}' };
        if (titleEl) titleEl.textContent = title || (type === 'global' ? 'Global Lobby' : 'DM');
        const headerIcon = document.querySelector('.chat-header-icon');
        if (headerIcon) headerIcon.textContent = iconMap[type] || '\u{1F4AC}';
        this.loadMessages();
        this.connectStream();
        // Close mobile sidebar
        document.getElementById('chatSidebar')?.classList.remove('open');
    },

    async loadDMChannels(playerId) {
        try {
            const channels = await API.chatDMChannels(playerId);
            const list = Array.isArray(channels) ? channels : (channels.channels || []);
            const container = document.getElementById('dmChannels');
            if (!container) return;
            container.innerHTML = list.map(ch => `
                <button class="chat-channel chat-dm" onclick="ChatView.switchChannel('dm','${H.escHtml(String(ch.channel_id))}','${H.escHtml(ch.other_name)}')">
                    <span>${H.escHtml(ch.other_emoji || '\u{1F3AE}')}</span>
                    <span>${H.escHtml(ch.other_name)}</span>
                    ${ch.unread > 0 ? `<span class="chat-unread-badge">${ch.unread}</span>` : ''}
                </button>
            `).join('');
        } catch { /* silent */ }
    },

    showNewDM() {
        H.toast('Pick a player from the Online list to DM', 'info');
    },

    toggleSidebar() {
        document.getElementById('chatSidebar')?.classList.toggle('open');
    },

    destroy() {
        if (this.eventSource) { this.eventSource.close(); this.eventSource = null; }
        const activePlayer = ArcadeEngine?.getActivePlayer?.();
        if (activePlayer) {
            API.chatPresence(activePlayer.id, 'offline').catch(() => {});
        }
    },
};
