/* Home View — V7: Weekly Leaderboard + Recommendations */
window.HomeView = {
    async render() {
        const app = document.getElementById('app');
        // Skeleton loading state
        app.innerHTML = `
            <div class="mollypop-hero" style="opacity:0.3">
                <div class="mollypop-hero-center">
                    <div class="hero-theme-icon" style="opacity:0.2">🕹️</div>
                    <h1 class="mollypop-hero-title hero-title-xl" style="opacity:0.15">Loading...</h1>
                </div>
            </div>
            <div class="home-stats" style="opacity:0.2">
                ${Array.from({length:4}, () => '<div class="stat-card"><div class="skeleton-title" style="width:40px;height:28px;margin:0 auto 8px"></div><div class="skeleton-meta" style="width:60px;margin:0 auto"></div></div>').join('')}
            </div>
            ${GameCard.renderSkeleton(12)}
        `;

        try {
            const [systemsData, historyData, libraryData, favData, potdData, feedData, newArrivals, genreRooms, forYouData, weekData, collectionsData, originalsData] = await Promise.all([
                API.systems(),
                API.recentHistory(16),
                API.library({ limit: 1 }),
                (() => { const pid = parseInt(localStorage.getItem('arcade_active_player')); return pid ? API.playerFavorites(pid, 12).catch(() => ({ games: [] })) : API.favorites ? API.favorites(12).catch(() => ({ games: [] })) : Promise.resolve({ games: [] }); })(),
                API.playerOfTheDay().catch(() => null),
                API.activityFeed(10).catch(() => []),
                API.get('/api/library/new-arrivals?limit=20').catch(() => []),
                API.get('/api/library/genres').catch(() => []),
                API.get('/api/recommendations/for-you?limit=16').catch(() => ({ games: [] })),
                API.get('/api/stats/weekly').catch(() => null),
                API.get('/api/collections').catch(() => []),
                API.get('/api/originals').catch(() => []),
            ]);

            const totalRoms     = libraryData.total || 0;
            const totalSystems  = systemsData.filter(s => s.rom_count > 0).length;
            const totalFavorites = favData.total || favData.games?.length || 0;
            const totalOriginals = Array.isArray(originalsData) ? originalsData.length : 0;


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
                        ${(() => {
                            const collections = Array.isArray(collectionsData) ? collectionsData : (collectionsData.collections || []);
                            const themed = collections.filter(c => c.is_system && c.theme);
                            if (themed.length > 0) {
                                return themed.map(c => {
                                    const href = c.theme === 'retro' ? '#/library' : '#/collections/' + c.id;
                                    const label = c.theme === 'shmups' ? 'Shooters' : c.name.split(' ')[0];
                                    return `<button class="quick-action-card" onclick="Router.navigate('${href}')" style="border-color:${c.color}33">
                                        <span class="quick-action-icon">${c.icon || '🎮'}</span>
                                        <span class="quick-action-label">${H.escHtml(label)}</span>
                                        <span class="quick-action-count">${c.game_count || 0}</span>
                                    </button>`;
                                }).join('');
                            }
                            return `
                                <button class="quick-action-card" onclick="window.arcade.playRandomGame()">
                                    <span class="quick-action-icon">🎲</span>
                                    <span class="quick-action-label">Surprise</span>
                                </button>
                            `;
                        })()}
                    </div>
                </div>
            `;

            // ── Stats Row (clickable navigation) ─────────────────────────────────
            html += `
                <div class="home-stats">
                    <div class="stat-card stat-card-link" onclick="Router.navigate('#/library')">
                        <div class="stat-icon" style="color:#a855f7"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="3"/><line x1="6" y1="11" x2="6" y2="11.01"/><line x1="10" y1="11" x2="10" y2="11.01"/><circle cx="17" cy="11" r="1.5"/><line x1="8" y1="18" x2="8" y2="21"/><line x1="16" y1="18" x2="16" y2="21"/></svg></div>
                        <div class="stat-value purple" data-count="${totalRoms}">0</div>
                        <div class="stat-label">Total Games</div>
                    </div>
                    <div class="stat-card stat-card-link" onclick="Router.navigate('#/systems')">
                        <div class="stat-icon" style="color:#eab308"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="14" x2="21" y2="14"/><circle cx="8" cy="9" r="1.5"/><circle cx="16" cy="9" r="1.5"/><line x1="10" y1="18" x2="14" y2="18"/></svg></div>
                        <div class="stat-value yellow" data-count="${totalSystems}">0</div>
                        <div class="stat-label">Systems</div>
                    </div>
                    <div class="stat-card stat-card-link" onclick="Router.navigate('#/favorites')">
                        <div class="stat-icon" style="color:#ec4899"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg></div>
                        <div class="stat-value pink" data-count="${totalFavorites}">0</div>
                        <div class="stat-label">Favorites</div>
                    </div>
                    <div class="stat-card stat-card-link" onclick="Router.navigate('#/originals')">
                        <div class="stat-icon" style="color:#14b8a6"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
                        <div class="stat-value teal" data-count="${totalOriginals}">0</div>
                        <div class="stat-label">Originals</div>
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
