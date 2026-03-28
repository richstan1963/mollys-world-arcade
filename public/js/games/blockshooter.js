/* Block Shooter — Toy Blast style block/cylinder shooter for Your World Arcade */
window.BlockShooter = (() => {

    // -- roundRect polyfill (Safari <16, older browsers) --
    if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
            if (!Array.isArray(radii)) radii = [radii || 0];
            const r = radii.map(v => Math.min(Math.max(0, v || 0), Math.min(w, h) / 2));
            while (r.length < 4) r.push(r[r.length - 1] || 0);
            this.moveTo(x + r[0], y);
            this.arcTo(x + w, y,     x + w, y + h, r[1]);
            this.arcTo(x + w, y + h, x,     y + h, r[2]);
            this.arcTo(x,     y + h, x,     y,     r[3]);
            this.arcTo(x,     y,     x + w, y,     r[0]);
            this.closePath();
            return this;
        };
    }
    // ── Constants ──
    const GAME_W = 480, GAME_H = 640;
    const COLS = 12, ROWS = 16;
    const CELL = GAME_W / COLS; // 40
    const CANNON_Y = GAME_H - 50;
    const CEIL_Y = 30; // top of grid area
    const MIN_ANGLE = Math.PI * 0.08;
    const MAX_ANGLE = Math.PI * 0.92;
    const SHOT_SPEED = 14;
    const GRAVITY = 0.38;
    const BOUNCE_DAMP = 0.55;
    const FRICTION = 0.97;
    const ANGULAR_DAMP = 0.98;
    const CEILING_DROP_INTERVAL = 30000; // ms
    const MATCH_MIN = 3;
    const BOMB_RADIUS = 2.2; // grid cells
    const MAX_LEVELS = 15;

    // Block types
    const BT_NORMAL = 0, BT_CYLINDER = 1, BT_BOMB = 2, BT_RAINBOW = 3, BT_METAL = 4;

    // Color palette (fallback)
    const COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#FBBF24', '#A855F7', '#F97316'];
    const COLOR_NAMES = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'];
    const COLOR_HIGHLIGHT = ['#FCA5A5', '#93C5FD', '#86EFAC', '#FDE68A', '#D8B4FE', '#FDBA74'];
    const COLOR_DARK = ['#B91C1C', '#1D4ED8', '#15803D', '#CA8A04', '#7E22CE', '#EA580C'];

    // High score tracking
    const LS_KEY = 'blockshooter_highscore';
    function loadHighScore() { try { return parseInt(localStorage.getItem(LS_KEY)) || 0; } catch { return 0; } }
    function saveHighScore(s) { try { localStorage.setItem(LS_KEY, s); } catch {} }
    let highScore = 0;

    // States
    const ST_TITLE = 0, ST_PLAY = 1, ST_ANIM = 2, ST_FALLING = 3, ST_WIN = 4, ST_LOSE = 5;

    // ── Sprite Assets ──
    const SPRITE_PATHS = {
        tiles: [
            '/img/game-assets/kenney-tiles/tileRed_01.png',
            '/img/game-assets/kenney-tiles/tileBlue_01.png',
            '/img/game-assets/kenney-tiles/tileGreen_01.png',
            '/img/game-assets/kenney-tiles/tileYellow_01.png',
            '/img/game-assets/kenney-tiles/tilePink_01.png',
            '/img/game-assets/kenney-tiles/tileOrange_01.png',
        ],
        balls: [
            '/img/game-assets/kenney-balls/ballBlue_01.png',
            '/img/game-assets/kenney-balls/ballYellow_01.png',
        ],
        bomb: '/img/game-assets/match3-candy/PNG/ico/12.png',
        rainbow: '/img/game-assets/match3-candy/PNG/ico/19.png',
        metal: '/img/game-assets/match3-candy/PNG/ico/1.png',
        particles: [],
        bg: '/img/game-assets/match3-candy/PNG/bg.png',
    };
    for (let i = 1; i <= 7; i++) SPRITE_PATHS.particles.push(`/img/game-assets/kenney-particles/particleWhite_${i}.png`);

    // Loaded image refs
    const sprites = {
        tiles: [],   // Image per color index
        balls: [],   // Image per color index (only 4, fall back to tile for 4,5)
        bomb: null,
        rainbow: null,
        metal: null,
        particles: [],
        bg: null,
        loaded: false,
    };

    function loadSprites() {
        return new Promise(resolve => {
            let total = 0, done = 0;
            const load = (src) => {
                total++;
                const img = new Image();
                img.onload = img.onerror = () => { done++; if (done >= total) { sprites.loaded = true; resolve(); } };
                img.src = src;
                return img;
            };
            sprites.tiles = SPRITE_PATHS.tiles.map(s => load(s));
            sprites.balls = SPRITE_PATHS.balls.map(s => load(s));
            sprites.bomb = load(SPRITE_PATHS.bomb);
            sprites.rainbow = load(SPRITE_PATHS.rainbow);
            sprites.metal = load(SPRITE_PATHS.metal);
            sprites.particles = SPRITE_PATHS.particles.map(s => load(s));
            sprites.bg = load(SPRITE_PATHS.bg);
            if (total === 0) { sprites.loaded = true; resolve(); }
        });
    }

    // Helper: get tile sprite for a color index
    function getTileSprite(colorIdx) {
        if (colorIdx >= 0 && colorIdx < sprites.tiles.length) return sprites.tiles[colorIdx];
        return sprites.tiles[0]; // fallback
    }
    // Helper: get ball sprite for a color index (balls only have 4 colors)
    function getBallSprite(colorIdx) {
        if (colorIdx >= 0 && colorIdx < sprites.balls.length) return sprites.balls[colorIdx];
        // For colors 4,5 (purple, orange) fall back to tile
        return null;
    }
    // Helper: pick a random particle sprite
    function getParticleSprite() {
        return pick(sprites.particles);
    }

    // ── State ──
    let canvas, ctx, W, H, SCALE, DPR, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerTheme;
    let state, frameCount, lastTime;
    let score, level, shotsLeft, combo, stars;
    let grid; // 2D array [row][col] of block objects or null
    let aimAngle, aimX, aimY, isAiming;
    let currentColor, nextColor, canSwap;
    let projectile; // {x, y, vx, vy, color, type}
    let fallingBlocks; // blocks detached and falling with physics
    let particles; // pop/burst particles
    let scorePopups;
    let ceilingOffset; // how many rows the ceiling has dropped
    let lastCeilingDrop;
    let screenShake, shakeTimer;
    let confetti;
    let touchId;

    // Audio
    let audioCtx;
    function ensureAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, dur, type, vol, slide) {
        try {
            ensureAudio();
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = type || 'square';
            o.frequency.setValueAtTime(freq, audioCtx.currentTime);
            if (slide) o.frequency.linearRampToValueAtTime(slide, audioCtx.currentTime + dur);
            g.gain.setValueAtTime(vol || 0.1, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + dur);
        } catch {}
    }
    function playNoise(dur, vol) {
        try {
            ensureAudio();
            const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
            const src = audioCtx.createBufferSource();
            const g = audioCtx.createGain();
            src.buffer = buf;
            g.gain.setValueAtTime(vol || 0.08, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            src.connect(g); g.connect(audioCtx.destination);
            src.start();
        } catch {}
    }
    function sfxFire() { playTone(220, 0.06, 'square', 0.12, 440); playNoise(0.04, 0.1); }
    function sfxStick() { playTone(800, 0.04, 'sine', 0.1); }
    function sfxPop(n) {
        const base = 500 + Math.min(n, 8) * 60;
        playTone(base, 0.1, 'sine', 0.14);
        setTimeout(() => playTone(base * 1.25, 0.08, 'sine', 0.1), 40);
    }
    function sfxFall() { playNoise(0.25, 0.08); playTone(120, 0.2, 'sawtooth', 0.06, 60); }
    function sfxBomb() { playNoise(0.4, 0.18); playTone(80, 0.3, 'sawtooth', 0.14, 30); }
    function sfxBounce() { playTone(1200, 0.03, 'sine', 0.06); }
    function sfxWin() {
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'sine', 0.14), i * 120));
    }
    function sfxLose() { playTone(300, 0.15, 'sawtooth', 0.1, 100); setTimeout(() => playTone(200, 0.25, 'sawtooth', 0.08, 60), 150); }
    function sfxCeilingWarn() { playTone(100, 0.3, 'sawtooth', 0.06, 60); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

    function gridToWorld(row, col) {
        const offset = (row % 2 === 1) ? CELL * 0.5 : 0;
        return {
            x: col * CELL + CELL / 2 + offset,
            y: CEIL_Y + row * (CELL * 0.87) + CELL / 2 + ceilingOffset * CELL * 0.87
        };
    }

    function worldToGrid(wx, wy) {
        const adjY = wy - CEIL_Y - ceilingOffset * CELL * 0.87;
        let row = Math.round((adjY - CELL / 2) / (CELL * 0.87));
        row = clamp(row, 0, ROWS - 1);
        const offset = (row % 2 === 1) ? CELL * 0.5 : 0;
        let col = Math.round((wx - CELL / 2 - offset) / CELL);
        const maxCol = (row % 2 === 1) ? COLS - 2 : COLS - 1;
        col = clamp(col, 0, maxCol);
        return { row, col };
    }

    function getNeighbors(row, col) {
        const n = [];
        const even = row % 2 === 0;
        // Same row
        if (col > 0) n.push({ row, col: col - 1 });
        const maxC = (row % 2 === 1) ? COLS - 2 : COLS - 1;
        if (col < maxC) n.push({ row, col: col + 1 });
        // Row above
        if (row > 0) {
            const off = even ? -1 : 0;
            const maxAbove = ((row - 1) % 2 === 1) ? COLS - 2 : COLS - 1;
            if (col + off >= 0 && col + off <= maxAbove) n.push({ row: row - 1, col: col + off });
            if (col + off + 1 >= 0 && col + off + 1 <= maxAbove) n.push({ row: row - 1, col: col + off + 1 });
        }
        // Row below
        if (row < ROWS - 1) {
            const off = even ? -1 : 0;
            const maxBelow = ((row + 1) % 2 === 1) ? COLS - 2 : COLS - 1;
            if (col + off >= 0 && col + off <= maxBelow) n.push({ row: row + 1, col: col + off });
            if (col + off + 1 >= 0 && col + off + 1 <= maxBelow) n.push({ row: row + 1, col: col + off + 1 });
        }
        return n;
    }

    function findMatchGroup(row, col) {
        const block = grid[row][col];
        if (!block || block.type === BT_METAL) return [];
        const targetColor = block.type === BT_RAINBOW ? null : block.color;
        const visited = new Set();
        const queue = [{ row, col }];
        const group = [];
        while (queue.length) {
            const { row: r, col: c } = queue.shift();
            const key = r * 100 + c;
            if (visited.has(key)) continue;
            visited.add(key);
            const b = grid[r]?.[c];
            if (!b || b.type === BT_METAL) continue;
            if (targetColor !== null && b.type !== BT_RAINBOW && b.color !== targetColor) continue;
            group.push({ row: r, col: c });
            for (const nb of getNeighbors(r, c)) {
                if (!visited.has(nb.row * 100 + nb.col)) queue.push(nb);
            }
        }
        return group;
    }

    function findConnectedToCeiling() {
        const visited = new Set();
        const queue = [];
        // Start from row 0 (ceiling row)
        for (let c = 0; c < COLS; c++) {
            if (grid[0]?.[c]) {
                queue.push({ row: 0, col: c });
                visited.add(c);
            }
        }
        while (queue.length) {
            const { row: r, col: c } = queue.shift();
            for (const nb of getNeighbors(r, c)) {
                const key = nb.row * 100 + nb.col;
                if (!visited.has(key) && grid[nb.row]?.[nb.col]) {
                    visited.add(key);
                    queue.push(nb);
                }
            }
        }
        return visited;
    }

    function findFloatingBlocks() {
        const connected = findConnectedToCeiling();
        const floating = [];
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c] && !connected.has(r * 100 + c)) {
                    floating.push({ row: r, col: c, block: grid[r][c] });
                }
            }
        }
        return floating;
    }

    function countBlocks() {
        let n = 0;
        for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++)
                if (grid[r][c]) n++;
        return n;
    }

    function randomColor(numColors) {
        return Math.floor(Math.random() * numColors);
    }

    function addParticles(wx, wy, color, count, speed) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const sp = rng(1, speed || 4);
            particles.push({
                x: wx, y: wy,
                vx: Math.cos(angle) * sp,
                vy: Math.sin(angle) * sp - 1,
                color: color,
                life: 1,
                decay: rng(0.015, 0.035),
                size: rng(2, 6),
                sprite: getParticleSprite(),
                rotation: rng(0, Math.PI * 2),
                rotSpeed: rng(-0.15, 0.15),
            });
        }
    }

    function addScorePopup(wx, wy, text, color) {
        scorePopups.push({ x: wx, y: wy, text, color: color || '#FFF', life: 1, decay: 0.015 });
    }

    function triggerShake(intensity) {
        screenShake = intensity;
        shakeTimer = 20;
    }

    // ── Level Generation ──
    const LEVEL_DEFS = [
        { rows: 3, colors: 3, cylPct: 0, bombs: false, rainbow: false, metal: false, shots: 30 },
        { rows: 4, colors: 4, cylPct: 0.2, bombs: false, rainbow: false, metal: false, shots: 35 },
        { rows: 4, colors: 4, cylPct: 0.3, bombs: false, rainbow: false, metal: false, shots: 35 },
        { rows: 5, colors: 4, cylPct: 0.3, bombs: true, rainbow: false, metal: false, shots: 35 },
        { rows: 5, colors: 5, cylPct: 0.35, bombs: true, rainbow: false, metal: false, shots: 40 },
        { rows: 6, colors: 5, cylPct: 0.35, bombs: true, rainbow: false, metal: false, shots: 40 },
        { rows: 6, colors: 5, cylPct: 0.4, bombs: true, rainbow: false, metal: false, shots: 40 },
        { rows: 7, colors: 5, cylPct: 0.4, bombs: true, rainbow: false, metal: false, shots: 45 },
        { rows: 7, colors: 5, cylPct: 0.4, bombs: true, rainbow: true, metal: false, shots: 45 },
        { rows: 8, colors: 6, cylPct: 0.4, bombs: true, rainbow: true, metal: false, shots: 50 },
        { rows: 8, colors: 6, cylPct: 0.4, bombs: true, rainbow: true, metal: true, shots: 45 },
        { rows: 9, colors: 6, cylPct: 0.45, bombs: true, rainbow: true, metal: true, shots: 50 },
        { rows: 9, colors: 6, cylPct: 0.45, bombs: true, rainbow: true, metal: true, shots: 50 },
        { rows: 10, colors: 6, cylPct: 0.5, bombs: true, rainbow: true, metal: true, shots: 40 },
        { rows: 11, colors: 6, cylPct: 0.5, bombs: true, rainbow: true, metal: true, shots: 35 },
    ];

    function generateLevel(lvl) {
        const def = LEVEL_DEFS[Math.min(lvl - 1, LEVEL_DEFS.length - 1)];
        grid = [];
        for (let r = 0; r < ROWS; r++) {
            const maxCol = (r % 2 === 1) ? COLS - 1 : COLS;
            grid[r] = new Array(maxCol).fill(null);
        }
        for (let r = 0; r < def.rows; r++) {
            const maxCol = (r % 2 === 1) ? COLS - 1 : COLS;
            for (let c = 0; c < maxCol; c++) {
                // Skip some cells to create interesting shapes
                if (lvl >= 6 && r > 1 && Math.random() < 0.12) continue;
                // Arches in higher levels
                if (lvl >= 6 && r === def.rows - 1 && c > 2 && c < maxCol - 3 && (c % 3 === 1) && Math.random() < 0.3) continue;

                let type = BT_NORMAL;
                let color = randomColor(def.colors);

                if (Math.random() < def.cylPct) type = BT_CYLINDER;
                if (def.bombs && Math.random() < 0.04) { type = BT_BOMB; color = -1; }
                if (def.rainbow && Math.random() < 0.02) { type = BT_RAINBOW; color = -2; }
                if (def.metal && Math.random() < 0.06) { type = BT_METAL; color = -3; }

                grid[r][c] = { type, color, pop: 0, shake: 0 };
            }
        }
        shotsLeft = def.shots;
        ceilingOffset = 0;
        lastCeilingDrop = Date.now();
        combo = 0;
    }

    function colorsInLevel() {
        return LEVEL_DEFS[Math.min(level - 1, LEVEL_DEFS.length - 1)].colors;
    }

    function pickShotColor() {
        // Only pick colors that exist on the board
        const present = new Set();
        for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < grid[r].length; c++) {
                const b = grid[r][c];
                if (b && b.color >= 0) present.add(b.color);
            }
        if (present.size === 0) return randomColor(colorsInLevel());
        const arr = [...present];
        return pick(arr);
    }

    // ── Projectile Logic ──
    function fireProjectile() {
        if (projectile || state !== ST_PLAY || shotsLeft <= 0) return;
        const speed = SHOT_SPEED;
        projectile = {
            x: GAME_W / 2,
            y: CANNON_Y - 20,
            vx: Math.cos(aimAngle) * speed,
            vy: -Math.sin(aimAngle) * speed,
            color: currentColor,
            type: BT_NORMAL
        };
        shotsLeft--;
        currentColor = nextColor;
        nextColor = pickShotColor();
        canSwap = true;
        sfxFire();
    }

    function updateProjectile() {
        if (!projectile) return;
        const p = projectile;
        p.x += p.vx;
        p.y += p.vy;

        // Wall bounce
        if (p.x < CELL / 2) { p.x = CELL / 2; p.vx *= -1; sfxBounce(); }
        if (p.x > GAME_W - CELL / 2) { p.x = GAME_W - CELL / 2; p.vx *= -1; sfxBounce(); }

        // Ceiling hit
        if (p.y < CEIL_Y + CELL / 2 + ceilingOffset * CELL * 0.87) {
            snapProjectile(p);
            return;
        }

        // Collision with grid blocks
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < grid[r].length; c++) {
                if (!grid[r][c]) continue;
                const pos = gridToWorld(r, c);
                const d = dist(p.x, p.y, pos.x, pos.y);
                if (d < CELL * 0.85) {
                    snapProjectile(p);
                    return;
                }
            }
        }

        // Off bottom — lost shot
        if (p.y > GAME_H + 20) {
            projectile = null;
        }
    }

    function snapProjectile(p) {
        const g = worldToGrid(p.x, p.y);
        // Find nearest empty cell
        let bestR = g.row, bestC = g.col, bestD = Infinity;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const tr = g.row + dr, tc = g.col + dc;
                if (tr < 0 || tr >= ROWS) continue;
                const maxC = (tr % 2 === 1) ? COLS - 1 : COLS;
                if (tc < 0 || tc >= maxC) continue;
                if (grid[tr][tc]) continue;
                const pos = gridToWorld(tr, tc);
                const d = dist(p.x, p.y, pos.x, pos.y);
                if (d < bestD) { bestD = d; bestR = tr; bestC = tc; }
            }
        }

        if (grid[bestR]?.[bestC]) {
            // Occupied — try immediate neighbors
            for (const nb of getNeighbors(bestR, bestC)) {
                if (!grid[nb.row]?.[nb.col]) {
                    bestR = nb.row; bestC = nb.col;
                    break;
                }
            }
        }

        if (grid[bestR]?.[bestC]) {
            // Still no room — drop it
            projectile = null;
            return;
        }

        grid[bestR][bestC] = { type: BT_NORMAL, color: p.color, pop: 0, shake: 0 };
        projectile = null;
        sfxStick();

        // Process matches
        processMatches(bestR, bestC);
    }

    function processMatches(row, col) {
        state = ST_ANIM;
        combo = 0;
        resolveStep(row, col);
    }

    function resolveStep(triggerRow, triggerCol) {
        let popped = false;
        const block = grid[triggerRow]?.[triggerCol];

        if (block && block.type === BT_BOMB) {
            // Bomb explodes
            popped = true;
            const center = gridToWorld(triggerRow, triggerCol);
            grid[triggerRow][triggerCol] = null;
            addParticles(center.x, center.y, '#FF8800', 30, 6);
            sfxBomb();
            triggerShake(8);
            let bombScore = 0;
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < grid[r].length; c++) {
                    if (!grid[r][c]) continue;
                    const pos = gridToWorld(r, c);
                    const d = dist(center.x, center.y, pos.x, pos.y);
                    if (d < CELL * BOMB_RADIUS) {
                        if (grid[r][c].type !== BT_METAL) {
                            addParticles(pos.x, pos.y, COLORS[grid[r][c].color] || '#888', 6, 3);
                            grid[r][c] = null;
                            bombScore += 15;
                        }
                    }
                }
            }
            score += bombScore;
            addScorePopup(center.x, center.y, '+' + bombScore, '#FF8800');
        } else if (block) {
            const group = findMatchGroup(triggerRow, triggerCol);
            if (group.length >= MATCH_MIN) {
                popped = true;
                combo++;
                const multiplier = Math.min(combo, 5);
                let popScore = 0;
                for (const { row: r, col: c } of group) {
                    const b = grid[r][c];
                    if (!b) continue;
                    const pos = gridToWorld(r, c);
                    addParticles(pos.x, pos.y, COLORS[b.color] || '#FFF', 8, 4);
                    grid[r][c] = null;
                    popScore += 10 * multiplier;
                }
                score += popScore;
                const center = gridToWorld(triggerRow, triggerCol);
                const comboText = combo > 1 ? ' x' + combo : '';
                addScorePopup(center.x, center.y, '+' + popScore + comboText, COLORS[block.color] || '#FFF');
                sfxPop(group.length);
                if (group.length > 6) triggerShake(4);
            }
        }

        // Find floating blocks
        const floating = findFloatingBlocks();
        if (floating.length > 0) {
            let fallScore = 0;
            for (const { row: r, col: c, block: b } of floating) {
                const pos = gridToWorld(r, c);
                fallingBlocks.push({
                    x: pos.x, y: pos.y,
                    vx: rng(-2, 2), vy: rng(-1, 1),
                    rotation: 0,
                    angVel: rng(-0.15, 0.15),
                    color: b.color,
                    type: b.type,
                    size: CELL * 0.42,
                    alive: true,
                    rollDist: 0
                });
                grid[r][c] = null;
                fallScore += 20;
            }
            score += fallScore;
            if (floating.length > 0) {
                const pos = gridToWorld(floating[0].row, floating[0].col);
                addScorePopup(pos.x, pos.y, '+' + fallScore + ' FALL!', '#FFD700');
            }
            sfxFall();
            if (floating.length >= 5) triggerShake(6);
        }

        // Check win
        if (countBlocks() === 0) {
            const bonus = shotsLeft * 100;
            score += bonus;
            state = ST_WIN;
            stars = score > 5000 ? 3 : score > 2500 ? 2 : 1;
            if (score > highScore) { highScore = score; saveHighScore(highScore); }
            sfxWin();
            spawnConfetti();
            return;
        }

        if (popped || floating.length > 0) {
            state = ST_FALLING;
        } else {
            finishTurn();
        }
    }

    function finishTurn() {
        // Check ceiling drop
        if (Date.now() - lastCeilingDrop > CEILING_DROP_INTERVAL) {
            ceilingOffset++;
            lastCeilingDrop = Date.now();
            sfxCeilingWarn();
            triggerShake(3);
        }

        // Check if blocks reached bottom
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < grid[r].length; c++) {
                if (grid[r][c]) {
                    const pos = gridToWorld(r, c);
                    if (pos.y > CANNON_Y - CELL) {
                        state = ST_LOSE;
                        if (score > highScore) { highScore = score; saveHighScore(highScore); }
                        sfxLose();
                        return;
                    }
                }
            }
        }

        // Check out of shots
        if (shotsLeft <= 0 && countBlocks() > 0) {
            state = ST_LOSE;
            if (score > highScore) { highScore = score; saveHighScore(highScore); }
            sfxLose();
            return;
        }

        state = ST_PLAY;
    }

    // ── Falling Physics ──
    function updateFallingBlocks(dt) {
        let allDone = true;
        for (const b of fallingBlocks) {
            if (!b.alive) continue;
            allDone = false;
            b.vy += GRAVITY;
            b.x += b.vx;
            b.y += b.vy;
            b.rotation += b.angVel;
            b.vx *= FRICTION;
            b.angVel *= ANGULAR_DAMP;

            // Wall bounce
            if (b.x < b.size) { b.x = b.size; b.vx *= -BOUNCE_DAMP; b.angVel += b.vx * 0.02; }
            if (b.x > GAME_W - b.size) { b.x = GAME_W - b.size; b.vx *= -BOUNCE_DAMP; b.angVel -= b.vx * 0.02; }

            // Cylinder rolling (they track horizontal distance)
            if (b.type === BT_CYLINDER) {
                b.rollDist += Math.abs(b.vx);
                // Roll on surfaces — if resting on something, convert vy to vx
                if (b.vy > 0 && b.y > GAME_H - b.size * 1.5) {
                    b.vx += (Math.random() > 0.5 ? 1 : -1) * 0.5;
                }
            }

            // Block-to-block collisions
            for (const other of fallingBlocks) {
                if (other === b || !other.alive) continue;
                const d = dist(b.x, b.y, other.x, other.y);
                const minD = b.size + other.size;
                if (d < minD && d > 0) {
                    const nx = (other.x - b.x) / d;
                    const ny = (other.y - b.y) / d;
                    const push = (minD - d) * 0.5;
                    b.x -= nx * push;
                    b.y -= ny * push;
                    other.x += nx * push;
                    other.y += ny * push;
                    // Exchange some velocity
                    const relVx = b.vx - other.vx;
                    const relVy = b.vy - other.vy;
                    const imp = (relVx * nx + relVy * ny) * 0.4;
                    b.vx -= imp * nx; b.vy -= imp * ny;
                    other.vx += imp * nx; other.vy += imp * ny;
                    b.angVel += rng(-0.05, 0.05);
                    other.angVel += rng(-0.05, 0.05);
                }
            }

            // Off screen — bonus
            if (b.y > GAME_H + 60) {
                b.alive = false;
                if (b.type === BT_CYLINDER && b.rollDist > 100) {
                    score += 10;
                    addScorePopup(b.x, GAME_H - 20, '+10 ROLL!', '#FFD700');
                }
            }
        }

        if (allDone && state === ST_FALLING) {
            fallingBlocks = fallingBlocks.filter(b => b.alive);
            finishTurn();
        }
    }

    // ── Particles & Popups ──
    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.08;
            p.rotation += p.rotSpeed;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function updatePopups() {
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const p = scorePopups[i];
            p.y -= 0.8;
            p.life -= p.decay;
            if (p.life <= 0) scorePopups.splice(i, 1);
        }
    }

    // ── Confetti ──
    function spawnConfetti() {
        confetti = [];
        for (let i = 0; i < 80; i++) {
            confetti.push({
                x: rng(0, GAME_W), y: rng(-100, -10),
                vx: rng(-2, 2), vy: rng(1, 4),
                color: pick(COLORS),
                rot: rng(0, Math.PI * 2),
                rotV: rng(-0.1, 0.1),
                size: rng(4, 10),
                life: 1, decay: rng(0.003, 0.008)
            });
        }
    }

    function updateConfetti() {
        if (!confetti) return;
        for (let i = confetti.length - 1; i >= 0; i--) {
            const c = confetti[i];
            c.x += c.vx; c.y += c.vy;
            c.rot += c.rotV;
            c.vx += rng(-0.1, 0.1);
            c.life -= c.decay;
            if (c.life <= 0) confetti.splice(i, 1);
        }
    }

    // ── Drawing ──

    // Draw tiled background image or fallback gradient
    function drawBackground() {
        if (sprites.loaded && sprites.bg && sprites.bg.naturalWidth) {
            const bw = sprites.bg.naturalWidth;
            const bh = sprites.bg.naturalHeight;
            const bScale = W / bw;
            const sh = bh * bScale;
            for (let yy = 0; yy < H; yy += sh) {
                ctx.drawImage(sprites.bg, 0, yy, W, sh);
            }
            ctx.fillStyle = 'rgba(0,0,20,0.2)';
            ctx.fillRect(0, 0, W, H);
        } else {
            const grad = ctx.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, '#1A0B2E');
            grad.addColorStop(0.6, '#251545');
            grad.addColorStop(1, '#2D1B3D');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
        }
        // Warm radial light from cannon area
        const cannonGlow = ctx.createRadialGradient(gs(GAME_W / 2), gs(CANNON_Y), 0, gs(GAME_W / 2), gs(CANNON_Y), H * 0.5);
        cannonGlow.addColorStop(0, 'rgba(255,200,100,0.06)');
        cannonGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = cannonGlow;
        ctx.fillRect(0, 0, W, H);
    }

    function drawCeiling() {
        const cy = gs(CEIL_Y + ceilingOffset * CELL * 0.87 - CELL * 0.43);
        // Metallic bar with enhanced sheen
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = gs(6);
        ctx.shadowOffsetY = gs(2);
        const grad = ctx.createLinearGradient(0, cy - gs(8), 0, cy + gs(8));
        grad.addColorStop(0, '#777');
        grad.addColorStop(0.3, '#BBB');
        grad.addColorStop(0.5, '#E0E0E0');
        grad.addColorStop(0.7, '#BBB');
        grad.addColorStop(1, '#555');
        ctx.fillStyle = grad;
        ctx.fillRect(0, cy - gs(6), W, gs(12));
        ctx.restore();

        // Highlight strip
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(0, cy - gs(4), W, gs(2));

        // Rivets with highlight
        for (let i = 0; i < COLS + 1; i++) {
            const rx = gs(i * CELL);
            ctx.fillStyle = '#444';
            ctx.beginPath();
            ctx.arc(rx, cy, gs(3.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#777';
            ctx.beginPath();
            ctx.arc(rx - gs(0.5), cy - gs(0.5), gs(1.5), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── Sprite-based block drawing ──
    function drawBlock(x, y, block, size) {
        if (!block) return;
        const s = size || CELL * 0.42;
        const sx = gs(x), sy = gs(y), ss = gs(s);

        ctx.save();
        if (block.shake > 0) {
            ctx.translate(rng(-gs(2), gs(2)), rng(-gs(2), gs(2)));
            block.shake -= 0.05;
        }
        if (block.pop > 0) {
            const scale = 1 + block.pop * 0.3;
            ctx.translate(sx, sy);
            ctx.scale(scale, scale);
            ctx.translate(-sx, -sy);
            ctx.globalAlpha = 1 - block.pop;
            block.pop -= 0.05;
        }

        const drawSize = ss * 2.1; // slightly larger than cell for overlap/3D feel

        if (block.type === BT_BOMB) {
            if (sprites.loaded && sprites.bomb && sprites.bomb.naturalWidth) {
                ctx.drawImage(sprites.bomb, sx - drawSize / 2, sy - drawSize / 2, drawSize, drawSize);
                // Animated spark glow
                ctx.fillStyle = `rgba(255, 215, 0, ${0.3 + 0.2 * Math.sin(frameCount * 0.3)})`;
                ctx.beginPath();
                ctx.arc(sx, sy - drawSize * 0.35, gs(4 + Math.sin(frameCount * 0.3) * 2), 0, Math.PI * 2);
                ctx.fill();
            } else {
                drawBlockFallback(sx, sy, ss, block);
            }
        } else if (block.type === BT_RAINBOW) {
            if (sprites.loaded && sprites.rainbow && sprites.rainbow.naturalWidth) {
                // Shimmer by rotating hue via globalCompositeOperation
                ctx.drawImage(sprites.rainbow, sx - drawSize / 2, sy - drawSize / 2, drawSize, drawSize);
                // Rainbow shimmer overlay
                const hue = (frameCount * 3) % 360;
                ctx.globalAlpha = 0.25;
                ctx.fillStyle = `hsl(${hue}, 90%, 65%)`;
                ctx.beginPath();
                ctx.arc(sx, sy, drawSize * 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            } else {
                drawBlockFallback(sx, sy, ss, block);
            }
        } else if (block.type === BT_METAL) {
            if (sprites.loaded && sprites.metal && sprites.metal.naturalWidth) {
                ctx.drawImage(sprites.metal, sx - drawSize / 2, sy - drawSize / 2, drawSize, drawSize);
            } else {
                drawBlockFallback(sx, sy, ss, block);
            }
        } else {
            // BT_NORMAL and BT_CYLINDER — use tile sprites
            const tileImg = getTileSprite(block.color);
            if (sprites.loaded && tileImg && tileImg.naturalWidth) {
                ctx.drawImage(tileImg, sx - drawSize / 2, sy - drawSize / 2, drawSize, drawSize);
                // For cylinders, add a subtle circular highlight to distinguish them
                if (block.type === BT_CYLINDER) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                    ctx.lineWidth = gs(1.5);
                    ctx.beginPath();
                    ctx.arc(sx, sy, drawSize * 0.32, -0.8, 0.8);
                    ctx.stroke();
                    // Shadow underneath
                    ctx.fillStyle = 'rgba(0,0,0,0.15)';
                    ctx.beginPath();
                    ctx.ellipse(sx, sy + drawSize * 0.38, drawSize * 0.3, gs(3), 0, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else {
                drawBlockFallback(sx, sy, ss, block);
            }
        }
        ctx.restore();
    }

    // Canvas-drawn fallback when sprites haven't loaded
    function drawBlockFallback(sx, sy, ss, block) {
        if (block.type === BT_BOMB) {
            const grad = ctx.createRadialGradient(sx, sy - ss * 0.15, 0, sx, sy, ss);
            grad.addColorStop(0, '#555');
            grad.addColorStop(1, '#111');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(sx, sy, ss, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#A0522D';
            ctx.lineWidth = gs(2);
            ctx.beginPath();
            ctx.moveTo(sx, sy - ss);
            ctx.quadraticCurveTo(sx + ss * 0.3, sy - ss * 1.4, sx + ss * 0.5, sy - ss * 1.2);
            ctx.stroke();
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(sx + ss * 0.5, sy - ss * 1.2, gs(3 + Math.sin(frameCount * 0.3)), 0, Math.PI * 2);
            ctx.fill();
        } else if (block.type === BT_RAINBOW) {
            const hue = (frameCount * 3) % 360;
            const grad = ctx.createRadialGradient(sx - ss * 0.2, sy - ss * 0.2, 0, sx, sy, ss);
            grad.addColorStop(0, `hsl(${hue}, 90%, 75%)`);
            grad.addColorStop(1, `hsl(${(hue + 120) % 360}, 80%, 50%)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(sx, sy, ss, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.arc(sx - ss * 0.25, sy - ss * 0.25, ss * 0.25, 0, Math.PI * 2);
            ctx.fill();
        } else if (block.type === BT_METAL) {
            const grad = ctx.createRadialGradient(sx - ss * 0.2, sy - ss * 0.2, 0, sx, sy, ss * 1.1);
            grad.addColorStop(0, '#DDD');
            grad.addColorStop(0.6, '#999');
            grad.addColorStop(1, '#555');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(sx - ss, sy - ss, ss * 2, ss * 2, gs(4));
            ctx.fill();
            ctx.strokeStyle = '#777';
            ctx.lineWidth = gs(1.5);
            ctx.beginPath();
            ctx.moveTo(sx - ss * 0.5, sy - ss * 0.5);
            ctx.lineTo(sx + ss * 0.5, sy + ss * 0.5);
            ctx.moveTo(sx + ss * 0.5, sy - ss * 0.5);
            ctx.lineTo(sx - ss * 0.5, sy + ss * 0.5);
            ctx.stroke();
        } else if (block.type === BT_CYLINDER) {
            const col = COLORS[block.color] || '#888';
            const hi = COLOR_HIGHLIGHT[block.color] || '#DDD';
            const dk = COLOR_DARK[block.color] || '#444';
            const grad = ctx.createRadialGradient(sx - ss * 0.25, sy - ss * 0.25, 0, sx, sy, ss);
            grad.addColorStop(0, hi);
            grad.addColorStop(0.6, col);
            grad.addColorStop(1, dk);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(sx, sy, ss, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = gs(2);
            ctx.beginPath();
            ctx.arc(sx, sy, ss * 0.6, -0.8, 0.8);
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath();
            ctx.ellipse(sx, sy + ss * 0.85, ss * 0.7, ss * 0.2, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Normal block
            const col = COLORS[block.color] || '#888';
            const hi = COLOR_HIGHLIGHT[block.color] || '#DDD';
            const dk = COLOR_DARK[block.color] || '#444';
            const grad = ctx.createLinearGradient(sx - ss, sy - ss, sx + ss, sy + ss);
            grad.addColorStop(0, hi);
            grad.addColorStop(0.4, col);
            grad.addColorStop(1, dk);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(sx - ss, sy - ss, ss * 2, ss * 2, gs(5));
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.beginPath();
            ctx.roundRect(sx - ss * 0.7, sy - ss * 0.85, ss * 1.4, ss * 0.7, gs(3));
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath();
            ctx.roundRect(sx - ss, sy + ss * 0.5, ss * 2, ss * 0.5, gs(3));
            ctx.fill();
        }
    }

    function drawGrid() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < grid[r].length; c++) {
                const b = grid[r][c];
                if (!b) continue;
                const pos = gridToWorld(r, c);
                drawBlock(pos.x, pos.y, b);
            }
        }
    }

    function drawFallingBlocks() {
        for (const b of fallingBlocks) {
            if (!b.alive) continue;
            ctx.save();
            ctx.translate(gs(b.x), gs(b.y));
            ctx.rotate(b.rotation);
            const fakeBlock = { type: b.type, color: b.color, pop: 0, shake: 0 };
            // Draw at origin since we already translated
            drawBlockAtOrigin(fakeBlock, b.size);
            // Motion trail for cylinders
            if (b.type === BT_CYLINDER && (Math.abs(b.vx) > 1 || Math.abs(b.vy) > 2)) {
                ctx.globalAlpha = 0.2;
                const col = COLORS[b.color] || '#888';
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.ellipse(0, 0, gs(b.size * 1.2), gs(b.size * 0.5), Math.atan2(b.vy, b.vx), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    // Draw a block centered at current canvas origin (0,0) — used for falling blocks with rotation
    function drawBlockAtOrigin(block, size) {
        const ss = gs(size);
        const drawSize = ss * 2.1;

        if (block.type === BT_BOMB && sprites.loaded && sprites.bomb && sprites.bomb.naturalWidth) {
            ctx.drawImage(sprites.bomb, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        } else if (block.type === BT_RAINBOW && sprites.loaded && sprites.rainbow && sprites.rainbow.naturalWidth) {
            ctx.drawImage(sprites.rainbow, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        } else if (block.type === BT_METAL && sprites.loaded && sprites.metal && sprites.metal.naturalWidth) {
            ctx.drawImage(sprites.metal, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        } else if ((block.type === BT_NORMAL || block.type === BT_CYLINDER) && sprites.loaded) {
            const tileImg = getTileSprite(block.color);
            if (tileImg && tileImg.naturalWidth) {
                ctx.drawImage(tileImg, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
                if (block.type === BT_CYLINDER) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                    ctx.lineWidth = gs(1.5);
                    ctx.beginPath();
                    ctx.arc(0, 0, drawSize * 0.32, -0.8, 0.8);
                    ctx.stroke();
                }
                return;
            }
        }
        // Fallback: use the positioned version at 0,0
        if (!sprites.loaded || (block.type !== BT_BOMB && block.type !== BT_RAINBOW && block.type !== BT_METAL)) {
            drawBlockFallback(0, 0, ss, block);
        }
    }

    function drawCannon() {
        const cx = gs(GAME_W / 2), cy = gs(CANNON_Y);

        // Base with metallic sheen
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = gs(8);
        ctx.shadowOffsetY = gs(3);
        const baseGrad = ctx.createLinearGradient(cx - gs(30), cy, cx + gs(30), cy + gs(30));
        baseGrad.addColorStop(0, '#5A5A6A');
        baseGrad.addColorStop(0.3, '#AAB0C0');
        baseGrad.addColorStop(0.5, '#DDE0E8');
        baseGrad.addColorStop(0.7, '#AAB0C0');
        baseGrad.addColorStop(1, '#4A4A5A');
        ctx.fillStyle = baseGrad;
        ctx.beginPath();
        ctx.roundRect(cx - gs(28), cy + gs(5), gs(56), gs(30), gs(8));
        ctx.fill();
        // Base highlight strip
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.roundRect(cx - gs(24), cy + gs(7), gs(48), gs(6), gs(3));
        ctx.fill();
        ctx.restore();

        // Barrel with metallic sheen
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-aimAngle + Math.PI / 2);
        const barrelGrad = ctx.createLinearGradient(-gs(10), 0, gs(10), 0);
        barrelGrad.addColorStop(0, '#555');
        barrelGrad.addColorStop(0.2, '#999');
        barrelGrad.addColorStop(0.45, '#DDD');
        barrelGrad.addColorStop(0.55, '#EEE');
        barrelGrad.addColorStop(0.8, '#999');
        barrelGrad.addColorStop(1, '#555');
        ctx.fillStyle = barrelGrad;
        ctx.beginPath();
        ctx.roundRect(-gs(8), -gs(40), gs(16), gs(40), gs(3));
        ctx.fill();
        // Barrel highlight stripe
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(-gs(2), -gs(38), gs(4), gs(36));
        // Muzzle with metallic ring
        const muzzleGrad = ctx.createLinearGradient(-gs(10), -gs(46), gs(10), -gs(46));
        muzzleGrad.addColorStop(0, '#333');
        muzzleGrad.addColorStop(0.4, '#777');
        muzzleGrad.addColorStop(0.6, '#888');
        muzzleGrad.addColorStop(1, '#333');
        ctx.fillStyle = muzzleGrad;
        ctx.beginPath();
        ctx.roundRect(-gs(10), -gs(46), gs(20), gs(10), gs(3));
        ctx.fill();
        ctx.restore();

        // Current block preview — use ball sprite if available
        drawCannonPreview(GAME_W / 2, CANNON_Y, currentColor, CELL * 0.32);

        // Next block
        ctx.globalAlpha = 0.6;
        drawCannonPreview(GAME_W / 2 + 50, CANNON_Y + 15, nextColor, CELL * 0.22);
        ctx.globalAlpha = 1;

        // "NEXT" label
        ctx.fillStyle = '#AAA';
        ctx.font = gs(8) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NEXT', gs(GAME_W / 2 + 50), gs(CANNON_Y + 30));
    }

    // Draw cannon ball preview — use ball sprite when available, tile sprite as fallback
    function drawCannonPreview(x, y, colorIdx, size) {
        const sx = gs(x), sy = gs(y), drawSize = gs(size) * 2.2;
        const ballImg = getBallSprite(colorIdx);
        if (sprites.loaded && ballImg && ballImg.naturalWidth) {
            ctx.drawImage(ballImg, sx - drawSize / 2, sy - drawSize / 2, drawSize, drawSize);
        } else if (sprites.loaded) {
            // Fall back to tile sprite for colors without ball sprites
            const tileImg = getTileSprite(colorIdx);
            if (tileImg && tileImg.naturalWidth) {
                ctx.drawImage(tileImg, sx - drawSize / 2, sy - drawSize / 2, drawSize, drawSize);
            } else {
                drawBlockFallback(sx, sy, gs(size), { type: BT_NORMAL, color: colorIdx, pop: 0, shake: 0 });
            }
        } else {
            drawBlockFallback(sx, sy, gs(size), { type: BT_NORMAL, color: colorIdx, pop: 0, shake: 0 });
        }
    }

    function drawTrajectory() {
        if (state !== ST_PLAY || projectile) return;
        ctx.save();
        ctx.setLineDash([gs(4), gs(6)]);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = gs(1.5);
        ctx.beginPath();

        let tx = GAME_W / 2, ty = CANNON_Y - 20;
        let tvx = Math.cos(aimAngle) * 6;
        let tvy = -Math.sin(aimAngle) * 6;

        ctx.moveTo(gs(tx), gs(ty));
        for (let i = 0; i < 60; i++) {
            tx += tvx; ty += tvy;
            if (tx < CELL / 2) { tx = CELL / 2; tvx *= -1; }
            if (tx > GAME_W - CELL / 2) { tx = GAME_W - CELL / 2; tvx *= -1; }
            if (ty < CEIL_Y) break;
            ctx.lineTo(gs(tx), gs(ty));

            // Check collision with grid
            let hit = false;
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < grid[r].length; c++) {
                    if (!grid[r][c]) continue;
                    const pos = gridToWorld(r, c);
                    if (dist(tx, ty, pos.x, pos.y) < CELL * 0.8) { hit = true; break; }
                }
                if (hit) break;
            }
            if (hit) break;
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Dot at endpoint
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(gs(tx), gs(ty), gs(4), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawProjectile() {
        if (!projectile) return;
        const p = projectile;
        // Draw projectile using ball sprite
        const ballSz = CELL * 0.42;
        const drawSz = gs(ballSz) * 2.2;
        const ballImg = getBallSprite(p.color);
        if (sprites.loaded && ballImg && ballImg.naturalWidth) {
            ctx.drawImage(ballImg, gs(p.x) - drawSz / 2, gs(p.y) - drawSz / 2, drawSz, drawSz);
        } else {
            const block = { type: BT_NORMAL, color: p.color, pop: 0, shake: 0 };
            drawBlock(p.x, p.y, block, CELL * 0.42);
        }
        // Trailing particles
        addParticles(p.x, p.y, COLORS[p.color] || '#FFF', 1, 1.5);
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.save();
            ctx.globalAlpha = p.life;
            if (p.sprite && p.sprite.naturalWidth && sprites.loaded) {
                const pSize = gs(p.size) * 2;
                ctx.translate(gs(p.x), gs(p.y));
                ctx.rotate(p.rotation);
                // Tint the white particle with the particle's color
                ctx.drawImage(p.sprite, -pSize / 2, -pSize / 2, pSize, pSize);
                // Apply color tint via overlay
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.life * 0.6;
                ctx.fillRect(-pSize / 2, -pSize / 2, pSize, pSize);
                ctx.globalCompositeOperation = 'source-over';
            } else {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(gs(p.x), gs(p.y), gs(p.size), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    function drawPopups() {
        for (const p of scorePopups) {
            ctx.globalAlpha = p.life;
            const size = 12 + (1 - p.life) * 4;
            ctx.font = 'bold ' + gs(size) + 'px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#000';
            ctx.fillText(p.text, gs(p.x) + gs(1), gs(p.y) + gs(1));
            ctx.fillStyle = p.color;
            ctx.fillText(p.text, gs(p.x), gs(p.y));
        }
        ctx.globalAlpha = 1;
    }

    function drawConfetti() {
        if (!confetti) return;
        for (const c of confetti) {
            ctx.save();
            ctx.globalAlpha = c.life;
            ctx.translate(gs(c.x), gs(c.y));
            ctx.rotate(c.rot);
            ctx.fillStyle = c.color;
            ctx.fillRect(-gs(c.size / 2), -gs(c.size / 4), gs(c.size), gs(c.size / 2));
            ctx.restore();
        }
    }

    function drawHUD() {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, gs(22));
        ctx.font = 'bold ' + gs(11) + 'px monospace';
        ctx.textBaseline = 'middle';

        // Score
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('SCORE: ' + score, gs(6), gs(12));

        // Level
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFF';
        ctx.fillText('LEVEL ' + level, gs(GAME_W / 2), gs(12));

        // Shots
        ctx.textAlign = 'right';
        ctx.fillStyle = shotsLeft <= 5 ? '#EF4444' : '#8BE9FD';
        ctx.fillText('SHOTS: ' + shotsLeft, gs(GAME_W - 6), gs(12));
    }

    function drawTitle() {
        drawBackground();

        // Title
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const pulse = Math.sin(frameCount * 0.04) * 3;
        ctx.font = 'bold ' + gs(36 + pulse) + 'px monospace';
        ctx.fillStyle = '#000';
        ctx.fillText('BLOCK', gs(GAME_W / 2 + 2), gs(160 + 2));
        ctx.fillText('SHOOTER', gs(GAME_W / 2 + 2), gs(210 + 2));
        const tGrad = ctx.createLinearGradient(gs(100), gs(140), gs(380), gs(230));
        tGrad.addColorStop(0, '#EF4444');
        tGrad.addColorStop(0.25, '#FBBF24');
        tGrad.addColorStop(0.5, '#22C55E');
        tGrad.addColorStop(0.75, '#3B82F6');
        tGrad.addColorStop(1, '#A855F7');
        ctx.fillStyle = tGrad;
        ctx.fillText('BLOCK', gs(GAME_W / 2), gs(160));
        ctx.fillText('SHOOTER', gs(GAME_W / 2), gs(210));

        // Decorative blocks
        for (let i = 0; i < 6; i++) {
            const bx = 60 + i * 65;
            const by = 300 + Math.sin(frameCount * 0.05 + i) * 10;
            const fakeBlock = { type: i % 2 === 0 ? BT_NORMAL : BT_CYLINDER, color: i, pop: 0, shake: 0 };
            drawBlock(bx, by, fakeBlock, CELL * 0.45);
        }

        // Instructions
        ctx.font = gs(13) + 'px monospace';
        ctx.fillStyle = '#CCC';
        ctx.fillText('Aim and shoot to match 3+ colors', gs(GAME_W / 2), gs(380));
        ctx.fillText('Detach blocks for bonus points!', gs(GAME_W / 2), gs(400));

        const blink = Math.floor(frameCount / 30) % 2 === 0;
        if (blink) {
            ctx.font = 'bold ' + gs(16) + 'px monospace';
            ctx.fillStyle = '#FFD700';
            ctx.fillText('CLICK TO START', gs(GAME_W / 2), gs(460));
        }

        ctx.font = gs(10) + 'px monospace';
        ctx.fillStyle = '#888';
        ctx.fillText('Mouse aim / Click fire / S swap next', gs(GAME_W / 2), gs(520));
    }

    function drawWin() {
        // Dim
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);

        drawConfetti();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = 'bold ' + gs(32) + 'px monospace';
        ctx.fillStyle = '#000';
        ctx.fillText('LEVEL CLEAR!', gs(GAME_W / 2 + 2), gs(200 + 2));
        ctx.fillStyle = '#22C55E';
        ctx.fillText('LEVEL CLEAR!', gs(GAME_W / 2), gs(200));

        // Stars
        ctx.font = gs(40) + 'px sans-serif';
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = i < stars ? '#FFD700' : '#555';
            ctx.fillText('\u2605', gs(GAME_W / 2 - 50 + i * 50), gs(270));
        }

        ctx.font = 'bold ' + gs(20) + 'px monospace';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('SCORE: ' + score, gs(GAME_W / 2), gs(340));
        if (highScore > 0) {
            ctx.font = gs(13) + 'px monospace';
            ctx.fillStyle = score >= highScore ? '#FFD700' : '#888';
            ctx.fillText(score >= highScore ? '\u2B50 NEW BEST!' : 'BEST: ' + highScore, gs(GAME_W / 2), gs(370));
        }

        const blink = Math.floor(frameCount / 25) % 2 === 0;
        if (blink) {
            ctx.font = gs(14) + 'px monospace';
            ctx.fillStyle = '#CCC';
            const txt = level >= MAX_LEVELS ? 'CLICK TO FINISH' : 'CLICK FOR NEXT LEVEL';
            ctx.fillText(txt, gs(GAME_W / 2), gs(420));
        }
    }

    function drawLose() {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = 'bold ' + gs(30) + 'px monospace';
        ctx.fillStyle = '#000';
        ctx.fillText('GAME OVER', gs(GAME_W / 2 + 2), gs(240 + 2));
        ctx.fillStyle = '#EF4444';
        ctx.fillText('GAME OVER', gs(GAME_W / 2), gs(240));

        ctx.font = 'bold ' + gs(18) + 'px monospace';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('SCORE: ' + score, gs(GAME_W / 2), gs(310));
        ctx.fillStyle = '#AAA';
        ctx.font = gs(13) + 'px monospace';
        ctx.fillText('Level ' + level, gs(GAME_W / 2), gs(340));
        if (highScore > 0) {
            ctx.fillStyle = score >= highScore ? '#FFD700' : '#888';
            ctx.fillText(score >= highScore ? '\u2B50 NEW BEST!' : 'BEST: ' + highScore, gs(GAME_W / 2), gs(365));
        }

        const blink = Math.floor(frameCount / 25) % 2 === 0;
        if (blink) {
            ctx.font = gs(14) + 'px monospace';
            ctx.fillStyle = '#CCC';
            ctx.fillText('CLICK TO RETRY', gs(GAME_W / 2), gs(410));
        }
    }

    // ── Main Loop ──
    function gameLoop(time) {
        if (!gameActive) return;
        animFrame = requestAnimationFrame(gameLoop);

        const dt = Math.min((time - (lastTime || time)) / 16.67, 3);
        lastTime = time;
        frameCount++;

        // Screen shake
        ctx.save();
        if (shakeTimer > 0) {
            shakeTimer--;
            const intensity = screenShake * (shakeTimer / 20);
            ctx.translate(rng(-gs(intensity), gs(intensity)), rng(-gs(intensity), gs(intensity)));
        }

        if (state === ST_TITLE) {
            drawTitle();
        } else if (state === ST_WIN) {
            drawBackground();
            drawCeiling();
            drawGrid();
            drawCannon();
            drawFallingBlocks();
            drawParticles();
            drawPopups();
            drawHUD();
            drawWin();
            updateParticles();
            updatePopups();
            updateFallingBlocks(dt);
            updateConfetti();
        } else if (state === ST_LOSE) {
            drawBackground();
            drawCeiling();
            drawGrid();
            drawCannon();
            drawFallingBlocks();
            drawParticles();
            drawPopups();
            drawHUD();
            drawLose();
            updateParticles();
            updatePopups();
            updateFallingBlocks(dt);
        } else {
            // ST_PLAY, ST_ANIM, ST_FALLING
            updateProjectile();
            updateFallingBlocks(dt);
            updateParticles();
            updatePopups();

            drawBackground();
            drawCeiling();
            drawGrid();
            drawTrajectory();
            drawProjectile();
            drawFallingBlocks();
            drawCannon();
            drawParticles();
            drawPopups();
            drawHUD();
        }

        ctx.restore();
    }

    // ── Input ──
    function updateAim(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const mx = (clientX - rect.left) / rect.width * GAME_W;
        const my = (clientY - rect.top) / rect.height * GAME_H;
        aimX = mx; aimY = my;
        const dx = mx - GAME_W / 2;
        const dy = CANNON_Y - my;
        aimAngle = clamp(Math.atan2(dy, dx), MIN_ANGLE, MAX_ANGLE);
    }

    function onMouseMove(e) {
        updateAim(e.clientX, e.clientY);
    }

    function onMouseDown(e) {
        updateAim(e.clientX, e.clientY);
        handleClick();
    }

    function onTouchStart(e) {
        e.preventDefault();
        if (e.touches.length > 0) {
            const t = e.touches[0];
            touchId = t.identifier;
            updateAim(t.clientX, t.clientY);
        }
    }

    function onTouchMove(e) {
        e.preventDefault();
        for (const t of e.touches) {
            if (t.identifier === touchId) {
                updateAim(t.clientX, t.clientY);
            }
        }
    }

    function onTouchEnd(e) {
        e.preventDefault();
        handleClick();
    }

    function onKeyDown(e) {
        const key = e.key.toLowerCase();
        if (key === 'arrowleft' || key === 'a') {
            aimAngle = clamp(aimAngle + 0.03, MIN_ANGLE, MAX_ANGLE);
        } else if (key === 'arrowright' || key === 'd') {
            aimAngle = clamp(aimAngle - 0.03, MIN_ANGLE, MAX_ANGLE);
        } else if (key === ' ' || key === 'enter') {
            e.preventDefault();
            handleClick();
        } else if (key === 's') {
            if (canSwap && state === ST_PLAY) {
                const tmp = currentColor;
                currentColor = nextColor;
                nextColor = tmp;
                canSwap = false;
                playTone(600, 0.05, 'sine', 0.08);
            }
        }
    }

    function handleClick() {
        if (state === ST_TITLE) {
            startLevel(1);
        } else if (state === ST_PLAY) {
            fireProjectile();
        } else if (state === ST_WIN) {
            if (level >= MAX_LEVELS) {
                endGame();
            } else {
                level++;
                startLevel(level);
            }
        } else if (state === ST_LOSE) {
            endGame();
        }
    }

    function startLevel(lvl) {
        level = lvl;
        generateLevel(lvl);
        projectile = null;
        fallingBlocks = [];
        particles = [];
        scorePopups = [];
        confetti = null;
        screenShake = 0;
        shakeTimer = 0;
        combo = 0;
        currentColor = pickShotColor();
        nextColor = pickShotColor();
        canSwap = true;
        aimAngle = Math.PI / 2;
        state = ST_PLAY;
    }

    function endGame() {
        if (gameOverCB) gameOverCB(score);
        state = ST_TITLE;
        score = 0;
    }

    // ── Canvas Fit ──
    function fitCanvas() {
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        const pw = parent.clientWidth;
        const ph = parent.clientHeight;
        const aspect = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > aspect) {
            ch = ph; cw = ch * aspect;
        } else {
            cw = pw; ch = cw / aspect;
        }
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        canvas.width = cw * DPR;
        canvas.height = ch * DPR;
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
        ctx = canvas.getContext('2d');
    }

    // ── Init / Destroy ──
    function init(cvs, player, onGO) {
        canvas = cvs;
        activePlayer = player;
        gameOverCB = onGO;
        gameActive = true;
        highScore = loadHighScore();
        state = ST_TITLE;
        score = 0;
        level = 1;
        frameCount = 0;
        lastTime = 0;
        aimAngle = Math.PI / 2;
        fallingBlocks = [];
        particles = [];
        scorePopups = [];
        confetti = null;
        grid = [];
        projectile = null;

        W = canvas.width || 480;
        H = canvas.height || 640;
        SCALE = W / GAME_W;
        DPR = Math.min(window.devicePixelRatio || 1, 3);

        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', fitCanvas);

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        // Preload sprites, then start game loop
        loadSprites().then(() => {
            animFrame = requestAnimationFrame(gameLoop);
        });
        // Start loop immediately too (fallback rendering until sprites load)
        animFrame = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
        if (canvas) {
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        document.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', fitCanvas);
    }

    return { init, destroy };
})();
