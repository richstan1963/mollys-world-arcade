/* MollyControl — Theme-aware Missile Command for Your World Arcade */
window.MollyControl = (() => {
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
        spawnParticles(c.x, H - GROUND_H - 5, 8, c.color);
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
        if (state === STATES.GAME_OVER) { updateParticles(dt); return; }

        // PLAYING
        updateSpawning(dt);
        updateEnemyMissiles(dt);
        updatePlayerMissiles(dt);
        updateExplosions(dt);
        updateBombers(dt);
        updateSatellites(dt);
        updateParticles(dt);
        checkCollisions();
        checkBonusCity();
        checkWaveComplete();
        checkGameOver();
    }

    function updateTitle(dt) {
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
        ctx.clearRect(0, 0, W, H);
        drawBackground();
        drawStars();

        if (state === STATES.TITLE) { drawTitle(); return; }
        if (state === STATES.GAME_OVER) { drawGame(); drawGameOver(); return; }
        if (state === STATES.WAVE_INTRO) { drawGame(); drawWaveIntro(); return; }
        if (state === STATES.WAVE_END) { drawGame(); drawWaveEnd(); return; }
        drawGame();
    }

    function drawBackground() {
        const grd = ctx.createLinearGradient(0, 0, 0, H);
        grd.addColorStop(0, skyGrad[0]);
        grd.addColorStop(0.7, skyGrad[1]);
        grd.addColorStop(1, skyGrad[2]);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, H);
        // Ground
        const gy = H - GROUND_H;
        const gg = ctx.createLinearGradient(0, gy, 0, H);
        gg.addColorStop(0, '#2d2d4e');
        gg.addColorStop(1, '#1a1a2e');
        ctx.fillStyle = gg;
        ctx.fillRect(0, gy, W, GROUND_H);
        // Ground line
        ctx.strokeStyle = '#4a4a6e';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    function drawStars() {
        const t = Date.now() * 0.001;
        stars.forEach(s => {
            const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.twinkleSpeed * 60 + s.brightness * 10));
            ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
            ctx.fillRect(s.x, s.y, s.size, s.size);
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
        cities.forEach(c => {
            if (c.alive) {
                c.buildings.forEach(b => {
                    const bx = c.x + b.rx - b.w / 2;
                    const by = gy - b.h;
                    ctx.fillStyle = b.color;
                    ctx.globalAlpha = b.shade;
                    ctx.fillRect(bx, by, b.w, b.h);
                    // Window dots
                    ctx.fillStyle = '#fef9c3';
                    ctx.globalAlpha = 0.7 * b.shade;
                    for (let wy = by + 5; wy < gy - 4; wy += 7) {
                        for (let wx = bx + 3; wx < bx + b.w - 3; wx += 5) {
                            if (Math.random() > 0.3) ctx.fillRect(wx, wy, 2, 2);
                        }
                    }
                    ctx.globalAlpha = 1;
                });
            } else {
                // Rubble
                c.rubble.forEach(r => {
                    ctx.fillStyle = r.color;
                    ctx.globalAlpha = 0.5;
                    ctx.fillRect(c.x + r.rx, gy - 3 + r.ry, r.size, r.size * 0.6);
                });
                ctx.globalAlpha = 1;
            }
        });
    }

    function drawBatteries() {
        const gy = H - GROUND_H;
        batteries.forEach((b, idx) => {
            // Base triangle
            ctx.fillStyle = '#06B6D4';
            ctx.beginPath();
            ctx.moveTo(b.x - 14, gy);
            ctx.lineTo(b.x + 14, gy);
            ctx.lineTo(b.x, gy - 12);
            ctx.closePath();
            ctx.fill();
            // Ammo dots
            const dotSize = 3;
            const cols = 5;
            for (let a = 0; a < b.ammo; a++) {
                const col = a % cols;
                const row = Math.floor(a / cols);
                const dx = (col - 2) * (dotSize + 1);
                const dy = -(row + 1) * (dotSize + 1) - 14;
                ctx.fillStyle = '#22D3EE';
                ctx.fillRect(b.x + dx - dotSize / 2, gy + dy, dotSize, dotSize);
            }
            // Ammo text
            ctx.fillStyle = '#94A3B8';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(b.ammo.toString(), b.x, gy + 14);
        });
    }

    function drawEnemyMissiles() {
        enemyMissiles.forEach(m => {
            // Trail
            if (m.trail.length > 1) {
                for (let t = 1; t < m.trail.length; t++) {
                    const alpha = (t / m.trail.length) * 0.6;
                    ctx.strokeStyle = `rgba(239,68,68,${alpha.toFixed(2)})`;
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.moveTo(m.trail[t - 1].x, m.trail[t - 1].y);
                    ctx.lineTo(m.trail[t].x, m.trail[t].y);
                    ctx.stroke();
                }
            }
            // Head
            ctx.fillStyle = m.smart ? '#FBBF24' : '#EF4444';
            ctx.beginPath();
            ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
            // MIRV indicator
            if (m.mirv && !m.mirvDone) {
                ctx.strokeStyle = 'rgba(251,191,36,0.5)';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
                ctx.stroke();
            }
        });
    }

    function drawPlayerMissiles() {
        playerMissiles.forEach(m => {
            // Trail
            if (m.trail.length > 1) {
                for (let t = 1; t < m.trail.length; t++) {
                    const alpha = (t / m.trail.length) * 0.8;
                    ctx.strokeStyle = `rgba(6,182,212,${alpha.toFixed(2)})`;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(m.trail[t - 1].x, m.trail[t - 1].y);
                    ctx.lineTo(m.trail[t].x, m.trail[t].y);
                    ctx.stroke();
                }
            }
            // Head
            ctx.fillStyle = '#06B6D4';
            ctx.beginPath();
            ctx.arc(m.x, m.y, 2, 0, Math.PI * 2);
            ctx.fill();
            // Target crosshair
            ctx.strokeStyle = 'rgba(6,182,212,0.3)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.arc(m.tx, m.ty, 8, 0, Math.PI * 2);
            ctx.stroke();
        });
    }

    function drawExplosions() {
        explosions.forEach(e => {
            if (e.r <= 0) return;
            // Outer glow
            const glowR = e.r * 1.5;
            const glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, glowR);
            glow.addColorStop(0, e.color + '40');
            glow.addColorStop(1, 'transparent');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(e.x, e.y, glowR, 0, Math.PI * 2);
            ctx.fill();
            // Core explosion
            const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);
            const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.015);
            grad.addColorStop(0, '#FFFFFF');
            grad.addColorStop(0.3, e.color);
            grad.addColorStop(0.7, e.color + 'AA');
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.globalAlpha = pulse;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            // Ring
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r * 0.8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        });
    }

    function drawBombers(list) {
        bombers.forEach(b => {
            if (!b.alive) return;
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
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha;
            ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
        });
        ctx.globalAlpha = 1;
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
        // Demo explosions
        demoExplosions.forEach(e => {
            if (e.r <= 0) return;
            const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);
            grad.addColorStop(0, '#FFFFFF80');
            grad.addColorStop(0.4, e.color + '80');
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
        // Draw a few sample candy buildings
        const sampleX = [W * 0.2, W * 0.4, W * 0.6, W * 0.8];
        const sampleColors = ['#F43F5E', '#3B82F6', '#22C55E', '#EC4899'];
        sampleX.forEach((x, i) => {
            for (let b = 0; b < 3; b++) {
                const bw = 10, bh = 15 + b * 8;
                ctx.fillStyle = sampleColors[i];
                ctx.globalAlpha = 0.6;
                ctx.fillRect(x + (b - 1) * 12 - bw / 2, gy - bh, bw, bh);
            }
        });
        ctx.globalAlpha = 1;
    }

    function drawWaveIntro() {
        const t = Date.now() * 0.001;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#06B6D4';
        ctx.shadowBlur = 15;
        ctx.font = 'bold 36px monospace';
        ctx.fillStyle = '#06B6D4';
        const scale = 1 + 0.05 * Math.sin(t * 4);
        ctx.translate(W / 2, H * 0.4);
        ctx.scale(scale, scale);
        ctx.fillText('WAVE ' + wave, 0, 0);
        ctx.restore();
        // Subtitle
        if (wave >= 3 && wave < 4) {
            ctx.font = '12px monospace';
            ctx.fillStyle = '#FBBF24';
            ctx.textAlign = 'center';
            ctx.fillText('WARNING: MIRVs incoming!', W / 2, H * 0.48);
        } else if (wave === 4) {
            ctx.font = '12px monospace';
            ctx.fillStyle = '#F97316';
            ctx.textAlign = 'center';
            ctx.fillText('WARNING: Bombers spotted!', W / 2, H * 0.48);
        } else if (wave === 5) {
            ctx.font = '12px monospace';
            ctx.fillStyle = '#EF4444';
            ctx.textAlign = 'center';
            ctx.fillText('WARNING: Smart bombs detected!', W / 2, H * 0.48);
        } else if (wave === 6) {
            ctx.font = '12px monospace';
            ctx.fillStyle = '#A855F7';
            ctx.textAlign = 'center';
            ctx.fillText('WARNING: Satellites overhead!', W / 2, H * 0.48);
        }
    }

    function drawWaveEnd() {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 24px monospace';
        ctx.fillStyle = '#22D3EE';
        ctx.fillText('WAVE ' + wave + ' COMPLETE', W / 2, H * 0.3);

        ctx.font = '16px monospace';
        let y = H * 0.4;
        if (waveEndPhase >= 1) {
            ctx.fillStyle = '#34D399';
            ctx.fillText('Cities Saved: ' + waveBonusCities + ' x ' + (100 * wave) + ' = ' + (waveBonusCities * 100 * wave), W / 2, y);
            y += 28;
        }
        if (waveEndPhase >= 2) {
            ctx.fillStyle = '#60A5FA';
            ctx.fillText('Ammo Bonus: ' + waveBonusAmmo + ' x 5 = ' + (waveBonusAmmo * 5), W / 2, y);
            y += 28;
        }
        if (waveEndPhase >= 3) {
            ctx.fillStyle = '#FBBF24';
            ctx.font = 'bold 18px monospace';
            const total = waveBonusCities * 100 * wave + waveBonusAmmo * 5;
            ctx.fillText('TOTAL BONUS: ' + total, W / 2, y);
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
