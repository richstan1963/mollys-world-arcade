/* CoasterRide — Roller coaster platformer for Your World Arcade */
window.CoasterRide = (() => {
    // ── Constants ──
    const GAME_W = 640, GAME_H = 400;
    const CART_W = 36, CART_H = 20;
    const CHAR_H = 18;
    const GRAVITY = 0.35;
    const JUMP_VEL = -7.5;
    const MAX_FALL_VEL = 12;
    const BASE_SPEED = 2.8;
    const MAX_SPEED = 9;
    const COIN_R = 6;
    const STAR_R = 8;
    const TRACK_SEGMENT_LEN = 60;
    const TRACK_RAIL_GAP = 14;
    const TIE_SPACING = 12;
    const SPRING_H = 10;

    // States
    const ST_TITLE = 0, ST_PLAY = 1, ST_DEAD = 2;

    // Theme zones
    const ZONES = [
        { name: 'Wooden Coaster', dist: 0,    sky: ['#87CEEB','#4A90D9'], rail: '#8B4513', tie: '#654321', bg: '#228B22' },
        { name: 'Steel Coaster',  dist: 2000,  sky: ['#1a1a2e','#16213e'], rail: '#A0A0A0', tie: '#707070', bg: '#2d3436' },
        { name: 'Space Coaster',  dist: 4000,  sky: ['#0a0a23','#1b0033'], rail: '#00FFFF', tie: '#006666', bg: '#0a0a23' },
        { name: 'Underwater',     dist: 6000,  sky: ['#006994','#003545'], rail: '#20B2AA', tie: '#008080', bg: '#004953' }
    ];

    // ── State ──
    let canvas, ctx, W, H, SCALE, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor;
    let state, frameCount, lastTime;
    let score, coins, lives, distance, speed, level;
    let trackPoints, trackIdx, trackT;
    let cart; // { x, y, angle, onTrack, vy, jumping, ducking }
    let collectibles, hazards, particles, floatTexts;
    let springs, shields;
    let shieldActive, shieldTimer;
    let screenShake, screenShakeTimer;
    let cameraX, cameraZoom;
    let comboCount, comboTimer;
    let keys = {};
    let clackTimer, lastClackSpeed;
    let zoneIdx;
    let deathTimer;
    let sparkParticles;
    let loopSections; // track which segments are in loops
    let bigDropActive;
    let bestScore = 0;

    // Touch
    const HAS_TOUCH = ('ontouchstart' in window);
    let touchStartX, touchStartY, touchActive = false;

    // Audio
    let audioCtx;
    function getAudio() {
        if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }
    function playTone(freq, dur, type = 'square', vol = 0.1, slide = 0) {
        try {
            const a = getAudio(); if (!a) return;
            const o = a.createOscillator(), g = a.createGain();
            o.type = type; o.frequency.setValueAtTime(freq, a.currentTime);
            if (slide) o.frequency.linearRampToValueAtTime(slide, a.currentTime + dur);
            g.gain.setValueAtTime(vol, a.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
            o.connect(g); g.connect(a.destination);
            o.start(); o.stop(a.currentTime + dur);
        } catch {}
    }
    function sfxJump() { playTone(400, 0.12, 'sine', 0.12, 800); }
    function sfxCoin() { playTone(1000, 0.06, 'sine', 0.1); setTimeout(() => playTone(1300, 0.07, 'sine', 0.1), 35); }
    function sfxStar() { playTone(800, 0.1, 'sine', 0.12); setTimeout(() => playTone(1000, 0.1, 'sine', 0.12), 60); setTimeout(() => playTone(1200, 0.12, 'sine', 0.12), 120); }
    function sfxHit() { playTone(180, 0.3, 'sawtooth', 0.15, 60); }
    function sfxDeath() { playTone(300, 0.5, 'sawtooth', 0.12, 50); }
    function sfxSpring() { playTone(300, 0.15, 'sine', 0.1, 900); }
    function sfxWhoosh() { playTone(100, 0.3, 'sawtooth', 0.04, 400); }
    function sfxLand() { playTone(120, 0.08, 'square', 0.08); }
    function sfxShield() { playTone(600, 0.15, 'triangle', 0.1, 1200); }
    function sfxBoost() { playTone(500, 0.12, 'sawtooth', 0.06, 1000); }
    function sfxClack() {
        const spd = Math.min(speed / MAX_SPEED, 1);
        playTone(80 + spd * 60, 0.03, 'square', 0.03 + spd * 0.02);
    }
    function sfxLoop() { playTone(400, 0.3, 'triangle', 0.08, 800); }
    function sfxWhee() {
        playTone(600, 0.2, 'sine', 0.06, 1000);
        setTimeout(() => playTone(800, 0.15, 'sine', 0.05, 600), 100);
    }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const gx = v => v * SCALE;
    const gy = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function hexToRgb(hex) {
        return { r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16) };
    }

    // ── Canvas Fitting ──
    function fitCanvas() {
        if (!canvas) return;
        const p = canvas.parentElement || document.body;
        const pw = p.clientWidth || 960, ph = p.clientHeight || 600;
        const aspect = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > aspect) { ch = ph; cw = ch * aspect; }
        else { cw = pw; ch = cw / aspect; }
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        W = canvas.width; H = canvas.height;
        SCALE = W / GAME_W;
    }

    // ═══════════════════════════════════════════
    // ── TRACK GENERATION ──
    // ═══════════════════════════════════════════
    // Track is an array of {x, y} control points.
    // Cart interpolates along them using cubic catmull-rom.
    // We generate track in chunks ahead of the camera.

    function catmullRom(p0, p1, p2, p3, t) {
        const t2 = t * t, t3 = t2 * t;
        return {
            x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
            y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3)
        };
    }

    function catmullTangent(p0, p1, p2, p3, t) {
        const t2 = t * t;
        return {
            x: 0.5 * ((-p0.x+p2.x) + (4*p0.x-10*p1.x+8*p2.x-2*p3.x)*t + (-3*p0.x+9*p1.x-9*p2.x+3*p3.x)*t2),
            y: 0.5 * ((-p0.y+p2.y) + (4*p0.y-10*p1.y+8*p2.y-2*p3.y)*t + (-3*p0.y+9*p1.y-9*p2.y+3*p3.y)*t2)
        };
    }

    function getTrackPos(idx, t) {
        const i0 = Math.max(0, idx - 1);
        const i1 = idx;
        const i2 = Math.min(trackPoints.length - 1, idx + 1);
        const i3 = Math.min(trackPoints.length - 1, idx + 2);
        return catmullRom(trackPoints[i0], trackPoints[i1], trackPoints[i2], trackPoints[i3], t);
    }

    function getTrackTangent(idx, t) {
        const i0 = Math.max(0, idx - 1);
        const i1 = idx;
        const i2 = Math.min(trackPoints.length - 1, idx + 1);
        const i3 = Math.min(trackPoints.length - 1, idx + 2);
        return catmullTangent(trackPoints[i0], trackPoints[i1], trackPoints[i2], trackPoints[i3], t);
    }

    function getTrackAngle(idx, t) {
        const tan = getTrackTangent(idx, t);
        return Math.atan2(tan.y, tan.x);
    }

    // Speed multiplier based on track slope
    function getSpeedMult(angle) {
        const slope = Math.sin(angle);
        // Going down = fast, going up = slow
        if (slope > 0) return 1 + slope * 1.8; // downhill boost
        if (slope < 0) return Math.max(0.35, 1 + slope * 0.7); // uphill slow
        return 1;
    }

    let generateX = 0;
    let gapPositions = []; // track x positions where gaps exist
    let loopCenters = [];  // {x, y, r} for loops

    function generateInitialTrack() {
        trackPoints = [];
        gapPositions = [];
        loopCenters = [];
        generateX = 0;

        // Start flat
        const startY = GAME_H * 0.65;
        for (let i = 0; i < 8; i++) {
            trackPoints.push({ x: i * TRACK_SEGMENT_LEN, y: startY, type: 'flat' });
        }
        generateX = 7 * TRACK_SEGMENT_LEN;

        // Generate ahead
        for (let i = 0; i < 60; i++) generateNextSegment();
    }

    function generateNextSegment() {
        const last = trackPoints[trackPoints.length - 1];
        const prevY = last.y;
        const distNow = generateX;
        const diff = distNow / 1000; // difficulty ramp

        // Pick a pattern
        const roll = Math.random();
        let seg;

        if (roll < 0.15 && diff > 0.5) {
            // GAP
            seg = generateGap(last, diff);
        } else if (roll < 0.25 && diff > 1.5) {
            // LOOP
            seg = generateLoop(last, diff);
        } else if (roll < 0.45) {
            // BIG DROP
            seg = generateDrop(last, diff);
        } else if (roll < 0.65) {
            // HILL
            seg = generateHill(last, diff);
        } else if (roll < 0.78 && diff > 0.8) {
            // JUMP RAMP
            seg = generateJumpRamp(last, diff);
        } else {
            // Gentle undulation
            seg = generateGentle(last, diff);
        }

        for (const pt of seg) {
            trackPoints.push(pt);
            generateX = pt.x;
        }
    }

    function generateGentle(last, diff) {
        const pts = [];
        const count = 3 + Math.floor(Math.random() * 3);
        let cx = last.x, cy = last.y;
        for (let i = 0; i < count; i++) {
            cx += TRACK_SEGMENT_LEN;
            cy += rng(-25, 25);
            cy = clamp(cy, GAME_H * 0.25, GAME_H * 0.82);
            pts.push({ x: cx, y: cy, type: 'normal' });
        }
        return pts;
    }

    function generateHill(last, diff) {
        const pts = [];
        let cx = last.x, cy = last.y;
        const height = 40 + diff * 15 + rng(0, 30);
        const steps = 4;
        // Go up
        for (let i = 0; i < steps; i++) {
            cx += TRACK_SEGMENT_LEN;
            cy -= height / steps;
            pts.push({ x: cx, y: clamp(cy, 40, GAME_H * 0.85), type: 'normal' });
        }
        // Peak
        cx += TRACK_SEGMENT_LEN * 0.7;
        pts.push({ x: cx, y: clamp(cy, 40, GAME_H * 0.85), type: 'peak' });
        // Go down
        for (let i = 0; i < steps; i++) {
            cx += TRACK_SEGMENT_LEN;
            cy += height / steps;
            pts.push({ x: cx, y: clamp(cy, 40, GAME_H * 0.85), type: 'normal' });
        }
        // Add coins on the hill
        const peakPt = pts[steps];
        addCoinArc(peakPt.x - 80, peakPt.x + 80, peakPt.y - 30, peakPt.y);
        return pts;
    }

    function generateDrop(last, diff) {
        const pts = [];
        let cx = last.x, cy = last.y;
        // Slight climb
        cx += TRACK_SEGMENT_LEN;
        cy -= 20;
        pts.push({ x: cx, y: clamp(cy, 30, GAME_H * 0.85), type: 'normal' });
        // Edge
        cx += TRACK_SEGMENT_LEN * 0.5;
        pts.push({ x: cx, y: clamp(cy, 30, GAME_H * 0.85), type: 'dropEdge' });
        // Drop!
        const dropH = 60 + diff * 20 + rng(0, 40);
        cx += TRACK_SEGMENT_LEN * 0.4;
        cy += dropH * 0.5;
        pts.push({ x: cx, y: clamp(cy, 40, GAME_H * 0.88), type: 'drop' });
        cx += TRACK_SEGMENT_LEN * 0.4;
        cy += dropH * 0.5;
        pts.push({ x: cx, y: clamp(cy, 40, GAME_H * 0.88), type: 'drop' });
        // Flatten out
        cx += TRACK_SEGMENT_LEN;
        pts.push({ x: cx, y: clamp(cy, 40, GAME_H * 0.88), type: 'normal' });
        // Coins along drop
        addCoinLine(pts[1].x, pts[3].x, pts[1].y, pts[3].y, 5);
        // Star at steepest point
        collectibles.push({ type: 'star', x: pts[2].x, y: pts[2].y - 35, collected: false });
        return pts;
    }

    function generateGap(last, diff) {
        const pts = [];
        let cx = last.x, cy = last.y;
        // Approach
        cx += TRACK_SEGMENT_LEN;
        pts.push({ x: cx, y: cy, type: 'normal' });
        // Mark gap start
        const gapStart = cx;
        cx += TRACK_SEGMENT_LEN * (1.2 + diff * 0.15);
        const gapEnd = cx;
        gapPositions.push({ start: gapStart, end: gapEnd, y: cy });
        // After gap
        const landY = cy + rng(-20, 20);
        pts.push({ x: cx, y: clamp(landY, 50, GAME_H * 0.85), type: 'gapLand' });
        cx += TRACK_SEGMENT_LEN;
        pts.push({ x: cx, y: clamp(landY, 50, GAME_H * 0.85), type: 'normal' });
        // Coins over gap
        addCoinArc(gapStart, gapEnd, cy - 50, cy - 20);
        return pts;
    }

    function generateLoop(last, diff) {
        const pts = [];
        let cx = last.x, cy = last.y;
        const r = 45 + rng(0, 15);
        const centerX = cx + TRACK_SEGMENT_LEN * 2;
        const centerY = cy - r;
        loopCenters.push({ x: centerX, y: centerY, r: r });

        // Enter from bottom-left, go up, over top, down right
        const steps = 12;
        for (let i = 0; i <= steps; i++) {
            const angle = Math.PI + (i / steps) * Math.PI * 2;
            const px = centerX + Math.cos(angle) * r;
            const py = centerY + Math.sin(angle) * r;
            pts.push({ x: px, y: py, type: i > 2 && i < steps - 2 ? 'loop' : 'normal' });
        }
        // Flatten exit
        const exit = pts[pts.length - 1];
        pts.push({ x: exit.x + TRACK_SEGMENT_LEN, y: exit.y, type: 'normal' });

        // Coins around the loop
        for (let i = 3; i < steps - 2; i += 2) {
            const angle = Math.PI + (i / steps) * Math.PI * 2;
            collectibles.push({
                type: 'coin', x: centerX + Math.cos(angle) * (r + 18),
                y: centerY + Math.sin(angle) * (r + 18), collected: false
            });
        }
        return pts;
    }

    function generateJumpRamp(last, diff) {
        const pts = [];
        let cx = last.x, cy = last.y;
        // Approach
        cx += TRACK_SEGMENT_LEN;
        pts.push({ x: cx, y: cy, type: 'normal' });
        // Ramp up
        cx += TRACK_SEGMENT_LEN * 0.7;
        cy -= 35;
        pts.push({ x: cx, y: clamp(cy, 40, GAME_H * 0.85), type: 'ramp' });
        // Launch edge
        cx += TRACK_SEGMENT_LEN * 0.3;
        cy -= 25;
        pts.push({ x: cx, y: clamp(cy, 30, GAME_H * 0.85), type: 'launch' });
        // Gap after ramp
        cx += TRACK_SEGMENT_LEN * 1.5;
        const landY = last.y + rng(-10, 20);
        gapPositions.push({ start: pts[pts.length-1].x, end: cx, y: pts[pts.length-1].y });
        pts.push({ x: cx, y: clamp(landY, 50, GAME_H * 0.85), type: 'gapLand' });
        cx += TRACK_SEGMENT_LEN;
        pts.push({ x: cx, y: clamp(landY, 50, GAME_H * 0.85), type: 'normal' });

        // Star at peak of jump arc
        collectibles.push({ type: 'star', x: pts[2].x + TRACK_SEGMENT_LEN * 0.75, y: pts[2].y - 50, collected: false });
        // Spring on the ramp
        springs.push({ x: pts[2].x, y: pts[2].y - 3 });
        return pts;
    }

    // ── Collectible Helpers ──
    function addCoinArc(x1, x2, yTop, yBot) {
        const count = 5;
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            const x = lerp(x1, x2, t);
            const y = yBot - Math.sin(t * Math.PI) * (yBot - yTop);
            collectibles.push({ type: 'coin', x, y, collected: false });
        }
    }

    function addCoinLine(x1, x2, y1, y2, count) {
        for (let i = 0; i < count; i++) {
            const t = (i + 0.5) / count;
            collectibles.push({ type: 'coin', x: lerp(x1, x2, t), y: lerp(y1, y2, t) - 25, collected: false });
        }
    }

    // ── Hazard Generation ──
    function spawnHazards(segX, segY) {
        const diff = distance / 1000;
        if (Math.random() < 0.12 + diff * 0.02) {
            // Overhead bar
            hazards.push({ type: 'bar', x: segX, y: segY - 28, w: 40, h: 8 });
        }
        if (Math.random() < 0.08 + diff * 0.015) {
            // Bird
            const birdY = segY - rng(20, 55);
            hazards.push({ type: 'bird', x: segX + 300, y: birdY, vx: -(1.5 + diff * 0.3), frame: 0 });
        }
        if (Math.random() < 0.06 + diff * 0.01) {
            // Pendulum
            hazards.push({ type: 'pendulum', x: segX, y: segY - 60, angle: 0, speed: 0.03 + diff * 0.005, len: 35 });
        }
        if (Math.random() < 0.04 + diff * 0.01) {
            // Oncoming cart
            hazards.push({ type: 'oncoming', x: segX + 400, y: segY - 5, vx: -(2 + diff * 0.3) });
        }
        if (Math.random() < 0.05 + diff * 0.01) {
            // Fire hoop
            hazards.push({ type: 'fireHoop', x: segX, y: segY - 30, r: 22, passed: false });
        }
    }

    // ═══════════════════════════════════════════
    // ── GAME RESET ──
    // ═══════════════════════════════════════════
    function resetGame() {
        score = 0; coins = 0; lives = 3; distance = 0; speed = BASE_SPEED;
        level = 1; frameCount = 0; zoneIdx = 0;
        trackIdx = 2; trackT = 0;
        collectibles = []; hazards = []; particles = [];
        floatTexts = []; springs = []; shields = [];
        sparkParticles = [];
        shieldActive = false; shieldTimer = 0;
        screenShake = 0; screenShakeTimer = 0;
        cameraX = 0; cameraZoom = 1;
        comboCount = 0; comboTimer = 0;
        clackTimer = 0; lastClackSpeed = 0;
        deathTimer = 0; bigDropActive = false;

        cart = {
            x: 120, y: GAME_H * 0.65,
            angle: 0, onTrack: true,
            vy: 0, jumping: false, ducking: false,
            airTime: 0, expression: 'normal',
            scarfTrail: []
        };

        generateInitialTrack();

        // Initial shields
        shields.push({ x: trackPoints[15]?.x || 500, y: (trackPoints[15]?.y || 200) - 30 });

        // Spawn initial hazards for segments beyond tutorial
        for (let i = 20; i < trackPoints.length; i += 4) {
            if (trackPoints[i]) spawnHazards(trackPoints[i].x, trackPoints[i].y);
        }
    }

    // ═══════════════════════════════════════════
    // ── UPDATE ──
    // ═══════════════════════════════════════════
    function update() {
        frameCount++;
        const dt = 1; // fixed timestep

        // Speed based on slope
        if (cart.onTrack && trackIdx < trackPoints.length - 2) {
            const angle = getTrackAngle(trackIdx, trackT);
            const mult = getSpeedMult(angle);
            speed = clamp(BASE_SPEED * mult + distance * 0.0002, BASE_SPEED * 0.35, MAX_SPEED);
        }

        // Track following
        if (cart.onTrack && !cart.jumping) {
            // Advance along track
            const spd = speed * 0.018;
            trackT += spd;
            while (trackT >= 1 && trackIdx < trackPoints.length - 3) {
                trackT -= 1;
                trackIdx++;
            }

            if (trackIdx >= trackPoints.length - 3) {
                // Generate more track
                for (let i = 0; i < 30; i++) generateNextSegment();
                // Spawn hazards on new track
                for (let i = trackPoints.length - 30; i < trackPoints.length; i += 4) {
                    if (trackPoints[i]) spawnHazards(trackPoints[i].x, trackPoints[i].y);
                }
                // Occasional shield
                if (Math.random() < 0.1) {
                    const si = trackPoints.length - 15;
                    if (trackPoints[si]) shields.push({ x: trackPoints[si].x, y: trackPoints[si].y - 30 });
                }
            }

            const pos = getTrackPos(trackIdx, trackT);
            const angle = getTrackAngle(trackIdx, trackT);

            // Check if we're in a gap
            let inGap = false;
            for (const gap of gapPositions) {
                if (pos.x > gap.start && pos.x < gap.end) {
                    inGap = true;
                    break;
                }
            }

            if (inGap && !cart.jumping) {
                // Falling into gap!
                cart.onTrack = false;
                cart.vy = 1;
                cart.airTime = 0;
            } else {
                cart.x = pos.x;
                cart.y = pos.y;
                cart.angle = angle;
                cart.airTime = 0;
            }

            // Big drop detection
            if (angle > 0.5 && speed > BASE_SPEED * 1.5) {
                if (!bigDropActive) {
                    bigDropActive = true;
                    sfxWhee();
                    cart.expression = 'whee';
                    cameraZoom = 0.92; // zoom out for drama
                }
            } else {
                if (bigDropActive) {
                    bigDropActive = false;
                    cart.expression = 'normal';
                }
                cameraZoom = lerp(cameraZoom, 1, 0.05);
            }

            // Loop detection
            const curPt = trackPoints[trackIdx];
            if (curPt && curPt.type === 'loop') {
                cart.expression = 'loop';
                if (frameCount % 30 === 0) sfxLoop();
            }

            // Track clacking
            clackTimer += speed;
            if (clackTimer > 18) {
                clackTimer = 0;
                sfxClack();
                // Spark
                sparkParticles.push({
                    x: cart.x - Math.cos(cart.angle) * 12,
                    y: cart.y + 6,
                    vx: rng(-1, 1), vy: rng(-2, 0),
                    life: 8 + rng(0, 6), color: speed > 5 ? '#FFA500' : '#FFD700'
                });
            }
        }

        // Airborne / jumping
        if (!cart.onTrack || cart.jumping) {
            cart.vy += GRAVITY;
            cart.vy = Math.min(cart.vy, MAX_FALL_VEL);
            cart.y += cart.vy;
            cart.x += speed * 0.6;
            cart.airTime++;
            cart.angle = Math.atan2(cart.vy, speed * 2) * 0.5;

            // Check landing on track
            if (cart.vy > 0) {
                for (let ci = Math.max(0, trackIdx - 2); ci < Math.min(trackPoints.length - 2, trackIdx + 8); ci++) {
                    for (let ct = 0; ct < 1; ct += 0.1) {
                        const tp = getTrackPos(ci, ct);
                        const dx = cart.x - tp.x, dy = cart.y - tp.y;
                        if (Math.abs(dx) < 20 && dy > -5 && dy < 15) {
                            // Check not in a gap
                            let inGap = false;
                            for (const gap of gapPositions) {
                                if (tp.x > gap.start && tp.x < gap.end) { inGap = true; break; }
                            }
                            if (!inGap) {
                                cart.onTrack = true;
                                cart.jumping = false;
                                cart.vy = 0;
                                trackIdx = ci;
                                trackT = ct;
                                cart.x = tp.x;
                                cart.y = tp.y;
                                sfxLand();
                                screenShake = 2;
                                screenShakeTimer = 6;
                                cart.expression = 'normal';
                                // Landing particles
                                for (let p = 0; p < 5; p++) {
                                    particles.push({
                                        x: cart.x + rng(-10, 10), y: cart.y + 5,
                                        vx: rng(-2, 2), vy: rng(-3, -1),
                                        life: 15, color: '#A0A0A0', r: rng(2, 4)
                                    });
                                }
                                break;
                            }
                        }
                    }
                    if (cart.onTrack) break;
                }
            }

            // Fell off screen
            if (cart.y > GAME_H + 50) {
                loseLife();
            }
        }

        // Springs
        for (const sp of springs) {
            const dx = cart.x - sp.x, dy = cart.y - sp.y;
            if (Math.abs(dx) < 15 && Math.abs(dy) < 15 && cart.vy >= 0) {
                cart.vy = JUMP_VEL * 1.4;
                cart.jumping = true;
                cart.onTrack = false;
                sfxSpring();
                for (let p = 0; p < 6; p++) {
                    particles.push({
                        x: sp.x + rng(-5, 5), y: sp.y,
                        vx: rng(-2, 2), vy: rng(-4, -1),
                        life: 12, color: '#00FF00', r: 3
                    });
                }
            }
        }

        // Distance
        distance = cart.x;

        // Zone check
        for (let i = ZONES.length - 1; i >= 0; i--) {
            if (distance >= ZONES[i].dist) { zoneIdx = i; break; }
        }
        level = zoneIdx + 1;

        // Camera
        cameraX = lerp(cameraX, cart.x - GAME_W * 0.3, 0.08);

        // Collect items
        for (const c of collectibles) {
            if (c.collected) continue;
            const dx = cart.x - c.x, dy = cart.y - c.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const range = c.type === 'star' ? STAR_R + 12 : COIN_R + 14;
            if (dist < range) {
                c.collected = true;
                if (c.type === 'coin') {
                    score += 10 * (1 + comboCount * 0.1);
                    coins++;
                    comboCount++;
                    comboTimer = 90;
                    sfxCoin();
                    floatTexts.push({ x: c.x, y: c.y, text: '+10', life: 30, color: '#FFD700' });
                } else {
                    score += 50;
                    sfxStar();
                    floatTexts.push({ x: c.x, y: c.y, text: '+50', life: 40, color: '#FFFFFF' });
                    // Star burst
                    for (let p = 0; p < 10; p++) {
                        const a = (p / 10) * Math.PI * 2;
                        particles.push({
                            x: c.x, y: c.y,
                            vx: Math.cos(a) * 3, vy: Math.sin(a) * 3,
                            life: 20, color: '#FFFF00', r: 3
                        });
                    }
                }
            }
        }

        // Shields
        for (let i = shields.length - 1; i >= 0; i--) {
            const s = shields[i];
            const dx = cart.x - s.x, dy = cart.y - s.y;
            if (Math.sqrt(dx*dx + dy*dy) < 18) {
                shieldActive = true;
                shieldTimer = 300;
                shields.splice(i, 1);
                sfxShield();
                floatTexts.push({ x: s.x, y: s.y, text: 'SHIELD!', life: 40, color: '#00BFFF' });
            }
        }

        if (shieldActive) {
            shieldTimer--;
            if (shieldTimer <= 0) shieldActive = false;
        }

        // Combo timer
        if (comboTimer > 0) {
            comboTimer--;
            if (comboTimer <= 0) comboCount = 0;
        }

        // Hazard collision
        for (let i = hazards.length - 1; i >= 0; i--) {
            const h = hazards[i];
            // Update moving hazards
            if (h.type === 'bird') {
                h.x += h.vx;
                h.frame++;
            }
            if (h.type === 'oncoming') {
                h.x += h.vx;
            }
            if (h.type === 'pendulum') {
                h.angle = Math.sin(frameCount * h.speed) * 1.2;
            }

            // Remove off-screen
            if (h.x < cameraX - 100) { hazards.splice(i, 1); continue; }

            // Collision check
            const cx = cart.x, cy = cart.y;
            let hit = false;

            if (h.type === 'bar') {
                if (!cart.ducking && cx > h.x - h.w/2 && cx < h.x + h.w/2 && cy - 15 < h.y + h.h && cy > h.y) {
                    hit = true;
                }
            } else if (h.type === 'bird') {
                if (Math.abs(cx - h.x) < 16 && Math.abs(cy - 8 - h.y) < 14) hit = true;
            } else if (h.type === 'oncoming') {
                if (Math.abs(cx - h.x) < 20 && Math.abs(cy - h.y) < 14 && !cart.jumping) hit = true;
            } else if (h.type === 'pendulum') {
                const bobX = h.x + Math.sin(h.angle) * h.len;
                const bobY = h.y + Math.cos(h.angle) * h.len;
                if (Math.abs(cx - bobX) < 12 && Math.abs(cy - 6 - bobY) < 12) hit = true;
            } else if (h.type === 'fireHoop') {
                const dx = cx - h.x, dy = (cy - 6) - h.y;
                const d = Math.sqrt(dx*dx + dy*dy);
                if (d < h.r + 8 && d > h.r - 10 && !h.passed) {
                    // Must be jumping through center
                    if (cart.jumping && Math.abs(dy) < 8) {
                        h.passed = true;
                        score += 30;
                        sfxBoost();
                        floatTexts.push({ x: h.x, y: h.y - 20, text: 'CLEAN! +30', life: 35, color: '#FF4500' });
                    } else if (d < h.r + 5) {
                        hit = true;
                    }
                }
            }

            if (hit) {
                if (shieldActive) {
                    shieldActive = false;
                    shieldTimer = 0;
                    hazards.splice(i, 1);
                    sfxShield();
                    floatTexts.push({ x: cx, y: cy - 20, text: 'BLOCKED!', life: 30, color: '#00BFFF' });
                    screenShake = 3; screenShakeTimer = 8;
                } else {
                    loseLife();
                    hazards.splice(i, 1);
                    break;
                }
            }
        }

        // Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.1;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = sparkParticles.length - 1; i >= 0; i--) {
            const s = sparkParticles[i];
            s.x += s.vx; s.y += s.vy; s.vy += 0.05;
            s.life--;
            if (s.life <= 0) sparkParticles.splice(i, 1);
        }
        for (let i = floatTexts.length - 1; i >= 0; i--) {
            floatTexts[i].y -= 0.8;
            floatTexts[i].life--;
            if (floatTexts[i].life <= 0) floatTexts.splice(i, 1);
        }

        // Scarf trail
        if (cart.scarfTrail.length > 8) cart.scarfTrail.shift();
        cart.scarfTrail.push({ x: cart.x - Math.cos(cart.angle) * 10, y: cart.y - 12 });

        // Screen shake decay
        if (screenShakeTimer > 0) {
            screenShakeTimer--;
            if (screenShakeTimer <= 0) screenShake = 0;
        }

        // Score from distance
        if (frameCount % 10 === 0) score += Math.floor(speed);

        // Prune old track/collectibles/gaps behind camera
        if (frameCount % 120 === 0) {
            collectibles = collectibles.filter(c => c.x > cameraX - 200 || !c.collected);
            hazards = hazards.filter(h => h.x > cameraX - 200);
            gapPositions = gapPositions.filter(g => g.end > cameraX - 300);
            shields = shields.filter(s => s.x > cameraX - 200);
        }
    }

    function loseLife() {
        lives--;
        sfxHit();
        screenShake = 5; screenShakeTimer = 15;
        cart.expression = 'hurt';

        // Hit particles
        for (let p = 0; p < 8; p++) {
            particles.push({
                x: cart.x + rng(-5, 5), y: cart.y + rng(-5, 5),
                vx: rng(-3, 3), vy: rng(-4, 0),
                life: 18, color: '#FF4444', r: rng(2, 5)
            });
        }

        if (lives <= 0) {
            state = ST_DEAD;
            deathTimer = 0;
            sfxDeath();
            cart.expression = 'dead';
        } else {
            // Respawn on track
            floatTexts.push({ x: cart.x, y: cart.y - 30, text: 'OUCH!', life: 40, color: '#FF4444' });
            // Find next safe track point
            for (let i = trackIdx + 2; i < trackPoints.length - 2; i++) {
                let safe = true;
                for (const gap of gapPositions) {
                    if (trackPoints[i].x > gap.start && trackPoints[i].x < gap.end) { safe = false; break; }
                }
                if (safe) {
                    trackIdx = i; trackT = 0;
                    const pos = getTrackPos(trackIdx, 0);
                    cart.x = pos.x; cart.y = pos.y;
                    cart.onTrack = true; cart.jumping = false; cart.vy = 0;
                    cart.expression = 'normal';
                    break;
                }
            }
        }
    }

    function doJump() {
        if (state === ST_TITLE) {
            state = ST_PLAY;
            resetGame();
            return;
        }
        if (state === ST_DEAD) {
            if (deathTimer > 40) {
                if (gameOverCB) gameOverCB({ score: Math.floor(score), level, coins, distance: Math.floor(distance) });
            }
            return;
        }
        if (cart.onTrack && !cart.jumping) {
            cart.jumping = true;
            cart.onTrack = false;
            cart.vy = JUMP_VEL;
            cart.expression = 'jump';
            sfxJump();
        }
    }

    function doDuck(on) {
        if (state !== ST_PLAY) return;
        cart.ducking = on;
        if (on) cart.expression = 'duck';
        else if (cart.expression === 'duck') cart.expression = 'normal';
    }

    // ═══════════════════════════════════════════
    // ── DRAW ──
    // ═══════════════════════════════════════════
    function draw() {
        ctx.save();

        // Screen shake
        let shakeX = 0, shakeY = 0;
        if (screenShake > 0) {
            shakeX = rng(-screenShake, screenShake);
            shakeY = rng(-screenShake, screenShake);
        }

        // Scale and translate
        ctx.setTransform(SCALE * cameraZoom, 0, 0, SCALE * cameraZoom, shakeX * SCALE, shakeY * SCALE);
        const offX = GAME_W * (1 - cameraZoom) / (2 * cameraZoom);
        const offY = GAME_H * (1 - cameraZoom) / (2 * cameraZoom);

        const zone = ZONES[zoneIdx];
        const camOff = cameraX;

        // ── Sky ──
        const skyGrad = ctx.createLinearGradient(0, 0, 0, GAME_H);
        skyGrad.addColorStop(0, zone.sky[0]);
        skyGrad.addColorStop(1, zone.sky[1]);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(-offX, -offY, GAME_W / cameraZoom, GAME_H / cameraZoom);

        // ── Parallax Background ──
        drawBackground(camOff, zone);

        // Translate for camera
        ctx.save();
        ctx.translate(-camOff + offX, offY);

        // ── Track ──
        drawTrack(camOff, zone);

        // ── Springs ──
        for (const sp of springs) {
            if (sp.x < camOff - 50 || sp.x > camOff + GAME_W + 50) continue;
            ctx.fillStyle = '#00CC00';
            ctx.fillRect(sp.x - 6, sp.y - SPRING_H, 12, SPRING_H);
            ctx.fillStyle = '#00FF44';
            // Coil lines
            for (let j = 0; j < 3; j++) {
                const yy = sp.y - SPRING_H + j * (SPRING_H / 3);
                ctx.fillRect(sp.x - 8, yy, 16, 2);
            }
        }

        // ── Shields ──
        for (const s of shields) {
            if (s.x < camOff - 50 || s.x > camOff + GAME_W + 50) continue;
            const bob = Math.sin(frameCount * 0.08) * 3;
            ctx.beginPath();
            ctx.arc(s.x, s.y + bob, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#00BFFF';
            ctx.globalAlpha = 0.7 + Math.sin(frameCount * 0.1) * 0.3;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // Ticket shape
            ctx.fillStyle = '#FFF';
            ctx.font = '8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('S', s.x, s.y + bob + 3);
        }

        // ── Collectibles ──
        for (const c of collectibles) {
            if (c.collected || c.x < camOff - 50 || c.x > camOff + GAME_W + 50) continue;
            if (c.type === 'coin') {
                drawCoin(c.x, c.y);
            } else {
                drawStar(c.x, c.y);
            }
        }

        // ── Hazards ──
        for (const h of hazards) {
            if (h.x < camOff - 100 || h.x > camOff + GAME_W + 200) continue;
            drawHazard(h);
        }

        // ── Cart & Character ──
        drawCart();

        // ── Particles ──
        for (const p of particles) {
            ctx.globalAlpha = p.life / 20;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r || 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // ── Sparks ──
        for (const s of sparkParticles) {
            ctx.globalAlpha = s.life / 14;
            ctx.fillStyle = s.color;
            ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
        }
        ctx.globalAlpha = 1;

        // ── Float Texts ──
        for (const f of floatTexts) {
            ctx.globalAlpha = f.life / 40;
            ctx.fillStyle = f.color;
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;

        ctx.restore(); // camera translate

        // ── HUD (screen-space) ──
        drawHUD();

        // ── Speed Lines ──
        if (speed > BASE_SPEED * 1.6) {
            drawSpeedLines();
        }

        // Touch controls
        if (HAS_TOUCH && state === ST_PLAY) {
            drawTouchControls();
        }

        ctx.restore(); // global transform
    }

    function drawBackground(camOff, zone) {
        // Parallax layers
        const px1 = -(camOff * 0.1) % GAME_W;
        const px2 = -(camOff * 0.3) % GAME_W;

        if (zoneIdx === 0) {
            // Theme park background
            // Distant mountains
            ctx.fillStyle = '#3D8B37';
            for (let i = -1; i < 3; i++) {
                const bx = px1 + i * 400;
                ctx.beginPath();
                ctx.moveTo(bx, GAME_H * 0.7);
                ctx.quadraticCurveTo(bx + 100, GAME_H * 0.35, bx + 200, GAME_H * 0.7);
                ctx.fill();
            }
            // Trees
            ctx.fillStyle = '#2D7A2D';
            for (let i = -1; i < 8; i++) {
                const tx = px2 + i * 120;
                ctx.beginPath();
                ctx.moveTo(tx, GAME_H * 0.75);
                ctx.lineTo(tx + 15, GAME_H * 0.55);
                ctx.lineTo(tx + 30, GAME_H * 0.75);
                ctx.fill();
            }
            // Clouds
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            for (let i = 0; i < 4; i++) {
                const cx = ((px1 * 0.3 + i * 200 + 50) % (GAME_W + 200)) - 100;
                const cy = 30 + i * 20;
                ctx.beginPath();
                ctx.ellipse(cx, cy, 30, 12, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(cx + 20, cy - 5, 20, 10, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (zoneIdx === 1) {
            // Steel - city skyline
            ctx.fillStyle = '#1a1a2e';
            for (let i = -1; i < 10; i++) {
                const bx = px2 + i * 80;
                const bh = 40 + (Math.sin(i * 1.7) + 1) * 50;
                ctx.fillStyle = `hsl(220, 20%, ${12 + i % 3 * 3}%)`;
                ctx.fillRect(bx, GAME_H * 0.7 - bh, 50, bh + 30);
                // Windows
                ctx.fillStyle = '#FFD70030';
                for (let wy = 0; wy < bh - 10; wy += 12) {
                    for (let wx = 8; wx < 42; wx += 14) {
                        if (Math.random() > 0.3) ctx.fillRect(bx + wx, GAME_H * 0.7 - bh + wy + 5, 6, 6);
                    }
                }
            }
        } else if (zoneIdx === 2) {
            // Space - stars
            ctx.fillStyle = '#FFFFFF';
            for (let i = 0; i < 40; i++) {
                const sx = ((i * 73.7 + px1 * 0.5) % GAME_W + GAME_W) % GAME_W;
                const sy = (i * 37.3) % (GAME_H * 0.7);
                const twinkle = 0.4 + Math.sin(frameCount * 0.05 + i) * 0.4;
                ctx.globalAlpha = twinkle;
                ctx.fillRect(sx, sy, 1.5, 1.5);
            }
            ctx.globalAlpha = 1;
            // Nebula
            ctx.fillStyle = 'rgba(100, 0, 200, 0.15)';
            ctx.beginPath();
            ctx.ellipse(GAME_W * 0.7 + (px1 * 0.2 % 100), GAME_H * 0.3, 120, 50, 0.3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Underwater - bubbles
            for (let i = 0; i < 20; i++) {
                const bx = ((i * 53.1 + frameCount * 0.2) % GAME_W + GAME_W) % GAME_W;
                const by = ((i * 41.7 - frameCount * (0.3 + i * 0.02)) % GAME_H + GAME_H) % GAME_H;
                ctx.fillStyle = 'rgba(150, 220, 255, 0.3)';
                ctx.beginPath();
                ctx.arc(bx, by, 2 + (i % 4), 0, Math.PI * 2);
                ctx.fill();
            }
            // Seaweed
            ctx.strokeStyle = '#1B6B3A';
            ctx.lineWidth = 3;
            for (let i = -1; i < 6; i++) {
                const sx = px2 + i * 130 + 30;
                ctx.beginPath();
                ctx.moveTo(sx, GAME_H * 0.88);
                const sway = Math.sin(frameCount * 0.03 + i) * 8;
                ctx.quadraticCurveTo(sx + sway, GAME_H * 0.7, sx + sway * 0.5, GAME_H * 0.58);
                ctx.stroke();
            }
            ctx.lineWidth = 1;
        }
    }

    function drawTrack(camOff, zone) {
        if (trackPoints.length < 4) return;

        const viewLeft = camOff - 40;
        const viewRight = camOff + GAME_W + 40;

        // Find visible range
        let startI = 0, endI = trackPoints.length - 2;
        for (let i = 0; i < trackPoints.length; i++) {
            if (trackPoints[i].x >= viewLeft) { startI = Math.max(0, i - 1); break; }
        }
        for (let i = trackPoints.length - 1; i >= 0; i--) {
            if (trackPoints[i].x <= viewRight) { endI = Math.min(trackPoints.length - 2, i + 1); break; }
        }

        // Draw ties first (cross-beams)
        ctx.strokeStyle = zone.tie;
        ctx.lineWidth = 2;
        for (let i = startI; i <= endI; i++) {
            for (let t = 0; t < 1; t += 0.3) {
                const pos = getTrackPos(i, t);
                const ang = getTrackAngle(i, t);
                // Check gap
                let inGap = false;
                for (const gap of gapPositions) {
                    if (pos.x > gap.start + 5 && pos.x < gap.end - 5) { inGap = true; break; }
                }
                if (inGap) continue;

                const perpX = -Math.sin(ang) * TRACK_RAIL_GAP * 0.5;
                const perpY = Math.cos(ang) * TRACK_RAIL_GAP * 0.5;
                ctx.beginPath();
                ctx.moveTo(pos.x - perpX, pos.y - perpY);
                ctx.lineTo(pos.x + perpX, pos.y + perpY);
                ctx.stroke();
            }
        }

        // Draw rails
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';

        for (let rail = -1; rail <= 1; rail += 2) {
            ctx.beginPath();
            ctx.strokeStyle = zone.rail;
            let started = false;

            for (let i = startI; i <= endI; i++) {
                const steps = 6;
                for (let s = 0; s < steps; s++) {
                    const t = s / steps;
                    const pos = getTrackPos(i, t);
                    const ang = getTrackAngle(i, t);

                    // Check gap
                    let inGap = false;
                    for (const gap of gapPositions) {
                        if (pos.x > gap.start && pos.x < gap.end) { inGap = true; break; }
                    }

                    const offset = rail * TRACK_RAIL_GAP * 0.5;
                    const px = pos.x - Math.sin(ang) * offset;
                    const py = pos.y + Math.cos(ang) * offset;

                    if (inGap) {
                        started = false;
                        continue;
                    }

                    if (!started) { ctx.moveTo(px, py); started = true; }
                    else ctx.lineTo(px, py);
                }
            }
            ctx.stroke();
        }

        // Glow effect for space/underwater themes
        if (zoneIdx >= 2) {
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 6;
            ctx.strokeStyle = zone.rail;
            ctx.filter = 'blur(4px)';
            for (let rail = -1; rail <= 1; rail += 2) {
                ctx.beginPath();
                let started = false;
                for (let i = startI; i <= endI; i++) {
                    for (let s = 0; s < 4; s++) {
                        const t = s / 4;
                        const pos = getTrackPos(i, t);
                        const ang = getTrackAngle(i, t);
                        let inGap = false;
                        for (const gap of gapPositions) {
                            if (pos.x > gap.start && pos.x < gap.end) { inGap = true; break; }
                        }
                        if (inGap) { started = false; continue; }
                        const offset = rail * TRACK_RAIL_GAP * 0.5;
                        const px = pos.x - Math.sin(ang) * offset;
                        const py = pos.y + Math.cos(ang) * offset;
                        if (!started) { ctx.moveTo(px, py); started = true; }
                        else ctx.lineTo(px, py);
                    }
                }
                ctx.stroke();
            }
            ctx.filter = 'none';
            ctx.globalAlpha = 1;
            ctx.lineWidth = 1;
        }

        // Gap warning markers
        for (const gap of gapPositions) {
            if (gap.start < viewLeft - 40 || gap.start > viewRight + 40) continue;
            // Danger stripes at gap edges
            ctx.fillStyle = '#FF4444';
            const flash = Math.sin(frameCount * 0.15) > 0 ? 1 : 0.5;
            ctx.globalAlpha = flash;
            ctx.fillRect(gap.start - 3, gap.y - 4, 6, 8);
            ctx.fillRect(gap.end - 3, gap.y - 4, 6, 8);
            ctx.globalAlpha = 1;
        }
    }

    function drawCoin(x, y) {
        const bob = Math.sin(frameCount * 0.1 + x * 0.02) * 2;
        const flash = 0.8 + Math.sin(frameCount * 0.15 + x) * 0.2;
        ctx.globalAlpha = flash;
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(x, y + bob, COIN_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#DAA520';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Shine
        ctx.fillStyle = '#FFFACD';
        ctx.beginPath();
        ctx.arc(x - 2, y + bob - 2, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawStar(x, y) {
        const bob = Math.sin(frameCount * 0.08 + x * 0.01) * 3;
        const glow = 0.6 + Math.sin(frameCount * 0.12) * 0.4;
        ctx.save();
        ctx.translate(x, y + bob);
        ctx.rotate(frameCount * 0.03);
        // Glow
        ctx.globalAlpha = glow * 0.4;
        ctx.fillStyle = '#FFFF00';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const a2 = ((i + 0.5) / 5) * Math.PI * 2 - Math.PI / 2;
            ctx.lineTo(Math.cos(a) * STAR_R * 1.5, Math.sin(a) * STAR_R * 1.5);
            ctx.lineTo(Math.cos(a2) * STAR_R * 0.5, Math.sin(a2) * STAR_R * 0.5);
        }
        ctx.closePath();
        ctx.fill();
        // Solid star
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const a2 = ((i + 0.5) / 5) * Math.PI * 2 - Math.PI / 2;
            ctx.lineTo(Math.cos(a) * STAR_R, Math.sin(a) * STAR_R);
            ctx.lineTo(Math.cos(a2) * STAR_R * 0.4, Math.sin(a2) * STAR_R * 0.4);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function drawHazard(h) {
        if (h.type === 'bar') {
            // Overhead bar with warning stripes
            ctx.fillStyle = '#FF6600';
            ctx.fillRect(h.x - h.w / 2, h.y, h.w, h.h);
            ctx.fillStyle = '#333';
            for (let s = 0; s < h.w; s += 8) {
                ctx.fillRect(h.x - h.w/2 + s, h.y, 4, h.h);
            }
            // Posts
            ctx.fillStyle = '#666';
            ctx.fillRect(h.x - h.w/2 - 2, h.y - 30, 3, 30 + h.h);
            ctx.fillRect(h.x + h.w/2 - 1, h.y - 30, 3, 30 + h.h);
        } else if (h.type === 'bird') {
            // Animated bird
            const wingUp = Math.sin(h.frame * 0.3) > 0;
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.ellipse(h.x, h.y, 8, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            // Wings
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(h.x - 4, h.y);
            ctx.quadraticCurveTo(h.x - 12, h.y + (wingUp ? -8 : 3), h.x - 16, h.y + (wingUp ? -6 : 4));
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(h.x + 4, h.y);
            ctx.quadraticCurveTo(h.x + 12, h.y + (wingUp ? -8 : 3), h.x + 16, h.y + (wingUp ? -6 : 4));
            ctx.stroke();
            ctx.lineWidth = 1;
            // Eye
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(h.x + 5, h.y - 2, 2, 0, Math.PI * 2);
            ctx.fill();
        } else if (h.type === 'pendulum') {
            const bobX = h.x + Math.sin(h.angle) * h.len;
            const bobY = h.y + Math.cos(h.angle) * h.len;
            // Arm
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(h.x, h.y);
            ctx.lineTo(bobX, bobY);
            ctx.stroke();
            ctx.lineWidth = 1;
            // Pivot
            ctx.fillStyle = '#666';
            ctx.beginPath();
            ctx.arc(h.x, h.y, 3, 0, Math.PI * 2);
            ctx.fill();
            // Bob
            ctx.fillStyle = '#CC3333';
            ctx.beginPath();
            ctx.arc(bobX, bobY, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FF5555';
            ctx.beginPath();
            ctx.arc(bobX - 2, bobY - 2, 3, 0, Math.PI * 2);
            ctx.fill();
        } else if (h.type === 'oncoming') {
            // Opposing cart
            ctx.fillStyle = '#CC2222';
            ctx.fillRect(h.x - 14, h.y - 10, 28, 14);
            ctx.fillStyle = '#881111';
            ctx.fillRect(h.x - 12, h.y - 14, 24, 6);
            // Wheels
            ctx.fillStyle = '#444';
            ctx.beginPath();
            ctx.arc(h.x - 8, h.y + 5, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(h.x + 8, h.y + 5, 4, 0, Math.PI * 2);
            ctx.fill();
        } else if (h.type === 'fireHoop') {
            // Fire ring
            ctx.strokeStyle = h.passed ? '#44FF44' : '#FF4400';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = 1;
            // Flames
            if (!h.passed) {
                for (let f = 0; f < 6; f++) {
                    const fa = (f / 6) * Math.PI * 2 + frameCount * 0.1;
                    const fx = h.x + Math.cos(fa) * h.r;
                    const fy = h.y + Math.sin(fa) * h.r;
                    ctx.fillStyle = f % 2 === 0 ? '#FF6600' : '#FFAA00';
                    ctx.beginPath();
                    ctx.arc(fx, fy, 3 + Math.sin(frameCount * 0.2 + f) * 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    function drawCart() {
        ctx.save();
        ctx.translate(cart.x, cart.y);
        ctx.rotate(cart.angle);

        const duck = cart.ducking ? 0.5 : 1;

        // Cart body
        ctx.fillStyle = playerColor;
        const cw = CART_W, ch = CART_H;
        // Rounded cart shape
        ctx.beginPath();
        ctx.moveTo(-cw/2 + 4, -ch);
        ctx.lineTo(cw/2 - 4, -ch);
        ctx.quadraticCurveTo(cw/2, -ch, cw/2, -ch + 4);
        ctx.lineTo(cw/2, 0);
        ctx.lineTo(-cw/2, 0);
        ctx.lineTo(-cw/2, -ch + 4);
        ctx.quadraticCurveTo(-cw/2, -ch, -cw/2 + 4, -ch);
        ctx.closePath();
        ctx.fill();

        // Cart highlight
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(-cw/2 + 2, -ch + 2, cw - 4, 4);

        // Side stripe
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(-cw/2, -ch/2, cw, 3);

        // Wheels
        ctx.fillStyle = '#333';
        const wheelR = 5;
        const wheelSpin = (distance * 0.1) % (Math.PI * 2);
        for (const wx of [-cw/2 + 6, cw/2 - 6]) {
            ctx.beginPath();
            ctx.arc(wx, 2, wheelR, 0, Math.PI * 2);
            ctx.fill();
            // Spokes
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 1;
            for (let s = 0; s < 3; s++) {
                const sa = wheelSpin + (s / 3) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(wx, 2);
                ctx.lineTo(wx + Math.cos(sa) * wheelR, 2 + Math.sin(sa) * wheelR);
                ctx.stroke();
            }
            // Hub
            ctx.fillStyle = '#888';
            ctx.beginPath();
            ctx.arc(wx, 2, 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#333';
        }

        // Character
        const charY = -ch - CHAR_H * duck * 0.8;

        // Body
        ctx.fillStyle = '#FFD4A0'; // skin
        ctx.beginPath();
        ctx.ellipse(0, charY + 4, 6 * duck, 8 * duck, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = '#FFD4A0';
        ctx.beginPath();
        ctx.arc(0, charY - 6 * duck, 6, 0, Math.PI * 2);
        ctx.fill();

        // Hair
        ctx.fillStyle = '#5C3A1E';
        ctx.beginPath();
        ctx.ellipse(0, charY - 10 * duck, 7, 4, 0, Math.PI, Math.PI * 2);
        ctx.fill();

        // Scarf
        ctx.fillStyle = playerColor;
        ctx.beginPath();
        ctx.ellipse(0, charY - 1 * duck, 5, 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Expression face
        drawFace(0, charY - 6 * duck, cart.expression);

        // Arms based on state
        ctx.strokeStyle = '#FFD4A0';
        ctx.lineWidth = 2;
        if (cart.expression === 'whee' || cart.expression === 'jump') {
            // Arms up!
            ctx.beginPath();
            ctx.moveTo(-4, charY + 2);
            ctx.lineTo(-10, charY - 10);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(4, charY + 2);
            ctx.lineTo(10, charY - 10);
            ctx.stroke();
        } else if (cart.expression === 'duck') {
            // Arms forward (holding on)
            ctx.beginPath();
            ctx.moveTo(-4, charY + 4);
            ctx.lineTo(-8, charY + 8);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(4, charY + 4);
            ctx.lineTo(8, charY + 8);
            ctx.stroke();
        } else {
            // Arms on cart sides
            ctx.beginPath();
            ctx.moveTo(-4, charY + 4);
            ctx.lineTo(-10, charY + 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(4, charY + 4);
            ctx.lineTo(10, charY + 2);
            ctx.stroke();
        }
        ctx.lineWidth = 1;

        // Shield glow
        if (shieldActive) {
            ctx.strokeStyle = '#00BFFF';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.4 + Math.sin(frameCount * 0.15) * 0.3;
            ctx.beginPath();
            ctx.arc(0, -ch / 2, 22, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.lineWidth = 1;
        }

        ctx.restore();

        // Scarf trail (world space)
        if (cart.scarfTrail.length > 2 && !cart.ducking) {
            ctx.strokeStyle = playerColor;
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.moveTo(cart.scarfTrail[0].x, cart.scarfTrail[0].y);
            for (let i = 1; i < cart.scarfTrail.length; i++) {
                ctx.lineTo(cart.scarfTrail[i].x, cart.scarfTrail[i].y);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.lineWidth = 1;
        }
    }

    function drawFace(x, y, expr) {
        ctx.fillStyle = '#333';
        if (expr === 'whee' || expr === 'jump') {
            // Excited: big open mouth, wide eyes
            ctx.beginPath(); ctx.arc(x - 2.5, y - 1, 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x + 2.5, y - 1, 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x, y + 2, 2.5, 0, Math.PI); ctx.fill();
        } else if (expr === 'loop') {
            // Dizzy / excited: X eyes, wavy mouth
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#333';
            ctx.beginPath(); ctx.moveTo(x - 3.5, y - 2.5); ctx.lineTo(x - 1.5, y - 0.5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x - 1.5, y - 2.5); ctx.lineTo(x - 3.5, y - 0.5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + 1.5, y - 2.5); ctx.lineTo(x + 3.5, y - 0.5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + 3.5, y - 2.5); ctx.lineTo(x + 1.5, y - 0.5); ctx.stroke();
            ctx.beginPath(); ctx.arc(x, y + 2.5, 2, 0, Math.PI); ctx.stroke();
        } else if (expr === 'duck') {
            // Focused: squinting
            ctx.fillRect(x - 3.5, y - 1, 3, 1.5);
            ctx.fillRect(x + 0.5, y - 1, 3, 1.5);
            ctx.fillRect(x - 1.5, y + 2, 3, 1);
        } else if (expr === 'hurt' || expr === 'dead') {
            // Pain: X eyes
            ctx.strokeStyle = '#CC0000';
            ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(x - 3.5, y - 2.5); ctx.lineTo(x - 1, y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x - 1, y - 2.5); ctx.lineTo(x - 3.5, y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + 1, y - 2.5); ctx.lineTo(x + 3.5, y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + 3.5, y - 2.5); ctx.lineTo(x + 1, y); ctx.stroke();
            ctx.beginPath(); ctx.arc(x, y + 3, 2, 0, Math.PI * 2); ctx.stroke();
            ctx.lineWidth = 1;
        } else {
            // Normal: dot eyes, slight smile
            ctx.beginPath(); ctx.arc(x - 2.5, y - 1, 1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x + 2.5, y - 1, 1, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#333';
            ctx.beginPath();
            ctx.arc(x, y + 1.5, 2, 0.1, Math.PI - 0.1);
            ctx.stroke();
        }
    }

    function drawSpeedLines() {
        const intensity = clamp((speed - BASE_SPEED * 1.6) / (MAX_SPEED - BASE_SPEED * 1.6), 0, 1);
        ctx.globalAlpha = intensity * 0.25;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
            const ly = rng(20, GAME_H - 20);
            const lx = rng(GAME_W * 0.3, GAME_W);
            const len = rng(20, 60) * intensity;
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(lx - len, ly);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
    }

    function drawHUD() {
        // Score
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(4, 4, 130, 50);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('SCORE: ' + Math.floor(score), 10, 20);

        // Coins
        ctx.fillStyle = '#FFD700';
        ctx.fillText('COINS: ' + coins, 10, 36);

        // Distance
        ctx.fillStyle = '#AAA';
        ctx.font = '10px monospace';
        ctx.fillText(Math.floor(distance) + 'm', 10, 50);

        // Lives
        ctx.textAlign = 'right';
        for (let i = 0; i < lives; i++) {
            ctx.fillStyle = '#FF4444';
            ctx.beginPath();
            const hx = GAME_W - 14 - i * 18, hy = 14;
            ctx.moveTo(hx, hy + 3);
            ctx.bezierCurveTo(hx, hy, hx - 5, hy - 2, hx - 5, hy + 2);
            ctx.bezierCurveTo(hx - 5, hy + 6, hx, hy + 9, hx, hy + 12);
            ctx.bezierCurveTo(hx, hy + 9, hx + 5, hy + 6, hx + 5, hy + 2);
            ctx.bezierCurveTo(hx + 5, hy - 2, hx, hy, hx, hy + 3);
            ctx.fill();
        }

        // Zone name
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(ZONES[zoneIdx].name, GAME_W / 2, 16);

        // Speed indicator
        const spdPct = clamp((speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(GAME_W - 60, 30, 52, 8);
        const spdColor = spdPct > 0.7 ? '#FF4444' : spdPct > 0.4 ? '#FFAA00' : '#44FF44';
        ctx.fillStyle = spdColor;
        ctx.fillRect(GAME_W - 59, 31, 50 * spdPct, 6);

        // Shield timer
        if (shieldActive) {
            ctx.fillStyle = '#00BFFF';
            ctx.font = '9px monospace';
            ctx.textAlign = 'right';
            ctx.fillText('SHIELD ' + Math.ceil(shieldTimer / 60) + 's', GAME_W - 8, 50);
        }

        // Combo
        if (comboCount > 2) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('x' + comboCount + ' COMBO!', GAME_W / 2, 32);
        }
    }

    function drawTouchControls() {
        ctx.globalAlpha = 0.2;
        // Left half = DUCK, Right half = JUMP
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DUCK', GAME_W * 0.2, GAME_H - 20);
        ctx.fillText('JUMP', GAME_W * 0.8, GAME_H - 20);
        // Divider
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(GAME_W / 2, GAME_H - 40);
        ctx.lineTo(GAME_W / 2, GAME_H - 10);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // ═══════════════════════════════════════════
    // ── TITLE & DEATH SCREENS ──
    // ═══════════════════════════════════════════
    function drawTitle() {
        ctx.save();
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

        // Background
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
        grad.addColorStop(0, '#1a1a3e');
        grad.addColorStop(1, '#2d1b4e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Stars
        ctx.fillStyle = '#FFF';
        for (let i = 0; i < 30; i++) {
            const sx = (i * 71.3 + frameCount * 0.1) % GAME_W;
            const sy = (i * 43.7) % (GAME_H * 0.6);
            ctx.globalAlpha = 0.3 + Math.sin(frameCount * 0.03 + i) * 0.3;
            ctx.fillRect(sx, sy, 1.5, 1.5);
        }
        ctx.globalAlpha = 1;

        // Coaster track decoration
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = 0; x <= GAME_W; x += 4) {
            const y = GAME_H * 0.7 + Math.sin(x * 0.02 + frameCount * 0.02) * 30
                      + Math.sin(x * 0.005) * 20;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Title
        const bounce = Math.sin(frameCount * 0.05) * 5;
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('COASTER', GAME_W / 2, 100 + bounce);
        ctx.fillStyle = playerColor || '#FF6B6B';
        ctx.fillText('RIDE', GAME_W / 2, 140 + bounce);

        // Cart icon
        ctx.fillStyle = playerColor || '#FF6B6B';
        ctx.fillRect(GAME_W/2 - 16, 165 + bounce, 32, 16);
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(GAME_W/2 - 8, 183 + bounce, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(GAME_W/2 + 8, 183 + bounce, 4, 0, Math.PI * 2);
        ctx.fill();

        // Instructions
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px monospace';
        ctx.fillText('SPACE / TAP RIGHT = Jump', GAME_W / 2, 230);
        ctx.fillText('DOWN / TAP LEFT = Duck', GAME_W / 2, 248);
        ctx.fillText('Survive the ride, collect coins!', GAME_W / 2, 275);

        // Start prompt
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 16px monospace';
            ctx.fillText('TAP or PRESS SPACE to START', GAME_W / 2, 330);
        }

        if (bestScore > 0) {
            ctx.fillStyle = '#AAA';
            ctx.font = '10px monospace';
            ctx.fillText('BEST: ' + Math.floor(bestScore), GAME_W / 2, 360);
        }

        ctx.restore();
    }

    function drawDeath() {
        deathTimer++;
        ctx.save();
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

        // Dim overlay
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Game Over text
        ctx.fillStyle = '#FF4444';
        ctx.font = 'bold 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', GAME_W / 2, 120);

        // Stats
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px monospace';
        ctx.fillText('SCORE: ' + Math.floor(score), GAME_W / 2, 170);
        ctx.fillText('COINS: ' + coins, GAME_W / 2, 195);
        ctx.fillText('DISTANCE: ' + Math.floor(distance) + 'm', GAME_W / 2, 220);
        ctx.fillText('ZONE: ' + ZONES[zoneIdx].name, GAME_W / 2, 245);

        if (score > bestScore) {
            bestScore = score;
            try { localStorage.setItem('ywa_coasterride_best', Math.floor(bestScore)); } catch(e) {}
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 12px monospace';
            ctx.fillText('NEW BEST!', GAME_W / 2, 275);
        } else if (bestScore > 0) {
            ctx.fillStyle = '#AAAAAA';
            ctx.font = '12px monospace';
            ctx.fillText('BEST: ' + Math.floor(bestScore), GAME_W / 2, 275);
        }

        if (deathTimer > 40) {
            const blink = Math.sin(frameCount * 0.08) > 0;
            if (blink) {
                ctx.fillStyle = '#FFD700';
                ctx.font = '12px monospace';
                ctx.fillText('TAP or PRESS SPACE', GAME_W / 2, 320);
            }
        }

        ctx.restore();
    }

    // ═══════════════════════════════════════════
    // ── GAME LOOP ──
    // ═══════════════════════════════════════════
    function gameLoop(ts) {
        if (!gameActive) return;
        animFrame = requestAnimationFrame(gameLoop);

        if (state === ST_TITLE) {
            frameCount++;
            drawTitle();
            return;
        }

        if (state === ST_PLAY) {
            update();
            draw();
        } else if (state === ST_DEAD) {
            // Still draw game state behind overlay
            draw();
            drawDeath();
        }
    }

    // ═══════════════════════════════════════════
    // ── INPUT ──
    // ═══════════════════════════════════════════
    function onKeyDown(e) {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault();
            doJump();
        }
        if (e.code === 'ArrowDown') {
            e.preventDefault();
            doDuck(true);
        }
    }

    function onKeyUp(e) {
        if (e.code === 'ArrowDown') {
            doDuck(false);
        }
    }

    function onTouchStart(e) {
        e.preventDefault();
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const tx = (touch.clientX - rect.left) / rect.width;

        if (state !== ST_PLAY) {
            doJump();
            return;
        }

        if (tx > 0.5) {
            doJump();
        } else {
            doDuck(true);
        }
        touchActive = true;
    }

    function onTouchEnd(e) {
        e.preventDefault();
        doDuck(false);
        touchActive = false;
    }

    function onTouchMove(e) {
        e.preventDefault();
    }

    // ═══════════════════════════════════════════
    // ── INIT / DESTROY ──
    // ═══════════════════════════════════════════
    function init(cvs, playerData, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOver;
        gameActive = true;

        playerColor = playerData?.color || '#FF6B6B';
        const themeId = playerData?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) playerColor = _t.colors[0] || playerColor;

        state = ST_TITLE;
        frameCount = 0;
        keys = {};
        bestScore = parseInt(localStorage.getItem('ywa_coasterride_best') || '0', 10);

        W = canvas.width || 960;
        H = canvas.height || 600;
        SCALE = W / GAME_W;

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
