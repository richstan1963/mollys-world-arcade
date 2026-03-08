/* ═══════════════════════════════════════════════════════════════
   Social Hub View — Player Social Command Center
   The social nerve center of the arcade. Browse all players,
   see who's online, send messages, challenges, clan invites,
   manage friend lists, and configure privacy settings.
   Route: #/social  |  Also embeddable in player profile
   ═══════════════════════════════════════════════════════════════ */

window.SocialHubView = {
    _clans: [],
    _viewerId: null,

    async render() {
        const app = document.getElementById('app');
        const activePlayer = ArcadeEngine?.getActivePlayer?.();
        const viewerId = activePlayer?.id || null;

        app.innerHTML = '<div class="loading">Loading Social Hub...</div>';

        try {
            const data = await API.socialHub(viewerId);
            const players = data.players || [];
            // Also get clans for invite dropdown
            const clansData = await API.clans().catch(() => ({ clans: [] }));
            this._clans = (clansData.clans || []).filter(c => c.id !== 0);
            this._viewerId = viewerId;

            let html = `
                <div class="shub-container">
                    <div class="shub-header">
                        <div class="shub-title-row">
                            <h1 class="shub-title">\u{1F465} Player Hub</h1>
                            <div class="shub-title-stats">
                                <span class="shub-stat-pill online"><span class="shub-dot online"></span>${players.filter(p => p.presence.online).length} Online</span>
                                <span class="shub-stat-pill playing"><span class="shub-dot playing"></span>${players.filter(p => p.presence.playing).length} Playing</span>
                                <span class="shub-stat-pill">${players.length} Players</span>
                            </div>
                        </div>
                        <p class="shub-subtitle">Connect, compete, and collaborate with your arcade family</p>
                        <div class="shub-toolbar">
                            <div class="shub-search-wrap">
                                <input type="text" class="shub-search" id="shubSearch" placeholder="Search players..." oninput="SocialHubView.filterCards(this.value)">
                            </div>
                            <div class="shub-filter-wrap">
                                <button class="shub-filter-btn active" data-filter="all" onclick="SocialHubView.setFilter('all', this)">All</button>
                                <button class="shub-filter-btn" data-filter="online" onclick="SocialHubView.setFilter('online', this)">Online</button>
                                <button class="shub-filter-btn" data-filter="playing" onclick="SocialHubView.setFilter('playing', this)">Playing</button>
                                <button class="shub-filter-btn" data-filter="friends" onclick="SocialHubView.setFilter('friends', this)">Friends</button>
                            </div>
                            ${viewerId ? `<button class="shub-settings-btn" onclick="SocialHubView.showSettings()">\u2699\uFE0F My Social Settings</button>` : ''}
                        </div>
                    </div>

                    <div class="shub-grid" id="shubGrid">
            `;

            // Sort: online/playing first, then by XP
            const sorted = [...players].sort((a, b) => {
                if (a.presence.playing !== b.presence.playing) return a.presence.playing ? -1 : 1;
                if (a.presence.online !== b.presence.online) return a.presence.online ? -1 : 1;
                return (b.xp || 0) - (a.xp || 0);
            });

            for (const p of sorted) {
                html += this._renderPlayerCard(p, viewerId);
            }

            html += `
                    </div>
                </div>
            `;
            app.innerHTML = html;

        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4A5}</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    // ── Card Rendering ──

    _renderPlayerCard(p, viewerId) {
        const isSelf = p.relationship?.is_self;
        const isFriend = p.relationship?.is_friend;
        const isBlocked = p.relationship?.is_blocked;
        const pendingReq = p.relationship?.pending_request;
        const presenceClass = p.presence.status; // online, playing, offline

        // Level title
        const titles = ['Rookie','Apprentice','Gamer','Veteran','Elite','Champion','Hero','Legend','Mythic','Arcade God'];
        const titleIdx = Math.min(Math.floor((p.level || 1) / 3), titles.length - 1);
        const title = titles[titleIdx];

        // XP progress bar
        const xpInLevel = (p.xp || 0) % 500;
        const xpPct = Math.min(Math.round((xpInLevel / 500) * 100), 100);

        // Status text
        let statusText = '';
        if (p.presence.playing && p.presence.current_game) {
            statusText = `\u{1F3AE} Playing ${H.escHtml(p.presence.current_game)}`;
        } else if (p.status_message) {
            statusText = H.escHtml(p.status_message);
        } else if (p.presence.online) {
            statusText = '\u2728 Online';
        } else if (p.presence.last_seen) {
            statusText = `Last seen ${H.timeAgo(p.presence.last_seen)}`;
        }

        // Clan badge
        const clanBadge = p.clan ? `
            <div class="shub-clan-badge" style="--clan-color:${p.clan.color || '#F59E0B'}">
                <span>${p.clan.emoji || '\u2694\uFE0F'}</span>
                <span>${H.escHtml(p.clan.name)}</span>
            </div>
        ` : `<div class="shub-clan-badge none">No Clan</div>`;

        // Friend badge
        const friendBadge = isFriend ? `<span class="shub-friend-badge">\u{1F46B} Friends</span>` : '';

        // Action buttons (only for non-self players when viewer exists)
        let actionsHtml = '';
        if (viewerId && !isSelf) {
            if (isBlocked) {
                actionsHtml = `
                    <div class="shub-actions">
                        <button class="shub-action-btn unblock" onclick="SocialHubView.unblock(${p.id})">\u{1F513} Unblock</button>
                    </div>
                `;
            } else {
                const actions = [];

                // Message
                if (p.privacy.allow_dms) {
                    actions.push(`<button class="shub-action-btn message" onclick="SocialHubView.sendMessage(${p.id}, '${H.escHtml(p.name).replace(/'/g, "\\\\'")}')">\u{1F4AC} Message</button>`);
                }

                // Clan invite (if target is not in a clan)
                if (p.privacy.allow_clan_invites && !p.clan) {
                    actions.push(`<button class="shub-action-btn invite" onclick="SocialHubView.inviteToClan(${p.id}, '${H.escHtml(p.name).replace(/'/g, "\\\\'")}')">\u2694\uFE0F Invite to Clan</button>`);
                }

                // Challenge
                if (p.privacy.allow_challenges) {
                    actions.push(`<button class="shub-action-btn challenge" onclick="SocialHubView.sendChallenge(${p.id}, '${H.escHtml(p.name).replace(/'/g, "\\\\'")}')">\u{1F3AF} Challenge</button>`);
                }

                // Friend request
                if (!isFriend && !pendingReq) {
                    actions.push(`<button class="shub-action-btn friend" onclick="SocialHubView.addFriend(${p.id})">\u2795 Add Friend</button>`);
                } else if (pendingReq) {
                    actions.push(`<span class="shub-action-btn pending">\u23F3 Request Sent</span>`);
                }

                // Block
                actions.push(`<button class="shub-action-btn block" onclick="SocialHubView.block(${p.id}, '${H.escHtml(p.name).replace(/'/g, "\\\\'")}')">\u{1F6AB} Block</button>`);

                actionsHtml = `<div class="shub-actions">${actions.join('')}</div>`;
            }
        }

        // Self badge
        const selfBadge = isSelf ? `<span class="shub-self-badge">\u2B50 You</span>` : '';

        // Data attributes for filtering
        const dataAttrs = `data-name="${H.escHtml(p.name).toLowerCase()}" data-presence="${presenceClass}" data-friend="${isFriend ? '1' : '0'}"`;

        return `
            <div class="shub-card ${presenceClass} ${isSelf ? 'self' : ''} ${isBlocked ? 'blocked' : ''}" style="--player-color:${p.color}" ${dataAttrs}>
                <div class="shub-card-glow"></div>

                <div class="shub-card-top">
                    <div class="shub-avatar-wrap">
                        <div class="shub-avatar" style="border-color:${p.color}">${p.emoji}</div>
                        <div class="shub-presence-dot ${presenceClass}"></div>
                    </div>
                    <div class="shub-info">
                        <div class="shub-name-row">
                            <span class="shub-name">${H.escHtml(p.name)}</span>
                            ${selfBadge}
                            ${friendBadge}
                        </div>
                        <div class="shub-title-row-inner">
                            <span class="shub-level">Lv.${p.level || 1}</span>
                            <span class="shub-title-text">${title}</span>
                        </div>
                        <div class="shub-status">${statusText}</div>
                    </div>
                </div>

                <div class="shub-xp-bar">
                    <div class="shub-xp-fill" style="width:${xpPct}%;background:${p.color}"></div>
                </div>

                ${clanBadge}

                ${p.bio ? `<div class="shub-bio">${H.escHtml(p.bio)}</div>` : ''}

                <div class="shub-stats-row">
                    <div class="shub-mini-stat"><span class="shub-mini-val">${p.stats.total_plays}</span><span class="shub-mini-label">Plays</span></div>
                    <div class="shub-mini-stat"><span class="shub-mini-val">${p.stats.total_hours}h</span><span class="shub-mini-label">Time</span></div>
                    <div class="shub-mini-stat"><span class="shub-mini-val">${p.stats.favorites}</span><span class="shub-mini-label">Favs</span></div>
                    <div class="shub-mini-stat"><span class="shub-mini-val">${p.stats.achievements}</span><span class="shub-mini-label">\u{1F3C6}</span></div>
                    <div class="shub-mini-stat"><span class="shub-mini-val">${p.stats.friends}</span><span class="shub-mini-label">\u{1F46B}</span></div>
                </div>

                ${actionsHtml}

                <div class="shub-card-footer">
                    <button class="shub-view-profile" onclick="Router.navigate('#/player/${p.id}')">View Profile</button>
                    <button class="shub-view-card" onclick="Router.navigate('#/card/${p.id}')">\u{1F0CF} Card</button>
                </div>
            </div>
        `;
    },

    // ── Filtering & Search ──

    filterCards(query) {
        const q = (query || '').toLowerCase().trim();
        document.querySelectorAll('.shub-card').forEach(card => {
            const name = card.dataset.name || '';
            card.style.display = (!q || name.includes(q)) ? '' : 'none';
        });
    },

    setFilter(filter, btn) {
        // Update active button
        document.querySelectorAll('.shub-filter-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');

        document.querySelectorAll('.shub-card').forEach(card => {
            const presence = card.dataset.presence;
            const isFriend = card.dataset.friend === '1';
            let show = true;

            if (filter === 'online') show = presence === 'online' || presence === 'playing';
            else if (filter === 'playing') show = presence === 'playing';
            else if (filter === 'friends') show = isFriend;

            card.style.display = show ? '' : 'none';
        });
    },

    // ── Social Settings Modal ──

    async showSettings() {
        if (!this._viewerId) return;
        try {
            const data = await API.socialSettings(this._viewerId);
            const s = data.settings || {};
            const blocked = data.blocked_players || [];

            const overlay = document.createElement('div');
            overlay.className = 'shub-settings-overlay';
            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
            overlay.innerHTML = `
                <div class="shub-settings-modal">
                    <div class="shub-settings-header">
                        <h2>\u2699\uFE0F Social Settings</h2>
                        <button class="shub-settings-close" onclick="this.closest('.shub-settings-overlay').remove()">\u2715</button>
                    </div>

                    <div class="shub-settings-section">
                        <h3>\u{1F4DD} Profile</h3>
                        <div class="shub-settings-field">
                            <label>Status Message</label>
                            <input type="text" id="shubStatusMsg" value="${H.escHtml(s.status_message || '')}" placeholder="What are you up to?" maxlength="100">
                        </div>
                        <div class="shub-settings-field">
                            <label>Bio</label>
                            <textarea id="shubBio" rows="3" placeholder="Tell people about yourself..." maxlength="300">${H.escHtml(s.bio || '')}</textarea>
                        </div>
                    </div>

                    <div class="shub-settings-section">
                        <h3>\u{1F512} Privacy</h3>
                        <label class="shub-toggle-row"><span>Allow Direct Messages</span><input type="checkbox" id="shubAllowDMs" ${s.allow_dms ? 'checked' : ''}><span class="shub-toggle-slider"></span></label>
                        <label class="shub-toggle-row"><span>Allow Chat</span><input type="checkbox" id="shubAllowChat" ${s.allow_chat ? 'checked' : ''}><span class="shub-toggle-slider"></span></label>
                        <label class="shub-toggle-row"><span>Show Online Status</span><input type="checkbox" id="shubShowOnline" ${s.show_online ? 'checked' : ''}><span class="shub-toggle-slider"></span></label>
                        <label class="shub-toggle-row"><span>Show Activity</span><input type="checkbox" id="shubShowActivity" ${s.show_activity ? 'checked' : ''}><span class="shub-toggle-slider"></span></label>
                        <label class="shub-toggle-row"><span>Show Favorites</span><input type="checkbox" id="shubShowFavs" ${s.show_favorites ? 'checked' : ''}><span class="shub-toggle-slider"></span></label>
                        <label class="shub-toggle-row"><span>Allow Clan Invites</span><input type="checkbox" id="shubAllowInvites" ${s.allow_clan_invites ? 'checked' : ''}><span class="shub-toggle-slider"></span></label>
                        <label class="shub-toggle-row"><span>Allow Challenges</span><input type="checkbox" id="shubAllowChallenges" ${s.allow_challenges ? 'checked' : ''}><span class="shub-toggle-slider"></span></label>
                    </div>

                    ${blocked.length > 0 ? `
                        <div class="shub-settings-section">
                            <h3>\u{1F6AB} Blocked Players</h3>
                            <div class="shub-blocked-list">
                                ${blocked.map(b => `
                                    <div class="shub-blocked-item">
                                        <span>${b.emoji} ${H.escHtml(b.name)}</span>
                                        <button class="shub-unblock-btn" onclick="SocialHubView.unblockFromSettings(${b.blocked_player_id})">Unblock</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <div class="shub-settings-actions">
                        <button class="btn btn-primary" onclick="SocialHubView.saveSettings()">\u{1F4BE} Save Settings</button>
                        <button class="btn btn-ghost" onclick="this.closest('.shub-settings-overlay').remove()">Cancel</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        } catch (err) {
            H.toast('Failed to load settings: ' + err.message, 'error');
        }
    },

    async saveSettings() {
        try {
            await API.updateSocialSettings(this._viewerId, {
                status_message: document.getElementById('shubStatusMsg')?.value || '',
                bio: document.getElementById('shubBio')?.value || '',
                allow_dms: document.getElementById('shubAllowDMs')?.checked,
                allow_chat: document.getElementById('shubAllowChat')?.checked,
                show_online: document.getElementById('shubShowOnline')?.checked,
                show_activity: document.getElementById('shubShowActivity')?.checked,
                show_favorites: document.getElementById('shubShowFavs')?.checked,
                allow_clan_invites: document.getElementById('shubAllowInvites')?.checked,
                allow_challenges: document.getElementById('shubAllowChallenges')?.checked,
            });
            document.querySelector('.shub-settings-overlay')?.remove();
            H.toast('Settings saved!', 'success');
            this.render();
        } catch (err) {
            H.toast('Failed: ' + err.message, 'error');
        }
    },

    // ── Social Actions ──

    async sendMessage(playerId, name) {
        Router.navigate('#/messages');
        // After nav, pre-fill the compose tab with this player
        setTimeout(() => {
            const event = new CustomEvent('prefill-message', { detail: { to_player_id: playerId, to_name: name } });
            window.dispatchEvent(event);
        }, 300);
    },

    async inviteToClan(playerId, name) {
        const clans = this._clans || [];
        if (clans.length === 0) {
            H.toast('Create a clan first!', 'error');
            return;
        }

        // If only one clan, send immediately
        if (clans.length === 1) {
            try {
                await API.inviteToClan(this._viewerId, playerId, clans[0].id);
                H.toast(`Clan invite sent to ${name}!`, 'success');
                SFX?.click?.();
            } catch (err) {
                H.toast(err.message, 'error');
            }
            return;
        }

        // Multiple clans -- show picker
        const overlay = document.createElement('div');
        overlay.className = 'shub-settings-overlay';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        overlay.innerHTML = `
            <div class="shub-settings-modal" style="max-width:360px">
                <h3>Choose Clan to Invite ${H.escHtml(name)} To:</h3>
                <div class="shub-clan-picker">
                    ${clans.map(c => `
                        <button class="shub-clan-pick-btn" onclick="SocialHubView.confirmClanInvite(${playerId}, ${c.id}, '${H.escHtml(name).replace(/'/g, "\\\\'")}');this.closest('.shub-settings-overlay').remove()">
                            <span>${c.emoji || '\u2694\uFE0F'}</span>
                            <span>${H.escHtml(c.name)}</span>
                        </button>
                    `).join('')}
                </div>
                <button class="btn btn-ghost" style="margin-top:12px;width:100%" onclick="this.closest('.shub-settings-overlay').remove()">Cancel</button>
            </div>
        `;
        document.body.appendChild(overlay);
    },

    async confirmClanInvite(playerId, clanId, name) {
        try {
            await API.inviteToClan(this._viewerId, playerId, clanId);
            H.toast(`Clan invite sent to ${name}!`, 'success');
            SFX?.click?.();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async sendChallenge(playerId, name) {
        const msg = prompt(`Challenge ${name}! Add a message (optional):`, 'I challenge you!');
        if (msg === null) return;
        try {
            await API.sendChallenge(this._viewerId, playerId, null, null, msg || 'I challenge you!');
            H.toast(`Challenge sent to ${name}!`, 'success');
            SFX?.click?.();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async addFriend(playerId) {
        try {
            await API.sendFriendRequest(this._viewerId, playerId);
            H.toast('Friend request sent!', 'success');
            SFX?.click?.();
            this.render(); // Refresh to show pending
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async block(playerId, name) {
        if (!confirm(`Block ${name}? They won't be able to message or challenge you.`)) return;
        try {
            await API.blockPlayer(this._viewerId, playerId);
            H.toast(`${name} blocked`, 'success');
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async unblock(playerId) {
        try {
            await API.unblockPlayer(this._viewerId, playerId);
            H.toast('Player unblocked', 'success');
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async unblockFromSettings(playerId) {
        try {
            await API.unblockPlayer(this._viewerId, playerId);
            H.toast('Player unblocked', 'success');
            // Refresh settings modal
            document.querySelector('.shub-settings-overlay')?.remove();
            this.showSettings();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },
};
