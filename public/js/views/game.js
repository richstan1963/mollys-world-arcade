/* Game Detail View — Full game info with play button + per-player favorites */
window.GameView = {
    async render(params) {
        const app = document.getElementById('app');
        const id = params.id || params[0];
        app.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const game = await API.game(id);
            const art = H.artworkSrc(game);
            const title = H.escHtml(game.title || game.clean_name || game.filename);

            // Fetch all players and their fav status for this game
            const players = arcade.players.length ? arcade.players : await API.players();
            const favChecks = await Promise.all(
                players.map(p => API.isPlayerFavorite(p.id, game.id).then(r => ({ ...p, isFav: r.favorited })))
            );

            // ─── Desktop Mode detection ──────────────────────────────────────────
            const DESKTOP_INFO = {
                psx:       { emulator: 'DuckStation', quality: '4K/60fps'  },
                ps2:       { emulator: 'PCSX2',       quality: '4K/60fps'  },
                gamecube:  { emulator: 'Dolphin',     quality: '4K/60fps'  },
                wii:       { emulator: 'Dolphin',     quality: '4K/60fps'  },
                dreamcast: { emulator: 'Flycast',     quality: '4K/60fps'  },
                xbox:      { emulator: 'Xemu',        quality: '4K/60fps'  },
                wiiu:      { emulator: 'Cemu',        quality: '4K/60fps'  },
            };
            const isNative = game.core === 'native' || game.core === 'flycast';
            const deskInfo = isNative
                ? (DESKTOP_INFO[game.system_id] || { emulator: 'Native', quality: '4K' })
                : null;

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
                            ${game.publisher ? `<span class="game-maker-tag">by ${H.escHtml(game.publisher)}</span>` : ''}
                        </div>

                        ${(game.year || game.genre || game.players || game.region) ? `
                        <div class="game-fun-pills">
                            ${game.year ? `<span class="fun-pill">📅 ${H.escHtml(game.year)}</span>` : ''}
                            ${game.genre ? `<span class="fun-pill">🕹️ ${H.escHtml(game.genre)}</span>` : ''}
                            ${game.players ? `<span class="fun-pill">👥 ${H.escHtml(game.players)}</span>` : ''}
                            ${game.region ? `<span class="fun-pill">🌍 ${H.escHtml(game.region)}</span>` : ''}
                        </div>` : ''}

                        ${game.description ? `
                        <div class="game-summary-box">
                            <div class="game-summary-label">📖 The Story</div>
                            <div class="game-summary-text">${H.escHtml(game.description)}</div>
                        </div>` : ''}

                        <div class="game-trivia-box">
                            <div class="game-trivia-header">⚡ Did You Know?</div>
                            <div class="game-trivia-items">
                                ${game.year ? `<div class="trivia-item">📅 Released in <strong>${H.escHtml(game.year)}</strong>${getEraQuip(game.year)}</div>` : ''}
                                ${game.total_play_time > 3600 ? `<div class="trivia-item">🔥 Arcade legends have burned through <strong>${H.formatDuration(game.total_play_time)}</strong> on this one!</div>` : game.total_play_time > 0 ? `<div class="trivia-item">🕹️ Logged <strong>${H.formatDuration(game.total_play_time)}</strong> here so far — keep it going!</div>` : `<div class="trivia-item">🚀 No one has played this yet — <strong>be the first legend!</strong></div>`}
                                ${game.history && game.history.length > 0 ? `<div class="trivia-item">🏆 Played <strong>${game.history.length} time${game.history.length !== 1 ? 's' : ''}</strong> in this arcade</div>` : ''}
                                ${game.size_bytes > 209715200 ? `<div class="trivia-item">💾 A chunky <strong>${H.formatBytes(game.size_bytes)}</strong> of gaming goodness</div>` : ''}
                            </div>
                        </div>

                        <div class="game-detail-actions">
                            ${isNative ? `
                            <div class="dm-detail-wrap">
                                <div class="dm-detail-mode-label">🖥️ DESKTOP MODE</div>
                                <button class="dm-detail-btn" onclick="window.arcade.playGame(${game.id})">
                                    <span class="dm-detail-btn-icon">🚀</span>
                                    <span class="dm-detail-btn-main">Launch in ${deskInfo.emulator}</span>
                                    <span class="dm-detail-btn-quality">${deskInfo.quality}</span>
                                </button>
                            </div>` : `
                            <button class="btn btn-yellow btn-lg" onclick="window.arcade.playGame(${game.id})">
                                ▶ Play Now
                            </button>`}
                            <button class="btn btn-ghost" id="favBtn" onclick="GameView.toggleFav(${game.id}, ${game.is_favorite ? 'false' : 'true'})">
                                ${game.is_favorite ? '⭐ Favorited' : '☆ Favorite'}
                            </button>
                            <button class="btn btn-ghost btn-sm" onclick="API.fetchArtwork(${game.id}).then(r => { H.toast('Artwork updated', 'success'); GameView.render({id:${game.id}}); }).catch(e => H.toast(e.message, 'error'))">
                                🖼️ Fetch Art
                            </button>
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

                        <!-- Per-player favorite toggles -->
                        <div class="player-fav-section">
                            <div class="player-fav-label">Add to favorites:</div>
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

                        <!-- Star Ratings -->
                        <div class="star-rating-section">
                            <div class="star-rating-label">Rate this game:</div>
                            <div id="ratingRows"></div>
                            <div class="star-rating-avg" id="ratingAvg"></div>
                        </div>

                        <dl class="meta-table">
                            <dt>System</dt>
                            <dd><span style="color:${game.system_color || '#7B2D8E'}">${H.escHtml(game.system_full_name || game.system_name)}</span>${isNative ? ' <span class="dm-native-tag">NATIVE</span>' : ''}</dd>
                            ${isNative ? `<dt>Emulator</dt><dd><span class="dm-meta-emu">${deskInfo.emulator}</span> <span class="dm-meta-quality">${deskInfo.quality}</span></dd>` : ''}
                            ${game.region ? `<dt>Region</dt><dd>${H.escHtml(game.region)}</dd>` : ''}
                            ${game.year ? `<dt>Year</dt><dd>${H.escHtml(game.year)}</dd>` : ''}
                            ${game.publisher ? `<dt>Publisher</dt><dd>${H.escHtml(game.publisher)}</dd>` : ''}
                            ${game.genre ? `<dt>Genre</dt><dd>${H.escHtml(game.genre)}</dd>` : ''}
                            ${game.players ? `<dt>Players</dt><dd>${H.escHtml(game.players)}</dd>` : ''}
                            <dt>File Size</dt><dd>${H.formatBytes(game.size_bytes)}</dd>
                            <dt>Total Play Time</dt><dd>${H.formatDuration(game.total_play_time)}</dd>
                            <dt>Added</dt><dd>${H.timeAgo(game.added_at)}</dd>
                        </dl>


                        ${game.history && game.history.length > 0 ? `
                            <div class="play-history">
                                <h4>Play History</h4>
                                <ul class="play-history-list">
                                    ${game.history.map(h => `
                                        <li>${H.timeAgo(h.started_at)} — ${H.formatDuration(h.duration_seconds)}</li>
                                    `).join('')}
                                </ul>
                            </div>
                        ` : ''}
                    </div>
                </div>

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

    /** Render the full intel panel (tabs: Bio + Guide) */
    renderIntelPanel(romId, gameTitle, intel) {
        const wrap = document.getElementById('game-intel-wrap');
        if (!wrap) return;

        const hasBio   = !!intel.bio;
        const hasGuide = !!intel.guide;

        const genBtn = (type, label, icon) => `
            <div class="intel-empty-tab">
                <div class="intel-empty-icon">${icon}</div>
                <div class="intel-empty-msg">No ${label} generated yet</div>
                <button class="btn btn-yellow intel-gen-btn" onclick="GameView.generateIntel(${romId}, '${type}')">
                    ✨ Generate ${label}
                </button>
            </div>`;

        const tabContent = (type, icon, label, data) => {
            if (!data) return genBtn(type, label, icon);
            const ts  = data.generated_at ? new Date(data.generated_at).toLocaleDateString() : '';
            const mdl = data.model ? `<span class="intel-model">${data.model.split('-').slice(0,3).join('-')}</span>` : '';
            return `
                <div class="intel-content">
                    ${this.mdToHtml(data.content_md)}
                    <div class="intel-footer">
                        ${mdl}
                        ${ts ? `<span class="intel-date">Generated ${ts}</span>` : ''}
                        <button class="btn-ghost-xs" onclick="GameView.regenIntel(${romId}, '${type}')">↺ Regenerate</button>
                    </div>
                </div>`;
        };

        wrap.innerHTML = `
            <div class="game-intel-panel">
                <div class="intel-header">
                    <span class="intel-header-icon">🎮</span>
                    <span class="intel-header-title">Game Encyclopedia</span>
                    <span class="intel-header-sub">${H.escHtml(gameTitle)}</span>
                </div>
                <div class="intel-tabs">
                    <button class="intel-tab ${hasBio ? 'has-content' : ''} active" id="itab-bio"
                            onclick="GameView.switchIntelTab('bio')">
                        📖 Game Bio ${hasBio ? '' : '<span class="intel-tab-new">NEW</span>'}
                    </button>
                    <button class="intel-tab ${hasGuide ? 'has-content' : ''}" id="itab-guide"
                            onclick="GameView.switchIntelTab('guide')">
                        🕹️ Gameplay Guide ${hasGuide ? '' : '<span class="intel-tab-new">NEW</span>'}
                    </button>
                </div>
                <div class="intel-tab-body" id="intel-body-bio">
                    ${tabContent('bio',   '📖', 'Game Bio',       intel.bio)}
                </div>
                <div class="intel-tab-body" id="intel-body-guide" style="display:none">
                    ${tabContent('guide', '🕹️', 'Gameplay Guide', intel.guide)}
                </div>
            </div>`;
    },

    switchIntelTab(tab) {
        document.getElementById('intel-body-bio')  ?.style.setProperty('display', tab === 'bio'   ? '' : 'none');
        document.getElementById('intel-body-guide')?.style.setProperty('display', tab === 'guide' ? '' : 'none');
        document.getElementById('itab-bio')  ?.classList.toggle('active', tab === 'bio');
        document.getElementById('itab-guide')?.classList.toggle('active', tab === 'guide');
    },

    async loadIntel(romId, gameTitle) {
        this._lastGameTitle = gameTitle;
        try {
            const intel = await API.gameIntel(romId);
            this.renderIntelPanel(romId, gameTitle, intel);
        } catch {
            const wrap = document.getElementById('game-intel-wrap');
            if (wrap) wrap.innerHTML = ''; // silently hide on error
        }
    },

    async generateIntel(romId, type) {
        const wrap = document.getElementById('game-intel-wrap');
        if (!wrap) return;

        // Show spinner in the relevant tab body
        const bodyEl = document.getElementById(`intel-body-${type}`);
        if (bodyEl) bodyEl.innerHTML = `
            <div class="intel-generating">
                <div class="intel-gen-spinner"></div>
                <div class="intel-gen-msg">✨ Generating ${type === 'bio' ? 'Game Bio' : 'Gameplay Guide'} with AI…<br>
                    <small>This takes ~15–30 seconds</small></div>
            </div>`;

        try {
            await API.generateGameIntel(romId, type);
            SFX?.coin?.();
            H.toast(`${type === 'bio' ? '📖 Bio' : '🕹️ Guide'} generated!`, 'success');
            // Reload intel panel with new content
            const intel = await API.gameIntel(romId);
            this.renderIntelPanel(romId, this._lastGameTitle || '', intel);
            this.switchIntelTab(type);
        } catch (err) {
            H.toast(err.message || 'Generation failed', 'error');
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
