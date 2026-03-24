/* Game Detail View — Full game info with play button + per-player favorites */
window.GameView = {
    async render(params) {
        const app = document.getElementById('app');
        const id = params.id || params[0];
        this._currentRomId = id;
        app.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const game = await API.game(id);
            const art = H.artworkSrc(game);
            const title = H.escHtml(game.title || game.clean_name || game.filename);

            // Fetch all players and their fav status for this game
            const players = arcade.players.length ? arcade.players : await API.players();
            const favChecks = await Promise.all(
                players.map(p => API.isPlayerFavorite(p.id, game.id)
                    .then(r => ({ ...p, isFav: r.favorited }))
                    .catch(() => ({ ...p, isFav: false })))
            );

            // ─── Era quip for trivia ────────────────────────────────────────────
            const getEraQuip = y => {
                const n = parseInt(y);
                if (!n) return '';
                if (n <= 1975) return ' — a true retro relic!';
                if (n <= 1979) return ' — pre-NES era gold!';
                if (n <= 1983) return ' — born in the golden age of arcades!';
                if (n <= 1986) return ' — NES was conquering the world!';
                if (n <= 1989) return ' — late 8-bit perfection!';
                if (n <= 1991) return ' — the 16-bit wars were EPIC!';
                if (n <= 1994) return ' — peak 16-bit era!';
                if (n <= 1996) return ' — PlayStation just changed everything!';
                if (n <= 1999) return ' — surviving the console wars!';
                if (n <= 2001) return ' — survived Y2K and still slapping!';
                if (n <= 2005) return ' — PS2/Xbox era classic!';
                if (n <= 2010) return ' — HD gaming had arrived!';
                return ' — a modern classic!';
            };

            let html = `
                <div style="margin-bottom:16px;">
                    <a href="#/library" style="color:var(--teal);text-decoration:none;font-size:15px;padding:10px 0;display:inline-block;">← Back to Library</a>
                </div>

                <div class="game-detail">
                    <div class="game-detail-art">
                        ${art
                            ? `<img src="${art}" alt="${title}" onerror="this.parentNode.innerHTML='<span class=\\'no-art\\'>${H.systemEmoji(game.system_id)}</span>'">`
                            : `<span class="no-art">${H.systemEmoji(game.system_id)}</span>`
                        }
                    </div>
                    <div class="game-detail-meta">
                        <div class="game-title-wrap">
                            <h1 class="game-detail-title">${title}</h1>
                            ${game.publisher || game.developer ? `<span class="game-maker-tag">by ${H.escHtml(game.developer || game.publisher)}${game.developer && game.publisher && game.developer !== game.publisher ? ` · ${H.escHtml(game.publisher)}` : ''}</span>` : ''}
                        </div>

                        ${(game.year || game.genre || game.players || game.region || game.achievement_count) ? `
                        <div class="game-fun-pills">
                            ${game.year ? `<span class="fun-pill">📅 ${H.escHtml(game.year)}</span>` : ''}
                            ${game.genre ? `<span class="fun-pill">🕹️ ${H.escHtml(game.genre)}</span>` : ''}
                            ${game.players ? `<span class="fun-pill">👥 ${H.escHtml(game.players)}</span>` : ''}
                            ${game.region ? `<span class="fun-pill">🌍 ${H.escHtml(game.region)}</span>` : ''}
                            ${game.achievement_count ? `<span class="fun-pill fun-pill-gold">🏆 ${game.achievement_count} Achievement${game.achievement_count !== 1 ? 's' : ''}</span>` : ''}
                        </div>` : ''}

                        <div class="game-hero-summary" id="heroSummary">
                            ${game.description
                                ? `<p class="hero-text">${H.escHtml(game.description)}</p>`
                                : `<p class="hero-text hero-placeholder">Loading game intel...</p>`
                            }
                        </div>
                        <div class="hero-era-quip">
                            ${game.year ? `📅 ${H.escHtml(game.year)}${getEraQuip(game.year)}` : ''}
                            ${game.total_play_time > 3600 ? ` · 🔥 ${H.formatDuration(game.total_play_time)} played` : game.total_play_time > 0 ? ` · 🕹️ ${H.formatDuration(game.total_play_time)} played` : ''}
                        </div>

                        <div class="game-detail-actions">
                            <button class="btn btn-yellow btn-lg" onclick="window.arcade.playGame(${game.id})">
                                ▶ Play Now
                            </button>
                            <button class="btn btn-ghost" id="favBtn" onclick="GameView.toggleFav(${game.id}, ${game.is_favorite ? 'false' : 'true'})">
                                ${game.is_favorite ? '⭐ Favorited' : '☆ Favorite'}
                            </button>
                            <button class="btn btn-ghost btn-sm" onclick="API.fetchArtwork(${game.id}).then(r => { H.toast('Artwork updated', 'success'); GameView.render({id:${game.id}}); }).catch(e => H.toast(e.message, 'error'))">
                                🖼️ Fetch Art
                            </button>
                            ${game.manual_url ? `<a class="btn btn-ghost btn-sm" href="${H.escHtml(game.manual_url)}" target="_blank" rel="noopener">📖 View Manual</a>` : ''}
                            <button class="btn btn-ghost btn-sm" onclick="GameView.openReportModal(${game.id}, '${H.escHtml(title).replace(/'/g, "\\'")}')">
                                🚩 Report
                            </button>
                        </div>
                        <!-- Report Modal -->
                        <div id="reportModal" class="report-modal" style="display:none">
                            <div class="report-modal-box">
                                <h3 class="report-modal-title">🚩 Report a Problem</h3>
                                <p class="report-modal-game" id="reportGameName"></p>
                                <select id="reportType" class="report-select">
                                    <option value="broken">Game doesn't launch / broken ROM</option>
                                    <option value="crashes">Game crashes during play</option>
                                    <option value="wrong_art">Wrong artwork / boxart</option>
                                    <option value="wrong_info">Wrong info (year, publisher, genre)</option>
                                    <option value="other">Other problem</option>
                                </select>
                                <textarea id="reportDesc" class="report-textarea" placeholder="Optional: describe the problem..."></textarea>
                                <div class="report-modal-btns">
                                    <button class="btn btn-yellow btn-sm" onclick="GameView.submitReport()">Submit Report</button>
                                    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('reportModal').style.display='none'">Cancel</button>
                                </div>
                            </div>
                        </div>

                        <!-- Per-player favorite toggles (collapsed) -->
                        <details class="game-collapse-section">
                            <summary class="game-collapse-header">
                                <span>Add to favorites</span>
                                ${(() => { const c = favChecks.filter(p => p.isFav).length; return c ? `<span class="collapse-badge">${c} favorited</span>` : ''; })()}
                            </summary>
                            <div class="game-collapse-body">
                                <div class="player-fav-pills">
                                    ${favChecks.map(p => `
                                        <button class="player-fav-pill ${p.isFav ? 'active' : ''}"
                                                style="--pill-color: ${p.color}"
                                                onclick="GameView.togglePlayerFav(${p.id}, ${game.id}, this)"
                                                data-player-id="${p.id}">
                                            <span class="player-fav-emoji">${p.emoji}</span>
                                            <span class="player-fav-name">${H.escHtml(p.name)}</span>
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                        </details>

                        <!-- Star Ratings (collapsed) -->
                        <details class="game-collapse-section">
                            <summary class="game-collapse-header">
                                <span>Rate this game</span>
                                <span class="collapse-badge" id="ratingAvg"></span>
                            </summary>
                            <div class="game-collapse-body" id="ratingRows"></div>
                        </details>

                        <dl class="meta-table">
                            <dt>System</dt>
                            <dd><span style="color:${game.system_color || '#7B2D8E'}">${H.escHtml(game.system_full_name || game.system_name)}</span></dd>
                            ${game.region ? `<dt>Region</dt><dd>${H.escHtml(game.region)}</dd>` : ''}
                            ${game.year ? `<dt>Year</dt><dd>${H.escHtml(game.year)}</dd>` : ''}
                            ${game.developer ? `<dt>Developer</dt><dd>${H.escHtml(game.developer)}</dd>` : ''}
                            ${game.publisher ? `<dt>Publisher</dt><dd>${H.escHtml(game.publisher)}</dd>` : ''}
                            ${game.genre ? `<dt>Genre</dt><dd>${H.escHtml(game.genre)}</dd>` : ''}
                            ${game.players ? `<dt>Players</dt><dd>${H.escHtml(game.players)}</dd>` : ''}
                            ${game.achievement_count ? `<dt>Achievements</dt><dd><a href="https://retroachievements.org/game/${game.ra_game_id}" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:none;">🏆 ${game.achievement_count}</a></dd>` : ''}
                            <dt>File Size</dt><dd>${H.formatBytes(game.size_bytes)}</dd>
                            <dt>Total Play Time</dt><dd>${H.formatDuration(game.total_play_time)}</dd>
                            <dt>Added</dt><dd>${H.timeAgo(game.added_at)}</dd>
                        </dl>


                        ${game.history && game.history.length > 0 ? `
                        <details class="game-collapse-section">
                            <summary class="game-collapse-header">
                                <span>Play History</span>
                                <span class="collapse-badge">${game.history.length} session${game.history.length !== 1 ? 's' : ''}</span>
                            </summary>
                            <div class="game-collapse-body">
                                <ul class="play-history-list">
                                    ${game.history.map(h => `
                                        <li>${H.timeAgo(h.started_at)} — ${H.formatDuration(h.duration_seconds)}</li>
                                    `).join('')}
                                </ul>
                            </div>
                        </details>
                        ` : ''}
                    </div>
                </div>

                ${(() => {
                    try {
                        const screens = game.screenshots ? JSON.parse(game.screenshots) : [];
                        if (screens.length) return `
                            <div class="game-screenshots">
                                <h4 class="screenshots-title">📸 Screenshots</h4>
                                <div class="screenshots-grid">
                                    ${screens.map(s => `<img src="${H.escHtml(s)}" alt="Screenshot" class="screenshot-thumb" loading="lazy" onclick="window.open('${H.escHtml(s)}','_blank')">`).join('')}
                                </div>
                            </div>`;
                    } catch {}
                    return '';
                })()}

                <!-- Game Intel — Bio & Guide tabs, loaded async -->
                <div id="game-intel-wrap" class="game-intel-wrap">
                    <div class="intel-spinner">🔍 Loading game intel…</div>
                </div>
            `;

            app.innerHTML = html;

            // Load star ratings + intel async
            this.loadRatings(game.id, players);
            this.loadIntel(game.id, game.title || game.clean_name || game.filename);
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Game Not Found</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    async toggleFav(id, fav) {
        try {
            await API.toggleFavorite(id, fav);
            fav ? SFX.coin() : SFX.uncoin();
            H.toast(fav ? 'Added to favorites' : 'Removed from favorites', 'success');
            this.render({ id });
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async togglePlayerFav(playerId, romId, btn) {
        try {
            const result = await API.togglePlayerFavorite(playerId, romId);
            btn.classList.toggle('active', result.favorited);
            result.favorited ? SFX.coin() : SFX.uncoin();
            const name = btn.querySelector('.player-fav-name').textContent;
            H.toast(result.favorited ? `Added to ${name}'s favorites` : `Removed from ${name}'s favorites`, 'success');
            arcade.loadPlayers();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async loadRatings(romId, players) {
        const container = document.getElementById('ratingRows');
        const avgEl = document.getElementById('ratingAvg');
        if (!container) return;

        try {
            const data = await API.getRatings(romId);
            const ratingMap = {};
            data.ratings.forEach(r => { ratingMap[r.player_id] = r.rating; });

            container.innerHTML = players.map(p => {
                const current = ratingMap[p.id] || 0;
                return `
                    <div class="star-rating-row">
                        <div class="star-rating-player">
                            <span style="color:${p.color}">${p.emoji}</span>
                            <span>${H.escHtml(p.name)}</span>
                        </div>
                        <div class="star-rating-stars">
                            ${[1, 2, 3, 4, 5].map(n => `
                                <button class="star-btn ${n <= current ? 'filled' : ''}"
                                        onclick="GameView.rate(${romId}, ${p.id}, ${n})"
                                        title="${n} star${n > 1 ? 's' : ''}">★</button>
                            `).join('')}
                        </div>
                    </div>
                `;
            }).join('');

            if (data.average) {
                avgEl.textContent = `Average: ${'★'.repeat(Math.round(data.average))}${'☆'.repeat(5 - Math.round(data.average))} (${data.average}/5 from ${data.count} rating${data.count !== 1 ? 's' : ''})`;
            }
        } catch {
            container.innerHTML = '<span style="color:var(--text-dim);font-size:12px;">Ratings unavailable</span>';
        }
    },

    async rate(romId, playerId, rating) {
        try {
            await API.setPlayerRating(romId, playerId, rating);
            SFX?.click();
            const players = arcade.players.length ? arcade.players : await API.players();
            this.loadRatings(romId, players);
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    // ── Game Intel ─────────────────────────────────────────────────────────────

    /** Minimal markdown → HTML renderer (no dependencies) */
    mdToHtml(md) {
        if (!md) return '';
        const inline = t => t
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g,     '<em>$1</em>')
            .replace(/`(.+?)`/g,       '<code>$1</code>');

        const lines = md.split('\n');
        let html = '';
        let inUl = false, inOl = false;

        const closeList = () => {
            if (inUl) { html += '</ul>'; inUl = false; }
            if (inOl) { html += '</ol>'; inOl = false; }
        };

        for (const raw of lines) {
            const line = raw.trimEnd();
            if      (line.startsWith('#### ')) { closeList(); html += `<h4>${inline(line.slice(5))}</h4>`; }
            else if (line.startsWith('### '))  { closeList(); html += `<h3>${inline(line.slice(4))}</h3>`; }
            else if (line.startsWith('## '))   { closeList(); html += `<h2>${inline(line.slice(3))}</h2>`; }
            else if (line.startsWith('# '))    { closeList(); html += `<h1>${inline(line.slice(2))}</h1>`; }
            else if (/^[*\-] /.test(line)) {
                if (inOl) { html += '</ol>'; inOl = false; }
                if (!inUl) { html += '<ul>'; inUl = true; }
                html += `<li>${inline(line.replace(/^[*\-] /, ''))}</li>`;
            }
            else if (/^\d+\. /.test(line)) {
                if (inUl) { html += '</ul>'; inUl = false; }
                if (!inOl) { html += '<ol>'; inOl = true; }
                html += `<li>${inline(line.replace(/^\d+\. /, ''))}</li>`;
            }
            else if (line.trim() === '') { closeList(); html += '<br>'; }
            else { closeList(); html += `<p>${inline(line)}</p>`; }
        }
        closeList();
        // Clean up stray <br> tags adjacent to block elements
        return html.replace(/<br>(<(?:h[1-4]|ul|ol|p))/g, '$1')
                   .replace(/(<\/(?:h[1-4]|ul|ol|p)>)<br>/g, '$1');
    },

    /** Render the full intel panel (tabs: Bio + Guide + Trivia + Moves) */
    renderIntelPanel(romId, gameTitle, intel) {
        const wrap = document.getElementById('game-intel-wrap');
        if (!wrap) return;

        const hasBio      = !!intel.bio;
        const hasGuide    = !!intel.guide;
        const hasTrivia   = !!intel.trivia;
        const hasMovelist = !!intel.movelist;

        const genBtn = (type, label) => `
            <div class="intel-empty-state">
                <div class="intel-empty-glow"></div>
                <div class="intel-empty-text">
                    <span class="intel-empty-title">No ${label} yet</span>
                    <span class="intel-empty-sub">Download one — takes about 15 seconds</span>
                </div>
                <button class="btn btn-yellow intel-gen-btn" onclick="GameView.generateIntel(${romId}, '${type}')">
                    ✨ Download ${label}
                </button>
            </div>`;

        const tabContent = (type, label, data) => {
            if (!data) return genBtn(type, label);
            const ts  = data.generated_at ? new Date(data.generated_at).toLocaleDateString() : '';
            const mdl = data.model ? data.model.split('-').slice(0,3).join('-') : '';
            return `
                <div class="intel-content">
                    ${this.mdToHtml(data.content_md)}
                    <div class="intel-footer">
                        <div class="intel-footer-meta">
                            ${mdl ? `<span class="intel-model">${mdl}</span>` : ''}
                            ${ts ? `<span class="intel-date">${ts}</span>` : ''}
                        </div>
                        <button class="intel-regen-btn" onclick="GameView.regenIntel(${romId}, '${type}')">↺ Re-download</button>
                    </div>
                </div>`;
        };

        const tabs = [
            { key: 'bio',      icon: '📖', label: 'Game Bio',        has: hasBio },
            { key: 'guide',    icon: '🕹️', label: 'Gameplay Guide',  has: hasGuide },
            { key: 'trivia',   icon: '🎯', label: 'Trivia',          has: hasTrivia },
            { key: 'movelist', icon: '⚔️', label: 'Moves & Combat',  has: hasMovelist },
        ];

        wrap.innerHTML = `
            <div class="game-intel-panel">
                <div class="intel-tabs">
                    ${tabs.map((t, i) => `
                        <button class="intel-tab ${t.has ? 'has-content' : ''} ${i === 0 ? 'active' : ''}" id="itab-${t.key}"
                                onclick="GameView.switchIntelTab('${t.key}')">
                            <span class="intel-tab-icon">${t.icon}</span>
                            <span class="intel-tab-label">${t.label}</span>
                            ${t.has ? '<span class="intel-tab-dot"></span>' : ''}
                        </button>`).join('')}
                </div>
                ${tabs.map((t, i) => `
                    <div class="intel-tab-body" id="intel-body-${t.key}" ${i > 0 ? 'style="display:none"' : ''}>
                        ${tabContent(t.key, t.label, intel[t.key])}
                    </div>`).join('')}
            </div>`;
    },

    switchIntelTab(tab) {
        const allTabs = ['bio', 'guide', 'trivia', 'movelist'];
        for (const t of allTabs) {
            document.getElementById(`intel-body-${t}`)?.style.setProperty('display', tab === t ? '' : 'none');
            document.getElementById(`itab-${t}`)?.classList.toggle('active', tab === t);
        }
    },

    async loadIntel(romId, gameTitle) {
        this._lastGameTitle = gameTitle;
        try {
            const intel = await API.gameIntel(romId);
            this.renderIntelPanel(romId, gameTitle, intel);
            this.updateHeroSummary(intel, romId);
        } catch {
            const wrap = document.getElementById('game-intel-wrap');
            if (wrap) wrap.innerHTML = '';
            this.updateHeroSummary(null, romId);
        }
    },

    /** Pull first 2 sentences from bio into the hero summary next to artwork */
    updateHeroSummary(intel, romId) {
        const el = document.getElementById('heroSummary');
        if (!el) return;
        const placeholder = el.querySelector('.hero-placeholder');
        if (!placeholder) return; // already has a real description from metadata

        if (intel?.bio?.content_md) {
            const lines = intel.bio.content_md.split('\n');
            const firstPara = lines.find(l => l.trim() && !l.startsWith('#') && !l.startsWith('-'));
            if (firstPara) {
                const sentences = firstPara.match(/[^.!?]+[.!?]+/g) || [firstPara];
                const excerpt = sentences.slice(0, 3).join('').trim();
                placeholder.classList.remove('hero-placeholder');
                placeholder.textContent = excerpt;
                return;
            }
        }
        // No bio — show generate prompt
        placeholder.classList.remove('hero-placeholder');
        placeholder.classList.add('hero-generate');
        placeholder.innerHTML = `<span class="hero-gen-text">No game summary yet</span>
            <button class="btn btn-yellow btn-sm hero-gen-btn" onclick="GameView.generateIntel(${romId}, 'bio')">✨ Download Bio</button>`;
    },

    async generateIntel(romId, type) {
        const wrap = document.getElementById('game-intel-wrap');
        if (!wrap) return;

        // Show spinner in the relevant tab body
        const bodyEl = document.getElementById(`intel-body-${type}`);
        if (bodyEl) bodyEl.innerHTML = `
            <div class="intel-generating">
                <div class="intel-gen-spinner"></div>
                <div class="intel-gen-msg">✨ Downloading ${{bio:'Game Bio',guide:'Gameplay Guide',trivia:'Trivia',movelist:'Moves & Combat'}[type]}…<br>
                    <small>This may take ~15–30 seconds</small></div>
            </div>`;

        try {
            await API.generateGameIntel(romId, type);
            SFX?.coin?.();
            const typeLabel = {bio:'📖 Bio',guide:'🕹️ Guide',trivia:'🎯 Trivia',movelist:'⚔️ Moves'}[type] || type;
            H.toast(`${typeLabel} downloaded!`, 'success');
            // Reload intel panel with new content
            const intel = await API.gameIntel(romId);
            this.renderIntelPanel(romId, this._lastGameTitle || '', intel);
            this.switchIntelTab(type);
        } catch (err) {
            H.toast(err.message || 'Download failed', 'error');
            if (bodyEl) bodyEl.innerHTML = `
                <div class="intel-empty-tab">
                    <div class="intel-empty-icon">⚠️</div>
                    <div class="intel-empty-msg">${H.escHtml(err.message)}</div>
                    <button class="btn btn-yellow intel-gen-btn" onclick="GameView.generateIntel(${romId}, '${type}')">
                        ↺ Try Again
                    </button>
                </div>`;
        }
    },

    async regenIntel(romId, type) {
        try {
            await API.deleteGameIntel(romId, type);
        } catch { /* ignore */ }
        await this.generateIntel(romId, type);
    },

    openReportModal(romId, title) {
        this._reportRomId = romId;
        document.getElementById('reportGameName').textContent = title;
        document.getElementById('reportDesc').value = '';
        document.getElementById('reportType').value = 'broken';
        document.getElementById('reportModal').style.display = 'flex';
    },

    async submitReport() {
        const romId = this._reportRomId;
        const type = document.getElementById('reportType').value;
        const description = document.getElementById('reportDesc').value.trim();
        const playerId = window.ArcadeEngine?.getActivePlayer()?.id;

        if (!playerId) { H.toast('Select a player first', 'error'); return; }

        try {
            await API.submitGameReport({ rom_id: romId, player_id: playerId, type, description });
            document.getElementById('reportModal').style.display = 'none';
            H.toast('Report submitted — thanks!', 'success');
        } catch (err) {
            H.toast(err.message || 'Report failed', 'error');
        }
    },
};
