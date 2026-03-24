/* Jump Dash — Endless runner / side-scroller for Your World Arcade */
window.JumpDash = (() => {

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
    const GAME_W = 640, GAME_H = 360;
    const GROUND_Y = 300;          // ground surface Y
    const GROUND_H = 60;           // ground thickness
    const GRAVITY = 0.38;
    const JUMP_VEL = -7.8;
    const JUMP_HOLD_BOOST = -0.35; // extra upward while holding
    const DOUBLE_JUMP_VEL = -7.0;
    const SLIDE_DURATION = 500;    // ms
    const BASE_SPEED = 3.0;
    const MAX_SPEED = 9.0;
    const SPEED_INCR = 0.15;       // per 500m
    const COIN_VALUE = 10;
    const GEM_VALUE = 50;
    const HEART_VALUE = 0;         // extra life, no points
    const STAR_DURATION = 5000;    // ms
    const SHOE_DURATION = 4000;    // ms
    const SHOE_SPEED_MULT = 1.5;
    const INVINCIBLE_BLINK = 100;  // ms blink interval
    const ENV_CYCLE = 1000;        // meters per environment
    const PLAYER_X = 90;           // fixed horizontal position
    const PLAYER_W = 24;
    const PLAYER_H = 36;
    const SLIDE_H = 18;
    const STARTING_LIVES = 3;
    const HIT_INVULN = 2000;       // ms invulnerability after hit
    const MILESTONE_DISPLAY = 2000; // ms

    // States
    const ST_SPLASH = 0, ST_PLAY = 1, ST_DEAD = 2, ST_OVER = 3;

    // Obstacle types
    const OB_HURDLE = 0, OB_WALL = 1, OB_OVERHEAD = 2, OB_GAP = 3;
    const OB_BIRD = 4, OB_COMBO = 5;

    // Collectible types
    const CL_COIN = 0, CL_GEM = 1, CL_HEART = 2, CL_STAR = 3, CL_SHOE = 4;

    // Environment IDs
    const ENV_PARK = 0, ENV_BEACH = 1, ENV_CITY = 2, ENV_FOREST = 3, ENV_RAINBOW = 4;

    // ── State ──
    let canvas, ctx, SCALE, DPR;
    let state, gameActive, animFrame, lastTime, frameCount;
    let activePlayer, gameOverCB, playerColor;

    // Runner state
    let runnerY, runnerVY, onGround, canDoubleJump, isSliding, slideTimer;
    let jumpHeld, jumpHeldTimer;
    let lives, coins, distance, bestDistance, speed;
    let hitInvulnTimer;

    // Animation
    let runFrame, runTimer;  // leg cycle

    // Power-ups
    let starActive, starTimer, shoeActive, shoeTimer;
    let magnetRange;

    // World
    let scrollX;            // total scroll in px
    let obstacles, collectibles, particles, floats;
    let envIndex, envProgress;
    let bgLayers;           // parallax layers per env
    let groundTiles;

    // Milestones
    let nextMilestone, milestoneText, milestoneTimer;

    // Spawning
    let nextObstacleX, nextCollectibleX;
    let obstacleTypes;      // unlocked types

    // Touch
    let touchStartY, touchStartTime, touchId;

    // Audio
    let audioCtx;
    let inputBound = false;

    // ── Helpers ──
    const gs = v => v * SCALE;
    const gx = v => v * SCALE;
    const gy = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // ── Audio ──
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
    function sfxJump() { playTone(520, 0.1, 'sine', 0.12, 780); }
    function sfxDoubleJump() { playTone(680, 0.08, 'sine', 0.14, 1100); setTimeout(() => playTone(880, 0.1, 'sine', 0.12), 60); }
    function sfxCoin() { playTone(880, 0.06, 'sine', 0.1); setTimeout(() => playTone(1100, 0.08, 'sine', 0.1), 50); }
    function sfxGem() { playTone(1000, 0.08, 'sine', 0.14); setTimeout(() => playTone(1300, 0.08, 'sine', 0.14), 60); setTimeout(() => playTone(1600, 0.1, 'sine', 0.14), 120); }
    function sfxHeart() { playTone(660, 0.1, 'sine', 0.12); setTimeout(() => playTone(880, 0.12, 'sine', 0.15), 80); }
    function sfxStar() { playTone(800, 0.06, 'sine', 0.15); setTimeout(() => playTone(1000, 0.06, 'sine', 0.15), 50); setTimeout(() => playTone(1200, 0.08, 'sine', 0.15), 100); setTimeout(() => playTone(1500, 0.12, 'sine', 0.15), 160); }
    function sfxHit() { playTone(200, 0.2, 'sawtooth', 0.12, 80); setTimeout(() => playTone(120, 0.25, 'sawtooth', 0.1), 100); }
    function sfxSlide() { playTone(300, 0.08, 'triangle', 0.06, 150); }
    function sfxMilestone() { playTone(600, 0.08, 'sine', 0.12); setTimeout(() => playTone(800, 0.08, 'sine', 0.12), 80); setTimeout(() => playTone(1000, 0.1, 'sine', 0.14), 160); }
    function sfxNewBest() { [600,750,900,1050,1200].forEach((f,i) => setTimeout(() => playTone(f, 0.12, 'sine', 0.15), i * 80)); }
    function sfxShoe() { playTone(700, 0.06, 'sine', 0.12); setTimeout(() => playTone(900, 0.06, 'sine', 0.12), 50); setTimeout(() => playTone(1100, 0.08, 'sine', 0.12), 100); }

    // ── Environment Definitions ──
    const ENVS = [
        { // Sunny Park
            sky: ['#87CEEB', '#D4F1F9'], ground: '#4CAF50', groundDark: '#388E3C',
            layers: [
                { color: '#81C784', hills: true, speed: 0.1, y: 0.55 },
                { color: '#66BB6A', hills: true, speed: 0.3, y: 0.65 },
                { color: '#4CAF50', hills: true, speed: 0.5, y: 0.75 }
            ],
            particleColor: '#8BC34A', particleType: 'leaf',
            obstacles: '#795548', accents: '#FF9800'
        },
        { // Beach
            sky: ['#00BCD4', '#B2EBF2'], ground: '#FFD54F', groundDark: '#FFC107',
            layers: [
                { color: '#4DD0E1', flat: true, speed: 0.05, y: 0.50 },
                { color: '#80CBC4', hills: true, speed: 0.2, y: 0.60 },
                { color: '#FFCC02', hills: true, speed: 0.4, y: 0.72 }
            ],
            particleColor: '#FFF9C4', particleType: 'sand',
            obstacles: '#A1887F', accents: '#FF7043'
        },
        { // City
            sky: ['#546E7A', '#B0BEC5'], ground: '#757575', groundDark: '#616161',
            layers: [
                { color: '#455A64', buildings: true, speed: 0.08, y: 0.35 },
                { color: '#37474F', buildings: true, speed: 0.25, y: 0.50 },
                { color: '#607D8B', hills: true, speed: 0.45, y: 0.70 }
            ],
            particleColor: '#B0BEC5', particleType: 'confetti',
            obstacles: '#424242', accents: '#FFC107'
        },
        { // Night Forest
            sky: ['#1A0033', '#2D1B69'], ground: '#2E7D32', groundDark: '#1B5E20',
            layers: [
                { color: '#1B0040', hills: true, speed: 0.08, y: 0.45 },
                { color: '#230052', hills: true, speed: 0.22, y: 0.58 },
                { color: '#311B92', hills: true, speed: 0.4, y: 0.70 }
            ],
            particleColor: '#FFEB3B', particleType: 'firefly',
            obstacles: '#4A148C', accents: '#CE93D8'
        },
        { // Rainbow Road
            sky: ['#E1BEE7', '#F3E5F5'], ground: '#CE93D8', groundDark: '#AB47BC',
            layers: [
                { color: '#F48FB1', hills: true, speed: 0.1, y: 0.50 },
                { color: '#CE93D8', hills: true, speed: 0.28, y: 0.62 },
                { color: '#B39DDB', hills: true, speed: 0.45, y: 0.72 }
            ],
            particleColor: '#FFFFFF', particleType: 'star',
            obstacles: '#7B1FA2', accents: '#FF4081'
        }
    ];

    // ── Environment BG generation ──
    function generateLayerHills(layerIdx) {
        const pts = [];
        let x = 0;
        while (x < GAME_W * 3) {
            pts.push({ x, h: rng(20, 60) });
            x += rng(60, 140);
        }
        return pts;
    }
    function generateLayerBuildings() {
        const blds = [];
        let x = 0;
        while (x < GAME_W * 3) {
            const w = rng(30, 70);
            blds.push({ x, w, h: rng(40, 140) });
            x += w + rng(5, 25);
        }
        return blds;
    }

    function initBGLayers() {
        bgLayers = ENVS.map(env => env.layers.map(l => ({
            ...l,
            shapes: l.buildings ? generateLayerBuildings() : generateLayerHills()
        })));
    }

    // ── Particles ──
    function spawnParticle(x, y, type, color, count) {
        for (let i = 0; i < (count || 1); i++) {
            particles.push({
                x: x + rng(-5, 5), y: y + rng(-5, 5),
                vx: rng(-2, 2), vy: rng(-3, 0),
                life: rng(0.5, 1.2), maxLife: 1.2,
                size: rng(2, 5), color: color || '#FFF',
                type: type || 'circle', rot: rng(0, 6.28),
                rotSpeed: rng(-3, 3)
            });
        }
    }

    function spawnTrailParticle(x, y) {
        particles.push({
            x, y: y + rng(-2, 2),
            vx: rng(-1, -0.3), vy: rng(-0.5, 0.5),
            life: rng(0.3, 0.6), maxLife: 0.6,
            size: rng(2, 4),
            color: starActive ? pick(['#FFD700','#FFF176','#FFEB3B']) : playerColor,
            type: 'sparkle', rot: rng(0, 6.28), rotSpeed: rng(-4, 4)
        });
    }

    function spawnAmbientParticle() {
        const env = ENVS[envIndex];
        const t = env.particleType;
        const p = {
            x: GAME_W + rng(0, 40), y: rng(20, GROUND_Y - 20),
            vx: -speed * 0.3 + rng(-0.5, 0), vy: 0,
            life: rng(2, 5), maxLife: 5,
            size: rng(2, 6), color: env.particleColor,
            type: t, rot: rng(0, 6.28), rotSpeed: rng(-2, 2),
            phase: rng(0, 6.28)
        };
        if (t === 'firefly') { p.size = rng(2, 4); p.vy = rng(-0.5, 0.5); }
        if (t === 'leaf') { p.vy = rng(0.2, 0.8); p.size = rng(3, 6); }
        if (t === 'sand') { p.vy = rng(-0.2, 0.2); p.size = rng(1, 3); }
        particles.push(p);
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.rotSpeed * dt;
            if (p.type === 'firefly') {
                p.vy = Math.sin(performance.now() * 0.003 + p.phase) * 0.5;
            }
            if (p.type === 'leaf') {
                p.vx += Math.sin(performance.now() * 0.002 + p.phase) * 0.02;
            }
            // scroll with world
            if (p.type !== 'sparkle' && p.type !== 'circle') {
                p.x -= speed * 0.2;
            }
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = clamp(p.life / p.maxLife, 0, 1);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(gs(p.x), gs(p.y));
            ctx.rotate(p.rot);
            const s = gs(p.size);
            ctx.fillStyle = p.color;
            if (p.type === 'sparkle' || p.type === 'star') {
                drawStar4(0, 0, s, s * 0.4, p.color);
            } else if (p.type === 'firefly') {
                ctx.shadowBlur = gs(6);
                ctx.shadowColor = p.color;
                ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            } else if (p.type === 'leaf') {
                ctx.beginPath();
                ctx.ellipse(0, 0, s, s * 0.5, 0, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'confetti') {
                ctx.fillRect(-s / 2, -s / 4, s, s / 2);
            } else {
                ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }
    }

    function drawStar4(cx, cy, outerR, innerR, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
            if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
    }

    // ── Floating text ──
    function addFloat(x, y, text, color) {
        floats.push({ x, y, text, color: color || '#FFF', life: 1.2, maxLife: 1.2 });
    }

    function updateFloats(dt) {
        for (let i = floats.length - 1; i >= 0; i--) {
            floats[i].life -= dt;
            floats[i].y -= 1.2;
            if (floats[i].life <= 0) floats.splice(i, 1);
        }
    }

    function drawFloats() {
        for (const f of floats) {
            const alpha = clamp(f.life / f.maxLife, 0, 1);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = f.color;
            ctx.font = 'bold ' + gs(14) + 'px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#000';
            ctx.shadowBlur = gs(3);
            ctx.fillText(f.text, gs(f.x), gs(f.y));
            ctx.restore();
        }
    }

    // ── Obstacles ──
    function spawnObstacle() {
        const available = obstacleTypes.slice();
        const type = pick(available);
        const sx = GAME_W + rng(20, 60);
        let ob = { x: sx, type, passed: false };

        switch (type) {
            case OB_HURDLE:
                ob.w = rng(16, 24); ob.h = rng(20, 32);
                ob.y = GROUND_Y - ob.h;
                break;
            case OB_WALL:
                ob.w = rng(18, 26); ob.h = rng(50, 70);
                ob.y = GROUND_Y - ob.h;
                break;
            case OB_OVERHEAD:
                ob.w = rng(50, 80); ob.h = 16;
                ob.y = GROUND_Y - rng(45, 55);
                break;
            case OB_GAP:
                ob.w = rng(40, 65); ob.h = GROUND_H + 20;
                ob.y = GROUND_Y;
                ob.isGap = true;
                break;
            case OB_BIRD:
                ob.w = 20; ob.h = 14;
                ob.y = rng(GROUND_Y - 80, GROUND_Y - 40);
                ob.baseY = ob.y;
                ob.phase = rng(0, 6.28);
                ob.wingFrame = 0;
                break;
            case OB_COMBO:
                // hurdle on bottom + overhead on top
                ob.w = rng(50, 70);
                ob.hurdleH = rng(18, 24);
                ob.overH = 14;
                ob.y = GROUND_Y - ob.hurdleH;
                ob.overY = GROUND_Y - rng(55, 65);
                break;
        }
        obstacles.push(ob);
        // Next obstacle spacing depends on speed
        const gap = rng(120, 200) + (MAX_SPEED - speed) * 12;
        nextObstacleX = sx + ob.w + gap;
    }

    function spawnCollectibles(aroundX) {
        const t = rng(0, 1);
        let type;
        if (t < 0.65) type = CL_COIN;
        else if (t < 0.82) type = CL_GEM;
        else if (t < 0.90) type = CL_HEART;
        else if (t < 0.95) type = CL_STAR;
        else type = CL_SHOE;

        if (type === CL_COIN) {
            // arc pattern
            const count = Math.floor(rng(3, 8));
            const startX = aroundX || GAME_W + rng(20, 80);
            for (let i = 0; i < count; i++) {
                const cx = startX + i * 22;
                const cy = GROUND_Y - 40 - Math.sin(i / count * Math.PI) * 50;
                collectibles.push({ x: cx, y: cy, type: CL_COIN, size: 8, collected: false, sparkle: rng(0, 6.28) });
            }
            nextCollectibleX = startX + count * 22 + rng(80, 160);
        } else {
            const cx = aroundX || GAME_W + rng(30, 100);
            const cy = GROUND_Y - rng(30, 80);
            collectibles.push({ x: cx, y: cy, type, size: type === CL_GEM ? 10 : 9, collected: false, sparkle: rng(0, 6.28) });
            nextCollectibleX = cx + rng(100, 200);
        }
    }

    // ── Drawing helpers ──
    function drawRoundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.roundRect(gs(x), gs(y), gs(w), gs(h), gs(r));
        ctx.fill();
    }

    // ── Draw Environment BG ──
    function drawBackground() {
        const env = ENVS[envIndex];
        // Sky gradient
        const grad = ctx.createLinearGradient(0, 0, 0, gs(GROUND_Y));
        grad.addColorStop(0, env.sky[0]);
        grad.addColorStop(1, env.sky[1]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, gs(GROUND_Y));

        // Parallax layers
        const layers = bgLayers[envIndex];
        for (let li = 0; li < layers.length; li++) {
            const l = layers[li];
            const offset = (scrollX * l.speed) % (GAME_W * 2);
            const baseY = GAME_H * l.y;
            ctx.fillStyle = l.color;

            if (l.buildings) {
                for (const b of l.shapes) {
                    const bx = b.x - offset;
                    const wrappedX = ((bx % (GAME_W * 3)) + GAME_W * 3) % (GAME_W * 3) - GAME_W;
                    if (wrappedX > GAME_W + 50 || wrappedX + b.w < -50) continue;
                    ctx.fillRect(gs(wrappedX), gs(baseY - b.h * 0.5), gs(b.w), gs(b.h * 0.5 + (GROUND_Y - baseY)));
                    // windows
                    ctx.fillStyle = l.color === '#455A64' ? '#FFF9C4' : '#FFE082';
                    ctx.globalAlpha = 0.3;
                    for (let wy = baseY - b.h * 0.5 + 6; wy < GROUND_Y - 8; wy += 12) {
                        for (let wx = wrappedX + 4; wx < wrappedX + b.w - 6; wx += 10) {
                            ctx.fillRect(gs(wx), gs(wy), gs(5), gs(6));
                        }
                    }
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = l.color;
                }
            } else {
                // Hills
                ctx.beginPath();
                ctx.moveTo(0, gs(GROUND_Y));
                for (const h of l.shapes) {
                    const hx = h.x - offset;
                    const wrappedX = ((hx % (GAME_W * 3)) + GAME_W * 3) % (GAME_W * 3) - GAME_W;
                    ctx.lineTo(gs(wrappedX), gs(baseY - h.h * 0.5));
                    ctx.lineTo(gs(wrappedX + 40), gs(baseY));
                }
                ctx.lineTo(gs(GAME_W + 40), gs(GROUND_Y));
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    // ── Draw Ground ──
    function drawGround() {
        const env = ENVS[envIndex];
        const offset = (scrollX * 1.0) % 40;

        // Check for gaps
        ctx.fillStyle = env.ground;
        // Draw ground with gaps
        let gxStart = 0;
        const sortedGaps = obstacles.filter(o => o.isGap).sort((a, b) => a.x - b.x);

        if (sortedGaps.length === 0) {
            ctx.fillRect(0, gs(GROUND_Y), canvas.width, gs(GROUND_H));
        } else {
            for (const gap of sortedGaps) {
                const gapLeft = gs(gap.x);
                const gapRight = gs(gap.x + gap.w);
                if (gapLeft > gxStart) {
                    ctx.fillRect(gxStart, gs(GROUND_Y), gapLeft - gxStart, gs(GROUND_H));
                }
                gxStart = gapRight;
            }
            if (gxStart < canvas.width) {
                ctx.fillRect(gxStart, gs(GROUND_Y), canvas.width - gxStart, gs(GROUND_H));
            }
        }

        // Ground texture lines
        ctx.strokeStyle = env.groundDark;
        ctx.lineWidth = gs(1);
        ctx.globalAlpha = 0.3;
        for (let lx = -offset; lx < GAME_W; lx += 40) {
            const inGap = sortedGaps.some(g => lx >= g.x && lx <= g.x + g.w);
            if (inGap) continue;
            ctx.beginPath();
            ctx.moveTo(gs(lx), gs(GROUND_Y + 4));
            ctx.lineTo(gs(lx + 20), gs(GROUND_Y + 4));
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // ── Draw Character ──
    function drawRunner() {
        const px = PLAYER_X;
        let py = runnerY;
        const t = performance.now();

        // Blink when invulnerable
        if (hitInvulnTimer > 0 && Math.floor(t / INVINCIBLE_BLINK) % 2 === 0) return;

        ctx.save();
        ctx.translate(gs(px), gs(py));

        const col = playerColor || '#FF6B9D';
        const skinColor = '#FFD5B4';
        const hairColor = '#8B4513';
        const shoeColor = '#333';

        if (isSliding) {
            // ── Slide pose: low, leaning forward ──
            // Body (horizontal)
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.ellipse(gs(2), gs(-6), gs(16), gs(6), 0, 0, Math.PI * 2);
            ctx.fill();
            // Head
            ctx.fillStyle = skinColor;
            ctx.beginPath();
            ctx.arc(gs(14), gs(-10), gs(7), 0, Math.PI * 2);
            ctx.fill();
            // Eyes
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(gs(17), gs(-11), gs(1.5), 0, Math.PI * 2); ctx.fill();
            // Hair flowing back
            ctx.fillStyle = hairColor;
            ctx.beginPath();
            ctx.moveTo(gs(8), gs(-16));
            ctx.quadraticCurveTo(gs(-6), gs(-18), gs(-14), gs(-13));
            ctx.quadraticCurveTo(gs(-4), gs(-12), gs(8), gs(-12));
            ctx.closePath();
            ctx.fill();
            // Shoes
            ctx.fillStyle = shoeColor;
            ctx.beginPath(); ctx.ellipse(gs(-10), gs(-3), gs(5), gs(3), 0, 0, Math.PI * 2); ctx.fill();
        } else if (!onGround) {
            // ── Jump pose: tucked ──
            const jumpPhase = runnerVY < 0 ? 0 : 1; // ascending vs descending
            // Body
            ctx.fillStyle = col;
            drawCanvasRoundRect(-gs(7), -gs(30), gs(14), gs(20), gs(4));
            // Head
            ctx.fillStyle = skinColor;
            ctx.beginPath();
            ctx.arc(0, gs(-38), gs(9), 0, Math.PI * 2);
            ctx.fill();
            // Eyes (excited!)
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(gs(3), gs(-39), gs(1.8), 0, Math.PI * 2); ctx.fill();
            ctx.beginPath();
            ctx.arc(gs(-3), gs(-39), gs(1.8), 0, Math.PI * 2); ctx.fill();
            // Smile
            ctx.strokeStyle = '#333';
            ctx.lineWidth = gs(1.2);
            ctx.beginPath();
            ctx.arc(0, gs(-35), gs(4), 0.1, Math.PI - 0.1);
            ctx.stroke();
            // Arms up!
            ctx.strokeStyle = skinColor;
            ctx.lineWidth = gs(3);
            ctx.beginPath(); ctx.moveTo(gs(-7), gs(-26)); ctx.lineTo(gs(-14), gs(-40)); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(gs(7), gs(-26)); ctx.lineTo(gs(14), gs(-40)); ctx.stroke();
            // Tucked legs
            ctx.strokeStyle = col;
            ctx.lineWidth = gs(4);
            ctx.beginPath(); ctx.moveTo(gs(-4), gs(-10)); ctx.lineTo(gs(-8), gs(-16)); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(gs(4), gs(-10)); ctx.lineTo(gs(8), gs(-16)); ctx.stroke();
            // Shoes
            ctx.fillStyle = shoeColor;
            ctx.beginPath(); ctx.arc(gs(-8), gs(-16), gs(3), 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(gs(8), gs(-16), gs(3), 0, Math.PI * 2); ctx.fill();
            // Hair flies up
            ctx.fillStyle = hairColor;
            ctx.beginPath();
            ctx.moveTo(gs(-6), gs(-45));
            const hairBounce = Math.sin(t * 0.01) * 3;
            ctx.quadraticCurveTo(gs(0), gs(-56 + hairBounce), gs(6), gs(-45));
            ctx.quadraticCurveTo(gs(3), gs(-48), gs(0), gs(-47));
            ctx.quadraticCurveTo(gs(-3), gs(-48), gs(-6), gs(-45));
            ctx.closePath();
            ctx.fill();
            // Ponytail flying up
            ctx.beginPath();
            ctx.moveTo(gs(-4), gs(-46));
            ctx.quadraticCurveTo(gs(-12), gs(-58 + hairBounce), gs(-8), gs(-50));
            ctx.stroke();
            ctx.lineWidth = gs(2.5);
            ctx.strokeStyle = hairColor;
            ctx.beginPath();
            ctx.moveTo(gs(-4), gs(-46));
            ctx.quadraticCurveTo(gs(-14), gs(-56 + hairBounce), gs(-10), gs(-48));
            ctx.stroke();
        } else {
            // ── Running pose ──
            const legCycle = Math.sin(runFrame * 0.3) ; // -1 to 1
            const armCycle = -legCycle;
            const bodyBob = Math.abs(Math.sin(runFrame * 0.3)) * 2;

            // Body
            ctx.fillStyle = col;
            drawCanvasRoundRect(-gs(7), -gs(30 + bodyBob), gs(14), gs(20), gs(4));

            // Head
            ctx.fillStyle = skinColor;
            ctx.beginPath();
            ctx.arc(0, gs(-38 - bodyBob), gs(9), 0, Math.PI * 2);
            ctx.fill();

            // Eyes
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(gs(3), gs(-39 - bodyBob), gs(1.8), 0, Math.PI * 2); ctx.fill();
            ctx.beginPath();
            ctx.arc(gs(-3), gs(-39 - bodyBob), gs(1.8), 0, Math.PI * 2); ctx.fill();

            // Smile
            ctx.strokeStyle = '#333';
            ctx.lineWidth = gs(1.2);
            ctx.beginPath();
            ctx.arc(0, gs(-35 - bodyBob), gs(3.5), 0.2, Math.PI - 0.2);
            ctx.stroke();

            // Blush
            ctx.fillStyle = 'rgba(255,150,150,0.3)';
            ctx.beginPath(); ctx.arc(gs(7), gs(-36 - bodyBob), gs(2.5), 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(gs(-7), gs(-36 - bodyBob), gs(2.5), 0, Math.PI * 2); ctx.fill();

            // Hair
            ctx.fillStyle = hairColor;
            ctx.beginPath();
            const hairBob = Math.sin(runFrame * 0.3 + 0.5) * 2;
            ctx.moveTo(gs(-7), gs(-45 - bodyBob));
            ctx.quadraticCurveTo(gs(0), gs(-52 - bodyBob), gs(7), gs(-45 - bodyBob));
            ctx.quadraticCurveTo(gs(4), gs(-47 - bodyBob), gs(0), gs(-47 - bodyBob));
            ctx.closePath();
            ctx.fill();

            // Ponytail (bounces!)
            ctx.strokeStyle = hairColor;
            ctx.lineWidth = gs(3);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(gs(-4), gs(-46 - bodyBob));
            ctx.quadraticCurveTo(
                gs(-18), gs(-44 - bodyBob + hairBob),
                gs(-16), gs(-36 - bodyBob + hairBob * 1.5)
            );
            ctx.stroke();

            // Arms pumping
            ctx.strokeStyle = skinColor;
            ctx.lineWidth = gs(3);
            ctx.lineCap = 'round';
            // Right arm
            const rArmAngle = armCycle * 0.6;
            ctx.beginPath();
            ctx.moveTo(gs(7), gs(-24 - bodyBob));
            ctx.lineTo(gs(7 + Math.sin(rArmAngle) * 10), gs(-24 - bodyBob + Math.cos(rArmAngle) * 8));
            ctx.stroke();
            // Left arm
            const lArmAngle = -armCycle * 0.6;
            ctx.beginPath();
            ctx.moveTo(gs(-7), gs(-24 - bodyBob));
            ctx.lineTo(gs(-7 + Math.sin(lArmAngle) * 10), gs(-24 - bodyBob + Math.cos(lArmAngle) * 8));
            ctx.stroke();

            // Legs
            ctx.strokeStyle = col;
            ctx.lineWidth = gs(4);
            // Right leg
            const rLegAngle = legCycle * 0.7;
            ctx.beginPath();
            ctx.moveTo(gs(3), gs(-10 - bodyBob));
            ctx.lineTo(gs(3 + Math.sin(rLegAngle) * 10), gs(-10 - bodyBob + Math.abs(Math.cos(rLegAngle)) * 10));
            ctx.stroke();
            // Left leg
            const lLegAngle = -legCycle * 0.7;
            ctx.beginPath();
            ctx.moveTo(gs(-3), gs(-10 - bodyBob));
            ctx.lineTo(gs(-3 + Math.sin(lLegAngle) * 10), gs(-10 - bodyBob + Math.abs(Math.cos(lLegAngle)) * 10));
            ctx.stroke();

            // Shoes
            ctx.fillStyle = shoeColor;
            const rFootX = 3 + Math.sin(rLegAngle) * 10;
            const rFootY = -10 - bodyBob + Math.abs(Math.cos(rLegAngle)) * 10;
            const lFootX = -3 + Math.sin(lLegAngle) * 10;
            const lFootY = -10 - bodyBob + Math.abs(Math.cos(lLegAngle)) * 10;
            ctx.beginPath(); ctx.ellipse(gs(rFootX), gs(rFootY), gs(4), gs(2.5), 0.2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(gs(lFootX), gs(lFootY), gs(4), gs(2.5), -0.2, 0, Math.PI * 2); ctx.fill();
        }

        // Star power glow
        if (starActive) {
            ctx.shadowBlur = gs(12);
            ctx.shadowColor = '#FFD700';
            ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
            ctx.beginPath();
            ctx.arc(0, gs(-20), gs(24), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Shoe boost trail lines
        if (shoeActive) {
            ctx.strokeStyle = playerColor;
            ctx.lineWidth = gs(1.5);
            ctx.globalAlpha = 0.4;
            for (let i = 0; i < 3; i++) {
                const ly = -10 + i * 8;
                ctx.beginPath();
                ctx.moveTo(gs(-14 - i * 6), gs(ly));
                ctx.lineTo(gs(-24 - i * 8), gs(ly));
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    function drawCanvasRoundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.fill();
    }

    // ── Draw Obstacles ──
    function drawObstacles() {
        const env = ENVS[envIndex];
        for (const ob of obstacles) {
            ctx.fillStyle = env.obstacles;
            switch (ob.type) {
                case OB_HURDLE:
                    // Post + bar
                    ctx.fillRect(gs(ob.x), gs(ob.y), gs(4), gs(ob.h));
                    ctx.fillRect(gs(ob.x + ob.w - 4), gs(ob.y), gs(4), gs(ob.h));
                    ctx.fillStyle = env.accents;
                    ctx.fillRect(gs(ob.x), gs(ob.y), gs(ob.w), gs(5));
                    break;
                case OB_WALL:
                    ctx.fillRect(gs(ob.x), gs(ob.y), gs(ob.w), gs(ob.h));
                    // Brick lines
                    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
                    ctx.lineWidth = gs(1);
                    for (let by = ob.y + 8; by < GROUND_Y; by += 8) {
                        ctx.beginPath();
                        ctx.moveTo(gs(ob.x), gs(by));
                        ctx.lineTo(gs(ob.x + ob.w), gs(by));
                        ctx.stroke();
                    }
                    break;
                case OB_OVERHEAD:
                    ctx.fillStyle = env.accents;
                    ctx.fillRect(gs(ob.x), gs(ob.y), gs(ob.w), gs(ob.h));
                    // Warning stripes
                    ctx.fillStyle = env.obstacles;
                    for (let sx = ob.x; sx < ob.x + ob.w; sx += 12) {
                        ctx.fillRect(gs(sx), gs(ob.y), gs(6), gs(ob.h));
                    }
                    break;
                case OB_GAP:
                    // Gap drawn as absence in ground - handled by drawGround
                    // Draw danger markers
                    ctx.fillStyle = '#F44336';
                    ctx.globalAlpha = 0.5 + Math.sin(performance.now() * 0.005) * 0.2;
                    ctx.fillRect(gs(ob.x), gs(GROUND_Y), gs(3), gs(8));
                    ctx.fillRect(gs(ob.x + ob.w - 3), gs(GROUND_Y), gs(3), gs(8));
                    ctx.globalAlpha = 1;
                    break;
                case OB_BIRD:
                    // Animated bird/butterfly
                    ctx.save();
                    ctx.translate(gs(ob.x + ob.w / 2), gs(ob.y));
                    const wingAngle = Math.sin(performance.now() * 0.008 + ob.phase) * 0.6;
                    ctx.fillStyle = env.accents;
                    // Body
                    ctx.beginPath();
                    ctx.ellipse(0, 0, gs(6), gs(4), 0, 0, Math.PI * 2);
                    ctx.fill();
                    // Wings
                    ctx.beginPath();
                    ctx.ellipse(gs(-6), gs(-2), gs(8), gs(3 + wingAngle * 4), -0.3, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(gs(6), gs(-2), gs(8), gs(3 + wingAngle * 4), 0.3, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                    break;
                case OB_COMBO:
                    // Bottom hurdle
                    ctx.fillRect(gs(ob.x), gs(ob.y), gs(ob.w), gs(ob.hurdleH));
                    ctx.fillStyle = env.accents;
                    ctx.fillRect(gs(ob.x), gs(ob.y), gs(ob.w), gs(4));
                    // Top overhead
                    ctx.fillStyle = env.accents;
                    ctx.fillRect(gs(ob.x), gs(ob.overY), gs(ob.w), gs(ob.overH));
                    ctx.fillStyle = env.obstacles;
                    for (let sx = ob.x; sx < ob.x + ob.w; sx += 12) {
                        ctx.fillRect(gs(sx), gs(ob.overY), gs(6), gs(ob.overH));
                    }
                    break;
            }
        }
    }

    // ── Draw Collectibles ──
    function drawCollectibles() {
        const t = performance.now();
        for (const c of collectibles) {
            if (c.collected) continue;
            ctx.save();
            ctx.translate(gs(c.x), gs(c.y));
            const bob = Math.sin(t * 0.004 + c.sparkle) * 3;
            ctx.translate(0, gs(bob));
            const s = gs(c.size);

            switch (c.type) {
                case CL_COIN:
                    // Gold circle with sparkle
                    ctx.fillStyle = '#FFD700';
                    ctx.shadowBlur = gs(4);
                    ctx.shadowColor = '#FFD700';
                    ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = '#FFF8B0';
                    ctx.beginPath(); ctx.arc(gs(-2), gs(-2), s * 0.35, 0, Math.PI * 2); ctx.fill();
                    break;
                case CL_GEM:
                    // Diamond shape
                    ctx.fillStyle = pick(['#E040FB', '#7C4DFF', '#00BCD4', '#FF4081']);
                    ctx.shadowBlur = gs(5);
                    ctx.shadowColor = ctx.fillStyle;
                    ctx.beginPath();
                    ctx.moveTo(0, -s);
                    ctx.lineTo(s * 0.7, 0);
                    ctx.lineTo(0, s);
                    ctx.lineTo(-s * 0.7, 0);
                    ctx.closePath();
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    ctx.beginPath();
                    ctx.moveTo(0, -s * 0.6);
                    ctx.lineTo(s * 0.3, 0);
                    ctx.lineTo(0, -s * 0.2);
                    ctx.closePath();
                    ctx.fill();
                    break;
                case CL_HEART:
                    ctx.fillStyle = '#F44336';
                    ctx.shadowBlur = gs(4);
                    ctx.shadowColor = '#F44336';
                    drawHeart(0, 0, s);
                    ctx.shadowBlur = 0;
                    break;
                case CL_STAR:
                    ctx.shadowBlur = gs(6);
                    ctx.shadowColor = '#FFD700';
                    drawStar4(0, 0, s * 1.2, s * 0.5, '#FFD700');
                    ctx.shadowBlur = 0;
                    break;
                case CL_SHOE:
                    ctx.fillStyle = '#2196F3';
                    ctx.shadowBlur = gs(4);
                    ctx.shadowColor = '#2196F3';
                    ctx.beginPath();
                    ctx.ellipse(0, 0, s, s * 0.6, -0.2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = '#FFF';
                    ctx.beginPath();
                    ctx.ellipse(gs(2), gs(-2), s * 0.3, s * 0.2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // Speed lines
                    ctx.strokeStyle = '#64B5F6';
                    ctx.lineWidth = gs(1);
                    for (let i = 0; i < 3; i++) {
                        ctx.beginPath();
                        ctx.moveTo(gs(-s - 3 - i * 4), gs(-3 + i * 3));
                        ctx.lineTo(gs(-s - 8 - i * 4), gs(-3 + i * 3));
                        ctx.stroke();
                    }
                    break;
            }
            ctx.restore();
        }
    }

    function drawHeart(cx, cy, r) {
        ctx.beginPath();
        ctx.moveTo(cx, cy + r * 0.3);
        ctx.bezierCurveTo(cx - r, cy - r * 0.5, cx - r * 0.5, cy - r, cx, cy - r * 0.4);
        ctx.bezierCurveTo(cx + r * 0.5, cy - r, cx + r, cy - r * 0.5, cx, cy + r * 0.3);
        ctx.fill();
    }

    // ── HUD ──
    function drawHUD() {
        const t = performance.now();
        ctx.save();

        // Distance (big, center top)
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold ' + gs(22) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = gs(3);
        const distM = Math.floor(distance);
        ctx.fillText(distM + 'm', canvas.width / 2, gs(10));

        // Coins (top left)
        ctx.textAlign = 'left';
        ctx.font = 'bold ' + gs(14) + 'px monospace';
        // Coin icon
        ctx.fillStyle = '#FFD700';
        ctx.beginPath(); ctx.arc(gs(18), gs(18), gs(7), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFF';
        ctx.fillText('' + coins, gs(30), gs(12));

        // Lives (top right)
        ctx.textAlign = 'right';
        for (let i = 0; i < lives; i++) {
            ctx.fillStyle = '#F44336';
            drawHeartHUD(GAME_W - 16 - i * 22, 16, 8);
        }

        // Speed indicator
        const speedPct = (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(gs(GAME_W - 80), gs(34), gs(65), gs(4));
        const barColor = speedPct > 0.7 ? '#F44336' : speedPct > 0.4 ? '#FF9800' : '#4CAF50';
        ctx.fillStyle = barColor;
        ctx.fillRect(gs(GAME_W - 80), gs(34), gs(65 * speedPct), gs(4));

        // Power-up timer
        if (starActive) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold ' + gs(11) + 'px monospace';
            ctx.textAlign = 'center';
            const sec = Math.ceil(starTimer / 1000);
            ctx.fillText('STAR ' + sec + 's', canvas.width / 2, gs(36));
        }
        if (shoeActive) {
            ctx.fillStyle = '#2196F3';
            ctx.font = 'bold ' + gs(11) + 'px monospace';
            ctx.textAlign = 'center';
            const sec = Math.ceil(shoeTimer / 1000);
            ctx.fillText('SPEED ' + sec + 's', canvas.width / 2, gs(starActive ? 50 : 36));
        }

        // Milestone popup
        if (milestoneTimer > 0) {
            const alpha = milestoneTimer > MILESTONE_DISPLAY * 0.8 ? (MILESTONE_DISPLAY - milestoneTimer) / (MILESTONE_DISPLAY * 0.2) : milestoneTimer > MILESTONE_DISPLAY * 0.2 ? 1 : milestoneTimer / (MILESTONE_DISPLAY * 0.2);
            ctx.globalAlpha = clamp(alpha, 0, 1);
            const scale = 1 + (1 - clamp(alpha, 0, 1)) * 0.3;
            ctx.font = 'bold ' + gs(28 * scale) + 'px monospace';
            ctx.fillStyle = milestoneText.includes('BEST') ? '#FFD700' : '#FFF';
            ctx.textAlign = 'center';
            ctx.shadowBlur = gs(6);
            ctx.shadowColor = milestoneText.includes('BEST') ? '#FFD700' : '#000';
            ctx.fillText(milestoneText, canvas.width / 2, gs(GAME_H / 2 - 30));
            ctx.globalAlpha = 1;
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    function drawHeartHUD(cx, cy, r) {
        ctx.save();
        ctx.translate(gs(cx), gs(cy));
        drawHeart(0, 0, gs(r));
        ctx.restore();
    }

    // ── Draw Splash ──
    function drawSplash() {
        const t = performance.now();
        const env = ENVS[0];
        // BG
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, '#87CEEB');
        grad.addColorStop(1, '#D4F1F9');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Ground
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(0, gs(GROUND_Y), canvas.width, gs(GROUND_H));

        // Title
        ctx.save();
        const bounce = Math.sin(t * 0.003) * 5;
        ctx.fillStyle = playerColor || '#FF6B9D';
        ctx.font = 'bold ' + gs(36) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = gs(4);
        ctx.fillText('JUMP DASH', canvas.width / 2, gs(100 + bounce));
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold ' + gs(14) + 'px monospace';
        ctx.fillText('Tap or Space to Start!', canvas.width / 2, gs(150));

        // Best distance
        if (bestDistance > 0) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold ' + gs(12) + 'px monospace';
            ctx.fillText('Best: ' + Math.floor(bestDistance) + 'm', canvas.width / 2, gs(175));
        }

        // Controls hint
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = gs(10) + 'px monospace';
        ctx.fillText('SPACE/TAP = Jump | HOLD = Higher | DOWN/SWIPE = Slide', canvas.width / 2, gs(GROUND_Y - 15));

        ctx.restore();

        // Draw idle runner
        const savedY = runnerY;
        const savedSlide = isSliding;
        const savedGround = onGround;
        runnerY = GROUND_Y;
        isSliding = false;
        onGround = true;
        runFrame = t * 0.01;
        drawRunner();
        runnerY = savedY;
        isSliding = savedSlide;
        onGround = savedGround;
    }

    // ── Draw Game Over ──
    function drawGameOver() {
        // Dim overlay
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold ' + gs(30) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = gs(4);
        ctx.fillText('GAME OVER', canvas.width / 2, gs(100));

        ctx.font = 'bold ' + gs(18) + 'px monospace';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(Math.floor(distance) + 'm', canvas.width / 2, gs(140));

        ctx.font = gs(13) + 'px monospace';
        ctx.fillStyle = '#FFF';
        ctx.fillText('Coins: ' + coins, canvas.width / 2, gs(170));

        if (distance >= bestDistance) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold ' + gs(16) + 'px monospace';
            ctx.fillText('NEW BEST!', canvas.width / 2, gs(200));
        } else {
            ctx.fillStyle = '#AAA';
            ctx.font = gs(12) + 'px monospace';
            ctx.fillText('Best: ' + Math.floor(bestDistance) + 'm', canvas.width / 2, gs(200));
        }

        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = gs(12) + 'px monospace';
        ctx.fillText('Tap or Space to Retry', canvas.width / 2, gs(240));

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // ── Collision ──
    function getPlayerBox() {
        if (isSliding) {
            return { x: PLAYER_X - 10, y: runnerY - SLIDE_H, w: 24, h: SLIDE_H };
        }
        return { x: PLAYER_X - 8, y: runnerY - PLAYER_H, w: 16, h: PLAYER_H };
    }

    function boxOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function checkObstacleCollision() {
        if (starActive) return false;
        if (hitInvulnTimer > 0) return false;
        const pb = getPlayerBox();

        for (const ob of obstacles) {
            let hitBoxes = [];
            switch (ob.type) {
                case OB_HURDLE:
                    hitBoxes.push({ x: ob.x, y: ob.y, w: ob.w, h: ob.h });
                    break;
                case OB_WALL:
                    hitBoxes.push({ x: ob.x, y: ob.y, w: ob.w, h: ob.h });
                    break;
                case OB_OVERHEAD:
                    hitBoxes.push({ x: ob.x, y: ob.y, w: ob.w, h: ob.h });
                    break;
                case OB_GAP:
                    // Fall into gap = death if player on ground over gap
                    if (onGround && pb.x + pb.w > ob.x + 6 && pb.x < ob.x + ob.w - 6) {
                        return true; // instant death for gap
                    }
                    continue;
                case OB_BIRD:
                    hitBoxes.push({ x: ob.x, y: ob.y - 7, w: ob.w, h: 14 });
                    break;
                case OB_COMBO:
                    hitBoxes.push({ x: ob.x, y: ob.y, w: ob.w, h: ob.hurdleH });
                    hitBoxes.push({ x: ob.x, y: ob.overY, w: ob.w, h: ob.overH });
                    break;
            }
            for (const hb of hitBoxes) {
                if (boxOverlap(pb, hb)) return true;
            }
        }
        return false;
    }

    function checkCollectiblePickup() {
        const pb = getPlayerBox();
        const magnet = starActive ? 80 : 0;

        for (const c of collectibles) {
            if (c.collected) continue;
            // Magnet pull
            if (magnet > 0) {
                const dx = PLAYER_X - c.x;
                const dy = (runnerY - 18) - c.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < magnet && dist > 1) {
                    c.x += dx / dist * 3;
                    c.y += dy / dist * 3;
                }
            }
            const cb = { x: c.x - c.size, y: c.y - c.size, w: c.size * 2, h: c.size * 2 };
            if (boxOverlap(pb, cb)) {
                c.collected = true;
                collectItem(c);
            }
        }
    }

    function collectItem(c) {
        switch (c.type) {
            case CL_COIN:
                coins += COIN_VALUE;
                sfxCoin();
                addFloat(c.x, c.y, '+' + COIN_VALUE, '#FFD700');
                spawnParticle(c.x, c.y, 'sparkle', '#FFD700', 4);
                break;
            case CL_GEM:
                coins += GEM_VALUE;
                sfxGem();
                addFloat(c.x, c.y, '+' + GEM_VALUE, '#E040FB');
                spawnParticle(c.x, c.y, 'sparkle', '#E040FB', 6);
                break;
            case CL_HEART:
                lives = Math.min(lives + 1, 5);
                sfxHeart();
                addFloat(c.x, c.y, '+1 LIFE', '#F44336');
                spawnParticle(c.x, c.y, 'circle', '#F44336', 5);
                break;
            case CL_STAR:
                starActive = true;
                starTimer = STAR_DURATION;
                sfxStar();
                addFloat(c.x, c.y, 'STAR!', '#FFD700');
                spawnParticle(c.x, c.y, 'star', '#FFD700', 8);
                break;
            case CL_SHOE:
                shoeActive = true;
                shoeTimer = SHOE_DURATION;
                sfxShoe();
                addFloat(c.x, c.y, 'SPEED!', '#2196F3');
                spawnParticle(c.x, c.y, 'sparkle', '#2196F3', 6);
                break;
        }
    }

    // ── Hit & Death ──
    function hitPlayer() {
        lives--;
        sfxHit();
        spawnParticle(PLAYER_X, runnerY - 20, 'star', '#F44336', 6);
        spawnParticle(PLAYER_X, runnerY - 20, 'circle', '#FFF', 4);
        if (lives <= 0) {
            die();
        } else {
            hitInvulnTimer = HIT_INVULN;
            addFloat(PLAYER_X, runnerY - 40, 'OUCH!', '#F44336');
        }
    }

    function die() {
        state = ST_DEAD;
        if (distance > bestDistance) {
            bestDistance = distance;
            try { localStorage.setItem('ywa_jumpdash_best', Math.floor(bestDistance)); } catch(e) {}
        }
        sfxHit();
        // Death particles
        spawnParticle(PLAYER_X, runnerY - 20, 'circle', playerColor, 12);
        spawnParticle(PLAYER_X, runnerY - 20, 'star', '#FFD700', 5);
        setTimeout(() => {
            state = ST_OVER;
            if (gameOverCB) {
                gameOverCB({ score: coins + Math.floor(distance), distance: Math.floor(distance), coins });
            }
        }, 1200);
    }

    // ── Update ──
    function update(dt) {
        if (state !== ST_PLAY) return;
        const dtSec = dt / 1000;
        const effectiveSpeed = speed * (shoeActive ? SHOE_SPEED_MULT : 1);

        // Scroll
        scrollX += effectiveSpeed;
        distance += effectiveSpeed * 0.06; // roughly m per frame

        // Speed progression
        const distCheckpoint = Math.floor(distance / 500);
        speed = Math.min(BASE_SPEED + distCheckpoint * SPEED_INCR, MAX_SPEED);

        // Unlock obstacle types gradually
        obstacleTypes = [OB_HURDLE];
        if (distance > 200) obstacleTypes.push(OB_OVERHEAD);
        if (distance > 400) obstacleTypes.push(OB_WALL);
        if (distance > 600) obstacleTypes.push(OB_GAP);
        if (distance > 900) obstacleTypes.push(OB_BIRD);
        if (distance > 1500) obstacleTypes.push(OB_COMBO);

        // Environment cycling
        envIndex = Math.floor(distance / ENV_CYCLE) % ENVS.length;

        // Milestones
        if (distance >= nextMilestone) {
            if (distance >= bestDistance && bestDistance > 50 && !milestoneText?.includes('BEST')) {
                milestoneText = 'NEW BEST!';
                sfxNewBest();
            } else {
                milestoneText = nextMilestone + 'm!';
                sfxMilestone();
            }
            milestoneTimer = MILESTONE_DISPLAY;
            nextMilestone += 500;
        }
        if (milestoneTimer > 0) milestoneTimer -= dt;

        // Jump hold boost
        if (jumpHeld && runnerVY < 0 && jumpHeldTimer < 200) {
            runnerVY += JUMP_HOLD_BOOST;
            jumpHeldTimer += dt;
        }

        // Gravity
        if (!onGround) {
            runnerVY += GRAVITY;
            runnerY += runnerVY;
            // Landing
            if (runnerY >= GROUND_Y) {
                // Check if over a gap
                const overGap = obstacles.some(o => o.isGap && PLAYER_X + 8 > o.x && PLAYER_X - 8 < o.x + o.w);
                if (overGap) {
                    runnerY += 5; // fall through
                } else {
                    runnerY = GROUND_Y;
                    runnerVY = 0;
                    onGround = true;
                    canDoubleJump = true;
                }
            }
        }

        // Slide timer
        if (isSliding) {
            slideTimer -= dt;
            if (slideTimer <= 0) {
                isSliding = false;
            }
        }

        // Running animation
        if (onGround && !isSliding) {
            runFrame += effectiveSpeed * 0.4;
        }

        // Hit invulnerability
        if (hitInvulnTimer > 0) hitInvulnTimer -= dt;

        // Power-up timers
        if (starActive) {
            starTimer -= dt;
            if (starTimer <= 0) starActive = false;
        }
        if (shoeActive) {
            shoeTimer -= dt;
            if (shoeTimer <= 0) shoeActive = false;
        }

        // Trail particles when powered up
        if ((starActive || shoeActive) && frameCount % 2 === 0) {
            spawnTrailParticle(PLAYER_X - 12, runnerY - 10);
        }

        // Spawn obstacles
        if (scrollX + GAME_W > nextObstacleX) {
            spawnObstacle();
        }
        // Spawn collectibles
        if (scrollX + GAME_W > nextCollectibleX) {
            spawnCollectibles();
        }

        // Move obstacles with scroll
        for (const ob of obstacles) {
            ob.x -= effectiveSpeed;
            if (ob.type === OB_BIRD) {
                ob.y = ob.baseY + Math.sin(performance.now() * 0.004 + ob.phase) * 15;
            }
        }
        // Move collectibles
        for (const c of collectibles) {
            if (!c.collected) c.x -= effectiveSpeed;
        }

        // Clean up off-screen
        obstacles = obstacles.filter(o => o.x + (o.w || 80) > -50);
        collectibles = collectibles.filter(c => c.x > -50);

        // Collisions
        if (checkObstacleCollision()) {
            hitPlayer();
        }
        checkCollectiblePickup();

        // Ambient particles
        if (frameCount % 12 === 0) spawnAmbientParticle();

        // Fall death
        if (runnerY > GAME_H + 50) {
            lives = 0;
            die();
        }

        updateParticles(dtSec);
        updateFloats(dtSec);
    }

    // ── Main draw ──
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (state === ST_SPLASH) {
            drawSplash();
            return;
        }

        drawBackground();
        drawGround();
        drawObstacles();
        drawCollectibles();
        drawParticles();
        drawRunner();
        drawFloats();
        drawHUD();

        if (state === ST_OVER) {
            drawGameOver();
        }
        if (state === ST_DEAD) {
            // Brief freeze
            ctx.fillStyle = 'rgba(255,0,0,0.1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Touch slide zone indicator
        if (state === ST_PLAY && 'ontouchstart' in window) {
            ctx.save();
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = '#FFF';
            ctx.font = gs(10) + 'px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('SWIPE DOWN = SLIDE', canvas.width / 2, gs(GROUND_Y + GROUND_H / 2 + 3));
            ctx.restore();
        }
    }

    // ── Game loop ──
    function loop(ts) {
        if (!gameActive) return;
        if (!lastTime) lastTime = ts;
        const dt = Math.min(ts - lastTime, 50); // cap delta
        lastTime = ts;
        frameCount++;

        update(dt);
        draw();

        animFrame = requestAnimationFrame(loop);
    }

    // ── Input ──
    function doJump() {
        if (state === ST_SPLASH) {
            startGame();
            return;
        }
        if (state === ST_OVER) {
            resetGame();
            state = ST_SPLASH;
            return;
        }
        if (state !== ST_PLAY) return;

        ensureAudio();

        if (onGround && !isSliding) {
            runnerVY = JUMP_VEL;
            onGround = false;
            jumpHeld = true;
            jumpHeldTimer = 0;
            sfxJump();
        } else if (!onGround && canDoubleJump) {
            runnerVY = DOUBLE_JUMP_VEL;
            canDoubleJump = false;
            sfxDoubleJump();
            spawnParticle(PLAYER_X, runnerY, 'circle', '#FFF', 4);
        }
    }

    function doSlide() {
        if (state !== ST_PLAY) return;
        if (onGround && !isSliding) {
            isSliding = true;
            slideTimer = SLIDE_DURATION;
            sfxSlide();
        }
    }

    function releaseJump() {
        jumpHeld = false;
    }

    function handleKeyDown(e) {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault();
            doJump();
        }
        if (e.code === 'ArrowDown') {
            e.preventDefault();
            doSlide();
        }
    }

    function handleKeyUp(e) {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            releaseJump();
        }
    }

    function handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        touchStartY = touch.clientY;
        touchStartTime = performance.now();
        touchId = touch.identifier;
        doJump();
    }

    function handleTouchEnd(e) {
        e.preventDefault();
        releaseJump();
        // Check for swipe down
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchId) {
                const dy = touch.clientY - touchStartY;
                const dt = performance.now() - touchStartTime;
                if (dy > 30 && dt < 400) {
                    doSlide();
                }
            }
        }
    }

    function handleClick(e) {
        if (state === ST_SPLASH || state === ST_OVER) {
            doJump();
        }
    }

    // ── Start / Reset ──
    function startGame() {
        state = ST_PLAY;
        resetGame();
    }

    function resetGame() {
        runnerY = GROUND_Y;
        runnerVY = 0;
        onGround = true;
        canDoubleJump = true;
        isSliding = false;
        slideTimer = 0;
        jumpHeld = false;
        jumpHeldTimer = 0;
        lives = STARTING_LIVES;
        coins = 0;
        distance = 0;
        speed = BASE_SPEED;
        hitInvulnTimer = 0;
        starActive = false;
        starTimer = 0;
        shoeActive = false;
        shoeTimer = 0;
        scrollX = 0;
        obstacles = [];
        collectibles = [];
        particles = [];
        floats = [];
        envIndex = 0;
        runFrame = 0;
        frameCount = 0;
        nextMilestone = 500;
        milestoneText = '';
        milestoneTimer = 0;
        nextObstacleX = GAME_W + 200;
        nextCollectibleX = GAME_W + 100;
        obstacleTypes = [OB_HURDLE];
        initBGLayers();
    }

    // ── Canvas fit ──
    function fitCanvas() {
        if (!canvas) return;
        const cw = canvas.parentElement?.clientWidth || window.innerWidth;
        const ch = canvas.parentElement?.clientHeight || window.innerHeight;
        const aspect = GAME_W / GAME_H;
        let drawW, drawH;
        if (cw / ch > aspect) { drawH = ch; drawW = ch * aspect; }
        else { drawW = cw; drawH = cw / aspect; }
        canvas.style.width = drawW + 'px';
        canvas.style.height = drawH + 'px';
    }

    // ── Public API ──
    function init(canvasEl, player, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');

        DPR = window.devicePixelRatio || 1;
        SCALE = DPR;
        canvas.width = GAME_W * DPR;
        canvas.height = GAME_H * DPR;

        activePlayer = player || null;
        playerColor = player?.color || '#FF6B9D';
        gameOverCB = gameOverCallback || null;
        gameActive = true;

        state = ST_SPLASH;
        bestDistance = parseInt(localStorage.getItem('ywa_jumpdash_best') || '0', 10);
        resetGame();
        lastTime = null;

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });
        window.addEventListener('resize', fitCanvas);

        if (!inputBound) {
            document.addEventListener('keydown', handleKeyDown);
            document.addEventListener('keyup', handleKeyUp);
            canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
            canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
            canvas.addEventListener('click', handleClick);
            inputBound = true;
        }

        animFrame = requestAnimationFrame(loop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) {
            cancelAnimationFrame(animFrame);
            animFrame = null;
        }
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        if (canvas) {
            canvas.removeEventListener('touchstart', handleTouchStart);
            canvas.removeEventListener('touchend', handleTouchEnd);
            canvas.removeEventListener('click', handleClick);
        }
        window.removeEventListener('resize', fitCanvas);
        inputBound = false;
        if (audioCtx) {
            try { audioCtx.close(); } catch (e) {}
            audioCtx = null;
        }
    }

    return {
        init,
        destroy,
        getScore() { return coins + Math.floor(distance); },
        getDistance() { return Math.floor(distance); },
        getCoins() { return coins; },
        isActive() { return gameActive; }
    };
})();
