/* Home View — V7: Weekly Leaderboard + Recommendations */
window.HomeView = {
    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading arcade...</div>';

        try {
            const [systemsData, historyData, libraryData, favData, potdData, feedData, newArrivals, genreRooms, forYouData, weekData] = await Promise.all([
                API.systems(),
                API.recentHistory(16),
                API.library({ limit: 1 }),
                API.favorites ? API.favorites(12).catch(() => ({ games: [] })) : Promise.resolve({ games: [] }),
                API.playerOfTheDay().catch(() => null),
                API.activityFeed(10).catch(() => []),
                API.get('/api/library/new-arrivals?limit=20').catch(() => []),
                API.get('/api/library/genres').catch(() => []),
                API.get('/api/recommendations/for-you?limit=16').catch(() => ({ games: [] })),
                API.get('/api/stats/weekly').catch(() => null),
            ]);

            const totalRoms     = libraryData.total || 0;
            const totalSystems  = systemsData.filter(s => s.rom_count > 0).length;
            const totalFavorites = favData.total || favData.games?.length || 0;
            const totalSessions = historyData.length;


            let html = '';

            // ── Hero + Quick Actions ───────────────────────────────────────────────
            let heroTitle = 'Your World';
            let heroIcon  = '🕹️';
            let heroTheme = null;
            try {
                const pi = JSON.parse(localStorage.getItem('arcade_active_player_info') || 'null');
                if (pi?.name) {
                    heroTitle = (pi.name.endsWith('s') ? pi.name + "'" : pi.name + "'s") + ' World';
                    if (typeof ArcadeThemes !== 'undefined') {
                        heroTheme = ArcadeThemes.get(pi.theme || 'retro');
                        heroIcon  = heroTheme.icon;
                    }
                }
            } catch {}

            html += `
                <div class="mollypop-hero">
                    <div class="mollypop-hero-center">
                        <div class="hero-theme-icon">${heroIcon}</div>
                        <h1 class="mollypop-hero-title hero-title-xl" id="heroWorldTitle">${H.escHtml(heroTitle)}</h1>
                        <p class="mollypop-hero-sub">${totalRoms.toLocaleString()} games across ${totalSystems} systems</p>
                    </div>
                    <div class="mollypop-quick-actions">
                        <button class="quick-action-card" onclick="window.arcade.playRandomGame()">
                            <span class="quick-action-icon">🎲</span>
                            <span class="quick-action-label">Surprise Me</span>
                        </button>
                        <button class="quick-action-card" onclick="Router.navigate('#/library')">
                            <span class="quick-action-icon">📚</span>
                            <span class="quick-action-label">Library</span>
                        </button>
                        <button class="quick-action-card" onclick="Router.navigate('#/favorites')">
                            <span class="quick-action-icon">⭐</span>
                            <span class="quick-action-label">Favorites</span>
                        </button>
                        <button class="quick-action-card" onclick="Router.navigate('#/library?tag=neogeo')">
                            <span class="quick-action-icon">🔥</span>
                            <span class="quick-action-label">Neo Geo</span>
                        </button>
                        <button class="quick-action-card" onclick="Router.navigate('#/library?tag=beatemup')">
                            <span class="quick-action-icon">👊</span>
                            <span class="quick-action-label">Beat-Em-Ups</span>
                        </button>
                        <button class="quick-action-card" onclick="Router.navigate('#/mamedev')">
                            <span class="quick-action-icon">👾</span>
                            <span class="quick-action-label">Free ROMs</span>
                        </button>
                        <button class="quick-action-card" onclick="Router.navigate('#/completion')">
                            <span class="quick-action-icon">📊</span>
                            <span class="quick-action-label">Progress</span>
                        </button>
                        <button class="quick-action-card" onclick="Router.navigate('#/recommendations')">
                            <span class="quick-action-icon">✨</span>
                            <span class="quick-action-label">For You</span>
                        </button>
                        <button class="quick-action-card" onclick="Router.navigate('#/weekly')">
                            <span class="quick-action-icon">🏆</span>
                            <span class="quick-action-label">This Week</span>
                        </button>
                    </div>
                </div>
            `;

            // ── Stats Row ─────────────────────────────────────────────────────────
            html += `
                <div class="home-stats">
                    <div class="stat-card">
                        <div class="stat-icon">🕹️</div>
                        <div class="stat-value purple" data-count="${totalRoms}">0</div>
                        <div class="stat-label">Total Games</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">🎮</div>
                        <div class="stat-value yellow" data-count="${totalSystems}">0</div>
                        <div class="stat-label">Systems</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">⭐</div>
                        <div class="stat-value pink" data-count="${totalFavorites}">0</div>
                        <div class="stat-label">Favorites</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">🎯</div>
                        <div class="stat-value teal" data-count="${totalSessions}">0</div>
                        <div class="stat-label">Sessions</div>
                    </div>

                </div>
            `;

            // ── New Arrivals Shelf ─────────────────────────────────────────────────
            if (newArrivals.length > 0) {
                html += `
                    <div class="section-header">
                        <span class="section-title">
                            <span class="section-badge-new">NEW</span>
                            Recently Added
                        </span>
                        <a class="section-link" href="#/library?sort=added&order=desc">View All →</a>
                    </div>
                    <div class="arrivals-shelf">
                        ${newArrivals.map(g => {
                            const art = H.artworkSrc(g);
                            const title = H.escHtml(g.title || g.clean_name);
                            const sysColor = g.system_color || '#7B2D8E';
                            return `
                                <div class="arrival-card" onclick="Router.navigate('#/game/${g.id}')" title="${title}">
                                    <div class="arrival-art" style="background:${sysColor}18;">
                                        ${art
                                            ? `<img src="${art}" alt="${title}" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
                                            : ''
                                        }
                                        <span class="arrival-emoji" style="${art ? 'display:none' : ''}">${H.systemEmoji(g.system_id)}</span>
                                    </div>
                                    <div class="arrival-info">
                                        <div class="arrival-title">${title}</div>
                                        <div class="arrival-sys" style="color:${sysColor}">${H.escHtml(g.system_name || g.system_id)}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            // ── You Might Like ────────────────────────────────────────────────────
            if (forYouData.games?.length > 0) {
                html += `
                    <div class="section-header">
                        <span class="section-title">✨ You Might Like</span>
                        <a class="section-link" href="#/recommendations">More Picks →</a>
                    </div>
                    <div class="arrivals-shelf" style="margin-bottom:28px;">
                        ${forYouData.games.map(g => {
                            const art = H.artworkSrc(g);
                            const title = H.escHtml(g.title || g.clean_name);
                            const sysColor = g.system_color || '#7B2D8E';
                            return `
                                <div class="arrival-card" onclick="Router.navigate('#/game/${g.id}')" title="${title}">
                                    <div class="arrival-art" style="background:${sysColor}18;">
                                        ${art
                                            ? `<img src="${art}" alt="${title}" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
                                            : ''
                                        }
                                        <span class="arrival-emoji" style="${art ? 'display:none' : ''}">${H.systemEmoji(g.system_id)}</span>
                                    </div>
                                    <div class="arrival-info">
                                        <div class="arrival-title">${title}</div>
                                        <div class="arrival-sys" style="color:${sysColor}">${H.escHtml(g.system_name || g.system_id)}</div>
                                        ${g.reason ? `<div class="arrival-reason">${H.escHtml(g.reason)}</div>` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            // ── Continue Playing (Recently Played) — horizontal scroll shelf ──────
            if (historyData.length > 0) {
                html += `
                    <div class="section-header">
                        <span class="section-title">▶️ Continue Playing</span>
                        <a class="section-link" href="#/library">View All →</a>
                    </div>
                    <div class="arrivals-shelf" style="margin-bottom:28px;">
                        ${historyData.map(g => {
                            const art = H.artworkSrc(g);
                            const title = H.escHtml(g.title || g.clean_name);
                            const sysColor = g.system_color || '#7B2D8E';
                            return `
                                <div class="arrival-card" onclick="Router.navigate('#/game/${g.id}')" title="${title}">
                                    <div class="arrival-art" style="background:${sysColor}18;">
                                        ${art
                                            ? `<img src="${art}" alt="${title}" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
                                            : ''
                                        }
                                        <span class="arrival-emoji" style="${art ? 'display:none' : ''}">${H.systemEmoji(g.system_id)}</span>
                                    </div>
                                    <div class="arrival-info">
                                        <div class="arrival-title">${title}</div>
                                        <div class="arrival-sub">${H.timeAgo(g.started_at)}${g.duration_seconds ? ' · ' + H.formatDuration(g.duration_seconds) : ''}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            // ── Genre Rooms ───────────────────────────────────────────────────────
            if (genreRooms.length > 0) {
                html += `
                    <div class="section-header">
                        <span class="section-title">🎭 Genre Rooms</span>
                    </div>
                    <div class="genre-grid">
                        ${genreRooms.map(room => {
                            const href = room.type === 'genre'
                                ? `#/library?genre=${encodeURIComponent(room.value)}`
                                : room.type === 'system'
                                ? `#/library?system=${room.value}`
                                : room.type === 'tag'
                                ? `#/library?tag=${room.value}`
                                : `#/library?search=${encodeURIComponent(room.value)}`;
                            const artStyle = room.sample_art
                                ? `background:url('/artwork/${room.sample_art}') center/cover no-repeat`
                                : `background:${room.color}18`;
                            return `
                                <a class="genre-room" href="${href}" style="--gc:${room.color}">
                                    <div class="genre-room-bg" style="${artStyle}"></div>
                                    <div class="genre-room-content">
                                        <div class="genre-icon">${room.icon}</div>
                                        <div class="genre-name">${H.escHtml(room.label)}</div>
                                        <div class="genre-count">${room.count.toLocaleString()} games</div>
                                    </div>
                                </a>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            // ── Favorites ─────────────────────────────────────────────────────────
            if (favData.games?.length > 0) {
                html += `
                    <div class="section-header">
                        <span class="section-title">⭐ Favorites</span>
                        <a class="section-link" href="#/favorites">View All →</a>
                    </div>
                    <div class="arrivals-shelf" style="margin-bottom:28px;">
                        ${favData.games.slice(0, 12).map(g => {
                            const art = H.artworkSrc(g);
                            const title = H.escHtml(g.title || g.clean_name);
                            const sysColor = g.system_color || '#7B2D8E';
                            return `
                                <div class="arrival-card" onclick="Router.navigate('#/game/${g.id}')" title="${title}">
                                    <div class="arrival-art" style="background:${sysColor}18;">
                                        ${art
                                            ? `<img src="${art}" alt="${title}" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
                                            : ''
                                        }
                                        <span class="arrival-emoji" style="${art ? 'display:none' : ''}">${H.systemEmoji(g.system_id)}</span>
                                    </div>
                                    <div class="arrival-info">
                                        <div class="arrival-title">${title}</div>
                                        <div class="arrival-sys" style="color:${sysColor}">${H.escHtml(g.system_name || g.system_id)}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            // ── Player of the Day Spotlight ───────────────────────────────────────
            if (potdData) {
                const streakText = potdData.current_streak > 0 ? `🔥 ${potdData.current_streak}-day streak!` : `${potdData.fav_count || 0} favorites`;
                const gameText = potdData.top_game ? `Top pick: ${potdData.top_game.clean_name}` : '';
                html += `
                    <div class="potd-card">
                        <div class="potd-badge">Player of the Day</div>
                        <div class="potd-avatar" style="border-color:${potdData.color}">${potdData.emoji}</div>
                        <div class="potd-info">
                            <div class="potd-name" style="color:${potdData.color}">${H.escHtml(potdData.name)}</div>
                            <div class="potd-streak">${streakText}</div>
                            ${gameText ? `<div class="potd-game">${H.escHtml(gameText)}</div>` : ''}
                        </div>
                    </div>
                `;
            }

            // ── Weekly Mini-Leaderboard ───────────────────────────────────────────
            if (weekData?.leaderboard?.length > 0) {
                const medals = ['🥇','🥈','🥉'];
                const daysLeft = weekData.days_left;
                html += `
                    <div class="section-header">
                        <span class="section-title">🏆 This Week</span>
                        <a class="section-link" href="#/weekly">${daysLeft} day${daysLeft !== 1 ? 's' : ''} left →</a>
                    </div>
                    <div class="weekly-mini">
                        ${weekData.leaderboard.slice(0, 5).map((p, i) => `
                            <div class="weekly-mini-row" style="--wrc:${p.color}">
                                <span class="weekly-mini-medal">${medals[i] || `#${i+1}`}</span>
                                <span class="weekly-mini-emoji" style="border-color:${p.color}">${p.emoji}</span>
                                <span class="weekly-mini-name" style="color:${p.color}">${H.escHtml(p.name)}</span>
                                <span class="weekly-mini-sessions">${p.sessions} sessions</span>
                                <div class="weekly-mini-bar-wrap">
                                    <div class="weekly-mini-bar" style="width:${Math.round(p.sessions / (weekData.leaderboard[0].sessions || 1) * 100)}%; background:${p.color}"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            // ── Activity Feed ─────────────────────────────────────────────────────
            if (feedData?.length > 0) {
                html += `
                    <div class="section-header">
                        <span class="section-title">📡 Live Feed</span>
                    </div>
                    <div class="activity-feed">
                        ${feedData.map(item => {
                            const data = JSON.parse(item.data || '{}');
                            const time = H.timeAgo(item.created_at);
                            const name  = H.escHtml(item.player_name || 'Someone');
                            const emoji = item.player_emoji || '🎮';
                            const color = item.player_color || '#A855F7';
                            let icon = '🎮', text = '';
                            switch (item.type) {
                                case 'play':
                                    icon = '🕹️';
                                    text = `played <strong>${H.escHtml(data.game || item.game_name || 'a game')}</strong>`
                                         + (data.duration > 60 ? ` for ${Math.round(data.duration / 60)}m` : '');
                                    break;
                                case 'achievement':
                                    icon = data.icon || '🏆';
                                    text = `unlocked <strong>${H.escHtml(data.title || 'an achievement')}</strong>`;
                                    break;
                                case 'level_up':
                                    icon = data.badge || '⬆️';
                                    text = `reached <strong>Level ${data.new_level}: ${H.escHtml(data.title || '')}</strong>`;
                                    break;
                                case 'high_score':
                                    icon = '🏆';
                                    text = `set a new high score on <strong>${H.escHtml(data.game || '')}</strong>`;
                                    break;
                                case 'favorite':
                                    icon = '❤️';
                                    text = `favorited <strong>${H.escHtml(data.game || 'a game')}</strong>`;
                                    break;
                                case 'rate':
                                    icon = '⭐';
                                    text = `rated <strong>${H.escHtml(data.game || 'a game')}</strong>`;
                                    break;
                                default:
                                    text = `did something awesome`;
                            }
                            return `
                                <div class="feed-item">
                                    <div class="feed-avatar" style="border-color:${color}">${emoji}</div>
                                    <div class="feed-body">
                                        <span class="feed-name" style="color:${color}">${name}</span>
                                        <span class="feed-action">${text}</span>
                                        <span class="feed-icon">${icon}</span>
                                    </div>
                                    <div class="feed-time">${time}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            app.innerHTML = html;
            this.animateCounters();

        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error loading dashboard</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    animateCounters() {
        const counters = document.querySelectorAll('.stat-value[data-count]');
        counters.forEach(el => {
            const target = parseInt(el.dataset.count) || 0;
            if (target === 0) { el.textContent = '0'; return; }
            const duration = 1200;
            const start = performance.now();
            function tick(now) {
                const elapsed  = now - start;
                const progress = Math.min(elapsed / duration, 1);
                const eased    = 1 - Math.pow(1 - progress, 3);
                el.textContent = Math.round(eased * target).toLocaleString();
                if (progress < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        });
    },
};
