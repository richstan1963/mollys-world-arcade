/* Weekly Competition View — V7 */
window.WeeklyView = {
    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading this week\'s standings...</div>';

        try {
            const [weekData, godData] = await Promise.all([
                API.get('/api/stats/weekly'),
                API.get('/api/game-of-day').catch(() => null),
            ]);

            const daysLeft = weekData.days_left;
            const daysText = daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;

            let html = `
                <div class="mollypop-hero" style="padding-bottom:24px;">
                    <div class="mollypop-hero-center">
                        <div class="hero-theme-icon">🏆</div>
                        <h1 class="mollypop-hero-title hero-title-xl">This Week</h1>
                        <p class="mollypop-hero-sub">${daysText} in the current week</p>
                    </div>
                </div>
            `;

            // ── Week summary bar ──────────────────────────────────────────
            const t = weekData.totals;
            html += `
                <div class="home-stats" style="margin-bottom:28px;">
                    <div class="stat-card">
                        <div class="stat-icon">🎮</div>
                        <div class="stat-value purple">${t.total_sessions}</div>
                        <div class="stat-label">Sessions</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">👥</div>
                        <div class="stat-value yellow">${t.active_players}</div>
                        <div class="stat-label">Players</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">🕹️</div>
                        <div class="stat-value teal">${t.unique_games}</div>
                        <div class="stat-label">Games Played</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">⏱️</div>
                        <div class="stat-value orange">${t.total_hours}h</div>
                        <div class="stat-label">Play Time</div>
                    </div>
                </div>
            `;

            // ── Hot game this week ────────────────────────────────────────
            if (weekData.hot_game) {
                const hg = weekData.hot_game;
                const art = H.artworkSrc(hg);
                const sysColor = hg.system_color || '#7B2D8E';
                html += `
                    <div class="section-header">
                        <span class="section-title">🔥 Hottest Game This Week</span>
                    </div>
                    <div class="weekly-hot-game" onclick="Router.navigate('#/game/${hg.rom_id}')"
                         style="border-color:${sysColor}; --hgc:${sysColor}">
                        <div class="weekly-hot-art" style="background:${sysColor}22">
                            ${art ? `<img src="${art}" alt="${H.escHtml(hg.title)}" loading="lazy">` : `<span style="font-size:3rem">${H.systemEmoji(hg.system_id)}</span>`}
                        </div>
                        <div class="weekly-hot-info">
                            <div class="weekly-hot-title">${H.escHtml(hg.title)}</div>
                            <div class="weekly-hot-sys" style="color:${sysColor}">${H.escHtml(hg.system_name)}</div>
                            <div class="weekly-hot-meta">
                                <span>🎮 ${hg.sessions} sessions</span>
                                <span>👥 ${hg.players} players</span>
                            </div>
                        </div>
                        <div class="weekly-hot-flame">🔥</div>
                    </div>
                `;
            }

            // ── Leaderboard ───────────────────────────────────────────────
            if (weekData.leaderboard.length > 0) {
                const medals = ['🥇','🥈','🥉'];
                html += `
                    <div class="section-header">
                        <span class="section-title">🏆 Weekly Leaderboard</span>
                        <span class="section-sub">${daysText} to climb</span>
                    </div>
                    <div class="weekly-leaderboard">
                        ${weekData.leaderboard.map((p, i) => {
                            const medal = medals[i] || `#${i + 1}`;
                            const hrs = (p.total_seconds / 3600).toFixed(1);
                            return `
                                <div class="weekly-row ${i < 3 ? 'weekly-row-top' : ''}"
                                     style="--wrc:${p.color}">
                                    <div class="weekly-rank">${medal}</div>
                                    <div class="weekly-avatar" style="border-color:${p.color}">${p.emoji}</div>
                                    <div class="weekly-player">
                                        <div class="weekly-name" style="color:${p.color}">${H.escHtml(p.name)}</div>
                                        <div class="weekly-detail">Lvl ${p.level} · ${p.unique_games} games</div>
                                    </div>
                                    <div class="weekly-stats">
                                        <div class="weekly-sessions">${p.sessions} sessions</div>
                                        <div class="weekly-time">${hrs}h played</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            } else {
                html += `
                    <div class="empty-state">
                        <div class="empty-state-icon">📅</div>
                        <h3>Week is just starting!</h3>
                        <p>Play some games to get on the board.</p>
                    </div>
                `;
            }

            // ── Game of the Day ────────────────────────────────────────────
            if (godData?.rom_id) {
                const art = H.artworkSrc(godData);
                const sysColor = godData.system_color || '#7B2D8E';
                html += `
                    <div class="section-header" style="margin-top:32px;">
                        <span class="section-title">🌟 Game of the Day</span>
                    </div>
                    <div class="weekly-hot-game" onclick="Router.navigate('#/game/${godData.rom_id}')"
                         style="border-color:${sysColor}; --hgc:${sysColor}; cursor:pointer;">
                        <div class="weekly-hot-art" style="background:${sysColor}22">
                            ${art ? `<img src="${art}" alt="${H.escHtml(godData.title || godData.clean_name)}" loading="lazy">` : `<span style="font-size:3rem">${H.systemEmoji(godData.system_id)}</span>`}
                        </div>
                        <div class="weekly-hot-info">
                            <div class="weekly-hot-title">${H.escHtml(godData.title || godData.clean_name)}</div>
                            <div class="weekly-hot-sys" style="color:${sysColor}">${H.escHtml(godData.system_name)}</div>
                            ${godData.genre ? `<div class="weekly-hot-meta"><span>🎭 ${H.escHtml(godData.genre)}</span></div>` : ''}
                        </div>
                        <div class="weekly-hot-flame">🌟</div>
                    </div>
                `;
            }

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },
};
