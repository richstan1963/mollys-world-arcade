/* Messages View — V6 Social Arcade Inbox & Messaging */
window.MessagesView = {
    currentTab: 'inbox',
    expandedId: null,

    typeIcons: {
        message: '\u{1F4AC}',
        clan_invite: '\u2694\uFE0F',
        challenge: '\u{1F3AF}',
        game_rec: '\u{1F3AE}',
        system: '\u{1F514}',
    },

    typeColors: {
        message: '#60A5FA',
        clan_invite: '#F59E0B',
        challenge: '#EF4444',
        game_rec: '#10B981',
        system: '#8B5CF6',
    },

    async render() {
        const app = document.getElementById('app');
        const activePlayer = ArcadeEngine?.getActivePlayer?.();

        if (!activePlayer?.id) {
            app.innerHTML = `
                <div class="pro-view messages-view">
                    <div class="pro-view-header">
                        <h1>\u{1F4E8} Messages</h1>
                        <p class="pro-view-sub">Your arcade inbox</p>
                    </div>
                    <div class="empty-state">
                        <div class="empty-state-icon">\u{1F464}</div>
                        <h3>No Active Player</h3>
                        <p>Select a player from the sidebar to view messages.</p>
                    </div>
                </div>
            `;
            return;
        }

        app.innerHTML = '<div class="loading">Loading messages...</div>';

        try {
            const [inboxData, sentData, unreadData] = await Promise.all([
                API.inbox(activePlayer.id),
                API.sentMessages(activePlayer.id).catch(() => []),
                API.unreadMessageCount(activePlayer.id).catch(() => ({ count: 0 })),
            ]);

            const inbox = Array.isArray(inboxData) ? inboxData : (inboxData.messages || []);
            const sent = Array.isArray(sentData) ? sentData : (sentData.messages || []);
            const unreadCount = unreadData.count || unreadData.unread || 0;
            const players = await API.players().catch(() => []);
            const otherPlayers = players.filter(p => p.id !== activePlayer.id);

            app.innerHTML = `
                <div class="pro-view messages-view">
                    <div class="pro-view-header">
                        <h1>\u{1F4E8} Messages</h1>
                        <p class="pro-view-sub">Your arcade inbox ${unreadCount > 0 ? `\u2022 ${unreadCount} unread` : ''}</p>
                    </div>

                    <div class="messages-tabs">
                        <button class="msg-tab ${this.currentTab === 'inbox' ? 'active' : ''}" onclick="MessagesView.switchTab('inbox')">
                            \u{1F4E5} Inbox ${unreadCount > 0 ? `<span class="msg-tab-badge">${unreadCount}</span>` : ''}
                        </button>
                        <button class="msg-tab ${this.currentTab === 'compose' ? 'active' : ''}" onclick="MessagesView.switchTab('compose')">
                            \u270F\uFE0F Compose
                        </button>
                        <button class="msg-tab ${this.currentTab === 'sent' ? 'active' : ''}" onclick="MessagesView.switchTab('sent')">
                            \u{1F4E4} Sent
                        </button>
                        ${unreadCount > 0 ? `<button class="btn btn-ghost btn-sm msg-mark-all" onclick="MessagesView.markAllRead()">Mark All Read</button>` : ''}
                    </div>

                    <div id="msgTabContent">
                        ${this.currentTab === 'inbox' ? this.renderInbox(inbox, activePlayer) : ''}
                        ${this.currentTab === 'compose' ? this.renderCompose(otherPlayers) : ''}
                        ${this.currentTab === 'sent' ? this.renderSent(sent) : ''}
                    </div>
                </div>
            `;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4A5}</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    renderInbox(messages, activePlayer) {
        if (messages.length === 0) {
            return `
                <div class="empty-state" style="margin-top:24px">
                    <div class="empty-state-icon">\u{1F4ED}</div>
                    <h3>Inbox Empty</h3>
                    <p>No messages yet. Start a conversation!</p>
                </div>
            `;
        }

        return `<div class="msg-list">${messages.map(m => {
            const icon = this.typeIcons[m.type] || '\u{1F4AC}';
            const color = this.typeColors[m.type] || '#60A5FA';
            const isExpanded = this.expandedId === m.id;
            const unread = !m.read_at;

            return `
                <div class="msg-card ${unread ? 'msg-unread' : ''}" style="border-left-color:${color}" onclick="MessagesView.toggleMessage(${m.id})">
                    <div class="msg-card-header">
                        <span class="msg-type-icon" style="color:${color}">${icon}</span>
                        <span class="msg-sender-avatar" style="background:${H.escHtml(m.sender_color || '#666')}">${H.escHtml(m.sender_emoji || '\u{1F3AE}')}</span>
                        <div class="msg-card-info">
                            <div class="msg-sender-name" style="color:${H.escHtml(m.sender_color || '#E2E8F0')}">${H.escHtml(m.sender_name)}</div>
                            <div class="msg-subject">${H.escHtml(m.subject || '(no subject)')}</div>
                        </div>
                        <div class="msg-card-meta">
                            <span class="msg-time">${H.timeAgo(m.created_at)}</span>
                            ${unread ? '<span class="msg-unread-dot"></span>' : ''}
                        </div>
                    </div>
                    ${!isExpanded ? `<div class="msg-preview">${H.escHtml((m.body || '').substring(0, 100))}${(m.body || '').length > 100 ? '...' : ''}</div>` : ''}
                    ${isExpanded ? `
                        <div class="msg-body-full">${H.escHtml(m.body || '')}</div>
                        <div class="msg-actions">
                            ${m.type === 'clan_invite' ? `
                                <button class="btn btn-sm btn-purple" onclick="event.stopPropagation();MessagesView.acceptClanInvite(${m.id}, ${m.meta_id || 0})">Accept</button>
                                <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();MessagesView.declineClanInvite(${m.id}, ${m.meta_id || 0})">Decline</button>
                            ` : ''}
                            ${m.type === 'challenge' ? `
                                <button class="btn btn-sm btn-purple" onclick="event.stopPropagation();location.hash='#clan-battles'">View Challenge</button>
                            ` : ''}
                            ${m.type === 'game_rec' && m.meta_rom_id ? `
                                <button class="btn btn-sm btn-purple" onclick="event.stopPropagation();location.hash='#game/' + ${m.meta_rom_id}">View Game</button>
                            ` : ''}
                            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();MessagesView.deleteMessage(${m.id})">\u{1F5D1}\uFE0F Delete</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('')}</div>`;
    },

    renderCompose(otherPlayers) {
        return `
            <div class="msg-compose-form">
                <div class="msg-form-group">
                    <label class="msg-form-label">To</label>
                    <select id="msgTo" class="form-select">
                        <option value="">-- Select Player --</option>
                        ${otherPlayers.map(p => `<option value="${p.id}">${H.escHtml(p.emoji || '\u{1F3AE}')} ${H.escHtml(p.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="msg-form-group">
                    <label class="msg-form-label">Type</label>
                    <select id="msgType" class="form-select">
                        <option value="message">\u{1F4AC} Message</option>
                        <option value="game_rec">\u{1F3AE} Game Recommendation</option>
                        <option value="challenge">\u{1F3AF} Challenge</option>
                    </select>
                </div>
                <div class="msg-form-group">
                    <label class="msg-form-label">Subject</label>
                    <input type="text" id="msgSubject" class="form-input" placeholder="Subject..." maxlength="200">
                </div>
                <div class="msg-form-group">
                    <label class="msg-form-label">Message</label>
                    <textarea id="msgBody" class="form-textarea" placeholder="Write your message..." rows="5" maxlength="2000"></textarea>
                </div>
                <button class="btn btn-purple" onclick="MessagesView.sendMessage()">Send Message</button>
            </div>
        `;
    },

    renderSent(messages) {
        if (messages.length === 0) {
            return `
                <div class="empty-state" style="margin-top:24px">
                    <div class="empty-state-icon">\u{1F4E4}</div>
                    <h3>No Sent Messages</h3>
                    <p>Messages you send will appear here.</p>
                </div>
            `;
        }

        return `<div class="msg-list">${messages.map(m => {
            const icon = this.typeIcons[m.type] || '\u{1F4AC}';
            const color = this.typeColors[m.type] || '#60A5FA';
            return `
                <div class="msg-card msg-sent-card" style="border-left-color:${color}">
                    <div class="msg-card-header">
                        <span class="msg-type-icon" style="color:${color}">${icon}</span>
                        <div class="msg-card-info">
                            <div class="msg-sender-name">To: ${H.escHtml(m.recipient_name || 'Unknown')}</div>
                            <div class="msg-subject">${H.escHtml(m.subject || '(no subject)')}</div>
                        </div>
                        <span class="msg-time">${H.timeAgo(m.created_at)}</span>
                    </div>
                    <div class="msg-preview">${H.escHtml((m.body || '').substring(0, 120))}</div>
                </div>
            `;
        }).join('')}</div>`;
    },

    switchTab(tab) {
        this.currentTab = tab;
        this.expandedId = null;
        this.render();
    },

    async toggleMessage(id) {
        const activePlayer = ArcadeEngine?.getActivePlayer?.();
        if (this.expandedId === id) {
            this.expandedId = null;
        } else {
            this.expandedId = id;
            // Mark as read
            if (activePlayer) {
                API.markMessageRead(id).catch(() => {});
            }
        }
        this.render();
    },

    async sendMessage() {
        const activePlayer = ArcadeEngine?.getActivePlayer?.();
        if (!activePlayer?.id) return H.toast('Select a player first', 'warning');

        const to = document.getElementById('msgTo')?.value;
        const type = document.getElementById('msgType')?.value || 'message';
        const subject = document.getElementById('msgSubject')?.value?.trim();
        const body = document.getElementById('msgBody')?.value?.trim();

        if (!to) return H.toast('Select a recipient', 'warning');
        if (!body) return H.toast('Write a message', 'warning');

        try {
            await API.sendMessage({
                sender_id: activePlayer.id,
                recipient_id: parseInt(to),
                type: type,
                subject: subject || '(no subject)',
                body: body,
            });
            H.toast('Message sent!', 'success');
            if (typeof SFX !== 'undefined') SFX.click?.();
            this.currentTab = 'sent';
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async markAllRead() {
        const activePlayer = ArcadeEngine?.getActivePlayer?.();
        if (!activePlayer?.id) return;
        try {
            await API.markAllMessagesRead(activePlayer.id);
            H.toast('All messages marked read', 'success');
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async deleteMessage(id) {
        try {
            await API.deleteMessage(id);
            H.toast('Message deleted', 'success');
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async acceptClanInvite(messageId, clanId) {
        const activePlayer = ArcadeEngine?.getActivePlayer?.();
        if (!activePlayer?.id || !clanId) return;
        try {
            await API.addClanMember(activePlayer.id, clanId);
            await API.markMessageRead(messageId).catch(() => {});
            H.toast('Clan invite accepted!', 'success');
            if (typeof SFX !== 'undefined') SFX.click?.();
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async declineClanInvite(messageId, clanId) {
        try {
            await API.markMessageRead(messageId).catch(() => {});
            H.toast('Clan invite declined', 'info');
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },
};
