/* Clan Battles View — Leaderboard, Profiles, Challenges, Trash Talk, Bounties, Wars, Feed */
window.ClanBattlesView = {
    data: null,
    tab: 'leaderboard',
    profileId: null,

    async render(params) {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading clan battles...</div>';

        // Check for sub-route params
        if (params && params.id) this.profileId = parseInt(params.id);
        if (params && params.tab) this.tab = params.tab;

        try {
            if (this.profileId) {
                await this.renderProfile(this.profileId);
            } else {
                await this.renderMain();
            }
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    async renderMain() {
        const app = document.getElementById('app');

        const html = `
            <div class="page-header">
                <h1 class="page-title">⚔️ Clan Battles</h1>
                <p class="page-subtitle">Compete for glory — challenge rival clans, claim territories, and dominate the leaderboard</p>
            </div>
            <div class="cb-tabs">
                <button class="cb-tab ${this.tab === 'leaderboard' ? 'active' : ''}" onclick="ClanBattlesView.switchTab('leaderboard')">🏆 Leaderboard</button>
                <button class="cb-tab ${this.tab === 'challenges' ? 'active' : ''}" onclick="ClanBattlesView.switchTab('challenges')">⚔️ Challenges</button>
                <button class="cb-tab ${this.tab === 'territories' ? 'active' : ''}" onclick="ClanBattlesView.switchTab('territories')">🗺️ Territories</button>
                <button class="cb-tab ${this.tab === 'bounties' ? 'active' : ''}" onclick="ClanBattlesView.switchTab('bounties')">💰 Bounties</button>
                <button class="cb-tab ${this.tab === 'wars' ? 'active' : ''}" onclick="ClanBattlesView.switchTab('wars')">🔥 Wars</button>
                <button class="cb-tab ${this.tab === 'trashtalk' ? 'active' : ''}" onclick="ClanBattlesView.switchTab('trashtalk')">🗣️ Trash Talk</button>
                <button class="cb-tab ${this.tab === 'feed' ? 'active' : ''}" onclick="ClanBattlesView.switchTab('feed')">📡 Feed</button>
            </div>
            <div id="cbContent"><div class="loading">Loading...</div></div>
        `;
        app.innerHTML = html;
        await this.loadTab();
    },

    async switchTab(tab) {
        this.tab = tab;
        document.querySelectorAll('.cb-tab').forEach(t => t.classList.toggle('active', t.textContent.toLowerCase().includes(tab.slice(0, 4))));
        // More precise active toggle
        document.querySelectorAll('.cb-tab').forEach((t, i) => {
            const tabs = ['leaderboard','challenges','territories','bounties','wars','trashtalk','feed'];
            t.classList.toggle('active', tabs[i] === tab);
        });
        await this.loadTab();
    },

    async loadTab() {
        const el = document.getElementById('cbContent');
        if (!el) return;
        el.innerHTML = '<div class="loading">Loading...</div>';

        try {
            switch (this.tab) {
                case 'leaderboard': await this.loadLeaderboard(el); break;
                case 'challenges': await this.loadChallenges(el); break;
                case 'territories': await this.loadTerritories(el); break;
                case 'bounties': await this.loadBounties(el); break;
                case 'wars': await this.loadWars(el); break;
                case 'trashtalk': await this.loadTrashTalk(el); break;
                case 'feed': await this.loadFeed(el); break;
            }
        } catch (err) {
            el.innerHTML = `<div class="empty-state"><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    // ═══════════════════════════════════
    // LEADERBOARD
    // ═══════════════════════════════════

    async loadLeaderboard(el) {
        const data = await API.clanLeaderboard();
        if (!data.leaderboard.length) {
            el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚔️</div><h3>No clans yet</h3><p>Create some clans first!</p></div>';
            return;
        }

        el.innerHTML = `
            <div class="cb-leaderboard">
                ${data.leaderboard.map((clan, i) => `
                    <div class="cb-lb-row ${i < 3 ? 'cb-lb-top' : ''}" onclick="Router.navigate('#/battles/profile/${clan.id}')" style="--clan-color:${clan.color}">
                        <div class="cb-lb-rank">${i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1)}</div>
                        <div class="cb-lb-info">
                            <span class="cb-lb-emoji">${clan.emoji}</span>
                            <div>
                                <div class="cb-lb-name" style="color:${clan.color}">${H.escHtml(clan.name)}</div>
                                <div class="cb-lb-rank-title">${clan.rank}</div>
                            </div>
                        </div>
                        <div class="cb-lb-stats">
                            <div class="cb-lb-stat"><span class="cb-lb-stat-val">${clan.member_count}</span><span class="cb-lb-stat-lbl">Members</span></div>
                            <div class="cb-lb-stat"><span class="cb-lb-stat-val">${clan.wins}W/${clan.losses}L</span><span class="cb-lb-stat-lbl">Record</span></div>
                            <div class="cb-lb-stat"><span class="cb-lb-stat-val">${clan.territory_count}</span><span class="cb-lb-stat-lbl">Territories</span></div>
                            <div class="cb-lb-stat"><span class="cb-lb-stat-val">${clan.achievement_count}</span><span class="cb-lb-stat-lbl">Trophies</span></div>
                        </div>
                        <div class="cb-lb-power">
                            <div class="cb-lb-power-val">${clan.power.toLocaleString()}</div>
                            <div class="cb-lb-power-lbl">POWER</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    // ═══════════════════════════════════
    // CLAN PROFILE
    // ═══════════════════════════════════

    async renderProfile(clanId) {
        const app = document.getElementById('app');
        const data = await API.clanProfile(clanId);
        const { clan, members, mvp, challenges, achievements, territories, feed, rival } = data;

        const totalPlayTime = members.reduce((s, m) => s + (m.play_time || 0), 0);
        const totalScore = members.reduce((s, m) => s + (m.total_score || 0), 0);
        const hours = Math.floor(totalPlayTime / 3600);
        const mins = Math.floor((totalPlayTime % 3600) / 60);

        app.innerHTML = `
            <div class="cb-profile">
                <div class="cb-profile-banner" style="background:linear-gradient(135deg, ${clan.banner_color || clan.color}44 0%, ${clan.color}22 100%)">
                    <button class="btn btn-sm" onclick="Router.navigate('#/battles')" style="position:absolute;top:12px;left:12px;">← Back</button>
                    <div class="cb-profile-identity">
                        <span class="cb-profile-emoji">${clan.emoji}</span>
                        <div>
                            <h1 class="cb-profile-name" style="color:${clan.color}">${H.escHtml(clan.name)}</h1>
                            <p class="cb-profile-motto">${clan.motto ? H.escHtml(clan.motto) : '<em>No battle cry set</em>'}</p>
                        </div>
                    </div>
                    <div class="cb-profile-quick-stats">
                        <div class="cb-qs"><span class="cb-qs-val">${clan.level || 1}</span><span class="cb-qs-lbl">Level</span></div>
                        <div class="cb-qs"><span class="cb-qs-val">${(clan.xp || 0).toLocaleString()}</span><span class="cb-qs-lbl">XP</span></div>
                        <div class="cb-qs"><span class="cb-qs-val">${clan.wins || 0}W/${clan.losses || 0}L</span><span class="cb-qs-lbl">Record</span></div>
                        <div class="cb-qs"><span class="cb-qs-val">${members.length}</span><span class="cb-qs-lbl">Members</span></div>
                        <div class="cb-qs"><span class="cb-qs-val">${hours}h ${mins}m</span><span class="cb-qs-lbl">Play Time</span></div>
                    </div>
                    ${rival ? `<div class="cb-profile-rival">⚔️ Rival: <span style="color:${rival.color}">${rival.emoji} ${H.escHtml(rival.name)}</span> (${rival.battle_count} battles)</div>` : ''}
                </div>

                <div class="cb-profile-grid">
                    <!-- Roster -->
                    <div class="cb-section">
                        <h3 class="cb-section-title">👥 Roster</h3>
                        <div class="cb-roster">
                            ${members.map(m => `
                                <a href="#/player/${m.id}" class="cb-member">
                                    <span class="cb-member-emoji" style="border-color:${m.color}">${m.emoji}</span>
                                    <span class="cb-member-name" style="color:${m.color}">${H.escHtml(m.name)}</span>
                                    <span class="cb-member-stat">${(m.fav_count || 0)} favs</span>
                                    ${mvp && mvp.id === m.id ? '<span class="cb-mvp-badge">⭐ MVP</span>' : ''}
                                </a>
                            `).join('')}
                            ${members.length === 0 ? '<div class="clan-empty">No members</div>' : ''}
                        </div>
                    </div>

                    <!-- Achievements -->
                    <div class="cb-section">
                        <h3 class="cb-section-title">🏆 Achievements (${achievements.length})</h3>
                        <div class="cb-achievements">
                            ${achievements.length ? achievements.map(a => `
                                <div class="cb-achievement">
                                    <span class="cb-ach-icon">${a.icon}</span>
                                    <div><div class="cb-ach-title">${H.escHtml(a.title)}</div><div class="cb-ach-desc">${H.escHtml(a.description)}</div></div>
                                </div>
                            `).join('') : '<div class="clan-empty">No achievements yet — keep battling!</div>'}
                        </div>
                    </div>

                    <!-- Territories -->
                    <div class="cb-section">
                        <h3 class="cb-section-title">🗺️ Territories (${territories.length})</h3>
                        <div class="cb-territories-list">
                            ${territories.length ? territories.map(t => `
                                <div class="cb-territory-item">
                                    <span class="cb-terr-game">${H.escHtml(t.clean_name || t.filename)}</span>
                                    <span class="cb-terr-score">${(t.top_score || 0).toLocaleString()} pts</span>
                                </div>
                            `).join('') : '<div class="clan-empty">No territories claimed</div>'}
                        </div>
                    </div>

                    <!-- Recent Battles -->
                    <div class="cb-section">
                        <h3 class="cb-section-title">⚔️ Recent Battles</h3>
                        <div class="cb-battles-list">
                            ${challenges.length ? challenges.slice(0, 10).map(c => {
                                const won = c.winner_clan_id === clanId;
                                const lost = c.winner_clan_id && c.winner_clan_id !== clanId;
                                const draw = c.status === 'completed' && !c.winner_clan_id;
                                const badge = won ? '✅' : lost ? '❌' : draw ? '🤝' : '⏳';
                                const vs = c.challenger_clan_id === clanId
                                    ? `${c.defender_emoji} ${c.defender_name}`
                                    : `${c.challenger_emoji} ${c.challenger_name}`;
                                return `<div class="cb-battle-row">${badge} vs ${H.escHtml(vs)} — ${c.challenger_score || 0} : ${c.defender_score || 0}</div>`;
                            }).join('') : '<div class="clan-empty">No battles yet</div>'}
                        </div>
                    </div>

                    <!-- Activity Feed -->
                    <div class="cb-section cb-section-full">
                        <h3 class="cb-section-title">📡 Activity</h3>
                        <div class="cb-feed-list">
                            ${feed.length ? feed.slice(0, 15).map(f => `
                                <div class="cb-feed-item">
                                    <span class="cb-feed-icon">${this.feedIcon(f.type)}</span>
                                    <span class="cb-feed-msg">${H.escHtml(f.message)}</span>
                                    <span class="cb-feed-time">${H.timeAgo(f.created_at)}</span>
                                </div>
                            `).join('') : '<div class="clan-empty">No activity yet</div>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    feedIcon(type) {
        const icons = {
            challenge_issued: '⚔️', challenge_received: '📩', challenge_score: '🎯',
            challenge_won: '🏆', challenge_lost: '💔', achievement: '🏅',
            territory_claimed: '🏴', territory_seized: '⚡', territory_lost: '😢',
            bounty_posted: '💰', bounty_claimed: '🎉', war_started: '🔥',
            member_joined: '👋', member_left: '👋',
        };
        return icons[type] || '📌';
    },

    // ═══════════════════════════════════
    // CHALLENGES
    // ═══════════════════════════════════

    async loadChallenges(el) {
        const [challengeData, clanData] = await Promise.all([
            API.clanChallenges('all'),
            API.clans()
        ]);
        const { challenges } = challengeData;
        const clans = clanData.clans.filter(c => c.id !== 0);

        el.innerHTML = `
            <div class="cb-challenges">
                <div class="cb-challenge-actions">
                    <button class="btn btn-sm btn-teal" onclick="ClanBattlesView.showCreateChallenge()">+ New Challenge</button>
                </div>
                <div id="cbChallengeForm"></div>
                ${challenges.length ? `
                    <div class="cb-challenge-list">
                        ${challenges.map(c => {
                            const statusBadge = c.status === 'active' ? '<span class="cb-badge cb-badge-active">ACTIVE</span>'
                                : c.status === 'completed' ? '<span class="cb-badge cb-badge-done">DONE</span>'
                                : '<span class="cb-badge">PENDING</span>';
                            return `
                                <div class="cb-challenge-card" style="--c1:${c.challenger_color};--c2:${c.defender_color}">
                                    <div class="cb-ch-header">
                                        <span class="cb-ch-title">${H.escHtml(c.title)}</span>
                                        ${statusBadge}
                                    </div>
                                    <div class="cb-ch-versus">
                                        <div class="cb-ch-team" style="color:${c.challenger_color}">
                                            <span class="cb-ch-emoji">${c.challenger_emoji}</span>
                                            <span>${H.escHtml(c.challenger_name)}</span>
                                            <span class="cb-ch-score">${(c.challenger_score || 0).toLocaleString()}</span>
                                        </div>
                                        <span class="cb-ch-vs">VS</span>
                                        <div class="cb-ch-team" style="color:${c.defender_color}">
                                            <span class="cb-ch-emoji">${c.defender_emoji}</span>
                                            <span>${H.escHtml(c.defender_name)}</span>
                                            <span class="cb-ch-score">${(c.defender_score || 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                    ${c.winner_emoji ? `<div class="cb-ch-winner">🏆 ${c.winner_emoji} ${H.escHtml(c.winner_name)} wins!</div>` : ''}
                                    ${c.status === 'active' ? `<button class="btn btn-xs btn-teal" onclick="ClanBattlesView.resolveChallenge(${c.id})">End & Score</button>` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : '<div class="empty-state"><div class="empty-state-icon">⚔️</div><h3>No challenges yet</h3><p>Start a battle!</p></div>'}
            </div>
        `;
        this._clans = clans;
    },

    showCreateChallenge() {
        const clans = this._clans || [];
        const opts = clans.map(c => `<option value="${c.id}">${c.emoji} ${H.escHtml(c.name)}</option>`).join('');
        document.getElementById('cbChallengeForm').innerHTML = `
            <div class="clans-form-card">
                <h4>⚔️ New Challenge</h4>
                <div class="clans-form-row" style="flex-wrap:wrap;gap:8px;">
                    <input type="text" id="chTitle" placeholder="Challenge title" class="clans-input" value="Battle Royale!">
                    <select id="chClan1" class="clans-input">${opts}</select>
                    <span style="font-size:20px;">VS</span>
                    <select id="chClan2" class="clans-input">${opts}</select>
                    <input type="number" id="chHours" value="24" min="1" max="168" class="clans-input clans-input-sm" title="Duration (hours)">
                    <span style="opacity:0.6;font-size:12px;">hours</span>
                    <button class="btn btn-sm btn-teal" onclick="ClanBattlesView.createChallenge()">Start!</button>
                    <button class="btn btn-sm" onclick="document.getElementById('cbChallengeForm').innerHTML=''">Cancel</button>
                </div>
            </div>
        `;
    },

    async createChallenge() {
        const title = document.getElementById('chTitle').value.trim();
        const c1 = parseInt(document.getElementById('chClan1').value);
        const c2 = parseInt(document.getElementById('chClan2').value);
        const hours = parseInt(document.getElementById('chHours').value) || 24;
        if (c1 === c2) { H.toast('Pick two different clans!', 'error'); return; }
        try {
            await API.createChallenge({ challenger_clan_id: c1, defender_clan_id: c2, title, duration_hours: hours });
            H.toast('Challenge issued! ⚔️', 'success');
            this.loadTab();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    async resolveChallenge(id) {
        if (!confirm('End this challenge and determine the winner?')) return;
        try {
            await API.resolveChallenge(id);
            H.toast('Challenge resolved!', 'success');
            this.loadTab();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    // ═══════════════════════════════════
    // TERRITORIES
    // ═══════════════════════════════════

    async loadTerritories(el) {
        const data = await API.clanTerritories();
        if (!data.territories.length) {
            el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🗺️</div><h3>No territories claimed</h3><p>Set high scores on games to claim territories for your clan!</p></div>';
            return;
        }

        el.innerHTML = `
            <div class="cb-territories">
                <p class="cb-terr-desc">Territories are claimed by setting the highest score on a game. Beat the record to seize control!</p>
                <div class="cb-terr-grid">
                    ${data.territories.map(t => `
                        <div class="cb-terr-card" style="--clan-color:${t.clan_color}">
                            <div class="cb-terr-game-name">${H.escHtml(t.clean_name || t.filename)}</div>
                            <div class="cb-terr-system">${t.system_id || ''}</div>
                            <div class="cb-terr-owner">
                                <span style="color:${t.clan_color}">${t.clan_emoji} ${H.escHtml(t.clan_name)}</span>
                            </div>
                            <div class="cb-terr-score">${(t.top_score || 0).toLocaleString()} pts</div>
                            ${t.player_emoji ? `<div class="cb-terr-holder">${t.player_emoji} ${H.escHtml(t.player_name)}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    // ═══════════════════════════════════
    // BOUNTIES
    // ═══════════════════════════════════

    async loadBounties(el) {
        const data = await API.clanBounties('active');
        el.innerHTML = `
            <div class="cb-bounties">
                <div class="cb-challenge-actions">
                    <button class="btn btn-sm btn-amber" onclick="ClanBattlesView.showCreateBounty()">+ Post Bounty</button>
                </div>
                <div id="cbBountyForm"></div>
                ${data.bounties.length ? `
                    <div class="cb-bounty-list">
                        ${data.bounties.map(b => `
                            <div class="cb-bounty-card">
                                <div class="cb-bounty-header">
                                    <span class="cb-bounty-icon">💰</span>
                                    <span class="cb-bounty-target">${(b.target_score || 0).toLocaleString()} pts</span>
                                    ${b.rom_name ? `<span class="cb-bounty-game">on ${H.escHtml(b.rom_name)}</span>` : ''}
                                </div>
                                <div class="cb-bounty-posted">Posted by ${b.posted_player_emoji} ${H.escHtml(b.posted_player_name)} of <span style="color:${b.posted_clan_color}">${b.posted_clan_emoji} ${H.escHtml(b.posted_clan_name)}</span></div>
                                <div class="cb-bounty-reward">Reward: ${H.escHtml(b.reward_text)}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : '<div class="empty-state"><div class="empty-state-icon">💰</div><h3>No active bounties</h3><p>Post a bounty to challenge other clans!</p></div>'}
            </div>
        `;
    },

    showCreateBounty() {
        document.getElementById('cbBountyForm').innerHTML = `
            <div class="clans-form-card">
                <h4>💰 Post a Bounty</h4>
                <p style="opacity:0.6;font-size:12px;margin:0 0 8px;">Set a target score — anyone who beats it claims the bounty!</p>
                <div class="clans-form-row" style="flex-wrap:wrap;gap:8px;">
                    <input type="number" id="bountyScore" placeholder="Target score" class="clans-input">
                    <input type="text" id="bountyReward" placeholder="Reward (e.g. Bragging rights)" class="clans-input">
                    <button class="btn btn-sm btn-amber" onclick="ClanBattlesView.createBounty()">Post</button>
                    <button class="btn btn-sm" onclick="document.getElementById('cbBountyForm').innerHTML=''">Cancel</button>
                </div>
            </div>
        `;
    },

    async createBounty() {
        const score = parseInt(document.getElementById('bountyScore').value);
        const reward = document.getElementById('bountyReward').value.trim();
        const activePlayer = window.ArcadeEngine?.getActivePlayer();
        if (!score || !activePlayer) { H.toast('Need a score and active player', 'error'); return; }

        // Get player's first clan
        const clanData = await API.clans();
        const playerClans = clanData.clans.filter(c => c.id !== 0 && c.players.some(p => p.id === activePlayer.id));
        if (!playerClans.length) { H.toast('Player must be in a clan', 'error'); return; }

        try {
            await API.createBounty({
                posted_by_clan_id: playerClans[0].id,
                posted_by_player_id: activePlayer.id,
                target_score: score,
                reward_text: reward || 'Bragging rights'
            });
            H.toast('Bounty posted! 💰', 'success');
            this.loadTab();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    // ═══════════════════════════════════
    // WARS
    // ═══════════════════════════════════

    async loadWars(el) {
        const data = await API.clanWars();
        el.innerHTML = `
            <div class="cb-wars">
                <div class="cb-challenge-actions">
                    <button class="btn btn-sm btn-red" onclick="ClanBattlesView.showCreateWar()">+ Declare War</button>
                </div>
                <div id="cbWarForm"></div>
                ${data.wars.length ? `
                    <div class="cb-war-list">
                        ${data.wars.map(w => `
                            <div class="cb-war-card">
                                <div class="cb-war-header">
                                    <span class="cb-war-name">🔥 ${H.escHtml(w.name)}</span>
                                    <span class="cb-badge ${w.status === 'active' ? 'cb-badge-active' : 'cb-badge-done'}">${w.status.toUpperCase()}</span>
                                </div>
                                ${w.description ? `<div class="cb-war-desc">${H.escHtml(w.description)}</div>` : ''}
                                <div class="cb-war-standings">
                                    ${(w.entries || []).map((e, i) => `
                                        <div class="cb-war-entry ${i === 0 ? 'cb-war-leader' : ''}">
                                            <span class="cb-war-pos">${i + 1}.</span>
                                            <span style="color:${e.clan_color}">${e.clan_emoji} ${H.escHtml(e.clan_name)}</span>
                                            <span class="cb-war-total">${(e.total_score || 0).toLocaleString()}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : '<div class="empty-state"><div class="empty-state-icon">🔥</div><h3>No wars declared</h3><p>Start a war to rally all clans!</p></div>'}
            </div>
        `;
    },

    async showCreateWar() {
        const clanData = await API.clans();
        const clans = clanData.clans.filter(c => c.id !== 0);
        document.getElementById('cbWarForm').innerHTML = `
            <div class="clans-form-card">
                <h4>🔥 Declare War</h4>
                <div class="clans-form-row" style="flex-wrap:wrap;gap:8px;">
                    <input type="text" id="warName" placeholder="War name" class="clans-input" value="The Great Battle">
                    <input type="text" id="warDesc" placeholder="Description (optional)" class="clans-input">
                    <input type="number" id="warDays" placeholder="Duration (days)" value="3" min="1" max="30" class="clans-input clans-input-sm">
                    <div style="width:100%;">
                        <label style="font-size:12px;opacity:0.6;">Select participating clans:</label>
                        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
                            ${clans.map(c => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;"><input type="checkbox" class="warClanCheck" value="${c.id}" checked> ${c.emoji} ${H.escHtml(c.name)}</label>`).join('')}
                        </div>
                    </div>
                    <button class="btn btn-sm btn-red" onclick="ClanBattlesView.createWar()">Declare!</button>
                    <button class="btn btn-sm" onclick="document.getElementById('cbWarForm').innerHTML=''">Cancel</button>
                </div>
            </div>
        `;
    },

    async createWar() {
        const name = document.getElementById('warName').value.trim();
        const desc = document.getElementById('warDesc').value.trim();
        const days = parseInt(document.getElementById('warDays').value) || 3;
        const clanIds = [...document.querySelectorAll('.warClanCheck:checked')].map(cb => parseInt(cb.value));
        if (!name) { H.toast('War needs a name!', 'error'); return; }
        if (clanIds.length < 2) { H.toast('Need at least 2 clans', 'error'); return; }

        const now = new Date();
        const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        try {
            await API.createWar({ name, description: desc, start_time: now.toISOString(), end_time: end.toISOString(), clan_ids: clanIds });
            H.toast('War declared! 🔥', 'success');
            this.loadTab();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    // ═══════════════════════════════════
    // TRASH TALK
    // ═══════════════════════════════════

    async loadTrashTalk(el) {
        const data = await API.clanMessages({});
        el.innerHTML = `
            <div class="cb-trashtalk">
                <div id="cbMsgForm" style="margin-bottom:16px;">
                    <div class="cb-msg-compose">
                        <input type="text" id="cbMsgText" placeholder="Drop some trash talk..." class="clans-input" style="flex:1;" onkeydown="if(event.key==='Enter')ClanBattlesView.sendMessage()">
                        <button class="btn btn-sm btn-purple" onclick="ClanBattlesView.sendMessage()">Send 🗣️</button>
                    </div>
                </div>
                <div class="cb-msg-list">
                    ${data.messages.length ? data.messages.map(m => `
                        <div class="cb-msg">
                            <div class="cb-msg-header">
                                <span class="cb-msg-player" style="color:${m.player_color}">${m.player_emoji} ${H.escHtml(m.player_name)}</span>
                                <span class="cb-msg-clan" style="color:${m.from_clan_color}">${m.from_clan_emoji} ${H.escHtml(m.from_clan_name)}</span>
                                ${m.to_clan_name ? `<span class="cb-msg-to">→ ${m.to_clan_emoji} ${H.escHtml(m.to_clan_name)}</span>` : ''}
                                <span class="cb-msg-time">${H.timeAgo(m.created_at)}</span>
                            </div>
                            <div class="cb-msg-text">${H.escHtml(m.message)}</div>
                        </div>
                    `).join('') : '<div class="empty-state"><div class="empty-state-icon">🗣️</div><h3>Silence...</h3><p>Be the first to talk trash!</p></div>'}
                </div>
            </div>
        `;
    },

    async sendMessage() {
        const text = document.getElementById('cbMsgText')?.value.trim();
        if (!text) return;
        const activePlayer = window.ArcadeEngine?.getActivePlayer();
        if (!activePlayer) { H.toast('Select a player first', 'error'); return; }

        const clanData = await API.clans();
        const playerClans = clanData.clans.filter(c => c.id !== 0 && c.players.some(p => p.id === activePlayer.id));
        if (!playerClans.length) { H.toast('Player must be in a clan to talk trash', 'error'); return; }

        try {
            await API.sendClanMessage({ from_clan_id: playerClans[0].id, player_id: activePlayer.id, message: text });
            document.getElementById('cbMsgText').value = '';
            this.loadTab();
        } catch (err) { H.toast(err.message, 'error'); }
    },

    // ═══════════════════════════════════
    // ACTIVITY FEED
    // ═══════════════════════════════════

    async loadFeed(el) {
        const data = await API.clanFeed();
        el.innerHTML = `
            <div class="cb-feed">
                ${data.feed.length ? data.feed.map(f => `
                    <div class="cb-feed-item">
                        <span class="cb-feed-icon">${this.feedIcon(f.type)}</span>
                        <div class="cb-feed-body">
                            <span class="cb-feed-clan" style="color:${f.clan_color}">${f.clan_emoji} ${H.escHtml(f.clan_name)}</span>
                            <span class="cb-feed-msg">${H.escHtml(f.message)}</span>
                        </div>
                        <span class="cb-feed-time">${H.timeAgo(f.created_at)}</span>
                    </div>
                `).join('') : '<div class="empty-state"><div class="empty-state-icon">📡</div><h3>No activity yet</h3><p>Battles, achievements, and territory claims will show up here</p></div>'}
            </div>
        `;
    },
};
