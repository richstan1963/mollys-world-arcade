/* Stats View — Player Stats Dashboard */
window.StatsView = {
    async render(params) {
        const app = document.getElementById('app');
        const playerId = params?.id;
        if (!playerId) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F464}</div><h3>No Player Selected</h3><p>Choose a player from the sidebar to see their stats.</p></div>`;
            return;
        }

        app.innerHTML = '<div class="loading">Loading stats dashboard...</div>';

        try {
            const data = await API.get(`/api/stats-dashboard/${playerId}`);
            const p = data.player;
            const stats = data.stats || {};
            const systemBreakdown = data.systems || [];
            const topGames = data.top_games || [];
            const heatmap = data.heatmap || [];
            const ratingDist = data.rating_distribution || [];
            const achievements = data.achievements || { earned: [], total: 20 };
            const monthly = data.monthly || [];

            const xpPct = p.xp_progress ? Math.round(p.xp_progress * 100) : 0;

            let html = '';

            // Player Header
            html += `
                <div class="stats-player-header">
                    <div class="stats-avatar" style="border-color:${p.color}">${p.emoji}</div>
                    <div class="stats-player-info">
                        <h1 class="stats-player-name" style="color:${p.color}">${H.escHtml(p.name)}</h1>
                        <div class="stats-player-level">Level ${p.level || 1} &middot; ${H.escHtml(p.level_title || 'Rookie')}</div>
                        <div class="stats-xp-bar">
                            <div class="stats-xp-fill" style="width:${xpPct}%;background:${p.color}"></div>
                        </div>
                        <div class="stats-xp-label">${(p.xp || 0).toLocaleString()} XP</div>
                    </div>
                </div>
            `;

            // Quick Stats Row
            html += `
                <div class="stats-quick-row">
                    <div class="stats-quick-card">
                        <div class="stats-quick-value">${(stats.total_plays || 0).toLocaleString()}</div>
                        <div class="stats-quick-label">Total Plays</div>
                    </div>
                    <div class="stats-quick-card">
                        <div class="stats-quick-value">${H.formatDuration(stats.total_seconds || 0)}</div>
                        <div class="stats-quick-label">Total Time</div>
                    </div>
                    <div class="stats-quick-card">
                        <div class="stats-quick-value">${H.formatDuration(stats.avg_session || 0)}</div>
                        <div class="stats-quick-label">Avg Session</div>
                    </div>
                    <div class="stats-quick-card">
                        <div class="stats-quick-value">${(stats.favorites || 0).toLocaleString()}</div>
                        <div class="stats-quick-label">Favorites</div>
                    </div>
                </div>
            `;

            // System Breakdown — horizontal bar chart (CSS-only)
            if (systemBreakdown.length > 0) {
                const maxSysPlays = Math.max(...systemBreakdown.map(s => s.play_count || 0), 1);
                html += `
                    <div class="section-header" style="margin-top:32px;"><span class="section-title">\u{1F3AE} Systems Breakdown</span></div>
                    <div class="stats-system-chart">
                `;
                for (const sys of systemBreakdown.slice(0, 12)) {
                    const pct = Math.max(3, Math.round(((sys.play_count || 0) / maxSysPlays) * 100));
                    html += `
                        <div class="stats-sys-row">
                            <span class="stats-sys-label">${H.systemEmoji(sys.system_id)} ${H.escHtml(sys.system_name || sys.system_id)}</span>
                            <div class="stats-sys-bar-wrap">
                                <div class="stats-sys-bar" style="width:${pct}%;background:${sys.color || '#A855F7'}"></div>
                            </div>
                            <span class="stats-sys-count">${(sys.play_count || 0).toLocaleString()}</span>
                        </div>
                    `;
                }
                html += '</div>';
            }

            // Most Played Games
            if (topGames.length > 0) {
                html += `
                    <div class="section-header" style="margin-top:32px;"><span class="section-title">\u{1F525} Most Played Games</span></div>
                    <div class="stats-top-games">
                `;
                for (const g of topGames.slice(0, 10)) {
                    const art = g.artwork_path ? `/artwork/${g.artwork_path}` : null;
                    html += `
                        <div class="stats-game-row" onclick="Router.navigate('#/game/${g.rom_id || g.id}')">
                            <div class="stats-game-art">
                                ${art
                                    ? `<img src="${art}" alt="${H.escHtml(g.game_name)}" loading="lazy">`
                                    : `<span class="no-art-sm">${H.systemEmoji(g.system_id)}</span>`
                                }
                            </div>
                            <div class="stats-game-info">
                                <div class="stats-game-name">${H.escHtml(g.game_name)}</div>
                                <div class="stats-game-meta">${(g.play_count || 0)} plays &middot; ${H.formatDuration(g.total_seconds || 0)}</div>
                            </div>
                        </div>
                    `;
                }
                html += '</div>';
            }

            // Play Activity Heatmap — 7 days x 24 hours
            html += `
                <div class="section-header" style="margin-top:32px;"><span class="section-title">\u{1F4CA} Play Activity</span></div>
                <div class="stats-heatmap-wrap">
                    <div class="stats-heatmap-labels">
                        <span></span>
                        ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => `<span>${d}</span>`).join('')}
                    </div>
                    <div class="stats-heatmap-grid">
            `;
            // Build 24x7 grid from heatmap data
            const heatGrid = {};
            let heatMax = 1;
            for (const h of heatmap) {
                const key = `${h.day_of_week}-${h.hour}`;
                heatGrid[key] = h.count || 0;
                if (h.count > heatMax) heatMax = h.count;
            }
            for (let hour = 0; hour < 24; hour++) {
                html += `<div class="stats-heatmap-row">`;
                html += `<span class="stats-heatmap-hour">${hour === 0 ? '12a' : hour < 12 ? hour + 'a' : hour === 12 ? '12p' : (hour - 12) + 'p'}</span>`;
                for (let day = 0; day < 7; day++) {
                    const count = heatGrid[`${day}-${hour}`] || 0;
                    const opacity = count > 0 ? Math.max(0.15, count / heatMax) : 0.03;
                    html += `<div class="stats-heatmap-cell" style="opacity:${opacity}" title="${count} plays"></div>`;
                }
                html += '</div>';
            }
            html += '</div></div>';

            // Rating Distribution — 1-5 star histogram
            html += `
                <div class="section-header" style="margin-top:32px;"><span class="section-title">\u2B50 Rating Distribution</span></div>
                <div class="stats-rating-chart">
            `;
            const maxRating = Math.max(...ratingDist.map(r => r.count || 0), 1);
            for (let star = 5; star >= 1; star--) {
                const entry = ratingDist.find(r => r.rating === star) || { count: 0 };
                const pct = Math.max(2, Math.round((entry.count / maxRating) * 100));
                html += `
                    <div class="stats-rating-row">
                        <span class="stats-rating-label">${'\u2B50'.repeat(star)}</span>
                        <div class="stats-rating-bar-wrap">
                            <div class="stats-rating-bar" style="width:${pct}%"></div>
                        </div>
                        <span class="stats-rating-count">${entry.count}</span>
                    </div>
                `;
            }
            html += '</div>';

            // Achievement Progress
            const earnedCount = achievements.earned?.length || 0;
            const totalCount = achievements.total || 20;
            const achPct = Math.round((earnedCount / totalCount) * 100);
            html += `
                <div class="section-header" style="margin-top:32px;"><span class="section-title">\u{1F3C5} Achievements</span></div>
                <div class="stats-ach-summary">
                    <div class="stats-ach-ring" style="--pct:${achPct}">
                        <span class="stats-ach-ring-text">${earnedCount}/${totalCount}</span>
                    </div>
                    <div class="stats-ach-label">${achPct}% Complete</div>
                </div>
                <div class="stats-ach-grid">
            `;
            const earnedIds = new Set((achievements.earned || []).map(a => a.id));
            const allAch = achievements.all || achievements.earned || [];
            for (const ach of allAch) {
                const unlocked = earnedIds.has(ach.id);
                html += `
                    <div class="stats-ach-badge ${unlocked ? 'stats-ach-unlocked' : 'stats-ach-locked'}">
                        <span class="stats-ach-icon">${unlocked ? (ach.icon || '\u{1F3C6}') : '\u{1F512}'}</span>
                        <span class="stats-ach-title">${unlocked ? H.escHtml(ach.title) : '???'}</span>
                    </div>
                `;
            }
            html += '</div>';

            // Monthly Trends
            if (monthly.length > 0) {
                const maxMonth = Math.max(...monthly.map(m => m.plays || 0), 1);
                html += `
                    <div class="section-header" style="margin-top:32px;"><span class="section-title">\u{1F4C8} Monthly Trends</span></div>
                    <div class="stats-monthly-chart">
                `;
                for (const m of monthly.slice(-12)) {
                    const pct = Math.max(4, Math.round((m.plays / maxMonth) * 100));
                    html += `
                        <div class="stats-month-col">
                            <div class="stats-month-bar" style="height:${pct}%"></div>
                            <div class="stats-month-label">${H.escHtml(m.month)}</div>
                            <div class="stats-month-value">${m.plays}</div>
                        </div>
                    `;
                }
                html += '</div>';
            }

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u{1F4A5}</div><h3>Error loading stats</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },
};
