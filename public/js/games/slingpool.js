/* SlingPool — Turret Pool: Cannon meets Pool
 * Theme-aware canvas game for Your World Arcade
 * Aim a fixed turret at the bottom rail, set power, fire the cue ball into
 * a table full of bumpers, targets, and pockets. 10 levels, 3 shots each, star ratings. */
window.SlingPool = (() => {

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

    // ═══════════════════════════════════════════════════════════════
    //  CONSTANTS
    // ═══════════════════════════════════════════════════════════════
    const BASE_W = 640, BASE_H = 400;
    const RAIL_W = 18;                   // wooden rail thickness
    const POCKET_R = 16;                 // pocket radius
    const BALL_R = 8;                    // ball radius
    const CUE_R = 8;                     // cue ball radius
    const MAX_POWER = 120;               // max turret power
    const MIN_POWER = 8;                 // minimum power to fire
    const TRAJ_DOTS = 18;               // trajectory preview dots
    const POWER_CYCLE_SPEED = 0.04;      // power meter oscillation speed
    const FRICTION_FELT = 0.992;
    const FRICTION_ICE = 0.999;
    const FRICTION_SAND = 0.95;
    const COR_WALL = 0.8;               // coefficient of restitution: walls
    const COR_BUMPER = 1.3;             // bumpers give energy
    const COR_WINDMILL = 0.7;
    const SPEED_THRESHOLD = 0.15;        // balls stop below this
    const SHOTS_PER_LEVEL = 3;
    const TOTAL_LEVELS = 10;
    const POWER_SCALE = 0.12;            // pull distance -> velocity
    const SCREEN_SHAKE_POWER = 40;       // power that triggers shake
    const TURRET_BARREL_LEN = 28;        // cannon barrel length
    const TURRET_BARREL_W = 10;          // cannon barrel width
    const TURRET_BASE_W = 28;            // wooden base width
    const TURRET_BASE_H = 16;            // wooden base height

    // Ball colors (pool style)
    const BALL_COLORS = [
        '#F5D442', // 1 - yellow
        '#3366CC', // 2 - blue
        '#CC3333', // 3 - red
        '#6B2D8B', // 4 - purple
        '#FF6600', // 5 - orange
        '#006633', // 6 - green
        '#8B0000', // 7 - maroon
        '#1a1a1a', // 8 - black
        '#F5D442', // 9 - yellow stripe
        '#3366CC', // 10 - blue stripe
        '#CC3333', // 11 - red stripe
        '#6B2D8B', // 12 - purple stripe
        '#FF6600', // 13 - orange stripe
        '#006633', // 14 - green stripe
        '#8B0000', // 15 - maroon stripe
    ];

    // Game states
    const ST_TITLE    = 0;
    const ST_AIMING   = 1;
    const ST_ROLLING  = 2;
    const ST_SETTLED  = 3;
    const ST_LEVEL_COMPLETE = 4;
    const ST_GAME_OVER = 5;

    // Obstacle types
    const OBS_BUMPER   = 'bumper';
    const OBS_WINDMILL = 'windmill';
    const OBS_WALL_H   = 'wall_h';
    const OBS_WALL_V   = 'wall_v';
    const OBS_TUNNEL   = 'tunnel';
    const OBS_ICE      = 'ice';
    const OBS_SAND     = 'sand';

    // ═══════════════════════════════════════════════════════════════
    //  MODULE STATE
    // ═══════════════════════════════════════════════════════════════
    let canvas, ctx, SCALE, W, H;
    let state, gameActive;
    let animFrame = null;
    let audioCtx = null;
    let player = null;
    let onGameOver = null;

    // Theme
    let ACCENT1 = '#00CC66';
    let ACCENT2 = '#FFD700';
    let BG_CLR1 = '#0a1a0a';
    let BG_CLR2 = '#0d2810';
    let FELT_CLR = '#1a6b3a';
    let FELT_CLR2 = '#145a30';
    let RAIL_CLR = '#8B5A2B';
    let RAIL_LIGHT = '#A0744A';
    let CUSHION_CLR = '#2d8c52';

    // Game data
    let score, level, shotsLeft, ballsPotted, totalBallsPotted;
    let combo, comboTimer;
    let startTime;
    let cueBall;     // {x, y, vx, vy, active}
    let balls;       // [{x, y, vx, vy, num, color, active, potting, pottingTimer}]
    let pockets;     // [{x, y}]
    let obstacles;   // [{type, x, y, ...params}]
    let particles;
    let floatingTexts;
    let shakeTimer, shakeX, shakeY;
    let levelStars;  // stars earned per level
    let totalStars;

    // Turret aiming
    let turretAngle;            // angle turret is pointing (radians, 0 = right)
    let turretPower;            // current oscillating power (0..MAX_POWER)
    let powerDirection;         // 1 = rising, -1 = falling
    let turretLocked;           // true when player has clicked to lock aim
    let mouseX, mouseY;         // current mouse position in game coords
    let cueRestX, cueRestY;    // where cue ball / turret sits (bottom-center)

    // Sprites
    const sprites = {};
    let spritesLoaded = false;
    const SPRITE_BASE = '/img/game-assets/kenney-physics/';

    // Windmill state
    let windmillAngle = 0;

    // Moving wall state
    let wallPhase = 0;

    // Star display for level complete
    let starRevealTimer = 0;
    let starsToReveal = 0;

    // Level transition
    let levelTransTimer = 0;

    // Title animation
    let titleBounce = 0;

    // Bank shot tracking
    let cushionBounces = 0;

    // ═══════════════════════════════════════════════════════════════
    //  DPR / SCALING
    // ═══════════════════════════════════════════════════════════════
    function gs(v) { return v * SCALE; }
    function gx(v) { return v * SCALE; }
    function gy(v) { return v * SCALE; }

    function fitCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const parent = canvas.parentElement;
        const pw = parent ? parent.clientWidth : window.innerWidth;
        const ph = parent ? parent.clientHeight : window.innerHeight;
        const scaleX = pw / BASE_W;
        const scaleY = ph / BASE_H;
        SCALE = Math.min(scaleX, scaleY);
        W = BASE_W;
        H = BASE_H;
        canvas.width = Math.round(BASE_W * SCALE * dpr);
        canvas.height = Math.round(BASE_H * SCALE * dpr);
        canvas.style.width = Math.round(BASE_W * SCALE) + 'px';
        canvas.style.height = Math.round(BASE_H * SCALE) + 'px';
        ctx.setTransform(SCALE * dpr, 0, 0, SCALE * dpr, 0, 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  AUDIO SYNTHESIS
    // ═══════════════════════════════════════════════════════════════
    function getAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
        }
        return audioCtx;
    }

    function playSound(type, param) {
        const ac = getAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain);
            gain.connect(ac.destination);

            switch (type) {
                case 'pull':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(200 + (param || 0) * 3, t);
                    gain.gain.setValueAtTime(0.06, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
                    osc.start(t); osc.stop(t + 0.05);
                    break;
                case 'release': {
                    // Cannon boom: low thud + whoosh
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(150, t);
                    osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
                    gain.gain.setValueAtTime(0.18, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                    osc.start(t); osc.stop(t + 0.25);
                    // High whoosh overtone
                    const wh = ac.createOscillator();
                    const wg = ac.createGain();
                    wh.connect(wg); wg.connect(ac.destination);
                    wh.type = 'triangle';
                    wh.frequency.setValueAtTime(600, t);
                    wh.frequency.exponentialRampToValueAtTime(200, t + 0.12);
                    wg.gain.setValueAtTime(0.07, t);
                    wg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                    wh.start(t); wh.stop(t + 0.12);
                    break;
                }
                case 'click': {
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(800, t);
                    osc.frequency.exponentialRampToValueAtTime(400, t + 0.04);
                    gain.gain.setValueAtTime(0.1, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
                    osc.start(t); osc.stop(t + 0.06);
                    break;
                }
                case 'cushion': {
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(350, t);
                    osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
                    gain.gain.setValueAtTime(0.08, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                    osc.start(t); osc.stop(t + 0.08);
                    break;
                }
                case 'pot': {
                    // satisfying two-tone thud
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(250, t);
                    osc.frequency.exponentialRampToValueAtTime(80, t + 0.2);
                    gain.gain.setValueAtTime(0.18, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                    osc.start(t); osc.stop(t + 0.25);
                    // second harmonic
                    const o2 = ac.createOscillator();
                    const g2 = ac.createGain();
                    o2.connect(g2); g2.connect(ac.destination);
                    o2.type = 'sine';
                    o2.frequency.setValueAtTime(500, t);
                    o2.frequency.exponentialRampToValueAtTime(150, t + 0.15);
                    g2.gain.setValueAtTime(0.08, t);
                    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                    o2.start(t); o2.stop(t + 0.15);
                    break;
                }
                case 'bumper': {
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(1200, t);
                    osc.frequency.exponentialRampToValueAtTime(600, t + 0.06);
                    gain.gain.setValueAtTime(0.08, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                    osc.start(t); osc.stop(t + 0.08);
                    break;
                }
                case 'windmill': {
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(300, t);
                    osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
                    gain.gain.setValueAtTime(0.06, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                    osc.start(t); osc.stop(t + 0.1);
                    break;
                }
                case 'fanfare': {
                    // arpeggiated fanfare
                    const notes = [523, 659, 784, 1047];
                    notes.forEach((f, i) => {
                        const o = ac.createOscillator();
                        const g = ac.createGain();
                        o.connect(g); g.connect(ac.destination);
                        o.type = 'triangle';
                        o.frequency.setValueAtTime(f, t + i * 0.1);
                        g.gain.setValueAtTime(0.1, t + i * 0.1);
                        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.3);
                        o.start(t + i * 0.1);
                        o.stop(t + i * 0.1 + 0.3);
                    });
                    // don't need original osc
                    gain.gain.setValueAtTime(0, t);
                    osc.start(t); osc.stop(t + 0.01);
                    break;
                }
                case 'star': {
                    osc.type = 'sine';
                    const pitch = 600 + (param || 0) * 200;
                    osc.frequency.setValueAtTime(pitch, t);
                    osc.frequency.exponentialRampToValueAtTime(pitch * 1.5, t + 0.15);
                    gain.gain.setValueAtTime(0.1, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                    osc.start(t); osc.stop(t + 0.2);
                    break;
                }
                case 'levelup': {
                    const ns = [440, 554, 659, 880];
                    ns.forEach((f, i) => {
                        const o = ac.createOscillator();
                        const g = ac.createGain();
                        o.connect(g); g.connect(ac.destination);
                        o.type = 'sine';
                        o.frequency.setValueAtTime(f, t + i * 0.08);
                        g.gain.setValueAtTime(0.12, t + i * 0.08);
                        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.25);
                        o.start(t + i * 0.08);
                        o.stop(t + i * 0.08 + 0.25);
                    });
                    gain.gain.setValueAtTime(0, t);
                    osc.start(t); osc.stop(t + 0.01);
                    break;
                }
                default:
                    gain.gain.setValueAtTime(0, t);
                    osc.start(t); osc.stop(t + 0.01);
            }
        } catch {}
    }

    // ═══════════════════════════════════════════════════════════════
    //  SPRITE LOADING
    // ═══════════════════════════════════════════════════════════════
    function loadSprites() {
        const manifest = {
            wood_h:    'wood/elementWood011.png',    // horizontal plank
            wood_v:    'wood/elementWood019.png',    // vertical plank
            wood_sq:   'wood/elementWood013.png',    // square block
            metal_cir: 'metal/elementMetal000.png',  // circle
            metal_sq:  'metal/elementMetal012.png',  // square
            metal_bar: 'metal/elementMetal019.png',  // bar
            glass_cir: 'glass/elementGlass000.png',  // glass circle
            starGold:  'other/starGold.png',
            starSilver:'other/starSilver.png',
            starBronze:'other/starBronze.png',
            coinGold:  'other/coinGold.png',
            sand:      'other/sand.png',
            snow:      'other/snow.png',
            bg:        'backgrounds/colored_grass.png',
            debris1:   'debris/debrisWood_1.png',
            debris2:   'debris/debrisStone_1.png',
        };
        let loaded = 0;
        const total = Object.keys(manifest).length;
        for (const [key, path] of Object.entries(manifest)) {
            const img = new Image();
            img.onload = () => {
                loaded++;
                if (loaded >= total) spritesLoaded = true;
            };
            img.onerror = () => {
                loaded++;
                if (loaded >= total) spritesLoaded = true;
            };
            img.src = SPRITE_BASE + path;
            sprites[key] = img;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  POCKET POSITIONS (6 pockets)
    // ═══════════════════════════════════════════════════════════════
    function buildPockets() {
        const left = RAIL_W;
        const right = W - RAIL_W;
        const top = RAIL_W;
        const bottom = H - RAIL_W;
        const mx = W / 2;
        pockets = [
            { x: left,  y: top },
            { x: mx,    y: top - 2 },
            { x: right, y: top },
            { x: left,  y: bottom },
            { x: mx,    y: bottom + 2 },
            { x: right, y: bottom },
        ];
    }

    // ═══════════════════════════════════════════════════════════════
    //  LEVEL GENERATION
    // ═══════════════════════════════════════════════════════════════
    function generateLevel(lvl) {
        buildPockets();
        balls = [];
        obstacles = [];
        cushionBounces = 0;

        const tableL = RAIL_W + POCKET_R + 5;
        const tableR = W - RAIL_W - POCKET_R - 5;
        const tableT = RAIL_W + POCKET_R + 5;
        const tableB = H - RAIL_W - POCKET_R - 5;
        const midX = W / 2;
        const midY = H / 2;

        // Cue ball rest position (bottom-center, just above bottom rail)
        cueRestX = midX;
        cueRestY = tableB - 10;

        // Place target balls in a rough triangle in upper half of table
        const numBalls = Math.min(3 + lvl, 15);
        const startX = midX;
        const startY = midY - 40;
        const spacing = BALL_R * 2.5;

        let placed = 0;
        let row = 0;
        while (placed < numBalls) {
            const inRow = row + 1;
            for (let c = 0; c < inRow && placed < numBalls; c++) {
                const bx = startX + row * spacing * 0.866;
                const by = startY + (c - (inRow - 1) / 2) * spacing;
                balls.push({
                    x: bx, y: by,
                    vx: 0, vy: 0,
                    num: placed + 1,
                    color: BALL_COLORS[placed % BALL_COLORS.length],
                    stripe: placed >= 8,
                    active: true,
                    potting: false,
                    pottingTimer: 0,
                    pocketTarget: null,
                    flashTimer: 0,
                });
                placed++;
            }
            row++;
        }

        // Cue ball
        cueBall = {
            x: cueRestX, y: cueRestY,
            vx: 0, vy: 0,
            active: true,
        };

        // ── OBSTACLES based on level ──
        if (lvl >= 2) {
            // Bumpers
            const bumperCount = Math.min(1 + Math.floor(lvl / 2), 5);
            for (let i = 0; i < bumperCount; i++) {
                const angle = (i / bumperCount) * Math.PI * 2;
                const dist = 60 + (lvl > 5 ? 40 : 30);
                obstacles.push({
                    type: OBS_BUMPER,
                    x: midX + Math.cos(angle) * dist * (0.6 + Math.random() * 0.4),
                    y: midY + Math.sin(angle) * dist * (0.6 + Math.random() * 0.4),
                    r: 12 + Math.random() * 4,
                    flash: 0,
                });
            }
        }

        if (lvl >= 3) {
            // Windmill
            obstacles.push({
                type: OBS_WINDMILL,
                x: midX - 30,
                y: midY,
                armLen: 30 + lvl * 2,
                armW: 6,
                speed: 0.015 + lvl * 0.003,
            });
        }

        if (lvl >= 4) {
            // Moving wall
            const wallY = midY + (lvl % 2 === 0 ? -50 : 50);
            obstacles.push({
                type: OBS_WALL_H,
                x: midX + 20,
                y: wallY,
                w: 50 + lvl * 3,
                h: 6,
                moveRange: 40 + lvl * 3,
                speed: 0.02 + lvl * 0.003,
                baseX: midX + 20,
            });
        }

        if (lvl >= 5) {
            // Tunnel
            const tx = midX - 80;
            const ty = midY + 40;
            const ex = midX + 80;
            const ey = midY - 40;
            obstacles.push({
                type: OBS_TUNNEL,
                x1: tx, y1: ty,
                x2: ex, y2: ey,
                r: 14,
            });
        }

        if (lvl >= 6) {
            // Ice patch
            obstacles.push({
                type: OBS_ICE,
                x: midX - 40,
                y: tableT + 30,
                w: 70,
                h: 50,
            });
        }

        if (lvl >= 7) {
            // Sand trap
            obstacles.push({
                type: OBS_SAND,
                x: midX + 30,
                y: tableB - 70,
                w: 60,
                h: 45,
            });
        }

        if (lvl >= 8) {
            // Extra bumpers near pockets
            pockets.forEach((p, i) => {
                if (i % 2 === 0) {
                    const ox = p.x + (p.x < midX ? 30 : -30);
                    const oy = p.y + (p.y < midY ? 25 : -25);
                    obstacles.push({
                        type: OBS_BUMPER,
                        x: ox, y: oy,
                        r: 10,
                        flash: 0,
                    });
                }
            });
        }

        if (lvl >= 9) {
            // Extra windmill
            obstacles.push({
                type: OBS_WINDMILL,
                x: midX + 60,
                y: midY - 30,
                armLen: 25,
                armW: 5,
                speed: -0.02,
            });
            // Extra moving wall vertical
            obstacles.push({
                type: OBS_WALL_V,
                x: midX - 50,
                y: midY,
                w: 6,
                h: 45,
                moveRange: 35,
                speed: 0.025,
                baseY: midY,
            });
        }

        if (lvl >= 10) {
            // Second tunnel
            obstacles.push({
                type: OBS_TUNNEL,
                x1: tableL + 40, y1: midY - 50,
                x2: tableR - 40, y2: midY + 50,
                r: 12,
            });
            // More sand
            obstacles.push({
                type: OBS_SAND,
                x: tableL + 30,
                y: midY + 20,
                w: 45,
                h: 35,
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  PHYSICS
    // ═══════════════════════════════════════════════════════════════
    function dist(x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function ballSpeed(b) {
        return Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    }

    function getFrictionAt(x, y) {
        for (const obs of obstacles) {
            if (obs.type === OBS_ICE) {
                if (x >= obs.x && x <= obs.x + obs.w && y >= obs.y && y <= obs.y + obs.h) {
                    return FRICTION_ICE;
                }
            }
            if (obs.type === OBS_SAND) {
                if (x >= obs.x && x <= obs.x + obs.w && y >= obs.y && y <= obs.y + obs.h) {
                    return FRICTION_SAND;
                }
            }
        }
        return FRICTION_FELT;
    }

    function wallBounce(b) {
        const L = RAIL_W + CUE_R;
        const R = W - RAIL_W - CUE_R;
        const T = RAIL_W + CUE_R;
        const B = H - RAIL_W - CUE_R;

        let bounced = false;
        if (b.x < L) { b.x = L; b.vx = Math.abs(b.vx) * COR_WALL; bounced = true; }
        if (b.x > R) { b.x = R; b.vx = -Math.abs(b.vx) * COR_WALL; bounced = true; }
        if (b.y < T) { b.y = T; b.vy = Math.abs(b.vy) * COR_WALL; bounced = true; }
        if (b.y > B) { b.y = B; b.vy = -Math.abs(b.vy) * COR_WALL; bounced = true; }

        if (bounced) {
            playSound('cushion');
            cushionBounces++;
        }
        return bounced;
    }

    function ballCollision(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const minDist = BALL_R * 2;

        if (d < minDist && d > 0.01) {
            // Normalize
            const nx = dx / d;
            const ny = dy / d;

            // Relative velocity
            const dvx = a.vx - b.vx;
            const dvy = a.vy - b.vy;
            const dvn = dvx * nx + dvy * ny;

            if (dvn > 0) {
                // Equal mass elastic collision
                a.vx -= dvn * nx;
                a.vy -= dvn * ny;
                b.vx += dvn * nx;
                b.vy += dvn * ny;

                // Separate
                const overlap = minDist - d;
                a.x -= nx * overlap / 2;
                a.y -= ny * overlap / 2;
                b.x += nx * overlap / 2;
                b.y += ny * overlap / 2;

                playSound('click');
                spawnParticles(
                    (a.x + b.x) / 2, (a.y + b.y) / 2,
                    4, '#fff', 1.5
                );
                return true;
            }
        }
        return false;
    }

    function bumperCollision(ball, bumper) {
        const dx = ball.x - bumper.x;
        const dy = ball.y - bumper.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const minDist = BALL_R + bumper.r;

        if (d < minDist && d > 0.01) {
            const nx = dx / d;
            const ny = dy / d;
            const speed = ballSpeed(ball);

            // Reflect and boost
            const dot = ball.vx * nx + ball.vy * ny;
            ball.vx -= 2 * dot * nx;
            ball.vy -= 2 * dot * ny;

            // Apply COR > 1 (energy boost)
            const newSpeed = ballSpeed(ball);
            if (newSpeed > 0.01) {
                const factor = (speed * COR_BUMPER) / newSpeed;
                ball.vx *= factor;
                ball.vy *= factor;
            }

            // Separate
            ball.x = bumper.x + nx * minDist;
            ball.y = bumper.y + ny * minDist;

            bumper.flash = 8;
            playSound('bumper');
            spawnParticles(bumper.x, bumper.y, 6, '#ffff00', 2);
            score += 10;
            addFloatingText(bumper.x, bumper.y - 15, '+10', '#ffff00');
            return true;
        }
        return false;
    }

    function windmillCollision(ball, wm) {
        // Two arms: current angle and angle + PI
        const angles = [windmillAngle, windmillAngle + Math.PI];
        for (const angle of angles) {
            // Arm as a line segment from center
            const ax = wm.x;
            const ay = wm.y;
            const bx = wm.x + Math.cos(angle) * wm.armLen;
            const by = wm.y + Math.sin(angle) * wm.armLen;

            // Point-to-segment distance
            const abx = bx - ax, aby = by - ay;
            const apx = ball.x - ax, apy = ball.y - ay;
            const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby)));
            const closestX = ax + t * abx;
            const closestY = ay + t * aby;
            const dx = ball.x - closestX;
            const dy = ball.y - closestY;
            const d = Math.sqrt(dx * dx + dy * dy);
            const minDist = BALL_R + wm.armW / 2;

            if (d < minDist && d > 0.01) {
                const nx = dx / d;
                const ny = dy / d;
                const dot = ball.vx * nx + ball.vy * ny;
                ball.vx -= 2 * dot * nx * COR_WINDMILL;
                ball.vy -= 2 * dot * ny * COR_WINDMILL;

                // Add spin influence
                const tangentX = -Math.sin(angle) * wm.speed * wm.armLen * 0.5;
                const tangentY = Math.cos(angle) * wm.speed * wm.armLen * 0.5;
                ball.vx += tangentX;
                ball.vy += tangentY;

                // Separate
                ball.x = closestX + nx * minDist;
                ball.y = closestY + ny * minDist;

                playSound('windmill');
                return true;
            }
        }
        return false;
    }

    function movingWallCollision(ball, wall) {
        let wx, wy, ww, wh;
        if (wall.type === OBS_WALL_H) {
            wx = wall.x - wall.w / 2;
            wy = wall.y - wall.h / 2;
            ww = wall.w;
            wh = wall.h;
        } else {
            wx = wall.x - wall.w / 2;
            wy = wall.y - wall.h / 2;
            ww = wall.w;
            wh = wall.h;
        }

        // AABB check
        const closestX = Math.max(wx, Math.min(ball.x, wx + ww));
        const closestY = Math.max(wy, Math.min(ball.y, wy + wh));
        const dx = ball.x - closestX;
        const dy = ball.y - closestY;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d < BALL_R && d > 0.001) {
            const nx = dx / d;
            const ny = dy / d;
            const dot = ball.vx * nx + ball.vy * ny;
            ball.vx -= 2 * dot * nx * COR_WALL;
            ball.vy -= 2 * dot * ny * COR_WALL;
            ball.x = closestX + nx * BALL_R;
            ball.y = closestY + ny * BALL_R;
            playSound('cushion');
            return true;
        }
        return false;
    }

    function tunnelCheck(ball, tunnel) {
        // Entry portal
        const d1 = dist(ball.x, ball.y, tunnel.x1, tunnel.y1);
        if (d1 < tunnel.r) {
            ball.x = tunnel.x2;
            ball.y = tunnel.y2;
            // Keep velocity, slight boost
            const s = ballSpeed(ball);
            if (s > 0) {
                ball.vx *= 1.1;
                ball.vy *= 1.1;
            }
            spawnParticles(tunnel.x1, tunnel.y1, 8, '#00ffff', 2);
            spawnParticles(tunnel.x2, tunnel.y2, 8, '#00ffff', 2);
            playSound('bumper');
            return true;
        }
        // Exit portal works as entry too
        const d2 = dist(ball.x, ball.y, tunnel.x2, tunnel.y2);
        if (d2 < tunnel.r) {
            ball.x = tunnel.x1;
            ball.y = tunnel.y1;
            ball.vx *= 1.1;
            ball.vy *= 1.1;
            spawnParticles(tunnel.x2, tunnel.y2, 8, '#00ffff', 2);
            spawnParticles(tunnel.x1, tunnel.y1, 8, '#00ffff', 2);
            playSound('bumper');
            return true;
        }
        return false;
    }

    function checkPockets(ball) {
        if (ball.potting) return false;
        for (const pocket of pockets) {
            const d = dist(ball.x, ball.y, pocket.x, pocket.y);
            if (d < POCKET_R) {
                ball.potting = true;
                ball.pottingTimer = 20;
                ball.pocketTarget = { x: pocket.x, y: pocket.y };
                return true;
            }
        }
        return false;
    }

    function updatePhysics() {
        // Update windmill angle
        for (const obs of obstacles) {
            if (obs.type === OBS_WINDMILL) {
                windmillAngle += obs.speed;
            }
        }

        // Update moving walls
        wallPhase += 0.016;
        for (const obs of obstacles) {
            if (obs.type === OBS_WALL_H) {
                obs.x = obs.baseX + Math.sin(wallPhase * obs.speed * 60) * obs.moveRange;
            }
            if (obs.type === OBS_WALL_V) {
                obs.y = obs.baseY + Math.sin(wallPhase * obs.speed * 60) * obs.moveRange;
            }
        }

        // Update all active balls (cue + targets)
        const allBalls = [cueBall, ...balls.filter(b => b.active && !b.potting)];

        for (const b of allBalls) {
            if (!b.active) continue;

            if (b.potting) continue;

            // Apply friction
            const fric = getFrictionAt(b.x, b.y);
            b.vx *= fric;
            b.vy *= fric;

            // Move
            b.x += b.vx;
            b.y += b.vy;

            // Stop if slow enough
            if (ballSpeed(b) < SPEED_THRESHOLD) {
                b.vx = 0;
                b.vy = 0;
            }

            // Wall bounce
            wallBounce(b);

            // Obstacle collisions
            for (const obs of obstacles) {
                if (obs.type === OBS_BUMPER) {
                    bumperCollision(b, obs);
                } else if (obs.type === OBS_WINDMILL) {
                    windmillCollision(b, obs);
                } else if (obs.type === OBS_WALL_H || obs.type === OBS_WALL_V) {
                    movingWallCollision(b, obs);
                } else if (obs.type === OBS_TUNNEL) {
                    tunnelCheck(b, obs);
                }
            }
        }

        // Ball-to-ball collisions
        const active = [cueBall, ...balls.filter(b => b.active && !b.potting)];
        for (let i = 0; i < active.length; i++) {
            for (let j = i + 1; j < active.length; j++) {
                if (active[i].active && active[j].active) {
                    ballCollision(active[i], active[j]);
                }
            }
        }

        // Check pockets for target balls
        let pottedThisFrame = 0;
        for (const b of balls) {
            if (!b.active || b.potting) continue;
            if (checkPockets(b)) {
                pottedThisFrame++;
            }
        }

        // Check cue ball in pocket (foul - reset cue)
        if (cueBall.active && !cueBall.potting) {
            for (const pocket of pockets) {
                if (dist(cueBall.x, cueBall.y, pocket.x, pocket.y) < POCKET_R) {
                    cueBall.potting = true;
                    cueBall.pottingTimer = 20;
                    cueBall.pocketTarget = { x: pocket.x, y: pocket.y };
                    addFloatingText(cueBall.x, cueBall.y - 20, 'SCRATCH!', '#ff4444');
                    playSound('cushion');
                }
            }
        }

        // Update potting animations
        for (const b of balls) {
            if (b.potting && b.active) {
                b.pottingTimer--;
                // Swirl toward pocket
                b.x += (b.pocketTarget.x - b.x) * 0.2;
                b.y += (b.pocketTarget.y - b.y) * 0.2;
                b.vx *= 0.7;
                b.vy *= 0.7;

                if (b.pottingTimer <= 0) {
                    b.active = false;
                    b.potting = false;
                    ballsPotted++;
                    totalBallsPotted++;

                    // Scoring
                    let pts = 100;
                    let label = '+100';
                    let bonusColor = ACCENT2;

                    // Bank shot bonus
                    if (cushionBounces >= 1) {
                        pts *= 2;
                        label = 'BANK SHOT! +' + pts;
                        bonusColor = '#ff44ff';
                        addFloatingText(W / 2, H / 2 - 30, 'BANK SHOT!', '#ff44ff', true);
                        playSound('fanfare');
                    }

                    // Combo
                    combo++;
                    comboTimer = 90;
                    if (combo > 1) {
                        pts *= combo;
                        label = 'x' + combo + ' COMBO! +' + pts;
                        bonusColor = '#00ffff';
                    }

                    score += pts;
                    addFloatingText(b.pocketTarget.x, b.pocketTarget.y - 25, label, bonusColor);
                    playSound('pot');
                    spawnParticles(b.pocketTarget.x, b.pocketTarget.y, 12, b.color, 3);
                }
            }
        }

        // Cue ball potting (scratch) - reset to turret position
        if (cueBall.potting) {
            cueBall.pottingTimer--;
            cueBall.x += (cueBall.pocketTarget.x - cueBall.x) * 0.2;
            cueBall.y += (cueBall.pocketTarget.y - cueBall.y) * 0.2;
            if (cueBall.pottingTimer <= 0) {
                cueBall.potting = false;
                cueBall.x = cueRestX;
                cueBall.y = cueRestY;
                cueBall.vx = 0;
                cueBall.vy = 0;
                turretLocked = false;
                turretPower = 0;
            }
        }

        // Combo decay
        if (comboTimer > 0) {
            comboTimer--;
            if (comboTimer <= 0) combo = 0;
        }

        // Check if all balls settled
        if (state === ST_ROLLING) {
            let allStopped = true;
            if (ballSpeed(cueBall) > SPEED_THRESHOLD || cueBall.potting) allStopped = false;
            for (const b of balls) {
                if (b.active && (ballSpeed(b) > SPEED_THRESHOLD || b.potting)) {
                    allStopped = false;
                    break;
                }
            }
            if (allStopped) {
                onShotSettled();
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  SHOT LOGIC
    // ═══════════════════════════════════════════════════════════════
    function fireShot(power, angle) {
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        cueBall.vx = dirX * power * POWER_SCALE;
        cueBall.vy = dirY * power * POWER_SCALE;
        state = ST_ROLLING;
        cushionBounces = 0;
        combo = 0;
        comboTimer = 0;
        shotsLeft--;
        turretLocked = false;

        if (power > SCREEN_SHAKE_POWER) {
            triggerShake(3 + power / 30);
        }
        // Cannon fire sound
        playSound('release');
        spawnParticles(
            cueRestX + Math.cos(angle) * TURRET_BARREL_LEN,
            cueRestY + Math.sin(angle) * TURRET_BARREL_LEN,
            10, '#ffaa00', 3
        );
    }

    function onShotSettled() {
        // Check if level cleared (all balls potted)
        const remaining = balls.filter(b => b.active).length;

        if (remaining === 0) {
            // Level complete!
            state = ST_LEVEL_COMPLETE;
            const total = balls.length;
            starsToReveal = ballsPotted >= total ? 3 : (ballsPotted >= total * 0.6 ? 2 : 1);
            starRevealTimer = 0;
            levelStars[level - 1] = starsToReveal;
            totalStars = levelStars.reduce((a, b) => a + b, 0);
            playSound('levelup');
            return;
        }

        if (shotsLeft <= 0) {
            // Out of shots
            state = ST_LEVEL_COMPLETE;
            const total = balls.length;
            starsToReveal = ballsPotted >= total ? 3 : (ballsPotted >= total * 0.5 ? 2 : (ballsPotted > 0 ? 1 : 0));
            levelStars[level - 1] = starsToReveal;
            totalStars = levelStars.reduce((a, b) => a + b, 0);
            if (starsToReveal > 0) {
                playSound('levelup');
            }
            starRevealTimer = 0;
            return;
        }

        // More shots available - reset cue and turret
        state = ST_AIMING;
        cueBall.x = cueRestX;
        cueBall.y = cueRestY;
        cueBall.vx = 0;
        cueBall.vy = 0;
        turretLocked = false;
        turretPower = 0;
        powerDirection = 1;
    }

    function nextLevel() {
        if (level >= TOTAL_LEVELS) {
            // Game over!
            state = ST_GAME_OVER;
            playSound('fanfare');
            return;
        }
        level++;
        shotsLeft = SHOTS_PER_LEVEL;
        ballsPotted = 0;
        generateLevel(level);
        state = ST_AIMING;
        levelTransTimer = 60;
        turretLocked = false;
        turretPower = 0;
        powerDirection = 1;
        turretAngle = -Math.PI / 2;
        playSound('star', 1);
    }

    function startGame() {
        score = 0;
        level = 1;
        shotsLeft = SHOTS_PER_LEVEL;
        ballsPotted = 0;
        totalBallsPotted = 0;
        combo = 0;
        comboTimer = 0;
        startTime = Date.now();
        levelStars = new Array(TOTAL_LEVELS).fill(0);
        totalStars = 0;
        particles = [];
        floatingTexts = [];
        shakeTimer = 0;
        shakeX = 0;
        shakeY = 0;
        windmillAngle = 0;
        wallPhase = 0;
        levelTransTimer = 60;
        turretAngle = -Math.PI / 2;  // default: aim straight up
        turretPower = 0;
        powerDirection = 1;
        turretLocked = false;
        mouseX = BASE_W / 2;
        mouseY = BASE_H / 2;

        generateLevel(level);
        state = ST_AIMING;
        gameActive = true;
    }

    // ═══════════════════════════════════════════════════════════════
    //  PARTICLES & EFFECTS
    // ═══════════════════════════════════════════════════════════════
    function spawnParticles(x, y, count, color, speed) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = (0.5 + Math.random()) * (speed || 2);
            particles.push({
                x, y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                life: 1,
                decay: 0.015 + Math.random() * 0.02,
                color: color || '#fff',
                size: 2 + Math.random() * 3,
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.96;
            p.vy *= 0.96;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function addFloatingText(x, y, text, color, big) {
        floatingTexts.push({
            x, y,
            text,
            color: color || '#fff',
            life: 1,
            decay: 0.012,
            vy: -1,
            big: big || false,
        });
    }

    function updateFloatingTexts() {
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            const t = floatingTexts[i];
            t.y += t.vy;
            t.vy *= 0.98;
            t.life -= t.decay;
            if (t.life <= 0) floatingTexts.splice(i, 1);
        }
    }

    function triggerShake(amount) {
        shakeTimer = 8;
        shakeX = (Math.random() - 0.5) * amount;
        shakeY = (Math.random() - 0.5) * amount;
    }

    function updateShake() {
        if (shakeTimer > 0) {
            shakeTimer--;
            shakeX = (Math.random() - 0.5) * shakeTimer;
            shakeY = (Math.random() - 0.5) * shakeTimer;
        } else {
            shakeX = 0;
            shakeY = 0;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  TRAJECTORY PREVIEW
    // ═══════════════════════════════════════════════════════════════
    function computeTrajectory(startX, startY, vx, vy, numDots) {
        const dots = [];
        let x = startX, y = startY;
        let dvx = vx * 0.4, dvy = vy * 0.4; // Reduced for preview
        const L = RAIL_W + CUE_R;
        const R = W - RAIL_W - CUE_R;
        const T = RAIL_W + CUE_R;
        const B = H - RAIL_W - CUE_R;

        for (let i = 0; i < numDots; i++) {
            x += dvx;
            y += dvy;

            // Wall reflection
            if (x < L) { x = L; dvx = Math.abs(dvx); }
            if (x > R) { x = R; dvx = -Math.abs(dvx); }
            if (y < T) { y = T; dvy = Math.abs(dvy); }
            if (y > B) { y = B; dvy = -Math.abs(dvy); }

            dvx *= 0.98;
            dvy *= 0.98;
            dots.push({ x, y });
        }
        return dots;
    }

    // ═══════════════════════════════════════════════════════════════
    //  DRAWING
    // ═══════════════════════════════════════════════════════════════
    function drawBackground() {
        // Dark BG behind table
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, BG_CLR1);
        grad.addColorStop(1, BG_CLR2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    function drawTable() {
        // Wooden outer rail
        ctx.fillStyle = RAIL_CLR;
        ctx.fillRect(0, 0, W, H);

        // Rail highlights
        ctx.fillStyle = RAIL_LIGHT;
        ctx.fillRect(2, 2, W - 4, 4);      // top edge
        ctx.fillRect(2, 2, 4, H - 4);      // left edge

        // Felt surface
        const feltGrad = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.6);
        feltGrad.addColorStop(0, FELT_CLR);
        feltGrad.addColorStop(1, FELT_CLR2);
        ctx.fillStyle = feltGrad;
        ctx.fillRect(RAIL_W, RAIL_W, W - RAIL_W * 2, H - RAIL_W * 2);

        // Felt texture lines (subtle)
        ctx.strokeStyle = 'rgba(255,255,255,0.015)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < W; i += 8) {
            ctx.beginPath();
            ctx.moveTo(i, RAIL_W);
            ctx.lineTo(i, H - RAIL_W);
            ctx.stroke();
        }

        // Cushion (inner rail edge)
        ctx.strokeStyle = CUSHION_CLR;
        ctx.lineWidth = 3;
        ctx.strokeRect(RAIL_W + 1, RAIL_W + 1, W - RAIL_W * 2 - 2, H - RAIL_W * 2 - 2);

        // Draw pockets
        for (const p of pockets) {
            // Pocket shadow
            ctx.beginPath();
            ctx.arc(p.x + 1, p.y + 1, POCKET_R + 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fill();

            // Pocket
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R, 0, Math.PI * 2);
            ctx.fillStyle = '#0a0a0a';
            ctx.fill();

            // Inner rim
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R - 2, 0, Math.PI * 2);
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Center spot
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();

        // Head string (horizontal line above turret zone)
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(RAIL_W, cueRestY - 20);
        ctx.lineTo(W - RAIL_W, cueRestY - 20);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function drawObstacles() {
        for (const obs of obstacles) {
            switch (obs.type) {
                case OBS_BUMPER:
                    drawBumper(obs);
                    break;
                case OBS_WINDMILL:
                    drawWindmill(obs);
                    break;
                case OBS_WALL_H:
                case OBS_WALL_V:
                    drawMovingWall(obs);
                    break;
                case OBS_TUNNEL:
                    drawTunnel(obs);
                    break;
                case OBS_ICE:
                    drawIcePatch(obs);
                    break;
                case OBS_SAND:
                    drawSandPatch(obs);
                    break;
            }
        }
    }

    function drawBumper(b) {
        // Glow when flashed
        if (b.flash > 0) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r + 6, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 0, ${b.flash / 12})`;
            ctx.fill();
            b.flash--;
        }

        // Chrome bumper
        const grad = ctx.createRadialGradient(
            b.x - b.r * 0.3, b.y - b.r * 0.3, 1,
            b.x, b.y, b.r
        );
        grad.addColorStop(0, '#f0f0f0');
        grad.addColorStop(0.4, '#c0c0c0');
        grad.addColorStop(0.8, '#808080');
        grad.addColorStop(1, '#555');

        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Shine
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();
    }

    function drawWindmill(wm) {
        // Hub
        ctx.beginPath();
        ctx.arc(wm.x, wm.y, 6, 0, Math.PI * 2);
        const hubGrad = ctx.createRadialGradient(wm.x - 2, wm.y - 2, 1, wm.x, wm.y, 6);
        hubGrad.addColorStop(0, '#e0e0e0');
        hubGrad.addColorStop(1, '#666');
        ctx.fillStyle = hubGrad;
        ctx.fill();
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Arms
        ctx.save();
        ctx.translate(wm.x, wm.y);
        ctx.rotate(windmillAngle);

        for (let i = 0; i < 2; i++) {
            ctx.save();
            ctx.rotate(i * Math.PI);

            // Arm body
            const armGrad = ctx.createLinearGradient(0, -wm.armW / 2, 0, wm.armW / 2);
            armGrad.addColorStop(0, '#cc6600');
            armGrad.addColorStop(0.5, '#aa4400');
            armGrad.addColorStop(1, '#883300');
            ctx.fillStyle = armGrad;
            ctx.fillRect(0, -wm.armW / 2, wm.armLen, wm.armW);

            // Arm stripe
            ctx.fillStyle = 'rgba(255,200,0,0.3)';
            ctx.fillRect(4, -1, wm.armLen - 8, 2);

            ctx.restore();
        }
        ctx.restore();
    }

    function drawMovingWall(wall) {
        let x, y, w, h;
        if (wall.type === OBS_WALL_H) {
            x = wall.x - wall.w / 2;
            y = wall.y - wall.h / 2;
            w = wall.w;
            h = wall.h;
        } else {
            x = wall.x - wall.w / 2;
            y = wall.y - wall.h / 2;
            w = wall.w;
            h = wall.h;
        }

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + 2, y + 2, w, h);

        // Wall body
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, '#b8860b');
        grad.addColorStop(0.5, '#daa520');
        grad.addColorStop(1, '#b8860b');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, h);

        // Edge highlights
        ctx.strokeStyle = '#f0c040';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, w, h);

        // Movement arrows
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        const arrowSize = 3;
        if (wall.type === OBS_WALL_H) {
            // horizontal arrows
            drawArrow(x - 6, y + h / 2, -1, 0, arrowSize);
            drawArrow(x + w + 6, y + h / 2, 1, 0, arrowSize);
        } else {
            drawArrow(x + w / 2, y - 6, 0, -1, arrowSize);
            drawArrow(x + w / 2, y + h + 6, 0, 1, arrowSize);
        }
    }

    function drawArrow(x, y, dx, dy, size) {
        ctx.beginPath();
        ctx.moveTo(x + dx * size, y + dy * size);
        ctx.lineTo(x - dy * size * 0.6, y + dx * size * 0.6);
        ctx.lineTo(x + dy * size * 0.6, y - dx * size * 0.6);
        ctx.closePath();
        ctx.fill();
    }

    function drawTunnel(tun) {
        // Entry portal
        drawPortal(tun.x1, tun.y1, tun.r, '#00ccff');
        // Exit portal
        drawPortal(tun.x2, tun.y2, tun.r, '#ff66cc');

        // Connecting dashed line
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tun.x1, tun.y1);
        ctx.lineTo(tun.x2, tun.y2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function drawPortal(x, y, r, color) {
        // Glow
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba');
        ctx.fill();

        // Spiral animation
        const time = Date.now() / 800;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a1a';
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.3) {
            const rr = r * (1 - a / (Math.PI * 4));
            const px = x + Math.cos(a + time) * rr;
            const py = y + Math.sin(a + time) * rr;
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function drawIcePatch(ice) {
        ctx.fillStyle = 'rgba(180, 220, 255, 0.25)';
        ctx.beginPath();
        ctx.roundRect(ice.x, ice.y, ice.w, ice.h, [6]);
        ctx.fill();

        // Ice shimmer
        ctx.strokeStyle = 'rgba(200, 240, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(ice.x, ice.y, ice.w, ice.h, [6]);
        ctx.stroke();

        // Snowflake icon
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('\u2744', ice.x + ice.w / 2, ice.y + ice.h / 2 + 4);
    }

    function drawSandPatch(sand) {
        ctx.fillStyle = 'rgba(194, 178, 128, 0.35)';
        ctx.beginPath();
        ctx.roundRect(sand.x, sand.y, sand.w, sand.h, [6]);
        ctx.fill();

        // Dots for texture
        ctx.fillStyle = 'rgba(160, 140, 100, 0.4)';
        for (let i = 0; i < 8; i++) {
            const dx = sand.x + 5 + (i % 4) * (sand.w - 10) / 3;
            const dy = sand.y + 5 + Math.floor(i / 4) * (sand.h - 10);
            ctx.beginPath();
            ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Sand icon
        ctx.fillStyle = 'rgba(200, 180, 120, 0.4)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('\u23f3', sand.x + sand.w / 2, sand.y + sand.h / 2 + 3);
    }

    function drawBall(b) {
        if (!b.active) return;

        const alpha = b.potting ? Math.max(0, b.pottingTimer / 20) : 1;
        const r = b.potting ? BALL_R * (b.pottingTimer / 20) : BALL_R;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Shadow
        ctx.beginPath();
        ctx.arc(b.x + 1.5, b.y + 1.5, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fill();

        // Main ball
        const grad = ctx.createRadialGradient(
            b.x - r * 0.3, b.y - r * 0.3, r * 0.1,
            b.x, b.y, r
        );
        grad.addColorStop(0, lightenColor(b.color, 60));
        grad.addColorStop(0.5, b.color);
        grad.addColorStop(1, darkenColor(b.color, 40));

        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Stripe
        if (b.stripe) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = '#fff';
            ctx.fillRect(b.x - r, b.y - 2.5, r * 2, 5);
            ctx.restore();
        }

        // Number circle
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        // Number text
        ctx.fillStyle = '#111';
        ctx.font = `bold ${Math.round(r * 0.8)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.num.toString(), b.x, b.y + 0.5);

        // Shine
        ctx.beginPath();
        ctx.arc(b.x - r * 0.25, b.y - r * 0.3, r * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fill();

        ctx.restore();

        // Flash effect
        if (b.flashTimer > 0) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, r + 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${b.flashTimer / 10})`;
            ctx.fill();
            b.flashTimer--;
        }
    }

    function drawCueBall() {
        if (!cueBall.active && !cueBall.potting) return;

        // During aiming, show the cue ball at the muzzle of the turret
        let drawX = cueBall.x;
        let drawY = cueBall.y;
        if (state === ST_AIMING && !cueBall.potting) {
            drawX = cueRestX + Math.cos(turretAngle) * (TURRET_BARREL_LEN + CUE_R + 2);
            drawY = cueRestY + Math.sin(turretAngle) * (TURRET_BARREL_LEN + CUE_R + 2);
        }

        const alpha = cueBall.potting ? Math.max(0, cueBall.pottingTimer / 20) : 1;
        const r = cueBall.potting ? CUE_R * (cueBall.pottingTimer / 20) : CUE_R;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Shadow
        ctx.beginPath();
        ctx.arc(drawX + 1.5, drawY + 1.5, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fill();

        // Main ball
        const grad = ctx.createRadialGradient(
            drawX - r * 0.3, drawY - r * 0.3, r * 0.1,
            drawX, drawY, r
        );
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.6, '#e8e8e8');
        grad.addColorStop(1, '#b0b0b0');

        ctx.beginPath();
        ctx.arc(drawX, drawY, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Shine
        ctx.beginPath();
        ctx.arc(drawX - r * 0.25, drawY - r * 0.3, r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();

        ctx.restore();
    }

    function drawTurret() {
        if (state !== ST_AIMING) return;

        const tx = cueRestX;
        const ty = cueRestY;

        // ── Wooden base ──
        const baseX = tx - TURRET_BASE_W / 2;
        const baseY = ty - TURRET_BASE_H / 4;
        const baseGrad = ctx.createLinearGradient(baseX, baseY, baseX, baseY + TURRET_BASE_H);
        baseGrad.addColorStop(0, '#c4903a');
        baseGrad.addColorStop(0.3, '#a07030');
        baseGrad.addColorStop(0.7, '#7a5020');
        baseGrad.addColorStop(1, '#5a3818');
        ctx.fillStyle = baseGrad;
        ctx.beginPath();
        ctx.roundRect(baseX, baseY, TURRET_BASE_W, TURRET_BASE_H, [3, 3, 0, 0]);
        ctx.fill();
        // Wood grain lines
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < 3; i++) {
            const gy = baseY + 3 + i * 4;
            ctx.beginPath();
            ctx.moveTo(baseX + 2, gy);
            ctx.lineTo(baseX + TURRET_BASE_W - 2, gy);
            ctx.stroke();
        }
        // Base edge highlight
        ctx.strokeStyle = 'rgba(255,220,150,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(baseX + 1, baseY);
        ctx.lineTo(baseX + TURRET_BASE_W - 1, baseY);
        ctx.stroke();

        // ── Metal barrel ──
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(turretAngle);

        // Barrel shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(2, -TURRET_BARREL_W / 2 + 2, TURRET_BARREL_LEN, TURRET_BARREL_W);

        // Barrel body (metal gradient)
        const barrelGrad = ctx.createLinearGradient(0, -TURRET_BARREL_W / 2, 0, TURRET_BARREL_W / 2);
        barrelGrad.addColorStop(0, '#c0c0c0');
        barrelGrad.addColorStop(0.2, '#e0e0e0');
        barrelGrad.addColorStop(0.5, '#a8a8a8');
        barrelGrad.addColorStop(0.8, '#888');
        barrelGrad.addColorStop(1, '#666');
        ctx.fillStyle = barrelGrad;
        ctx.fillRect(0, -TURRET_BARREL_W / 2, TURRET_BARREL_LEN, TURRET_BARREL_W);

        // Barrel outline
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, -TURRET_BARREL_W / 2, TURRET_BARREL_LEN, TURRET_BARREL_W);

        // Barrel muzzle ring
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(TURRET_BARREL_LEN - 1, -TURRET_BARREL_W / 2 - 1);
        ctx.lineTo(TURRET_BARREL_LEN - 1, TURRET_BARREL_W / 2 + 1);
        ctx.stroke();

        // Barrel rivet dots
        ctx.fillStyle = '#999';
        for (let i = 0; i < 3; i++) {
            const rx = 5 + i * 8;
            ctx.beginPath();
            ctx.arc(rx, -TURRET_BARREL_W / 2 + 1.5, 1.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(rx, TURRET_BARREL_W / 2 - 1.5, 1.2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Barrel shine strip
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(2, -TURRET_BARREL_W / 2 + 1, TURRET_BARREL_LEN - 4, 2);

        ctx.restore();

        // ── Turret pivot hub ──
        const hubGrad = ctx.createRadialGradient(tx - 2, ty - 2, 1, tx, ty, 7);
        hubGrad.addColorStop(0, '#e0e0e0');
        hubGrad.addColorStop(0.6, '#999');
        hubGrad.addColorStop(1, '#555');
        ctx.beginPath();
        ctx.arc(tx, ty, 7, 0, Math.PI * 2);
        ctx.fillStyle = hubGrad;
        ctx.fill();
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.stroke();

        // ── Aim line (subtle) ──
        const aimEndX = tx + Math.cos(turretAngle) * 200;
        const aimEndY = ty + Math.sin(turretAngle) * 200;
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(tx + Math.cos(turretAngle) * TURRET_BARREL_LEN, ty + Math.sin(turretAngle) * TURRET_BARREL_LEN);
        ctx.lineTo(aimEndX, aimEndY);
        ctx.stroke();
        ctx.setLineDash([]);

        // ── Power meter (vertical bar on right side) ──
        const powerFrac = turretPower / MAX_POWER;
        const barH = 80;
        const barW = 8;
        const barX = W - RAIL_W - 22;
        const barY = H / 2 - barH / 2;

        // Bar background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

        // Bar fill (bottom-up)
        const pmGrad = ctx.createLinearGradient(0, barY + barH, 0, barY);
        pmGrad.addColorStop(0, '#00cc00');
        pmGrad.addColorStop(0.5, '#ffcc00');
        pmGrad.addColorStop(1, '#ff2200');
        ctx.fillStyle = pmGrad;
        const fillH = barH * powerFrac;
        ctx.fillRect(barX, barY + barH - fillH, barW, fillH);

        // Bar border
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        // Power label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('PWR', barX + barW / 2, barY + barH + 4);

        // ── Trajectory dots from barrel tip ──
        if (turretPower > MIN_POWER) {
            const muzzleX = tx + Math.cos(turretAngle) * TURRET_BARREL_LEN;
            const muzzleY = ty + Math.sin(turretAngle) * TURRET_BARREL_LEN;
            const power = turretPower * POWER_SCALE;
            const vx = Math.cos(turretAngle) * power;
            const vy = Math.sin(turretAngle) * power;
            const dots = computeTrajectory(muzzleX, muzzleY, vx, vy, TRAJ_DOTS);

            for (let i = 0; i < dots.length; i++) {
                const alpha = 0.6 * (1 - i / dots.length);
                const dotR = 1.5 * (1 - i / dots.length * 0.5);
                ctx.beginPath();
                ctx.arc(dots[i].x, dots[i].y, dotR, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fill();
            }
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    function drawFloatingTexts() {
        for (const t of floatingTexts) {
            ctx.save();
            ctx.globalAlpha = t.life;
            ctx.fillStyle = t.color;
            ctx.font = t.big ? 'bold 16px sans-serif' : 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Outline
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 2;
            ctx.strokeText(t.text, t.x, t.y);
            ctx.fillText(t.text, t.x, t.y);
            ctx.restore();
        }
    }

    function drawHUD() {
        // Score
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Score: ${score}`, 6, 3);

        // Level
        ctx.textAlign = 'center';
        ctx.fillText(`Level ${level}`, W / 2, 3);

        // Shots remaining
        ctx.textAlign = 'right';
        ctx.fillText(`Shots: ${shotsLeft}`, W - 6, 3);

        // Stars earned so far
        const starY = 3;
        const starSize = 10;
        for (let i = 0; i < totalStars && i < 30; i++) {
            drawStar(W - 60 - i * 12, starY + 7, starSize / 2, '#FFD700');
        }

        // Turret aim instruction
        if (state === ST_AIMING && levelTransTimer <= 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            if (!turretLocked) {
                ctx.fillText('Move to aim \u2022 Click to lock', W / 2, H - 5);
            } else {
                ctx.fillText('Click to FIRE! \u2022 Right-click to cancel', W / 2, H - 5);
            }
        }

        // Combo indicator
        if (combo > 1) {
            ctx.fillStyle = '#00ffff';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            const pulse = 1 + Math.sin(Date.now() / 100) * 0.1;
            ctx.save();
            ctx.translate(W / 2, 20);
            ctx.scale(pulse, pulse);
            ctx.fillText(`x${combo} COMBO`, 0, 0);
            ctx.restore();
        }

        // Level transition
        if (levelTransTimer > 0) {
            const alpha = Math.min(1, levelTransTimer / 30);
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Level ${level}`, W / 2, H / 2);
            ctx.font = '12px sans-serif';
            ctx.fillText(`${balls.length} balls \u2022 ${SHOTS_PER_LEVEL} shots`, W / 2, H / 2 + 22);
            levelTransTimer--;
        }
    }

    function drawStar(x, y, r, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
            const px = x + Math.cos(angle) * r;
            const py = y + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
            const innerAngle = angle + Math.PI / 5;
            const ix = x + Math.cos(innerAngle) * r * 0.4;
            const iy = y + Math.sin(innerAngle) * r * 0.4;
            ctx.lineTo(ix, iy);
        }
        ctx.closePath();
        ctx.fill();
    }

    function drawTitleScreen() {
        drawBackground();

        // Fake table preview
        drawTable();

        // Overlay
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);

        // Title
        titleBounce += 0.03;
        const titleY = H * 0.3 + Math.sin(titleBounce) * 4;

        ctx.save();
        ctx.fillStyle = ACCENT2;
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillText('SLINGPOOL', W / 2 + 2, titleY + 2);

        // Main title
        const titleGrad = ctx.createLinearGradient(W / 2 - 100, titleY - 20, W / 2 + 100, titleY + 20);
        titleGrad.addColorStop(0, ACCENT2);
        titleGrad.addColorStop(0.5, '#fff');
        titleGrad.addColorStop(1, ACCENT1);
        ctx.fillStyle = titleGrad;
        ctx.fillText('SLINGPOOL', W / 2, titleY);

        // Subtitle
        ctx.font = '13px sans-serif';
        ctx.fillStyle = '#ccc';
        ctx.fillText('Cannon + Pool + Pinball', W / 2, titleY + 28);
        ctx.restore();

        // Instructions
        ctx.fillStyle = '#aaa';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Aim the turret, click to lock, click again to fire!', W / 2, H * 0.58);
        ctx.fillText('Pot balls in pockets for points', W / 2, H * 0.64);
        ctx.fillText('3 shots per level \u2022 10 levels \u2022 Star ratings', W / 2, H * 0.70);

        // Start prompt
        const pulse = 0.7 + Math.sin(Date.now() / 400) * 0.3;
        ctx.fillStyle = `rgba(255, 215, 0, ${pulse})`;
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText('Click / Tap to Start', W / 2, H * 0.84);

        // Small cue ball bouncing
        const demoX = W / 2 + Math.sin(Date.now() / 600) * 40;
        const demoY = H * 0.46 + Math.abs(Math.sin(Date.now() / 300)) * -8;
        ctx.beginPath();
        ctx.arc(demoX, demoY, 6, 0, Math.PI * 2);
        const dg = ctx.createRadialGradient(demoX - 2, demoY - 2, 1, demoX, demoY, 6);
        dg.addColorStop(0, '#fff');
        dg.addColorStop(1, '#bbb');
        ctx.fillStyle = dg;
        ctx.fill();
    }

    function drawLevelComplete() {
        // Dim overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, W, H);

        const cy = H / 2;

        // Title
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (starsToReveal === 0) {
            ctx.fillText('No Stars', W / 2, cy - 40);
            ctx.font = '12px sans-serif';
            ctx.fillStyle = '#aaa';
            ctx.fillText('Try to pot at least one ball!', W / 2, cy - 18);
        } else {
            const remaining = balls.filter(b => b.active).length;
            const potted = balls.length - remaining;
            if (remaining === 0) {
                ctx.fillStyle = ACCENT2;
                ctx.fillText('CLEARED!', W / 2, cy - 45);
            } else {
                ctx.fillText(`${potted} / ${balls.length} Potted`, W / 2, cy - 45);
            }
        }

        // Stars
        starRevealTimer++;
        const starSpacing = 36;
        const starBaseX = W / 2 - (2 * starSpacing) / 2;
        for (let i = 0; i < 3; i++) {
            const sx = starBaseX + i * starSpacing;
            const sy = cy;
            const reveal = starRevealTimer - i * 20;

            if (i < starsToReveal && reveal > 0) {
                const scale = Math.min(1, reveal / 15);
                const bounce = reveal < 15 ? 1 + (1 - scale) * 0.3 : 1;
                ctx.save();
                ctx.translate(sx, sy);
                ctx.scale(scale * bounce, scale * bounce);
                drawStar(0, 0, 14, '#FFD700');
                ctx.restore();
                if (reveal === 1) playSound('star', i);
            } else {
                // Empty star
                drawStar(sx, sy, 14, '#444');
            }
        }

        // Score
        ctx.fillStyle = '#fff';
        ctx.font = '13px sans-serif';
        ctx.fillText(`Score: ${score}`, W / 2, cy + 35);

        // Continue prompt
        if (starRevealTimer > 70) {
            const pulse = 0.6 + Math.sin(Date.now() / 400) * 0.4;
            ctx.fillStyle = `rgba(255, 215, 0, ${pulse})`;
            ctx.font = 'bold 13px sans-serif';
            if (level >= TOTAL_LEVELS) {
                ctx.fillText('Click for Final Results', W / 2, cy + 60);
            } else {
                ctx.fillText('Click for Next Level', W / 2, cy + 60);
            }
        }
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, W, H);

        const cy = H / 2;

        // Title
        const grad = ctx.createLinearGradient(W / 2 - 80, cy - 60, W / 2 + 80, cy - 30);
        grad.addColorStop(0, ACCENT2);
        grad.addColorStop(1, ACCENT1);
        ctx.fillStyle = grad;
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GAME COMPLETE!', W / 2, cy - 50);

        // Stats
        ctx.fillStyle = '#fff';
        ctx.font = '14px sans-serif';
        ctx.fillText(`Final Score: ${score}`, W / 2, cy - 15);
        ctx.fillText(`Balls Potted: ${totalBallsPotted}`, W / 2, cy + 8);
        ctx.fillText(`Stars: ${totalStars} / ${TOTAL_LEVELS * 3}`, W / 2, cy + 31);

        // Time
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        ctx.fillStyle = '#aaa';
        ctx.font = '12px sans-serif';
        ctx.fillText(`Time: ${mins}:${secs.toString().padStart(2, '0')}`, W / 2, cy + 52);

        // Star display
        const starRow = cy + 75;
        for (let i = 0; i < Math.min(totalStars, 30); i++) {
            const sx = W / 2 - totalStars * 5 + i * 10;
            drawStar(sx, starRow, 5, '#FFD700');
        }

        // Replay prompt
        const pulse = 0.6 + Math.sin(Date.now() / 400) * 0.4;
        ctx.fillStyle = `rgba(255, 215, 0, ${pulse})`;
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('Click to Play Again', W / 2, cy + 100);
    }

    // ═══════════════════════════════════════════════════════════════
    //  COLOR HELPERS
    // ═══════════════════════════════════════════════════════════════
    function lightenColor(hex, amount) {
        const rgb = hexToRgb(hex);
        return `rgb(${Math.min(255, rgb.r + amount)}, ${Math.min(255, rgb.g + amount)}, ${Math.min(255, rgb.b + amount)})`;
    }

    function darkenColor(hex, amount) {
        const rgb = hexToRgb(hex);
        return `rgb(${Math.max(0, rgb.r - amount)}, ${Math.max(0, rgb.g - amount)}, ${Math.max(0, rgb.b - amount)})`;
    }

    function hexToRgb(hex) {
        const h = hex.replace('#', '');
        return {
            r: parseInt(h.substring(0, 2), 16) || 0,
            g: parseInt(h.substring(2, 4), 16) || 0,
            b: parseInt(h.substring(4, 6), 16) || 0,
        };
    }

    // ═══════════════════════════════════════════════════════════════
    //  INPUT HANDLING
    // ═══════════════════════════════════════════════════════════════
    function getCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        const cx = (e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0)) - rect.left;
        const cy = (e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0)) - rect.top;
        return {
            x: cx / SCALE,
            y: cy / SCALE,
        };
    }

    function onMouseDown(e) {
        e.preventDefault();
        const pos = getCanvasPos(e);
        mouseX = pos.x;
        mouseY = pos.y;

        if (state === ST_TITLE) {
            startGame();
            return;
        }

        if (state === ST_LEVEL_COMPLETE && starRevealTimer > 70) {
            if (level >= TOTAL_LEVELS) {
                state = ST_GAME_OVER;
                if (onGameOver) {
                    onGameOver({
                        score,
                        level,
                        duration: Math.floor((Date.now() - startTime) / 1000),
                        ballsPotted: totalBallsPotted,
                        stars: totalStars,
                    });
                }
            } else {
                nextLevel();
            }
            return;
        }

        if (state === ST_GAME_OVER) {
            state = ST_TITLE;
            return;
        }

        if (state === ST_AIMING && !cueBall.potting) {
            if (!turretLocked) {
                // First click: lock the aim direction, start power oscillation
                turretLocked = true;
                turretPower = 0;
                powerDirection = 1;
                playSound('pull', 30);
            } else {
                // Second click: fire at current power
                if (turretPower >= MIN_POWER) {
                    // Place cue ball at muzzle before firing
                    cueBall.x = cueRestX + Math.cos(turretAngle) * (TURRET_BARREL_LEN + CUE_R + 2);
                    cueBall.y = cueRestY + Math.sin(turretAngle) * (TURRET_BARREL_LEN + CUE_R + 2);
                    fireShot(turretPower, turretAngle);
                }
            }
        }
    }

    function onMouseMove(e) {
        e.preventDefault();
        const pos = getCanvasPos(e);
        mouseX = pos.x;
        mouseY = pos.y;

        // Update turret angle to track mouse (only when not locked)
        if (state === ST_AIMING && !turretLocked) {
            const dx = mouseX - cueRestX;
            const dy = mouseY - cueRestY;
            let angle = Math.atan2(dy, dx);
            // Clamp to upper half (don't aim into the rail behind)
            // Allow roughly -170 to -10 degrees (aiming upward from bottom)
            if (angle > 0.15) angle = 0.15;
            if (angle < -Math.PI - 0.15) angle = -Math.PI - 0.15;
            // Clamp so turret can't aim straight down into the rail
            if (angle > -0.08 && angle <= Math.PI) angle = -0.08;
            turretAngle = angle;
        }
    }

    function onMouseUp(e) {
        // Not used in turret mode - all actions on mousedown clicks
    }

    function onRightClick(e) {
        e.preventDefault();
        // Right-click / two-finger tap cancels locked aim
        if (state === ST_AIMING && turretLocked) {
            turretLocked = false;
            turretPower = 0;
            playSound('click');
        }
    }

    function onTouchStart(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            onMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {} });
        } else if (e.touches.length === 2) {
            // Two-finger tap cancels aim lock
            e.preventDefault();
            if (state === ST_AIMING && turretLocked) {
                turretLocked = false;
                turretPower = 0;
                playSound('click');
            }
        }
    }

    function onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            onMouseMove({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {} });
        }
    }

    function onTouchEnd(e) {
        // Not used for turret mode
    }

    function onResize() {
        fitCanvas();
    }

    // ═══════════════════════════════════════════════════════════════
    //  MAIN LOOP
    // ═══════════════════════════════════════════════════════════════
    function loop() {
        if (!canvas) return;
        animFrame = requestAnimationFrame(loop);
        update();
        render();
    }

    function update() {
        if (state === ST_ROLLING || state === ST_AIMING) {
            updatePhysics();
        }

        // Oscillate power meter when turret aim is locked
        if (state === ST_AIMING && turretLocked) {
            turretPower += powerDirection * MAX_POWER * POWER_CYCLE_SPEED;
            if (turretPower >= MAX_POWER) {
                turretPower = MAX_POWER;
                powerDirection = -1;
            } else if (turretPower <= 0) {
                turretPower = 0;
                powerDirection = 1;
            }
        }

        updateParticles();
        updateFloatingTexts();
        updateShake();
    }

    function render() {
        ctx.save();
        ctx.translate(shakeX, shakeY);

        if (state === ST_TITLE) {
            drawTitleScreen();
        } else {
            drawBackground();
            drawTable();
            drawObstacles();

            // Draw target balls
            for (const b of balls) {
                drawBall(b);
            }

            // Draw cue ball
            drawCueBall();

            // Draw turret
            drawTurret();

            // Particles & texts
            drawParticles();
            drawFloatingTexts();

            // HUD
            drawHUD();

            // Level complete overlay
            if (state === ST_LEVEL_COMPLETE) {
                drawLevelComplete();
            }

            // Game over overlay
            if (state === ST_GAME_OVER) {
                drawGameOver();
            }
        }

        ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════════
    //  INIT / DESTROY
    // ═══════════════════════════════════════════════════════════════
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer || null;
        onGameOver = gameOverCallback || null;

        // Load player theme
        const themeId = activePlayer?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            ACCENT1 = _t.colors[0] || ACCENT1;
            ACCENT2 = _t.colors[1] || ACCENT2;
            BG_CLR1 = _t.bgGradient?.[0] || BG_CLR1;
            BG_CLR2 = _t.bgGradient?.[1] || BG_CLR2;
            // Derive felt from accent
            const rgb = hexToRgb(ACCENT1);
            FELT_CLR = `rgb(${Math.round(rgb.r * 0.3)}, ${Math.round(Math.min(255, rgb.g * 0.6 + 40))}, ${Math.round(rgb.b * 0.3)})`;
            FELT_CLR2 = `rgb(${Math.round(rgb.r * 0.2)}, ${Math.round(Math.min(255, rgb.g * 0.5 + 30))}, ${Math.round(rgb.b * 0.2)})`;
            CUSHION_CLR = `rgb(${Math.round(rgb.r * 0.4)}, ${Math.round(Math.min(255, rgb.g * 0.7 + 30))}, ${Math.round(rgb.b * 0.4)})`;
        }

        turretAngle = -Math.PI / 2;
        turretPower = 0;
        powerDirection = 1;
        turretLocked = false;
        mouseX = BASE_W / 2;
        mouseY = BASE_H / 2;
        particles = [];
        floatingTexts = [];
        shakeTimer = 0;
        shakeX = 0;
        shakeY = 0;
        titleBounce = 0;
        gameActive = false;
        state = ST_TITLE;

        loadSprites();
        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        // Build pockets for title screen
        buildPockets();

        // Bind events
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('contextmenu', onRightClick);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: true });
        window.addEventListener('resize', onResize);

        animFrame = requestAnimationFrame(loop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) {
            cancelAnimationFrame(animFrame);
            animFrame = null;
        }

        window.removeEventListener('resize', onResize);

        if (canvas) {
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('contextmenu', onRightClick);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        canvas = null;
        ctx = null;

        if (audioCtx) {
            try { audioCtx.close(); } catch {}
            audioCtx = null;
        }
    }

    return {
        init,
        destroy,
        getScore()  { return score; },
        getLevel()  { return level; },
        isActive()  { return gameActive; },
    };
})();
