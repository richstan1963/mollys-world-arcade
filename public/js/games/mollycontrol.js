/* MollyControl — Theme-aware Missile Command with Kenney CC0 sprites for Your World Arcade */
window.MollyControl = (() => {
    // ── Sprite Atlas (Kenney CC0) ──
    const __sprites = {};
    let __spritesLoaded = 0, __spritesTotal = 0, __allSpritesReady = false;
    const __SPRITE_MANIFEST = {
        missile: '/img/game-assets/kenney-space/Missiles/spaceMissiles_001.png',
        missileEnemy: '/img/game-assets/kenney-space/Missiles/spaceMissiles_004.png',
        explosion1: '/img/game-assets/kenney-space/effects/fire00.png',
        explosion2: '/img/game-assets/kenney-space/effects/fire05.png',
        explosion3: '/img/game-assets/kenney-space/effects/fire10.png',
        explosion4: '/img/game-assets/kenney-space/effects/fire15.png',
        cityTile: '/img/game-assets/kenney-platform/tiles/boxCrate.png',
        cityTile2: '/img/game-assets/kenney-platform/tiles/brickBrown.png',
        bomber: '/img/game-assets/kenney-space/enemies/enemyRed1.png',
        satellite: '/img/game-assets/kenney-space/enemies/enemyBlue3.png',
        particle1: '/img/game-assets/kenney-particles/particleWhite_1.png',
    };

    function __loadSprites(onDone) {
        const keys = Object.keys(__SPRITE_MANIFEST);
        __spritesTotal = keys.length;
        __spritesLoaded = 0;
        let done = 0;
        keys.forEach(key => {
            const img = new Image();
            img.onload = () => { __sprites[key] = img; done++; __spritesLoaded = done; if (done === __spritesTotal) { __allSpritesReady = true; if (onDone) onDone(); } };
            img.onerror = () => { __sprites[key] = null; done++; __spritesLoaded = done; if (done === __spritesTotal) { __allSpritesReady = true; if (onDone) onDone(); } };
            img.src = __SPRITE_MANIFEST[key];
        });
    }

    function __drawLoadingScreen(cvs, context, title, color) {
        const w = cvs.width, h = cvs.height;
        context.fillStyle = '#0A0E1A';
        context.fillRect(0, 0, w, h);
        context.textAlign = 'center';
        context.fillStyle = color;
        context.shadowColor = color; context.shadowBlur = 10;
        context.font = 'bold ' + Math.round(w * 0.06) + 'px monospace';
        context.fillText(title, w / 2, h / 2 - w * 0.08);
        context.shadowBlur = 0;
        context.fillStyle = '#E0E7FF';
        context.font = Math.round(w * 0.025) + 'px monospace';
        context.fillText('LOADING SPRITES...', w / 2, h / 2);
        const barW = w * 0.35, barH = w * 0.012;
        const pct = __spritesTotal > 0 ? __spritesLoaded / __spritesTotal : 0;
        context.fillStyle = '#333';
        context.fillRect(w / 2 - barW / 2, h / 2 + w * 0.025, barW, barH);
        context.fillStyle = color;
        context.fillRect(w / 2 - barW / 2, h / 2 + w * 0.025, barW * pct, barH);
    }


    // ── Constants ──
    const W = 480, H = 640;
    const GROUND_H = 60;
    let CITY_COLORS    = ['#F43F5E','#A855F7','#3B82F6','#22C55E','#F59E0B','#EC4899'];
    let EXPLODE_COLORS = ['#F43F5E','#A855F7','#3B82F6','#22C55E','#F59E0B','#EC4899','#06B6D4'];
    let skyGrad        = ['#0a0a1e', '#0F1117', '#1a1a2e'];
    const STAR_COUNT = 90;
    const AMMO_PER_BATTERY = 10;
    const PLAYER_MISSILE_SPEED = 7;
    const EXP_EXPAND_MS = 500;
    const EXP_HOLD_MS = 300;
    const EXP_SHRINK_MS = 500;
    const EXP_MAX_R = 42;
    const CHAIN_EXP_MAX_R = 28;
    const BONUS_CITY_SCORE = 10000;
    const STATES = { TITLE: 0, WAVE_INTRO: 1, PLAYING: 2, WAVE_END: 3, GAME_OVER: 4 };

    // ── State ──
    let canvas, ctx, audioCtx;
    let onGameOver, player;
    let gameActive = false;
    let state = STATES.TITLE;
    let score = 0, wave = 0, lives = 0;
    let startTime = 0, frameId = null;
    let totalMissilesDestroyed = 0, maxChainReaction = 0;
    let bonusCityThreshold = BONUS_CITY_SCORE;
    let mouseX = W / 2, mouseY = H / 2;
    let selectedBattery = -1; // -1 = auto nearest
    let stateTimer = 0;
    let waveEndPhase = 0, waveEndTick = 0;
    let waveBonusCities = 0, waveBonusAmmo = 0;

    // World
    let stars = [];
    let cities = [];       // { x, w, alive, color, buildings:[] }
    let batteries = [];    // { x, ammo, alive }
    let enemyMissiles = []; // { x,y, tx,ty, sx,sy, speed, trail:[], mirv, mirvDone, smart }
    let playerMissiles = []; // { x,y, tx,ty, sx,sy, speed, trail:[], batteryIdx }
    let explosions = [];   // { x,y, r, maxR, phase, timer, color, chain }
    let bombers = [];      // { x,y, dx, speed, alive, dropped }
    let satellites = [];   // { x,y, dx, speed, alive }
    let particles = [];    // { x,y,vx,vy, life, maxLife, color }
    let scorePopups = [];  // { x, y, text, life, maxLife, color, vy }
    let shootingStars = []; // { x, y, vx, vy, len, life, maxLife }
    let shootingStarTimer = 0;

    // Screen shake
    let shakeX = 0, shakeY = 0, shakeMag = 0, shakeDur = 0, shakeTimer = 0;

    // Window flicker cache (so windows don't randomize every frame)
    let windowFlickerSeed = 0;

    // Wave config
    let enemiesRemaining = 0;
    let enemySpawnTimer = 0;
    let enemySpawnInterval = 0;
    let waveEnemyCount = 0;
    let waveEnemySpeed = 0;
    let waveMirvChance = 0;
    let waveSmartChance = 0;
    let waveBomberCount = 0;
    let waveSatelliteCount = 0;
    let bombersSpawned = 0, satellitesSpawned = 0;
    let bomberTimer = 0, satelliteTimer = 0;

    // Title screen demo
    let demoExplosions = [];
    let demoTimer = 0;

    // Listeners to clean up
    let boundMouseMove, boundMouseDown, boundTouchStart, boundTouchMove, boundKeyDown;
    let boundResize;

    // ── Audio ──
    function ensureAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function playLaunch() {
        ensureAudio();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(200, audioCtx.currentTime);
        o.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.15);
        g.gain.setValueAtTime(0.12, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + 0.2);
    }

    function playExplode() {
        ensureAudio();
        const bufSize = audioCtx.sampleRate * 0.4;
        const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.2, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        const f = audioCtx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 300;
        src.connect(f); f.connect(g); g.connect(audioCtx.destination);
        src.start(); src.stop(audioCtx.currentTime + 0.4);
    }

    function playEnemyHit() {
        ensureAudio();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(600, audioCtx.currentTime);
        o.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
        g.gain.setValueAtTime(0.15, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + 0.12);
    }

    function playCityDestroyed() {
        ensureAudio();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, audioCtx.currentTime);
        o.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.5);
        g.gain.setValueAtTime(0.25, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + 0.5);
    }

    function playBonusCity() {
        ensureAudio();
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'sine';
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.1, audioCtx.currentTime + i * 0.1);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.1 + 0.2);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(audioCtx.currentTime + i * 0.1);
            o.stop(audioCtx.currentTime + i * 0.1 + 0.2);
        });
    }

    function playWaveStart() {
        ensureAudio();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(440, audioCtx.currentTime);
        o.frequency.setValueAtTime(550, audioCtx.currentTime + 0.15);
        o.frequency.setValueAtTime(440, audioCtx.currentTime + 0.3);
        g.gain.setValueAtTime(0.08, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + 0.45);
    }

    // ── Utility ──
    function dist(x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function randInt(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }
    function randFloat(lo, hi) { return Math.random() * (hi - lo) + lo; }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    // ── Scale helpers ──
    let scaleX = 1, scaleY = 1;
    function canvasToGame(cx, cy) {
        return { x: cx * scaleX, y: cy * scaleY };
    }

    // ── World Setup ──
    function initStars() {
        stars = [];
        for (let i = 0; i < STAR_COUNT; i++) {
            stars.push({
                x: Math.random() * W, y: Math.random() * (H - GROUND_H - 40),
                size: Math.random() * 1.5 + 0.5,
                brightness: Math.random(), twinkleSpeed: Math.random() * 0.03 + 0.01
            });
        }
    }

    function initCities() {
        cities = [];
        const groundY = H - GROUND_H;
        const spacing = W / 9; // 6 cities + 3 batteries spread across
        // Positions: city bat city city bat city city bat city
        const positions = [1, 3, 4, 6, 7, 9]; // ×spacing for city positions (0-indexed multiplier)
        const xPositions = [spacing * 0.7, spacing * 2.1, spacing * 2.8, spacing * 5.2, spacing * 5.9, spacing * 7.3];
        for (let i = 0; i < 6; i++) {
            const cx = xPositions[i];
            const bCount = randInt(3, 5);
            const buildings = [];
            for (let b = 0; b < bCount; b++) {
                buildings.push({
                    rx: (b - bCount / 2) * 10 + randFloat(-2, 2),
                    w: randInt(8, 14), h: randInt(15, 35),
                    color: CITY_COLORS[i], shade: randFloat(0.7, 1.0)
                });
            }
            cities.push({ x: cx, w: bCount * 12, alive: true, color: CITY_COLORS[i], buildings, rubble: [] });
        }
    }

    function initBatteries() {
        batteries = [];
        const spacing = W / 9;
        const xPositions = [spacing * 1.4, spacing * 4.0, spacing * 6.6];
        for (let i = 0; i < 3; i++) {
            batteries[i] = { x: xPositions[i], ammo: AMMO_PER_BATTERY, alive: true };
        }
    }

    function resetWaveEntities() {
        enemyMissiles = [];
        playerMissiles = [];
        explosions = [];
        bombers = [];
        satellites = [];
        particles = [];
        scorePopups = [];
    }

    // ── Wave Config ──
    function configureWave(w) {
        waveEnemyCount = 8 + w * 4;
        waveEnemySpeed = 0.6 + w * 0.15;
        if (waveEnemySpeed > 3.0) waveEnemySpeed = 3.0;
        enemySpawnInterval = Math.max(300, 1200 - w * 80);
        waveMirvChance = w >= 3 ? Math.min(0.3, (w - 2) * 0.08) : 0;
        waveSmartChance = w >= 5 ? Math.min(0.25, (w - 4) * 0.06) : 0;
        waveBomberCount = w >= 4 ? Math.min(3, w - 3) : 0;
        waveSatelliteCount = w >= 6 ? Math.min(2, w - 5) : 0;
        enemiesRemaining = waveEnemyCount;
        enemySpawnTimer = 0;
        bombersSpawned = 0; satellitesSpawned = 0;
        bomberTimer = 2000 + Math.random() * 3000;
        satelliteTimer = 4000 + Math.random() * 5000;
        // Refill ammo
        batteries.forEach(b => { if (b.alive) b.ammo = AMMO_PER_BATTERY; });
    }

    // ── Spawn ──
    function spawnEnemyMissile() {
        if (enemiesRemaining <= 0) return;
        enemiesRemaining--;
        const aliveCities = cities.filter(c => c.alive);
        if (aliveCities.length === 0) return;
        const target = pick(aliveCities);
        const sx = randFloat(20, W - 20);
        const sy = -5;
        const tx = target.x + randFloat(-10, 10);
        const ty = H - GROUND_H - 5;
        const isMirv = Math.random() < waveMirvChance;
        const isSmart = !isMirv && Math.random() < waveSmartChance;
        enemyMissiles.push({
            x: sx, y: sy, tx, ty, sx, sy, speed: waveEnemySpeed + randFloat(-0.15, 0.15),
            trail: [], mirv: isMirv, mirvDone: false, smart: isSmart,
            mirvY: randFloat(H * 0.3, H * 0.55)
        });
    }

    function spawnBomber() {
        const fromLeft = Math.random() > 0.5;
        bombers.push({
            x: fromLeft ? -30 : W + 30,
            y: randFloat(40, 140),
            dx: fromLeft ? 1 : -1,
            speed: 1.2 + wave * 0.1,
            alive: true, dropped: false, dropX: randFloat(W * 0.2, W * 0.8)
        });
    }

    function spawnSatellite() {
        const fromLeft = Math.random() > 0.5;
        satellites.push({
            x: fromLeft ? -20 : W + 20,
            y: randFloat(25, 80),
            dx: fromLeft ? 1 : -1,
            speed: 0.6 + wave * 0.05,
            alive: true
        });
    }

    function spawnMirvChildren(m) {
        const count = randInt(2, 3);
        const aliveCities = cities.filter(c => c.alive);
        for (let i = 0; i < count; i++) {
            const target = aliveCities.length > 0 ? pick(aliveCities) : { x: randFloat(40, W - 40) };
            const tx = target.x + randFloat(-15, 15);
            const ty = H - GROUND_H - 5;
            enemyMissiles.push({
                x: m.x + randFloat(-8, 8), y: m.y, tx, ty,
                sx: m.x, sy: m.y, speed: waveEnemySpeed * 1.1,
                trail: [], mirv: false, mirvDone: false, smart: false, mirvY: 0
            });
        }
    }

    function spawnBomberBomb(b) {
        const aliveCities = cities.filter(c => c.alive);
        const target = aliveCities.length > 0 ? pick(aliveCities) : { x: b.x };
        enemyMissiles.push({
            x: b.x, y: b.y, tx: target.x, ty: H - GROUND_H - 5,
            sx: b.x, sy: b.y, speed: waveEnemySpeed * 0.9,
            trail: [], mirv: false, mirvDone: false, smart: false, mirvY: 0
        });
    }

    // ── Fire ──
    function firePlayerMissile(tx, ty) {
        // Find best battery
        let bestIdx = -1, bestDist = Infinity;
        for (let i = 0; i < 3; i++) {
            if (!batteries[i].alive || batteries[i].ammo <= 0) continue;
            if (selectedBattery >= 0 && selectedBattery !== i) continue;
            const d = Math.abs(batteries[i].x - tx);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        if (bestIdx < 0) return;
        batteries[bestIdx].ammo--;
        const b = batteries[bestIdx];
        const groundY = H - GROUND_H;
        const sx = b.x, sy = groundY - 12;
        // Center battery fires faster
        const speedMul = bestIdx === 1 ? 1.3 : 1.0;
        playerMissiles.push({
            x: sx, y: sy, tx, ty: Math.min(ty, groundY - 30), sx, sy,
            speed: PLAYER_MISSILE_SPEED * speedMul, trail: [], batteryIdx: bestIdx
        });
        playLaunch();
    }

    // ── Explosions ──
    function spawnExplosion(x, y, maxR, chain) {
        explosions.push({
            x, y, r: 0, maxR, phase: 0, timer: 0,
            color: pick(EXPLODE_COLORS), chain: chain || 0
        });
        playExplode();
    }

    function spawnParticles(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = randFloat(1, 4);
            particles.push({
                x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
                life: 400 + Math.random() * 300, maxLife: 700, color: color || pick(EXPLODE_COLORS)
            });
        }
    }

    // ── City Destruction ──
    function destroyCity(idx) {
        const c = cities[idx];
        c.alive = false;
        c.rubble = [];
        for (let i = 0; i < 12; i++) {
            c.rubble.push({ rx: randFloat(-20, 20), ry: randFloat(-3, 3), size: randFloat(2, 5), color: c.color });
        }
        playCityDestroyed();
        spawnParticles(c.x, H - GROUND_H - 5, 15, c.color);
        // Screen shake on city destruction
        triggerShake(6, 400);
    }

    function triggerShake(magnitude, duration) {
        shakeMag = magnitude;
        shakeDur = duration;
        shakeTimer = 0;
    }

    function spawnScorePopup(x, y, points, color) {
        scorePopups.push({
            x, y, text: '+' + points, life: 1000, maxLife: 1000,
            color: color || '#FBBF24', vy: -1.2
        });
    }

    function rebuildCity() {
        const dead = cities.filter(c => !c.alive);
        if (dead.length === 0) return;
        const c = pick(dead);
        c.alive = true;
        c.rubble = [];
        const bCount = randInt(3, 5);
        c.buildings = [];
        for (let b = 0; b < bCount; b++) {
            c.buildings.push({
                rx: (b - bCount / 2) * 10 + randFloat(-2, 2),
                w: randInt(8, 14), h: randInt(15, 35),
                color: c.color, shade: randFloat(0.7, 1.0)
            });
        }
        playBonusCity();
        spawnParticles(c.x, H - GROUND_H - 15, 12, '#22D3EE');
    }

    // ── Update ──
    let lastTime = 0;
    function update(dt) {
        if (state === STATES.TITLE) { updateTitle(dt); return; }
        if (state === STATES.WAVE_INTRO) { updateWaveIntro(dt); return; }
        if (state === STATES.WAVE_END) { updateWaveEnd(dt); return; }
        if (state === STATES.GAME_OVER) { updateParticles(dt); updateScorePopups(dt); updateShootingStars(dt); return; }

        // PLAYING
        updateSpawning(dt);
        updateEnemyMissiles(dt);
        updatePlayerMissiles(dt);
        updateExplosions(dt);
        updateBombers(dt);
        updateSatellites(dt);
        updateParticles(dt);
        updateScorePopups(dt);
        updateShootingStars(dt);
        updateScreenShake(dt);
        checkCollisions();
        checkBonusCity();
        checkWaveComplete();
        checkGameOver();
    }

    function updateTitle(dt) {
        updateShootingStars(dt);
        demoTimer += dt;
        if (demoTimer > 600) {
            demoTimer = 0;
            demoExplosions.push({
                x: randFloat(60, W - 60), y: randFloat(100, H - 150),
                r: 0, maxR: randFloat(25, 50), phase: 0, timer: 0, color: pick(EXPLODE_COLORS), chain: 0
            });
        }
        for (let i = demoExplosions.length - 1; i >= 0; i--) {
            const e = demoExplosions[i];
            e.timer += dt;
            if (e.phase === 0) {
                e.r = (e.timer / EXP_EXPAND_MS) * e.maxR;
                if (e.timer >= EXP_EXPAND_MS) { e.phase = 1; e.timer = 0; }
            } else if (e.phase === 1) {
                e.r = e.maxR;
                if (e.timer >= EXP_HOLD_MS) { e.phase = 2; e.timer = 0; }
            } else {
                e.r = e.maxR * (1 - e.timer / EXP_SHRINK_MS);
                if (e.timer >= EXP_SHRINK_MS) { demoExplosions.splice(i, 1); }
            }
        }
    }

    function updateWaveIntro(dt) {
        updateShootingStars(dt);
        stateTimer -= dt;
        if (stateTimer <= 0) {
            state = STATES.PLAYING;
            configureWave(wave);
        }
    }

    function updateWaveEnd(dt) {
        waveEndTick += dt;
        if (waveEndPhase === 0) {
            // Count surviving cities
            if (waveEndTick > 400) {
                waveBonusCities = cities.filter(c => c.alive).length;
                waveEndPhase = 1; waveEndTick = 0;
            }
        } else if (waveEndPhase === 1) {
            // Count remaining ammo
            if (waveEndTick > 400) {
                waveBonusAmmo = batteries.reduce((s, b) => s + (b.alive ? b.ammo : 0), 0);
                waveEndPhase = 2; waveEndTick = 0;
            }
        } else if (waveEndPhase === 2) {
            // Award bonuses
            if (waveEndTick > 200) {
                const cityBonus = waveBonusCities * 100 * wave;
                const ammoBonus = waveBonusAmmo * 5;
                score += cityBonus + ammoBonus;
                waveEndPhase = 3; waveEndTick = 0;
            }
        } else {
            if (waveEndTick > 1500) {
                wave++;
                startWaveIntro();
            }
        }
    }

    function updateSpawning(dt) {
        enemySpawnTimer += dt;
        if (enemiesRemaining > 0 && enemySpawnTimer >= enemySpawnInterval) {
            enemySpawnTimer = 0;
            spawnEnemyMissile();
        }
        // Bombers
        if (bombersSpawned < waveBomberCount) {
            bomberTimer -= dt;
            if (bomberTimer <= 0) {
                spawnBomber();
                bombersSpawned++;
                bomberTimer = 3000 + Math.random() * 4000;
            }
        }
        // Satellites
        if (satellitesSpawned < waveSatelliteCount) {
            satelliteTimer -= dt;
            if (satelliteTimer <= 0) {
                spawnSatellite();
                satellitesSpawned++;
                satelliteTimer = 5000 + Math.random() * 5000;
            }
        }
    }

    function updateEnemyMissiles(dt) {
        const groundY = H - GROUND_H;
        for (let i = enemyMissiles.length - 1; i >= 0; i--) {
            const m = enemyMissiles[i];
            // MIRV split
            if (m.mirv && !m.mirvDone && m.y >= m.mirvY) {
                m.mirvDone = true;
                spawnMirvChildren(m);
                enemyMissiles.splice(i, 1);
                continue;
            }
            // Smart bomb: slightly adjust toward nearest alive city
            if (m.smart) {
                let nearest = null, nd = Infinity;
                cities.forEach(c => {
                    if (!c.alive) return;
                    const d = dist(m.x, m.y, c.x, groundY - 5);
                    if (d < nd) { nd = d; nearest = c; }
                });
                if (nearest) {
                    const angle = Math.atan2(groundY - 5 - m.y, nearest.x - m.x);
                    m.tx = lerp(m.tx, nearest.x, 0.02);
                }
            }
            const dx = m.tx - m.sx, dy = m.ty - m.sy;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
                m.x += (dx / len) * m.speed;
                m.y += (dy / len) * m.speed;
            }
            m.trail.push({ x: m.x, y: m.y });
            if (m.trail.length > 30) m.trail.shift();

            // Hit ground / city check
            if (m.y >= groundY - 5) {
                // Check city hit
                for (let ci = 0; ci < cities.length; ci++) {
                    const c = cities[ci];
                    if (!c.alive) continue;
                    if (Math.abs(m.x - c.x) < c.w * 0.7) {
                        destroyCity(ci);
                        break;
                    }
                }
                spawnExplosion(m.x, groundY - 5, CHAIN_EXP_MAX_R * 0.6, 0);
                enemyMissiles.splice(i, 1);
            }
        }
    }

    function updatePlayerMissiles(dt) {
        for (let i = playerMissiles.length - 1; i >= 0; i--) {
            const m = playerMissiles[i];
            const dx = m.tx - m.x, dy = m.ty - m.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < m.speed * 1.5) {
                spawnExplosion(m.tx, m.ty, EXP_MAX_R, 0);
                playerMissiles.splice(i, 1);
                continue;
            }
            m.x += (dx / d) * m.speed;
            m.y += (dy / d) * m.speed;
            m.trail.push({ x: m.x, y: m.y });
            if (m.trail.length > 15) m.trail.shift();
        }
    }

    function updateExplosions(dt) {
        for (let i = explosions.length - 1; i >= 0; i--) {
            const e = explosions[i];
            e.timer += dt;
            if (e.phase === 0) {
                e.r = (e.timer / EXP_EXPAND_MS) * e.maxR;
                if (e.timer >= EXP_EXPAND_MS) { e.phase = 1; e.timer = 0; }
            } else if (e.phase === 1) {
                e.r = e.maxR;
                if (e.timer >= EXP_HOLD_MS) { e.phase = 2; e.timer = 0; }
            } else {
                e.r = e.maxR * (1 - e.timer / EXP_SHRINK_MS);
                if (e.timer >= EXP_SHRINK_MS) {
                    spawnParticles(e.x, e.y, 6, e.color);
                    explosions.splice(i, 1);
                }
            }
        }
    }

    function updateBombers(dt) {
        for (let i = bombers.length - 1; i >= 0; i--) {
            const b = bombers[i];
            if (!b.alive) { bombers.splice(i, 1); continue; }
            b.x += b.dx * b.speed;
            if (!b.dropped && Math.abs(b.x - b.dropX) < 10) {
                b.dropped = true;
                spawnBomberBomb(b);
            }
            if (b.x < -50 || b.x > W + 50) { bombers.splice(i, 1); }
        }
    }

    function updateSatellites(dt) {
        for (let i = satellites.length - 1; i >= 0; i--) {
            const s = satellites[i];
            if (!s.alive) { satellites.splice(i, 1); continue; }
            s.x += s.dx * s.speed;
            if (s.x < -40 || s.x > W + 40) { satellites.splice(i, 1); }
        }
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.05;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function updateScorePopups(dt) {
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const sp = scorePopups[i];
            sp.y += sp.vy;
            sp.vy *= 0.98;
            sp.life -= dt;
            if (sp.life <= 0) scorePopups.splice(i, 1);
        }
    }

    function updateShootingStars(dt) {
        shootingStarTimer += dt;
        // Spawn occasionally
        if (shootingStarTimer > 3000 + Math.random() * 5000) {
            shootingStarTimer = 0;
            const fromRight = Math.random() > 0.5;
            shootingStars.push({
                x: fromRight ? W + 10 : -10,
                y: randFloat(10, H * 0.3),
                vx: (fromRight ? -1 : 1) * randFloat(3, 6),
                vy: randFloat(1, 3),
                len: randFloat(8, 18),
                life: 800 + Math.random() * 600,
                maxLife: 1400
            });
        }
        for (let i = shootingStars.length - 1; i >= 0; i--) {
            const ss = shootingStars[i];
            ss.x += ss.vx;
            ss.y += ss.vy;
            ss.life -= dt;
            if (ss.life <= 0 || ss.x < -50 || ss.x > W + 50 || ss.y > H) {
                shootingStars.splice(i, 1);
            }
        }
    }

    function updateScreenShake(dt) {
        if (shakeDur > 0) {
            shakeTimer += dt;
            if (shakeTimer >= shakeDur) {
                shakeDur = 0;
                shakeX = 0; shakeY = 0;
            } else {
                const progress = 1 - shakeTimer / shakeDur;
                const mag = shakeMag * progress;
                shakeX = (Math.random() - 0.5) * mag * 2;
                shakeY = (Math.random() - 0.5) * mag * 2;
            }
        }
    }

    function checkCollisions() {
        // Explosions vs enemy missiles
        for (let ei = explosions.length - 1; ei >= 0; ei--) {
            const e = explosions[ei];
            if (e.r <= 0) continue;
            // vs enemy missiles
            for (let mi = enemyMissiles.length - 1; mi >= 0; mi--) {
                const m = enemyMissiles[mi];
                if (dist(e.x, e.y, m.x, m.y) < e.r + 4) {
                    score += 25;
                    totalMissilesDestroyed++;
                    const chainLevel = e.chain + 1;
                    if (chainLevel > maxChainReaction) maxChainReaction = chainLevel;
                    spawnExplosion(m.x, m.y, CHAIN_EXP_MAX_R, chainLevel);
                    spawnScorePopup(m.x, m.y - 10, chainLevel > 1 ? 25 * chainLevel : 25, chainLevel > 1 ? '#FF6B6B' : '#FBBF24');
                    playEnemyHit();
                    enemyMissiles.splice(mi, 1);
                }
            }
            // vs bombers
            for (let bi = bombers.length - 1; bi >= 0; bi--) {
                const b = bombers[bi];
                if (!b.alive) continue;
                if (dist(e.x, e.y, b.x, b.y) < e.r + 15) {
                    b.alive = false;
                    score += 100;
                    totalMissilesDestroyed++;
                    spawnExplosion(b.x, b.y, CHAIN_EXP_MAX_R, 0);
                    spawnParticles(b.x, b.y, 10, '#F97316');
                    spawnScorePopup(b.x, b.y - 15, 100, '#F97316');
                }
            }
            // vs satellites
            for (let si = satellites.length - 1; si >= 0; si--) {
                const s = satellites[si];
                if (!s.alive) continue;
                if (dist(e.x, e.y, s.x, s.y) < e.r + 10) {
                    s.alive = false;
                    score += 200;
                    totalMissilesDestroyed++;
                    spawnExplosion(s.x, s.y, CHAIN_EXP_MAX_R, 0);
                    spawnParticles(s.x, s.y, 12, '#A855F7');
                    spawnScorePopup(s.x, s.y - 15, 200, '#A855F7');
                }
            }
        }
    }

    function checkBonusCity() {
        if (score >= bonusCityThreshold) {
            bonusCityThreshold += BONUS_CITY_SCORE;
            rebuildCity();
        }
    }

    function checkWaveComplete() {
        if (enemiesRemaining > 0) return;
        if (enemyMissiles.length > 0) return;
        if (playerMissiles.length > 0) return;
        if (explosions.length > 0) return;
        if (bombers.length > 0) return;
        if (satellites.length > 0) return;
        // Wave over
        state = STATES.WAVE_END;
        waveEndPhase = 0; waveEndTick = 0;
        waveBonusCities = 0; waveBonusAmmo = 0;
    }

    function checkGameOver() {
        if (cities.some(c => c.alive)) return;
        state = STATES.GAME_OVER;
        gameActive = false;
        if (onGameOver) {
            onGameOver({
                score: score,
                level: wave,
                duration: Math.floor((Date.now() - startTime) / 1000),
                totalPopped: totalMissilesDestroyed,
                maxCombo: maxChainReaction
            });
        }
    }

    // ── Drawing ──
    function draw() {
        ctx.save();
        // Screen shake offset
        if (shakeDur > 0) {
            ctx.translate(shakeX, shakeY);
        }

        ctx.clearRect(-10, -10, W + 20, H + 20);
        drawBackground();
        drawStars();

        if (state === STATES.TITLE) { drawTitle(); drawVignette(); ctx.restore(); return; }
        if (state === STATES.GAME_OVER) { drawGame(); drawScorePopups(); drawVignette(); drawGameOver(); ctx.restore(); return; }
        if (state === STATES.WAVE_INTRO) { drawGame(); drawScorePopups(); drawVignette(); drawWaveIntro(); ctx.restore(); return; }
        if (state === STATES.WAVE_END) { drawGame(); drawScorePopups(); drawVignette(); drawWaveEnd(); ctx.restore(); return; }
        drawGame();
        drawScorePopups();
        drawVignette();
        ctx.restore();
    }

    function drawBackground() {
        const grd = ctx.createLinearGradient(0, 0, 0, H);
        grd.addColorStop(0, skyGrad[0]);
        grd.addColorStop(0.5, skyGrad[1]);
        grd.addColorStop(0.85, skyGrad[2]);
        grd.addColorStop(1, '#12121e');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, H);
        // Ground
        const gy = H - GROUND_H;
        const gg = ctx.createLinearGradient(0, gy, 0, H);
        gg.addColorStop(0, '#2d2d4e');
        gg.addColorStop(0.4, '#222244');
        gg.addColorStop(1, '#151530');
        ctx.fillStyle = gg;
        ctx.fillRect(0, gy, W, GROUND_H);
        // Atmospheric ground glow (horizon haze)
        const horizonGlow = ctx.createLinearGradient(0, gy - 40, 0, gy + 10);
        horizonGlow.addColorStop(0, 'transparent');
        horizonGlow.addColorStop(0.5, 'rgba(60,40,80,0.15)');
        horizonGlow.addColorStop(1, 'rgba(40,20,60,0.25)');
        ctx.fillStyle = horizonGlow;
        ctx.fillRect(0, gy - 40, W, 50);
        // Ground line with subtle glow
        ctx.shadowColor = '#6a5acd';
        ctx.shadowBlur = 6;
        ctx.strokeStyle = '#5a5a8e';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
        ctx.shadowBlur = 0;
        // Subtle terrain bumps on ground line
        ctx.strokeStyle = '#4a4a6e';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let x = 0; x < W; x += 3) {
            const bumpH = Math.sin(x * 0.08) * 1.5 + Math.sin(x * 0.03) * 2;
            ctx.lineTo(x, gy + bumpH);
        }
        ctx.stroke();
    }

    function drawStars() {
        const t = Date.now() * 0.001;
        stars.forEach(s => {
            const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.twinkleSpeed * 60 + s.brightness * 10));
            // Larger stars get a subtle glow
            if (s.size > 1.2) {
                const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 3);
                glow.addColorStop(0, `rgba(200,220,255,${(alpha * 0.4).toFixed(2)})`);
                glow.addColorStop(1, 'transparent');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size * 3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size * 0.5, 0, Math.PI * 2);
            ctx.fill();
        });
        // Shooting stars
        shootingStars.forEach(ss => {
            const alpha = Math.max(0, ss.life / ss.maxLife);
            const grad = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * ss.len, ss.y - ss.vy * ss.len);
            grad.addColorStop(0, `rgba(255,255,255,${(alpha * 0.9).toFixed(2)})`);
            grad.addColorStop(0.3, `rgba(180,200,255,${(alpha * 0.5).toFixed(2)})`);
            grad.addColorStop(1, 'transparent');
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(ss.x, ss.y);
            ctx.lineTo(ss.x - ss.vx * ss.len, ss.y - ss.vy * ss.len);
            ctx.stroke();
            // Bright head
            ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(ss.x, ss.y, 1.5, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawGame() {
        drawEnemyMissiles();
        drawPlayerMissiles();
        drawExplosions();
        drawBombers();
        drawSatellites();
        drawParticles();
        drawCities();
        drawBatteries();
        drawCrosshair();
        drawHUD();
    }

    function drawCities() {
        const gy = H - GROUND_H;
        const t = Date.now() * 0.001;
        cities.forEach((c, ci) => {
            if (c.alive) {
                // City glow on ground
                const cityGlow = ctx.createRadialGradient(c.x, gy, 0, c.x, gy, 35);
                cityGlow.addColorStop(0, c.color + '18');
                cityGlow.addColorStop(1, 'transparent');
                ctx.fillStyle = cityGlow;
                ctx.beginPath();
                ctx.arc(c.x, gy, 35, 0, Math.PI * 2);
                ctx.fill();

                c.buildings.forEach((b, bi) => {
                    const bx = c.x + b.rx - b.w / 2;
                    const by = gy - b.h;

                    // Building shadow (depth)
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.fillRect(bx + 2, by + 2, b.w, b.h);

                    // Building body — darker shade for silhouette feel
                    const bodyGrad = ctx.createLinearGradient(bx, by, bx + b.w, by);
                    bodyGrad.addColorStop(0, b.color);
                    bodyGrad.addColorStop(1, shadeColor(b.color, -30));
                    ctx.fillStyle = bodyGrad;
                    ctx.globalAlpha = b.shade;
                    ctx.fillRect(bx, by, b.w, b.h);

                    // Rooftop accent
                    ctx.fillStyle = shadeColor(b.color, 20);
                    ctx.fillRect(bx, by, b.w, 2);

                    // Lit windows — use deterministic pattern (not random each frame)
                    const seed = ci * 100 + bi * 10;
                    ctx.globalAlpha = 0.85 * b.shade;
                    for (let wy = by + 5; wy < gy - 4; wy += 7) {
                        for (let wx = bx + 3; wx < bx + b.w - 3; wx += 5) {
                            const winSeed = (seed + Math.floor(wx) * 7 + Math.floor(wy) * 13) % 100;
                            if (winSeed > 15) {
                                // Flicker some windows — more lit
                                const flicker = (winSeed % 20 < 5) ? (0.6 + 0.4 * Math.sin(t * 2 + winSeed)) : 1;
                                const warm = winSeed % 3 === 0;
                                const cool = winSeed % 7 === 0;
                                const wColor = cool ? `rgba(180,220,255,${(0.7 * flicker).toFixed(2)})` :
                                               warm ? `rgba(254,230,100,${(0.95 * flicker).toFixed(2)})` :
                                               `rgba(254,249,195,${(0.8 * flicker).toFixed(2)})`;
                                ctx.fillStyle = wColor;
                                ctx.fillRect(wx, wy, 3, 3);
                                // Wider window glow
                                if (winSeed > 50) {
                                    ctx.fillStyle = `rgba(254,249,195,${(0.2 * flicker).toFixed(2)})`;
                                    ctx.fillRect(wx - 1, wy - 1, 5, 5);
                                }
                            }
                        }
                    }
                    ctx.globalAlpha = 1;
                });
            } else {
                // Rubble with smoke wisps
                c.rubble.forEach((r, ri) => {
                    ctx.fillStyle = shadeColor(r.color, -40);
                    ctx.globalAlpha = 0.45;
                    ctx.fillRect(c.x + r.rx, gy - 3 + r.ry, r.size, r.size * 0.5);
                    ctx.fillStyle = r.color;
                    ctx.globalAlpha = 0.3;
                    ctx.fillRect(c.x + r.rx + 1, gy - 3 + r.ry, r.size * 0.7, r.size * 0.35);
                });
                // Smoke wisps from ruins
                for (let s = 0; s < 2; s++) {
                    const sx = c.x + Math.sin(t * 0.5 + ci + s) * 8;
                    const sy = gy - 8 - Math.abs(Math.sin(t * 0.7 + ci * 2 + s)) * 15;
                    ctx.fillStyle = `rgba(100,100,120,${(0.08 + 0.04 * Math.sin(t + s)).toFixed(2)})`;
                    ctx.beginPath();
                    ctx.arc(sx, sy, 4 + Math.sin(t + s) * 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
            }
        });
    }

    // Helper: darken/lighten hex color
    function shadeColor(color, amount) {
        let r = parseInt(color.slice(1, 3), 16);
        let g = parseInt(color.slice(3, 5), 16);
        let b = parseInt(color.slice(5, 7), 16);
        r = Math.max(0, Math.min(255, r + amount));
        g = Math.max(0, Math.min(255, g + amount));
        b = Math.max(0, Math.min(255, b + amount));
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function drawBatteries() {
        const gy = H - GROUND_H;
        const t = Date.now() * 0.001;
        batteries.forEach((b, idx) => {
            // Turret aim angle toward mouse
            const aimAngle = (state === STATES.PLAYING) ? Math.atan2(mouseY - (gy - 12), mouseX - b.x) : -Math.PI / 2;

            // Base platform — trapezoid
            ctx.fillStyle = '#1e3a5f';
            ctx.beginPath();
            ctx.moveTo(b.x - 18, gy);
            ctx.lineTo(b.x + 18, gy);
            ctx.lineTo(b.x + 12, gy - 6);
            ctx.lineTo(b.x - 12, gy - 6);
            ctx.closePath();
            ctx.fill();

            // Base top accent
            ctx.fillStyle = '#2a5580';
            ctx.fillRect(b.x - 12, gy - 7, 24, 2);

            // Turret dome
            ctx.fillStyle = '#06B6D4';
            ctx.beginPath();
            ctx.arc(b.x, gy - 10, 8, Math.PI, 0);
            ctx.closePath();
            ctx.fill();

            // Turret barrel — points toward mouse
            ctx.save();
            ctx.translate(b.x, gy - 10);
            ctx.rotate(aimAngle);
            // Barrel
            ctx.fillStyle = '#0891B2';
            ctx.fillRect(0, -2, 14, 4);
            // Barrel tip
            ctx.fillStyle = '#22D3EE';
            ctx.fillRect(12, -2.5, 3, 5);
            // Barrel glow if has ammo
            if (b.ammo > 0) {
                ctx.fillStyle = `rgba(34,211,238,${(0.3 + 0.2 * Math.sin(t * 4 + idx)).toFixed(2)})`;
                ctx.beginPath();
                ctx.arc(15, 0, 3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            // Dome highlight
            ctx.fillStyle = 'rgba(34,211,238,0.3)';
            ctx.beginPath();
            ctx.arc(b.x - 2, gy - 13, 3, 0, Math.PI * 2);
            ctx.fill();

            // Ammo indicator — small pips in a row
            const maxAmmo = AMMO_PER_BATTERY;
            const pipW = 2, pipH = 4, pipGap = 1;
            const totalPipW = maxAmmo * (pipW + pipGap) - pipGap;
            const pipStartX = b.x - totalPipW / 2;
            for (let a = 0; a < maxAmmo; a++) {
                const px = pipStartX + a * (pipW + pipGap);
                const py = gy + 4;
                if (a < b.ammo) {
                    ctx.fillStyle = '#22D3EE';
                } else {
                    ctx.fillStyle = 'rgba(100,100,120,0.3)';
                }
                ctx.fillRect(px, py, pipW, pipH);
            }

            // Battery label
            ctx.fillStyle = '#64748B';
            ctx.font = '8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText((idx + 1).toString(), b.x, gy + 16);
        });
    }

    function drawEnemyMissiles() {
        enemyMissiles.forEach(m => {
            // Sprite enemy missile tip
            if (__sprites.missileEnemy) {
                const msz = 16;
                const mAngle = Math.atan2(m.y - m.sy, m.x - m.sx) + Math.PI / 2;
                ctx.save();
                ctx.translate(m.x, m.y);
                ctx.rotate(mAngle);
                ctx.drawImage(__sprites.missileEnemy, -msz/2, -msz, msz, msz * 2);
                ctx.restore();
            }
            const isSmrt = m.smart;
            const baseR = isSmrt ? 251 : 239, baseG = isSmrt ? 191 : 68, baseB = isSmrt ? 36 : 68;
            // Trail — gradient widening with glow
            if (m.trail.length > 1) {
                for (let t = 1; t < m.trail.length; t++) {
                    const pct = t / m.trail.length;
                    const alpha = pct * 0.7;
                    const width = 0.5 + pct * 2.5;
                    // Outer glow layer
                    ctx.strokeStyle = `rgba(${baseR},${baseG},${baseB},${(alpha * 0.3).toFixed(2)})`;
                    ctx.lineWidth = width + 3;
                    ctx.beginPath();
                    ctx.moveTo(m.trail[t - 1].x, m.trail[t - 1].y);
                    ctx.lineTo(m.trail[t].x, m.trail[t].y);
                    ctx.stroke();
                    // Core trail
                    ctx.strokeStyle = `rgba(${baseR},${baseG},${baseB},${alpha.toFixed(2)})`;
                    ctx.lineWidth = width;
                    ctx.beginPath();
                    ctx.moveTo(m.trail[t - 1].x, m.trail[t - 1].y);
                    ctx.lineTo(m.trail[t].x, m.trail[t].y);
                    ctx.stroke();
                }
            }
            // Warhead glow
            const headGlow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 10);
            headGlow.addColorStop(0, `rgba(255,255,200,0.6)`);
            headGlow.addColorStop(0.3, `rgba(${baseR},${baseG},${baseB},0.4)`);
            headGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = headGlow;
            ctx.beginPath();
            ctx.arc(m.x, m.y, 10, 0, Math.PI * 2);
            ctx.fill();
            // Warhead core
            ctx.fillStyle = isSmrt ? '#FEF08A' : '#FCA5A5';
            ctx.beginPath();
            ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(m.x, m.y, 1.5, 0, Math.PI * 2);
            ctx.fill();
            // MIRV indicator — pulsing ring
            if (m.mirv && !m.mirvDone) {
                const pulse = 0.3 + 0.4 * Math.sin(Date.now() * 0.008);
                ctx.strokeStyle = `rgba(251,191,36,${pulse.toFixed(2)})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(m.x, m.y, 7 + Math.sin(Date.now() * 0.01) * 2, 0, Math.PI * 2);
                ctx.stroke();
            }
        });
    }

    function drawPlayerMissiles() {
        playerMissiles.forEach(m => {
            // Smoke trail puffs — thicker
            if (m.trail.length > 2) {
                for (let t = 0; t < m.trail.length; t++) {
                    const pct = t / m.trail.length;
                    const alpha = pct * 0.35;
                    const size = (1 - pct) * 6 + 3;
                    ctx.fillStyle = `rgba(180,200,220,${alpha.toFixed(2)})`;
                    ctx.beginPath();
                    ctx.arc(m.trail[t].x + (Math.random() - 0.5) * 2, m.trail[t].y + (Math.random() - 0.5) * 2, size, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            // Core trail line
            if (m.trail.length > 1) {
                for (let t = 1; t < m.trail.length; t++) {
                    const pct = t / m.trail.length;
                    const alpha = pct * 0.9;
                    ctx.strokeStyle = `rgba(6,182,212,${alpha.toFixed(2)})`;
                    ctx.lineWidth = 1 + pct * 1.5;
                    ctx.beginPath();
                    ctx.moveTo(m.trail[t - 1].x, m.trail[t - 1].y);
                    ctx.lineTo(m.trail[t].x, m.trail[t].y);
                    ctx.stroke();
                }
            }
            // Missile head glow
            const headGlow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 8);
            headGlow.addColorStop(0, 'rgba(34,211,238,0.7)');
            headGlow.addColorStop(0.5, 'rgba(6,182,212,0.3)');
            headGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = headGlow;
            ctx.beginPath();
            ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
            ctx.fill();
            // Bright head
            ctx.fillStyle = '#ECFEFF';
            ctx.beginPath();
            ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#06B6D4';
            ctx.beginPath();
            ctx.arc(m.x, m.y, 1.5, 0, Math.PI * 2);
            ctx.fill();
            // Animated target crosshair
            const t2 = Date.now() * 0.003;
            const crossR = 8 + Math.sin(t2) * 2;
            ctx.save();
            ctx.strokeStyle = 'rgba(6,182,212,0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(m.tx, m.ty, crossR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
            // Cross lines
            ctx.strokeStyle = 'rgba(6,182,212,0.25)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(m.tx - 5, m.ty); ctx.lineTo(m.tx + 5, m.ty);
            ctx.moveTo(m.tx, m.ty - 5); ctx.lineTo(m.tx, m.ty + 5);
            ctx.stroke();
        });
    }

    function drawExplosions() {
        explosions.forEach(e => {
            if (e.r <= 0) return;
            // Sprite explosions
            const _expFrames = ['explosion1','explosion2','explosion3','explosion4'];
            const _efi = Math.min(e.phase, _expFrames.length - 1);
            if (__sprites[_expFrames[_efi]]) {
                const sz = e.r * 2.5;
                ctx.save();
                ctx.globalAlpha = e.phase === 2 ? Math.max(0, 1 - e.timer / EXP_SHRINK_MS) : 1;
                ctx.drawImage(__sprites[_expFrames[_efi]], e.x - sz/2, e.y - sz/2, sz, sz);
                ctx.restore();
            }
            const pulse = 0.75 + 0.25 * Math.sin(Date.now() * 0.02);
            const phaseAlpha = e.phase === 2 ? Math.max(0, 1 - e.timer / EXP_SHRINK_MS) : 1;

            // Wide atmospheric glow — bigger radius
            const farGlow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 3.5);
            farGlow.addColorStop(0, `rgba(255,140,50,${(0.2 * phaseAlpha).toFixed(2)})`);
            farGlow.addColorStop(0.4, `rgba(255,60,30,${(0.1 * phaseAlpha).toFixed(2)})`);
            farGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = farGlow;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r * 3.5, 0, Math.PI * 2);
            ctx.fill();

            // Core explosion: white center → orange → red → fade
            const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);
            grad.addColorStop(0, `rgba(255,255,255,${(0.95 * pulse * phaseAlpha).toFixed(2)})`);
            grad.addColorStop(0.15, `rgba(255,240,200,${(0.9 * phaseAlpha).toFixed(2)})`);
            grad.addColorStop(0.35, `rgba(255,160,50,${(0.8 * phaseAlpha).toFixed(2)})`);
            grad.addColorStop(0.6, `rgba(220,60,30,${(0.6 * phaseAlpha).toFixed(2)})`);
            grad.addColorStop(0.85, `rgba(150,20,20,${(0.3 * phaseAlpha).toFixed(2)})`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
            ctx.fill();

            // Hot inner core (extra bright)
            if (e.phase < 2) {
                const coreR = e.r * 0.3;
                const coreGrad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, coreR);
                coreGrad.addColorStop(0, `rgba(255,255,255,${(0.9 * pulse).toFixed(2)})`);
                coreGrad.addColorStop(1, 'rgba(255,200,100,0)');
                ctx.fillStyle = coreGrad;
                ctx.beginPath();
                ctx.arc(e.x, e.y, coreR, 0, Math.PI * 2);
                ctx.fill();
            }

            // Shockwave ring
            ctx.strokeStyle = `rgba(255,200,150,${(0.35 * phaseAlpha).toFixed(2)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r * 0.9, 0, Math.PI * 2);
            ctx.stroke();

            // Outer fading ring
            ctx.strokeStyle = `rgba(255,100,50,${(0.15 * phaseAlpha).toFixed(2)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r * 1.2, 0, Math.PI * 2);
            ctx.stroke();
        });
    }

    function drawBombers(list) {
        bombers.forEach(b => {
            if (!b.alive) return;
            if (__sprites.bomber) {
                const bsz = 26;
                ctx.save();
                ctx.translate(b.x, b.y);
                if (b.dx < 0) ctx.scale(-1, 1);
                ctx.drawImage(__sprites.bomber, -bsz/2, -bsz/2, bsz, bsz);
                ctx.restore();
                return;
            }
            ctx.fillStyle = '#F97316';
            // Simple plane shape
            ctx.beginPath();
            ctx.moveTo(b.x + b.dx * 15, b.y);
            ctx.lineTo(b.x - b.dx * 10, b.y - 6);
            ctx.lineTo(b.x - b.dx * 10, b.y + 6);
            ctx.closePath();
            ctx.fill();
            // Wings
            ctx.fillStyle = '#FB923C';
            ctx.beginPath();
            ctx.moveTo(b.x - b.dx * 3, b.y);
            ctx.lineTo(b.x - b.dx * 8, b.y - 10);
            ctx.lineTo(b.x - b.dx * 8, b.y);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(b.x - b.dx * 3, b.y);
            ctx.lineTo(b.x - b.dx * 8, b.y + 10);
            ctx.lineTo(b.x - b.dx * 8, b.y);
            ctx.closePath();
            ctx.fill();
        });
    }

    function drawSatellites() {
        satellites.forEach(s => {
            if (!s.alive) return;
            if (__sprites.satellite) {
                const ssz = 22;
                ctx.drawImage(__sprites.satellite, s.x - ssz/2, s.y - ssz/2, ssz, ssz);
                return;
            }
            ctx.fillStyle = '#A855F7';
            ctx.fillRect(s.x - 5, s.y - 3, 10, 6);
            // Solar panels
            ctx.fillStyle = '#C084FC';
            ctx.fillRect(s.x - 14, s.y - 2, 8, 4);
            ctx.fillRect(s.x + 6, s.y - 2, 8, 4);
            // Blink
            const blink = Math.sin(Date.now() * 0.01) > 0;
            if (blink) {
                ctx.fillStyle = '#E9D5FF';
                ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
            }
        });
    }

    function drawParticles() {
        particles.forEach(p => {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            // Particle glow for larger particles
            if (alpha > 0.3) {
                const pglow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 4);
                pglow.addColorStop(0, p.color);
                pglow.addColorStop(1, 'transparent');
                ctx.fillStyle = pglow;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    function drawScorePopups() {
        scorePopups.forEach(sp => {
            const alpha = Math.max(0, sp.life / sp.maxLife);
            const scale = 0.8 + 0.4 * (1 - alpha); // grows slightly as it fades
            ctx.save();
            ctx.translate(sp.x, sp.y);
            ctx.scale(scale, scale);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 13px monospace';
            // Shadow for readability
            ctx.fillStyle = `rgba(0,0,0,${(alpha * 0.5).toFixed(2)})`;
            ctx.fillText(sp.text, 1, 1);
            // Main text
            ctx.fillStyle = sp.color;
            ctx.globalAlpha = alpha;
            ctx.fillText(sp.text, 0, 0);
            ctx.globalAlpha = 1;
            ctx.restore();
        });
    }

    function drawVignette() {
        // Corner vignette
        const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, W * 0.75);
        vg.addColorStop(0, 'transparent');
        vg.addColorStop(0.7, 'rgba(0,0,0,0.08)');
        vg.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
    }

    function drawCrosshair() {
        if (state !== STATES.PLAYING) return;
        ctx.strokeStyle = '#06B6D4';
        ctx.lineWidth = 1.5;
        const size = 8;
        ctx.beginPath();
        ctx.moveTo(mouseX - size, mouseY);
        ctx.lineTo(mouseX + size, mouseY);
        ctx.moveTo(mouseX, mouseY - size);
        ctx.lineTo(mouseX, mouseY + size);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(6,182,212,0.3)';
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, size + 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawHUD() {
        // Score
        ctx.fillStyle = '#E2E8F0';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('SCORE: ' + score.toLocaleString(), 10, 22);
        // Wave
        ctx.textAlign = 'right';
        ctx.fillText('WAVE: ' + wave, W - 10, 22);
        // Cities remaining
        ctx.textAlign = 'center';
        const alive = cities.filter(c => c.alive).length;
        ctx.font = '12px monospace';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText('CITIES: ' + alive + '/6', W / 2, 22);
    }

    function drawTitle() {
        // Demo explosions with upgraded gradients
        demoExplosions.forEach(e => {
            if (e.r <= 0) return;
            // Outer glow
            const farG = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 1.8);
            farG.addColorStop(0, 'rgba(255,140,50,0.1)');
            farG.addColorStop(1, 'transparent');
            ctx.fillStyle = farG;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r * 1.8, 0, Math.PI * 2);
            ctx.fill();
            // Core
            const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);
            grad.addColorStop(0, 'rgba(255,255,255,0.5)');
            grad.addColorStop(0.2, 'rgba(255,200,100,0.45)');
            grad.addColorStop(0.5, e.color + '50');
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
            ctx.fill();
        });
        // Title
        const t = Date.now() * 0.001;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Glow
        ctx.shadowColor = '#06B6D4';
        ctx.shadowBlur = 20 + 5 * Math.sin(t * 2);
        ctx.font = 'bold 42px monospace';
        ctx.fillStyle = '#06B6D4';
        ctx.fillText('MISSILE', W / 2, H * 0.28);
        ctx.font = 'bold 38px monospace';
        ctx.fillStyle = '#A855F7';
        ctx.shadowColor = '#A855F7';
        ctx.fillText('COMMAND', W / 2, H * 0.36);
        ctx.shadowBlur = 0;
        ctx.restore();
        // Subtitle
        ctx.font = '13px monospace';
        ctx.fillStyle = '#94A3B8';
        ctx.textAlign = 'center';
        ctx.fillText('Defend your cities!', W / 2, H * 0.44);
        // Instructions
        const blink = Math.sin(t * 3) > 0;
        if (blink) {
            ctx.font = 'bold 16px monospace';
            ctx.fillStyle = '#22D3EE';
            ctx.fillText('TAP TO DEFEND!', W / 2, H * 0.58);
        }
        // Controls info
        ctx.font = '11px monospace';
        ctx.fillStyle = '#64748B';
        ctx.fillText('Click/Tap to fire missiles', W / 2, H * 0.66);
        ctx.fillText('Destroy incoming threats', W / 2, H * 0.70);
        ctx.fillText('Protect your cities!', W / 2, H * 0.74);
        // Draw some sample cities for the title
        drawTitleCities();
    }

    function drawTitleCities() {
        const gy = H - GROUND_H;
        const t = Date.now() * 0.001;
        const sampleX = [W * 0.15, W * 0.35, W * 0.55, W * 0.75, W * 0.9];
        const sampleColors = ['#F43F5E', '#3B82F6', '#22C55E', '#EC4899', '#A855F7'];
        sampleX.forEach((x, i) => {
            // City ground glow
            const cg = ctx.createRadialGradient(x, gy, 0, x, gy, 25);
            cg.addColorStop(0, sampleColors[i] + '15');
            cg.addColorStop(1, 'transparent');
            ctx.fillStyle = cg;
            ctx.beginPath(); ctx.arc(x, gy, 25, 0, Math.PI * 2); ctx.fill();

            for (let b = 0; b < 3; b++) {
                const bw = 10, bh = 18 + b * 9;
                const bx = x + (b - 1) * 12 - bw / 2;
                const by = gy - bh;
                // Shadow
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.fillRect(bx + 1, by + 1, bw, bh);
                // Building
                ctx.fillStyle = sampleColors[i];
                ctx.globalAlpha = 0.65;
                ctx.fillRect(bx, by, bw, bh);
                // Windows
                ctx.globalAlpha = 0.5;
                for (let wy = by + 4; wy < gy - 4; wy += 6) {
                    for (let wx = bx + 2; wx < bx + bw - 2; wx += 5) {
                        const wSeed = (i * 30 + b * 10 + Math.floor(wx) * 7 + Math.floor(wy) * 3) % 100;
                        if (wSeed > 30) {
                            const flicker = wSeed % 15 < 3 ? 0.4 + 0.6 * Math.sin(t * 2 + wSeed) : 0.8;
                            ctx.fillStyle = `rgba(254,240,138,${(flicker * 0.8).toFixed(2)})`;
                            ctx.fillRect(wx, wy, 2, 2.5);
                        }
                    }
                }
            }
        });
        ctx.globalAlpha = 1;
    }

    function drawWaveIntro() {
        const t = Date.now() * 0.001;
        // Dramatic dark overlay
        const introAlpha = Math.min(1, stateTimer / 1500) * 0.5;
        ctx.fillStyle = `rgba(0,0,0,${introAlpha.toFixed(2)})`;
        ctx.fillRect(0, 0, W, H);

        // Horizontal scan lines
        ctx.fillStyle = 'rgba(6,182,212,0.03)';
        for (let y = 0; y < H; y += 4) {
            ctx.fillRect(0, y, W, 1);
        }

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // WAVE number — large with glow
        ctx.shadowColor = '#06B6D4';
        ctx.shadowBlur = 25 + 10 * Math.sin(t * 3);
        ctx.font = 'bold 42px monospace';
        ctx.fillStyle = '#06B6D4';
        const scale = 1 + 0.06 * Math.sin(t * 4);
        ctx.translate(W / 2, H * 0.37);
        ctx.scale(scale, scale);
        ctx.fillText('WAVE ' + wave, 0, 0);
        ctx.restore();

        // Decorative line under title
        const lineW = 120 + 20 * Math.sin(t * 2);
        const lineGrad = ctx.createLinearGradient(W / 2 - lineW / 2, 0, W / 2 + lineW / 2, 0);
        lineGrad.addColorStop(0, 'transparent');
        lineGrad.addColorStop(0.3, 'rgba(6,182,212,0.6)');
        lineGrad.addColorStop(0.5, 'rgba(6,182,212,0.9)');
        lineGrad.addColorStop(0.7, 'rgba(6,182,212,0.6)');
        lineGrad.addColorStop(1, 'transparent');
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(W / 2 - lineW / 2, H * 0.43);
        ctx.lineTo(W / 2 + lineW / 2, H * 0.43);
        ctx.stroke();

        // Warning subtitles
        let warningText = '', warningColor = '';
        if (wave === 3) { warningText = 'WARNING: MIRVs incoming!'; warningColor = '#FBBF24'; }
        else if (wave === 4) { warningText = 'WARNING: Bombers spotted!'; warningColor = '#F97316'; }
        else if (wave === 5) { warningText = 'WARNING: Smart bombs detected!'; warningColor = '#EF4444'; }
        else if (wave >= 6) { warningText = 'WARNING: Satellites overhead!'; warningColor = '#A855F7'; }

        if (warningText) {
            const warnAlpha = 0.5 + 0.5 * Math.sin(t * 5);
            ctx.save();
            ctx.font = 'bold 13px monospace';
            ctx.fillStyle = warningColor;
            ctx.globalAlpha = warnAlpha;
            ctx.textAlign = 'center';
            ctx.shadowColor = warningColor;
            ctx.shadowBlur = 10;
            ctx.fillText(warningText, W / 2, H * 0.50);
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        // City count
        const alive = cities.filter(c => c.alive).length;
        ctx.font = '11px monospace';
        ctx.fillStyle = '#64748B';
        ctx.textAlign = 'center';
        ctx.fillText(alive + ' cities standing', W / 2, H * 0.57);
    }

    function drawWaveEnd() {
        const t = Date.now() * 0.001;

        // Subtle dark overlay
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Title with glow
        ctx.shadowColor = '#22D3EE';
        ctx.shadowBlur = 15;
        ctx.font = 'bold 26px monospace';
        ctx.fillStyle = '#22D3EE';
        ctx.fillText('WAVE ' + wave + ' COMPLETE', W / 2, H * 0.28);
        ctx.shadowBlur = 0;

        // Decorative line
        const lw = 160;
        const lg = ctx.createLinearGradient(W / 2 - lw / 2, 0, W / 2 + lw / 2, 0);
        lg.addColorStop(0, 'transparent');
        lg.addColorStop(0.5, 'rgba(34,211,238,0.5)');
        lg.addColorStop(1, 'transparent');
        ctx.strokeStyle = lg;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W / 2 - lw / 2, H * 0.33);
        ctx.lineTo(W / 2 + lw / 2, H * 0.33);
        ctx.stroke();

        ctx.font = '15px monospace';
        let y = H * 0.39;
        if (waveEndPhase >= 1) {
            ctx.fillStyle = '#34D399';
            const cityText = 'Cities Saved: ' + waveBonusCities + ' x ' + (100 * wave) + ' = ' + (waveBonusCities * 100 * wave);
            ctx.shadowColor = '#34D399';
            ctx.shadowBlur = 5;
            ctx.fillText(cityText, W / 2, y);
            ctx.shadowBlur = 0;
            y += 30;
        }
        if (waveEndPhase >= 2) {
            ctx.fillStyle = '#60A5FA';
            ctx.shadowColor = '#60A5FA';
            ctx.shadowBlur = 5;
            ctx.fillText('Ammo Bonus: ' + waveBonusAmmo + ' x 5 = ' + (waveBonusAmmo * 5), W / 2, y);
            ctx.shadowBlur = 0;
            y += 30;
        }
        if (waveEndPhase >= 3) {
            const total = waveBonusCities * 100 * wave + waveBonusAmmo * 5;
            ctx.font = 'bold 20px monospace';
            ctx.fillStyle = '#FBBF24';
            ctx.shadowColor = '#FBBF24';
            ctx.shadowBlur = 12 + 4 * Math.sin(t * 3);
            ctx.fillText('TOTAL BONUS: ' + total, W / 2, y);
            ctx.shadowBlur = 0;
        }
        ctx.restore();
    }

    function drawGameOver() {
        // Dim overlay
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, W, H);

        const t = Date.now() * 0.001;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // THE END
        ctx.shadowColor = '#EF4444';
        ctx.shadowBlur = 20;
        ctx.font = 'bold 48px monospace';
        ctx.fillStyle = '#EF4444';
        ctx.fillText('THE END', W / 2, H * 0.28);
        ctx.shadowBlur = 0;
        // Stats
        ctx.font = '16px monospace';
        ctx.fillStyle = '#E2E8F0';
        ctx.fillText('Final Score: ' + score.toLocaleString(), W / 2, H * 0.42);
        ctx.fillStyle = '#94A3B8';
        ctx.font = '14px monospace';
        ctx.fillText('Wave Reached: ' + wave, W / 2, H * 0.48);
        ctx.fillText('Missiles Destroyed: ' + totalMissilesDestroyed, W / 2, H * 0.53);
        ctx.fillText('Max Chain: ' + maxChainReaction, W / 2, H * 0.58);
        const citiesSaved = cities.filter(c => c.alive).length;
        ctx.fillText('Cities Saved: ' + citiesSaved, W / 2, H * 0.63);
        // Restart prompt
        const blink = Math.sin(t * 3) > 0;
        if (blink) {
            ctx.font = 'bold 14px monospace';
            ctx.fillStyle = '#22D3EE';
            ctx.fillText('TAP TO PLAY AGAIN', W / 2, H * 0.75);
        }
        ctx.restore();
    }

    // ── State Transitions ──
    function startGame() {
        score = 0; wave = 1;
        totalMissilesDestroyed = 0; maxChainReaction = 0;
        bonusCityThreshold = BONUS_CITY_SCORE;
        startTime = Date.now();
        gameActive = true;
        initCities();
        initBatteries();
        resetWaveEntities();
        demoExplosions = [];
        startWaveIntro();
    }

    function startWaveIntro() {
        state = STATES.WAVE_INTRO;
        stateTimer = 2000;
        resetWaveEntities();
        playWaveStart();
    }

    // ── Game Loop ──
    function gameLoop(timestamp) {
        if (!frameId && frameId !== 0) return; // destroyed
        if (!__allSpritesReady) {
            __drawLoadingScreen(canvas, ctx, 'MOLLY CONTROL', '#F43F5E');
            frameId = requestAnimationFrame(gameLoop);
            return;
        }
        const dt = lastTime ? Math.min(timestamp - lastTime, 50) : 16;
        lastTime = timestamp;
        update(dt);
        draw();
        frameId = requestAnimationFrame(gameLoop);
    }

    // ── Input ──
    function handleMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        const pos = canvasToGame(e.clientX - rect.left, e.clientY - rect.top);
        mouseX = pos.x; mouseY = pos.y;
    }

    function handleMouseDown(e) {
        e.preventDefault();
        ensureAudio();
        const rect = canvas.getBoundingClientRect();
        const pos = canvasToGame(e.clientX - rect.left, e.clientY - rect.top);
        handleClick(pos.x, pos.y);
    }

    function handleTouchStart(e) {
        e.preventDefault();
        ensureAudio();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const pos = canvasToGame(touch.clientX - rect.left, touch.clientY - rect.top);
        mouseX = pos.x; mouseY = pos.y;
        handleClick(pos.x, pos.y);
    }

    function handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const pos = canvasToGame(touch.clientX - rect.left, touch.clientY - rect.top);
        mouseX = pos.x; mouseY = pos.y;
    }

    function handleKeyDown(e) {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (state === STATES.TITLE || state === STATES.GAME_OVER) {
                startGame();
            }
        }
        if (e.key === '1') selectedBattery = 0;
        else if (e.key === '2') selectedBattery = 1;
        else if (e.key === '3') selectedBattery = 2;
        else selectedBattery = -1;
    }

    function handleClick(x, y) {
        if (state === STATES.TITLE) {
            startGame();
            return;
        }
        if (state === STATES.GAME_OVER) {
            startGame();
            return;
        }
        if (state === STATES.PLAYING) {
            // Don't fire if clicking ground area
            if (y < H - GROUND_H - 20) {
                firePlayerMissile(x, y);
            }
            selectedBattery = -1;
        }
    }

    // ── Resize ──
    function handleResize() {
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const aspect = W / H;
        let drawW, drawH;
        if (cw / ch > aspect) {
            drawH = ch;
            drawW = ch * aspect;
        } else {
            drawW = cw;
            drawH = cw / aspect;
        }
        canvas.style.width = drawW + 'px';
        canvas.style.height = drawH + 'px';
        canvas.width = W;
        canvas.height = H;
        scaleX = W / drawW;
        scaleY = H / drawH;
    }

    // ── Public API ──
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer;
        onGameOver = gameOverCallback;

        canvas.width = W;
        canvas.height = H;

        // Load player theme
        const themeId = activePlayer?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            CITY_COLORS    = _t.colors.slice(0, 6);
            EXPLODE_COLORS = [..._t.colors.slice(0, 6), ArcadeThemes.lighten(_t.colors[0], 30)];
            skyGrad        = [_t.bgGradient[0], _t.bgGradient[1], _t.bgGradient[0]];
        }

        handleResize();
        // Re-resize after layout settles (container may not have final dimensions yet)
        requestAnimationFrame(() => { handleResize(); requestAnimationFrame(handleResize); });

        initStars();
        initCities();
        initBatteries();

        state = STATES.TITLE;
        gameActive = false;
        score = 0; wave = 0;
        lastTime = 0;
        demoExplosions = [];
        demoTimer = 0;

        // Bind events
        boundMouseMove = handleMouseMove.bind(this);
        boundMouseDown = handleMouseDown.bind(this);
        boundTouchStart = handleTouchStart.bind(this);
        boundTouchMove = handleTouchMove.bind(this);
        boundKeyDown = handleKeyDown.bind(this);
        boundResize = handleResize.bind(this);

        canvas.addEventListener('mousemove', boundMouseMove);
        canvas.addEventListener('mousedown', boundMouseDown);
        canvas.addEventListener('touchstart', boundTouchStart, { passive: false });
        canvas.addEventListener('touchmove', boundTouchMove, { passive: false });
        document.addEventListener('keydown', boundKeyDown);
        window.addEventListener('resize', boundResize);

        canvas.style.cursor = 'none';
        __loadSprites(null);
        frameId = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = null;
        gameActive = false;
        if (canvas) {
            canvas.removeEventListener('mousemove', boundMouseMove);
            canvas.removeEventListener('mousedown', boundMouseDown);
            canvas.removeEventListener('touchstart', boundTouchStart);
            canvas.removeEventListener('touchmove', boundTouchMove);
            canvas.style.cursor = '';
        }
        document.removeEventListener('keydown', boundKeyDown);
        window.removeEventListener('resize', boundResize);
        if (audioCtx) {
            audioCtx.close().catch(() => {});
            audioCtx = null;
        }
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return wave; },
        isActive() { return gameActive; }
    };
})();
