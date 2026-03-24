/* YWA Snake — Enhanced arcade snake with obstacles, portals, prey, poison, speed boosts, rainbow mode */
window.Snake = (() => {

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
    // ── Design Constants ──
    const GAME_W = 480, GAME_H = 480;
    const GRID = 20; // 20x20 grid
    const CELL = GAME_W / GRID; // 24px cells
    const BASE_SPEED_MS = 140; // ms between moves
    const MIN_SPEED_MS = 55;
    const SPEED_DECREASE = 3; // ms faster per food eaten
    const GOLDEN_CHANCE = 0.12;
    const GOLDEN_DURATION = 5000; // ms before golden food vanishes
    const GOLDEN_POINTS = 5;
    const NORMAL_POINTS = 1;
    const WRAP_LEVEL = 5; // wrap-around unlocks at this level
    const FOOD_PER_LEVEL = 8;
    const DEATH_ANIM_MS = 2200; // longer for staggered scatter
    const TITLE_BLINK_MS = 600;
    const OBSTACLE_START_LEVEL = 3;
    const PORTAL_START_LEVEL = 4;
    const RAINBOW_LEVEL = 8;
    const POISON_CHANCE = 0.25; // chance of poison food alongside regular
    const SPEED_FOOD_CHANCE = 0.15;
    const SPEED_BOOST_DURATION = 3000; // ms
    const SPEED_BOOST_MULTIPLIER = 2;
    const SPEED_BOOST_SCORE_MULT = 3;
    const PREY_SPAWN_CHANCE = 0.08; // per food eaten
    const PREY_MOVE_INTERVAL = 400; // ms between prey moves
    const PREY_POINTS = 15;
    const PREY_DURATION = 8000; // ms before prey escapes

    // States
    const ST_TITLE = 0, ST_PLAY = 1, ST_DEAD = 2, ST_GAMEOVER = 3;

    // Game state
    let canvas, ctx, W, H, SCALE, DPR, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor, playerTheme;
    let state, frameCount, lastTime, lastMoveTime;
    let keys = {};
    let score, level, foodEaten, speedMs;
    let snake, dir, nextDir, alive;
    let food, goldenFood, goldenTimer;
    let particles, scorePopups;
    let deathTimer;
    let wrapMode;
    let bgPattern;
    let touchStartX, touchStartY;
    let titlePulse;

    // New feature state
    let obstacles; // array of {x, y}
    let portalPairs; // array of [{x,y}, {x,y}]
    let poisonFood; // {x, y} or null
    let speedFood; // {x, y} or null
    let speedBoostTimer; // ms remaining for speed boost
    let speedBoostActive;
    let prey; // {x, y, timer, moveTimer, alive} or null
    let rainbowMode;
    let smoothOffset; // {x, y} pixel offset for smooth interpolation
    let moveProgress; // 0..1 interpolation between grid cells
    let prevSnakePositions; // previous grid positions for interpolation
    let deathScatterSegments; // for staggered death animation

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
    function sfxEat() { playTone(660, 0.08, 'sine', 0.12); setTimeout(() => playTone(880, 0.1, 'sine', 0.12), 60); }
    function sfxGoldenEat() { playTone(880, 0.1, 'sine', 0.18); setTimeout(() => playTone(1100, 0.12, 'sine', 0.18), 80); setTimeout(() => playTone(1320, 0.15, 'sine', 0.18), 170); }
    function sfxDie() { playTone(300, 0.15, 'sawtooth', 0.12, 80); setTimeout(() => playTone(150, 0.3, 'sawtooth', 0.1, 40), 120); }
    function sfxTurn() { playTone(440, 0.03, 'triangle', 0.04); }
    function sfxLevelUp() { playTone(523, 0.1, 'sine', 0.15); setTimeout(() => playTone(659, 0.1, 'sine', 0.15), 100); setTimeout(() => playTone(784, 0.15, 'sine', 0.15), 200); }
    function sfxStart() { playTone(440, 0.08, 'sine', 0.1); setTimeout(() => playTone(660, 0.08, 'sine', 0.1), 100); setTimeout(() => playTone(880, 0.12, 'sine', 0.12), 200); }
    function sfxPoison() { playTone(180, 0.2, 'sawtooth', 0.12, 100); setTimeout(() => playTone(120, 0.15, 'sawtooth', 0.1), 100); }
    function sfxSpeedBoost() { playTone(600, 0.06, 'sine', 0.14); setTimeout(() => playTone(800, 0.06, 'sine', 0.14), 50); setTimeout(() => playTone(1000, 0.08, 'sine', 0.14), 100); setTimeout(() => playTone(1200, 0.1, 'sine', 0.14), 150); }
    function sfxPortal() { playTone(400, 0.15, 'sine', 0.1, 800); setTimeout(() => playTone(800, 0.15, 'sine', 0.1, 400), 100); }
    function sfxPreyCatch() { playTone(880, 0.08, 'sine', 0.15); setTimeout(() => playTone(1100, 0.08, 'sine', 0.15), 60); setTimeout(() => playTone(1320, 0.1, 'sine', 0.15), 120); setTimeout(() => playTone(1760, 0.15, 'sine', 0.15), 190); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const gx = v => v * SCALE;
    const gy = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const lerp = (a, b, t) => a + (b - a) * t;

    const HAS_TOUCH = ('ontouchstart' in window);
    function drawOnScreenControls(ctx, W, H, gs, buttons, dpadDirs) {
        if (!HAS_TOUCH) return;
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + gs(14) + 'px monospace';
        var padX = gs(60), padY = H - gs(70);
        var bs = gs(36), gap = gs(4);
        if (dpadDirs.indexOf('U') >= 0) {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.roundRect(padX - bs/2, padY - bs - gap, bs, bs, gs(6)); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillText('\u25B2', padX, padY - bs/2 - gap);
        }
        if (dpadDirs.indexOf('D') >= 0) {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.roundRect(padX - bs/2, padY + gap, bs, bs, gs(6)); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillText('\u25BC', padX, padY + bs/2 + gap);
        }
        if (dpadDirs.indexOf('L') >= 0) {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.roundRect(padX - bs - gap - bs/2, padY - bs/2, bs, bs, gs(6)); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillText('\u25C0', padX - bs - gap, padY);
        }
        if (dpadDirs.indexOf('R') >= 0) {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.roundRect(padX + gap + bs/2, padY - bs/2, bs, bs, gs(6)); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillText('\u25B6', padX + bs + gap, padY);
        }
        var bx = W - gs(60);
        for (var i = buttons.length - 1; i >= 0; i--) {
            var label = buttons[i];
            var bw = Math.max(gs(50), ctx.measureText(label).width + gs(16));
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.roundRect(bx - bw/2, H - gs(55), bw, gs(40), gs(8)); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillText(label, bx, H - gs(35));
            bx -= bw + gs(10);
        }
        ctx.restore();
    }

    // Color helpers
    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }
    function lighten(hex, amt) {
        const c = hexToRgb(hex);
        const r = Math.min(255, c.r + amt), g = Math.min(255, c.g + amt), b = Math.min(255, c.b + amt);
        return `rgb(${r},${g},${b})`;
    }
    function withAlpha(hex, a) {
        if (hex.startsWith('rgb(')) {
            return hex.replace('rgb(', 'rgba(').replace(')', `,${a})`);
        }
        if (hex.startsWith('rgba(')) {
            return hex.replace(/,[^,]*\)$/, `,${a})`);
        }
        const c = hexToRgb(hex);
        return `rgba(${c.r},${c.g},${c.b},${a})`;
    }
    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const a = s * Math.min(l, 1 - l);
        const f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); };
        const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
        return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
    }

    // Theme palette
    let COL_SNAKE, COL_SNAKE_LIGHT, COL_SNAKE_DARK, COL_FOOD, COL_GOLDEN, COL_BG, COL_GRID, COL_HUD, COL_EYES;
    let COL_POISON, COL_SPEED, COL_PORTAL_A, COL_PORTAL_B, COL_PREY, COL_OBSTACLE;
    function applyTheme() {
        const base = playerColor || '#06B6D4';
        COL_SNAKE = base;
        COL_SNAKE_LIGHT = lighten(base, 60);
        COL_SNAKE_DARK = lighten(base, -40);
        COL_FOOD = '#EF4444';
        COL_GOLDEN = '#FBBF24';
        COL_BG = '#0A0E1A';
        COL_GRID = 'rgba(255,255,255,0.04)';
        COL_HUD = '#E0E7FF';
        COL_EYES = '#FFFFFF';
        COL_POISON = '#8B5CF6';
        COL_SPEED = '#38BDF8';
        COL_PORTAL_A = '#F472B6';
        COL_PORTAL_B = '#34D399';
        COL_PREY = '#FB923C';
        COL_OBSTACLE = '#475569';
    }

    // ── Grid Utilities ──
    function gridToPixel(gx, gy) { return { x: gx * CELL, y: gy * CELL }; }

    function isOccupied(gx, gy) {
        for (let i = 0; i < snake.length; i++) {
            if (snake[i].x === gx && snake[i].y === gy) return true;
        }
        if (isObstacle(gx, gy)) return true;
        if (isPortal(gx, gy)) return true;
        return false;
    }

    function isObstacle(gx, gy) {
        if (!obstacles) return false;
        for (const o of obstacles) {
            if (o.x === gx && o.y === gy) return true;
        }
        return false;
    }

    function isPortal(gx, gy) {
        if (!portalPairs) return false;
        for (const pair of portalPairs) {
            if ((pair[0].x === gx && pair[0].y === gy) || (pair[1].x === gx && pair[1].y === gy)) return true;
        }
        return false;
    }

    function getPortalExit(gx, gy) {
        if (!portalPairs) return null;
        for (const pair of portalPairs) {
            if (pair[0].x === gx && pair[0].y === gy) return pair[1];
            if (pair[1].x === gx && pair[1].y === gy) return pair[0];
        }
        return null;
    }

    function randomFreeCell() {
        let x, y, attempts = 0;
        do {
            x = Math.floor(Math.random() * GRID);
            y = Math.floor(Math.random() * GRID);
            attempts++;
        } while (isOccupied(x, y) && attempts < 200);
        return { x, y };
    }

    function randomFreeCellAvoidCenter(margin) {
        let x, y, attempts = 0;
        const cx = Math.floor(GRID / 2), cy = Math.floor(GRID / 2);
        do {
            x = Math.floor(Math.random() * GRID);
            y = Math.floor(Math.random() * GRID);
            attempts++;
        } while ((isOccupied(x, y) || (Math.abs(x - cx) < margin && Math.abs(y - cy) < margin)) && attempts < 300);
        return { x, y };
    }

    // ── Particles ──
    function spawnParticles(px, py, color, count, spread) {
        for (let i = 0; i < count; i++) {
            const angle = rng(0, Math.PI * 2);
            const speed = rng(0.5, spread);
            particles.push({
                x: px, y: py,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: 1.0, decay: rng(0.015, 0.035),
                size: rng(2, 5), color
            });
        }
    }
    function spawnScorePopup(px, py, text, color) {
        scorePopups.push({ x: px, y: py, text, color: color || COL_HUD, life: 1.0, decay: 0.018 });
    }

    // ── Obstacle Generation ──
    function generateObstacles() {
        obstacles = [];
        if (level < OBSTACLE_START_LEVEL) return;

        const wallCount = Math.min(level - OBSTACLE_START_LEVEL + 1, 6);
        const cx = Math.floor(GRID / 2), cy = Math.floor(GRID / 2);

        // Generate inner wall segments
        const patterns = [
            // Horizontal bar
            (ox, oy, len) => { for (let i = 0; i < len; i++) obstacles.push({ x: ox + i, y: oy }); },
            // Vertical bar
            (ox, oy, len) => { for (let i = 0; i < len; i++) obstacles.push({ x: ox, y: oy + i }); },
            // L-shape
            (ox, oy, len) => {
                for (let i = 0; i < len; i++) obstacles.push({ x: ox + i, y: oy });
                for (let i = 1; i < len; i++) obstacles.push({ x: ox, y: oy + i });
            },
        ];

        for (let w = 0; w < wallCount; w++) {
            const pos = randomFreeCellAvoidCenter(4);
            const len = Math.floor(rng(2, 5));
            const patFn = pick(patterns);
            // Ensure walls stay in bounds
            const ox = Math.min(pos.x, GRID - len - 1);
            const oy = Math.min(pos.y, GRID - len - 1);
            patFn(Math.max(1, ox), Math.max(1, oy), len);
        }

        // Remove any obstacles that land on the snake start area
        obstacles = obstacles.filter(o => {
            if (o.x < 0 || o.x >= GRID || o.y < 0 || o.y >= GRID) return false;
            if (Math.abs(o.x - cx) <= 3 && Math.abs(o.y - cy) <= 1) return false;
            return true;
        });
    }

    // ── Portal Generation ──
    function generatePortals() {
        portalPairs = [];
        if (level < PORTAL_START_LEVEL) return;

        const pairCount = Math.min(Math.floor((level - PORTAL_START_LEVEL) / 2) + 1, 3);
        for (let i = 0; i < pairCount; i++) {
            const a = randomFreeCellAvoidCenter(3);
            const b = randomFreeCellAvoidCenter(3);
            // Ensure portals are not on each other
            if (a.x !== b.x || a.y !== b.y) {
                portalPairs.push([a, b]);
            }
        }
    }

    // ── Game Setup ──
    function resetGame() {
        score = 0;
        level = 1;
        foodEaten = 0;
        speedMs = BASE_SPEED_MS;
        wrapMode = false;
        alive = true;
        deathTimer = 0;
        dir = { x: 1, y: 0 };
        nextDir = { x: 1, y: 0 };
        particles = [];
        scorePopups = [];
        goldenFood = null;
        goldenTimer = 0;
        titlePulse = 0;
        obstacles = [];
        portalPairs = [];
        poisonFood = null;
        speedFood = null;
        speedBoostTimer = 0;
        speedBoostActive = false;
        prey = null;
        rainbowMode = false;
        moveProgress = 1;
        prevSnakePositions = null;
        deathScatterSegments = null;

        // Start snake in center, 3 segments
        const cx = Math.floor(GRID / 2), cy = Math.floor(GRID / 2);
        snake = [
            { x: cx, y: cy },
            { x: cx - 1, y: cy },
            { x: cx - 2, y: cy }
        ];

        generateObstacles();
        generatePortals();
        spawnFood();
    }

    function spawnFood() {
        const pos = randomFreeCell();
        food = { x: pos.x, y: pos.y, pulse: 0 };

        // Maybe spawn poison alongside
        if (Math.random() < POISON_CHANCE && level >= 2) {
            const pp = randomFreeCell();
            poisonFood = { x: pp.x, y: pp.y, pulse: 0 };
        } else {
            poisonFood = null;
        }

        // Maybe spawn speed food
        if (Math.random() < SPEED_FOOD_CHANCE && level >= 2) {
            const sp = randomFreeCell();
            speedFood = { x: sp.x, y: sp.y, pulse: 0 };
        } else {
            speedFood = null;
        }
    }

    function spawnGoldenFood() {
        if (goldenFood) return;
        const pos = randomFreeCell();
        goldenFood = { x: pos.x, y: pos.y, pulse: 0, born: performance.now() };
        goldenTimer = GOLDEN_DURATION;
    }

    function spawnPrey() {
        if (prey) return;
        const pos = randomFreeCell();
        prey = { x: pos.x, y: pos.y, timer: PREY_DURATION, moveTimer: 0, alive: true };
    }

    function movePrey(dt) {
        if (!prey || !prey.alive) return;
        prey.timer -= dt;
        prey.moveTimer -= dt;

        if (prey.timer <= 0) {
            // Prey escapes
            const fp = gridToPixel(prey.x, prey.y);
            spawnParticles(fp.x + CELL / 2, fp.y + CELL / 2, COL_PREY, 8, 3);
            spawnScorePopup(fp.x + CELL / 2, fp.y - 4, 'ESCAPED!', COL_PREY);
            prey = null;
            return;
        }

        if (prey.moveTimer <= 0) {
            prey.moveTimer = PREY_MOVE_INTERVAL;
            // Move away from snake head
            const head = snake[0];
            const dx = prey.x - head.x;
            const dy = prey.y - head.y;
            const choices = [];

            // Prefer moving away from snake
            if (dx >= 0 && prey.x + 1 < GRID && !isObstacle(prey.x + 1, prey.y)) choices.push({ x: prey.x + 1, y: prey.y });
            if (dx <= 0 && prey.x - 1 >= 0 && !isObstacle(prey.x - 1, prey.y)) choices.push({ x: prey.x - 1, y: prey.y });
            if (dy >= 0 && prey.y + 1 < GRID && !isObstacle(prey.x, prey.y + 1)) choices.push({ x: prey.x, y: prey.y + 1 });
            if (dy <= 0 && prey.y - 1 >= 0 && !isObstacle(prey.x, prey.y - 1)) choices.push({ x: prey.x, y: prey.y - 1 });

            // Add random direction for unpredictability
            const allDirs = [
                { x: prey.x + 1, y: prey.y }, { x: prey.x - 1, y: prey.y },
                { x: prey.x, y: prey.y + 1 }, { x: prey.x, y: prey.y - 1 }
            ].filter(d => d.x >= 0 && d.x < GRID && d.y >= 0 && d.y < GRID && !isObstacle(d.x, d.y));

            if (Math.random() < 0.3 && allDirs.length > 0) {
                const m = pick(allDirs);
                prey.x = m.x; prey.y = m.y;
            } else if (choices.length > 0) {
                const m = pick(choices);
                prey.x = m.x; prey.y = m.y;
            } else if (allDirs.length > 0) {
                const m = pick(allDirs);
                prey.x = m.x; prey.y = m.y;
            }
        }
    }

    // ── Movement / Logic ──
    function moveSnake() {
        // Save previous positions for smooth interpolation
        prevSnakePositions = snake.map(s => ({ x: s.x, y: s.y }));
        moveProgress = 0;

        dir = { ...nextDir };
        const head = snake[0];
        let nx = head.x + dir.x;
        let ny = head.y + dir.y;

        // Wall / wrap check
        if (wrapMode) {
            nx = ((nx % GRID) + GRID) % GRID;
            ny = ((ny % GRID) + GRID) % GRID;
        } else if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) {
            killSnake();
            return;
        }

        // Obstacle collision
        if (isObstacle(nx, ny)) {
            killSnake();
            return;
        }

        // Self-collision
        for (let i = 0; i < snake.length - 1; i++) {
            if (snake[i].x === nx && snake[i].y === ny) { killSnake(); return; }
        }

        const newHead = { x: nx, y: ny };
        snake.unshift(newHead);

        // Portal check
        const portalExit = getPortalExit(nx, ny);
        if (portalExit) {
            snake[0] = { x: portalExit.x + dir.x, y: portalExit.y + dir.y };
            // Wrap portal exit if needed
            if (wrapMode) {
                snake[0].x = ((snake[0].x % GRID) + GRID) % GRID;
                snake[0].y = ((snake[0].y % GRID) + GRID) % GRID;
            } else {
                snake[0].x = Math.max(0, Math.min(GRID - 1, snake[0].x));
                snake[0].y = Math.max(0, Math.min(GRID - 1, snake[0].y));
            }
            sfxPortal();
            const ep = gridToPixel(portalExit.x, portalExit.y);
            spawnParticles(ep.x + CELL / 2, ep.y + CELL / 2, COL_PORTAL_A, 10, 4);
        }

        let ate = false;
        const scoreMult = (speedBoostActive ? SPEED_BOOST_SCORE_MULT : 1) * (rainbowMode ? 2 : 1);
        const headX = snake[0].x, headY = snake[0].y;

        // Check food
        if (food && headX === food.x && headY === food.y) {
            ate = true;
            const pts = Math.round(NORMAL_POINTS * level * scoreMult);
            score += pts;
            foodEaten++;
            sfxEat();
            const fp = gridToPixel(food.x, food.y);
            spawnParticles(fp.x + CELL / 2, fp.y + CELL / 2, COL_FOOD, 8, 3);
            spawnScorePopup(fp.x + CELL / 2, fp.y - 4, `+${pts}`, COL_FOOD);

            if (Math.random() < GOLDEN_CHANCE && !goldenFood) spawnGoldenFood();
            if (Math.random() < PREY_SPAWN_CHANCE && !prey) spawnPrey();
            spawnFood();
            speedMs = Math.max(MIN_SPEED_MS, speedMs - SPEED_DECREASE);

            // Level up
            if (foodEaten >= FOOD_PER_LEVEL * level) {
                level++;
                sfxLevelUp();
                generateObstacles();
                generatePortals();
                if (level >= WRAP_LEVEL && !wrapMode) {
                    wrapMode = true;
                    spawnScorePopup(GAME_W / 2, GAME_H / 2 - 20, 'WRAP MODE!', COL_GOLDEN);
                }
                if (level >= RAINBOW_LEVEL && !rainbowMode) {
                    rainbowMode = true;
                    spawnScorePopup(GAME_W / 2, GAME_H / 2 - 40, 'RAINBOW MODE!', '#FF6B6B');
                }
                spawnScorePopup(GAME_W / 2, GAME_H / 2, `LEVEL ${level}`, COL_HUD);
            }
        }

        // Check golden food
        if (goldenFood && headX === goldenFood.x && headY === goldenFood.y) {
            ate = true;
            const pts = Math.round(GOLDEN_POINTS * level * scoreMult);
            score += pts;
            foodEaten++;
            sfxGoldenEat();
            const fp = gridToPixel(goldenFood.x, goldenFood.y);
            spawnParticles(fp.x + CELL / 2, fp.y + CELL / 2, COL_GOLDEN, 16, 4);
            spawnScorePopup(fp.x + CELL / 2, fp.y - 4, `+${pts}`, COL_GOLDEN);
            goldenFood = null;
            goldenTimer = 0;
            speedMs = Math.max(MIN_SPEED_MS, speedMs - SPEED_DECREASE * 2);
        }

        // Check poison food
        if (poisonFood && headX === poisonFood.x && headY === poisonFood.y) {
            sfxPoison();
            const fp = gridToPixel(poisonFood.x, poisonFood.y);
            spawnParticles(fp.x + CELL / 2, fp.y + CELL / 2, COL_POISON, 12, 4);
            // Shrink snake by 2
            const shrinkCount = Math.min(2, snake.length - 2); // keep min 2 segments
            for (let i = 0; i < shrinkCount; i++) {
                if (snake.length > 2) {
                    const removed = snake.pop();
                    const rp = gridToPixel(removed.x, removed.y);
                    spawnParticles(rp.x + CELL / 2, rp.y + CELL / 2, COL_POISON, 4, 2);
                }
            }
            const penalty = Math.round(level * 2 * scoreMult);
            score = Math.max(0, score - penalty);
            spawnScorePopup(fp.x + CELL / 2, fp.y - 4, `-${penalty}`, COL_POISON);
            poisonFood = null;
        }

        // Check speed food
        if (speedFood && headX === speedFood.x && headY === speedFood.y) {
            sfxSpeedBoost();
            const fp = gridToPixel(speedFood.x, speedFood.y);
            spawnParticles(fp.x + CELL / 2, fp.y + CELL / 2, COL_SPEED, 14, 5);
            spawnScorePopup(fp.x + CELL / 2, fp.y - 4, 'SPEED!', COL_SPEED);
            speedBoostTimer = SPEED_BOOST_DURATION;
            speedBoostActive = true;
            speedFood = null;
            ate = true; // grow
        }

        // Check prey
        if (prey && prey.alive && headX === prey.x && headY === prey.y) {
            ate = true;
            const pts = Math.round(PREY_POINTS * level * scoreMult);
            score += pts;
            sfxPreyCatch();
            const fp = gridToPixel(prey.x, prey.y);
            spawnParticles(fp.x + CELL / 2, fp.y + CELL / 2, COL_PREY, 20, 6);
            spawnScorePopup(fp.x + CELL / 2, fp.y - 4, `+${pts} PREY!`, COL_PREY);
            prey = null;
        }

        if (!ate) snake.pop();
    }

    function killSnake() {
        alive = false;
        state = ST_DEAD;
        deathTimer = DEATH_ANIM_MS;
        sfxDie();

        // Build staggered death scatter data
        deathScatterSegments = snake.map((seg, i) => ({
            x: seg.x * CELL + CELL / 2,
            y: seg.y * CELL + CELL / 2,
            delay: i * 60, // stagger each segment by 60ms
            scattered: false,
            vx: rng(-3, 3),
            vy: rng(-5, -1),
            rot: rng(-0.3, 0.3),
            alpha: 1,
            scale: 1,
            color: COL_SNAKE
        }));
    }

    // ── Input ──
    function onKeyDown(e) {
        keys[e.key] = true;
        const k = e.key;

        if (state === ST_TITLE || state === ST_GAMEOVER) {
            if (k === 'Enter' || k === ' ') {
                sfxStart();
                resetGame();
                state = ST_PLAY;
                lastMoveTime = performance.now();
                e.preventDefault();
            }
            return;
        }
        if (state !== ST_PLAY) return;

        if ((k === 'ArrowUp' || k === 'w' || k === 'W') && dir.y !== 1) { nextDir = { x: 0, y: -1 }; sfxTurn(); }
        else if ((k === 'ArrowDown' || k === 's' || k === 'S') && dir.y !== -1) { nextDir = { x: 0, y: 1 }; sfxTurn(); }
        else if ((k === 'ArrowLeft' || k === 'a' || k === 'A') && dir.x !== 1) { nextDir = { x: -1, y: 0 }; sfxTurn(); }
        else if ((k === 'ArrowRight' || k === 'd' || k === 'D') && dir.x !== -1) { nextDir = { x: 1, y: 0 }; sfxTurn(); }

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
    }
    function onKeyUp(e) { keys[e.key] = false; }

    // Touch / swipe
    function onTouchStart(e) {
        e.preventDefault();
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;

        if (state === ST_TITLE || state === ST_GAMEOVER) {
            sfxStart();
            resetGame();
            state = ST_PLAY;
            lastMoveTime = performance.now();
        }
    }
    function onTouchMove(e) { e.preventDefault(); }
    function onTouchEnd(e) {
        e.preventDefault();
        if (state !== ST_PLAY || !e.changedTouches.length) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        const absDx = Math.abs(dx), absDy = Math.abs(dy);
        if (Math.max(absDx, absDy) < 20) return;

        if (absDx > absDy) {
            if (dx > 0 && dir.x !== -1) { nextDir = { x: 1, y: 0 }; sfxTurn(); }
            else if (dx < 0 && dir.x !== 1) { nextDir = { x: -1, y: 0 }; sfxTurn(); }
        } else {
            if (dy > 0 && dir.y !== -1) { nextDir = { x: 0, y: 1 }; sfxTurn(); }
            else if (dy < 0 && dir.y !== 1) { nextDir = { x: 0, y: -1 }; sfxTurn(); }
        }
    }

    // ── Rainbow color cycling ──
    function getRainbowColor(offset) {
        const hue = (frameCount * 3 + offset * 20) % 360;
        return hslToHex(hue, 85, 55);
    }

    // ── Rendering ──
    function drawBackground() {
        const grad = ctx.createLinearGradient(0, 0, 0, gs(GAME_H));
        grad.addColorStop(0, '#0A0E1A');
        grad.addColorStop(0.5, '#0F1629');
        grad.addColorStop(1, '#0A0E1A');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Subtle checker
        ctx.globalAlpha = 0.025;
        for (let gxc = 0; gxc < GRID; gxc++) {
            for (let gyc = 0; gyc < GRID; gyc++) {
                if ((gxc + gyc) % 2 === 0) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(gs(gxc * CELL), gs(gyc * CELL), gs(CELL), gs(CELL));
                }
            }
        }
        ctx.globalAlpha = 1;

        // Grid lines
        ctx.strokeStyle = COL_GRID;
        ctx.lineWidth = 1;
        for (let i = 0; i <= GRID; i++) {
            ctx.beginPath();
            ctx.moveTo(gs(i * CELL), 0); ctx.lineTo(gs(i * CELL), H);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, gs(i * CELL)); ctx.lineTo(W, gs(i * CELL));
            ctx.stroke();
        }

        // Wrap mode border glow
        if (wrapMode) {
            ctx.shadowColor = COL_GOLDEN;
            ctx.shadowBlur = gs(8) + Math.sin(frameCount * 0.05) * gs(4);
            ctx.strokeStyle = withAlpha('#FBBF24', 0.3 + Math.sin(frameCount * 0.05) * 0.1);
            ctx.lineWidth = gs(2);
            ctx.strokeRect(gs(1), gs(1), gs(GAME_W - 2), gs(GAME_H - 2));
            ctx.shadowBlur = 0;
        }

        // Rainbow mode background tint
        if (rainbowMode) {
            const hue = (frameCount * 2) % 360;
            ctx.globalAlpha = 0.04;
            ctx.fillStyle = hslToHex(hue, 100, 50);
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
        }
    }

    function drawObstacles() {
        if (!obstacles || obstacles.length === 0) return;
        for (const o of obstacles) {
            const px = gs(o.x * CELL), py = gs(o.y * CELL);
            const sz = gs(CELL);
            const pad = gs(1);

            // Dark brick with subtle texture
            const brickGrad = ctx.createLinearGradient(px, py, px + sz, py + sz);
            brickGrad.addColorStop(0, '#64748B');
            brickGrad.addColorStop(0.5, COL_OBSTACLE);
            brickGrad.addColorStop(1, '#334155');
            ctx.beginPath();
            ctx.roundRect(px + pad, py + pad, sz - pad * 2, sz - pad * 2, gs(2));
            ctx.fillStyle = brickGrad;
            ctx.fill();

            // Inner highlight
            ctx.beginPath();
            ctx.roundRect(px + pad + gs(2), py + pad + gs(1), sz * 0.4, sz * 0.2, gs(1));
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fill();

            // Cross hatch pattern
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = gs(0.5);
            ctx.beginPath();
            ctx.moveTo(px + pad, py + pad);
            ctx.lineTo(px + sz - pad, py + sz - pad);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(px + sz - pad, py + pad);
            ctx.lineTo(px + pad, py + sz - pad);
            ctx.stroke();
        }
    }

    function drawPortals() {
        if (!portalPairs || portalPairs.length === 0) return;
        for (let pi = 0; pi < portalPairs.length; pi++) {
            const pair = portalPairs[pi];
            const colors = [COL_PORTAL_A, COL_PORTAL_B];
            for (let si = 0; si < 2; si++) {
                const p = pair[si];
                const col = colors[si];
                const px = gs(p.x * CELL + CELL / 2);
                const py = gs(p.y * CELL + CELL / 2);
                const r = gs(CELL * 0.4);

                // Swirling portal effect
                const swirl = frameCount * 0.08 + pi * 2;
                ctx.save();
                ctx.translate(px, py);

                // Outer glow
                const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2);
                glow.addColorStop(0, withAlpha(col, 0.5));
                glow.addColorStop(0.5, withAlpha(col, 0.15));
                glow.addColorStop(1, 'transparent');
                ctx.fillStyle = glow;
                ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);

                // Spinning ring
                for (let ring = 0; ring < 3; ring++) {
                    const ringR = r * (0.6 + ring * 0.2);
                    const startAngle = swirl + ring * 1.2;
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, startAngle, startAngle + Math.PI * 1.2);
                    ctx.strokeStyle = withAlpha(col, 0.6 - ring * 0.15);
                    ctx.lineWidth = gs(2 - ring * 0.5);
                    ctx.stroke();
                }

                // Center dot
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
                ctx.fillStyle = '#FFFFFF';
                ctx.fill();

                ctx.restore();

                // Sparkle particles
                if (frameCount % 8 === si) {
                    spawnParticles(p.x * CELL + CELL / 2, p.y * CELL + CELL / 2, col, 1, 1.5);
                }
            }

            // Draw connecting line between portals (faint)
            const a = pair[0], b = pair[1];
            ctx.save();
            ctx.globalAlpha = 0.06 + Math.sin(frameCount * 0.05) * 0.03;
            ctx.strokeStyle = COL_PORTAL_A;
            ctx.lineWidth = gs(1);
            ctx.setLineDash([gs(3), gs(6)]);
            ctx.beginPath();
            ctx.moveTo(gs(a.x * CELL + CELL / 2), gs(a.y * CELL + CELL / 2));
            ctx.lineTo(gs(b.x * CELL + CELL / 2), gs(b.y * CELL + CELL / 2));
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
    }

    function drawSnake() {
        if (!alive && deathTimer > 0) return; // use death scatter instead

        const segCount = snake.length;
        // Compute smooth interpolation factor
        const t_interp = Math.min(1, moveProgress);

        for (let i = segCount - 1; i >= 0; i--) {
            const seg = snake[i];
            let drawX, drawY;

            // Smooth interpolation between previous and current position
            if (prevSnakePositions && i < prevSnakePositions.length && t_interp < 1) {
                const prev = prevSnakePositions[i];
                // Handle wrap-around interpolation
                let pdx = seg.x - prev.x;
                let pdy = seg.y - prev.y;
                if (Math.abs(pdx) > GRID / 2) pdx = pdx > 0 ? pdx - GRID : pdx + GRID;
                if (Math.abs(pdy) > GRID / 2) pdy = pdy > 0 ? pdy - GRID : pdy + GRID;
                drawX = (prev.x + pdx * t_interp) * CELL;
                drawY = (prev.y + pdy * t_interp) * CELL;
            } else {
                drawX = seg.x * CELL;
                drawY = seg.y * CELL;
            }

            const px = gs(drawX), py = gs(drawY);
            const sz = gs(CELL);
            const t = i / Math.max(1, segCount - 1); // 0=head, 1=tail

            // Rainbow mode: cycle colors along body
            let segSnakeColor, segLightColor, segDarkColor;
            if (rainbowMode) {
                segSnakeColor = getRainbowColor(i);
                segLightColor = lighten(segSnakeColor, 60);
                segDarkColor = lighten(segSnakeColor, -40);
            } else {
                // Gradient shift along length: head color -> complementary tail color
                const headRgb = hexToRgb(COL_SNAKE);
                const tailHue = ((Math.atan2(headRgb.g - 128, headRgb.r - 128) * 180 / Math.PI) + 180 + 60) % 360;
                const tailColor = hslToHex(tailHue, 70, 45);
                const headHex = COL_SNAKE;
                const tailHex = tailColor;
                const hR = hexToRgb(headHex), tR = hexToRgb(tailHex);
                const mr = Math.round(lerp(hR.r, tR.r, t));
                const mg = Math.round(lerp(hR.g, tR.g, t));
                const mb = Math.round(lerp(hR.b, tR.b, t));
                segSnakeColor = `#${mr.toString(16).padStart(2,'0')}${mg.toString(16).padStart(2,'0')}${mb.toString(16).padStart(2,'0')}`;
                segLightColor = lighten(segSnakeColor, 60);
                segDarkColor = lighten(segSnakeColor, -40);
            }

            const alpha = lerp(1.0, 0.55, t);
            const bodyColor = withAlpha(segSnakeColor, alpha);
            const shineColor = withAlpha(segLightColor, alpha * 0.6);

            const r = gs(4);
            const pad = gs(1);
            ctx.beginPath();
            ctx.roundRect(px + pad, py + pad, sz - pad * 2, sz - pad * 2, r);

            const segGrad = ctx.createLinearGradient(px, py, px + sz, py + sz);
            segGrad.addColorStop(0, shineColor);
            segGrad.addColorStop(0.4, bodyColor);
            segGrad.addColorStop(1, withAlpha(segDarkColor, alpha));
            ctx.fillStyle = segGrad;
            ctx.fill();

            // Shine highlight
            ctx.beginPath();
            ctx.roundRect(px + pad + gs(2), py + pad + gs(1), sz * 0.4, sz * 0.25, gs(2));
            ctx.fillStyle = withAlpha('#FFFFFF', 0.15 * alpha);
            ctx.fill();

            // Speed boost trail effect
            if (speedBoostActive && i > 0 && i % 2 === 0) {
                ctx.globalAlpha = 0.2;
                ctx.beginPath();
                ctx.roundRect(px + pad + gs(2), py + pad + gs(2), sz - pad * 4, sz - pad * 4, r);
                ctx.fillStyle = COL_SPEED;
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            // Head details
            if (i === 0) {
                drawSnakeHead(px, py, sz);
            }
        }

        // Glow behind head
        if (snake.length > 0) {
            const head = snake[0];
            let hDrawX, hDrawY;
            if (prevSnakePositions && prevSnakePositions.length > 0 && t_interp < 1) {
                const prev = prevSnakePositions[0];
                let pdx = head.x - prev.x, pdy = head.y - prev.y;
                if (Math.abs(pdx) > GRID / 2) pdx = pdx > 0 ? pdx - GRID : pdx + GRID;
                if (Math.abs(pdy) > GRID / 2) pdy = pdy > 0 ? pdy - GRID : pdy + GRID;
                hDrawX = (prev.x + pdx * t_interp) * CELL + CELL / 2;
                hDrawY = (prev.y + pdy * t_interp) * CELL + CELL / 2;
            } else {
                hDrawX = head.x * CELL + CELL / 2;
                hDrawY = head.y * CELL + CELL / 2;
            }
            const hpx = gs(hDrawX);
            const hpy = gs(hDrawY);
            const glowCol = rainbowMode ? getRainbowColor(0) : COL_SNAKE;
            const glow = ctx.createRadialGradient(hpx, hpy, 0, hpx, hpy, gs(CELL));
            glow.addColorStop(0, withAlpha(glowCol, 0.25));
            glow.addColorStop(1, 'transparent');
            ctx.fillStyle = glow;
            ctx.fillRect(hpx - gs(CELL), hpy - gs(CELL), gs(CELL * 2), gs(CELL * 2));
        }
    }

    function drawSnakeHead(px, py, sz) {
        const pad = gs(2);
        const eyeSize = gs(3.5);
        const eyeInset = gs(5);
        const pupilSize = gs(1.8);

        let leftEye, rightEye;
        if (dir.x === 1) {
            leftEye = { x: px + sz - eyeInset, y: py + pad + gs(4) };
            rightEye = { x: px + sz - eyeInset, y: py + sz - pad - gs(4) };
        } else if (dir.x === -1) {
            leftEye = { x: px + eyeInset, y: py + pad + gs(4) };
            rightEye = { x: px + eyeInset, y: py + sz - pad - gs(4) };
        } else if (dir.y === -1) {
            leftEye = { x: px + pad + gs(4), y: py + eyeInset };
            rightEye = { x: px + sz - pad - gs(4), y: py + eyeInset };
        } else {
            leftEye = { x: px + pad + gs(4), y: py + sz - eyeInset };
            rightEye = { x: px + sz - pad - gs(4), y: py + sz - eyeInset };
        }

        for (const eye of [leftEye, rightEye]) {
            ctx.beginPath();
            ctx.arc(eye.x, eye.y, eyeSize, 0, Math.PI * 2);
            ctx.fillStyle = COL_EYES;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(eye.x + dir.x * gs(1), eye.y + dir.y * gs(1), pupilSize, 0, Math.PI * 2);
            ctx.fillStyle = '#1A1A2E';
            ctx.fill();
        }

        // Tongue
        if (Math.sin(frameCount * 0.2) > 0) {
            const tongueLen = gs(6);
            const forkLen = gs(3);
            const cx = px + sz / 2;
            const cy = py + sz / 2;
            const tx = cx + dir.x * (sz / 2 + tongueLen);
            const ty = cy + dir.y * (sz / 2 + tongueLen);

            ctx.strokeStyle = '#EF4444';
            ctx.lineWidth = gs(1.2);
            ctx.beginPath();
            ctx.moveTo(cx + dir.x * sz / 2, cy + dir.y * sz / 2);
            ctx.lineTo(tx, ty);
            ctx.stroke();

            const perpX = dir.y, perpY = -dir.x;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + dir.x * forkLen + perpX * gs(2), ty + dir.y * forkLen + perpY * gs(2));
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + dir.x * forkLen - perpX * gs(2), ty + dir.y * forkLen - perpY * gs(2));
            ctx.stroke();
        }
    }

    // ── Food Drawing with Particle Orbits ──
    function drawFoodOrb(fx, fy, baseColor, darkColor, baseSize, orbitCount, orbitColor) {
        const px = gs(fx * CELL + CELL / 2);
        const py = gs(fy * CELL + CELL / 2);
        const baseR = gs(CELL * baseSize);
        const pulse = Math.sin(frameCount * 0.08) * gs(2);
        const r = baseR + pulse;

        // Outer glow
        const glow = ctx.createRadialGradient(px, py, r * 0.3, px, py, r * 2.5);
        glow.addColorStop(0, withAlpha(baseColor, 0.3));
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(px - r * 3, py - r * 3, r * 6, r * 6);

        // Orbiting sparkles (particle orbit)
        for (let i = 0; i < orbitCount; i++) {
            const angle = frameCount * 0.06 + (i * Math.PI * 2 / orbitCount);
            const orbitR = r * 1.8 + Math.sin(frameCount * 0.1 + i) * gs(2);
            const ox = px + Math.cos(angle) * orbitR;
            const oy = py + Math.sin(angle) * orbitR;
            const sparkSize = gs(1.2 + Math.sin(frameCount * 0.15 + i * 2) * 0.5);
            ctx.beginPath();
            ctx.arc(ox, oy, sparkSize, 0, Math.PI * 2);
            ctx.fillStyle = withAlpha(orbitColor || baseColor, 0.6 + Math.sin(frameCount * 0.1 + i) * 0.3);
            ctx.fill();
        }

        // Main orb
        const orbGrad = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
        orbGrad.addColorStop(0, '#FFFFFF');
        orbGrad.addColorStop(0.3, baseColor);
        orbGrad.addColorStop(1, darkColor);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = orbGrad;
        ctx.fill();

        // Shine dot
        ctx.beginPath();
        ctx.arc(px - r * 0.3, py - r * 0.35, r * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fill();
    }

    function drawFood() {
        if (!food) return;
        drawFoodOrb(food.x, food.y, COL_FOOD, lighten(COL_FOOD, -60), 0.35, 4, '#FFAAAA');

        // Particle trail
        if (frameCount % 6 === 0) {
            spawnParticles(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, COL_FOOD, 1, 1);
        }
    }

    function drawPoisonFood() {
        if (!poisonFood) return;
        const px = gs(poisonFood.x * CELL + CELL / 2);
        const py = gs(poisonFood.y * CELL + CELL / 2);
        const r = gs(CELL * 0.35) + Math.sin(frameCount * 0.1) * gs(1);

        // Glow
        const glow = ctx.createRadialGradient(px, py, r * 0.2, px, py, r * 2.5);
        glow.addColorStop(0, withAlpha(COL_POISON, 0.4));
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(px - r * 3, py - r * 3, r * 6, r * 6);

        // Orbiting sparkles
        for (let i = 0; i < 3; i++) {
            const angle = frameCount * 0.07 + (i * Math.PI * 2 / 3);
            const ox = px + Math.cos(angle) * r * 1.8;
            const oy = py + Math.sin(angle) * r * 1.8;
            ctx.beginPath();
            ctx.arc(ox, oy, gs(1.2), 0, Math.PI * 2);
            ctx.fillStyle = withAlpha(COL_POISON, 0.5);
            ctx.fill();
        }

        // Skull icon (simplified)
        ctx.save();
        ctx.translate(px, py);

        // Skull circle
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        const skullGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
        skullGrad.addColorStop(0, '#D8B4FE');
        skullGrad.addColorStop(0.4, COL_POISON);
        skullGrad.addColorStop(1, '#4C1D95');
        ctx.fillStyle = skullGrad;
        ctx.fill();

        // Eye sockets
        const eyeR = r * 0.22;
        ctx.fillStyle = '#1A0533';
        ctx.beginPath(); ctx.arc(-r * 0.28, -r * 0.12, eyeR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.28, -r * 0.12, eyeR, 0, Math.PI * 2); ctx.fill();

        // Nose
        ctx.beginPath();
        ctx.moveTo(0, r * 0.1);
        ctx.lineTo(-r * 0.1, r * 0.25);
        ctx.lineTo(r * 0.1, r * 0.25);
        ctx.closePath();
        ctx.fillStyle = '#1A0533';
        ctx.fill();

        // Teeth
        ctx.strokeStyle = '#1A0533';
        ctx.lineWidth = gs(0.8);
        for (let t = -1; t <= 1; t++) {
            ctx.beginPath();
            ctx.moveTo(r * t * 0.25, r * 0.35);
            ctx.lineTo(r * t * 0.25, r * 0.55);
            ctx.stroke();
        }

        ctx.restore();

        if (frameCount % 5 === 0) {
            spawnParticles(poisonFood.x * CELL + CELL / 2, poisonFood.y * CELL + CELL / 2, COL_POISON, 1, 1);
        }
    }

    function drawSpeedFood() {
        if (!speedFood) return;
        const px = gs(speedFood.x * CELL + CELL / 2);
        const py = gs(speedFood.y * CELL + CELL / 2);
        const r = gs(CELL * 0.38) + Math.sin(frameCount * 0.12) * gs(1.5);

        // Electric glow
        const glow = ctx.createRadialGradient(px, py, r * 0.2, px, py, r * 3);
        glow.addColorStop(0, withAlpha(COL_SPEED, 0.5));
        glow.addColorStop(0.4, withAlpha(COL_SPEED, 0.15));
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(px - r * 3, py - r * 3, r * 6, r * 6);

        // Orbiting electric sparks
        for (let i = 0; i < 5; i++) {
            const angle = frameCount * 0.09 + (i * Math.PI * 2 / 5);
            const dist = r * 1.6 + Math.sin(frameCount * 0.15 + i * 3) * gs(3);
            const ox = px + Math.cos(angle) * dist;
            const oy = py + Math.sin(angle) * dist;
            ctx.beginPath();
            ctx.arc(ox, oy, gs(1 + Math.random()), 0, Math.PI * 2);
            ctx.fillStyle = withAlpha('#FFFFFF', 0.5 + Math.random() * 0.4);
            ctx.fill();
        }

        // Lightning bolt shape
        ctx.save();
        ctx.translate(px, py);
        const s = r * 0.9;
        ctx.beginPath();
        ctx.moveTo(-s * 0.15, -s * 0.8);
        ctx.lineTo(s * 0.35, -s * 0.8);
        ctx.lineTo(s * 0.05, -s * 0.1);
        ctx.lineTo(s * 0.4, -s * 0.1);
        ctx.lineTo(-s * 0.2, s * 0.9);
        ctx.lineTo(s * 0.05, s * 0.05);
        ctx.lineTo(-s * 0.3, s * 0.05);
        ctx.closePath();

        const boltGrad = ctx.createLinearGradient(0, -s, 0, s);
        boltGrad.addColorStop(0, '#FFFFFF');
        boltGrad.addColorStop(0.3, '#7DD3FC');
        boltGrad.addColorStop(0.7, COL_SPEED);
        boltGrad.addColorStop(1, '#0284C7');
        ctx.fillStyle = boltGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = gs(0.5);
        ctx.stroke();

        ctx.restore();

        if (frameCount % 3 === 0) {
            spawnParticles(speedFood.x * CELL + CELL / 2, speedFood.y * CELL + CELL / 2, COL_SPEED, 1, 2);
        }
    }

    function drawPrey() {
        if (!prey || !prey.alive) return;
        const px = gs(prey.x * CELL + CELL / 2);
        const py = gs(prey.y * CELL + CELL / 2);
        const r = gs(CELL * 0.35);
        const bounce = Math.abs(Math.sin(frameCount * 0.15)) * gs(3);

        // Timer bar
        const remaining = prey.timer / PREY_DURATION;
        const barW = gs(CELL * 0.8);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(px - barW / 2, py + r + gs(4), barW, gs(3));
        ctx.fillStyle = remaining > 0.3 ? COL_PREY : '#EF4444';
        ctx.fillRect(px - barW / 2, py + r + gs(4), barW * remaining, gs(3));

        ctx.save();
        ctx.translate(px, py - bounce);

        // Glow
        const glow = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2);
        glow.addColorStop(0, withAlpha(COL_PREY, 0.3));
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);

        // Body (mouse shape - oval)
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.9, r * 0.65, 0, 0, Math.PI * 2);
        const bodyGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
        bodyGrad.addColorStop(0, '#FDE68A');
        bodyGrad.addColorStop(0.4, COL_PREY);
        bodyGrad.addColorStop(1, '#C2410C');
        ctx.fillStyle = bodyGrad;
        ctx.fill();

        // Ears
        ctx.beginPath();
        ctx.arc(-r * 0.5, -r * 0.5, r * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = '#FDBA74';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(r * 0.5, -r * 0.5, r * 0.25, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.1, r * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.25, -r * 0.1, r * 0.12, 0, Math.PI * 2); ctx.fill();
        // Eye glint
        ctx.fillStyle = '#FFF';
        ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.15, r * 0.05, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.28, -r * 0.15, r * 0.05, 0, Math.PI * 2); ctx.fill();

        // Nose
        ctx.fillStyle = '#9A3412';
        ctx.beginPath(); ctx.arc(0, r * 0.15, r * 0.1, 0, Math.PI * 2); ctx.fill();

        // Tail
        ctx.strokeStyle = COL_PREY;
        ctx.lineWidth = gs(1.2);
        ctx.beginPath();
        ctx.moveTo(0, r * 0.5);
        ctx.quadraticCurveTo(r * 0.5, r * 1.2, -r * 0.3, r * 1.0);
        ctx.stroke();

        ctx.restore();

        // Fleeing indicator when close to snake
        if (snake.length > 0) {
            const head = snake[0];
            const dist = Math.abs(head.x - prey.x) + Math.abs(head.y - prey.y);
            if (dist <= 4) {
                // Exclamation mark
                ctx.font = `bold ${gs(10)}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillStyle = withAlpha('#EF4444', 0.5 + Math.sin(frameCount * 0.3) * 0.5);
                ctx.fillText('!', px, py - r - gs(8) - bounce);
            }
        }

        if (frameCount % 4 === 0) {
            spawnParticles(prey.x * CELL + CELL / 2, prey.y * CELL + CELL / 2, COL_PREY, 1, 1);
        }
    }

    function drawGoldenFood() {
        if (!goldenFood) return;
        const px = gs(goldenFood.x * CELL + CELL / 2);
        const py = gs(goldenFood.y * CELL + CELL / 2);
        const baseR = gs(CELL * 0.4);
        const pulse = Math.sin(frameCount * 0.15) * gs(3);
        const r = baseR + pulse;

        const remaining = goldenTimer / GOLDEN_DURATION;
        const flicker = remaining < 0.3 ? (Math.sin(frameCount * 0.4) > 0 ? 1 : 0.3) : 1;

        ctx.globalAlpha = flicker;

        const glow = ctx.createRadialGradient(px, py, r * 0.2, px, py, r * 3.5);
        glow.addColorStop(0, withAlpha(COL_GOLDEN, 0.4));
        glow.addColorStop(0.5, withAlpha(COL_GOLDEN, 0.1));
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(px - r * 4, py - r * 4, r * 8, r * 8);

        drawStar(px, py, r, COL_GOLDEN);

        // Orbiting sparkles with particle orbit
        for (let i = 0; i < 5; i++) {
            const angle = frameCount * 0.04 + (i * Math.PI * 2 / 5);
            const dist = r * 1.8 + Math.sin(frameCount * 0.08 + i * 2) * gs(2);
            const ox = px + Math.cos(angle) * dist;
            const oy = py + Math.sin(angle) * dist;
            const sparkSize = gs(1.5 + Math.sin(frameCount * 0.12 + i) * 0.5);
            ctx.beginPath();
            ctx.arc(ox, oy, sparkSize, 0, Math.PI * 2);
            ctx.fillStyle = withAlpha('#FFFFFF', 0.6);
            ctx.fill();
        }

        ctx.globalAlpha = 1;

        if (frameCount % 4 === 0) {
            spawnParticles(goldenFood.x * CELL + CELL / 2, goldenFood.y * CELL + CELL / 2, COL_GOLDEN, 1, 2);
        }
    }

    function drawStar(cx, cy, r, color) {
        const spikes = 4;
        const outerR = r;
        const innerR = r * 0.45;
        const grad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, innerR * 0.2, cx, cy, outerR);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.35, color);
        grad.addColorStop(1, lighten(color, -50));

        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const angle = (i * Math.PI / spikes) - Math.PI / 2 + frameCount * 0.02;
            const rad = i % 2 === 0 ? outerR : innerR;
            const x = cx + Math.cos(angle) * rad;
            const y = cy + Math.sin(angle) * rad;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
    }

    function drawDeathScatter() {
        if (!deathScatterSegments) return;
        const elapsed = DEATH_ANIM_MS - deathTimer;

        for (let i = 0; i < deathScatterSegments.length; i++) {
            const seg = deathScatterSegments[i];
            const segElapsed = elapsed - seg.delay;
            if (segElapsed < 0) {
                // Still waiting to scatter - draw in place
                const px = gs(seg.x - CELL / 2);
                const py = gs(seg.y - CELL / 2);
                const sz = gs(CELL);
                const r = gs(4);
                const pad = gs(1);
                ctx.beginPath();
                ctx.roundRect(px + pad, py + pad, sz - pad * 2, sz - pad * 2, r);
                ctx.fillStyle = withAlpha(rainbowMode ? getRainbowColor(i) : COL_SNAKE, 1);
                ctx.fill();
                continue;
            }

            // Scatter physics
            const t = Math.min(segElapsed / 800, 1); // normalize over 800ms
            const easeOut = 1 - Math.pow(1 - t, 3);
            const scatterX = seg.x + seg.vx * easeOut * 40;
            const scatterY = seg.y + seg.vy * easeOut * 40 + 0.5 * 200 * t * t; // gravity
            const alpha = Math.max(0, 1 - t);
            const scale = 1 - t * 0.6;
            const rotation = seg.rot * t * 8;

            if (alpha <= 0) continue;

            ctx.save();
            ctx.translate(gs(scatterX), gs(scatterY));
            ctx.rotate(rotation);
            ctx.globalAlpha = alpha;

            const sz = gs(CELL) * scale;
            const pad = gs(1);
            ctx.beginPath();
            ctx.roundRect(-sz / 2 + pad, -sz / 2 + pad, sz - pad * 2, sz - pad * 2, gs(3));
            const segColor = rainbowMode ? getRainbowColor(i) : COL_SNAKE;
            ctx.fillStyle = segColor;
            ctx.fill();

            // Scatter particles on first frame of scatter
            if (!seg.scattered) {
                seg.scattered = true;
                spawnParticles(seg.x, seg.y, segColor, 3, 3);
                spawnParticles(seg.x, seg.y, COL_SNAKE_LIGHT, 2, 2);
            }

            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(gs(p.x), gs(p.y), gs(p.size) * p.life, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawScorePopups() {
        for (const sp of scorePopups) {
            ctx.globalAlpha = sp.life;
            ctx.font = `bold ${gs(12)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillStyle = sp.color;
            ctx.fillText(sp.text, gs(sp.x), gs(sp.y - (1 - sp.life) * 30));
        }
        ctx.globalAlpha = 1;
    }

    function drawHUD() {
        ctx.font = `bold ${gs(14)}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillStyle = COL_HUD;
        ctx.fillText(`SCORE: ${score}`, gs(8), gs(18));

        ctx.textAlign = 'right';
        ctx.fillText(`LV ${level}`, gs(GAME_W - 8), gs(18));

        ctx.textAlign = 'center';
        ctx.fillText(`${snake.length}`, gs(GAME_W / 2), gs(18));

        // Status indicators
        let statusY = 30;
        if (wrapMode) {
            ctx.font = `${gs(9)}px monospace`;
            ctx.fillStyle = withAlpha(COL_GOLDEN, 0.6 + Math.sin(frameCount * 0.06) * 0.3);
            ctx.fillText('WRAP', gs(GAME_W / 2), gs(statusY));
            statusY += 10;
        }
        if (speedBoostActive) {
            ctx.font = `bold ${gs(9)}px monospace`;
            ctx.fillStyle = withAlpha(COL_SPEED, 0.7 + Math.sin(frameCount * 0.15) * 0.3);
            ctx.fillText(`SPEED x${SPEED_BOOST_SCORE_MULT}`, gs(GAME_W / 2), gs(statusY));
            statusY += 10;
        }
        if (rainbowMode) {
            ctx.font = `bold ${gs(9)}px monospace`;
            ctx.fillStyle = getRainbowColor(0);
            ctx.fillText('RAINBOW x2', gs(GAME_W / 2), gs(statusY));
        }

        // Speed indicator
        const speedPct = 1 - (speedMs - MIN_SPEED_MS) / (BASE_SPEED_MS - MIN_SPEED_MS);
        const barW = gs(60);
        const barH = gs(4);
        const barX = gs(8);
        const barY = gs(24);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(barX, barY, barW, barH);
        const speedGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        speedGrad.addColorStop(0, '#22C55E');
        speedGrad.addColorStop(0.5, '#FBBF24');
        speedGrad.addColorStop(1, '#EF4444');
        ctx.fillStyle = speedGrad;
        ctx.fillRect(barX, barY, barW * speedPct, barH);
    }

    function drawVignette() {
        const grad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    // ── Title Screen ──
    function drawTitle() {
        drawBackground();
        titlePulse = (titlePulse || 0) + 1;

        // Animated snake logo
        const logoLen = 12;
        for (let i = 0; i < logoLen; i++) {
            const t = i / logoLen;
            const x = GAME_W / 2 + Math.sin(titlePulse * 0.03 + i * 0.5) * 80;
            const y = GAME_H * 0.3 + Math.cos(titlePulse * 0.02 + i * 0.4) * 20 + i * 8;
            const alpha = lerp(1, 0.3, t);
            const sz = gs(CELL - 2);
            const hue = (titlePulse * 2 + i * 30) % 360;
            const rainbowCol = hslToHex(hue, 80, 55);
            const grad = ctx.createLinearGradient(gs(x), gs(y), gs(x) + sz, gs(y) + sz);
            grad.addColorStop(0, withAlpha(lighten(rainbowCol, 40), alpha));
            grad.addColorStop(1, withAlpha(lighten(rainbowCol, -30), alpha));
            ctx.beginPath();
            ctx.roundRect(gs(x) - sz / 2, gs(y) - sz / 2, sz, sz, gs(4));
            ctx.fillStyle = grad;
            ctx.fill();
        }

        // Title text
        ctx.textAlign = 'center';
        ctx.font = `bold ${gs(42)}px monospace`;
        const titleGrad = ctx.createLinearGradient(gs(GAME_W / 2 - 80), 0, gs(GAME_W / 2 + 80), 0);
        titleGrad.addColorStop(0, COL_SNAKE_LIGHT);
        titleGrad.addColorStop(0.5, COL_SNAKE);
        titleGrad.addColorStop(1, COL_SNAKE_LIGHT);
        ctx.fillStyle = titleGrad;
        ctx.fillText('SNAKE', gs(GAME_W / 2), gs(GAME_H * 0.55));

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillText('SNAKE', gs(GAME_W / 2) + gs(2), gs(GAME_H * 0.55) + gs(2));

        ctx.font = `${gs(12)}px monospace`;
        ctx.fillStyle = withAlpha(COL_HUD, 0.6);
        ctx.fillText('Classic Arcade', gs(GAME_W / 2), gs(GAME_H * 0.62));

        if (Math.floor(titlePulse / 30) % 2 === 0) {
            ctx.font = `${gs(14)}px monospace`;
            ctx.fillStyle = COL_HUD;
            ctx.fillText('PRESS ENTER OR TAP TO START', gs(GAME_W / 2), gs(GAME_H * 0.78));
        }

        ctx.font = `${gs(9)}px monospace`;
        ctx.fillStyle = withAlpha(COL_HUD, 0.4);
        ctx.fillText('ARROWS / WASD / SWIPE', gs(GAME_W / 2), gs(GAME_H * 0.86));
        ctx.fillText('Walls at LV3 | Portals at LV4 | Wrap at LV5 | Rainbow at LV8', gs(GAME_W / 2), gs(GAME_H * 0.91));

        drawVignette();
    }

    // ── Game Over Screen ──
    function drawGameOver() {
        drawBackground();
        drawParticles();
        drawScorePopups();

        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.font = `bold ${gs(36)}px monospace`;
        ctx.fillStyle = '#EF4444';
        ctx.fillText('GAME OVER', gs(GAME_W / 2), gs(GAME_H * 0.38));

        ctx.font = `bold ${gs(20)}px monospace`;
        ctx.fillStyle = COL_HUD;
        ctx.fillText(`SCORE: ${score}`, gs(GAME_W / 2), gs(GAME_H * 0.50));

        ctx.font = `${gs(14)}px monospace`;
        ctx.fillStyle = withAlpha(COL_HUD, 0.7);
        ctx.fillText(`Level ${level}  |  Length ${snake.length}`, gs(GAME_W / 2), gs(GAME_H * 0.58));

        if (Math.floor(frameCount / 30) % 2 === 0) {
            ctx.font = `${gs(13)}px monospace`;
            ctx.fillStyle = COL_HUD;
            ctx.fillText('PRESS ENTER OR TAP TO RETRY', gs(GAME_W / 2), gs(GAME_H * 0.73));
        }

        drawVignette();
    }

    // ── Update ──
    function update(now, dt) {
        frameCount++;

        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Update score popups
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const sp = scorePopups[i];
            sp.life -= sp.decay;
            if (sp.life <= 0) scorePopups.splice(i, 1);
        }

        if (state === ST_PLAY && alive) {
            // Golden food timer
            if (goldenFood) {
                goldenTimer -= dt;
                if (goldenTimer <= 0) {
                    const fp = gridToPixel(goldenFood.x, goldenFood.y);
                    spawnParticles(fp.x + CELL / 2, fp.y + CELL / 2, COL_GOLDEN, 6, 2);
                    goldenFood = null;
                }
            }

            // Speed boost timer
            if (speedBoostActive) {
                speedBoostTimer -= dt;
                if (speedBoostTimer <= 0) {
                    speedBoostActive = false;
                    speedBoostTimer = 0;
                    spawnScorePopup(GAME_W / 2, GAME_H / 2, 'SPEED OFF', withAlpha(COL_SPEED, 0.7));
                }
            }

            // Move prey
            if (prey) movePrey(dt);

            // Smooth interpolation progress
            const effectiveSpeed = speedBoostActive ? speedMs / SPEED_BOOST_MULTIPLIER : speedMs;
            if (moveProgress < 1) {
                moveProgress += dt / effectiveSpeed;
                if (moveProgress > 1) moveProgress = 1;
            }

            // Move on interval
            if (now - lastMoveTime >= effectiveSpeed) {
                moveSnake();
                lastMoveTime = now;
            }

            // Food pulse
            if (food) food.pulse = (food.pulse + 0.08) % (Math.PI * 2);
        }

        if (state === ST_DEAD) {
            deathTimer -= dt;
            if (deathTimer <= 0) {
                state = ST_GAMEOVER;
                deathScatterSegments = null;
                if (gameOverCB) gameOverCB({ score, level, length: snake.length });
            }
        }
    }

    // ── Render ──
    function render() {
        ctx.clearRect(0, 0, W, H);

        if (state === ST_TITLE) {
            drawTitle();
            return;
        }

        if (state === ST_GAMEOVER) {
            drawGameOver();
            return;
        }

        drawBackground();
        drawObstacles();
        drawPortals();

        if (state === ST_PLAY) {
            drawFood();
            drawPoisonFood();
            drawSpeedFood();
            drawGoldenFood();
            drawPrey();
            drawSnake();
        }

        if (state === ST_DEAD) {
            drawObstacles();
            drawPortals();
            drawDeathScatter();
            drawFood();
        }

        drawParticles();
        drawScorePopups();
        drawHUD();
        if (state === ST_PLAY) drawOnScreenControls(ctx, W, H, gs, [], 'LRUD');

        drawVignette();
    }

    // ── Game Loop ──
    function gameLoop(timestamp) {
        if (!gameActive) return;
        const dt = lastTime ? timestamp - lastTime : 16;
        lastTime = timestamp;
        update(timestamp, dt);
        render();
        animFrame = requestAnimationFrame(gameLoop);
    }

    // ── Canvas Fit ──
    function fitCanvas() {
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        const pw = parent.clientWidth, ph = parent.clientHeight;
        const aspect = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > aspect) { ch = ph; cw = ch * aspect; }
        else { cw = pw; ch = cw / aspect; }
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        canvas.width = Math.round(cw * DPR);
        canvas.height = Math.round(ch * DPR);
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
    }

    // ── Init / Destroy ──
    function init(cvs, playerData, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOver;
        gameActive = true;
        playerColor = playerData?.color || '#06B6D4';
        playerTheme = playerData?.theme || 'retro';

        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(playerTheme) : null;
        if (_t) playerColor = _t.colors[0] || playerColor;

        applyTheme();

        state = ST_TITLE;
        frameCount = 0;
        lastTime = 0;
        lastMoveTime = 0;
        keys = {};
        particles = [];
        scorePopups = [];
        titlePulse = 0;
        obstacles = [];
        portalPairs = [];
        poisonFood = null;
        speedFood = null;
        speedBoostTimer = 0;
        speedBoostActive = false;
        prey = null;
        rainbowMode = false;
        moveProgress = 1;
        prevSnakePositions = null;
        deathScatterSegments = null;

        W = canvas.width || 480;
        H = canvas.height || 480;
        SCALE = W / GAME_W;
        DPR = Math.min(window.devicePixelRatio || 1, 3);

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        window.addEventListener('resize', fitCanvas);

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        animFrame = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        if (canvas) {
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        window.removeEventListener('resize', fitCanvas);
    }

    return { init, destroy };
})();
