/* ═══════════════════════════════════════════════════════════
   MAKE IT YOUR OWN — Molly's World Arcade
   Per-player customizations persisted to the server DB.
   Each player's choices are remembered and restored when
   they visit their profile or when the arcade boots.
   ═══════════════════════════════════════════════════════════ */

window.CustomizeView = {
    DEFAULTS: {
        heroImage: '/images/mollypop-bg.png',
        heroTitle: "Your World",
        accentColor: '#A855F7',
        tileStyle: 'rounded',       // rounded | sharp | retro
        cardGlow: true,
        scanlines: true,
        particles: true,
        sidebarColor: '#0F0F23',
        fontFamily: 'orbitron',      // orbitron | press-start | inter
        splashEmoji: '🕹️',
        splashName: "Your World",
    },

    HERO_PRESETS: [
        { label: 'Classic (Default)', url: '/images/mollypop-bg.png', icon: '🌸' },
        { label: 'Retro Arcade',   url: '/images/hero-retro.png',   icon: '🕹️' },
        { label: 'Pixel Art',      url: '/images/hero-pixel.png',   icon: '👾' },
        { label: 'Neon City',      url: '/images/hero-neon.png',    icon: '🌃' },
        { label: 'Space',          url: '/images/hero-space.png',   icon: '🚀' },
    ],

    COLOR_PRESETS: [
        { label: 'Purple',   color: '#A855F7' },
        { label: 'Pink',     color: '#EC4899' },
        { label: 'Cyan',     color: '#06B6D4' },
        { label: 'Green',    color: '#10B981' },
        { label: 'Red',      color: '#EF4444' },
        { label: 'Orange',   color: '#F59E0B' },
        { label: 'Blue',     color: '#3B82F6' },
        { label: 'Gold',     color: '#FFD700' },
    ],

    TILE_STYLES: [
        { id: 'rounded', label: 'Modern', icon: '⬜', desc: 'Smooth rounded corners' },
        { id: 'sharp',   label: 'Sharp',  icon: '🟥', desc: 'Hard pixel edges' },
        { id: 'retro',   label: 'Retro',  icon: '📺', desc: 'CRT screen glow' },
    ],

    FONT_OPTIONS: [
        { id: 'orbitron',    label: 'Orbitron',      sample: 'font-family: Orbitron, sans-serif' },
        { id: 'press-start', label: 'Press Start 2P', sample: "font-family: 'Press Start 2P', monospace" },
        { id: 'inter',       label: 'Inter',          sample: 'font-family: Inter, sans-serif' },
    ],

    // ── Active Player Tracking ──────────────
    getActivePlayerId() {
        return parseInt(localStorage.getItem('arcade_active_player') || '0') || null;
    },

    setActivePlayer(playerId) {
        localStorage.setItem('arcade_active_player', String(playerId));
    },

    getActivePlayerInfo() {
        try { return JSON.parse(localStorage.getItem('arcade_active_player_info') || 'null'); }
        catch { return null; }
    },

    // ── Config Management (per-player aware) ──
    getConfig() {
        try {
            const saved = JSON.parse(localStorage.getItem('arcade_customize') || '{}');
            return { ...this.DEFAULTS, ...saved };
        } catch { return { ...this.DEFAULTS }; }
    },

    saveConfig(config) {
        localStorage.setItem('arcade_customize', JSON.stringify(config));
        this.applyConfig(config);
        // Persist to DB for the active player
        const pid = this.getActivePlayerId();
        if (pid) {
            API.savePlayerPreferences(pid, config).catch(() => {});
        }
    },

    updateField(key, value) {
        const config = this.getConfig();
        config[key] = value;
        this.saveConfig(config);
    },

    // Load preferences from DB for a specific player and apply them
    async loadPlayerPrefs(playerId, playerInfo) {
        this.setActivePlayer(playerId);
        if (playerInfo) {
            localStorage.setItem('arcade_active_player_info', JSON.stringify(playerInfo));
        }
        try {
            const prefs = await API.playerPreferences(playerId);
            if (prefs && Object.keys(prefs).length > 0) {
                localStorage.setItem('arcade_customize', JSON.stringify(prefs));
                this.applyConfig({ ...this.DEFAULTS, ...prefs });
            }
        } catch { /* first visit — no prefs yet */ }
    },

    // ── Apply customizations to the DOM ──────────
    applyConfig(config) {
        if (!config) config = this.getConfig();
        const root = document.documentElement;

        // Accent color
        root.style.setProperty('--accent', config.accentColor);
        root.style.setProperty('--accent-20', config.accentColor + '33');

        // Tile style
        if (config.tileStyle === 'sharp') {
            root.style.setProperty('--card-radius', '2px');
        } else if (config.tileStyle === 'retro') {
            root.style.setProperty('--card-radius', '6px');
        } else {
            root.style.setProperty('--card-radius', '12px');
        }

        // Card glow
        root.style.setProperty('--card-glow', config.cardGlow ? '1' : '0');

        // Scanlines
        const crtOverlay = document.querySelector('.crt-overlay');
        if (crtOverlay) crtOverlay.style.display = config.scanlines ? '' : 'none';

        // Particles
        const particleCanvas = document.getElementById('particleCanvas');
        if (particleCanvas) particleCanvas.style.display = config.particles ? '' : 'none';

        // Sidebar
        const sidebar = document.getElementById('sidebar');
        if (sidebar && config.sidebarColor !== this.DEFAULTS.sidebarColor) {
            sidebar.style.background = config.sidebarColor;
        }

        // Hero image on home page
        const heroImg = document.querySelector('.mollypop-hero-img');
        if (heroImg && config.heroImage) heroImg.src = config.heroImage;

        const heroTitle = document.querySelector('.mollypop-hero-title');
        if (heroTitle && config.heroTitle) heroTitle.textContent = config.heroTitle;
    },

    // ── Main Render ─────────────────────────────
    render() {
        const app = document.getElementById('app');
        const config = this.getConfig();
        const activeInfo = this.getActivePlayerInfo();
        const activeLabel = activeInfo ? `${activeInfo.emoji} ${activeInfo.name}'s Settings` : 'Global Settings';

        app.innerHTML = `
            <div class="customize-page">
                <div class="customize-header">
                    <h1 class="customize-title">🎨 Make It Your Own</h1>
                    <p class="customize-subtitle">Personalize your arcade — ${activeLabel}</p>
                </div>

                <!-- Hero Section -->
                <div class="customize-section">
                    <h2 class="customize-section-title">🖼️ Hero Image</h2>
                    <div class="customize-hero-grid">
                        ${this.HERO_PRESETS.map(h => `
                            <button class="hero-preset ${config.heroImage === h.url ? 'active' : ''}"
                                    onclick="CustomizeView.setHero('${h.url}')">
                                <span class="hero-preset-icon">${h.icon}</span>
                                <span class="hero-preset-label">${h.label}</span>
                            </button>
                        `).join('')}
                        <button class="hero-preset upload-btn" onclick="document.getElementById('heroUpload').click()">
                            <span class="hero-preset-icon">📁</span>
                            <span class="hero-preset-label">Upload</span>
                        </button>
                        <input type="file" id="heroUpload" accept="image/*" style="display:none"
                               onchange="CustomizeView.uploadHero(this)">
                    </div>
                </div>

                <!-- Arcade Name -->
                <div class="customize-section">
                    <h2 class="customize-section-title">✏️ Arcade Name</h2>
                    <input type="text" class="customize-text-input" id="arcadeName"
                           value="${H.escHtml(config.heroTitle)}" maxlength="30"
                           placeholder="Your World"
                           onchange="CustomizeView.updateField('heroTitle', this.value)">
                </div>

                <!-- Splash Screen Personalization -->
                <div class="customize-section">
                    <h2 class="customize-section-title">🌟 Startup Screen</h2>
                    <p style="color:var(--text-muted);margin-bottom:12px;font-size:13px;">Next time the arcade loads, it'll greet you personally!</p>
                    <div class="customize-splash-preview" style="background:linear-gradient(135deg, ${config.accentColor}22, #0A0A1A);border:1px solid ${config.accentColor}44;border-radius:12px;padding:24px;text-align:center;margin-bottom:12px;">
                        <div style="font-size:48px;margin-bottom:8px;">${H.escHtml(config.splashEmoji || '🕹️')}</div>
                        <div style="font-family:Orbitron,sans-serif;font-size:18px;color:${config.accentColor};font-weight:700;">${H.escHtml(config.splashName || "Your World")}</div>
                        <div style="font-family:Orbitron,sans-serif;font-size:11px;color:#fff;letter-spacing:4px;margin-top:4px;">ARCADE</div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div class="pp-add-field" style="margin:0;">
                            <label style="color:var(--text-muted);font-size:12px;">Splash Name</label>
                            <input type="text" class="pp-search" style="margin:0" value="${H.escHtml(config.splashName || "Your World")}" maxlength="20"
                                   onchange="CustomizeView.updateField('splashName', this.value);CustomizeView.render()">
                        </div>
                        <div class="pp-add-field" style="margin:0;">
                            <label style="color:var(--text-muted);font-size:12px;">Splash Emoji</label>
                            <input type="text" class="pp-search" style="margin:0;font-size:24px;text-align:center;" value="${config.splashEmoji || '🕹️'}" maxlength="4"
                                   onchange="CustomizeView.updateField('splashEmoji', this.value);CustomizeView.render()">
                        </div>
                    </div>
                </div>

                <!-- Accent Color -->
                <div class="customize-section">
                    <h2 class="customize-section-title">🎨 Accent Color</h2>
                    <div class="color-preset-grid">
                        ${this.COLOR_PRESETS.map(c => `
                            <button class="color-preset ${config.accentColor === c.color ? 'active' : ''}"
                                    style="background:${c.color}"
                                    title="${c.label}"
                                    onclick="CustomizeView.setColor('${c.color}')">
                                ${config.accentColor === c.color ? '✓' : ''}
                            </button>
                        `).join('')}
                        <label class="color-preset custom-color" title="Custom color">
                            🎯
                            <input type="color" value="${config.accentColor}" style="opacity:0;position:absolute;width:0;height:0"
                                   onchange="CustomizeView.setColor(this.value)">
                        </label>
                    </div>
                </div>

                <!-- Tile Style -->
                <div class="customize-section">
                    <h2 class="customize-section-title">🃏 Card Style</h2>
                    <div class="tile-style-grid">
                        ${this.TILE_STYLES.map(t => `
                            <button class="tile-style-btn ${config.tileStyle === t.id ? 'active' : ''}"
                                    onclick="CustomizeView.setTileStyle('${t.id}')">
                                <span class="tile-style-icon">${t.icon}</span>
                                <span class="tile-style-label">${t.label}</span>
                                <span class="tile-style-desc">${t.desc}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- Toggles -->
                <div class="customize-section">
                    <h2 class="customize-section-title">⚙️ Visual Effects</h2>
                    <div class="customize-toggles">
                        <label class="toggle-row">
                            <span>Card Glow Effects</span>
                            <input type="checkbox" ${config.cardGlow ? 'checked' : ''}
                                   onchange="CustomizeView.updateField('cardGlow', this.checked)">
                        </label>
                        <label class="toggle-row">
                            <span>CRT Scanlines</span>
                            <input type="checkbox" ${config.scanlines ? 'checked' : ''}
                                   onchange="CustomizeView.updateField('scanlines', this.checked)">
                        </label>
                        <label class="toggle-row">
                            <span>Floating Particles</span>
                            <input type="checkbox" ${config.particles ? 'checked' : ''}
                                   onchange="CustomizeView.updateField('particles', this.checked)">
                        </label>
                    </div>
                </div>

                <!-- Reset -->
                <div class="customize-section" style="text-align:center;padding-top:20px;">
                    <button class="btn btn-danger" onclick="CustomizeView.resetAll()">
                        🔄 Reset to Defaults
                    </button>
                </div>
            </div>
        `;
    },

    setHero(url) {
        this.updateField('heroImage', url);
        this.render();
    },

    uploadHero(input) {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            this.updateField('heroImage', e.target.result);
            this.render();
            H.toast('Hero image updated!', 'success');
        };
        reader.readAsDataURL(file);
    },

    setColor(color) {
        this.updateField('accentColor', color);
        this.render();
    },

    setTileStyle(style) {
        this.updateField('tileStyle', style);
        this.render();
    },

    resetAll() {
        localStorage.removeItem('arcade_customize');
        this.applyConfig(this.DEFAULTS);
        // Also clear DB prefs for active player
        const pid = this.getActivePlayerId();
        if (pid) API.savePlayerPreferences(pid, {}).catch(() => {});
        this.render();
        H.toast('Reset to defaults!', 'success');
    },
};

// Apply saved customizations on load
document.addEventListener('DOMContentLoaded', () => {
    CustomizeView.applyConfig();
});
