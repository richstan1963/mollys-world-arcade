/* Rail Blaster — On-rails FPS with Kenney CC0 sprites for Your World Arcade
   Time Crisis / House of the Dead style: crosshair aim, depth-scaling enemies,
   duck-for-cover mechanic, multi-environment campaign */
window.RailBlaster = (() => {
    // ── Sprite Atlas (Kenney CC0) ──
    const __sprites = {};
    let __spritesLoaded = 0, __spritesTotal = 0, __allSpritesReady = false;
    const __SPRITE_MANIFEST = {
        soldier: '/img/game-assets/kenney-platform/enemies/slimeGreen.png',
        soldierMove: '/img/game-assets/kenney-platform/enemies/slimeGreen_move.png',
        drone: '/img/game-assets/kenney-space/enemies/enemyBlue2.png',
        shieldEnemy: '/img/game-assets/kenney-platform/enemies/snail.png',
        sniper: '/img/game-assets/kenney-platform/enemies/wormGreen.png',
        boss: '/img/game-assets/kenney-space/enemies/enemyGreen5.png',
        cover: '/img/game-assets/kenney-tiles/tileBlue_08.png',
        muzzleFlash: '/img/game-assets/kenney-platform/particles/fireball.png',
        bullet: '/img/game-assets/kenney-space/lasers/laserRed01.png',
        particle1: '/img/game-assets/kenney-particles/particleWhite_1.png',
        particle2: '/img/game-assets/kenney-particles/particleWhite_5.png',
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


    // ── Design Constants ──
    const GAME_W = 640, GAME_H = 480;
    const VP_X = GAME_W / 2, VP_Y = GAME_H * 0.38; // vanishing point

    // Player
    const MAX_HP = 5;
    const MAX_AMMO = 6;
    const RELOAD_MS = 1000;
    const DUCK_COOLDOWN = 300;
    const INVULN_MS = 500;

    // Depth
    const DEPTH_FAR = 0.15;   // smallest scale (far away)
    const DEPTH_NEAR = 1.0;   // full scale (in your face)
    const DEPTH_ATTACK = 0.85; // enemies attack at this depth

    // Enemy types
    const EN_SOLDIER = 0, EN_DRONE = 1, EN_SHIELD = 2, EN_SNIPER = 3, EN_BOSS = 4;
    const EN_NAMES = ['Soldier', 'Drone', 'Shield', 'Sniper', 'Boss'];
    const EN_HP = [1, 1, 2, 1, 12];
    const EN_SPEED = [0.0025, 0.005, 0.002, 0.003, 0.0015];
    const EN_SCORES = [100, 150, 200, 250, 500];
    const EN_W = [32, 24, 36, 28, 64];
    const EN_H = [48, 20, 52, 44, 80];
    const HEADSHOT_BONUS = 50;

    // Environments
    const ENV_CITY = 0, ENV_WAREHOUSE = 1, ENV_ROOFTOP = 2, ENV_LAIR = 3;
    const ENV_NAMES = ['City Streets', 'Warehouse', 'Rooftop', 'Villain\'s Lair'];
    const ENV_COLORS = [
        { sky: '#1a1a2e', ground: '#2d2d44', accent: '#e94560', buildings: ['#16213e','#1a1a2e','#0f3460'] },
        { sky: '#1c1c1c', ground: '#3a2f24', accent: '#c77d32', buildings: ['#2a2218','#332b20','#1f1a14'] },
        { sky: '#0b0b3b', ground: '#2a2a5a', accent: '#7b68ee', buildings: ['#1a1a4e','#252560','#0e0e35'] },
        { sky: '#0a0a0a', ground: '#1a0a2e', accent: '#ff0066', buildings: ['#1a0020','#200030','#0d0018'] }
    ];

    // Game states
    const ST_TITLE = 0, ST_PLAYING = 1, ST_LEVEL_INTRO = 2, ST_DYING = 3,
          ST_GAMEOVER = 4, ST_LEVEL_CLEAR = 5, ST_BOSS_INTRO = 6;

    // ── State variables ──
    let canvas, ctx, audioCtx;
    let W, H, SCALE, DPR;
    let animFrame, lastTime, state;
    let score, level, hp, ammo, combo, maxCombo;
    let gameActive, frameCount;
    let gameOverCB, activePlayer;
    let screenShake, screenShakeDecay;

    // Crosshair
    let crossX, crossY;  // game coords
    let mouseX, mouseY;  // raw canvas coords
    let crossOverEnemy;

    // Duck
    let ducking, duckTimer, duckY;  // duckY: 0=standing, 1=fully ducked
    let lastDuckTime;

    // Reload
    let reloading, reloadTimer;

    // Shooting effects
    let muzzleFlash, muzzleTimer;
    let shotsFired, shotsHit;

    // Enemies
    let enemies, enemyBullets;
    let spawnTimer, spawnInterval;
    let enemiesKilled, enemiesToSpawn, bossSpawned;

    // Particles, popups
    let particles, scorePopups;

    // Environment parallax
    let envId, envScroll;

    // Cover objects (foreground)
    let coverObjects;

    // Level / wave management
    let waveEnemies, totalWaveEnemies, levelKillTarget;
    let introTimer, clearTimer, bossIntroTimer;
    let deathTimer;

    // Invulnerability
    let invulnTimer;

    // Theme
    let themeColors;

    // Input
    let inputBound = false;

    // ══════════════════════════════════════════════
    //  AUDIO
    // ══════════════════════════════════════════════
    function ensureAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch { audioCtx = null; }
        }
        return audioCtx;
    }

    function playSound(type) {
        const ac = ensureAudio();
        if (!ac) return;
        try {
            const now = ac.currentTime;
            const g = ac.createGain();
            g.connect(ac.destination);
            if (type === 'shoot') {
                g.gain.setValueAtTime(0.15, now);
                g.gain.exponentialDecayTo?.(0.01, now + 0.15) || g.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                const o = ac.createOscillator();
                o.type = 'sawtooth';
                o.frequency.setValueAtTime(200, now);
                o.frequency.exponentialRampToValueAtTime(80, now + 0.1);
                o.connect(g);
                o.start(now);
                o.stop(now + 0.15);
                // Add noise burst
                const n = ac.createBufferSource();
                const buf = ac.createBuffer(1, ac.sampleRate * 0.08, ac.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
                n.buffer = buf;
                const ng = ac.createGain();
                ng.gain.setValueAtTime(0.2, now);
                ng.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
                n.connect(ng).connect(ac.destination);
                n.start(now);
            } else if (type === 'hit') {
                g.gain.setValueAtTime(0.12, now);
                g.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                const o = ac.createOscillator();
                o.type = 'square';
                o.frequency.setValueAtTime(600, now);
                o.frequency.exponentialRampToValueAtTime(200, now + 0.15);
                o.connect(g);
                o.start(now);
                o.stop(now + 0.2);
            } else if (type === 'kill') {
                g.gain.setValueAtTime(0.15, now);
                g.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
                const o = ac.createOscillator();
                o.type = 'square';
                o.frequency.setValueAtTime(800, now);
                o.frequency.exponentialRampToValueAtTime(100, now + 0.3);
                o.connect(g);
                o.start(now);
                o.stop(now + 0.35);
            } else if (type === 'reload') {
                for (let i = 0; i < 3; i++) {
                    const og = ac.createGain();
                    og.gain.setValueAtTime(0.06, now + i * 0.08);
                    og.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.06);
                    og.connect(ac.destination);
                    const o = ac.createOscillator();
                    o.type = 'sine';
                    o.frequency.setValueAtTime(400 + i * 200, now + i * 0.08);
                    o.connect(og);
                    o.start(now + i * 0.08);
                    o.stop(now + i * 0.08 + 0.06);
                }
            } else if (type === 'hurt') {
                g.gain.setValueAtTime(0.2, now);
                g.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
                const o = ac.createOscillator();
                o.type = 'sawtooth';
                o.frequency.setValueAtTime(150, now);
                o.frequency.exponentialRampToValueAtTime(50, now + 0.35);
                o.connect(g);
                o.start(now);
                o.stop(now + 0.4);
            } else if (type === 'duck') {
                g.gain.setValueAtTime(0.08, now);
                g.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                const o = ac.createOscillator();
                o.type = 'sine';
                o.frequency.setValueAtTime(300, now);
                o.frequency.exponentialRampToValueAtTime(150, now + 0.1);
                o.connect(g);
                o.start(now);
                o.stop(now + 0.1);
            } else if (type === 'empty') {
                g.gain.setValueAtTime(0.1, now);
                g.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
                const o = ac.createOscillator();
                o.type = 'triangle';
                o.frequency.setValueAtTime(100, now);
                o.connect(g);
                o.start(now);
                o.stop(now + 0.08);
            } else if (type === 'boss') {
                for (let i = 0; i < 5; i++) {
                    const og = ac.createGain();
                    og.gain.setValueAtTime(0.08, now + i * 0.15);
                    og.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.12);
                    og.connect(ac.destination);
                    const o = ac.createOscillator();
                    o.type = 'sawtooth';
                    o.frequency.setValueAtTime(80 + i * 30, now + i * 0.15);
                    o.connect(og);
                    o.start(now + i * 0.15);
                    o.stop(now + i * 0.15 + 0.12);
                }
            } else if (type === 'levelup') {
                const notes = [523, 659, 784, 1047];
                for (let i = 0; i < notes.length; i++) {
                    const og = ac.createGain();
                    og.gain.setValueAtTime(0.1, now + i * 0.12);
                    og.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + 0.3);
                    og.connect(ac.destination);
                    const o = ac.createOscillator();
                    o.type = 'sine';
                    o.frequency.setValueAtTime(notes[i], now + i * 0.12);
                    o.connect(og);
                    o.start(now + i * 0.12);
                    o.stop(now + i * 0.12 + 0.3);
                }
            }
        } catch {}
    }

    // ══════════════════════════════════════════════
    //  UTILITY
    // ══════════════════════════════════════════════
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const gs = v => v * SCALE;

    // Depth to screen Y (higher depth = closer = lower on screen above cover)
    function depthToY(depth) {
        return lerp(VP_Y, GAME_H * 0.75, (depth - DEPTH_FAR) / (DEPTH_NEAR - DEPTH_FAR));
    }

    // Scale factor for a given depth
    function depthScale(depth) {
        return lerp(0.2, 1.0, (depth - DEPTH_FAR) / (DEPTH_NEAR - DEPTH_FAR));
    }

    // ══════════════════════════════════════════════
    //  ENVIRONMENT RENDERING
    // ══════════════════════════════════════════════
    function drawEnvironment() {
        const env = ENV_COLORS[envId] || ENV_COLORS[0];
        const px = (crossX - VP_X) * 0.02;  // parallax offset from crosshair
        const py = (crossY - VP_Y) * 0.01;

        // Sky gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, gs(GAME_H * 0.6));
        skyGrad.addColorStop(0, env.sky);
        skyGrad.addColorStop(1, env.ground);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, W, H);

        // Perspective grid lines (floor)
        ctx.strokeStyle = env.accent + '18';
        ctx.lineWidth = gs(1);
        const floorTop = gs(VP_Y + 30);
        for (let i = 0; i < 12; i++) {
            const t = i / 11;
            const y = lerp(floorTop, H, t * t);
            ctx.beginPath();
            ctx.moveTo(0, y + gs(py));
            ctx.lineTo(W, y + gs(py));
            ctx.stroke();
        }
        // Converging lines
        for (let i = -5; i <= 5; i++) {
            const bx = gs(VP_X + px) + i * gs(120);
            ctx.beginPath();
            ctx.moveTo(gs(VP_X + px), gs(VP_Y + py));
            ctx.lineTo(bx, H);
            ctx.stroke();
        }

        // Background buildings/structures
        drawBuildings(env, px, py);

        // Vanishing point glow
        const vpGlow = ctx.createRadialGradient(gs(VP_X + px), gs(VP_Y + py), 0, gs(VP_X + px), gs(VP_Y + py), gs(80));
        vpGlow.addColorStop(0, env.accent + '30');
        vpGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = vpGlow;
        ctx.fillRect(0, 0, W, H);
    }

    function drawBuildings(env, px, py) {
        const buildings = env.buildings;
        // Far buildings (depth ~0.2-0.3)
        for (let i = 0; i < 8; i++) {
            const bx = (i - 3.5) * 95 + VP_X;
            const bw = rand(40, 70);
            const bh = rand(60, 140);
            const sc = 0.25;
            const sx = gs(lerp(VP_X + px * 0.5, bx, sc));
            const sy = gs(VP_Y + py * 0.3) - gs(bh * sc);
            ctx.fillStyle = buildings[i % buildings.length] + 'cc';
            ctx.fillRect(sx - gs(bw * sc / 2), sy, gs(bw * sc), gs(bh * sc));
            // Windows
            ctx.fillStyle = env.accent + '20';
            const winRows = Math.floor(bh / 15);
            const winCols = Math.floor(bw / 15);
            for (let r = 0; r < winRows; r++) {
                for (let c = 0; c < winCols; c++) {
                    if (Math.random() > 0.5) {
                        ctx.fillStyle = ((r + c + frameCount) % 7 < 2) ? '#ffff8822' : env.accent + '15';
                        ctx.fillRect(
                            sx - gs(bw * sc / 2) + gs((c + 0.3) * 15 * sc),
                            sy + gs((r + 0.3) * 15 * sc),
                            gs(8 * sc), gs(8 * sc)
                        );
                    }
                }
            }
        }

        // Environment-specific details
        if (envId === ENV_CITY) {
            drawCityDetails(px, py);
        } else if (envId === ENV_WAREHOUSE) {
            drawWarehouseDetails(px, py);
        } else if (envId === ENV_ROOFTOP) {
            drawRooftopDetails(px, py);
        } else if (envId === ENV_LAIR) {
            drawLairDetails(px, py);
        }
    }

    function drawCityDetails(px, py) {
        // Street lamps
        for (let i = -2; i <= 2; i++) {
            const x = VP_X + i * 140;
            const sc = 0.4;
            ctx.strokeStyle = '#555';
            ctx.lineWidth = gs(2 * sc);
            ctx.beginPath();
            ctx.moveTo(gs(x + px * 0.3), gs(VP_Y + 80));
            ctx.lineTo(gs(x + px * 0.3), gs(VP_Y + 30));
            ctx.stroke();
            ctx.fillStyle = '#ff884422';
            ctx.beginPath();
            ctx.arc(gs(x + px * 0.3), gs(VP_Y + 28), gs(6), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawWarehouseDetails(px, py) {
        // Ceiling beams
        ctx.strokeStyle = '#4a3a2a88';
        ctx.lineWidth = gs(3);
        for (let i = 0; i < 5; i++) {
            const y = gs(VP_Y - 20 + i * 8 + py * 0.2);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }
    }

    function drawRooftopDetails(px, py) {
        // Stars
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 30; i++) {
            const sx = ((i * 137 + frameCount * 0.02) % GAME_W);
            const sy = (i * 97) % (GAME_H * 0.35);
            const brightness = 0.3 + 0.7 * Math.sin(frameCount * 0.02 + i);
            ctx.globalAlpha = brightness * 0.6;
            ctx.fillRect(gs(sx), gs(sy), gs(1.5), gs(1.5));
        }
        ctx.globalAlpha = 1;
    }

    function drawLairDetails(px, py) {
        // Tech panels with glowing lines
        const accent = ENV_COLORS[ENV_LAIR].accent;
        for (let i = 0; i < 6; i++) {
            const x = (i - 2.5) * 110 + VP_X;
            const y = VP_Y - 20 + Math.sin(frameCount * 0.03 + i) * 5;
            ctx.strokeStyle = accent + '44';
            ctx.lineWidth = gs(1);
            ctx.strokeRect(gs(x - 20 + px * 0.3), gs(y + py * 0.2), gs(40), gs(25));
            // Glowing line
            ctx.strokeStyle = accent + (Math.sin(frameCount * 0.05 + i * 1.2) > 0 ? '88' : '22');
            ctx.beginPath();
            ctx.moveTo(gs(x - 15 + px * 0.3), gs(y + 12 + py * 0.2));
            ctx.lineTo(gs(x + 15 + px * 0.3), gs(y + 12 + py * 0.2));
            ctx.stroke();
        }
    }

    // ══════════════════════════════════════════════
    //  COVER OBJECTS
    // ══════════════════════════════════════════════
    function createCoverObjects() {
        coverObjects = [];
        if (envId === ENV_CITY) {
            coverObjects.push({ x: GAME_W * 0.25, w: 100, h: 70, color: '#3a3a5a', label: 'CAR' });
            coverObjects.push({ x: GAME_W * 0.75, w: 60, h: 80, color: '#2a4a2a', label: 'DUMPSTER' });
        } else if (envId === ENV_WAREHOUSE) {
            coverObjects.push({ x: GAME_W * 0.2, w: 80, h: 60, color: '#6a4a2a', label: 'CRATE' });
            coverObjects.push({ x: GAME_W * 0.5, w: 40, h: 70, color: '#555', label: 'BARREL' });
            coverObjects.push({ x: GAME_W * 0.8, w: 70, h: 65, color: '#6a4a2a', label: 'CRATE' });
        } else if (envId === ENV_ROOFTOP) {
            coverObjects.push({ x: GAME_W * 0.3, w: 50, h: 90, color: '#4a4a6a', label: 'VENT' });
            coverObjects.push({ x: GAME_W * 0.7, w: 60, h: 75, color: '#3a3a5a', label: 'TANK' });
        } else {
            coverObjects.push({ x: GAME_W * 0.25, w: 90, h: 65, color: '#2a1a3a', label: 'CONSOLE' });
            coverObjects.push({ x: GAME_W * 0.65, w: 70, h: 70, color: '#1a2a3a', label: 'SERVER' });
        }
    }

    function drawCover() {
        const coverH = ducking ? 120 : 60;
        const coverBaseY = GAME_H;
        for (const cov of coverObjects) {
            const x = gs(cov.x - cov.w / 2);
            const w = gs(cov.w);
            const h = gs(cov.h + (ducking ? 50 : 0));
            const y = gs(coverBaseY) - h;

            // Main body
            ctx.fillStyle = cov.color;
            ctx.fillRect(x, y, w, h);

            // Edge highlight
            ctx.fillStyle = '#ffffff18';
            ctx.fillRect(x, y, w, gs(3));
            ctx.fillRect(x, y, gs(3), h);

            // Shadow
            ctx.fillStyle = '#00000033';
            ctx.fillRect(x + gs(3), y + h - gs(5), w - gs(3), gs(5));
        }

        // Foreground cover bar (main cover the player ducks behind)
        const barY = gs(GAME_H - (ducking ? 130 : 50));
        const barGrad = ctx.createLinearGradient(0, barY, 0, gs(GAME_H));
        const env = ENV_COLORS[envId] || ENV_COLORS[0];
        barGrad.addColorStop(0, env.ground);
        barGrad.addColorStop(0.3, env.buildings[0] || '#222');
        barGrad.addColorStop(1, '#000');
        ctx.fillStyle = barGrad;
        ctx.fillRect(0, barY, W, gs(GAME_H) - barY + gs(10));

        // Cover edge detail
        ctx.fillStyle = env.accent + '44';
        ctx.fillRect(0, barY, W, gs(2));
    }

    // ══════════════════════════════════════════════
    //  ENEMY SYSTEM
    // ══════════════════════════════════════════════
    function spawnEnemy(type, x, depth) {
        const e = {
            type,
            x: x !== undefined ? x : rand(GAME_W * 0.15, GAME_W * 0.85),
            depth: depth || DEPTH_FAR,
            hp: EN_HP[type] + Math.floor(level / 3),
            maxHp: EN_HP[type] + Math.floor(level / 3),
            speed: EN_SPEED[type] * (1 + level * 0.05),
            alive: true,
            flashTimer: 0,
            attackTimer: 0,
            attackCooldown: type === EN_SNIPER ? 1500 : 3000 - level * 100,
            shieldUp: type === EN_SHIELD,
            sniperVisible: type === EN_SNIPER ? 2000 : 0,
            sniperHideTimer: 0,
            wobblePhase: rand(0, Math.PI * 2),
            // Lateral drift
            driftSpeed: type === EN_DRONE ? rand(-0.8, 0.8) : rand(-0.2, 0.2),
            // Boss specific
            bossPhase: 0,
            bossAttackPattern: 0,
        };
        if (type === EN_BOSS) {
            e.hp = 12 + level * 3;
            e.maxHp = e.hp;
            e.speed = EN_SPEED[EN_BOSS];
            e.attackCooldown = 2000;
            e.x = VP_X;
        }
        enemies.push(e);
    }

    function spawnWave() {
        const waveNum = level;
        const envIdx = Math.min(Math.floor((level - 1) / 3), 3);
        envId = envIdx;

        // Determine enemy composition per level
        levelKillTarget = 8 + level * 3;
        if (level % 4 === 0) levelKillTarget += 1; // boss levels add boss
        enemiesToSpawn = levelKillTarget;
        if (level % 4 === 0) enemiesToSpawn--; // boss is separate
        bossSpawned = false;
        enemiesKilled = 0;
        spawnInterval = Math.max(800, 2500 - level * 120);
        spawnTimer = 500; // first enemy comes quickly
        createCoverObjects();
    }

    function getSpawnType() {
        const r = Math.random();
        if (level < 2) return EN_SOLDIER;
        if (level < 3) return r < 0.7 ? EN_SOLDIER : EN_DRONE;
        if (level < 5) {
            if (r < 0.4) return EN_SOLDIER;
            if (r < 0.65) return EN_DRONE;
            if (r < 0.85) return EN_SHIELD;
            return EN_SNIPER;
        }
        // Later levels: balanced mix
        if (r < 0.3) return EN_SOLDIER;
        if (r < 0.5) return EN_DRONE;
        if (r < 0.7) return EN_SHIELD;
        return EN_SNIPER;
    }

    function updateEnemies(dt) {
        // Spawn timer
        if (enemiesToSpawn > 0) {
            spawnTimer -= dt;
            if (spawnTimer <= 0) {
                spawnEnemy(getSpawnType());
                enemiesToSpawn--;
                spawnTimer = spawnInterval + rand(-200, 200);
            }
        }

        // Boss spawn
        if (level % 4 === 0 && !bossSpawned && enemiesToSpawn <= 0 && enemies.filter(e => e.alive && e.type !== EN_BOSS).length === 0) {
            bossSpawned = true;
            state = ST_BOSS_INTRO;
            bossIntroTimer = 2000;
            playSound('boss');
        }

        for (const e of enemies) {
            if (!e.alive) continue;
            e.flashTimer = Math.max(0, e.flashTimer - dt);

            // Sniper visibility
            if (e.type === EN_SNIPER) {
                e.sniperVisible -= dt;
                if (e.sniperVisible <= 0) {
                    e.sniperHideTimer -= dt;
                    if (e.sniperHideTimer <= 0) {
                        e.sniperVisible = 1500 + rand(0, 1000);
                        e.sniperHideTimer = 0;
                        e.x = rand(GAME_W * 0.1, GAME_W * 0.9);
                        e.depth = rand(DEPTH_FAR, 0.4);
                    }
                    continue; // hidden, skip movement
                }
            }

            // Shield logic
            if (e.type === EN_SHIELD) {
                e.attackTimer += dt;
                if (e.attackTimer > e.attackCooldown) {
                    e.shieldUp = false;
                    if (e.attackTimer > e.attackCooldown + 800) {
                        e.shieldUp = true;
                        e.attackTimer = 0;
                    }
                }
            }

            // Movement toward camera
            e.depth += e.speed * (dt / 16);
            e.x += e.driftSpeed * (dt / 16);
            e.x = clamp(e.x, GAME_W * 0.05, GAME_W * 0.95);

            // Boss movement pattern
            if (e.type === EN_BOSS) {
                e.bossPhase += dt * 0.001;
                e.x = VP_X + Math.sin(e.bossPhase) * 150;
                if (e.depth > 0.55) e.depth = 0.55; // boss stays mid-range
            }

            // Wobble
            e.wobblePhase += dt * 0.003;

            // Attack when close enough
            if (e.depth >= DEPTH_ATTACK && e.type !== EN_BOSS) {
                e.attackTimer += dt;
                if (e.attackTimer >= e.attackCooldown) {
                    fireEnemyBullet(e);
                    e.attackTimer = 0;
                    if (e.type === EN_SNIPER) {
                        e.sniperVisible = 0;
                        e.sniperHideTimer = 2000 + rand(0, 1500);
                    }
                }
            }

            // Boss attacks
            if (e.type === EN_BOSS) {
                e.attackTimer += dt;
                if (e.attackTimer >= e.attackCooldown) {
                    e.bossAttackPattern = (e.bossAttackPattern + 1) % 3;
                    if (e.bossAttackPattern === 0) {
                        // Triple shot
                        for (let a = -1; a <= 1; a++) {
                            fireEnemyBullet(e, a * 60);
                        }
                    } else if (e.bossAttackPattern === 1) {
                        // Spread
                        for (let a = -2; a <= 2; a++) {
                            fireEnemyBullet(e, a * 40);
                        }
                    } else {
                        // Aimed
                        fireEnemyBullet(e, 0);
                        fireEnemyBullet(e, 0);
                    }
                    e.attackTimer = 0;
                }
            }

            // Too close = force damage
            if (e.depth >= DEPTH_NEAR && e.type !== EN_BOSS) {
                takeDamage();
                e.alive = false;
                spawnDeathParticles(e);
            }
        }

        enemies = enemies.filter(e => e.alive);
    }

    function fireEnemyBullet(e, offsetX) {
        const sc = depthScale(e.depth);
        enemyBullets.push({
            x: e.x + (offsetX || 0) * sc * 0.3,
            y: depthToY(e.depth),
            depth: e.depth,
            speed: 0.015 + level * 0.001,
            alive: true,
            size: 4,
        });
    }

    function updateEnemyBullets(dt) {
        for (const b of enemyBullets) {
            b.depth += b.speed * (dt / 16);
            b.y = depthToY(b.depth);
            b.size = lerp(4, 14, (b.depth - DEPTH_FAR) / (DEPTH_NEAR - DEPTH_FAR));
            // Hit player
            if (b.depth >= DEPTH_NEAR * 0.95) {
                if (!ducking) {
                    takeDamage();
                }
                b.alive = false;
            }
        }
        enemyBullets = enemyBullets.filter(b => b.alive);
    }

    function takeDamage() {
        if (invulnTimer > 0 || ducking) return;
        hp--;
        screenShake = 8;
        screenShakeDecay = 0.88;
        invulnTimer = INVULN_MS;
        playSound('hurt');
        combo = 0;
        if (hp <= 0) {
            state = ST_DYING;
            deathTimer = 2000;
        }
    }

    // ══════════════════════════════════════════════
    //  SHOOTING
    // ══════════════════════════════════════════════
    function shoot() {
        if (ducking || reloading || state !== ST_PLAYING) return;
        if (ammo <= 0) {
            startReload();
            return;
        }
        ammo--;
        shotsFired++;
        muzzleFlash = 1;
        muzzleTimer = 100;
        playSound('shoot');
        screenShake = 2;
        screenShakeDecay = 0.85;

        // Auto-reload when empty
        if (ammo <= 0) {
            startReload();
        }

        // Hit detection — check enemies sorted by depth (front to back so we hit closest first)
        const sorted = [...enemies].filter(e => e.alive).sort((a, b) => b.depth - a.depth);
        let hit = false;
        for (const e of sorted) {
            if (e.type === EN_SNIPER && e.sniperVisible <= 0) continue;
            const sc = depthScale(e.depth);
            const ew = EN_W[e.type] * sc;
            const eh = EN_H[e.type] * sc;
            const ex = e.x + Math.sin(e.wobblePhase) * 3 * sc;
            const ey = depthToY(e.depth);

            // Check if crosshair is within enemy bounds
            if (crossX >= ex - ew / 2 && crossX <= ex + ew / 2 &&
                crossY >= ey - eh && crossY <= ey) {

                // Shield check
                if (e.type === EN_SHIELD && e.shieldUp) {
                    spawnSparkParticles(crossX, crossY, '#88aaff');
                    playSound('hit');
                    hit = true;
                    break;
                }

                // Headshot check (upper 30% of enemy)
                const headshot = crossY < ey - eh * 0.7;

                e.hp--;
                e.flashTimer = 100;
                shotsHit++;
                hit = true;
                combo++;
                maxCombo = Math.max(maxCombo, combo);

                if (e.hp <= 0) {
                    e.alive = false;
                    const pts = EN_SCORES[e.type] * getComboMultiplier() + (headshot ? HEADSHOT_BONUS : 0);
                    score += pts;
                    enemiesKilled++;
                    spawnDeathParticles(e);
                    addScorePopup(ex, ey - eh / 2, pts, headshot);
                    playSound('kill');
                } else {
                    spawnSparkParticles(crossX, crossY, '#ffaa44');
                    addScorePopup(crossX, crossY, headshot ? HEADSHOT_BONUS : 0, headshot);
                    playSound('hit');
                }
                break;
            }
        }

        if (!hit) {
            combo = 0;
            // Miss spark
            spawnSparkParticles(crossX, crossY, '#666');
        }
    }

    function startReload() {
        if (reloading) return;
        reloading = true;
        reloadTimer = RELOAD_MS;
        playSound('reload');
    }

    function getComboMultiplier() {
        if (combo >= 20) return 4;
        if (combo >= 10) return 3;
        if (combo >= 5) return 2;
        return 1;
    }

    // ══════════════════════════════════════════════
    //  PARTICLES / EFFECTS
    // ══════════════════════════════════════════════
    function spawnDeathParticles(e) {
        const sc = depthScale(e.depth);
        const x = e.x;
        const y = depthToY(e.depth) - EN_H[e.type] * sc / 2;
        const colors = ['#ff6644', '#ffaa22', '#ff4444', '#ffffff', '#ff8800'];
        for (let i = 0; i < 15; i++) {
            particles.push({
                x, y,
                vx: rand(-3, 3) * sc,
                vy: rand(-4, 1) * sc,
                life: 500 + rand(0, 300),
                maxLife: 800,
                size: rand(2, 6) * sc,
                color: colors[randInt(0, colors.length - 1)],
                type: 'spark',
            });
        }
        // Expanding ring
        particles.push({
            x, y,
            vx: 0, vy: 0,
            life: 400,
            maxLife: 400,
            size: 5 * sc,
            growRate: 40 * sc,
            color: '#ffffff',
            type: 'ring',
        });
    }

    function spawnSparkParticles(x, y, color) {
        for (let i = 0; i < 6; i++) {
            particles.push({
                x, y,
                vx: rand(-2, 2),
                vy: rand(-2, 2),
                life: 200 + rand(0, 150),
                maxLife: 350,
                size: rand(1, 3),
                color,
                type: 'spark',
            });
        }
    }

    function addScorePopup(x, y, pts, headshot) {
        if (pts <= 0) return;
        let text = `+${pts}`;
        if (headshot) text += ' HEADSHOT!';
        if (combo >= 5) text += ` x${getComboMultiplier()}`;
        scorePopups.push({
            x, y,
            text,
            life: 1200,
            maxLife: 1200,
            headshot,
        });
    }

    function updateParticles(dt) {
        for (const p of particles) {
            p.life -= dt;
            if (p.type === 'spark') {
                p.x += p.vx * (dt / 16);
                p.y += p.vy * (dt / 16);
                p.vy += 0.1 * (dt / 16); // gravity
            } else if (p.type === 'ring') {
                p.size += p.growRate * (dt / 1000);
            }
        }
        particles = particles.filter(p => p.life > 0);

        for (const s of scorePopups) {
            s.life -= dt;
            s.y -= 0.5 * (dt / 16);
        }
        scorePopups = scorePopups.filter(s => s.life > 0);
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = clamp(p.life / p.maxLife, 0, 1);
            if (p.type === 'spark') {
                ctx.globalAlpha = alpha;
                ctx.fillStyle = p.color;
                ctx.fillRect(gs(p.x - p.size / 2), gs(p.y - p.size / 2), gs(p.size), gs(p.size));
            } else if (p.type === 'ring') {
                ctx.globalAlpha = alpha * 0.6;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = gs(2);
                ctx.beginPath();
                ctx.arc(gs(p.x), gs(p.y), gs(p.size), 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawScorePopups() {
        for (const s of scorePopups) {
            const alpha = clamp(s.life / s.maxLife, 0, 1);
            const sc = 0.8 + (1 - alpha) * 0.3;
            ctx.globalAlpha = alpha;
            ctx.save();
            ctx.translate(gs(s.x), gs(s.y));
            ctx.scale(sc, sc);
            ctx.font = `bold ${gs(s.headshot ? 14 : 11)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillStyle = s.headshot ? '#ff4444' : '#ffcc00';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = gs(2);
            ctx.strokeText(s.text, 0, 0);
            ctx.fillText(s.text, 0, 0);
            ctx.restore();
            ctx.globalAlpha = 1;
        }
    }

    // ══════════════════════════════════════════════
    //  ENEMY RENDERING
    // ══════════════════════════════════════════════
    function drawEnemies() {
        // Sort back-to-front for proper depth rendering
        const sorted = [...enemies].filter(e => e.alive).sort((a, b) => a.depth - b.depth);
        for (const e of sorted) {
            if (e.type === EN_SNIPER && e.sniperVisible <= 0) continue;

            const sc = depthScale(e.depth);
            const ew = EN_W[e.type] * sc;
            const eh = EN_H[e.type] * sc;
            const ex = e.x + Math.sin(e.wobblePhase) * 3 * sc;
            const ey = depthToY(e.depth);
            const flash = e.flashTimer > 0;

            ctx.save();
            ctx.translate(gs(ex), gs(ey));

            if (e.type === EN_SOLDIER) {
                drawSoldier(ew, eh, sc, flash);
            } else if (e.type === EN_DRONE) {
                drawDrone(ew, eh, sc, flash);
            } else if (e.type === EN_SHIELD) {
                drawShieldGuy(ew, eh, sc, flash, e.shieldUp);
            } else if (e.type === EN_SNIPER) {
                drawSniper(ew, eh, sc, flash, e.sniperVisible);
            } else if (e.type === EN_BOSS) {
                drawBoss(ew, eh, sc, flash, e);
            }

            ctx.restore();
        }
    }

    function drawSoldier(w, h, sc, flash) {
        const _sk = (frameCount % 20 < 10 && __sprites.soldierMove) ? __sprites.soldierMove : __sprites.soldier;
        if (_sk && !flash) { ctx.drawImage(_sk, gs(-w * 0.5), gs(-h), gs(w), gs(h)); return; }
        const c = flash ? '#fff' : (themeColors ? themeColors[0] : '#e44');
        // Body
        ctx.fillStyle = c;
        ctx.fillRect(gs(-w * 0.3), gs(-h), gs(w * 0.6), gs(h * 0.6));
        // Head
        ctx.fillStyle = flash ? '#fff' : '#dba';
        ctx.beginPath();
        ctx.arc(0, gs(-h * 0.8), gs(w * 0.2), 0, Math.PI * 2);
        ctx.fill();
        // Helmet
        ctx.fillStyle = flash ? '#fff' : '#555';
        ctx.fillRect(gs(-w * 0.22), gs(-h), gs(w * 0.44), gs(h * 0.15));
        // Legs
        ctx.fillStyle = flash ? '#fff' : '#444';
        ctx.fillRect(gs(-w * 0.25), gs(-h * 0.4), gs(w * 0.2), gs(h * 0.4));
        ctx.fillRect(gs(w * 0.05), gs(-h * 0.4), gs(w * 0.2), gs(h * 0.4));
        // Gun
        ctx.fillStyle = flash ? '#fff' : '#333';
        ctx.fillRect(gs(w * 0.3), gs(-h * 0.55), gs(w * 0.25), gs(h * 0.08));
    }

    function drawDrone(w, h, sc, flash) {
        if (__sprites.drone && !flash) { ctx.drawImage(__sprites.drone, gs(-w * 0.5), gs(-h), gs(w), gs(h)); return; }
        const c = flash ? '#fff' : (themeColors ? themeColors[1] : '#4af');
        // Body
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(0, gs(-h * 0.5), gs(w * 0.5), gs(h * 0.4), 0, 0, Math.PI * 2);
        ctx.fill();
        // Rotor lines
        ctx.strokeStyle = flash ? '#fff' : '#aaa';
        ctx.lineWidth = gs(1);
        const rotAngle = frameCount * 0.2;
        for (let i = 0; i < 4; i++) {
            const a = rotAngle + i * Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(0, gs(-h * 0.5));
            ctx.lineTo(gs(Math.cos(a) * w * 0.6), gs(-h * 0.5 + Math.sin(a) * h * 0.15));
            ctx.stroke();
        }
        // Eye
        ctx.fillStyle = flash ? '#fff' : '#f00';
        ctx.beginPath();
        ctx.arc(0, gs(-h * 0.5), gs(w * 0.12), 0, Math.PI * 2);
        ctx.fill();
    }

    function drawShieldGuy(w, h, sc, flash, shieldUp) {
        if (__sprites.shieldEnemy && !flash) { ctx.drawImage(__sprites.shieldEnemy, gs(-w * 0.5), gs(-h), gs(w), gs(h)); }
        // Draw soldier base
        drawSoldier(w * 0.85, h, sc, flash);
        // Shield
        if (shieldUp) {
            ctx.fillStyle = flash ? '#fff8' : '#4488ff44';
            ctx.strokeStyle = flash ? '#fff' : '#4488ff';
            ctx.lineWidth = gs(2);
            ctx.beginPath();
            ctx.ellipse(gs(-w * 0.05), gs(-h * 0.5), gs(w * 0.55), gs(h * 0.5), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }

    function drawSniper(w, h, sc, flash, visTimer) {
        const alpha = clamp(visTimer / 500, 0, 1);
        ctx.globalAlpha = alpha;
        const c = flash ? '#fff' : (themeColors ? themeColors[2] : '#a4f');
        // Crouching body
        ctx.fillStyle = c;
        ctx.fillRect(gs(-w * 0.3), gs(-h * 0.7), gs(w * 0.6), gs(h * 0.45));
        // Head
        ctx.fillStyle = flash ? '#fff' : '#dba';
        ctx.beginPath();
        ctx.arc(0, gs(-h * 0.75), gs(w * 0.18), 0, Math.PI * 2);
        ctx.fill();
        // Scope glint
        ctx.fillStyle = '#ff0';
        ctx.beginPath();
        ctx.arc(gs(w * 0.4), gs(-h * 0.6), gs(2 * sc), 0, Math.PI * 2);
        ctx.fill();
        // Rifle
        ctx.fillStyle = flash ? '#fff' : '#333';
        ctx.fillRect(gs(w * 0.15), gs(-h * 0.55), gs(w * 0.55), gs(h * 0.05));
        ctx.globalAlpha = 1;
    }

    function drawBoss(w, h, sc, flash, e) {
        if (__sprites.boss && !flash) { ctx.drawImage(__sprites.boss, gs(-w * 0.5), gs(-h), gs(w), gs(h)); return; }
        const c = flash ? '#fff' : (themeColors ? themeColors[3] || '#f44' : '#f44');
        const pulse = 0.9 + Math.sin(frameCount * 0.05) * 0.1;

        // Glow aura
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(0, gs(-h * 0.5), gs(w * 0.7 * pulse), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Armored body
        ctx.fillStyle = c;
        ctx.fillRect(gs(-w * 0.4), gs(-h * 0.9), gs(w * 0.8), gs(h * 0.7));
        // Head
        ctx.fillStyle = flash ? '#fff' : '#b33';
        ctx.beginPath();
        ctx.arc(0, gs(-h * 0.95), gs(w * 0.25), 0, Math.PI * 2);
        ctx.fill();
        // Visor
        ctx.fillStyle = '#ff000088';
        ctx.fillRect(gs(-w * 0.2), gs(-h * 0.98), gs(w * 0.4), gs(h * 0.06));
        // Legs
        ctx.fillStyle = flash ? '#fff' : '#622';
        ctx.fillRect(gs(-w * 0.35), gs(-h * 0.2), gs(w * 0.25), gs(h * 0.2));
        ctx.fillRect(gs(w * 0.1), gs(-h * 0.2), gs(w * 0.25), gs(h * 0.2));
        // Shoulder armor
        ctx.fillStyle = flash ? '#fff' : '#a22';
        ctx.fillRect(gs(-w * 0.5), gs(-h * 0.85), gs(w * 0.2), gs(h * 0.2));
        ctx.fillRect(gs(w * 0.3), gs(-h * 0.85), gs(w * 0.2), gs(h * 0.2));
        // Arm cannons
        ctx.fillStyle = flash ? '#fff' : '#444';
        ctx.fillRect(gs(-w * 0.55), gs(-h * 0.5), gs(w * 0.15), gs(h * 0.25));
        ctx.fillRect(gs(w * 0.4), gs(-h * 0.5), gs(w * 0.15), gs(h * 0.25));

        // HP bar
        const barW = w * 0.8;
        const hpPct = e.hp / e.maxHp;
        ctx.fillStyle = '#000a';
        ctx.fillRect(gs(-barW / 2), gs(-h - 12), gs(barW), gs(6));
        ctx.fillStyle = hpPct > 0.5 ? '#4f4' : hpPct > 0.25 ? '#ff4' : '#f44';
        ctx.fillRect(gs(-barW / 2), gs(-h - 12), gs(barW * hpPct), gs(6));
    }

    function drawEnemyBullets() {
        for (const b of enemyBullets) {
            const sc = depthScale(b.depth);
            const size = b.size;
            const glow = ctx.createRadialGradient(gs(b.x), gs(b.y), 0, gs(b.x), gs(b.y), gs(size * 1.5));
            glow.addColorStop(0, '#ff440088');
            glow.addColorStop(1, 'transparent');
            ctx.fillStyle = glow;
            ctx.fillRect(gs(b.x - size * 2), gs(b.y - size * 2), gs(size * 4), gs(size * 4));

            ctx.fillStyle = '#ff4400';
            ctx.beginPath();
            ctx.arc(gs(b.x), gs(b.y), gs(size / 2), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffcc00';
            ctx.beginPath();
            ctx.arc(gs(b.x), gs(b.y), gs(size / 4), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ══════════════════════════════════════════════
    //  HUD
    // ══════════════════════════════════════════════
    function drawHUD() {
        const accent = themeColors ? themeColors[0] : '#e94560';

        // Score
        ctx.font = `bold ${gs(16)}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = gs(2);
        ctx.strokeText(`SCORE: ${score}`, gs(10), gs(24));
        ctx.fillText(`SCORE: ${score}`, gs(10), gs(24));

        // Level / environment
        ctx.font = `${gs(11)}px monospace`;
        ctx.fillStyle = '#aaa';
        ctx.strokeText(`LEVEL ${level} - ${ENV_NAMES[envId]}`, gs(10), gs(40));
        ctx.fillText(`LEVEL ${level} - ${ENV_NAMES[envId]}`, gs(10), gs(40));

        // HP bar
        const hpBarW = 120, hpBarH = 12;
        ctx.fillStyle = '#000a';
        ctx.fillRect(gs(GAME_W - hpBarW - 10), gs(10), gs(hpBarW), gs(hpBarH));
        const hpPct = hp / MAX_HP;
        ctx.fillStyle = hpPct > 0.5 ? '#4f4' : hpPct > 0.25 ? '#ff4' : '#f44';
        ctx.fillRect(gs(GAME_W - hpBarW - 10), gs(10), gs(hpBarW * hpPct), gs(hpBarH));
        ctx.strokeStyle = '#fff4';
        ctx.lineWidth = gs(1);
        ctx.strokeRect(gs(GAME_W - hpBarW - 10), gs(10), gs(hpBarW), gs(hpBarH));
        ctx.font = `bold ${gs(9)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(`HP`, gs(GAME_W - hpBarW / 2 - 10), gs(20));

        // Ammo
        const ammoX = GAME_W - 10;
        const ammoY = 32;
        ctx.textAlign = 'right';
        for (let i = 0; i < MAX_AMMO; i++) {
            const bx = ammoX - i * 14;
            if (i < ammo) {
                // Full bullet
                ctx.fillStyle = '#ffcc00';
                ctx.fillRect(gs(bx - 8), gs(ammoY), gs(6), gs(14));
                ctx.fillStyle = '#cc8800';
                ctx.fillRect(gs(bx - 8), gs(ammoY), gs(6), gs(4));
            } else {
                // Empty slot
                ctx.fillStyle = '#333';
                ctx.fillRect(gs(bx - 8), gs(ammoY), gs(6), gs(14));
            }
        }
        if (reloading) {
            ctx.font = `bold ${gs(12)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ff4';
            const rPct = 1 - reloadTimer / RELOAD_MS;
            ctx.fillText(`RELOADING${'.'.repeat(Math.floor(rPct * 3) + 1)}`, gs(GAME_W / 2), gs(GAME_H - 70));
        }

        // Combo
        if (combo >= 3) {
            ctx.font = `bold ${gs(14)}px monospace`;
            ctx.textAlign = 'center';
            const comboAlpha = 0.6 + Math.sin(frameCount * 0.1) * 0.4;
            ctx.globalAlpha = comboAlpha;
            ctx.fillStyle = '#ff0';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = gs(2);
            const cText = `COMBO x${combo} (${getComboMultiplier()}X)`;
            ctx.strokeText(cText, gs(GAME_W / 2), gs(56));
            ctx.fillText(cText, gs(GAME_W / 2), gs(56));
            ctx.globalAlpha = 1;
        }

        // Duck indicator
        if (ducking) {
            ctx.font = `bold ${gs(18)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#4af';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = gs(2);
            ctx.strokeText('COVER!', gs(GAME_W / 2), gs(GAME_H - 100));
            ctx.fillText('COVER!', gs(GAME_W / 2), gs(GAME_H - 100));
        }

        // Enemy progress
        if (state === ST_PLAYING) {
            const progW = 100;
            const progH = 6;
            const px = GAME_W / 2 - progW / 2;
            const py = 6;
            const pct = clamp(enemiesKilled / levelKillTarget, 0, 1);
            ctx.fillStyle = '#0004';
            ctx.fillRect(gs(px), gs(py), gs(progW), gs(progH));
            ctx.fillStyle = accent;
            ctx.fillRect(gs(px), gs(py), gs(progW * pct), gs(progH));
        }
    }

    // ══════════════════════════════════════════════
    //  CROSSHAIR
    // ══════════════════════════════════════════════
    function drawCrosshair() {
        if (ducking) return;
        const cx = gs(crossX);
        const cy = gs(crossY);
        const r = gs(14);
        const ir = gs(2);

        // Check if over an enemy
        crossOverEnemy = false;
        for (const e of enemies) {
            if (!e.alive) continue;
            if (e.type === EN_SNIPER && e.sniperVisible <= 0) continue;
            const sc = depthScale(e.depth);
            const ew = EN_W[e.type] * sc;
            const eh = EN_H[e.type] * sc;
            const ex = e.x + Math.sin(e.wobblePhase) * 3 * sc;
            const ey = depthToY(e.depth);
            if (crossX >= ex - ew / 2 && crossX <= ex + ew / 2 &&
                crossY >= ey - eh && crossY <= ey) {
                crossOverEnemy = true;
                break;
            }
        }

        const color = crossOverEnemy ? '#ff2222' : '#ffffff';
        ctx.strokeStyle = color;
        ctx.lineWidth = gs(1.5);
        ctx.globalAlpha = 0.9;

        // Outer circle
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        // Cross lines
        const gap = gs(6);
        const len = gs(10);
        ctx.beginPath();
        ctx.moveTo(cx - r - len, cy); ctx.lineTo(cx - gap, cy);
        ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + r + len, cy);
        ctx.moveTo(cx, cy - r - len); ctx.lineTo(cx, cy - gap);
        ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + r + len);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, ir, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
    }

    // ══════════════════════════════════════════════
    //  MUZZLE FLASH
    // ══════════════════════════════════════════════
    function drawMuzzleFlash() {
        if (muzzleFlash <= 0) return;
        const alpha = muzzleFlash;
        const cx = gs(GAME_W / 2);
        const cy = gs(GAME_H - 10);
        const r = gs(30 + Math.random() * 15);

        ctx.globalAlpha = alpha * 0.8;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, '#ffaa00');
        grad.addColorStop(0.6, '#ff440066');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

        // Gun barrel hint
        ctx.fillStyle = '#333';
        ctx.fillRect(gs(GAME_W / 2 - 15), gs(GAME_H - 5), gs(30), gs(10));
        ctx.fillStyle = '#555';
        ctx.fillRect(gs(GAME_W / 2 - 10), gs(GAME_H - 3), gs(20), gs(8));

        ctx.globalAlpha = 1;
    }

    // ══════════════════════════════════════════════
    //  SCREENS
    // ══════════════════════════════════════════════
    function drawTitleScreen() {
        drawEnvironment();
        drawCover();

        ctx.fillStyle = '#000a';
        ctx.fillRect(0, 0, W, H);

        // Title
        ctx.textAlign = 'center';
        ctx.font = `bold ${gs(40)}px monospace`;
        ctx.fillStyle = themeColors ? themeColors[0] : '#e94560';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = gs(3);
        const bounce = Math.sin(frameCount * 0.03) * 5;
        ctx.strokeText('RAIL BLASTER', gs(GAME_W / 2), gs(140 + bounce));
        ctx.fillText('RAIL BLASTER', gs(GAME_W / 2), gs(140 + bounce));

        // Subtitle
        ctx.font = `${gs(14)}px monospace`;
        ctx.fillStyle = '#aaa';
        ctx.fillText('ON-RAILS SHOOTER', gs(GAME_W / 2), gs(170));

        // Crosshair decoration
        const cx = gs(GAME_W / 2);
        const cy = gs(250);
        ctx.strokeStyle = '#ff444488';
        ctx.lineWidth = gs(2);
        ctx.beginPath();
        ctx.arc(cx, cy, gs(25), 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - gs(35), cy);
        ctx.lineTo(cx + gs(35), cy);
        ctx.moveTo(cx, cy - gs(35));
        ctx.lineTo(cx, cy + gs(35));
        ctx.stroke();

        // Instructions
        ctx.font = `${gs(12)}px monospace`;
        ctx.fillStyle = '#ccc';
        ctx.fillText('CLICK / TAP TO SHOOT', gs(GAME_W / 2), gs(310));
        ctx.fillText('SPACE / RIGHT-CLICK TO DUCK', gs(GAME_W / 2), gs(330));
        ctx.fillText('MOVE MOUSE TO AIM', gs(GAME_W / 2), gs(350));

        ctx.font = `bold ${gs(16)}px monospace`;
        const blink = Math.sin(frameCount * 0.06) > 0;
        if (blink) {
            ctx.fillStyle = '#fff';
            ctx.fillText('CLICK TO START', gs(GAME_W / 2), gs(410));
        }
    }

    function drawLevelIntro() {
        drawEnvironment();
        drawCover();

        ctx.fillStyle = '#000a';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.font = `bold ${gs(28)}px monospace`;
        ctx.fillStyle = themeColors ? themeColors[0] : '#e94560';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = gs(3);
        ctx.strokeText(`LEVEL ${level}`, gs(GAME_W / 2), gs(190));
        ctx.fillText(`LEVEL ${level}`, gs(GAME_W / 2), gs(190));

        ctx.font = `${gs(16)}px monospace`;
        ctx.fillStyle = '#ccc';
        ctx.fillText(ENV_NAMES[envId], gs(GAME_W / 2), gs(225));

        ctx.font = `${gs(12)}px monospace`;
        ctx.fillStyle = '#888';
        ctx.fillText(`Eliminate ${levelKillTarget} hostiles`, gs(GAME_W / 2), gs(260));
    }

    function drawBossIntro() {
        drawEnvironment();
        drawCover();

        ctx.fillStyle = '#000000cc';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        const pulse = 0.8 + Math.sin(frameCount * 0.08) * 0.2;
        ctx.font = `bold ${gs(36 * pulse)}px monospace`;
        ctx.fillStyle = '#f44';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = gs(3);
        ctx.strokeText('WARNING', gs(GAME_W / 2), gs(200));
        ctx.fillText('WARNING', gs(GAME_W / 2), gs(200));

        ctx.font = `bold ${gs(20)}px monospace`;
        ctx.fillStyle = '#ff8';
        ctx.fillText('BOSS APPROACHING', gs(GAME_W / 2), gs(250));
    }

    function drawLevelClear() {
        drawEnvironment();
        drawCover();

        ctx.fillStyle = '#000a';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.font = `bold ${gs(30)}px monospace`;
        ctx.fillStyle = '#4f4';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = gs(3);
        ctx.strokeText('LEVEL CLEAR!', gs(GAME_W / 2), gs(160));
        ctx.fillText('LEVEL CLEAR!', gs(GAME_W / 2), gs(160));

        // Stats
        const accuracy = shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 100) : 0;
        const accuracyBonus = Math.floor(accuracy * 5);

        ctx.font = `${gs(14)}px monospace`;
        ctx.fillStyle = '#ccc';
        ctx.fillText(`Accuracy: ${accuracy}%`, gs(GAME_W / 2), gs(210));
        ctx.fillText(`Accuracy Bonus: +${accuracyBonus}`, gs(GAME_W / 2), gs(235));
        ctx.fillText(`Max Combo: ${maxCombo}`, gs(GAME_W / 2), gs(260));
    }

    function drawGameOver() {
        drawEnvironment();
        drawCover();

        ctx.fillStyle = '#000000cc';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.font = `bold ${gs(36)}px monospace`;
        ctx.fillStyle = '#f44';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = gs(3);
        ctx.strokeText('GAME OVER', gs(GAME_W / 2), gs(180));
        ctx.fillText('GAME OVER', gs(GAME_W / 2), gs(180));

        ctx.font = `bold ${gs(20)}px monospace`;
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(`SCORE: ${score}`, gs(GAME_W / 2), gs(230));

        ctx.font = `${gs(14)}px monospace`;
        ctx.fillStyle = '#aaa';
        const accuracy = shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 100) : 0;
        ctx.fillText(`Accuracy: ${accuracy}%  |  Level: ${level}  |  Max Combo: ${maxCombo}`, gs(GAME_W / 2), gs(265));

        const blink = Math.sin(frameCount * 0.06) > 0;
        if (blink) {
            ctx.font = `${gs(14)}px monospace`;
            ctx.fillStyle = '#fff';
            ctx.fillText('CLICK TO CONTINUE', gs(GAME_W / 2), gs(340));
        }
    }

    // ══════════════════════════════════════════════
    //  GAME LOOP
    // ══════════════════════════════════════════════
    function gameLoop(ts) {
        if (!gameActive) return;
        // Loading screen
        if (!__allSpritesReady) {
            __drawLoadingScreen(canvas, ctx, 'RAIL BLASTER', '#EF4444');
            animFrame = requestAnimationFrame(gameLoop);
            return;
        }
        animFrame = requestAnimationFrame(gameLoop);

        const dt = lastTime ? Math.min(ts - lastTime, 50) : 16;
        lastTime = ts;
        frameCount++;

        update(dt);
        render();
    }

    function update(dt) {
        // Screen shake decay
        if (screenShake > 0.1) {
            screenShake *= screenShakeDecay;
        } else {
            screenShake = 0;
        }

        // Muzzle flash decay
        if (muzzleTimer > 0) {
            muzzleTimer -= dt;
            muzzleFlash = clamp(muzzleTimer / 100, 0, 1);
        } else {
            muzzleFlash = 0;
        }

        // Invulnerability
        if (invulnTimer > 0) invulnTimer -= dt;

        // Reload
        if (reloading) {
            reloadTimer -= dt;
            if (reloadTimer <= 0) {
                reloading = false;
                ammo = MAX_AMMO;
            }
        }

        // Ducking interpolation
        if (ducking) {
            duckY = Math.min(1, duckY + dt * 0.006);
        } else {
            duckY = Math.max(0, duckY - dt * 0.008);
        }

        // State machine
        if (state === ST_LEVEL_INTRO) {
            introTimer -= dt;
            if (introTimer <= 0) {
                state = ST_PLAYING;
            }
        } else if (state === ST_BOSS_INTRO) {
            bossIntroTimer -= dt;
            if (bossIntroTimer <= 0) {
                spawnEnemy(EN_BOSS);
                state = ST_PLAYING;
            }
        } else if (state === ST_PLAYING) {
            updateEnemies(dt);
            updateEnemyBullets(dt);
            updateParticles(dt);

            // Check level clear
            if (enemiesKilled >= levelKillTarget && enemies.filter(e => e.alive).length === 0) {
                state = ST_LEVEL_CLEAR;
                clearTimer = 3000;
                // Accuracy bonus
                const accuracy = shotsFired > 0 ? (shotsHit / shotsFired) : 0;
                score += Math.floor(accuracy * 500);
                playSound('levelup');
            }
        } else if (state === ST_LEVEL_CLEAR) {
            clearTimer -= dt;
            updateParticles(dt);
            if (clearTimer <= 0) {
                nextLevel();
            }
        } else if (state === ST_DYING) {
            deathTimer -= dt;
            updateParticles(dt);
            if (deathTimer <= 0) {
                state = ST_GAMEOVER;
                if (gameOverCB) gameOverCB({
                    score,
                    level,
                    duration: Math.floor((Date.now() - (startTime || Date.now())) / 1000),
                    accuracy: shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 100) : 0
                });
            }
        }
    }

    function render() {
        ctx.save();

        // Screen shake
        if (screenShake > 0.5) {
            ctx.translate(
                gs(rand(-screenShake, screenShake)),
                gs(rand(-screenShake, screenShake))
            );
        }

        // Clear
        ctx.fillStyle = '#000';
        ctx.fillRect(-gs(10), -gs(10), W + gs(20), H + gs(20));

        if (state === ST_TITLE) {
            drawTitleScreen();
        } else if (state === ST_LEVEL_INTRO) {
            drawLevelIntro();
        } else if (state === ST_BOSS_INTRO) {
            drawBossIntro();
        } else if (state === ST_PLAYING || state === ST_DYING) {
            // Duck offset: shift view up when ducking
            const duckOffset = duckY * 100;
            ctx.save();
            ctx.translate(0, gs(duckOffset));
            drawEnvironment();
            drawEnemies();
            drawEnemyBullets();
            drawParticles();
            ctx.restore();

            drawCover();
            drawMuzzleFlash();
            drawScorePopups();
            drawHUD();

            if (state !== ST_DYING) {
                drawCrosshair();
            }

            // Dying red flash
            if (state === ST_DYING) {
                const alpha = clamp(deathTimer / 2000, 0, 0.5);
                ctx.fillStyle = `rgba(255,0,0,${alpha})`;
                ctx.fillRect(0, 0, W, H);
            }

            // Damage flash
            if (invulnTimer > 0 && Math.floor(invulnTimer / 80) % 2 === 0) {
                ctx.fillStyle = '#ff000015';
                ctx.fillRect(0, 0, W, H);
            }
        } else if (state === ST_LEVEL_CLEAR) {
            drawLevelClear();
        } else if (state === ST_GAMEOVER) {
            drawGameOver();
        }

        ctx.restore();
    }

    function nextLevel() {
        level++;
        envId = Math.min(Math.floor((level - 1) / 3), 3);
        enemies = [];
        enemyBullets = [];
        particles = [];
        scorePopups = [];
        ammo = MAX_AMMO;
        reloading = false;
        shotsFired = 0;
        shotsHit = 0;
        combo = 0;
        maxCombo = 0;
        ducking = false;
        duckY = 0;
        spawnWave();
        state = ST_LEVEL_INTRO;
        introTimer = 2500;
    }

    // ══════════════════════════════════════════════
    //  INPUT
    // ══════════════════════════════════════════════
    function canvasToGame(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const cx = (clientX - rect.left) / rect.width * GAME_W;
        const cy = (clientY - rect.top) / rect.height * GAME_H;
        return { x: clamp(cx, 0, GAME_W), y: clamp(cy, 0, GAME_H) };
    }

    function onMouseMove(e) {
        const pos = canvasToGame(e.clientX, e.clientY);
        crossX = pos.x;
        crossY = pos.y;
    }

    function onMouseDown(e) {
        e.preventDefault();
        ensureAudio();

        if (e.button === 2) {
            // Right click = duck
            startDuck();
            return;
        }

        if (state === ST_TITLE) {
            startGame();
            return;
        }
        if (state === ST_GAMEOVER) {
            state = ST_TITLE;
            return;
        }
        if (state === ST_PLAYING) {
            shoot();
        }
    }

    function onMouseUp(e) {
        if (e.button === 2) {
            stopDuck();
        }
    }

    function onContextMenu(e) {
        e.preventDefault();
    }

    function onKeyDown(e) {
        ensureAudio();
        if (e.code === 'Space') {
            e.preventDefault();
            if (state === ST_TITLE) {
                startGame();
                return;
            }
            startDuck();
        }
        if (e.code === 'KeyR' && state === ST_PLAYING && !reloading && ammo < MAX_AMMO) {
            startReload();
        }
    }

    function onKeyUp(e) {
        if (e.code === 'Space') {
            stopDuck();
        }
    }

    // Touch
    let touchIds = {};

    function onTouchStart(e) {
        e.preventDefault();
        ensureAudio();

        if (state === ST_TITLE) {
            startGame();
            return;
        }
        if (state === ST_GAMEOVER) {
            state = ST_TITLE;
            return;
        }

        const touches = e.changedTouches;
        if (e.touches.length >= 2) {
            // Two-finger tap = duck
            startDuck();
            return;
        }

        for (let i = 0; i < touches.length; i++) {
            const t = touches[i];
            const pos = canvasToGame(t.clientX, t.clientY);
            crossX = pos.x;
            crossY = pos.y;
            if (state === ST_PLAYING) {
                shoot();
            }
        }
    }

    function onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const t = e.touches[0];
            const pos = canvasToGame(t.clientX, t.clientY);
            crossX = pos.x;
            crossY = pos.y;
        }
    }

    function onTouchEnd(e) {
        e.preventDefault();
        if (e.touches.length < 2 && ducking) {
            stopDuck();
        }
    }

    function startDuck() {
        if (ducking || state !== ST_PLAYING) return;
        ducking = true;
        playSound('duck');
    }

    function stopDuck() {
        ducking = false;
    }

    let startTime = 0;

    function startGame() {
        state = ST_LEVEL_INTRO;
        level = 1;
        score = 0;
        startTime = Date.now();
        hp = MAX_HP;
        ammo = MAX_AMMO;
        combo = 0;
        maxCombo = 0;
        reloading = false;
        ducking = false;
        duckY = 0;
        muzzleFlash = 0;
        muzzleTimer = 0;
        enemies = [];
        enemyBullets = [];
        particles = [];
        scorePopups = [];
        shotsFired = 0;
        shotsHit = 0;
        screenShake = 0;
        invulnTimer = 0;
        envId = ENV_CITY;
        bossSpawned = false;
        spawnWave();
        introTimer = 2500;
    }

    // ══════════════════════════════════════════════
    //  CANVAS FIT
    // ══════════════════════════════════════════════
    function fitCanvas() {
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;
        const pw = parent.clientWidth, ph = parent.clientHeight;
        const aspect = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > aspect) { ch = ph; cw = ch * aspect; }
        else { cw = pw; ch = cw / aspect; }
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = Math.round(cw * DPR);
        canvas.height = Math.round(ch * DPR);
        canvas.style.width = `${cw}px`;
        canvas.style.height = `${ch}px`;
        canvas.style.cursor = 'none';
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
    }

    // ══════════════════════════════════════════════
    //  INIT / DESTROY
    // ══════════════════════════════════════════════
    function init(cvs, player, onGameOverCB) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = player;
        gameOverCB = onGameOverCB;
        gameActive = true;
        frameCount = 0;
        lastTime = 0;

        // Theme
        const themeId = player?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        themeColors = _t ? _t.colors : null;

        // Initial state
        state = ST_TITLE;
        score = 0;
        level = 1;
        hp = MAX_HP;
        ammo = MAX_AMMO;
        combo = 0;
        maxCombo = 0;
        enemies = [];
        enemyBullets = [];
        particles = [];
        scorePopups = [];
        crossX = GAME_W / 2;
        crossY = GAME_H / 2;
        ducking = false;
        duckY = 0;
        reloading = false;
        muzzleFlash = 0;
        muzzleTimer = 0;
        screenShake = 0;
        screenShakeDecay = 0;
        invulnTimer = 0;
        shotsFired = 0;
        shotsHit = 0;
        envId = ENV_CITY;

        W = canvas.width || 640;
        H = canvas.height || 480;
        SCALE = W / GAME_W;
        DPR = Math.min(window.devicePixelRatio || 1, 3);

        // Input binding
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('contextmenu', onContextMenu);
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        window.addEventListener('resize', fitCanvas);
        inputBound = true;

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        __loadSprites(null);
        animFrame = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
        if (canvas) {
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('contextmenu', onContextMenu);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
            canvas.style.cursor = '';
        }
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', fitCanvas);
        enemies = [];
        enemyBullets = [];
        particles = [];
        scorePopups = [];
    }

    return { init, destroy };
})();
