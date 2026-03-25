/* MiniStroke — Pool table meets mini golf obstacles
 * Billiards mashup with windmills, bumpers, tunnels, ramps & more.
 * Uses Kenney Physics Pack sprites for professional visuals.
 * IIFE: window.MiniStroke with init(canvas, player, onGameOver) and destroy() */
window.MiniStroke = (() => {

    // ── roundRect polyfill (Safari <16) ──
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
    const GAME_W = 640, GAME_H = 400;
    const RAIL_W = 18;
    const POCKET_R = 14;
    const BALL_R = 7;
    const CUE_BALL_R = 7;
    const FRICTION = 0.992;
    const SAND_FRICTION = 0.96;
    const ICE_FRICTION = 0.998;
    const MIN_SPEED = 0.08;
    const MAX_POWER = 18;
    const BUMPER_BOUNCE = 1.25;
    const WALL_PUSH_BUFFER = 2;       // extra px to push ball out of wall
    const STUCK_SPEED_THRESH = 0.1;   // velocity threshold for stuck detection
    const STUCK_FRAME_LIMIT = 120;    // frames before auto-nudge
    const POCKET_SUCTION_RADIUS_MULT = 2; // suction activates within 2x pocket radius
    const POCKET_SUCTION_SPEED = 2;   // max ball speed for suction to engage
    const POCKET_SUCTION_FORCE = 0.08; // gentle pull strength
    const PI2 = Math.PI * 2;

    // Kenney Physics Pack base path
    const KP = '/img/game-assets/kenney-physics';

    // Pocket positions (6 pockets)
    const POCKETS = [
        { x: RAIL_W + 2, y: RAIL_W + 2 },
        { x: GAME_W / 2, y: RAIL_W - 2 },
        { x: GAME_W - RAIL_W - 2, y: RAIL_W + 2 },
        { x: RAIL_W + 2, y: GAME_H - RAIL_W - 2 },
        { x: GAME_W / 2, y: GAME_H - RAIL_W + 2 },
        { x: GAME_W - RAIL_W - 2, y: GAME_H - RAIL_W - 2 }
    ];

    // Ball colors (standard 8-ball: solids 1-7, 8=black, stripes 9-15)
    const BALL_COLORS = [
        '#FFFFFF', // 0 = cue
        '#FFD700', // 1 - yellow (solid)
        '#1E90FF', // 2 - blue (solid)
        '#FF4444', // 3 - red (solid)
        '#6B21A8', // 4 - purple (solid)
        '#FF8C00', // 5 - orange (solid)
        '#228B22', // 6 - green (solid)
        '#8B0000', // 7 - maroon (solid)
        '#222222', // 8 - black (8-ball)
        '#FFD700', // 9 - yellow (stripe)
        '#1E90FF', // 10 - blue (stripe)
        '#FF4444', // 11 - red (stripe)
        '#6B21A8', // 12 - purple (stripe)
        '#FF8C00', // 13 - orange (stripe)
        '#228B22', // 14 - green (stripe)
        '#8B0000', // 15 - maroon (stripe)
    ];

    // ── Course definitions ──
    const COURSES = [
        {
            name: 'Tutorial', par: 8, balls: 15,
            desc: 'Just bumpers. Learn the ropes!',
            obstacles: [
                { type: 'bumper', x: 200, y: 150, r: 15 },
                { type: 'bumper', x: 440, y: 250, r: 15 },
                { type: 'bumper', x: 320, y: 200, r: 12 },
            ]
        },
        {
            name: 'The Windmill', par: 10, balls: 15,
            desc: 'A spinning windmill guards the center.',
            obstacles: [
                { type: 'windmill', x: 320, y: 200, armLen: 55, speed: 0.015 },
                { type: 'bumper', x: 150, y: 120, r: 10 },
                { type: 'bumper', x: 490, y: 280, r: 10 },
            ]
        },
        {
            name: 'Pinball', par: 12, balls: 15,
            desc: 'Bumpers everywhere!',
            obstacles: [
                { type: 'bumper', x: 160, y: 100, r: 14 },
                { type: 'bumper', x: 280, y: 140, r: 12 },
                { type: 'bumper', x: 400, y: 100, r: 14 },
                { type: 'bumper', x: 220, y: 230, r: 16 },
                { type: 'bumper', x: 370, y: 260, r: 12 },
                { type: 'bumper', x: 500, y: 180, r: 14 },
                { type: 'bumper', x: 140, y: 300, r: 12 },
                { type: 'bumper', x: 480, y: 310, r: 14 },
            ]
        },
        {
            name: 'The Maze', par: 14, balls: 15,
            desc: 'Navigate the wall channels.',
            obstacles: [
                { type: 'wall', x: 200, y: 80, w: 12, h: 120 },
                { type: 'wall', x: 200, y: 250, w: 12, h: 100 },
                { type: 'wall', x: 350, y: 80, w: 12, h: 100 },
                { type: 'wall', x: 350, y: 230, w: 12, h: 120 },
                { type: 'wall', x: 250, y: 180, w: 80, h: 12 },
                { type: 'wall', x: 400, y: 180, w: 80, h: 12 },
            ]
        },
        {
            name: 'Slip & Slide', par: 11, balls: 15,
            desc: 'Ice and sand patches change the game.',
            obstacles: [
                { type: 'sand', x: 140, y: 100, w: 100, h: 70 },
                { type: 'ice', x: 400, y: 90, w: 120, h: 70 },
                { type: 'sand', x: 380, y: 260, w: 110, h: 70 },
                { type: 'ice', x: 140, y: 260, w: 100, h: 70 },
                { type: 'bumper', x: 320, y: 200, r: 12 },
            ]
        },
        {
            name: 'Double Trouble', par: 14, balls: 15,
            desc: 'Two windmills make life hard.',
            obstacles: [
                { type: 'windmill', x: 210, y: 160, armLen: 45, speed: 0.018 },
                { type: 'windmill', x: 430, y: 240, armLen: 45, speed: -0.014 },
                { type: 'bumper', x: 320, y: 200, r: 10 },
                { type: 'bumper', x: 160, y: 300, r: 10 },
                { type: 'bumper', x: 480, y: 100, r: 10 },
            ]
        },
        {
            name: 'The Gauntlet', par: 16, balls: 15,
            desc: 'Moving walls and bumpers!',
            obstacles: [
                { type: 'movingWall', x: 200, y: 100, w: 60, h: 12, axis: 'y', range: 100, speed: 0.8 },
                { type: 'movingWall', x: 400, y: 200, w: 12, h: 60, axis: 'x', range: 80, speed: 1.0 },
                { type: 'movingWall', x: 300, y: 300, w: 60, h: 12, axis: 'y', range: 60, speed: 0.6 },
                { type: 'bumper', x: 150, y: 200, r: 14 },
                { type: 'bumper', x: 500, y: 150, r: 14 },
                { type: 'bumper', x: 320, y: 120, r: 12 },
            ]
        },
        {
            name: 'Warp Zone', par: 14, balls: 15,
            desc: 'Tunnels warp balls across the table!',
            obstacles: [
                { type: 'tunnel', x1: 140, y1: 120, x2: 500, y2: 300, color: '#FF6B6B' },
                { type: 'tunnel', x1: 500, y1: 120, x2: 140, y2: 300, color: '#6BCB77' },
                { type: 'bumper', x: 320, y: 200, r: 14 },
                { type: 'bumper', x: 240, y: 140, r: 10 },
                { type: 'bumper', x: 400, y: 260, r: 10 },
            ]
        },
        {
            name: 'The Final Stroke', par: 20, balls: 15,
            desc: 'EVERYTHING at once. Good luck!',
            obstacles: [
                { type: 'windmill', x: 320, y: 200, armLen: 50, speed: 0.012 },
                { type: 'bumper', x: 180, y: 130, r: 12 },
                { type: 'bumper', x: 460, y: 270, r: 12 },
                { type: 'movingWall', x: 240, y: 280, w: 50, h: 10, axis: 'x', range: 60, speed: 0.7 },
                { type: 'movingWall', x: 420, y: 120, w: 10, h: 50, axis: 'y', range: 50, speed: 0.9 },
                { type: 'sand', x: 130, y: 250, w: 70, h: 50 },
                { type: 'ice', x: 450, y: 100, w: 80, h: 50 },
                { type: 'tunnel', x1: 150, y1: 100, x2: 490, y2: 310, color: '#FFD93D' },
                { type: 'wall', x: 280, y: 130, w: 8, h: 50 },
                { type: 'wall', x: 360, y: 250, w: 8, h: 50 },
            ]
        }
    ];

    // ── Game states ──
    const ST_LOADING = -1;
    const ST_COURSE_SELECT = 0;
    const ST_AIMING = 1;
    const ST_ROLLING = 2;
    const ST_POCKET_ANIM = 3;
    const ST_COURSE_COMPLETE = 4;
    const ST_TITLE = 5;

    // Hi-res ball cache (4x resolution)
    const BALL_CACHE_SCALE = 4;
    let ballCanvasCache = {};

    // ── Module-level variables ──
    let canvas, ctx, W, H, scale, dpr;
    let state, gameActive;
    let animFrame = null;
    let audioCtx = null;
    let _player = null;
    let _onGameOver = null;
    let theme = null;

    // Course state
    let currentCourse = 0;
    let strokes = 0;
    let totalStrokes = 0;
    let coursesCompleted = [];
    let trickShots = 0;
    let _startTime = 0;

    // Aiming
    let aimAngle = 0;
    let aimPower = 0;
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let mouseX = 0, mouseY = 0;

    // Balls
    let balls = [];
    let cueBall = null;

    // Obstacles (runtime)
    let obstacles = [];

    // Particles
    let particles = [];
    let floatingTexts = [];

    // Pocket animation
    let pocketAnimBall = null;
    let pocketAnimTimer = 0;
    let wasFirstShot = false;

    // Course select hover
    let hoverCourse = -1;
    let selectScroll = 0;

    // Frame counter
    let frameCount = 0;

    // Loading progress
    let loadProgress = 0;
    let loadTotal = 0;

    // ═══════════════════════════════════════════════════════════════
    // SPRITE SYSTEM
    // ═══════════════════════════════════════════════════════════════
    const spriteCache = {};
    let spritesLoaded = false;

    // Pre-rendered canvases for tiled textures
    let feltPattern = null;
    let sandPattern = null;
    let icePattern = null;

    function getSprite(key) {
        return spriteCache[key] || null;
    }

    function loadImage(src) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => { console.warn('MiniStroke: Failed to load:', src); resolve(null); };
            img.src = src;
        });
    }

    async function preloadAllSprites() {
        const manifest = [];

        // Wood elements for rails, walls, windmill arms, cue stick
        const woodIndices = [
            '003','004','005','010','011','014','018','019','022','026',
            '030','031','032','033','034','040','041','042','043','044',
            '045','046','047','048','049','050','051','052','053','054'
        ];
        for (const idx of woodIndices) {
            manifest.push({ key: `wood/${idx}`, src: `${KP}/wood/elementWood${idx}.png` });
        }

        // Metal elements for bumpers, tunnel portals, pocket rims, diamond markers, gear hubs
        const metalIndices = [
            '000','001','002','003','004','005','010','011','014','018',
            '019','022','026','030','031','032','033','034','040','041',
            '042','043','044','045','046','047','048','049','050','051',
            '052','053','054','055','056','057'
        ];
        for (const idx of metalIndices) {
            manifest.push({ key: `metal/${idx}`, src: `${KP}/metal/elementMetal${idx}.png` });
        }

        // Stone elements for static walls
        const stoneIndices = [
            '010','011','014','018','019','022','026','030','031','032',
            '033','034','040','041','042','043','044','045'
        ];
        for (const idx of stoneIndices) {
            manifest.push({ key: `stone/${idx}`, src: `${KP}/stone/elementStone${idx}.png` });
        }

        // Glass elements for ice patches
        const glassIndices = [
            '010','011','014','018','019','022','026','030','031','032',
            '033','034','040','041','042','043','044','045'
        ];
        for (const idx of glassIndices) {
            manifest.push({ key: `glass/${idx}`, src: `${KP}/glass/elementGlass${idx}.png` });
        }

        // Backgrounds
        manifest.push({ key: 'bg/colored_grass', src: `${KP}/backgrounds/colored_grass.png` });
        manifest.push({ key: 'bg/colored_desert', src: `${KP}/backgrounds/colored_desert.png` });
        manifest.push({ key: 'bg/colored_land', src: `${KP}/backgrounds/colored_land.png` });

        // Debris for particle effects
        for (let i = 1; i <= 3; i++) {
            manifest.push({ key: `debris/wood_${i}`, src: `${KP}/debris/debrisWood_${i}.png` });
            manifest.push({ key: `debris/stone_${i}`, src: `${KP}/debris/debrisStone_${i}.png` });
            manifest.push({ key: `debris/glass_${i}`, src: `${KP}/debris/debrisGlass_${i}.png` });
        }

        // Other assets: stars, coins, sand, grass, dirt, rock
        const otherAssets = [
            'starGold', 'starSilver', 'starBronze', 'starDiamond',
            'coinGold', 'coinSilver', 'coinBronze', 'coinDiamond',
            'sand', 'grass', 'dirt', 'rock',
            'bush', 'cactus', 'snow', 'frozenBush',
            'flagRed', 'flagGreen', 'flagBlue', 'flagYellow'
        ];
        for (const name of otherAssets) {
            manifest.push({ key: `other/${name}`, src: `${KP}/other/${name}.png` });
        }

        // Explosive for special effects
        const explosiveIndices = ['010','011','014','018','019','022','026'];
        for (const idx of explosiveIndices) {
            manifest.push({ key: `explosive/${idx}`, src: `${KP}/explosive/elementExplosive${idx}.png` });
        }

        loadTotal = manifest.length;
        loadProgress = 0;

        // Load all sprites in parallel batches
        const batchSize = 20;
        for (let i = 0; i < manifest.length; i += batchSize) {
            const batch = manifest.slice(i, i + batchSize);
            const results = await Promise.all(batch.map(item => loadImage(item.src)));
            results.forEach((img, idx) => {
                if (img) spriteCache[batch[idx].key] = img;
                loadProgress++;
            });
            // Draw loading screen
            if (ctx) drawLoadingScreen();
        }

        // Build tiled texture patterns
        buildFeltPattern();
        buildSandPattern();
        buildIcePattern();

        spritesLoaded = true;
    }

    function buildFeltPattern() {
        const grassSprite = getSprite('other/grass');
        const c = document.createElement('canvas');
        c.width = 128; c.height = 128;
        const cx = c.getContext('2d');

        if (grassSprite) {
            // Tile the grass sprite with a dark green overlay for rich felt texture
            for (let y = 0; y < 128; y += grassSprite.height) {
                for (let x = 0; x < 128; x += grassSprite.width) {
                    cx.drawImage(grassSprite, x, y);
                }
            }
        }
        // Dark green overlay for pool table felt
        cx.globalCompositeOperation = 'multiply';
        cx.fillStyle = '#1B7535';
        cx.fillRect(0, 0, 128, 128);
        cx.globalCompositeOperation = 'source-over';
        // Subtle brightness boost
        cx.fillStyle = 'rgba(30,140,60,0.35)';
        cx.fillRect(0, 0, 128, 128);

        try { feltPattern = ctx.createPattern(c, 'repeat'); } catch {}
    }

    function buildSandPattern() {
        const sandSprite = getSprite('other/sand');
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const cx = c.getContext('2d');

        if (sandSprite) {
            cx.drawImage(sandSprite, 0, 0, 64, 64);
        } else {
            cx.fillStyle = '#C4B280';
            cx.fillRect(0, 0, 64, 64);
        }
        // Warm sand overlay
        cx.fillStyle = 'rgba(194,178,128,0.3)';
        cx.fillRect(0, 0, 64, 64);

        try { sandPattern = ctx.createPattern(c, 'repeat'); } catch {}
    }

    function buildIcePattern() {
        const glassSprite = getSprite('glass/010');
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const cx = c.getContext('2d');

        if (glassSprite) {
            cx.drawImage(glassSprite, 0, 0, 64, 64);
        } else {
            cx.fillStyle = '#B0D8F0';
            cx.fillRect(0, 0, 64, 64);
        }
        // Blue tint overlay for ice
        cx.globalCompositeOperation = 'multiply';
        cx.fillStyle = '#88CCFF';
        cx.fillRect(0, 0, 64, 64);
        cx.globalCompositeOperation = 'source-over';
        cx.fillStyle = 'rgba(200,230,255,0.25)';
        cx.fillRect(0, 0, 64, 64);

        try { icePattern = ctx.createPattern(c, 'repeat'); } catch {}
    }

    function drawLoadingScreen() {
        ctx.save();
        ctx.clearRect(0, 0, W, H);
        // Dark background
        ctx.fillStyle = '#0A1628';
        ctx.fillRect(0, 0, W, H);

        // Title
        ctx.fillStyle = '#F472B6';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('MiniStroke', W / 2, H / 2 - 50);

        ctx.fillStyle = '#AABBCC';
        ctx.font = '12px Arial';
        ctx.fillText('Loading sprites...', W / 2, H / 2 - 20);

        // Progress bar background
        const barW = 200, barH = 12;
        const barX = (W - barW) / 2;
        const barY = H / 2;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, [6]);
        ctx.fill();

        // Progress bar fill
        const pct = loadTotal > 0 ? loadProgress / loadTotal : 0;
        if (pct > 0) {
            const pg = ctx.createLinearGradient(barX, barY, barX + barW, barY);
            pg.addColorStop(0, '#22CC44');
            pg.addColorStop(1, '#44EEBB');
            ctx.fillStyle = pg;
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW * pct, barH, [6]);
            ctx.fill();
        }

        // Percentage text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px Arial';
        ctx.fillText(`${Math.round(pct * 100)}%`, W / 2, barY + barH + 16);

        ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════════
    // SPRITE DRAWING HELPERS
    // ═══════════════════════════════════════════════════════════════

    /** Draw a sprite scaled to fit a rectangle, or fallback to color fill */
    function drawSpriteRect(key, x, y, w, h, fallbackColor) {
        const spr = getSprite(key);
        if (spr) {
            ctx.drawImage(spr, x, y, w, h);
        } else {
            ctx.fillStyle = fallbackColor || '#888';
            ctx.fillRect(x, y, w, h);
        }
    }

    /** Draw a sprite centered and rotated */
    function drawSpriteRotated(key, cx, cy, w, h, angle, fallbackColor) {
        const spr = getSprite(key);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        if (spr) {
            ctx.drawImage(spr, -w / 2, -h / 2, w, h);
        } else {
            ctx.fillStyle = fallbackColor || '#888';
            ctx.fillRect(-w / 2, -h / 2, w, h);
        }
        ctx.restore();
    }

    /** Draw a sprite as a circle (clip to circle) */
    function drawSpriteCircle(key, cx, cy, r, fallbackGradient) {
        const spr = getSprite(key);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, PI2);
        ctx.clip();
        if (spr) {
            ctx.drawImage(spr, cx - r, cy - r, r * 2, r * 2);
        } else if (fallbackGradient) {
            ctx.fillStyle = fallbackGradient;
            ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
        ctx.restore();
    }

    /** Tile a sprite along a rectangular area */
    function tileSpriteRect(key, x, y, w, h, tileW, tileH, fallbackColor) {
        const spr = getSprite(key);
        if (spr) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            const tw = tileW || spr.width;
            const th = tileH || spr.height;
            for (let ty = y; ty < y + h; ty += th) {
                for (let tx = x; tx < x + w; tx += tw) {
                    ctx.drawImage(spr, tx, ty, tw, th);
                }
            }
            ctx.restore();
        } else {
            ctx.fillStyle = fallbackColor || '#888';
            ctx.fillRect(x, y, w, h);
        }
    }

    // ── Audio ──
    function getAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
        }
        return audioCtx;
    }

    function playSound(type) {
        const ac = getAudio(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            const t = ac.currentTime;
            switch (type) {
                case 'hit':
                    osc.frequency.value = 800;
                    osc.type = 'triangle';
                    gain.gain.setValueAtTime(0.15, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                    osc.start(t); osc.stop(t + 0.12);
                    break;
                case 'cushion':
                    osc.frequency.value = 300;
                    osc.type = 'square';
                    gain.gain.setValueAtTime(0.08, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                    osc.start(t); osc.stop(t + 0.08);
                    break;
                case 'collide':
                    osc.frequency.value = 600;
                    osc.type = 'triangle';
                    gain.gain.setValueAtTime(0.10, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                    osc.start(t); osc.stop(t + 0.08);
                    break;
                case 'pocket':
                    osc.frequency.value = 500;
                    osc.type = 'sine';
                    gain.gain.setValueAtTime(0.12, t);
                    osc.frequency.linearRampToValueAtTime(200, t + 0.25);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                    osc.start(t); osc.stop(t + 0.3);
                    break;
                case 'bumper':
                    osc.frequency.value = 1200;
                    osc.type = 'sine';
                    gain.gain.setValueAtTime(0.12, t);
                    osc.frequency.exponentialRampToValueAtTime(600, t + 0.1);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                    osc.start(t); osc.stop(t + 0.15);
                    break;
                case 'windmill':
                    osc.frequency.value = 250;
                    osc.type = 'sawtooth';
                    gain.gain.setValueAtTime(0.06, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                    osc.start(t); osc.stop(t + 0.15);
                    break;
                case 'tunnel': {
                    osc.frequency.value = 400;
                    osc.type = 'sine';
                    gain.gain.setValueAtTime(0.10, t);
                    osc.frequency.linearRampToValueAtTime(800, t + 0.2);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                    osc.start(t); osc.stop(t + 0.3);
                    break;
                }
                case 'sand':
                    osc.frequency.value = 150;
                    osc.type = 'sawtooth';
                    gain.gain.setValueAtTime(0.04, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                    osc.start(t); osc.stop(t + 0.1);
                    break;
                case 'ice':
                    osc.frequency.value = 2000;
                    osc.type = 'sine';
                    gain.gain.setValueAtTime(0.03, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                    osc.start(t); osc.stop(t + 0.08);
                    break;
                case 'trickshot': {
                    const notes = [523, 659, 784, 1047];
                    notes.forEach((freq, i) => {
                        const o2 = ac.createOscillator();
                        const g2 = ac.createGain();
                        o2.connect(g2); g2.connect(ac.destination);
                        o2.frequency.value = freq;
                        o2.type = 'sine';
                        g2.gain.setValueAtTime(0.10, t + i * 0.08);
                        g2.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.3);
                        o2.start(t + i * 0.08);
                        o2.stop(t + i * 0.08 + 0.3);
                    });
                    gain.gain.setValueAtTime(0, t);
                    osc.start(t); osc.stop(t + 0.01);
                    break;
                }
                case 'complete': {
                    const melody = [523, 659, 784, 1047, 784, 1047];
                    melody.forEach((freq, i) => {
                        const o2 = ac.createOscillator();
                        const g2 = ac.createGain();
                        o2.connect(g2); g2.connect(ac.destination);
                        o2.frequency.value = freq;
                        o2.type = 'sine';
                        g2.gain.setValueAtTime(0.10, t + i * 0.1);
                        g2.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.25);
                        o2.start(t + i * 0.1);
                        o2.stop(t + i * 0.1 + 0.25);
                    });
                    gain.gain.setValueAtTime(0, t);
                    osc.start(t); osc.stop(t + 0.01);
                    break;
                }
                default:
                    gain.gain.setValueAtTime(0, t);
                    osc.start(t); osc.stop(t + 0.01);
            }
        } catch {}
    }

    // ── Theme helpers ──
    function getTheme() {
        if (window.ArcadeThemes && _player?.character) {
            return window.ArcadeThemes.getTheme?.(_player.character) || null;
        }
        return null;
    }

    function accentColor() {
        if (theme && theme.colors?.length) return theme.colors[0];
        return '#F472B6';
    }

    function secondaryColor() {
        if (theme && theme.colors?.length > 1) return theme.colors[1];
        return '#8B5CF6';
    }

    // ── Utility ──
    function dist(x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function lerp(a, b, t) { return a + (b - a) * t; }

    // ── Canvas sizing ──
    function resize() {
        const parent = canvas.parentElement;
        if (!parent) return;
        dpr = window.devicePixelRatio || 1;
        const pw = parent.clientWidth;
        const ph = parent.clientHeight;
        const aspect = GAME_W / GAME_H;
        let w, h;
        if (pw / ph > aspect) {
            h = ph; w = h * aspect;
        } else {
            w = pw; h = w / aspect;
        }
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        canvas.width = GAME_W * dpr;
        canvas.height = GAME_H * dpr;
        W = GAME_W;
        H = GAME_H;
        scale = w / GAME_W;
        ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ── Input coords ──
    function inputPos(e) {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] || e.changedTouches[0] : e;
        return {
            x: (touch.clientX - rect.left) / scale,
            y: (touch.clientY - rect.top) / scale
        };
    }

    // ── Ball setup (standard 8-ball rack: 15 balls, 8 in center) ──
    function setupBalls(count) {
        balls = [];
        cueBall = { x: 160, y: GAME_H / 2, vx: 0, vy: 0, r: CUE_BALL_R, color: BALL_COLORS[0], number: 0, active: true, pocketed: false, stuckFrames: 0 };
        balls.push(cueBall);

        const startX = GAME_W * 0.65;
        const startY = GAME_H / 2;
        const spacing = BALL_R * 2.3;

        // Build standard 8-ball rack order (8-ball at center of row 3)
        const solids = [1, 2, 3, 4, 5, 6, 7];
        const stripes = [9, 10, 11, 12, 13, 14, 15];
        for (let i = solids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [solids[i], solids[j]] = [solids[j], solids[i]];
        }
        for (let i = stripes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [stripes[i], stripes[j]] = [stripes[j], stripes[i]];
        }
        const rackOrder = [];
        rackOrder.push(solids.pop());           // row 1
        rackOrder.push(stripes.pop());          // row 2
        rackOrder.push(solids.pop());           // row 2
        rackOrder.push(solids.pop());           // row 3
        rackOrder.push(8);                       // row 3 CENTER
        rackOrder.push(stripes.pop());          // row 3
        rackOrder.push(stripes.pop());          // row 4
        rackOrder.push(solids.pop());           // row 4
        rackOrder.push(stripes.pop());          // row 4
        rackOrder.push(solids.pop());           // row 4
        rackOrder.push(solids.pop());           // row 5 corner
        rackOrder.push(stripes.pop());          // row 5
        rackOrder.push(solids.pop());           // row 5
        rackOrder.push(stripes.pop());          // row 5
        rackOrder.push(stripes.pop());          // row 5 corner

        let idx = 0;
        for (let row = 0; row < 5; row++) {
            const cols = row + 1;
            for (let c = 0; c < cols; c++) {
                const bx = startX + row * spacing * 0.866;
                const by = startY + (c - (cols - 1) / 2) * spacing;
                // Nudge balls that overlap obstacles
                let fx = bx, fy = by;
                for (const obs of obstacles) {
                    if (obs.type === 'bumper' && dist(fx, fy, obs.x, obs.y) < obs.r + BALL_R + 5) {
                        const angle = Math.atan2(fy - obs.y, fx - obs.x);
                        fx = obs.x + Math.cos(angle) * (obs.r + BALL_R + 6);
                        fy = obs.y + Math.sin(angle) * (obs.r + BALL_R + 6);
                    }
                    if (obs.type === 'windmill' && dist(fx, fy, obs.x, obs.y) < obs.armLen + BALL_R + 5) {
                        const angle = Math.atan2(fy - obs.y, fx - obs.x);
                        fx = obs.x + Math.cos(angle) * (obs.armLen + BALL_R + 6);
                        fy = obs.y + Math.sin(angle) * (obs.armLen + BALL_R + 6);
                    }
                }
                const num = rackOrder[idx++];
                balls.push({
                    x: fx, y: fy, vx: 0, vy: 0, r: BALL_R,
                    color: BALL_COLORS[num],
                    number: num, active: true, pocketed: false,
                    striped: num >= 9 && num <= 15,
                    stuckFrames: 0
                });
            }
        }
    }

    // ── Obstacle setup ──
    function setupObstacles(courseDef) {
        obstacles = [];
        for (const o of courseDef.obstacles) {
            const obs = Object.assign({}, o);
            if (obs.type === 'windmill') {
                obs.angle = 0;
            }
            if (obs.type === 'movingWall') {
                obs.offset = 0;
                obs.baseX = obs.x;
                obs.baseY = obs.y;
                obs.time = Math.random() * Math.PI * 2;
            }
            // Track bumper hit glow
            if (obs.type === 'bumper') {
                obs.glowTimer = 0;
            }
            obstacles.push(obs);
        }
    }

    // ── Start course ──
    function startCourse(idx) {
        currentCourse = idx;
        strokes = 0;
        wasFirstShot = true;
        const def = COURSES[idx];
        setupObstacles(def);
        setupBalls(def.balls);
        particles = [];
        floatingTexts = [];
        pocketAnimBall = null;
        state = ST_AIMING;
    }

    // ── All balls potted check ──
    function allBallsPotted() {
        return balls.filter(b => b.number !== 0 && b.active && !b.pocketed).length === 0;
    }

    // ── All balls stopped ──
    function allBallsStopped() {
        for (const b of balls) {
            if (!b.active) continue;
            const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
            if (spd > MIN_SPEED) return false;
        }
        return true;
    }

    // ── Physics step ──
    function physicsTick() {
        frameCount++;
        // Update obstacles
        for (const obs of obstacles) {
            if (obs.type === 'windmill') {
                obs.angle += obs.speed;
            }
            if (obs.type === 'movingWall') {
                obs.time += 0.02;
                if (obs.axis === 'x') {
                    obs.x = obs.baseX + Math.sin(obs.time * obs.speed) * obs.range;
                } else {
                    obs.y = obs.baseY + Math.sin(obs.time * obs.speed) * obs.range;
                }
            }
            // Decay bumper glow
            if (obs.type === 'bumper' && obs.glowTimer > 0) {
                obs.glowTimer--;
            }
        }

        // Move balls
        for (const b of balls) {
            if (!b.active || b.pocketed) continue;
            b.x += b.vx;
            b.y += b.vy;

            // Determine surface friction
            let fric = FRICTION;
            for (const obs of obstacles) {
                if (obs.type === 'sand') {
                    if (b.x > obs.x && b.x < obs.x + obs.w && b.y > obs.y && b.y < obs.y + obs.h) {
                        fric = SAND_FRICTION;
                        if (Math.random() < 0.05) playSound('sand');
                    }
                }
                if (obs.type === 'ice') {
                    if (b.x > obs.x && b.x < obs.x + obs.w && b.y > obs.y && b.y < obs.y + obs.h) {
                        fric = ICE_FRICTION;
                        if (Math.random() < 0.03) playSound('ice');
                    }
                }
            }
            b.vx *= fric;
            b.vy *= fric;

            // Stop if very slow
            const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
            if (spd < MIN_SPEED) { b.vx = 0; b.vy = 0; }

            // Cushion bounce with proper push-out
            const left = RAIL_W + b.r;
            const right = GAME_W - RAIL_W - b.r;
            const top = RAIL_W + b.r;
            const bottom = GAME_H - RAIL_W - b.r;
            let hitWallThisFrame = false;
            if (b.x < left)   { b.x = left + WALL_PUSH_BUFFER;   b.vx = Math.abs(b.vx) * 0.8; hitWallThisFrame = true; playSound('cushion'); }
            if (b.x > right)  { b.x = right - WALL_PUSH_BUFFER;  b.vx = -Math.abs(b.vx) * 0.8; hitWallThisFrame = true; playSound('cushion'); }
            if (b.y < top)    { b.y = top + WALL_PUSH_BUFFER;    b.vy = Math.abs(b.vy) * 0.8; hitWallThisFrame = true; playSound('cushion'); }
            if (b.y > bottom) { b.y = bottom - WALL_PUSH_BUFFER; b.vy = -Math.abs(b.vy) * 0.8; hitWallThisFrame = true; playSound('cushion'); }

            // Corner trapping: if ball hit two rail walls, push diagonally inward
            if (hitWallThisFrame) {
                const nearLeft = b.x - left < 4;
                const nearRight = right - b.x < 4;
                const nearTop = b.y - top < 4;
                const nearBottom = bottom - b.y < 4;
                const inCorner = (nearLeft || nearRight) && (nearTop || nearBottom);
                if (inCorner) {
                    // Push diagonally toward center
                    const pushX = nearLeft ? 5 : -5;
                    const pushY = nearTop ? 5 : -5;
                    b.x += pushX;
                    b.y += pushY;
                    // Give a little velocity kick if nearly stopped
                    if (Math.abs(b.vx) < STUCK_SPEED_THRESH) b.vx += pushX * 0.3;
                    if (Math.abs(b.vy) < STUCK_SPEED_THRESH) b.vy += pushY * 0.3;
                }
            }

            // Pocket suction — gently pull slow balls toward nearby pockets
            for (const p of POCKETS) {
                const pDist = dist(b.x, b.y, p.x, p.y);
                if (pDist < POCKET_R * POCKET_SUCTION_RADIUS_MULT && pDist > POCKET_R * 0.5 && spd < POCKET_SUCTION_SPEED && spd > 0) {
                    const pullNx = (p.x - b.x) / pDist;
                    const pullNy = (p.y - b.y) / pDist;
                    // Stronger pull the closer to the pocket and the slower the ball
                    const pullStrength = POCKET_SUCTION_FORCE * (1 - pDist / (POCKET_R * POCKET_SUCTION_RADIUS_MULT));
                    b.vx += pullNx * pullStrength;
                    b.vy += pullNy * pullStrength;
                }
            }

            // Stuck detection — track frames ball is nearly stationary near a wall
            {
                const nearRail = b.x < left + 5 || b.x > right - 5 || b.y < top + 5 || b.y > bottom - 5;
                let nearObstacle = false;
                for (const obs of obstacles) {
                    if (obs.type === 'wall' || obs.type === 'movingWall') {
                        const closX = clamp(b.x, obs.x, obs.x + obs.w);
                        const closY = clamp(b.y, obs.y, obs.y + obs.h);
                        if (dist(b.x, b.y, closX, closY) < b.r + 4) { nearObstacle = true; break; }
                    }
                    if (obs.type === 'windmill' && dist(b.x, b.y, obs.x, obs.y) < obs.armLen + b.r + 4) {
                        nearObstacle = true; break;
                    }
                }
                if (spd < STUCK_SPEED_THRESH && (nearRail || nearObstacle)) {
                    b.stuckFrames = (b.stuckFrames || 0) + 1;
                } else {
                    b.stuckFrames = 0;
                }
                // Auto-nudge after being stuck too long
                if (b.stuckFrames >= STUCK_FRAME_LIMIT) {
                    // Push toward table center
                    const toCenterX = GAME_W / 2 - b.x;
                    const toCenterY = GAME_H / 2 - b.y;
                    const toCenterD = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY) || 1;
                    b.x += (toCenterX / toCenterD) * 5;
                    b.y += (toCenterY / toCenterD) * 5;
                    b.vx += (toCenterX / toCenterD) * 0.5;
                    b.vy += (toCenterY / toCenterD) * 0.5;
                    b.stuckFrames = 0;
                }
            }

            // Pocket check
            for (const p of POCKETS) {
                if (dist(b.x, b.y, p.x, p.y) < POCKET_R + 2) {
                    if (b.number === 0) {
                        b.vx = 0; b.vy = 0;
                        b.x = 160; b.y = GAME_H / 2;
                        strokes++;
                        addFloatingText('SCRATCH!', b.x, b.y, '#FF4444');
                        playSound('pocket');
                    } else {
                        b.pocketed = true;
                        b.active = false;
                        pocketAnimBall = { x: p.x, y: p.y, color: b.color, number: b.number, striped: b.striped };
                        pocketAnimTimer = 20;
                        playSound('pocket');
                        if (wasFirstShot) {
                            trickShots++;
                            addFloatingText('TRICK SHOT!', b.x, b.y, '#FFD700');
                            playSound('trickshot');
                            spawnParticles(b.x, b.y, '#FFD700', 20);
                        }
                        spawnParticles(p.x, p.y, b.color, 10);
                    }
                }
            }

            // Obstacle collisions
            for (const obs of obstacles) {
                if (obs.type === 'bumper') {
                    const d = dist(b.x, b.y, obs.x, obs.y);
                    if (d < obs.r + b.r && d > 0) {
                        const nx = (b.x - obs.x) / d;
                        const ny = (b.y - obs.y) / d;
                        // Push ball out of bumper first
                        const overlap = (obs.r + b.r) - d + WALL_PUSH_BUFFER;
                        b.x += nx * overlap;
                        b.y += ny * overlap;
                        // Reflect velocity along normal
                        const dot = b.vx * nx + b.vy * ny;
                        b.vx -= 2 * dot * nx;
                        b.vy -= 2 * dot * ny;
                        // Apply COR boost (1.2-1.3 range, like pinball)
                        b.vx *= BUMPER_BOUNCE;
                        b.vy *= BUMPER_BOUNCE;
                        // Ensure minimum bounce speed so balls don't stick
                        const postSpd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
                        if (postSpd < 1.5) {
                            b.vx = nx * 1.5;
                            b.vy = ny * 1.5;
                        }
                        obs.glowTimer = 20; // trigger glow ring (slightly longer flash)
                        playSound('bumper');
                        spawnParticles(b.x, b.y, '#FFFFFF', 5);
                    }
                }
                if (obs.type === 'wall') {
                    resolveWallCollision(b, obs.x, obs.y, obs.w, obs.h);
                }
                if (obs.type === 'movingWall') {
                    resolveWallCollision(b, obs.x, obs.y, obs.w, obs.h);
                }
                if (obs.type === 'windmill') {
                    resolveWindmillCollision(b, obs);
                }
                if (obs.type === 'tunnel') {
                    if (dist(b.x, b.y, obs.x1, obs.y1) < 14 + b.r) {
                        b.x = obs.x2;
                        b.y = obs.y2;
                        b.vx *= 0.8;
                        b.vy *= 0.8;
                        playSound('tunnel');
                        spawnParticles(obs.x2, obs.y2, obs.color || '#FFFFFF', 8);
                    } else if (dist(b.x, b.y, obs.x2, obs.y2) < 14 + b.r) {
                        b.x = obs.x1;
                        b.y = obs.y1;
                        b.vx *= 0.8;
                        b.vy *= 0.8;
                        playSound('tunnel');
                        spawnParticles(obs.x1, obs.y1, obs.color || '#FFFFFF', 8);
                    }
                }
            }
        }

        // Ball-ball collisions
        for (let i = 0; i < balls.length; i++) {
            const a = balls[i];
            if (!a.active) continue;
            for (let j = i + 1; j < balls.length; j++) {
                const b = balls[j];
                if (!b.active) continue;
                const d = dist(a.x, a.y, b.x, b.y);
                const minD = a.r + b.r;
                if (d < minD && d > 0) {
                    const nx = (b.x - a.x) / d;
                    const ny = (b.y - a.y) / d;
                    const dvx = a.vx - b.vx;
                    const dvy = a.vy - b.vy;
                    const dot = dvx * nx + dvy * ny;
                    if (dot > 0) {
                        a.vx -= dot * nx;
                        a.vy -= dot * ny;
                        b.vx += dot * nx;
                        b.vy += dot * ny;
                        playSound('collide');
                    }
                    const overlap = minD - d;
                    a.x -= nx * overlap * 0.5;
                    a.y -= ny * overlap * 0.5;
                    b.x += nx * overlap * 0.5;
                    b.y += ny * overlap * 0.5;
                }
            }
        }

        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            p.vy += 0.05;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Update floating texts
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            const ft = floatingTexts[i];
            ft.y -= 0.8;
            ft.life--;
            if (ft.life <= 0) floatingTexts.splice(i, 1);
        }

        // Pocket anim countdown
        if (pocketAnimTimer > 0) pocketAnimTimer--;
    }

    function resolveWallCollision(b, wx, wy, ww, wh) {
        // Find closest point on wall rect to ball center
        const cx = clamp(b.x, wx, wx + ww);
        const cy = clamp(b.y, wy, wy + wh);
        const d = dist(b.x, b.y, cx, cy);

        if (d < b.r && d > 0) {
            // Ball overlaps wall edge — push out along normal
            const nx = (b.x - cx) / d;
            const ny = (b.y - cy) / d;
            const overlap = b.r - d + WALL_PUSH_BUFFER;
            // Push position out of wall first
            b.x += nx * overlap;
            b.y += ny * overlap;
            // Reflect velocity
            const dot = b.vx * nx + b.vy * ny;
            if (dot < 0) {
                b.vx -= 2 * dot * nx;
                b.vy -= 2 * dot * ny;
            }
            b.vx *= 0.85;
            b.vy *= 0.85;
            playSound('cushion');
        } else if (d === 0 && b.x >= wx && b.x <= wx + ww && b.y >= wy && b.y <= wy + wh) {
            // Ball center is fully inside wall — eject via nearest face
            const dLeft = b.x - wx;
            const dRight = wx + ww - b.x;
            const dTop = b.y - wy;
            const dBottom = wy + wh - b.y;
            const minD = Math.min(dLeft, dRight, dTop, dBottom);
            if (minD === dLeft)       { b.x = wx - b.r - WALL_PUSH_BUFFER; b.vx = -Math.abs(b.vx) * 0.85; }
            else if (minD === dRight) { b.x = wx + ww + b.r + WALL_PUSH_BUFFER; b.vx = Math.abs(b.vx) * 0.85; }
            else if (minD === dTop)   { b.y = wy - b.r - WALL_PUSH_BUFFER; b.vy = -Math.abs(b.vy) * 0.85; }
            else                      { b.y = wy + wh + b.r + WALL_PUSH_BUFFER; b.vy = Math.abs(b.vy) * 0.85; }
            playSound('cushion');
        }
    }

    function resolveWindmillCollision(b, obs) {
        const armW = 6;
        const armHalf = armW / 2;
        for (let i = 0; i < 4; i++) {
            const a = obs.angle + (Math.PI / 2) * i;
            const ax = Math.cos(a);
            const ay = Math.sin(a);
            const ex = obs.x + ax * obs.armLen;
            const ey = obs.y + ay * obs.armLen;
            const dx = ex - obs.x;
            const dy = ey - obs.y;
            const len2 = dx * dx + dy * dy;
            let t = ((b.x - obs.x) * dx + (b.y - obs.y) * dy) / len2;
            t = clamp(t, 0, 1);
            const closestX = obs.x + t * dx;
            const closestY = obs.y + t * dy;
            const d = dist(b.x, b.y, closestX, closestY);
            const minDist = b.r + armHalf;
            if (d < minDist) {
                const nx = (b.x - closestX) / (d || 1);
                const ny = (b.y - closestY) / (d || 1);
                // Always push the ball out of the arm first
                const overlap = minDist - d + WALL_PUSH_BUFFER;
                b.x += nx * overlap;
                b.y += ny * overlap;
                // Compute arm rotational velocity at contact point
                const contactR = t * obs.armLen;
                const rotSpeed = obs.speed * contactR;
                // Perpendicular to arm direction = tangent velocity
                const rotVx = -ay * rotSpeed * 6;
                const rotVy = ax * rotSpeed * 6;
                // Reflect relative velocity
                const relVx = b.vx - rotVx;
                const relVy = b.vy - rotVy;
                const dot = relVx * nx + relVy * ny;
                // Always resolve (remove the dot < 0 gate that trapped balls)
                b.vx -= 2 * dot * nx;
                b.vy -= 2 * dot * ny;
                // Impart rotational velocity from arm spin
                b.vx += rotVx * 0.4;
                b.vy += rotVy * 0.4;
                // Minimum push-away speed so balls don't linger
                const postSpeed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
                if (postSpeed < 1.5) {
                    b.vx += nx * 1.5;
                    b.vy += ny * 1.5;
                }
                playSound('windmill');
                spawnParticles(b.x, b.y, '#AAAAAA', 3);
            }
        }
        // Center hub collision
        const hubR = 8;
        const d = dist(b.x, b.y, obs.x, obs.y);
        if (d < hubR + b.r) {
            const nx = (b.x - obs.x) / (d || 1);
            const ny = (b.y - obs.y) / (d || 1);
            // Push out
            const overlap = (hubR + b.r) - d + WALL_PUSH_BUFFER;
            b.x += nx * overlap;
            b.y += ny * overlap;
            const dot = b.vx * nx + b.vy * ny;
            b.vx -= 2 * dot * nx;
            b.vy -= 2 * dot * ny;
            // Ensure minimum bounce-away speed
            const postSpeed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
            if (postSpeed < 1.5) {
                b.vx += nx * 1.5;
                b.vy += ny * 1.5;
            }
            playSound('bumper');
        }
    }

    // ── Particles / floating texts ──
    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * PI2;
            const spd = 1 + Math.random() * 3;
            // Pick a random debris sprite key for Kenney particle visuals
            const debrisTypes = ['debris/wood_1','debris/wood_2','debris/wood_3','debris/stone_1','debris/stone_2','debris/glass_1'];
            particles.push({
                x, y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd - 1,
                life: 20 + Math.random() * 20,
                color,
                r: 1.5 + Math.random() * 2,
                sprite: debrisTypes[Math.floor(Math.random() * debrisTypes.length)]
            });
        }
    }

    function addFloatingText(text, x, y, color) {
        floatingTexts.push({ text, x, y, color, life: 60 });
    }

    // ═══════════════════════════════════════════════════════════════
    // DRAWING — Kenney Physics Pack visuals
    // ═══════════════════════════════════════════════════════════════

    function draw() {
        ctx.save();
        ctx.clearRect(0, 0, W, H);

        if (state === ST_LOADING) {
            drawLoadingScreen();
            ctx.restore();
            return;
        }

        if (state === ST_COURSE_SELECT || state === ST_TITLE) {
            drawCourseSelect();
            ctx.restore();
            return;
        }
        if (state === ST_COURSE_COMPLETE) {
            drawCourseComplete();
            ctx.restore();
            return;
        }

        drawBackground();
        drawTable();
        drawObstacles();
        drawBalls();
        drawParticles();
        drawFloatingTexts();
        if (state === ST_AIMING) drawAiming();
        drawHUD();
        if (pocketAnimTimer > 0 && pocketAnimBall) drawPocketAnim();

        ctx.restore();
    }

    // ── Background: Kenney desert/grass behind table ──
    function drawBackground() {
        const bgSprite = getSprite('bg/colored_grass');
        if (bgSprite) {
            // Draw scaled to fill, with dark overlay
            ctx.drawImage(bgSprite, 0, 0, W, H);
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 0, W, H);
        } else {
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, W, H);
        }
    }

    // ── Table with wood rail sprites ──
    function drawTable() {
        // Wood rail border using wood element sprites tiled
        const woodSpr = getSprite('wood/011'); // wide plank sprite
        if (woodSpr) {
            // Top rail
            tileSpriteRect('wood/011', 0, 0, W, RAIL_W, 40, RAIL_W, '#5C3317');
            // Bottom rail
            tileSpriteRect('wood/011', 0, H - RAIL_W, W, RAIL_W, 40, RAIL_W, '#5C3317');
            // Left rail
            tileSpriteRect('wood/019', 0, RAIL_W, RAIL_W, H - RAIL_W * 2, RAIL_W, 40, '#5C3317');
            // Right rail
            tileSpriteRect('wood/019', W - RAIL_W, RAIL_W, RAIL_W, H - RAIL_W * 2, RAIL_W, 40, '#5C3317');
        } else {
            // Fallback: gradient wood rails
            const g = ctx.createLinearGradient(0, 0, W, H);
            g.addColorStop(0, '#6B3A1F');
            g.addColorStop(0.5, '#5C3317');
            g.addColorStop(1, '#4A2810');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }

        // Darken rail edges for depth
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, 0, W, 2);
        ctx.fillRect(0, H - 2, W, 2);
        ctx.fillRect(0, 0, 2, H);
        ctx.fillRect(W - 2, 0, 2, H);

        // Green felt playing surface
        if (feltPattern) {
            ctx.fillStyle = feltPattern;
            ctx.fillRect(RAIL_W, RAIL_W, W - RAIL_W * 2, H - RAIL_W * 2);
        } else {
            const fg = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.6);
            fg.addColorStop(0, '#1B8C3D');
            fg.addColorStop(1, '#146B2E');
            ctx.fillStyle = fg;
            ctx.fillRect(RAIL_W, RAIL_W, W - RAIL_W * 2, H - RAIL_W * 2);
        }

        // Subtle felt radial highlight
        const feltHighlight = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.5);
        feltHighlight.addColorStop(0, 'rgba(40,180,80,0.15)');
        feltHighlight.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = feltHighlight;
        ctx.fillRect(RAIL_W, RAIL_W, W - RAIL_W * 2, H - RAIL_W * 2);

        // Felt texture lines (subtle)
        ctx.strokeStyle = 'rgba(255,255,255,0.012)';
        ctx.lineWidth = 0.5;
        for (let y = RAIL_W; y < H - RAIL_W; y += 4) {
            ctx.beginPath();
            ctx.moveTo(RAIL_W, y);
            ctx.lineTo(W - RAIL_W, y);
            ctx.stroke();
        }

        // Rail inner edge (dark shadow line)
        ctx.strokeStyle = '#3A1F0A';
        ctx.lineWidth = 2;
        ctx.strokeRect(RAIL_W - 1, RAIL_W - 1, W - RAIL_W * 2 + 2, H - RAIL_W * 2 + 2);

        // Rail diamond markers using metal sprites
        const metalDiamondSpr = getSprite('metal/003');
        const diamondPositions = [0.25, 0.5, 0.75];
        for (const p of diamondPositions) {
            const dx = RAIL_W + (W - 2 * RAIL_W) * p;
            // Top rail diamonds
            if (metalDiamondSpr) {
                ctx.drawImage(metalDiamondSpr, dx - 4, RAIL_W / 2 - 4, 8, 8);
                ctx.drawImage(metalDiamondSpr, dx - 4, H - RAIL_W / 2 - 4, 8, 8);
            } else {
                ctx.fillStyle = '#FFD700';
                ctx.beginPath(); ctx.arc(dx, RAIL_W / 2, 2, 0, PI2); ctx.fill();
                ctx.beginPath(); ctx.arc(dx, H - RAIL_W / 2, 2, 0, PI2); ctx.fill();
            }
        }
        // Side diamonds
        for (const p of [0.33, 0.67]) {
            const dy = RAIL_W + (H - 2 * RAIL_W) * p;
            if (metalDiamondSpr) {
                ctx.drawImage(metalDiamondSpr, RAIL_W / 2 - 4, dy - 4, 8, 8);
                ctx.drawImage(metalDiamondSpr, W - RAIL_W / 2 - 4, dy - 4, 8, 8);
            } else {
                ctx.fillStyle = '#FFD700';
                ctx.beginPath(); ctx.arc(RAIL_W / 2, dy, 2, 0, PI2); ctx.fill();
                ctx.beginPath(); ctx.arc(W - RAIL_W / 2, dy, 2, 0, PI2); ctx.fill();
            }
        }

        // Pockets with metal rim sprites
        for (const p of POCKETS) {
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.arc(p.x + 1, p.y + 1, POCKET_R + 3, 0, PI2);
            ctx.fill();

            // Dark pocket hole
            ctx.fillStyle = '#080808';
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R, 0, PI2);
            ctx.fill();

            // Inner depth gradient
            const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, POCKET_R);
            pg.addColorStop(0, 'rgba(0,0,0,0.95)');
            pg.addColorStop(1, 'rgba(30,15,5,0.6)');
            ctx.fillStyle = pg;
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R, 0, PI2);
            ctx.fill();

            // Metal rim sprite ring
            const rimSpr = getSprite('metal/040');
            if (rimSpr) {
                ctx.save();
                ctx.globalAlpha = 0.7;
                ctx.drawImage(rimSpr, p.x - POCKET_R - 3, p.y - POCKET_R - 3, (POCKET_R + 3) * 2, (POCKET_R + 3) * 2);
                ctx.globalAlpha = 1;
                ctx.restore();
            } else {
                // Fallback: chrome ring
                ctx.strokeStyle = '#888';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(p.x, p.y, POCKET_R + 1, 0, PI2);
                ctx.stroke();
            }
            // Inner metallic rim highlight
            ctx.strokeStyle = 'rgba(200,200,200,0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R - 1, 0, PI2);
            ctx.stroke();
        }
    }

    function drawObstacles() {
        for (const obs of obstacles) {
            switch (obs.type) {
                case 'bumper': drawBumper(obs); break;
                case 'windmill': drawWindmill(obs); break;
                case 'wall': drawStaticWall(obs); break;
                case 'movingWall': drawMovingWall(obs); break;
                case 'sand': drawSand(obs); break;
                case 'ice': drawIce(obs); break;
                case 'tunnel': drawTunnel(obs); break;
            }
        }
    }

    // ── Bumper: Metal round sprite with chrome gradient, glow ring on hit ──
    function drawBumper(obs) {
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.arc(obs.x + 2, obs.y + 2, obs.r + 2, 0, PI2);
        ctx.fill();

        // Metal sprite for bumper body
        const metalSpr = getSprite('metal/045');
        if (metalSpr) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(obs.x, obs.y, obs.r, 0, PI2);
            ctx.clip();
            ctx.drawImage(metalSpr, obs.x - obs.r, obs.y - obs.r, obs.r * 2, obs.r * 2);
            ctx.restore();
        }

        // Chrome gradient overlay
        const bg = ctx.createRadialGradient(obs.x - obs.r * 0.3, obs.y - obs.r * 0.3, 0, obs.x, obs.y, obs.r);
        bg.addColorStop(0, 'rgba(255,255,255,0.5)');
        bg.addColorStop(0.3, 'rgba(200,200,200,0.3)');
        bg.addColorStop(0.7, 'rgba(136,136,136,0.2)');
        bg.addColorStop(1, 'rgba(68,68,68,0.3)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.r, 0, PI2);
        ctx.fill();

        // Edge ring
        ctx.strokeStyle = 'rgba(200,220,240,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.r, 0, PI2);
        ctx.stroke();

        // Glow ring on hit (animated)
        const glowAlpha = obs.glowTimer > 0 ? obs.glowTimer / 20 : 0;
        if (glowAlpha > 0) {
            ctx.strokeStyle = `rgba(100,200,255,${glowAlpha * 0.7})`;
            ctx.lineWidth = 3 + glowAlpha * 2;
            ctx.beginPath();
            ctx.arc(obs.x, obs.y, obs.r + 3 + glowAlpha * 3, 0, PI2);
            ctx.stroke();
            // Inner glow
            ctx.strokeStyle = `rgba(180,240,255,${glowAlpha * 0.4})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(obs.x, obs.y, obs.r + 1, 0, PI2);
            ctx.stroke();
        } else {
            // Subtle ambient glow
            ctx.strokeStyle = 'rgba(100,200,255,0.15)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(obs.x, obs.y, obs.r + 3, 0, PI2);
            ctx.stroke();
        }

        // Specular highlight
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.arc(obs.x - obs.r * 0.25, obs.y - obs.r * 0.25, obs.r * 0.3, 0, PI2);
        ctx.fill();
    }

    // ── Windmill: Wood plank sprites with metal gear hub ──
    function drawWindmill(obs) {
        // Shadow under hub
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.arc(obs.x + 2, obs.y + 2, 10, 0, PI2);
        ctx.fill();

        // 4 arms using wood plank sprites
        for (let i = 0; i < 4; i++) {
            const a = obs.angle + (Math.PI / 2) * i;
            const woodPlankSpr = getSprite('wood/019'); // tall plank

            ctx.save();
            ctx.translate(obs.x, obs.y);
            ctx.rotate(a);

            // Arm shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(-4, -obs.armLen + 1, 8, obs.armLen);

            if (woodPlankSpr) {
                // Wood plank sprite for arm
                ctx.drawImage(woodPlankSpr, -4, -obs.armLen, 8, obs.armLen);
            } else {
                // Fallback: wooden gradient
                const armG = ctx.createLinearGradient(0, 0, 0, -obs.armLen);
                armG.addColorStop(0, '#8B6914');
                armG.addColorStop(0.5, '#A07828');
                armG.addColorStop(1, '#7A5A10');
                ctx.fillStyle = armG;
                ctx.fillRect(-3, 0, 6, -obs.armLen);
            }

            // Blade tip (decorative metal)
            const bladeSpr = getSprite('metal/004');
            if (bladeSpr) {
                ctx.drawImage(bladeSpr, -8, -obs.armLen - 2, 12, 10);
            } else {
                ctx.fillStyle = 'rgba(180,180,180,0.7)';
                ctx.beginPath();
                ctx.moveTo(0, -obs.armLen);
                ctx.lineTo(-10, -obs.armLen + 8);
                ctx.lineTo(0, -obs.armLen + 4);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        }

        // Metal gear hub using metal sprite
        const gearSpr = getSprite('metal/053');
        if (gearSpr) {
            ctx.save();
            ctx.translate(obs.x, obs.y);
            ctx.rotate(obs.angle * 2); // gear rotates faster
            ctx.drawImage(gearSpr, -10, -10, 20, 20);
            ctx.restore();
        } else {
            const hg = ctx.createRadialGradient(obs.x - 2, obs.y - 2, 0, obs.x, obs.y, 8);
            hg.addColorStop(0, '#DDD');
            hg.addColorStop(0.5, '#999');
            hg.addColorStop(1, '#555');
            ctx.fillStyle = hg;
            ctx.beginPath();
            ctx.arc(obs.x, obs.y, 8, 0, PI2);
            ctx.fill();
        }
        // Hub center bolt
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, 3, 0, PI2);
        ctx.fill();
        // Bolt highlight
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(obs.x - 1, obs.y - 1, 1.5, 0, PI2);
        ctx.fill();
    }

    // ── Static walls: Wood/stone element sprites tiled ──
    function drawStaticWall(obs) {
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(obs.x + 2, obs.y + 2, obs.w, obs.h);

        // Use wood sprites tiled along wall
        const isVertical = obs.h > obs.w;
        const spriteKey = isVertical ? 'wood/019' : 'wood/011';
        const spr = getSprite(spriteKey);

        if (spr) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(obs.x, obs.y, obs.w, obs.h);
            ctx.clip();
            if (isVertical) {
                for (let ty = obs.y; ty < obs.y + obs.h; ty += 16) {
                    ctx.drawImage(spr, obs.x, ty, obs.w, 16);
                }
            } else {
                for (let tx = obs.x; tx < obs.x + obs.w; tx += 16) {
                    ctx.drawImage(spr, tx, obs.y, 16, obs.h);
                }
            }
            ctx.restore();
        } else {
            const wg = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.w, obs.y + obs.h);
            wg.addColorStop(0, '#6B3A1F');
            wg.addColorStop(0.5, '#8B5A3F');
            wg.addColorStop(1, '#5A3010');
            ctx.fillStyle = wg;
            ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        }

        // Edge highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
        // Inner shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.strokeRect(obs.x + 1, obs.y + 1, obs.w - 2, obs.h - 2);
    }

    // ── Moving walls: Stone sprites with red/white warning stripe ──
    function drawMovingWall(obs) {
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(obs.x + 2, obs.y + 2, obs.w, obs.h);

        // Stone sprite body
        const isVertical = obs.h > obs.w;
        const spriteKey = isVertical ? 'stone/019' : 'stone/011';
        const spr = getSprite(spriteKey);

        if (spr) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(obs.x, obs.y, obs.w, obs.h);
            ctx.clip();
            if (isVertical) {
                for (let ty = obs.y; ty < obs.y + obs.h; ty += 16) {
                    ctx.drawImage(spr, obs.x, ty, obs.w, 16);
                }
            } else {
                for (let tx = obs.x; tx < obs.x + obs.w; tx += 16) {
                    ctx.drawImage(spr, tx, obs.y, 16, obs.h);
                }
            }
            ctx.restore();
        }

        // Red/white warning stripe overlay
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.rect(obs.x, obs.y, obs.w, obs.h);
        ctx.clip();
        const stripeW = 6;
        const totalLen = Math.max(obs.w, obs.h) * 2;
        for (let s = -totalLen; s < totalLen; s += stripeW * 2) {
            ctx.fillStyle = '#FF4444';
            ctx.save();
            ctx.translate(obs.x, obs.y);
            ctx.rotate(Math.PI / 4);
            ctx.fillRect(s, -totalLen, stripeW, totalLen * 2);
            ctx.restore();
        }
        ctx.restore();

        // Border
        ctx.strokeStyle = '#CC0000';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

        // Movement indicator arrows
        ctx.fillStyle = 'rgba(255,100,100,0.5)';
        ctx.font = '8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obs.axis === 'x' ? '\u2194' : '\u2195', obs.x + obs.w / 2, obs.y + obs.h / 2);
    }

    // ── Sand patches: Tiled sand sprite with warm overlay ──
    function drawSand(obs) {
        // Sand sprite tiled
        const sandSpr = getSprite('other/sand');
        if (sandSpr) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(obs.x, obs.y, obs.w, obs.h, [6]);
            ctx.clip();
            for (let ty = obs.y; ty < obs.y + obs.h; ty += sandSpr.height) {
                for (let tx = obs.x; tx < obs.x + obs.w; tx += sandSpr.width) {
                    ctx.drawImage(sandSpr, tx, ty);
                }
            }
            // Warm tint overlay
            ctx.fillStyle = 'rgba(194,178,128,0.25)';
            ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
            ctx.restore();
        } else {
            ctx.fillStyle = 'rgba(194,178,128,0.5)';
            ctx.beginPath();
            ctx.roundRect(obs.x, obs.y, obs.w, obs.h, [6]);
            ctx.fill();
        }

        // Texture dots
        ctx.fillStyle = 'rgba(170,150,100,0.35)';
        const seed = obs.x * 7 + obs.y * 13;
        for (let i = 0; i < 25; i++) {
            const sx = obs.x + ((seed + i * 31) % obs.w);
            const sy = obs.y + ((seed + i * 17) % obs.h);
            ctx.beginPath();
            ctx.arc(sx, sy, 1, 0, PI2);
            ctx.fill();
        }

        // Border
        ctx.strokeStyle = 'rgba(180,160,120,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h, [6]);
        ctx.stroke();

        // Cactus decoration using sprite
        const cactusSpr = getSprite('other/cactus');
        if (cactusSpr) {
            ctx.drawImage(cactusSpr, obs.x + obs.w - 14, obs.y + 2, 12, 14);
        }

        // Label
        ctx.fillStyle = 'rgba(120,100,60,0.5)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SAND', obs.x + obs.w / 2, obs.y + obs.h / 2 + 3);
    }

    // ── Ice patches: Glass sprite with blue tint overlay ──
    function drawIce(obs) {
        const glassSpr = getSprite('glass/010');
        if (glassSpr) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(obs.x, obs.y, obs.w, obs.h, [6]);
            ctx.clip();
            for (let ty = obs.y; ty < obs.y + obs.h; ty += 32) {
                for (let tx = obs.x; tx < obs.x + obs.w; tx += 32) {
                    ctx.drawImage(glassSpr, tx, ty, 32, 32);
                }
            }
            // Blue tint overlay
            ctx.fillStyle = 'rgba(100,180,255,0.2)';
            ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
            ctx.restore();
        } else {
            const ig = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.w, obs.y + obs.h);
            ig.addColorStop(0, 'rgba(173,216,255,0.45)');
            ig.addColorStop(0.5, 'rgba(200,230,255,0.55)');
            ig.addColorStop(1, 'rgba(150,200,255,0.4)');
            ctx.fillStyle = ig;
            ctx.beginPath();
            ctx.roundRect(obs.x, obs.y, obs.w, obs.h, [6]);
            ctx.fill();
        }

        // Shine streaks
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(obs.x + 8, obs.y + 5);
        ctx.lineTo(obs.x + obs.w - 10, obs.y + obs.h * 0.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(obs.x + 15, obs.y + obs.h * 0.6);
        ctx.lineTo(obs.x + obs.w - 5, obs.y + obs.h - 5);
        ctx.stroke();

        // Frozen bush decoration
        const frozenSpr = getSprite('other/frozenBush');
        if (frozenSpr) {
            ctx.drawImage(frozenSpr, obs.x + 2, obs.y + obs.h - 14, 12, 12);
        }

        // Border glow
        ctx.strokeStyle = 'rgba(150,200,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.w, obs.h, [6]);
        ctx.stroke();

        // Label
        ctx.fillStyle = 'rgba(100,150,200,0.5)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ICE', obs.x + obs.w / 2, obs.y + obs.h / 2 + 3);
    }

    // ── Tunnels: Metal round sprites for entry/exit portals with glow ──
    function drawTunnel(obs) {
        // Connecting dashed line
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(obs.x1, obs.y1);
        ctx.lineTo(obs.x2, obs.y2);
        ctx.stroke();
        ctx.setLineDash([]);

        const tunnelR = 14;
        const col = obs.color || '#FF6B6B';

        // Draw both portal ends
        for (const [tx, ty, isEntry] of [[obs.x1, obs.y1, true], [obs.x2, obs.y2, false]]) {
            // Metal ring sprite for portal
            const metalPortalSpr = getSprite('metal/053');
            if (metalPortalSpr) {
                ctx.save();
                ctx.translate(tx, ty);
                ctx.rotate(frameCount * 0.02 * (isEntry ? 1 : -1));
                ctx.drawImage(metalPortalSpr, -tunnelR - 2, -tunnelR - 2, (tunnelR + 2) * 2, (tunnelR + 2) * 2);
                ctx.restore();
            }

            // Dark hole center
            ctx.fillStyle = '#0A0A0A';
            ctx.beginPath();
            ctx.arc(tx, ty, tunnelR - 2, 0, PI2);
            ctx.fill();

            // Inner depth
            const pg = ctx.createRadialGradient(tx, ty, 0, tx, ty, tunnelR);
            pg.addColorStop(0, 'rgba(0,0,0,0.9)');
            pg.addColorStop(0.6, 'rgba(20,20,20,0.7)');
            pg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = pg;
            ctx.beginPath();
            ctx.arc(tx, ty, tunnelR, 0, PI2);
            ctx.fill();

            // Colored ring
            ctx.strokeStyle = col;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(tx, ty, tunnelR, 0, PI2);
            ctx.stroke();

            // Pulsing glow
            const pulse = 0.3 + Math.sin(frameCount * 0.05) * 0.2;
            ctx.shadowBlur = 8;
            ctx.shadowColor = col;
            ctx.strokeStyle = col;
            ctx.globalAlpha = pulse;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(tx, ty, tunnelR + 4, 0, PI2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;

            // Arrow inside
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            const angle = Math.atan2(obs.y2 - obs.y1, obs.x2 - obs.x1) * (isEntry ? 1 : -1);
            ctx.save();
            ctx.translate(tx, ty);
            ctx.rotate(isEntry ? angle : angle + Math.PI);
            ctx.beginPath();
            ctx.moveTo(5, 0);
            ctx.lineTo(-3, -4);
            ctx.lineTo(-3, 4);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  PRE-RENDERED BALL CACHE (4x resolution for crisp rendering)
    // ═══════════════════════════════════════════════════════════════
    function buildBallCanvas(num) {
        const color = BALL_COLORS[num] || '#888';
        const isStripe = num >= 9 && num <= 15;
        const sz = BALL_R * 2 * BALL_CACHE_SCALE;
        const cen = sz / 2;
        const r = sz / 2 - 2;
        const c = document.createElement('canvas');
        c.width = sz; c.height = sz;
        const cx = c.getContext('2d');

        // Drop shadow
        cx.fillStyle = 'rgba(0,0,0,0.35)';
        cx.beginPath();
        cx.ellipse(cen + 2, cen + 3, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
        cx.fill();

        if (isStripe) {
            // White base
            const baseGrad = cx.createRadialGradient(
                cen - r * 0.28, cen - r * 0.28, r * 0.05,
                cen + r * 0.05, cen + r * 0.05, r
            );
            baseGrad.addColorStop(0, '#FFFFFF');
            baseGrad.addColorStop(0.45, '#F8F8F2');
            baseGrad.addColorStop(0.75, '#E8E8E0');
            baseGrad.addColorStop(1, '#CCCCC4');
            cx.fillStyle = baseGrad;
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.fill();

            // Colored stripe band
            cx.save();
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.clip();
            const bandH = r * 1.1;
            const bandGrad = cx.createLinearGradient(cen - r, cen - bandH / 2, cen + r, cen + bandH / 2);
            bandGrad.addColorStop(0, darkenColor(color, 40));
            bandGrad.addColorStop(0.15, color);
            bandGrad.addColorStop(0.35, lightenColor(color, 30));
            bandGrad.addColorStop(0.5, color);
            bandGrad.addColorStop(0.65, lightenColor(color, 30));
            bandGrad.addColorStop(0.85, color);
            bandGrad.addColorStop(1, darkenColor(color, 40));
            cx.fillStyle = bandGrad;
            cx.fillRect(cen - r, cen - bandH / 2, r * 2, bandH);
            // Edge darkening
            const edgeFade = cx.createLinearGradient(0, cen - bandH / 2, 0, cen + bandH / 2);
            edgeFade.addColorStop(0, 'rgba(0,0,0,0.2)');
            edgeFade.addColorStop(0.12, 'rgba(0,0,0,0)');
            edgeFade.addColorStop(0.88, 'rgba(0,0,0,0)');
            edgeFade.addColorStop(1, 'rgba(0,0,0,0.2)');
            cx.fillStyle = edgeFade;
            cx.fillRect(cen - r, cen - bandH / 2, r * 2, bandH);
            cx.restore();
        } else if (num === 0) {
            // Cue ball: white with subtle blue tint
            const grad = cx.createRadialGradient(
                cen - r * 0.3, cen - r * 0.3, r * 0.05,
                cen + r * 0.05, cen + r * 0.05, r
            );
            grad.addColorStop(0, '#FFFFFF');
            grad.addColorStop(0.3, '#FCFCF8');
            grad.addColorStop(0.6, '#F0F0EA');
            grad.addColorStop(0.85, '#D8D8D4');
            grad.addColorStop(1, '#B8B8B4');
            cx.fillStyle = grad;
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.fill();
            // Subtle blue tint
            cx.fillStyle = 'rgba(200,210,255,0.06)';
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.fill();
        } else {
            // Solid ball with rich gradient
            const grad = cx.createRadialGradient(
                cen - r * 0.3, cen - r * 0.3, r * 0.05,
                cen + r * 0.05, cen + r * 0.05, r
            );
            grad.addColorStop(0, lightenColor(color, 60));
            grad.addColorStop(0.25, lightenColor(color, 20));
            grad.addColorStop(0.55, color);
            grad.addColorStop(0.8, darkenColor(color, 25));
            grad.addColorStop(1, darkenColor(color, 50));
            cx.fillStyle = grad;
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.fill();
        }

        // Subsurface glow
        if (num > 0 && num !== 8) {
            cx.save();
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.clip();
            const glowGrad = cx.createRadialGradient(cen + r * 0.15, cen + r * 0.2, 0, cen, cen, r);
            glowGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
            glowGrad.addColorStop(1, 'rgba(0,0,0,0.12)');
            cx.fillStyle = glowGrad;
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.fill();
            cx.restore();
        }

        // Number circle
        if (num > 0) {
            const ncr = r * 0.42;
            cx.shadowColor = 'rgba(0,0,0,0.3)';
            cx.shadowBlur = 3;
            cx.fillStyle = '#FFFFFF';
            cx.beginPath();
            cx.arc(cen, cen, ncr, 0, Math.PI * 2);
            cx.fill();
            cx.shadowBlur = 0;
            const ncGrad = cx.createRadialGradient(cen - ncr * 0.2, cen - ncr * 0.2, 0, cen, cen, ncr);
            ncGrad.addColorStop(0, '#FFFFFF');
            ncGrad.addColorStop(0.7, '#F8F8F4');
            ncGrad.addColorStop(1, '#E8E8E0');
            cx.fillStyle = ncGrad;
            cx.beginPath();
            cx.arc(cen, cen, ncr - 0.5, 0, Math.PI * 2);
            cx.fill();
            cx.fillStyle = '#111111';
            cx.font = `bold ${r * 0.58}px "Segoe UI", system-ui, sans-serif`;
            cx.textAlign = 'center';
            cx.textBaseline = 'middle';
            cx.fillText(num.toString(), cen, cen + 1);
        }

        // Primary specular
        const specAlpha = num === 0 ? 0.85 : 0.7;
        const specGrad = cx.createRadialGradient(
            cen - r * 0.32, cen - r * 0.38, 0,
            cen - r * 0.2, cen - r * 0.25, r * 0.55
        );
        specGrad.addColorStop(0, `rgba(255,255,255,${specAlpha})`);
        specGrad.addColorStop(0.3, `rgba(255,255,255,${specAlpha * 0.5})`);
        specGrad.addColorStop(0.6, 'rgba(255,255,255,0.08)');
        specGrad.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = specGrad;
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.fill();

        // Secondary specular dot
        cx.fillStyle = num === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.85)';
        cx.beginPath();
        cx.arc(cen - r * 0.28, cen - r * 0.32, r * 0.1, 0, Math.PI * 2);
        cx.fill();

        // Rim light
        cx.save();
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.clip();
        const rimGrad = cx.createRadialGradient(cen + r * 0.1, cen + r * 0.5, r * 0.3, cen, cen, r);
        rimGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
        rimGrad.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = rimGrad;
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.fill();
        cx.restore();

        // Edge ring
        cx.strokeStyle = 'rgba(0,0,0,0.18)';
        cx.lineWidth = 1.2;
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.stroke();

        return c;
    }

    function prebuildBallCanvases() {
        ballCanvasCache = {};
        for (let n = 0; n <= 15; n++) {
            ballCanvasCache[n] = buildBallCanvas(n);
        }
    }

    // ── Balls with hi-res cached rendering ──
    function drawBalls() {
        for (const b of balls) {
            if (!b.active) continue;
            drawBall(b.x, b.y, b.r, b.color, b.number, b.striped);
        }
    }

    function drawBall(x, y, r, color, num, striped) {
        const cached = ballCanvasCache[num];
        if (!cached) {
            // Fallback for unknown balls
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, PI2);
            ctx.fill();
            return;
        }

        const drawSize = r * 2;
        ctx.save();

        // Subtle rolling rotation
        const spd = 0; // Balls have vx/vy on the ball objects, use position-based wobble
        ctx.translate(x, y);
        if (num > 0) {
            ctx.rotate(Math.sin((x + y) * 0.05) * 0.04);
        }
        ctx.drawImage(cached, -drawSize / 2 - 0.5, -drawSize / 2 - 0.5, drawSize + 1, drawSize + 1);
        ctx.restore();
    }

    // ── Cue stick: Wood element sprite stretched and rotated ──
    function drawAiming() {
        if (!cueBall || !cueBall.active) return;
        const cx = cueBall.x, cy = cueBall.y;

        // Aim line (dotted ghost ball trajectory)
        const lineLen = 120;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aimAngle) * lineLen, cy + Math.sin(aimAngle) * lineLen);
        ctx.stroke();
        ctx.setLineDash([]);

        // Ghost ball at end of aim line
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(aimAngle) * lineLen, cy + Math.sin(aimAngle) * lineLen, CUE_BALL_R, 0, PI2);
        ctx.stroke();

        // Cue stick
        if (isDragging) {
            const pullBack = aimPower * 3;
            const stickLen = 120;
            const startX = cx - Math.cos(aimAngle) * (CUE_BALL_R + 3 + pullBack);
            const startY = cy - Math.sin(aimAngle) * (CUE_BALL_R + 3 + pullBack);
            const endX = startX - Math.cos(aimAngle) * stickLen;
            const endY = startY - Math.sin(aimAngle) * stickLen;

            // Use wood sprite for cue body
            const cueSpr = getSprite('wood/011');
            if (cueSpr) {
                ctx.save();
                const cueAngle = Math.atan2(endY - startY, endX - startX);
                const cueMidX = (startX + endX) / 2;
                const cueMidY = (startY + endY) / 2;
                const cueLen = dist(startX, startY, endX, endY);
                ctx.translate(cueMidX, cueMidY);
                ctx.rotate(cueAngle);
                // Shadow
                ctx.globalAlpha = 0.3;
                ctx.drawImage(cueSpr, -cueLen / 2 + 2, -1, cueLen, 6);
                ctx.globalAlpha = 1;
                ctx.drawImage(cueSpr, -cueLen / 2, -3, cueLen, 6);
                // Chalk tip
                ctx.fillStyle = '#5599CC';
                ctx.fillRect(cueLen / 2 - 4, -2.5, 4, 5);
                ctx.restore();
            } else {
                // Fallback: gradient stick
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.moveTo(startX + 2, startY + 2);
                ctx.lineTo(endX + 2, endY + 2);
                ctx.stroke();

                const sg = ctx.createLinearGradient(startX, startY, endX, endY);
                sg.addColorStop(0, '#D4A574');
                sg.addColorStop(0.02, '#5599CC');
                sg.addColorStop(0.05, '#F5DEB3');
                sg.addColorStop(0.5, '#C19A6B');
                sg.addColorStop(1, '#2C1810');
                ctx.strokeStyle = sg;
                ctx.lineWidth = 5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                ctx.lineCap = 'butt';
            }

            // Power meter
            drawPowerMeter(cx, cy - 30, aimPower / MAX_POWER);
        } else {
            // Resting cue near ball
            const startX = cx - Math.cos(aimAngle) * (CUE_BALL_R + 5);
            const startY = cy - Math.sin(aimAngle) * (CUE_BALL_R + 5);
            const endX = startX - Math.cos(aimAngle) * 100;
            const endY = startY - Math.sin(aimAngle) * 100;

            const cueSpr = getSprite('wood/011');
            if (cueSpr) {
                ctx.save();
                const cueAngle = Math.atan2(endY - startY, endX - startX);
                const cueMidX = (startX + endX) / 2;
                const cueMidY = (startY + endY) / 2;
                const cueLen = dist(startX, startY, endX, endY);
                ctx.translate(cueMidX, cueMidY);
                ctx.rotate(cueAngle);
                ctx.globalAlpha = 0.85;
                ctx.drawImage(cueSpr, -cueLen / 2, -2.5, cueLen, 5);
                ctx.globalAlpha = 1;
                ctx.restore();
            } else {
                ctx.strokeStyle = '#C19A6B';
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                ctx.lineCap = 'butt';
            }
        }
    }

    function drawPowerMeter(x, y, pct) {
        const w = 40, h = 6;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y, w, h, [3]);
        ctx.fill();
        const fillW = w * pct;
        if (fillW > 0) {
            const pg = ctx.createLinearGradient(x - w / 2, y, x - w / 2 + w, y);
            pg.addColorStop(0, '#22CC44');
            pg.addColorStop(0.5, '#FFCC00');
            pg.addColorStop(1, '#FF3333');
            ctx.fillStyle = pg;
            ctx.beginPath();
            ctx.roundRect(x - w / 2, y, fillW, h, [3]);
            ctx.fill();
        }
    }

    // ── Particles: Kenney debris sprites with fallback circles ──
    function drawParticles() {
        for (const p of particles) {
            const alpha = p.life / 40;
            ctx.globalAlpha = clamp(alpha, 0, 1);

            const debrisSpr = p.sprite ? getSprite(p.sprite) : null;
            if (debrisSpr) {
                const sz = p.r * 3;
                ctx.drawImage(debrisSpr, p.x - sz / 2, p.y - sz / 2, sz, sz);
            } else {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, PI2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawFloatingTexts() {
        for (const ft of floatingTexts) {
            const alpha = ft.life / 60;
            ctx.globalAlpha = clamp(alpha, 0, 1);
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
            ctx.fillStyle = ft.color;
            ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.globalAlpha = 1;
    }

    // ── HUD: Wood-textured top bar, coin sprites for score ──
    function drawHUD() {
        const def = COURSES[currentCourse];
        const remaining = balls.filter(b => b.number !== 0 && b.active && !b.pocketed).length;

        // Wood-textured top bar
        const barH = 22;
        const woodBarSpr = getSprite('wood/011');
        if (woodBarSpr) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(RAIL_W, RAIL_W, W - RAIL_W * 2, barH);
            ctx.clip();
            for (let tx = RAIL_W; tx < W - RAIL_W; tx += 40) {
                ctx.drawImage(woodBarSpr, tx, RAIL_W, 40, barH);
            }
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(RAIL_W, RAIL_W, W - RAIL_W * 2, barH);
            ctx.restore();
        } else {
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(RAIL_W, RAIL_W, W - RAIL_W * 2, barH);
        }

        ctx.font = 'bold 10px Arial';
        ctx.textBaseline = 'middle';
        const yy = RAIL_W + 11;

        // Course name with coin sprite
        const coinSpr = getSprite('other/coinGold');
        if (coinSpr) {
            ctx.drawImage(coinSpr, RAIL_W + 4, yy - 6, 12, 12);
        }
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'left';
        ctx.fillText(`${currentCourse + 1}. ${def.name}`, RAIL_W + (coinSpr ? 20 : 6), yy);

        // Strokes
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        const strokeColor = strokes <= def.par ? '#88FF88' : '#FF8888';
        ctx.fillStyle = strokeColor;
        ctx.fillText(`Strokes: ${strokes} / Par ${def.par}`, W / 2, yy);

        // Balls remaining
        ctx.fillStyle = accentColor();
        ctx.textAlign = 'right';
        ctx.fillText(`Balls: ${remaining}`, W - RAIL_W - 6, yy);
    }

    function drawPocketAnim() {
        const b = pocketAnimBall;
        const progress = 1 - pocketAnimTimer / 20;
        const scale2 = 1 - progress;
        if (scale2 > 0) {
            ctx.globalAlpha = scale2;
            drawBall(b.x, b.y, BALL_R * scale2, b.color, b.number, b.striped);
            ctx.globalAlpha = 1;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // COURSE SELECT SCREEN — with Kenney star sprites
    // ═══════════════════════════════════════════════════════════════

    function drawCourseSelect() {
        // Background with Kenney desert
        const bgSpr = getSprite('bg/colored_desert');
        if (bgSpr) {
            ctx.drawImage(bgSpr, 0, 0, W, H);
            ctx.fillStyle = 'rgba(10,22,40,0.75)';
            ctx.fillRect(0, 0, W, H);
        } else {
            const bg = ctx.createLinearGradient(0, 0, 0, H);
            bg.addColorStop(0, '#0A1628');
            bg.addColorStop(1, '#0F0F1A');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);
        }

        // Title
        ctx.fillStyle = accentColor();
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('MiniStroke', W / 2, 35);

        ctx.fillStyle = '#AABBCC';
        ctx.font = '12px Arial';
        ctx.fillText('Pool + Mini Golf = Madness', W / 2, 56);

        // Course cards (3x3 grid)
        const cardW = 170, cardH = 80;
        const gapX = 18, gapY = 12;
        const startX = (W - (cardW * 3 + gapX * 2)) / 2;
        const startY = 75;

        for (let i = 0; i < COURSES.length; i++) {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const cx = startX + col * (cardW + gapX);
            const cy = startY + row * (cardH + gapY);
            const def = COURSES[i];
            const completed = coursesCompleted.includes(i);
            const hover = hoverCourse === i;

            // Card bg with wood texture hint
            const cardWoodSpr = getSprite('wood/010');
            if (cardWoodSpr && hover) {
                ctx.save();
                ctx.globalAlpha = 0.1;
                ctx.beginPath();
                ctx.roundRect(cx, cy, cardW, cardH, [8]);
                ctx.clip();
                ctx.drawImage(cardWoodSpr, cx, cy, cardW, cardH);
                ctx.restore();
            }

            ctx.fillStyle = hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
            ctx.beginPath();
            ctx.roundRect(cx, cy, cardW, cardH, [8]);
            ctx.fill();

            if (completed) {
                ctx.strokeStyle = '#22CC44';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(cx, cy, cardW, cardH, [8]);
                ctx.stroke();
            } else if (hover) {
                ctx.strokeStyle = accentColor();
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.roundRect(cx, cy, cardW, cardH, [8]);
                ctx.stroke();
            }

            // Course number
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`${i + 1}.`, cx + 8, cy + 16);

            // Course name
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(def.name, cx + 25, cy + 16);

            // Description
            ctx.fillStyle = '#889';
            ctx.font = '9px Arial';
            ctx.fillText(def.desc, cx + 8, cy + 34);

            // Par info with flag sprite
            const flagSpr = getSprite('other/flagRed');
            if (flagSpr) {
                ctx.drawImage(flagSpr, cx + 4, cy + 42, 10, 12);
            }
            ctx.fillStyle = '#77AAFF';
            ctx.font = '9px Arial';
            ctx.fillText(`Par: ${def.par}  |  Balls: ${def.balls}`, cx + (flagSpr ? 18 : 8), cy + 50);

            // Stars if completed — use Kenney star sprites
            if (completed) {
                const courseStrokes = getStoredStrokes(i);
                const stars = calcStars(courseStrokes, def.par);
                const goldStarSpr = getSprite('other/starGold');
                const silverStarSpr = getSprite('other/starSilver');

                for (let s = 0; s < 3; s++) {
                    const sx = cx + cardW - 8 - (2 - s) * 16;
                    const sy = cy + 60;
                    if (s < stars && goldStarSpr) {
                        ctx.drawImage(goldStarSpr, sx - 7, sy - 7, 14, 14);
                    } else if (silverStarSpr) {
                        ctx.globalAlpha = 0.3;
                        ctx.drawImage(silverStarSpr, sx - 7, sy - 7, 14, 14);
                        ctx.globalAlpha = 1;
                    } else {
                        ctx.font = '14px Arial';
                        ctx.textAlign = 'right';
                        ctx.fillStyle = s < stars ? '#FFD700' : '#444';
                        ctx.fillText('\u2605', sx, sy + 5);
                    }
                }
            }

            // Obstacle icons preview
            ctx.font = '10px Arial';
            ctx.textAlign = 'left';
            const icons = [];
            for (const o of def.obstacles) {
                if (o.type === 'bumper' && !icons.includes('\u25CF')) icons.push('\u25CF');
                if (o.type === 'windmill' && !icons.includes('\u2742')) icons.push('\u2742');
                if (o.type === 'wall' && !icons.includes('\u2588')) icons.push('\u2588');
                if (o.type === 'movingWall' && !icons.includes('\u2194')) icons.push('\u2194');
                if (o.type === 'sand' && !icons.includes('\u2591')) icons.push('\u2591');
                if (o.type === 'ice' && !icons.includes('\u2744')) icons.push('\u2744');
                if (o.type === 'tunnel' && !icons.includes('\u25C9')) icons.push('\u25C9');
            }
            ctx.fillStyle = '#667';
            ctx.fillText(icons.join(' '), cx + 8, cy + 68);
        }

        // Footer
        ctx.fillStyle = '#556';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Click a course to play', W / 2, H - 15);
    }

    // ═══════════════════════════════════════════════════════════════
    // COURSE COMPLETE SCREEN — with Kenney star sprites
    // ═══════════════════════════════════════════════════════════════

    function drawCourseComplete() {
        const bgSpr = getSprite('bg/colored_land');
        if (bgSpr) {
            ctx.drawImage(bgSpr, 0, 0, W, H);
            ctx.fillStyle = 'rgba(10,22,40,0.7)';
            ctx.fillRect(0, 0, W, H);
        } else {
            const bg = ctx.createLinearGradient(0, 0, 0, H);
            bg.addColorStop(0, '#0A1628');
            bg.addColorStop(1, '#0F0F1A');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);
        }

        const def = COURSES[currentCourse];
        const stars = calcStars(strokes, def.par);
        const diff = strokes - def.par;

        // Trophy coin sprite
        const coinDiamondSpr = getSprite('other/coinDiamond');
        if (coinDiamondSpr) {
            ctx.drawImage(coinDiamondSpr, W / 2 - 12, 20, 24, 24);
        }

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Course Complete!', W / 2, 60);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`${def.name}`, W / 2, 95);

        // Strokes vs par
        ctx.font = '18px Arial';
        ctx.fillStyle = diff <= 0 ? '#22CC44' : '#FF6644';
        const label = diff === 0 ? 'PAR!' : diff < 0 ? `${diff} UNDER PAR!` : `+${diff} OVER PAR`;
        ctx.fillText(`Strokes: ${strokes}  (${label})`, W / 2, 135);

        // Stars using Kenney star sprites
        const goldStarSpr = getSprite('other/starGold');
        const silverStarSpr = getSprite('other/starSilver');
        for (let s = 0; s < 3; s++) {
            const sx = W / 2 - 55 + s * 55;
            const sy = 170;
            if (s < stars && goldStarSpr) {
                ctx.drawImage(goldStarSpr, sx - 18, sy - 18, 36, 36);
            } else if (silverStarSpr) {
                ctx.globalAlpha = 0.3;
                ctx.drawImage(silverStarSpr, sx - 18, sy - 18, 36, 36);
                ctx.globalAlpha = 1;
            } else {
                ctx.font = '40px Arial';
                ctx.fillStyle = s < stars ? '#FFD700' : '#333';
                ctx.fillText('\u2605', sx, sy + 14);
            }
        }

        // Star criteria
        ctx.fillStyle = '#889';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('\u2605 = Par+3  |  \u2605\u2605 = Par  |  \u2605\u2605\u2605 = Under Par', W / 2, 215);

        // Trick shots
        if (trickShots > 0) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 13px Arial';
            ctx.fillText(`Trick Shots: ${trickShots}`, W / 2, 245);
        }

        // Buttons
        const btnY = 280;
        if (currentCourse < COURSES.length - 1) {
            drawButton(W / 2 - 100, btnY, 90, 32, 'Next Course', accentColor());
        }
        drawButton(W / 2 + 10, btnY, 90, 32, 'Course Select', '#5566AA');

        // Total score with coin sprite
        const coinSpr = getSprite('other/coinGold');
        if (coinSpr) {
            ctx.drawImage(coinSpr, W / 2 - 55, H - 26, 12, 12);
        }
        ctx.fillStyle = '#AABBCC';
        ctx.font = '10px Arial';
        ctx.fillText(`Total Strokes: ${totalStrokes}`, W / 2, H - 20);
    }

    function drawButton(x, y, w, h, text, color) {
        // Wood-textured button
        const woodSpr = getSprite('wood/010');
        if (woodSpr) {
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, [6]);
            ctx.clip();
            ctx.drawImage(woodSpr, x, y, w, h);
            ctx.restore();
        }
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, [6]);
        ctx.fill();
        ctx.globalAlpha = 1;
        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, [6]);
        ctx.stroke();
        // Text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w / 2, y + h / 2);
    }

    // ── Star calculation ──
    function calcStars(strk, par) {
        if (strk <= par - 1) return 3;
        if (strk <= par) return 2;
        if (strk <= par + 3) return 1;
        return 0;
    }

    // ── Stored strokes per course (simple local storage) ──
    function getStoredStrokes(courseIdx) {
        try {
            const data = JSON.parse(localStorage.getItem('ministroke_scores') || '{}');
            return data[courseIdx] || 999;
        } catch { return 999; }
    }

    function storeStrokes(courseIdx, strk) {
        try {
            const data = JSON.parse(localStorage.getItem('ministroke_scores') || '{}');
            if (!data[courseIdx] || strk < data[courseIdx]) {
                data[courseIdx] = strk;
                localStorage.setItem('ministroke_scores', JSON.stringify(data));
            }
        } catch {}
    }

    // ── Color helpers ──
    function lightenColor(hex, amt) {
        let r, g, b;
        if (hex.startsWith('#')) {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        } else if (hex.startsWith('rgb')) {
            const m = hex.match(/\d+/g);
            if (m) { r = +m[0]; g = +m[1]; b = +m[2]; }
            else { r = g = b = 128; }
        } else { r = g = b = 128; }
        r = Math.min(255, r + amt);
        g = Math.min(255, g + amt);
        b = Math.min(255, b + amt);
        return `rgb(${r},${g},${b})`;
    }

    function darkenColor(hex, amt) {
        let r, g, b;
        if (hex.startsWith('#')) {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        } else if (hex.startsWith('rgb')) {
            const m = hex.match(/\d+/g);
            if (m) { r = +m[0]; g = +m[1]; b = +m[2]; }
            else { r = g = b = 128; }
        } else { r = g = b = 128; }
        r = Math.max(0, r - amt);
        g = Math.max(0, g - amt);
        b = Math.max(0, b - amt);
        return `rgb(${r},${g},${b})`;
    }

    // ── Input handlers ──
    function onPointerDown(e) {
        e.preventDefault();
        const pos = inputPos(e);
        mouseX = pos.x;
        mouseY = pos.y;

        if (state === ST_COURSE_SELECT || state === ST_TITLE) {
            handleCourseSelectClick(pos);
            return;
        }

        if (state === ST_COURSE_COMPLETE) {
            handleCompleteClick(pos);
            return;
        }

        if (state === ST_AIMING && cueBall && cueBall.active) {
            isDragging = true;
            dragStartX = pos.x;
            dragStartY = pos.y;
            aimAngle = Math.atan2(pos.y - cueBall.y, pos.x - cueBall.x);
        }
    }

    function onPointerMove(e) {
        e.preventDefault();
        const pos = inputPos(e);
        mouseX = pos.x;
        mouseY = pos.y;

        if (state === ST_COURSE_SELECT || state === ST_TITLE) {
            const cardW = 170, cardH = 80;
            const gapX = 18, gapY = 12;
            const startX = (W - (cardW * 3 + gapX * 2)) / 2;
            const startY = 75;
            hoverCourse = -1;
            for (let i = 0; i < COURSES.length; i++) {
                const col = i % 3;
                const row = Math.floor(i / 3);
                const cx = startX + col * (cardW + gapX);
                const cy = startY + row * (cardH + gapY);
                if (pos.x >= cx && pos.x <= cx + cardW && pos.y >= cy && pos.y <= cy + cardH) {
                    hoverCourse = i;
                }
            }
            return;
        }

        if (state === ST_AIMING && isDragging && cueBall) {
            aimAngle = Math.atan2(pos.y - cueBall.y, pos.x - cueBall.x);
            const dx = pos.x - dragStartX;
            const dy = pos.y - dragStartY;
            aimPower = clamp(Math.sqrt(dx * dx + dy * dy) * 0.3, 0, MAX_POWER);
            aimAngle = Math.atan2(cueBall.y - pos.y, cueBall.x - pos.x);
        }
    }

    function onPointerUp(e) {
        e.preventDefault();
        if (state === ST_AIMING && isDragging && cueBall && aimPower > 0.5) {
            cueBall.vx = Math.cos(aimAngle) * aimPower;
            cueBall.vy = Math.sin(aimAngle) * aimPower;
            strokes++;
            totalStrokes++;
            isDragging = false;
            aimPower = 0;
            state = ST_ROLLING;
            playSound('hit');
            setTimeout(() => { wasFirstShot = false; }, 100);
        }
        isDragging = false;
    }

    function handleCourseSelectClick(pos) {
        const cardW = 170, cardH = 80;
        const gapX = 18, gapY = 12;
        const startX = (W - (cardW * 3 + gapX * 2)) / 2;
        const startY = 75;
        for (let i = 0; i < COURSES.length; i++) {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const cx = startX + col * (cardW + gapX);
            const cy = startY + row * (cardH + gapY);
            if (pos.x >= cx && pos.x <= cx + cardW && pos.y >= cy && pos.y <= cy + cardH) {
                startCourse(i);
                playSound('hit');
                return;
            }
        }
    }

    function handleCompleteClick(pos) {
        const btnY = 280;
        if (currentCourse < COURSES.length - 1) {
            if (pos.x >= W / 2 - 100 && pos.x <= W / 2 - 10 && pos.y >= btnY && pos.y <= btnY + 32) {
                startCourse(currentCourse + 1);
                playSound('hit');
                return;
            }
        }
        if (pos.x >= W / 2 + 10 && pos.x <= W / 2 + 100 && pos.y >= btnY && pos.y <= btnY + 32) {
            state = ST_COURSE_SELECT;
            playSound('hit');
            return;
        }
    }

    // ── Main loop ──
    function loop() {
        if (!gameActive) return;

        if (state === ST_ROLLING) {
            physicsTick();

            if (allBallsStopped()) {
                if (allBallsPotted()) {
                    if (!coursesCompleted.includes(currentCourse)) {
                        coursesCompleted.push(currentCourse);
                    }
                    storeStrokes(currentCourse, strokes);
                    state = ST_COURSE_COMPLETE;
                    playSound('complete');
                } else {
                    state = ST_AIMING;
                    wasFirstShot = true;
                }
            }
        } else if (state === ST_AIMING) {
            for (const obs of obstacles) {
                if (obs.type === 'windmill') obs.angle += obs.speed;
                if (obs.type === 'movingWall') {
                    obs.time += 0.02;
                    if (obs.axis === 'x') obs.x = obs.baseX + Math.sin(obs.time * obs.speed) * obs.range;
                    else obs.y = obs.baseY + Math.sin(obs.time * obs.speed) * obs.range;
                }
                if (obs.type === 'bumper' && obs.glowTimer > 0) obs.glowTimer--;
            }
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx; p.y += p.vy; p.life--; p.vy += 0.05;
                if (p.life <= 0) particles.splice(i, 1);
            }
            for (let i = floatingTexts.length - 1; i >= 0; i--) {
                floatingTexts[i].y -= 0.8;
                floatingTexts[i].life--;
                if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
            }
            frameCount++;
        } else {
            frameCount++;
        }

        draw();
        animFrame = requestAnimationFrame(loop);
    }

    // ── Lifecycle ──
    async function init(cvs, playerObj, onGameOverCb) {
        canvas = cvs;
        _player = playerObj;
        _onGameOver = onGameOverCb;
        theme = getTheme();
        gameActive = true;

        resize();
        window.addEventListener('resize', resize);

        // Input
        canvas.addEventListener('mousedown', onPointerDown);
        canvas.addEventListener('mousemove', onPointerMove);
        canvas.addEventListener('mouseup', onPointerUp);
        canvas.addEventListener('touchstart', onPointerDown, { passive: false });
        canvas.addEventListener('touchmove', onPointerMove, { passive: false });
        canvas.addEventListener('touchend', onPointerUp, { passive: false });

        // Init state
        currentCourse = 0;
        totalStrokes = 0;
        trickShots = 0;
        coursesCompleted = [];
        _startTime = Date.now();
        particles = [];
        floatingTexts = [];
        frameCount = 0;

        // Load saved completions
        try {
            const saved = JSON.parse(localStorage.getItem('ministroke_scores') || '{}');
            coursesCompleted = Object.keys(saved).map(Number);
        } catch {}

        // Start with loading screen, then preload sprites
        state = ST_LOADING;
        drawLoadingScreen();

        await preloadAllSprites();

        // Pre-render hi-res ball sprites
        prebuildBallCanvases();

        state = ST_COURSE_SELECT;
        animFrame = requestAnimationFrame(loop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        window.removeEventListener('resize', resize);
        if (canvas) {
            canvas.removeEventListener('mousedown', onPointerDown);
            canvas.removeEventListener('mousemove', onPointerMove);
            canvas.removeEventListener('mouseup', onPointerUp);
            canvas.removeEventListener('touchstart', onPointerDown);
            canvas.removeEventListener('touchmove', onPointerMove);
            canvas.removeEventListener('touchend', onPointerUp);
        }
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }

        // Report score
        if (_onGameOver && totalStrokes > 0) {
            const totalPar = coursesCompleted.reduce((sum, idx) => sum + COURSES[idx].par, 0);
            const totalStars = coursesCompleted.reduce((sum, idx) => {
                const strk = getStoredStrokes(idx);
                return sum + calcStars(strk, COURSES[idx].par);
            }, 0);
            _onGameOver({
                score: Math.max(0, coursesCompleted.length * 1000 + totalStars * 500 - totalStrokes * 10 + trickShots * 200),
                level: coursesCompleted.length,
                duration: Math.floor((Date.now() - _startTime) / 1000),
                coursesCompleted: coursesCompleted.length,
                totalStrokes,
                trickShots,
                totalStars
            });
        }
    }

    return {
        init,
        destroy,
        getScore()  { return Math.max(0, coursesCompleted.length * 1000 - totalStrokes * 10 + trickShots * 200); },
        getLevel()  { return coursesCompleted.length; },
        isActive()  { return gameActive; }
    };
})();
