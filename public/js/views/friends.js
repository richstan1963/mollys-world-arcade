/* Friends View — Friends System */
window.FriendsView = {
    async render() {
        const app = document.getElementById('app');
        const activePlayer = ArcadeEngine?.getActivePlayer?.();

        if (!activePlayer?.id) {
            app.innerHTML = `
                <div class="section-header" style="margin-bottom:24px;">
                    <span class="section-title">\u{1F465} Friends</span>
                </div>
                <div class="empty-state">
                    <div class="empty-state-icon">\u{1F464}</div>
                    <h3>No Active Player</h3>
                    <p>Select a player from the sidebar to see your friends.</p>
                </div>
            `;
            return;
        }

        app.innerHTML = '<div class="loading">Loading friends...</div>';

        try {
            const [friendsData, allPlayersData, activityData] = await Promise.all([
                API.get(`/api/friends/${activePlayer.id}`),
                API.players().catch(() => []),
                API.get(`/api/friends/${activePlayer.id}/activity`).catch(() => []),
            ]);

            const friends = friendsData.friends || friendsData || [];
            const allPlayers = Array.isArray(allPlayersData) ? allPlayersData : (allPlayersData.players || arcade.players || []);
            const activity = Array.isArray(activityData) ? activityData : (activityData.activity || []);
            const friendIds = new Set(friends.map(f => f.friend_id || f.id));

            // Determine online status (active in last 15 minutes)
            const now = Date.now();
            const isOnline = (lastActive) => {
                if (!lastActive) return false;
                const d = new Date(lastActive + (lastActive.includes('Z') ? '' : 'Z'));
                return (now - d.getTime()) < 900000; // 15 min
            };

            let html = `
                <div class="section-header" style="margin-bottom:24px;">
                    <span class="section-title">\u{1F465} ${H.escHtml(activePlayer.name)}'s Friends</span>
                </div>
            `;

            // Add friend section
            const nonFriends = allPlayers.filter(p => p.id !== activePlayer.id && !friendIds.has(p.id));
            if (nonFriends.length > 0) {
                html += `
                    <div class="friends-add-row">
                        <select id="friendAddPlayer" class="form-select">
                            <option value="">-- Add a Friend --</option>
                            ${nonFriends.map(p => `<option value="${p.id}">${p.emoji} ${H.escHtml(p.name)}</option>`).join('')}
                        </select>
                        <button class="btn btn-purple btn-sm" onclick="FriendsView.addFriend()">Add Friend</button>
                    </div>
                `;
            }

            // Friends list
            if (friends.length > 0) {
                html += '<div class="friends-grid">';
                for (const f of friends) {
                    const online = isOnline(f.last_active);
                    html += `
                        <div class="friend-card">
                            <div class="friend-avatar-wrap">
                                <span class="friend-avatar" style="border-color:${f.color || '#666'}">${f.emoji || '\u{1F3AE}'}</span>
                                <span class="friend-status ${online ? 'friend-online' : 'friend-offline'}"></span>
                            </div>
                            <div class="friend-info">
                                <div class="friend-name" style="color:${f.color || '#E2E8F0'}">${H.escHtml(f.name)}</div>
                                <div class="friend-meta">
                                    Lv.${f.level || 1}
                                    ${f.last_game ? ` \u00B7 Last: ${H.escHtml(f.last_game)}` : ''}
                                </div>
                                <div class="friend-last-active">${online ? 'Online now' : H.timeAgo(f.last_active)}</div>
                            </div>
                            <button class="btn btn-ghost btn-sm" onclick="FriendsView.showCompare(${activePlayer.id}, ${f.friend_id || f.id})" title="Compare">
                                \u{1F4CA}
                            </button>
                        </div>
                    `;
                }
                html += '</div>';
            } else {
                html += `
                    <div class="empty-state" style="margin-top:24px;">
                        <div class="empty-state-icon">\u{1F465}</div>
                        <h3>No Friends Yet</h3>
                        <p>Add a family member as a friend to compare stats!</p>
                    </div>
                `;
            }

            // Friend Activity Feed
            if (activity.length > 0) {
                html += `
                    <div class="section-header" style="margin-top:32px;">
                        <span class="section-title">\u{1F4E1} Friend Activity</span>
                    </div>
                    <div class="friends-activity-feed">
                `;
                for (const item of activity.slice(0, 20)) {
                    const actionText = item.action === 'play' ? 'played'
                        : item.action === 'favorite' ? 'favorited'
                        : item.action === 'achievement' ? 'earned'
                        : item.action === 'high_score' ? 'set a high score on'
                        : 'interacted with';
                    html += `
                        <div class="friends-feed-item">
                            <span class="friends-feed-avatar" style="border-color:${item.color || '#666'}">${item.emoji || '\u{1F3AE}'}</span>
                            <div class="friends-feed-body">
                                <span class="friends-feed-name" style="color:${item.color || '#E2E8F0'}">${H.escHtml(item.player_name)}</span>
                                <span class="friends-feed-action">${actionText} <strong>${H.escHtml(item.game_name || item.title || '')}</strong></span>
                            </div>
                            <span class="friends-feed-time">${H.timeAgo(item.created_at)}</span>
                        </div>
                    `;
                }
                html += '</div>';
            }

            // Comparison container
            html += '<div id="friendCompareSection"></div>';

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4A5}</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    async addFriend() {
        const activePlayer = ArcadeEngine?.getActivePlayer?.();
        const friendId = document.getElementById('friendAddPlayer')?.value;
        if (!activePlayer?.id || !friendId) { H.toast('Select a player to add', 'error'); return; }

        try {
            await API.post(`/api/friends/${activePlayer.id}`, { friend_id: parseInt(friendId) });
            H.toast('Friend added!', 'success');
            SFX?.click?.();
            this.render();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    async showCompare(playerId, friendId) {
        const section = document.getElementById('friendCompareSection');
        if (!section) return;
        section.innerHTML = '<div class="loading">Loading comparison...</div>';

        try {
            const [myStats, friendStats] = await Promise.all([
                API.playerStats(playerId),
                API.playerStats(friendId),
            ]);

            const me = myStats.player || myStats;
            const them = friendStats.player || friendStats;
            const myS = myStats.stats || myStats;
            const theirS = friendStats.stats || friendStats;

            const rows = [
                { label: 'Total Plays', mine: myS.total_plays || 0, theirs: theirS.total_plays || 0 },
                { label: 'Total Time', mine: myS.total_seconds || 0, theirs: theirS.total_seconds || 0, fmt: H.formatDuration },
                { label: 'Favorites', mine: myS.favorites || myS.fav_count || 0, theirs: theirS.favorites || theirS.fav_count || 0 },
                { label: 'XP', mine: me.xp || 0, theirs: them.xp || 0 },
                { label: 'Level', mine: me.level || 1, theirs: them.level || 1 },
            ];

            let html = `
                <div class="section-header" style="margin-top:32px;">
                    <span class="section-title">\u{1F4CA} Head to Head</span>
                    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('friendCompareSection').innerHTML=''">Close</button>
                </div>
                <div class="friends-compare">
                    <div class="friends-compare-header">
                        <div class="friends-compare-player">
                            <span style="color:${me.color}">${me.emoji} ${H.escHtml(me.name)}</span>
                        </div>
                        <div class="friends-compare-vs">VS</div>
                        <div class="friends-compare-player">
                            <span style="color:${them.color}">${them.emoji} ${H.escHtml(them.name)}</span>
                        </div>
                    </div>
            `;
            for (const row of rows) {
                const fmt = row.fmt || (v => v.toLocaleString());
                const myWin = row.mine > row.theirs;
                const theirWin = row.theirs > row.mine;
                html += `
                    <div class="friends-compare-row">
                        <span class="friends-compare-val ${myWin ? 'friends-compare-winner' : ''}">${fmt(row.mine)}</span>
                        <span class="friends-compare-label">${row.label}</span>
                        <span class="friends-compare-val ${theirWin ? 'friends-compare-winner' : ''}">${fmt(row.theirs)}</span>
                    </div>
                `;
            }
            html += '</div>';
            section.innerHTML = html;
        } catch (err) {
            section.innerHTML = `<div class="empty-state" style="padding:20px"><p>Could not load comparison: ${H.escHtml(err.message)}</p></div>`;
        }
    },
};
