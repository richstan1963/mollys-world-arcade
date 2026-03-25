/* Fishing — Theme-aware Fishing Game for Your World Arcade
 * Cast, wait for bites, reel in fish with timing mini-game.
 * 12 fish types across 3 depth zones, 3-minute days, collection log. */
window.Fishing = (() => {

    // -- roundRect polyfill --
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

    // ── Constants ──────────────────────────────────────────────
    const BASE_W = 480, BASE_H = 640;
    const WATER_Y = 200;          // water surface Y
    const DAY_TIME = 180;         // 3 minutes in seconds
    const BITE_WINDOW = 1500;     // ms to react to bite
    const CAST_POWER_SPEED = 2.5; // power meter fill speed

    // Game states
    const ST_TITLE    = 0;
    const ST_IDLE     = 1;  // on dock, not casting
    const ST_CHARGING = 2;  // holding to charge cast
    const ST_CASTING  = 3;  // line flying out
    const ST_WAITING  = 4;  // line in water, waiting for bite
    const ST_BITE     = 5;  // fish biting! react quickly
    const ST_REELING  = 6;  // reel mini-game
    const ST_CAUGHT   = 7;  // caught display
    const ST_MISSED   = 8;  // missed display
    const ST_DAY_OVER = 9;  // day ended
    const ST_LOG      = 10; // collection log view
    const ST_LOADING  = -1; // sprite loading

    // ── Sprite Atlas ─────────────────────────────────────────
    const SPRITE_BASE = '/img/game-assets/kenney-fish';
    const sprites = {};
    let spritesLoaded = 0, spritesTotal = 0, allSpritesReady = false;

    // Fish sprite mapping: game fish id → kenney sprite file
    // Using "Double_" (2x) variants for crisp rendering
    const SPRITE_MANIFEST = {
        // Fish sprites — mapped to 12 game fish types
        fishGoldfish:   `${SPRITE_BASE}/Double_fish_orange.png`,
        fishBass:       `${SPRITE_BASE}/Double_fish_green.png`,
        fishPerch:      `${SPRITE_BASE}/Double_fish_brown.png`,
        fishSalmon:     `${SPRITE_BASE}/Double_fish_pink.png`,
        fishCatfish:    `${SPRITE_BASE}/Double_fish_grey.png`,
        fishTrout:      `${SPRITE_BASE}/Double_fish_blue.png`,
        fishSwordfish:  `${SPRITE_BASE}/Double_fish_grey_long_a.png`,
        fishTuna:       `${SPRITE_BASE}/Double_fish_red.png`,
        fishEel:        `${SPRITE_BASE}/Double_fish_grey_long_b.png`,
        fishPufferfish: `${SPRITE_BASE}/Double_fish_orange.png`,   // reuse orange, drawn rounder
        // Skeleton variants for "got away" flash
        skelBlue:       `${SPRITE_BASE}/Double_fish_blue_skeleton.png`,
        skelRed:        `${SPRITE_BASE}/Double_fish_red_skeleton.png`,
        skelGreen:      `${SPRITE_BASE}/Double_fish_green_skeleton.png`,
        skelPink:       `${SPRITE_BASE}/Double_fish_pink_skeleton.png`,
        skelOrange:     `${SPRITE_BASE}/Double_fish_orange_skeleton.png`,
        // Environment — seaweed (foreground decorations)
        seaweedGreenA:  `${SPRITE_BASE}/Double_seaweed_green_a.png`,
        seaweedGreenB:  `${SPRITE_BASE}/Double_seaweed_green_b.png`,
        seaweedGreenC:  `${SPRITE_BASE}/Double_seaweed_green_c.png`,
        seaweedGreenD:  `${SPRITE_BASE}/Double_seaweed_green_d.png`,
        seaweedPinkA:   `${SPRITE_BASE}/Double_seaweed_pink_a.png`,
        seaweedPinkB:   `${SPRITE_BASE}/Double_seaweed_pink_b.png`,
        seaweedOrangeA: `${SPRITE_BASE}/Double_seaweed_orange_a.png`,
        seaweedOrangeB: `${SPRITE_BASE}/Double_seaweed_orange_b.png`,
        seaweedGrassA:  `${SPRITE_BASE}/Double_seaweed_grass_a.png`,
        seaweedGrassB:  `${SPRITE_BASE}/Double_seaweed_grass_b.png`,
        // Background seaweed (parallax layer)
        bgSeaweedA:     `${SPRITE_BASE}/Double_background_seaweed_a.png`,
        bgSeaweedB:     `${SPRITE_BASE}/Double_background_seaweed_b.png`,
        bgSeaweedC:     `${SPRITE_BASE}/Double_background_seaweed_c.png`,
        bgSeaweedD:     `${SPRITE_BASE}/Double_background_seaweed_d.png`,
        bgSeaweedE:     `${SPRITE_BASE}/Double_background_seaweed_e.png`,
        bgSeaweedF:     `${SPRITE_BASE}/Double_background_seaweed_f.png`,
        // Rocks
        rockA:          `${SPRITE_BASE}/Double_rock_a.png`,
        rockB:          `${SPRITE_BASE}/Double_rock_b.png`,
        bgRockA:        `${SPRITE_BASE}/Double_background_rock_a.png`,
        bgRockB:        `${SPRITE_BASE}/Double_background_rock_b.png`,
        // Bubbles
        bubbleA:        `${SPRITE_BASE}/Double_bubble_a.png`,
        bubbleB:        `${SPRITE_BASE}/Double_bubble_b.png`,
        bubbleC:        `${SPRITE_BASE}/Double_bubble_c.png`,
        // Terrain (sea floor)
        terrainSandA:   `${SPRITE_BASE}/Double_terrain_sand_a.png`,
        terrainSandB:   `${SPRITE_BASE}/Double_terrain_sand_b.png`,
        terrainSandC:   `${SPRITE_BASE}/Double_terrain_sand_c.png`,
        terrainSandD:   `${SPRITE_BASE}/Double_terrain_sand_d.png`,
        terrainTopA:    `${SPRITE_BASE}/Double_terrain_sand_top_a.png`,
        terrainTopB:    `${SPRITE_BASE}/Double_terrain_sand_top_b.png`,
        terrainTopC:    `${SPRITE_BASE}/Double_terrain_sand_top_c.png`,
        terrainTopD:    `${SPRITE_BASE}/Double_terrain_sand_top_d.png`,
        terrainTopE:    `${SPRITE_BASE}/Double_terrain_sand_top_e.png`,
    };

    // Map fish IDs to sprite keys
    const FISH_SPRITE_MAP = {
        goldfish:   'fishGoldfish',
        bass:       'fishBass',
        perch:      'fishPerch',
        salmon:     'fishSalmon',
        catfish:    'fishCatfish',
        trout:      'fishTrout',
        swordfish:  'fishSwordfish',
        tuna:       'fishTuna',
        eel:        'fishEel',
        pufferfish: 'fishPufferfish',
        // treasure and boot keep canvas rendering (special items)
    };

    // Seaweed sprites to randomly place along the bottom
    const SEAWEED_SPRITE_KEYS = [
        'seaweedGreenA', 'seaweedGreenB', 'seaweedGreenC', 'seaweedGreenD',
        'seaweedPinkA', 'seaweedPinkB', 'seaweedOrangeA', 'seaweedOrangeB',
        'seaweedGrassA', 'seaweedGrassB'
    ];
    const BG_SEAWEED_KEYS = ['bgSeaweedA', 'bgSeaweedB', 'bgSeaweedC', 'bgSeaweedD', 'bgSeaweedE', 'bgSeaweedF'];
    const TERRAIN_TOP_KEYS = ['terrainTopA', 'terrainTopB', 'terrainTopC', 'terrainTopD', 'terrainTopE'];
    const TERRAIN_FILL_KEYS = ['terrainSandA', 'terrainSandB', 'terrainSandC', 'terrainSandD'];
    const BUBBLE_KEYS = ['bubbleA', 'bubbleB', 'bubbleC'];

    function loadSprites(onProgress, onDone) {
        const keys = Object.keys(SPRITE_MANIFEST);
        spritesTotal = keys.length;
        spritesLoaded = 0;
        let done = 0;
        keys.forEach(key => {
            const img = new Image();
            img.onload = () => {
                sprites[key] = img;
                done++;
                spritesLoaded = done;
                if (onProgress) onProgress(done, spritesTotal);
                if (done === spritesTotal) { allSpritesReady = true; if (onDone) onDone(); }
            };
            img.onerror = () => {
                sprites[key] = null;
                done++;
                spritesLoaded = done;
                if (onProgress) onProgress(done, spritesTotal);
                if (done === spritesTotal) { allSpritesReady = true; if (onDone) onDone(); }
            };
            img.src = SPRITE_MANIFEST[key];
        });
    }

    // Environment decoration data (generated once on init)
    let seaweedDecorations = [];   // foreground seaweed
    let bgSeaweedDecorations = []; // background seaweed (parallax)
    let rockDecorations = [];
    let terrainTiles = [];         // sea floor tiles
    let bubbleParticles = [];      // ambient bubbles

    function initEnvironment() {
        // Foreground seaweed along the bottom
        seaweedDecorations = [];
        for (let i = 0; i < 10; i++) {
            seaweedDecorations.push({
                x: 20 + Math.random() * (BASE_W - 40),
                spriteKey: SEAWEED_SPRITE_KEYS[Math.floor(Math.random() * SEAWEED_SPRITE_KEYS.length)],
                scale: 0.3 + Math.random() * 0.25,
                sway: Math.random() * Math.PI * 2,
                swaySpeed: 0.01 + Math.random() * 0.015
            });
        }
        // Background seaweed (subtle, behind fish)
        bgSeaweedDecorations = [];
        for (let i = 0; i < 8; i++) {
            bgSeaweedDecorations.push({
                x: Math.random() * BASE_W,
                spriteKey: BG_SEAWEED_KEYS[Math.floor(Math.random() * BG_SEAWEED_KEYS.length)],
                scale: 0.25 + Math.random() * 0.2,
                alpha: 0.2 + Math.random() * 0.15,
                sway: Math.random() * Math.PI * 2
            });
        }
        // Rocks on the floor
        rockDecorations = [];
        for (let i = 0; i < 4; i++) {
            rockDecorations.push({
                x: 30 + Math.random() * (BASE_W - 60),
                spriteKey: Math.random() > 0.5 ? 'rockA' : 'rockB',
                scale: 0.25 + Math.random() * 0.2
            });
        }
        // Background rocks
        for (let i = 0; i < 3; i++) {
            rockDecorations.push({
                x: Math.random() * BASE_W,
                spriteKey: Math.random() > 0.5 ? 'bgRockA' : 'bgRockB',
                scale: 0.2 + Math.random() * 0.15,
                isBg: true
            });
        }
        // Terrain tiles across the sea floor
        terrainTiles = [];
        const tileW = 64; // approximate tile width at scale
        for (let x = 0; x < BASE_W; x += tileW) {
            terrainTiles.push({
                x,
                topKey: TERRAIN_TOP_KEYS[Math.floor(Math.random() * TERRAIN_TOP_KEYS.length)],
                fillKey: TERRAIN_FILL_KEYS[Math.floor(Math.random() * TERRAIN_FILL_KEYS.length)]
            });
        }
        // Init ambient bubbles
        bubbleParticles = [];
    }

    function updateBubbles() {
        // Spawn new bubbles occasionally
        if (Math.random() < 0.03) {
            bubbleParticles.push({
                x: 20 + Math.random() * (BASE_W - 40),
                y: BASE_H - 20 - Math.random() * 60,
                spriteKey: BUBBLE_KEYS[Math.floor(Math.random() * BUBBLE_KEYS.length)],
                scale: 0.08 + Math.random() * 0.12,
                speed: 0.3 + Math.random() * 0.5,
                wobble: Math.random() * Math.PI * 2,
                alpha: 0.3 + Math.random() * 0.4
            });
        }
        for (let i = bubbleParticles.length - 1; i >= 0; i--) {
            const b = bubbleParticles[i];
            b.y -= b.speed;
            b.wobble += 0.03;
            b.x += Math.sin(b.wobble) * 0.3;
            if (b.y < WATER_Y) {
                bubbleParticles.splice(i, 1);
            }
        }
    }

    function drawEnvironmentBack() {
        if (!allSpritesReady) return;
        // Background seaweed (behind everything)
        for (const sw of bgSeaweedDecorations) {
            const spr = sprites[sw.spriteKey];
            if (!spr) continue;
            ctx.save();
            ctx.globalAlpha = sw.alpha;
            sw.sway += 0.008;
            const swayX = Math.sin(sw.sway) * 2;
            const w = spr.width * sw.scale;
            const h = spr.height * sw.scale;
            ctx.drawImage(spr, sw.x + swayX - w / 2, BASE_H - h - 10, w, h);
            ctx.restore();
        }
        // Background rocks
        for (const r of rockDecorations) {
            if (!r.isBg) continue;
            const spr = sprites[r.spriteKey];
            if (!spr) continue;
            ctx.save();
            ctx.globalAlpha = 0.25;
            const w = spr.width * r.scale;
            const h = spr.height * r.scale;
            ctx.drawImage(spr, r.x - w / 2, BASE_H - h - 5, w, h);
            ctx.restore();
        }
    }

    function drawEnvironmentFront() {
        if (!allSpritesReady) return;
        // Sea floor terrain tiles
        const floorY = BASE_H - 32;
        for (const t of terrainTiles) {
            const topSpr = sprites[t.topKey];
            const fillSpr = sprites[t.fillKey];
            if (topSpr) {
                const w = 68;
                const h = topSpr.height * (w / topSpr.width);
                ctx.drawImage(topSpr, t.x, floorY - h * 0.3, w, h);
            }
            if (fillSpr) {
                const w = 68;
                ctx.drawImage(fillSpr, t.x, floorY + 10, w, 30);
            }
        }
        // Foreground rocks
        for (const r of rockDecorations) {
            if (r.isBg) continue;
            const spr = sprites[r.spriteKey];
            if (!spr) continue;
            const w = spr.width * r.scale;
            const h = spr.height * r.scale;
            ctx.drawImage(spr, r.x - w / 2, BASE_H - h - 15, w, h);
        }
        // Foreground seaweed
        for (const sw of seaweedDecorations) {
            const spr = sprites[sw.spriteKey];
            if (!spr) continue;
            ctx.save();
            sw.sway += sw.swaySpeed;
            const swayX = Math.sin(sw.sway) * 3;
            const w = spr.width * sw.scale;
            const h = spr.height * sw.scale;
            ctx.drawImage(spr, sw.x + swayX - w / 2, BASE_H - h - 8, w, h);
            ctx.restore();
        }
        // Bubbles
        for (const b of bubbleParticles) {
            const spr = sprites[b.spriteKey];
            if (!spr) continue;
            ctx.save();
            ctx.globalAlpha = b.alpha;
            const w = spr.width * b.scale;
            const h = spr.height * b.scale;
            ctx.drawImage(spr, b.x - w / 2, b.y - h / 2, w, h);
            ctx.restore();
        }
    }

    // Fish database
    const FISH_DB = [
        // Surface (depth 0-0.3)
        { id: 'goldfish',  name: 'Goldfish',       zone: 'surface', depth: [0.05, 0.25], rarity: 0.35, pts: 10,  size: 'S', color: '#FFB020', bodyW: 22, bodyH: 14, tailW: 10, finH: 6,  speed: 1.0 },
        { id: 'bass',      name: 'Bass',           zone: 'surface', depth: [0.10, 0.30], rarity: 0.25, pts: 25,  size: 'M', color: '#4CAF50', bodyW: 30, bodyH: 16, tailW: 12, finH: 8,  speed: 1.2 },
        { id: 'perch',     name: 'Perch',          zone: 'surface', depth: [0.08, 0.28], rarity: 0.25, pts: 20,  size: 'M', color: '#C6A84B', bodyW: 26, bodyH: 14, tailW: 10, finH: 7,  speed: 0.9 },
        // Mid (depth 0.3-0.65)
        { id: 'salmon',    name: 'Salmon',         zone: 'mid',     depth: [0.30, 0.55], rarity: 0.18, pts: 50,  size: 'L', color: '#E87C6F', bodyW: 38, bodyH: 18, tailW: 14, finH: 10, speed: 1.6 },
        { id: 'catfish',   name: 'Catfish',        zone: 'mid',     depth: [0.35, 0.60], rarity: 0.16, pts: 45,  size: 'L', color: '#78736A', bodyW: 36, bodyH: 20, tailW: 12, finH: 8,  speed: 0.8 },
        { id: 'trout',     name: 'Trout',          zone: 'mid',     depth: [0.30, 0.50], rarity: 0.20, pts: 35,  size: 'M', color: '#5B9BD5', bodyW: 30, bodyH: 15, tailW: 12, finH: 8,  speed: 1.3 },
        // Deep (depth 0.65-1.0)
        { id: 'swordfish', name: 'Swordfish',      zone: 'deep',    depth: [0.70, 0.92], rarity: 0.06, pts: 150, size: 'XL',color: '#3A5FA0', bodyW: 48, bodyH: 18, tailW: 16, finH: 12, speed: 2.0 },
        { id: 'tuna',      name: 'Tuna',           zone: 'deep',    depth: [0.65, 0.85], rarity: 0.08, pts: 100, size: 'L', color: '#2E5090', bodyW: 42, bodyH: 20, tailW: 14, finH: 10, speed: 1.8 },
        { id: 'eel',       name: 'Eel',            zone: 'deep',    depth: [0.72, 0.95], rarity: 0.07, pts: 80,  size: 'L', color: '#4A4A5A', bodyW: 44, bodyH: 10, tailW: 8,  finH: 4,  speed: 1.4 },
        { id: 'pufferfish',name: 'Pufferfish',     zone: 'deep',    depth: [0.68, 0.88], rarity: 0.07, pts: 70,  size: 'M', color: '#E8D44D', bodyW: 24, bodyH: 22, tailW: 8,  finH: 6,  speed: 0.6 },
        // Special
        { id: 'treasure',  name: 'Treasure Chest', zone: 'deep',    depth: [0.80, 0.98], rarity: 0.02, pts: 300, size: 'XL',color: '#DAA520', bodyW: 30, bodyH: 24, tailW: 0,  finH: 0,  speed: 0.0 },
        { id: 'boot',      name: 'Old Boot',       zone: 'surface', depth: [0.05, 0.40], rarity: 0.06, pts: 1,   size: 'S', color: '#8B7355', bodyW: 22, bodyH: 18, tailW: 0,  finH: 0,  speed: 0.0 },
    ];

    // ── Theme colors ──────────────────────────────────────────
    let BG_SKY1    = '#87CEEB';
    let BG_SKY2    = '#4A90D9';
    let WATER_TOP  = '#2196F3';
    let WATER_MID  = '#1565C0';
    let WATER_DEEP = '#0D47A1';
    let DOCK_CLR   = '#8B6914';
    let DOCK_CLR2  = '#6B4F12';
    let LINE_CLR   = '#DDD';
    let BOBBER_CLR = '#EF4444';
    let TEXT_CLR   = '#FFFFFF';
    let GLOW_CLR   = '#F472B6';
    let ACCENT_CLR = '#FACC15';

    // ── Module-level variables ────────────────────────────────
    let canvas, ctx, W, H, scale;
    let state;
    let animFrame = null;
    let audioCtx  = null;
    let playerObj = null;
    let onGameOver = null;
    let gameActive = false;

    let score, totalCaught, dayTimer, frameCount, lastTime;
    let startTime;
    let level;

    // Casting
    let castPower;       // 0-1
    let castAngle;
    let lineX, lineY;    // line end position
    let bobberY;         // bobber surface Y
    let hookDepth;       // 0-1 how deep the hook is
    let lineAnimT;       // casting animation progress

    // Fishing state
    let waitTimer;       // time until bite
    let biteTimer;       // countdown once fish bites
    let currentFish;     // fish that's biting
    let bobberDip;       // bobber dip animation

    // Reel mini-game
    let reelProgress;    // 0-1 progress to catch
    let reelIndicator;   // 0-1 position of moving indicator
    let reelSpeed;       // how fast indicator moves
    let reelZoneCenter;  // center of success zone (0-1)
    let reelZoneWidth;   // width of success zone
    let reelDir;         // 1 or -1
    let reelTension;     // 0-1, too much = snap

    // Caught display
    let caughtTimer;
    let missedTimer;

    // Collection log
    let collection;      // Set of caught fish IDs
    let caughtCounts;    // {id: count}

    // Ambient fish swimming
    let ambientFish;

    // Water waves
    let waveOffset;

    // Particles
    let particles;

    // Background
    let clouds;
    let birds;

    // Input
    let keys;
    let spaceHeld;
    let titlePulse;

    // ── Audio helpers ─────────────────────────────────────────
    function ensureAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch { audioCtx = null; }
        }
        return audioCtx;
    }

    function tone(freq, dur, type, vol, when) {
        const ac = ensureAudio();
        if (!ac) return;
        try {
            const t = when || ac.currentTime;
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(vol || 0.08, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.1));
            o.connect(g);
            g.connect(ac.destination);
            o.start(t);
            o.stop(t + (dur || 0.1));
        } catch {}
    }

    function playSplash() {
        const ac = ensureAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            const buf = ac.createBuffer(1, ac.sampleRate * 0.15, ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.04));
            }
            const src = ac.createBufferSource();
            src.buffer = buf;
            const g = ac.createGain();
            g.gain.setValueAtTime(0.12, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            const filt = ac.createBiquadFilter();
            filt.type = 'bandpass';
            filt.frequency.value = 800;
            filt.Q.value = 1;
            src.connect(filt);
            filt.connect(g);
            g.connect(ac.destination);
            src.start(t);
        } catch {}
    }

    function playBite() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        tone(880, 0.06, 'square', 0.1, t);
        tone(1100, 0.06, 'square', 0.1, t + 0.08);
        tone(880, 0.06, 'square', 0.1, t + 0.16);
    }

    function playReelClick() { tone(600, 0.03, 'sine', 0.05); }

    function playCatch() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        [523, 659, 784, 1047].forEach((f, i) => {
            tone(f, 0.18, 'sine', 0.12, t + i * 0.09);
        });
    }

    function playMiss() {
        const ac = ensureAudio(); if (!ac) return;
        tone(300, 0.3, 'sawtooth', 0.06);
    }

    function playWaterLap() {
        const ac = ensureAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            const buf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                const env = Math.sin(i / data.length * Math.PI);
                data[i] = (Math.random() * 2 - 1) * env * 0.3;
            }
            const src = ac.createBufferSource();
            src.buffer = buf;
            const g = ac.createGain();
            g.gain.setValueAtTime(0.02, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            const filt = ac.createBiquadFilter();
            filt.type = 'lowpass';
            filt.frequency.value = 400;
            src.connect(filt);
            filt.connect(g);
            g.connect(ac.destination);
            src.start(t);
        } catch {}
    }

    function playBirdChirp() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        const baseF = 1800 + Math.random() * 600;
        tone(baseF, 0.08, 'sine', 0.03, t);
        tone(baseF * 1.2, 0.06, 'sine', 0.03, t + 0.1);
    }

    function playDayEnd() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        [440, 392, 349, 330].forEach((f, i) => {
            tone(f, 0.3, 'sine', 0.1, t + i * 0.2);
        });
    }

    // ── Particle system ───────────────────────────────────────
    function spawnBurst(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 3 + 1;
            particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s - 1.5,
                life: 1.0,
                decay: Math.random() * 0.02 + 0.015,
                r: Math.random() * 3 + 1,
                color: color || '#FFF'
            });
        }
    }

    function spawnSplash(x, y) {
        for (let i = 0; i < 8; i++) {
            const a = -Math.PI * 0.2 - Math.random() * Math.PI * 0.6;
            const s = Math.random() * 3 + 2;
            particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 1.0,
                decay: 0.025,
                r: Math.random() * 2 + 1,
                color: '#ADE8FF'
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.vx *= 0.98;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = p.life * 0.8;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ── Canvas sizing ─────────────────────────────────────────
    function fitCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const parent = canvas.parentElement;
        if (!parent) return;
        const pw = parent.clientWidth;
        const ph = parent.clientHeight;
        const aspect = BASE_W / BASE_H;
        let w, h;
        if (pw / ph > aspect) { h = ph; w = h * aspect; }
        else { w = pw; h = w / aspect; }
        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';
        canvas.width  = BASE_W * dpr;
        canvas.height = BASE_H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        W = BASE_W;
        H = BASE_H;
        scale = w / BASE_W;
    }

    // ── Ambient fish ──────────────────────────────────────────
    function initAmbientFish() {
        ambientFish = [];
        for (let i = 0; i < 15; i++) {
            spawnAmbientFish();
        }
    }

    // Ambient fish sprite keys for random selection
    const AMBIENT_FISH_SPRITES = [
        'fishGoldfish', 'fishBass', 'fishPerch', 'fishSalmon', 'fishCatfish',
        'fishTrout', 'fishTuna', 'fishEel', 'fishPufferfish'
    ];

    function spawnAmbientFish() {
        const depthFrac = Math.random();
        const y = WATER_Y + 30 + depthFrac * (BASE_H - WATER_Y - 60);
        const dir = Math.random() > 0.5 ? 1 : -1;
        const spd = 0.3 + Math.random() * 0.8;
        const sz = 8 + Math.random() * 16;
        // Deeper = darker shade / more transparent
        const alpha = 0.15 + depthFrac * 0.25;
        // Pick a random sprite for this ambient fish
        const spriteKey = AMBIENT_FISH_SPRITES[Math.floor(Math.random() * AMBIENT_FISH_SPRITES.length)];
        ambientFish.push({
            x: dir > 0 ? -sz * 2 : BASE_W + sz * 2,
            y,
            dir,
            speed: spd,
            size: sz,
            alpha,
            wobble: Math.random() * Math.PI * 2,
            color: depthFrac < 0.33 ? '#90CAF9' : depthFrac < 0.66 ? '#5C9DC5' : '#3A6B9F',
            spriteKey
        });
    }

    function updateAmbientFish() {
        for (let i = ambientFish.length - 1; i >= 0; i--) {
            const f = ambientFish[i];
            f.x += f.speed * f.dir;
            f.wobble += 0.05;
            f.y += Math.sin(f.wobble) * 0.3;
            if ((f.dir > 0 && f.x > BASE_W + 50) || (f.dir < 0 && f.x < -50)) {
                ambientFish.splice(i, 1);
            }
        }
        while (ambientFish.length < 12) spawnAmbientFish();
    }

    function drawAmbientFish() {
        for (const f of ambientFish) {
            const spr = allSpritesReady ? sprites[f.spriteKey] : null;

            if (spr) {
                // Sprite-based ambient fish
                ctx.save();
                ctx.globalAlpha = f.alpha;
                ctx.translate(f.x, f.y);
                if (f.dir < 0) ctx.scale(-1, 1);
                const w = f.size * 2.5;
                const aspect = spr.height / spr.width;
                const h = w * aspect;
                ctx.drawImage(spr, -w / 2, -h / 2, w, h);
                ctx.restore();
            } else {
                // Canvas fallback
                ctx.save();
                ctx.globalAlpha = f.alpha;
                ctx.translate(f.x, f.y);
                if (f.dir < 0) ctx.scale(-1, 1);

                ctx.fillStyle = f.color;
                ctx.beginPath();
                ctx.ellipse(0, 0, f.size, f.size * 0.45, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(-f.size, 0);
                ctx.lineTo(-f.size - f.size * 0.5, -f.size * 0.4);
                ctx.lineTo(-f.size - f.size * 0.5, f.size * 0.4);
                ctx.closePath();
                ctx.fill();

                ctx.restore();
            }
        }
        ctx.globalAlpha = 1;
    }

    // ── Cloud / bird background ───────────────────────────────
    function initClouds() {
        clouds = [];
        for (let i = 0; i < 5; i++) {
            clouds.push({
                x: Math.random() * BASE_W,
                y: 20 + Math.random() * 80,
                w: 50 + Math.random() * 80,
                speed: 0.1 + Math.random() * 0.15
            });
        }
        birds = [];
        for (let i = 0; i < 3; i++) {
            birds.push({
                x: Math.random() * BASE_W,
                y: 30 + Math.random() * 60,
                speed: 0.3 + Math.random() * 0.3,
                wing: Math.random() * Math.PI * 2
            });
        }
    }

    function updateClouds() {
        for (const c of clouds) {
            c.x += c.speed;
            if (c.x > BASE_W + c.w) c.x = -c.w;
        }
        for (const b of birds) {
            b.x += b.speed;
            b.wing += 0.12;
            if (b.x > BASE_W + 20) {
                b.x = -20;
                b.y = 30 + Math.random() * 60;
            }
        }
    }

    function drawSky() {
        const grad = ctx.createLinearGradient(0, 0, 0, WATER_Y);
        grad.addColorStop(0, BG_SKY1);
        grad.addColorStop(1, BG_SKY2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, BASE_W, WATER_Y);

        // Sun
        ctx.fillStyle = '#FFF59D';
        ctx.shadowColor = '#FFF59D';
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.arc(380, 50, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Clouds
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        for (const c of clouds) {
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, c.w * 0.5, 14, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(c.x - c.w * 0.2, c.y - 6, c.w * 0.3, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(c.x + c.w * 0.2, c.y - 4, c.w * 0.25, 9, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Birds
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1.5;
        for (const b of birds) {
            const wingY = Math.sin(b.wing) * 4;
            ctx.beginPath();
            ctx.moveTo(b.x - 6, b.y + wingY);
            ctx.quadraticCurveTo(b.x - 2, b.y - 3 + wingY * 0.5, b.x, b.y);
            ctx.quadraticCurveTo(b.x + 2, b.y - 3 + wingY * 0.5, b.x + 6, b.y + wingY);
            ctx.stroke();
        }
    }

    function drawWater() {
        waveOffset += 0.02;

        // Water gradient
        const grad = ctx.createLinearGradient(0, WATER_Y, 0, BASE_H);
        grad.addColorStop(0, WATER_TOP);
        grad.addColorStop(0.4, WATER_MID);
        grad.addColorStop(1, WATER_DEEP);
        ctx.fillStyle = grad;
        ctx.fillRect(0, WATER_Y, BASE_W, BASE_H - WATER_Y);

        // Depth zone lines (subtle)
        const zones = [0.33, 0.66];
        for (const z of zones) {
            const zy = WATER_Y + z * (BASE_H - WATER_Y);
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.moveTo(0, zy);
            ctx.lineTo(BASE_W, zy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Animated wave surface
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.moveTo(0, WATER_Y);
        for (let x = 0; x <= BASE_W; x += 4) {
            const y = WATER_Y + Math.sin(x * 0.03 + waveOffset) * 3
                              + Math.sin(x * 0.07 + waveOffset * 1.3) * 1.5;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(BASE_W, WATER_Y + 8);
        ctx.lineTo(0, WATER_Y + 8);
        ctx.closePath();
        ctx.fill();

        // Light rays
        ctx.save();
        for (let i = 0; i < 5; i++) {
            const rx = 60 + i * 100 + Math.sin(waveOffset + i) * 15;
            ctx.globalAlpha = 0.03;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.moveTo(rx, WATER_Y);
            ctx.lineTo(rx - 20, BASE_H);
            ctx.lineTo(rx + 20, BASE_H);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    function drawDock() {
        // Dock platform
        const dockY = WATER_Y - 30;
        const dockW = 120;
        const dockX = 30;

        // Support posts
        ctx.fillStyle = DOCK_CLR2;
        ctx.fillRect(dockX + 15, dockY + 12, 8, WATER_Y - dockY + 10);
        ctx.fillRect(dockX + dockW - 25, dockY + 12, 8, WATER_Y - dockY + 10);

        // Planks
        for (let i = 0; i < 5; i++) {
            const px = dockX;
            const py = dockY + i * 6;
            ctx.fillStyle = i % 2 === 0 ? DOCK_CLR : DOCK_CLR2;
            ctx.fillRect(px, py, dockW, 5);
        }

        // Rod holder / fisherman silhouette (simple)
        const fX = dockX + dockW - 20;
        const fY = dockY - 40;
        // Body
        ctx.fillStyle = '#555';
        ctx.fillRect(fX - 4, fY + 10, 8, 30);
        // Head
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.arc(fX, fY + 5, 7, 0, Math.PI * 2);
        ctx.fill();
        // Hat
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(fX - 9, fY - 2, 18, 4);
        ctx.fillRect(fX - 5, fY - 7, 10, 6);
    }

    // ── Fish rendering ────────────────────────────────────────
    function drawFishSprite(x, y, fish, dir, alpha, drawW) {
        const spriteKey = FISH_SPRITE_MAP[fish.id];
        const spr = spriteKey ? sprites[spriteKey] : null;

        if (spr) {
            ctx.save();
            ctx.globalAlpha = alpha || 1;
            ctx.translate(x, y);
            // Kenney fish face right by default; flip if dir < 0
            if (dir < 0) ctx.scale(-1, 1);
            // Scale sprite to match fish body dimensions
            const targetW = drawW || (fish.bodyW * 2.2);
            const aspect = spr.height / spr.width;
            const w = targetW;
            const h = targetW * aspect;
            ctx.drawImage(spr, -w / 2, -h / 2, w, h);
            ctx.restore();
            return;
        }

        // Fallback to canvas drawing if sprite missing
        drawFishShapeCanvas(x, y, fish, dir, alpha);
    }

    function drawFishShape(x, y, fish, dir, alpha) {
        // Try sprite first, fall back to canvas
        if (allSpritesReady && FISH_SPRITE_MAP[fish.id]) {
            drawFishSprite(x, y, fish, dir, alpha);
            return;
        }
        drawFishShapeCanvas(x, y, fish, dir, alpha);
    }

    function drawFishShapeCanvas(x, y, fish, dir, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha || 1;
        ctx.translate(x, y);
        if (dir < 0) ctx.scale(-1, 1);

        const bw = fish.bodyW;
        const bh = fish.bodyH;

        if (fish.id === 'treasure') {
            // Treasure chest
            ctx.fillStyle = fish.color;
            ctx.fillRect(-bw/2, -bh/2, bw, bh * 0.6);
            ctx.fillStyle = '#B8860B';
            ctx.fillRect(-bw/2, -bh/2 + bh * 0.6, bw, bh * 0.4);
            // Lock
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fill();
            // Shine
            ctx.fillStyle = 'rgba(255,255,200,0.5)';
            ctx.beginPath();
            ctx.arc(-bw/4, -bh/4, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }

        if (fish.id === 'boot') {
            // Old boot
            ctx.fillStyle = fish.color;
            ctx.beginPath();
            ctx.moveTo(-bw/2, -bh/3);
            ctx.lineTo(bw/2, -bh/3);
            ctx.lineTo(bw/2, bh/3);
            ctx.lineTo(bw/4, bh/3);
            ctx.lineTo(bw/4, bh/2);
            ctx.lineTo(-bw/4, bh/2);
            ctx.lineTo(-bw/4, bh/3);
            ctx.lineTo(-bw/2, bh/3);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#6B4E2A';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
            return;
        }

        // Body
        ctx.fillStyle = fish.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, bw / 2, bh / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Darker belly
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.ellipse(0, bh * 0.15, bw * 0.4, bh * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tail
        if (fish.tailW > 0) {
            ctx.fillStyle = darken(fish.color, 30);
            ctx.beginPath();
            ctx.moveTo(-bw / 2, 0);
            ctx.lineTo(-bw / 2 - fish.tailW, -bh * 0.4);
            ctx.lineTo(-bw / 2 - fish.tailW, bh * 0.4);
            ctx.closePath();
            ctx.fill();
        }

        // Top fin
        if (fish.finH > 0) {
            ctx.fillStyle = darken(fish.color, 20);
            ctx.beginPath();
            ctx.moveTo(-bw * 0.15, -bh / 2);
            ctx.lineTo(bw * 0.1, -bh / 2 - fish.finH);
            ctx.lineTo(bw * 0.3, -bh / 2);
            ctx.closePath();
            ctx.fill();
        }

        // Swordfish nose
        if (fish.id === 'swordfish') {
            ctx.fillStyle = '#5A7FB0';
            ctx.beginPath();
            ctx.moveTo(bw / 2, 0);
            ctx.lineTo(bw / 2 + 18, -2);
            ctx.lineTo(bw / 2 + 18, 2);
            ctx.closePath();
            ctx.fill();
        }

        // Eel has stripes
        if (fish.id === 'eel') {
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 2;
            for (let i = -3; i <= 3; i++) {
                ctx.beginPath();
                ctx.moveTo(i * 6, -bh / 2);
                ctx.lineTo(i * 6, bh / 2);
                ctx.stroke();
            }
        }

        // Pufferfish spines
        if (fish.id === 'pufferfish') {
            ctx.strokeStyle = '#D4C43F';
            ctx.lineWidth = 1;
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * bw * 0.45, Math.sin(a) * bh * 0.45);
                ctx.lineTo(Math.cos(a) * (bw * 0.45 + 4), Math.sin(a) * (bh * 0.45 + 4));
                ctx.stroke();
            }
        }

        // Eye
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(bw * 0.25, -bh * 0.1, Math.max(3, bh * 0.15), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(bw * 0.28, -bh * 0.1, Math.max(1.5, bh * 0.08), 0, Math.PI * 2);
        ctx.fill();

        // Scales pattern (subtle)
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 0.5;
        for (let sx = -bw * 0.3; sx < bw * 0.2; sx += 6) {
            for (let sy = -bh * 0.3; sy < bh * 0.3; sy += 5) {
                ctx.beginPath();
                ctx.arc(sx, sy, 3, 0, Math.PI, false);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    function darken(hex, amt) {
        let r = parseInt(hex.slice(1,3), 16);
        let g = parseInt(hex.slice(3,5), 16);
        let b = parseInt(hex.slice(5,7), 16);
        r = Math.max(0, r - amt);
        g = Math.max(0, g - amt);
        b = Math.max(0, b - amt);
        return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
    }

    // ── Fishing line / bobber ─────────────────────────────────
    function drawLine() {
        if (state < ST_CASTING) return;

        const rodTipX = 130;
        const rodTipY = WATER_Y - 55;

        // Rod
        ctx.strokeStyle = '#8B6914';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(110, WATER_Y - 35);
        ctx.quadraticCurveTo(120, WATER_Y - 60, rodTipX, rodTipY);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#A0824A';
        ctx.beginPath();
        ctx.moveTo(120, WATER_Y - 50);
        ctx.lineTo(rodTipX + 15, rodTipY - 10);
        ctx.stroke();

        if (state === ST_CASTING) {
            // Animate line going out
            const endX = lerp(rodTipX, lineX, lineAnimT);
            const endY = lerp(rodTipY, WATER_Y, lineAnimT);
            ctx.strokeStyle = LINE_CLR;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(rodTipX, rodTipY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            return;
        }

        // Line to bobber
        const bx = lineX;
        const by = WATER_Y + bobberDip;

        ctx.strokeStyle = LINE_CLR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rodTipX, rodTipY);
        ctx.quadraticCurveTo((rodTipX + bx) / 2, rodTipY + 20, bx, by);
        ctx.stroke();

        // Line below surface to hook
        const hookY = WATER_Y + hookDepth * (BASE_H - WATER_Y - 30);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx, hookY);
        ctx.stroke();

        // Hook
        ctx.strokeStyle = '#CCC';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, hookY + 4, 4, 0, Math.PI);
        ctx.stroke();

        // Bobber
        drawBobber(bx, by);
    }

    function drawBobber(x, y) {
        // Bobber bottom (white)
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.ellipse(x, y + 4, 5, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Bobber top (red)
        ctx.fillStyle = BOBBER_CLR;
        ctx.beginPath();
        ctx.ellipse(x, y - 2, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Antenna
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x, y - 14);
        ctx.stroke();

        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(x - 1, y - 4, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Power meter ───────────────────────────────────────────
    function drawPowerMeter() {
        if (state !== ST_CHARGING) return;

        const mx = BASE_W / 2 - 60;
        const my = BASE_H - 60;
        const mw = 120;
        const mh = 16;

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(mx - 2, my - 2, mw + 4, mh + 4, [6]);
        ctx.fill();

        // Fill
        const grad = ctx.createLinearGradient(mx, 0, mx + mw, 0);
        grad.addColorStop(0, '#4CAF50');
        grad.addColorStop(0.5, '#FFEB3B');
        grad.addColorStop(1, '#F44336');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(mx, my, mw * castPower, mh, [4]);
        ctx.fill();

        // Label
        ctx.fillStyle = TEXT_CLR;
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('POWER', BASE_W / 2, my - 6);
    }

    // ── Reel mini-game ────────────────────────────────────────
    function drawReelGame() {
        if (state !== ST_REELING) return;

        const mx = BASE_W / 2 - 100;
        const my = BASE_H - 100;
        const mw = 200;
        const mh = 20;

        // Background bar
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(mx - 2, my - 2, mw + 4, mh + 4, [8]);
        ctx.fill();

        // Success zone
        const zoneX = mx + (reelZoneCenter - reelZoneWidth / 2) * mw;
        const zoneW = reelZoneWidth * mw;
        ctx.fillStyle = 'rgba(76,175,80,0.5)';
        ctx.beginPath();
        ctx.roundRect(zoneX, my, zoneW, mh, [4]);
        ctx.fill();
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(zoneX, my, zoneW, mh, [4]);
        ctx.stroke();

        // Moving indicator
        const indX = mx + reelIndicator * mw;
        ctx.fillStyle = ACCENT_CLR;
        ctx.shadowColor = ACCENT_CLR;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(indX - 3, my - 2, 6, mh + 4, [3]);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Progress bar above
        const py = my - 28;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.roundRect(mx, py, mw, 10, [5]);
        ctx.fill();
        ctx.fillStyle = GLOW_CLR;
        ctx.beginPath();
        ctx.roundRect(mx, py, mw * reelProgress, 10, [5]);
        ctx.fill();

        // Tension indicator
        const ty = my + mh + 12;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.roundRect(mx, ty, mw, 6, [3]);
        ctx.fill();
        const tClr = reelTension > 0.7 ? '#F44336' : reelTension > 0.4 ? '#FF9800' : '#4CAF50';
        ctx.fillStyle = tClr;
        ctx.beginPath();
        ctx.roundRect(mx, ty, mw * reelTension, 6, [3]);
        ctx.fill();

        // Labels
        ctx.fillStyle = TEXT_CLR;
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TAP IN THE GREEN ZONE!', BASE_W / 2, my - 36);

        // Fish name
        if (currentFish) {
            ctx.font = 'bold 10px "Press Start 2P", monospace';
            ctx.fillStyle = currentFish.color;
            ctx.fillText(currentFish.name.toUpperCase(), BASE_W / 2, my - 50);
        }
    }

    // ── Fish selection ─────────────────────────────────────────
    function selectFish() {
        // Based on hook depth, pick a fish
        const depth = hookDepth;
        const candidates = FISH_DB.filter(f => depth >= f.depth[0] && depth <= f.depth[1]);
        if (candidates.length === 0) return FISH_DB[0]; // fallback

        // Weighted random by rarity
        const totalWeight = candidates.reduce((s, f) => s + f.rarity, 0);
        let r = Math.random() * totalWeight;
        for (const f of candidates) {
            r -= f.rarity;
            if (r <= 0) return f;
        }
        return candidates[candidates.length - 1];
    }

    // ── HUD ───────────────────────────────────────────────────
    function drawHUD() {
        if (state < ST_IDLE || state === ST_TITLE || state === ST_LOG) return;

        // Timer
        const timeLeft = Math.max(0, Math.ceil(dayTimer));
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.roundRect(BASE_W / 2 - 50, 6, 100, 24, [8]);
        ctx.fill();
        ctx.fillStyle = timeLeft < 30 ? '#F44336' : TEXT_CLR;
        ctx.font = 'bold 12px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, BASE_W / 2, 24);

        // Score
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.roundRect(BASE_W - 110, 6, 100, 24, [8]);
        ctx.fill();
        ctx.fillStyle = ACCENT_CLR;
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${score} pts`, BASE_W - 18, 23);

        // Fish count
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.roundRect(10, 6, 80, 24, [8]);
        ctx.fill();
        ctx.fillStyle = TEXT_CLR;
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${totalCaught} fish`, 20, 23);

        // Instruction hint
        if (state === ST_IDLE) {
            const alpha = 0.5 + 0.5 * Math.sin(frameCount * 0.05);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = TEXT_CLR;
            ctx.font = '10px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('HOLD SPACE / TAP TO CAST', BASE_W / 2, BASE_H - 30);
            ctx.globalAlpha = 1;
        }

        if (state === ST_BITE) {
            // Urgent flash
            const flash = Math.sin(frameCount * 0.2) > 0;
            if (flash) {
                ctx.fillStyle = '#F44336';
                ctx.font = 'bold 14px "Press Start 2P", monospace';
                ctx.textAlign = 'center';
                ctx.fillText('BITE! TAP NOW!', BASE_W / 2, WATER_Y - 10);
            }
        }
    }

    // ── Caught / missed display ───────────────────────────────
    function drawCaughtDisplay() {
        if (state !== ST_CAUGHT) return;

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, BASE_W, BASE_H);

        const cy = BASE_H / 2 - 40;
        ctx.fillStyle = TEXT_CLR;
        ctx.font = 'bold 16px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CAUGHT!', BASE_W / 2, cy - 50);

        if (currentFish) {
            drawFishShape(BASE_W / 2, cy + 10, currentFish, 1, 1);
            ctx.fillStyle = currentFish.color;
            ctx.font = 'bold 14px "Press Start 2P", monospace';
            ctx.fillText(currentFish.name, BASE_W / 2, cy + 55);
            ctx.fillStyle = ACCENT_CLR;
            ctx.font = '12px "Press Start 2P", monospace';
            ctx.fillText(`+${currentFish.pts} pts`, BASE_W / 2, cy + 78);

            // Size & zone
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '9px "Press Start 2P", monospace';
            ctx.fillText(`${currentFish.size} | ${currentFish.zone.toUpperCase()}`, BASE_W / 2, cy + 96);

            // New catch?
            if (!collection.has(currentFish.id) || caughtCounts[currentFish.id] === 1) {
                ctx.fillStyle = '#4CAF50';
                ctx.font = 'bold 10px "Press Start 2P", monospace';
                ctx.fillText('NEW CATCH!', BASE_W / 2, cy + 116);
            }
        }
    }

    function drawMissedDisplay() {
        if (state !== ST_MISSED) return;

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.roundRect(BASE_W / 2 - 100, BASE_H / 2 - 25, 200, 50, [10]);
        ctx.fill();

        ctx.fillStyle = '#F44336';
        ctx.font = 'bold 14px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GOT AWAY!', BASE_W / 2, BASE_H / 2 + 5);
    }

    // ── Day over screen ───────────────────────────────────────
    function drawDayOver() {
        if (state !== ST_DAY_OVER) return;

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, BASE_W, BASE_H);

        const cy = BASE_H / 2 - 80;
        ctx.fillStyle = ACCENT_CLR;
        ctx.font = 'bold 20px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DAY OVER!', BASE_W / 2, cy);

        ctx.fillStyle = TEXT_CLR;
        ctx.font = '12px "Press Start 2P", monospace';
        ctx.fillText(`Fish Caught: ${totalCaught}`, BASE_W / 2, cy + 40);
        ctx.fillText(`Score: ${score}`, BASE_W / 2, cy + 65);

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillText(`Collection: ${collection.size} / ${FISH_DB.length}`, BASE_W / 2, cy + 95);

        const alpha = 0.5 + 0.5 * Math.sin(frameCount * 0.05);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = GLOW_CLR;
        ctx.fillText('TAP TO CONTINUE', BASE_W / 2, cy + 135);
        ctx.globalAlpha = 1;
    }

    // ── Collection log ────────────────────────────────────────
    function drawCollectionLog() {
        if (state !== ST_LOG) return;

        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, BASE_W, BASE_H);

        ctx.fillStyle = ACCENT_CLR;
        ctx.font = 'bold 16px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('FISH COLLECTION', BASE_W / 2, 35);

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillText(`${collection.size} / ${FISH_DB.length} discovered`, BASE_W / 2, 55);

        const cols = 3;
        const cellW = 140;
        const cellH = 80;
        const startX = (BASE_W - cols * cellW) / 2;
        const startY = 75;

        for (let i = 0; i < FISH_DB.length; i++) {
            const fish = FISH_DB[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cx = startX + col * cellW + cellW / 2;
            const cy = startY + row * cellH + cellH / 2;

            const caught = collection.has(fish.id);

            // Card background
            ctx.fillStyle = caught ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
            ctx.beginPath();
            ctx.roundRect(cx - cellW / 2 + 4, cy - cellH / 2 + 4, cellW - 8, cellH - 8, [6]);
            ctx.fill();

            if (caught) {
                drawFishShape(cx, cy - 8, fish, 1, 0.9);
                ctx.fillStyle = TEXT_CLR;
                ctx.font = '7px "Press Start 2P", monospace';
                ctx.textAlign = 'center';
                ctx.fillText(fish.name, cx, cy + 24);
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText(`x${caughtCounts[fish.id] || 0}`, cx, cy + 34);
            } else {
                // Silhouette
                ctx.save();
                ctx.globalAlpha = 0.15;
                ctx.translate(cx, cy - 8);
                ctx.fillStyle = '#888';
                ctx.beginPath();
                ctx.ellipse(0, 0, fish.bodyW / 2, fish.bodyH / 2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.font = '7px "Press Start 2P", monospace';
                ctx.textAlign = 'center';
                ctx.fillText('???', cx, cy + 24);
            }
        }

        // Back hint
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TAP TO GO BACK', BASE_W / 2, BASE_H - 20);
    }

    // ── Loading screen ─────────────────────────────────────────
    function drawLoading() {
        // Draw water background while loading for visual appeal
        const grad = ctx.createLinearGradient(0, 0, 0, BASE_H);
        grad.addColorStop(0, BG_SKY2);
        grad.addColorStop(0.3, WATER_TOP);
        grad.addColorStop(0.6, WATER_MID);
        grad.addColorStop(1, WATER_DEEP);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, BASE_W, BASE_H);

        ctx.textAlign = 'center';
        ctx.fillStyle = TEXT_CLR;
        ctx.font = 'bold 22px "Press Start 2P", monospace';
        ctx.shadowColor = '#0D47A1';
        ctx.shadowBlur = 15;
        ctx.fillText('FISHING', BASE_W / 2, BASE_H / 2 - 60);
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillText('LOADING SPRITES...', BASE_W / 2, BASE_H / 2);

        // Progress bar
        const barW = 200, barH = 8;
        const pct = spritesTotal > 0 ? spritesLoaded / spritesTotal : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.roundRect(BASE_W / 2 - barW / 2 - 2, BASE_H / 2 + 18, barW + 4, barH + 4, [6]);
        ctx.fill();
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.roundRect(BASE_W / 2 - barW / 2, BASE_H / 2 + 20, barW * pct, barH, [4]);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillText(`${spritesLoaded} / ${spritesTotal}`, BASE_W / 2, BASE_H / 2 + 45);

        // Animated bubbles on loading screen
        const t = frameCount * 0.03;
        ctx.globalAlpha = 0.15;
        for (let i = 0; i < 8; i++) {
            const bx = 60 + i * 55 + Math.sin(t + i * 1.5) * 15;
            const by = BASE_H - 40 - Math.abs(Math.sin(t * 0.7 + i * 2)) * 100;
            const br = 3 + Math.sin(t + i) * 1.5;
            ctx.fillStyle = '#ADE8FF';
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ── Title screen ──────────────────────────────────────────
    function drawTitleScreen() {
        drawSky();
        drawWater();
        drawEnvironmentBack();
        drawAmbientFish();
        drawEnvironmentFront();
        drawDock();
        updateClouds();
        updateAmbientFish();
        updateBubbles();

        // Title overlay
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, 0, BASE_W, BASE_H);

        ctx.fillStyle = TEXT_CLR;
        ctx.font = 'bold 28px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('FISHING', BASE_W / 2, 100);

        // Animated fish
        const fx = BASE_W / 2 + Math.sin(frameCount * 0.02) * 40;
        const fy = 180;
        drawFishShape(fx, fy, FISH_DB[3], Math.sin(frameCount * 0.02) > 0 ? 1 : -1, 0.9); // salmon

        // Sub text
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillText('Cast your line, catch them all!', BASE_W / 2, 230);
        ctx.fillText(`${FISH_DB.length} fish species to discover`, BASE_W / 2, 250);

        titlePulse += 0.03;
        const alpha = 0.5 + 0.5 * Math.sin(titlePulse * 2);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = GLOW_CLR;
        ctx.font = '11px "Press Start 2P", monospace';
        ctx.fillText('TAP OR PRESS ENTER', BASE_W / 2, BASE_H - 100);
        ctx.globalAlpha = 1;

        // Collection button
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.roundRect(BASE_W / 2 - 70, BASE_H - 60, 140, 30, [8]);
        ctx.fill();
        ctx.fillStyle = ACCENT_CLR;
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillText('COLLECTION LOG', BASE_W / 2, BASE_H - 40);
    }

    // ── Utility ───────────────────────────────────────────────
    function lerp(a, b, t) { return a + (b - a) * t; }

    // ── Game flow ─────────────────────────────────────────────
    function startDay() {
        state = ST_IDLE;
        dayTimer = DAY_TIME;
        score = 0;
        totalCaught = 0;
        gameActive = true;
        startTime = Date.now();
        level = 0;
        castPower = 0;
        bobberDip = 0;
        hookDepth = 0;
        waveOffset = 0;
    }

    function castLine() {
        state = ST_CASTING;
        lineAnimT = 0;
        // Determine where line goes based on power
        lineX = 140 + castPower * 280;
        hookDepth = 0.1 + castPower * 0.85;
        bobberDip = 0;
        playSplash();
    }

    function startWaiting() {
        state = ST_WAITING;
        // Random time until bite: 2-6 seconds, shorter with deeper casts
        waitTimer = 2000 + Math.random() * 4000 * (1 - hookDepth * 0.3);
        bobberDip = 0;
    }

    function triggerBite() {
        currentFish = selectFish();
        state = ST_BITE;
        biteTimer = BITE_WINDOW;
        bobberDip = 8;
        playBite();
    }

    function startReeling() {
        state = ST_REELING;
        reelProgress = 0;
        reelIndicator = 0;
        reelDir = 1;
        reelTension = 0;

        // Difficulty based on fish
        const sz = currentFish.size;
        if (sz === 'S')  { reelSpeed = 0.008; reelZoneWidth = 0.30; }
        else if (sz === 'M')  { reelSpeed = 0.012; reelZoneWidth = 0.22; }
        else if (sz === 'L')  { reelSpeed = 0.016; reelZoneWidth = 0.16; }
        else  { reelSpeed = 0.022; reelZoneWidth = 0.12; }

        reelZoneCenter = 0.3 + Math.random() * 0.4;
    }

    function reelTap() {
        // Check if indicator is in zone
        const inZone = Math.abs(reelIndicator - reelZoneCenter) < reelZoneWidth / 2;

        if (inZone) {
            reelProgress += 0.08 + (currentFish.size === 'S' ? 0.06 : 0);
            reelTension = Math.max(0, reelTension - 0.05);
            playReelClick();
            spawnBurst(lineX, WATER_Y, 3, '#ADE8FF');

            if (reelProgress >= 1) {
                // Caught!
                catchFish();
            }
        } else {
            reelTension += 0.15;
            reelProgress = Math.max(0, reelProgress - 0.03);
            tone(200, 0.1, 'sawtooth', 0.06);

            if (reelTension >= 1) {
                // Line snapped!
                fishGotAway();
            }
        }

        // Move zone slightly
        reelZoneCenter += (Math.random() - 0.5) * 0.1;
        reelZoneCenter = Math.max(reelZoneWidth / 2, Math.min(1 - reelZoneWidth / 2, reelZoneCenter));
    }

    function catchFish() {
        state = ST_CAUGHT;
        caughtTimer = 2500;
        score += currentFish.pts;
        totalCaught++;
        collection.add(currentFish.id);
        caughtCounts[currentFish.id] = (caughtCounts[currentFish.id] || 0) + 1;
        playCatch();
        spawnBurst(BASE_W / 2, BASE_H / 2, 30, currentFish.color);
        spawnBurst(BASE_W / 2, BASE_H / 2, 15, ACCENT_CLR);
    }

    function fishGotAway() {
        state = ST_MISSED;
        missedTimer = 1200;
        currentFish = null;
        playMiss();
    }

    function returnToIdle() {
        state = ST_IDLE;
        castPower = 0;
        bobberDip = 0;
        currentFish = null;
    }

    // ── Input handlers ────────────────────────────────────────
    function onKeyDown(e) {
        keys[e.key] = true;

        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            handleAction(true);
        }
        if (e.key === 'c' || e.key === 'C') {
            if (state === ST_TITLE || state === ST_IDLE) {
                state = ST_LOG;
            } else if (state === ST_LOG) {
                state = gameActive ? ST_IDLE : ST_TITLE;
            }
        }
    }

    function onKeyUp(e) {
        keys[e.key] = false;
        if (e.key === ' ' || e.key === 'Enter') {
            handleAction(false);
        }
    }

    function onMouseDown(e) {
        ensureAudio();
        handleAction(true);
    }

    function onMouseUp(e) {
        handleAction(false);
    }

    function onTouchStart(e) {
        ensureAudio();
        handleAction(true);
    }

    function onTouchEnd(e) {
        handleAction(false);
    }

    function handleAction(pressed) {
        if (pressed) {
            if (state === ST_TITLE) {
                startDay();
                return;
            }
            if (state === ST_LOG) {
                state = gameActive ? ST_IDLE : ST_TITLE;
                return;
            }
            if (state === ST_DAY_OVER) {
                gameActive = false;
                state = ST_TITLE;
                if (onGameOver) {
                    onGameOver({
                        score,
                        level: totalCaught,
                        duration: Math.floor((Date.now() - startTime) / 1000),
                        stats: { fishCaught: totalCaught, speciesFound: collection.size }
                    });
                }
                return;
            }
            if (state === ST_IDLE) {
                state = ST_CHARGING;
                castPower = 0;
                spaceHeld = true;
                return;
            }
            if (state === ST_BITE) {
                startReeling();
                return;
            }
            if (state === ST_REELING) {
                reelTap();
                return;
            }
        } else {
            // Released
            if (state === ST_CHARGING && spaceHeld) {
                spaceHeld = false;
                castLine();
                return;
            }
        }
    }

    function onResize() {
        fitCanvas();
    }

    // ── Main loop ─────────────────────────────────────────────
    function loop(timestamp) {
        animFrame = requestAnimationFrame(loop);
        const dt = timestamp - (lastTime || timestamp);
        lastTime = timestamp;
        frameCount++;

        ctx.save();

        // Loading screen
        if (state === ST_LOADING) {
            drawLoading();
            if (allSpritesReady) state = ST_TITLE;
            ctx.restore();
            return;
        }

        if (state === ST_TITLE) {
            drawTitleScreen();
            drawParticles();
            updateParticles();
            ctx.restore();
            return;
        }

        if (state === ST_LOG) {
            drawCollectionLog();
            ctx.restore();
            return;
        }

        // Update day timer
        if (state >= ST_IDLE && state <= ST_REELING && gameActive) {
            dayTimer -= dt / 1000;
            if (dayTimer <= 0) {
                dayTimer = 0;
                state = ST_DAY_OVER;
                playDayEnd();
                level = totalCaught;
            }
        }

        // Ambient sounds (occasional)
        if (frameCount % 300 === 0 && Math.random() > 0.5) playWaterLap();
        if (frameCount % 500 === 0 && Math.random() > 0.6) playBirdChirp();

        // Draw scene
        drawSky();
        drawWater();
        drawEnvironmentBack();
        drawAmbientFish();
        drawEnvironmentFront();
        drawDock();
        updateClouds();
        updateAmbientFish();
        updateBubbles();

        // State updates
        if (state === ST_CHARGING) {
            castPower += CAST_POWER_SPEED * dt / 1000;
            if (castPower > 1) castPower = 1;
        }

        if (state === ST_CASTING) {
            lineAnimT += dt / 400;
            if (lineAnimT >= 1) {
                lineAnimT = 1;
                spawnSplash(lineX, WATER_Y);
                playSplash();
                startWaiting();
            }
        }

        if (state === ST_WAITING) {
            waitTimer -= dt;
            // Gentle bobber motion
            bobberDip = Math.sin(frameCount * 0.04) * 2;
            if (waitTimer <= 0) {
                triggerBite();
            }
        }

        if (state === ST_BITE) {
            biteTimer -= dt;
            bobberDip = 6 + Math.sin(frameCount * 0.3) * 3;
            if (biteTimer <= 0) {
                fishGotAway();
            }
        }

        if (state === ST_REELING) {
            reelIndicator += reelSpeed * reelDir;
            if (reelIndicator >= 1) { reelIndicator = 1; reelDir = -1; }
            if (reelIndicator <= 0) { reelIndicator = 0; reelDir = 1; }
            // Natural tension increase
            reelTension += 0.0005;
            reelTension = Math.min(1, reelTension);
            // Bobber jiggles
            bobberDip = 4 + Math.sin(frameCount * 0.15) * 4;
        }

        if (state === ST_CAUGHT) {
            caughtTimer -= dt;
            if (caughtTimer <= 0) returnToIdle();
        }

        if (state === ST_MISSED) {
            missedTimer -= dt;
            if (missedTimer <= 0) returnToIdle();
        }

        // Draw fishing elements
        drawLine();
        drawPowerMeter();
        drawReelGame();
        drawHUD();
        drawCaughtDisplay();
        drawMissedDisplay();
        drawDayOver();

        updateParticles();
        drawParticles();

        ctx.restore();
    }

    // ── Public API ────────────────────────────────────────────
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas     = canvasEl;
        ctx        = canvas.getContext('2d');
        playerObj  = activePlayer || null;
        onGameOver = gameOverCallback || null;

        // Load theme
        const themeId = activePlayer?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            GLOW_CLR   = _t.colors[0] || GLOW_CLR;
            ACCENT_CLR = _t.colors[1] || ACCENT_CLR;
        }

        keys = {};
        particles = [];
        frameCount = 0;
        titlePulse = 0;
        lastTime = 0;
        waveOffset = 0;
        spaceHeld = false;
        state = ST_LOADING;
        gameActive = false;
        score = 0;
        totalCaught = 0;
        level = 0;

        collection = new Set();
        caughtCounts = {};

        // Reset sprite state
        allSpritesReady = false;
        spritesLoaded = 0;

        initAmbientFish();
        initClouds();
        initEnvironment();
        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        // Load sprites (game starts rendering loading screen immediately)
        loadSprites(
            (loaded, total) => { /* progress tracked via spritesLoaded */ },
            () => { /* allSpritesReady set in loadSprites */ }
        );

        // Bind events
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup',   onKeyUp);
        window.addEventListener('resize',  onResize);
        canvas.addEventListener('mousedown',  onMouseDown);
        canvas.addEventListener('mouseup',    onMouseUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: true });
        canvas.addEventListener('touchend',   onTouchEnd,   { passive: true });

        animFrame = requestAnimationFrame(loop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;

        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup',   onKeyUp);
        window.removeEventListener('resize',  onResize);

        if (canvas) {
            canvas.removeEventListener('mousedown',  onMouseDown);
            canvas.removeEventListener('mouseup',    onMouseUp);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchend',   onTouchEnd);
        }
        canvas = null;
        ctx    = null;

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
        isActive()  { return gameActive; }
    };
})();
