/* Molly's World Arcade — Main App Controller — Level 4.0 EVOLVED */

// Shared mapping: original game ID → window global engine name
const ORIGINAL_GAME_MAP = {
    mollypop: 'MollyPop', tictacmae: 'TicTacMae', maetris: 'Maetris',
    maeteoroids: 'Maeteoroids', maekout: 'Maekout', flappymae: 'FlappyMae',
    pacmae: 'PacMae', mollypong: 'MollyPong', molliped: 'Molliped',
    mollycontrol: 'MollyControl',
};

window.arcade = {
    playSession: null,
    playStartTime: null,
    playRomId: null,
    players: [],

    init() {
        // Register routes
        Router.register('/', () => HomeView.render());
        Router.register('/library', () => LibraryView.render());
        Router.register('/systems', () => SystemsView.render());
        Router.register('/game/:id', (params) => GameView.render(params));
        Router.register('/archive', () => ArchiveView.render());
        Router.register('/mamedev', () => MamedevView.render());
        Router.register('/downloads', () => DownloadsView.render());
        Router.register('/settings', () => SettingsView.render());
        Router.register('/favorites', () => FavoritesView.render());
        Router.register('/player/:id', (params) => FavoritesView.renderPlayer(params));
        Router.register('/challenge', () => ChallengeView.render());
        Router.register('/scores', () => ScoresView.render());
        Router.register('/quiz', () => QuizView.render());
        Router.register('/customize', () => CustomizeView.render());
        Router.register('/cc', () => CommandCenterView.render());
        Router.register('/originals', () => OriginalsView.render());
        Router.register('/clans', () => ClansView.render());
        Router.register('/battles', () => ClanBattlesView.render());
        Router.register('/battles/profile/:id', (params) => ClanBattlesView.render({ id: params.id }));

        // V5 new features
        Router.register('/hall-of-fame', () => HallOfFameView.render());
        Router.register('/completion', () => CompletionView.render());
        Router.register('/recommendations', () => RecommendationsView.render());
        Router.register('/weekly', () => WeeklyView.render());
        Router.register('/stats', () => StatsView.render());
        Router.register('/trophies', () => TrophiesView.render());
        Router.register('/daily', () => DailyView.render());
        Router.register('/tournaments', () => TournamentsView.render());
        Router.register('/collections', () => CollectionsView.render());
        Router.register('/friends', () => FriendsView.render());
        Router.register('/speedrun', () => SpeedrunView.render());
        Router.register('/card/:id', (params) => PlayerCardView.render(params));

        // System detail
        Router.register('/system/:id', (params) => SystemDetailView.render(params));

        // Intel Hub
        Router.register('/intel', () => IntelHubView.render());

        // V6 Social Arcade
        Router.register('/chat', () => ChatView.render());
        Router.register('/messages', () => MessagesView.render());
        Router.register('/game-requests', () => GameRequestsView.render());
        Router.register('/ai', () => AISearchView.render());
        Router.register('/social', () => SocialHubView.render());

        // Arcade Gallery
        Router.register('/arcade-gallery', () => ArcadeGalleryView.render());

        // Retro Stars — Game Character Encyclopedia
        Router.register('/retro-stars', () => RetroStarsView.render());

        Router.start();
        this.loadSidebarStats();
        this.loadPlayers();
        this.bindSounds();

        // Prevent arrow key / space scrolling when game overlay is open
        document.addEventListener('keydown', (e) => {
            const overlay = document.getElementById('playerOverlay');
            if (overlay && overlay.style.display !== 'none') {
                if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space',' '].includes(e.key)) {
                    e.preventDefault();
                }
            }
        }, { capture: true }); // capture phase to intercept before anything else

        // V2: Initialize Arcade Engine (XP, achievements, attract mode)
        if (window.ArcadeEngine) ArcadeEngine.init();

        // V8: Initialize Cabinet Mode + Operator Menu
        if (window.CabinetMode) CabinetMode.init();

        // V5: Initialize notifications if active player exists
        const savedPlayer = localStorage.getItem('arcade_active_player');
        if (savedPlayer && window.NotificationManager) {
            NotificationManager.init(parseInt(savedPlayer));
        }

        // V5: Initialize sound mixer preferences
        if (window.SoundMixer) SoundMixer.init();
    },

    bindSounds() {
        // Nav link clicks
        document.addEventListener('click', (e) => {
            const link = e.target.closest('.nav-link, .quick-action-card');
            if (link) { SFX.click(); return; }

            const card = e.target.closest('.game-card');
            if (card) { SFX.click(); return; }

            const btn = e.target.closest('.btn');
            if (btn) { SFX.click(); return; }
        });
    },

    async loadPlayers() {
        try {
            const clanData = await API.clans();
            this.players = clanData.players;
            const container = document.getElementById('playerNavLinks');
            if (!container) return;

            let html = '';
            for (const clan of clanData.clans) {
                if (clan.players.length === 0 && clan.id === 0) continue; // skip empty unassigned
                html += `<div class="nav-clan-label" style="color:${clan.color}">${clan.emoji} ${H.escHtml(clan.name)}</div>`;
                for (const p of clan.players) {
                    html += `
                        <a href="#/player/${p.id}" class="nav-link" data-view="player-${p.id}">
                            <span class="nav-icon">${p.emoji}</span>
                            <span class="nav-label">${H.escHtml(p.name)}</span>
                            ${p.fav_count > 0 ? `<span class="nav-badge" style="background:${p.color}22;color:${p.color}">${p.fav_count}</span>` : ''}
                        </a>
                    `;
                }
            }
            // Manage link
            html += `
                <a href="#/clans" class="nav-link" data-view="clans" style="margin-top:4px;opacity:0.7;">
                    <span class="nav-icon">⚔️</span>
                    <span class="nav-label">Manage Clans</span>
                </a>
            `;
            container.innerHTML = html;
        } catch (e) {
            // Fallback: flat player list
            try {
                this.players = await API.players();
                const container = document.getElementById('playerNavLinks');
                if (!container) return;
                container.innerHTML = this.players.map(p => `
                    <a href="#/player/${p.id}" class="nav-link" data-view="player-${p.id}">
                        <span class="nav-icon">${p.emoji}</span>
                        <span class="nav-label">${H.escHtml(p.name)}</span>
                        ${p.fav_count > 0 ? `<span class="nav-badge" style="background:${p.color}22;color:${p.color}">${p.fav_count}</span>` : ''}
                    </a>
                `).join('');
            } catch (e2) { /* silent */ }
        }
    },

    async loadSidebarStats() {
        try {
            const data = await API.library({ limit: 1 });
            const el = document.getElementById('sidebarStats');
            if (el) el.textContent = `${data.total} games loaded`;
            // Update game count badge
            const badge = document.getElementById('gameCountBadge');
            if (badge) badge.textContent = data.total;
        } catch (e) { /* silent */ }
    },

    // ── Play Random Game ──
    async playRandomGame() {
        try {
            const game = await API.randomGame();
            if (game && game.id) {
                this.playGame(game.id);
            } else {
                H.toast('No games found!', 'error');
            }
        } catch (err) {
            H.toast('Failed to pick random game: ' + err.message, 'error');
        }
    },

    // ── ROM Scanner ──
    async startScan() {
        const modal = document.getElementById('scanModal');
        const progress = document.getElementById('scanProgress');
        const status = document.getElementById('scanStatus');
        const stats = document.getElementById('scanStats');
        const scanBtn = document.getElementById('scanBtn');

        modal.style.display = '';
        scanBtn.classList.add('scanning');

        try {
            await API.startScan();

            // Poll scan status
            const poll = setInterval(async () => {
                try {
                    const s = await API.scanStatus();

                    if (s.total > 0) {
                        const pct = Math.round((s.processed / s.total) * 100);
                        progress.style.width = pct + '%';
                        status.textContent = s.current || 'Scanning...';
                        stats.textContent = `${s.processed} / ${s.total} files processed — ${s.newRoms || 0} new ROMs found`;
                    }

                    if (!s.scanning) {
                        clearInterval(poll);
                        progress.style.width = '100%';
                        status.textContent = 'Scan complete!';
                        stats.textContent = `Found ${s.newRoms || 0} new ROMs (${s.processed || 0} files processed)`;
                        scanBtn.classList.remove('scanning');

                        setTimeout(() => {
                            modal.style.display = 'none';
                            progress.style.width = '0%';
                            this.loadSidebarStats();

                            // Refresh current view
                            if (Router.current === '/') HomeView.render();
                            else if (Router.current === '/library') LibraryView.render();
                            else if (Router.current === '/systems') SystemsView.render();

                            H.toast(`Scan complete! ${s.newRoms || 0} new ROMs found.`, 'success');
                        }, 1500);
                    }
                } catch (e) {
                    console.error('Poll error:', e);
                }
            }, 800);
        } catch (err) {
            modal.style.display = 'none';
            scanBtn.classList.remove('scanning');
            H.toast('Scan failed: ' + err.message, 'error');
        }
    },

    // ── EmulatorJS Player (iframe-based for clean JS environment) ──
    async playGame(romId) {
        SFX.launch();
        const overlay = document.getElementById('playerOverlay');
        const titleEl = document.getElementById('playerTitle');
        const container = document.getElementById('emulator-container');

        // Dismiss attract mode if active
        const attractEl = document.getElementById('attractOverlay');
        if (attractEl) attractEl.remove();

        try {
            const config = await API.playerConfig(romId);
            titleEl.textContent = config.gameName;

            // Log play start (with player_id for progression tracking)
            const activePlayer = window.ArcadeEngine?.getActivePlayer();
            const session = await API.logPlay(romId, 'start', null, null, activePlayer?.id);
            this.playSession = session.session_id;
            this.playStartTime = Date.now();
            this.playRomId = romId;

            // Remove any previous iframe
            const oldIframe = document.getElementById('ejs-iframe');
            if (oldIframe) oldIframe.remove();

            // Build BIOS/parent config lines (inline, not separate script tag)
            // Use cache-busting + EJS_externalFiles for explicit BIOS placement in virtual FS
            const biosLines = [];
            const cacheBust = Date.now();
            if (config.biosUrl) {
                const biosUrlCB = config.biosUrl + '?v=' + cacheBust;
                biosLines.push(`EJS_biosUrl = '${biosUrlCB}';`);
                // Explicit virtual filesystem placement — extracts zip into /system/
                biosLines.push(`EJS_externalFiles = { '/system/': '${biosUrlCB}' };`);
            }
            if (config.gameParentUrl) {
                biosLines.push(`EJS_gameParentUrl = '${config.gameParentUrl}?v=${cacheBust}';`);
            }
            const biosConfig = biosLines.join('\n    ');

            // For MAME/arcade cores, set the game name to the ROM shortname
            // Also disable threads for MAME to avoid WASM function signature mismatch crash
            const isMame = ['mame2003', 'mame2003_plus', 'fbneo'].includes(config.core);
            const gameNameTag = isMame && config.filename
                ? `EJS_gameName = '${config.filename.replace('.zip', '')}';\n    EJS_threads = false;`
                : '';

            // PSP (PPSSPP) core requires SharedArrayBuffer / threads support
            const pspThreadsTag = config.core === 'ppsspp' ? 'EJS_threads = true;' : '';

            // Per-system BIOS-missing handler — show toast and build HLE options
            if (config.biosMissing) {
                if (config.core === 'handy') {
                    // Lynx: Handy has NO HLE mode — hard fail gracefully
                    H.toast(`⚠️ Atari Lynx needs lynxboot.img in roms/lynx/ to play`, 'error');
                    return;
                }
            }

            // Per-system extra core options
            const sysOptions = {};
            // Saturn: enable HLE BIOS so games boot without saturn_bios.bin
            if (config.core === 'yabause') {
                sysOptions['yabause_hle_bios'] = 'enabled';
            }
            const sysOptStr = Object.entries(sysOptions).map(([k, v]) => `'${k}': '${v}',`).join('\n        ');

            // V2: Check CRT shader preference
            const crtPref = localStorage.getItem('arcade_crt_shader') || '';

            // Sanitize values for safe JS string interpolation in iframe
            const safeStr = s => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/<\//g, '<\\/');
            const safeCore = safeStr(config.core);
            const safeGameUrl = safeStr(config.gameUrl);
            const safeColor = safeStr(config.color || '#7B2D8E');

            const iframeHTML = `<!DOCTYPE html>
<html><head><style>
    body { margin: 0; background: #000; overflow: hidden; }
    #game { width: 100%; height: 100vh; }
</style></head><body>
<div id="game"></div>
<script>
    EJS_player = '#game';
    EJS_core = '${safeCore}';
    EJS_gameUrl = '${safeGameUrl}';
    EJS_pathtodata = '/data/';
    EJS_color = '${safeColor}';
    EJS_startOnLoaded = true;
    ${gameNameTag}
    ${pspThreadsTag}
    ${biosConfig}

    // ═══ V2 SUPER POWERS ═══
    EJS_defaultOptions = {
        'rewindEnabled': 'enabled',
        'rewindGranularity': '6',
        'Fast Forward Ratio': '3.0',
        'save-state-location': 'browser',
        ${sysOptStr}
        ${crtPref ? "'shader': '" + crtPref + "'," : ''}
    };
    EJS_fixedSaveInterval = 30000;
<\/script>
<script src="/data/loader.js"><\/script>
</body></html>`;

            const iframe = document.createElement('iframe');
            iframe.id = 'ejs-iframe';
            iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
            iframe.allow = 'autoplay; gamepad; cross-origin-isolated';
            container.innerHTML = '';
            container.appendChild(iframe);

            // Write HTML into iframe
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            doc.open();
            doc.write(iframeHTML);
            doc.close();

            overlay.style.display = '';
            document.body.style.overflow = 'hidden';

            // Focus iframe so keyboard events reach EmulatorJS
            iframe.focus();
            setTimeout(() => { iframe.focus(); iframe.contentWindow?.focus(); }, 300);
            setTimeout(() => { iframe.focus(); iframe.contentWindow?.focus(); }, 1000);
            // Re-focus on click anywhere in overlay (use named handler to avoid leak)
            if (!overlay._ejsFocusHandler) {
                overlay._ejsFocusHandler = () => {
                    const ejs = document.getElementById('ejs-iframe');
                    if (ejs) { ejs.focus(); ejs.contentWindow?.focus(); }
                };
                overlay.addEventListener('click', overlay._ejsFocusHandler);
            }

        } catch (err) {
            H.toast('Failed to load game: ' + err.message, 'error');
        }
    },

    async exitPlayer() {
        const overlay = document.getElementById('playerOverlay');
        overlay.style.display = 'none';
        document.body.style.overflow = '';

        // Log play end + award XP + show post-game modal
        if (this.playSession) {
            const duration = Math.round((Date.now() - this.playStartTime) / 1000);
            const romId = this.playRomId;
            const gameName = document.getElementById('playerTitle')?.textContent || 'Game';

            try {
                await API.logPlay(null, 'end', this.playSession, duration);
            } catch (e) { /* silent */ }

            // V2: Award XP for playing (after overlay closes so animations show)
            if (window.ArcadeEngine && duration >= 10) {
                setTimeout(() => {
                    ArcadeEngine.award('play', romId, { duration });
                    ArcadeEngine.updateSidebarXP();
                }, 500);
            }

            // V5: Show post-game score/rating modal (after 30+ seconds of play)
            if (window.PostGame && duration >= 30) {
                const gameData = await API.game(romId).catch(() => null);
                const isFavorite = !!gameData?.is_favorite;
                setTimeout(() => PostGame.show(romId, gameName, duration, { isFavorite }), 600);
            }

            this.playSession = null;
            this.playStartTime = null;
            this.playRomId = null;
        }

        // Just remove the iframe — clean destruction, no globals to clean up
        const iframe = document.getElementById('ejs-iframe');
        if (iframe) iframe.remove();

        const container = document.getElementById('emulator-container');
        container.innerHTML = '<div id="game"></div>';
    },

    // ── Arcade Originals Player (Canvas-based HTML5 games) ──
    async playOriginal(gameId) {
        SFX.launch();
        const overlay = document.getElementById('playerOverlay');
        const titleEl = document.getElementById('playerTitle');
        const container = document.getElementById('emulator-container');

        try {
            const games = await API.originals();
            const game = games.find(g => g.id === gameId);
            if (!game) throw new Error('Game not found');

            // Use themed game name if player has a theme
            const activeP = window.ArcadeEngine?.getActivePlayer();
            const pTheme = activeP?.theme || 'retro';
            const pName = activeP?.name || '';
            if (pName && typeof ArcadeThemes !== 'undefined') {
                titleEl.textContent = ArcadeThemes.gameName(pName, pTheme, gameId);
            } else {
                titleEl.textContent = game.name;
            }

            // Dismiss attract mode if active
            const attractEl = document.getElementById('attractOverlay');
            if (attractEl) attractEl.remove();

            // Remove any previous content
            const oldIframe = document.getElementById('ejs-iframe');
            if (oldIframe) oldIframe.remove();

            // Create game area with controls sidebar
            container.innerHTML = '';

            // Controls data per game
            const CONTROLS = {
                mollypop:     [['Click / Tap', 'Pop blocks']],
                tictacmae:    [['Click / Tap', 'Place piece'], ['Numpad 1-9', 'Place (keyboard)']],
                maetris:      [['← →', 'Move piece'], ['↑', 'Rotate'], ['↓', 'Soft drop'], ['P', 'Pause']],
                maeteoroids:  [['← →', 'Rotate ship'], ['↑', 'Thrust'], ['Space', 'Fire'], ['↓', 'Hyperspace']],
                maekout:      [['← → / Mouse', 'Move paddle'], ['Space', 'Launch ball']],
                flappymae:    [['Space / Click', 'Flap']],
                pacmae:       [['Arrow Keys', 'Move Pac-Mae'], ['Swipe', 'Move (touch)']],
                mollypong:    [['← → / Mouse', 'Move paddle'], ['Space', 'Launch ball']],
                molliped:     [['Arrow Keys', 'Move ship'], ['W A S D', 'Move (alt)'], ['Space', 'Fire'], ['Mouse', 'Aim & fire']],
                mollycontrol: [['Click / Tap', 'Launch missile'], ['1 2 3', 'Select battery'], ['Space', 'Start game']],
            };
            const keys = CONTROLS[gameId] || [];

            // Build controls panel HTML
            const controlsHTML = keys.length ? `
                <div class="og-controls-panel" id="ogControlsPanel">
                    <div class="og-controls-title">CONTROLS</div>
                    ${keys.map(([key, action]) => `
                        <div class="og-control-row">
                            <kbd class="og-key">${key}</kbd>
                            <span class="og-action">${action}</span>
                        </div>
                    `).join('')}
                </div>
            ` : '';

            const canvas = document.createElement('canvas');
            canvas.id = 'original-game-canvas';
            canvas.style.cssText = 'display:block;background:#0F1117;';

            // Wrapper: canvas centered + controls on the side
            const wrapper = document.createElement('div');
            wrapper.className = 'og-game-wrapper';
            wrapper.appendChild(canvas);
            wrapper.insertAdjacentHTML('beforeend', controlsHTML);
            container.appendChild(wrapper);

            overlay.style.display = '';
            document.body.style.overflow = 'hidden';

            // Ensure keyboard events reach the game — focus the overlay
            overlay.setAttribute('tabindex', '-1');
            overlay.focus();
            canvas.setAttribute('tabindex', '0');
            canvas.focus();

            // Get active player
            const activePlayer = window.ArcadeEngine?.getActivePlayer();
            this.playStartTime = Date.now();
            this._originalGameId = gameId;

            // Initialize game — dynamic loader for all originals
            const engineName = ORIGINAL_GAME_MAP[gameId];
            const engine = engineName && window[engineName];
            if (engine && engine.init) {
                // Delay init to ensure flex layout has computed container height
                // Single rAF isn't enough — use double rAF + fallback timeout
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                // Extra safety: if container still has no height, wait a bit more
                const wrap = document.querySelector('.og-game-wrapper');
                if (wrap && wrap.clientHeight < 50) {
                    await new Promise(r => setTimeout(r, 150));
                }
                // Set canvas pixel dimensions from container BEFORE init
                // Games read canvas.width/height at startup — defaults are 300×150 which breaks aspect ratios
                const panel = document.getElementById('ogControlsPanel');
                const canvasW = Math.max(320, (wrap ? wrap.clientWidth : 480) - (panel ? panel.offsetWidth : 0));
                const canvasH = Math.max(400, wrap ? wrap.clientHeight : 640);
                canvas.width = canvasW;
                canvas.height = canvasH;

                engine.init(canvas, activePlayer, (result) => {
                    this.showOriginalGameOver(result, game);
                });

                // After init, fit canvas to wrapper preserving aspect ratio
                const fitCanvas = () => {
                    const wrap = document.querySelector('.og-game-wrapper');
                    const cv = document.getElementById('original-game-canvas');
                    const panel = document.getElementById('ogControlsPanel');
                    if (!wrap || !cv) return;
                    const cw = wrap.clientWidth - (panel ? panel.offsetWidth : 0);
                    const ch = wrap.clientHeight;
                    const gameW = cv.width || 480;
                    const gameH = cv.height || 640;
                    const aspect = gameW / gameH;
                    let drawW, drawH;
                    if (cw / ch > aspect) {
                        drawH = ch;
                        drawW = Math.floor(ch * aspect);
                    } else {
                        drawW = cw;
                        drawH = Math.floor(cw / aspect);
                    }
                    cv.style.width = drawW + 'px';
                    cv.style.height = drawH + 'px';
                };
                requestAnimationFrame(fitCanvas);
                // Also re-fit on resize and after a short delay for safety
                this._originalResizeHandler = fitCanvas;
                window.addEventListener('resize', fitCanvas);
                setTimeout(fitCanvas, 100);

                // Re-focus canvas after init so keyboard events work immediately
                setTimeout(() => { canvas.focus(); }, 200);
            } else {
                H.toast(`Game engine "${gameId}" not loaded yet`, 'error');
            }
        } catch (err) {
            H.toast('Failed to load game: ' + err.message, 'error');
        }
    },

    showOriginalGameOver(result, game) {
        // Delegated to MollyPopsReward module (mollypops-reward.js)
        const gameId = this._originalGameId;
        MollyPopsReward.show(result, game, (res, popsEarned) => {
            if (window.ArcadeEngine && (res.duration || 0) >= 10) {
                ArcadeEngine.award('play_original', gameId, {
                    score: res.score, level: res.level,
                    duration: res.duration, mollypops: popsEarned,
                });
                ArcadeEngine.updateSidebarXP();
            }
        });
    },

    _getOriginalEngine() {
        const name = ORIGINAL_GAME_MAP[this._originalGameId];
        return name ? window[name] : null;
    },

    restartOriginal() {
        const container = document.getElementById('emulator-container');
        const go = container.querySelector('.original-gameover');
        if (go) go.remove();

        // Destroy old game engine
        const engine = this._getOriginalEngine();
        if (engine?.destroy) engine.destroy();

        // Restart same game
        const canvas = document.getElementById('original-game-canvas');
        if (canvas && engine?.init) {
            const activePlayer = window.ArcadeEngine?.getActivePlayer();
            this.playStartTime = Date.now();
            engine.init(canvas, activePlayer, (result) => {
                const game = { id: this._originalGameId, name: document.getElementById('playerTitle')?.textContent || '' };
                this.showOriginalGameOver(result, game);
            });
        }
    },

    exitOriginal() {
        const overlay = document.getElementById('playerOverlay');
        overlay.style.display = 'none';
        document.body.style.overflow = '';

        // Destroy active game engine
        const engine = this._getOriginalEngine();
        if (engine?.destroy) engine.destroy();

        // Clean up resize handler
        if (this._originalResizeHandler) {
            window.removeEventListener('resize', this._originalResizeHandler);
            this._originalResizeHandler = null;
        }

        const container = document.getElementById('emulator-container');
        container.innerHTML = '<div id="game"></div>';

        this._originalGameId = null;
        this.playStartTime = null;
    },

    toggleFullscreen() {
        const container = document.getElementById('playerOverlay');
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            container.requestFullscreen().catch(() => {});
        }
    },
};

// Boot
document.addEventListener('DOMContentLoaded', () => arcade.init());
