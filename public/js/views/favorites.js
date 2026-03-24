/* ═══════════════════════════════════════════════════════════
   PLAYER PROFILES — Molly's World Arcade
   Each player gets a full profile page with:
   - Editable avatar/emoji, name, color
   - Stats dashboard (favorites, scores, achievements)
   - Top systems breakdown
   - Family achievements (shared favorites, co-activity)
   - Make It Yours customization
   - Recent favorites grid
   - Full favorites browser with search + remove + rate
   - Player management (add/delete players)
   ═══════════════════════════════════════════════════════════ */

window.FavoritesView = {
    // ── Global Favorites ────────────────────
    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const data = await API.favorites(100);

            let html = `
                <div class="page-header">
                    <h1 class="page-title">⭐ Favorites</h1>
                    <p class="page-subtitle">${data.total || data.games?.length || 0} games in your favorites</p>
                </div>
            `;

            if (data.games && data.games.length > 0) {
                html += GameCard.renderGrid(data.games);
            } else {
                html += `
                    <div class="empty-state">
                        <div class="empty-state-icon">⭐</div>
                        <h3>No Favorites Yet</h3>
                        <p>Click the star on any game to add it to your favorites!</p>
                        <button class="btn btn-primary" onclick="Router.navigate('#/library')">Browse Library</button>
                    </div>
                `;
            }

            app.innerHTML = html;
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    // ── Character Assets ─────────────────────
    CHAR_ASSETS: {
        raya: {
            hero_bg:  '/img/characters/raya/raya-hero.jpg',
            avatar:   '/img/characters/raya/raya-sword.jpg',
            portrait: null,
            scene:    null,
            poster:   '/img/characters/raya/raya-poster.jpg',
        },
        minnie: {
            hero_bg:  '/img/characters/minnie/minnie-pink.jpg',
            avatar:   '/img/characters/minnie/minnie-flowers.jpg',
            portrait: null,
            scene:    null,
        },
        elf: {
            hero_bg:  '/img/characters/elf/elf-hero.jpg',
            avatar:   '/img/characters/elf/elf-hero.jpg',
            portrait: null,
            scene:    null,
        },
    },
    CHAR_LABELS: {
        raya:   { label: '⚔️ Raya — Dragon Warrior', icon: '⚔️' },
        minnie: { label: '🎀 Minnie Mouse', icon: '🎀' },
        elf:    { label: '🎄 Buddy the Elf', icon: '🎄' },
    },
    CHAR_STAT_ICONS: {
        raya:   ['⚔️', '⭐', '🏆', '🐉'],
        minnie: ['🎀', '💖', '🏆', '🦋'],
        elf:    ['🎄', '⭐', '🏆', '❄️'],
    },

    // ── Per-Player Profile Page ─────────────
    _editMode: false,

    async renderPlayer(params) {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading profile...</div>';
        const playerId = parseInt(params.id);

        try {
            const [profileData, favsData, familyData, allPlayers] = await Promise.all([
                API.playerStats(playerId),
                API.playerFavorites(playerId, 200),
                API.playerFamily(playerId).catch(() => ({ achievements: [] })),
                API.players(),
            ]);

            const p = profileData;
            const stats = p.stats;
            const editMode = this._editMode;

            // Set this player as active and load their prefs
            CustomizeView.setActivePlayer(playerId);
            localStorage.setItem('arcade_active_player_info', JSON.stringify({
                id: p.id, name: p.name, emoji: p.emoji, color: p.color, theme: p.theme || 'retro'
            }));
            // Update arcade title to "[Name]'s World Arcade"
            const poss = p.name.endsWith('s') ? p.name + "'" : p.name + "'s";
            document.title = poss + ' World Arcade';
            const logoEl = document.getElementById('logoWorldName');
            if (logoEl) logoEl.textContent = poss + ' World';
            // If player has saved preferences, apply them
            if (p.preferences && Object.keys(p.preferences).length > 0) {
                localStorage.setItem('arcade_customize', JSON.stringify(p.preferences));
                CustomizeView.applyConfig({ ...CustomizeView.DEFAULTS, ...p.preferences });
            }

            // Character theme wrapper + assets
            const charTheme = p.character_theme || '';
            const charThemeClass = charTheme ? ` character-theme-${charTheme}` : '';
            const charInfo = this.CHAR_LABELS[charTheme] || null;
            const charAssets = this.CHAR_ASSETS[charTheme] || null;
            const charLabel = charInfo ? charInfo.label : '';
            const charIcons = this.CHAR_STAT_ICONS[charTheme] || ['⭐', '⭐', '🏆', '🎖️'];

            let html = `<div class="player-profile${charThemeClass}">`;

            // ── LEVEL 9 Hero Banner ──
            const heroImgStyle = charAssets ? `style="--player-color: ${p.color}; --hero-bg: url('${charAssets.hero_bg}')"` : `style="--player-color: ${p.color}"`;
            const avatarContent = charAssets
                ? `<img src="${charAssets.avatar}" alt="${H.escHtml(p.name)}" class="pp-avatar-img" onerror="this.style.display='none';this.nextElementSibling.style.display=''">`
                  + `<span class="pp-avatar-emoji" style="display:none">${p.emoji}</span>`
                : p.emoji;
            const portraitHtml = charAssets && charAssets.portrait
                ? `<div class="pp-hero-portrait"><img src="${charAssets.portrait}" alt="" draggable="false"></div>`
                : '';

            html += `
                <div class="pp-hero ${charAssets ? 'pp-hero-cinematic' : ''}" ${heroImgStyle}>
                    <div class="pp-hero-bg"></div>
                    <div class="pp-hero-overlay"></div>
                    ${portraitHtml}
                    <div class="pp-hero-content">
                        <div class="pp-avatar-wrap">
                            <div class="pp-avatar" style="border-color:${p.color};box-shadow:0 0 30px ${p.color}44">${avatarContent}</div>
                            <button class="pp-edit-btn" onclick="FavoritesView.editAvatar(${p.id})" title="Change avatar">✏️</button>
                        </div>
                        <div class="pp-hero-info">
                            <h1 class="pp-name">${H.escHtml(p.name)}</h1>
                            ${charLabel ? `<div class="character-badge"><span class="cb-shine"></span>${charLabel}</div>` : ''}
                            <div class="pp-edit-row">
                                <button class="pp-inline-edit" onclick="FavoritesView.editName(${p.id}, '${H.escHtml(p.name).replace(/'/g, "\\'")}')">Edit Name</button>
                                <button class="pp-inline-edit" onclick="FavoritesView.editColor(${p.id})">Change Color</button>
                                <button class="pp-inline-edit" onclick="FavoritesView.editTheme(${p.id})">🎨 Theme</button>
                                <button class="pp-inline-edit" onclick="FavoritesView.editCharacter(${p.id})">👸 Character</button>
                                <button class="pp-inline-edit" onclick="FavoritesView.manageClan(${p.id})">🏰 Clan</button>
                                <button class="pp-inline-edit ${editMode ? 'active' : ''}" onclick="FavoritesView.toggleEditMode(${playerId})">${editMode ? '✓ Done Editing' : '⚙️ Manage'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            html += this._renderQuickPlay(p);

            // Scene banner between sections (character-themed)
            if (charAssets && charAssets.scene) {
                html += `<div class="pp-scene-banner"><img src="${charAssets.scene}" alt="" draggable="false"><div class="pp-scene-overlay"></div></div>`;
            }

            html += this._renderStatsCards(p, stats, charIcons);
            html += this._renderTopSystems(p, stats);
            html += this._renderFamilyAchievements(familyData);
            html += this._renderCustomization(playerId);

            // ── Recent Favorites ──
            if (p.recent_favorites && p.recent_favorites.length > 0) {
                html += `
                    <div class="pp-section">
                        <h2 class="pp-section-title">⭐ Recently Added</h2>
                        <div class="game-grid">
                            ${p.recent_favorites.map(g => GameCard.render(g)).join('')}
                        </div>
                    </div>
                `;
            }

            // ── Full Favorites Grid (with remove + rate in edit mode) ──
            if (favsData.games && favsData.games.length > 0) {
                html += `
                    <div class="pp-section">
                        <h2 class="pp-section-title">📚 All Favorites (${favsData.total})</h2>
                        <div class="pp-favs-controls">
                            <input type="text" class="pp-search" id="ppSearch" placeholder="Filter favorites..." oninput="FavoritesView.filterFavs(this.value)">
                            ${editMode ? `
                                <button class="pp-bulk-remove-btn" onclick="FavoritesView.bulkRemoveSelected(${playerId})">🗑️ Remove Selected</button>
                                <button class="pp-bulk-remove-btn" style="background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.3)" onclick="FavoritesView.clearAllFavorites(${playerId})">🧹 Clear All</button>
                                <button class="pp-bulk-remove-btn" style="background:rgba(34,197,94,0.15);border-color:rgba(34,197,94,0.3)" onclick="FavoritesView.getStarterPack(${playerId})">🎁 + Starter Pack</button>
                            ` : ''}
                        </div>
                        <div class="game-grid" id="ppFavsGrid">
                            ${favsData.games.map(g => this._renderFavCard(g, playerId, editMode)).join('')}
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="pp-section">
                        <div class="empty-state" style="padding:40px 20px">
                            <div class="empty-state-icon">🎁</div>
                            <h3>No Favorites Yet</h3>
                            <p style="margin-bottom:16px">Get a themed starter pack of 20 games or browse the library!</p>
                            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                                <button class="btn btn-primary" onclick="FavoritesView.getStarterPack(${playerId})">🎁 Get Starter Pack</button>
                                <button class="btn" onclick="Router.navigate('#/library')">Browse Library</button>
                            </div>
                        </div>
                    </div>
                `;
            }

            // ── Player Management Section ──
            html += `
                <div class="pp-section">
                    <h2 class="pp-section-title">👥 All Players</h2>
                    <div class="pp-players-grid">
                        ${allPlayers.map(pl => `
                            <div class="pp-player-card ${pl.id === playerId ? 'current' : ''}" onclick="Router.navigate('#/player/${pl.id}')">
                                <div class="pp-player-avatar" style="border-color:${pl.color}">${pl.emoji}</div>
                                <div class="pp-player-name">${H.escHtml(pl.name)}</div>
                                <div class="pp-player-fav-count">${pl.fav_count || 0} favs</div>
                            </div>
                        `).join('')}
                        <div class="pp-player-card pp-add-player" onclick="FavoritesView.addPlayer()">
                            <div class="pp-player-avatar add">+</div>
                            <div class="pp-player-name">Add Player</div>
                        </div>
                    </div>
                </div>
            `;

            // ── Danger Zone (in edit mode) ──
            if (editMode) {
                html += `
                    <div class="pp-section pp-danger-zone">
                        <h2 class="pp-section-title">⚠️ Danger Zone</h2>
                        <div class="pp-danger-content">
                            <p>Permanently delete <strong>${H.escHtml(p.name)}</strong> and all their favorites, ratings, scores, and achievements?</p>
                            <button class="pp-danger-btn" onclick="FavoritesView.deletePlayer(${p.id}, '${H.escHtml(p.name).replace(/'/g, "\\'")}')">🗑️ Delete ${H.escHtml(p.name)}</button>
                        </div>
                    </div>
                `;
            }

            html += `</div>`;
            app.innerHTML = html;

            // Store games for filtering
            this._currentFavs = favsData.games || [];
            this._currentPlayerId = playerId;
            this._selectedForRemoval = new Set();

            // ── Count-up animation for power stats ──
            requestAnimationFrame(() => {
                document.querySelectorAll('.pp-power-value').forEach(el => {
                    const target = parseInt(el.dataset.target) || 0;
                    if (target === 0) { el.textContent = '0'; return; }
                    const duration = 1200;
                    const start = performance.now();
                    const tick = (now) => {
                        const progress = Math.min((now - start) / duration, 1);
                        const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic
                        el.textContent = Math.round(ease * target);
                        if (progress < 1) requestAnimationFrame(tick);
                    };
                    // Use IntersectionObserver to trigger on scroll into view
                    const obs = new IntersectionObserver((entries) => {
                        entries.forEach(e => {
                            if (e.isIntersecting) {
                                obs.disconnect();
                                requestAnimationFrame(tick);
                            }
                        });
                    }, { threshold: 0.3 });
                    obs.observe(el);
                });

                // Trigger power bar fill animations
                document.querySelectorAll('.pp-power-bar-fill').forEach(el => {
                    el.style.width = el.style.getPropertyValue('--bar-pct');
                });
            });

            // Highlight active nav
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            const navLink = document.querySelector(`.nav-link[data-view="player-${playerId}"]`);
            if (navLink) navLink.classList.add('active');

        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    // ── Sub-renderers (extracted from renderPlayer) ─────

    _renderQuickPlay(p) {
        const picks = p.quick_picks || [];
        const originals = p.original_games || [];
        if (picks.length === 0 && originals.length === 0) return '';

        let cards = '';

        // Arcade Originals first (themed per player)
        originals.forEach(g => {
            let displayName = g.name;
            let icon = g.icon;
            if (p.name && typeof ArcadeThemes !== 'undefined') {
                displayName = ArcadeThemes.gameName(p.name, p.theme || 'retro', g.id) || g.name;
                const thm = ArcadeThemes.get(p.theme || 'retro');
                icon = thm.icon;
            }
            cards += `
                <div class="qp-card" onclick="arcade.playOriginal('${g.id}')" style="--qp-color:${g.color}">
                    <div class="qp-card-icon">${icon}</div>
                    <div class="qp-card-title">${H.escHtml(displayName)}</div>
                    <div class="qp-card-badge">Original</div>
                </div>
            `;
        });

        // Quick picks from favorites
        picks.forEach(g => {
            const art = H.artworkSrc(g);
            const title = H.escHtml(g.title || g.clean_name || g.filename);
            cards += `
                <div class="qp-card" onclick="Router.navigate('#/game/${g.id}')" style="--qp-color:${g.system_color || '#7B2D8E'}">
                    ${art
                        ? `<img class="qp-card-art" src="${art}" alt="${title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display=''">`
                        : ''
                    }
                    <div class="qp-card-icon" ${art ? 'style="display:none"' : ''}>${H.systemEmoji(g.system_id)}</div>
                    <div class="qp-card-title">${title}</div>
                    <div class="qp-card-sys">${H.escHtml(g.system_short_name || '')}</div>
                </div>
            `;
        });

        return `
            <div class="pp-section qp-section">
                <h2 class="pp-section-title">⚡ Quick Picks</h2>
                <div class="qp-scroll">${cards}</div>
            </div>
        `;
    },

    _renderStatsCards(p, stats, charIcons) {
        charIcons = charIcons || ['⭐', '⭐', '🏆', '🎖️'];
        const maxVal = Math.max(stats.favorites, stats.ratings, stats.scores, stats.achievements, 1);
        const bars = [
            { icon: charIcons[0], label: 'Favorites',    val: stats.favorites,    color: p.color },
            { icon: charIcons[1], label: 'Ratings',       val: stats.ratings,      color: '#F59E0B' },
            { icon: charIcons[2], label: 'High Scores',   val: stats.scores,       color: '#10B981' },
            { icon: charIcons[3], label: 'Achievements',  val: stats.achievements, color: '#8B5CF6' },
        ];
        return `
            <div class="pp-power-stats">
                ${bars.map(b => {
                    const pct = Math.max(Math.round((b.val / maxVal) * 100), 8);
                    return `
                    <div class="pp-power-row">
                        <div class="pp-power-label"><span class="pp-power-icon">${b.icon}</span> ${b.label}</div>
                        <div class="pp-power-bar-wrap">
                            <div class="pp-power-bar-fill" style="--bar-pct:${pct}%;--bar-color:${b.color}">
                                <span class="pp-power-shine"></span>
                            </div>
                        </div>
                        <div class="pp-power-value" data-target="${b.val}">0</div>
                    </div>`;
                }).join('')}
            </div>
        `;
    },

    _renderTopSystems(p, stats) {
        if (!p.top_systems || p.top_systems.length === 0) return '';
        return `
            <div class="pp-section">
                <h2 class="pp-section-title">🎮 Top Systems</h2>
                <div class="pp-systems-bar">
                    ${p.top_systems.map(s => {
                        const pct = stats.favorites > 0 ? Math.round((s.count / stats.favorites) * 100) : 0;
                        return `
                            <div class="pp-system-item">
                                <div class="pp-system-name">${H.escHtml(s.short_name)}</div>
                                <div class="pp-system-bar-wrap">
                                    <div class="pp-system-bar-fill" style="width:${pct}%;background:${s.color || p.color}"></div>
                                </div>
                                <div class="pp-system-count">${s.count}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },

    _renderFamilyAchievements(familyData) {
        const achievements = familyData.achievements || [];
        if (achievements.length === 0) return '';
        return `
            <div class="pp-section">
                <h2 class="pp-section-title">👨‍👩‍👧‍👦 Family Achievements</h2>
                <div class="pp-family-grid">
                    ${achievements.map(a => {
                        const tierClass = `pp-ach-${a.tier}`;
                        let extra = '';
                        if (a.with_player) {
                            extra = `<div class="pp-ach-buddy">
                                <span class="pp-ach-buddy-avatar" style="border-color:${a.with_player.color}">${a.with_player.emoji}</span>
                                <span>${H.escHtml(a.with_player.name)}</span>
                            </div>`;
                        }
                        if (a.games && a.games.length > 0) {
                            extra += `<div class="pp-ach-games">${a.games.map(g => `<span class="pp-ach-game-tag">${H.escHtml(g)}</span>`).join('')}</div>`;
                        }
                        if (a.players && a.players.length > 0) {
                            extra += `<div class="pp-ach-players">${a.players.map(pl => `<span class="pp-ach-buddy-avatar" style="border-color:${pl.color}" title="${H.escHtml(pl.name)}">${pl.emoji}</span>`).join('')}</div>`;
                        }
                        return `
                            <div class="pp-ach-card ${tierClass}">
                                <div class="pp-ach-icon">${a.icon}</div>
                                <div class="pp-ach-info">
                                    <div class="pp-ach-title">${H.escHtml(a.title)}</div>
                                    <div class="pp-ach-desc">${H.escHtml(a.desc)}</div>
                                    ${extra}
                                </div>
                                <div class="pp-ach-tier-badge">${a.tier}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },

    _renderCustomization(playerId) {
        const cConfig = window.CustomizeView ? CustomizeView.getConfig() : {};
        return `
            <div class="pp-section">
                <h2 class="pp-section-title">🎨 Make It Yours</h2>
                <div class="pp-customize">
                    <div class="pp-cust-row">
                        <div class="pp-cust-card">
                            <div class="pp-cust-label">Accent Color</div>
                            <div class="pp-cust-colors">
                                ${['#A855F7','#EC4899','#06B6D4','#10B981','#EF4444','#F59E0B','#3B82F6','#FFD700'].map(c => `
                                    <button class="pp-cust-color ${cConfig.accentColor === c ? 'active' : ''}"
                                            style="background:${c}"
                                            onclick="CustomizeView.setColor('${c}');FavoritesView.renderPlayer({id:${playerId}})"></button>
                                `).join('')}
                                <label class="pp-cust-color custom" title="Custom">
                                    🎯
                                    <input type="color" value="${cConfig.accentColor || '#A855F7'}"
                                           style="opacity:0;position:absolute;width:0;height:0"
                                           onchange="CustomizeView.setColor(this.value);FavoritesView.renderPlayer({id:${playerId}})">
                                </label>
                            </div>
                        </div>
                        <div class="pp-cust-card">
                            <div class="pp-cust-label">Card Style</div>
                            <div class="pp-cust-tiles">
                                ${[{id:'rounded',label:'Modern',icon:'⬜'},{id:'sharp',label:'Sharp',icon:'🟥'},{id:'retro',label:'Retro',icon:'📺'}].map(t => `
                                    <button class="pp-cust-tile ${cConfig.tileStyle === t.id ? 'active' : ''}"
                                            onclick="CustomizeView.setTileStyle('${t.id}');FavoritesView.renderPlayer({id:${playerId}})">
                                        <span>${t.icon}</span>
                                        <span>${t.label}</span>
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="pp-cust-row">
                        <div class="pp-cust-card">
                            <div class="pp-cust-label">Visual Effects</div>
                            <div class="pp-cust-toggles">
                                <label class="pp-cust-toggle">
                                    <span>Card Glow</span>
                                    <input type="checkbox" ${cConfig.cardGlow ? 'checked' : ''}
                                           onchange="CustomizeView.updateField('cardGlow', this.checked)">
                                </label>
                                <label class="pp-cust-toggle">
                                    <span>CRT Scanlines</span>
                                    <input type="checkbox" ${cConfig.scanlines ? 'checked' : ''}
                                           onchange="CustomizeView.updateField('scanlines', this.checked)">
                                </label>
                                <label class="pp-cust-toggle">
                                    <span>Particles</span>
                                    <input type="checkbox" ${cConfig.particles ? 'checked' : ''}
                                           onchange="CustomizeView.updateField('particles', this.checked)">
                                </label>
                            </div>
                        </div>
                        <div class="pp-cust-card">
                            <div class="pp-cust-label">Hero Image</div>
                            <div class="pp-cust-heroes">
                                ${[{l:'Molly',u:'/images/mollypop-bg.png',i:'🌸'},{l:'Retro',u:'/images/hero-retro.png',i:'🕹️'},{l:'Pixel',u:'/images/hero-pixel.png',i:'👾'},{l:'Neon',u:'/images/hero-neon.png',i:'🌃'},{l:'Space',u:'/images/hero-space.png',i:'🚀'}].map(h => `
                                    <button class="pp-cust-hero ${cConfig.heroImage === h.u ? 'active' : ''}"
                                            onclick="CustomizeView.setHero('${h.u}')" title="${h.l}">
                                        ${h.i}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // ── Render a single fav card (with edit controls) ──
    _renderFavCard(game, playerId, editMode) {
        const art = H.artworkSrc(game);
        const title = H.escHtml(game.title || game.clean_name || game.filename);
        const sysColor = game.system_color || '#7B2D8E';
        const sysName = game.system_short_name || game.system_name || game.system_id || '';

        if (!editMode) {
            return GameCard.render(game);
        }

        // Edit mode card — checkbox overlay + remove button + star rating
        const currentRating = game.player_rating || 0;
        const stars = [1,2,3,4,5].map(n =>
            `<span class="pp-fav-star ${n <= currentRating ? 'filled' : ''}" onclick="event.stopPropagation();FavoritesView.rateGame(${playerId},${game.id},${n})">${n <= currentRating ? '★' : '☆'}</span>`
        ).join('');

        return `
            <div class="game-card pp-editable-card" data-rom-id="${game.id}">
                <div class="game-card-art">
                    ${art
                        ? `<img src="${art}" alt="${title}" loading="lazy" onerror="this.parentNode.innerHTML='<span class=\\'no-art\\'>${H.systemEmoji(game.system_id)}</span>'">`
                        : `<span class="no-art">${H.systemEmoji(game.system_id)}</span>`
                    }
                    <label class="pp-fav-select" onclick="event.stopPropagation()">
                        <input type="checkbox" onchange="FavoritesView.toggleSelect(${game.id}, this.checked)">
                        <span class="pp-fav-check">✓</span>
                    </label>
                    <button class="pp-fav-remove" onclick="event.stopPropagation();FavoritesView.removeFav(${playerId},${game.id})" title="Remove from favorites">✕</button>
                    <span class="game-card-system" style="background:${sysColor}CC">${H.escHtml(sysName)}</span>
                </div>
                <div class="game-card-info">
                    <div class="game-card-title">${title}</div>
                    <div class="pp-fav-rating">${stars}</div>
                </div>
            </div>
        `;
    },

    // ── Edit mode toggle ─────────────────────
    toggleEditMode(playerId) {
        this._editMode = !this._editMode;
        this.renderPlayer({ id: playerId });
    },

    // ── Filter favorites ────────────────────
    _currentFavs: [],
    _currentPlayerId: null,
    _selectedForRemoval: new Set(),

    filterFavs(query) {
        const grid = document.getElementById('ppFavsGrid');
        if (!grid) return;
        const q = query.toLowerCase();
        const filtered = q
            ? this._currentFavs.filter(g => (g.clean_name || g.title || '').toLowerCase().includes(q))
            : this._currentFavs;
        grid.innerHTML = filtered.map(g => this._renderFavCard(g, this._currentPlayerId, this._editMode)).join('');
    },

    // ── Select/deselect for bulk removal ─────
    toggleSelect(romId, checked) {
        if (checked) this._selectedForRemoval.add(romId);
        else this._selectedForRemoval.delete(romId);
    },

    // ── Remove single favorite ───────────────
    async removeFav(playerId, romId) {
        try {
            await API.removePlayerFavorite(playerId, romId);
            H.toast('Removed from favorites', 'success');
            this.renderPlayer({ id: playerId });
        } catch (e) { H.toast('Failed: ' + e.message, 'error'); }
    },

    // ── Bulk remove selected favorites ───────
    async bulkRemoveSelected(playerId) {
        const ids = [...this._selectedForRemoval];
        if (ids.length === 0) { H.toast('No games selected', 'error'); return; }
        if (!confirm(`Remove ${ids.length} game${ids.length > 1 ? 's' : ''} from favorites?`)) return;
        try {
            await API.post(`/api/players/${playerId}/favorites/bulk-remove`, { rom_ids: ids });
            H.toast(`Removed ${ids.length} games!`, 'success');
            this._selectedForRemoval.clear();
            this.renderPlayer({ id: playerId });
        } catch (e) { H.toast('Failed: ' + e.message, 'error'); }
    },

    // ── Clear ALL favorites ─────────────────
    async clearAllFavorites(playerId) {
        if (!confirm('Clear ALL favorites for this player? This cannot be undone.')) return;
        try {
            const res = await API.del(`/api/players/${playerId}/favorites`);
            H.toast(`Cleared ${res.cleared} favorites!`, 'success');
            this._editMode = false;
            this.renderPlayer({ id: playerId });
        } catch (e) { H.toast('Failed: ' + e.message, 'error'); }
    },

    // ── Get Starter Pack (20 themed games) ───
    async getStarterPack(playerId) {
        try {
            const res = await API.post(`/api/players/${playerId}/favorites/starter-pack`);
            H.toast(`🎁 Added ${res.added} games! (${res.total_favorites} total)`, 'success');
            this.renderPlayer({ id: playerId });
        } catch (e) { H.toast('Failed: ' + e.message, 'error'); }
    },

    // ── Rate a game (per-player stars) ───────
    async rateGame(playerId, romId, rating) {
        try {
            await API.setPlayerRating(romId, playerId, rating);
            // Update local cache
            const game = this._currentFavs.find(g => g.id === romId);
            if (game) game.player_rating = rating;
            // Update just the stars display
            const card = document.querySelector(`.pp-editable-card[data-rom-id="${romId}"] .pp-fav-rating`);
            if (card) {
                card.innerHTML = [1,2,3,4,5].map(n =>
                    `<span class="pp-fav-star ${n <= rating ? 'filled' : ''}" onclick="event.stopPropagation();FavoritesView.rateGame(${playerId},${romId},${n})">${n <= rating ? '★' : '☆'}</span>`
                ).join('');
            }
            H.toast(`Rated ${rating} star${rating > 1 ? 's' : ''}!`, 'success');
        } catch (e) { H.toast('Failed: ' + e.message, 'error'); }
    },

    // ── Edit Name ───────────────────────────
    editName(playerId, currentName) {
        const name = prompt('Enter new name:', currentName);
        if (!name || name.trim() === currentName) return;
        API.updatePlayer(playerId, { name: name.trim() }).then(() => {
            H.toast('Name updated!', 'success');
            arcade.loadPlayers();
            this.renderPlayer({ id: playerId });
        }).catch(e => H.toast('Failed: ' + e.message, 'error'));
    },

    // ── Edit Avatar Emoji ───────────────────
    editAvatar(playerId) {
        const EMOJIS = [
            '🌸','🦋','🌺','⚡','🎯','🔥','⚔️','💜','🎮','👾',
            '🎲','🏆','💀','🐉','🦊','🐱','🐶','🎵','🌟','🚀',
            '🍕','🎸','⭐','🌈','🎪','🎭','🦄','🐸','🎃','❄️',
            '🌊','🎀','🧸','🐧','🦖','🍄','🎌','🐻','🌻','💎',
            '🏰','🎠','👑','🦁','🐰','🍭','🎈','🌙','☀️','🍀',
        ];
        const picker = document.createElement('div');
        picker.className = 'emoji-picker-overlay';
        picker.innerHTML = `
            <div class="emoji-picker">
                <h3>Choose Your Avatar</h3>
                <div class="emoji-picker-grid">
                    ${EMOJIS.map(e => `<button class="emoji-pick" onclick="FavoritesView.setEmoji(${playerId},'${e}')">${e}</button>`).join('')}
                </div>
                <button class="emoji-picker-close" onclick="this.closest('.emoji-picker-overlay').remove()">Cancel</button>
            </div>
        `;
        document.body.appendChild(picker);
    },

    setEmoji(playerId, emoji) {
        document.querySelector('.emoji-picker-overlay')?.remove();
        API.updatePlayer(playerId, { emoji }).then(() => {
            H.toast('Avatar updated!', 'success');
            arcade.loadPlayers();
            this.renderPlayer({ id: playerId });
        }).catch(e => H.toast('Failed: ' + e.message, 'error'));
    },

    // ── Edit Color ──────────────────────────
    editColor(playerId) {
        const COLORS = [
            '#F472B6','#818CF8','#FB7185','#38BDF8','#34D399','#F59E0B','#EF4444',
            '#C084FC','#06B6D4','#10B981','#EC4899','#8B5CF6','#FFD700','#FF6B6B',
        ];
        const picker = document.createElement('div');
        picker.className = 'emoji-picker-overlay';
        picker.innerHTML = `
            <div class="emoji-picker">
                <h3>Choose Your Color</h3>
                <div class="emoji-picker-grid" style="grid-template-columns:repeat(7,1fr)">
                    ${COLORS.map(c => `<button class="color-pick" style="background:${c}" onclick="FavoritesView.setColor(${playerId},'${c}')"></button>`).join('')}
                </div>
                <button class="emoji-picker-close" onclick="this.closest('.emoji-picker-overlay').remove()">Cancel</button>
            </div>
        `;
        document.body.appendChild(picker);
    },

    setColor(playerId, color) {
        document.querySelector('.emoji-picker-overlay')?.remove();
        API.updatePlayer(playerId, { color }).then(() => {
            H.toast('Color updated!', 'success');
            arcade.loadPlayers();
            this.renderPlayer({ id: playerId });
        }).catch(e => H.toast('Failed: ' + e.message, 'error'));
    },

    // ── Edit Theme ──────────────────────────
    editTheme(playerId) {
        if (typeof ArcadeThemes === 'undefined') { H.toast('Theme system not loaded', 'error'); return; }
        const themes = ArcadeThemes.all();
        const picker = document.createElement('div');
        picker.className = 'emoji-picker-overlay';
        picker.innerHTML = `
            <div class="emoji-picker" style="max-width:460px">
                <h3>🎨 Choose Your Theme</h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:400px;overflow-y:auto;padding:4px">
                    ${themes.map(t => `
                        <button class="theme-pick-btn" onclick="FavoritesView.setTheme(${playerId},'${t.id}')"
                            style="display:flex;align-items:center;gap:10px;padding:12px;border-radius:12px;border:2px solid ${t.colors[0]}33;background:linear-gradient(135deg,${t.colors[0]}15,${t.colors[1]}15);cursor:pointer;text-align:left;transition:all .2s"
                            onmouseover="this.style.borderColor='${t.colors[0]}';this.style.transform='scale(1.03)'"
                            onmouseout="this.style.borderColor='${t.colors[0]}33';this.style.transform='scale(1)'">
                            <span style="font-size:28px">${t.icon}</span>
                            <div>
                                <div style="font-weight:700;color:#E2E8F0;font-size:14px">${t.name}</div>
                                <div style="font-size:11px;color:#94A3B8">${t.description}</div>
                                <div style="display:flex;gap:3px;margin-top:4px">${t.colors.slice(0,6).map(c => `<span style="width:14px;height:14px;border-radius:50%;background:${c};display:inline-block"></span>`).join('')}</div>
                            </div>
                        </button>
                    `).join('')}
                </div>
                <button class="emoji-picker-close" onclick="this.closest('.emoji-picker-overlay').remove()">Cancel</button>
            </div>
        `;
        document.body.appendChild(picker);
    },

    setTheme(playerId, themeId) {
        document.querySelector('.emoji-picker-overlay')?.remove();
        const theme = ArcadeThemes.get(themeId);
        API.updatePlayer(playerId, { theme: themeId }).then(() => {
            H.toast(`${theme.icon} ${theme.name} theme activated!`, 'success');
            // Update localStorage cache
            try {
                const info = JSON.parse(localStorage.getItem('arcade_active_player_info') || 'null');
                if (info && info.id === playerId) {
                    info.theme = themeId;
                    localStorage.setItem('arcade_active_player_info', JSON.stringify(info));
                }
            } catch {}
            arcade.loadPlayers();
            this.renderPlayer({ id: playerId });
        }).catch(e => H.toast('Failed: ' + e.message, 'error'));
    },

    // ── Manage Clan Membership ──────────────
    async manageClan(playerId) {
        try {
            const data = await API.clans();
            const allClans = data.clans.filter(c => c.id !== 0);
            // Find which clans this player is in
            const playerClans = new Set();
            allClans.forEach(c => {
                if (c.players && c.players.some(p => p.id === playerId)) playerClans.add(c.id);
            });

            const overlay = document.createElement('div');
            overlay.className = 'emoji-picker-overlay';
            overlay.innerHTML = `
                <div class="emoji-picker" style="max-width:400px">
                    <h3>🏰 Manage Clan Membership</h3>
                    <div style="display:flex;flex-direction:column;gap:8px;max-height:350px;overflow-y:auto;padding:4px">
                        ${allClans.map(c => {
                            const isMember = playerClans.has(c.id);
                            return `
                            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:10px;background:${isMember ? c.color + '22' : 'rgba(255,255,255,0.03)'};border:1px solid ${isMember ? c.color : 'rgba(255,255,255,0.08)'}">
                                <span style="font-size:14px;color:#E2E8F0">${c.emoji} ${c.name}</span>
                                <button class="pp-inline-edit" style="padding:4px 12px;font-size:12px;${isMember ? 'color:#F43F5E' : 'color:#10B981'}"
                                    onclick="FavoritesView.toggleClan(${playerId},${c.id},${isMember})">
                                    ${isMember ? '✕ Leave' : '+ Join'}
                                </button>
                            </div>`;
                        }).join('')}
                    </div>
                    <button class="emoji-picker-close" onclick="this.closest('.emoji-picker-overlay').remove()">Done</button>
                </div>
            `;
            document.body.appendChild(overlay);
        } catch (e) {
            H.toast('Failed to load clans: ' + e.message, 'error');
        }
    },

    async toggleClan(playerId, clanId, isCurrentMember) {
        try {
            if (isCurrentMember) {
                await API.removeClanMember(playerId, clanId);
                H.toast('Left clan', 'info');
            } else {
                await API.addClanMember(playerId, clanId);
                H.toast('Joined clan!', 'success');
            }
            // Refresh the modal
            document.querySelector('.emoji-picker-overlay')?.remove();
            this.manageClan(playerId);
        } catch (e) {
            H.toast('Failed: ' + e.message, 'error');
        }
    },

    // ── Add New Player ──────────────────────
    async addPlayer() {
        const EMOJIS = ['🎮','👾','🎲','🌟','🚀','💎','🦊','🐉','⚡','🔥','🎯','🏆'];
        const COLORS = ['#A855F7','#EC4899','#06B6D4','#10B981','#EF4444','#F59E0B','#3B82F6','#FFD700'];

        // Fetch clans for the dropdown
        let clans = [];
        try {
            const data = await API.clans();
            clans = data.clans.filter(c => c.id !== 0);
        } catch (e) { /* silently fall back to no clan options */ }

        const clanOpts = clans.map(c => `<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');

        const overlay = document.createElement('div');
        overlay.className = 'emoji-picker-overlay';
        overlay.innerHTML = `
            <div class="emoji-picker pp-add-player-modal">
                <h3>Add New Player</h3>
                <div class="pp-add-field">
                    <label>Name</label>
                    <input type="text" id="newPlayerName" placeholder="Player name..." class="pp-search" style="margin:0">
                </div>
                <div class="pp-add-field">
                    <label>Avatar</label>
                    <div class="emoji-picker-grid" style="grid-template-columns:repeat(6,1fr);gap:6px">
                        ${EMOJIS.map(e => `<button class="emoji-pick pp-add-emoji-pick" onclick="document.querySelectorAll('.pp-add-emoji-pick').forEach(b=>b.classList.remove('selected'));this.classList.add('selected');this.dataset.val='${e}'">${e}</button>`).join('')}
                    </div>
                </div>
                <div class="pp-add-field">
                    <label>Color</label>
                    <div class="emoji-picker-grid" style="grid-template-columns:repeat(8,1fr);gap:6px">
                        ${COLORS.map(c => `<button class="color-pick pp-add-color-pick" style="background:${c}" onclick="document.querySelectorAll('.pp-add-color-pick').forEach(b=>b.classList.remove('selected'));this.classList.add('selected');this.dataset.val='${c}'"></button>`).join('')}
                    </div>
                </div>
                <div class="pp-add-field">
                    <label>Clan</label>
                    <div style="display:flex;gap:8px;align-items:center">
                        <select id="newPlayerClan" class="pp-search" style="margin:0;cursor:pointer;flex:1">
                            <option value="">No clan</option>
                            ${clanOpts}
                        </select>
                        <button class="btn btn-sm" style="white-space:nowrap;padding:6px 12px" onclick="FavoritesView.showCreateClanInline()">+ New Clan</button>
                    </div>
                    <div id="inlineClanForm" style="display:none;margin-top:8px"></div>
                </div>
                <div style="display:flex;gap:10px;margin-top:16px">
                    <button class="btn btn-primary" style="flex:1" onclick="FavoritesView.confirmAddPlayer()">Create Player</button>
                    <button class="emoji-picker-close" onclick="this.closest('.emoji-picker-overlay').remove()">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        setTimeout(() => document.getElementById('newPlayerName')?.focus(), 100);
    },

    showCreateClanInline() {
        const form = document.getElementById('inlineClanForm');
        form.style.display = 'block';
        form.innerHTML = `
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                <input type="text" id="inlineClanName" placeholder="Clan name..." class="pp-search" style="margin:0;flex:1;min-width:100px">
                <input type="text" id="inlineClanEmoji" value="⚔️" class="pp-search" style="margin:0;width:40px;text-align:center">
                <button class="btn btn-sm btn-primary" style="padding:6px 12px" onclick="FavoritesView.confirmCreateClanInline()">Create</button>
                <button class="btn btn-sm" style="padding:6px 8px" onclick="document.getElementById('inlineClanForm').style.display='none'">✕</button>
            </div>
        `;
        document.getElementById('inlineClanName')?.focus();
    },

    async confirmCreateClanInline() {
        const name = document.getElementById('inlineClanName')?.value?.trim();
        const emoji = document.getElementById('inlineClanEmoji')?.value?.trim() || '⚔️';
        if (!name) { H.toast('Enter a clan name', 'error'); return; }
        try {
            const clan = await API.createClan({ name, emoji, color: '#A855F7' });
            // Add the new clan to the dropdown and select it
            const select = document.getElementById('newPlayerClan');
            const opt = new Option(`${clan.emoji} ${clan.name}`, clan.id);
            select.add(opt);
            select.value = clan.id;
            document.getElementById('inlineClanForm').style.display = 'none';
            H.toast(`${emoji} ${name} created!`, 'success');
        } catch (e) { H.toast(e.message, 'error'); }
    },

    async confirmAddPlayer() {
        const name = document.getElementById('newPlayerName')?.value?.trim();
        if (!name) { H.toast('Enter a name!', 'error'); return; }
        const emojiEl = document.querySelector('.pp-add-emoji-pick.selected');
        const colorEl = document.querySelector('.pp-add-color-pick.selected');
        const emoji = emojiEl?.dataset?.val || '🎮';
        const color = colorEl?.dataset?.val || '#A855F7';
        const clanId = document.getElementById('newPlayerClan')?.value;

        try {
            const player = await API.createPlayer({ name, emoji, color });
            if (clanId) await API.addClanMember(player.id, parseInt(clanId));
            document.querySelector('.emoji-picker-overlay')?.remove();
            H.toast(`${name} joined the arcade!`, 'success');
            arcade.loadPlayers();
            Router.navigate(`#/player/${player.id}`);
        } catch (e) { H.toast('Failed: ' + e.message, 'error'); }
    },

    // ── Edit Character Theme ────────────────
    editCharacter(playerId) {
        const CHARS = [
            { id: 'raya',   label: 'Raya Princess',  icon: '⚔️', desc: 'Dragon warrior · Pink & gold', colors: ['#DB2777','#DAA520'] },
            { id: 'minnie', label: 'Minnie Mouse',   icon: '🎀', desc: 'Classic charm · Red polka dots', colors: ['#EF4444','#EC4899'] },
            { id: 'elf',    label: 'Buddy the Elf',   icon: '🎄', desc: 'Christmas magic · Green & red', colors: ['#22C55E','#EF4444'] },
        ];
        const picker = document.createElement('div');
        picker.className = 'emoji-picker-overlay';
        picker.innerHTML = `
            <div class="emoji-picker" style="max-width:400px">
                <h3>👸 Choose Your Character</h3>
                <div style="display:flex;flex-direction:column;gap:10px;padding:4px">
                    ${CHARS.map(c => `
                        <button onclick="FavoritesView.setCharacter(${playerId},'${c.id}')"
                            style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:14px;border:2px solid ${c.colors[0]}33;background:linear-gradient(135deg,${c.colors[0]}15,${c.colors[1]}15);cursor:pointer;text-align:left;transition:all .2s"
                            onmouseover="this.style.borderColor='${c.colors[0]}';this.style.transform='scale(1.03)'"
                            onmouseout="this.style.borderColor='${c.colors[0]}33';this.style.transform='scale(1)'">
                            <span style="font-size:32px">${c.icon}</span>
                            <div>
                                <div style="font-weight:700;color:#E2E8F0;font-size:15px">${c.label}</div>
                                <div style="font-size:12px;color:#94A3B8">${c.desc}</div>
                                <div style="display:flex;gap:4px;margin-top:4px">${c.colors.map(cl => `<span style="width:16px;height:16px;border-radius:50%;background:${cl};display:inline-block"></span>`).join('')}</div>
                            </div>
                        </button>
                    `).join('')}
                    <button onclick="FavoritesView.setCharacter(${playerId},'')"
                        style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);cursor:pointer;color:#94A3B8;font-size:13px;transition:all .2s"
                        onmouseover="this.style.borderColor='rgba(255,255,255,0.2)'"
                        onmouseout="this.style.borderColor='rgba(255,255,255,0.1)'">
                        ✕ Remove Character Theme
                    </button>
                </div>
                <button class="emoji-picker-close" onclick="this.closest('.emoji-picker-overlay').remove()">Cancel</button>
            </div>
        `;
        document.body.appendChild(picker);
    },

    async setCharacter(playerId, charId) {
        document.querySelector('.emoji-picker-overlay')?.remove();
        try {
            await API.updatePlayer(playerId, { character_theme: charId || null });
            const labels = { raya: '⚔️ Raya', minnie: '🎀 Minnie', elf: '🎄 Buddy the Elf' };
            H.toast(charId ? `${labels[charId]} theme activated!` : 'Character theme removed', 'success');
            this.renderPlayer({ id: playerId });
        } catch (e) { H.toast('Failed: ' + e.message, 'error'); }
    },

    // ── Delete Player ───────────────────────
    async deletePlayer(playerId, name) {
        if (!confirm(`Are you sure you want to delete ${name}? This cannot be undone!`)) return;
        if (!confirm(`REALLY delete ${name} and ALL their data?`)) return;
        try {
            await API.deletePlayer(playerId);
            H.toast(`${name} has been removed`, 'success');
            this._editMode = false;
            arcade.loadPlayers();
            Router.navigate('#/');
        } catch (e) { H.toast('Failed: ' + e.message, 'error'); }
    },
};
