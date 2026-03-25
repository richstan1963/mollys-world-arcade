/* Save Kenny — Missile Command defense with Kenney CC0 sprites for Your World Arcade
   Kenny meditates cross-legged on an auto-pilot drone.
   Player shoots down incoming threats. He always dies eventually. */
window.SaveKenny = (() => {
    // ── Sprite Atlas (Kenney CC0) ──
    const __sprites = {};
    let __spritesLoaded = 0, __spritesTotal = 0, __allSpritesReady = false;
    const __SPRITE_MANIFEST = {
        kenny: '/img/game-assets/kenney-platform/players/Beige/alienBeige_stand.png',
        kennyHit: '/img/game-assets/kenney-platform/players/Beige/alienBeige_hit.png',
        drone: '/img/game-assets/kenney-space/ships/playerShip3_blue.png',
        missile: '/img/game-assets/kenney-space/Missiles/spaceMissiles_001.png',
        enemyBird: '/img/game-assets/kenney-space/enemies/enemyRed3.png',
        enemyBall: '/img/game-assets/kenney-space/meteors/meteorBrown_small1.png',
        enemyPlane: '/img/game-assets/kenney-space/enemies/enemyBlue4.png',
        enemyUFO: '/img/game-assets/kenney-space/enemies/enemyGreen4.png',
        enemyCat: '/img/game-assets/kenney-platform/enemies/mouse.png',
        puAmmo: '/img/game-assets/kenney-space/powerups/powerupRed_bolt.png',
        puShield: '/img/game-assets/kenney-space/powerups/powerupBlue_shield.png',
        puBomb: '/img/game-assets/kenney-space/powerups/powerupGreen_star.png',
        puLife: '/img/game-assets/kenney-platform/items/gemRed.png',
        explosion1: '/img/game-assets/kenney-space/effects/fire00.png',
        explosion2: '/img/game-assets/kenney-space/effects/fire07.png',
        explosion3: '/img/game-assets/kenney-space/effects/fire14.png',
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
    const GAME_W = 640, GAME_H = 400;
    const SCROLL_SPEED_BASE = 1.2;
    const KENNY_W = 22, KENNY_H = 28;
    const DRONE_W = 40, DRONE_H = 12;
    const MISSILE_SPEED = 5;
    const EXPLOSION_MAX_R = 38;
    const MAX_AMMO = 15;
    const SHIELD_DURATION = 300; // frames
    const MAX_HP = 3;

    // Flappy-style drone physics
    const FLAP_VEL = -4.2;   // upward impulse on tap/space
    const GRAVITY = 0.16;    // downward pull — slightly floaty
    const MAX_FALL = 4.5;    // terminal velocity
    const DRIFT_SPEED = 1.8; // horizontal drift from arrow keys
    const DRIFT_FRICTION = 0.92; // how quickly drift slows
    const DRONE_START_X = 140;
    const DRONE_START_Y = GAME_H * 0.38;
    const AMMO_REGEN_RATE = 90; // frames between auto-regen of 1 ammo

    // States
    const ST_SPLASH = 0, ST_PLAYING = 1, ST_DYING = 2, ST_GAMEOVER = 3;

    // Threat types
    const TH_BIRD = 0, TH_BASEBALL = 1, TH_LIGHTNING = 2, TH_AIRPLANE = 3;
    const TH_UFO = 4, TH_CAT = 5;

    // Power-up types
    const PU_AMMO = 0, PU_SHIELD = 1, PU_MAGNET = 2, PU_BOMB = 3, PU_LIFE = 4;

    // Environments
    const ENV_SUBURBS = 0, ENV_CITY = 1, ENV_MOUNTAIN = 2, ENV_SPACE = 3;

    // ── State ──
    let canvas, ctx, W, H, SCALE, DPR;
    let state, animFrame, gameActive = false;
    let activePlayer, gameOverCB, accentColor;
    let frameCount, lastTime;
    let score, coins, hp, ammo, shieldTimer, bestScore;
    let scrollX, scrollSpeed, difficulty;
    let environment, envTimer;

    // Kenny + Drone (player-controlled flight, no weapons for Kenny)
    let droneX, droneY, droneVY, droneVX, droneTilt;
    let kennyAlive;
    let wobblePhase;
    let kennyAlertTimer;
    let kennyShakeTimer;
    let ammoRegenTimer;

    // Threats
    let threats = [];
    let threatTimer;

    // Missiles + Explosions
    let missiles = [];
    let explosions = [];

    // Power-ups
    let powerups = [];
    let powerupTimer;

    // Coins
    let coinItems = [];
    let coinSpawnTimer;

    // Particles
    let particles = [];
    let thrustParticles = [];

    // Speech bubbles
    let speechBubble = null;
    let speechTimer = 0;

    // Death animation
    let deathType = -1;
    let deathTimer = 0;
    let deathKennyX, deathKennyY, deathKennyVelX, deathKennyVelY, deathKennySpin;
    let deathTextAlpha = 0;
    let deathPhase = 0; // 0=animation, 1="OH MY GOD!", 2="YOU BASTARDS!"

    // Parallax layers
    let bgLayers = [];

    // Score floats
    let floats = [];

    // Splash
    let splashBounce = 0;

    // Input
    let mouseX = GAME_W / 2, mouseY = GAME_H / 2;
    let inputBound = false;
    let keys = {};

    // Crosshair
    let crosshairVisible = false;

    // Audio
    let audioCtx = null;

    // Mmph phrases
    const MMPHS = [
        'Mmph mmph!', 'Mmmph!', 'Mmph mmph mmph!', 'Mm mmph!',
        'MMPH!', 'Mmph mm mmph!', 'Mmmmmph!', 'Mph mph!',
        'Mmph mmph mm!', 'Mmmmph mmph!'
    ];

    // ── Audio Helpers ──
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
    function playNoise(dur, vol) {
        try {
            ensureAudio();
            const bufSize = audioCtx.sampleRate * dur;
            const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
            const src = audioCtx.createBufferSource();
            const g = audioCtx.createGain();
            src.buffer = buf;
            g.gain.setValueAtTime(vol || 0.06, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            src.connect(g); g.connect(audioCtx.destination);
            src.start(); src.stop(audioCtx.currentTime + dur);
        } catch {}
    }
    function sfxShoot() { playTone(800, 0.06, 'square', 0.07, 200); playNoise(0.04, 0.05); }
    function sfxExplode() { playNoise(0.25, 0.12); playTone(120, 0.2, 'sawtooth', 0.06, 40); }
    function sfxCoin() { playTone(880, 0.06, 'sine', 0.1); setTimeout(() => playTone(1100, 0.08, 'sine', 0.1), 50); }
    function sfxStar() { playTone(1100, 0.08, 'sine', 0.12); setTimeout(() => playTone(1320, 0.08, 'sine', 0.12), 60); setTimeout(() => playTone(1760, 0.12, 'sine', 0.12), 130); }
    function sfxPowerup() { playTone(523, 0.08, 'sine', 0.12); setTimeout(() => playTone(659, 0.08, 'sine', 0.12), 70); setTimeout(() => playTone(784, 0.1, 'sine', 0.12), 140); }
    function sfxMmph() { playTone(180, 0.15, 'sawtooth', 0.05, 220); playTone(160, 0.12, 'triangle', 0.04, 200); }
    function sfxDeath() { playTone(400, 0.15, 'sawtooth', 0.1, 80); setTimeout(() => playTone(200, 0.3, 'sawtooth', 0.08, 40), 120); setTimeout(() => playNoise(0.4, 0.1), 250); }
    function sfxBomb() { playNoise(0.5, 0.15); playTone(80, 0.4, 'sawtooth', 0.08, 20); }
    function sfxHit() { playTone(200, 0.1, 'sawtooth', 0.09, 60); playNoise(0.12, 0.08); }
    function sfxLaunch() { playTone(300, 0.15, 'sine', 0.06, 600); }
    function sfxFlap() { playTone(440, 0.04, 'sine', 0.03, 520); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

    const HAS_TOUCH = ('ontouchstart' in window);

    // ── Canvas Scaling ──
    function fitCanvas() {
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        const pw = parent.clientWidth, ph = parent.clientHeight;
        const aspect = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > aspect) { ch = ph; cw = ch * aspect; }
        else { cw = pw; ch = cw / aspect; }
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        canvas.width = Math.round(cw * DPR);
        canvas.height = Math.round(ch * DPR);
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
    }

    // ── Background Generation ──
    function generateBG() {
        bgLayers = [];
        const farBuildings = [];
        for (let i = 0; i < 30; i++) {
            farBuildings.push({
                x: i * 80 + rng(-20, 20), w: rng(30, 60), h: rng(40, 120),
                color: `hsl(${rng(200, 240)}, ${rng(10, 30)}%, ${rng(55, 75)}%)`
            });
        }
        bgLayers.push({ speed: 0.15, items: farBuildings, type: 'buildings' });
        const midBuildings = [];
        for (let i = 0; i < 20; i++) {
            midBuildings.push({
                x: i * 100 + rng(-30, 30), w: rng(40, 70), h: rng(60, 160),
                color: `hsl(${rng(200, 260)}, ${rng(15, 35)}%, ${rng(40, 60)}%)`
            });
        }
        bgLayers.push({ speed: 0.35, items: midBuildings, type: 'buildings' });
        bgLayers.push({ speed: 1.0, type: 'ground' });
    }

    // ── Spawn Helpers ──
    function spawnThreat() {
        // Threats from ALL sides — birds from right, baseballs from below,
        // lightning from above, airplanes from left AND right, UFOs tracking, cats from below
        const types = [TH_BIRD, TH_BASEBALL, TH_BIRD];
        if (difficulty > 1) types.push(TH_LIGHTNING);
        if (difficulty > 2) types.push(TH_AIRPLANE, TH_CAT);
        if (difficulty > 4) types.push(TH_UFO);
        if (difficulty > 3) types.push(TH_LIGHTNING, TH_CAT); // more from above/below
        const type = pick(types);
        const t = { type, x: 0, y: 0, vx: 0, vy: 0, w: 16, h: 16, alive: true, frame: 0 };

        switch (type) {
            case TH_BIRD:
                // Birds come from right OR left
                if (Math.random() < 0.7) {
                    t.x = GAME_W + 20; t.y = rng(30, GAME_H - 80);
                    t.vx = -rng(1.5, 2.8); t.vy = rng(-0.3, 0.3);
                } else {
                    t.x = -20; t.y = rng(30, GAME_H - 80);
                    t.vx = rng(1.5, 2.8); t.vy = rng(-0.3, 0.3);
                }
                t.w = 18; t.h = 14;
                break;
            case TH_BASEBALL:
                // Baseballs from below, aimed upward
                t.x = rng(GAME_W * 0.1, GAME_W * 0.9); t.y = GAME_H + 10;
                t.vx = rng(-0.8, 0.8); t.vy = -rng(2.5, 4.5);
                t.w = 10; t.h = 10;
                break;
            case TH_LIGHTNING:
                // Lightning from above, targeting near drone
                t.x = droneX + rng(-100, 100); t.y = -10;
                t.vx = rng(-0.3, 0.3); t.vy = rng(2.0, 3.5);
                t.w = 8; t.h = 24;
                break;
            case TH_AIRPLANE:
                // Airplanes from either side
                if (Math.random() < 0.5) {
                    t.x = GAME_W + 40; t.y = rng(20, 160);
                    t.vx = -rng(2.5, 4.5); t.vy = rng(-0.3, 0.3);
                } else {
                    t.x = -40; t.y = rng(20, 160);
                    t.vx = rng(2.5, 4.5); t.vy = rng(-0.3, 0.3);
                }
                t.w = 36; t.h = 14;
                break;
            case TH_UFO:
                // UFOs appear from edges and track Kenny
                const side = Math.random();
                if (side < 0.33) { t.x = -30; t.y = rng(30, 150); t.vx = rng(0.8, 1.5); }
                else if (side < 0.66) { t.x = GAME_W + 30; t.y = rng(30, 150); t.vx = -rng(0.8, 1.5); }
                else { t.x = rng(50, GAME_W - 50); t.y = -20; t.vy = rng(0.5, 1.0); }
                t.w = 24; t.h = 14;
                t.tracking = true;
                break;
            case TH_CAT:
                // Cats flung from below
                t.x = rng(GAME_W * 0.1, GAME_W * 0.9); t.y = GAME_H + 10;
                t.vx = rng(-1.5, 1.5); t.vy = -rng(3.0, 5.0);
                t.w = 14; t.h = 14;
                t.spin = 0;
                break;
        }
        threats.push(t);
    }

    function spawnCoinPattern() {
        const cx = GAME_W + 30;
        const cy = rng(60, GAME_H - 100);
        const pattern = Math.floor(rng(0, 3));
        if (pattern === 0) {
            for (let i = 0; i < 5; i++) {
                coinItems.push({ x: cx + i * 22, y: cy, r: 6, collected: false, star: false });
            }
        } else if (pattern === 1) {
            for (let i = 0; i < 5; i++) {
                coinItems.push({ x: cx + i * 22, y: cy + Math.sin(i * 0.8) * 25, r: 6, collected: false, star: false });
            }
        } else {
            const offsets = [[-20,0],[0,-20],[20,0],[0,20],[0,0]];
            offsets.forEach((o, i) => {
                coinItems.push({ x: cx + o[0], y: cy + o[1], r: i === 4 ? 8 : 6, collected: false, star: i === 4 });
            });
        }
    }

    function spawnPowerup() {
        const types = [PU_AMMO, PU_AMMO, PU_AMMO, PU_SHIELD, PU_MAGNET];
        if (difficulty > 3) types.push(PU_BOMB);
        if (Math.random() < 0.1) types.push(PU_LIFE);
        const type = pick(types);
        powerups.push({
            x: GAME_W + 20, y: rng(50, GAME_H - 90),
            type, w: 18, h: 18, bobPhase: rng(0, Math.PI * 2)
        });
    }

    function spawnParticle(x, y, color, vx, vy, life) {
        particles.push({ x, y, vx: vx || rng(-2, 2), vy: vy || rng(-2, 2), life: life || 30, maxLife: life || 30, color, r: rng(1, 3) });
    }

    function spawnThrustParticle() {
        thrustParticles.push({
            x: droneX + rng(-8, 8), y: droneY + 14,
            vx: rng(-0.3, 0.3), vy: rng(0.5, 2),
            life: 15, maxLife: 15, r: rng(1, 3)
        });
    }

    function spawnExplosion(x, y) {
        explosions.push({ x, y, r: 0, maxR: EXPLOSION_MAX_R, life: 22, maxLife: 22 });
        sfxExplode();
        for (let i = 0; i < 10; i++) spawnParticle(x, y, pick(['#FF6B35', '#FFD700', '#FF4444', '#FFF']), rng(-3, 3), rng(-3, 3), 22);
    }

    function showMmph() {
        if (speechBubble) return;
        speechBubble = { text: pick(MMPHS), life: 80, maxLife: 80 };
        sfxMmph();
    }

    function addFloat(x, y, text, color) {
        floats.push({ x, y, text, life: 50, maxLife: 50, color: color || '#FFF' });
    }

    // ── Environment ──
    function getEnvColors() {
        switch (environment) {
            case ENV_SUBURBS: return { sky1: '#87CEEB', sky2: '#E0F0FF', ground: '#4CAF50', groundDark: '#388E3C' };
            case ENV_CITY: return { sky1: '#6BA3D6', sky2: '#BDD4E7', ground: '#607D8B', groundDark: '#455A64' };
            case ENV_MOUNTAIN: return { sky1: '#A8D8EA', sky2: '#E8F4F8', ground: '#8D6E63', groundDark: '#6D4C41' };
            case ENV_SPACE: return { sky1: '#0A0E27', sky2: '#1A1E3A', ground: '#37474F', groundDark: '#263238' };
            default: return { sky1: '#87CEEB', sky2: '#E0F0FF', ground: '#4CAF50', groundDark: '#388E3C' };
        }
    }

    // ── Drawing ──
    function drawSky() {
        const c = getEnvColors();
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, c.sky1);
        grad.addColorStop(1, c.sky2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        if (environment === ENV_SPACE) {
            ctx.fillStyle = '#FFF';
            for (let i = 0; i < 50; i++) {
                const sx = ((i * 137 + scrollX * 0.05) % GAME_W);
                const sy = (i * 73) % GAME_H;
                const sr = (Math.sin(frameCount * 0.05 + i) * 0.5 + 1);
                ctx.globalAlpha = 0.3 + Math.sin(frameCount * 0.03 + i * 2) * 0.3;
                ctx.fillRect(gs(sx), gs(sy), gs(sr), gs(sr));
            }
            ctx.globalAlpha = 1;
        }
    }

    function drawParallax() {
        const layer0 = bgLayers[0];
        if (layer0) {
            layer0.items.forEach(b => {
                const bx = ((b.x - scrollX * layer0.speed) % 2400 + 2400) % 2400 - 200;
                ctx.fillStyle = b.color;
                ctx.fillRect(gs(bx), gs(GAME_H - 50 - b.h * 0.5), gs(b.w), gs(b.h * 0.5 + 50));
            });
        }
        const layer1 = bgLayers[1];
        if (layer1) {
            layer1.items.forEach(b => {
                const bx = ((b.x - scrollX * layer1.speed) % 2000 + 2000) % 2000 - 200;
                ctx.fillStyle = b.color;
                ctx.fillRect(gs(bx), gs(GAME_H - 50 - b.h * 0.4), gs(b.w), gs(b.h * 0.4 + 50));
                ctx.fillStyle = 'rgba(255,255,200,0.3)';
                for (let wy = 0; wy < b.h * 0.35; wy += 12) {
                    for (let wx = 4; wx < b.w - 4; wx += 10) {
                        if (Math.random() > 0.3 || environment === ENV_SPACE)
                            ctx.fillRect(gs(bx + wx), gs(GAME_H - 45 - b.h * 0.4 + wy), gs(5), gs(7));
                    }
                }
            });
        }
    }

    function drawGround() {
        const c = getEnvColors();
        const gy = gs(GAME_H - 50);
        ctx.fillStyle = c.ground;
        ctx.fillRect(0, gy, W, H - gy);
        ctx.fillStyle = c.groundDark;
        ctx.fillRect(0, gy, W, gs(3));
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for (let i = 0; i < 40; i++) {
            const gx = ((i * 50 - scrollX * 1.0) % 2000 + 2000) % 2000 - 50;
            ctx.fillRect(gs(gx), gy + gs(8), gs(30), gs(2));
        }
    }

    function drawDrone(x, y, tilt) {
        if (__sprites.drone) {
            const dsz = gs(DRONE_W * 1.2);
            ctx.save();
            ctx.translate(gs(x), gs(y));
            ctx.rotate(tilt * 0.15);
            ctx.drawImage(__sprites.drone, -dsz/2, -dsz * 0.4, dsz, dsz * 0.6);
            ctx.restore();
            return;
        }
        ctx.save();
        ctx.translate(gs(x), gs(y));
        ctx.rotate(tilt * 0.15);

        // Drone body
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.roundRect(gs(-12), gs(-3), gs(24), gs(6), gs(3));
        ctx.fill();

        // Arms + rotors
        ctx.strokeStyle = '#444';
        ctx.lineWidth = gs(2);
        const armLen = 16;
        for (let i = 0; i < 4; i++) {
            const angle = (i < 2 ? -1 : 1) * (i % 2 === 0 ? 0.6 : 0.3);
            const ax = Math.cos(Math.PI * 0.5 + angle) * armLen * (i < 2 ? -1 : 1);
            const ay = Math.sin(Math.PI * 0.5 + angle) * armLen * -0.3;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(gs(ax), gs(ay));
            ctx.stroke();

            // LED
            ctx.fillStyle = accentColor || '#00FF88';
            ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.1 + i) * 0.3;
            ctx.beginPath();
            ctx.arc(gs(ax), gs(ay), gs(2), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Rotor blades
            ctx.strokeStyle = 'rgba(150,150,150,0.5)';
            ctx.lineWidth = gs(1);
            const rotAngle = frameCount * 0.4 + i * Math.PI * 0.5;
            ctx.beginPath();
            ctx.moveTo(gs(ax - Math.cos(rotAngle) * 8), gs(ay - Math.sin(rotAngle) * 2));
            ctx.lineTo(gs(ax + Math.cos(rotAngle) * 8), gs(ay + Math.sin(rotAngle) * 2));
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(gs(ax - Math.cos(rotAngle + Math.PI / 2) * 8), gs(ay - Math.sin(rotAngle + Math.PI / 2) * 2));
            ctx.lineTo(gs(ax + Math.cos(rotAngle + Math.PI / 2) * 8), gs(ay + Math.sin(rotAngle + Math.PI / 2) * 2));
            ctx.stroke();
        }

        // Camera underneath
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(0, gs(4), gs(2.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#44AAFF';
        ctx.beginPath();
        ctx.arc(0, gs(4), gs(1.2), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function drawKenny(x, y, angle) {
        const _kk = (hp <= 1) ? 'kennyHit' : 'kenny';
        if (__sprites[_kk]) {
            const ksz = gs(KENNY_H * 1.3);
            ctx.save();
            ctx.translate(gs(x), gs(y));
            ctx.rotate(angle || 0);
            if (kennyShakeTimer > 0) ctx.translate(gs(rng(-1.5, 1.5)), gs(rng(-1, 1)));
            ctx.drawImage(__sprites[_kk], -ksz * 0.4, -ksz * 0.8, ksz * 0.8, ksz);
            ctx.restore();
            return;
        }
        ctx.save();
        ctx.translate(gs(x), gs(y));
        ctx.rotate(angle || 0);

        // Shake if alert
        let shakeX = 0, shakeY = 0;
        if (kennyShakeTimer > 0) {
            shakeX = rng(-1.5, 1.5); shakeY = rng(-1, 1);
        }
        ctx.translate(gs(shakeX), gs(shakeY));

        // Bobble offset — gentle meditation breathing
        const bob = Math.sin(wobblePhase) * 1.5;

        // Legs (cross-legged meditation pose)
        ctx.fillStyle = '#FF8800';
        ctx.beginPath();
        ctx.ellipse(0, gs(8 + bob), gs(10), gs(4), 0, 0, Math.PI * 2);
        ctx.fill();

        // Body (orange parka)
        ctx.fillStyle = '#FF8800';
        ctx.beginPath();
        ctx.roundRect(gs(-7), gs(-8 + bob), gs(14), gs(16), gs(3));
        ctx.fill();

        // Parka detail line
        ctx.strokeStyle = '#CC6600';
        ctx.lineWidth = gs(0.8);
        ctx.beginPath();
        ctx.moveTo(0, gs(-4 + bob));
        ctx.lineTo(0, gs(7 + bob));
        ctx.stroke();

        // Hood
        ctx.fillStyle = '#FF8800';
        ctx.beginPath();
        ctx.arc(0, gs(-10 + bob), gs(9), 0, Math.PI * 2);
        ctx.fill();

        // Hood drawstring/rim
        ctx.fillStyle = '#CC6600';
        ctx.beginPath();
        ctx.arc(0, gs(-10 + bob), gs(7), 0, Math.PI * 2);
        ctx.fill();

        // Face opening
        ctx.fillStyle = '#FFCC88';
        ctx.beginPath();
        ctx.ellipse(0, gs(-10 + bob), gs(4.5), gs(5), 0, 0, Math.PI * 2);
        ctx.fill();

        // Eyes — wide when alert, normal otherwise
        const eyeR = kennyAlertTimer > 0 ? 2.0 : 1.2;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(gs(-2), gs(-11 + bob), gs(eyeR), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gs(2), gs(-11 + bob), gs(eyeR), 0, Math.PI * 2);
        ctx.fill();

        // Eye whites visible when alert
        if (kennyAlertTimer > 0) {
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(gs(-2), gs(-11 + bob), gs(eyeR), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(gs(-1.5), gs(-11 + bob), gs(1), 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(gs(2.5), gs(-11 + bob), gs(1), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(gs(2), gs(-11 + bob), gs(eyeR), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(gs(2.5), gs(-11.2 + bob), gs(1), 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(gs(-1.5), gs(-11.2 + bob), gs(1), 0, Math.PI * 2);
            ctx.fill();
        }

        // Gloves (mittens at sides — palms up, meditating)
        ctx.fillStyle = '#FF4444';
        ctx.beginPath();
        ctx.arc(gs(-9), gs(2 + bob), gs(3), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gs(9), gs(2 + bob), gs(3), 0, Math.PI * 2);
        ctx.fill();

        // Shield glow
        if (shieldTimer > 0) {
            ctx.strokeStyle = accentColor || '#00FFFF';
            ctx.lineWidth = gs(2);
            ctx.globalAlpha = 0.4 + Math.sin(frameCount * 0.15) * 0.2;
            ctx.beginPath();
            ctx.arc(0, gs(-2 + bob), gs(16), 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    function drawDeathKenny() {
        ctx.save();
        ctx.translate(gs(deathKennyX), gs(deathKennyY));
        ctx.rotate(deathKennySpin);

        if (deathType === TH_LIGHTNING) {
            if (deathTimer % 6 < 3) {
                ctx.fillStyle = '#FFF';
                ctx.beginPath();
                ctx.arc(0, gs(-10), gs(8), 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(gs(-3), gs(-11), gs(2), 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(gs(3), gs(-11), gs(2), 0, Math.PI * 2);
                ctx.fill();
                ctx.fillRect(gs(-5), gs(-2), gs(10), gs(14));
                for (let i = 0; i < 3; i++) {
                    ctx.fillStyle = '#FFF';
                    ctx.fillRect(gs(-4), gs(i * 4), gs(8), gs(1.5));
                }
            } else {
                drawKenny(0, 0, 0);
            }
            ctx.strokeStyle = '#FFFF00';
            ctx.lineWidth = gs(1.5);
            for (let i = 0; i < 4; i++) {
                const a = (frameCount * 0.3 + i * Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(gs(Math.cos(a) * 12), gs(Math.sin(a) * 12));
                ctx.lineTo(gs(Math.cos(a) * 20 + rng(-3, 3)), gs(Math.sin(a) * 20 + rng(-3, 3)));
                ctx.stroke();
            }
        } else if (deathType === TH_UFO) {
            ctx.globalAlpha = Math.max(0, 1 - deathTimer / 80);
            drawKenny(0, 0, deathKennySpin);
            ctx.globalAlpha = 1;
        } else {
            drawKenny(0, 0, 0);
        }

        ctx.restore();
    }

    function drawThreats() {
        threats.forEach(t => {
            if (!t.alive) return;
            ctx.save();
            ctx.translate(gs(t.x), gs(t.y));

            // Sprite threats
            const _tMap = { [TH_BIRD]:'enemyBird', [TH_BASEBALL]:'enemyBall', [TH_AIRPLANE]:'enemyPlane', [TH_UFO]:'enemyUFO', [TH_CAT]:'enemyCat' };
            const _tsk = _tMap[t.type];
            if (_tsk && __sprites[_tsk]) {
                const _tsz = gs(t.type === TH_AIRPLANE ? 30 : t.type === TH_UFO ? 28 : 18);
                ctx.drawImage(__sprites[_tsk], -_tsz/2, -_tsz/2, _tsz, _tsz);
                ctx.restore();
                return;
            }

            switch (t.type) {
                case TH_BIRD:
                    ctx.fillStyle = '#333';
                    ctx.beginPath();
                    ctx.ellipse(0, 0, gs(9), gs(5), 0, 0, Math.PI * 2);
                    ctx.fill();
                    const wingY = Math.sin(frameCount * 0.3 + t.x) * 6;
                    ctx.fillStyle = '#555';
                    ctx.beginPath();
                    ctx.moveTo(gs(-4), 0);
                    ctx.lineTo(gs(-12), gs(-wingY));
                    ctx.lineTo(gs(-2), gs(-2));
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(gs(4), 0);
                    ctx.lineTo(gs(12), gs(-wingY));
                    ctx.lineTo(gs(2), gs(-2));
                    ctx.fill();
                    ctx.fillStyle = '#FF0';
                    ctx.beginPath();
                    ctx.arc(gs(6), gs(-2), gs(1.5), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#FF8800';
                    ctx.beginPath();
                    ctx.moveTo(gs(9), gs(-1));
                    ctx.lineTo(gs(13), gs(0));
                    ctx.lineTo(gs(9), gs(1));
                    ctx.fill();
                    break;

                case TH_BASEBALL:
                    ctx.fillStyle = '#FFF';
                    ctx.beginPath();
                    ctx.arc(0, 0, gs(5), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#CC0000';
                    ctx.lineWidth = gs(0.8);
                    ctx.beginPath();
                    ctx.arc(gs(-2), 0, gs(3), -0.8, 0.8);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(gs(2), 0, gs(3), Math.PI - 0.8, Math.PI + 0.8);
                    ctx.stroke();
                    break;

                case TH_LIGHTNING:
                    ctx.fillStyle = '#FFFF00';
                    ctx.strokeStyle = '#FFAA00';
                    ctx.lineWidth = gs(1);
                    ctx.beginPath();
                    ctx.moveTo(0, gs(-12));
                    ctx.lineTo(gs(4), gs(-3));
                    ctx.lineTo(gs(-1), gs(-2));
                    ctx.lineTo(gs(3), gs(12));
                    ctx.lineTo(gs(-3), gs(2));
                    ctx.lineTo(gs(1), gs(3));
                    ctx.lineTo(gs(-2), gs(-12));
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    break;

                case TH_AIRPLANE:
                    ctx.fillStyle = '#DDD';
                    ctx.beginPath();
                    ctx.ellipse(0, 0, gs(18), gs(5), 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#BBB';
                    ctx.beginPath();
                    ctx.moveTo(gs(-5), 0);
                    ctx.lineTo(gs(-2), gs(-12));
                    ctx.lineTo(gs(5), gs(-12));
                    ctx.lineTo(gs(2), 0);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(gs(-15), 0);
                    ctx.lineTo(gs(-18), gs(-7));
                    ctx.lineTo(gs(-12), gs(-7));
                    ctx.lineTo(gs(-10), 0);
                    ctx.fill();
                    ctx.fillStyle = '#44AAFF';
                    ctx.fillRect(gs(12), gs(-3), gs(4), gs(3));
                    break;

                case TH_UFO:
                    ctx.fillStyle = '#88FF88';
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.ellipse(0, gs(-5), gs(8), gs(7), 0, Math.PI, 0);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = '#888';
                    ctx.beginPath();
                    ctx.ellipse(0, gs(-2), gs(14), gs(5), 0, 0, Math.PI * 2);
                    ctx.fill();
                    for (let i = 0; i < 4; i++) {
                        const lx = (i - 1.5) * 6;
                        ctx.fillStyle = ['#FF0', '#0FF', '#F0F', '#0F0'][i];
                        ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.2 + i) * 0.3;
                        ctx.beginPath();
                        ctx.arc(gs(lx), gs(-1), gs(1.5), 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.globalAlpha = 1;
                    break;

                case TH_CAT:
                    ctx.save();
                    ctx.rotate(t.spin || 0);
                    ctx.fillStyle = '#888';
                    ctx.beginPath();
                    ctx.ellipse(0, 0, gs(7), gs(5), 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(gs(5), gs(-3), gs(4), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(gs(3), gs(-6)); ctx.lineTo(gs(4), gs(-10)); ctx.lineTo(gs(6), gs(-6));
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(gs(6), gs(-6)); ctx.lineTo(gs(7), gs(-10)); ctx.lineTo(gs(9), gs(-6));
                    ctx.fill();
                    ctx.fillStyle = '#0F0';
                    ctx.beginPath();
                    ctx.arc(gs(4), gs(-4), gs(1), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(gs(7), gs(-4), gs(1), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#888';
                    ctx.lineWidth = gs(1.5);
                    ctx.beginPath();
                    ctx.moveTo(gs(-7), 0);
                    ctx.quadraticCurveTo(gs(-12), gs(-8), gs(-10), gs(-12));
                    ctx.stroke();
                    ctx.restore();
                    break;
            }
            ctx.restore();
        });
    }

    function drawMissiles() {
        missiles.forEach(m => {
            ctx.save();
            ctx.translate(gs(m.x), gs(m.y));
            const a = Math.atan2(m.vy, m.vx);
            ctx.rotate(a);
            if (__sprites.missile) {
                const msz = gs(14);
                ctx.drawImage(__sprites.missile, -msz * 0.3, -msz / 2, msz, msz);
                ctx.restore();
                return;
            }
            ctx.fillStyle = '#FF4444';
            ctx.beginPath();
            ctx.moveTo(gs(6), 0);
            ctx.lineTo(gs(-4), gs(-3));
            ctx.lineTo(gs(-4), gs(3));
            ctx.closePath();
            ctx.fill();
            // Smoke trail
            ctx.fillStyle = 'rgba(200,200,200,0.4)';
            for (let i = 1; i <= 3; i++) {
                ctx.beginPath();
                ctx.arc(gs(-4 - i * 4), gs(rng(-1, 1)), gs(1.5 + i * 0.5), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        });
    }

    function drawExplosions() {
        explosions.forEach(e => {
            const t = 1 - e.life / e.maxLife;
            const r = e.maxR * t;
            ctx.globalAlpha = 1 - t;
            const grad = ctx.createRadialGradient(gs(e.x), gs(e.y), 0, gs(e.x), gs(e.y), gs(r));
            grad.addColorStop(0, '#FFF');
            grad.addColorStop(0.3, '#FFAA33');
            grad.addColorStop(0.7, '#FF4400');
            grad.addColorStop(1, 'rgba(255,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(gs(e.x), gs(e.y), gs(r), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        });
    }

    function drawPowerups() {
        powerups.forEach(p => {
            const bob = Math.sin(frameCount * 0.08 + p.bobPhase) * 3;
            ctx.save();
            ctx.translate(gs(p.x), gs(p.y + bob));
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = p.type === PU_LIFE ? '#FF4444' : accentColor || '#00FF88';
            ctx.beginPath();
            ctx.arc(0, 0, gs(14), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.roundRect(gs(-9), gs(-9), gs(18), gs(18), gs(3));
            ctx.fill();
            ctx.fillStyle = '#333';
            ctx.font = `bold ${gs(12)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const icons = ['A', 'S', 'M', 'B', '+'];
            ctx.fillText(icons[p.type], 0, gs(1));
            ctx.restore();
        });
    }

    function drawCoins() {
        coinItems.forEach(c => {
            if (c.collected) return;
            const glow = Math.sin(frameCount * 0.1 + c.x * 0.1) * 0.2 + 0.3;
            ctx.globalAlpha = glow + 0.5;
            ctx.fillStyle = c.star ? '#FFDD00' : '#FFD700';
            ctx.beginPath();
            if (c.star) {
                const cx = gs(c.x), cy = gs(c.y), or = gs(c.r), ir = gs(c.r * 0.4);
                ctx.moveTo(cx, cy - or);
                for (let i = 0; i < 5; i++) {
                    const a1 = (i * 2 * Math.PI / 5) - Math.PI / 2;
                    const a2 = a1 + Math.PI / 5;
                    ctx.lineTo(cx + Math.cos(a1) * or, cy + Math.sin(a1) * or);
                    ctx.lineTo(cx + Math.cos(a2) * ir, cy + Math.sin(a2) * ir);
                }
                ctx.closePath();
            } else {
                ctx.arc(gs(c.x), gs(c.y), gs(c.r), 0, Math.PI * 2);
            }
            ctx.fill();
            ctx.globalAlpha = 1;
        });
    }

    function drawSpeechBubble() {
        if (!speechBubble || speechBubble.life <= 0) return;
        const alpha = Math.min(1, speechBubble.life / 15);
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${gs(10)}px monospace`;
        ctx.textAlign = 'left';
        const tw = ctx.measureText(speechBubble.text).width;
        const bx = gs(droneX + 15), by = gs(droneY - 30);
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.roundRect(bx - gs(4), by - gs(10), tw + gs(8), gs(16), gs(4));
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(bx, by + gs(6));
        ctx.lineTo(bx - gs(6), by + gs(12));
        ctx.lineTo(bx + gs(6), by + gs(6));
        ctx.fill();
        ctx.fillStyle = '#333';
        ctx.fillText(speechBubble.text, bx, by + gs(2));
        ctx.globalAlpha = 1;
    }

    function drawCrosshair() {
        if (state !== ST_PLAYING || !crosshairVisible) return;
        ctx.save();
        ctx.strokeStyle = accentColor || '#FF4444';
        ctx.lineWidth = gs(1.2);
        ctx.globalAlpha = 0.7;
        const cx = gs(mouseX), cy = gs(mouseY);
        const r = gs(10);
        // Circle
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        // Cross lines
        ctx.beginPath();
        ctx.moveTo(cx - r - gs(4), cy); ctx.lineTo(cx - r + gs(3), cy);
        ctx.moveTo(cx + r - gs(3), cy); ctx.lineTo(cx + r + gs(4), cy);
        ctx.moveTo(cx, cy - r - gs(4)); ctx.lineTo(cx, cy - r + gs(3));
        ctx.moveTo(cx, cy + r - gs(3)); ctx.lineTo(cx, cy + r + gs(4));
        ctx.stroke();
        // Dot
        ctx.fillStyle = accentColor || '#FF4444';
        ctx.beginPath();
        ctx.arc(cx, cy, gs(1.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawHUD() {
        ctx.save();
        // Score
        ctx.font = `bold ${gs(16)}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFF';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = gs(2);
        ctx.strokeText(`Score: ${score}`, gs(10), gs(22));
        ctx.fillText(`Score: ${score}`, gs(10), gs(22));

        // Coins
        ctx.font = `${gs(12)}px monospace`;
        ctx.strokeText(`Coins: ${coins}`, gs(10), gs(38));
        ctx.fillText(`Coins: ${coins}`, gs(10), gs(38));

        // Ammo bar (right side)
        ctx.textAlign = 'right';
        ctx.font = `bold ${gs(14)}px monospace`;
        const ammoText = `Ammo: ${'|'.repeat(ammo)}${'.'.repeat(Math.max(0, MAX_AMMO - ammo))}`;
        ctx.strokeText(ammoText, gs(GAME_W - 10), gs(22));
        ctx.fillText(ammoText, gs(GAME_W - 10), gs(22));

        // HP (hearts)
        ctx.textAlign = 'right';
        ctx.font = `${gs(13)}px monospace`;
        const hpText = '\u2764'.repeat(hp) + '\u2661'.repeat(Math.max(0, MAX_HP - hp));
        ctx.fillStyle = '#FF4444';
        ctx.strokeText(hpText, gs(GAME_W - 10), gs(38));
        ctx.fillText(hpText, gs(GAME_W - 10), gs(38));

        // Shield indicator
        if (shieldTimer > 0) {
            ctx.textAlign = 'center';
            ctx.font = `bold ${gs(11)}px monospace`;
            ctx.fillStyle = accentColor || '#00FFFF';
            ctx.fillText('SHIELD', gs(GAME_W / 2), gs(22));
        }

        // Environment name
        ctx.textAlign = 'center';
        ctx.font = `${gs(9)}px monospace`;
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        const envNames = ['SUBURBS', 'CITY', 'MOUNTAINS', 'SPACE'];
        ctx.fillText(envNames[environment], gs(GAME_W / 2), gs(GAME_H - 55));

        ctx.restore();
    }

    function drawFloats() {
        floats.forEach(f => {
            const alpha = f.life / f.maxLife;
            const yOff = (1 - alpha) * 20;
            ctx.globalAlpha = alpha;
            ctx.font = `bold ${gs(12)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillStyle = f.color;
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = gs(1.5);
            ctx.strokeText(f.text, gs(f.x), gs(f.y - yOff));
            ctx.fillText(f.text, gs(f.x), gs(f.y - yOff));
            ctx.globalAlpha = 1;
        });
    }

    function drawParticles() {
        particles.forEach(p => {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(gs(p.x), gs(p.y), gs(p.r * alpha), 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    function drawThrust() {
        thrustParticles.forEach(p => {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha * 0.6;
            ctx.fillStyle = `hsl(${30 + (1 - alpha) * 20}, 100%, ${60 + alpha * 30}%)`;
            ctx.beginPath();
            ctx.arc(gs(p.x), gs(p.y), gs(p.r * alpha), 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    function drawDeathScreen() {
        if (deathPhase >= 1) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const a1 = clamp(deathTextAlpha, 0, 1);
            ctx.globalAlpha = a1;

            ctx.fillStyle = `rgba(0,0,0,${a1 * 0.4})`;
            ctx.fillRect(0, 0, W, H);

            ctx.font = `bold ${gs(28)}px monospace`;
            ctx.fillStyle = '#FF4444';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = gs(3);
            ctx.strokeText('OH MY GOD!', gs(GAME_W / 2), gs(GAME_H / 2 - 30));
            ctx.fillText('OH MY GOD!', gs(GAME_W / 2), gs(GAME_H / 2 - 30));

            ctx.font = `bold ${gs(22)}px monospace`;
            ctx.fillStyle = '#FF8844';
            ctx.strokeText('THEY KILLED KENNY!', gs(GAME_W / 2), gs(GAME_H / 2 + 5));
            ctx.fillText('THEY KILLED KENNY!', gs(GAME_W / 2), gs(GAME_H / 2 + 5));

            if (deathPhase >= 2) {
                const a2 = clamp((deathTextAlpha - 0.5) * 2, 0, 1);
                ctx.globalAlpha = a2;
                ctx.font = `bold ${gs(16)}px monospace`;
                ctx.fillStyle = '#FFAA44';
                ctx.strokeText('YOU BASTARDS!', gs(GAME_W / 2), gs(GAME_H / 2 + 35));
                ctx.fillText('YOU BASTARDS!', gs(GAME_W / 2), gs(GAME_H / 2 + 35));
            }

            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    function drawSplash() {
        drawSky();
        drawParallax();
        drawGround();

        // Kenny on drone, bouncing peacefully
        splashBounce += 0.03;
        const by = GAME_H / 2 - 20 + Math.sin(splashBounce) * 10;
        drawDrone(GAME_W / 2, by + 18, 0);
        drawKenny(GAME_W / 2, by, 0);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = `bold ${gs(36)}px monospace`;
        ctx.fillStyle = '#FF8800';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = gs(4);
        ctx.strokeText('SAVE KENNY', gs(GAME_W / 2), gs(70));
        ctx.fillText('SAVE KENNY', gs(GAME_W / 2), gs(70));

        ctx.font = `${gs(11)}px monospace`;
        ctx.fillStyle = '#FFF';
        const blink = Math.sin(frameCount * 0.06) > 0;
        if (blink) {
            ctx.fillText(HAS_TOUCH ? 'TAP LEFT = Fly   TAP RIGHT = Shoot' : 'SPACE = Fly   CLICK = Shoot', gs(GAME_W / 2), gs(GAME_H - 90));
        }

        ctx.font = `${gs(9)}px monospace`;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(HAS_TOUCH ? 'Arrows to drift. Fly the drone AND shoot threats!' : 'Arrow keys to drift. Fly the drone AND shoot threats!', gs(GAME_W / 2), gs(GAME_H - 74));

        ctx.font = `${gs(8)}px monospace`;
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('He always dies. How long can you keep him alive?', gs(GAME_W / 2), gs(GAME_H - 60));

        if (frameCount % 120 === 60) showMmph();

        ctx.restore();
    }

    function drawGameOver() {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = `bold ${gs(32)}px monospace`;
        ctx.fillStyle = '#FF4444';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = gs(3);
        ctx.strokeText('GAME OVER', gs(GAME_W / 2), gs(GAME_H / 2 - 50));
        ctx.fillText('GAME OVER', gs(GAME_W / 2), gs(GAME_H / 2 - 50));

        ctx.font = `bold ${gs(18)}px monospace`;
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`Score: ${score}`, gs(GAME_W / 2), gs(GAME_H / 2 - 10));

        ctx.font = `${gs(14)}px monospace`;
        ctx.fillStyle = '#FFF';
        ctx.fillText(`Coins: ${coins}`, gs(GAME_W / 2), gs(GAME_H / 2 + 18));

        const deathNames = ['pecked by birds', 'beaned by a baseball', 'struck by lightning',
                           'splattered on a windshield', 'abducted by aliens', 'launched by a catapult cat',
                           'hit by too many threats', 'overwhelmed by chaos'];
        const causeIdx = deathType >= 0 && deathType <= 5 ? deathType : (deathType === -2 ? 6 : 7);
        ctx.font = `${gs(10)}px monospace`;
        ctx.fillStyle = '#FF8844';
        ctx.fillText(`Kenny was ${deathNames[causeIdx]}`, gs(GAME_W / 2), gs(GAME_H / 2 + 45));

        if (bestScore > 0) {
            ctx.font = `${gs(12)}px monospace`;
            ctx.fillStyle = score >= bestScore ? '#FFD700' : '#888';
            ctx.fillText(score >= bestScore ? `NEW BEST: ${bestScore}` : `Best: ${bestScore}`, gs(GAME_W / 2), gs(GAME_H / 2 + 62));
        }

        const blink2 = Math.sin(frameCount * 0.06) > 0;
        if (blink2) {
            ctx.font = `${gs(12)}px monospace`;
            ctx.fillStyle = '#FFF';
            ctx.fillText('Click or tap to try again', gs(GAME_W / 2), gs(GAME_H / 2 + 75));
        }

        ctx.restore();
    }

    // ── Missile launch site marker ──
    function drawLaunchBase() {
        ctx.save();
        const baseY = GAME_H - 50;

        // Launch platform — triangular bunker
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.moveTo(gs(GAME_W / 2 - 35), gs(baseY));
        ctx.lineTo(gs(GAME_W / 2), gs(baseY - 14));
        ctx.lineTo(gs(GAME_W / 2 + 35), gs(baseY));
        ctx.closePath();
        ctx.fill();

        // Missile silo glow
        ctx.fillStyle = ammo > 0 ? (accentColor || '#FF4444') : 'rgba(100,100,100,0.3)';
        ctx.globalAlpha = 0.4 + Math.sin(frameCount * 0.1) * 0.15;
        ctx.beginPath();
        ctx.arc(gs(GAME_W / 2), gs(baseY - 6), gs(4), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Ammo display dots on the base
        for (let i = 0; i < MAX_AMMO; i++) {
            const dotX = GAME_W / 2 - 28 + i * (56 / MAX_AMMO);
            ctx.fillStyle = i < ammo ? (accentColor || '#FF4444') : 'rgba(255,255,255,0.08)';
            ctx.beginPath();
            ctx.arc(gs(dotX + 2), gs(baseY - 2), gs(1.5), 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // ── Touch zone indicators (mobile) ──
    function drawTouchZones() {
        if (!HAS_TOUCH || state !== ST_PLAYING) return;
        ctx.save();
        ctx.globalAlpha = 0.04;
        // Left half — fly zone
        ctx.fillStyle = '#00AAFF';
        ctx.fillRect(0, 0, gs(GAME_W / 2), H);
        // Right half — shoot zone
        ctx.fillStyle = '#FF4444';
        ctx.fillRect(gs(GAME_W / 2), 0, gs(GAME_W / 2), H);
        ctx.globalAlpha = 1;

        // Subtle labels at bottom
        ctx.globalAlpha = 0.15;
        ctx.font = `bold ${gs(10)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFF';
        ctx.fillText('FLY', gs(GAME_W * 0.25), gs(GAME_H - 55));
        ctx.fillText('SHOOT', gs(GAME_W * 0.75), gs(GAME_H - 55));
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // ── Update Logic ──
    function resetGame() {
        score = 0; coins = 0; hp = MAX_HP; ammo = MAX_AMMO;
        shieldTimer = 0;
        droneX = DRONE_START_X; droneY = DRONE_START_Y; droneVY = 0; droneVX = 0;
        droneTilt = 0;
        ammoRegenTimer = 0;
        kennyAlive = true;
        kennyAlertTimer = 0; kennyShakeTimer = 0;
        wobblePhase = 0;
        scrollX = 0; scrollSpeed = SCROLL_SPEED_BASE;
        difficulty = 1;
        environment = ENV_SUBURBS; envTimer = 0;
        threats = []; missiles = []; explosions = [];
        powerups = []; coinItems = []; particles = []; thrustParticles = [];
        floats = [];
        threatTimer = 90;
        powerupTimer = 250;
        coinSpawnTimer = 180;
        speechBubble = null; speechTimer = 0;
        deathType = -1; deathTimer = 0; deathPhase = 0; deathTextAlpha = 0;
        generateBG();
    }

    function startGame() {
        if (state === ST_SPLASH || state === ST_GAMEOVER) {
            state = ST_PLAYING;
            resetGame();
            ensureAudio();
        }
    }

    function shoot(tx, ty) {
        if (state !== ST_PLAYING || ammo <= 0) return;
        ammo--;
        // Missile fires FROM bottom center of screen TO target point
        const startX = GAME_W / 2;
        const startY = GAME_H - 55;
        const dx = tx - startX, dy = ty - startY;
        const d = Math.hypot(dx, dy) || 1;
        missiles.push({
            x: startX, y: startY,
            vx: (dx / d) * MISSILE_SPEED,
            vy: (dy / d) * MISSILE_SPEED,
            tx, ty,
            life: 150
        });
        sfxShoot();
        sfxLaunch();
    }

    function takeDamage(type) {
        if (shieldTimer > 0) {
            shieldTimer = 0;
            addFloat(droneX, droneY - 20, 'SHIELD BROKEN!', '#00FFFF');
            for (let i = 0; i < 12; i++) spawnParticle(droneX, droneY, '#00FFFF');
            return;
        }
        hp--;
        sfxHit();
        kennyShakeTimer = 20;
        kennyAlertTimer = 40;
        showMmph();
        // Screen flash
        for (let i = 0; i < 6; i++) spawnParticle(droneX + rng(-15, 15), droneY + rng(-15, 15), '#FF4444');
        addFloat(droneX, droneY - 25, `-1 HP`, '#FF4444');

        if (hp <= 0) {
            triggerDeath(type);
        }
    }

    function triggerDeath(type) {
        state = ST_DYING;
        deathType = type;
        deathTimer = 0;
        deathPhase = 0;
        deathTextAlpha = 0;
        deathKennyX = droneX;
        deathKennyY = droneY - 14;
        deathKennySpin = 0;
        kennyAlive = false;
        sfxDeath();

        switch (type) {
            case TH_BIRD:
                deathKennyVelX = rng(-1, 1); deathKennyVelY = -3; break;
            case TH_BASEBALL:
                deathKennyVelX = rng(-3, 3); deathKennyVelY = -4; break;
            case TH_LIGHTNING:
                deathKennyVelX = 0; deathKennyVelY = 0.5; break;
            case TH_AIRPLANE:
                deathKennyVelX = -6; deathKennyVelY = -1; break;
            case TH_UFO:
                deathKennyVelX = 0; deathKennyVelY = -2; break;
            case TH_CAT:
                deathKennyVelX = rng(-4, 4); deathKennyVelY = -5; break;
            default:
                deathKennyVelX = rng(-2, 2); deathKennyVelY = 2; break;
        }
    }

    function updatePlaying(dt) {
        frameCount++;
        wobblePhase += 0.04; // slower, calmer breathing
        scrollX += scrollSpeed;
        envTimer++;

        // Difficulty ramp — gradual, gives player time to learn both controls
        difficulty = 1 + Math.floor(score / 500);
        scrollSpeed = SCROLL_SPEED_BASE + difficulty * 0.08;

        // Environment cycling
        if (envTimer > 1200) {
            envTimer = 0;
            environment = (environment + 1) % 4;
            addFloat(GAME_W / 2, 60, ['SUBURBS', 'CITY', 'MOUNTAINS', 'SPACE'][environment], '#FFD700');
            generateBG();
        }

        // ── Flappy-style drone flight ──
        // Gravity pulls down, Space/tap boosts up — Kenny just rides
        droneVY += GRAVITY;
        if (droneVY > MAX_FALL) droneVY = MAX_FALL;
        droneY += droneVY;

        // Arrow keys for horizontal drift
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) droneVX -= DRIFT_SPEED * 0.15;
        if (keys['ArrowRight'] || keys['d'] || keys['D']) droneVX += DRIFT_SPEED * 0.15;
        // ArrowDown / S = quick dive (useful for dodging)
        if (keys['ArrowDown'] || keys['s'] || keys['S']) droneVY += 0.35;
        droneVX *= DRIFT_FRICTION;
        droneVX = clamp(droneVX, -DRIFT_SPEED, DRIFT_SPEED);
        droneX += droneVX;

        // Clamp to screen
        if (droneY < 20) { droneY = 20; droneVY = 0; }
        if (droneY > GAME_H - 60) { droneY = GAME_H - 60; droneVY = 0; }
        if (droneX < 25) { droneX = 25; droneVX = 0; }
        if (droneX > GAME_W - 25) { droneX = GAME_W - 25; droneVX = 0; }

        // Tilt follows velocity — both horizontal and vertical
        droneTilt = clamp(droneVY * 0.05 + droneVX * 0.08, -0.35, 0.35);

        // Ammo auto-regenerates slowly
        ammoRegenTimer++;
        if (ammoRegenTimer >= AMMO_REGEN_RATE && ammo < MAX_AMMO) {
            ammo++;
            ammoRegenTimer = 0;
        }

        // Gentle thrust particles
        if (frameCount % 4 === 0) spawnThrustParticle();

        // ── Alert: check if any threat is close ──
        if (kennyAlertTimer > 0) kennyAlertTimer--;
        if (kennyShakeTimer > 0) kennyShakeTimer--;
        let closestDist = Infinity;
        threats.forEach(t => {
            if (!t.alive) return;
            const d = dist(t.x, t.y, droneX, droneY);
            if (d < closestDist) closestDist = d;
        });
        if (closestDist < 70) {
            kennyAlertTimer = Math.max(kennyAlertTimer, 10);
            if (closestDist < 45) kennyShakeTimer = Math.max(kennyShakeTimer, 5);
            // Mmph when something gets really close
            if (closestDist < 40 && !speechBubble && Math.random() < 0.08) showMmph();
        }

        // ── Threats ──
        threatTimer--;
        if (threatTimer <= 0) {
            spawnThreat();
            // Manageable pace: starts generous, ramps up
            threatTimer = Math.max(30, 110 - difficulty * 10);
            // Spawn doubles at higher difficulty for more chaos
            if (difficulty > 3 && Math.random() < 0.25) {
                setTimeout(() => { if (state === ST_PLAYING) spawnThreat(); }, 300);
            }
            if (difficulty > 6 && Math.random() < 0.2) {
                setTimeout(() => { if (state === ST_PLAYING) spawnThreat(); }, 600);
            }
        }
        threats.forEach(t => {
            if (!t.alive) return;
            t.x += t.vx; t.y += t.vy;
            t.frame++;

            if (t.type === TH_BASEBALL) t.vy += 0.08;
            if (t.type === TH_CAT) { t.vy += 0.1; t.spin = (t.spin || 0) + 0.15; }
            // UFO tracks Kenny
            if (t.type === TH_UFO && t.tracking) {
                const tdx = droneX - t.x, tdy = droneY - t.y;
                const td = Math.hypot(tdx, tdy) || 1;
                t.vx += (tdx / td) * 0.04;
                t.vy += (tdy / td) * 0.04;
                t.vx *= 0.99; t.vy *= 0.99;
            }
            if (t.type === TH_BIRD) t.vy = Math.sin(t.frame * 0.08) * 1.0;

            // Off-screen removal
            if (t.x < -60 || t.x > GAME_W + 70 || t.y > GAME_H + 40 || t.y < -60) t.alive = false;

            // Collision with kenny/drone
            if (t.alive && dist(t.x, t.y, droneX, droneY) < 20) {
                t.alive = false;
                for (let i = 0; i < 5; i++) spawnParticle(t.x, t.y, '#FF8844');
                takeDamage(t.type);
                return;
            }
        });
        threats = threats.filter(t => t.alive);

        // ── Missiles ──
        missiles.forEach(m => {
            m.x += m.vx; m.y += m.vy;
            m.life--;
            // Reached target area?
            if (dist(m.x, m.y, m.tx, m.ty) < 10 || m.life <= 0) {
                spawnExplosion(m.x, m.y);
                m.life = 0;
            }
            // Off screen?
            if (m.x < -20 || m.x > GAME_W + 20 || m.y < -20 || m.y > GAME_H + 20) m.life = 0;
        });
        missiles = missiles.filter(m => m.life > 0);

        // ── Explosions vs Threats ──
        explosions.forEach(e => {
            const r = e.maxR * (1 - e.life / e.maxLife);
            threats.forEach(t => {
                if (t.alive && dist(t.x, t.y, e.x, e.y) < r + 12) {
                    t.alive = false;
                    score += 25;
                    addFloat(t.x, t.y, '+25', '#FF8844');
                    for (let i = 0; i < 6; i++) spawnParticle(t.x, t.y, '#FF8844');
                }
            });
        });
        explosions.forEach(e => { e.life--; });
        explosions = explosions.filter(e => e.life > 0);

        // ── Power-ups ──
        powerupTimer--;
        if (powerupTimer <= 0) {
            spawnPowerup();
            powerupTimer = Math.max(120, 280 - difficulty * 12);
        }
        powerups.forEach(p => { p.x -= scrollSpeed; });
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            if (p.x < -30) { powerups.splice(i, 1); continue; }
            // Auto-collect when drone flies near
            if (dist(p.x, p.y, droneX, droneY) < 22) {
                sfxPowerup();
                switch (p.type) {
                    case PU_AMMO: ammo = Math.min(MAX_AMMO, ammo + 5); addFloat(p.x, p.y, '+5 AMMO', '#0FF'); break;
                    case PU_SHIELD: shieldTimer = SHIELD_DURATION; addFloat(p.x, p.y, 'SHIELD!', '#0FF'); break;
                    case PU_MAGNET:
                        coinItems.forEach(c => { if (!c.collected) c.magnetized = true; });
                        addFloat(p.x, p.y, 'MAGNET!', '#FF00FF');
                        break;
                    case PU_BOMB:
                        sfxBomb();
                        threats.forEach(t => {
                            if (t.alive) {
                                t.alive = false;
                                score += 25;
                                spawnExplosion(t.x, t.y);
                            }
                        });
                        addFloat(p.x, p.y, 'MEGA BOMB!', '#FF4444');
                        break;
                    case PU_LIFE:
                        hp = Math.min(MAX_HP, hp + 1);
                        addFloat(p.x, p.y, '+1 HP!', '#FF4444');
                        break;
                }
                powerups.splice(i, 1);
            }
        }

        // ── Coins — spawn and auto-collect ──
        coinSpawnTimer--;
        if (coinSpawnTimer <= 0) {
            spawnCoinPattern();
            coinSpawnTimer = Math.max(100, 200 - difficulty * 8);
        }
        coinItems.forEach(c => { c.x -= scrollSpeed; });
        coinItems.forEach(c => {
            if (c.collected) return;
            if (c.magnetized) {
                const dx = droneX - c.x, dy = droneY - c.y;
                const d = Math.hypot(dx, dy) || 1;
                c.x += (dx / d) * 3;
                c.y += (dy / d) * 3;
            }
            // Auto-collect when drone flies through
            if (dist(c.x, c.y, droneX, droneY) < 18) {
                c.collected = true;
                if (c.star) { score += 50; coins += 5; sfxStar(); addFloat(c.x, c.y, '+50', '#FFD700'); }
                else { score += 5; coins++; sfxCoin(); }
            }
        });
        coinItems = coinItems.filter(c => !c.collected && c.x > -20);

        // ── Particles ──
        particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life--; });
        particles = particles.filter(p => p.life > 0);
        thrustParticles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; });
        thrustParticles = thrustParticles.filter(p => p.life > 0);

        // ── Floats ──
        floats.forEach(f => { f.life--; });
        floats = floats.filter(f => f.life > 0);

        // ── Speech bubbles ──
        if (speechBubble) {
            speechBubble.life--;
            if (speechBubble.life <= 0) speechBubble = null;
        }
        speechTimer++;
        if (speechTimer > 250 + Math.random() * 400) {
            speechTimer = 0;
            showMmph();
        }

        // Shield tick
        if (shieldTimer > 0) shieldTimer--;

        // Score from distance (surviving)
        if (frameCount % 10 === 0) score++;
    }

    function updateDying(dt) {
        frameCount++;
        deathTimer++;

        if (deathType === TH_UFO) {
            deathKennyY -= 2;
            deathKennySpin += 0.08;
        } else if (deathType === TH_LIGHTNING) {
            if (deathTimer > 30) {
                deathKennyVelY += 0.15;
                deathKennyY += deathKennyVelY;
            }
            deathKennySpin += 0.05;
        } else {
            deathKennyVelY += 0.15;
            deathKennyX += deathKennyVelX;
            deathKennyY += deathKennyVelY;
            deathKennySpin += 0.12;
        }

        if (deathTimer % 4 === 0 && deathTimer < 40) {
            spawnParticle(deathKennyX, deathKennyY, pick(['#FF8800', '#FF4444', '#FFD700']));
        }

        if (deathTimer === 50) deathPhase = 1;
        if (deathTimer === 80) deathPhase = 2;
        if (deathPhase >= 1) deathTextAlpha = Math.min(1, deathTextAlpha + 0.04);

        if (deathTimer > 160) {
            state = ST_GAMEOVER;
            if (score > bestScore) {
                bestScore = score;
                try { localStorage.setItem('ywa_savekenny_best', bestScore); } catch(e) {}
            }
            if (gameOverCB) gameOverCB(score);
        }

        particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life--; });
        particles = particles.filter(p => p.life > 0);
        thrustParticles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; });
        thrustParticles = thrustParticles.filter(p => p.life > 0);
        floats.forEach(f => { f.life--; });
        floats = floats.filter(f => f.life > 0);
        explosions.forEach(e => { e.life--; });
        explosions = explosions.filter(e => e.life > 0);
    }

    // ── Main Loop ──
    function gameLoop(timestamp) {
        if (!gameActive) return;
        // Loading screen
        if (!__allSpritesReady) {
            __drawLoadingScreen(canvas, ctx, 'SAVE KENNY', '#FBBF24');
            animFrame = requestAnimationFrame(gameLoop);
            return;
        }
        const dt = timestamp - (lastTime || timestamp);
        lastTime = timestamp;

        fitCanvas();
        ctx.clearRect(0, 0, W, H);

        switch (state) {
            case ST_SPLASH:
                drawSplash();
                drawSpeechBubble();
                frameCount++;
                break;

            case ST_PLAYING:
                updatePlaying(dt);
                drawSky();
                drawParallax();
                drawGround();
                drawTouchZones();
                drawLaunchBase();
                drawCoins();
                drawPowerups();
                drawThrust();
                drawDrone(droneX, droneY + 14, droneTilt);
                drawKenny(droneX, droneY, 0);
                drawThreats();
                drawMissiles();
                drawExplosions();
                drawParticles();
                drawSpeechBubble();
                drawFloats();
                drawCrosshair();
                drawHUD();
                break;

            case ST_DYING:
                updateDying(dt);
                drawSky();
                drawParallax();
                drawGround();
                drawCoins();
                drawThrust();
                drawDrone(droneX, Math.min(droneY + 14, GAME_H - 55) + deathTimer * 0.5, 0.5);
                drawDeathKenny();
                drawThreats();
                drawExplosions();
                drawParticles();
                drawFloats();
                drawDeathScreen();
                drawHUD();
                break;

            case ST_GAMEOVER:
                frameCount++;
                drawSky();
                drawParallax();
                drawGround();
                drawGameOver();
                break;
        }

        animFrame = requestAnimationFrame(gameLoop);
    }

    // ── Input Handling ──
    function onKeyDown(e) {
        keys[e.key] = true;
        // Space or Enter = flap (Flappy Bird boost)
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (state === ST_SPLASH || state === ST_GAMEOVER) {
                startGame();
            } else if (state === ST_PLAYING) {
                droneVY = FLAP_VEL;
                sfxFlap();
            }
        }
        // W or ArrowUp = also flap
        if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && state === ST_PLAYING) {
            e.preventDefault();
            droneVY = FLAP_VEL;
            sfxFlap();
        }
        // Arrow keys for drift are handled in updatePlaying via keys{}
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
        }
    }
    function onKeyUp(e) {
        keys[e.key] = false;
    }

    function onCanvasClick(e) {
        e.preventDefault();
        if (state === ST_SPLASH || state === ST_GAMEOVER) {
            startGame();
            return;
        }
        if (state !== ST_PLAYING) return;

        const rect = canvas.getBoundingClientRect();
        const sx = (e.clientX - rect.left) / rect.width * GAME_W;
        const sy = (e.clientY - rect.top) / rect.height * GAME_H;

        // Click anywhere fires a missile to that point (Missile Command)
        shoot(sx, sy);
    }

    function onTouchStart(e) {
        e.preventDefault();
        if (state === ST_SPLASH || state === ST_GAMEOVER) {
            startGame();
            return;
        }
        if (state !== ST_PLAYING) return;

        // Support multi-touch: process all touches
        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            const rect = canvas.getBoundingClientRect();
            const sx = (touch.clientX - rect.left) / rect.width * GAME_W;
            const sy = (touch.clientY - rect.top) / rect.height * GAME_H;

            // LEFT half of screen = flap drone (Flappy Bird)
            // RIGHT half of screen = fire missile to that point (Missile Command)
            if (sx < GAME_W * 0.5) {
                droneVY = FLAP_VEL;
                sfxFlap();
            } else {
                shoot(sx, sy);
            }
        }
    }

    function onMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        mouseX = (e.clientX - rect.left) / rect.width * GAME_W;
        mouseY = (e.clientY - rect.top) / rect.height * GAME_H;
        crosshairVisible = true;
    }

    function onMouseLeave() {
        crosshairVisible = false;
    }

    // ── Init / Destroy ──
    function init(cvs, playerData, onGameOverCB) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOverCB;
        gameActive = true;
        frameCount = 0;
        lastTime = 0;
        state = ST_SPLASH;
        keys = {};

        accentColor = playerData?.color || '#FF8800';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(playerData?.theme || 'retro') : null;
        if (_t) accentColor = _t.colors[0] || accentColor;

        W = canvas.width || 640;
        H = canvas.height || 400;
        SCALE = W / GAME_W;
        DPR = Math.min(window.devicePixelRatio || 1, 3);

        bestScore = parseInt(localStorage.getItem('ywa_savekenny_best') || '0', 10);
        resetGame();
        state = ST_SPLASH;

        // Hide default cursor over canvas during gameplay
        canvas.style.cursor = 'crosshair';

        if (!inputBound) {
            document.addEventListener('keydown', onKeyDown);
            document.addEventListener('keyup', onKeyUp);
            canvas.addEventListener('click', onCanvasClick);
            canvas.addEventListener('touchstart', onTouchStart, { passive: false });
            canvas.addEventListener('mousemove', onMouseMove);
            canvas.addEventListener('mouseleave', onMouseLeave);
            window.addEventListener('resize', fitCanvas);
            inputBound = true;
        }

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });
        __loadSprites(null);
        animFrame = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        if (inputBound) {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
            if (canvas) {
                canvas.removeEventListener('click', onCanvasClick);
                canvas.removeEventListener('touchstart', onTouchStart);
                canvas.removeEventListener('mousemove', onMouseMove);
                canvas.removeEventListener('mouseleave', onMouseLeave);
                canvas.style.cursor = '';
            }
            window.removeEventListener('resize', fitCanvas);
            inputBound = false;
        }
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
    }

    return { init, destroy, getScore() { return score; }, isActive() { return gameActive; } };
})();
