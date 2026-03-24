/* Slingshot — Physics destruction game for Your World Arcade
   Pull back, aim, launch projectiles at structures to destroy them.
   Rigid-body physics with tumbling blocks, chain reactions, and star ratings.
   Uses Kenney Physics Pack sprites for professional Angry-Birds-quality visuals. */
window.Slingshot = (() => {
    // ── Constants ──
    const GAME_W = 960, GAME_H = 540;
    const GRAVITY = 0.35;
    const FRICTION = 0.4;
    const AIR_DRAG = 0.999;
    const GROUND_Y = GAME_H - 40;
    const SLING_X = 120, SLING_Y = GROUND_Y - 80;
    const MAX_PULL = 120;
    const LAUNCH_POWER = 0.18;
    const SETTLE_THRESHOLD = 0.15;
    const SETTLE_FRAMES = 90;
    const CAMERA_EASE = 0.06;
    const MIN_IMPACT_VEL = 2.5;

    // Kenney Physics Pack base path
    const KP = '/img/game-assets/kenney-physics';

    // Block materials
    const MAT = {
        wood:  { hp: 60,  mass: 1.0, rest: 0.2, score: 50  },
        glass: { hp: 20,  mass: 0.5, rest: 0.1, score: 30  },
        stone: { hp: 120, mass: 2.0, rest: 0.05,score: 80  },
        ice:   { hp: 35,  mass: 0.6, rest: 0.3, score: 40  },
        tnt:   { hp: 15,  mass: 0.8, rest: 0.1, score: 100 }
    };

    // Sprite mappings for each material — maps shape keys to Kenney element numbers
    // Shape keys: square (30x30), wide (50-80x16), tall (16x50-60), plank (100+x16), big (60x30)
    const SPRITE_MAP = {
        wood: {
            square: '010', wide: '011', tall: '019', plank: '011',
            big: '011', channel: '040', wheel: '003',
            variants: ['010', '014', '018', '022', '026']
        },
        glass: {
            square: '010', wide: '011', tall: '019', plank: '011',
            big: '011', channel: '040',
            variants: ['010', '014', '018', '022', '026']
        },
        stone: {
            square: '010', wide: '011', tall: '019', plank: '011',
            big: '011', channel: '040',
            variants: ['010', '014', '018', '022', '026']
        },
        ice: { // uses metal sprites
            square: '010', wide: '011', tall: '019', plank: '011',
            big: '011', channel: '040',
            variants: ['010', '014', '018', '022', '026']
        },
        tnt: { // uses explosive sprites
            square: '010', wide: '011', tall: '019', plank: '011',
            big: '011', channel: '040',
            variants: ['010', '014', '018', '022', '026']
        }
    };

    // Material → folder mapping
    const MAT_FOLDER = {
        wood: 'wood', glass: 'glass', stone: 'stone',
        ice: 'metal', tnt: 'explosive'
    };

    // Material → element prefix
    const MAT_PREFIX = {
        wood: 'elementWood', glass: 'elementGlass', stone: 'elementStone',
        ice: 'elementMetal', tnt: 'elementExplosive'
    };

    // Projectile types
    const PROJ = {
        standard: { r: 12, mass: 1.0, rest: 0.3, color: '#EF4444', name: 'Standard', special: false },
        heavy:    { r: 16, mass: 2.5, rest: 0.15,color: '#1F2937', name: 'Heavy',    special: false },
        splitter: { r: 12, mass: 0.8, rest: 0.25,color: '#3B82F6', name: 'Splitter', special: true },
        bomber:   { r: 14, mass: 1.2, rest: 0.1, color: '#FBBF24', name: 'Bomber',   special: true },
        bouncer:  { r: 11, mass: 0.7, rest: 0.85,color: '#22C55E', name: 'Bouncer',  special: false }
    };

    // Game states
    const ST_LOADING = -1, ST_SPLASH = 0, ST_AIM = 1, ST_FLIGHT = 2,
          ST_SETTLE = 3, ST_RESULT = 4, ST_WIN = 5, ST_LOSE = 6;

    // ── State ──
    let canvas, ctx;
    let state = ST_LOADING;
    let gameActive = false;
    let animFrame = null;
    let player = null;
    let onGameOver = null;
    let inputBound = false;

    // Theme
    let theme = null, TC = [], TBG = [];

    // Audio
    let audioCtx = null;

    // Physics world
    let bodies = [];
    let particles = [];
    let floats = [];
    let shakeX = 0, shakeY = 0, shakeT = 0;

    // Camera
    let camX = 0, camTargetX = 0;

    // Slingshot
    let slingLoaded = false;
    let dragging = false;
    let dragX = 0, dragY = 0;
    let pullX = 0, pullY = 0;

    // Projectiles
    let projectiles = [];
    let projIndex = 0;
    let activeProj = null;
    let projUsed = 0;
    let specialUsed = false;

    // Targets
    let targets = [];

    // Level
    let currentLevel = 0;
    let score = 0;
    let levelScore = 0;
    let settleTimer = 0;
    let stars = 0;
    let totalScore = 0;

    // Clouds
    let clouds = [];

    // Hills
    let hills1 = [], hills2 = [];

    // Frame timing
    let lastTime = 0;
    let dt = 1;

    // Loading progress
    let loadProgress = 0;
    let loadTotal = 0;

    // ═══════════════════════════════════════════════════════════════
    // SPRITE SYSTEM
    // ═══════════════════════════════════════════════════════════════
    const spriteCache = {};
    let spritesLoaded = false;

    function spriteKey(folder, filename) {
        return `${folder}/${filename}`;
    }

    function getSprite(key) {
        return spriteCache[key] || null;
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => { console.warn('Failed to load:', src); resolve(null); };
            img.src = src;
        });
    }

    async function preloadAllSprites() {
        const manifest = [];

        // Block sprites — load a selection of element indices for each material
        const blockIndices = [
            '000','001','002','003','004','005','006','007','008','009',
            '010','011','012','013','014','015','016','017','018','019',
            '020','021','022','023','024','025','026','027','028','029',
            '030','031','032','033','034','035','036','037','038','039',
            '040','041','042','043','044','045','046','047','048','049',
            '050','051','052','053','054'
        ];

        for (const mat of ['wood', 'glass', 'stone']) {
            const folder = MAT_FOLDER[mat];
            const prefix = MAT_PREFIX[mat];
            for (const idx of blockIndices) {
                manifest.push({
                    key: spriteKey(mat, idx),
                    src: `${KP}/${folder}/${prefix}${idx}.png`
                });
            }
        }

        // Metal (ice) — has up to 057
        const metalIndices = [...blockIndices, '055', '056', '057'];
        for (const idx of metalIndices) {
            manifest.push({
                key: spriteKey('ice', idx),
                src: `${KP}/metal/elementMetal${idx}.png`
            });
        }

        // Explosive (tnt) — has up to 057
        for (const idx of metalIndices) {
            manifest.push({
                key: spriteKey('tnt', idx),
                src: `${KP}/explosive/elementExplosive${idx}.png`
            });
        }

        // Backgrounds
        manifest.push({ key: 'bg/colored_desert', src: `${KP}/backgrounds/colored_desert.png` });
        manifest.push({ key: 'bg/colored_grass', src: `${KP}/backgrounds/colored_grass.png` });
        manifest.push({ key: 'bg/colored_land', src: `${KP}/backgrounds/colored_land.png` });

        // Debris sprites
        for (let i = 1; i <= 3; i++) {
            manifest.push({ key: `debris/wood_${i}`, src: `${KP}/debris/debrisWood_${i}.png` });
            manifest.push({ key: `debris/glass_${i}`, src: `${KP}/debris/debrisGlass_${i}.png` });
            manifest.push({ key: `debris/stone_${i}`, src: `${KP}/debris/debrisStone_${i}.png` });
        }

        // Aliens — targets
        const alienColors = ['Beige', 'Blue', 'Green', 'Pink', 'Yellow'];
        const alienShapes = ['round', 'square', 'suit'];
        for (const color of alienColors) {
            for (const shape of alienShapes) {
                manifest.push({
                    key: `alien/${color}_${shape}`,
                    src: `${KP}/aliens/alien${color}_${shape}.png`
                });
            }
        }

        // Other sprites
        manifest.push({ key: 'other/grass', src: `${KP}/other/grass.png` });
        manifest.push({ key: 'other/dirt', src: `${KP}/other/dirt.png` });
        manifest.push({ key: 'other/sand', src: `${KP}/other/sand.png` });
        manifest.push({ key: 'other/rock', src: `${KP}/other/rock.png` });
        manifest.push({ key: 'other/bush', src: `${KP}/other/bush.png` });
        manifest.push({ key: 'other/cactus', src: `${KP}/other/cactus.png` });
        manifest.push({ key: 'other/starGold', src: `${KP}/other/starGold.png` });
        manifest.push({ key: 'other/starSilver', src: `${KP}/other/starSilver.png` });
        manifest.push({ key: 'other/starBronze', src: `${KP}/other/starBronze.png` });
        manifest.push({ key: 'other/coinGold', src: `${KP}/other/coinGold.png` });
        manifest.push({ key: 'other/flagRed', src: `${KP}/other/flagRed.png` });

        loadTotal = manifest.length;
        loadProgress = 0;

        // Load in batches of 20 for performance
        const batchSize = 20;
        for (let i = 0; i < manifest.length; i += batchSize) {
            const batch = manifest.slice(i, i + batchSize);
            const results = await Promise.all(batch.map(item => loadImage(item.src)));
            results.forEach((img, idx) => {
                if (img) spriteCache[batch[idx].key] = img;
                loadProgress++;
            });
        }

        spritesLoaded = true;
    }

    // Get the best sprite for a block based on its dimensions
    function getBlockSprite(material, w, h) {
        const mat = material;
        let shapeKey;

        // Determine shape category by aspect ratio
        const aspect = w / h;
        if (aspect > 3) shapeKey = '011';       // very wide plank
        else if (aspect > 1.5) shapeKey = '011'; // wide block
        else if (aspect < 0.5) shapeKey = '019'; // tall plank
        else if (aspect < 0.7) shapeKey = '019'; // tallish
        else shapeKey = '010';                    // square-ish

        // Try exact match first
        let sprite = getSprite(spriteKey(mat, shapeKey));
        if (sprite) return sprite;

        // Fallback to square
        sprite = getSprite(spriteKey(mat, '010'));
        if (sprite) return sprite;

        // Last resort — first available
        for (let i = 0; i < 55; i++) {
            const idx = String(i).padStart(3, '0');
            sprite = getSprite(spriteKey(mat, idx));
            if (sprite) return sprite;
        }
        return null;
    }

    // Get debris sprite for a material
    function getDebrisSprite(material) {
        let folder = 'wood';
        if (material === 'glass') folder = 'glass';
        else if (material === 'stone' || material === 'ice') folder = 'stone';
        const idx = 1 + Math.floor(Math.random() * 3);
        return getSprite(`debris/${folder}_${idx}`);
    }

    // Get a random alien sprite for targets
    const ALIEN_POOL = [];
    function getAlienSprite(index) {
        if (ALIEN_POOL.length === 0) {
            const colors = ['Green', 'Pink', 'Yellow', 'Blue', 'Beige'];
            const shapes = ['round', 'suit', 'square'];
            for (const c of colors) {
                for (const s of shapes) {
                    const sp = getSprite(`alien/${c}_${s}`);
                    if (sp) ALIEN_POOL.push(sp);
                }
            }
        }
        if (ALIEN_POOL.length === 0) return null;
        return ALIEN_POOL[index % ALIEN_POOL.length];
    }

    // ═══════════════════════════════════════════════════════════════
    // AUDIO
    // ═══════════════════════════════════════════════════════════════
    function getAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
        }
        return audioCtx;
    }

    function playSound(type) {
        const ac = getAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);

            switch(type) {
                case 'stretch':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(200, t);
                    osc.frequency.linearRampToValueAtTime(350, t + 0.1);
                    gain.gain.setValueAtTime(0.08, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                    osc.start(t); osc.stop(t + 0.15);
                    break;
                case 'launch':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(150, t);
                    osc.frequency.exponentialRampToValueAtTime(600, t + 0.12);
                    gain.gain.setValueAtTime(0.15, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                    osc.start(t); osc.stop(t + 0.2);
                    break;
                case 'wood':
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(300, t);
                    osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
                    gain.gain.setValueAtTime(0.12, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
                    osc.start(t); osc.stop(t + 0.18);
                    break;
                case 'glass':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(2000, t);
                    osc.frequency.exponentialRampToValueAtTime(800, t + 0.2);
                    gain.gain.setValueAtTime(0.1, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                    osc.start(t); osc.stop(t + 0.25);
                    break;
                case 'stone':
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(80, t);
                    osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
                    gain.gain.setValueAtTime(0.1, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                    osc.start(t); osc.stop(t + 0.25);
                    break;
                case 'explode':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(100, t);
                    osc.frequency.exponentialRampToValueAtTime(20, t + 0.4);
                    gain.gain.setValueAtTime(0.2, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
                    osc.start(t); osc.stop(t + 0.5);
                    const n = ac.createOscillator();
                    const ng = ac.createGain();
                    n.connect(ng); ng.connect(ac.destination);
                    n.type = 'square';
                    n.frequency.setValueAtTime(60, t);
                    n.frequency.exponentialRampToValueAtTime(15, t + 0.3);
                    ng.gain.setValueAtTime(0.15, t);
                    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
                    n.start(t); n.stop(t + 0.4);
                    break;
                case 'hit':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(500, t);
                    osc.frequency.exponentialRampToValueAtTime(200, t + 0.1);
                    gain.gain.setValueAtTime(0.1, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                    osc.start(t); osc.stop(t + 0.12);
                    break;
                case 'kill':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(800, t);
                    osc.frequency.setValueAtTime(1000, t + 0.05);
                    osc.frequency.setValueAtTime(1200, t + 0.1);
                    gain.gain.setValueAtTime(0.12, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                    osc.start(t); osc.stop(t + 0.2);
                    break;
                case 'win':
                    osc.type = 'sine';
                    [523, 659, 784, 1047].forEach((f, i) => {
                        osc.frequency.setValueAtTime(f, t + i * 0.12);
                    });
                    gain.gain.setValueAtTime(0.12, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
                    osc.start(t); osc.stop(t + 0.6);
                    break;
                case 'lose':
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(400, t);
                    osc.frequency.exponentialRampToValueAtTime(100, t + 0.5);
                    gain.gain.setValueAtTime(0.12, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
                    osc.start(t); osc.stop(t + 0.6);
                    break;
                case 'split':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(600, t);
                    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
                    gain.gain.setValueAtTime(0.1, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                    osc.start(t); osc.stop(t + 0.12);
                    break;
                case 'star':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(1000 + Math.random() * 500, t);
                    gain.gain.setValueAtTime(0.08, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                    osc.start(t); osc.stop(t + 0.15);
                    break;
            }
        } catch(e) {}
    }

    // ═══════════════════════════════════════════════════════════════
    // PHYSICS BODY
    // ═══════════════════════════════════════════════════════════════
    function makeBody(x, y, w, h, opts = {}) {
        return {
            x, y, w, h,
            vx: opts.vx || 0,
            vy: opts.vy || 0,
            angle: opts.angle || 0,
            angVel: opts.angVel || 0,
            mass: opts.mass || 1,
            rest: opts.rest || 0.2,
            isStatic: opts.isStatic || false,
            isCircle: opts.isCircle || false,
            r: opts.r || 0,
            material: opts.material || null,
            hp: opts.hp || 100,
            maxHp: opts.hp || 100,
            type: opts.type || 'block',
            projType: opts.projType || null,
            alive: true,
            grounded: false,
            settled: false,
            expression: opts.expression || null,
            color: opts.color || '#888',
            sleepFrames: 0,
            alienIndex: opts.alienIndex || 0,
            crackLevel: 0
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // PHYSICS ENGINE
    // ═══════════════════════════════════════════════════════════════
    function applyGravity(b) {
        if (b.isStatic || !b.alive) return;
        b.vy += GRAVITY * dt;
    }

    function moveBody(b) {
        if (b.isStatic || !b.alive) return;
        b.vx *= AIR_DRAG;
        b.vy *= AIR_DRAG;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.angle += b.angVel * dt;
        b.angVel *= 0.98;

        // Ground collision
        const bottom = b.isCircle ? b.y + b.r : b.y + b.h / 2;
        if (bottom > GROUND_Y) {
            if (b.isCircle) {
                b.y = GROUND_Y - b.r;
            } else {
                b.y = GROUND_Y - b.h / 2;
            }
            const impactVel = Math.abs(b.vy);
            b.vy *= -b.rest;
            b.vx *= (1 - FRICTION * 0.5);
            b.angVel += b.vx * 0.01;
            if (Math.abs(b.vy) < 1) { b.vy = 0; b.grounded = true; }
            if (impactVel > 3) {
                spawnDust(b.x, GROUND_Y, impactVel);
                if (b.type === 'block' && impactVel > 5) {
                    damageBody(b, impactVel * 3);
                }
            }
        }

        // Wall bounds
        if (b.x < -200) b.x = -200;
        if (b.x > 2400) b.x = 2400;
        if (b.y < -500) b.y = -500;

        // Check if settled
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy) + Math.abs(b.angVel);
        if (speed < SETTLE_THRESHOLD && b.grounded) {
            b.sleepFrames++;
            if (b.sleepFrames > 20) b.settled = true;
        } else {
            b.sleepFrames = 0;
            b.settled = false;
        }
    }

    function aabbOverlap(a, b) {
        let ax1, ay1, ax2, ay2, bx1, by1, bx2, by2;
        if (a.isCircle) {
            ax1 = a.x - a.r; ay1 = a.y - a.r;
            ax2 = a.x + a.r; ay2 = a.y + a.r;
        } else {
            ax1 = a.x - a.w/2; ay1 = a.y - a.h/2;
            ax2 = a.x + a.w/2; ay2 = a.y + a.h/2;
        }
        if (b.isCircle) {
            bx1 = b.x - b.r; by1 = b.y - b.r;
            bx2 = b.x + b.r; by2 = b.y + b.r;
        } else {
            bx1 = b.x - b.w/2; by1 = b.y - b.h/2;
            bx2 = b.x + b.w/2; by2 = b.y + b.h/2;
        }
        return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
    }

    function resolveCollision(a, b) {
        if (!a.alive || !b.alive) return;
        if (a.isStatic && b.isStatic) return;
        if (!aabbOverlap(a, b)) return;

        let ax1, ay1, ax2, ay2, bx1, by1, bx2, by2;
        if (a.isCircle) {
            ax1 = a.x - a.r; ay1 = a.y - a.r; ax2 = a.x + a.r; ay2 = a.y + a.r;
        } else {
            ax1 = a.x - a.w/2; ay1 = a.y - a.h/2; ax2 = a.x + a.w/2; ay2 = a.y + a.h/2;
        }
        if (b.isCircle) {
            bx1 = b.x - b.r; by1 = b.y - b.r; bx2 = b.x + b.r; by2 = b.y + b.r;
        } else {
            bx1 = b.x - b.w/2; by1 = b.y - b.h/2; bx2 = b.x + b.w/2; by2 = b.y + b.h/2;
        }

        const ox = Math.min(ax2 - bx1, bx2 - ax1);
        const oy = Math.min(ay2 - by1, by2 - ay1);
        if (ox <= 0 || oy <= 0) return;

        let nx = 0, ny = 0;
        if (ox < oy) {
            nx = (a.x < b.x) ? -1 : 1;
        } else {
            ny = (a.y < b.y) ? -1 : 1;
        }
        const pen = Math.min(ox, oy);

        const totalMass = (a.isStatic ? 999 : a.mass) + (b.isStatic ? 999 : b.mass);
        if (!a.isStatic) {
            const ratio = (b.isStatic ? 1 : b.mass / totalMass);
            a.x += nx * pen * ratio;
            a.y += ny * pen * ratio;
        }
        if (!b.isStatic) {
            const ratio = (a.isStatic ? 1 : a.mass / totalMass);
            b.x -= nx * pen * ratio;
            b.y -= ny * pen * ratio;
        }

        const relVx = a.vx - b.vx;
        const relVy = a.vy - b.vy;
        const relVn = relVx * nx + relVy * ny;

        if (relVn > 0) return;

        const restitution = Math.min(a.rest, b.rest);
        const impulseMag = -(1 + restitution) * relVn / (
            (a.isStatic ? 0 : 1/a.mass) + (b.isStatic ? 0 : 1/b.mass)
        );

        if (!a.isStatic) {
            a.vx += (impulseMag / a.mass) * nx;
            a.vy += (impulseMag / a.mass) * ny;
        }
        if (!b.isStatic) {
            b.vx -= (impulseMag / b.mass) * nx;
            b.vy -= (impulseMag / b.mass) * ny;
        }

        // Angular velocity from off-center impacts
        if (!a.isStatic) {
            a.angVel += (relVn * 0.02) * (Math.random() - 0.5);
        }
        if (!b.isStatic) {
            b.angVel += (relVn * 0.02) * (Math.random() - 0.5);
        }

        // Impact damage
        const impactForce = Math.abs(relVn);
        if (impactForce > MIN_IMPACT_VEL) {
            const dmg = impactForce * 4;
            if (a.type === 'block' || a.type === 'target') damageBody(a, dmg * (b.type === 'proj' ? 2 : 1));
            if (b.type === 'block' || b.type === 'target') damageBody(b, dmg * (a.type === 'proj' ? 2 : 1));

            if (a.material === 'glass' || b.material === 'glass') playSound('glass');
            else if (a.material === 'stone' || b.material === 'stone') playSound('stone');
            else if (a.material === 'wood' || b.material === 'wood') playSound('wood');
            else if (a.type === 'target' || b.type === 'target') playSound('hit');
        }
    }

    function damageBody(b, dmg) {
        if (!b.alive) return;
        b.hp -= dmg;
        // Update crack level for visual feedback
        const dmgRatio = 1 - b.hp / b.maxHp;
        if (dmgRatio > 0.7) b.crackLevel = 3;
        else if (dmgRatio > 0.4) b.crackLevel = 2;
        else if (dmgRatio > 0.2) b.crackLevel = 1;
        if (b.hp <= 0) {
            destroyBody(b);
        }
    }

    function destroyBody(b) {
        if (!b.alive) return;
        b.alive = false;

        if (b.material === 'tnt') {
            explodeAt(b.x, b.y, 100);
            return;
        }

        // Score
        if (b.type === 'block' && b.material) {
            const pts = MAT[b.material]?.score || 50;
            levelScore += pts;
            spawnFloat(b.x, b.y, '+' + pts, '#FFD700');
        }
        if (b.type === 'target') {
            levelScore += 500;
            spawnFloat(b.x, b.y, '+500', '#FFD700');
            playSound('kill');
        }

        // Spawn debris sprites instead of simple colored particles
        const debrisCount = b.material === 'glass' ? 12 : 8;
        for (let i = 0; i < debrisCount; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 1 + Math.random() * 4;
            const debSprite = getDebrisSprite(b.material || 'wood');
            particles.push({
                x: b.x + (Math.random() - 0.5) * (b.w || b.r * 2),
                y: b.y + (Math.random() - 0.5) * (b.h || b.r * 2),
                vx: Math.cos(ang) * spd + (b.vx || 0) * 0.3,
                vy: Math.sin(ang) * spd - 2 + (b.vy || 0) * 0.3,
                r: b.material === 'glass' ? 4 + Math.random() * 6 : 6 + Math.random() * 8,
                life: 60 + Math.random() * 40,
                maxLife: 100,
                angVel: (Math.random() - 0.5) * 0.3,
                angle: Math.random() * Math.PI * 2,
                isGlass: b.material === 'glass',
                sprite: debSprite,
                isDust: false, isRing: false
            });
        }
    }

    function explodeAt(x, y, radius) {
        playSound('explode');
        shakeT = 15;

        // Visual explosion particles — mix of fire colors and debris sprites
        for (let i = 0; i < 30; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 2 + Math.random() * 6;
            particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 20,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 3,
                r: 3 + Math.random() * 5,
                color: ['#FF4444', '#FF8800', '#FFCC00', '#FF6600'][Math.floor(Math.random() * 4)],
                life: 40 + Math.random() * 30,
                maxLife: 70,
                angVel: (Math.random() - 0.5) * 0.4, angle: Math.random() * Math.PI * 2,
                isGlass: false, isDust: false, isRing: false,
                sprite: i < 10 ? getDebrisSprite('wood') : null
            });
        }

        // Expanding ring
        particles.push({
            x, y, vx: 0, vy: 0, r: 5,
            color: '#FFAA00', life: 20, maxLife: 20,
            isRing: true, ringRadius: 5, ringMax: radius,
            angVel: 0, angle: 0, isGlass: false, isDust: false, sprite: null
        });

        // Damage nearby bodies
        for (const b of bodies) {
            if (!b.alive || b.isStatic) continue;
            const dx = b.x - x;
            const dy = b.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < radius) {
                const force = (1 - dist / radius) * 15;
                const ang2 = Math.atan2(dy, dx);
                b.vx += Math.cos(ang2) * force;
                b.vy += Math.sin(ang2) * force - 3;
                b.angVel += (Math.random() - 0.5) * 0.5;
                damageBody(b, (1 - dist / radius) * 150);
            }
        }
    }

    function spawnDust(x, y, intensity) {
        const count = Math.min(8, Math.floor(intensity));
        for (let i = 0; i < count; i++) {
            particles.push({
                x: x + (Math.random() - 0.5) * 20,
                y: y - Math.random() * 5,
                vx: (Math.random() - 0.5) * 3,
                vy: -Math.random() * 2 - 0.5,
                r: 3 + Math.random() * 4,
                color: '#C4A56E',
                life: 20 + Math.random() * 20,
                maxLife: 40,
                angVel: 0, angle: 0, isGlass: false, isDust: true, isRing: false, sprite: null
            });
        }
    }

    function spawnFloat(x, y, text, color) {
        floats.push({ x, y, text, color, life: 60 });
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            if (p.isRing) {
                p.ringRadius += (p.ringMax - p.ringRadius) * 0.15;
                continue;
            }
            p.vy += (p.isDust ? 0 : GRAVITY * 0.5) * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.angle += p.angVel;
            if (p.y > GROUND_Y) { p.y = GROUND_Y; p.vy *= -0.3; p.vx *= 0.8; }
        }
        for (let i = floats.length - 1; i >= 0; i--) {
            floats[i].y -= 1.2;
            floats[i].life -= dt;
            if (floats[i].life <= 0) floats.splice(i, 1);
        }
    }

    function physicsStep() {
        for (const b of bodies) {
            if (!b.alive) continue;
            applyGravity(b);
            moveBody(b);
        }
        for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) {
                if (!bodies[i].alive || !bodies[j].alive) continue;
                if (bodies[i].settled && bodies[j].settled) continue;
                resolveCollision(bodies[i], bodies[j]);
            }
        }
        bodies = bodies.filter(b => b.alive || b.type === 'proj');
        targets = targets.filter(t => t.alive);
    }

    // ═══════════════════════════════════════════════════════════════
    // LEVEL DEFINITIONS
    // ═══════════════════════════════════════════════════════════════
    function getLevels() {
        const B = GROUND_Y;
        const bw = 30, bh = 30;
        const tw = 50;
        return [
            // Level 1: Simple tower
            {
                name: 'First Shot',
                projectiles: ['standard', 'standard', 'standard'],
                starScores: [800, 1500, 2500],
                blocks: [
                    { x: 650, y: B - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 680, y: B - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 665, y: B - bh - bh/2, w: tw, h: bh*0.5, mat: 'wood' },
                    { x: 665, y: B - bh*2, w: bw, h: bh, mat: 'wood' },
                ],
                targets: [
                    { x: 665, y: B - bh*2 - 15 }
                ]
            },
            // Level 2: Two stacks
            {
                name: 'Double Trouble',
                projectiles: ['standard', 'standard', 'standard', 'standard'],
                starScores: [1500, 2500, 4000],
                blocks: [
                    { x: 550, y: B - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 580, y: B - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 565, y: B - bh - 8, w: tw, h: 16, mat: 'wood' },
                    { x: 720, y: B - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 750, y: B - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 735, y: B - bh - 8, w: tw, h: 16, mat: 'wood' },
                    { x: 735, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'wood' },
                ],
                targets: [
                    { x: 565, y: B - bh - 22 },
                    { x: 735, y: B - bh - 16 - bh - 10 }
                ]
            },
            // Level 3: Glass intro
            {
                name: 'Fragile',
                projectiles: ['standard', 'standard', 'standard'],
                starScores: [1200, 2200, 3500],
                blocks: [
                    { x: 620, y: B - bh/2, w: bw, h: bh, mat: 'glass' },
                    { x: 700, y: B - bh/2, w: bw, h: bh, mat: 'glass' },
                    { x: 660, y: B - bh - 8, w: 80, h: 16, mat: 'wood' },
                    { x: 640, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'glass' },
                    { x: 680, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'glass' },
                    { x: 660, y: B - bh*2 - 16 - 8, w: 60, h: 16, mat: 'wood' },
                ],
                targets: [
                    { x: 660, y: B - bh - 22 },
                    { x: 660, y: B - bh*2 - 32 - 10 }
                ]
            },
            // Level 4: Stone fortress
            {
                name: 'Stronghold',
                projectiles: ['standard', 'heavy', 'standard', 'standard'],
                starScores: [2000, 3500, 5000],
                blocks: [
                    { x: 600, y: B - bh/2, w: bw, h: bh, mat: 'stone' },
                    { x: 720, y: B - bh/2, w: bw, h: bh, mat: 'stone' },
                    { x: 660, y: B - bh - 8, w: 120, h: 16, mat: 'stone' },
                    { x: 630, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 690, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 660, y: B - bh*2 - 16 - 8, w: 80, h: 16, mat: 'wood' },
                ],
                targets: [
                    { x: 660, y: B - bh - 22 },
                    { x: 660, y: B - bh*2 - 32 - 10 }
                ]
            },
            // Level 5: TNT chain
            {
                name: 'Chain Reaction',
                projectiles: ['standard', 'standard', 'standard'],
                starScores: [2500, 4000, 6000],
                blocks: [
                    { x: 600, y: B - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 640, y: B - bh/2, w: bw, h: bh, mat: 'tnt' },
                    { x: 680, y: B - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 720, y: B - bh/2, w: bw, h: bh, mat: 'tnt' },
                    { x: 760, y: B - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 640, y: B - bh - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 720, y: B - bh - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 680, y: B - bh*2 - 8, w: 80, h: 16, mat: 'wood' },
                ],
                targets: [
                    { x: 640, y: B - bh*2 - 10 },
                    { x: 720, y: B - bh*2 - 10 },
                    { x: 680, y: B - bh*2 - 24 - 10 }
                ]
            },
            // Level 6: Mixed fortress
            {
                name: 'Mixed Bag',
                projectiles: ['standard', 'heavy', 'standard', 'bouncer'],
                starScores: [3000, 5000, 7000],
                blocks: [
                    { x: 550, y: B - bh/2, w: bw, h: bh, mat: 'stone' },
                    { x: 580, y: B - bh/2, w: bw, h: bh, mat: 'glass' },
                    { x: 610, y: B - bh/2, w: bw, h: bh, mat: 'glass' },
                    { x: 640, y: B - bh/2, w: bw, h: bh, mat: 'stone' },
                    { x: 595, y: B - bh - 8, w: 90, h: 16, mat: 'wood' },
                    { x: 570, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 620, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 595, y: B - bh*2 - 24, w: 60, h: 16, mat: 'wood' },
                    { x: 750, y: B - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 790, y: B - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 770, y: B - bh - 8, w: 50, h: 16, mat: 'glass' },
                    { x: 770, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'ice' },
                ],
                targets: [
                    { x: 595, y: B - bh - 22 },
                    { x: 595, y: B - bh*2 - 40 },
                    { x: 770, y: B - bh - 22 }
                ]
            },
            // Level 7: Ice slide
            {
                name: 'Slip & Slide',
                projectiles: ['standard', 'bouncer', 'standard', 'standard'],
                starScores: [2500, 4500, 6500],
                blocks: [
                    { x: 550, y: B - bh/2, w: bw, h: bh, mat: 'ice' },
                    { x: 580, y: B - bh/2, w: bw, h: bh, mat: 'ice' },
                    { x: 610, y: B - bh/2, w: bw, h: bh, mat: 'ice' },
                    { x: 640, y: B - bh/2, w: bw, h: bh, mat: 'ice' },
                    { x: 595, y: B - bh - 8, w: 100, h: 16, mat: 'ice' },
                    { x: 595, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 700, y: B - bh/2, w: bw, h: bh, mat: 'ice' },
                    { x: 730, y: B - bh/2, w: bw, h: bh, mat: 'ice' },
                    { x: 760, y: B - bh/2, w: bw, h: bh, mat: 'ice' },
                    { x: 730, y: B - bh - 8, w: 70, h: 16, mat: 'ice' },
                    { x: 730, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'tnt' },
                ],
                targets: [
                    { x: 595, y: B - bh - 16 - bh - 10 },
                    { x: 730, y: B - bh - 22 }
                ]
            },
            // Level 8: Tall tower
            {
                name: 'Skyscraper',
                projectiles: ['heavy', 'standard', 'splitter', 'standard'],
                starScores: [3500, 5500, 8000],
                blocks: [
                    { x: 660, y: B - bh/2, w: bw, h: bh, mat: 'stone' },
                    { x: 700, y: B - bh/2, w: bw, h: bh, mat: 'stone' },
                    { x: 680, y: B - bh - 8, w: 50, h: 16, mat: 'wood' },
                    { x: 660, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 700, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 680, y: B - bh*2 - 24, w: 50, h: 16, mat: 'glass' },
                    { x: 660, y: B - bh*2 - 24 - bh - 6, w: bw, h: bh, mat: 'glass' },
                    { x: 700, y: B - bh*2 - 24 - bh - 6, w: bw, h: bh, mat: 'glass' },
                    { x: 680, y: B - bh*3 - 32 - 8, w: 50, h: 16, mat: 'wood' },
                    { x: 680, y: B - bh*3 - 40 - bh/2, w: bw, h: bh, mat: 'wood' },
                ],
                targets: [
                    { x: 680, y: B - bh - 22 },
                    { x: 680, y: B - bh*2 - 36 },
                    { x: 680, y: B - bh*3 - 48 - bh - 5 }
                ]
            },
            // Level 9: Splitter intro
            {
                name: 'Divide & Conquer',
                projectiles: ['splitter', 'splitter', 'standard', 'heavy'],
                starScores: [3000, 5000, 7500],
                blocks: [
                    { x: 500, y: B - bh/2, w: bw, h: bh, mat: 'glass' },
                    { x: 530, y: B - bh/2, w: bw, h: bh, mat: 'glass' },
                    { x: 515, y: B - bh - 8, w: 40, h: 16, mat: 'wood' },
                    { x: 650, y: B - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 680, y: B - bh/2, w: bw, h: bh, mat: 'tnt' },
                    { x: 665, y: B - bh - 8, w: 40, h: 16, mat: 'wood' },
                    { x: 800, y: B - bh/2, w: bw, h: bh, mat: 'glass' },
                    { x: 830, y: B - bh/2, w: bw, h: bh, mat: 'glass' },
                    { x: 815, y: B - bh - 8, w: 40, h: 16, mat: 'wood' },
                ],
                targets: [
                    { x: 515, y: B - bh - 22 },
                    { x: 665, y: B - bh - 22 },
                    { x: 815, y: B - bh - 22 }
                ]
            },
            // Level 10: Boss fortress
            {
                name: 'The Fortress',
                projectiles: ['heavy', 'bomber', 'splitter', 'heavy', 'standard'],
                starScores: [5000, 8000, 12000],
                blocks: [
                    { x: 550, y: B - bh/2, w: bw, h: bh, mat: 'stone' },
                    { x: 580, y: B - bh/2, w: bw, h: bh, mat: 'stone' },
                    { x: 610, y: B - bh/2, w: bw, h: bh, mat: 'stone' },
                    { x: 640, y: B - bh/2, w: bw, h: bh, mat: 'stone' },
                    { x: 670, y: B - bh/2, w: bw, h: bh, mat: 'stone' },
                    { x: 700, y: B - bh/2, w: bw, h: bh, mat: 'stone' },
                    { x: 730, y: B - bh/2, w: bw, h: bh, mat: 'stone' },
                    { x: 760, y: B - bh/2, w: bw, h: bh, mat: 'stone' },
                    { x: 655, y: B - bh - 8, w: 220, h: 16, mat: 'stone' },
                    { x: 570, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 620, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'glass' },
                    { x: 655, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'tnt' },
                    { x: 690, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'glass' },
                    { x: 740, y: B - bh - 16 - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 655, y: B - bh*2 - 24, w: 180, h: 16, mat: 'wood' },
                    { x: 600, y: B - bh*2 - 32 - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 655, y: B - bh*2 - 32 - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 710, y: B - bh*2 - 32 - bh/2, w: bw, h: bh, mat: 'wood' },
                    { x: 655, y: B - bh*3 - 40, w: 140, h: 16, mat: 'wood' },
                    { x: 655, y: B - bh*3 - 48 - bh/2, w: bw, h: bh, mat: 'glass' },
                ],
                targets: [
                    { x: 595, y: B - bh - 22 },
                    { x: 715, y: B - bh - 22 },
                    { x: 655, y: B - bh*2 - 40 },
                    { x: 655, y: B - bh*3 - 48 - bh - 5 }
                ]
            }
        ];
    }

    function loadLevel(idx) {
        const levels = getLevels();
        if (idx >= levels.length) idx = levels.length - 1;
        currentLevel = idx;
        const lvl = levels[idx];

        bodies = [];
        particles = [];
        floats = [];
        targets = [];
        levelScore = 0;
        projIndex = 0;
        projUsed = 0;
        activeProj = null;
        specialUsed = false;
        slingLoaded = true;
        dragging = false;
        settleTimer = 0;
        camX = 0;
        camTargetX = 0;

        projectiles = lvl.projectiles.slice();

        // Build blocks
        for (const def of lvl.blocks) {
            const mat = MAT[def.mat];
            const b = makeBody(def.x, def.y, def.w, def.h, {
                mass: mat.mass,
                rest: mat.rest,
                hp: mat.hp * (def.w * def.h / 900),
                material: def.mat,
                type: 'block',
            });
            bodies.push(b);
        }

        // Build targets — each gets a random alien sprite
        let alienIdx = 0;
        for (const def of lvl.targets) {
            const t = makeBody(def.x, def.y, 20, 20, {
                mass: 0.5,
                rest: 0.1,
                hp: 30,
                type: 'target',
                isCircle: true,
                r: 10,
                expression: 'happy',
                alienIndex: alienIdx++
            });
            bodies.push(t);
            targets.push(t);
        }

        state = ST_AIM;
    }

    // ═══════════════════════════════════════════════════════════════
    // SLINGSHOT & PROJECTILE
    // ═══════════════════════════════════════════════════════════════
    function getSlingProjectilePos() {
        if (dragging) {
            return { x: SLING_X + pullX, y: SLING_Y + pullY };
        }
        return { x: SLING_X, y: SLING_Y - 5 };
    }

    function launchProjectile() {
        if (projIndex >= projectiles.length) return;
        const type = PROJ[projectiles[projIndex]];
        const pos = getSlingProjectilePos();

        const vx = -pullX * LAUNCH_POWER;
        const vy = -pullY * LAUNCH_POWER;

        const b = makeBody(pos.x, pos.y, type.r * 2, type.r * 2, {
            mass: type.mass,
            rest: type.rest,
            isCircle: true,
            r: type.r,
            vx, vy,
            hp: 9999,
            type: 'proj',
            projType: projectiles[projIndex]
        });
        b.color = type.color;
        bodies.push(b);
        activeProj = b;
        projUsed++;
        projIndex++;
        specialUsed = false;
        slingLoaded = false;
        state = ST_FLIGHT;
        playSound('launch');
    }

    function activateSpecial() {
        if (!activeProj || specialUsed) return;
        const pt = activeProj.projType;
        if (pt === 'splitter') {
            specialUsed = true;
            playSound('split');
            for (let i = -1; i <= 1; i++) {
                const b = makeBody(activeProj.x, activeProj.y, 8, 8, {
                    mass: 0.4, rest: 0.25, isCircle: true, r: 7,
                    vx: activeProj.vx + i * 3,
                    vy: activeProj.vy + (i === 0 ? 0 : -2),
                    hp: 9999, type: 'proj', projType: 'standard'
                });
                b.color = '#60A5FA';
                bodies.push(b);
            }
            activeProj.alive = false;
            activeProj = null;
        } else if (pt === 'bomber') {
            specialUsed = true;
            explodeAt(activeProj.x, activeProj.y, 120);
            activeProj.alive = false;
            activeProj = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // SCENERY
    // ═══════════════════════════════════════════════════════════════
    function initScenery() {
        clouds = [];
        for (let i = 0; i < 6; i++) {
            clouds.push({
                x: Math.random() * GAME_W * 2,
                y: 30 + Math.random() * 120,
                w: 60 + Math.random() * 80,
                h: 20 + Math.random() * 15,
                speed: 0.1 + Math.random() * 0.2
            });
        }
        hills1 = [];
        hills2 = [];
        for (let i = 0; i < 20; i++) {
            hills1.push({ x: i * 120 - 100, h: 30 + Math.random() * 40, w: 100 + Math.random() * 60 });
            hills2.push({ x: i * 100 - 50, h: 20 + Math.random() * 25, w: 80 + Math.random() * 40 });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // UPDATE
    // ═══════════════════════════════════════════════════════════════
    function update() {
        if (state === ST_SPLASH || state === ST_WIN || state === ST_LOSE || state === ST_LOADING) return;

        // Screen shake decay
        if (shakeT > 0) {
            shakeT -= dt;
            shakeX = (Math.random() - 0.5) * shakeT * 1.5;
            shakeY = (Math.random() - 0.5) * shakeT * 1.5;
        } else {
            shakeX = 0; shakeY = 0;
        }

        // Physics
        physicsStep();
        updateParticles();

        // Cloud drift
        for (const c of clouds) {
            c.x -= c.speed * dt;
            if (c.x + c.w < -100) c.x = GAME_W * 2 + 50;
        }

        // Camera follow projectile
        if (state === ST_FLIGHT && activeProj && activeProj.alive) {
            camTargetX = Math.max(0, activeProj.x - GAME_W * 0.35);
            for (const t of targets) {
                if (!t.alive) continue;
                const dx = t.x - activeProj.x;
                const dy = t.y - activeProj.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                t.expression = dist < 150 ? 'scared' : 'happy';
            }
        } else if (state === ST_AIM) {
            camTargetX = 0;
        }

        camX += (camTargetX - camX) * CAMERA_EASE * dt;

        // State transitions
        if (state === ST_FLIGHT) {
            if (activeProj) {
                if (!activeProj.alive || activeProj.x > 2000 || activeProj.y > GAME_H + 100) {
                    state = ST_SETTLE;
                    settleTimer = 0;
                } else if (activeProj.settled) {
                    state = ST_SETTLE;
                    settleTimer = 0;
                }
            } else {
                const flying = bodies.filter(b => b.type === 'proj' && b.alive && !b.settled);
                if (flying.length === 0) {
                    state = ST_SETTLE;
                    settleTimer = 0;
                }
            }
        }

        if (state === ST_SETTLE) {
            camTargetX = Math.max(0, camTargetX - 2);
            settleTimer += dt;
            const moving = bodies.filter(b => b.alive && !b.isStatic && !b.settled);
            if (moving.length === 0 || settleTimer > SETTLE_FRAMES) {
                const aliveTargets = targets.filter(t => t.alive);
                if (aliveTargets.length === 0) {
                    const unusedBonus = (projectiles.length - projUsed) * 1000;
                    levelScore += unusedBonus;
                    if (unusedBonus > 0) {
                        spawnFloat(GAME_W / 2, GAME_H / 2 - 50, '+' + unusedBonus + ' UNUSED', '#FFD700');
                    }
                    score += levelScore;
                    const lvl = getLevels()[currentLevel];
                    if (levelScore >= lvl.starScores[2]) stars = 3;
                    else if (levelScore >= lvl.starScores[1]) stars = 2;
                    else if (levelScore >= lvl.starScores[0]) stars = 1;
                    else stars = 1;
                    state = ST_RESULT;
                    playSound('win');
                } else if (projIndex >= projectiles.length) {
                    state = ST_RESULT;
                    stars = 0;
                    playSound('lose');
                } else {
                    slingLoaded = true;
                    activeProj = null;
                    state = ST_AIM;
                    camTargetX = 0;
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // DRAW
    // ═══════════════════════════════════════════════════════════════
    function draw() {
        const w = GAME_W, h = GAME_H;
        ctx.save();
        ctx.clearRect(0, 0, w, h);

        // Background — try Kenney background first
        const bgSprite = getSprite('bg/colored_desert');
        if (bgSprite) {
            // Tile the background across the world
            const bgScale = h / bgSprite.height;
            const bgW = bgSprite.width * bgScale;
            const startX = -(camX * 0.15) % bgW;
            for (let bx = startX - bgW; bx < w + bgW; bx += bgW) {
                ctx.drawImage(bgSprite, bx, 0, bgW, h);
            }
        } else {
            // Fallback sky gradient
            const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
            skyGrad.addColorStop(0, '#87CEEB');
            skyGrad.addColorStop(0.6, '#E0F0FF');
            skyGrad.addColorStop(1, '#F5DEB3');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, w, h);
        }

        // Subtle sky overlay for depth
        ctx.fillStyle = 'rgba(135,206,235,0.08)';
        ctx.fillRect(0, 0, w, h * 0.3);

        // Apply camera + shake
        ctx.save();
        ctx.translate(-camX + shakeX, shakeY);

        // Hills (parallax layer 1 — behind)
        ctx.fillStyle = 'rgba(120,150,80,0.25)';
        for (const hill of hills1) {
            const hx = hill.x - camX * 0.2;
            ctx.beginPath();
            ctx.moveTo(hx - hill.w / 2, GROUND_Y);
            ctx.quadraticCurveTo(hx, GROUND_Y - hill.h, hx + hill.w / 2, GROUND_Y);
            ctx.fill();
        }

        // Hills (parallax layer 2 — closer)
        ctx.fillStyle = 'rgba(100,140,60,0.35)';
        for (const hill of hills2) {
            const hx = hill.x - camX * 0.35;
            ctx.beginPath();
            ctx.moveTo(hx - hill.w / 2, GROUND_Y);
            ctx.quadraticCurveTo(hx, GROUND_Y - hill.h, hx + hill.w / 2, GROUND_Y);
            ctx.fill();
        }

        // Clouds
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (const c of clouds) {
            const cx = c.x - camX * 0.1;
            ctx.beginPath();
            ctx.ellipse(cx, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            // Secondary puff
            ctx.beginPath();
            ctx.ellipse(cx + c.w * 0.25, c.y - c.h * 0.2, c.w * 0.35, c.h * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Ground — use Kenney grass/dirt sprites if available
        drawGround();

        // Draw slingshot
        drawSlingshot();

        // Draw bodies
        for (const b of bodies) {
            if (!b.alive) continue;
            if (b.type === 'target') {
                drawTarget(b);
            } else if (b.type === 'proj') {
                drawProjectile(b);
            } else {
                drawBlock(b);
            }
        }

        // Particles
        for (const p of particles) {
            if (p.isRing) {
                const alpha = p.life / p.maxLife;
                ctx.strokeStyle = `rgba(255,170,0,${alpha})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.ringRadius, 0, Math.PI * 2);
                ctx.stroke();
                continue;
            }
            const alpha = p.life / p.maxLife;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.globalAlpha = alpha;

            if (p.sprite) {
                // Draw debris sprite
                const sz = p.r * 2;
                ctx.drawImage(p.sprite, -sz / 2, -sz / 2, sz, sz);
            } else if (p.isDust) {
                ctx.fillStyle = p.color || '#C4A56E';
                ctx.globalAlpha = alpha * 0.5;
                ctx.beginPath();
                ctx.arc(0, 0, p.r, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.isGlass) {
                ctx.fillStyle = p.color || '#B0E0E6';
                ctx.fillRect(-p.r / 2, -p.r, p.r, p.r * 2);
            } else {
                ctx.fillStyle = p.color || '#888';
                ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
            }
            ctx.restore();
        }

        // Score floats
        for (const f of floats) {
            const alpha = Math.min(1, f.life / 20);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#000';
            ctx.font = 'bold 15px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(f.text, f.x + 1, f.y + 1);
            ctx.fillStyle = f.color;
            ctx.font = 'bold 14px monospace';
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;

        ctx.restore(); // camera

        // HUD (fixed position)
        drawHUD();

        // Trajectory preview
        if (state === ST_AIM && dragging) {
            drawTrajectory();
        }

        // Overlays
        if (state === ST_LOADING) drawLoadingScreen();
        if (state === ST_SPLASH) drawSplash();
        if (state === ST_RESULT) drawResult();

        ctx.restore();
    }

    function drawGround() {
        const grassSprite = getSprite('other/grass');
        const dirtSprite = getSprite('other/dirt');

        if (grassSprite) {
            // Tile grass along the ground line
            const tileW = 70;
            const tileH = 70;
            const startX = -300;
            const endX = GAME_W + 2800;
            for (let gx = startX; gx < endX; gx += tileW) {
                ctx.drawImage(grassSprite, gx, GROUND_Y - 10, tileW, tileH * 0.4);
            }
        }

        if (dirtSprite) {
            // Tile dirt below grass
            const tileW = 70;
            const tileH = 50;
            const startX = -300;
            const endX = GAME_W + 2800;
            for (let gx = startX; gx < endX; gx += tileW) {
                ctx.drawImage(dirtSprite, gx, GROUND_Y + 10, tileW, tileH);
            }
        }

        // Fallback fill for any gaps
        const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, GAME_H);
        groundGrad.addColorStop(0, '#6B8C42');
        groundGrad.addColorStop(0.15, '#5A7A38');
        groundGrad.addColorStop(1, '#3D5025');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(-300, GROUND_Y + 15, GAME_W + 2800, GAME_H - GROUND_Y + 10);

        // Ground highlight line
        ctx.strokeStyle = '#8BAF5A';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-300, GROUND_Y);
        ctx.lineTo(GAME_W + 2800, GROUND_Y);
        ctx.stroke();

        // Scatter some bushes/cacti/rocks
        const rockSprite = getSprite('other/rock');
        const bushSprite = getSprite('other/bush');
        const cactusSprite = getSprite('other/cactus');
        const decoSprites = [rockSprite, bushSprite, cactusSprite].filter(Boolean);
        if (decoSprites.length > 0) {
            // Deterministic decoration placement
            for (let i = 0; i < 12; i++) {
                const dx = (i * 197 + 80) % 2400 - 100;
                const sprite = decoSprites[i % decoSprites.length];
                if (sprite) {
                    const sz = 18 + (i % 3) * 8;
                    ctx.globalAlpha = 0.7;
                    ctx.drawImage(sprite, dx, GROUND_Y - sz + 5, sz, sz);
                    ctx.globalAlpha = 1;
                }
            }
        }
    }

    function drawSlingshot() {
        const sx = SLING_X, sy = SLING_Y;
        const baseY = GROUND_Y;

        // Use wood sprites for the slingshot fork
        const woodForkSprite = getSprite(spriteKey('wood', '019')); // tall plank

        if (woodForkSprite) {
            // Left arm — rotated wood sprite
            ctx.save();
            ctx.translate(sx - 10, sy - 10);
            ctx.rotate(-0.15);
            ctx.drawImage(woodForkSprite, -5, -25, 12, 60);
            ctx.restore();

            // Right arm
            ctx.save();
            ctx.translate(sx + 10, sy - 10);
            ctx.rotate(0.15);
            ctx.drawImage(woodForkSprite, -5, -25, 12, 60);
            ctx.restore();

            // Base
            const woodBaseSprite = getSprite(spriteKey('wood', '010'));
            if (woodBaseSprite) {
                ctx.drawImage(woodBaseSprite, sx - 8, sy + 15, 16, baseY - sy - 15);
            }
        } else {
            // Fallback canvas-drawn slingshot
            ctx.strokeStyle = '#8B5E3C';
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(sx - 15, sy - 30);
            ctx.lineTo(sx - 8, sy + 10);
            ctx.lineTo(sx - 3, baseY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx + 15, sy - 30);
            ctx.lineTo(sx + 8, sy + 10);
            ctx.lineTo(sx + 3, baseY);
            ctx.stroke();
            ctx.strokeStyle = '#6B4226';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(sx - 15, sy - 30);
            ctx.lineTo(sx - 8, sy + 10);
            ctx.lineTo(sx - 3, baseY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx + 15, sy - 30);
            ctx.lineTo(sx + 8, sy + 10);
            ctx.lineTo(sx + 3, baseY);
            ctx.stroke();
        }

        // Elastic band
        const projPos = getSlingProjectilePos();
        if (slingLoaded || dragging) {
            // Band shadow
            ctx.strokeStyle = 'rgba(100,20,10,0.4)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(sx - 15, sy - 28);
            ctx.lineTo(projPos.x, projPos.y + 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx + 15, sy - 28);
            ctx.lineTo(projPos.x, projPos.y + 2);
            ctx.stroke();

            // Main band
            ctx.strokeStyle = '#C0392B';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(sx - 15, sy - 30);
            ctx.lineTo(projPos.x, projPos.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx + 15, sy - 30);
            ctx.lineTo(projPos.x, projPos.y);
            ctx.stroke();

            // Loaded projectile
            if (projIndex < projectiles.length) {
                const type = PROJ[projectiles[projIndex]];
                ctx.fillStyle = type.color;
                ctx.beginPath();
                ctx.arc(projPos.x, projPos.y, type.r, 0, Math.PI * 2);
                ctx.fill();
                // Rim shadow
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                // Highlight
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.beginPath();
                ctx.arc(projPos.x - type.r * 0.25, projPos.y - type.r * 0.25, type.r * 0.35, 0, Math.PI * 2);
                ctx.fill();
                drawProjFace(projPos.x, projPos.y, type.r, false);
            }
        } else {
            ctx.strokeStyle = '#C0392B';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(sx - 15, sy - 30);
            ctx.lineTo(sx, sy - 25);
            ctx.lineTo(sx + 15, sy - 30);
            ctx.stroke();
        }
    }

    function drawProjFace(x, y, r, angry) {
        const s = r / 12;
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(x - 3 * s, y - 2 * s, 2.5 * s, 0, Math.PI * 2);
        ctx.arc(x + 3 * s, y - 2 * s, 2.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(x - 3 * s, y - 2 * s, 1.2 * s, 0, Math.PI * 2);
        ctx.arc(x + 3 * s, y - 2 * s, 1.2 * s, 0, Math.PI * 2);
        ctx.fill();
        if (angry) {
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 1.5 * s;
            ctx.beginPath();
            ctx.moveTo(x - 5.5 * s, y - 5 * s);
            ctx.lineTo(x - 1 * s, y - 3.5 * s);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + 5.5 * s, y - 5 * s);
            ctx.lineTo(x + 1 * s, y - 3.5 * s);
            ctx.stroke();
        }
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.2 * s;
        ctx.beginPath();
        if (angry) {
            ctx.moveTo(x - 2.5 * s, y + 3 * s);
            ctx.lineTo(x + 2.5 * s, y + 3 * s);
        } else {
            ctx.arc(x, y + 2 * s, 2 * s, 0, Math.PI);
        }
        ctx.stroke();
    }

    function drawProjectile(b) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(0, 0, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(-b.r * 0.25, -b.r * 0.25, b.r * 0.4, 0, Math.PI * 2);
        ctx.fill();

        drawProjFace(0, 0, b.r, true);
        ctx.restore();

        // Special indicator
        if (b === activeProj && !specialUsed) {
            const pt = b.projType;
            if (pt === 'splitter' || pt === 'bomber') {
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('TAP!', b.x, b.y - b.r - 6);
            }
        }
    }

    function drawBlock(b) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);

        const hw = b.w / 2, hh = b.h / 2;

        // Get sprite for this block
        const sprite = getBlockSprite(b.material, b.w, b.h);
        if (sprite) {
            // Draw sprite stretched to block dimensions
            ctx.drawImage(sprite, -hw, -hh, b.w, b.h);

            // Damage crack overlay
            if (b.crackLevel > 0) {
                ctx.globalAlpha = 0.4 + b.crackLevel * 0.15;
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1 + b.crackLevel * 0.5;
                const numCracks = b.crackLevel * 2;
                for (let i = 0; i < numCracks; i++) {
                    const cx = ((i * 13 + 7) % (b.w - 4)) - hw + 2;
                    const cy = ((i * 11 + 3) % (b.h - 4)) - hh + 2;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(cx + (i % 2 ? 8 : -8), cy + 5);
                    ctx.lineTo(cx + (i % 3 ? 4 : -4), cy + 10);
                    if (b.crackLevel >= 3) {
                        ctx.lineTo(cx + (i % 2 ? -3 : 6), cy + 15);
                    }
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }

            // Near-death flashing red tint
            if (b.hp / b.maxHp < 0.2) {
                ctx.fillStyle = 'rgba(255,0,0,0.2)';
                ctx.fillRect(-hw, -hh, b.w, b.h);
            }
        } else {
            // Fallback — canvas-drawn blocks with material colors
            const matColors = {
                wood: '#A0522D', glass: '#87CEEB', stone: '#808080',
                ice: '#E0F0FF', tnt: '#CC0000'
            };
            ctx.fillStyle = matColors[b.material] || '#888';
            ctx.fillRect(-hw, -hh, b.w, b.h);

            // Material textures
            if (b.material === 'wood') {
                ctx.strokeStyle = 'rgba(139,69,19,0.3)';
                ctx.lineWidth = 1;
                for (let i = -hh + 5; i < hh; i += 6) {
                    ctx.beginPath();
                    ctx.moveTo(-hw + 2, i);
                    ctx.lineTo(hw - 2, i + (i * 0.1 % 2));
                    ctx.stroke();
                }
            } else if (b.material === 'glass') {
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.fillRect(-hw + 2, -hh + 2, b.w * 0.4, b.h * 0.3);
            } else if (b.material === 'tnt') {
                ctx.fillStyle = '#FF6600';
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('TNT', 0, 0);
            }

            // Damage cracks (fallback)
            if (b.crackLevel > 0) {
                ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                ctx.lineWidth = 1;
                for (let i = 0; i < b.crackLevel * 2; i++) {
                    const cx = (i * 13 % b.w) - hw;
                    const cy = (i * 7 % b.h) - hh;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(cx + (i % 2 ? 8 : -8), cy + 6);
                    ctx.lineTo(cx + (i % 3 ? 5 : -5), cy + 12);
                    ctx.stroke();
                }
            }

            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 1;
            ctx.strokeRect(-hw, -hh, b.w, b.h);
        }

        ctx.restore();
    }

    function drawTarget(b) {
        ctx.save();
        ctx.translate(b.x, b.y);

        const alienSprite = getAlienSprite(b.alienIndex);
        const sz = b.r * 2.5;

        if (alienSprite) {
            // Draw alien sprite
            ctx.drawImage(alienSprite, -sz / 2, -sz / 2, sz, sz);

            // Overlay expression changes
            if (b.expression === 'scared') {
                // Draw scared eyes overlay
                ctx.fillStyle = '#FFF';
                ctx.beginPath();
                ctx.arc(-sz * 0.12, -sz * 0.08, sz * 0.1, 0, Math.PI * 2);
                ctx.arc(sz * 0.12, -sz * 0.08, sz * 0.1, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(-sz * 0.12, -sz * 0.08, sz * 0.06, 0, Math.PI * 2);
                ctx.arc(sz * 0.12, -sz * 0.08, sz * 0.06, 0, Math.PI * 2);
                ctx.fill();
                // O mouth
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(0, sz * 0.1, sz * 0.06, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Damage flash
            const dmg = 1 - b.hp / b.maxHp;
            if (dmg > 0.5) {
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = '#FF0000';
                ctx.beginPath();
                ctx.arc(0, 0, sz / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        } else {
            // Fallback — canvas-drawn target
            ctx.fillStyle = '#44BB44';
            ctx.beginPath();
            ctx.arc(0, 0, b.r, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.beginPath();
            ctx.ellipse(0, 2, b.r * 0.6, b.r * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();

            const s = b.r / 10;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(-3 * s, -2 * s, 3 * s, 0, Math.PI * 2);
            ctx.arc(3 * s, -2 * s, 3 * s, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#222';
            if (b.expression === 'scared') {
                ctx.beginPath();
                ctx.arc(-3 * s, -2 * s, 2 * s, 0, Math.PI * 2);
                ctx.arc(3 * s, -2 * s, 2 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(0, 3 * s, 2 * s, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(-3 * s, -2 * s, 1.5 * s, 0, Math.PI * 2);
                ctx.arc(3 * s, -2 * s, 1.5 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#222';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(0, 1 * s, 3 * s, 0.1, Math.PI - 0.1);
                ctx.stroke();
            }

            const dmg = 1 - b.hp / b.maxHp;
            if (dmg > 0.5) {
                ctx.strokeStyle = '#FF0000';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(-5 * s, -4 * s); ctx.lineTo(-1 * s, 0);
                ctx.moveTo(-1 * s, -4 * s); ctx.lineTo(-5 * s, 0);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(1 * s, -4 * s); ctx.lineTo(5 * s, 0);
                ctx.moveTo(5 * s, -4 * s); ctx.lineTo(1 * s, 0);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    function drawTrajectory() {
        if (projIndex >= projectiles.length) return;
        const pos = getSlingProjectilePos();
        const vx = -pullX * LAUNCH_POWER;
        const vy = -pullY * LAUNCH_POWER;

        ctx.save();
        ctx.translate(-camX, 0);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        let tx = pos.x, ty = pos.y;
        let tvx = vx, tvy = vy;
        for (let i = 0; i < 40; i++) {
            tvy += GRAVITY;
            tx += tvx;
            ty += tvy;
            tvx *= AIR_DRAG;
            tvy *= AIR_DRAG;
            if (ty > GROUND_Y) break;
            if (i % 3 === 0) {
                const dotAlpha = 1 - i / 40;
                ctx.globalAlpha = dotAlpha * 0.5;
                ctx.beginPath();
                ctx.arc(tx, ty, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawHUD() {
        const accent = TC[0] || '#EF4444';

        // Score bar
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, GAME_W, 34);
        // Subtle bottom border
        ctx.fillStyle = accent;
        ctx.fillRect(0, 33, GAME_W, 1);

        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('Score: ' + (score + levelScore), 10, 23);

        ctx.textAlign = 'center';
        const lvl = getLevels()[currentLevel];
        ctx.fillText('Level ' + (currentLevel + 1) + ': ' + lvl.name, GAME_W / 2, 23);

        ctx.textAlign = 'right';
        const remaining = projectiles.length - projIndex;
        ctx.fillText('Shots: ' + remaining + '/' + projectiles.length, GAME_W - 10, 23);

        // Projectile type indicator
        if (state === ST_AIM && projIndex < projectiles.length) {
            const pt = PROJ[projectiles[projIndex]];
            ctx.fillStyle = pt.color;
            ctx.beginPath();
            ctx.arc(GAME_W - 140, 17, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(pt.name, GAME_W - 152, 21);
        }

        // Target count with icon
        const aliveTargets = targets.filter(t => t.alive).length;
        const alienIcon = getAlienSprite(0);
        if (alienIcon) {
            ctx.drawImage(alienIcon, 8, GAME_H - 26, 18, 18);
            ctx.fillStyle = '#FFF';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('x ' + aliveTargets, 30, GAME_H - 12);
        } else {
            ctx.fillStyle = '#44BB44';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('Targets: ' + aliveTargets, 10, GAME_H - 10);
        }
    }

    function drawLoadingScreen() {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        const cy = GAME_H / 2;
        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SLINGSHOT', GAME_W / 2, cy - 40);

        ctx.fillStyle = '#FFF';
        ctx.font = '14px monospace';
        ctx.fillText('Loading sprites...', GAME_W / 2, cy + 10);

        // Progress bar
        const barW = 300, barH = 16;
        const barX = (GAME_W - barW) / 2;
        const barY = cy + 30;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(barX, barY, barW, barH);
        const pct = loadTotal > 0 ? loadProgress / loadTotal : 0;
        ctx.fillStyle = '#EF4444';
        ctx.fillRect(barX, barY, barW * pct, barH);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '11px monospace';
        ctx.fillText(Math.floor(pct * 100) + '%', GAME_W / 2, barY + barH + 16);
    }

    function drawSplash() {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        const accent = TC[0] || '#EF4444';
        const cy = GAME_H / 2;

        // Title with shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SLINGSHOT', GAME_W / 2 + 3, cy - 77);
        ctx.fillStyle = accent;
        ctx.fillText('SLINGSHOT', GAME_W / 2, cy - 80);

        ctx.fillStyle = '#FFF';
        ctx.font = '16px monospace';
        ctx.fillText('Physics Destruction', GAME_W / 2, cy - 50);

        // Draw some example alien sprites on splash
        const alienSprites = [];
        for (let i = 0; i < 3; i++) {
            const sp = getAlienSprite(i * 3);
            if (sp) alienSprites.push(sp);
        }
        if (alienSprites.length > 0) {
            for (let i = 0; i < alienSprites.length; i++) {
                const ax = GAME_W / 2 + (i - 1) * 50;
                ctx.drawImage(alienSprites[i], ax - 15, cy - 40, 30, 30);
            }
        }

        ctx.font = '13px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        const startY = alienSprites.length > 0 ? cy + 5 : cy;
        const lines = [
            'Drag the slingshot to aim & launch',
            'Destroy all alien targets to complete each level',
            'Tap while in flight for special abilities',
            '',
            'Wood = medium  |  Glass = fragile  |  Stone = tough',
            'TNT = explosive chain reactions!'
        ];
        lines.forEach((line, i) => {
            ctx.fillText(line, GAME_W / 2, startY + i * 22);
        });

        const pulse = Math.sin(Date.now() * 0.004) * 0.3 + 0.7;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = accent;
        ctx.font = 'bold 20px monospace';
        ctx.fillText('TAP TO START', GAME_W / 2, cy + 170);
        ctx.globalAlpha = 1;
    }

    function drawResult() {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        const accent = TC[0] || '#EF4444';
        const cy = GAME_H / 2;
        const aliveTargets = targets.filter(t => t.alive).length;
        const won = aliveTargets === 0;

        // Title
        ctx.fillStyle = won ? '#FFD700' : '#EF4444';
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(won ? 'LEVEL COMPLETE!' : 'TRY AGAIN', GAME_W / 2, cy - 70);

        // Stars using Kenney star sprites
        if (won) {
            const starGold = getSprite('other/starGold');
            const starSilver = getSprite('other/starSilver');
            for (let i = 0; i < 3; i++) {
                const sx = GAME_W / 2 + (i - 1) * 50 - 18;
                const filled = i < stars;
                if (filled && starGold) {
                    ctx.drawImage(starGold, sx, cy - 42, 36, 36);
                } else if (!filled && starSilver) {
                    ctx.globalAlpha = 0.35;
                    ctx.drawImage(starSilver, sx, cy - 42, 36, 36);
                    ctx.globalAlpha = 1;
                } else {
                    ctx.fillStyle = filled ? '#FFD700' : 'rgba(255,255,255,0.2)';
                    ctx.font = '40px serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(filled ? '\u2605' : '\u2606', sx + 18, cy - 14);
                }
            }
        }

        // Score
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Score: ' + levelScore, GAME_W / 2, cy + 20);
        ctx.font = '14px monospace';
        ctx.fillText('Total: ' + (score + levelScore), GAME_W / 2, cy + 45);

        // Button
        const pulse = Math.sin(Date.now() * 0.004) * 0.3 + 0.7;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = accent;
        ctx.font = 'bold 18px monospace';
        if (won && currentLevel < getLevels().length - 1) {
            ctx.fillText('TAP for Next Level', GAME_W / 2, cy + 90);
        } else if (won) {
            ctx.fillText('TAP to Finish!', GAME_W / 2, cy + 90);
        } else {
            ctx.fillText('TAP to Retry', GAME_W / 2, cy + 90);
        }
        ctx.globalAlpha = 1;
    }

    // ═══════════════════════════════════════════════════════════════
    // INPUT
    // ═══════════════════════════════════════════════════════════════
    function getCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = GAME_W / rect.width;
        const scaleY = GAME_H / rect.height;
        let cx, cy;
        if (e.touches) {
            cx = (e.touches[0].clientX - rect.left) * scaleX;
            cy = (e.touches[0].clientY - rect.top) * scaleY;
        } else {
            cx = (e.clientX - rect.left) * scaleX;
            cy = (e.clientY - rect.top) * scaleY;
        }
        return { x: cx, y: cy };
    }

    function handlePointerDown(e) {
        e.preventDefault();
        const pos = getCanvasPos(e);

        if (state === ST_SPLASH) {
            state = ST_AIM;
            loadLevel(0);
            return;
        }

        if (state === ST_RESULT) {
            const aliveTargets = targets.filter(t => t.alive).length;
            const won = aliveTargets === 0;
            if (won && currentLevel < getLevels().length - 1) {
                score += levelScore;
                loadLevel(currentLevel + 1);
            } else if (won) {
                totalScore = score + levelScore;
                if (onGameOver) onGameOver(totalScore);
            } else {
                loadLevel(currentLevel);
            }
            return;
        }

        if (state === ST_FLIGHT) {
            activateSpecial();
            return;
        }

        if (state === ST_AIM && slingLoaded) {
            const dx = pos.x - SLING_X + camX;
            const dy = pos.y - SLING_Y;
            if (Math.sqrt(dx * dx + dy * dy) < 60) {
                dragging = true;
                pullX = 0;
                pullY = 0;
            }
        }
    }

    function handlePointerMove(e) {
        e.preventDefault();
        if (!dragging) return;
        const pos = getCanvasPos(e);
        pullX = (pos.x + camX) - SLING_X;
        pullY = pos.y - SLING_Y;

        const dist = Math.sqrt(pullX * pullX + pullY * pullY);
        if (dist > MAX_PULL) {
            pullX = (pullX / dist) * MAX_PULL;
            pullY = (pullY / dist) * MAX_PULL;
        }

        if (pullX > 10) pullX = 10;

        playSound('stretch');
    }

    function handlePointerUp(e) {
        e.preventDefault();
        if (!dragging) return;
        dragging = false;

        const dist = Math.sqrt(pullX * pullX + pullY * pullY);
        if (dist > 15) {
            launchProjectile();
        }
        pullX = 0;
        pullY = 0;
    }

    function handleKeyDown(e) {
        if (e.code === 'Space' || e.code === 'Enter') {
            if (state === ST_SPLASH) {
                loadLevel(0);
                return;
            }
            if (state === ST_RESULT) {
                const aliveTargets = targets.filter(t => t.alive).length;
                const won = aliveTargets === 0;
                if (won && currentLevel < getLevels().length - 1) {
                    score += levelScore;
                    loadLevel(currentLevel + 1);
                } else if (won) {
                    totalScore = score + levelScore;
                    if (onGameOver) onGameOver(totalScore);
                } else {
                    loadLevel(currentLevel);
                }
                return;
            }
            if (state === ST_FLIGHT) {
                activateSpecial();
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // GAME LOOP
    // ═══════════════════════════════════════════════════════════════
    function loop(timestamp) {
        if (!gameActive) return;

        if (lastTime === 0) lastTime = timestamp;
        const elapsed = timestamp - lastTime;
        lastTime = timestamp;
        dt = Math.min(3, elapsed / 16.67);
        if (dt <= 0) dt = 1;

        update();
        draw();
        animFrame = requestAnimationFrame(loop);
    }

    // ═══════════════════════════════════════════════════════════════
    // CANVAS FIT
    // ═══════════════════════════════════════════════════════════════
    function fitCanvas() {
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (cw < 10 || ch < 10) return;
        const aspect = GAME_W / GAME_H;
        let drawW, drawH;
        if (cw / ch > aspect) { drawH = ch; drawW = ch * aspect; }
        else { drawW = cw; drawH = cw / aspect; }
        canvas.style.width = drawW + 'px';
        canvas.style.height = drawH + 'px';
    }

    // ═══════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════
    async function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        canvas.width = GAME_W;
        canvas.height = GAME_H;
        player = activePlayer || null;

        // Load theme
        const themeId = activePlayer?.theme || 'retro';
        theme = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        TC = theme ? theme.colors : ['#EF4444', '#3B82F6', '#22C55E', '#FBBF24', '#A78BFA', '#F43F5E'];
        TBG = theme ? theme.bgGradient : ['#1a1a3e', '#2d1b69'];

        onGameOver = gameOverCallback || null;
        gameActive = true;

        // Reset
        state = ST_LOADING;
        score = 0;
        totalScore = 0;
        currentLevel = 0;
        bodies = [];
        particles = [];
        floats = [];
        targets = [];
        lastTime = 0;
        ALIEN_POOL.length = 0;

        initScenery();
        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        // Bind input
        if (!inputBound) {
            canvas.addEventListener('mousedown', handlePointerDown);
            canvas.addEventListener('mousemove', handlePointerMove);
            canvas.addEventListener('mouseup', handlePointerUp);
            canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
            canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
            canvas.addEventListener('touchend', handlePointerUp, { passive: false });
            document.addEventListener('keydown', handleKeyDown);
            window.addEventListener('resize', fitCanvas);
            inputBound = true;
        }

        // Start loop immediately (loading screen will show)
        animFrame = requestAnimationFrame(loop);

        // Preload sprites
        if (!spritesLoaded) {
            await preloadAllSprites();
        }

        // Sprites loaded — move to splash
        state = ST_SPLASH;
    }

    function destroy() {
        gameActive = false;
        if (animFrame) {
            cancelAnimationFrame(animFrame);
            animFrame = null;
        }
        if (canvas) {
            canvas.removeEventListener('mousedown', handlePointerDown);
            canvas.removeEventListener('mousemove', handlePointerMove);
            canvas.removeEventListener('mouseup', handlePointerUp);
            canvas.removeEventListener('touchstart', handlePointerDown);
            canvas.removeEventListener('touchmove', handlePointerMove);
            canvas.removeEventListener('touchend', handlePointerUp);
        }
        document.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('resize', fitCanvas);
        inputBound = false;
        if (audioCtx) {
            try { audioCtx.close(); } catch(e) {}
            audioCtx = null;
        }
    }

    return {
        init,
        destroy,
        getScore() { return score + levelScore; },
        getLevel() { return currentLevel + 1; },
        isActive() { return gameActive; }
    };
})();
