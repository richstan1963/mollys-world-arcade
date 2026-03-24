/* Sky Jump — Endless vertical jumper for Your World Arcade */
window.SkyJump = (() => {
    // ── Design Constants ──
    const GAME_W = 360, GAME_H = 640;
    const GRAVITY = 0.35;
    const BOUNCE_VEL = -10.5;
    const SPRING_VEL = -16;
    const ROCKET_VEL = -22;
    const MOVE_SPEED = 4.5;
    const MOVE_ACCEL = 0.6;
    const MOVE_FRICTION = 0.82;
    const PLAT_W = 58, PLAT_H = 14;
    const CHAR_W = 28, CHAR_H = 28;
    const COIN_R = 7;
    const STAR_R = 10;

    // States
    const ST_TITLE = 0, ST_PLAY = 1, ST_DEAD = 2;

    // Game state
    let canvas, ctx, W, H, SCALE, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor, playerColorDark;
    let state, frameCount, lastTime, dt;
    let score, bestScore = 0, heightReached, coins;
    let camY, camTargetY;
    let charX, charY, charVX, charVY;
    let charSquash, charFace; // 0=normal, 1=happy, 2=scared
    let platforms, enemies, powerUps, collectibles, particles, floats;
    let spawnY; // next platform spawn height (world coords, negative = up)
    let difficulty; // 0-1 ramps up
    let jetpackTimer, springShoeCount, shieldActive, propellerTimer;
    let rocketBoostTimer;
    let heightMarkers;
    let keys = {};
    let touchSide = 0; // -1 left, 0 none, 1 right
    let tiltX = 0; // accelerometer
    let useTilt = false;
    let deathTimer;
    let bgStars = [];
    let bgClouds = [];
    let bgHills = [];

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
    function playNoise(dur, vol = 0.08) {
        try {
            const a = getAudio();
            const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * vol;
            const src = a.createBufferSource();
            const g = a.createGain();
            src.buffer = buf;
            g.gain.setValueAtTime(vol, a.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
            src.connect(g); g.connect(a.destination);
            src.start();
        } catch {}
    }
    function sfxBounce() { playTone(400, 0.1, 'sine', 0.1, 600); }
    function sfxSpring() { playTone(300, 0.2, 'sine', 0.12, 1200); }
    function sfxBreak() { playNoise(0.15, 0.1); playTone(200, 0.15, 'sawtooth', 0.06, 80); }
    function sfxEnemy() { playTone(150, 0.3, 'sawtooth', 0.12, 50); }
    function sfxEnemyBounce() { playTone(500, 0.15, 'sine', 0.1, 900); }
    function sfxJetpack() { playNoise(0.08, 0.04); playTone(200, 0.08, 'sawtooth', 0.04, 250); }
    function sfxCoin() { playTone(880, 0.06, 'sine', 0.09); setTimeout(() => playTone(1100, 0.08, 'sine', 0.09), 40); }
    function sfxStar() { playTone(660, 0.1, 'sine', 0.1); setTimeout(() => playTone(880, 0.1, 'sine', 0.1), 60); setTimeout(() => playTone(1100, 0.12, 'sine', 0.1), 120); }
    function sfxPowerUp() { playTone(440, 0.1, 'sine', 0.1, 880); setTimeout(() => playTone(660, 0.15, 'sine', 0.1), 80); }
    function sfxFall() { playTone(300, 0.5, 'sawtooth', 0.12, 60); }
    function sfxRocket() { playNoise(0.15, 0.06); playTone(150, 0.3, 'sawtooth', 0.08, 400); }
    function sfxConveyor() { playTone(250, 0.05, 'triangle', 0.04); }
    function sfxVanish() { playTone(600, 0.2, 'sine', 0.06, 200); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const gx = v => v * SCALE;
    const gy = v => (v - camY) * SCALE;
    const rng = (a, b) => a + Math.random() * (b - a);
    const rngInt = (a, b) => Math.floor(rng(a, b + 1));
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }
    function darken(hex, amt = 40) {
        const c = hexToRgb(hex);
        return `rgb(${Math.max(0, c.r - amt)},${Math.max(0, c.g - amt)},${Math.max(0, c.b - amt)})`;
    }
    function brighten(hex, amt = 60) {
        const c = hexToRgb(hex);
        return `rgb(${Math.min(255, c.r + amt)},${Math.min(255, c.g + amt)},${Math.min(255, c.b + amt)})`;
    }

    // ── Canvas Fit ──
    function fitCanvas() {
        if (!canvas) return;
        const p = canvas.parentElement || document.body;
        const pw = p.clientWidth || 360, ph = p.clientHeight || 640;
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
    }

    // ── Platform Generation ──
    function makePlatform(x, y, type) {
        const p = { x, y, w: PLAT_W, h: PLAT_H, type, alive: true, timer: 0, vx: 0, dir: 1, conveyorDir: 1 };
        if (type === 'moving') {
            p.vx = 1 + Math.random() * 1.5;
            p.dir = Math.random() < 0.5 ? -1 : 1;
        }
        if (type === 'conveyor') {
            p.conveyorDir = Math.random() < 0.5 ? -1 : 1;
        }
        return p;
    }

    function generateInitialPlatforms() {
        platforms = [];
        // Ground platform
        platforms.push(makePlatform(GAME_W / 2 - PLAT_W / 2, GAME_H - 40, 'normal'));
        // Starting platforms with fair spacing
        let py = GAME_H - 100;
        spawnY = py;
        for (let i = 0; i < 20; i++) {
            py -= rng(45, 70);
            const px = rng(30, GAME_W - 30 - PLAT_W);
            platforms.push(makePlatform(px, py, 'normal'));
        }
        spawnY = py;
    }

    function spawnPlatformsUpTo(topY) {
        while (spawnY > topY - GAME_H) {
            const gap = getVerticalGap();
            spawnY -= gap;
            const px = rng(20, GAME_W - 20 - PLAT_W);
            const type = pickPlatformType();
            const plat = makePlatform(px, spawnY, type);
            platforms.push(plat);

            // Spawn collectibles near platform
            if (Math.random() < 0.3) {
                const cy = spawnY - rng(20, 50);
                const cx = px + rng(0, PLAT_W);
                collectibles.push({ x: cx, y: cy, type: Math.random() < 0.08 ? 'star' : 'coin', alive: true, bob: Math.random() * Math.PI * 2 });
            }

            // Spawn power-ups (rare)
            if (Math.random() < 0.03 && heightReached > 1500) {
                const puType = pickPowerUp();
                powerUps.push({ x: px + PLAT_W / 2, y: spawnY - 35, type: puType, alive: true, bob: Math.random() * Math.PI * 2 });
            }

            // Spawn enemies (after some height)
            if (Math.random() < getEnemyChance() && heightReached > 800) {
                const eType = pickEnemyType();
                const ey = spawnY - rng(40, 80);
                const ex = rng(30, GAME_W - 30);
                enemies.push(makeEnemy(ex, ey, eType));
            }
        }
    }

    function getVerticalGap() {
        const base = 55;
        const maxGap = 85;
        const d = Math.min(difficulty, 1);
        return rng(base, lerp(base + 15, maxGap, d));
    }

    function pickPlatformType() {
        const d = difficulty;
        const r = Math.random();
        if (r < 0.01 && d > 0.3) return 'rocket';
        if (r < 0.06 && d > 0.15) return 'spring';
        if (r < 0.12 && d > 0.1) return 'conveyor';
        if (r < 0.22 && d > 0.2) return 'vanishing';
        if (r < 0.35 && d > 0.05) return 'breakable';
        if (r < 0.5 && d > 0.08) return 'moving';
        return 'normal';
    }

    function pickPowerUp() {
        const r = Math.random();
        if (r < 0.3) return 'jetpack';
        if (r < 0.55) return 'spring_shoes';
        if (r < 0.8) return 'shield';
        return 'propeller';
    }

    function getEnemyChance() {
        return Math.min(0.12, difficulty * 0.15);
    }

    function pickEnemyType() {
        const r = Math.random();
        if (r < 0.4) return 'ufo';
        if (r < 0.7) return 'monster';
        return 'blackhole';
    }

    function makeEnemy(x, y, type) {
        const e = { x, y, type, alive: true, vx: 0, phase: Math.random() * Math.PI * 2, hp: 1 };
        if (type === 'ufo') e.vx = rng(0.8, 2) * (Math.random() < 0.5 ? -1 : 1);
        if (type === 'blackhole') e.pullRadius = 60;
        return e;
    }

    // ── Reset ──
    function resetGame() {
        state = ST_PLAY;
        frameCount = 0;
        score = 0;
        coins = 0;
        heightReached = 0;
        difficulty = 0;
        camY = 0;
        camTargetY = 0;
        charX = GAME_W / 2;
        charY = GAME_H - 60;
        charVX = 0;
        charVY = 0;
        charSquash = 0;
        charFace = 0;
        jetpackTimer = 0;
        springShoeCount = 0;
        shieldActive = false;
        propellerTimer = 0;
        rocketBoostTimer = 0;
        enemies = [];
        powerUps = [];
        collectibles = [];
        particles = [];
        floats = [];
        heightMarkers = [];
        deathTimer = 0;
        generateInitialPlatforms();
        initBgElements();
    }

    function initBgElements() {
        bgStars = [];
        for (let i = 0; i < 80; i++) {
            bgStars.push({ x: Math.random() * GAME_W, y: Math.random() * 40000 - 40000, r: rng(0.5, 2), bright: rng(0.3, 1), twinkle: Math.random() * Math.PI * 2 });
        }
        bgClouds = [];
        for (let i = 0; i < 12; i++) {
            bgClouds.push({ x: rng(0, GAME_W), y: rng(-2000, GAME_H), w: rng(50, 120), h: rng(20, 40), speed: rng(0.1, 0.4), alpha: rng(0.15, 0.4) });
        }
        bgHills = [];
        for (let i = 0; i < 6; i++) {
            bgHills.push({ x: rng(0, GAME_W), w: rng(80, 200), h: rng(30, 80) });
        }
    }

    // ── Input ──
    function onKeyDown(e) {
        keys[e.key] = true;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
        if (state === ST_TITLE && (e.key === ' ' || e.key === 'Enter')) { resetGame(); return; }
        if (state === ST_DEAD && deathTimer > 60 && (e.key === ' ' || e.key === 'Enter')) { resetGame(); return; }
    }
    function onKeyUp(e) { keys[e.key] = false; }

    function onTouchStart(e) {
        e.preventDefault();
        if (state === ST_TITLE) { resetGame(); return; }
        if (state === ST_DEAD && deathTimer > 60) { resetGame(); return; }
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const tx = (t.clientX - rect.left) / rect.width;
        touchSide = tx < 0.5 ? -1 : 1;
    }
    function onTouchMove(e) {
        e.preventDefault();
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const tx = (t.clientX - rect.left) / rect.width;
        touchSide = tx < 0.5 ? -1 : 1;
    }
    function onTouchEnd(e) {
        e.preventDefault();
        if (e.touches.length === 0) touchSide = 0;
    }

    function onDeviceMotion(e) {
        const acc = e.accelerationIncludingGravity;
        if (acc && acc.x != null) {
            tiltX = clamp(acc.x * 0.5, -MOVE_SPEED, MOVE_SPEED);
            useTilt = true;
        }
    }

    // ── Particles ──
    function emitParticles(x, y, count, color, life = 30, spread = 3) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x, y,
                vx: rng(-spread, spread),
                vy: rng(-spread, spread),
                life: life + rng(-5, 5),
                maxLife: life,
                color,
                r: rng(1.5, 3.5)
            });
        }
    }

    function emitDust(x, y) {
        for (let i = 0; i < 5; i++) {
            particles.push({
                x: x + rng(-8, 8), y,
                vx: rng(-1.5, 1.5), vy: rng(-2, -0.5),
                life: 20, maxLife: 20,
                color: '#D4C5A9', r: rng(2, 4)
            });
        }
    }

    function emitTrail(x, y, color) {
        particles.push({
            x: x + rng(-3, 3), y: y + rng(-2, 2),
            vx: rng(-0.3, 0.3), vy: rng(0.5, 1.5),
            life: 15, maxLife: 15,
            color, r: rng(1, 2.5)
        });
    }

    function addFloat(x, y, text, color = '#FFF') {
        floats.push({ x, y, text, color, life: 60, maxLife: 60 });
    }

    // ── Update ──
    function update() {
        frameCount++;

        if (state === ST_DEAD) {
            deathTimer++;
            updateParticles();
            updateFloats();
            return;
        }
        if (state !== ST_PLAY) return;

        // Difficulty ramps with height
        difficulty = Math.min(1, heightReached / 25000);

        // ── Character horizontal movement ──
        let inputDir = 0;
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) inputDir = -1;
        if (keys['ArrowRight'] || keys['d'] || keys['D']) inputDir = 1;
        if (touchSide !== 0) inputDir = touchSide;
        if (useTilt && touchSide === 0 && !keys['ArrowLeft'] && !keys['ArrowRight']) {
            charVX += tiltX * 0.3;
        }

        if (inputDir !== 0) {
            charVX += inputDir * MOVE_ACCEL;
            charVX = clamp(charVX, -MOVE_SPEED, MOVE_SPEED);
        } else {
            charVX *= MOVE_FRICTION;
        }
        charX += charVX * dt;

        // Screen wrap
        if (charX < -CHAR_W / 2) charX = GAME_W + CHAR_W / 2;
        if (charX > GAME_W + CHAR_W / 2) charX = -CHAR_W / 2;

        // ── Jetpack ──
        if (jetpackTimer > 0) {
            jetpackTimer -= dt;
            charVY = -6;
            if (frameCount % 2 === 0) {
                emitParticles(charX, charY + CHAR_H / 2, 2, '#FF6600', 20, 2);
                emitParticles(charX, charY + CHAR_H / 2, 1, '#FFCC00', 15, 1.5);
            }
            if (frameCount % 8 === 0) sfxJetpack();
        }
        // ── Rocket boost ──
        else if (rocketBoostTimer > 0) {
            rocketBoostTimer -= dt;
            charVY = -12;
            if (frameCount % 2 === 0) {
                emitParticles(charX, charY + CHAR_H / 2, 3, '#FF4400', 25, 3);
                emitParticles(charX, charY + CHAR_H / 2, 2, '#FFAA00', 18, 2);
            }
            if (frameCount % 6 === 0) sfxRocket();
        }
        // ── Propeller ──
        else if (propellerTimer > 0) {
            propellerTimer -= dt;
            charVY += GRAVITY * 0.3 * dt; // slow fall
            charVY = Math.min(charVY, 2); // cap fall speed
        }
        // ── Normal gravity ──
        else {
            charVY += GRAVITY * dt;
            if (charVY > 12) charVY = 12;
        }

        charY += charVY * dt;

        // Squash/stretch
        if (charVY < -2) charSquash = lerp(charSquash, -0.15, 0.1); // stretch up
        else if (charVY > 2) charSquash = lerp(charSquash, 0.1, 0.08); // squash down
        else charSquash = lerp(charSquash, 0, 0.15);

        // Face
        if (charVY > 4 && jetpackTimer <= 0 && rocketBoostTimer <= 0) charFace = 2; // scared
        else if (charVY < -6) charFace = 1; // happy
        else charFace = 0;

        // Trail when fast
        if (Math.abs(charVY) > 5 && frameCount % 2 === 0) {
            emitTrail(charX, charY + (charVY > 0 ? -CHAR_H / 2 : CHAR_H / 2), playerColor);
        }

        // ── Platform collision (only when falling) ──
        if (charVY > 0 && jetpackTimer <= 0 && rocketBoostTimer <= 0) {
            for (const p of platforms) {
                if (!p.alive) continue;
                // Feet at bottom of char
                const feetY = charY + CHAR_H / 2;
                const prevFeetY = feetY - charVY * dt;
                // Check if feet crossed platform top this frame
                if (feetY >= p.y && prevFeetY <= p.y + 4 &&
                    charX + CHAR_W / 2 > p.x && charX - CHAR_W / 2 < p.x + p.w) {
                    landOnPlatform(p);
                }
            }
        }

        // ── Update platforms ──
        for (let i = platforms.length - 1; i >= 0; i--) {
            const p = platforms[i];
            if (p.type === 'moving' && p.alive) {
                p.x += p.vx * p.dir * dt;
                if (p.x < 5 || p.x + p.w > GAME_W - 5) p.dir *= -1;
            }
            if (p.type === 'vanishing' && p.timer > 0) {
                p.timer -= dt;
                if (p.timer <= 0) { p.alive = false; sfxVanish(); }
            }
            if (p.type === 'breakable' && !p.alive) {
                p.y += 3 * dt; // fall away
            }
            // Remove platforms far below camera
            if (p.y > camY + GAME_H + 100) {
                platforms.splice(i, 1);
            }
        }

        // ── Update enemies ──
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (!e.alive) { enemies.splice(i, 1); continue; }
            e.phase += 0.03 * dt;
            if (e.type === 'ufo') {
                e.x += e.vx * dt;
                if (e.x < 15 || e.x > GAME_W - 15) e.vx *= -1;
            }
            if (e.type === 'blackhole') {
                // Pull character toward black hole
                const dx = e.x - charX, dy = e.y - charY;
                const d = Math.hypot(dx, dy);
                if (d < e.pullRadius && d > 5) {
                    const force = 0.4 * (1 - d / e.pullRadius);
                    charVX += (dx / d) * force * dt;
                    charVY += (dy / d) * force * dt;
                }
            }
            // Collision with character
            const edx = e.x - charX, edy = e.y - charY;
            const ed = Math.hypot(edx, edy);
            if (ed < 20) {
                // Can bounce on enemies from above (feet hit top)
                if (charVY > 0 && charY + CHAR_H / 2 < e.y + 5) {
                    // Stomp enemy
                    e.alive = false;
                    charVY = BOUNCE_VEL * 0.9;
                    score += 200;
                    addFloat(e.x, e.y, '+200', '#FBBF24');
                    emitParticles(e.x, e.y, 10, '#EF4444', 25, 4);
                    sfxEnemyBounce();
                } else {
                    // Hit by enemy
                    if (shieldActive) {
                        shieldActive = false;
                        e.alive = false;
                        emitParticles(charX, charY, 12, '#3B82F6', 20, 5);
                        sfxPowerUp();
                    } else {
                        die();
                        return;
                    }
                }
            }
            // Remove far below
            if (e.y > camY + GAME_H + 100) enemies.splice(i, 1);
        }

        // ── Collectibles ──
        for (let i = collectibles.length - 1; i >= 0; i--) {
            const c = collectibles[i];
            if (!c.alive) { collectibles.splice(i, 1); continue; }
            c.bob += 0.04 * dt;
            const cdx = c.x - charX, cdy = (c.y + Math.sin(c.bob) * 4) - charY;
            if (Math.hypot(cdx, cdy) < (c.type === 'star' ? STAR_R + 12 : COIN_R + 12)) {
                c.alive = false;
                if (c.type === 'coin') {
                    coins++;
                    score += 10;
                    addFloat(c.x, c.y, '+10', '#FBBF24');
                    sfxCoin();
                } else {
                    score += 100;
                    addFloat(c.x, c.y, '+100', '#FFD700');
                    sfxStar();
                }
                emitParticles(c.x, c.y, 6, c.type === 'star' ? '#FFD700' : '#FBBF24', 18, 3);
            }
            if (c.y > camY + GAME_H + 50) collectibles.splice(i, 1);
        }

        // ── Power-ups ──
        for (let i = powerUps.length - 1; i >= 0; i--) {
            const pu = powerUps[i];
            if (!pu.alive) { powerUps.splice(i, 1); continue; }
            pu.bob += 0.05 * dt;
            const pdx = pu.x - charX, pdy = (pu.y + Math.sin(pu.bob) * 5) - charY;
            if (Math.hypot(pdx, pdy) < 18) {
                pu.alive = false;
                activatePowerUp(pu.type);
                emitParticles(pu.x, pu.y, 12, '#22D3EE', 25, 4);
            }
            if (pu.y > camY + GAME_H + 50) powerUps.splice(i, 1);
        }

        // ── Camera ──
        const targetCam = charY - GAME_H * 0.4;
        if (targetCam < camY) {
            camY = lerp(camY, targetCam, 0.1);
        }
        // Never scroll down
        camTargetY = Math.min(camTargetY, camY);

        // ── Height / Score ──
        const h = Math.max(0, -(charY - (GAME_H - 60)));
        if (h > heightReached) {
            heightReached = h;
            score = Math.max(score, Math.floor(h));
        }

        // Height markers
        const markerStep = 1000;
        const nextMarker = Math.floor(heightReached / markerStep) * markerStep;
        if (nextMarker > 0 && !heightMarkers.includes(nextMarker)) {
            heightMarkers.push(nextMarker);
            addFloat(GAME_W / 2, charY - 40, `${nextMarker}m!`, '#22D3EE');
        }

        // Spawn more platforms above
        spawnPlatformsUpTo(camY);

        // ── Death check: fell below screen ──
        if (charY > camY + GAME_H + 40) {
            die();
            return;
        }

        // ── Particles & Floats ──
        updateParticles();
        updateFloats();
        updateBgClouds();
    }

    function landOnPlatform(p) {
        charY = p.y - CHAR_H / 2;
        charSquash = 0.2;
        emitDust(charX, p.y);

        switch (p.type) {
            case 'normal':
            case 'moving':
                charVY = springShoeCount > 0 ? SPRING_VEL * 0.85 : BOUNCE_VEL;
                if (springShoeCount > 0) { springShoeCount--; sfxSpring(); } else sfxBounce();
                break;
            case 'spring':
                charVY = SPRING_VEL;
                sfxSpring();
                emitParticles(charX, p.y, 6, '#EF4444', 20, 3);
                break;
            case 'breakable':
                charVY = springShoeCount > 0 ? SPRING_VEL * 0.85 : BOUNCE_VEL;
                if (springShoeCount > 0) springShoeCount--;
                p.alive = false;
                sfxBreak();
                emitParticles(p.x + p.w / 2, p.y, 8, '#8B6914', 20, 3);
                break;
            case 'vanishing':
                charVY = springShoeCount > 0 ? SPRING_VEL * 0.85 : BOUNCE_VEL;
                if (springShoeCount > 0) springShoeCount--;
                p.timer = 30; // disappears after ~0.5s
                sfxBounce();
                break;
            case 'conveyor':
                charVY = springShoeCount > 0 ? SPRING_VEL * 0.85 : BOUNCE_VEL;
                if (springShoeCount > 0) springShoeCount--;
                charVX += p.conveyorDir * 3;
                sfxConveyor();
                break;
            case 'rocket':
                rocketBoostTimer = 90; // ~1.5s
                sfxRocket();
                emitParticles(charX, p.y, 10, '#FF6600', 25, 4);
                p.alive = false;
                break;
        }
    }

    function activatePowerUp(type) {
        sfxPowerUp();
        switch (type) {
            case 'jetpack': jetpackTimer = 300; break; // ~5s
            case 'spring_shoes': springShoeCount = 3; break;
            case 'shield': shieldActive = true; break;
            case 'propeller': propellerTimer = 240; break; // ~4s
        }
        addFloat(charX, charY - 20, type.replace('_', ' ').toUpperCase(), '#22D3EE');
    }

    function die() {
        state = ST_DEAD;
        deathTimer = 0;
        sfxFall();
        emitParticles(charX, charY, 20, playerColor, 35, 5);
        if (score > bestScore) {
            bestScore = score;
            try { localStorage.setItem('ywa_skyjump_best', bestScore); } catch(e) {}
        }
        if (gameOverCB) {
            setTimeout(() => gameOverCB({ score: Math.floor(score), coins }), 100);
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * (dt || 1);
            p.y += p.vy * (dt || 1);
            p.vy += 0.05;
            p.life -= (dt || 1);
            if (p.life <= 0) particles.splice(i, 1);
        }
        if (particles.length > 150) particles.splice(0, particles.length - 150);
    }

    function updateFloats() {
        for (let i = floats.length - 1; i >= 0; i--) {
            const f = floats[i];
            f.y -= 0.8 * (dt || 1);
            f.life -= (dt || 1);
            if (f.life <= 0) floats.splice(i, 1);
        }
    }

    function updateBgClouds() {
        for (const c of bgClouds) {
            c.x += c.speed * (dt || 1);
            if (c.x > GAME_W + c.w) { c.x = -c.w; c.y = camY + rng(0, GAME_H); }
        }
    }

    // ── Background Drawing ──
    function getZoneFactor() {
        // 0=ground, 1=above clouds, 2=twilight, 3=space, 4=deep space
        const h = heightReached;
        if (h < 2000) return { zone: 0, t: h / 2000 };
        if (h < 5000) return { zone: 1, t: (h - 2000) / 3000 };
        if (h < 10000) return { zone: 2, t: (h - 5000) / 5000 };
        if (h < 20000) return { zone: 3, t: (h - 10000) / 10000 };
        return { zone: 4, t: Math.min(1, (h - 20000) / 10000) };
    }

    function drawBackground() {
        const { zone, t } = getZoneFactor();
        let topColor, botColor;

        if (zone === 0) {
            topColor = lerpColor('#87CEEB', '#B0D4F1', t);
            botColor = lerpColor('#E0F0FF', '#CCE5FF', t);
        } else if (zone === 1) {
            topColor = lerpColor('#B0D4F1', '#7BA3CC', t);
            botColor = lerpColor('#CCE5FF', '#A8C8E8', t);
        } else if (zone === 2) {
            topColor = lerpColor('#7BA3CC', '#2D1B4E', t);
            botColor = lerpColor('#A8C8E8', '#6B3A7D', t);
        } else if (zone === 3) {
            topColor = lerpColor('#2D1B4E', '#0A0A2E', t);
            botColor = lerpColor('#6B3A7D', '#1A1A4E', t);
        } else {
            topColor = lerpColor('#0A0A2E', '#020210', t);
            botColor = lerpColor('#1A1A4E', '#050520', t);
        }

        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, topColor);
        grad.addColorStop(1, botColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Hills (ground zone only)
        if (zone === 0) {
            const hillAlpha = 1 - t;
            if (hillAlpha > 0) {
                ctx.save();
                ctx.globalAlpha = hillAlpha * 0.3;
                ctx.fillStyle = '#6AAF6A';
                const hBase = gy(GAME_H + 20);
                for (const h of bgHills) {
                    const hx = gx(h.x);
                    const hw = gs(h.w);
                    const hh = gs(h.h);
                    ctx.beginPath();
                    ctx.moveTo(hx - hw / 2, hBase);
                    ctx.quadraticCurveTo(hx, hBase - hh, hx + hw / 2, hBase);
                    ctx.fill();
                }
                ctx.restore();
            }
        }

        // Clouds (zones 0-1)
        if (zone <= 1) {
            const cloudAlpha = zone === 0 ? 1 : (1 - t);
            if (cloudAlpha > 0) {
                ctx.save();
                for (const c of bgClouds) {
                    const cy = gy(c.y);
                    if (cy < -gs(60) || cy > H + gs(60)) continue;
                    ctx.globalAlpha = c.alpha * cloudAlpha;
                    ctx.fillStyle = '#FFFFFF';
                    drawCloud(gx(c.x), cy, gs(c.w), gs(c.h));
                }
                ctx.restore();
            }
        }

        // Stars (zones 2+)
        if (zone >= 2) {
            const starAlpha = zone === 2 ? t : 1;
            ctx.save();
            for (const s of bgStars) {
                const sy = gy(s.y + camY * 0.1); // parallax
                if (sy < -5 || sy > H + 5) continue;
                const twinkle = Math.sin(frameCount * 0.02 + s.twinkle) * 0.3 + 0.7;
                ctx.globalAlpha = s.bright * starAlpha * twinkle;
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(gx(s.x), sy, gs(s.r), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    function drawCloud(x, y, w, h) {
        ctx.beginPath();
        ctx.ellipse(x, y, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x - w * 0.25, y + h * 0.1, w * 0.3, h * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + w * 0.25, y + h * 0.05, w * 0.35, h * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    function lerpColor(a, b, t) {
        const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
        const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
        const r = Math.round(ar + (br - ar) * t);
        const g = Math.round(ag + (bg - ag) * t);
        const bl = Math.round(ab + (bb - ab) * t);
        return `rgb(${r},${g},${bl})`;
    }

    // ── Drawing ──
    function draw() {
        ctx.save();
        ctx.clearRect(0, 0, W, H);

        if (state === ST_TITLE) { drawTitle(); ctx.restore(); return; }

        drawBackground();
        drawPlatforms();
        drawCollectibles();
        drawPowerUps();
        drawEnemies();
        drawParticles_();
        drawCharacter();
        drawFloats();
        drawHUD();
        if (state === ST_DEAD) drawGameOver();

        ctx.restore();
    }

    // ── Platform Drawing ──
    function drawPlatforms() {
        for (const p of platforms) {
            const px = gx(p.x), py = gy(p.y), pw = gs(p.w), ph = gs(p.h);
            if (py < -ph || py > H + ph) continue;
            if (p.type === 'breakable' && !p.alive) {
                // Falling broken pieces
                ctx.save();
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = '#8B6914';
                ctx.fillRect(px, py, pw * 0.4, ph * 0.6);
                ctx.fillRect(px + pw * 0.5, py + gs(3), pw * 0.4, ph * 0.6);
                ctx.restore();
                continue;
            }
            if (!p.alive) continue;

            ctx.save();
            // Vanishing fade
            if (p.type === 'vanishing' && p.timer > 0) {
                ctx.globalAlpha = p.timer / 30;
            }

            // Platform colors
            let col, topCol, botCol;
            switch (p.type) {
                case 'normal':    col = '#4ADE80'; topCol = '#6EE7A0'; botCol = '#2D8A4E'; break;
                case 'moving':    col = '#60A5FA'; topCol = '#93C5FD'; botCol = '#2563EB'; break;
                case 'breakable': col = '#A0845C'; topCol = '#C4A87C'; botCol = '#6B5B3A'; break;
                case 'spring':    col = '#EF4444'; topCol = '#F87171'; botCol = '#B91C1C'; break;
                case 'vanishing': col = '#E5E7EB'; topCol = '#F9FAFB'; botCol = '#9CA3AF'; break;
                case 'conveyor':  col = '#FB923C'; topCol = '#FDBA74'; botCol = '#C2410C'; break;
                case 'rocket':    col = '#A855F7'; topCol = '#C084FC'; botCol = '#7C3AED'; break;
                default:          col = '#4ADE80'; topCol = '#6EE7A0'; botCol = '#2D8A4E';
            }

            // 3D effect: body
            const radius = gs(4);
            drawRoundRect(px, py, pw, ph, radius, col);
            // Top highlight
            ctx.fillStyle = topCol;
            drawRoundRect(px, py, pw, gs(4), radius, topCol);
            // Bottom shadow
            ctx.fillStyle = botCol;
            ctx.fillRect(px + radius, py + ph - gs(3), pw - radius * 2, gs(3));

            // Spring icon
            if (p.type === 'spring') {
                ctx.strokeStyle = '#FFF';
                ctx.lineWidth = gs(2);
                const sx = px + pw / 2, sy = py - gs(2);
                ctx.beginPath();
                for (let i = 0; i < 4; i++) {
                    const lx = sx + (i % 2 === 0 ? -gs(6) : gs(6));
                    ctx.lineTo(lx, sy - gs(3 + i * 3));
                }
                ctx.stroke();
            }

            // Conveyor arrows
            if (p.type === 'conveyor') {
                ctx.fillStyle = '#FFF';
                ctx.font = `bold ${gs(10)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const arrowDir = p.conveyorDir > 0 ? '>>>' : '<<<';
                ctx.fillText(arrowDir, px + pw / 2, py + ph / 2);
            }

            // Rocket icon
            if (p.type === 'rocket') {
                ctx.fillStyle = '#FFF';
                ctx.font = `${gs(12)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText('\u{1F680}', px + pw / 2, py - gs(1));
            }

            // Breakable cracks
            if (p.type === 'breakable') {
                ctx.strokeStyle = '#6B5B3A';
                ctx.lineWidth = gs(1);
                ctx.beginPath();
                ctx.moveTo(px + pw * 0.3, py + gs(2));
                ctx.lineTo(px + pw * 0.45, py + ph * 0.6);
                ctx.lineTo(px + pw * 0.35, py + ph - gs(2));
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(px + pw * 0.65, py + gs(3));
                ctx.lineTo(px + pw * 0.55, py + ph * 0.5);
                ctx.stroke();
            }

            ctx.restore();
        }
    }

    function drawRoundRect(x, y, w, h, r, fill) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
    }

    // ── Character Drawing ──
    function drawCharacter() {
        const cx = gx(charX), cy = gy(charY);
        if (cy < -gs(40) || cy > H + gs(40)) return;

        ctx.save();
        ctx.translate(cx, cy);

        // Squash/stretch
        const sx = 1 - charSquash * 0.5;
        const sy = 1 + charSquash;
        ctx.scale(sx, sy);

        const r = gs(CHAR_W / 2);

        // Shield glow
        if (shieldActive) {
            ctx.beginPath();
            ctx.arc(0, 0, r + gs(6), 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(59,130,246,0.5)';
            ctx.lineWidth = gs(3);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, r + gs(8), 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(59,130,246,0.25)';
            ctx.lineWidth = gs(2);
            ctx.stroke();
        }

        // Body
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = playerColor;
        ctx.fill();
        ctx.strokeStyle = playerColorDark;
        ctx.lineWidth = gs(1.5);
        ctx.stroke();

        // Belly highlight
        ctx.beginPath();
        ctx.arc(gs(-2), gs(-2), r * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fill();

        // Eyes
        const eyeOffY = gs(-3);
        const eyeSpacing = gs(5);
        const eyeR = gs(4.5);
        const pupilR = gs(2.5);

        // Eye whites
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(-eyeSpacing, eyeOffY, eyeR, eyeR * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(eyeSpacing, eyeOffY, eyeR, eyeR * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pupils (look up when rising, down when falling)
        let pupilOffY = 0;
        if (charFace === 0) pupilOffY = gs(-1.5); // looking up
        else if (charFace === 2) pupilOffY = gs(1); // looking down scared

        ctx.fillStyle = '#1A1A2E';
        ctx.beginPath();
        ctx.arc(-eyeSpacing, eyeOffY + pupilOffY, pupilR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(eyeSpacing, eyeOffY + pupilOffY, pupilR, 0, Math.PI * 2);
        ctx.fill();

        // Eye shine
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(-eyeSpacing - gs(1), eyeOffY + pupilOffY - gs(1), gs(1), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(eyeSpacing - gs(1), eyeOffY + pupilOffY - gs(1), gs(1), 0, Math.PI * 2);
        ctx.fill();

        // Scared: wide mouth
        if (charFace === 2) {
            ctx.beginPath();
            ctx.ellipse(0, gs(6), gs(4), gs(3), 0, 0, Math.PI * 2);
            ctx.fillStyle = '#1A1A2E';
            ctx.fill();
        }
        // Happy: big smile
        else if (charFace === 1) {
            ctx.beginPath();
            ctx.arc(0, gs(4), gs(4), 0, Math.PI);
            ctx.strokeStyle = '#1A1A2E';
            ctx.lineWidth = gs(1.5);
            ctx.stroke();
        }
        // Normal: small smile
        else {
            ctx.beginPath();
            ctx.arc(0, gs(3), gs(3), 0.1, Math.PI - 0.1);
            ctx.strokeStyle = '#1A1A2E';
            ctx.lineWidth = gs(1.2);
            ctx.stroke();
        }

        // Nose/snout
        ctx.beginPath();
        ctx.ellipse(0, gs(0.5), gs(2.5), gs(1.5), 0, 0, Math.PI * 2);
        ctx.fillStyle = brighten(playerColor, 30);
        ctx.fill();

        // Arms (wiggle with movement)
        const armWiggle = Math.sin(frameCount * 0.15) * gs(3);
        ctx.strokeStyle = playerColor;
        ctx.lineWidth = gs(3);
        ctx.lineCap = 'round';
        // Left arm
        ctx.beginPath();
        ctx.moveTo(-r + gs(2), gs(2));
        ctx.lineTo(-r - gs(5), gs(4) + armWiggle);
        ctx.stroke();
        // Right arm
        ctx.beginPath();
        ctx.moveTo(r - gs(2), gs(2));
        ctx.lineTo(r + gs(5), gs(4) - armWiggle);
        ctx.stroke();

        // Legs (wiggle)
        const legWiggle = Math.sin(frameCount * 0.12) * gs(2);
        ctx.lineWidth = gs(2.5);
        // Left leg
        ctx.beginPath();
        ctx.moveTo(-gs(4), r - gs(2));
        ctx.lineTo(-gs(6), r + gs(6) + legWiggle);
        ctx.stroke();
        // Right leg
        ctx.beginPath();
        ctx.moveTo(gs(4), r - gs(2));
        ctx.lineTo(gs(6), r + gs(6) - legWiggle);
        ctx.stroke();

        // Jetpack flames
        if (jetpackTimer > 0) {
            const flameH = gs(8 + Math.random() * 6);
            ctx.fillStyle = '#FF6600';
            ctx.beginPath();
            ctx.moveTo(-gs(4), r);
            ctx.lineTo(0, r + flameH);
            ctx.lineTo(gs(4), r);
            ctx.fill();
            ctx.fillStyle = '#FFCC00';
            ctx.beginPath();
            ctx.moveTo(-gs(2), r);
            ctx.lineTo(0, r + flameH * 0.6);
            ctx.lineTo(gs(2), r);
            ctx.fill();
        }

        // Rocket boost flames
        if (rocketBoostTimer > 0) {
            const flameH = gs(14 + Math.random() * 10);
            ctx.fillStyle = '#FF4400';
            ctx.beginPath();
            ctx.moveTo(-gs(6), r);
            ctx.lineTo(0, r + flameH);
            ctx.lineTo(gs(6), r);
            ctx.fill();
            ctx.fillStyle = '#FFAA00';
            ctx.beginPath();
            ctx.moveTo(-gs(3), r);
            ctx.lineTo(0, r + flameH * 0.5);
            ctx.lineTo(gs(3), r);
            ctx.fill();
        }

        // Propeller hat
        if (propellerTimer > 0) {
            const propAngle = frameCount * 0.3;
            ctx.save();
            ctx.translate(0, -r - gs(2));
            // Hat cap
            ctx.fillStyle = '#EF4444';
            ctx.beginPath();
            ctx.arc(0, 0, gs(3), 0, Math.PI * 2);
            ctx.fill();
            // Blades
            ctx.rotate(propAngle);
            ctx.fillStyle = '#3B82F6';
            ctx.fillRect(-gs(10), -gs(1.5), gs(20), gs(3));
            ctx.rotate(Math.PI / 2);
            ctx.fillRect(-gs(10), -gs(1.5), gs(20), gs(3));
            ctx.restore();
        }

        // Spring shoes indicator
        if (springShoeCount > 0) {
            ctx.fillStyle = '#FBBF24';
            ctx.beginPath();
            ctx.ellipse(-gs(5), r + gs(4), gs(4), gs(2), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(gs(5), r + gs(4), gs(4), gs(2), 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        // Screen wrap ghost
        if (charX < CHAR_W) {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.translate(gx(charX + GAME_W), cy);
            ctx.scale(sx, sy);
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fillStyle = playerColor;
            ctx.fill();
            ctx.restore();
        } else if (charX > GAME_W - CHAR_W) {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.translate(gx(charX - GAME_W), cy);
            ctx.scale(sx, sy);
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fillStyle = playerColor;
            ctx.fill();
            ctx.restore();
        }
    }

    // ── Enemies ──
    function drawEnemies() {
        for (const e of enemies) {
            if (!e.alive) continue;
            const ex = gx(e.x), ey = gy(e.y);
            if (ey < -gs(40) || ey > H + gs(40)) continue;

            ctx.save();
            ctx.translate(ex, ey);

            if (e.type === 'ufo') {
                // UFO body
                const bob = Math.sin(e.phase) * gs(3);
                ctx.translate(0, bob);
                // Dome
                ctx.fillStyle = '#94A3B8';
                ctx.beginPath();
                ctx.ellipse(0, -gs(4), gs(8), gs(6), 0, Math.PI, 0);
                ctx.fill();
                // Glass
                ctx.fillStyle = 'rgba(147,197,253,0.6)';
                ctx.beginPath();
                ctx.ellipse(0, -gs(6), gs(5), gs(4), 0, Math.PI, 0);
                ctx.fill();
                // Saucer
                ctx.fillStyle = '#64748B';
                ctx.beginPath();
                ctx.ellipse(0, 0, gs(14), gs(5), 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#94A3B8';
                ctx.beginPath();
                ctx.ellipse(0, -gs(1), gs(14), gs(3), 0, 0, Math.PI * 2);
                ctx.fill();
                // Lights
                for (let i = 0; i < 4; i++) {
                    const lx = gs(-9 + i * 6);
                    const blink = Math.sin(frameCount * 0.1 + i) > 0;
                    ctx.fillStyle = blink ? '#FBBF24' : '#92400E';
                    ctx.beginPath();
                    ctx.arc(lx, gs(1), gs(1.5), 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            if (e.type === 'monster') {
                // Monster sitting on platform
                const bounce = Math.abs(Math.sin(e.phase * 2)) * gs(2);
                ctx.translate(0, -bounce);
                // Body
                ctx.fillStyle = '#DC2626';
                ctx.beginPath();
                ctx.arc(0, 0, gs(12), 0, Math.PI * 2);
                ctx.fill();
                // Spikes
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
                    ctx.fillStyle = '#991B1B';
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a - 0.2) * gs(10), Math.sin(a - 0.2) * gs(10));
                    ctx.lineTo(Math.cos(a) * gs(16), Math.sin(a) * gs(16));
                    ctx.lineTo(Math.cos(a + 0.2) * gs(10), Math.sin(a + 0.2) * gs(10));
                    ctx.fill();
                }
                // Eyes
                ctx.fillStyle = '#FFF';
                ctx.beginPath(); ctx.arc(-gs(4), -gs(2), gs(4), 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(gs(4), -gs(2), gs(4), 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#1A1A2E';
                ctx.beginPath(); ctx.arc(-gs(4), -gs(1), gs(2), 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(gs(4), -gs(1), gs(2), 0, Math.PI * 2); ctx.fill();
                // Angry mouth
                ctx.beginPath();
                ctx.arc(0, gs(4), gs(4), 0, Math.PI);
                ctx.fillStyle = '#1A1A2E';
                ctx.fill();
            }

            if (e.type === 'blackhole') {
                // Swirling vortex
                const pulse = 1 + Math.sin(frameCount * 0.05) * 0.1;
                for (let ring = 3; ring >= 0; ring--) {
                    const rr = gs(6 + ring * 5) * pulse;
                    ctx.beginPath();
                    ctx.arc(0, 0, rr, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(${30 + ring * 20},${10 + ring * 10},${60 + ring * 30},${0.8 - ring * 0.15})`;
                    ctx.fill();
                }
                // Spiral arms
                ctx.save();
                ctx.rotate(frameCount * 0.03);
                ctx.strokeStyle = 'rgba(139,92,246,0.4)';
                ctx.lineWidth = gs(1.5);
                for (let arm = 0; arm < 3; arm++) {
                    ctx.beginPath();
                    for (let t = 0; t < 2; t += 0.1) {
                        const a = arm * (Math.PI * 2 / 3) + t * 2;
                        const rr = t * gs(12);
                        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
                    }
                    ctx.stroke();
                }
                ctx.restore();
                // Center
                ctx.fillStyle = '#0A0A0A';
                ctx.beginPath();
                ctx.arc(0, 0, gs(5), 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }

    // ── Collectibles ──
    function drawCollectibles() {
        for (const c of collectibles) {
            if (!c.alive) continue;
            const cx = gx(c.x), cy = gy(c.y + Math.sin(c.bob) * 4);
            if (cy < -gs(15) || cy > H + gs(15)) continue;

            ctx.save();
            ctx.translate(cx, cy);

            if (c.type === 'coin') {
                // Gold coin
                ctx.fillStyle = '#FBBF24';
                ctx.beginPath();
                ctx.arc(0, 0, gs(COIN_R), 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#D97706';
                ctx.lineWidth = gs(1);
                ctx.stroke();
                // Shine
                ctx.fillStyle = '#FDE68A';
                ctx.beginPath();
                ctx.arc(-gs(1.5), -gs(1.5), gs(2), 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Star
                drawStar(0, 0, gs(STAR_R), 5, '#FFD700', '#F59E0B');
                // Glow
                ctx.beginPath();
                ctx.arc(0, 0, gs(STAR_R + 3), 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,215,0,0.15)';
                ctx.fill();
            }

            ctx.restore();
        }
    }

    function drawStar(cx, cy, r, points, fill, stroke) {
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const a = (i * Math.PI) / points - Math.PI / 2;
            const rr = i % 2 === 0 ? r : r * 0.45;
            ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = gs(1); ctx.stroke(); }
    }

    // ── Power-ups ──
    function drawPowerUps() {
        for (const pu of powerUps) {
            if (!pu.alive) continue;
            const px = gx(pu.x), py = gy(pu.y + Math.sin(pu.bob) * 5);
            if (py < -gs(20) || py > H + gs(20)) continue;

            ctx.save();
            ctx.translate(px, py);

            // Glow
            ctx.beginPath();
            ctx.arc(0, 0, gs(14), 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(34,211,238,0.15)';
            ctx.fill();

            // Box
            drawRoundRect(-gs(10), -gs(10), gs(20), gs(20), gs(4), '#1E3A5F');
            ctx.strokeStyle = '#22D3EE';
            ctx.lineWidth = gs(1.5);
            ctx.strokeRect(-gs(9), -gs(9), gs(18), gs(18));

            // Icon
            ctx.fillStyle = '#FFF';
            ctx.font = `${gs(14)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const icons = { jetpack: '\u{1F680}', spring_shoes: '\u{1F45F}', shield: '\u{1F6E1}', propeller: '\u{1FA82}' };
            ctx.fillText(icons[pu.type] || '?', 0, gs(1));

            ctx.restore();
        }
    }

    // ── Particles & Floats ──
    function drawParticles_() {
        for (const p of particles) {
            const px = gx(p.x), py = gy(p.y);
            if (py < -10 || py > H + 10) continue;
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(px, py, gs(p.r) * (p.life / p.maxLife), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawFloats() {
        for (const f of floats) {
            const fx = gx(f.x), fy = gy(f.y);
            if (fy < -30 || fy > H + 30) continue;
            ctx.save();
            ctx.globalAlpha = f.life / f.maxLife;
            ctx.font = `bold ${gs(13)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#000';
            ctx.fillText(f.text, fx + gs(1), fy + gs(1));
            ctx.fillStyle = f.color;
            ctx.fillText(f.text, fx, fy);
            ctx.restore();
        }
    }

    // ── HUD ──
    function drawHUD() {
        ctx.save();
        // Score
        ctx.font = `bold ${gs(18)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillText(`${Math.floor(heightReached)}m`, gs(12) + gs(1), gs(12) + gs(1));
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`${Math.floor(heightReached)}m`, gs(12), gs(12));

        // Coins
        ctx.font = `${gs(13)}px sans-serif`;
        ctx.fillStyle = '#FBBF24';
        ctx.fillText(`\u{1FA99} ${coins}`, gs(12), gs(34));

        // Power-up indicators
        let indicY = gs(55);
        if (jetpackTimer > 0) {
            ctx.fillStyle = '#FF6600';
            ctx.fillText(`\u{1F680} ${Math.ceil(jetpackTimer / 60)}s`, gs(12), indicY);
            indicY += gs(16);
        }
        if (rocketBoostTimer > 0) {
            ctx.fillStyle = '#FF4400';
            ctx.fillText(`ROCKET!`, gs(12), indicY);
            indicY += gs(16);
        }
        if (springShoeCount > 0) {
            ctx.fillStyle = '#FBBF24';
            ctx.fillText(`\u{1F45F} x${springShoeCount}`, gs(12), indicY);
            indicY += gs(16);
        }
        if (shieldActive) {
            ctx.fillStyle = '#3B82F6';
            ctx.fillText(`\u{1F6E1} SHIELD`, gs(12), indicY);
            indicY += gs(16);
        }
        if (propellerTimer > 0) {
            ctx.fillStyle = '#22D3EE';
            ctx.fillText(`\u{1FA82} ${Math.ceil(propellerTimer / 60)}s`, gs(12), indicY);
        }

        ctx.restore();
    }

    // ── Title Screen ──
    function drawTitle() {
        // Sky gradient
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#87CEEB');
        grad.addColorStop(1, '#E0F0FF');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Decorative clouds
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        const t = frameCount * 0.005;
        for (let i = 0; i < 5; i++) {
            const cx = ((i * 80 + t * 30) % (GAME_W + 100)) - 50;
            drawCloud(gx(cx), gs(60 + i * 90), gs(70 + i * 10), gs(25 + i * 5));
        }

        // Floating sample platforms
        ctx.save();
        const platBounce = Math.sin(frameCount * 0.03) * gs(8);
        drawRoundRect(gx(60), gs(420) + platBounce, gs(PLAT_W), gs(PLAT_H), gs(4), '#4ADE80');
        drawRoundRect(gx(180), gs(360) - platBounce, gs(PLAT_W), gs(PLAT_H), gs(4), '#60A5FA');
        drawRoundRect(gx(250), gs(450) + platBounce * 0.7, gs(PLAT_W), gs(PLAT_H), gs(4), '#EF4444');
        ctx.restore();

        // Title
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowColor = playerColor;
        ctx.shadowBlur = gs(15);
        ctx.font = `bold ${gs(48)}px sans-serif`;
        ctx.fillStyle = playerColor;
        ctx.fillText('SKY', W / 2, H * 0.22);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${gs(52)}px sans-serif`;
        ctx.fillText('JUMP', W / 2, H * 0.33);
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.font = `${gs(12)}px sans-serif`;
        ctx.fillStyle = '#475569';
        ctx.fillText('How high can you go?', W / 2, H * 0.42);

        // Instructions
        ctx.font = `${gs(11)}px sans-serif`;
        ctx.fillStyle = '#64748B';
        ctx.fillText('\u2190 \u2192 ARROWS or TILT to move', W / 2, H * 0.54);
        ctx.fillText('Bounce on platforms to climb!', W / 2, H * 0.59);

        // Blink prompt
        const blink = Math.sin(frameCount * 0.06) * 0.5 + 0.5;
        ctx.globalAlpha = blink;
        ctx.font = `bold ${gs(15)}px sans-serif`;
        ctx.fillStyle = playerColor;
        ctx.fillText('[ TAP TO START ]', W / 2, H * 0.72);
        ctx.globalAlpha = 1;

        // Best score
        if (bestScore > 0) {
            ctx.font = `${gs(12)}px sans-serif`;
            ctx.fillStyle = '#94A3B8';
            ctx.fillText(`Best: ${Math.floor(bestScore)}m`, W / 2, H * 0.82);
        }

        // Bouncing character preview
        const previewY = gs(480) + Math.sin(frameCount * 0.05) * gs(15);
        ctx.save();
        ctx.translate(W / 2, previewY);
        const pr = gs(16);
        ctx.beginPath();
        ctx.arc(0, 0, pr, 0, Math.PI * 2);
        ctx.fillStyle = playerColor;
        ctx.fill();
        ctx.strokeStyle = playerColorDark;
        ctx.lineWidth = gs(1.5);
        ctx.stroke();
        // Eyes
        ctx.fillStyle = '#FFF';
        ctx.beginPath(); ctx.ellipse(-gs(4), -gs(3), gs(3.5), gs(4), 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(gs(4), -gs(3), gs(3.5), gs(4), 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1A1A2E';
        ctx.beginPath(); ctx.arc(-gs(4), -gs(4), gs(2), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(gs(4), -gs(4), gs(2), 0, Math.PI * 2); ctx.fill();
        // Smile
        ctx.beginPath();
        ctx.arc(0, gs(2), gs(3), 0.1, Math.PI - 0.1);
        ctx.strokeStyle = '#1A1A2E';
        ctx.lineWidth = gs(1.2);
        ctx.stroke();
        ctx.restore();
    }

    // ── Game Over Screen ──
    function drawGameOver() {
        ctx.save();
        const fade = Math.min(1, deathTimer / 30);
        ctx.fillStyle = `rgba(0,0,0,${0.6 * fade})`;
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowColor = '#EF4444';
        ctx.shadowBlur = gs(15);
        ctx.font = `bold ${gs(36)}px sans-serif`;
        ctx.fillStyle = '#EF4444';
        ctx.fillText('GAME OVER', W / 2, H * 0.28);
        ctx.shadowBlur = 0;

        ctx.font = `${gs(16)}px sans-serif`;
        ctx.fillStyle = '#E0E7FF';
        ctx.fillText(`Height: ${Math.floor(heightReached)}m`, W / 2, H * 0.42);

        ctx.font = `${gs(14)}px sans-serif`;
        ctx.fillStyle = '#FBBF24';
        ctx.fillText(`Coins: ${coins}`, W / 2, H * 0.50);

        if (bestScore > 0) {
            ctx.fillStyle = '#94A3B8';
            ctx.fillText(`Best: ${Math.floor(bestScore)}m`, W / 2, H * 0.58);
        }

        if (heightReached >= bestScore && heightReached > 0) {
            ctx.font = `bold ${gs(14)}px sans-serif`;
            ctx.fillStyle = '#22D3EE';
            ctx.fillText('NEW BEST!', W / 2, H * 0.65);
        }

        if (deathTimer > 60) {
            const blink = Math.sin(frameCount * 0.06) * 0.5 + 0.5;
            ctx.globalAlpha = blink;
            ctx.font = `bold ${gs(13)}px sans-serif`;
            ctx.fillStyle = playerColor;
            ctx.fillText('[ TAP TO RETRY ]', W / 2, H * 0.78);
        }

        ctx.restore();
    }

    // ── Game Loop ──
    function gameLoop(ts) {
        if (!gameActive) return;
        if (!lastTime) lastTime = ts;
        dt = Math.min((ts - lastTime) / 16.67, 3);
        lastTime = ts;

        update();
        draw();

        animFrame = requestAnimationFrame(gameLoop);
    }

    // ── Public API ──
    function init(cvs, playerData, onGameOverFn) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOverFn;
        gameActive = true;
        playerColor = playerData?.color || '#06B6D4';

        const themeId = playerData?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) playerColor = _t.colors[0] || playerColor;

        playerColorDark = darken(playerColor);

        state = ST_TITLE;
        frameCount = 0;
        lastTime = 0;
        bestScore = parseInt(localStorage.getItem('ywa_skyjump_best') || '0', 10);
        keys = {};
        touchSide = 0;
        useTilt = false;
        particles = [];
        floats = [];
        platforms = [];
        enemies = [];
        powerUps = [];
        collectibles = [];
        heightMarkers = [];

        initBgElements();

        W = canvas.width || 360;
        H = canvas.height || 640;
        SCALE = W / GAME_W;

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        window.addEventListener('resize', fitCanvas);
        window.addEventListener('devicemotion', onDeviceMotion);

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
        window.removeEventListener('devicemotion', onDeviceMotion);
    }

    return { init, destroy };
})();
