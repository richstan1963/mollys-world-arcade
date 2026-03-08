/* Player Card View — Shareable Trading Card Profile */
window.PlayerCardView = {
    async render(params) {
        const app = document.getElementById('app');
        const playerId = params?.id;
        if (!playerId) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F464}</div><h3>No Player Selected</h3><p>Choose a player to see their card.</p></div>`;
            return;
        }

        app.innerHTML = '<div class="loading">Loading player card...</div>';

        try {
            const [progressionData, statsData, favsData, clansData] = await Promise.all([
                API.playerProgression(playerId),
                API.playerStats(playerId),
                API.playerFavorites(playerId, 3).catch(() => ({ games: [] })),
                API.clans().catch(() => ({ clans: [] })),
            ]);

            const p = progressionData.player || statsData.player || {};
            const stats = statsData.stats || statsData;
            const achievements = progressionData.achievements || [];
            const topFavs = favsData.games || [];
            const allClans = clansData.clans || [];
            const myClan = allClans.find(c => (c.players || []).find(pp => pp.id == playerId));

            const xpPct = p.xp_progress ? Math.round(p.xp_progress * 100) : 0;
            const topAch = achievements.slice(0, 3);

            // Determine player title
            const titles = [
                'Rookie', 'Apprentice', 'Gamer', 'Veteran', 'Elite',
                'Champion', 'Hero', 'Legend', 'Mythic', 'Arcade God',
            ];
            const titleIndex = Math.min(Math.floor((p.level || 1) / 3), titles.length - 1);
            const title = p.level_title || titles[titleIndex];

            let html = `
                <div class="section-header" style="margin-bottom:24px;">
                    <span class="section-title">\u{1F0CF} Player Card</span>
                    <button class="btn btn-ghost btn-sm" onclick="PlayerCardView.copyLink(${playerId})">\u{1F517} Copy Link</button>
                </div>

                <div class="pcard-stage">
                    <div class="pcard" id="playerCard" style="--card-color:${p.color || '#A855F7'}">
                        <div class="pcard-shimmer"></div>
                        <div class="pcard-inner">
                            <div class="pcard-header">
                                <div class="pcard-avatar">${p.emoji || '\u{1F3AE}'}</div>
                                <div class="pcard-name-wrap">
                                    <div class="pcard-name">${H.escHtml(p.name)}</div>
                                    <div class="pcard-title">${H.escHtml(title)}</div>
                                </div>
                                <div class="pcard-level">
                                    <span class="pcard-level-num">${p.level || 1}</span>
                                    <span class="pcard-level-label">LVL</span>
                                </div>
                            </div>

                            <div class="pcard-xp-section">
                                <div class="pcard-xp-bar">
                                    <div class="pcard-xp-fill" style="width:${xpPct}%"></div>
                                </div>
                                <div class="pcard-xp-text">${(p.xp || 0).toLocaleString()} XP</div>
                            </div>

                            <div class="pcard-stats-row">
                                <div class="pcard-stat">
                                    <div class="pcard-stat-value">${(stats.total_plays || stats.play_count || 0).toLocaleString()}</div>
                                    <div class="pcard-stat-label">Plays</div>
                                </div>
                                <div class="pcard-stat">
                                    <div class="pcard-stat-value">${H.formatDuration(stats.total_seconds || stats.total_time || 0)}</div>
                                    <div class="pcard-stat-label">Time</div>
                                </div>
                                <div class="pcard-stat">
                                    <div class="pcard-stat-value">${(stats.favorites || stats.fav_count || 0)}</div>
                                    <div class="pcard-stat-label">Favs</div>
                                </div>
                            </div>
            `;

            // Top 3 favorites
            if (topFavs.length > 0) {
                html += `
                    <div class="pcard-section">
                        <div class="pcard-section-label">\u2B50 Top Games</div>
                        <div class="pcard-fav-list">
                `;
                for (const g of topFavs) {
                    const art = H.artworkSrc(g);
                    html += `
                        <div class="pcard-fav-item">
                            <div class="pcard-fav-art">
                                ${art ? `<img src="${art}" alt="" loading="lazy">` : `<span>${H.systemEmoji(g.system_id)}</span>`}
                            </div>
                            <span class="pcard-fav-name">${H.escHtml(g.title || g.clean_name)}</span>
                        </div>
                    `;
                }
                html += '</div></div>';
            }

            // Top 3 achievements
            if (topAch.length > 0) {
                html += `
                    <div class="pcard-section">
                        <div class="pcard-section-label">\u{1F3C6} Achievements</div>
                        <div class="pcard-ach-list">
                `;
                for (const a of topAch) {
                    html += `
                        <div class="pcard-ach-item">
                            <span class="pcard-ach-icon">${a.icon || '\u{1F3C6}'}</span>
                            <span class="pcard-ach-title">${H.escHtml(a.title)}</span>
                        </div>
                    `;
                }
                html += '</div></div>';
            }

            // Clan
            if (myClan) {
                html += `
                    <div class="pcard-clan">
                        <span class="pcard-clan-emoji">${myClan.emoji || '\u2694\uFE0F'}</span>
                        <span class="pcard-clan-name" style="color:${myClan.color || '#F59E0B'}">${H.escHtml(myClan.name)}</span>
                    </div>
                `;
            }

            html += `
                            <div class="pcard-footer">
                                <span>Your World Arcade</span>
                                <span>\u{1F3AE}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            app.innerHTML = html;

            // 3D tilt effect
            this.bindTilt();

        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4A5}</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    bindTilt() {
        const card = document.getElementById('playerCard');
        if (!card) return;

        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -12;
            const rotateY = ((x - centerX) / centerX) * 12;
            card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(800px) rotateX(0) rotateY(0)';
        });
    },

    copyLink(playerId) {
        const url = window.location.origin + '/#/card/' + playerId;
        navigator.clipboard.writeText(url).then(() => {
            H.toast('Link copied!', 'success');
            SFX?.click?.();
        }).catch(() => {
            H.toast('Could not copy link', 'error');
        });
    },
};
