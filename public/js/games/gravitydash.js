/* YWA GravityDash — Gravity-flipping endless runner with neon synthwave aesthetic */
window.GravityDash = (() => {

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
    const GAME_W = 640, GAME_H = 360;
    const FLOOR_H = 30, CEIL_H = 30;
    const PLAYER_SIZE = 18;
    const BASE_SPEED = 3.2;
    const MAX_SPEED = 8.5;
    const SPEED_RAMP = 0.0003; // per frame
    const GRAVITY_STRENGTH = 0.62;
    const MAX_FALL = 11;
    const FLIP_IMPULSE = -10;
    const ORB_RADIUS = 7;
    const SPIKE_H = 22, SPIKE_W = 16;
    const BARRIER_W = 14;
    const GAP_MIN = 60, GAP_MAX = 100;
    const PORTAL_W = 12, PORTAL_H = 50;
    const SPEED_ZONE_W = 80;
    const CHECKPOINT_DIST = 500;
    const TRAIL_LEN = 14;
    const PARTICLE_MAX = 60;

    // States
    const ST_TITLE = 0, ST_PLAY = 1, ST_DEAD = 2;

    // Game state
    let canvas, ctx, W, H, SCALE, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor, playerGlow;
    let state, frameCount, lastTime, dt;
    let distance, score, combo, bestCombo, scrollSpeed, bestScore;
    let gravityDir; // 1 = normal (down), -1 = flipped (up)
    let player; // { x, y, vy, trail: [], expression }
    let obstacles, orbs, speedZones, portals;
    let coins; // coin/gem collectibles
    let gravityZones; // zones that pull player toward floor/ceiling
    let particles, ripple, screenShake;
    let gridOffset;
    let spawnTimer, nextCheckpoint;
    let deathTimer;
    let speedBoostTimer, speedBoostMult;
    let vignetteGrad;
    let keys = {};
    let floorY, ceilY;
    let obstaclePassed; // combo: obstacles passed without flipping
    let comboMultiplier;
    let parallaxLayers; // background parallax layers
    let closeCalls; // track near misses

    // Audio
    let audioCtx;
    function getAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }
    function playTone(freq, dur, type = 'square', vol = 0.1, slide = 0) {
        try {
            const a = getAudio(), o = a.createOscillator(), g = a.createGain();
            o.type = type; o.frequency.setValueAtTime(freq, a.currentTime);
            if (slide) o.frequency.linearRampToValueAtTime(slide, a.currentTime + dur);
            g.gain.setValueAtTime(vol, a.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
            o.connect(g); g.connect(a.destination);
            o.start(); o.stop(a.currentTime + dur);
        } catch {}
    }
    function sfxFlip() { playTone(320, 0.12, 'sine', 0.12, 800); }
    function sfxOrb() { playTone(880, 0.08, 'sine', 0.1); setTimeout(() => playTone(1100, 0.1, 'sine', 0.1), 50); }
    function sfxDeath() { playTone(200, 0.4, 'sawtooth', 0.15, 60); }
    function sfxCheckpoint() { playTone(660, 0.15, 'sine', 0.1); setTimeout(() => playTone(880, 0.2, 'sine', 0.12), 120); }
    function sfxPortal() { playTone(440, 0.2, 'triangle', 0.1, 1200); }
    function sfxSpeedZone() { playTone(500, 0.1, 'sawtooth', 0.06, 900); }
    function sfxCombo() { playTone(1200 + combo * 40, 0.15, 'sine', 0.08); }
    function sfxCoin() { playTone(1000, 0.05, 'sine', 0.09); setTimeout(() => playTone(1300, 0.06, 'sine', 0.09), 30); }
    function sfxCloseCall() { playTone(700, 0.08, 'triangle', 0.06, 1000); }
    function sfxDestroy() { playTone(150, 0.2, 'sawtooth', 0.12, 50); }

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




    function drawGravityFlipButton(ctx, W, H, gs) {
        if (!HAS_TOUCH) return;
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var bw = gs(100), bh = gs(50);
        var bx = W / 2 - bw / 2, by = H - gs(70);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, gs(10)); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = 'bold ' + gs(18) + 'px monospace';
        ctx.fillText('FLIP', W / 2, by + bh / 2);
        ctx.restore();
    }

    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }

    // ── Canvas Fitting ──
    function fitCanvas() {
        if (!canvas) return;
        const p = canvas.parentElement || document.body;
        const pw = p.clientWidth || 960, ph = p.clientHeight || 540;
        const aspect = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > aspect) { ch = ph; cw = ch * aspect; }
        else { cw = pw; ch = cw / aspect; }
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
        vignetteGrad = null; // rebuild on next draw
    }

    // ── Game Reset ──
    function resetGame() {
        distance = 0;
        score = 0;
        combo = 0;
        bestCombo = 0;
        scrollSpeed = BASE_SPEED;
        gravityDir = 1;
        frameCount = 0;
        gridOffset = 0;
        spawnTimer = 0;
        nextCheckpoint = CHECKPOINT_DIST;
        speedBoostTimer = 0;
        speedBoostMult = 1;
        screenShake = 0;
        ripple = null;
        deathTimer = 0;

        floorY = GAME_H - FLOOR_H;
        ceilY = CEIL_H;

        obstaclePassed = 0;
        comboMultiplier = 1;
        closeCalls = [];

        player = {
            x: 80,
            y: floorY - PLAYER_SIZE,
            vy: 0,
            trail: [],
            onSurface: true,
            expression: 'normal', // normal, happy, scared, cool
            expressionTimer: 0
        };

        obstacles = [];
        orbs = [];
        speedZones = [];
        portals = [];
        coins = [];
        gravityZones = [];
        particles = [];

        // Parallax background layers
        parallaxLayers = [
            { elements: [], speed: 0.1, color: '#1a1a3e' }, // far mountains
            { elements: [], speed: 0.3, color: '#252550' }, // near mountains
            { elements: [], speed: 0.5, color: '#303068' }, // city skyline
        ];
        // Generate mountain/city silhouettes
        for (const layer of parallaxLayers) {
            for (let x = 0; x < GAME_W + 200; x += rng(30, 60)) {
                layer.elements.push({
                    x, h: rng(20, 80), w: rng(20, 50),
                    type: layer.speed > 0.4 ? 'building' : 'mountain'
                });
            }
        }

        // Seed some initial content ahead
        for (let d = GAME_W + 50; d < GAME_W + 600; d += rng(80, 160)) {
            spawnObstacle(d);
        }
        for (let d = GAME_W + 30; d < GAME_W + 600; d += rng(60, 130)) {
            if (Math.random() < 0.5) spawnOrb(d);
        }
    }

    // ── Spawning ──
    function spawnObstacle(xPos) {
        const x = xPos || GAME_W + rng(20, 80);
        const type = Math.random();

        if (type < 0.25) {
            // Floor spike
            obstacles.push({ x, y: floorY - SPIKE_H, w: SPIKE_W, h: SPIKE_H, type: 'spike', side: 'floor', passed: false });
        } else if (type < 0.45) {
            // Ceiling spike
            obstacles.push({ x, y: ceilY, w: SPIKE_W, h: SPIKE_H, type: 'spike', side: 'ceil', passed: false });
        } else if (type < 0.58) {
            // Both spikes — narrow gap
            const gapH = rng(GAP_MIN, GAP_MAX);
            const gapY = rng(ceilY + 50, floorY - 50 - gapH);
            obstacles.push({ x, y: ceilY, w: BARRIER_W, h: gapY - ceilY, type: 'barrier', passed: false });
            obstacles.push({ x, y: gapY + gapH, w: BARRIER_W, h: floorY - (gapY + gapH), type: 'barrier', passed: false });
        } else if (type < 0.68) {
            // Floating barrier
            const bH = rng(40, 90);
            const bY = rng(ceilY + 30, floorY - bH - 30);
            obstacles.push({ x, y: bY, w: BARRIER_W, h: bH, type: 'barrier', passed: false });
        } else if (type < 0.78) {
            // Laser — pulses on/off
            const laserY = rng(ceilY + 30, floorY - 30);
            obstacles.push({ x, y: laserY, w: 40, h: 4, type: 'laser', pulsePhase: rng(0, Math.PI * 2), passed: false });
        } else if (type < 0.86) {
            // Moving wall — oscillates vertically
            const baseY = (ceilY + floorY) / 2;
            obstacles.push({ x, y: baseY, w: BARRIER_W, h: rng(40, 70), type: 'moving', baseY, amplitude: rng(30, 60), phase: rng(0, Math.PI * 2), passed: false });
        } else if (type < 0.93) {
            // Destructible obstacle — breaks at high speed
            const bH = rng(30, 60);
            const bY = rng(ceilY + 30, floorY - bH - 30);
            obstacles.push({ x, y: bY, w: BARRIER_W + 4, h: bH, type: 'destructible', hp: 1, passed: false });
        } else {
            // Double spike pair
            obstacles.push({ x, y: floorY - SPIKE_H, w: SPIKE_W, h: SPIKE_H, type: 'spike', side: 'floor', passed: false });
            obstacles.push({ x: x + SPIKE_W + 8, y: ceilY, w: SPIKE_W, h: SPIKE_H, type: 'spike', side: 'ceil', passed: false });
        }
    }

    function spawnCoin(xPos) {
        const x = xPos || GAME_W + rng(20, 60);
        const y = rng(ceilY + 25, floorY - 25);
        const isGem = Math.random() < 0.2;
        coins.push({ x, y, alive: true, pulse: rng(0, Math.PI * 2), gem: isGem, value: isGem ? 50 : 15 });
    }

    function spawnGravityZone(xPos) {
        const x = xPos || GAME_W + rng(20, 60);
        const dir = Math.random() < 0.5 ? 1 : -1; // 1=pull down, -1=pull up
        gravityZones.push({ x, y: ceilY, w: rng(60, 120), h: floorY - ceilY, dir, alpha: 0.7 });
    }

    function spawnOrb(xPos) {
        const x = xPos || GAME_W + rng(20, 60);
        const y = rng(ceilY + 30, floorY - 30);
        orbs.push({ x, y, alive: true, pulse: Math.random() * Math.PI * 2 });
    }

    function spawnSpeedZone(xPos) {
        const x = xPos || GAME_W + rng(20, 60);
        const boost = Math.random() < 0.65 ? 1.6 : 0.5;
        speedZones.push({ x, y: ceilY, w: SPEED_ZONE_W, h: floorY - ceilY, boost, alpha: 0.8 });
    }

    function spawnPortal(xPos) {
        const x = xPos || GAME_W + 40;
        const entryY = rng(ceilY + 20, floorY - PORTAL_H - 20);
        let exitY = rng(ceilY + 20, floorY - PORTAL_H - 20);
        while (Math.abs(exitY - entryY) < 60) exitY = rng(ceilY + 20, floorY - PORTAL_H - 20);
        portals.push({ x, entryY, exitY, w: PORTAL_W, h: PORTAL_H, used: false, glow: 0 });
    }

    function spawnContent() {
        spawnTimer += scrollSpeed * speedBoostMult;
        if (spawnTimer > 70 + Math.random() * 40) {
            spawnTimer = 0;
            const r = Math.random();
            if (r < 0.42) {
                spawnObstacle();
            } else if (r < 0.58) {
                spawnOrb();
            } else if (r < 0.72) {
                spawnCoin();
            } else if (r < 0.80) {
                spawnSpeedZone();
            } else if (r < 0.88) {
                spawnPortal();
            } else {
                spawnGravityZone();
            }
            // Coin trails between obstacles
            if (Math.random() < 0.3) {
                const cx = GAME_W + rng(40, 120);
                for (let ci = 0; ci < 3; ci++) {
                    spawnCoin(cx + ci * 25);
                }
            }
            // Extra obstacle clusters at higher speeds
            if (scrollSpeed > 5 && Math.random() < 0.3) {
                spawnObstacle(GAME_W + rng(100, 180));
            }
        }
    }

    // ── Particles ──
    function emitParticles(x, y, count, color, spread = 3, life = 30) {
        for (let i = 0; i < count && particles.length < PARTICLE_MAX; i++) {
            particles.push({
                x, y,
                vx: rng(-spread, spread),
                vy: rng(-spread, spread),
                life: life + rng(0, 15),
                maxLife: life + 15,
                color,
                size: rng(1.5, 4)
            });
        }
    }

    function triggerRipple() {
        ripple = { y: player.y + PLAYER_SIZE / 2, alpha: 0.7, width: 0, maxWidth: GAME_W };
    }

    // ── Input ──
    function flipGravity() {
        if (state !== ST_PLAY) return;
        gravityDir *= -1;
        player.vy = FLIP_IMPULSE * gravityDir;
        player.onSurface = false;
        // Reset obstacle pass combo on flip
        obstaclePassed = 0;
        comboMultiplier = 1;
        sfxFlip();
        triggerRipple();
        emitParticles(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2, 8, playerColor, 2, 20);
        screenShake = 4;
    }

    function onKeyDown(e) {
        keys[e.code] = true;
        if ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') && state === ST_PLAY) {
            e.preventDefault();
            flipGravity();
        }
        if (state === ST_TITLE && (e.code === 'Space' || e.code === 'Enter')) {
            e.preventDefault();
            startPlaying();
        }
        if (state === ST_DEAD && deathTimer <= 0 && (e.code === 'Space' || e.code === 'Enter')) {
            e.preventDefault();
            startPlaying();
        }
    }
    function onKeyUp(e) { keys[e.code] = false; }

    function onTouchStart(e) {
        e.preventDefault();
        if (state === ST_PLAY) flipGravity();
        else if (state === ST_TITLE) startPlaying();
        else if (state === ST_DEAD && deathTimer <= 0) startPlaying();
    }
    function onTouchMove(e) { e.preventDefault(); }
    function onTouchEnd(e) { e.preventDefault(); }

    function startPlaying() {
        resetGame();
        state = ST_PLAY;
    }

    // ── Update ──
    function update() {
        frameCount++;
        const effectiveSpeed = scrollSpeed * speedBoostMult;

        if (state === ST_PLAY) {
            // Ramp speed
            scrollSpeed = Math.min(MAX_SPEED, scrollSpeed + SPEED_RAMP);
            distance += effectiveSpeed * 0.1;

            // Speed boost timer
            if (speedBoostTimer > 0) {
                speedBoostTimer--;
                if (speedBoostTimer <= 0) speedBoostMult = 1;
            }

            // Checkpoint
            if (distance >= nextCheckpoint) {
                nextCheckpoint += CHECKPOINT_DIST;
                sfxCheckpoint();
                screenShake = 3;
                // Brief slowdown effect
                speedBoostMult = 0.4;
                speedBoostTimer = 40;
            }

            // Gravity + movement
            player.vy += GRAVITY_STRENGTH * gravityDir;
            player.vy = clamp(player.vy, -MAX_FALL, MAX_FALL);
            player.y += player.vy;

            // Floor/ceiling collision
            player.onSurface = false;
            if (gravityDir === 1 && player.y + PLAYER_SIZE >= floorY) {
                player.y = floorY - PLAYER_SIZE;
                player.vy = 0;
                player.onSurface = true;
            }
            if (gravityDir === -1 && player.y <= ceilY) {
                player.y = ceilY;
                player.vy = 0;
                player.onSurface = true;
            }
            // Bounce off opposite surface
            if (gravityDir === 1 && player.y <= ceilY) { player.y = ceilY; player.vy *= -0.3; }
            if (gravityDir === -1 && player.y + PLAYER_SIZE >= floorY) { player.y = floorY - PLAYER_SIZE; player.vy *= -0.3; }

            // Trail
            player.trail.unshift({ x: player.x, y: player.y + PLAYER_SIZE / 2 });
            if (player.trail.length > TRAIL_LEN) player.trail.pop();

            // Scroll everything
            const scroll = effectiveSpeed;
            gridOffset = (gridOffset + scroll) % 40;

            for (let i = obstacles.length - 1; i >= 0; i--) {
                obstacles[i].x -= scroll;
                if (obstacles[i].type === 'moving') obstacles[i].baseY = obstacles[i].baseY; // baseY stays, x scrolls
                if (obstacles[i].x + obstacles[i].w < -20) obstacles.splice(i, 1);
            }
            for (let i = orbs.length - 1; i >= 0; i--) {
                orbs[i].x -= scroll;
                orbs[i].pulse += 0.08;
                if (orbs[i].x < -20) orbs.splice(i, 1);
            }
            for (let i = speedZones.length - 1; i >= 0; i--) {
                speedZones[i].x -= scroll;
                speedZones[i].alpha *= 0.998;
                if (speedZones[i].x + speedZones[i].w < -20) speedZones.splice(i, 1);
            }
            for (let i = portals.length - 1; i >= 0; i--) {
                portals[i].x -= scroll;
                portals[i].glow = (portals[i].glow + 0.05) % (Math.PI * 2);
                if (portals[i].x < -30) portals.splice(i, 1);
            }
            for (let i = coins.length - 1; i >= 0; i--) {
                coins[i].x -= scroll;
                coins[i].pulse += 0.06;
                if (coins[i].x < -20) coins.splice(i, 1);
            }
            for (let i = gravityZones.length - 1; i >= 0; i--) {
                gravityZones[i].x -= scroll;
                gravityZones[i].alpha *= 0.999;
                if (gravityZones[i].x + gravityZones[i].w < -20) gravityZones.splice(i, 1);
            }
            // Close call popups
            for (let i = closeCalls.length - 1; i >= 0; i--) {
                closeCalls[i].life--;
                if (closeCalls[i].life <= 0) closeCalls.splice(i, 1);
            }
            // Player expression timer
            if (player.expressionTimer > 0) {
                player.expressionTimer--;
                if (player.expressionTimer <= 0) player.expression = 'normal';
            }
            // Parallax scroll
            if (parallaxLayers) {
                for (const layer of parallaxLayers) {
                    for (const el of layer.elements) {
                        el.x -= scroll * layer.speed;
                        if (el.x + el.w < -10) {
                            el.x = GAME_W + rng(10, 60);
                            el.h = rng(20, 80);
                            el.w = rng(20, 50);
                        }
                    }
                }
            }

            // Update moving/laser obstacles
            for (const ob of obstacles) {
                if (ob.type === 'moving') {
                    ob.phase += 0.03;
                    ob.y = ob.baseY + Math.sin(ob.phase) * ob.amplitude;
                }
                if (ob.type === 'laser') {
                    ob.pulsePhase += 0.06;
                }
            }

            // Collision: obstacles
            const px = player.x, py = player.y, ps = PLAYER_SIZE;
            const hitPad = 3; // forgiving hitbox
            for (const ob of obstacles) {
                // Lasers only active when pulsing on
                if (ob.type === 'laser' && Math.sin(ob.pulsePhase) < 0.3) continue;
                // Destructible — break if moving fast enough
                if (ob.type === 'destructible' && scrollSpeed > 5.5) {
                    if (px + ps - hitPad > ob.x && px + hitPad < ob.x + ob.w &&
                        py + ps - hitPad > ob.y && py + hitPad < ob.y + ob.h) {
                        ob.hp--;
                        if (ob.hp <= 0) {
                            sfxDestroy();
                            score += 30 * comboMultiplier;
                            emitParticles(ob.x + ob.w / 2, ob.y + ob.h / 2, 15, '#f97316', 4, 25);
                            screenShake = 6;
                            ob.x = -100; ob.w = 0; ob.h = 0; // remove
                            player.expression = 'cool'; player.expressionTimer = 40;
                            continue;
                        }
                    }
                }
                if (px + ps - hitPad > ob.x && px + hitPad < ob.x + ob.w &&
                    py + ps - hitPad > ob.y && py + hitPad < ob.y + ob.h) {
                    die();
                    return;
                }
                // Close-call detection — barely missing an obstacle
                if (!ob.passed && ob.x + ob.w < px && ob.x + ob.w > px - 10) {
                    ob.passed = true;
                    // Check vertical proximity for close call
                    const vertDist = Math.min(
                        Math.abs(py - (ob.y + ob.h)),
                        Math.abs((py + ps) - ob.y)
                    );
                    if (vertDist < 12) {
                        score += 50 * comboMultiplier;
                        sfxCloseCall();
                        closeCalls.push({ x: px, y: py, life: 40 });
                        player.expression = 'scared'; player.expressionTimer = 30;
                    }
                    // Combo: passing obstacles without flipping
                    obstaclePassed++;
                    comboMultiplier = Math.min(5, 1 + Math.floor(obstaclePassed / 3));
                }
            }

            // Gravity zones — pull player toward zone direction
            for (const gz of gravityZones) {
                if (px + ps > gz.x && px < gz.x + gz.w) {
                    player.vy += gz.dir * 0.3; // gentle pull
                }
            }

            // Collision: orbs
            const pcx = px + ps / 2, pcy = py + ps / 2;
            for (const orb of orbs) {
                if (!orb.alive) continue;
                const dx = pcx - orb.x, dy = pcy - orb.y;
                if (dx * dx + dy * dy < (ps / 2 + ORB_RADIUS) * (ps / 2 + ORB_RADIUS)) {
                    orb.alive = false;
                    combo++;
                    if (combo > bestCombo) bestCombo = combo;
                    const comboMult = Math.min(combo, 10);
                    score += 10 * comboMult;
                    sfxOrb();
                    if (combo > 2) sfxCombo();
                    emitParticles(orb.x, orb.y, 6, '#FBBF24', 2, 20);
                }
            }
            orbs = orbs.filter(o => o.alive);

            // Collision: coins
            const pcx2 = px + ps / 2, pcy2 = py + ps / 2;
            for (const coin of coins) {
                if (!coin.alive) continue;
                const dx = pcx2 - coin.x, dy = pcy2 - coin.y;
                if (dx * dx + dy * dy < (ps / 2 + 8) * (ps / 2 + 8)) {
                    coin.alive = false;
                    score += coin.value * comboMultiplier;
                    sfxCoin();
                    emitParticles(coin.x, coin.y, 4, coin.gem ? '#a855f7' : '#fbbf24', 2, 15);
                    player.expression = 'happy'; player.expressionTimer = 20;
                }
            }
            coins = coins.filter(c => c.alive);

            // Collision: speed zones
            for (const sz of speedZones) {
                if (px + ps > sz.x && px < sz.x + sz.w && py + ps > sz.y && py < sz.y + sz.h) {
                    speedBoostMult = sz.boost;
                    speedBoostTimer = 60;
                    sfxSpeedZone();
                    sz.alpha = 0;
                }
            }

            // Collision: portals
            for (const p of portals) {
                if (!p.used && px + ps > p.x && px < p.x + p.w &&
                    pcy > p.entryY && pcy < p.entryY + p.h) {
                    p.used = true;
                    player.y = p.exitY + p.h / 2 - PLAYER_SIZE / 2;
                    player.vy *= 0.3;
                    sfxPortal();
                    emitParticles(player.x + ps / 2, player.y + ps / 2, 12, '#A855F7', 4, 25);
                    screenShake = 5;
                }
            }

            // Spawn new content
            spawnContent();

            // Distance score
            score += effectiveSpeed * 0.05;

            // Player trail particles
            if (frameCount % 2 === 0) {
                emitParticles(player.x, player.y + ps / 2, 1, playerColor, 1, 15);
            }
        }

        if (state === ST_DEAD) {
            deathTimer--;
        }

        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Update ripple
        if (ripple) {
            ripple.width += 30;
            ripple.alpha -= 0.04;
            if (ripple.alpha <= 0) ripple = null;
        }

        // Shake decay
        if (screenShake > 0) screenShake *= 0.85;
        if (screenShake < 0.2) screenShake = 0;
    }

    function die() {
        state = ST_DEAD;
        deathTimer = 50;
        sfxDeath();
        player.expression = 'scared';
        emitParticles(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2, 25, '#EF4444', 5, 35);
        emitParticles(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2, 15, playerColor, 4, 30);
        screenShake = 12;

        const finalScore = Math.floor(score);
        if (finalScore > bestScore) {
            bestScore = finalScore;
            try { localStorage.setItem('ywa_gravitydash_best', bestScore); } catch(e) {}
        }
        if (gameOverCB) {
            gameOverCB({
                score: finalScore,
                distance: Math.floor(distance),
                combo: bestCombo,
                speed: scrollSpeed.toFixed(1)
            });
        }
    }

    // ── Drawing ──
    function draw() {
        ctx.save();

        // Screen shake
        if (screenShake > 0) {
            const sx = (Math.random() - 0.5) * screenShake * 2;
            const sy = (Math.random() - 0.5) * screenShake * 2;
            ctx.translate(gs(sx), gs(sy));
        }

        // Background
        ctx.fillStyle = '#0A0A1A';
        ctx.fillRect(0, 0, W, H);

        drawParallaxBg();
        drawGrid();
        drawFloorCeiling();

        if (state === ST_PLAY || state === ST_DEAD) {
            drawGravityZones();
            drawSpeedZones();
            drawPortals();
            drawObstacles();
            drawCoins();
            drawOrbs();
            drawTrail();
            if (state === ST_PLAY) drawPlayer();
            drawParticles();
            drawRipple();
            drawSpeedLines();
            drawCloseCalls();
            drawHUD();
        }

        if (state === ST_TITLE) drawTitle();
        if (state === ST_DEAD && deathTimer <= 0) drawGameOver();

        drawVignette();

        if (state === ST_PLAY) drawGravityFlipButton(ctx, W, H, gs);

        ctx.restore();
    }

    function drawParallaxBg() {
        if (!parallaxLayers) return;
        // Layers shift direction with gravity
        const yShift = gravityDir === -1 ? -10 : 0;
        for (const layer of parallaxLayers) {
            ctx.save();
            for (const el of layer.elements) {
                ctx.fillStyle = layer.color;
                const bx = gx(el.x), bw = gs(el.w);
                if (el.type === 'building') {
                    const bh = gs(el.h);
                    const by = gravityDir === 1 ? gy(floorY) - bh + gs(yShift) : gy(ceilY) + gs(yShift);
                    ctx.fillRect(bx, by, bw, bh);
                    // Windows
                    ctx.fillStyle = 'rgba(255,200,100,0.08)';
                    for (let wy = 0; wy < el.h - 10; wy += 12) {
                        for (let wx = 4; wx < el.w - 4; wx += 8) {
                            ctx.fillRect(bx + gs(wx), by + gs(wy + 5), gs(4), gs(6));
                        }
                    }
                } else {
                    // Mountain
                    const bh = gs(el.h);
                    const baseY = gravityDir === 1 ? gy(floorY) + gs(yShift) : gy(ceilY) + gs(yShift);
                    ctx.beginPath();
                    ctx.moveTo(bx, baseY);
                    ctx.lineTo(bx + bw / 2, baseY - bh * gravityDir);
                    ctx.lineTo(bx + bw, baseY);
                    ctx.closePath();
                    ctx.fill();
                }
            }
            ctx.restore();
        }
    }

    function drawGrid() {
        ctx.save();
        ctx.strokeStyle = 'rgba(100, 140, 255, 0.07)';
        ctx.lineWidth = 1;
        const gridSize = 40;
        const offsetX = gridOffset * SCALE;

        for (let x = -offsetX; x < W; x += gs(gridSize)) {
            ctx.beginPath();
            ctx.moveTo(x, gy(ceilY));
            ctx.lineTo(x, gy(floorY));
            ctx.stroke();
        }
        for (let y = ceilY; y <= floorY; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, gy(y));
            ctx.lineTo(W, gy(y));
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawFloorCeiling() {
        const { r, g, b } = hexToRgb(playerColor);

        // Floor glow
        const floorGrad = ctx.createLinearGradient(0, gy(floorY), 0, H);
        floorGrad.addColorStop(0, `rgba(${r},${g},${b},0.4)`);
        floorGrad.addColorStop(0.3, `rgba(${r},${g},${b},0.1)`);
        floorGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, gy(floorY), W, H - gy(floorY));

        // Floor line
        ctx.strokeStyle = `rgba(${r},${g},${b},0.8)`;
        ctx.lineWidth = gs(2);
        ctx.beginPath();
        ctx.moveTo(0, gy(floorY));
        ctx.lineTo(W, gy(floorY));
        ctx.stroke();

        // Ceiling glow
        const ceilGrad = ctx.createLinearGradient(0, 0, 0, gy(ceilY));
        ceilGrad.addColorStop(0, 'rgba(0,0,0,0)');
        ceilGrad.addColorStop(0.7, `rgba(${r},${g},${b},0.1)`);
        ceilGrad.addColorStop(1, `rgba(${r},${g},${b},0.4)`);
        ctx.fillStyle = ceilGrad;
        ctx.fillRect(0, 0, W, gy(ceilY));

        // Ceiling line
        ctx.beginPath();
        ctx.moveTo(0, gy(ceilY));
        ctx.lineTo(W, gy(ceilY));
        ctx.stroke();
    }

    function drawObstacles() {
        for (const ob of obstacles) {
            const ox = gx(ob.x), oy = gy(ob.y), ow = gs(ob.w), oh = gs(ob.h);

            if (ob.type === 'spike') {
                ctx.save();
                ctx.fillStyle = '#EF4444';
                ctx.shadowColor = '#EF4444';
                ctx.shadowBlur = gs(8);
                ctx.beginPath();
                if (ob.side === 'floor') {
                    ctx.moveTo(ox, oy + oh);
                    ctx.lineTo(ox + ow / 2, oy);
                    ctx.lineTo(ox + ow, oy + oh);
                } else {
                    ctx.moveTo(ox, oy);
                    ctx.lineTo(ox + ow / 2, oy + oh);
                    ctx.lineTo(ox + ow, oy);
                }
                ctx.closePath();
                ctx.fill();
                // Spike detail lines
                ctx.strokeStyle = '#ff666644';
                ctx.lineWidth = gs(1);
                ctx.beginPath();
                ctx.moveTo(ox + ow / 2, ob.side === 'floor' ? oy : oy + oh);
                ctx.lineTo(ox + ow / 2, ob.side === 'floor' ? oy + oh : oy);
                ctx.stroke();
                ctx.restore();
            } else if (ob.type === 'laser') {
                // Pulsing laser beam
                const active = Math.sin(ob.pulsePhase) > 0.3;
                ctx.save();
                if (active) {
                    ctx.fillStyle = '#ef4444';
                    ctx.shadowColor = '#ef4444';
                    ctx.shadowBlur = gs(12);
                    ctx.fillRect(ox, oy - gs(2), ow, gs(4));
                    // Hot core
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(ox, oy - gs(0.5), ow, gs(1));
                } else {
                    // Dim when off
                    ctx.fillStyle = '#ef444433';
                    ctx.fillRect(ox, oy - gs(1), ow, gs(2));
                }
                // Emitter nodes at ends
                ctx.fillStyle = '#666';
                ctx.beginPath();
                ctx.arc(ox, oy, gs(3), 0, Math.PI * 2);
                ctx.arc(ox + ow, oy, gs(3), 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            } else if (ob.type === 'moving') {
                // Moving wall with motion blur
                ctx.save();
                ctx.fillStyle = '#f97316';
                ctx.shadowColor = '#f97316';
                ctx.shadowBlur = gs(6);
                ctx.fillRect(ox, oy, ow, oh);
                // Direction indicator
                ctx.fillStyle = '#fbbf2488';
                const arrowDir = Math.cos(ob.phase) > 0 ? 1 : -1;
                const ay = oy + oh / 2;
                ctx.beginPath();
                ctx.moveTo(ox + ow / 2 - gs(3), ay - gs(5) * arrowDir);
                ctx.lineTo(ox + ow / 2, ay + gs(5) * arrowDir);
                ctx.lineTo(ox + ow / 2 + gs(3), ay - gs(5) * arrowDir);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            } else if (ob.type === 'destructible') {
                // Cracked-looking obstacle
                ctx.save();
                ctx.fillStyle = '#92400e';
                ctx.shadowColor = '#f97316';
                ctx.shadowBlur = gs(4);
                ctx.fillRect(ox, oy, ow, oh);
                // Crack lines
                ctx.strokeStyle = '#fbbf2466';
                ctx.lineWidth = gs(1);
                ctx.beginPath();
                ctx.moveTo(ox + ow * 0.3, oy);
                ctx.lineTo(ox + ow * 0.5, oy + oh * 0.5);
                ctx.lineTo(ox + ow * 0.7, oy + oh);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(ox, oy + oh * 0.4);
                ctx.lineTo(ox + ow, oy + oh * 0.6);
                ctx.stroke();
                // Speed indicator if fast enough to break
                if (scrollSpeed > 5.5) {
                    ctx.fillStyle = '#22c55e44';
                    ctx.fillRect(ox, oy, ow, oh);
                }
                ctx.restore();
            } else {
                // Barrier
                ctx.save();
                ctx.fillStyle = '#F97316';
                ctx.shadowColor = '#F97316';
                ctx.shadowBlur = gs(6);
                ctx.fillRect(ox, oy, ow, oh);
                // Inner glow line
                ctx.strokeStyle = '#FBBF24';
                ctx.lineWidth = gs(1.5);
                ctx.strokeRect(ox + gs(2), oy + gs(2), ow - gs(4), oh - gs(4));
                ctx.restore();
            }
        }
    }

    function drawCoins() {
        for (const coin of coins) {
            if (!coin.alive) continue;
            const cx = gx(coin.x), cy = gy(coin.y);
            const pulse = 1 + Math.sin(coin.pulse) * 0.2;
            const r = gs(coin.gem ? 6 : 4) * pulse;

            ctx.save();
            ctx.shadowBlur = gs(8);
            if (coin.gem) {
                // Diamond gem
                ctx.shadowColor = '#a855f7';
                ctx.fillStyle = '#a855f7';
                ctx.beginPath();
                ctx.moveTo(cx, cy - r);
                ctx.lineTo(cx + r, cy);
                ctx.lineTo(cx, cy + r);
                ctx.lineTo(cx - r, cy);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Gold coin
                ctx.shadowColor = '#fbbf24';
                ctx.fillStyle = '#fbbf24';
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    function drawGravityZones() {
        for (const gz of gravityZones) {
            if (gz.alpha <= 0.02) continue;
            const dirColor = gz.dir > 0 ? '239,68,68' : '59,130,246';
            ctx.save();
            ctx.globalAlpha = gz.alpha * 0.12;
            ctx.fillStyle = `rgba(${dirColor},1)`;
            ctx.fillRect(gx(gz.x), gy(gz.y), gs(gz.w), gs(gz.h));
            // Arrows showing pull direction
            ctx.globalAlpha = gz.alpha * 0.25;
            ctx.strokeStyle = `rgba(${dirColor},1)`;
            ctx.lineWidth = gs(1.5);
            const arrowCount = 3;
            for (let i = 0; i < arrowCount; i++) {
                const ax = gz.x + (gz.w / (arrowCount + 1)) * (i + 1);
                const ay = (gz.y + gz.h / 2) + Math.sin(frameCount * 0.05 + i) * 15;
                ctx.beginPath();
                ctx.moveTo(gx(ax - 5), gy(ay - 6 * gz.dir));
                ctx.lineTo(gx(ax), gy(ay + 6 * gz.dir));
                ctx.lineTo(gx(ax + 5), gy(ay - 6 * gz.dir));
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    function drawCloseCalls() {
        for (const cc of closeCalls) {
            const alpha = cc.life / 40;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = `bold ${gs(10)}px monospace`;
            ctx.fillStyle = '#fbbf24';
            ctx.textAlign = 'center';
            ctx.fillText('CLOSE CALL +50', gx(cc.x + PLAYER_SIZE / 2), gy(cc.y - 10 - (40 - cc.life)));
            ctx.restore();
        }
    }

    function drawOrbs() {
        for (const orb of orbs) {
            if (!orb.alive) continue;
            const ox = gx(orb.x), oy = gy(orb.y);
            const pulse = 1 + Math.sin(orb.pulse) * 0.3;
            const r = gs(ORB_RADIUS * pulse);

            ctx.save();
            ctx.shadowColor = '#FBBF24';
            ctx.shadowBlur = gs(12);

            const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
            grad.addColorStop(0, '#FFFFFF');
            grad.addColorStop(0.4, '#FBBF24');
            grad.addColorStop(1, 'rgba(251,191,36,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(ox, oy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function drawSpeedZones() {
        for (const sz of speedZones) {
            if (sz.alpha <= 0.05) continue;
            const color = sz.boost > 1 ? '59,130,246' : '236,72,153';
            ctx.save();
            ctx.globalAlpha = sz.alpha * 0.25;
            ctx.fillStyle = `rgba(${color},1)`;
            ctx.fillRect(gx(sz.x), gy(sz.y), gs(sz.w), gs(sz.h));

            // Chevrons
            ctx.globalAlpha = sz.alpha * 0.5;
            ctx.strokeStyle = `rgba(${color},1)`;
            ctx.lineWidth = gs(2);
            const dir = sz.boost > 1 ? 1 : -1;
            const chevCount = 4;
            for (let i = 0; i < chevCount; i++) {
                const cx = sz.x + (sz.w / (chevCount + 1)) * (i + 1);
                const cy = (sz.y + sz.h / 2);
                ctx.beginPath();
                ctx.moveTo(gx(cx - 6 * dir), gy(cy - 10));
                ctx.lineTo(gx(cx + 6 * dir), gy(cy));
                ctx.lineTo(gx(cx - 6 * dir), gy(cy + 10));
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    function drawPortals() {
        for (const p of portals) {
            const glow = 0.5 + Math.sin(p.glow) * 0.3;
            const color = p.used ? 'rgba(100,100,120,0.3)' : `rgba(168,85,247,${glow})`;

            ctx.save();
            if (!p.used) {
                ctx.shadowColor = '#A855F7';
                ctx.shadowBlur = gs(15);
            }

            // Entry portal
            ctx.fillStyle = color;
            ctx.fillRect(gx(p.x), gy(p.entryY), gs(p.w), gs(p.h));

            // Exit portal (dimmer)
            ctx.globalAlpha = 0.5;
            ctx.fillRect(gx(p.x), gy(p.exitY), gs(p.w), gs(p.h));

            // Connection line
            if (!p.used) {
                ctx.globalAlpha = 0.15;
                ctx.strokeStyle = '#A855F7';
                ctx.lineWidth = gs(1);
                ctx.setLineDash([gs(3), gs(5)]);
                ctx.beginPath();
                ctx.moveTo(gx(p.x + p.w / 2), gy(p.entryY + p.h / 2));
                ctx.lineTo(gx(p.x + p.w / 2), gy(p.exitY + p.h / 2));
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.restore();
        }
    }

    function drawTrail() {
        if (!player.trail.length) return;
        const { r, g, b } = hexToRgb(playerColor);

        for (let i = 0; i < player.trail.length; i++) {
            const t = player.trail[i];
            const alpha = (1 - i / player.trail.length) * 0.6;
            const size = PLAYER_SIZE * (1 - i / player.trail.length) * 0.6;
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.fillRect(
                gx(t.x + PLAYER_SIZE / 2 - size / 2),
                gy(t.y - size / 2),
                gs(size),
                gs(size)
            );
        }
    }

    function drawPlayer() {
        const px = gx(player.x), py = gy(player.y), ps = gs(PLAYER_SIZE);
        const { r, g, b } = hexToRgb(playerColor);
        const cx = px + ps / 2, cy = py + ps / 2;

        ctx.save();

        // Outer glow
        ctx.shadowColor = playerColor;
        ctx.shadowBlur = gs(16);

        // Body — rounded rectangle shape
        const bodyGrad = ctx.createLinearGradient(px, py, px + ps, py + ps);
        bodyGrad.addColorStop(0, '#FFFFFF');
        bodyGrad.addColorStop(0.3, playerColor);
        bodyGrad.addColorStop(1, playerGlow || playerColor);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        const rr = gs(4);
        ctx.moveTo(px + rr, py);
        ctx.lineTo(px + ps - rr, py);
        ctx.quadraticCurveTo(px + ps, py, px + ps, py + rr);
        ctx.lineTo(px + ps, py + ps - rr);
        ctx.quadraticCurveTo(px + ps, py + ps, px + ps - rr, py + ps);
        ctx.lineTo(px + rr, py + ps);
        ctx.quadraticCurveTo(px, py + ps, px, py + ps - rr);
        ctx.lineTo(px, py + rr);
        ctx.quadraticCurveTo(px, py, px + rr, py);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;

        // Face — eyes
        const eyeY = cy - gs(2) * gravityDir;
        const eyeSize = gs(2.5);
        const eyeSpacing = gs(3.5);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx - eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2);
        ctx.arc(cx + eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2);
        ctx.fill();

        // Pupils (look in movement direction)
        const pupilOffset = gravityDir * gs(0.8);
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(cx - eyeSpacing + gs(0.5), eyeY + pupilOffset, eyeSize * 0.55, 0, Math.PI * 2);
        ctx.arc(cx + eyeSpacing + gs(0.5), eyeY + pupilOffset, eyeSize * 0.55, 0, Math.PI * 2);
        ctx.fill();

        // Expression-based mouth
        const mouthY = cy + gs(3) * gravityDir;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = gs(1.2);
        ctx.lineCap = 'round';
        const expr = player.expression || 'normal';
        if (expr === 'happy') {
            // Big smile
            ctx.beginPath();
            ctx.arc(cx, mouthY - gs(1), gs(3), 0, Math.PI);
            ctx.stroke();
        } else if (expr === 'scared') {
            // Open mouth O
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(cx, mouthY, gs(2), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(cx, mouthY, gs(1.2), 0, Math.PI * 2);
            ctx.fill();
        } else if (expr === 'cool') {
            // Smirk
            ctx.beginPath();
            ctx.moveTo(cx - gs(3), mouthY);
            ctx.lineTo(cx + gs(2), mouthY - gs(1.5));
            ctx.stroke();
        } else {
            // Neutral line
            ctx.beginPath();
            ctx.moveTo(cx - gs(2.5), mouthY);
            ctx.lineTo(cx + gs(2.5), mouthY);
            ctx.stroke();
        }

        // Gravity indicator (small arrow on body)
        ctx.fillStyle = `rgba(255,255,255,0.5)`;
        const arrowX = px + ps / 2;
        const arrowYpos = gravityDir === 1 ? py + ps - gs(2) : py + gs(2);
        ctx.beginPath();
        ctx.moveTo(arrowX - gs(3), arrowYpos - gs(2) * gravityDir);
        ctx.lineTo(arrowX, arrowYpos + gs(2) * gravityDir);
        ctx.lineTo(arrowX + gs(3), arrowYpos - gs(2) * gravityDir);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            const { r, g, b } = hexToRgb(p.color || '#FFFFFF');
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            const size = gs(p.size * alpha);
            ctx.fillRect(gx(p.x) - size / 2, gy(p.y) - size / 2, size, size);
        }
    }

    function drawRipple() {
        if (!ripple) return;
        const { r, g, b } = hexToRgb(playerColor);
        ctx.save();
        ctx.globalAlpha = ripple.alpha;
        ctx.strokeStyle = `rgba(${r},${g},${b},1)`;
        ctx.lineWidth = gs(2);
        const cx = gx(player.x + PLAYER_SIZE / 2);
        const cy = gy(ripple.y);
        const rw = gs(ripple.width);
        ctx.beginPath();
        ctx.moveTo(cx - rw / 2, cy);
        ctx.lineTo(cx + rw / 2, cy);
        ctx.stroke();
        ctx.restore();
    }

    function drawSpeedLines() {
        if (state !== ST_PLAY) return;
        const intensity = (scrollSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
        if (intensity < 0.1) return;

        ctx.save();
        // Lines intensify dramatically at higher speeds
        const alphaBoost = intensity * intensity; // quadratic scaling
        ctx.globalAlpha = alphaBoost * 0.2 * speedBoostMult;
        const count = Math.floor(intensity * 20); // more lines at speed
        for (let i = 0; i < count; i++) {
            const ly = gy(rng(ceilY + 10, floorY - 10));
            const lx = rng(0, W);
            const ll = gs(rng(30, 100) * speedBoostMult * (0.5 + intensity));
            const lineWidth = gs(0.5 + intensity * 2);
            // Color shifts from white to player color at high speed
            if (intensity > 0.6) {
                const { r, g, b } = hexToRgb(playerColor);
                ctx.strokeStyle = `rgba(${r},${g},${b},${0.3 + intensity * 0.4})`;
            } else {
                ctx.strokeStyle = '#FFFFFF';
            }
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(lx - ll, ly);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawVignette() {
        if (!vignetteGrad) {
            vignetteGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
            vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
            vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
        }
        ctx.fillStyle = vignetteGrad;
        ctx.fillRect(0, 0, W, H);
    }

    function drawHUD() {
        ctx.save();
        const pad = gs(12);

        // Distance
        ctx.font = `bold ${gs(14)}px monospace`;
        ctx.fillStyle = '#E0E7FF';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.floor(distance)}m`, pad, pad + gs(14));

        // Score
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.floor(score)}`, W - pad, pad + gs(14));

        // Combo (orb streak)
        if (combo > 1) {
            const comboAlpha = Math.min(1, 0.5 + Math.sin(frameCount * 0.15) * 0.5);
            ctx.font = `bold ${gs(11)}px monospace`;
            ctx.fillStyle = `rgba(251,191,36,${comboAlpha})`;
            ctx.textAlign = 'right';
            ctx.fillText(`x${Math.min(combo, 10)} COMBO`, W - pad, pad + gs(30));
        }
        // Pass multiplier
        if (comboMultiplier > 1) {
            ctx.font = `bold ${gs(10)}px monospace`;
            ctx.fillStyle = `rgba(34,211,238,0.8)`;
            ctx.textAlign = 'left';
            ctx.fillText(`x${comboMultiplier} PASS`, pad, pad + gs(36));
        }

        // Speed indicator
        const speedPct = (scrollSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
        const barW = gs(60), barH = gs(4);
        const barX = pad, barY = pad + gs(22);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(barX, barY, barW, barH);
        const { r, g, b } = hexToRgb(playerColor);
        ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
        ctx.fillRect(barX, barY, barW * speedPct, barH);

        // Checkpoint flash
        const distToNext = nextCheckpoint - distance;
        if (distToNext < 30 && distToNext > 0) {
            const flash = Math.sin(frameCount * 0.3) * 0.3 + 0.3;
            ctx.fillStyle = `rgba(${r},${g},${b},${flash})`;
            ctx.fillRect(0, 0, W, H);
        }

        ctx.restore();
    }

    function drawTitle() {
        ctx.save();

        drawParallaxBg();
        drawGrid();
        drawFloorCeiling();

        // Animated background particles
        if (frameCount % 3 === 0 && particles.length < 30) {
            emitParticles(rng(0, GAME_W), rng(ceilY, floorY), 1, playerColor, 0.5, 40);
        }
        drawParticles();

        // Title
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Glow
        ctx.shadowColor = playerColor;
        ctx.shadowBlur = gs(20);

        ctx.font = `bold ${gs(38)}px monospace`;
        ctx.fillStyle = playerColor;
        ctx.fillText('GRAVITY', W / 2, H * 0.34);
        ctx.font = `bold ${gs(42)}px monospace`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('DASH', W / 2, H * 0.48);

        ctx.shadowBlur = 0;

        // Subtitle
        ctx.font = `${gs(11)}px monospace`;
        ctx.fillStyle = '#94A3B8';
        ctx.fillText('TAP or SPACE to flip gravity', W / 2, H * 0.62);

        // Blink prompt
        const blink = Math.sin(frameCount * 0.06) * 0.5 + 0.5;
        ctx.globalAlpha = blink;
        ctx.font = `bold ${gs(13)}px monospace`;
        ctx.fillStyle = playerColor;
        ctx.fillText('[ START ]', W / 2, H * 0.78);

        ctx.restore();
    }

    function drawGameOver() {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowColor = '#EF4444';
        ctx.shadowBlur = gs(15);
        ctx.font = `bold ${gs(32)}px monospace`;
        ctx.fillStyle = '#EF4444';
        ctx.fillText('CRASHED', W / 2, H * 0.3);

        ctx.shadowBlur = 0;
        ctx.font = `${gs(14)}px monospace`;
        ctx.fillStyle = '#E0E7FF';
        ctx.fillText(`Distance: ${Math.floor(distance)}m`, W / 2, H * 0.46);
        ctx.fillText(`Score: ${Math.floor(score)}`, W / 2, H * 0.54);
        if (bestCombo > 1) {
            ctx.fillStyle = '#FBBF24';
            ctx.fillText(`Best Combo: x${bestCombo}`, W / 2, H * 0.62);
        }

        if (bestScore > 0) {
            ctx.fillStyle = Math.floor(score) >= bestScore ? '#FFD700' : '#888';
            ctx.fillText(Math.floor(score) >= bestScore ? `NEW BEST: ${bestScore}` : `Best: ${bestScore}`, W / 2, H * 0.70);
        }

        const blink = Math.sin(frameCount * 0.06) * 0.5 + 0.5;
        ctx.globalAlpha = blink;
        ctx.font = `bold ${gs(12)}px monospace`;
        ctx.fillStyle = playerColor;
        ctx.fillText('[ TAP TO RETRY ]', W / 2, H * 0.8);

        ctx.restore();
    }

    // ── Game Loop ──
    function gameLoop(ts) {
        if (!gameActive) return;
        if (!lastTime) lastTime = ts;
        dt = Math.min((ts - lastTime) / 16.67, 3); // cap delta
        lastTime = ts;

        update();
        draw();

        animFrame = requestAnimationFrame(gameLoop);
    }

    // ── Public API ──
    function init(cvs, playerData, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOver;
        gameActive = true;
        playerColor = playerData?.color || '#06B6D4';

        const themeId = playerData?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) playerColor = _t.colors[0] || playerColor;

        playerGlow = playerColor;
        const pc = hexToRgb(playerColor);
        playerGlow = `rgb(${Math.min(255, pc.r + 60)},${Math.min(255, pc.g + 60)},${Math.min(255, pc.b + 60)})`;

        state = ST_TITLE;
        frameCount = 0;
        lastTime = 0;
        bestScore = parseInt(localStorage.getItem('ywa_gravitydash_best') || '0', 10);
        keys = {};
        particles = [];
        obstacles = [];
        orbs = [];
        speedZones = [];
        portals = [];
        coins = [];
        gravityZones = [];
        closeCalls = [];
        parallaxLayers = null;
        obstaclePassed = 0;
        comboMultiplier = 1;
        ripple = null;

        floorY = GAME_H - FLOOR_H;
        ceilY = CEIL_H;

        W = canvas.width || 960;
        H = canvas.height || 540;
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
