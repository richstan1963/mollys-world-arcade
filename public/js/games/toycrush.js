/* Toy Crush — Tap-to-match puzzle game for Your World Arcade
   Kenney CC0 puzzle-pack sprite rendering — Toy Blast quality */
window.ToyCrush = (() => {

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

    // ══════════════════════════════════════════
    //  CONSTANTS
    // ══════════════════════════════════════════
    const GAME_W = 480, GAME_H = 640;
    const COLS = 9, ROWS = 9;
    const BLOCK_SIZE = 48;
    const BLOCK_GAP = 2;
    const SPRITE_PAD = 2;
    const GRID_PAD_X = (GAME_W - COLS * BLOCK_SIZE) / 2;
    const GRID_PAD_Y = 118;
    const GRAVITY = 0.45;
    const BOUNCE_DAMP = 0.35;
    const BOUNCE_THRESHOLD = 0.8;
    const SLIDE_SPEED = 0.12;

    // Color mapping to Kenney tiles
    const COLOR_KEYS  = ['Blue', 'Red', 'Green', 'Yellow', 'Pink', 'Orange'];
    const COLOR_HEX   = ['#4A90D9', '#E74C3C', '#27AE60', '#F1C40F', '#E91E90', '#F39C12'];
    const COLOR_LIGHT = ['#7AB8FF', '#FF7B7B', '#5CDB95', '#FFE066', '#FF69B4', '#FFB347'];
    const COLOR_NAMES = ['Blue', 'Red', 'Green', 'Yellow', 'Pink', 'Orange'];
    const COLOR_PARTICLES = COLOR_HEX;

    const SPECIAL_NONE = 0, SPECIAL_ROCKET = 1, SPECIAL_BOMB = 2, SPECIAL_DISCO = 3;

    // States
    const ST_LEVEL_SELECT = 0, ST_PLAYING = 1, ST_CLEARING = 2, ST_FALLING = 3;
    const ST_REFILL = 4, ST_COLLAPSE = 5, ST_LEVEL_COMPLETE = 6, ST_GAME_OVER = 7;
    const ST_SPECIAL_ACTIVATE = 8, ST_ROCKET_DIR = 9, ST_LOADING = 10;

    // ══════════════════════════════════════════
    //  SPRITE SYSTEM — Kenney tiles + candy specials
    // ══════════════════════════════════════════
    const SPRITES = {};
    let spritesLoaded = false;
    let loadTotal = 0, loadDone = 0;

    // Build sprite manifest
    const SPRITE_MANIFEST = {};

    // Kenney colored block tiles (variant 01 = normal, 02 = highlight, 03 = special base)
    for (const color of COLOR_KEYS) {
        for (let v = 1; v <= 10; v++) {
            const vStr = String(v).padStart(2, '0');
            SPRITE_MANIFEST[`tile${color}_${vStr}`] = `/img/game-assets/kenney-tiles/tile${color}_${vStr}.png`;
        }
    }

    // Kenney white particles
    for (let i = 1; i <= 7; i++) {
        SPRITE_MANIFEST[`particle_${i}`] = `/img/game-assets/kenney-particles/particleWhite_${i}.png`;
    }

    // UI assets
    SPRITE_MANIFEST['coin'] = '/img/game-assets/kenney-coins/coin_01.png';
    SPRITE_MANIFEST['star_icon'] = '/img/game-assets/kenney-ui/star.png';

    // Candy specials
    SPRITE_MANIFEST['bomb']      = '/img/game-assets/match3-candy/PNG/ico/12.png';
    SPRITE_MANIFEST['rainbow']   = '/img/game-assets/match3-candy/PNG/ico/19.png';
    SPRITE_MANIFEST['crate']     = '/img/game-assets/match3-candy/PNG/ico/1.png';
    SPRITE_MANIFEST['chocolate'] = '/img/game-assets/match3-candy/PNG/ico/20.png';
    SPRITE_MANIFEST['bg']        = '/img/game-assets/match3-candy/PNG/bg.png';

    const SPRITE_OK = {};

    function getTileKey(colorIdx, variant) {
        const vStr = String(variant).padStart(2, '0');
        return `tile${COLOR_KEYS[colorIdx]}_${vStr}`;
    }

    function preloadSprites(onProgress, onDone) {
        const keys = Object.keys(SPRITE_MANIFEST);
        loadTotal = keys.length;
        loadDone = 0;
        for (const key of keys) {
            const img = new Image();
            img.onload = () => {
                SPRITE_OK[key] = true;
                loadDone++;
                onProgress(loadDone / loadTotal);
                if (loadDone >= loadTotal) { spritesLoaded = true; onDone(); }
            };
            img.onerror = () => {
                SPRITE_OK[key] = false;
                loadDone++;
                onProgress(loadDone / loadTotal);
                if (loadDone >= loadTotal) { spritesLoaded = true; onDone(); }
            };
            img.src = SPRITE_MANIFEST[key];
            SPRITES[key] = img;
        }
    }

    function spr(key) { return SPRITE_OK[key] ? SPRITES[key] : null; }

    // ══════════════════════════════════════════
    //  LEVELS
    // ══════════════════════════════════════════
    const LEVELS = [];
    (function buildLevels() {
        const goalTypes = ['score', 'clear_color', 'clear_color'];
        for (let i = 0; i < 20; i++) {
            const gt = i < 3 ? 'score' : goalTypes[i % 3];
            const moves = Math.max(15, 35 - i);
            const scoreTarget = 3000 + i * 1500;
            const colorIdx = i % 6;
            const clearCount = 25 + i * 5;
            const numColors = i < 3 ? 4 : (i < 8 ? 5 : 6);
            const hasIce = i >= 8;
            const hasCrate = i >= 12;
            const hasChocolate = i >= 16;
            const star2 = Math.floor(moves * 0.5);
            const star3 = Math.floor(moves * 0.7);
            LEVELS.push({
                id: i + 1, moves, numColors, hasIce, hasCrate, hasChocolate,
                goal: gt === 'score'
                    ? { type: 'score', target: scoreTarget, desc: `Score ${scoreTarget}` }
                    : { type: 'clear_color', colorIdx, target: clearCount, desc: `Clear ${clearCount} ${COLOR_NAMES[colorIdx]}` },
                star2, star3,
                bgHue: (i * 18) % 360,
            });
        }
    })();

    // ══════════════════════════════════════════
    //  STATE
    // ══════════════════════════════════════════
    let canvas, ctx, W, H, SCALE, DPR, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor, playerTheme;
    let state, frameCount, lastTime;
    let grid;
    let score, movesLeft, currentLevel, levelIdx, levelProgress;
    let unlockedLevels, starRatings;
    let particles, scorePopups, comboTexts, shakeTimer, shakeIntensity;
    let clearingBlocks, fallingDone, collapsingDone;
    let pendingSpecial;
    let rocketDir;
    let touchStart, swipeBlock;
    let highlightGroup;
    let comboCount;
    let confetti;
    let audioCtx;
    let loadProgress = 0;
    let scoreDisplay = 0; // for animated score counter
    let scoreBounceSz = 0;

    // ══════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════
    const gs = v => v * SCALE;
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const dist = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const easeOutBack = t => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    const easeOutElastic = t => { if (t === 0 || t === 1) return t; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1; };
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

    // ══════════════════════════════════════════
    //  AUDIO
    // ══════════════════════════════════════════
    function ensureAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, dur, type, vol, slide) {
        try {
            ensureAudio();
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, audioCtx.currentTime);
            if (slide) o.frequency.linearRampToValueAtTime(slide, audioCtx.currentTime + dur);
            g.gain.setValueAtTime(vol || 0.08, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + dur);
        } catch {}
    }
    function playNoise(dur, vol) {
        try {
            ensureAudio();
            const bufSize = audioCtx.sampleRate * dur;
            const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
            const src = audioCtx.createBufferSource();
            src.buffer = buf;
            const g = audioCtx.createGain();
            g.gain.setValueAtTime(vol || 0.05, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            src.connect(g); g.connect(audioCtx.destination);
            src.start(); src.stop(audioCtx.currentTime + dur);
        } catch {}
    }
    function sfxTap() { playTone(300, 0.08, 'square', 0.06); }
    function sfxClear(size) {
        const baseFreq = 400 + Math.min(size, 12) * 60;
        playTone(baseFreq, 0.15, 'sine', 0.07, baseFreq * 1.5);
        playTone(baseFreq * 1.2, 0.12, 'triangle', 0.04, baseFreq * 1.8);
    }
    function sfxLand() { playNoise(0.05, 0.03); }
    function sfxRocket() { playTone(200, 0.4, 'sawtooth', 0.06, 800); }
    function sfxBomb() { playNoise(0.3, 0.08); playTone(80, 0.3, 'sine', 0.06, 40); }
    function sfxDisco() {
        for (let i = 0; i < 5; i++) setTimeout(() => playTone(600 + i * 200, 0.15, 'sine', 0.04), i * 60);
    }
    function sfxLevelComplete() {
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sine', 0.06), i * 100));
    }
    function sfxStar() { playTone(1200, 0.15, 'sine', 0.05, 1600); }

    // ══════════════════════════════════════════
    //  BLOCK CLASS
    // ══════════════════════════════════════════
    function Block(col, row, colorIdx) {
        return {
            col, row, colorIdx,
            x: GRID_PAD_X + col * BLOCK_SIZE,
            y: GRID_PAD_Y + row * BLOCK_SIZE,
            targetX: GRID_PAD_X + col * BLOCK_SIZE,
            targetY: GRID_PAD_Y + row * BLOCK_SIZE,
            vy: 0,
            special: SPECIAL_NONE,
            ice: false,
            crate: 0,
            chocolate: 0,
            scale: 1,
            flash: 0,
            alive: true,
            settled: true,
            popAnim: 0,
            wobble: 0,
            wobbleAmp: 0,
            entryScale: 0,   // scale-in animation for new blocks
            entryTimer: 1,
        };
    }

    // ══════════════════════════════════════════
    //  GRID OPERATIONS
    // ══════════════════════════════════════════
    function initGrid() {
        const lv = LEVELS[levelIdx];
        grid = [];
        for (let c = 0; c < COLS; c++) {
            grid[c] = [];
            for (let r = 0; r < ROWS; r++) {
                const b = Block(c, r, randInt(0, lv.numColors - 1));
                if (lv.hasIce && Math.random() < 0.15 && r > 2) b.ice = true;
                if (lv.hasCrate && Math.random() < 0.08 && r > 3) { b.crate = 2; b.colorIdx = -1; }
                if (lv.hasChocolate && Math.random() < 0.06 && r > 4 && b.crate === 0) { b.chocolate = 2; b.colorIdx = -2; }
                b.wobble = Math.random() * Math.PI * 2;
                // Staggered entry animation
                b.entryTimer = 0;
                b.entryScale = 0;
                b.entryDelay = (c + r) * 0.04;
                grid[c][r] = b;
            }
        }
        // Ensure no huge pre-existing groups > 4
        for (let pass = 0; pass < 3; pass++) {
            for (let c = 0; c < COLS; c++) {
                for (let r = 0; r < ROWS; r++) {
                    if (grid[c][r].crate > 0 || grid[c][r].chocolate > 0) continue;
                    const g = findGroup(c, r);
                    if (g.length > 4) {
                        grid[c][r].colorIdx = randInt(0, lv.numColors - 1);
                    }
                }
            }
        }
    }

    function getBlock(c, r) {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
        return grid[c] ? grid[c][r] : null;
    }

    function findGroup(col, row) {
        const b = getBlock(col, row);
        if (!b || !b.alive || b.crate > 0 || b.chocolate > 0 || b.colorIdx < 0) return [];
        const color = b.colorIdx;
        const visited = new Set();
        const group = [];
        const stack = [[col, row]];
        while (stack.length) {
            const [c, r] = stack.pop();
            const key = c * 100 + r;
            if (visited.has(key)) continue;
            visited.add(key);
            const nb = getBlock(c, r);
            if (!nb || !nb.alive || nb.colorIdx !== color || nb.crate > 0 || nb.chocolate > 0) continue;
            group.push(nb);
            stack.push([c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]);
        }
        return group;
    }

    function findGroupAt(col, row) {
        const b = getBlock(col, row);
        if (!b || !b.alive) return [];
        if (b.special !== SPECIAL_NONE) return [b];
        return findGroup(col, row);
    }

    function blockPixel(col, row) {
        return { x: GRID_PAD_X + col * BLOCK_SIZE, y: GRID_PAD_Y + row * BLOCK_SIZE };
    }

    function pixelToGrid(px, py) {
        const c = Math.floor((px - GRID_PAD_X) / BLOCK_SIZE);
        const r = Math.floor((py - GRID_PAD_Y) / BLOCK_SIZE);
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
        return { col: c, row: r };
    }

    // ══════════════════════════════════════════
    //  CLEAR A GROUP
    // ══════════════════════════════════════════
    function clearGroup(group) {
        const size = group.length;
        const lv = LEVELS[levelIdx];
        let specialBlock = null;
        let specialType = SPECIAL_NONE;

        if (size >= 9) specialType = SPECIAL_DISCO;
        else if (size >= 7) specialType = SPECIAL_BOMB;
        else if (size >= 5) specialType = SPECIAL_ROCKET;

        let cxSum = 0, cySum = 0;
        group.forEach(b => { cxSum += b.col; cySum += b.row; });
        const centerCol = Math.round(cxSum / size);
        const centerRow = Math.round(cySum / size);

        const pts = size * size * 10;
        score += pts;
        scoreBounceSz = Math.min(1.4, 1 + size * 0.03);

        if (lv.goal.type === 'clear_color') {
            group.forEach(b => {
                if (b.colorIdx === lv.goal.colorIdx) levelProgress++;
            });
        }

        group.forEach(b => {
            if (b.ice) {
                b.ice = false;
                spawnIceParticles(b.x + BLOCK_SIZE / 2, b.y + BLOCK_SIZE / 2);
                return;
            }
            // Damage adjacent crates and chocolate
            [[b.col - 1, b.row], [b.col + 1, b.row], [b.col, b.row - 1], [b.col, b.row + 1]].forEach(([nc, nr]) => {
                const nb = getBlock(nc, nr);
                if (nb && nb.crate > 0) {
                    nb.crate--;
                    if (nb.crate <= 0) {
                        nb.crate = 0; nb.alive = false;
                        spawnParticles(nb.x + BLOCK_SIZE / 2, nb.y + BLOCK_SIZE / 2, '#D4A574', 6);
                    }
                }
                if (nb && nb.chocolate > 0) {
                    nb.chocolate--;
                    if (nb.chocolate <= 0) {
                        nb.chocolate = 0; nb.alive = false;
                        spawnParticles(nb.x + BLOCK_SIZE / 2, nb.y + BLOCK_SIZE / 2, '#8B4513', 6);
                    }
                }
            });

            if (specialType !== SPECIAL_NONE && b.col === centerCol && b.row === centerRow) {
                specialBlock = b;
                return;
            }

            b.alive = false;
            b.popAnim = 0.01;
            b.flash = 1;
            const pc = b.colorIdx >= 0 ? COLOR_HEX[b.colorIdx] : '#AAA';
            spawnPopParticles(b.x + BLOCK_SIZE / 2, b.y + BLOCK_SIZE / 2, pc, b.colorIdx, 8);
        });

        if (specialType !== SPECIAL_NONE) {
            if (!specialBlock) {
                specialBlock = group.find(b => b.alive) || group[0];
            }
            if (specialBlock && specialBlock.alive) {
                specialBlock.special = specialType;
                specialBlock.scale = 1.3;
                spawnStarBurst(specialBlock.x + BLOCK_SIZE / 2, specialBlock.y + BLOCK_SIZE / 2);
            }
        }

        comboCount++;
        if (size >= 3) {
            let text = '', color = '#FFF';
            if (size >= 9) { text = 'INCREDIBLE!'; color = '#FFD700'; }
            else if (size >= 7) { text = 'AMAZING!'; color = '#FF6BFF'; }
            else if (size >= 5) { text = 'GREAT!'; color = '#6BF'; }
            else if (size >= 3) { text = 'NICE!'; color = '#8F8'; }
            if (text) {
                comboTexts.push({ text, x: GAME_W / 2, y: GAME_H / 2 - 40, life: 1, color, scale: 0 });
            }
        }

        if (size >= 5) {
            shakeTimer = 12;
            shakeIntensity = Math.min(size * 0.8, 8);
        }

        const cx = group.reduce((s, b) => s + b.x, 0) / size + BLOCK_SIZE / 2;
        const cy = group.reduce((s, b) => s + b.y, 0) / size + BLOCK_SIZE / 2;
        scorePopups.push({ text: `+${pts}`, x: cx, y: cy, life: 1, size: Math.min(22 + size * 2, 36) });

        sfxClear(size);
    }

    // ══════════════════════════════════════════
    //  SPECIAL ACTIVATION
    // ══════════════════════════════════════════
    function activateSpecial(block, dir) {
        if (!block || !block.alive) return;
        const sp = block.special;
        block.special = SPECIAL_NONE;
        block.alive = false;
        const pc = block.colorIdx >= 0 ? COLOR_HEX[block.colorIdx] : '#FFF';
        spawnPopParticles(block.x + BLOCK_SIZE / 2, block.y + BLOCK_SIZE / 2, pc, block.colorIdx, 10);

        if (sp === SPECIAL_ROCKET) {
            sfxRocket();
            if (dir === 'h') {
                for (let c = 0; c < COLS; c++) {
                    const b = getBlock(c, block.row);
                    if (b && b.alive) {
                        b.alive = false;
                        const bpc = b.colorIdx >= 0 ? COLOR_HEX[b.colorIdx] : '#FFA';
                        spawnPopParticles(b.x + BLOCK_SIZE / 2, b.y + BLOCK_SIZE / 2, bpc, b.colorIdx, 4);
                        score += 20;
                    }
                }
                spawnRocketTrail(block.row, 'h');
            } else {
                for (let r = 0; r < ROWS; r++) {
                    const b = getBlock(block.col, r);
                    if (b && b.alive) {
                        b.alive = false;
                        const bpc = b.colorIdx >= 0 ? COLOR_HEX[b.colorIdx] : '#FFA';
                        spawnPopParticles(b.x + BLOCK_SIZE / 2, b.y + BLOCK_SIZE / 2, bpc, b.colorIdx, 4);
                        score += 20;
                    }
                }
                spawnRocketTrail(block.col, 'v');
            }
            shakeTimer = 10; shakeIntensity = 5;
        } else if (sp === SPECIAL_BOMB) {
            sfxBomb();
            for (let dc = -2; dc <= 2; dc++) {
                for (let dr = -2; dr <= 2; dr++) {
                    if (Math.abs(dc) === 2 && Math.abs(dr) === 2) continue;
                    const b = getBlock(block.col + dc, block.row + dr);
                    if (b && b.alive) {
                        b.alive = false;
                        const bpc = b.colorIdx >= 0 ? COLOR_HEX[b.colorIdx] : '#F80';
                        spawnPopParticles(b.x + BLOCK_SIZE / 2, b.y + BLOCK_SIZE / 2, bpc, b.colorIdx, 5);
                        score += 20;
                    }
                }
            }
            spawnShockwave(block.x + BLOCK_SIZE / 2, block.y + BLOCK_SIZE / 2);
            shakeTimer = 15; shakeIntensity = 7;
        } else if (sp === SPECIAL_DISCO) {
            sfxDisco();
            const targetColor = block.colorIdx;
            for (let c = 0; c < COLS; c++) {
                for (let r = 0; r < ROWS; r++) {
                    const b = getBlock(c, r);
                    if (b && b.alive && b.colorIdx === targetColor) {
                        b.alive = false;
                        spawnPopParticles(b.x + BLOCK_SIZE / 2, b.y + BLOCK_SIZE / 2, COLOR_HEX[b.colorIdx], b.colorIdx, 4);
                        score += 30;
                        if (LEVELS[levelIdx].goal.type === 'clear_color' && b.colorIdx === LEVELS[levelIdx].goal.colorIdx) {
                            levelProgress++;
                        }
                    }
                }
            }
            spawnConfetti(GAME_W / 2, GAME_H / 3, 30);
            shakeTimer = 20; shakeIntensity = 6;
        }
    }

    // ══════════════════════════════════════════
    //  PHYSICS
    // ══════════════════════════════════════════
    function applyGravity(dt) {
        let anyMoving = false;
        for (let c = 0; c < COLS; c++) {
            for (let r = ROWS - 1; r >= 0; r--) {
                const b = grid[c][r];
                if (!b || !b.alive) continue;
                const ty = GRID_PAD_Y + b.row * BLOCK_SIZE;
                if (Math.abs(b.y - ty) > 0.5 || Math.abs(b.vy) > 0.5) {
                    b.settled = false;
                    b.vy += GRAVITY * dt;
                    b.y += b.vy * dt;
                    if (b.y >= ty && b.vy > 0) {
                        b.y = ty;
                        if (Math.abs(b.vy) > BOUNCE_THRESHOLD) {
                            b.vy = -b.vy * BOUNCE_DAMP;
                            b.scale = 0.85;
                            sfxLand();
                        } else {
                            b.vy = 0;
                            b.y = ty;
                            b.settled = true;
                        }
                    }
                    anyMoving = true;
                } else {
                    b.y = ty;
                    b.settled = true;
                }
                // Horizontal slide
                const tx = GRID_PAD_X + b.col * BLOCK_SIZE;
                if (Math.abs(b.x - tx) > 0.5) {
                    b.x = lerp(b.x, tx, SLIDE_SPEED * dt);
                    anyMoving = true;
                } else {
                    b.x = tx;
                }
                // Scale recovery
                if (b.scale < 1) b.scale = Math.min(1, b.scale + 0.04 * dt);
                if (b.scale > 1) b.scale = Math.max(1, b.scale - 0.02 * dt);
            }
        }
        return anyMoving;
    }

    function dropBlocks() {
        let moved = false;
        for (let c = 0; c < COLS; c++) {
            let writeRow = ROWS - 1;
            for (let r = ROWS - 1; r >= 0; r--) {
                if (grid[c][r] && grid[c][r].alive) {
                    if (r !== writeRow) {
                        const b = grid[c][r];
                        grid[c][writeRow] = b;
                        grid[c][r] = null;
                        b.row = writeRow;
                        b.settled = false;
                        b.vy = 0;
                        moved = true;
                    }
                    writeRow--;
                }
            }
            for (let r = writeRow; r >= 0; r--) {
                const lv = LEVELS[levelIdx];
                const b = Block(c, r, randInt(0, lv.numColors - 1));
                b.y = GRID_PAD_Y + (r - (writeRow + 1)) * BLOCK_SIZE - BLOCK_SIZE;
                b.vy = 0;
                b.settled = false;
                b.wobble = Math.random() * Math.PI * 2;
                b.entryTimer = 1;
                b.entryScale = 0;
                b.entryDelay = 0;
                grid[c][r] = b;
                moved = true;
            }
        }
        return moved;
    }

    function hasValidMoves() {
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                const g = findGroup(c, r);
                if (g.length >= 2) return true;
                const b = getBlock(c, r);
                if (b && b.alive && b.special !== SPECIAL_NONE) return true;
            }
        }
        return false;
    }

    function checkGoal() {
        const lv = LEVELS[levelIdx];
        if (lv.goal.type === 'score') return score >= lv.goal.target;
        if (lv.goal.type === 'clear_color') return levelProgress >= lv.goal.target;
        return false;
    }

    function getStars() {
        const lv = LEVELS[levelIdx];
        if (movesLeft >= lv.star3) return 3;
        if (movesLeft >= lv.star2) return 2;
        return 1;
    }

    // ══════════════════════════════════════════
    //  PARTICLE SYSTEM — Kenney sprite particles
    // ══════════════════════════════════════════
    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(2, 6);
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - rand(1, 3),
                size: rand(2, 5),
                color,
                life: 1, decay: rand(0.015, 0.03),
                rotation: rand(0, Math.PI * 2),
                rotSpeed: rand(-0.2, 0.2),
                gravity: 0.15,
            });
        }
    }

    function spawnPopParticles(x, y, color, colorIdx, count) {
        // Spawn Kenney white particle sprites tinted with block color
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
            const speed = rand(3, 8);
            const particleId = randInt(1, 7);
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - rand(2, 5),
                size: rand(4, 8),
                color,
                colorIdx: colorIdx >= 0 ? colorIdx : -1,
                life: 1, decay: rand(0.018, 0.035),
                rotation: rand(0, Math.PI * 2),
                rotSpeed: rand(-0.3, 0.3),
                gravity: 0.18,
                spriteParticle: `particle_${particleId}`,
            });
        }
        // Confetti burst on every pop for satisfying feedback
        spawnConfettiBurst(x, y, color, Math.min(count, 6));
    }

    function spawnConfettiBurst(x, y, color, count) {
        const confettiColors = [color, '#FFD700', '#FF69B4', '#4ADE80', '#60A5FA', '#FBBF24'];
        for (let i = 0; i < count; i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(2, 7);
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - rand(3, 6),
                size: rand(2, 4),
                color: confettiColors[i % confettiColors.length],
                life: 1, decay: rand(0.012, 0.025),
                rotation: rand(0, Math.PI * 2),
                rotSpeed: rand(-0.4, 0.4),
                gravity: 0.12,
                isConfetti: true,
            });
        }
    }

    function spawnIceParticles(x, y) {
        for (let i = 0; i < 6; i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(2, 5);
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                size: rand(3, 6),
                color: i % 2 === 0 ? '#B0E0FF' : '#FFF',
                life: 1, decay: rand(0.02, 0.04),
                rotation: rand(0, Math.PI),
                rotSpeed: rand(-0.15, 0.15),
                gravity: 0.1,
                spriteParticle: `particle_${randInt(1, 7)}`,
            });
        }
    }

    function spawnStarBurst(x, y) {
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            particles.push({
                x, y,
                vx: Math.cos(angle) * 4,
                vy: Math.sin(angle) * 4,
                size: 4, color: '#FFD700',
                life: 1, decay: 0.02,
                rotation: 0, rotSpeed: 0.1, gravity: 0,
                star: true,
            });
        }
    }

    function spawnShockwave(x, y) {
        particles.push({
            x, y, vx: 0, vy: 0, size: 5,
            color: '#FFF',
            life: 1, decay: 0.03,
            rotation: 0, rotSpeed: 0, gravity: 0,
            shockwave: true, radius: 5,
        });
    }

    function spawnRocketTrail(idx, dir) {
        const count = 20;
        for (let i = 0; i < count; i++) {
            const t = i / count;
            let px, py;
            if (dir === 'h') {
                px = GRID_PAD_X + t * COLS * BLOCK_SIZE;
                py = GRID_PAD_Y + idx * BLOCK_SIZE + BLOCK_SIZE / 2;
            } else {
                px = GRID_PAD_X + idx * BLOCK_SIZE + BLOCK_SIZE / 2;
                py = GRID_PAD_Y + t * ROWS * BLOCK_SIZE;
            }
            particles.push({
                x: px, y: py,
                vx: rand(-1, 1), vy: rand(-1, 1),
                size: rand(3, 5), color: '#FF6', life: 1, decay: 0.04,
                rotation: 0, rotSpeed: 0.1, gravity: 0.05,
                spriteParticle: `particle_${randInt(1, 7)}`,
            });
        }
    }

    function spawnConfetti(x, y, count) {
        const cols = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A855F7', '#3B82F6', '#22C55E'];
        for (let i = 0; i < count; i++) {
            confetti.push({
                x: x + rand(-40, 40), y: y + rand(-20, 20),
                vx: rand(-4, 4), vy: rand(-8, -2),
                size: rand(3, 7), color: cols[randInt(0, cols.length - 1)],
                life: 1, decay: rand(0.005, 0.012),
                rotation: rand(0, Math.PI * 2), rotSpeed: rand(-0.15, 0.15),
                gravity: 0.12,
            });
        }
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= p.decay * dt;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            if (p.shockwave) { p.radius += 3 * dt; continue; }
            p.vy += (p.gravity || 0.15) * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rotation += (p.rotSpeed || 0) * dt;
        }
        for (let i = confetti.length - 1; i >= 0; i--) {
            const c = confetti[i];
            c.life -= c.decay * dt;
            if (c.life <= 0) { confetti.splice(i, 1); continue; }
            c.vy += c.gravity * dt;
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            c.rotation += c.rotSpeed * dt;
            c.vx *= 0.99;
        }
    }

    // ══════════════════════════════════════════
    //  DRAWING — Kenney sprite rendering
    // ══════════════════════════════════════════

    // Tint a sprite by drawing it then overlaying color via composite
    function drawTintedSprite(img, x, y, w, h, tintColor, tintAlpha) {
        ctx.save();
        ctx.drawImage(img, x, y, w, h);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = tintAlpha || 0.5;
        ctx.fillStyle = tintColor;
        ctx.fillRect(x, y, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // Fallback block when sprite missing
    function drawFallbackBlock(colorIdx, x, y, w, h) {
        ctx.fillStyle = COLOR_HEX[colorIdx] || '#888';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, w * 0.15);
        ctx.fill();
        // 3D bevel illusion
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, w - 4, h * 0.4, w * 0.12);
        ctx.fill();
    }

    function drawBackground() {
        const lv = LEVELS[levelIdx];
        const baseHue = lv ? lv.bgHue : 200;
        // Animate hue shift slowly over time for a living background
        const hue = (baseHue + Math.sin(frameCount * 0.001) * 15) % 360;

        const bgImg = spr('bg');
        if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, W, H);
            // Warm color wash that shifts per level set
            ctx.fillStyle = `hsla(${hue}, 40%, 50%, 0.18)`;
            ctx.fillRect(0, 0, W, H);
        } else {
            const grad = ctx.createLinearGradient(0, 0, W * 0.3, H);
            grad.addColorStop(0, `hsl(${hue}, 65%, 85%)`);
            grad.addColorStop(0.5, `hsl(${(hue + 25) % 360}, 55%, 78%)`);
            grad.addColorStop(1, `hsl(${(hue + 50) % 360}, 50%, 72%)`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
        }

        // Soft radial spotlight at top center
        const spotGrad = ctx.createRadialGradient(W / 2, gs(60), 0, W / 2, gs(60), H * 0.6);
        spotGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
        spotGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = spotGrad;
        ctx.fillRect(0, 0, W, H);

        // Subtle floating tile shapes for ambience
        ctx.globalAlpha = 0.05;
        const t = frameCount * 0.004;
        for (let i = 0; i < 7; i++) {
            const bx = gs(40 + i * 65 + Math.sin(t + i * 1.3) * 25);
            const by = gs(30 + i * 80 + Math.cos(t * 0.6 + i * 1.7) * 35);
            const sz = gs(24 + i * 3);
            const tileKey = getTileKey(i % 6, 1);
            const tileImg = spr(tileKey);
            if (tileImg) {
                ctx.save();
                ctx.translate(bx, by);
                ctx.rotate(Math.sin(t * 0.3 + i) * 0.15);
                ctx.drawImage(tileImg, -sz / 2, -sz / 2, sz, sz);
                ctx.restore();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawGridFrame() {
        const pad = 6;
        const x = gs(GRID_PAD_X - pad);
        const y = gs(GRID_PAD_Y - pad);
        const w = gs(COLS * BLOCK_SIZE + pad * 2);
        const h = gs(ROWS * BLOCK_SIZE + pad * 2);

        // Outer shadow for depth
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = gs(12);
        ctx.shadowOffsetY = gs(4);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.roundRect(x - gs(2), y - gs(2), w + gs(4), h + gs(4), gs(14));
        ctx.fill();
        ctx.restore();

        // Inner lighter fill with warm tint
        const innerGrad = ctx.createLinearGradient(x, y, x, y + h);
        innerGrad.addColorStop(0, 'rgba(255,255,255,0.14)');
        innerGrad.addColorStop(1, 'rgba(255,255,255,0.06)');
        ctx.fillStyle = innerGrad;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, gs(10));
        ctx.fill();

        // Warm golden border
        ctx.strokeStyle = 'rgba(255,215,0,0.15)';
        ctx.lineWidth = gs(1.5);
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, gs(10));
        ctx.stroke();

        // Subtle cell grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = gs(0.5);
        for (let c = 1; c < COLS; c++) {
            const lx = gs(GRID_PAD_X + c * BLOCK_SIZE);
            ctx.beginPath();
            ctx.moveTo(lx, y + gs(2));
            ctx.lineTo(lx, y + h - gs(4));
            ctx.stroke();
        }
        for (let r = 1; r < ROWS; r++) {
            const ly = gs(GRID_PAD_Y + r * BLOCK_SIZE);
            ctx.beginPath();
            ctx.moveTo(x + gs(2), ly);
            ctx.lineTo(x + w - gs(4), ly);
            ctx.stroke();
        }
    }

    function drawBlock(b) {
        if (!b || !b.alive) return;

        const gap = BLOCK_GAP;
        const bx = gs(b.x + gap);
        const by = gs(b.y + gap);
        const cellSz = gs(BLOCK_SIZE - gap * 2);
        const cx = bx + cellSz / 2;
        const cy = by + cellSz / 2;

        // Entry scale animation
        let entryS = 1;
        if (b.entryTimer > 0) {
            entryS = easeOutBack(clamp(1 - b.entryTimer, 0, 1));
            if (entryS < 0.01) return; // not visible yet
        }

        ctx.save();
        ctx.translate(cx, cy);

        // Apply scale (bounce squash + entry)
        const s = b.scale * entryS;
        ctx.scale(s, s);

        // Subtle idle wobble
        b.wobble += 0.015;
        const wobbleScale = 1 + Math.sin(b.wobble) * 0.006;
        ctx.scale(wobbleScale, 1 / wobbleScale);

        const halfSz = cellSz / 2;

        // ── Crate block ──
        if (b.crate > 0) {
            const crateImg = spr('crate');
            if (crateImg) {
                ctx.drawImage(crateImg, -halfSz, -halfSz, cellSz, cellSz);
            } else {
                drawFallbackCrate(halfSz, b.crate);
            }
            if (b.crate === 1) {
                ctx.strokeStyle = 'rgba(0,0,0,0.6)';
                ctx.lineWidth = gs(1.5);
                ctx.beginPath();
                ctx.moveTo(-halfSz * 0.3, -halfSz);
                ctx.lineTo(halfSz * 0.1, 0);
                ctx.lineTo(-halfSz * 0.1, halfSz);
                ctx.stroke();
                ctx.moveTo(halfSz * 0.2, -halfSz * 0.5);
                ctx.lineTo(-halfSz * 0.2, halfSz * 0.3);
                ctx.stroke();
            }
            ctx.restore();
            return;
        }

        // ── Chocolate block ──
        if (b.chocolate > 0) {
            const chocoImg = spr('chocolate');
            if (chocoImg) {
                ctx.drawImage(chocoImg, -halfSz, -halfSz, cellSz, cellSz);
            } else {
                ctx.fillStyle = '#5C3317';
                ctx.beginPath();
                ctx.roundRect(-halfSz, -halfSz, cellSz, cellSz, cellSz * 0.12);
                ctx.fill();
            }
            if (b.chocolate === 1) {
                ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                ctx.lineWidth = gs(1.2);
                ctx.beginPath();
                ctx.moveTo(-halfSz * 0.4, -halfSz * 0.6);
                ctx.lineTo(0, halfSz * 0.2);
                ctx.lineTo(halfSz * 0.3, halfSz * 0.7);
                ctx.stroke();
            }
            ctx.restore();
            return;
        }

        // ── Normal Kenney tile block ──
        const isHighlighted = highlightGroup && highlightGroup.includes(b);
        const variant = isHighlighted ? 2 : 1;
        const tileKey = getTileKey(b.colorIdx, variant);
        const tileImg = spr(tileKey);

        // Draw shadow under block
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.ellipse(0, halfSz * 0.88, halfSz * 0.7, halfSz * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Draw Kenney tile sprite
        if (tileImg) {
            ctx.drawImage(tileImg, -halfSz, -halfSz, cellSz, cellSz);
        } else {
            drawFallbackBlock(b.colorIdx, -halfSz, -halfSz, cellSz, cellSz);
        }

        // Selected group glow effect (white shadow)
        if (isHighlighted) {
            ctx.save();
            ctx.shadowColor = '#FFF';
            ctx.shadowBlur = gs(6);
            ctx.globalAlpha = 0.3 + Math.sin(frameCount * 0.08) * 0.15;
            ctx.fillStyle = 'rgba(255,255,255,0.01)';
            ctx.beginPath();
            ctx.roundRect(-halfSz, -halfSz, cellSz, cellSz, cellSz * 0.12);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        // ── Special overlays ──
        if (b.special === SPECIAL_ROCKET) {
            drawRocketOverlay(halfSz, cellSz);
        } else if (b.special === SPECIAL_BOMB) {
            const bombImg = spr('bomb');
            if (bombImg) {
                const bombSz = cellSz * 0.6;
                ctx.drawImage(bombImg, -bombSz / 2, -bombSz / 2, bombSz, bombSz);
            } else {
                drawBombOverlayFallback(halfSz);
            }
        } else if (b.special === SPECIAL_DISCO) {
            const rbImg = spr('rainbow');
            if (rbImg) {
                const rbSz = cellSz * 0.6;
                ctx.globalAlpha = 0.7 + Math.sin(frameCount * 0.1) * 0.3;
                ctx.drawImage(rbImg, -rbSz / 2, -rbSz / 2, rbSz, rbSz);
                ctx.globalAlpha = 1;
            } else {
                drawDiscoOverlayFallback(halfSz);
            }
        }

        // ── Ice overlay ──
        if (b.ice) {
            ctx.fillStyle = 'rgba(170,220,255,0.35)';
            ctx.beginPath();
            ctx.roundRect(-halfSz, -halfSz, cellSz, cellSz, cellSz * 0.12);
            ctx.fill();
            ctx.strokeStyle = 'rgba(200,235,255,0.65)';
            ctx.lineWidth = gs(2);
            ctx.beginPath();
            ctx.roundRect(-halfSz, -halfSz, cellSz, cellSz, cellSz * 0.12);
            ctx.stroke();
            // Frost crystal lines
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = gs(0.8);
            ctx.beginPath();
            ctx.moveTo(-halfSz * 0.4, -halfSz * 0.6);
            ctx.lineTo(halfSz * 0.2, halfSz * 0.4);
            ctx.moveTo(halfSz * 0.3, -halfSz * 0.5);
            ctx.lineTo(-halfSz * 0.3, halfSz * 0.2);
            ctx.stroke();
            // Sparkle dots
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath();
            ctx.arc(-halfSz * 0.3, -halfSz * 0.3, gs(1.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(halfSz * 0.2, halfSz * 0.1, gs(1), 0, Math.PI * 2);
            ctx.fill();
        }

        // ── White flash (pop start) ──
        if (b.flash > 0) {
            ctx.fillStyle = `rgba(255,255,255,${b.flash * 0.6})`;
            ctx.beginPath();
            ctx.roundRect(-halfSz, -halfSz, cellSz, cellSz, cellSz * 0.12);
            ctx.fill();
        }

        ctx.restore();
    }

    function drawRocketOverlay(halfSz, cellSz) {
        const arrowH = cellSz * 0.38;
        const arrowW = cellSz * 0.22;
        const glow = 0.5 + Math.sin(frameCount * 0.15) * 0.3;

        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.shadowColor = '#FFF';
        ctx.shadowBlur = gs(4) * glow;

        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = gs(0.8);
        ctx.beginPath();
        ctx.moveTo(0, -arrowH);
        ctx.lineTo(arrowW, arrowH * 0.2);
        ctx.lineTo(arrowW * 0.4, arrowH * 0.2);
        ctx.lineTo(arrowW * 0.4, arrowH);
        ctx.lineTo(-arrowW * 0.4, arrowH);
        ctx.lineTo(-arrowW * 0.4, arrowH * 0.2);
        ctx.lineTo(-arrowW, arrowH * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    function drawBombOverlayFallback(halfSz) {
        const r = halfSz * 0.4;
        ctx.fillStyle = 'rgba(40,40,40,0.85)';
        ctx.beginPath();
        ctx.arc(0, gs(1), r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#A85';
        ctx.lineWidth = gs(1.5);
        ctx.beginPath();
        ctx.moveTo(r * 0.4, -r * 0.6);
        ctx.quadraticCurveTo(r * 0.8, -r * 1.5, r * 0.2, -r * 1.4);
        ctx.stroke();
        if (Math.sin(frameCount * 0.2) > 0) {
            ctx.fillStyle = '#FF0';
            ctx.beginPath();
            ctx.arc(r * 0.2, -r * 1.4, gs(2), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawDiscoOverlayFallback(halfSz) {
        const r = halfSz * 0.4;
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 + frameCount * 0.03;
            ctx.fillStyle = COLOR_HEX[i];
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, r, angle, angle + Math.PI / 3);
            ctx.closePath();
            ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawFallbackCrate(halfSz, hp) {
        const sz = halfSz * 2;
        const grad = ctx.createLinearGradient(-halfSz, -halfSz, halfSz, halfSz);
        grad.addColorStop(0, '#D4A574');
        grad.addColorStop(0.5, '#B8864E');
        grad.addColorStop(1, '#8B6538');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(-halfSz, -halfSz, sz, sz, sz * 0.1);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = gs(0.5);
        for (let i = 0; i < 3; i++) {
            const y = -halfSz + sz * (0.25 + i * 0.25);
            ctx.beginPath();
            ctx.moveTo(-halfSz + gs(3), y);
            ctx.lineTo(halfSz - gs(3), y);
            ctx.stroke();
        }
    }

    function drawHighlight(group) {
        if (!group || group.length < 2) return;
        ctx.save();
        const t = frameCount * 0.08;
        const glowAlpha = 0.35 + Math.sin(t) * 0.15;
        group.forEach(b => {
            const gap = BLOCK_GAP;
            const bx = gs(b.x + gap);
            const by = gs(b.y + gap);
            const sz = gs(BLOCK_SIZE - gap * 2);

            ctx.shadowColor = '#FFF';
            ctx.shadowBlur = gs(8);
            ctx.strokeStyle = `rgba(255,255,255,${glowAlpha})`;
            ctx.lineWidth = gs(2.5);
            ctx.beginPath();
            ctx.roundRect(bx - gs(1), by - gs(1), sz + gs(2), sz + gs(2), gs(6));
            ctx.stroke();
            ctx.shadowBlur = 0;
        });
        ctx.restore();
    }

    function drawParticles() {
        particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.life;

            if (p.shockwave) {
                ctx.strokeStyle = p.color;
                ctx.lineWidth = gs(2.5) * p.life;
                ctx.beginPath();
                ctx.arc(gs(p.x), gs(p.y), gs(p.radius), 0, Math.PI * 2);
                ctx.stroke();
            } else if (p.star) {
                ctx.translate(gs(p.x), gs(p.y));
                ctx.rotate(p.rotation);
                // Use star_icon sprite if available
                const starImg = spr('star_icon');
                if (starImg) {
                    const ssz = gs(p.size * 2) * p.life;
                    ctx.drawImage(starImg, -ssz / 2, -ssz / 2, ssz, ssz);
                } else {
                    ctx.fillStyle = p.color;
                    drawStarShape(0, 0, gs(p.size) * p.life, 4);
                    ctx.fill();
                }
            } else if (p.isConfetti) {
                // Confetti rectangle with tumble
                ctx.translate(gs(p.x), gs(p.y));
                ctx.rotate(p.rotation);
                ctx.fillStyle = p.color;
                const cw = gs(p.size * 1.6);
                const ch = gs(p.size * 0.7);
                ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
                // Subtle highlight on confetti
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillRect(-cw / 2, -ch / 2, cw, ch * 0.35);
            } else if (p.spriteParticle) {
                // Kenney white particle sprite, tinted with block color
                ctx.translate(gs(p.x), gs(p.y));
                ctx.rotate(p.rotation);
                const pImg = spr(p.spriteParticle);
                const psz = gs(p.size);
                if (pImg) {
                    // Draw the white particle sprite
                    ctx.drawImage(pImg, -psz / 2, -psz / 2, psz, psz);
                    // Tint with color via source-atop
                    ctx.globalCompositeOperation = 'source-atop';
                    ctx.globalAlpha = 0.6;
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-psz / 2, -psz / 2, psz, psz);
                    ctx.globalCompositeOperation = 'source-over';
                } else {
                    // Fallback: colored square
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-psz / 2, -psz / 2, psz, psz);
                }
            } else {
                ctx.translate(gs(p.x), gs(p.y));
                ctx.rotate(p.rotation);
                ctx.fillStyle = p.color;
                const sz = gs(p.size);
                if (p.shape === 'circle') {
                    ctx.beginPath();
                    ctx.arc(0, 0, sz / 2, 0, Math.PI * 2);
                    ctx.fill();
                } else if (p.shape === 'diamond') {
                    ctx.beginPath();
                    ctx.moveTo(0, -sz / 2);
                    ctx.lineTo(sz / 3, 0);
                    ctx.lineTo(0, sz / 2);
                    ctx.lineTo(-sz / 3, 0);
                    ctx.closePath();
                    ctx.fill();
                } else {
                    ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
                }
            }
            ctx.restore();
        });
        confetti.forEach(c => {
            ctx.save();
            ctx.globalAlpha = c.life;
            ctx.translate(gs(c.x), gs(c.y));
            ctx.rotate(c.rotation);
            ctx.fillStyle = c.color;
            ctx.fillRect(-gs(c.size / 2), -gs(c.size / 3), gs(c.size), gs(c.size * 0.4));
            ctx.restore();
        });
    }

    function drawStarShape(x, y, r, points) {
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const angle = (i * Math.PI) / points - Math.PI / 2;
            const rad = i % 2 === 0 ? r : r * 0.45;
            const px = x + Math.cos(angle) * rad;
            const py = y + Math.sin(angle) * rad;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    function drawScorePopups() {
        scorePopups.forEach(sp => {
            ctx.save();
            const progress = 1 - sp.life;
            const bounceScale = progress < 0.2 ? easeOutBack(progress / 0.2) : 1;
            const alpha = sp.life;
            ctx.globalAlpha = alpha;
            const fontSize = sp.size || 16;
            ctx.font = `bold ${gs(fontSize * bounceScale)}px 'Fredoka One', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const y = gs(sp.y - progress * 35);
            // Outline
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = gs(3);
            ctx.strokeText(sp.text, gs(sp.x), y);
            // Fill with white
            ctx.fillStyle = '#FFF';
            ctx.fillText(sp.text, gs(sp.x), y);
            ctx.restore();
        });
    }

    function drawComboTexts() {
        comboTexts.forEach(ct => {
            ctx.save();
            ct.scale = Math.min(ct.scale + 0.08, 1);
            const s = easeOutBack(ct.scale) * (0.8 + ct.life * 0.4);
            ctx.globalAlpha = ct.life;
            ctx.translate(gs(ct.x), gs(ct.y));
            ctx.scale(s, s);
            ctx.font = `bold ${gs(34)}px 'Fredoka One', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = gs(4);
            ctx.strokeText(ct.text, 0, 0);
            ctx.fillStyle = ct.color;
            ctx.fillText(ct.text, 0, 0);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillText(ct.text, 0, -gs(1));
            ctx.restore();
        });
    }

    // ── Draw a Kenney star icon or fallback unicode ──
    function drawStarIcon(x, y, sz, earned) {
        const starImg = spr('star_icon');
        if (starImg) {
            ctx.save();
            if (!earned) ctx.globalAlpha = 0.2;
            else {
                ctx.shadowColor = '#FFD700';
                ctx.shadowBlur = gs(4);
            }
            ctx.drawImage(starImg, x - sz / 2, y - sz / 2, sz, sz);
            ctx.shadowBlur = 0;
            ctx.restore();
        } else {
            ctx.fillStyle = earned ? '#FFD700' : 'rgba(255,255,255,0.15)';
            ctx.font = `${sz}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('\u2605', x, y);
        }
    }

    // ── Draw coin icon ──
    function drawCoinIcon(x, y, sz) {
        const coinImg = spr('coin');
        if (coinImg) {
            ctx.drawImage(coinImg, x, y, sz, sz);
        }
    }

    function drawHUD() {
        const lv = LEVELS[levelIdx];

        // ── Top bar background ──
        const barBg = ctx.createLinearGradient(0, 0, 0, gs(108));
        barBg.addColorStop(0, 'rgba(0,0,0,0.35)');
        barBg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = barBg;
        ctx.fillRect(0, 0, W, gs(108));

        ctx.textBaseline = 'middle';

        // ── Level pill ──
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        const pillW = gs(90);
        const pillH = gs(24);
        const pillX = gs(GAME_W / 2) - pillW / 2;
        const pillY = gs(8);
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
        ctx.fill();
        ctx.font = `bold ${gs(13)}px 'Fredoka One', sans-serif`;
        ctx.fillStyle = '#FFF';
        ctx.fillText(`Level ${lv.id}`, gs(GAME_W / 2), pillY + pillH / 2);

        // ── Goal panel with polished card ──
        const gpX = gs(GAME_W / 2 - 105);
        const gpY = gs(34);
        const gpW = gs(210);
        const gpH = gs(22);
        // Goal card background
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.roundRect(gpX - gs(2), gpY - gs(2), gpW + gs(4), gpH + gs(4), gs(12));
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.roundRect(gpX, gpY, gpW, gpH, gs(10));
        ctx.fill();

        ctx.font = `${gs(11)}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        let goalText = lv.goal.desc;
        if (lv.goal.type === 'clear_color') {
            goalText = `${lv.goal.desc} (${levelProgress}/${lv.goal.target})`;
            // Draw target color tile icon
            const goalTileKey = getTileKey(lv.goal.colorIdx, 1);
            const goalTileImg = spr(goalTileKey);
            if (goalTileImg) {
                const iconSz = gs(18);
                ctx.drawImage(goalTileImg, gpX + gs(4), gpY + gs(2), iconSz, iconSz);
            }
            // Progress fill inside goal card
            const gpFrac = clamp(levelProgress / lv.goal.target, 0, 1);
            if (gpFrac > 0) {
                ctx.fillStyle = `rgba(${COLOR_HEX[lv.goal.colorIdx] === '#E74C3C' ? '231,76,60' : '74,222,128'},0.15)`;
                ctx.beginPath();
                ctx.roundRect(gpX, gpY, gpW * gpFrac, gpH, gs(10));
                ctx.fill();
            }
        } else {
            goalText = `${lv.goal.desc} (${score}/${lv.goal.target})`;
            // Score progress fill
            const gpFrac = clamp(score / lv.goal.target, 0, 1);
            if (gpFrac > 0) {
                ctx.fillStyle = 'rgba(255,215,0,0.12)';
                ctx.beginPath();
                ctx.roundRect(gpX, gpY, gpW * gpFrac, gpH, gs(10));
                ctx.fill();
            }
        }
        ctx.fillStyle = '#FFF';
        ctx.fillText(goalText, gs(GAME_W / 2), gpY + gpH / 2);

        // ── Moves counter (left) ──
        ctx.textAlign = 'left';
        const movesColor = movesLeft <= 5 ? '#FF6B6B' : '#FFF';
        const movesFontSz = movesLeft <= 5 ? 24 : 22;
        ctx.font = `bold ${gs(movesFontSz)}px 'Fredoka One', sans-serif`;
        ctx.fillStyle = movesColor;
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = gs(2);
        ctx.strokeText(`${movesLeft}`, gs(18), gs(18));
        ctx.fillText(`${movesLeft}`, gs(18), gs(18));
        ctx.font = `${gs(9)}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('MOVES', gs(18), gs(34));

        // ── Score (right) with coin icon and bounce ──
        ctx.textAlign = 'right';
        // Animated score display
        if (scoreDisplay < score) {
            scoreDisplay = Math.min(score, scoreDisplay + Math.ceil((score - scoreDisplay) * 0.15));
        }
        // Score bounce animation
        const sBounce = scoreBounceSz > 1 ? scoreBounceSz : 1;
        ctx.save();
        ctx.translate(gs(GAME_W - 18), gs(18));
        ctx.scale(sBounce, sBounce);
        ctx.font = `bold ${gs(20)}px 'Fredoka One', sans-serif`;
        ctx.fillStyle = '#FFF';
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = gs(2);
        ctx.strokeText(`${scoreDisplay}`, 0, 0);
        ctx.fillText(`${scoreDisplay}`, 0, 0);
        ctx.restore();

        // Coin icon next to score
        drawCoinIcon(gs(GAME_W - 68), gs(6), gs(16));

        ctx.textAlign = 'right';
        ctx.font = `${gs(9)}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('SCORE', gs(GAME_W - 18), gs(34));

        // ── Star progress bar ──
        const sBarY = gs(58);
        const sBarW = gs(GAME_W - 100);
        const sBarH = gs(8);
        const sBarX = gs(50);

        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.roundRect(sBarX, sBarY, sBarW, sBarH, sBarH / 2);
        ctx.fill();

        const maxMoves = lv.moves;
        const fillProgress = clamp(movesLeft / maxMoves, 0, 1);
        const fillGrad = ctx.createLinearGradient(sBarX, 0, sBarX + sBarW, 0);
        fillGrad.addColorStop(0, '#FBBF24');
        fillGrad.addColorStop(0.5, '#F59E0B');
        fillGrad.addColorStop(1, '#EF4444');
        ctx.fillStyle = fillGrad;
        ctx.beginPath();
        ctx.roundRect(sBarX, sBarY, sBarW * fillProgress, sBarH, sBarH / 2);
        ctx.fill();

        // Star markers using Kenney star.png
        const starPos2 = lv.star2 / maxMoves;
        const starPos3 = lv.star3 / maxMoves;
        [starPos2, starPos3].forEach((pos, i) => {
            const sx = sBarX + sBarW * pos;
            const earned = movesLeft >= (i === 0 ? lv.star2 : lv.star3);
            drawStarIcon(sx, sBarY - gs(6), gs(16), earned);
        });

        // ── Rocket direction prompt ──
        if (state === ST_ROCKET_DIR) {
            ctx.textAlign = 'center';
            const gridBottom = gs(GRID_PAD_Y + ROWS * BLOCK_SIZE + 16);
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.roundRect(gs(GAME_W / 2 - 130), gridBottom - gs(14), gs(260), gs(28), gs(14));
            ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.font = `bold ${gs(12)}px sans-serif`;
            ctx.fillText('Tap direction: \u2190\u2192 Row  |  \u2191\u2193 Column', gs(GAME_W / 2), gridBottom);
        }
    }

    // ══════════════════════════════════════════
    //  LOADING SCREEN — with progress bar
    // ══════════════════════════════════════════
    function drawLoadingScreen() {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#2D1B69');
        grad.addColorStop(1, '#1A0F3C');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Title
        ctx.font = `bold ${gs(36)}px 'Fredoka One', sans-serif`;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = gs(3);
        ctx.strokeText('TOY CRUSH', gs(GAME_W / 2), gs(GAME_H * 0.32));
        const titleGrad = ctx.createLinearGradient(0, gs(GAME_H * 0.28), 0, gs(GAME_H * 0.36));
        titleGrad.addColorStop(0, '#FFD700');
        titleGrad.addColorStop(1, '#FF8C00');
        ctx.fillStyle = titleGrad;
        ctx.fillText('TOY CRUSH', gs(GAME_W / 2), gs(GAME_H * 0.32));

        // Subtitle
        ctx.font = `${gs(14)}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('Loading game assets...', gs(GAME_W / 2), gs(GAME_H * 0.42));

        // Progress bar background
        const barW = gs(260);
        const barH = gs(16);
        const barX = gs(GAME_W / 2) - barW / 2;
        const barY = gs(GAME_H * 0.50);

        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, barH / 2);
        ctx.fill();

        // Progress fill
        const fillW = barW * loadProgress;
        if (fillW > 0) {
            const pGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
            pGrad.addColorStop(0, '#4ADE80');
            pGrad.addColorStop(1, '#22C55E');
            ctx.fillStyle = pGrad;
            ctx.beginPath();
            ctx.roundRect(barX, barY, fillW, barH, barH / 2);
            ctx.fill();
        }

        // Progress text
        ctx.font = `bold ${gs(12)}px 'Fredoka One', sans-serif`;
        ctx.fillStyle = '#FFF';
        ctx.fillText(`${Math.floor(loadProgress * 100)}%`, gs(GAME_W / 2), barY + barH / 2);

        // Animated tiles rotating below
        const t = frameCount * 0.03;
        for (let i = 0; i < 6; i++) {
            const angle = t + (i / 6) * Math.PI * 2;
            const rx = gs(GAME_W / 2) + Math.cos(angle) * gs(50);
            const ry = gs(GAME_H * 0.64) + Math.sin(angle) * gs(20);
            const sz = gs(20);

            ctx.save();
            ctx.translate(rx, ry);
            ctx.rotate(Math.sin(t + i) * 0.2);
            ctx.globalAlpha = 0.6 + Math.sin(t + i * 1.2) * 0.3;

            const tileImg = spr(getTileKey(i, 1));
            if (tileImg) {
                ctx.drawImage(tileImg, -sz / 2, -sz / 2, sz, sz);
            } else {
                ctx.fillStyle = COLOR_HEX[i];
                ctx.beginPath();
                ctx.roundRect(-sz / 2, -sz / 2, sz, sz, sz * 0.15);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    // ══════════════════════════════════════════
    //  LEVEL SELECT
    // ══════════════════════════════════════════
    function drawLevelSelect() {
        // Background
        const bgImg = spr('bg');
        if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, W, H);
            ctx.fillStyle = 'rgba(30,10,60,0.55)';
            ctx.fillRect(0, 0, W, H);
        } else {
            const grad = ctx.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, '#2D1B69');
            grad.addColorStop(1, '#1A0F3C');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Title with gradient
        ctx.font = `bold ${gs(36)}px 'Fredoka One', sans-serif`;
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = gs(3);
        ctx.strokeText('TOY CRUSH', gs(GAME_W / 2), gs(48));
        const titleGrad = ctx.createLinearGradient(0, gs(34), 0, gs(62));
        titleGrad.addColorStop(0, '#FFD700');
        titleGrad.addColorStop(1, '#FF8C00');
        ctx.fillStyle = titleGrad;
        ctx.fillText('TOY CRUSH', gs(GAME_W / 2), gs(48));

        // Decorative Kenney tiles around title
        for (let i = 0; i < 6; i++) {
            const tileImg = spr(getTileKey(i, 1));
            if (tileImg) {
                const dx = gs(GAME_W / 2 + (i - 2.5) * 48 + Math.sin(frameCount * 0.03 + i) * 6);
                const dy = gs(78 + Math.cos(frameCount * 0.025 + i * 1.2) * 4);
                const dsz = gs(22);
                ctx.save();
                ctx.translate(dx, dy);
                ctx.rotate(Math.sin(frameCount * 0.02 + i) * 0.12);
                ctx.drawImage(tileImg, -dsz / 2, -dsz / 2, dsz, dsz);
                ctx.restore();
            }
        }

        ctx.font = `${gs(13)}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('Select Level', gs(GAME_W / 2), gs(100));

        // Level grid (5 columns, 4 rows)
        const cols = 5;
        const cellSz = gs(58);
        const gap = gs(14);
        const startX = gs(GAME_W / 2) - (cols * cellSz + (cols - 1) * gap) / 2;
        const startY = gs(125);

        for (let i = 0; i < 20; i++) {
            const c = i % cols;
            const r = Math.floor(i / cols);
            const x = startX + c * (cellSz + gap);
            const y = startY + r * (cellSz + gap);
            const unlocked = i < unlockedLevels;
            const stars = starRatings[i] || 0;

            if (unlocked) {
                // Tile-colored circle with subtle gradient
                const hue = (i * 36) % 360;
                const cGrad = ctx.createRadialGradient(x + cellSz / 2, y + cellSz / 2, 0, x + cellSz / 2, y + cellSz / 2, cellSz / 2);
                cGrad.addColorStop(0, '#FFF');
                cGrad.addColorStop(1, `hsl(${hue}, 75%, 88%)`);
                ctx.fillStyle = cGrad;
                ctx.beginPath();
                ctx.arc(x + cellSz / 2, y + cellSz / 2, cellSz / 2, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                ctx.lineWidth = gs(2);
                ctx.stroke();

                // Level number
                ctx.font = `bold ${gs(18)}px 'Fredoka One', sans-serif`;
                ctx.fillStyle = `hsl(${hue}, 55%, 35%)`;
                ctx.fillText(`${i + 1}`, x + cellSz / 2, y + cellSz / 2 - gs(3));

                // Stars using Kenney star icons
                for (let s = 0; s < 3; s++) {
                    drawStarIcon(
                        x + cellSz / 2 + (s - 1) * gs(14),
                        y + cellSz / 2 + gs(16),
                        gs(13),
                        s < stars
                    );
                }
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.beginPath();
                ctx.arc(x + cellSz / 2, y + cellSz / 2, cellSz / 2, 0, Math.PI * 2);
                ctx.fill();

                ctx.font = `${gs(16)}px sans-serif`;
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.fillText('\uD83D\uDD12', x + cellSz / 2, y + cellSz / 2);
            }
        }

        ctx.font = `${gs(11)}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('Tap a level to play', gs(GAME_W / 2), gs(GAME_H - 28));
    }

    // ══════════════════════════════════════════
    //  LEVEL COMPLETE / GAME OVER
    // ══════════════════════════════════════════
    function drawLevelComplete() {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Panel
        const panelW = gs(320);
        const panelH = gs(280);
        const panelX = (W - panelW) / 2;
        const panelY = gs(GAME_H * 0.2);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelW, panelH, gs(20));
        ctx.fill();

        // Title
        ctx.font = `bold ${gs(34)}px 'Fredoka One', sans-serif`;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = gs(3);
        ctx.strokeText('LEVEL CLEAR!', gs(GAME_W / 2), gs(GAME_H * 0.28));
        ctx.fillStyle = '#FFD700';
        ctx.fillText('LEVEL CLEAR!', gs(GAME_W / 2), gs(GAME_H * 0.28));

        // Score with coin
        ctx.font = `bold ${gs(20)}px 'Fredoka One', sans-serif`;
        ctx.fillStyle = '#FFF';
        ctx.fillText(`Score: ${score}`, gs(GAME_W / 2), gs(GAME_H * 0.40));
        drawCoinIcon(gs(GAME_W / 2 + 55), gs(GAME_H * 0.40 - 10), gs(18));

        // Stars using Kenney star icons
        const stars = getStars();
        for (let i = 0; i < 3; i++) {
            const earned = i < stars;
            const starX = gs(GAME_W / 2 + (i - 1) * 48);
            const starY = gs(GAME_H * 0.52);
            drawStarIcon(starX, starY, gs(36), earned);
        }

        const pulse = 0.7 + Math.sin(frameCount * 0.06) * 0.15;
        ctx.font = `${gs(14)}px sans-serif`;
        ctx.fillStyle = `rgba(255,255,255,${pulse})`;
        ctx.fillText('Tap to continue', gs(GAME_W / 2), gs(GAME_H * 0.64));
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const panelW = gs(300);
        const panelH = gs(200);
        const panelX = (W - panelW) / 2;
        const panelY = gs(GAME_H * 0.25);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelW, panelH, gs(20));
        ctx.fill();

        ctx.font = `bold ${gs(30)}px 'Fredoka One', sans-serif`;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = gs(3);
        ctx.strokeText('OUT OF MOVES', gs(GAME_W / 2), gs(GAME_H * 0.35));
        ctx.fillStyle = '#FF6B6B';
        ctx.fillText('OUT OF MOVES', gs(GAME_W / 2), gs(GAME_H * 0.35));

        ctx.font = `bold ${gs(18)}px 'Fredoka One', sans-serif`;
        ctx.fillStyle = '#FFF';
        ctx.fillText(`Score: ${score}`, gs(GAME_W / 2), gs(GAME_H * 0.47));

        const pulse = 0.7 + Math.sin(frameCount * 0.06) * 0.15;
        ctx.font = `${gs(14)}px sans-serif`;
        ctx.fillStyle = `rgba(255,255,255,${pulse})`;
        ctx.fillText('Tap to retry', gs(GAME_W / 2), gs(GAME_H * 0.58));
    }

    // ══════════════════════════════════════════
    //  MAIN RENDER
    // ══════════════════════════════════════════
    function draw() {
        ctx.clearRect(0, 0, W, H);
        ctx.save();

        if (state === ST_LOADING) {
            drawLoadingScreen();
            ctx.restore();
            return;
        }

        // Screen shake
        if (shakeTimer > 0) {
            const factor = shakeTimer / 15;
            const sx = (Math.random() - 0.5) * shakeIntensity * factor;
            const sy = (Math.random() - 0.5) * shakeIntensity * factor;
            ctx.translate(gs(sx), gs(sy));
        }

        if (state === ST_LEVEL_SELECT) {
            drawLevelSelect();
            ctx.restore();
            return;
        }

        drawBackground();
        drawGridFrame();

        // Draw blocks (back to front for proper layering)
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                drawBlock(grid[c][r]);
            }
        }

        // Highlight group glow
        if (state === ST_PLAYING && highlightGroup && highlightGroup.length >= 2) {
            drawHighlight(highlightGroup);
        }

        drawParticles();
        drawScorePopups();
        drawComboTexts();
        drawHUD();

        if (state === ST_LEVEL_COMPLETE) drawLevelComplete();
        if (state === ST_GAME_OVER) drawGameOver();

        ctx.restore();
    }

    // ══════════════════════════════════════════
    //  UPDATE
    // ══════════════════════════════════════════
    function update(dt) {
        frameCount++;
        dt = Math.min(dt, 3);

        if (state === ST_LOADING) return;

        if (shakeTimer > 0) shakeTimer -= dt;

        // Score bounce decay
        if (scoreBounceSz > 1) {
            scoreBounceSz = Math.max(1, scoreBounceSz - 0.02 * dt);
        }

        updateParticles(dt);

        for (let i = scorePopups.length - 1; i >= 0; i--) {
            scorePopups[i].life -= 0.015 * dt;
            if (scorePopups[i].life <= 0) scorePopups.splice(i, 1);
        }

        for (let i = comboTexts.length - 1; i >= 0; i--) {
            comboTexts[i].life -= 0.012 * dt;
            if (comboTexts[i].life <= 0) comboTexts.splice(i, 1);
        }

        // Block flash + entry animation
        if (grid) {
            for (let c = 0; c < COLS; c++) {
                for (let r = 0; r < ROWS; r++) {
                    const b = grid[c][r];
                    if (!b) continue;
                    if (b.flash > 0) b.flash = Math.max(0, b.flash - 0.04 * dt);
                    // Entry scale-in animation
                    if (b.entryTimer > 0) {
                        if (b.entryDelay > 0) {
                            b.entryDelay -= 0.016 * dt;
                        } else {
                            b.entryTimer -= 0.04 * dt;
                            if (b.entryTimer < 0) b.entryTimer = 0;
                        }
                    }
                }
            }
        }

        if (state === ST_LEVEL_SELECT || state === ST_LEVEL_COMPLETE || state === ST_GAME_OVER) return;
        if (state === ST_ROCKET_DIR) return;

        if (state === ST_CLEARING) {
            clearingBlocks -= dt;
            if (clearingBlocks <= 0) {
                dropBlocks();
                state = ST_FALLING;
            }
        }

        if (state === ST_FALLING || state === ST_REFILL) {
            const moving = applyGravity(dt);
            if (!moving) {
                let allSettled = true;
                for (let c = 0; c < COLS && allSettled; c++) {
                    for (let r = 0; r < ROWS && allSettled; r++) {
                        const b = grid[c][r];
                        if (b && !b.settled) allSettled = false;
                    }
                }
                if (allSettled) {
                    if (checkGoal()) {
                        state = ST_LEVEL_COMPLETE;
                        const stars = getStars();
                        starRatings[levelIdx] = Math.max(starRatings[levelIdx] || 0, stars);
                        if (levelIdx + 1 < LEVELS.length) unlockedLevels = Math.max(unlockedLevels, levelIdx + 2);
                        sfxLevelComplete();
                        spawnConfetti(GAME_W / 2, GAME_H / 3, 40);
                        for (let i = 0; i < stars; i++) setTimeout(() => sfxStar(), i * 200);
                        if (gameOverCB) gameOverCB({ score, level: LEVELS[levelIdx].id, stars });
                    } else if (movesLeft <= 0 && !checkGoal()) {
                        state = ST_GAME_OVER;
                        if (gameOverCB) gameOverCB({ score, level: LEVELS[levelIdx].id, stars: 0 });
                    } else {
                        state = ST_PLAYING;
                        comboCount = 0;
                    }
                }
            }
        }

        if (state === ST_SPECIAL_ACTIVATE) {
            clearingBlocks -= dt;
            if (clearingBlocks <= 0) {
                dropBlocks();
                state = ST_FALLING;
            }
        }
    }

    // ══════════════════════════════════════════
    //  INPUT
    // ══════════════════════════════════════════
    function handleTap(px, py) {
        const gamePx = px / SCALE;
        const gamePy = py / SCALE;

        if (state === ST_LEVEL_SELECT) {
            handleLevelSelectTap(gamePx, gamePy);
            return;
        }

        if (state === ST_LEVEL_COMPLETE) {
            state = ST_LEVEL_SELECT;
            return;
        }

        if (state === ST_GAME_OVER) {
            startLevel(levelIdx);
            return;
        }

        if (state === ST_ROCKET_DIR) {
            if (pendingSpecial) {
                const rb = getBlock(pendingSpecial.col, pendingSpecial.row);
                if (rb) {
                    const bx = rb.x + BLOCK_SIZE / 2;
                    const by = rb.y + BLOCK_SIZE / 2;
                    const dx = gamePx - bx;
                    const dy = gamePy - by;
                    const dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
                    activateSpecial(rb, dir);
                    clearingBlocks = 8;
                    state = ST_SPECIAL_ACTIVATE;
                    pendingSpecial = null;
                }
            }
            return;
        }

        if (state !== ST_PLAYING) return;

        const cell = pixelToGrid(gamePx, gamePy);
        if (!cell) return;

        const block = getBlock(cell.col, cell.row);
        if (!block || !block.alive) return;

        sfxTap();

        if (block.special !== SPECIAL_NONE) {
            if (block.special === SPECIAL_ROCKET) {
                pendingSpecial = { col: cell.col, row: cell.row };
                state = ST_ROCKET_DIR;
                return;
            }
            movesLeft--;
            activateSpecial(block, null);
            clearingBlocks = 8;
            state = ST_SPECIAL_ACTIVATE;
            return;
        }

        const group = findGroupAt(cell.col, cell.row);
        if (group.length < 2) return;

        movesLeft--;
        clearGroup(group);
        clearingBlocks = 12;
        state = ST_CLEARING;
    }

    function handleSwipe(dx, dy) {
        if (state === ST_ROCKET_DIR && pendingSpecial) {
            const rb = getBlock(pendingSpecial.col, pendingSpecial.row);
            if (rb) {
                const dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
                activateSpecial(rb, dir);
                clearingBlocks = 8;
                state = ST_SPECIAL_ACTIVATE;
                pendingSpecial = null;
            }
        }
    }

    function handleHover(px, py) {
        if (state !== ST_PLAYING) { highlightGroup = null; return; }
        const gamePx = px / SCALE;
        const gamePy = py / SCALE;
        const cell = pixelToGrid(gamePx, gamePy);
        if (!cell) { highlightGroup = null; return; }
        const block = getBlock(cell.col, cell.row);
        if (!block || !block.alive) { highlightGroup = null; return; }
        if (block.special !== SPECIAL_NONE) {
            highlightGroup = [block];
            return;
        }
        highlightGroup = findGroup(cell.col, cell.row);
        if (highlightGroup.length < 2) highlightGroup = null;
    }

    function handleLevelSelectTap(gamePx, gamePy) {
        const cols = 5;
        const cellSz = 58;
        const gap = 14;
        const totalW = cols * cellSz + (cols - 1) * gap;
        const startX = GAME_W / 2 - totalW / 2;
        const startY = 125;

        for (let i = 0; i < 20; i++) {
            const c = i % cols;
            const r = Math.floor(i / cols);
            const cx = startX + c * (cellSz + gap) + cellSz / 2;
            const cy = startY + r * (cellSz + gap) + cellSz / 2;
            if (dist(gamePx, gamePy, cx, cy) < cellSz / 2 && i < unlockedLevels) {
                sfxTap();
                startLevel(i);
                return;
            }
        }
    }

    // ══════════════════════════════════════════
    //  LEVEL MANAGEMENT
    // ══════════════════════════════════════════
    function startLevel(idx) {
        levelIdx = idx;
        const lv = LEVELS[levelIdx];
        movesLeft = lv.moves;
        score = 0;
        scoreDisplay = 0;
        scoreBounceSz = 1;
        levelProgress = 0;
        comboCount = 0;
        particles = [];
        scorePopups = [];
        comboTexts = [];
        confetti = [];
        shakeTimer = 0;
        shakeIntensity = 0;
        highlightGroup = null;
        pendingSpecial = null;
        initGrid();
        state = ST_PLAYING;
    }

    // ══════════════════════════════════════════
    //  EVENT HANDLERS
    // ══════════════════════════════════════════
    let mouseX = 0, mouseY = 0;

    function onMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        mouseX = (e.clientX - rect.left) * DPR;
        mouseY = (e.clientY - rect.top) * DPR;
        handleHover(mouseX, mouseY);
    }

    function onMouseDown(e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) * DPR;
        const py = (e.clientY - rect.top) * DPR;
        handleTap(px, py);
    }

    function onTouchStart(e) {
        e.preventDefault();
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        touchStart = {
            x: (t.clientX - rect.left) * DPR,
            y: (t.clientY - rect.top) * DPR,
        };
        handleHover(touchStart.x, touchStart.y);
    }

    function onTouchMove(e) {
        e.preventDefault();
    }

    function onTouchEnd(e) {
        e.preventDefault();
        if (!touchStart) return;
        const t = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const endX = (t.clientX - rect.left) * DPR;
        const endY = (t.clientY - rect.top) * DPR;
        const dx = endX - touchStart.x;
        const dy = endY - touchStart.y;
        const swipeDist = Math.sqrt(dx * dx + dy * dy);

        if (swipeDist > 30 * DPR && state === ST_ROCKET_DIR) {
            handleSwipe(dx, dy);
        } else {
            handleTap(touchStart.x, touchStart.y);
        }
        touchStart = null;
        highlightGroup = null;
    }

    // ══════════════════════════════════════════
    //  CANVAS FIT
    // ══════════════════════════════════════════
    function fitCanvas() {
        if (!canvas || !gameActive) return;
        const parent = canvas.parentElement;
        if (!parent) return;
        const pw = parent.clientWidth;
        const ph = parent.clientHeight;

        const aspect = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > aspect) {
            ch = ph;
            cw = ch * aspect;
        } else {
            cw = pw;
            ch = cw / aspect;
        }

        DPR = Math.min(window.devicePixelRatio || 1, 3);
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        canvas.width = Math.round(cw * DPR);
        canvas.height = Math.round(ch * DPR);
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
    }

    // ══════════════════════════════════════════
    //  GAME LOOP
    // ══════════════════════════════════════════
    function gameLoop(ts) {
        if (!gameActive) return;
        const dt = lastTime ? Math.min((ts - lastTime) / 16.667, 4) : 1;
        lastTime = ts;
        update(dt);
        draw();
        animFrame = requestAnimationFrame(gameLoop);
    }

    // ══════════════════════════════════════════
    //  INIT / DESTROY
    // ══════════════════════════════════════════
    function init(cvs, playerData, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOver;
        gameActive = true;
        playerColor = playerData?.color || '#3B82F6';
        playerTheme = playerData?.theme || 'retro';

        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(playerTheme) : null;
        if (_t) playerColor = _t.colors[0] || playerColor;

        state = ST_LOADING;
        frameCount = 0;
        lastTime = 0;
        loadProgress = 0;
        particles = [];
        scorePopups = [];
        comboTexts = [];
        confetti = [];
        shakeTimer = 0;
        shakeIntensity = 0;
        comboCount = 0;
        highlightGroup = null;
        pendingSpecial = null;
        touchStart = null;
        scoreDisplay = 0;
        scoreBounceSz = 1;

        try {
            const saved = JSON.parse(localStorage.getItem('toycrush_progress') || '{}');
            unlockedLevels = saved.unlocked || 1;
            starRatings = saved.stars || {};
        } catch {
            unlockedLevels = 1;
            starRatings = {};
        }

        W = canvas.width || 480;
        H = canvas.height || 640;
        SCALE = W / GAME_W;
        DPR = Math.min(window.devicePixelRatio || 1, 3);

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        window.addEventListener('resize', fitCanvas);

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        // Start game loop immediately (shows loading screen)
        animFrame = requestAnimationFrame(gameLoop);

        // Preload all Kenney + candy sprites with progress
        preloadSprites(
            (progress) => { loadProgress = progress; },
            () => { state = ST_LEVEL_SELECT; }
        );
    }

    function saveProgress() {
        try {
            localStorage.setItem('toycrush_progress', JSON.stringify({
                unlocked: unlockedLevels,
                stars: starRatings,
            }));
        } catch {}
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
        if (canvas) {
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        window.removeEventListener('resize', fitCanvas);
        saveProgress();
    }

    return { init, destroy };
})();
