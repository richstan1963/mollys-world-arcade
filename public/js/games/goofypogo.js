/* Goofy's Pogo Trip — Endless side-scrolling pogo stick game for Your World Arcade */
window.GoofyPogo = (() => {
    // ── Constants ──
    const GAME_W = 640, GAME_H = 400;
    const GRAVITY = 0.38;
    const MIN_BOUNCE_VEL = -5.5;
    const MAX_BOUNCE_VEL = -13.5;
    const MAX_CHARGE_TIME = 2000; // ms
    const AUTO_BOUNCE_VEL = -4.2;
    const TILT_ACCEL = 0.18;
    const MAX_TILT_SPEED = 2.8;
    const AIR_DRAG = 0.97;
    const GROUND_Y = GAME_H - 50;
    const SCROLL_SPEED_BASE = 1.8;
    const SCROLL_SPEED_MAX = 4.0;
    const GOOFY_W = 28, GOOFY_H = 52;
    const POGO_LEN = 30;
    const SPRING_COILS = 4;
    const EAR_LEN = 18;
    const COIN_R = 8;
    const STAR_R = 10;
    const HOTDOG_W = 20, HOTDOG_H = 10;
    const TRAMPOLINE_W = 50, TRAMPOLINE_H = 12;
    const TRAMPOLINE_BOUNCE = -14;
    const BREAKABLE_HP = 1;
    const WATER_DRAG = 0.6;
    const FLIP_THRESHOLD = Math.PI * 2;
    const PERFECT_ANGLE = 0.26; // ~15 degrees
    const WOBBLE_STUN_FRAMES = 30;
    const ENV_CYCLE = 1000; // meters
    const SPEED_BOOST_DIST = 500; // every 500m
    const SPEED_BOOST_DUR = 120; // frames

    // ── Game states ──
    const SPLASH = 0, PLAYING = 1, GAMEOVER = 2;

    // ── State ──
    let canvas, ctx;
    let state = SPLASH;
    let score = 0, bestScore = 0, distanceM = 0;
    let gameActive = false;
    let animFrame = null;
    let player = null;
    let onGameOver = null;
    let inputBound = false;
    let lastTime = 0;

    // Goofy
    let gx, gy, gvx, gvy;
    let angle = 0, angularVel = 0;
    let charging = false, chargeStart = 0;
    let chargeAmount = 0; // 0-1
    let onGround = false, onPlatform = false;
    let squash = 1.0; // squash-stretch factor (1 = normal)
    let earAngle1 = 0, earAngle2 = 0; // ear flop angles
    let hatOffset = 0;
    let alive = true;
    let flipAngle = 0; // accumulated rotation for trick
    let flipCount = 0;
    let stunTimer = 0;
    let tiltInput = 0; // -1, 0, 1
    let inWater = false;
    let dustParticles = [];
    let lastBounceY = 0;

    // Scroll
    let scrollSpeed = SCROLL_SPEED_BASE;
    let scrollX = 0; // total scrolled
    let speedBoostTimer = 0;

    // Environment
    let envIndex = 0;
    let parallaxLayers = []; // 3 layers per env

    // Obstacles
    let walls = [];
    let platforms = [];
    let trampolines = [];
    let breakables = [];
    let waterPools = [];

    // Collectibles
    let coins = [];
    let stars = [];
    let hotdogs = [];

    // Particles & floats
    let particles = [];
    let floats = [];

    // Ground segments
    let groundSegs = [];

    // Theme
    let theme = null, TC = [], TBG = [];
    let accentColor = '#22AA44';

    // Audio
    let audioCtx = null;

    // Touch
    let touchCharging = false;
    let touchSide = 0; // -1 left, 0 center, 1 right

    // Keys
    let keys = {};

    // Splash
    let splashBounce = 0, splashDir = 1;

    // ══════════════════════════════════════════════════════════════════════
    // ── Audio System ──
    // ══════════════════════════════════════════════════════════════════════
    function getAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
        }
        return audioCtx;
    }

    function sfx(type, pitch) {
        const ac = getAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);

            switch(type) {
                case 'bounce': {
                    const p = pitch || 1;
                    osc.frequency.setValueAtTime(280 * p, t);
                    osc.frequency.exponentialRampToValueAtTime(560 * p, t + 0.06);
                    osc.frequency.exponentialRampToValueAtTime(350 * p, t + 0.12);
                    osc.type = 'sine';
                    gain.gain.setValueAtTime(0.18, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
                    osc.start(t); osc.stop(t + 0.18);
                    break;
                }
                case 'charge': {
                    osc.frequency.setValueAtTime(120, t);
                    osc.frequency.linearRampToValueAtTime(80, t + 0.15);
                    osc.type = 'sawtooth';
                    gain.gain.setValueAtTime(0.06, t);
                    gain.gain.linearRampToValueAtTime(0.1, t + 0.15);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                    osc.start(t); osc.stop(t + 0.2);
                    break;
                }
                case 'bigbounce': {
                    osc.frequency.setValueAtTime(200, t);
                    osc.frequency.exponentialRampToValueAtTime(800, t + 0.08);
                    osc.frequency.exponentialRampToValueAtTime(400, t + 0.2);
                    osc.type = 'sine';
                    gain.gain.setValueAtTime(0.22, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                    osc.start(t); osc.stop(t + 0.25);
                    // whoosh layer
                    const osc2 = ac.createOscillator();
                    const g2 = ac.createGain();
                    osc2.connect(g2); g2.connect(ac.destination);
                    osc2.type = 'sawtooth';
                    osc2.frequency.setValueAtTime(100, t);
                    osc2.frequency.exponentialRampToValueAtTime(50, t + 0.3);
                    g2.gain.setValueAtTime(0.04, t);
                    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                    osc2.start(t); osc2.stop(t + 0.3);
                    break;
                }
                case 'coin': {
                    osc.frequency.setValueAtTime(1200, t);
                    osc.frequency.setValueAtTime(1600, t + 0.05);
                    osc.type = 'sine';
                    gain.gain.setValueAtTime(0.1, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                    osc.start(t); osc.stop(t + 0.12);
                    break;
                }
                case 'star': {
                    osc.frequency.setValueAtTime(880, t);
                    osc.frequency.setValueAtTime(1320, t + 0.05);
                    osc.frequency.setValueAtTime(1760, t + 0.1);
                    osc.type = 'sine';
                    gain.gain.setValueAtTime(0.13, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                    osc.start(t); osc.stop(t + 0.25);
                    break;
                }
                case 'hotdog': {
                    // chomp + goofy honk
                    osc.frequency.setValueAtTime(300, t);
                    osc.frequency.setValueAtTime(220, t + 0.05);
                    osc.frequency.setValueAtTime(180, t + 0.1);
                    osc.frequency.exponentialRampToValueAtTime(400, t + 0.2);
                    osc.frequency.exponentialRampToValueAtTime(150, t + 0.35);
                    osc.type = 'square';
                    gain.gain.setValueAtTime(0.12, t);
                    gain.gain.setValueAtTime(0.15, t + 0.1);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
                    osc.start(t); osc.stop(t + 0.4);
                    break;
                }
                case 'flip': {
                    osc.frequency.setValueAtTime(500, t);
                    osc.frequency.exponentialRampToValueAtTime(1500, t + 0.15);
                    osc.type = 'triangle';
                    gain.gain.setValueAtTime(0.08, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                    osc.start(t); osc.stop(t + 0.2);
                    break;
                }
                case 'thud': {
                    osc.frequency.setValueAtTime(80, t);
                    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
                    osc.type = 'square';
                    gain.gain.setValueAtTime(0.15, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
                    osc.start(t); osc.stop(t + 0.18);
                    break;
                }
                case 'wobble': {
                    osc.frequency.setValueAtTime(250, t);
                    osc.frequency.linearRampToValueAtTime(200, t + 0.05);
                    osc.frequency.linearRampToValueAtTime(300, t + 0.1);
                    osc.frequency.linearRampToValueAtTime(150, t + 0.2);
                    osc.type = 'triangle';
                    gain.gain.setValueAtTime(0.1, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                    osc.start(t); osc.stop(t + 0.25);
                    break;
                }
                case 'break': {
                    osc.frequency.setValueAtTime(200, t);
                    osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);
                    osc.type = 'sawtooth';
                    gain.gain.setValueAtTime(0.18, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                    osc.start(t); osc.stop(t + 0.2);
                    break;
                }
                case 'trampoline': {
                    osc.frequency.setValueAtTime(400, t);
                    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
                    osc.frequency.exponentialRampToValueAtTime(600, t + 0.2);
                    osc.type = 'sine';
                    gain.gain.setValueAtTime(0.2, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                    osc.start(t); osc.stop(t + 0.25);
                    break;
                }
                case 'die': {
                    osc.frequency.setValueAtTime(400, t);
                    osc.frequency.exponentialRampToValueAtTime(60, t + 0.6);
                    osc.type = 'sawtooth';
                    gain.gain.setValueAtTime(0.15, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
                    osc.start(t); osc.stop(t + 0.6);
                    break;
                }
                case 'splash': {
                    // noise-like water splash
                    osc.frequency.setValueAtTime(800, t);
                    osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
                    osc.type = 'sawtooth';
                    gain.gain.setValueAtTime(0.08, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
                    osc.start(t); osc.stop(t + 0.18);
                    break;
                }
            }
        } catch(e) {}
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── Environment Definitions ──
    // ══════════════════════════════════════════════════════════════════════
    const ENVS = [
        { name: 'Suburban Sidewalk', sky: ['#87CEEB','#B0E0E6'], ground: '#8B7355', groundTop: '#6B8E23',
          parallax: ['#A8D5A2','#7CB87C','#4E8B4E'], features: 'suburban' },
        { name: 'Construction Site', sky: ['#C4A882','#E8D5B7'], ground: '#8B8682', groundTop: '#A0522D',
          parallax: ['#D4C4A8','#B8A88C','#8C7C60'], features: 'construction' },
        { name: 'Rooftops', sky: ['#2C3E6B','#4A6FA5'], ground: '#696969', groundTop: '#808080',
          parallax: ['#3C4F7A','#2A3D5C','#1A2540'], features: 'rooftops' },
        { name: 'Candy Factory', sky: ['#FFB6C1','#FFE4E1'], ground: '#DEB887', groundTop: '#FF69B4',
          parallax: ['#FFD1DC','#FFB3C6','#FF8FAB'], features: 'candy' },
        { name: 'Space Station', sky: ['#0A0A2E','#1A1A4E'], ground: '#404040', groundTop: '#606060',
          parallax: ['#15153D','#0D0D2D','#050520'], features: 'space' },
    ];

    // ══════════════════════════════════════════════════════════════════════
    // ── Utility ──
    // ══════════════════════════════════════════════════════════════════════
    function rand(a, b) { return Math.random() * (b - a) + a; }
    function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function dist(x1, y1, x2, y2) { return Math.hypot(x2-x1, y2-y1); }
    function normAngle(a) { while (a > Math.PI) a -= Math.PI*2; while (a < -Math.PI) a += Math.PI*2; return a; }

    function addFloat(x, y, text, color, size) {
        floats.push({ x, y, text, color: color || '#FFF', size: size || 16, life: 60, maxLife: 60 });
    }
    function addDust(x, y, count) {
        for (let i = 0; i < count; i++) {
            dustParticles.push({
                x, y, vx: rand(-1.5, 1.5), vy: rand(-2, -0.5),
                life: randInt(15, 30), maxLife: 30, r: rand(2, 4),
                color: getEnv().ground
            });
        }
    }
    function addParticles(x, y, count, color, spread) {
        spread = spread || 3;
        for (let i = 0; i < count; i++) {
            particles.push({
                x, y, vx: rand(-spread, spread), vy: rand(-spread, 0.5),
                life: randInt(15, 35), maxLife: 35, r: rand(1.5, 3.5), color
            });
        }
    }

    function getEnv() { return ENVS[envIndex % ENVS.length]; }
    function isSpaceEnv() { return (envIndex % ENVS.length) === 4; }
    function getGravity() { return isSpaceEnv() ? GRAVITY * 0.55 : GRAVITY; }

    // ══════════════════════════════════════════════════════════════════════
    // ── World Generation ──
    // ══════════════════════════════════════════════════════════════════════
    let genX = 0; // how far we've generated
    let nextObstacleX = 0;

    function initWorld() {
        walls = []; platforms = []; trampolines = []; breakables = [];
        waterPools = []; coins = []; stars = []; hotdogs = [];
        groundSegs = [];
        genX = GAME_W + 100;
        nextObstacleX = genX;
        // Generate initial ground
        for (let x = 0; x < GAME_W + 300; x += 40) {
            groundSegs.push({ x, y: GROUND_Y, w: 40, slope: 0 });
        }
        // Initial parallax
        initParallax();
    }

    function initParallax() {
        parallaxLayers = [];
        for (let layer = 0; layer < 3; layer++) {
            const items = [];
            for (let i = 0; i < 8; i++) {
                items.push(makeParallaxItem(layer, i * 120 + rand(0, 40)));
            }
            parallaxLayers.push({ items, speed: 0.15 + layer * 0.15 });
        }
    }

    function makeParallaxItem(layer, x) {
        const env = getEnv();
        const h = 20 + layer * 25 + rand(0, 20);
        return { x, w: 40 + rand(0, 60), h, y: GROUND_Y - h + rand(-5, 5), layer };
    }

    function generateAhead() {
        const camRight = scrollX + GAME_W + 200;

        // Ground
        while (groundSegs.length === 0 || groundSegs[groundSegs.length-1].x < camRight) {
            const lastSeg = groundSegs[groundSegs.length-1];
            const x = lastSeg ? lastSeg.x + lastSeg.w : 0;
            const slope = rand(-0.15, 0.15);
            groundSegs.push({ x, y: GROUND_Y, w: 40, slope });
        }

        // Obstacles
        while (nextObstacleX < camRight) {
            const spacing = rand(180, 320) / (1 + distanceM / 5000);
            spawnObstacleCluster(nextObstacleX);
            nextObstacleX += Math.max(140, spacing);
        }

        // Cleanup off-screen left
        const camLeft = scrollX - 100;
        walls = walls.filter(w => w.x + w.w > camLeft);
        platforms = platforms.filter(p => p.x + p.w > camLeft);
        trampolines = trampolines.filter(t => t.x + t.w > camLeft);
        breakables = breakables.filter(b => b.x + b.w > camLeft && !b.dead);
        waterPools = waterPools.filter(w => w.x + w.w > camLeft);
        coins = coins.filter(c => c.x > camLeft && !c.collected);
        stars = stars.filter(s => s.x > camLeft && !s.collected);
        hotdogs = hotdogs.filter(h => h.x > camLeft && !h.collected);
        groundSegs = groundSegs.filter(g => g.x + g.w > camLeft);

        // Parallax
        for (const layer of parallaxLayers) {
            layer.items = layer.items.filter(it => it.x + it.w > camLeft - 50);
            while (layer.items.length < 8) {
                const lastX = layer.items.length > 0 ? layer.items[layer.items.length-1].x : scrollX;
                layer.items.push(makeParallaxItem(layer.items.length > 0 ? layer.items[0].layer : 0, lastX + 100 + rand(0, 60)));
            }
        }
    }

    function spawnObstacleCluster(x) {
        const difficulty = Math.min(1, distanceM / 4000);
        const r = Math.random();

        // Coin arc along bounce trajectory
        if (Math.random() < 0.6) {
            spawnCoinArc(x, rand(GROUND_Y - 180, GROUND_Y - 60), randInt(4, 8));
        }

        // Rare star
        if (Math.random() < 0.08) {
            stars.push({ x: x + rand(0, 80), y: rand(40, GROUND_Y - 120), collected: false, sparkle: 0 });
        }
        // Rare hotdog
        if (Math.random() < 0.05) {
            hotdogs.push({ x: x + rand(0, 60), y: rand(60, GROUND_Y - 100), collected: false, wobble: 0 });
        }

        if (r < 0.25) {
            // Wall with gap
            const gapY = rand(80, GROUND_Y - 100);
            const gapH = lerp(130, 85, difficulty);
            walls.push({ x, y: 0, w: 30, h: gapY - gapH / 2 });
            walls.push({ x, y: gapY + gapH / 2, w: 30, h: GAME_H - (gapY + gapH / 2) });
        } else if (r < 0.4) {
            // Low ceiling
            walls.push({ x, y: 0, w: randInt(60, 120), h: rand(50, 120) });
        } else if (r < 0.55) {
            // Platform (floating)
            const py = rand(GROUND_Y - 200, GROUND_Y - 80);
            const pw = rand(50, 100);
            const moving = difficulty > 0.3 && Math.random() < 0.4;
            platforms.push({ x, y: py, w: pw, h: 10, moving, baseY: py, moveSpeed: moving ? rand(0.3, 0.8) : 0, movePhase: rand(0, Math.PI * 2), moveRange: 40 });
        } else if (r < 0.65) {
            // Trampoline
            trampolines.push({ x: x + rand(0, 30), y: GROUND_Y - 8, w: TRAMPOLINE_W, h: TRAMPOLINE_H, bounce: 0 });
        } else if (r < 0.75) {
            // Breakable block
            const by = rand(GROUND_Y - 160, GROUND_Y - 60);
            breakables.push({ x, y: by, w: 30, h: 25, hp: BREAKABLE_HP, dead: false, crack: 0 });
        } else if (r < 0.82) {
            // Water puddle
            waterPools.push({ x, y: GROUND_Y - 4, w: rand(60, 120), h: 15, ripple: 0 });
        } else {
            // Mixed: platform + coins above
            const py = rand(GROUND_Y - 150, GROUND_Y - 70);
            platforms.push({ x, y: py, w: 70, h: 10, moving: false, baseY: py, moveSpeed: 0, movePhase: 0, moveRange: 0 });
            spawnCoinArc(x, py - 50, 5);
        }
    }

    function spawnCoinArc(x, peakY, count) {
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            const cx = x + i * 22;
            const cy = peakY + Math.sin(t * Math.PI) * -30;
            coins.push({ x: cx, y: cy, collected: false, bobPhase: rand(0, Math.PI * 2) });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── Physics & Update ──
    // ══════════════════════════════════════════════════════════════════════
    function update(dt) {
        if (state !== PLAYING) return;
        if (!alive) return;

        const grav = getGravity();
        const effectiveDt = Math.min(dt, 2); // cap to avoid physics explosion

        // Scroll
        const currentSpeed = speedBoostTimer > 0 ? scrollSpeed * 1.6 : scrollSpeed;
        scrollX += currentSpeed * effectiveDt;
        distanceM = scrollX / 10;

        // Speed increase over time
        scrollSpeed = Math.min(SCROLL_SPEED_MAX, SCROLL_SPEED_BASE + distanceM / 3000);

        // Environment cycle
        envIndex = Math.floor(distanceM / ENV_CYCLE);

        // Speed boost
        if (speedBoostTimer > 0) speedBoostTimer -= effectiveDt;
        if (Math.floor((distanceM - currentSpeed * effectiveDt / 10) / SPEED_BOOST_DIST) < Math.floor(distanceM / SPEED_BOOST_DIST)) {
            if (distanceM > 10) speedBoostTimer = SPEED_BOOST_DUR;
        }

        // Tilt input
        if (keys['ArrowLeft'] || keys['a'] || touchSide === -1) tiltInput = -1;
        else if (keys['ArrowRight'] || keys['d'] || touchSide === 1) tiltInput = 0.3; // slight rightward helps
        else tiltInput = 0;

        // Charge
        if (charging) {
            chargeAmount = Math.min(1, (performance.now() - chargeStart) / MAX_CHARGE_TIME);
        }

        // Gravity
        gvy += grav * effectiveDt;

        // Water drag
        inWater = false;
        for (const wp of waterPools) {
            const sx = wp.x - scrollX;
            if (gx > sx && gx < sx + wp.w && gy + GOOFY_H / 2 + POGO_LEN > wp.y) {
                inWater = true;
                gvy *= WATER_DRAG;
                gvx *= 0.95;
            }
        }

        // Horizontal
        if (!onGround) {
            gvx += tiltInput * TILT_ACCEL * effectiveDt;
            gvx *= AIR_DRAG;
            gvx = clamp(gvx, -MAX_TILT_SPEED, MAX_TILT_SPEED);
            // Angular momentum from tilt
            angularVel += tiltInput * 0.003 * effectiveDt;
        } else {
            gvx *= 0.85;
            angularVel *= 0.8;
        }

        // Move Goofy
        gx += gvx * effectiveDt;
        gy += gvy * effectiveDt;

        // Keep Goofy roughly on screen horizontally
        if (gx < 30) { gx = 30; gvx = Math.max(0, gvx); }
        if (gx > GAME_W - 30) { gx = GAME_W - 30; gvx = Math.min(0, gvx); }

        // Goofy drifts left relative to scrolling world — die if too far left
        // (simulated by not adding scroll to gx, but obstacles come from right)

        // Rotation in air
        if (!onGround) {
            angle += angularVel * effectiveDt;
            flipAngle += Math.abs(angularVel * effectiveDt);
        } else {
            // Snap toward upright
            angle = lerp(angle, 0, 0.2);
            angularVel *= 0.5;
        }

        // Stun
        if (stunTimer > 0) stunTimer -= effectiveDt;

        // ── Ground collision ──
        const footY = gy + GOOFY_H / 2 + POGO_LEN;
        onGround = false;
        onPlatform = false;

        if (footY >= GROUND_Y && gvy >= 0) {
            handleLanding(GROUND_Y);
            onGround = true;
        }

        // ── Platform collision ──
        for (const p of platforms) {
            if (p.moving) {
                p.movePhase += p.moveSpeed * 0.02 * effectiveDt;
                p.y = p.baseY + Math.sin(p.movePhase) * p.moveRange;
            }
            const px = p.x - scrollX;
            if (gx > px - 5 && gx < px + p.w + 5 && footY >= p.y && footY <= p.y + 15 && gvy >= 0) {
                handleLanding(p.y);
                onGround = true;
                onPlatform = true;
            }
        }

        // ── Trampoline collision ──
        for (const tr of trampolines) {
            const tx = tr.x - scrollX;
            if (gx > tx && gx < tx + tr.w && footY >= tr.y && footY <= tr.y + 15 && gvy >= 0) {
                gy = tr.y - GOOFY_H / 2 - POGO_LEN;
                gvy = TRAMPOLINE_BOUNCE * (isSpaceEnv() ? 1.3 : 1);
                tr.bounce = 1;
                squash = 0.6;
                sfx('trampoline');
                addDust(gx, tr.y, 6);
                addFloat(gx, tr.y - 20, 'BOING!', '#FF6600', 18);
                flipAngle = 0;
                onGround = false;
            }
            tr.bounce *= 0.9;
        }

        // ── Wall collision ──
        for (const w of walls) {
            const wx = w.x - scrollX;
            const goofyLeft = gx - GOOFY_W / 2;
            const goofyRight = gx + GOOFY_W / 2;
            const goofyTop = gy - GOOFY_H / 2;
            const goofyBot = gy + GOOFY_H / 2 + POGO_LEN;
            if (goofyRight > wx && goofyLeft < wx + w.w && goofyBot > w.y && goofyTop < w.y + w.h) {
                die();
                return;
            }
        }

        // ── Breakable collision ──
        for (const b of breakables) {
            if (b.dead) continue;
            const bx = b.x - scrollX;
            const goofyBot = gy + GOOFY_H / 2 + POGO_LEN;
            if (gx > bx - 5 && gx < bx + b.w + 5 && goofyBot >= b.y && goofyBot <= b.y + b.h + 10 && gvy > 0) {
                if (chargeAmount > 0.3 || gvy > 6) {
                    b.dead = true;
                    sfx('break');
                    addParticles(bx + b.w/2, b.y + b.h/2, 10, '#A0522D', 4);
                    addFloat(bx + b.w/2, b.y, 'SMASH!', '#FF4444', 16);
                    score += 50;
                    gvy *= -0.5;
                } else {
                    handleLanding(b.y);
                    onGround = true;
                }
            }
        }

        // ── Collectible collision ──
        const goofyCX = gx, goofyCY = gy;
        const collectR = GOOFY_W;
        const inFlip = flipAngle >= FLIP_THRESHOLD;

        for (const c of coins) {
            if (c.collected) continue;
            const cx = c.x - scrollX;
            if (dist(goofyCX, goofyCY, cx, c.y) < collectR + COIN_R) {
                c.collected = true;
                const val = inFlip ? 20 : 10;
                score += val;
                sfx('coin');
                addFloat(cx, c.y, `+${val}`, '#FFD700', 14);
            }
        }
        for (const s of stars) {
            if (s.collected) continue;
            const sx = s.x - scrollX;
            if (dist(goofyCX, goofyCY, sx, s.y) < collectR + STAR_R) {
                s.collected = true;
                const val = inFlip ? 100 : 50;
                score += val;
                sfx('star');
                addFloat(sx, s.y, `+${val} STAR!`, '#FFFF00', 18);
                addParticles(sx, s.y, 8, '#FFFF00');
            }
        }
        for (const h of hotdogs) {
            if (h.collected) continue;
            const hx = h.x - scrollX;
            if (dist(goofyCX, goofyCY, hx, h.y) < collectR + HOTDOG_W) {
                h.collected = true;
                const val = inFlip ? 200 : 100;
                score += val;
                sfx('hotdog');
                addFloat(hx, h.y, `+${val} GAWRSH!`, '#FF6B35', 20);
                addParticles(hx, h.y, 12, '#FF6B35');
            }
        }

        // Off-screen death (fell below or pushed too far left)
        if (gy > GAME_H + 50) die();

        // Distance score
        score = Math.max(score, Math.floor(distanceM));

        // Squash-stretch recovery
        squash = lerp(squash, 1.0, 0.12);

        // Ear physics
        const earTarget1 = clamp(-gvy * 0.06 - angularVel * 2, -0.5, 0.5);
        const earTarget2 = clamp(-gvy * 0.05 - angularVel * 1.5, -0.4, 0.4);
        earAngle1 = lerp(earAngle1, earTarget1, 0.15);
        earAngle2 = lerp(earAngle2, earTarget2, 0.12);

        // Hat bounce
        hatOffset = lerp(hatOffset, onGround ? 0 : clamp(-gvy * 0.3, -3, 5), 0.2);

        // Coin bob
        for (const c of coins) { c.bobPhase += 0.05; }
        for (const s of stars) { s.sparkle += 0.08; }
        for (const h of hotdogs) { h.wobble += 0.06; }

        // Update particles
        dustParticles = dustParticles.filter(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life--; return p.life > 0; });
        particles = particles.filter(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life--; return p.life > 0; });
        floats = floats.filter(f => { f.y -= 0.8; f.life--; return f.life > 0; });

        // Generate
        generateAhead();
    }

    function handleLanding(surfaceY) {
        gy = surfaceY - GOOFY_H / 2 - POGO_LEN;
        const impactVel = gvy;
        gvy = 0;
        squash = clamp(0.5 + impactVel * 0.02, 0.5, 0.75);

        // Check flip completion
        if (flipAngle >= FLIP_THRESHOLD) {
            const nFlips = Math.floor(flipAngle / FLIP_THRESHOLD);
            const landAngle = Math.abs(normAngle(angle));
            if (landAngle < PERFECT_ANGLE) {
                // Perfect landing
                const pts = 100 * Math.pow(2, nFlips - 1);
                score += pts;
                sfx('flip');
                addFloat(gx, gy - 30, nFlips > 1 ? `${nFlips}x FLIP! +${pts}` : `FLIP! +${pts}`, '#00FF88', 20);
                addParticles(gx, gy + GOOFY_H/2, 8, '#00FF88');
            } else {
                // Bad landing — wobble stun
                stunTimer = WOBBLE_STUN_FRAMES;
                sfx('wobble');
                addFloat(gx, gy - 30, 'WOBBLE!', '#FF4444', 16);
                scrollSpeed *= 0.8;
            }
        }
        flipAngle = 0;

        // Auto-bounce or charged bounce
        if (charging) {
            // Will bounce on release
        } else {
            // Small auto bounce
            doBounce(false);
        }

        addDust(gx, surfaceY, 3 + Math.floor(impactVel * 0.5));
        lastBounceY = surfaceY;
    }

    function doBounce(charged) {
        if (!alive) return;
        let vel;
        if (charged) {
            vel = lerp(MIN_BOUNCE_VEL, MAX_BOUNCE_VEL, chargeAmount);
            if (chargeAmount > 0.5) sfx('bigbounce');
            else sfx('bounce', 0.8 + chargeAmount * 0.4);
        } else {
            vel = AUTO_BOUNCE_VEL;
            sfx('bounce', 0.7);
        }
        if (isSpaceEnv()) vel *= 1.3;
        if (inWater) { vel *= 0.6; sfx('splash'); }
        gvy = vel;
        squash = charged ? 1.3 + chargeAmount * 0.3 : 1.15;
        onGround = false;
        charging = false;
        chargeAmount = 0;
    }

    function die() {
        if (!alive) return;
        alive = false;
        sfx('die');
        addParticles(gx, gy, 15, '#FF4444', 5);
        bestScore = Math.max(bestScore, score);
        setTimeout(() => {
            state = GAMEOVER;
            if (onGameOver) onGameOver(score);
        }, 1200);
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── Drawing ──
    // ══════════════════════════════════════════════════════════════════════

    function draw() {
        const env = getEnv();
        ctx.save();

        // Sky
        const skyGrad = ctx.createLinearGradient(0, 0, 0, GAME_H);
        skyGrad.addColorStop(0, env.sky[0]);
        skyGrad.addColorStop(1, env.sky[1]);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Stars in space env
        if (isSpaceEnv()) drawSpaceStars();

        // Parallax
        drawParallax(env);

        // Ground
        drawGround(env);

        // Water pools
        drawWaterPools();

        // Trampolines
        drawTrampolines();

        // Breakables
        drawBreakables();

        // Platforms
        drawPlatforms();

        // Walls
        drawWalls();

        // Collectibles
        drawCoins();
        drawStars();
        drawHotdogs();

        // Dust / particles
        drawDust();
        drawParticlesFX();

        // Goofy
        if (alive || state === GAMEOVER) drawGoofy();

        // Floats
        drawFloats();

        // HUD
        drawHUD();

        // Speed boost flash
        if (speedBoostTimer > 0) {
            ctx.fillStyle = `rgba(255,200,0,${0.08 * Math.sin(speedBoostTimer * 0.3)})`;
            ctx.fillRect(0, 0, GAME_W, GAME_H);
        }

        // Overlays
        if (state === SPLASH) drawSplash();
        if (state === GAMEOVER) drawGameOver();

        ctx.restore();
    }

    function drawSpaceStars() {
        ctx.fillStyle = '#FFF';
        for (let i = 0; i < 60; i++) {
            const sx = ((i * 137 + scrollX * 0.05) % GAME_W);
            const sy = (i * 89) % GAME_H;
            const r = (i % 3 === 0) ? 1.5 : 0.8;
            ctx.globalAlpha = 0.4 + 0.3 * Math.sin(i + scrollX * 0.01);
            ctx.fillRect(sx, sy, r, r);
        }
        ctx.globalAlpha = 1;
    }

    function drawParallax(env) {
        for (let li = 0; li < parallaxLayers.length; li++) {
            const layer = parallaxLayers[li];
            const col = env.parallax[li] || env.parallax[0];
            ctx.fillStyle = col;
            ctx.globalAlpha = 0.5 + li * 0.15;
            for (const item of layer.items) {
                const sx = item.x - scrollX * layer.speed;
                // Draw as simple silhouette shapes
                ctx.beginPath();
                if (env.features === 'suburban') {
                    // Houses
                    ctx.rect(sx, item.y, item.w, item.h);
                    ctx.moveTo(sx - 5, item.y);
                    ctx.lineTo(sx + item.w / 2, item.y - 15 - li * 5);
                    ctx.lineTo(sx + item.w + 5, item.y);
                } else if (env.features === 'construction') {
                    // Cranes/beams
                    ctx.rect(sx, item.y, 8, item.h);
                    ctx.rect(sx - 10, item.y, item.w, 6);
                } else if (env.features === 'rooftops') {
                    // Buildings
                    ctx.rect(sx, item.y, item.w, item.h + 20);
                } else if (env.features === 'candy') {
                    // Lollipop trees
                    ctx.rect(sx + item.w/2 - 3, item.y, 6, item.h);
                    ctx.arc(sx + item.w/2, item.y - 5, 12 + li * 3, 0, Math.PI * 2);
                } else if (env.features === 'space') {
                    // Floating debris
                    ctx.arc(sx + item.w/2, item.y + item.h/2, 5 + li * 3, 0, Math.PI * 2);
                }
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
    }

    function drawGround(env) {
        ctx.fillStyle = env.ground;
        ctx.fillRect(0, GROUND_Y, GAME_W, GAME_H - GROUND_Y);
        // Top edge
        ctx.fillStyle = env.groundTop;
        ctx.fillRect(0, GROUND_Y - 3, GAME_W, 6);
        // Texture lines
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        for (let x = -(scrollX % 20); x < GAME_W; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, GROUND_Y + 10);
            ctx.lineTo(x + 10, GROUND_Y + 10);
            ctx.stroke();
        }
    }

    function drawWalls() {
        for (const w of walls) {
            const wx = w.x - scrollX;
            if (wx > GAME_W + 10 || wx + w.w < -10) continue;
            const env = getEnv();
            ctx.fillStyle = env.features === 'candy' ? '#FF69B4' :
                            env.features === 'space' ? '#606080' :
                            env.features === 'construction' ? '#8B7355' : '#6B6B6B';
            ctx.fillRect(wx, w.y, w.w, w.h);
            // Edge highlight
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(wx, w.y, 3, w.h);
            // Edge shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(wx + w.w - 3, w.y, 3, w.h);
        }
    }

    function drawPlatforms() {
        for (const p of platforms) {
            const px = p.x - scrollX;
            if (px > GAME_W + 10 || px + p.w < -10) continue;
            ctx.fillStyle = p.moving ? '#E8A020' : '#A08060';
            ctx.fillRect(px, p.y, p.w, p.h);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(px, p.y, p.w, 3);
        }
    }

    function drawTrampolines() {
        for (const tr of trampolines) {
            const tx = tr.x - scrollX;
            if (tx > GAME_W + 10 || tx + tr.w < -10) continue;
            const squish = tr.bounce * 4;
            ctx.fillStyle = '#FF4444';
            ctx.fillRect(tx, tr.y + squish, tr.w, tr.h - squish);
            // Springs
            ctx.strokeStyle = '#FFAA00';
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                const sx = tx + 10 + i * 15;
                ctx.beginPath();
                ctx.moveTo(sx, tr.y + tr.h);
                for (let j = 0; j < 4; j++) {
                    ctx.lineTo(sx + (j % 2 === 0 ? 5 : -5), tr.y + tr.h - (j + 1) * ((tr.h - squish) / 4));
                }
                ctx.stroke();
            }
        }
    }

    function drawBreakables() {
        for (const b of breakables) {
            if (b.dead) continue;
            const bx = b.x - scrollX;
            if (bx > GAME_W + 10 || bx + b.w < -10) continue;
            ctx.fillStyle = '#A0522D';
            ctx.fillRect(bx, b.y, b.w, b.h);
            // Crack pattern
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx + b.w * 0.3, b.y);
            ctx.lineTo(bx + b.w * 0.5, b.y + b.h * 0.5);
            ctx.lineTo(bx + b.w * 0.7, b.y + b.h);
            ctx.stroke();
            // X mark
            ctx.strokeStyle = 'rgba(255,200,0,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(bx + 5, b.y + 5); ctx.lineTo(bx + b.w - 5, b.y + b.h - 5);
            ctx.moveTo(bx + b.w - 5, b.y + 5); ctx.lineTo(bx + 5, b.y + b.h - 5);
            ctx.stroke();
        }
    }

    function drawWaterPools() {
        for (const wp of waterPools) {
            const wx = wp.x - scrollX;
            if (wx > GAME_W + 10 || wx + wp.w < -10) continue;
            ctx.fillStyle = 'rgba(30,100,200,0.45)';
            ctx.fillRect(wx, wp.y, wp.w, wp.h);
            // Ripples
            ctx.strokeStyle = 'rgba(100,180,255,0.5)';
            ctx.lineWidth = 1;
            const phase = scrollX * 0.05;
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(wx, wp.y + 3 + i * 4);
                for (let x = 0; x < wp.w; x += 8) {
                    ctx.lineTo(wx + x, wp.y + 3 + i * 4 + Math.sin(phase + x * 0.1 + i) * 2);
                }
                ctx.stroke();
            }
        }
    }

    function drawCoins() {
        for (const c of coins) {
            if (c.collected) continue;
            const cx = c.x - scrollX;
            const cy = c.y + Math.sin(c.bobPhase) * 3;
            if (cx < -10 || cx > GAME_W + 10) continue;
            // Gold coin
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(cx, cy, COIN_R, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFA500';
            ctx.beginPath();
            ctx.arc(cx, cy, COIN_R - 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('$', cx, cy + 1);
        }
    }

    function drawStars() {
        for (const s of stars) {
            if (s.collected) continue;
            const sx = s.x - scrollX;
            if (sx < -10 || sx > GAME_W + 10) continue;
            ctx.save();
            ctx.translate(sx, s.y);
            ctx.rotate(s.sparkle);
            ctx.fillStyle = '#FFFF00';
            drawStarShape(ctx, 0, 0, 5, STAR_R, STAR_R / 2);
            ctx.restore();
            // Glow
            ctx.globalAlpha = 0.3 + 0.15 * Math.sin(s.sparkle * 3);
            ctx.fillStyle = '#FFFF00';
            ctx.beginPath();
            ctx.arc(sx, s.y, STAR_R + 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    function drawStarShape(ctx, cx, cy, spikes, outerR, innerR) {
        let rot = -Math.PI / 2;
        const step = Math.PI / spikes;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            ctx.lineTo(cx + Math.cos(rot) * r, cy + Math.sin(rot) * r);
            rot += step;
        }
        ctx.closePath();
        ctx.fill();
    }

    function drawHotdogs() {
        for (const h of hotdogs) {
            if (h.collected) continue;
            const hx = h.x - scrollX;
            if (hx < -20 || hx > GAME_W + 20) continue;
            const wobble = Math.sin(h.wobble) * 0.15;
            ctx.save();
            ctx.translate(hx, h.y);
            ctx.rotate(wobble);
            // Bun
            ctx.fillStyle = '#D2A050';
            ctx.beginPath();
            ctx.ellipse(0, 0, HOTDOG_W / 2, HOTDOG_H / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            // Sausage
            ctx.fillStyle = '#C0392B';
            ctx.beginPath();
            ctx.ellipse(0, 0, HOTDOG_W / 2 - 3, HOTDOG_H / 2 - 2, 0, 0, Math.PI * 2);
            ctx.fill();
            // Mustard
            ctx.strokeStyle = '#F1C40F';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-6, 0);
            for (let i = -6; i <= 6; i += 3) {
                ctx.lineTo(i, (i % 6 === 0) ? -2 : 2);
            }
            ctx.stroke();
            ctx.restore();
        }
    }

    function drawDust() {
        for (const d of dustParticles) {
            ctx.globalAlpha = d.life / d.maxLife * 0.6;
            ctx.fillStyle = d.color;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r * (d.life / d.maxLife), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawParticlesFX() {
        for (const p of particles) {
            ctx.globalAlpha = p.life / p.maxLife * 0.8;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * (p.life / p.maxLife), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawFloats() {
        for (const f of floats) {
            ctx.globalAlpha = f.life / f.maxLife;
            ctx.fillStyle = f.color;
            ctx.font = `bold ${f.size}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 3;
            ctx.strokeText(f.text, f.x, f.y);
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── Draw Goofy ──
    // ══════════════════════════════════════════════════════════════════════
    function drawGoofy() {
        ctx.save();
        ctx.translate(gx, gy);

        // Death spin
        if (!alive) {
            ctx.rotate(angle + scrollX * 0.05);
            ctx.globalAlpha = Math.max(0, 1 - (scrollX - distanceM * 10) * 0.01);
        } else {
            ctx.rotate(angle);
        }

        // Stun wobble
        if (stunTimer > 0) {
            ctx.rotate(Math.sin(stunTimer * 0.8) * 0.15);
        }

        // Squash-stretch transform
        const sy = 1 / squash;
        const sx = squash;
        ctx.scale(sx, sy);

        // Charge compression
        const compressY = charging ? chargeAmount * 12 : 0;

        // ── Pogo Stick ──
        const pogoTop = GOOFY_H / 2 - 5 + compressY;
        const pogoBot = GOOFY_H / 2 + POGO_LEN - compressY * 0.5;

        // Pole
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, pogoTop);
        ctx.lineTo(0, pogoBot);
        ctx.stroke();

        // Handles
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-8, pogoTop + 2);
        ctx.lineTo(8, pogoTop + 2);
        ctx.stroke();

        // Spring coils
        ctx.strokeStyle = '#C0C0C0';
        ctx.lineWidth = 2;
        const springTop = pogoBot - 14 + compressY * 0.3;
        const springBot = pogoBot;
        const coilH = (springBot - springTop) / SPRING_COILS;
        ctx.beginPath();
        for (let i = 0; i <= SPRING_COILS; i++) {
            const cy = springTop + i * coilH;
            const dir = i % 2 === 0 ? 1 : -1;
            if (i === 0) ctx.moveTo(dir * 5, cy);
            else ctx.lineTo(dir * 5, cy);
        }
        ctx.stroke();

        // Spring bottom cap (foot pad)
        ctx.fillStyle = '#555';
        ctx.fillRect(-6, pogoBot - 2, 12, 4);

        // ── Body ──
        const bodyY = compressY * 0.3;

        // Legs (dangling in air, tucked when on ground/charging)
        ctx.fillStyle = '#333';
        if (onGround || charging) {
            // Tucked legs on pogo handles
            ctx.fillRect(-7, pogoTop - 2 + bodyY, 5, 8);
            ctx.fillRect(2, pogoTop - 2 + bodyY, 5, 8);
        } else {
            // Dangling legs
            const legDangle = Math.sin(scrollX * 0.05) * 3;
            ctx.fillRect(-8, GOOFY_H / 4 + bodyY, 5, 14 + legDangle);
            ctx.fillRect(3, GOOFY_H / 4 + bodyY, 5, 14 - legDangle);
        }

        // Big shoes
        ctx.fillStyle = '#8B4513';
        if (onGround || charging) {
            ctx.beginPath();
            ctx.ellipse(-6, pogoTop + 6 + bodyY, 7, 4, -0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(6, pogoTop + 6 + bodyY, 7, 4, 0.2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const shoeY = GOOFY_H / 4 + 12 + bodyY;
            ctx.beginPath();
            ctx.ellipse(-7, shoeY, 8, 4, -0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(5, shoeY, 8, 4, 0.3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Torso (stretched oval)
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.ellipse(0, -5 + bodyY, 12, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        // Vest/shirt
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(0, -2 + bodyY, 10, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Arms
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 3;
        if (onGround || charging) {
            // Holding handles
            ctx.beginPath();
            ctx.moveTo(-10, -8 + bodyY);
            ctx.lineTo(-8, pogoTop + 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(10, -8 + bodyY);
            ctx.lineTo(8, pogoTop + 2);
            ctx.stroke();
        } else {
            // Arms out
            const armWave = Math.sin(scrollX * 0.04) * 8;
            ctx.beginPath();
            ctx.moveTo(-10, -10 + bodyY);
            ctx.lineTo(-18, -5 + armWave + bodyY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(10, -10 + bodyY);
            ctx.lineTo(18, -5 - armWave + bodyY);
            ctx.stroke();
            // Gloved hands
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(-18, -5 + armWave + bodyY, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(18, -5 - armWave + bodyY, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Head ──
        const headY = -25 + bodyY;

        // Neck
        ctx.fillStyle = '#2A2A2A';
        ctx.fillRect(-3, headY + 12, 6, 6);

        // Head shape (Goofy-esque: tall oval)
        ctx.fillStyle = '#2A2A2A';
        ctx.beginPath();
        ctx.ellipse(0, headY, 11, 13, 0, 0, Math.PI * 2);
        ctx.fill();

        // Snout/muzzle (long, protruding)
        ctx.fillStyle = '#3A3A3A';
        ctx.beginPath();
        ctx.ellipse(8, headY + 4, 10, 6, 0.15, 0, Math.PI * 2);
        ctx.fill();
        // Nose
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.ellipse(16, headY + 2, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Eyes (two white ovals with pupils)
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.ellipse(-2, headY - 4, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(6, headY - 4, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Pupils
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(-1, headY - 3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(7, headY - 3, 2, 0, Math.PI * 2);
        ctx.fill();

        // Mouth (goofy grin)
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(8, headY + 6, 6, 0.1, Math.PI * 0.8);
        ctx.stroke();

        // Two front teeth
        ctx.fillStyle = '#FFF';
        ctx.fillRect(6, headY + 5, 2.5, 3);
        ctx.fillRect(9, headY + 5, 2.5, 3);

        // ── Ears (floppy, physics-driven) ──
        ctx.fillStyle = '#2A2A2A';
        // Left ear
        ctx.save();
        ctx.translate(-8, headY - 8);
        ctx.rotate(-0.6 + earAngle1);
        ctx.beginPath();
        ctx.ellipse(0, -EAR_LEN / 2, 5, EAR_LEN / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Right ear
        ctx.save();
        ctx.translate(4, headY - 10);
        ctx.rotate(0.3 + earAngle2);
        ctx.beginPath();
        ctx.ellipse(0, -EAR_LEN / 2, 5, EAR_LEN / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // ── Hat (Goofy's green hat) ──
        const hatY = headY - 12 + hatOffset;
        ctx.fillStyle = accentColor;
        // Hat brim
        ctx.beginPath();
        ctx.ellipse(0, hatY + 2, 14, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Hat top (tall, slightly bent)
        ctx.beginPath();
        ctx.moveTo(-8, hatY + 2);
        ctx.quadraticCurveTo(-9, hatY - 10, -3, hatY - 14);
        ctx.quadraticCurveTo(2, hatY - 16, 6, hatY - 12);
        ctx.quadraticCurveTo(10, hatY - 6, 8, hatY + 2);
        ctx.closePath();
        ctx.fill();
        // Hat band
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-8, hatY, 16, 3);

        // ── Charge indicator ──
        if (charging) {
            ctx.fillStyle = `rgba(255,${Math.floor(255 * (1 - chargeAmount))},0,0.7)`;
            ctx.fillRect(-15, GOOFY_H / 2 + POGO_LEN + 5, 30 * chargeAmount, 4);
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(-15, GOOFY_H / 2 + POGO_LEN + 5, 30, 4);
        }

        ctx.restore();
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── HUD ──
    // ══════════════════════════════════════════════════════════════════════
    function drawHUD() {
        // Score
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(5, 5, 120, 50);
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.floor(distanceM)}m`, 12, 25);
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`Score: ${score}`, 12, 42);

        // Environment name
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(getEnv().name, GAME_W - 10, 18);

        // Charge bar (on-screen)
        if (charging) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(GAME_W / 2 - 50, GAME_H - 25, 100, 10);
            ctx.fillStyle = `rgb(255,${Math.floor(255 * (1 - chargeAmount))},0)`;
            ctx.fillRect(GAME_W / 2 - 49, GAME_H - 24, 98 * chargeAmount, 8);
        }

        // Speed boost indicator
        if (speedBoostTimer > 0) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('SPEED BOOST!', GAME_W / 2, 20);
        }

        // Flip progress (if in air and rotating)
        if (!onGround && flipAngle > Math.PI * 0.5) {
            const progress = (flipAngle % (Math.PI * 2)) / (Math.PI * 2);
            ctx.strokeStyle = '#00FF88';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(GAME_W - 25, 40, 12, -Math.PI/2, -Math.PI/2 + progress * Math.PI * 2);
            ctx.stroke();
            const nFlips = Math.floor(flipAngle / FLIP_THRESHOLD);
            if (nFlips > 0) {
                ctx.fillStyle = '#00FF88';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`${nFlips}x`, GAME_W - 25, 44);
            }
        }
    }

    function drawSplash() {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Title
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("Goofy's Pogo Trip", GAME_W / 2, GAME_H / 2 - 60);

        // Bouncing preview character
        splashBounce += splashDir * 0.08;
        if (splashBounce > 1) splashDir = -1;
        if (splashBounce < -1) splashDir = 1;

        // Mini Goofy on pogo (simplified)
        const previewY = GAME_H / 2 - 15 + splashBounce * 10;
        ctx.save();
        ctx.translate(GAME_W / 2, previewY);
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2A2A2A';
        ctx.beginPath();
        ctx.ellipse(0, -15, 7, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        // Hat
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.ellipse(0, -23, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Pogo
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(0, 25);
        ctx.stroke();
        ctx.restore();

        // Instructions
        ctx.fillStyle = '#FFF';
        ctx.font = '14px sans-serif';
        ctx.fillText('HOLD Space/Tap to charge bounce', GAME_W / 2, GAME_H / 2 + 40);
        ctx.fillText('RELEASE for big bounce!', GAME_W / 2, GAME_H / 2 + 60);
        ctx.fillText('Arrow keys / tilt to steer in air', GAME_W / 2, GAME_H / 2 + 80);

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('TAP or PRESS SPACE to start', GAME_W / 2, GAME_H / 2 + 115);
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.fillStyle = '#FF4444';
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', GAME_W / 2, GAME_H / 2 - 40);

        ctx.fillStyle = '#FFF';
        ctx.font = '18px sans-serif';
        ctx.fillText(`Distance: ${Math.floor(distanceM)}m`, GAME_W / 2, GAME_H / 2);
        ctx.fillText(`Score: ${score}`, GAME_W / 2, GAME_H / 2 + 25);

        if (bestScore > 0) {
            ctx.fillStyle = '#FFD700';
            ctx.font = '14px sans-serif';
            ctx.fillText(`Best: ${bestScore}`, GAME_W / 2, GAME_H / 2 + 50);
        }

        ctx.fillStyle = '#FFF';
        ctx.font = '14px sans-serif';
        ctx.fillText('Tap or press Space to retry', GAME_W / 2, GAME_H / 2 + 85);
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── Game Loop ──
    // ══════════════════════════════════════════════════════════════════════
    function loop(ts) {
        if (!gameActive) return;
        if (!ts) ts = performance.now();
        const dt = lastTime ? Math.min((ts - lastTime) / 16.67, 3) : 1;
        lastTime = ts;

        update(dt);
        draw();

        animFrame = requestAnimationFrame(loop);
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── Input ──
    // ══════════════════════════════════════════════════════════════════════
    function handleKeyDown(e) {
        if (!gameActive) return;
        keys[e.key] = true;

        if (e.key === ' ' || e.key === 'Space') {
            e.preventDefault();
            if (state === SPLASH) { startGame(); return; }
            if (state === GAMEOVER) { resetGame(); return; }
            if (state === PLAYING && alive && !charging) {
                startCharge();
            }
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'd') {
            e.preventDefault();
        }
    }

    function handleKeyUp(e) {
        keys[e.key] = false;
        if ((e.key === ' ' || e.key === 'Space') && charging) {
            releaseCharge();
        }
    }

    function handleTouchStart(e) {
        if (!gameActive) return;
        e.preventDefault();
        if (state === SPLASH) { startGame(); return; }
        if (state === GAMEOVER) { resetGame(); return; }
        if (state !== PLAYING || !alive) return;

        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const tx = (touch.clientX - rect.left) / rect.width;

        if (tx < 0.25) {
            touchSide = -1;
        } else if (tx > 0.75) {
            touchSide = 1;
        } else {
            touchSide = 0;
        }

        if (!charging) startCharge();
        touchCharging = true;
    }

    function handleTouchEnd(e) {
        e.preventDefault();
        touchSide = 0;
        if (touchCharging && charging) {
            releaseCharge();
            touchCharging = false;
        }
    }

    function handleTouchMove(e) {
        if (!gameActive || state !== PLAYING) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const tx = (touch.clientX - rect.left) / rect.width;
        if (tx < 0.3) touchSide = -1;
        else if (tx > 0.7) touchSide = 1;
        else touchSide = 0;
    }

    function handleClick(e) {
        if (!gameActive) return;
        if (state === SPLASH) { startGame(); return; }
        if (state === GAMEOVER) { resetGame(); return; }
    }

    function startCharge() {
        charging = true;
        chargeStart = performance.now();
        chargeAmount = 0;
        sfx('charge');
    }

    function releaseCharge() {
        if (charging && alive) {
            doBounce(true);
        }
        charging = false;
        chargeAmount = 0;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── Game State ──
    // ══════════════════════════════════════════════════════════════════════
    function startGame() {
        state = PLAYING;
        resetState();
    }

    function resetGame() {
        state = PLAYING;
        resetState();
    }

    function resetState() {
        score = 0;
        distanceM = 0;
        scrollX = 0;
        scrollSpeed = SCROLL_SPEED_BASE;
        speedBoostTimer = 0;
        envIndex = 0;
        gx = 120;
        gy = GROUND_Y - GOOFY_H / 2 - POGO_LEN - 5;
        gvx = 0;
        gvy = 0;
        angle = 0;
        angularVel = 0;
        charging = false;
        chargeAmount = 0;
        onGround = true;
        squash = 1;
        earAngle1 = 0;
        earAngle2 = 0;
        hatOffset = 0;
        alive = true;
        flipAngle = 0;
        flipCount = 0;
        stunTimer = 0;
        tiltInput = 0;
        inWater = false;
        dustParticles = [];
        particles = [];
        floats = [];
        keys = {};
        touchSide = 0;
        touchCharging = false;
        genX = 0;
        nextObstacleX = 0;
        initWorld();
        // Start with a little bounce
        gvy = AUTO_BOUNCE_VEL;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── Canvas Fit ──
    // ══════════════════════════════════════════════════════════════════════
    function fitCanvas() {
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = GAME_W * dpr;
        canvas.height = GAME_H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const parent = canvas.parentElement;
        if (!parent) return;
        const cw = parent.clientWidth;
        const ch = parent.clientHeight;
        const aspect = GAME_W / GAME_H;
        let drawW, drawH;
        if (cw / ch > aspect) { drawH = ch; drawW = ch * aspect; }
        else { drawW = cw; drawH = cw / aspect; }
        canvas.style.width = drawW + 'px';
        canvas.style.height = drawH + 'px';
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── Public API ──
    // ══════════════════════════════════════════════════════════════════════
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer || null;
        onGameOver = gameOverCallback || null;
        gameActive = true;

        // Theme
        const themeId = activePlayer?.theme || 'retro';
        theme = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        TC = theme ? theme.colors : ['#22AA44','#3388FF','#FF6600','#FBBF24','#A78BFA','#F43F5E'];
        TBG = theme ? theme.bgGradient : ['#87CEEB','#B0E0E6'];
        accentColor = (activePlayer?.color) || (TC[0]) || '#22AA44';

        // Reset
        state = SPLASH;
        bestScore = 0;
        lastTime = 0;
        splashBounce = 0;
        splashDir = 1;
        resetState();
        state = SPLASH; // resetState sets PLAYING, override back

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        // Bind input
        if (!inputBound) {
            canvas.addEventListener('click', handleClick);
            canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
            canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
            canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
            document.addEventListener('keydown', handleKeyDown);
            document.addEventListener('keyup', handleKeyUp);
            window.addEventListener('resize', fitCanvas);
            inputBound = true;
        }

        loop();
    }

    function destroy() {
        gameActive = false;
        if (animFrame) {
            cancelAnimationFrame(animFrame);
            animFrame = null;
        }
        if (canvas) {
            canvas.removeEventListener('click', handleClick);
            canvas.removeEventListener('touchstart', handleTouchStart);
            canvas.removeEventListener('touchend', handleTouchEnd);
            canvas.removeEventListener('touchmove', handleTouchMove);
        }
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('resize', fitCanvas);
        inputBound = false;
        if (audioCtx) {
            try { audioCtx.close(); } catch(e) {}
            audioCtx = null;
        }
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return Math.floor(distanceM / 500) + 1; },
        isActive() { return gameActive; }
    };
})();
