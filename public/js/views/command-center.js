/* ════════════════════════════════════════════════════════════════
   COMMAND CENTER — Ops Dashboard View
   Adapted from BOM CC glassmorphism panel architecture
   ════════════════════════════════════════════════════════════════ */
window.CommandCenterView = {
    data: null,
    collapsed: {},

    async render() {
        this.collapsed = JSON.parse(localStorage.getItem('cc_collapsed') || '{}');
        const app = document.getElementById('app');
        app.innerHTML = `<div class="cc-container"><div style="text-align:center;padding:60px;color:rgba(255,255,255,0.4);">
            <div style="font-size:36px;margin-bottom:12px;">📊</div>Loading Command Center...</div></div>`;

        try {
            this.data = await API.ccStats();
            app.innerHTML = this.buildHTML();
            this.bindEvents();
            SFX.click();
        } catch (err) {
            console.error('CC load error:', err);
            app.innerHTML = `<div class="cc-container"><div class="empty-state">
                <div class="empty-state-emoji">⚠️</div>
                <div class="empty-state-title">Command Center Offline</div>
                <div class="empty-state-subtitle">${err.message}</div>
            </div></div>`;
        }
    },

    buildHTML() {
        const d = this.data;
        let html = `<div class="cc-container">`;

        // ── Header ──
        html += `
        <div class="cc-header">
            <div class="cc-header-left">
                <div class="cc-header-icon">📊</div>
                <div>
                    <div class="cc-header-title">COMMAND CENTER</div>
                    <div class="cc-header-sub">Your World Arcade &bull; V3 Ops Dashboard</div>
                </div>
            </div>
            <button class="cc-refresh-btn" onclick="CommandCenterView.refresh()">
                <span class="cc-refresh-icon">🔄</span> Refresh
            </button>
        </div>`;

        html += `<div class="cc-grid">`;

        // ═══════ MONITOR ═══════
        html += this.sectionLabel('MONITOR', 'var(--cc-cat-monitor)');
        html += this.pulsePanel(d);
        html += this.playerIntelPanel(d);

        // ═══════ LIBRARY ═══════
        html += this.sectionLabel('LIBRARY', 'var(--cc-cat-library)');
        html += this.gameVaultPanel(d);
        html += this.systemsGridPanel(d);

        // ═══════ IMAGE PIPELINE / CONTENT ═══════
        html += this.sectionLabel('IMAGE PIPELINE', 'var(--cc-cat-content)');
        html += this.artworkIntelPanel(d);
        html += this.scannerPanel(d);

        // ═══════ SCRAPER ═══════
        html += this.sectionLabel('SCRAPER', 'var(--cc-cat-scraper)');
        html += this.archivePanel();
        html += this.downloadsPanel(d);

        // ═══════ PLAYERS ═══════
        html += this.sectionLabel('PLAYERS', 'var(--cc-cat-players)');
        html += this.leaderboardPanel(d);
        html += this.achievementsPanel(d);
        html += this.activityFeedPanel(d);

        // ═══════ CONFIG ═══════
        html += this.sectionLabel('CONFIG', 'var(--cc-cat-config)');
        html += this.storagePanel(d);
        html += this.aboutPanel(d);

        html += `</div></div>`;
        return html;
    },

    // ── Helpers ──
    sectionLabel(text, color) {
        return `<div class="cc-section-label" style="color:${color}">
            <span class="cc-section-dot" style="background:${color};color:${color}"></span>
            ${text}
        </div>`;
    },

    panelWrap(name, icon, title, subtitle, stats, body, opts = {}) {
        const isCollapsed = this.collapsed[name] ? 'collapsed' : '';
        const color = opts.color || 'var(--cc-purple)';
        const fullWidth = opts.fullWidth ? 'full-width' : '';
        const statsHTML = stats.map(s => `
            <div class="cc-panel-stat" style="--stat-color:${s.color}">
                <div class="cc-stat-value">${s.value}</div>
                <div class="cc-stat-label">${s.label}</div>
            </div>
        `).join('');

        return `
        <div class="cc-panel ${isCollapsed} ${fullWidth}" data-panel="${name}" style="--panel-color:${color}">
            <div class="cc-panel-header" onclick="CommandCenterView.togglePanel('${name}')">
                <div class="cc-panel-icon" style="background:${color}18;color:${color}">${icon}</div>
                <div class="cc-panel-titles">
                    <div class="cc-panel-title">${title}</div>
                    <div class="cc-panel-subtitle">${subtitle}</div>
                </div>
                <div class="cc-panel-stats">${statsHTML}</div>
                <div class="cc-panel-chevron">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </div>
            </div>
            <div class="cc-panel-body">${body}</div>
        </div>`;
    },

    // Use shared helpers from H (helpers.js) for formatting:
    // H.formatBytes(), H.formatDuration(), H.timeAgo()
    fmtNum(n) {
        return (n || 0).toLocaleString();
    },

    // ═══════════════════════════════════════════════════════
    // PANEL RENDERERS
    // ═══════════════════════════════════════════════════════

    // ── 1. PULSE ──
    pulsePanel(d) {
        const p = d.pulse;
        const body = `
        <div class="cc-kv-grid">
            <div class="cc-kv-item" style="--kv-color:var(--cc-cyan)">
                <span class="cc-kv-label">Play Sessions</span>
                <span class="cc-kv-value">${this.fmtNum(p.total_play_sessions)}</span>
            </div>
            <div class="cc-kv-item" style="--kv-color:var(--cc-green)">
                <span class="cc-kv-label">Total Play Time</span>
                <span class="cc-kv-value">${H.formatDuration(p.total_play_time_seconds)}</span>
            </div>
            <div class="cc-kv-item" style="--kv-color:var(--cc-amber)">
                <span class="cc-kv-label">ROMs This Week</span>
                <span class="cc-kv-value">+${p.roms_added_week}</span>
            </div>
            <div class="cc-kv-item" style="--kv-color:var(--cc-pink)">
                <span class="cc-kv-label">DB Size</span>
                <span class="cc-kv-value">${H.formatBytes(p.db_size_bytes)}</span>
            </div>
            <div class="cc-kv-item" style="--kv-color:var(--cc-purple)">
                <span class="cc-kv-label">Total Favorites</span>
                <span class="cc-kv-value">${this.fmtNum(p.total_favorites)}</span>
            </div>
            <div class="cc-kv-item" style="--kv-color:var(--cc-red)">
                <span class="cc-kv-label">Avg Rating</span>
                <span class="cc-kv-value">${p.avg_rating || '—'} ⭐</span>
            </div>
        </div>`;

        return this.panelWrap('pulse', '🏥', 'Pulse', 'System health & vital signs', [
            { value: this.fmtNum(p.total_roms), label: 'ROMs', color: 'var(--cc-cyan)' },
            { value: p.active_systems, label: 'Systems', color: 'var(--cc-green)' },
            { value: this.fmtNum(p.total_play_sessions), label: 'Sessions', color: 'var(--cc-amber)' },
            { value: p.active_today, label: 'Active', color: 'var(--cc-purple)' },
        ], body, { color: 'var(--cc-cat-monitor)' });
    },

    // ── 2. PLAYER INTEL ──
    playerIntelPanel(d) {
        const totalXP = d.players.reduce((s, p) => s + (p.xp || 0), 0);
        const totalAch = d.players.reduce((s, p) => s + p.achievement_count, 0);
        const avgLevel = d.players.length > 0 ? (d.players.reduce((s, p) => s + (p.level || 1), 0) / d.players.length).toFixed(1) : 0;

        const cards = d.players.map(p => {
            const xpPct = p.xp_for_next ? Math.min(100, Math.round(((p.xp || 0) / p.xp_for_next) * 100)) : 100;
            return `
            <div class="cc-player-card" style="--player-color:${p.color}">
                <div class="cc-player-header">
                    <div class="cc-player-emoji" style="border-color:${p.color}">${p.emoji}</div>
                    <div>
                        <div class="cc-player-name">${H.escHtml(p.name)}</div>
                        <div class="cc-player-level">Lv.${p.level || 1} ${p.level_title}</div>
                    </div>
                </div>
                ${p.bio ? `<div class="cc-player-bio">"${H.escHtml(p.bio)}"</div>` : ''}
                <div class="cc-player-stats">
                    <span class="cc-player-mini-stat">⭐ <strong>${p.fav_count}</strong></span>
                    <span class="cc-player-mini-stat">🏆 <strong>${p.achievement_count}</strong></span>
                    <span class="cc-player-mini-stat">🎮 <strong>${p.play_count}</strong></span>
                </div>
                <div class="cc-xp-bar"><div class="cc-xp-fill" style="width:${xpPct}%;background:linear-gradient(90deg,${p.color},var(--cc-purple))"></div></div>
            </div>`;
        }).join('');

        const body = `<div class="cc-player-grid">${cards}</div>`;

        return this.panelWrap('player-intel', '👥', 'Player Intel', 'All players &bull; personalities &bull; progression', [
            { value: this.fmtNum(totalXP), label: 'Total XP', color: 'var(--cc-cyan)' },
            { value: totalAch, label: 'Achieve', color: 'var(--cc-green)' },
            { value: avgLevel, label: 'Avg Lv', color: 'var(--cc-amber)' },
            { value: d.pulse.active_today, label: 'Active', color: 'var(--cc-purple)' },
        ], body, { color: 'var(--cc-cat-monitor)', fullWidth: true });
    },

    // ── 3. GAME VAULT ──
    gameVaultPanel(d) {
        const activeSystems = d.systems.filter(s => s.rom_count > 0).sort((a, b) => b.rom_count - a.rom_count);
        const top5 = activeSystems.slice(0, 5);
        const maxCount = top5.length > 0 ? top5[0].rom_count : 1;

        const bars = top5.map(s => `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                <span style="width:60px;font-size:11px;font-weight:600;color:${s.color || '#999'};text-align:right">${s.short_name}</span>
                <div class="cc-progress-bar" style="flex:1">
                    <div class="cc-progress-fill" style="width:${(s.rom_count / maxCount * 100).toFixed(0)}%;background:${s.color || 'var(--cc-purple)'}"></div>
                </div>
                <span style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;width:40px;color:#f1f5f9">${s.rom_count}</span>
            </div>
        `).join('');

        const body = `
        <div style="margin-bottom:12px;font-size:11px;color:rgba(255,255,255,0.35)">Top 5 Systems by ROM Count</div>
        ${bars}
        <div style="margin-top:12px;font-size:11px;color:rgba(255,255,255,0.3)">${activeSystems.length} active systems &bull; ${d.systems.length} total configured</div>`;

        const artCount = d.systems.reduce((s, sys) => s + sys.artwork_count, 0);
        return this.panelWrap('game-vault', '🗄️', 'Game Vault', 'ROM library overview', [
            { value: this.fmtNum(d.pulse.total_roms), label: 'Games', color: 'var(--cc-cyan)' },
            { value: artCount, label: 'Artwork', color: 'var(--cc-green)' },
            { value: d.metadata.total_without_artwork, label: 'Missing', color: 'var(--cc-amber)' },
            { value: d.pulse.active_systems, label: 'Systems', color: 'var(--cc-purple)' },
        ], body, { color: 'var(--cc-cat-library)' });
    },

    // ── 4. SYSTEMS GRID ──
    systemsGridPanel(d) {
        const chips = d.systems.map(s => `
            <div class="cc-system-chip" style="--sys-color:${s.color || '#666'}">
                <span class="cc-system-name">${s.short_name}</span>
                <span class="cc-system-count">${s.rom_count}</span>
            </div>
        `).join('');

        const withBios = d.systems.filter(s => s.bios_files).length;
        const body = `<div class="cc-systems-grid">${chips}</div>`;

        return this.panelWrap('systems-grid', '🎮', 'Systems Grid', `${d.systems.length} emulated platforms`, [
            { value: d.systems.length, label: 'Total', color: 'var(--cc-cyan)' },
            { value: d.pulse.active_systems, label: 'Active', color: 'var(--cc-green)' },
            { value: withBios, label: 'BIOS', color: 'var(--cc-amber)' },
            { value: d.systems.length - d.pulse.active_systems, label: 'Empty', color: 'var(--cc-red)' },
        ], body, { color: 'var(--cc-cat-library)' });
    },

    // ── 5. ARTWORK INTEL (Image Pipeline) ──
    artworkIntelPanel(d) {
        const m = d.metadata;
        const genres = Object.entries(m.genre_distribution).map(([genre, count]) =>
            `<span class="cc-genre-tag">${genre} <span class="cc-genre-count">${count}</span></span>`
        ).join('');

        const body = `
        <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span style="font-size:12px;color:rgba(255,255,255,0.5)">Artwork Coverage</span>
                <span style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:${m.artwork_pct >= 80 ? 'var(--cc-green)' : m.artwork_pct >= 50 ? 'var(--cc-amber)' : 'var(--cc-red)'}">${m.artwork_pct}%</span>
            </div>
            <div class="cc-progress-bar" style="height:10px">
                <div class="cc-progress-fill" style="width:${m.artwork_pct}%;background:linear-gradient(90deg,var(--cc-pink),var(--cc-purple))"></div>
            </div>
        </div>
        <div class="cc-kv-grid" style="margin-bottom:12px">
            <div class="cc-kv-item" style="--kv-color:var(--cc-green)"><span class="cc-kv-label">Has Title</span><span class="cc-kv-value">${m.total_with_title}</span></div>
            <div class="cc-kv-item" style="--kv-color:var(--cc-pink)"><span class="cc-kv-label">Has Genre</span><span class="cc-kv-value">${m.total_with_genre}</span></div>
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-bottom:6px">Genre Distribution</div>
        <div class="cc-genre-list">${genres || '<span class="cc-empty">No genre data yet</span>'}</div>`;

        return this.panelWrap('artwork-intel', '🖼️', 'Artwork Intel', 'Image pipeline &bull; metadata coverage', [
            { value: m.artwork_pct + '%', label: 'Coverage', color: 'var(--cc-cyan)' },
            { value: m.total_with_artwork, label: 'Has Art', color: 'var(--cc-green)' },
            { value: m.total_without_artwork, label: 'Missing', color: 'var(--cc-amber)' },
            { value: m.total_with_genre, label: 'Genre', color: 'var(--cc-pink)' },
        ], body, { color: 'var(--cc-cat-content)' });
    },

    // ── 6. SCANNER ──
    scannerPanel(d) {
        const paths = d.scanner.paths.map(sp => `
            <div class="cc-scan-item">
                <span style="font-size:14px">${sp.enabled ? '🟢' : '🔴'}</span>
                <span class="cc-scan-path">${sp.path}</span>
                <span class="cc-scan-count">${sp.rom_count} ROMs</span>
            </div>
        `).join('');

        const totalScanned = d.scanner.paths.reduce((s, p) => s + (p.rom_count || 0), 0);
        const body = `
        <div class="cc-scan-list">${paths || '<div class="cc-empty">No scan paths configured</div>'}</div>
        <button class="cc-scan-btn" onclick="window.arcade.startScan(); SFX.click();">🔍 Scan Now</button>`;

        return this.panelWrap('scanner', '🔍', 'ROM Scanner', 'Scan paths &bull; file detection', [
            { value: d.scanner.paths.length, label: 'Paths', color: 'var(--cc-cyan)' },
            { value: totalScanned, label: 'Found', color: 'var(--cc-green)' },
            { value: d.scanner.paths.filter(p => p.enabled).length, label: 'Active', color: 'var(--cc-amber)' },
            { value: d.scanner.paths.filter(p => !p.enabled).length, label: 'Off', color: 'var(--cc-red)' },
        ], body, { color: 'var(--cc-cat-content)' });
    },

    // ── 7. ARCHIVE.ORG (Scraper) ──
    archivePanel() {
        const body = `
        <a href="#/archive" class="cc-quick-link" onclick="SFX.click()">
            <span class="cc-quick-link-icon">🌐</span>
            <div>
                <div style="font-weight:600;color:#f1f5f9">Browse Archive.org</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px">Search & download ROM collections</div>
            </div>
        </a>
        <a href="#/mamedev" class="cc-quick-link" onclick="SFX.click()" style="margin-top:8px">
            <span class="cc-quick-link-icon">👾</span>
            <div>
                <div style="font-weight:600;color:#f1f5f9">MAMEDev Free ROMs</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px">Legal arcade ROMs from MAME developers</div>
            </div>
        </a>`;

        return this.panelWrap('archive', '🌐', 'ROM Scraper', 'Archive.org &bull; MAMEDev sources', [
            { value: '2', label: 'Sources', color: 'var(--cc-cyan)' },
            { value: '∞', label: 'Available', color: 'var(--cc-green)' },
            { value: '—', label: '', color: 'transparent' },
            { value: '—', label: '', color: 'transparent' },
        ], body, { color: 'var(--cc-cat-scraper)' });
    },

    // ── 8. DOWNLOADS ──
    downloadsPanel(d) {
        const dl = d.downloads;
        const items = dl.recent.map(r => `
            <div class="cc-dl-item">
                <span class="cc-dl-status ${r.status}"></span>
                <span class="cc-dl-name">${r.filename || r.url}</span>
                <span style="font-size:11px;color:rgba(255,255,255,0.3)">${r.status}</span>
            </div>
        `).join('');

        const body = `
        <div class="cc-dl-list">${items || '<div class="cc-empty">No downloads yet</div>'}</div>
        <a href="#/downloads" class="cc-quick-link" onclick="SFX.click()" style="margin-top:10px">
            <span class="cc-quick-link-icon">⬇️</span>
            <span>Open Download Manager</span>
        </a>`;

        return this.panelWrap('downloads', '⬇️', 'Downloads', 'Download queue &bull; scraper results', [
            { value: dl.total, label: 'Total', color: 'var(--cc-cyan)' },
            { value: dl.completed, label: 'Done', color: 'var(--cc-green)' },
            { value: dl.pending, label: 'Queue', color: 'var(--cc-amber)' },
            { value: dl.failed, label: 'Failed', color: 'var(--cc-red)' },
        ], body, { color: 'var(--cc-cat-scraper)' });
    },

    // ── 9. XP LEADERBOARD ──
    leaderboardPanel(d) {
        const lb = d.progression.leaderboard;
        const ranks = ['gold', 'silver', 'bronze'];
        const rows = lb.map((p, i) => `
            <div class="cc-leader-row">
                <span class="cc-leader-rank ${ranks[i] || ''}">#${i + 1}</span>
                <span class="cc-leader-emoji">${p.emoji}</span>
                <div class="cc-leader-info">
                    <div class="cc-leader-name">${H.escHtml(p.name)}</div>
                    <div class="cc-leader-title">Lv.${p.level || 1} ${p.level_title}</div>
                </div>
                <span class="cc-leader-xp">${this.fmtNum(p.xp)} XP</span>
            </div>
        `).join('');

        const body = `<div class="cc-leaderboard">${rows}</div>`;

        return this.panelWrap('leaderboard', '🏆', 'XP Leaderboard', 'Players ranked by experience', [
            { value: this.fmtNum(lb[0]?.xp || 0), label: '#1 XP', color: 'var(--cc-cyan)' },
            { value: lb[0]?.name || '—', label: 'Leader', color: 'var(--cc-green)' },
            { value: lb.filter(p => (p.xp || 0) > 0).length, label: 'Active', color: 'var(--cc-amber)' },
            { value: lb.length, label: 'Players', color: 'var(--cc-purple)' },
        ], body, { color: 'var(--cc-cat-players)' });
    },

    // ── 10. ACHIEVEMENTS ──
    achievementsPanel(d) {
        const prog = d.progression;
        const pct = prog.total_possible > 0 ? Math.round((prog.total_achievements / prog.total_possible) * 100) : 0;

        const body = `
        <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:12px;color:rgba(255,255,255,0.5)">Global Unlock Progress</span>
                <span style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:var(--cc-cyan)">${pct}%</span>
            </div>
            <div class="cc-progress-bar" style="height:10px">
                <div class="cc-progress-fill" style="width:${pct}%;background:linear-gradient(90deg,var(--cc-cyan),var(--cc-green))"></div>
            </div>
            <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:4px">${prog.total_achievements} of ${prog.total_possible} possible achievements unlocked</div>
        </div>`;

        return this.panelWrap('achievements', '🎖️', 'Achievements', 'Unlock rates &bull; global progress', [
            { value: prog.total_achievements, label: 'Unlocked', color: 'var(--cc-cyan)' },
            { value: prog.total_possible, label: 'Possible', color: 'var(--cc-green)' },
            { value: pct + '%', label: 'Rate', color: 'var(--cc-amber)' },
            { value: 20, label: 'Types', color: 'var(--cc-purple)' },
        ], body, { color: 'var(--cc-cat-players)' });
    },

    // ── 11. ACTIVITY FEED ──
    activityFeedPanel(d) {
        const feed = d.progression.recent_activity;
        const typeIcons = {
            play: '🎮', level_up: '⬆️', achievement: '🏆', favorite: '⭐',
            rate: '⭐', high_score: '🥇', challenge: '🎯', cheat: '💀',
        };

        const items = feed.map(f => {
            const icon = typeIcons[f.type] || '📌';
            let text = `<strong>${f.player_name || 'Someone'}</strong> `;
            switch (f.type) {
                case 'play': text += `played ${f.game_name || 'a game'}`; break;
                case 'level_up': text += `leveled up!`; break;
                case 'achievement': text += `unlocked an achievement`; break;
                case 'favorite': text += `favorited ${f.game_name || 'a game'}`; break;
                case 'high_score': text += `set a high score`; break;
                default: text += f.type;
            }
            return `
            <div class="cc-feed-item">
                <span class="cc-feed-emoji">${f.player_emoji || icon}</span>
                <span class="cc-feed-text">${text}</span>
                <span class="cc-feed-time">${H.timeAgo(f.created_at)}</span>
            </div>`;
        }).join('');

        const body = `<div class="cc-feed">${items || '<div class="cc-empty">No activity yet — go play some games!</div>'}</div>`;

        return this.panelWrap('activity-feed', '📡', 'Activity Feed', 'Real-time player actions', [
            { value: feed.length, label: 'Recent', color: 'var(--cc-cyan)' },
            { value: '—', label: '', color: 'transparent' },
            { value: '—', label: '', color: 'transparent' },
            { value: '—', label: '', color: 'transparent' },
        ], body, { color: 'var(--cc-cat-players)' });
    },

    // ── 12. STORAGE ──
    storagePanel(d) {
        const st = d.storage;
        const total = st.roms_bytes + st.artwork_bytes + st.saves_bytes + st.db_bytes;
        const maxBar = Math.max(st.roms_bytes, st.artwork_bytes, st.saves_bytes, st.db_bytes) || 1;

        const items = [
            { label: '💾 ROMs', bytes: st.roms_bytes, color: 'var(--cc-cyan)' },
            { label: '🖼️ Artwork', bytes: st.artwork_bytes, color: 'var(--cc-pink)' },
            { label: '💿 Saves', bytes: st.saves_bytes, color: 'var(--cc-green)' },
            { label: '🗃️ Database', bytes: st.db_bytes, color: 'var(--cc-amber)' },
        ].map(item => `
            <div class="cc-storage-item">
                <div class="cc-storage-row">
                    <span class="cc-storage-label">${item.label}</span>
                    <span class="cc-storage-value">${H.formatBytes(item.bytes)}</span>
                </div>
                <div class="cc-progress-bar">
                    <div class="cc-progress-fill" style="width:${(item.bytes / maxBar * 100).toFixed(0)}%;background:${item.color}"></div>
                </div>
            </div>
        `).join('');

        const body = `
        <div class="cc-storage-list">${items}</div>
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--cc-border);display:flex;justify-content:space-between">
            <span style="font-size:12px;color:rgba(255,255,255,0.4)">Total</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:#f1f5f9">${H.formatBytes(total)}</span>
        </div>`;

        return this.panelWrap('storage', '💾', 'Storage', 'Disk usage by category', [
            { value: H.formatBytes(st.roms_bytes), label: 'ROMs', color: 'var(--cc-cyan)' },
            { value: H.formatBytes(st.artwork_bytes), label: 'Art', color: 'var(--cc-pink)' },
            { value: H.formatBytes(total), label: 'Total', color: 'var(--cc-green)' },
            { value: H.formatBytes(st.db_bytes), label: 'DB', color: 'var(--cc-amber)' },
        ], body, { color: 'var(--cc-cat-config)' });
    },

    // ── 13. ABOUT ──
    aboutPanel(d) {
        const body = `
        <div class="cc-about-grid">
            <span class="cc-about-label">Version</span><span class="cc-about-value">V3.0 — Command Center</span>
            <span class="cc-about-label">Server</span><span class="cc-about-value">Express 5 + Node.js</span>
            <span class="cc-about-label">Database</span><span class="cc-about-value">SQLite (better-sqlite3)</span>
            <span class="cc-about-label">Emulator</span><span class="cc-about-value">EmulatorJS CDN</span>
            <span class="cc-about-label">Frontend</span><span class="cc-about-value">Vanilla JS SPA</span>
            <span class="cc-about-label">Tables</span><span class="cc-about-value">15 tables</span>
            <span class="cc-about-label">Routes</span><span class="cc-about-value">18 route modules</span>
            <span class="cc-about-label">Dependencies</span><span class="cc-about-value">express, better-sqlite3, chokidar</span>
            <span class="cc-about-label">Made for</span><span class="cc-about-value">The Stanford Family 🌸</span>
        </div>`;

        return this.panelWrap('about', 'ℹ️', 'About', 'System info &bull; credits', [
            { value: 'V3', label: 'Version', color: 'var(--cc-cyan)' },
            { value: '—', label: '', color: 'transparent' },
            { value: '—', label: '', color: 'transparent' },
            { value: '—', label: '', color: 'transparent' },
        ], body, { color: 'var(--cc-cat-config)' });
    },

    // ═══════════════════════════════════════════════════════
    // INTERACTIONS
    // ═══════════════════════════════════════════════════════

    togglePanel(name) {
        const panel = document.querySelector(`[data-panel="${name}"]`);
        if (!panel) return;
        panel.classList.toggle('collapsed');
        this.collapsed[name] = panel.classList.contains('collapsed');
        localStorage.setItem('cc_collapsed', JSON.stringify(this.collapsed));
        SFX.click();
    },

    async refresh() {
        const btn = document.querySelector('.cc-refresh-btn');
        if (btn) btn.classList.add('spinning');
        try {
            this.data = await API.ccStats();
            const app = document.getElementById('app');
            app.innerHTML = this.buildHTML();
            this.bindEvents();
            H.toast('Command Center refreshed', 'success');
        } catch (err) {
            H.toast('Refresh failed: ' + err.message, 'error');
        }
        setTimeout(() => {
            const btn2 = document.querySelector('.cc-refresh-btn');
            if (btn2) btn2.classList.remove('spinning');
        }, 800);
    },

    bindEvents() {
        // Sound for panel header clicks is handled inline via onclick
    },
};
