/* Settings View — Scan paths, toggles, app config */
window.SettingsView = {
    async render() {
        const app = document.getElementById('app');
        app.innerHTML = '<div class="loading">Loading...</div>';

        try {
            const [{ settings, scanPaths }, tunnelInfo, systemsList] = await Promise.all([
                API.getSettings(),
                API.get('/api/tunnel').catch(() => ({ url: null, running: false, type: null })),
                API.get('/api/systems').catch(() => []),
            ]);

            let html = `
                <div class="page-header">
                    <h1 class="page-title">Settings</h1>
                    <p class="page-subtitle">Configure your arcade experience</p>
                </div>

                <!-- ROM Scan Paths -->
                <div class="settings-section">
                    <h3>📁 ROM Directories</h3>
                    <p style="font-size:12px;color:var(--text-dim);margin-bottom:12px;">Add folders containing your ROM files. Subdirectories are scanned automatically.</p>

                    <ul class="scan-paths-list">
                        ${scanPaths.map(sp => `
                            <li class="scan-path-item">
                                <span class="path">${H.escHtml(sp.path)}</span>
                                ${sp.system_id ? `<span class="system-tag">${H.escHtml(sp.system_id)}</span>` : ''}
                                <span style="font-size:11px;color:var(--text-muted)">${sp.rom_count || 0} ROMs</span>
                                <button class="btn btn-xs btn-danger" onclick="SettingsView.removePath(${sp.id})">✕</button>
                            </li>
                        `).join('')}
                        ${scanPaths.length === 0 ? '<li style="font-size:13px;color:var(--text-dim);padding:8px 0;">No scan paths configured. Add a folder below.</li>' : ''}
                    </ul>

                    <div class="add-path-form">
                        <input type="text" id="newPath" placeholder="/path/to/roms">
                        <select id="newPathSystem" style="width:140px;">
                            <option value="">Auto-detect</option>
                        </select>
                        <button class="btn btn-sm btn-teal" onclick="SettingsView.addPath()">+ Add</button>
                    </div>
                </div>

                <!-- Display Settings -->
                <div class="settings-section">
                    <h3>🎨 Display</h3>
                    <div class="setting-row">
                        <div class="setting-label">
                            CRT Scanlines
                            <small>Overlay retro scanline effect</small>
                        </div>
                        <div class="toggle ${settings.crt_scanlines === 'true' ? 'on' : ''}"
                             onclick="SettingsView.toggleSetting('crt_scanlines', this)"></div>
                    </div>
                    <div class="setting-row">
                        <div class="setting-label">
                            Sound Effects
                            <small>UI interaction sounds</small>
                        </div>
                        <div class="toggle ${settings.sound_effects === 'true' ? 'on' : ''}"
                             onclick="SettingsView.toggleSetting('sound_effects', this)"></div>
                    </div>
                </div>

                <!-- Remote Access -->
                <div class="settings-section">
                    <h3>🌐 Remote Access</h3>
                    <p style="font-size:12px;color:var(--text-dim);margin-bottom:14px;">
                        Play from anywhere in the world — free via Cloudflare Tunnel. No account or domain needed.
                    </p>
                    ${tunnelInfo.url ? `
                        <div class="tunnel-card tunnel-online">
                            <div class="tunnel-status-dot"></div>
                            <div class="tunnel-info">
                                <div class="tunnel-label">${tunnelInfo.type === 'quick' ? '⚡ Quick Tunnel (free, URL changes on restart)' : tunnelInfo.type === 'named' ? '🔒 Named Tunnel (permanent URL)' : '🌐 Custom Domain'}</div>
                                <a class="tunnel-url" href="${H.escHtml(tunnelInfo.url)}" target="_blank">${H.escHtml(tunnelInfo.url)}</a>
                                ${tunnelInfo.type === 'quick' ? '<div class="tunnel-hint">💡 Share this link with anyone to play right now! Upgrade to a named tunnel for a permanent URL.</div>' : ''}
                            </div>
                            <button class="btn btn-sm btn-teal" onclick="SettingsView.copyTunnelUrl('${H.escHtml(tunnelInfo.url)}')">📋 Copy</button>
                        </div>
                    ` : `
                        <div class="tunnel-card tunnel-offline">
                            <div class="tunnel-status-dot tunnel-dot-off"></div>
                            <div class="tunnel-info">
                                <div class="tunnel-label">⚫ Tunnel not running</div>
                                <div class="tunnel-hint">Run <code>launchctl load ~/Library/LaunchAgents/com.mollysarcade.tunnel.plist</code> to start — or it auto-starts on next reboot.</div>
                            </div>
                        </div>
                    `}
                    <div class="tunnel-local-urls">
                        <div class="tunnel-local-item">🏠 Home: <a href="http://localhost:3000" target="_blank">localhost:3000</a></div>
                        <div class="tunnel-local-item">📡 Network: <a href="http://192.168.86.20:3000" target="_blank">192.168.86.20:3000</a></div>
                    </div>
                </div>

                <!-- Metadata Enrichment -->
                <div class="settings-section">
                    <h3>🔍 Metadata Sources</h3>
                    <p style="font-size:12px;color:var(--text-dim);margin-bottom:12px;">Enrich your library with box art, descriptions, achievements, and manuals from multiple sources.</p>

                    <div class="enrich-buttons">
                        <button class="btn btn-sm btn-ghost" onclick="SettingsView.runEnrich('nointro')">📋 No-Intro DATs</button>
                        <button class="btn btn-sm btn-ghost" onclick="SettingsView.runEnrich('screenscraper')">🖼️ ScreenScraper</button>
                        <button class="btn btn-sm btn-ghost" onclick="SettingsView.runEnrich('igdb')">📖 IGDB</button>
                        <button class="btn btn-sm btn-ghost" onclick="SettingsView.runEnrich('ra')">🏆 RetroAchievements</button>
                        <button class="btn btn-sm btn-ghost" onclick="SettingsView.runEnrich('manuals')">📕 Manuals</button>
                        <button class="btn btn-sm btn-yellow" onclick="SettingsView.runEnrichAll()">⚡ Enrich All</button>
                    </div>
                    <div id="enrichProgress" style="margin-top:10px;"></div>
                </div>

                <!-- System Test ROMs -->
                <div class="settings-section" id="testRomsSection">
                    <h3>⚙️ System Test ROMs</h3>
                    <p style="font-size:12px;color:var(--text-dim);margin-bottom:12px;">Diagnostic and homebrew ROMs — hidden from the main library and favorites.</p>
                    <div id="testRomsList"><span style="color:var(--text-dim);font-size:13px;">Loading...</span></div>
                </div>

                <!-- About -->
                <div class="settings-section">
                    <h3>ℹ️ About</h3>
                    <div class="setting-row">
                        <div class="setting-label">
                            Your World Arcade
                            <small>v8.0.0 — Powered by EmulatorJS + Desktop Mode</small>
                        </div>
                    </div>
                    <div class="setting-row">
                        <div class="setting-label">
                            EmulatorJS CDN
                            <small>${H.escHtml(settings.emulatorjs_cdn || 'https://cdn.emulatorjs.org/stable/data')}</small>
                        </div>
                    </div>
                </div>
            `;

            app.innerHTML = html;

            // Populate system dropdown for scan paths
            const sysSelect = document.getElementById('newPathSystem');
            if (sysSelect && Array.isArray(systemsList)) {
                systemsList.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = `${s.name}`;
                    sysSelect.appendChild(opt);
                });
            }

            // Apply scanline toggle
            const crtEl = document.querySelector('.crt-overlay');
            if (crtEl) crtEl.style.display = settings.crt_scanlines === 'true' ? '' : 'none';

            // Load test ROMs async
            this.loadTestRoms();
        } catch (err) {
            app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💥</div><h3>Error</h3><p>${H.escHtml(err.message)}</p></div>`;
        }
    },

    async addPath() {
        const pathInput = document.getElementById('newPath');
        const sysSelect = document.getElementById('newPathSystem');
        const dirPath = pathInput?.value?.trim();
        if (!dirPath) { H.toast('Enter a directory path', 'error'); return; }

        try {
            await API.addScanPath(dirPath, sysSelect?.value || undefined);
            H.toast('Scan path added!', 'success');
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async removePath(id) {
        try {
            await API.removeScanPath(id);
            H.toast('Path removed', 'success');
            this.render();
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    copyTunnelUrl(url) {
        navigator.clipboard.writeText(url).then(() => {
            H.toast('🌐 Tunnel URL copied! Share it with anyone to play.', 'success');
        }).catch(() => {
            H.toast(url, 'info');  // fallback — show URL in toast
        });
    },

    async loadTestRoms() {
        const el = document.getElementById('testRomsList');
        if (!el) return;
        try {
            const roms = await API.get('/api/library/test-roms');
            if (!roms.length) {
                el.innerHTML = '<span style="color:var(--text-dim);font-size:13px;">No test ROMs found.</span>';
                return;
            }
            el.innerHTML = roms.map(r => `
                <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
                    <span style="font-size:18px;">${H.systemEmoji(r.system_id)}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:600;">${H.escHtml(r.title || r.clean_name)}</div>
                        <div style="font-size:11px;color:${r.system_color || '#888'}">${H.escHtml(r.system_name || r.system_id)} · ${H.formatBytes(r.size_bytes)}</div>
                    </div>
                    <button class="btn btn-xs btn-ghost" onclick="Router.navigate('#/game/${r.id}')">View</button>
                </div>
            `).join('');
        } catch {
            el.innerHTML = '<span style="color:var(--text-dim);font-size:13px;">Could not load test ROMs.</span>';
        }
    },

    async runEnrich(source) {
        const el = document.getElementById('enrichProgress');
        try {
            const map = {
                nointro: { fn: () => API.matchNoIntro(), status: () => API.noIntroStatus(), label: 'No-Intro' },
                screenscraper: { fn: () => API.batchScreenScraper(), status: () => API.screenScraperStatus(), label: 'ScreenScraper' },
                igdb: { fn: () => API.batchIGDB(), status: () => API.igdbStatus(), label: 'IGDB' },
                ra: { fn: () => API.batchRA(), status: () => API.raStatus(), label: 'RetroAchievements' },
                manuals: { fn: () => API.batchManuals(), status: () => API.manualsStatus(), label: 'Manuals' },
            };
            const src = map[source];
            if (!src) return;

            const result = await src.fn();
            if (result.ok === false) { H.toast(result.message, 'error'); return; }
            H.toast(`${src.label} started — ${result.message || result.queued + ' ROMs queued'}`, 'success');
            if (el) el.innerHTML = `<span style="color:var(--teal);font-size:13px;">⏳ ${src.label} running…</span>`;
            this._pollStatus(src.status, src.label, el);
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    async runEnrichAll() {
        const el = document.getElementById('enrichProgress');
        try {
            const result = await API.enrichAll();
            if (result.ok === false) { H.toast(result.message, 'error'); return; }
            H.toast('Enrichment pipeline started', 'success');
            if (el) el.innerHTML = '<span style="color:var(--teal);font-size:13px;">⏳ Enrichment pipeline running…</span>';
            this._pollStatus(() => API.enrichStatus(), 'Enrichment', el);
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },

    _pollStatus(statusFn, label, el) {
        const poll = async () => {
            try {
                const s = await statusFn();
                if (s.running) {
                    const pct = s.total ? Math.round((s.processed / s.total) * 100) : 0;
                    const detail = s.currentSource ? ` — ${s.currentSource}` : (s.currentRom ? ` — ${s.currentRom}` : '');
                    if (el) el.innerHTML = `<div style="font-size:13px;color:var(--teal);">⏳ ${label}: ${s.processed || s.currentIndex || 0}/${s.total || s.totalSources || '?'} (${pct}%)${detail}</div>
                        <div style="height:4px;background:var(--border);border-radius:2px;margin-top:6px;overflow:hidden;">
                            <div style="height:100%;width:${pct}%;background:var(--teal);transition:width 0.3s;"></div>
                        </div>`;
                    setTimeout(poll, 2000);
                } else {
                    if (el) el.innerHTML = `<span style="color:var(--green, #4CAF50);font-size:13px;">✅ ${label} complete!</span>`;
                    H.toast(`${label} complete!`, 'success');
                }
            } catch {
                if (el) el.innerHTML = '';
            }
        };
        setTimeout(poll, 2000);
    },

    async toggleSetting(key, el) {
        const isOn = el.classList.contains('on');
        const newVal = isOn ? 'false' : 'true';
        try {
            await API.setSetting(key, newVal);
            el.classList.toggle('on');

            if (key === 'crt_scanlines') {
                const crt = document.querySelector('.crt-overlay');
                if (crt) crt.style.display = newVal === 'true' ? '' : 'none';
            }
            if (key === 'sound_effects') {
                SFX.setEnabled(newVal === 'true');
            }
        } catch (err) {
            H.toast(err.message, 'error');
        }
    },
};
