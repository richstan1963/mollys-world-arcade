/* Completion View — V4 Library Explorer & Progress Tracker */
window.CompletionView = {
    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading your progress...</div>';

        try {
            const data = await API.get('/api/stats/completion');
            const { overall, systems, topGames, badges, locked } = data;

            const pct    = overall.pct || 0;
            const hours  = (overall.total_seconds / 3600).toFixed(1);
            const circleDash = Math.round(pct * 2.83); // circumference ~283

            let html = `
                <div class="page-header">
                    <h1 class="page-title">📊 Library Progress</h1>
                    <p class="page-subtitle">How deep have you gone?</p>
                </div>

                <!-- Overall Ring -->
                <div class="completion-hero">
                    <div class="completion-ring-wrap">
                        <svg class="completion-ring" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="8"/>
                            <circle cx="50" cy="50" r="45" fill="none"
                                stroke="url(#cring-grad)" stroke-width="8"
                                stroke-linecap="round"
                                stroke-dasharray="${circleDash} 283"
                                stroke-dashoffset="0"
                                transform="rotate(-90 50 50)"/>
                            <defs>
                                <linearGradient id="cring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stop-color="#06b6d4"/>
                                    <stop offset="100%" stop-color="#8b5cf6"/>
                                </linearGradient>
                            </defs>
                        </svg>
                        <div class="completion-ring-inner">
                            <div class="completion-ring-pct">${pct}%</div>
                            <div class="completion-ring-label">Explored</div>
                        </div>
                    </div>
                    <div class="completion-hero-stats">
                        <div class="completion-hero-stat">
                            <div class="completion-hero-val" style="color:#06b6d4">${overall.played_roms.toLocaleString()}</div>
                            <div class="completion-hero-key">Games Played</div>
                        </div>
                        <div class="completion-hero-stat">
                            <div class="completion-hero-val" style="color:#a78bfa">${overall.total_roms.toLocaleString()}</div>
                            <div class="completion-hero-key">Total Library</div>
                        </div>
                        <div class="completion-hero-stat">
                            <div class="completion-hero-val" style="color:#f59e0b">${hours}h</div>
                            <div class="completion-hero-key">Hours Played</div>
                        </div>
                        <div class="completion-hero-stat">
                            <div class="completion-hero-val" style="color:#34d399">${overall.days_played}</div>
                            <div class="completion-hero-key">Days Active</div>
                        </div>
                        <div class="completion-hero-stat">
                            <div class="completion-hero-val" style="color:#f472b6">${overall.total_sessions.toLocaleString()}</div>
                            <div class="completion-hero-key">Sessions</div>
                        </div>
                    </div>
                </div>
            `;

            // Badges earned
            if (badges.length > 0) {
                html += `
                    <div class="section-header">
                        <span class="section-title">🏅 Badges Earned</span>
                        <span style="font-size:12px;color:var(--text-dim)">${badges.length} unlocked</span>
                    </div>
                    <div class="badge-grid">
                        ${badges.map(b => `
                            <div class="badge-card badge-earned">
                                <div class="badge-icon">${b.icon}</div>
                                <div class="badge-title">${H.escHtml(b.title)}</div>
                                <div class="badge-desc">${H.escHtml(b.desc)}</div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            // Next badges to unlock
            if (locked.length > 0) {
                html += `
                    <div class="section-header">
                        <span class="section-title" style="color:var(--text-dim)">🔒 Next Up</span>
                    </div>
                    <div class="badge-grid">
                        ${locked.map(b => `
                            <div class="badge-card badge-locked">
                                <div class="badge-icon" style="filter:grayscale(1);opacity:0.4">${b.icon}</div>
                                <div class="badge-title" style="color:var(--text-dim)">${H.escHtml(b.title)}</div>
                                <div class="badge-desc">${H.escHtml(b.desc)}</div>
                                <div class="badge-need">${typeof b.need === 'number' ? b.need + ' more' : b.need}</div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            // Per-system progress bars
            html += `
                <div class="section-header" style="margin-top:8px;">
                    <span class="section-title">🎮 System Explorer</span>
                </div>
                <div class="system-completion-list">
                    ${systems.map(s => {
                        const pctW = Math.min(s.pct || 0, 100);
                        const color = s.color || '#7b2d8e';
                        const hrs = (s.total_seconds / 3600).toFixed(1);
                        return `
                            <div class="syscomp-row" onclick="Router.navigate('#/library?system=${s.id}')">
                                <div class="syscomp-name">
                                    <span class="syscomp-emoji">${H.systemEmoji(s.id)}</span>
                                    <span>${H.escHtml(s.short_name)}</span>
                                </div>
                                <div class="syscomp-bar-wrap">
                                    <div class="syscomp-bar" style="width:${pctW}%;background:${color}"></div>
                                </div>
                                <div class="syscomp-meta">
                                    <span class="syscomp-pct" style="color:${color}">${s.pct || 0}%</span>
                                    <span class="syscomp-detail">${s.played_roms}/${s.total_roms} · ${hrs}h</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            // Top played games
            if (topGames.length > 0) {
                html += `
                    <div class="section-header" style="margin-top:24px;">
                        <span class="section-title">🔥 Your Most Played</span>
                    </div>
                    <div class="top-played-list">
                        ${topGames.map((g, i) => {
                            const art = H.artworkSrc(g);
                            const title = H.escHtml(g.title || g.clean_name);
                            const hrs = g.total_seconds > 3600 ? (g.total_seconds / 3600).toFixed(1) + 'h' : Math.round(g.total_seconds / 60) + 'm';
                            const sysColor = g.system_color || '#7b2d8e';
                            return `
                                <div class="top-played-row" onclick="Router.navigate('#/game/${g.id}')">
                                    <div class="top-played-rank" style="color:${i < 3 ? '#f59e0b' : 'var(--text-muted)'}">${i + 1}</div>
                                    <div class="top-played-art" style="background:${sysColor}18">
                                        ${art ? `<img src="${art}" alt="${title}" onerror="this.style.display='none'">` : H.systemEmoji(g.system_id)}
                                    </div>
                                    <div class="top-played-info">
                                        <div class="top-played-title">${title}</div>
                                        <div class="top-played-sys" style="color:${sysColor}">${H.escHtml(g.system_name || g.system_id)}</div>
                                    </div>
                                    <div class="top-played-stats">
                                        <div class="top-played-sessions">${g.sessions} sessions</div>
                                        <div class="top-played-time">${hrs} total</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><h3>No play history yet</h3><p>Start playing games to track your progress!</p><button class="btn btn-primary" onclick="Router.navigate('#/')">Go Play</button></div>`;
        }
    },
};
