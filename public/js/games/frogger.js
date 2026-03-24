/* YWA Frogger — Classic lane-crossing arcade with advanced hazards & graphics */
window.Frogger = (() => {

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
    const GAME_W = 480, GAME_H = 560;
    const TILE = 40; // each lane/row height
    const COLS = 12; // tiles across
    const FROG_W = 32, FROG_H = 32;
    const HOME_SLOTS = 5;
    const INITIAL_LIVES = 3;
    const TIMER_MAX = 30; // seconds per attempt
    const DEATH_ANIM_MS = 1200;
    const LEVEL_SPLASH_MS = 1800;

    // Row layout (0 = top, 13 = bottom)
    // 0: home row, 1-5: river, 6: median, 7-11: road, 12: median, 13: start
    const HOME_Y = 0;
    const RIVER_START = 1, RIVER_END = 5;
    const MEDIAN_TOP = 6;
    const ROAD_START = 7, ROAD_END = 11;
    const MEDIAN_BOT = 12;
    const START_ROW = 13;
    const TOTAL_ROWS = 14;

    // States
    const ST_TITLE = 0, ST_PLAY = 1, ST_DYING = 2, ST_LEVEL_SPLASH = 3, ST_GAMEOVER = 4, ST_WIN = 5;

    // ── Game State ──
    let canvas, ctx, W, H, SCALE, DPR, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor;
    let state, frameCount, lastTime, keys = {};
    let score, lives, level, timer, bestScore;
    let frog, particles, scorePopups, stars;
    let lanes, homeSlots, homeFilled;
    let deathTimer, levelSplashTimer, startTime;
    let screenShake, bgGradient;
    let touchStartX, touchStartY;
    let bonusFly, bonusFlyTimer;
    let waterOffset;
    let titlePreview; // simulated frog for title screen

    // ── New hazard / feature state ──
    let crocodiles;      // crocs in river lanes
    let snakes;          // snakes on median
    let otters;          // otters in river lanes
    let ladyFrogs;       // lady frogs on home slots
    let windGust;        // { active, dir, strength, timer }
    let nightMode;       // boolean: is this a night level?
    let tongueAnim;      // frog tongue-flick timer
    let tireMarks;       // array of road death skid marks
    let splashEffects;   // array of water splash ring effects

    // Theme colors
    let COL_FROG = '#22C55E';
    let COL_FROG_DARK = '#15803D';
    let COL_FROG_EYE = '#FFFFFF';
    let COL_ROAD = '#374151';
    let COL_ROAD_LINE = '#FDE047';
    let COL_WATER = '#1E40AF';
    let COL_WATER_LIGHT = '#3B82F6';
    let COL_GRASS = '#166534';
    let COL_GRASS_LIGHT = '#22C55E';
    let COL_LOG = '#92400E';
    let COL_LOG_LIGHT = '#B45309';
    let COL_TURTLE = '#065F46';
    let COL_TURTLE_SHELL = '#059669';
    let COL_HUD = '#E0E7FF';
    let COL_BG = '#0A0A1A';
    let COL_HOME = '#1E3A2F';
    let COL_LILYPAD = '#15803D';

    // ── Audio ──
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
            g.gain.setValueAtTime(vol || 0.08, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + dur);
        } catch {}
    }
    function sfxHop() { playTone(500, 0.06, 'triangle', 0.1); }
    function sfxHome() { playTone(880, 0.15, 'sine', 0.12); setTimeout(() => playTone(1100, 0.2, 'sine', 0.12), 120); }
    function sfxDeath() { playTone(200, 0.3, 'sawtooth', 0.12, 60); }
    function sfxSplash() { playTone(150, 0.2, 'triangle', 0.1, 80); }
    function sfxBonus() { playTone(1200, 0.1, 'sine', 0.15); setTimeout(() => playTone(1500, 0.15, 'sine', 0.15), 80); }
    function sfxLevelUp() {
        [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'sine', 0.12), i * 100));
    }
    function sfxGameOver() { [300, 250, 200, 150].forEach((f, i) => setTimeout(() => playTone(f, 0.25, 'sawtooth', 0.1), i * 180)); }
    function sfxCroc() { playTone(80, 0.25, 'sawtooth', 0.1, 40); }
    function sfxSnake() { playTone(900, 0.15, 'sine', 0.06, 400); }
    function sfxWind() { playTone(300, 0.4, 'triangle', 0.04, 200); }
    function sfxLadyFrog() { playTone(1000, 0.1, 'sine', 0.12); setTimeout(() => playTone(1300, 0.1, 'sine', 0.12), 60); setTimeout(() => playTone(1600, 0.15, 'sine', 0.12), 120); }
    function sfxTireScreech() { playTone(1800, 0.18, 'sawtooth', 0.06, 600); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const gx = v => v * SCALE;
    const gy = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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


    // ── Determine if night level ──
    function isNightLevel(lvl) {
        return lvl >= 3 && (lvl % 2 === 1); // odd levels >= 3
    }

    // ── Lane Definitions ──
    function buildLanes() {
        lanes = [];
        const spd = 0.6 + level * 0.12;
        // Road lanes (rows 7-11) — cars and trucks
        const roadDefs = [
            { row: 7,  dir: -1, speed: spd * 1.0, type: 'car',   count: 3, w: 40 },
            { row: 8,  dir:  1, speed: spd * 1.6, type: 'truck', count: 2, w: 72 },
            { row: 9,  dir: -1, speed: spd * 1.2, type: 'car',   count: 4, w: 36 },
            { row: 10, dir:  1, speed: spd * 0.8, type: 'truck', count: 2, w: 64 },
            { row: 11, dir: -1, speed: spd * 1.4, type: 'car',   count: 3, w: 44 },
        ];
        // River lanes (rows 1-5) — logs and turtles
        const riverDefs = [
            { row: 1, dir:  1, speed: spd * 0.7, type: 'log',    count: 3, w: 100 },
            { row: 2, dir: -1, speed: spd * 0.9, type: 'turtle', count: 3, w: 90, turtleCount: 3 },
            { row: 3, dir:  1, speed: spd * 0.5, type: 'log',    count: 2, w: 140 },
            { row: 4, dir: -1, speed: spd * 1.1, type: 'turtle', count: 4, w: 70, turtleCount: 2 },
            { row: 5, dir:  1, speed: spd * 0.8, type: 'log',    count: 3, w: 80 },
        ];

        const defs = [...roadDefs, ...riverDefs];
        for (const d of defs) {
            const objs = [];
            const spacing = GAME_W / d.count;
            for (let i = 0; i < d.count; i++) {
                objs.push({
                    x: i * spacing + rng(0, spacing * 0.3),
                    w: d.w + rng(-4, 8),
                    submerged: false,
                    submergeTimer: rng(0, 6),
                    color: pick(['#EF4444', '#3B82F6', '#FBBF24', '#A855F7', '#EC4899']),
                });
            }
            lanes.push({ ...d, objs });
        }

        // ── Crocodiles (appear from level 2+) ──
        crocodiles = [];
        if (level >= 2) {
            const crocRows = level >= 4 ? [2, 4] : [3];
            for (const row of crocRows) {
                crocodiles.push({
                    x: rng(60, GAME_W - 120),
                    row,
                    w: 80,
                    dir: row % 2 === 0 ? -1 : 1,
                    speed: spd * 0.6,
                    jawOpen: false,
                    jawTimer: rng(2, 5),
                    jawCycle: 0, // 0=closed, progresses to 1=open
                });
            }
        }

        // ── Otters (appear from level 3+) ──
        otters = [];
        if (level >= 3) {
            const otterRow = pick([1, 3, 5]);
            otters.push({
                x: rng(40, GAME_W - 80),
                row: otterRow,
                w: 50,
                dir: otterRow % 2 === 0 ? -1 : 1,
                speed: spd * 0.9,
                diving: false,
                diveTimer: rng(4, 8),
                surfaceTimer: 0,
            });
        }

        // ── Snakes on median ──
        snakes = [];
        if (level >= 2) {
            snakes.push({
                x: rng(60, GAME_W - 60),
                row: MEDIAN_TOP,
                dir: 1,
                speed: 30 + level * 5,
                bodySegments: [],
                phase: 0,
            });
        }

        // ── Wind gusts (level 4+) ──
        windGust = { active: false, dir: 0, strength: 0, timer: rng(5, 10), displayTimer: 0 };

        // ── Night mode ──
        nightMode = isNightLevel(level);

        // ── Tire marks & splash effects ──
        tireMarks = [];
        splashEffects = [];
    }

    function resetHomeSlots() {
        homeSlots = [];
        ladyFrogs = [];
        for (let i = 0; i < HOME_SLOTS; i++) {
            const slotX = 24 + i * ((GAME_W - 48) / (HOME_SLOTS - 1));
            homeSlots.push({ x: slotX, filled: false, hasBonus: false, hasLadyFrog: false });
        }
        homeFilled = 0;
        bonusFly = null;
        bonusFlyTimer = rng(4, 10);
        // Place lady frog on 1-2 random slots
        const count = level >= 3 ? 2 : 1;
        const indices = [];
        for (let i = 0; i < HOME_SLOTS; i++) indices.push(i);
        for (let n = 0; n < count && indices.length > 0; n++) {
            const idx = indices.splice(Math.floor(Math.random() * indices.length), 1)[0];
            homeSlots[idx].hasLadyFrog = true;
        }
    }

    function resetFrog() {
        frog = {
            x: GAME_W / 2 - FROG_W / 2,
            y: START_ROW * TILE,
            w: FROG_W, h: FROG_H,
            dir: 0, // 0=up, 1=right, 2=down, 3=left
            hopAnim: 0,
            riding: null,
            squash: 0,       // squash-stretch on landing
            tongueFlick: 0,  // tongue animation timer
        };
    }

    function resetLevel() {
        buildLanes();
        resetFrog();
        timer = TIMER_MAX;
        particles = [];
        scorePopups = [];
        deathTimer = 0;
        screenShake = 0;
        bonusFlyTimer = rng(4, 10);
        tongueAnim = 0;
    }

    // ── Particle System ──
    function spawnParticles(x, y, color, count, spread) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x, y,
                vx: rng(-spread, spread),
                vy: rng(-spread, spread),
                life: rng(0.5, 1.2),
                maxLife: 1.2,
                size: rng(2, 6),
                color: color || '#FFFFFF',
            });
        }
    }

    function spawnScorePopup(x, y, text, color) {
        scorePopups.push({ x, y, text, color: color || '#FFD700', life: 1.2 });
    }

    // ── Splash ring effect (water death) ──
    function spawnSplashEffect(x, y) {
        splashEffects.push({ x, y, t: 0, maxT: 1.0 });
        // Also spawn water droplet particles going UP
        for (let i = 0; i < 18; i++) {
            const angle = rng(0, Math.PI * 2);
            const spd = rng(2, 5);
            particles.push({
                x: x + Math.cos(angle) * rng(0, 6),
                y: y + Math.sin(angle) * rng(0, 4),
                vx: Math.cos(angle) * spd * 0.5,
                vy: -Math.abs(Math.sin(angle)) * spd - rng(1, 3),
                life: rng(0.4, 0.9),
                maxLife: 0.9,
                size: rng(1.5, 4),
                color: pick(['#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE', '#FFFFFF']),
            });
        }
    }

    // ── Tire screech marks (road death) ──
    function spawnTireMarks(x, y) {
        sfxTireScreech();
        for (let i = 0; i < 3; i++) {
            tireMarks.push({
                x: x + rng(-10, 10),
                y: y + rng(-3, 3),
                w: rng(15, 35),
                angle: rng(-0.2, 0.2),
                life: 3.0,
                maxLife: 3.0,
            });
        }
        // Spark particles
        for (let i = 0; i < 12; i++) {
            particles.push({
                x: x + rng(-8, 8), y,
                vx: rng(-3, 3), vy: rng(-2, 0.5),
                life: rng(0.2, 0.5), maxLife: 0.5,
                size: rng(1, 3),
                color: pick(['#FDE047', '#F97316', '#EF4444', '#FFF']),
            });
        }
    }

    // ── Update Logic ──
    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt * 60;
            p.y += p.vy * dt * 60;
            p.vy += 1.5 * dt;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const s = scorePopups[i];
            s.y -= 30 * dt;
            s.life -= dt;
            if (s.life <= 0) scorePopups.splice(i, 1);
        }
        // Splash ring effects
        for (let i = splashEffects.length - 1; i >= 0; i--) {
            splashEffects[i].t += dt;
            if (splashEffects[i].t >= splashEffects[i].maxT) splashEffects.splice(i, 1);
        }
        // Tire marks fade
        for (let i = tireMarks.length - 1; i >= 0; i--) {
            tireMarks[i].life -= dt;
            if (tireMarks[i].life <= 0) tireMarks.splice(i, 1);
        }
    }

    function updateLanes(dt) {
        for (const lane of lanes) {
            for (const obj of lane.objs) {
                obj.x += lane.dir * lane.speed * dt * 60;
                // Wrap
                if (lane.dir > 0 && obj.x > GAME_W + 20) obj.x = -obj.w - 10;
                if (lane.dir < 0 && obj.x + obj.w < -20) obj.x = GAME_W + 10;
                // Turtle submerge
                if (lane.type === 'turtle') {
                    obj.submergeTimer -= dt;
                    if (obj.submergeTimer <= 0) {
                        obj.submerged = !obj.submerged;
                        obj.submergeTimer = obj.submerged ? rng(1.5, 2.5) : rng(4, 7);
                    }
                }
            }
        }
    }

    function updateCrocodiles(dt) {
        for (const croc of crocodiles) {
            croc.x += croc.dir * croc.speed * dt * 60;
            if (croc.dir > 0 && croc.x > GAME_W + 20) croc.x = -croc.w - 10;
            if (croc.dir < 0 && croc.x + croc.w < -20) croc.x = GAME_W + 10;
            // Jaw snapping cycle
            croc.jawTimer -= dt;
            if (croc.jawTimer <= 0) {
                croc.jawOpen = !croc.jawOpen;
                croc.jawTimer = croc.jawOpen ? rng(1.0, 2.0) : rng(2.5, 5.0);
                if (croc.jawOpen) sfxCroc();
            }
            croc.jawCycle = croc.jawOpen
                ? Math.min(1, (croc.jawCycle || 0) + dt * 4)
                : Math.max(0, (croc.jawCycle || 0) - dt * 3);
        }
    }

    function updateOtters(dt) {
        for (const otter of otters) {
            otter.x += otter.dir * otter.speed * dt * 60;
            if (otter.dir > 0 && otter.x > GAME_W + 20) otter.x = -otter.w - 10;
            if (otter.dir < 0 && otter.x + otter.w < -20) otter.x = GAME_W + 10;
            if (otter.diving) {
                otter.surfaceTimer -= dt;
                if (otter.surfaceTimer <= 0) {
                    otter.diving = false;
                    otter.diveTimer = rng(4, 8);
                }
            } else {
                otter.diveTimer -= dt;
                if (otter.diveTimer <= 0) {
                    otter.diving = true;
                    otter.surfaceTimer = rng(1.5, 3.0);
                }
            }
        }
    }

    function updateSnakes(dt) {
        for (const snake of snakes) {
            snake.x += snake.dir * snake.speed * dt;
            snake.phase += dt * 5;
            // Bounce off edges
            if (snake.x > GAME_W - 30) { snake.dir = -1; }
            if (snake.x < 30) { snake.dir = 1; }
            // Build body segments for drawing (sinusoidal)
            snake.bodySegments = [];
            for (let i = 0; i < 8; i++) {
                snake.bodySegments.push({
                    x: snake.x - i * 6 * snake.dir,
                    y: snake.row * TILE + TILE / 2 + Math.sin(snake.phase + i * 0.6) * 5,
                });
            }
        }
    }

    function updateWind(dt) {
        if (level < 4) return;
        if (windGust.active) {
            windGust.displayTimer -= dt;
            if (windGust.displayTimer <= 0) {
                windGust.active = false;
                windGust.timer = rng(6, 14);
            }
        } else {
            windGust.timer -= dt;
            if (windGust.timer <= 0) {
                windGust.active = true;
                windGust.dir = Math.random() < 0.5 ? -1 : 1;
                windGust.strength = rng(15, 35);
                windGust.displayTimer = rng(1.5, 3.0);
                sfxWind();
            }
        }
    }

    function updateBonus(dt) {
        if (bonusFly) return;
        bonusFlyTimer -= dt;
        if (bonusFlyTimer <= 0) {
            // Place bonus on random unfilled home slot
            const open = homeSlots.filter(s => !s.filled);
            if (open.length > 0) {
                const slot = pick(open);
                slot.hasBonus = true;
                bonusFly = slot;
            }
            bonusFlyTimer = rng(8, 16);
        }
    }

    function frogRow() {
        return Math.round(frog.y / TILE);
    }

    function frogCenterX() { return frog.x + frog.w / 2; }
    function frogCenterY() { return frog.y + frog.h / 2; }

    function checkCollisions() {
        const row = frogRow();
        const fcx = frogCenterX();
        const fcy = frogCenterY();
        frog.riding = null;

        // Home row check
        if (row <= HOME_Y) {
            let landed = false;
            for (const slot of homeSlots) {
                if (Math.abs(fcx - slot.x) < 22) {
                    if (slot.filled) {
                        killFrog('collision');
                        return;
                    }
                    slot.filled = true;
                    homeFilled++;
                    let pts = 50 + Math.floor(timer) * 10;
                    // Lady frog bonus — double points!
                    if (slot.hasLadyFrog) {
                        pts *= 2;
                        sfxLadyFrog();
                        spawnScorePopup(fcx, fcy - 15, 'LADY FROG!', '#FF69B4');
                        spawnParticles(fcx, fcy, '#FF69B4', 15, 3);
                    }
                    if (slot.hasBonus) {
                        pts += 200;
                        sfxBonus();
                        slot.hasBonus = false;
                        bonusFly = null;
                    }
                    score += pts;
                    spawnScorePopup(fcx, fcy, `+${pts}`, '#FFD700');
                    spawnParticles(fcx, fcy, COL_FROG, 20, 3);
                    sfxHome();
                    // Tongue flick on home
                    frog.tongueFlick = 0.4;
                    if (homeFilled >= HOME_SLOTS) {
                        // Level complete
                        score += 1000;
                        level++;
                        state = ST_LEVEL_SPLASH;
                        levelSplashTimer = LEVEL_SPLASH_MS;
                        sfxLevelUp();
                        resetHomeSlots();
                        resetLevel();
                        return;
                    }
                    resetFrog();
                    timer = TIMER_MAX;
                    landed = true;
                    break;
                }
            }
            if (!landed) {
                killFrog('water'); // missed the slot
            }
            return;
        }

        // River lanes — logs, turtles, crocs, otters
        if (row >= RIVER_START && row <= RIVER_END) {
            let onSomething = false;

            // Check crocodiles first
            for (const croc of crocodiles) {
                if (croc.row !== row) continue;
                const mouthX = croc.dir > 0 ? croc.x + croc.w - 18 : croc.x;
                const mouthW = 18;
                const bodyX = croc.dir > 0 ? croc.x : croc.x + 18;
                const bodyW = croc.w - 18;
                // On mouth? Deadly if jaw open
                if (fcx > mouthX && fcx < mouthX + mouthW) {
                    if (croc.jawOpen) {
                        killFrog('croc');
                        return;
                    }
                    // Closed mouth — ride it
                    onSomething = true;
                    frog.riding = { speed: croc.dir * croc.speed };
                }
                // On body? Safe to ride
                if (fcx > bodyX && fcx < bodyX + bodyW) {
                    onSomething = true;
                    frog.riding = { speed: croc.dir * croc.speed };
                }
            }

            // Check otters
            for (const otter of otters) {
                if (otter.row !== row) continue;
                if (!otter.diving && fcx > otter.x && fcx < otter.x + otter.w) {
                    onSomething = true;
                    frog.riding = { speed: otter.dir * otter.speed };
                }
                // If otter dives while frog is on it, frog falls
                if (otter.diving && fcx > otter.x && fcx < otter.x + otter.w) {
                    // Don't set onSomething — will fall in water
                }
            }

            // Standard logs/turtles
            if (!onSomething) {
                for (const lane of lanes) {
                    if (lane.row !== row) continue;
                    for (const obj of lane.objs) {
                        if (lane.type === 'turtle' && obj.submerged) continue;
                        if (fcx > obj.x && fcx < obj.x + obj.w) {
                            onSomething = true;
                            frog.riding = { speed: lane.dir * lane.speed };
                            break;
                        }
                    }
                }
            }

            if (!onSomething) {
                killFrog('water');
                return;
            }
        }

        // Road lanes
        if (row >= ROAD_START && row <= ROAD_END) {
            for (const lane of lanes) {
                if (lane.row !== row) continue;
                for (const obj of lane.objs) {
                    const ox = obj.x, ow = obj.w;
                    if (frog.x + frog.w > ox + 4 && frog.x < ox + ow - 4 &&
                        Math.abs(frog.y - lane.row * TILE) < TILE * 0.6) {
                        killFrog('collision');
                        return;
                    }
                }
            }
        }

        // Snake on median check
        if (row === MEDIAN_TOP) {
            for (const snake of snakes) {
                if (snake.bodySegments && snake.bodySegments.length > 0) {
                    for (const seg of snake.bodySegments) {
                        const dx = fcx - seg.x;
                        const dy = fcy - seg.y;
                        if (Math.sqrt(dx * dx + dy * dy) < 14) {
                            sfxSnake();
                            killFrog('snake');
                            return;
                        }
                    }
                }
            }
        }
    }

    function killFrog(cause) {
        if (state !== ST_PLAY) return;
        state = ST_DYING;
        deathTimer = DEATH_ANIM_MS;
        lives--;
        const fcx = frogCenterX(), fcy = frogCenterY();

        if (cause === 'water' || cause === 'croc') {
            const colors = ['#3B82F6', '#60A5FA', '#93C5FD', '#FFFFFF'];
            for (let i = 0; i < 30; i++) {
                spawnParticles(fcx, fcy, pick(colors), 1, 4);
            }
            spawnSplashEffect(fcx, fcy);
            sfxSplash();
        } else if (cause === 'snake') {
            const colors = ['#22C55E', '#16A34A', '#86EFAC', '#FFF'];
            for (let i = 0; i < 25; i++) {
                spawnParticles(fcx, fcy, pick(colors), 1, 3);
            }
            sfxDeath();
        } else {
            // Road collision
            const colors = ['#EF4444', '#F97316', '#FBBF24', '#FFFFFF'];
            for (let i = 0; i < 30; i++) {
                spawnParticles(fcx, fcy, pick(colors), 1, 4);
            }
            spawnTireMarks(fcx, fcy);
            sfxDeath();
        }
        screenShake = 8;
    }

    function moveFrog(dir) {
        if (state !== ST_PLAY) return;
        let nx = frog.x, ny = frog.y;
        frog.dir = dir;
        frog.hopAnim = 1;
        frog.squash = 1; // trigger squash-stretch on next landing
        if (dir === 0) ny -= TILE;       // up
        else if (dir === 2) ny += TILE;   // down
        else if (dir === 1) nx += TILE;   // right
        else if (dir === 3) nx -= TILE;   // left

        // Bounds
        nx = clamp(nx, 0, GAME_W - frog.w);
        ny = clamp(ny, 0, START_ROW * TILE);
        frog.x = nx;
        frog.y = ny;
        score += (dir === 0) ? 10 : 0;
        sfxHop();
    }

    function update(dt) {
        frameCount++;
        waterOffset = (waterOffset || 0) + dt * 20;
        updateParticles(dt);

        if (state === ST_PLAY) {
            updateLanes(dt);
            updateCrocodiles(dt);
            updateOtters(dt);
            updateSnakes(dt);
            updateWind(dt);
            updateBonus(dt);
            // Riding on log/turtle/croc/otter
            if (frog.riding) {
                frog.x += frog.riding.speed * dt * 60;
                if (frog.x < -frog.w || frog.x > GAME_W) {
                    killFrog('water');
                    return;
                }
            }
            // Wind push
            if (windGust.active && state === ST_PLAY) {
                frog.x += windGust.dir * windGust.strength * dt;
                frog.x = clamp(frog.x, 0, GAME_W - frog.w);
            }
            // Hop animation decay
            if (frog.hopAnim > 0) frog.hopAnim = Math.max(0, frog.hopAnim - dt * 8);
            // Squash-stretch decay (landing feel)
            if (frog.squash > 0 && frog.hopAnim <= 0) {
                frog.squash = Math.max(0, frog.squash - dt * 6);
            }
            // Tongue flick decay
            if (frog.tongueFlick > 0) frog.tongueFlick = Math.max(0, frog.tongueFlick - dt);
            // Timer
            timer -= dt;
            if (timer <= 0) {
                killFrog('timeout');
                return;
            }
            checkCollisions();
            // Shake decay
            if (screenShake > 0) screenShake *= 0.9;
            if (screenShake < 0.2) screenShake = 0;
        } else if (state === ST_DYING) {
            updateLanes(dt);
            updateCrocodiles(dt);
            updateOtters(dt);
            updateSnakes(dt);
            deathTimer -= dt * 1000;
            if (screenShake > 0) screenShake *= 0.9;
            if (deathTimer <= 0) {
                if (lives <= 0) {
                    state = ST_GAMEOVER;
                    sfxGameOver();
                    triggerGameOver();
                } else {
                    resetFrog();
                    timer = TIMER_MAX;
                    state = ST_PLAY;
                }
            }
        } else if (state === ST_LEVEL_SPLASH) {
            levelSplashTimer -= dt * 1000;
            if (levelSplashTimer <= 0) {
                state = ST_PLAY;
            }
        } else if (state === ST_TITLE) {
            updateLanes(dt);
            // Animate demo frog
            if (!titlePreview) titlePreview = { x: GAME_W / 2, y: START_ROW * TILE, t: 0 };
            titlePreview.t += dt;
            if (titlePreview.t > 0.6) {
                titlePreview.y -= TILE;
                titlePreview.t = 0;
                if (titlePreview.y < 2 * TILE) titlePreview.y = START_ROW * TILE;
            }
        }
    }

    // ═══════════════════════════════════════════
    //  DRAWING — High quality canvas rendering
    // ═══════════════════════════════════════════

    function drawBackground() {
        // Sky gradient background
        if (!bgGradient) {
            bgGradient = ctx.createLinearGradient(0, 0, 0, H);
            if (nightMode) {
                bgGradient.addColorStop(0, '#020210');
                bgGradient.addColorStop(0.4, '#050518');
                bgGradient.addColorStop(1, '#010108');
            } else {
                bgGradient.addColorStop(0, '#0A0A2E');
                bgGradient.addColorStop(0.4, '#0F1030');
                bgGradient.addColorStop(1, '#050515');
            }
        }
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, W, H);
    }

    function drawStars() {
        if (!stars) {
            stars = [];
            for (let i = 0; i < 60; i++) {
                stars.push({ x: rng(0, GAME_W), y: rng(0, GAME_H), s: rng(0.5, 2), b: rng(0.3, 1), speed: rng(0.2, 0.8) });
            }
        }
        ctx.save();
        for (const st of stars) {
            const flicker = 0.6 + 0.4 * Math.sin(frameCount * 0.03 * st.speed + st.x);
            ctx.globalAlpha = st.b * flicker * (nightMode ? 1.4 : 1);
            ctx.fillStyle = '#E0E7FF';
            ctx.beginPath();
            ctx.arc(gx(st.x), gy(st.y), gs(st.s * (nightMode ? 1.3 : 1)), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawWater(y, h) {
        const wx = 0, wy = gy(y), ww = W, wh = gs(h);
        // Deep water gradient
        const grad = ctx.createLinearGradient(0, wy, 0, wy + wh);
        if (nightMode) {
            grad.addColorStop(0, '#0A1628');
            grad.addColorStop(0.5, '#0C1F3D');
            grad.addColorStop(1, '#061020');
        } else {
            grad.addColorStop(0, '#1E3A5F');
            grad.addColorStop(0.5, COL_WATER);
            grad.addColorStop(1, '#0F2847');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(wx, wy, ww, wh);

        // ── Enhanced animated wave ripples ──
        ctx.save();
        // Layer 1: wide slow ripples
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = nightMode ? '#1E3A5F' : COL_WATER_LIGHT;
        ctx.lineWidth = gs(1.5);
        for (let r = 0; r < 8; r++) {
            const rx = ((r * 70 + waterOffset * 0.8) % (GAME_W + 80)) - 40;
            const ry = y + 6 + (r % 5) * (h / 5);
            ctx.beginPath();
            ctx.moveTo(gx(rx), gy(ry));
            ctx.bezierCurveTo(
                gx(rx + 12), gy(ry - 4 + Math.sin(frameCount * 0.03 + r) * 3),
                gx(rx + 28), gy(ry + 3 + Math.cos(frameCount * 0.04 + r * 0.7) * 2),
                gx(rx + 45), gy(ry)
            );
            ctx.stroke();
        }
        // Layer 2: small fast ripples
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = nightMode ? '#2563EB40' : '#93C5FD';
        ctx.lineWidth = gs(0.8);
        for (let r = 0; r < 16; r++) {
            const rx = ((r * 38 + waterOffset * 1.5 + 20) % (GAME_W + 50)) - 25;
            const ry = y + 4 + (r % 5) * (h / 5) + 3;
            ctx.beginPath();
            ctx.moveTo(gx(rx), gy(ry));
            ctx.quadraticCurveTo(gx(rx + 10), gy(ry - 2 + Math.sin(frameCount * 0.06 + r * 1.3) * 1.5), gx(rx + 20), gy(ry));
            ctx.stroke();
        }
        // Layer 3: current lines (horizontal flow indicators)
        ctx.globalAlpha = 0.07;
        ctx.strokeStyle = '#BFDBFE';
        ctx.lineWidth = gs(0.5);
        for (let r = 0; r < 10; r++) {
            const rx = ((r * 55 + waterOffset * 2.2) % (GAME_W + 60)) - 30;
            const ry = y + 10 + (r % 4) * (h / 4);
            ctx.beginPath();
            ctx.moveTo(gx(rx), gy(ry));
            ctx.lineTo(gx(rx + 25 + Math.sin(frameCount * 0.02 + r) * 5), gy(ry + Math.cos(frameCount * 0.03 + r) * 0.8));
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawRoad(y, h) {
        const ry = gy(y), rh = gs(h);
        // Asphalt gradient
        const grad = ctx.createLinearGradient(0, ry, 0, ry + rh);
        grad.addColorStop(0, '#2D3748');
        grad.addColorStop(0.5, COL_ROAD);
        grad.addColorStop(1, '#1A202C');
        ctx.fillStyle = grad;
        ctx.fillRect(0, ry, W, rh);
        // Lane markings
        ctx.save();
        ctx.strokeStyle = COL_ROAD_LINE;
        ctx.lineWidth = gs(1.5);
        ctx.setLineDash([gs(12), gs(12)]);
        ctx.globalAlpha = 0.5;
        for (let i = 1; i < 5; i++) {
            const ly = y + i * TILE;
            ctx.beginPath();
            ctx.moveTo(0, gy(ly));
            ctx.lineTo(W, gy(ly));
            ctx.stroke();
        }
        ctx.setLineDash([]);
        // Edge lines (solid white)
        ctx.strokeStyle = '#FFFFFF';
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = gs(2);
        ctx.beginPath();
        ctx.moveTo(0, ry); ctx.lineTo(W, ry);
        ctx.moveTo(0, ry + rh); ctx.lineTo(W, ry + rh);
        ctx.stroke();
        ctx.restore();

        // ── Tire marks on road ──
        if (tireMarks && tireMarks.length > 0) {
            ctx.save();
            for (const tm of tireMarks) {
                ctx.globalAlpha = 0.4 * (tm.life / tm.maxLife);
                ctx.fillStyle = '#1A1A1A';
                ctx.save();
                ctx.translate(gx(tm.x), gy(tm.y));
                ctx.rotate(tm.angle);
                ctx.fillRect(gs(-tm.w / 2), gs(-1.5), gs(tm.w), gs(3));
                ctx.fillRect(gs(-tm.w / 2), gs(3), gs(tm.w), gs(3));
                ctx.restore();
            }
            ctx.restore();
        }
    }

    function drawGrass(y, h, isHome) {
        const gy0 = gy(y), gh = gs(h);
        const grad = ctx.createLinearGradient(0, gy0, 0, gy0 + gh);
        grad.addColorStop(0, isHome ? '#0D3320' : '#14532D');
        grad.addColorStop(0.5, nightMode ? '#0B3D1A' : COL_GRASS);
        grad.addColorStop(1, '#14532D');
        ctx.fillStyle = grad;
        ctx.fillRect(0, gy0, W, gh);
        // Grass blades
        ctx.save();
        ctx.globalAlpha = nightMode ? 0.15 : 0.3;
        ctx.strokeStyle = COL_GRASS_LIGHT;
        ctx.lineWidth = gs(1);
        for (let i = 0; i < 30; i++) {
            const bx = (i * 17 + 5) % GAME_W;
            const by = y + h - 2;
            const bh = rng(3, 8);
            ctx.beginPath();
            ctx.moveTo(gx(bx), gy(by));
            ctx.lineTo(gx(bx + Math.sin(frameCount * 0.02 + i) * 2), gy(by - bh));
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawHomeSlots() {
        for (const slot of homeSlots) {
            const sx = slot.x - 18, sy = HOME_Y * TILE + 4;
            if (slot.filled) {
                // Filled — draw a little frog
                drawMiniFrog(slot.x, HOME_Y * TILE + TILE / 2, 0.6);
            } else {
                // Lily pad
                ctx.save();
                ctx.fillStyle = COL_HOME;
                ctx.beginPath();
                ctx.ellipse(gx(slot.x), gy(sy + 16), gs(16), gs(12), 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = COL_LILYPAD;
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.ellipse(gx(slot.x), gy(sy + 16), gs(13), gs(9), 0, 0.2, Math.PI * 1.8);
                ctx.fill();
                ctx.restore();
            }
            // Lady frog indicator (pink frog silhouette with hearts)
            if (slot.hasLadyFrog && !slot.filled) {
                ctx.save();
                const pulse = 0.7 + 0.3 * Math.sin(frameCount * 0.1);
                ctx.globalAlpha = pulse;
                // Pink mini frog
                ctx.fillStyle = '#FF69B4';
                ctx.beginPath();
                ctx.ellipse(gx(slot.x), gy(sy + 16), gs(8), gs(6), 0, 0, Math.PI * 2);
                ctx.fill();
                // Eyes
                ctx.fillStyle = '#FFF';
                ctx.beginPath();
                ctx.arc(gx(slot.x - 3), gy(sy + 13), gs(2), 0, Math.PI * 2);
                ctx.arc(gx(slot.x + 3), gy(sy + 13), gs(2), 0, Math.PI * 2);
                ctx.fill();
                // Eyelashes
                ctx.strokeStyle = '#FF69B4';
                ctx.lineWidth = gs(0.8);
                ctx.beginPath();
                ctx.moveTo(gx(slot.x - 5), gy(sy + 11)); ctx.lineTo(gx(slot.x - 4), gy(sy + 9));
                ctx.moveTo(gx(slot.x + 5), gy(sy + 11)); ctx.lineTo(gx(slot.x + 4), gy(sy + 9));
                ctx.stroke();
                // Floating heart
                const hy = sy + 6 + Math.sin(frameCount * 0.08) * 3;
                ctx.fillStyle = '#FF1493';
                ctx.font = `${gs(7)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText('\u2665', gx(slot.x + 8), gy(hy));
                ctx.restore();
            }
            // Bonus fly
            if (slot.hasBonus) {
                ctx.save();
                const pulse = 0.8 + 0.2 * Math.sin(frameCount * 0.15);
                ctx.globalAlpha = pulse;
                ctx.fillStyle = '#FBBF24';
                ctx.shadowColor = '#FBBF24';
                ctx.shadowBlur = gs(8);
                ctx.beginPath();
                ctx.arc(gx(slot.x), gy(sy + 16), gs(5), 0, Math.PI * 2);
                ctx.fill();
                // Wings
                ctx.fillStyle = '#FDE68A';
                ctx.beginPath();
                ctx.ellipse(gx(slot.x - 5), gy(sy + 13), gs(4), gs(2), -0.3, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(gx(slot.x + 5), gy(sy + 13), gs(4), gs(2), 0.3, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.restore();
            }
        }
    }

    function drawMiniFrog(cx, cy, scale) {
        ctx.save();
        ctx.translate(gx(cx), gy(cy));
        const s = gs(scale);
        // Body
        ctx.fillStyle = COL_FROG;
        ctx.beginPath();
        ctx.ellipse(0, 0, 12 * s, 10 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        // Eyes
        ctx.fillStyle = COL_FROG_EYE;
        ctx.beginPath();
        ctx.arc(-5 * s, -7 * s, 3 * s, 0, Math.PI * 2);
        ctx.arc(5 * s, -7 * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(-5 * s, -7 * s, 1.5 * s, 0, Math.PI * 2);
        ctx.arc(5 * s, -7 * s, 1.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawFrog() {
        if (state === ST_DYING && deathTimer < DEATH_ANIM_MS * 0.5) return; // fade out
        const cx = frog.x + frog.w / 2;
        const cy = frog.y + frog.h / 2;
        const hop = frog.hopAnim;
        const squash = frog.squash || 0;

        ctx.save();
        ctx.translate(gx(cx), gy(cy));
        // Rotate based on direction
        const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        ctx.rotate(angles[frog.dir]);

        // ── Enhanced squash-stretch ──
        // While hopping: stretch vertically, narrow horizontally
        // On landing: squash flat, widen horizontally
        let sx, sy;
        if (hop > 0.3) {
            // In air — stretch tall, narrow
            sx = 1 - hop * 0.15;
            sy = 1 + hop * 0.25;
        } else if (squash > 0 && hop <= 0.3) {
            // Landing — squash flat, widen
            const sq = squash * 0.6;
            sx = 1 + sq * 0.3;
            sy = 1 - sq * 0.25;
        } else {
            sx = 1; sy = 1;
        }
        ctx.scale(sx, sy);

        const s = SCALE;
        // Shadow
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, gs(2), gs(14), gs(6), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Back legs
        ctx.fillStyle = COL_FROG_DARK;
        ctx.beginPath();
        ctx.ellipse(gs(-10), gs(8), gs(6), gs(4), -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(gs(10), gs(8), gs(6), gs(4), 0.4, 0, Math.PI * 2);
        ctx.fill();
        // Feet
        ctx.fillStyle = COL_FROG;
        ctx.beginPath();
        ctx.ellipse(gs(-14), gs(12), gs(5), gs(2.5), -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(gs(14), gs(12), gs(5), gs(2.5), 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Body
        const bodyGrad = ctx.createRadialGradient(0, 0, gs(2), 0, 0, gs(14));
        bodyGrad.addColorStop(0, COL_GRASS_LIGHT);
        bodyGrad.addColorStop(0.6, COL_FROG);
        bodyGrad.addColorStop(1, COL_FROG_DARK);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, gs(13), gs(11), 0, 0, Math.PI * 2);
        ctx.fill();

        // Belly spot
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#86EFAC';
        ctx.beginPath();
        ctx.ellipse(0, gs(2), gs(8), gs(6), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Front legs
        ctx.fillStyle = COL_FROG_DARK;
        ctx.beginPath();
        ctx.ellipse(gs(-10), gs(-4), gs(5), gs(3), -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(gs(10), gs(-4), gs(5), gs(3), 0.2, 0, Math.PI * 2);
        ctx.fill();

        // ── Tongue flick animation ──
        if (frog.tongueFlick > 0) {
            const tLen = frog.tongueFlick * 40;
            ctx.strokeStyle = '#EF4444';
            ctx.lineWidth = gs(2);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, gs(-10));
            ctx.lineTo(0, gs(-10 - tLen));
            ctx.stroke();
            // Tongue tip
            ctx.fillStyle = '#DC2626';
            ctx.beginPath();
            ctx.arc(0, gs(-10 - tLen), gs(2), 0, Math.PI * 2);
            ctx.fill();
        }

        // Eyes (on top, big and expressive)
        const eyeY = gs(-8);
        // Outer
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#22C55E';
        ctx.shadowBlur = gs(4);
        ctx.beginPath();
        ctx.arc(gs(-6), eyeY, gs(5), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gs(6), eyeY, gs(5), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Pupils
        ctx.fillStyle = '#111';
        const pd = frog.dir === 1 ? 1.5 : frog.dir === 3 ? -1.5 : 0;
        ctx.beginPath();
        ctx.arc(gs(-6 + pd), eyeY, gs(2.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gs(6 + pd), eyeY, gs(2.5), 0, Math.PI * 2);
        ctx.fill();
        // Highlights
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(gs(-7.5 + pd), eyeY - gs(1.5), gs(1.2), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gs(4.5 + pd), eyeY - gs(1.5), gs(1.2), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function drawCar(obj, lane) {
        const x = obj.x, y = lane.row * TILE + 4, w = obj.w, h = TILE - 8;
        const cx = gx(x), cy = gy(y), cw = gs(w), ch = gs(h);

        ctx.save();
        // Body
        const grad = ctx.createLinearGradient(cx, cy, cx, cy + ch);
        grad.addColorStop(0, obj.color);
        grad.addColorStop(1, '#333');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cw, ch, gs(4));
        ctx.fill();
        // Roof
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.roundRect(cx + cw * 0.2, cy + ch * 0.1, cw * 0.6, ch * 0.35, gs(3));
        ctx.fill();
        // Windows
        ctx.fillStyle = 'rgba(150,220,255,0.5)';
        ctx.fillRect(cx + cw * 0.22, cy + ch * 0.15, cw * 0.2, ch * 0.25);
        ctx.fillRect(cx + cw * 0.55, cy + ch * 0.15, cw * 0.2, ch * 0.25);
        // Headlights
        const front = lane.dir > 0 ? cx + cw - gs(4) : cx;
        ctx.fillStyle = '#FBBF24';
        ctx.shadowColor = '#FBBF24';
        ctx.shadowBlur = gs(6);
        ctx.beginPath();
        ctx.arc(front + gs(2), cy + ch * 0.3, gs(2.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(front + gs(2), cy + ch * 0.7, gs(2.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // ── Night mode: headlight beams ──
        if (nightMode) {
            ctx.save();
            ctx.globalAlpha = 0.12;
            const beamLen = gs(80);
            const beamW = gs(20);
            const hx = lane.dir > 0 ? cx + cw : cx;
            const hy = cy + ch * 0.5;
            const grad2 = ctx.createLinearGradient(
                hx, hy,
                hx + lane.dir * beamLen, hy
            );
            grad2.addColorStop(0, '#FBBF24');
            grad2.addColorStop(1, 'transparent');
            ctx.fillStyle = grad2;
            ctx.beginPath();
            ctx.moveTo(hx, hy - gs(3));
            ctx.lineTo(hx + lane.dir * beamLen, hy - beamW / 2);
            ctx.lineTo(hx + lane.dir * beamLen, hy + beamW / 2);
            ctx.lineTo(hx, hy + gs(3));
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // Taillights
        const back = lane.dir > 0 ? cx + gs(2) : cx + cw - gs(4);
        ctx.fillStyle = '#EF4444';
        ctx.beginPath();
        ctx.arc(back + gs(1), cy + ch * 0.3, gs(2), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(back + gs(1), cy + ch * 0.7, gs(2), 0, Math.PI * 2);
        ctx.fill();
        // Wheels
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(cx + gs(4), cy + ch - gs(3), gs(8), gs(4));
        ctx.fillRect(cx + cw - gs(12), cy + ch - gs(3), gs(8), gs(4));
        ctx.restore();
    }

    function drawTruck(obj, lane) {
        const x = obj.x, y = lane.row * TILE + 2, w = obj.w, h = TILE - 4;
        const cx = gx(x), cy = gy(y), cw = gs(w), ch = gs(h);

        ctx.save();
        // Trailer
        const grad = ctx.createLinearGradient(cx, cy, cx, cy + ch);
        grad.addColorStop(0, obj.color);
        grad.addColorStop(1, '#222');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cw * 0.7, ch, gs(2));
        ctx.fill();
        // Cabin
        ctx.fillStyle = '#4B5563';
        const cabX = lane.dir > 0 ? cx + cw * 0.7 : cx - cw * 0.1;
        ctx.beginPath();
        ctx.roundRect(cabX, cy, cw * 0.3, ch, gs(3));
        ctx.fill();
        // Cabin window
        ctx.fillStyle = 'rgba(150,220,255,0.5)';
        ctx.fillRect(cabX + gs(3), cy + gs(3), gs(w * 0.22), ch * 0.4);
        // Wheels
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(cx + gs(6), cy + ch - gs(3), gs(10), gs(4));
        ctx.fillRect(cx + cw * 0.4, cy + ch - gs(3), gs(10), gs(4));
        ctx.fillRect(cx + cw - gs(16), cy + ch - gs(3), gs(10), gs(4));
        // Headlights
        const front = lane.dir > 0 ? cx + cw - gs(2) : cx;
        ctx.fillStyle = '#FBBF24';
        ctx.shadowColor = '#FBBF24';
        ctx.shadowBlur = gs(5);
        ctx.beginPath();
        ctx.arc(front + gs(1), cy + ch * 0.5, gs(3), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // ── Night mode: headlight beams for trucks ──
        if (nightMode) {
            ctx.save();
            ctx.globalAlpha = 0.1;
            const beamLen = gs(100);
            const beamW = gs(24);
            const hx = lane.dir > 0 ? cx + cw : cx;
            const hy = cy + ch * 0.5;
            const grad2 = ctx.createLinearGradient(hx, hy, hx + lane.dir * beamLen, hy);
            grad2.addColorStop(0, '#FBBF24');
            grad2.addColorStop(1, 'transparent');
            ctx.fillStyle = grad2;
            ctx.beginPath();
            ctx.moveTo(hx, hy - gs(4));
            ctx.lineTo(hx + lane.dir * beamLen, hy - beamW / 2);
            ctx.lineTo(hx + lane.dir * beamLen, hy + beamW / 2);
            ctx.lineTo(hx, hy + gs(4));
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    }

    function drawLog(obj, lane) {
        const x = obj.x, y = lane.row * TILE + 6, w = obj.w, h = TILE - 12;
        const cx = gx(x), cy = gy(y), cw = gs(w), ch = gs(h);

        ctx.save();
        // Main log shape
        const grad = ctx.createLinearGradient(cx, cy, cx, cy + ch);
        grad.addColorStop(0, COL_LOG_LIGHT);
        grad.addColorStop(0.5, COL_LOG);
        grad.addColorStop(1, '#78350F');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cw, ch, gs(h / 2));
        ctx.fill();
        // Bark lines
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = gs(1);
        for (let i = 0; i < w; i += 14) {
            ctx.beginPath();
            ctx.moveTo(gx(x + i + 4), cy + gs(2));
            ctx.lineTo(gx(x + i + 2), cy + ch - gs(2));
            ctx.stroke();
        }
        // Highlight
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#FDE68A';
        ctx.beginPath();
        ctx.roundRect(cx + gs(4), cy + gs(2), cw - gs(8), ch * 0.35, gs(3));
        ctx.fill();
        // End circles (cut wood)
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#B45309';
        ctx.beginPath();
        ctx.ellipse(cx + gs(3), cy + ch / 2, gs(3), ch / 2 - gs(1), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + cw - gs(3), cy + ch / 2, gs(3), ch / 2 - gs(1), 0, 0, Math.PI * 2);
        ctx.fill();
        // Rings on ends
        ctx.strokeStyle = '#92400E';
        ctx.lineWidth = gs(0.5);
        ctx.beginPath();
        ctx.ellipse(cx + gs(3), cy + ch / 2, gs(1.5), ch / 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(cx + cw - gs(3), cy + ch / 2, gs(1.5), ch / 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawTurtle(obj, lane) {
        if (obj.submerged) {
            // Just show ripple
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.strokeStyle = '#60A5FA';
            ctx.lineWidth = gs(1.5);
            const ty = lane.row * TILE + TILE / 2;
            for (let i = 0; i < (lane.turtleCount || 2); i++) {
                const tx = obj.x + 15 + i * 28;
                ctx.beginPath();
                ctx.ellipse(gx(tx), gy(ty), gs(10 + Math.sin(frameCount * 0.05) * 2), gs(5), 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
            return;
        }
        const count = lane.turtleCount || 2;
        const tw = 22, th = 18;
        for (let i = 0; i < count; i++) {
            const tx = obj.x + 6 + i * (obj.w / count);
            const ty = lane.row * TILE + (TILE - th) / 2;

            ctx.save();
            // Shell
            const shellGrad = ctx.createRadialGradient(gx(tx + tw / 2), gy(ty + th / 2), gs(2), gx(tx + tw / 2), gy(ty + th / 2), gs(12));
            shellGrad.addColorStop(0, COL_TURTLE_SHELL);
            shellGrad.addColorStop(1, COL_TURTLE);
            ctx.fillStyle = shellGrad;
            ctx.beginPath();
            ctx.ellipse(gx(tx + tw / 2), gy(ty + th / 2), gs(tw / 2), gs(th / 2), 0, 0, Math.PI * 2);
            ctx.fill();
            // Shell pattern
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = gs(0.8);
            ctx.beginPath();
            ctx.moveTo(gx(tx + tw / 2), gy(ty + 2));
            ctx.lineTo(gx(tx + tw / 2), gy(ty + th - 2));
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(gx(tx + 3), gy(ty + th / 2));
            ctx.lineTo(gx(tx + tw - 3), gy(ty + th / 2));
            ctx.stroke();
            // Head
            ctx.fillStyle = COL_TURTLE;
            const headDir = lane.dir;
            const hx = headDir > 0 ? tx + tw : tx - 4;
            ctx.beginPath();
            ctx.arc(gx(hx), gy(ty + th / 2), gs(4), 0, Math.PI * 2);
            ctx.fill();
            // Eye
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(gx(hx + headDir * 2), gy(ty + th / 2 - 1), gs(1.5), 0, Math.PI * 2);
            ctx.fill();
            // Flippers
            ctx.fillStyle = COL_TURTLE;
            const flipAngle = Math.sin(frameCount * 0.08 + i) * 0.3;
            ctx.beginPath();
            ctx.ellipse(gx(tx + 3), gy(ty + th - 2), gs(4), gs(2.5), flipAngle, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(gx(tx + tw - 3), gy(ty + th - 2), gs(4), gs(2.5), -flipAngle, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ── Draw Crocodile ──
    function drawCrocodile(croc) {
        const x = croc.x, y = croc.row * TILE + 4, w = croc.w, h = TILE - 8;
        const jaw = croc.jawCycle || 0;
        ctx.save();

        // Body (dark green, ridged)
        const bodyGrad = ctx.createLinearGradient(gx(x), gy(y), gx(x), gy(y + h));
        bodyGrad.addColorStop(0, '#2D5A1E');
        bodyGrad.addColorStop(0.5, '#1A3D12');
        bodyGrad.addColorStop(1, '#0F2A0A');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.roundRect(gx(x + 10), gy(y + 2), gs(w - 20), gs(h - 4), gs(6));
        ctx.fill();

        // Scales / ridges
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        for (let i = 0; i < 5; i++) {
            const sx = x + 15 + i * 12;
            ctx.beginPath();
            ctx.arc(gx(sx), gy(y + h / 2 - 3), gs(3), 0, Math.PI * 2);
            ctx.fill();
        }

        // Tail
        ctx.fillStyle = '#1A3D12';
        const tailX = croc.dir > 0 ? x - 5 : x + w + 5;
        ctx.beginPath();
        ctx.moveTo(gx(croc.dir > 0 ? x + 10 : x + w - 10), gy(y + 4));
        ctx.quadraticCurveTo(gx(tailX), gy(y + h / 2 + Math.sin(frameCount * 0.06) * 3), gx(croc.dir > 0 ? x + 10 : x + w - 10), gy(y + h - 4));
        ctx.fill();

        // Head + Jaw
        const headX = croc.dir > 0 ? x + w - 20 : x;
        const headW = 20;
        // Upper jaw
        ctx.fillStyle = '#2D5A1E';
        ctx.beginPath();
        ctx.roundRect(gx(headX), gy(y), gs(headW), gs(h / 2 - jaw * 4), gs(3));
        ctx.fill();
        // Lower jaw
        ctx.beginPath();
        ctx.roundRect(gx(headX), gy(y + h / 2 + jaw * 4), gs(headW), gs(h / 2 - jaw * 4), gs(3));
        ctx.fill();

        // Teeth (visible when jaw open)
        if (jaw > 0.3) {
            ctx.fillStyle = '#FFFFF0';
            const teethY1 = y + h / 2 - jaw * 4;
            const teethY2 = y + h / 2 + jaw * 4;
            for (let t = 0; t < 4; t++) {
                const tx = headX + 3 + t * 4.5;
                // Upper teeth pointing down
                ctx.beginPath();
                ctx.moveTo(gx(tx), gy(teethY1));
                ctx.lineTo(gx(tx + 1.5), gy(teethY1 + 3));
                ctx.lineTo(gx(tx + 3), gy(teethY1));
                ctx.fill();
                // Lower teeth pointing up
                ctx.beginPath();
                ctx.moveTo(gx(tx), gy(teethY2));
                ctx.lineTo(gx(tx + 1.5), gy(teethY2 - 3));
                ctx.lineTo(gx(tx + 3), gy(teethY2));
                ctx.fill();
            }
        }

        // Danger glow when mouth open
        if (jaw > 0.5) {
            ctx.save();
            ctx.globalAlpha = 0.15 * jaw;
            ctx.fillStyle = '#EF4444';
            ctx.shadowColor = '#EF4444';
            ctx.shadowBlur = gs(10);
            ctx.beginPath();
            ctx.ellipse(gx(headX + headW / 2), gy(y + h / 2), gs(12), gs(8), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        // Eyes (on top of head)
        const eyeX = croc.dir > 0 ? headX + 4 : headX + headW - 8;
        ctx.fillStyle = '#FBBF24';
        ctx.beginPath();
        ctx.arc(gx(eyeX), gy(y + 5), gs(3.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.arc(gx(eyeX + 10), gy(y + 5), gs(3.5), 0, Math.PI * 2);
        ctx.fill();
        // Slit pupils
        ctx.fillStyle = '#111';
        ctx.fillRect(gx(eyeX - 0.5), gy(y + 3), gs(1), gs(4));
        ctx.fillRect(gx(eyeX + 9.5), gy(y + 3), gs(1), gs(4));

        ctx.restore();
    }

    // ── Draw Otter ──
    function drawOtter(otter) {
        const x = otter.x, y = otter.row * TILE + 6, w = otter.w, h = TILE - 12;
        ctx.save();

        if (otter.diving) {
            // Show bubbles when diving
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = '#93C5FD';
            for (let i = 0; i < 3; i++) {
                const bx = x + 10 + i * 15 + Math.sin(frameCount * 0.1 + i) * 4;
                const by = y + h / 2 + Math.sin(frameCount * 0.12 + i * 2) * 3;
                ctx.beginPath();
                ctx.arc(gx(bx), gy(by), gs(2 + Math.sin(frameCount * 0.08 + i) * 1), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            return;
        }

        // Body
        const bodyGrad = ctx.createLinearGradient(gx(x), gy(y), gx(x), gy(y + h));
        bodyGrad.addColorStop(0, '#8B6C4A');
        bodyGrad.addColorStop(0.5, '#6B4E2E');
        bodyGrad.addColorStop(1, '#503A1E');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.roundRect(gx(x + 4), gy(y + 2), gs(w - 8), gs(h - 4), gs(h / 2));
        ctx.fill();

        // Belly (lighter)
        ctx.fillStyle = '#D4A76A';
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.ellipse(gx(x + w / 2), gy(y + h / 2 + 2), gs(w * 0.3), gs(h * 0.25), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Head
        const headX = otter.dir > 0 ? x + w - 6 : x - 2;
        ctx.fillStyle = '#6B4E2E';
        ctx.beginPath();
        ctx.arc(gx(headX + 4), gy(y + h / 2), gs(7), 0, Math.PI * 2);
        ctx.fill();

        // Nose
        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.arc(gx(headX + 4 + otter.dir * 5), gy(y + h / 2), gs(2), 0, Math.PI * 2);
        ctx.fill();

        // Whiskers
        ctx.strokeStyle = '#999';
        ctx.lineWidth = gs(0.5);
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(gx(headX + 4 + otter.dir * 3), gy(y + h / 2 + i * 2));
            ctx.lineTo(gx(headX + 4 + otter.dir * 10), gy(y + h / 2 + i * 4));
            ctx.stroke();
        }

        // Eyes
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(gx(headX + 2), gy(y + h / 2 - 3), gs(1.5), 0, Math.PI * 2);
        ctx.fill();

        // Tail
        const tailX = otter.dir > 0 ? x + 2 : x + w - 2;
        ctx.strokeStyle = '#6B4E2E';
        ctx.lineWidth = gs(3);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(gx(tailX), gy(y + h / 2));
        ctx.quadraticCurveTo(
            gx(tailX - otter.dir * 12), gy(y + h / 2 + Math.sin(frameCount * 0.08) * 5),
            gx(tailX - otter.dir * 18), gy(y + h / 2)
        );
        ctx.stroke();

        ctx.restore();
    }

    // ── Draw Snake ──
    function drawSnake(snake) {
        if (!snake.bodySegments || snake.bodySegments.length < 2) return;
        ctx.save();

        // Body segments as connected circles
        ctx.lineWidth = gs(5);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // Gradient body: green to darker
        ctx.strokeStyle = '#16A34A';
        ctx.beginPath();
        ctx.moveTo(gx(snake.bodySegments[0].x), gy(snake.bodySegments[0].y));
        for (let i = 1; i < snake.bodySegments.length; i++) {
            ctx.lineTo(gx(snake.bodySegments[i].x), gy(snake.bodySegments[i].y));
        }
        ctx.stroke();

        // Pattern marks
        ctx.strokeStyle = '#0D6B2C';
        ctx.lineWidth = gs(3);
        ctx.setLineDash([gs(2), gs(4)]);
        ctx.beginPath();
        ctx.moveTo(gx(snake.bodySegments[0].x), gy(snake.bodySegments[0].y));
        for (let i = 1; i < snake.bodySegments.length; i++) {
            ctx.lineTo(gx(snake.bodySegments[i].x), gy(snake.bodySegments[i].y));
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Head
        const head = snake.bodySegments[0];
        ctx.fillStyle = '#15803D';
        ctx.beginPath();
        ctx.arc(gx(head.x), gy(head.y), gs(5), 0, Math.PI * 2);
        ctx.fill();

        // Eyes (red, menacing)
        ctx.fillStyle = '#EF4444';
        ctx.beginPath();
        ctx.arc(gx(head.x + snake.dir * 2 - 2), gy(head.y - 2), gs(1.5), 0, Math.PI * 2);
        ctx.arc(gx(head.x + snake.dir * 2 + 2), gy(head.y - 2), gs(1.5), 0, Math.PI * 2);
        ctx.fill();

        // Forked tongue (flickers)
        if (Math.sin(frameCount * 0.15) > 0.3) {
            ctx.strokeStyle = '#EF4444';
            ctx.lineWidth = gs(0.8);
            const tx = head.x + snake.dir * 6;
            const ty = head.y;
            ctx.beginPath();
            ctx.moveTo(gx(head.x + snake.dir * 4), gy(ty));
            ctx.lineTo(gx(tx), gy(ty));
            ctx.moveTo(gx(tx), gy(ty));
            ctx.lineTo(gx(tx + snake.dir * 3), gy(ty - 2));
            ctx.moveTo(gx(tx), gy(ty));
            ctx.lineTo(gx(tx + snake.dir * 3), gy(ty + 2));
            ctx.stroke();
        }

        // Danger indicator (subtle pulsing glow)
        ctx.globalAlpha = 0.08 + Math.sin(frameCount * 0.1) * 0.04;
        ctx.fillStyle = '#EF4444';
        ctx.beginPath();
        ctx.arc(gx(head.x), gy(head.y), gs(12), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function drawLanes() {
        for (const lane of lanes) {
            for (const obj of lane.objs) {
                if (lane.type === 'car') drawCar(obj, lane);
                else if (lane.type === 'truck') drawTruck(obj, lane);
                else if (lane.type === 'log') drawLog(obj, lane);
                else if (lane.type === 'turtle') drawTurtle(obj, lane);
            }
        }
        // Draw crocodiles
        for (const croc of crocodiles) drawCrocodile(croc);
        // Draw otters
        for (const otter of otters) drawOtter(otter);
        // Draw snakes
        for (const snake of snakes) drawSnake(snake);
    }

    // ── Draw splash ring effects ──
    function drawSplashEffects() {
        for (const s of splashEffects) {
            const progress = s.t / s.maxT;
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            ctx.strokeStyle = '#93C5FD';
            ctx.lineWidth = gs(2 - progress * 1.5);
            // Expanding rings
            for (let r = 0; r < 3; r++) {
                const radius = gs(5 + progress * 25 + r * 8);
                const alpha = (1 - progress) * (1 - r * 0.3);
                if (alpha <= 0) continue;
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.arc(gx(s.x), gy(s.y), radius, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    // ── Draw wind indicator ──
    function drawWindIndicator() {
        if (!windGust.active) return;
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.15 * Math.sin(frameCount * 0.15);
        ctx.strokeStyle = '#E0E7FF';
        ctx.lineWidth = gs(1.5);
        // Draw wind streaks across the screen
        for (let i = 0; i < 8; i++) {
            const wy = 40 + i * 60 + Math.sin(frameCount * 0.04 + i) * 10;
            const wx = ((frameCount * 3 * windGust.dir + i * 80) % (GAME_W + 100)) - 50;
            ctx.beginPath();
            ctx.moveTo(gx(wx), gy(wy));
            ctx.lineTo(gx(wx + windGust.dir * 30), gy(wy + Math.sin(frameCount * 0.06 + i) * 3));
            ctx.stroke();
        }
        // HUD indicator
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#FBBF24';
        ctx.font = `${gs(9)}px "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        const arrow = windGust.dir > 0 ? '\u25B6' : '\u25C0';
        ctx.fillText(`WIND ${arrow}${arrow}`, gx(GAME_W / 2), gy(GAME_H - 60));
        ctx.restore();
    }

    // ── Night mode visibility mask ──
    function drawNightOverlay() {
        if (!nightMode) return;
        ctx.save();

        // Create dark overlay with a radial cutout around the frog
        const fcx = gx(frogCenterX());
        const fcy = gy(frogCenterY());
        const glowR = gs(55 + Math.sin(frameCount * 0.03) * 5);

        // Dark overlay everywhere
        ctx.fillStyle = 'rgba(0,0,8,0.75)';
        ctx.fillRect(0, 0, W, H);

        // Cut out glow around frog using globalCompositeOperation
        ctx.globalCompositeOperation = 'destination-out';
        const glowGrad = ctx.createRadialGradient(fcx, fcy, gs(8), fcx, fcy, glowR);
        glowGrad.addColorStop(0, 'rgba(0,0,0,1)');
        glowGrad.addColorStop(0.5, 'rgba(0,0,0,0.8)');
        glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, 0, W, H);

        // Also cut out light from car/truck headlights
        for (const lane of lanes) {
            if (lane.row < ROAD_START || lane.row > ROAD_END) continue;
            for (const obj of lane.objs) {
                const frontX = lane.dir > 0 ? obj.x + obj.w : obj.x;
                const frontY = lane.row * TILE + (TILE / 2);
                const hlGrad = ctx.createRadialGradient(
                    gx(frontX), gy(frontY), gs(3),
                    gx(frontX + lane.dir * 30), gy(frontY), gs(40)
                );
                hlGrad.addColorStop(0, 'rgba(0,0,0,0.6)');
                hlGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = hlGrad;
                ctx.beginPath();
                ctx.arc(gx(frontX + lane.dir * 15), gy(frontY), gs(40), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.globalCompositeOperation = 'source-over';

        // Subtle frog glow (additive light feel)
        ctx.globalAlpha = 0.08;
        const fgGrad = ctx.createRadialGradient(fcx, fcy, gs(5), fcx, fcy, gs(50));
        fgGrad.addColorStop(0, COL_FROG);
        fgGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = fgGrad;
        ctx.beginPath();
        ctx.arc(fcx, fcy, gs(50), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.save();
            ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = gs(4);
            ctx.beginPath();
            ctx.arc(gx(p.x), gy(p.y), gs(p.size * (p.life / p.maxLife)), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();
        }
        for (const s of scorePopups) {
            ctx.save();
            ctx.globalAlpha = clamp(s.life / 1.2, 0, 1);
            ctx.fillStyle = s.color;
            ctx.font = `bold ${gs(14)}px "Press Start 2P", monospace`;
            ctx.textAlign = 'center';
            ctx.shadowColor = '#000';
            ctx.shadowBlur = gs(3);
            ctx.fillText(s.text, gx(s.x), gy(s.y));
            ctx.shadowBlur = 0;
            ctx.restore();
        }
    }

    function drawHUD() {
        ctx.save();
        const hudY = (TOTAL_ROWS * TILE) + 2;
        // Dark bar at bottom
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, gy(hudY), W, H - gy(hudY));

        ctx.fillStyle = COL_HUD;
        ctx.font = `${gs(11)}px "Press Start 2P", monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE ${score}`, gs(8), gy(hudY + 15));
        ctx.textAlign = 'right';
        ctx.fillText(`LVL ${level}`, gs(GAME_W - 8), gy(hudY + 15));

        // Night mode indicator
        if (nightMode) {
            ctx.fillStyle = '#FBBF24';
            ctx.font = `${gs(7)}px "Press Start 2P", monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('\u263E NIGHT', gx(GAME_W / 2), gy(hudY + 14));
        }

        // Lives as mini frogs
        ctx.textAlign = 'left';
        for (let i = 0; i < lives; i++) {
            ctx.fillStyle = COL_FROG;
            ctx.beginPath();
            ctx.arc(gs(10 + i * 18), gy(hudY + 28), gs(6), 0, Math.PI * 2);
            ctx.fill();
        }

        // Timer bar
        const pct = Math.max(0, timer / TIMER_MAX);
        const barX = gs(80), barY = gy(hudY + 24);
        const barW = gs(GAME_W - 160), barH = gs(8);
        ctx.fillStyle = '#1F2937';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, gs(4));
        ctx.fill();
        const timerColor = pct > 0.3 ? '#22C55E' : pct > 0.1 ? '#FBBF24' : '#EF4444';
        ctx.fillStyle = timerColor;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * pct, barH, gs(4));
        ctx.fill();
        // Timer glow
        if (pct < 0.2) {
            ctx.shadowColor = '#EF4444';
            ctx.shadowBlur = gs(6 + Math.sin(frameCount * 0.2) * 3);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        ctx.restore();
    }

    function drawVignette() {
        ctx.save();
        const grad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, nightMode ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    function drawTitleScreen() {
        drawBackground();
        drawStars();
        // Draw scene behind title
        drawWater(RIVER_START * TILE, (RIVER_END - RIVER_START + 1) * TILE);
        drawGrass(HOME_Y * TILE, TILE, true);
        drawRoad(ROAD_START * TILE, (ROAD_END - ROAD_START + 1) * TILE);
        drawGrass(MEDIAN_TOP * TILE, TILE, false);
        drawGrass(MEDIAN_BOT * TILE, TILE, false);
        drawGrass(START_ROW * TILE, TILE, false);
        drawLanes();
        // Demo frog
        if (titlePreview) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            const cx = titlePreview.x, cy = titlePreview.y + TILE / 2;
            drawMiniFrog(cx, cy, 1);
            ctx.restore();
        }

        // Dark overlay
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);

        // Title
        ctx.save();
        ctx.textAlign = 'center';
        const titleY = GAME_H * 0.28;

        // Glow
        ctx.shadowColor = playerColor || COL_FROG;
        ctx.shadowBlur = gs(20);
        ctx.fillStyle = playerColor || COL_FROG;
        ctx.font = `bold ${gs(36)}px "Press Start 2P", monospace`;
        ctx.fillText('FROGGER', gx(GAME_W / 2), gy(titleY));
        ctx.shadowBlur = gs(8);
        ctx.fillText('FROGGER', gx(GAME_W / 2), gy(titleY));
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.fillStyle = COL_HUD;
        ctx.font = `${gs(10)}px "Press Start 2P", monospace`;
        ctx.fillText('YOUR WORLD ARCADE', gx(GAME_W / 2), gy(titleY + 30));

        // Animated frog icon
        const iconY = titleY + 70;
        const bounce = Math.sin(frameCount * 0.06) * 5;
        drawMiniFrog(GAME_W / 2, iconY + bounce, 1.5);

        // Instructions
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.fillStyle = '#FBBF24';
            ctx.font = `${gs(11)}px "Press Start 2P", monospace`;
            ctx.fillText('PRESS ANY KEY TO START', gx(GAME_W / 2), gy(GAME_H * 0.72));
        }

        // Controls
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `${gs(8)}px "Press Start 2P", monospace`;
        ctx.fillText('ARROW KEYS / SWIPE TO MOVE', gx(GAME_W / 2), gy(GAME_H * 0.82));
        ctx.fillText('CROSS THE ROAD AND RIVER', gx(GAME_W / 2), gy(GAME_H * 0.87));
        ctx.fillText('FILL ALL 5 HOME SLOTS TO ADVANCE', gx(GAME_W / 2), gy(GAME_H * 0.92));

        ctx.restore();
        drawVignette();
    }

    function drawLevelSplash() {
        drawBackground();
        drawStars();
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = playerColor || COL_FROG;
        ctx.shadowColor = playerColor || COL_FROG;
        ctx.shadowBlur = gs(15);
        ctx.font = `bold ${gs(28)}px "Press Start 2P", monospace`;
        ctx.fillText(`LEVEL ${level}`, gx(GAME_W / 2), gy(GAME_H * 0.4));
        ctx.shadowBlur = 0;
        ctx.fillStyle = COL_HUD;
        ctx.font = `${gs(12)}px "Press Start 2P", monospace`;
        const subtitle = isNightLevel(level) ? 'NIGHT MODE!' : 'GET READY!';
        ctx.fillText(subtitle, gx(GAME_W / 2), gy(GAME_H * 0.52));
        if (isNightLevel(level)) {
            ctx.fillStyle = '#FBBF24';
            ctx.font = `${gs(8)}px "Press Start 2P", monospace`;
            ctx.fillText('\u263E LIMITED VISIBILITY \u263E', gx(GAME_W / 2), gy(GAME_H * 0.59));
        }
        // Show new hazard warnings
        const warnings = [];
        if (level >= 2) warnings.push('\u2620 CROCODILES IN RIVER');
        if (level >= 2) warnings.push('\u2620 SNAKE ON MEDIAN');
        if (level >= 3) warnings.push('\u2620 OTTERS DIVE UNDERWATER');
        if (level >= 4) warnings.push('\u2620 WIND GUSTS');
        if (warnings.length > 0) {
            ctx.fillStyle = '#F97316';
            ctx.font = `${gs(7)}px "Press Start 2P", monospace`;
            warnings.forEach((w, i) => {
                ctx.fillText(w, gx(GAME_W / 2), gy(GAME_H * 0.65 + i * 14));
            });
        }
        ctx.restore();
        drawVignette();
    }

    function drawGameOverScreen() {
        drawBackground();
        drawStars();
        ctx.save();
        ctx.textAlign = 'center';
        // GAME OVER
        ctx.fillStyle = '#EF4444';
        ctx.shadowColor = '#EF4444';
        ctx.shadowBlur = gs(15);
        ctx.font = `bold ${gs(28)}px "Press Start 2P", monospace`;
        ctx.fillText('GAME OVER', gx(GAME_W / 2), gy(GAME_H * 0.35));
        ctx.shadowBlur = 0;
        // Score
        ctx.fillStyle = COL_HUD;
        ctx.font = `${gs(14)}px "Press Start 2P", monospace`;
        ctx.fillText(`SCORE: ${score}`, gx(GAME_W / 2), gy(GAME_H * 0.48));
        ctx.fillText(`LEVEL: ${level}`, gx(GAME_W / 2), gy(GAME_H * 0.55));
        // Restart prompt
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.fillStyle = '#FBBF24';
            ctx.font = `${gs(10)}px "Press Start 2P", monospace`;
            ctx.fillText('PRESS ANY KEY TO RESTART', gx(GAME_W / 2), gy(GAME_H * 0.70));
        }
        ctx.restore();
        drawVignette();
    }

    function drawPlayfield() {
        drawBackground();
        drawStars();

        // Apply screen shake
        ctx.save();
        if (screenShake > 0.5) {
            ctx.translate(rng(-screenShake, screenShake) * SCALE, rng(-screenShake, screenShake) * SCALE);
        }

        // Home area (top)
        drawGrass(HOME_Y * TILE, TILE, true);
        drawHomeSlots();

        // River
        drawWater(RIVER_START * TILE, (RIVER_END - RIVER_START + 1) * TILE);

        // Median (safe zones)
        drawGrass(MEDIAN_TOP * TILE, TILE, false);

        // Road
        drawRoad(ROAD_START * TILE, (ROAD_END - ROAD_START + 1) * TILE);

        // Bottom median / start area
        drawGrass(MEDIAN_BOT * TILE, TILE, false);
        drawGrass(START_ROW * TILE, TILE, false);

        // Draw lane objects (includes crocs, otters, snakes)
        drawLanes();

        // Splash ring effects (on water)
        drawSplashEffects();

        // Wind streaks
        drawWindIndicator();

        // Frog
        if (state === ST_PLAY || (state === ST_DYING && deathTimer > DEATH_ANIM_MS * 0.3)) {
            drawFrog();
        }

        // Night overlay (after everything, before particles)
        drawNightOverlay();

        // Particles on top (always visible even in night)
        drawParticles();

        if (state === ST_PLAY) drawOnScreenControls(ctx, W, H, gs, [], 'LRUD');

        ctx.restore(); // end shake

        // HUD always outside shake
        drawHUD();
        drawVignette();
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        if (state === ST_TITLE) {
            drawTitleScreen();
        } else if (state === ST_LEVEL_SPLASH) {
            drawLevelSplash();
        } else if (state === ST_GAMEOVER) {
            drawGameOverScreen();
        } else {
            drawPlayfield();
        }
    }

    // ═══════════════════════════════════════════
    //  GAME LOOP
    // ═══════════════════════════════════════════
    function gameLoop(ts) {
        if (!gameActive) return;
        if (!lastTime) lastTime = ts;
        const dt = Math.min((ts - lastTime) / 1000, 0.05);
        lastTime = ts;
        update(dt);
        draw();
        animFrame = requestAnimationFrame(gameLoop);
    }

    // ═══════════════════════════════════════════
    //  INPUT HANDLING
    // ═══════════════════════════════════════════
    function startGame() {
        score = 0;
        lives = INITIAL_LIVES;
        level = 1;
        state = ST_PLAY;
        startTime = Date.now();
        resetHomeSlots();
        resetLevel();
    }

    function onKeyDown(e) {
        if (!gameActive) return;
        keys[e.key] = true;
        if (state === ST_TITLE) {
            startGame();
            e.preventDefault();
            return;
        }
        if (state === ST_GAMEOVER) {
            startGame();
            e.preventDefault();
            return;
        }
        if (state === ST_PLAY) {
            if (e.key === 'ArrowUp' || e.key === 'w') { moveFrog(0); e.preventDefault(); }
            else if (e.key === 'ArrowRight' || e.key === 'd') { moveFrog(1); e.preventDefault(); }
            else if (e.key === 'ArrowDown' || e.key === 's') { moveFrog(2); e.preventDefault(); }
            else if (e.key === 'ArrowLeft' || e.key === 'a') { moveFrog(3); e.preventDefault(); }
        }
    }

    function onKeyUp(e) { keys[e.key] = false; }

    function onTouchStart(e) {
        if (!gameActive) return;
        e.preventDefault();
        if (state === ST_TITLE || state === ST_GAMEOVER) {
            startGame();
            return;
        }
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        touchStartX = touch.clientX - rect.left;
        touchStartY = touch.clientY - rect.top;
    }

    function onTouchMove(e) { e.preventDefault(); }

    function onTouchEnd(e) {
        if (!gameActive || state !== ST_PLAY) return;
        e.preventDefault();
        if (e.changedTouches.length === 0) return;
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const endX = touch.clientX - rect.left;
        const endY = touch.clientY - rect.top;
        const dx = endX - touchStartX;
        const dy = endY - touchStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 10) {
            // Tap: move up
            moveFrog(0);
            return;
        }
        if (Math.abs(dx) > Math.abs(dy)) {
            moveFrog(dx > 0 ? 1 : 3);
        } else {
            moveFrog(dy > 0 ? 2 : 0);
        }
    }

    function triggerGameOver() {
        if (!gameActive) return;
        const duration = Math.floor((Date.now() - startTime) / 1000);
        if (gameOverCB) {
            gameOverCB({ score, level, duration, lives });
        }
    }

    // ═══════════════════════════════════════════
    //  INIT / DESTROY
    // ═══════════════════════════════════════════
    function fitCanvas() {
        if (!canvas) return;
        let pw = canvas.width || 480;
        let ph = canvas.height || 560;
        const parent = canvas.parentElement;
        if (parent && parent.clientWidth > 50 && parent.clientHeight > 50) {
            pw = parent.clientWidth;
            ph = parent.clientHeight;
        }
        const aspect = GAME_W / GAME_H;
        let drawW, drawH;
        if (pw / ph > aspect) {
            drawH = ph; drawW = Math.floor(ph * aspect);
        } else {
            drawW = pw; drawH = Math.floor(pw / aspect);
        }
        drawW = Math.max(drawW, 320);
        drawH = Math.max(drawH, 400);
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = drawW * DPR;
        canvas.height = drawH * DPR;
        canvas.style.width = drawW + 'px';
        canvas.style.height = drawH + 'px';
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
        bgGradient = null;
    }

    function init(cvs, player, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = player;
        gameOverCB = onGameOver;
        gameActive = true;
        playerColor = player?.color || COL_FROG;

        // Theme colors
        const themeId = player?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            COL_FROG = _t.colors[0] || COL_FROG;
            COL_FROG_DARK = _t.colors[1] || COL_FROG_DARK;
            playerColor = _t.colors[0] || playerColor;
        }

        state = ST_TITLE;
        frameCount = 0;
        lastTime = 0;
        keys = {};
        particles = [];
        scorePopups = [];
        stars = null;
        titlePreview = null;
        waterOffset = 0;
        screenShake = 0;
        tireMarks = [];
        splashEffects = [];
        crocodiles = [];
        snakes = [];
        otters = [];

        W = canvas.width || 480;
        H = canvas.height || 560;
        SCALE = W / GAME_W;
        DPR = Math.min(window.devicePixelRatio || 1, 3);

        // Init level data for title screen demo
        level = 1;
        score = 0;
        lives = INITIAL_LIVES;
        timer = TIMER_MAX;
        nightMode = false;
        resetHomeSlots();
        buildLanes();
        resetFrog();

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
        if (audioCtx) {
            try { audioCtx.close(); } catch {}
            audioCtx = null;
        }
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        if (canvas) {
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        window.removeEventListener('resize', fitCanvas);
        keys = {};
        particles = [];
        lanes = [];
        crocodiles = [];
        snakes = [];
        otters = [];
        tireMarks = [];
        splashEffects = [];
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return level; },
        isActive() { return gameActive; },
    };
})();
