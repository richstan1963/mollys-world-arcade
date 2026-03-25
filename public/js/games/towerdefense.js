/* TowerDefense — Classic tower defense with Kenney CC0 sprites for Your World Arcade
 * Self-contained, no dependencies, canvas-rendered, theme-aware */
window.TowerDefense = (() => {
    // ── Sprite Atlas (Kenney CC0) ──
    const __sprites = {};
    let __spritesLoaded = 0, __spritesTotal = 0, __allSpritesReady = false;
    const __SPRITE_MANIFEST = {
        pathTile: '/img/game-assets/kenney-tiles/tileYellow_02.png',
        grassTile: '/img/game-assets/kenney-tiles/tileGreen_05.png',
        towerArrow: '/img/game-assets/kenney-platform/tiles/boxCoin.png',
        towerCannon: '/img/game-assets/kenney-platform/tiles/boxExplosive.png',
        towerIce: '/img/game-assets/kenney-platform/tiles/boxItem.png',
        towerLightning: '/img/game-assets/kenney-platform/tiles/boxCrate_warning.png',
        enemySoldier: '/img/game-assets/kenney-platform/enemies/slimeGreen.png',
        enemyRunner: '/img/game-assets/kenney-platform/enemies/bee.png',
        enemyTank: '/img/game-assets/kenney-platform/enemies/slimePurple.png',
        enemyFlyer: '/img/game-assets/kenney-platform/enemies/fly.png',
        projArrow: '/img/game-assets/kenney-particles/particleWhite_4.png',
        projCannon: '/img/game-assets/kenney-particles/particleWhite_6.png',
        particle1: '/img/game-assets/kenney-particles/particleWhite_1.png',
    };

    function __loadSprites(onDone) {
        const keys = Object.keys(__SPRITE_MANIFEST);
        __spritesTotal = keys.length;
        __spritesLoaded = 0;
        let done = 0;
        keys.forEach(key => {
            const img = new Image();
            img.onload = () => { __sprites[key] = img; done++; __spritesLoaded = done; if (done === __spritesTotal) { __allSpritesReady = true; if (onDone) onDone(); } };
            img.onerror = () => { __sprites[key] = null; done++; __spritesLoaded = done; if (done === __spritesTotal) { __allSpritesReady = true; if (onDone) onDone(); } };
            img.src = __SPRITE_MANIFEST[key];
        });
    }

    function __drawLoadingScreen(cvs, context, title, color) {
        const w = cvs.width, h = cvs.height;
        context.fillStyle = '#0A0E1A';
        context.fillRect(0, 0, w, h);
        context.textAlign = 'center';
        context.fillStyle = color;
        context.shadowColor = color; context.shadowBlur = 10;
        context.font = 'bold ' + Math.round(w * 0.06) + 'px monospace';
        context.fillText(title, w / 2, h / 2 - w * 0.08);
        context.shadowBlur = 0;
        context.fillStyle = '#E0E7FF';
        context.font = Math.round(w * 0.025) + 'px monospace';
        context.fillText('LOADING SPRITES...', w / 2, h / 2);
        const barW = w * 0.35, barH = w * 0.012;
        const pct = __spritesTotal > 0 ? __spritesLoaded / __spritesTotal : 0;
        context.fillStyle = '#333';
        context.fillRect(w / 2 - barW / 2, h / 2 + w * 0.025, barW, barH);
        context.fillStyle = color;
        context.fillRect(w / 2 - barW / 2, h / 2 + w * 0.025, barW * pct, barH);
    }



    // -- roundRect polyfill (Safari <16, older browsers) --
    if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
            if (!Array.isArray(radii)) radii = [radii || 0];
            const r = radii.map(v => Math.min(Math.max(0, v || 0), Math.min(w, h) / 2));
            while (r.length < 4) r.push(r[r.length - 1] || 0);
            this.moveTo(x + r[0], y);
            this.arcTo(x + w, y,     x + w, y + h, r[1]);
            this.arcTo(x + w, y + h, x,     y + h, r[2]);
            this.arcTo(x,     y + h, x,     y + h, r[3]);
            this.arcTo(x,     y,     x + w, y,     r[0]);
            this.closePath();
            return this;
        };
    }

    // ── Constants ──
    const GAME_W = 640, GAME_H = 480;
    const COLS = 20, ROWS = 15;
    const CELL = GAME_W / COLS; // 32
    const HUD_H = 40;
    const MAP_H = GAME_H - HUD_H;

    // Tower types: [name, cost, range, damage, fireRate(frames), color, upgradeCostMult]
    const TOWER_DEFS = [
        { name: 'Arrow',     cost: 50,  range: 3.5, dmg: 15,  rate: 20, color: '#22C55E', projColor: '#88FF88', projSpeed: 8, splash: 0,   slow: 0,   chain: 0, icon: 'A' },
        { name: 'Cannon',    cost: 80,  range: 2.5, dmg: 40,  rate: 50, color: '#F97316', projColor: '#FFAA44', projSpeed: 5, splash: 1.2, slow: 0,   chain: 0, icon: 'C' },
        { name: 'Ice',       cost: 60,  range: 3.0, dmg: 8,   rate: 30, color: '#38BDF8', projColor: '#88DDFF', projSpeed: 6, splash: 0,   slow: 0.5, chain: 0, icon: 'I' },
        { name: 'Lightning', cost: 100, range: 4.0, dmg: 25,  rate: 40, color: '#FBBF24', projColor: '#FFEE44', projSpeed: 12, splash: 0,  slow: 0,   chain: 3, icon: 'L' },
    ];

    // Enemy types: [name, hp, speed, reward, color, flying]
    const ENEMY_DEFS = [
        { name: 'Soldier', hp: 60,  speed: 1.0, reward: 10, color: '#EF4444', flying: false, size: 0.3 },
        { name: 'Runner',  hp: 35,  speed: 2.0, reward: 15, color: '#F59E0B', flying: false, size: 0.25 },
        { name: 'Tank',    hp: 200, speed: 0.5, reward: 25, color: '#8B5CF6', flying: false, size: 0.4 },
        { name: 'Flyer',   hp: 50,  speed: 1.5, reward: 20, color: '#EC4899', flying: true,  size: 0.28 },
    ];

    // Wave definitions: array of { type, count, delay(frames between spawns) }
    function buildWaves() {
        const waves = [];
        for (let w = 0; w < 20; w++) {
            const wave = [];
            // Gentle difficulty curve: first 5 waves are easy
            const diff = w < 5 ? 0.7 + w * 0.15 : 1 + (w - 3) * 0.4;
            // Base soldiers — fewer in early waves
            const soldierCount = w < 3 ? 3 + w : 5 + Math.floor(w * 1.2);
            wave.push({ type: 0, count: soldierCount, delay: 45 - Math.min(w, 15) });
            // Runners from wave 4 (was wave 3)
            if (w >= 3) wave.push({ type: 1, count: 2 + Math.floor((w - 2) * 0.8), delay: 35 });
            // Tanks from wave 6 (was wave 5)
            if (w >= 5) wave.push({ type: 2, count: 1 + Math.floor((w - 4) * 0.3), delay: 60 });
            // Flyers from wave 8 (was wave 7)
            if (w >= 7) wave.push({ type: 3, count: 2 + Math.floor((w - 6) * 0.4), delay: 45 });

            // Scale HP with wave
            for (const g of wave) {
                g.hpMult = diff;
            }
            waves.push(wave);
        }
        return waves;
    }

    // ── Path definition (grid cells the enemies walk) ──
    // Winding path from left to right
    const PATH_CELLS = [
        [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],
        [7,3],[7,4],[7,5],[7,6],
        [6,6],[5,6],[4,6],[3,6],[2,6],
        [2,7],[2,8],[2,9],[2,10],
        [3,10],[4,10],[5,10],[6,10],[7,10],[8,10],[9,10],[10,10],
        [10,9],[10,8],[10,7],[10,6],[10,5],[10,4],
        [11,4],[12,4],[13,4],[14,4],
        [14,5],[14,6],[14,7],[14,8],
        [15,8],[16,8],[17,8],
        [17,7],[17,6],[17,5],[17,4],[17,3],[17,2],
        [18,2],[19,2]
    ];

    // Flying path: straight left to right at middle
    const FLY_PATH = [];
    for (let c = 0; c <= COLS; c++) FLY_PATH.push([c, 7]);

    // ── State ──
    let canvas, ctx, W, H, scale;
    let animFrame = null;
    let audioCtx  = null;
    let player    = null;
    let onGameOver = null;
    let gameActive = false;

    const ST_TITLE    = 0;
    const ST_PLAYING  = 1;
    const ST_WAVE_END = 2;
    const ST_OVER     = 3;
    const ST_WIN      = 4;
    let state = ST_TITLE;

    let grid = [];          // ROWS x COLS: 0=empty, 1=path, 2=tower
    let towers = [];
    let enemies = [];
    let projectiles = [];
    let particles = [];
    let scorePopups = [];

    let money, lives, score, waveNum, totalWaves;
    let waveEnemies = [];   // enemies left to spawn in current wave
    let spawnTimer = 0;
    let waveTimer = 0;      // countdown between waves
    let selectedTowerType = 0;  // 0-3
    let selectedTower = null;   // tower object for upgrade UI
    let hoverCell = null;       // {r,c}
    let startTime;
    let WAVES;

    // Theme
    let BG_TOP   = '#0F1117';
    let BG_BOT   = '#1a1a2e';
    let ACCENT   = '#F43F5E';
    let ACCENT2  = '#3B82F6';
    let TC = ['#22C55E', '#F97316', '#38BDF8', '#FBBF24', '#A855F7', '#06B6D4'];

    // ── Audio ──
    function ensureAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch { audioCtx = null; }
        }
        return audioCtx;
    }

    function tone(freq, dur, type, vol, when) {
        const ac = ensureAudio();
        if (!ac) return;
        try {
            const t = when || ac.currentTime;
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = type || 'square';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(vol || 0.08, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.1));
            o.connect(g);
            g.connect(ac.destination);
            o.start(t);
            o.stop(t + (dur || 0.1));
        } catch { /* swallow */ }
    }

    function playShoot(type) {
        if (type === 0) tone(800, 0.05, 'square', 0.06);
        else if (type === 1) tone(200, 0.15, 'sawtooth', 0.08);
        else if (type === 2) tone(1200, 0.08, 'sine', 0.06);
        else tone(400, 0.1, 'sawtooth', 0.07);
    }
    function playHit()      { tone(300, 0.06, 'triangle', 0.05); }
    function playKill()     { tone(600, 0.1, 'sine', 0.08); tone(900, 0.08, 'sine', 0.06, ensureAudio()?.currentTime + 0.06); }
    function playPlace()    { tone(440, 0.08, 'square', 0.07); tone(660, 0.06, 'square', 0.05, ensureAudio()?.currentTime + 0.06); }
    function playUpgrade()  { const ac = ensureAudio(); if (!ac) return; const t = ac.currentTime; tone(523, 0.1, 'sine', 0.08, t); tone(659, 0.1, 'sine', 0.08, t + 0.08); tone(784, 0.12, 'sine', 0.08, t + 0.16); }
    function playWaveStart(){ tone(440, 0.15, 'triangle', 0.08); tone(550, 0.15, 'triangle', 0.06, ensureAudio()?.currentTime + 0.12); }
    function playLeak()     { tone(200, 0.3, 'sawtooth', 0.10); }
    function playGameOver() { const ac = ensureAudio(); if (!ac) return; const t = ac.currentTime; tone(440, 0.2, 'sawtooth', 0.10, t); tone(330, 0.25, 'sawtooth', 0.10, t + 0.18); tone(220, 0.4, 'sawtooth', 0.10, t + 0.38); }
    function playWin()      { const ac = ensureAudio(); if (!ac) return; const t = ac.currentTime; [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'sine', 0.10, t + i * 0.12)); }

    // ── Helpers ──
    function hexAlpha(hex, a) {
        let c = hex.replace('#', '');
        if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
        const n = parseInt(c, 16);
        return `rgba(${n >> 16},${(n >> 8) & 0xff},${n & 0xff},${a})`;
    }

    function cellToPixel(col, row) {
        return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 + HUD_H };
    }

    function pixelToCell(px, py) {
        const c = Math.floor(px / CELL);
        const r = Math.floor((py - HUD_H) / CELL);
        return { c: Math.max(0, Math.min(COLS - 1, c)), r: Math.max(0, Math.min(ROWS - 1, r)) };
    }

    function dist(x1, y1, x2, y2) {
        return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
    }

    // ── Particles ──
    function spawnBurst(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 4 + 1;
            particles.push({
                x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: 1.0, decay: Math.random() * 0.04 + 0.02,
                r: Math.random() * 3 + 1, color: color || '#FFF'
            });
        }
    }

    function spawnScorePopup(x, y, text, color) {
        scorePopups.push({ x, y, text, color: color || '#FFD700', life: 1.0, vy: -1.2 });
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.04; p.vx *= 0.97;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const p = scorePopups[i];
            p.y += p.vy; p.life -= 0.025;
            if (p.life <= 0) scorePopups.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = p.life * 0.8;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        for (const p of scorePopups) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.text, p.x, p.y);
        }
        ctx.globalAlpha = 1;
    }

    // ── Canvas fit (DPR-aware) ──
    function fitCanvas() {
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;

        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const aspect = GAME_W / GAME_H;
        let w, h;
        if (cw / ch > aspect) { h = ch; w = ch * aspect; }
        else { w = cw; h = cw / aspect; }

        const dpr = window.devicePixelRatio || 1;
        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width  = Math.round(w) + 'px';
        canvas.style.height = Math.round(h) + 'px';
        W = GAME_W;
        H = GAME_H;
        scale = (w * dpr) / GAME_W;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }

    function onResize() { fitCanvas(); }

    // ── Grid & path setup ──
    function buildGrid() {
        grid = [];
        for (let r = 0; r < ROWS; r++) {
            grid[r] = [];
            for (let c = 0; c < COLS; c++) grid[r][c] = 0;
        }
        // Mark path cells
        for (const [c, r] of PATH_CELLS) {
            if (r >= 0 && r < ROWS && c >= 0 && c < COLS) grid[r][c] = 1;
        }
    }

    // ── Drawing: Map ──
    function drawMap() {
        // Background
        const bgGrad = ctx.createLinearGradient(0, HUD_H, 0, GAME_H);
        bgGrad.addColorStop(0, '#1a2e1a');
        bgGrad.addColorStop(1, '#0a1a0a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, HUD_H, GAME_W, MAP_H);

        // Grid cells
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const px = c * CELL;
                const py = r * CELL + HUD_H;
                if (grid[r][c] === 1) {
                    // Path with depth
                    const pathGrad = ctx.createLinearGradient(px, py, px, py + CELL);
                    pathGrad.addColorStop(0, '#5A4738');
                    pathGrad.addColorStop(0.5, '#4A3728');
                    pathGrad.addColorStop(1, '#3A2718');
                    ctx.fillStyle = pathGrad;
                    ctx.fillRect(px, py, CELL, CELL);
                    // Path edge highlights
                    ctx.fillStyle = hexAlpha('#8B7355', 0.2);
                    ctx.fillRect(px + 1, py + 1, CELL - 2, 2);
                } else {
                    // Grass with subtle variation
                    const grassBase = ((r + c) % 2 === 0) ? '#1B3A1B' : '#1E3E1E';
                    ctx.fillStyle = grassBase;
                    ctx.fillRect(px, py, CELL, CELL);
                    // Occasional grass highlight
                    if ((r * 7 + c * 13) % 5 === 0) {
                        ctx.fillStyle = 'rgba(100,200,100,0.06)';
                        ctx.fillRect(px, py, CELL, CELL);
                    }
                }
            }
        }

        // Grid lines (subtle)
        ctx.strokeStyle = hexAlpha('#FFF', 0.04);
        ctx.lineWidth = 0.5;
        for (let c = 0; c <= COLS; c++) {
            ctx.beginPath();
            ctx.moveTo(c * CELL, HUD_H);
            ctx.lineTo(c * CELL, GAME_H);
            ctx.stroke();
        }
        for (let r = 0; r <= ROWS; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * CELL + HUD_H);
            ctx.lineTo(GAME_W, r * CELL + HUD_H);
            ctx.stroke();
        }

        // Path direction arrows (subtle)
        ctx.fillStyle = hexAlpha('#FFF', 0.08);
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < PATH_CELLS.length - 1; i += 4) {
            const [c1, r1] = PATH_CELLS[i];
            const [c2, r2] = PATH_CELLS[Math.min(i + 1, PATH_CELLS.length - 1)];
            const p = cellToPixel(c1, r1);
            const dx = c2 - c1, dy = r2 - r1;
            let arrow = '>';
            if (dx < 0) arrow = '<';
            else if (dy > 0) arrow = 'v';
            else if (dy < 0) arrow = '^';
            ctx.fillText(arrow, p.x, p.y);
        }

        // Hover highlight
        if (hoverCell && state === ST_PLAYING) {
            const { r, c } = hoverCell;
            if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
                const px = c * CELL;
                const py = r * CELL + HUD_H;
                if (grid[r][c] === 0) {
                    // Valid placement with glow
                    const td = TOWER_DEFS[selectedTowerType];
                    ctx.fillStyle = hexAlpha(td.color, 0.25);
                    ctx.fillRect(px, py, CELL, CELL);
                    // Pulsing border on hover cell
                    const hPulse = Math.sin(Date.now() * 0.005) * 0.2 + 0.5;
                    ctx.strokeStyle = hexAlpha(td.color, hPulse);
                    ctx.lineWidth = 2;
                    ctx.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2);
                    // Range preview with glow
                    const cp = cellToPixel(c, r);
                    ctx.save();
                    ctx.shadowColor = td.color;
                    ctx.shadowBlur = 8;
                    // Range fill
                    const rGrad = ctx.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, td.range * CELL);
                    rGrad.addColorStop(0, hexAlpha(td.color, 0.08));
                    rGrad.addColorStop(0.8, hexAlpha(td.color, 0.04));
                    rGrad.addColorStop(1, hexAlpha(td.color, 0));
                    ctx.fillStyle = rGrad;
                    ctx.beginPath();
                    ctx.arc(cp.x, cp.y, td.range * CELL, 0, Math.PI * 2);
                    ctx.fill();
                    // Range ring
                    ctx.strokeStyle = hexAlpha(td.color, 0.4);
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(cp.x, cp.y, td.range * CELL, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                } else if (grid[r][c] === 1) {
                    ctx.fillStyle = hexAlpha('#FF0000', 0.15);
                    ctx.fillRect(px, py, CELL, CELL);
                }
            }
        }

        // Entry/exit markers
        const entry = cellToPixel(PATH_CELLS[0][0], PATH_CELLS[0][1]);
        const exit  = cellToPixel(PATH_CELLS[PATH_CELLS.length - 1][0], PATH_CELLS[PATH_CELLS.length - 1][1]);
        ctx.fillStyle = '#22FF22';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('IN', entry.x - CELL, entry.y);
        ctx.fillStyle = '#FF4444';
        ctx.fillText('OUT', exit.x + CELL * 0.5, exit.y);
    }

    // ── Drawing: Towers ──
    function drawTowers() {
        for (const t of towers) {
            drawTower(t);
        }
    }

    function drawTower(t) {
        const td = TOWER_DEFS[t.type];
        const { x, y } = cellToPixel(t.c, t.r);
        const lvl = t.level;
        const baseColor = td.color;

        ctx.save();

        // Base platform with depth
        const baseGrad = ctx.createLinearGradient(x - CELL * 0.4, y - CELL * 0.4, x + CELL * 0.4, y + CELL * 0.4);
        baseGrad.addColorStop(0, '#444');
        baseGrad.addColorStop(0.5, '#555');
        baseGrad.addColorStop(1, '#2A2A2A');
        ctx.fillStyle = baseGrad;
        ctx.beginPath();
        ctx.roundRect(x - CELL * 0.4, y - CELL * 0.4, CELL * 0.8, CELL * 0.8, [4]);
        ctx.fill();
        // Base highlight
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.roundRect(x - CELL * 0.38, y - CELL * 0.38, CELL * 0.76, CELL * 0.3, [3]);
        ctx.fill();

        // Tower body with gradient for 3D look
        const bodyR = CELL * (0.28 + lvl * 0.03);
        const bodyGrad = ctx.createRadialGradient(x - bodyR * 0.3, y - bodyR * 0.3, 0, x, y, bodyR);
        bodyGrad.addColorStop(0, hexAlpha(baseColor, 1));
        bodyGrad.addColorStop(0.7, baseColor);
        bodyGrad.addColorStop(1, hexAlpha('#000', 0.3));
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(x, y, bodyR, 0, Math.PI * 2);
        ctx.fill();
        // Highlight on tower body
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(x - bodyR * 0.2, y - bodyR * 0.2, bodyR * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Level indicator rings with glow
        for (let l = 0; l < lvl; l++) {
            ctx.save();
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 4;
            ctx.strokeStyle = hexAlpha('#FFD700', 0.7);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x, y, bodyR + 3 + l * 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Turret (rotates toward target)
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t.angle || 0);

        const turretLen = CELL * (0.35 + lvl * 0.04);
        const turretW   = 3 + lvl;

        if (t.type === 0) {
            // Arrow: thin barrel
            ctx.fillStyle = hexAlpha(baseColor, 0.8);
            ctx.fillRect(-turretW / 2, -turretLen, turretW, turretLen);
            // Tip
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.moveTo(-turretW, -turretLen);
            ctx.lineTo(0, -turretLen - 5);
            ctx.lineTo(turretW, -turretLen);
            ctx.closePath();
            ctx.fill();
        } else if (t.type === 1) {
            // Cannon: thick barrel
            ctx.fillStyle = '#555';
            ctx.fillRect(-turretW * 0.8, -turretLen, turretW * 1.6, turretLen);
            // Muzzle
            ctx.fillStyle = '#777';
            ctx.fillRect(-turretW, -turretLen - 2, turretW * 2, 4);
        } else if (t.type === 2) {
            // Ice: crystal barrel
            ctx.fillStyle = hexAlpha('#88DDFF', 0.8);
            ctx.beginPath();
            ctx.moveTo(0, -turretLen - 4);
            ctx.lineTo(-turretW, -turretLen * 0.3);
            ctx.lineTo(-turretW * 0.5, 0);
            ctx.lineTo(turretW * 0.5, 0);
            ctx.lineTo(turretW, -turretLen * 0.3);
            ctx.closePath();
            ctx.fill();
        } else {
            // Lightning: coil
            ctx.strokeStyle = '#FFEE44';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i <= 6; i++) {
                const py = -i * turretLen / 6;
                const px = (i % 2 === 0 ? -1 : 1) * 4;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
            // Orb at tip
            ctx.fillStyle = '#FFEE44';
            ctx.shadowColor = '#FFEE44';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(0, -turretLen, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        ctx.restore(); // turret rotation

        // Fire animation flash
        if (t.fireFlash > 0) {
            ctx.fillStyle = hexAlpha('#FFF', t.fireFlash * 0.4);
            ctx.beginPath();
            ctx.arc(x, y, bodyR + 5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Selected tower highlight with glowing range circle
        if (selectedTower === t) {
            // Soft fill for range area
            const rangeGrad = ctx.createRadialGradient(x, y, bodyR, x, y, t.rangePx);
            rangeGrad.addColorStop(0, hexAlpha(baseColor, 0.1));
            rangeGrad.addColorStop(0.7, hexAlpha(baseColor, 0.05));
            rangeGrad.addColorStop(1, hexAlpha(baseColor, 0));
            ctx.fillStyle = rangeGrad;
            ctx.beginPath();
            ctx.arc(x, y, t.rangePx, 0, Math.PI * 2);
            ctx.fill();
            // Glowing ring
            ctx.save();
            ctx.shadowColor = baseColor;
            ctx.shadowBlur = 10;
            ctx.strokeStyle = hexAlpha(baseColor, 0.6);
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.arc(x, y, t.rangePx, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
            // Inner solid ring
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(x, y, bodyR + 8, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    // ── Drawing: Enemies ──
    function drawEnemies() {
        for (const e of enemies) {
            if (e.dead) continue;
            drawEnemy(e);
        }
    }

    function drawEnemy(e) {
        // Sprite enemies
        const _eNames = ['enemySoldier','enemyRunner','enemyTank','enemyFlyer'];
        const _ek = _eNames[e.type] || 'enemySoldier';
        const _esz = CELL * (ENEMY_DEFS[e.type]?.size || 0.3) * 2.5;
        if (__sprites[_ek]) {
            ctx.drawImage(__sprites[_ek], e.drawX - _esz/2, e.drawY - _esz/2, _esz, _esz);
            // Health bar above head with gradient
            if (e.hp < e.maxHp) {
                const hpR = e.hp / e.maxHp;
                const barW = _esz * 0.9, barH = 4;
                const hbx = e.drawX - barW/2, hby = e.drawY - _esz/2 - 8;
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(hbx - 1, hby - 1, barW + 2, barH + 2);
                const hpCol = hpR > 0.5 ? '#22C55E' : hpR > 0.25 ? '#F59E0B' : '#EF4444';
                const hpLi = hpR > 0.5 ? '#4ADE80' : hpR > 0.25 ? '#FCD34D' : '#FCA5A5';
                const hpG = ctx.createLinearGradient(hbx, hby, hbx, hby + barH);
                hpG.addColorStop(0, hpLi);
                hpG.addColorStop(1, hpCol);
                ctx.fillStyle = hpG;
                ctx.fillRect(hbx, hby, barW * hpR, barH);
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.fillRect(hbx, hby, barW * hpR, barH * 0.4);
            }
            return;
        }
        const ed = ENEMY_DEFS[e.type];
        const sz = CELL * ed.size;

        ctx.save();

        // Slow effect tint
        if (e.slowTimer > 0) {
            ctx.shadowColor = '#88DDFF';
            ctx.shadowBlur = 8;
        }

        // Body
        ctx.fillStyle = ed.color;
        if (ed.flying) {
            // Flying: diamond shape
            ctx.beginPath();
            ctx.moveTo(e.x, e.y - sz);
            ctx.lineTo(e.x + sz, e.y);
            ctx.lineTo(e.x, e.y + sz * 0.6);
            ctx.lineTo(e.x - sz, e.y);
            ctx.closePath();
            ctx.fill();
            // Wings
            ctx.strokeStyle = hexAlpha(ed.color, 0.5);
            ctx.lineWidth = 2;
            const wingFlap = Math.sin(Date.now() * 0.015) * 4;
            ctx.beginPath();
            ctx.moveTo(e.x - sz * 0.5, e.y);
            ctx.lineTo(e.x - sz * 1.5, e.y - wingFlap);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(e.x + sz * 0.5, e.y);
            ctx.lineTo(e.x + sz * 1.5, e.y - wingFlap);
            ctx.stroke();
        } else if (e.type === 2) {
            // Tank: square
            ctx.beginPath();
            ctx.roundRect(e.x - sz, e.y - sz, sz * 2, sz * 2, [3]);
            ctx.fill();
            // Armor lines
            ctx.strokeStyle = hexAlpha('#FFF', 0.2);
            ctx.lineWidth = 1;
            ctx.strokeRect(e.x - sz + 2, e.y - sz + 2, sz * 2 - 4, sz * 2 - 4);
        } else {
            // Circle enemies
            ctx.beginPath();
            ctx.arc(e.x, e.y, sz, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.shadowBlur = 0;

        // Eyes (direction-aware)
        if (!ed.flying) {
            const eyeOff = sz * 0.35;
            const eyeR   = sz * 0.15;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(e.x - eyeOff * 0.5, e.y - eyeOff * 0.3, eyeR, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(e.x + eyeOff * 0.5, e.y - eyeOff * 0.3, eyeR, 0, Math.PI * 2);
            ctx.fill();
            // Pupils
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(e.x - eyeOff * 0.5 + e.dx * 1.5, e.y - eyeOff * 0.3 + e.dy * 1.5, eyeR * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(e.x + eyeOff * 0.5 + e.dx * 1.5, e.y - eyeOff * 0.3 + e.dy * 1.5, eyeR * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // HP bar — positioned well above the head
        const hpRatio = e.hp / e.maxHp;
        if (hpRatio < 1) {
            const barW = sz * 2.5;
            const barH = 4;
            const bx = e.x - barW / 2;
            const by = e.y - sz - 10;
            // Background with border
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(bx - 1, by - 1, barW + 2, barH + 2, 2);
            else ctx.rect(bx - 1, by - 1, barW + 2, barH + 2);
            ctx.fill();
            // HP fill with gradient
            const hpColor = hpRatio > 0.5 ? '#22C55E' : hpRatio > 0.25 ? '#F59E0B' : '#EF4444';
            const hpLight = hpRatio > 0.5 ? '#4ADE80' : hpRatio > 0.25 ? '#FCD34D' : '#FCA5A5';
            const hpGrad = ctx.createLinearGradient(bx, by, bx, by + barH);
            hpGrad.addColorStop(0, hpLight);
            hpGrad.addColorStop(1, hpColor);
            ctx.fillStyle = hpGrad;
            ctx.fillRect(bx, by, barW * hpRatio, barH);
            // Highlight on HP bar
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillRect(bx, by, barW * hpRatio, barH * 0.4);
        }

        ctx.restore();
    }

    // ── Drawing: Projectiles ──
    function drawProjectiles() {
        for (const p of projectiles) {
            ctx.save();

            if (p.chain) {
                // Lightning bolt
                ctx.strokeStyle = '#FFEE44';
                ctx.shadowColor = '#FFEE44';
                ctx.shadowBlur = 10;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(p.sx, p.sy);
                // Zigzag to target
                const segs = 5;
                for (let i = 1; i <= segs; i++) {
                    const t = i / segs;
                    const mx = p.sx + (p.x - p.sx) * t;
                    const my = p.sy + (p.y - p.sy) * t;
                    const off = (i < segs) ? (Math.random() - 0.5) * 12 : 0;
                    ctx.lineTo(mx + off, my + off);
                }
                ctx.stroke();
                ctx.shadowBlur = 0;
            } else {
                // Trail with gradient fade
                const trailGrad = ctx.createLinearGradient(p.sx, p.sy, p.x, p.y);
                trailGrad.addColorStop(0, hexAlpha(p.color, 0));
                trailGrad.addColorStop(0.5, hexAlpha(p.color, 0.2));
                trailGrad.addColorStop(1, hexAlpha(p.color, 0.5));
                ctx.strokeStyle = trailGrad;
                ctx.lineWidth = p.splash ? 3 : 2;
                ctx.beginPath();
                ctx.moveTo(p.sx, p.sy);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();

                // Projectile with glow
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.splash ? 5 : 3.5, 0, Math.PI * 2);
                ctx.fill();
                // Bright core
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.splash ? 2.5 : 1.5, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.shadowBlur = 0;
            ctx.restore();
        }
    }

    // ── Drawing: HUD ──
    function drawHUD() {
        ctx.save();

        // HUD background
        ctx.fillStyle = hexAlpha('#000', 0.8);
        ctx.fillRect(0, 0, GAME_W, HUD_H);

        ctx.textBaseline = 'middle';
        const y = HUD_H / 2;

        // Money
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('$' + money, 10, y);

        // Lives
        ctx.fillStyle = '#EF4444';
        ctx.fillText('HP: ' + lives, 100, y);

        // Wave
        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'center';
        ctx.fillText('Wave ' + (waveNum + 1) + '/' + totalWaves, GAME_W / 2, y);

        // Score
        ctx.fillStyle = '#AAA';
        ctx.textAlign = 'right';
        ctx.fillText('Score: ' + score, GAME_W - 10, y);

        // Tower selector buttons
        const btnW = 50, btnH = 30;
        const btnY = HUD_H + 2;
        for (let i = 0; i < 4; i++) {
            const td = TOWER_DEFS[i];
            const bx = GAME_W - 4 * (btnW + 4) + i * (btnW + 4);
            const by = GAME_H - btnH - 4;
            const affordable = money >= td.cost;

            ctx.fillStyle = (selectedTowerType === i) ? hexAlpha(td.color, 0.4) : hexAlpha('#333', 0.7);
            ctx.beginPath();
            ctx.roundRect(bx, by, btnW, btnH, [4]);
            ctx.fill();

            ctx.strokeStyle = (selectedTowerType === i) ? td.color : '#666';
            ctx.lineWidth = (selectedTowerType === i) ? 2 : 1;
            ctx.beginPath();
            ctx.roundRect(bx, by, btnW, btnH, [4]);
            ctx.stroke();

            ctx.fillStyle = affordable ? td.color : '#666';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(td.icon + ' $' + td.cost, bx + btnW / 2, by + btnH / 2);
        }

        // Upgrade menu for selected tower
        if (selectedTower && state === ST_PLAYING) {
            drawUpgradeMenu();
        }

        ctx.restore();
    }

    function drawUpgradeMenu() {
        const t = selectedTower;
        const td = TOWER_DEFS[t.type];
        const { x, y } = cellToPixel(t.c, t.r);

        const mw = 120, mh = 60;
        let mx = x - mw / 2;
        let my = y - CELL - mh - 5;
        if (my < HUD_H + 5) my = y + CELL + 5;
        if (mx < 5) mx = 5;
        if (mx + mw > GAME_W - 5) mx = GAME_W - mw - 5;

        // Background
        ctx.fillStyle = hexAlpha('#000', 0.85);
        ctx.beginPath();
        ctx.roundRect(mx, my, mw, mh, [6]);
        ctx.fill();
        ctx.strokeStyle = td.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(mx, my, mw, mh, [6]);
        ctx.stroke();

        ctx.textAlign = 'center';

        // Tower name + level
        ctx.fillStyle = td.color;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(td.name + ' Lv.' + (t.level + 1), mx + mw / 2, my + 14);

        // Stats
        ctx.fillStyle = '#AAA';
        ctx.font = '10px sans-serif';
        ctx.fillText('DMG: ' + Math.floor(t.dmg) + '  RNG: ' + t.rangeCells.toFixed(1), mx + mw / 2, my + 30);

        if (t.level < 2) {
            const cost = Math.floor(td.cost * (t.level + 1) * 0.8);
            const affordable = money >= cost;
            // Upgrade button
            ctx.fillStyle = affordable ? hexAlpha('#22C55E', 0.5) : hexAlpha('#666', 0.3);
            ctx.beginPath();
            ctx.roundRect(mx + 10, my + 38, mw - 20, 16, [3]);
            ctx.fill();
            ctx.fillStyle = affordable ? '#22C55E' : '#666';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText('UPGRADE $' + cost, mx + mw / 2, my + 48);
        } else {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText('MAX LEVEL', mx + mw / 2, my + 48);
        }
    }

    // ── Game logic ──
    function startGame() {
        state = ST_PLAYING;
        gameActive = true;
        money = 300;
        lives = 25;
        score = 0;
        waveNum = 0;
        WAVES = buildWaves();
        totalWaves = WAVES.length;
        towers = [];
        enemies = [];
        projectiles = [];
        particles = [];
        scorePopups = [];
        selectedTowerType = 0;
        selectedTower = null;
        hoverCell = null;
        startTime = Date.now();

        buildGrid();
        startWave();
    }

    function startWave() {
        waveEnemies = [];
        const wave = WAVES[waveNum];
        for (const group of wave) {
            for (let i = 0; i < group.count; i++) {
                waveEnemies.push({
                    type: group.type,
                    delay: group.delay * i + (waveEnemies.length > 0 ? 20 : 0),
                    hpMult: group.hpMult
                });
            }
        }
        // Shuffle a bit for variety
        for (let i = waveEnemies.length - 1; i > 0; i--) {
            waveEnemies[i].delay += i * 8; // stagger
        }
        spawnTimer = 0;
        playWaveStart();
    }

    function spawnEnemy(type, hpMult) {
        const ed = ENEMY_DEFS[type];
        const path = ed.flying ? FLY_PATH : PATH_CELLS;
        const start = cellToPixel(path[0][0], path[0][1]);
        enemies.push({
            type,
            x: start.x - CELL,
            y: start.y,
            hp: ed.hp * hpMult,
            maxHp: ed.hp * hpMult,
            speed: ed.speed,
            baseSpeed: ed.speed,
            pathIdx: 0,
            path,
            dead: false,
            slowTimer: 0,
            dx: 1, dy: 0
        });
    }

    function placeTower(r, c) {
        if (grid[r][c] !== 0) return false;
        const td = TOWER_DEFS[selectedTowerType];
        if (money < td.cost) return false;

        money -= td.cost;
        grid[r][c] = 2;

        towers.push({
            type: selectedTowerType,
            r, c,
            level: 0,
            dmg: td.dmg,
            rangeCells: td.range,
            rangePx: td.range * CELL,
            rate: td.rate,
            cooldown: 0,
            angle: 0,
            fireFlash: 0,
            target: null
        });

        playPlace();
        return true;
    }

    function upgradeTower(t) {
        if (t.level >= 2) return;
        const td = TOWER_DEFS[t.type];
        const cost = Math.floor(td.cost * (t.level + 1) * 0.8);
        if (money < cost) return;

        money -= cost;
        t.level++;
        t.dmg = td.dmg * (1 + t.level * 0.5);
        t.rangeCells = td.range + t.level * 0.5;
        t.rangePx = t.rangeCells * CELL;
        t.rate = Math.max(10, td.rate - t.level * 5);

        spawnBurst(cellToPixel(t.c, t.r).x, cellToPixel(t.c, t.r).y, 12, '#FFD700');
        playUpgrade();
    }

    function update() {
        if (state !== ST_PLAYING && state !== ST_WAVE_END) return;

        // Spawn enemies
        if (waveEnemies.length > 0) {
            spawnTimer++;
            // Find next enemy to spawn
            for (let i = waveEnemies.length - 1; i >= 0; i--) {
                if (spawnTimer >= waveEnemies[i].delay) {
                    spawnEnemy(waveEnemies[i].type, waveEnemies[i].hpMult);
                    waveEnemies.splice(i, 1);
                }
            }
        }

        // Update enemies
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (e.dead) { enemies.splice(i, 1); continue; }

            // Slow effect
            if (e.slowTimer > 0) {
                e.slowTimer--;
                e.speed = e.baseSpeed * 0.4;
            } else {
                e.speed = e.baseSpeed;
            }

            // Move along path
            const path = e.path;
            if (e.pathIdx < path.length) {
                const target = cellToPixel(path[e.pathIdx][0], path[e.pathIdx][1]);
                const dx = target.x - e.x;
                const dy = target.y - e.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                const moveSpeed = e.speed * 1.2;

                if (d < moveSpeed) {
                    e.x = target.x;
                    e.y = target.y;
                    e.pathIdx++;
                } else {
                    e.dx = dx / d;
                    e.dy = dy / d;
                    e.x += e.dx * moveSpeed;
                    e.y += e.dy * moveSpeed;
                }
            }

            // Reached end
            if (e.pathIdx >= path.length) {
                lives--;
                e.dead = true;
                playLeak();
                spawnBurst(e.x, e.y, 8, '#EF4444');
                if (lives <= 0) {
                    endGame(false);
                    return;
                }
            }
        }

        // Update towers
        for (const t of towers) {
            t.fireFlash = Math.max(0, (t.fireFlash || 0) - 0.05);
            t.cooldown = Math.max(0, t.cooldown - 1);

            const pos = cellToPixel(t.c, t.r);
            const td = TOWER_DEFS[t.type];

            // Find target (closest to exit)
            let bestEnemy = null;
            let bestProgress = -1;
            for (const e of enemies) {
                if (e.dead) continue;
                // Lightning can hit flying, others only ground (unless flying enemy)
                if (ENEMY_DEFS[e.type].flying && t.type !== 3 && t.type !== 0) continue;
                const d = dist(pos.x, pos.y, e.x, e.y);
                if (d <= t.rangePx && e.pathIdx > bestProgress) {
                    bestEnemy = e;
                    bestProgress = e.pathIdx;
                }
            }

            // Rotate toward target
            if (bestEnemy) {
                const targetAngle = Math.atan2(bestEnemy.y - pos.y, bestEnemy.x - pos.x) + Math.PI / 2;
                // Smooth rotation
                let diff = targetAngle - (t.angle || 0);
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                t.angle = (t.angle || 0) + diff * 0.15;
            }

            // Fire
            if (bestEnemy && t.cooldown <= 0) {
                t.cooldown = t.rate;
                t.fireFlash = 1;
                fireProjectile(t, pos, bestEnemy, td);
                playShoot(t.type);
            }
        }

        // Update projectiles
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];

            if (p.chain) {
                // Instant hit for lightning
                p.life--;
                if (p.life <= 0) projectiles.splice(i, 1);
                continue;
            }

            // Move toward target position
            const dx = p.tx - p.x;
            const dy = p.ty - p.y;
            const d = Math.sqrt(dx * dx + dy * dy);

            if (d < p.speed) {
                // Hit
                handleProjectileHit(p);
                projectiles.splice(i, 1);
            } else {
                p.x += (dx / d) * p.speed;
                p.y += (dy / d) * p.speed;
                p.life--;
                if (p.life <= 0) projectiles.splice(i, 1);
            }
        }

        // Check wave completion
        if (waveEnemies.length === 0 && enemies.length === 0 && state === ST_PLAYING) {
            if (waveNum >= totalWaves - 1) {
                endGame(true);
            } else {
                waveNum++;
                waveTimer = 120; // 2 second pause
                state = ST_WAVE_END;
            }
        }

        // Wave end countdown
        if (state === ST_WAVE_END) {
            waveTimer--;
            if (waveTimer <= 0) {
                state = ST_PLAYING;
                startWave();
            }
        }

        updateParticles();
    }

    function fireProjectile(tower, pos, enemy, td) {
        if (td.chain > 0) {
            // Lightning: instant chain damage
            const targets = [enemy];
            let chainCount = td.chain + tower.level;
            let last = enemy;
            for (let c = 0; c < chainCount; c++) {
                let nearest = null;
                let nearDist = CELL * 3;
                for (const e of enemies) {
                    if (e.dead || targets.includes(e)) continue;
                    const d = dist(last.x, last.y, e.x, e.y);
                    if (d < nearDist) { nearest = e; nearDist = d; }
                }
                if (nearest) { targets.push(nearest); last = nearest; }
                else break;
            }
            // Apply damage to all chain targets
            let prevX = pos.x, prevY = pos.y;
            for (const t of targets) {
                damageEnemy(t, tower.dmg * (tower.level >= 2 ? 1.5 : 1));
                projectiles.push({
                    x: t.x, y: t.y, sx: prevX, sy: prevY,
                    tx: t.x, ty: t.y, speed: 0,
                    color: td.projColor, chain: true, life: 8,
                    splash: 0, slow: 0, dmg: 0
                });
                prevX = t.x; prevY = t.y;
            }
        } else {
            // Regular projectile
            projectiles.push({
                x: pos.x, y: pos.y, sx: pos.x, sy: pos.y,
                tx: enemy.x, ty: enemy.y,
                speed: td.projSpeed,
                color: td.projColor,
                chain: false,
                life: 120,
                splash: td.splash * CELL * (1 + tower.level * 0.3),
                slow: td.slow,
                dmg: tower.dmg * (tower.level >= 2 ? 1.5 : 1),
                targetEnemy: enemy
            });
        }
    }

    function handleProjectileHit(p) {
        if (p.splash > 0) {
            // Splash damage
            spawnBurst(p.x, p.y, 10, p.color);
            for (const e of enemies) {
                if (e.dead) continue;
                if (dist(e.x, e.y, p.x, p.y) < p.splash) {
                    damageEnemy(e, p.dmg);
                    if (p.slow > 0) e.slowTimer = 90;
                }
            }
        } else {
            // Single target
            if (p.targetEnemy && !p.targetEnemy.dead) {
                damageEnemy(p.targetEnemy, p.dmg);
                if (p.slow > 0) p.targetEnemy.slowTimer = 90;
                spawnBurst(p.x, p.y, 5, p.color);
            }
        }
        playHit();
    }

    function damageEnemy(e, dmg) {
        e.hp -= dmg;
        if (e.hp <= 0 && !e.dead) {
            e.dead = true;
            const ed = ENEMY_DEFS[e.type];
            money += ed.reward;
            score += ed.reward * 2;
            spawnBurst(e.x, e.y, 12, ed.color);
            spawnScorePopup(e.x, e.y - 10, '+$' + ed.reward, '#FFD700');
            playKill();
        }
    }

    function endGame(won) {
        state = won ? ST_WIN : ST_OVER;
        gameActive = false;
        if (won) playWin(); else playGameOver();
        const duration = Math.floor((Date.now() - (startTime || Date.now())) / 1000);
        if (onGameOver) onGameOver({
            score,
            level: waveNum + 1,
            duration,
            wavesCleared: waveNum,
            won
        });
    }

    // ── Drawing ──
    function draw(time) {
        ctx.save();

        if (state === ST_TITLE) {
            drawTitleScreen(time);
        } else {
            drawMap();
            drawTowers();
            drawEnemies();
            drawProjectiles();
            drawParticles();
            drawHUD();

            if (state === ST_WAVE_END) {
                drawWaveTransition(time);
            } else if (state === ST_OVER) {
                drawGameOverScreen(time);
            } else if (state === ST_WIN) {
                drawWinScreen(time);
            }
        }

        ctx.restore();
    }

    function drawTitleScreen(time) {
        // Background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, GAME_H);
        bgGrad.addColorStop(0, '#1a2e1a');
        bgGrad.addColorStop(1, '#0a1a0a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Sample grid pattern
        ctx.fillStyle = hexAlpha('#FFF', 0.03);
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if ((r + c) % 2 === 0) ctx.fillRect(c * CELL, r * CELL + HUD_H, CELL, CELL);
            }
        }

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const bob = Math.sin((time || 0) * 0.003) * 5;

        // Title
        ctx.font = 'bold 42px "Segoe UI", system-ui, sans-serif';
        const tg = ctx.createLinearGradient(GAME_W / 2 - 180, 0, GAME_W / 2 + 180, 0);
        tg.addColorStop(0, '#22C55E');
        tg.addColorStop(0.3, '#FFD700');
        tg.addColorStop(0.6, '#38BDF8');
        tg.addColorStop(1, '#FBBF24');
        ctx.fillStyle = tg;
        ctx.shadowColor = '#22C55E';
        ctx.shadowBlur = 20;
        ctx.fillText('TOWER DEFENSE', GAME_W / 2, GAME_H / 2 - 80 + bob);
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.font = '16px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#AAA';
        ctx.fillText('Place towers to stop enemy waves!', GAME_W / 2, GAME_H / 2 - 30);

        // Tower icons preview
        for (let i = 0; i < 4; i++) {
            const td = TOWER_DEFS[i];
            const px = GAME_W / 2 - 90 + i * 60;
            const py = GAME_H / 2 + 20;
            ctx.fillStyle = td.color;
            ctx.beginPath();
            ctx.arc(px, py, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(td.icon, px, py + 1);
            ctx.fillStyle = '#888';
            ctx.font = '10px sans-serif';
            ctx.fillText(td.name, px, py + 25);
        }

        // Controls
        ctx.font = '13px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#888';
        ctx.fillText('Click to place towers, click tower to upgrade', GAME_W / 2, GAME_H / 2 + 70);
        ctx.fillText('1-4 keys to select tower type', GAME_W / 2, GAME_H / 2 + 88);

        // Start
        const blink = Math.sin((time || 0) * 0.005) * 0.3 + 0.7;
        ctx.globalAlpha = blink;
        ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFF';
        ctx.fillText('TAP or PRESS SPACE to START', GAME_W / 2, GAME_H / 2 + 130);
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    function drawWaveTransition(time) {
        const blink = Math.sin((time || 0) * 0.008) * 0.3 + 0.7;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = hexAlpha('#FFD700', blink);
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 15;
        ctx.fillText('Wave ' + (waveNum + 1) + ' incoming...', GAME_W / 2, GAME_H / 2);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    function drawGameOverScreen(time) {
        ctx.save();
        ctx.fillStyle = hexAlpha('#000', 0.65);
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = 'bold 40px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#EF4444';
        ctx.shadowColor = '#EF4444';
        ctx.shadowBlur = 20;
        ctx.fillText('GAME OVER', GAME_W / 2, GAME_H / 2 - 60);
        ctx.shadowBlur = 0;

        ctx.font = '18px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('Score: ' + score, GAME_W / 2, GAME_H / 2 - 10);
        ctx.fillStyle = '#AAA';
        ctx.fillText('Survived ' + (waveNum + 1) + ' waves', GAME_W / 2, GAME_H / 2 + 20);

        const blink = Math.sin((time || 0) * 0.005) * 0.3 + 0.7;
        ctx.globalAlpha = blink;
        ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFF';
        ctx.fillText('TAP or PRESS SPACE to RESTART', GAME_W / 2, GAME_H / 2 + 70);
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    function drawWinScreen(time) {
        ctx.save();
        ctx.fillStyle = hexAlpha('#000', 0.55);
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = 'bold 44px "Segoe UI", system-ui, sans-serif';
        const tg = ctx.createLinearGradient(GAME_W / 2 - 120, 0, GAME_W / 2 + 120, 0);
        tg.addColorStop(0, '#FFD700');
        tg.addColorStop(0.5, '#FFF');
        tg.addColorStop(1, '#FFD700');
        ctx.fillStyle = tg;
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 25;
        ctx.fillText('VICTORY!', GAME_W / 2, GAME_H / 2 - 60);
        ctx.shadowBlur = 0;

        ctx.font = '20px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('Score: ' + score, GAME_W / 2, GAME_H / 2 - 10);
        ctx.fillStyle = '#22C55E';
        ctx.fillText('All ' + totalWaves + ' waves defeated!', GAME_W / 2, GAME_H / 2 + 20);
        ctx.fillStyle = '#AAA';
        ctx.fillText('Lives remaining: ' + lives, GAME_W / 2, GAME_H / 2 + 48);

        const blink = Math.sin((time || 0) * 0.005) * 0.3 + 0.7;
        ctx.globalAlpha = blink;
        ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFF';
        ctx.fillText('TAP or PRESS SPACE to PLAY AGAIN', GAME_W / 2, GAME_H / 2 + 100);
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    // ── Game loop ──
    let lastTime = 0;
    let accumulator = 0;
    const TICK = 1000 / 60;

    function loop(time) {
        if (!canvas) return;
        animFrame = requestAnimationFrame(loop);
        if (!__allSpritesReady) {
            __drawLoadingScreen(canvas, ctx, 'TOWER DEFENSE', '#22C55E');
            return;
        }

        const delta = Math.min(time - (lastTime || time), 50);
        lastTime = time;
        accumulator += delta;

        while (accumulator >= TICK) {
            update();
            accumulator -= TICK;
        }

        draw(time);
    }

    // ── Input handlers ──
    function onKeyDown(e) {
        ensureAudio();
        if ((e.key === ' ' || e.key === 'Enter') && (state === ST_TITLE || state === ST_OVER || state === ST_WIN)) {
            e.preventDefault();
            startGame();
            return;
        }
        // Tower selection 1-4
        if (e.key >= '1' && e.key <= '4') {
            selectedTowerType = parseInt(e.key) - 1;
            selectedTower = null;
        }
        // Escape to deselect
        if (e.key === 'Escape') {
            selectedTower = null;
        }
    }

    function getCanvasPos(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / rect.width * GAME_W,
            y: (clientY - rect.top) / rect.height * GAME_H
        };
    }

    function handleClick(px, py) {
        if (state === ST_TITLE || state === ST_OVER || state === ST_WIN) {
            startGame();
            return;
        }
        if (state !== ST_PLAYING) return;

        // Check tower selector buttons
        const btnW = 50, btnH = 30;
        for (let i = 0; i < 4; i++) {
            const bx = GAME_W - 4 * (btnW + 4) + i * (btnW + 4);
            const by = GAME_H - btnH - 4;
            if (px >= bx && px <= bx + btnW && py >= by && py <= by + btnH) {
                selectedTowerType = i;
                selectedTower = null;
                return;
            }
        }

        // Check upgrade menu click
        if (selectedTower && selectedTower.level < 2) {
            const t = selectedTower;
            const td = TOWER_DEFS[t.type];
            const { x, y } = cellToPixel(t.c, t.r);
            const mw = 120, mh = 60;
            let mx = x - mw / 2;
            let my = y - CELL - mh - 5;
            if (my < HUD_H + 5) my = y + CELL + 5;
            if (mx < 5) mx = 5;
            if (mx + mw > GAME_W - 5) mx = GAME_W - mw - 5;

            // Upgrade button area
            if (px >= mx + 10 && px <= mx + mw - 10 && py >= my + 38 && py <= my + 54) {
                upgradeTower(t);
                return;
            }
        }

        // Grid interaction
        if (py < HUD_H) return; // clicked HUD
        const { c, r } = pixelToCell(px, py);
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;

        // Check if clicking existing tower
        for (const t of towers) {
            if (t.r === r && t.c === c) {
                selectedTower = (selectedTower === t) ? null : t;
                return;
            }
        }

        // Place new tower
        selectedTower = null;
        if (grid[r][c] === 0) {
            placeTower(r, c);
        }
    }

    function onMouseDown(e) {
        ensureAudio();
        const { x, y } = getCanvasPos(e.clientX, e.clientY);
        handleClick(x, y);
    }

    function onMouseMove(e) {
        if (state !== ST_PLAYING) { hoverCell = null; return; }
        const { x, y } = getCanvasPos(e.clientX, e.clientY);
        if (y < HUD_H) { hoverCell = null; return; }
        hoverCell = pixelToCell(x, y);
    }

    function onTouchStart(e) {
        ensureAudio();
        const touch = e.touches[0];
        const { x, y } = getCanvasPos(touch.clientX, touch.clientY);
        handleClick(x, y);
    }

    function onTouchMove(e) {
        if (state !== ST_PLAYING) return;
        e.preventDefault();
        const touch = e.touches[0];
        const { x, y } = getCanvasPos(touch.clientX, touch.clientY);
        if (y < HUD_H) { hoverCell = null; return; }
        hoverCell = pixelToCell(x, y);
    }

    function onTouchEnd() {
        // hoverCell handled by touchstart click
    }

    // ── Public API ──
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer || null;
        onGameOver = gameOverCallback || null;

        // Theme
        const themeId = activePlayer?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            BG_TOP  = _t.bgGradient[0] || BG_TOP;
            BG_BOT  = _t.bgGradient[1] || BG_BOT;
            ACCENT  = _t.colors[0] || ACCENT;
            ACCENT2 = _t.colors[1] || ACCENT2;
            TC = _t.colors || TC;
        }

        particles = [];
        scorePopups = [];
        towers = [];
        enemies = [];
        projectiles = [];
        state = ST_TITLE;
        gameActive = false;
        hoverCell = null;
        selectedTower = null;

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', onResize);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('touchstart', onTouchStart, { passive: true });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: true });

        __loadSprites(null);
        animFrame = requestAnimationFrame(loop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;

        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', onResize);

        if (canvas) {
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        canvas = null;
        ctx = null;

        if (audioCtx) {
            try { audioCtx.close(); } catch { /* ignore */ }
            audioCtx = null;
        }
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return waveNum + 1; },
        isActive() { return gameActive; }
    };
})();
