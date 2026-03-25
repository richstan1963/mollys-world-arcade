/* PrincessRun — Side-scrolling princess platformer for Your World Arcade */
window.PrincessRun = (() => {

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
    // ── Sprite Atlas (Kenney Platform CC0) ──
    const SPRITE_BASE = '/img/game-assets/kenney-platform';
    const sprites = {};
    let spritesLoaded = 0, spritesTotal = 0, allSpritesReady = false;

    const SPRITE_MANIFEST = {
        // Player (Pink alien = princess)
        playerStand:  `${SPRITE_BASE}/players/Pink/alienPink_stand.png`,
        playerWalk1:  `${SPRITE_BASE}/players/Pink/alienPink_walk1.png`,
        playerWalk2:  `${SPRITE_BASE}/players/Pink/alienPink_walk2.png`,
        playerJump:   `${SPRITE_BASE}/players/Pink/alienPink_jump.png`,
        playerDuck:   `${SPRITE_BASE}/players/Pink/alienPink_duck.png`,
        playerHit:    `${SPRITE_BASE}/players/Pink/alienPink_hit.png`,
        playerFront:  `${SPRITE_BASE}/players/Pink/alienPink_front.png`,
        // Ground tiles
        grassLeft:    `${SPRITE_BASE}/ground/Grass/grassLeft.png`,
        grassMid:     `${SPRITE_BASE}/ground/Grass/grassMid.png`,
        grassRight:   `${SPRITE_BASE}/ground/Grass/grassRight.png`,
        grassCenter:  `${SPRITE_BASE}/ground/Grass/grassCenter.png`,
        // Platform tiles
        grassHalfLeft:  `${SPRITE_BASE}/ground/Grass/grassHalf_left.png`,
        grassHalfMid:   `${SPRITE_BASE}/ground/Grass/grassHalf_mid.png`,
        grassHalfRight: `${SPRITE_BASE}/ground/Grass/grassHalf_right.png`,
        stoneHalfLeft:  `${SPRITE_BASE}/ground/Stone/stoneHalf_left.png`,
        stoneHalfMid:   `${SPRITE_BASE}/ground/Stone/stoneHalf_mid.png`,
        stoneHalfRight: `${SPRITE_BASE}/ground/Stone/stoneHalf_right.png`,
        // Items
        coinGold:     `${SPRITE_BASE}/items/coinGold.png`,
        coinBronze:   `${SPRITE_BASE}/items/coinBronze.png`,
        gemBlue:      `${SPRITE_BASE}/items/gemBlue.png`,
        gemGreen:     `${SPRITE_BASE}/items/gemGreen.png`,
        gemRed:       `${SPRITE_BASE}/items/gemRed.png`,
        gemYellow:    `${SPRITE_BASE}/items/gemYellow.png`,
        star:         `${SPRITE_BASE}/items/star.png`,
        keyBlue:      `${SPRITE_BASE}/items/keyBlue.png`,
        keyRed:       `${SPRITE_BASE}/items/keyRed.png`,
        // HUD
        hudHeart:     `${SPRITE_BASE}/hud/hudHeart_full.png`,
        hudHeartEmpty:`${SPRITE_BASE}/hud/hudHeart_empty.png`,
        hudCoin:      `${SPRITE_BASE}/hud/hudCoin.png`,
        // Enemies
        slimeGreen:   `${SPRITE_BASE}/enemies/slimeGreen.png`,
        slimeGreenMove:`${SPRITE_BASE}/enemies/slimeGreen_move.png`,
        slimePurple:  `${SPRITE_BASE}/enemies/slimePurple.png`,
        slimePurpleMove:`${SPRITE_BASE}/enemies/slimePurple_move.png`,
        fly:          `${SPRITE_BASE}/enemies/fly.png`,
        flyMove:      `${SPRITE_BASE}/enemies/fly_move.png`,
        bee:          `${SPRITE_BASE}/enemies/bee.png`,
        beeMove:      `${SPRITE_BASE}/enemies/bee_move.png`,
        saw:          `${SPRITE_BASE}/enemies/saw.png`,
        sawMove:      `${SPRITE_BASE}/enemies/saw_move.png`,
        snail:        `${SPRITE_BASE}/enemies/snail.png`,
        snailShell:   `${SPRITE_BASE}/enemies/snail_shell.png`,
        // Tiles / environment
        spikes:       `${SPRITE_BASE}/tiles/spikes.png`,
        cactus:       `${SPRITE_BASE}/tiles/cactus.png`,
        bush:         `${SPRITE_BASE}/tiles/bush.png`,
        mushroomRed:  `${SPRITE_BASE}/tiles/mushroomRed.png`,
        mushroomBrown:`${SPRITE_BASE}/tiles/mushroomBrown.png`,
        boxCoin:      `${SPRITE_BASE}/tiles/boxCoin.png`,
        boxItem:      `${SPRITE_BASE}/tiles/boxItem.png`,
        spring:       `${SPRITE_BASE}/tiles/spring.png`,
        fence:        `${SPRITE_BASE}/tiles/fence.png`,
        sign:         `${SPRITE_BASE}/tiles/sign.png`,
        plantPurple:  `${SPRITE_BASE}/tiles/plantPurple.png`,
        rock:         `${SPRITE_BASE}/tiles/rock.png`,
        // Backgrounds
        bgGrass:      `${SPRITE_BASE}/backgrounds/blue_grass.png`,
        bgLand:       `${SPRITE_BASE}/backgrounds/colored_land.png`,
    };

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

    // Helper to safely draw a sprite with fallback
    function drawSprite(key, x, y, w, h, flipX) {
        const s = sprites[key];
        if (s) {
            ctx.save();
            if (flipX) {
                ctx.translate(x + w, y);
                ctx.scale(-1, 1);
                ctx.drawImage(s, 0, 0, w, h);
            } else {
                ctx.drawImage(s, x, y, w, h);
            }
            ctx.restore();
            return true;
        }
        return false;
    }

    // ── Design Constants ──
    const GAME_W = 640, GAME_H = 360;
    const GROUND_Y = 310, GROUND_H = 50;
    const GRAVITY = 0.55;
    const JUMP_VEL = -10.2;
    const DOUBLE_JUMP_VEL = -8.8;
    const BASE_SPEED = 3.0;
    const MAX_SPEED = 7.5;
    const SPEED_RAMP = 0.00015;
    const PRINCESS_W = 28, PRINCESS_H = 36;
    const PRINCESS_X = 90;
    const SLIDE_H = 18;
    const SLIDE_DURATION = 30;
    const GEM_R = 8;
    const HEART_R = 7;
    const CAGE_W = 24, CAGE_H = 28;
    const POWERUP_R = 12;
    const SPARKLE_SPEED = 8;
    const BOSS_W = 48, BOSS_H = 56;
    const BOSS_HP = 8;
    const ENV_LENGTH = 3200; // ~500m per environment
    const PARTICLE_MAX = 80;
    const TRAIL_LEN = 8;

    // Environment themes
    const ENVS = [
        { name: 'Enchanted Garden', sky1: '#FFB6C1', sky2: '#FFF0F5', ground: '#4CAF50', groundDark: '#388E3C', accent: '#FF69B4', platColor: '#66BB6A', platStroke: '#43A047' },
        { name: 'Crystal Cave',    sky1: '#1A1A3E', sky2: '#2D1B69', ground: '#4A0E78', groundDark: '#380A5C', accent: '#E040FB', platColor: '#7E57C2', platStroke: '#5E35B1' },
        { name: 'Cloud Kingdom',   sky1: '#87CEEB', sky2: '#E0F7FA', ground: '#ECEFF1', groundDark: '#B0BEC5', accent: '#FFD700', platColor: '#FFFFFF', platStroke: '#B0BEC5' },
        { name: 'Starlight Palace',sky1: '#0D1B2A', sky2: '#1B2838', ground: '#2C3E50', groundDark: '#1A252F', accent: '#FFD700', platColor: '#34495E', platStroke: '#FFD700' }
    ];

    // Animals for rescue
    const ANIMALS = ['bunny', 'kitten', 'puppy', 'bird', 'fawn', 'fox'];

    // States
    const ST_LOADING = -1, ST_TITLE = 0, ST_PLAY = 1, ST_DEAD = 2, ST_BOSS = 3;

    // Game state
    let canvas, ctx, W, H, SCALE, animFrame, gameActive = false;
    let activePlayer, gameOverCB, princessColor, princessColorLight;
    let state, frameCount, lastTime;
    let distance, score, scrollSpeed, bestScore;
    let princess; // { y, vy, onGround, jumping, doubleJumped, sliding, slideTimer, health, maxHealth, invincible, invTimer }
    let gems, hearts, cages, obstacles, platforms, powerups, sparkles;
    let particles, ambientParticles;
    let followerAnimals; // rescued animals following princess
    let combo, comboTimer;
    let envIndex, envProgress, envTransition;
    let boss, bossActive;
    let activePower; // { type, timer }
    let screenShake, shakeTimer;
    let keys = {};
    let touchJump = false, touchSlide = false;
    let runFrame, hairWave;
    let vignetteGrad;

    // Audio
    let audioCtx;
    function getAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }
    function playTone(freq, dur, type = 'sine', vol = 0.1, slide = 0) {
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
    function playNoise(dur, vol = 0.05) {
        try {
            const a = getAudio(), buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * vol;
            const src = a.createBufferSource(), g = a.createGain();
            src.buffer = buf; g.gain.setValueAtTime(vol, a.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
            src.connect(g); g.connect(a.destination);
            src.start(); src.stop(a.currentTime + dur);
        } catch {}
    }
    function sfxJump() { playTone(520, 0.12, 'sine', 0.1, 780); }
    function sfxDoubleJump() { playTone(660, 0.1, 'sine', 0.12, 1100); setTimeout(() => playTone(880, 0.08, 'sine', 0.1), 60); }
    function sfxGem() { playTone(1200, 0.06, 'sine', 0.09); setTimeout(() => playTone(1500, 0.08, 'sine', 0.08), 40); }
    function sfxHeart() { playTone(800, 0.15, 'sine', 0.1, 1200); }
    function sfxRescue() { playTone(660, 0.1, 'sine', 0.1); setTimeout(() => playTone(880, 0.1, 'sine', 0.1), 80); setTimeout(() => playTone(1100, 0.15, 'sine', 0.12), 160); }
    function sfxPowerUp() { playTone(440, 0.08, 'triangle', 0.1); setTimeout(() => playTone(660, 0.08, 'triangle', 0.1), 60); setTimeout(() => playTone(880, 0.08, 'triangle', 0.1), 120); setTimeout(() => playTone(1100, 0.12, 'triangle', 0.12), 180); }
    function sfxHit() { playTone(200, 0.25, 'sawtooth', 0.12, 80); playNoise(0.15, 0.08); }
    function sfxBossDef() { playTone(300, 0.15, 'sine', 0.1, 600); setTimeout(() => playTone(500, 0.15, 'sine', 0.1, 800), 100); setTimeout(() => playTone(700, 0.2, 'sine', 0.12, 1200), 200); }
    function sfxSlide() { playNoise(0.12, 0.04); playTone(250, 0.1, 'triangle', 0.05, 150); }
    function sfxSparkle() { playTone(1400, 0.06, 'sine', 0.06, 1800); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const HAS_TOUCH = ('ontouchstart' in window);

    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }
    function rgbStr(r, g, b, a) { return a !== undefined ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`; }

    function env() { return ENVS[envIndex % ENVS.length]; }
    function nextEnv() { return ENVS[(envIndex + 1) % ENVS.length]; }
    function isBossTime() { return (envIndex + 1) % 4 === 0; }

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
        vignetteGrad = null;
    }

    // ── Particles ──
    function spawnParticle(x, y, color, vx, vy, life, size, type) {
        if (particles.length > PARTICLE_MAX) return;
        particles.push({ x, y, vx: vx || rng(-1, 1), vy: vy || rng(-2, 0), life, maxLife: life, size: size || 3, color, type: type || 'circle', alpha: 1 });
    }
    function spawnSparkles(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const angle = rng(0, Math.PI * 2);
            const speed = rng(1, 3);
            spawnParticle(x, y, color || '#FFD700', Math.cos(angle) * speed, Math.sin(angle) * speed, rng(15, 30), rng(2, 5), 'star');
        }
    }
    function spawnHeartParticles(x, y, count) {
        for (let i = 0; i < count; i++) {
            spawnParticle(x + rng(-10, 10), y + rng(-10, 0), '#FF69B4', rng(-0.5, 0.5), rng(-2, -0.5), rng(20, 40), rng(4, 7), 'heart');
        }
    }
    function spawnGemBurst(x, y) {
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            spawnParticle(x, y, pick(['#FF69B4', '#FF1493', '#FFB6C1', '#FFF']), Math.cos(angle) * 2, Math.sin(angle) * 2, 20, rng(2, 4), 'circle');
        }
    }

    // ── Ambient Particles ──
    function initAmbient() {
        ambientParticles = [];
        for (let i = 0; i < 20; i++) {
            ambientParticles.push({
                x: rng(0, GAME_W), y: rng(0, GROUND_Y),
                size: rng(1, 3), speed: rng(0.2, 0.8),
                alpha: rng(0.2, 0.6), twinkle: rng(0, Math.PI * 2)
            });
        }
    }

    // ── Parallax Backgrounds ──
    let bgLayers;
    function initBgLayers() {
        bgLayers = [
            { elements: [], speed: 0.15 }, // far mountains/clouds
            { elements: [], speed: 0.4 },  // mid trees/crystals
            { elements: [], speed: 0.7 }   // near bushes/rocks
        ];
        for (let l = 0; l < 3; l++) {
            for (let i = 0; i < 8; i++) {
                bgLayers[l].elements.push({ x: i * 100 + rng(-20, 20), h: rng(20, 60 - l * 12), w: rng(30, 70), type: Math.floor(rng(0, 3)) });
            }
        }
    }

    // ── Platform / Obstacle Spawning ──
    let spawnX;
    function resetSpawning() {
        gems = []; hearts = []; cages = []; obstacles = []; platforms = []; powerups = []; sparkles = [];
        followerAnimals = [];
        spawnX = GAME_W + 50;
    }

    function spawnContent() {
        const ahead = PRINCESS_X + GAME_W + 100;
        while (spawnX < distance + ahead) {
            const r = Math.random();
            const diff = Math.min(distance / 5000, 1); // difficulty 0-1

            // Ground obstacle
            if (r < 0.25) {
                const type = Math.random() < 0.5 ? 'thorn' : 'shadow';
                const h = type === 'thorn' ? rng(20, 30 + diff * 15) : rng(24, 34);
                const w = type === 'thorn' ? rng(16, 24) : rng(22, 30);
                obstacles.push({ x: spawnX, y: GROUND_Y - h, w, h, type });
                // Gems above obstacle
                if (Math.random() < 0.6) {
                    for (let g = 0; g < 3; g++) gems.push({ x: spawnX + g * 18 - 18, y: GROUND_Y - h - 30 - g * 12, collected: false });
                }
                spawnX += rng(80, 160 - diff * 40);
            }
            // Floating platform with goodies
            else if (r < 0.45) {
                const py = rng(GROUND_Y - 120, GROUND_Y - 60);
                const pw = rng(50, 90);
                platforms.push({ x: spawnX, y: py, w: pw });
                // Gems on platform
                const gc = Math.floor(rng(2, 5));
                for (let g = 0; g < gc; g++) gems.push({ x: spawnX + 10 + g * ((pw - 20) / gc), y: py - 14, collected: false });
                // Occasional heart on platform
                if (Math.random() < 0.15) hearts.push({ x: spawnX + pw / 2, y: py - 18, collected: false });
                spawnX += rng(100, 180 - diff * 30);
            }
            // Overhead obstacle (slide under)
            else if (r < 0.55) {
                obstacles.push({ x: spawnX, y: GROUND_Y - 38, w: rng(40, 70), h: 22, type: 'overhead' });
                // Gems after overhead
                for (let g = 0; g < 2; g++) gems.push({ x: spawnX + 60 + g * 20, y: GROUND_Y - 10, collected: false });
                spawnX += rng(100, 160);
            }
            // Gem run (arcing pattern)
            else if (r < 0.72) {
                const count = Math.floor(rng(5, 10));
                for (let g = 0; g < count; g++) {
                    const arc = Math.sin((g / count) * Math.PI) * 50;
                    gems.push({ x: spawnX + g * 22, y: GROUND_Y - 16 - arc, collected: false });
                }
                spawnX += count * 22 + rng(40, 80);
            }
            // Animal cage
            else if (r < 0.82) {
                cages.push({ x: spawnX, y: GROUND_Y - CAGE_H - 4, animal: pick(ANIMALS), freed: false, freeing: 0 });
                spawnX += rng(120, 180);
            }
            // Power-up
            else if (r < 0.88) {
                const types = ['wand', 'shield', 'magnet', 'wings'];
                powerups.push({ x: spawnX, y: rng(GROUND_Y - 100, GROUND_Y - 50), type: pick(types), collected: false, bob: rng(0, Math.PI * 2) });
                spawnX += rng(150, 220);
            }
            // Heart
            else if (r < 0.92) {
                hearts.push({ x: spawnX, y: GROUND_Y - rng(20, 60), collected: false });
                spawnX += rng(100, 160);
            }
            // Gap (just space)
            else {
                spawnX += rng(60, 120);
            }
        }
    }

    // ── Boss Logic ──
    function spawnBoss() {
        bossActive = true;
        boss = {
            x: GAME_W - 80, y: GROUND_Y - BOSS_H - 20,
            hp: BOSS_HP, maxHp: BOSS_HP,
            phase: 0, timer: 0,
            curses: [], flashTimer: 0, defeated: false,
            bobOffset: 0
        };
    }

    function updateBoss() {
        if (!boss || boss.defeated) return;
        boss.timer++;
        boss.bobOffset = Math.sin(boss.timer * 0.05) * 8;

        // Spawn curses
        if (boss.timer % (50 - Math.floor((1 - boss.hp / boss.maxHp) * 20)) === 0) {
            const cy = rng(GROUND_Y - 140, GROUND_Y - 30);
            boss.curses.push({ x: boss.x, y: cy, vx: -3 - rng(0, 2), size: rng(10, 16) });
        }

        // Move curses
        for (let i = boss.curses.length - 1; i >= 0; i--) {
            boss.curses[i].x += boss.curses[i].vx;
            if (boss.curses[i].x < -20) boss.curses.splice(i, 1);
        }

        // Check sparkle hits on boss
        for (let i = sparkles.length - 1; i >= 0; i--) {
            const s = sparkles[i];
            if (s.x > boss.x - 20 && s.x < boss.x + BOSS_W && s.y > boss.y + boss.bobOffset - 10 && s.y < boss.y + boss.bobOffset + BOSS_H + 10) {
                boss.hp--;
                boss.flashTimer = 8;
                sparkles.splice(i, 1);
                spawnSparkles(boss.x + BOSS_W / 2, boss.y + boss.bobOffset + BOSS_H / 2, 10, '#FF69B4');
                if (boss.hp <= 0) {
                    boss.defeated = true;
                    bossActive = false;
                    score += 2000;
                    sfxBossDef();
                    spawnSparkles(boss.x + BOSS_W / 2, boss.y + BOSS_H / 2, 30, '#FFD700');
                    spawnHeartParticles(boss.x + BOSS_W / 2, boss.y + BOSS_H / 2, 15);
                    // Advance env after boss
                    envIndex++;
                    envProgress = 0;
                }
                break;
            }
        }

        // Curse collision with princess
        const ph = princess.sliding ? SLIDE_H : PRINCESS_H;
        const py = princess.sliding ? GROUND_Y - SLIDE_H : princess.y;
        for (let i = boss.curses.length - 1; i >= 0; i--) {
            const c = boss.curses[i];
            if (c.x < PRINCESS_X + PRINCESS_W / 2 + c.size && c.x > PRINCESS_X - PRINCESS_W / 2 - c.size &&
                c.y < py + ph + c.size && c.y > py - c.size) {
                takeDamage();
                boss.curses.splice(i, 1);
                break;
            }
        }

        if (boss.flashTimer > 0) boss.flashTimer--;
    }

    // ── Princess Logic ──
    function doJump() {
        if (princess.sliding) return;
        if (activePower && activePower.type === 'wings') {
            princess.vy = JUMP_VEL * 0.7;
            sfxJump();
            return;
        }
        if (princess.onGround) {
            princess.vy = JUMP_VEL;
            princess.onGround = false;
            princess.jumping = true;
            princess.doubleJumped = false;
            sfxJump();
        } else if (!princess.doubleJumped) {
            princess.vy = DOUBLE_JUMP_VEL;
            princess.doubleJumped = true;
            sfxDoubleJump();
            spawnSparkles(PRINCESS_X, princess.y + PRINCESS_H, 5, princessColor);
        }
    }

    function doSlide() {
        if (!princess.onGround || princess.sliding) return;
        princess.sliding = true;
        princess.slideTimer = SLIDE_DURATION;
        sfxSlide();
    }

    function shootSparkle() {
        if (!activePower || activePower.type !== 'wand') return;
        sparkles.push({ x: PRINCESS_X + PRINCESS_W, y: princess.y + PRINCESS_H / 2, vx: SPARKLE_SPEED, size: 5, life: 60 });
        sfxSparkle();
    }

    function takeDamage() {
        if (princess.invincible) return;
        if (activePower && activePower.type === 'shield') {
            activePower = null;
            spawnSparkles(PRINCESS_X, princess.y + PRINCESS_H / 2, 12, '#4FC3F7');
            return;
        }
        princess.health--;
        princess.invincible = true;
        princess.invTimer = 60;
        sfxHit();
        screenShake = 6; shakeTimer = 10;
        if (princess.health <= 0) {
            die();
        }
    }

    function die() {
        state = ST_DEAD;
        spawnSparkles(PRINCESS_X, princess.y + PRINCESS_H / 2, 20, princessColor);
        if (score > bestScore) {
            bestScore = score;
            try { localStorage.setItem('ywa_princessrun_best', bestScore); } catch(e) {}
        }
        if (gameOverCB) {
            setTimeout(() => gameOverCB({ score, distance: Math.floor(distance / 6.4) }), 1500);
        }
    }

    function updatePrincess() {
        // Gravity
        if (activePower && activePower.type === 'wings') {
            princess.vy += GRAVITY * 0.3;
        } else {
            princess.vy += GRAVITY;
        }
        princess.vy = clamp(princess.vy, -12, 12);
        princess.y += princess.vy;

        // Ground collision
        if (princess.y + PRINCESS_H >= GROUND_Y) {
            princess.y = GROUND_Y - PRINCESS_H;
            princess.vy = 0;
            princess.onGround = true;
            princess.jumping = false;
        }

        // Platform collision
        princess.onGround = princess.y + PRINCESS_H >= GROUND_Y;
        if (!princess.onGround || princess.vy > 0) {
            for (const p of platforms) {
                const px = p.x - distance;
                if (princess.vy >= 0 && PRINCESS_X + PRINCESS_W / 2 > px && PRINCESS_X - PRINCESS_W / 2 < px + p.w) {
                    const platTop = p.y;
                    if (princess.y + PRINCESS_H >= platTop && princess.y + PRINCESS_H <= platTop + 12) {
                        princess.y = platTop - PRINCESS_H;
                        princess.vy = 0;
                        princess.onGround = true;
                        princess.jumping = false;
                    }
                }
            }
        }

        // Ceiling
        if (princess.y < 0) { princess.y = 0; princess.vy = 0; }

        // Slide
        if (princess.sliding) {
            princess.slideTimer--;
            if (princess.slideTimer <= 0) princess.sliding = false;
        }

        // Invincibility
        if (princess.invincible) {
            princess.invTimer--;
            if (princess.invTimer <= 0) princess.invincible = false;
        }

        // Power-up timer
        if (activePower) {
            activePower.timer--;
            if (activePower.type === 'wand' && frameCount % 12 === 0) shootSparkle();
            if (activePower.timer <= 0) activePower = null;
        }

        // Run animation
        runFrame += 0.2;
        hairWave += 0.15;
    }

    // ── Collision & Collection ──
    function updateCollections() {
        const px = PRINCESS_X, py = princess.y;
        const ph = princess.sliding ? SLIDE_H : PRINCESS_H;
        const pcy = princess.sliding ? GROUND_Y - SLIDE_H / 2 : py + PRINCESS_H / 2;
        const magnetRange = (activePower && activePower.type === 'magnet') ? 100 : 0;

        // Gems
        for (const g of gems) {
            if (g.collected) continue;
            const gx = g.x - distance;
            // Magnet attraction
            if (magnetRange > 0) {
                const dx = gx - px, dy = g.y - pcy;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < magnetRange && d > 1) {
                    g.x -= (dx / d) * 4;
                    g.y -= (dy / d) * 4;
                }
            }
            if (Math.abs(gx - px) < PRINCESS_W / 2 + GEM_R && Math.abs(g.y - pcy) < ph / 2 + GEM_R) {
                g.collected = true;
                score += 10;
                combo++;
                comboTimer = 60;
                sfxGem();
                spawnGemBurst(gx, g.y);
            }
        }

        // Hearts
        for (const h of hearts) {
            if (h.collected) continue;
            const hx = h.x - distance;
            if (Math.abs(hx - px) < PRINCESS_W / 2 + HEART_R && Math.abs(h.y - pcy) < ph / 2 + HEART_R) {
                h.collected = true;
                if (princess.health < princess.maxHealth) princess.health++;
                sfxHeart();
                spawnHeartParticles(hx, h.y, 6);
            }
        }

        // Cages
        for (const c of cages) {
            if (c.freed) continue;
            const cx = c.x - distance;
            if (Math.abs(cx - px) < PRINCESS_W / 2 + CAGE_W / 2 + 4 && Math.abs(c.y - pcy) < ph / 2 + CAGE_H / 2) {
                c.freed = true;
                score += 200;
                sfxRescue();
                spawnHeartParticles(cx + CAGE_W / 2, c.y, 10);
                spawnSparkles(cx + CAGE_W / 2, c.y + CAGE_H / 2, 8, '#FFD700');
                followerAnimals.push({ animal: c.animal, x: px - 30 - followerAnimals.length * 22, y: GROUND_Y - 14, timer: 180, bob: 0 });
            }
        }

        // Power-ups
        for (const p of powerups) {
            if (p.collected) continue;
            const ppx = p.x - distance;
            if (Math.abs(ppx - px) < PRINCESS_W / 2 + POWERUP_R && Math.abs(p.y - pcy) < ph / 2 + POWERUP_R) {
                p.collected = true;
                const dur = p.type === 'wings' ? 240 : p.type === 'wand' ? 300 : p.type === 'magnet' ? 360 : 300;
                activePower = { type: p.type, timer: dur };
                sfxPowerUp();
                spawnSparkles(ppx, p.y, 12, '#FFD700');
                screenShake = 3; shakeTimer = 5;
            }
        }

        // Obstacle collision
        for (const o of obstacles) {
            const ox = o.x - distance;
            const oy = o.y;
            if (o.type === 'overhead') {
                // Only hits if NOT sliding
                if (!princess.sliding && px + PRINCESS_W / 2 > ox && px - PRINCESS_W / 2 < ox + o.w && py < oy + o.h && py + PRINCESS_H > oy) {
                    takeDamage();
                    o.x = -999; // remove
                }
            } else {
                // Ground obstacle
                if (px + PRINCESS_W / 2 - 4 > ox && px - PRINCESS_W / 2 + 4 < ox + o.w) {
                    const ppyb = princess.sliding ? GROUND_Y : py + PRINCESS_H;
                    const ppyt = princess.sliding ? GROUND_Y - SLIDE_H : py;
                    if (ppyb > oy && ppyt < oy + o.h) {
                        takeDamage();
                        o.x = -999;
                    }
                }
            }
        }

        // Sparkle hits on obstacles
        for (let i = sparkles.length - 1; i >= 0; i--) {
            const s = sparkles[i];
            for (let j = obstacles.length - 1; j >= 0; j--) {
                const o = obstacles[j];
                const ox = o.x - distance;
                if (s.x > ox && s.x < ox + o.w && s.y > o.y && s.y < o.y + o.h) {
                    sparkles.splice(i, 1);
                    obstacles.splice(j, 1);
                    score += 50;
                    spawnSparkles(ox + o.w / 2, o.y + o.h / 2, 8, '#E040FB');
                    break;
                }
            }
        }

        // Combo decay
        if (comboTimer > 0) comboTimer--;
        else combo = 0;
    }

    // ── Update Sparkles ──
    function updateSparkles() {
        for (let i = sparkles.length - 1; i >= 0; i--) {
            sparkles[i].x += sparkles[i].vx;
            sparkles[i].life--;
            if (sparkles[i].life <= 0 || sparkles[i].x > GAME_W + 20) sparkles.splice(i, 1);
        }
    }

    // ── Update Follower Animals ──
    function updateFollowers() {
        for (let i = followerAnimals.length - 1; i >= 0; i--) {
            const a = followerAnimals[i];
            a.timer--;
            a.bob += 0.12;
            // Follow princess with delay
            const targetX = PRINCESS_X - 25 - i * 20;
            a.x = lerp(a.x, targetX, 0.08);
            a.y = GROUND_Y - 14 + Math.sin(a.bob) * 3;
            if (a.timer <= 0) {
                // Float away
                a.y -= 1;
                if (a.y < -20) followerAnimals.splice(i, 1);
            }
        }
    }

    // ── Drawing ──

    function drawSky(e, blendEnv, blendT) {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        if (blendT > 0) {
            grad.addColorStop(0, lerpColor(e.sky1, blendEnv.sky1, blendT));
            grad.addColorStop(1, lerpColor(e.sky2, blendEnv.sky2, blendT));
        } else {
            grad.addColorStop(0, e.sky1);
            grad.addColorStop(1, e.sky2);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    function lerpColor(c1, c2, t) {
        const r1 = hexToRgb(c1), r2 = hexToRgb(c2);
        return `rgb(${Math.round(lerp(r1.r, r2.r, t))},${Math.round(lerp(r1.g, r2.g, t))},${Math.round(lerp(r1.b, r2.b, t))})`;
    }

    function drawParallax(e) {
        if (!bgLayers) return;
        const alphas = [0.15, 0.25, 0.4];
        const yOffsets = [gs(GROUND_Y - 80), gs(GROUND_Y - 45), gs(GROUND_Y - 15)];
        for (let l = 0; l < 3; l++) {
            ctx.fillStyle = e.accent;
            ctx.globalAlpha = alphas[l];
            const layer = bgLayers[l];
            const off = (distance * layer.speed) % 800;
            for (const el of layer.elements) {
                const x = gs(el.x - off + (el.x < off - 100 ? 800 : 0));
                const y = yOffsets[l];
                const w = gs(el.w), h = gs(el.h);
                // Rounded shapes for charm
                ctx.beginPath();
                if (el.type === 0) {
                    // Hill
                    ctx.ellipse(x + w / 2, y + h, w / 2, h, 0, Math.PI, 0);
                } else if (el.type === 1) {
                    // Triangle tree
                    ctx.moveTo(x, y + h); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w, y + h);
                } else {
                    // Round bush
                    ctx.arc(x + w / 2, y + h - w / 4, w / 3, 0, Math.PI * 2);
                }
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
    }

    function drawGround(e) {
        const groundTop = gs(GROUND_Y);
        const tileH = gs(GROUND_H);
        const tileW = tileH;
        // Try sprite ground tiles
        if (sprites['grassMid']) {
            const off = (distance * SCALE) % tileW;
            for (let tx = -off - tileW; tx < W + tileW; tx += tileW) {
                drawSprite('grassMid', tx, groundTop, tileW, tileH);
            }
            // Fill below with dirt
            if (sprites['grassCenter']) {
                for (let tx = -off - tileW; tx < W + tileW; tx += tileW) {
                    drawSprite('grassCenter', tx, groundTop + tileH, tileW, tileH);
                }
            }
        } else {
            // Canvas fallback
            ctx.fillStyle = e.ground;
            ctx.fillRect(0, groundTop, W, H - groundTop);
            ctx.fillStyle = e.groundDark;
            ctx.fillRect(0, groundTop, W, gs(3));
            const off = (distance * 1.0) % 40;
            for (let x = -off; x < GAME_W + 40; x += 20) {
                ctx.fillRect(gs(x), groundTop - gs(2), gs(2), gs(4));
                ctx.fillRect(gs(x + 8), groundTop - gs(3), gs(2), gs(5));
            }
        }
    }

    function drawPlatforms(e) {
        for (const p of platforms) {
            const px = gs(p.x - distance), py = gs(p.y), pw = gs(p.w), ph = gs(14);
            if (px + pw < 0 || px > W) continue;
            // Try sprite-based platform tiles
            const tileW = ph; // square tiles
            const useStone = envIndex % 2 === 1;
            const leftKey = useStone ? 'stoneHalfLeft' : 'grassHalfLeft';
            const midKey = useStone ? 'stoneHalfMid' : 'grassHalfMid';
            const rightKey = useStone ? 'stoneHalfRight' : 'grassHalfRight';
            let drawn = false;
            if (sprites[midKey]) {
                drawn = true;
                drawSprite(leftKey, px, py, tileW, ph);
                for (let tx = tileW; tx < pw - tileW; tx += tileW) {
                    drawSprite(midKey, px + tx, py, tileW, ph);
                }
                drawSprite(rightKey, px + pw - tileW, py, tileW, ph);
            }
            if (!drawn) {
                ctx.fillStyle = e.platColor;
                ctx.strokeStyle = e.platStroke;
                ctx.lineWidth = gs(2);
                ctx.beginPath();
                ctx.roundRect(px, py, pw, gs(10), gs(5));
                ctx.fill();
                ctx.stroke();
            }
        }
    }

    function drawGems() {
        const gemSprites = ['gemRed', 'gemBlue', 'gemGreen', 'gemYellow'];
        for (const g of gems) {
            if (g.collected) continue;
            const gsx = gs(g.x - distance), gsy = gs(g.y);
            if (gsx < -20 || gsx > W + 20) continue;
            const bob = Math.sin(frameCount * 0.08 + g.x * 0.1) * gs(2);
            const sz = gs(GEM_R * 2);
            const sprKey = gemSprites[Math.abs(Math.floor(g.x * 0.1)) % gemSprites.length];
            if (!drawSprite(sprKey, gsx - sz / 2, gsy + bob - sz / 2, sz, sz)) {
                // Canvas fallback
                ctx.save();
                ctx.translate(gsx, gsy + bob);
                ctx.fillStyle = '#FF69B4';
                ctx.beginPath();
                ctx.moveTo(0, -gs(GEM_R));
                ctx.lineTo(gs(GEM_R * 0.7), 0);
                ctx.lineTo(0, gs(GEM_R));
                ctx.lineTo(-gs(GEM_R * 0.7), 0);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        }
    }

    function drawHearts() {
        for (const h of hearts) {
            if (h.collected) continue;
            const hx = gs(h.x - distance), hy = gs(h.y);
            if (hx < -20 || hx > W + 20) continue;
            const bob = Math.sin(frameCount * 0.06 + h.x * 0.05) * gs(2);
            const sz = gs(HEART_R * 2.5);
            if (!drawSprite('hudHeart', hx - sz / 2, hy + bob - sz / 2, sz, sz)) {
                drawHeart(hx, hy + bob, gs(HEART_R), '#FF1493');
            }
        }
    }

    function drawHeart(x, y, r, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y + r * 0.3);
        ctx.bezierCurveTo(x, y - r * 0.5, x - r, y - r * 0.5, x - r, y + r * 0.1);
        ctx.bezierCurveTo(x - r, y + r * 0.6, x, y + r, x, y + r * 1.1);
        ctx.bezierCurveTo(x, y + r, x + r, y + r * 0.6, x + r, y + r * 0.1);
        ctx.bezierCurveTo(x + r, y - r * 0.5, x, y - r * 0.5, x, y + r * 0.3);
        ctx.fill();
    }

    function drawCages() {
        for (const c of cages) {
            if (c.freed) continue;
            const cx = gs(c.x - distance), cy = gs(c.y);
            if (cx < -30 || cx > W + 30) continue;
            const cw = gs(CAGE_W), ch = gs(CAGE_H);
            // Cage bubble
            ctx.strokeStyle = '#90CAF9';
            ctx.lineWidth = gs(2);
            ctx.fillStyle = 'rgba(144,202,249,0.15)';
            ctx.beginPath();
            ctx.ellipse(cx + cw / 2, cy + ch / 2, cw / 2 + gs(2), ch / 2 + gs(2), 0, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            // Animal inside
            drawMiniAnimal(cx + cw / 2, cy + ch / 2, c.animal, gs(8));
            // Sparkle hint
            const sp = (frameCount * 0.1 + c.x) % (Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.arc(cx + cw / 2 + Math.cos(sp) * gs(10), cy + gs(4) + Math.sin(sp) * gs(4), gs(2), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawMiniAnimal(x, y, type, size) {
        ctx.fillStyle = type === 'bunny' ? '#F5F5F5' : type === 'kitten' ? '#FFB74D' : type === 'puppy' ? '#8D6E63' : type === 'bird' ? '#64B5F6' : type === 'fawn' ? '#D7CCC8' : '#FF8A65';
        // Body
        ctx.beginPath(); ctx.ellipse(x, y + size * 0.2, size * 0.6, size * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        // Head
        ctx.beginPath(); ctx.arc(x, y - size * 0.3, size * 0.4, 0, Math.PI * 2); ctx.fill();
        // Eyes
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(x - size * 0.15, y - size * 0.35, size * 0.08, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + size * 0.15, y - size * 0.35, size * 0.08, 0, Math.PI * 2); ctx.fill();
        // Ears
        if (type === 'bunny') {
            ctx.fillStyle = '#F5F5F5';
            ctx.fillRect(x - size * 0.2, y - size * 0.8, size * 0.12, size * 0.35);
            ctx.fillRect(x + size * 0.1, y - size * 0.8, size * 0.12, size * 0.35);
        }
    }

    function drawObstacles(e) {
        for (const o of obstacles) {
            const ox = gs(o.x - distance), oy = gs(o.y), ow = gs(o.w), oh = gs(o.h);
            if (ox + ow < 0 || ox > W) continue;
            if (o.type === 'thorn') {
                // Use spikes sprite
                const anim = frameCount % 40 < 20 ? 'slimePurple' : 'slimePurpleMove';
                if (!drawSprite(anim, ox, oy, ow, oh)) {
                    ctx.fillStyle = '#7B1FA2';
                    ctx.beginPath();
                    ctx.moveTo(ox, oy + oh); ctx.lineTo(ox + ow / 2, oy); ctx.lineTo(ox + ow, oy + oh);
                    ctx.closePath(); ctx.fill();
                }
            } else if (o.type === 'shadow') {
                // Use slime enemy sprite
                const anim = frameCount % 30 < 15 ? 'slimeGreen' : 'slimeGreenMove';
                if (!drawSprite(anim, ox, oy, ow, oh)) {
                    ctx.fillStyle = '#311B92';
                    ctx.beginPath();
                    ctx.ellipse(ox + ow / 2, oy + oh * 0.6, ow / 2, oh * 0.5, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#FF1744';
                    ctx.beginPath(); ctx.arc(ox + ow * 0.35, oy + oh * 0.4, gs(2.5), 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(ox + ow * 0.65, oy + oh * 0.4, gs(2.5), 0, Math.PI * 2); ctx.fill();
                }
            } else if (o.type === 'overhead') {
                // Use saw sprite tiled across overhead
                const sawSpr = frameCount % 20 < 10 ? 'saw' : 'sawMove';
                let drawn = false;
                for (let sx = 0; sx < ow; sx += oh) {
                    if (drawSprite(sawSpr, ox + sx, oy, Math.min(oh, ow - sx), oh)) drawn = true;
                }
                if (!drawn) {
                    ctx.fillStyle = '#4A148C';
                    ctx.globalAlpha = 0.8;
                    ctx.fillRect(ox, oy, ow, oh);
                    ctx.fillStyle = '#7B1FA2';
                    for (let tx = 0; tx < ow; tx += gs(8)) {
                        ctx.beginPath();
                        ctx.moveTo(ox + tx, oy + oh);
                        ctx.lineTo(ox + tx + gs(4), oy + oh + gs(6));
                        ctx.lineTo(ox + tx + gs(8), oy + oh);
                        ctx.fill();
                    }
                    ctx.globalAlpha = 1;
                }
            }
        }
    }

    function drawPowerups() {
        const puSpriteMap = { wand: 'star', shield: 'keyBlue', magnet: 'keyRed', wings: 'star' };
        for (const p of powerups) {
            if (p.collected) continue;
            const px = gs(p.x - distance), py = gs(p.y);
            if (px < -20 || px > W + 20) continue;
            p.bob += 0.04;
            const bob = Math.sin(p.bob) * gs(4);
            const sz = gs(POWERUP_R * 2);

            // Glow
            ctx.fillStyle = 'rgba(255,215,0,0.2)';
            ctx.beginPath(); ctx.arc(px, py + bob, sz * 0.75, 0, Math.PI * 2); ctx.fill();

            const sprKey = puSpriteMap[p.type] || 'star';
            if (!drawSprite(sprKey, px - sz / 2, py + bob - sz / 2, sz, sz)) {
                ctx.fillStyle = p.type === 'wand' ? '#E040FB' : p.type === 'shield' ? '#4FC3F7' : p.type === 'magnet' ? '#FF5722' : '#FFD700';
                ctx.beginPath(); ctx.arc(px, py + bob, gs(POWERUP_R), 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#FFF';
                ctx.font = `bold ${gs(12)}px sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const icon = p.type === 'wand' ? '\u2728' : p.type === 'shield' ? '\uD83D\uDEE1' : p.type === 'magnet' ? '\uD83E\uDDF2' : '\uD83E\uDE75';
                ctx.fillText(icon, px, py + bob);
            }
        }
    }

    function drawSparkles() {
        for (const s of sparkles) {
            const sx = gs(s.x), sy = gs(s.y);
            ctx.fillStyle = `rgba(255,215,0,${s.life / 60})`;
            drawStar(sx, sy, gs(s.size), gs(s.size * 0.4), 4);
        }
    }

    function drawStar(cx, cy, outerR, innerR, points) {
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const angle = (i * Math.PI) / points - Math.PI / 2;
            if (i === 0) ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
            else ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();
    }

    function drawFollowers() {
        for (const a of followerAnimals) {
            const ax = gs(a.x), ay = gs(a.y + Math.sin(a.bob) * 3);
            drawMiniAnimal(ax, ay, a.animal, gs(7));
            // Little hearts above
            if (a.timer > 60) {
                ctx.fillStyle = `rgba(255,105,180,${(a.timer - 60) / 120})`;
                drawHeart(ax, ay - gs(14), gs(3), `rgba(255,105,180,${(a.timer - 60) / 120})`);
            }
        }
    }

    function drawBoss() {
        if (!boss) return;
        const bx = gs(boss.x), by = gs(boss.y + boss.bobOffset);
        const bw = gs(BOSS_W), bh = gs(BOSS_H);

        // Flash on hit
        if (boss.flashTimer > 0 && boss.flashTimer % 2 === 0) return;

        // Dark aura
        ctx.fillStyle = 'rgba(75,0,130,0.3)';
        ctx.beginPath(); ctx.ellipse(bx + bw / 2, by + bh, bw * 0.8, gs(10), 0, 0, Math.PI * 2); ctx.fill();

        // Body (robe)
        ctx.fillStyle = '#1A0033';
        ctx.beginPath();
        ctx.moveTo(bx + bw * 0.2, by + bh * 0.3);
        ctx.lineTo(bx, by + bh);
        ctx.lineTo(bx + bw, by + bh);
        ctx.lineTo(bx + bw * 0.8, by + bh * 0.3);
        ctx.closePath();
        ctx.fill();

        // Head
        ctx.fillStyle = '#4A0E4E';
        ctx.beginPath(); ctx.arc(bx + bw / 2, by + bh * 0.25, bw * 0.3, 0, Math.PI * 2); ctx.fill();

        // Hat
        ctx.fillStyle = '#1A0033';
        ctx.beginPath();
        ctx.moveTo(bx + bw * 0.25, by + bh * 0.2);
        ctx.lineTo(bx + bw / 2, by - bh * 0.2);
        ctx.lineTo(bx + bw * 0.75, by + bh * 0.2);
        ctx.closePath();
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#00FF00';
        ctx.beginPath(); ctx.arc(bx + bw * 0.4, by + bh * 0.22, gs(3), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx + bw * 0.6, by + bh * 0.22, gs(3), 0, Math.PI * 2); ctx.fill();

        // HP bar
        const hpW = bw * 0.8, hpH = gs(4);
        const hpX = bx + bw * 0.1, hpY = by - gs(12);
        ctx.fillStyle = '#333'; ctx.fillRect(hpX, hpY, hpW, hpH);
        ctx.fillStyle = '#FF1744'; ctx.fillRect(hpX, hpY, hpW * (boss.hp / boss.maxHp), hpH);

        // Curses
        for (const c of boss.curses) {
            const ccx = gs(c.x), ccy = gs(c.y);
            ctx.fillStyle = '#7B1FA2';
            ctx.beginPath(); ctx.arc(ccx, ccy, gs(c.size / 2), 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#E040FB';
            ctx.beginPath(); ctx.arc(ccx, ccy, gs(c.size / 3), 0, Math.PI * 2); ctx.fill();
        }
    }

    // ── Draw Princess ──
    function drawPrincess() {
        if (princess.invincible && frameCount % 4 < 2) return; // blink when invincible

        const px = gs(PRINCESS_X), py = gs(princess.y);
        const pw = gs(PRINCESS_W), ph = gs(princess.sliding ? SLIDE_H : PRINCESS_H);
        const slidePy = princess.sliding ? gs(GROUND_Y - SLIDE_H) : py;

        // Choose sprite based on state
        let sprKey = 'playerStand';
        if (princess.sliding) sprKey = 'playerDuck';
        else if (princess.invincible && princess.invTimer > 40) sprKey = 'playerHit';
        else if (!princess.onGround) sprKey = 'playerJump';
        else if (Math.abs(Math.sin(runFrame)) > 0.5) sprKey = frameCount % 20 < 10 ? 'playerWalk1' : 'playerWalk2';

        const sprW = gs(PRINCESS_W * 1.4);
        const sprH = gs((princess.sliding ? SLIDE_H : PRINCESS_H) * 1.3);

        if (drawSprite(sprKey, px - sprW / 2, slidePy - sprH * 0.1, sprW, sprH)) {
            // Sprite drawn successfully
            // Shield bubble overlay
            if (activePower && activePower.type === 'shield') {
                ctx.strokeStyle = `rgba(79,195,247,${0.4 + Math.sin(frameCount * 0.1) * 0.2})`;
                ctx.lineWidth = gs(2);
                ctx.beginPath();
                ctx.ellipse(px, slidePy + sprH * 0.4, sprW * 0.6, sprH * 0.55, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            // Wings overlay
            if (activePower && activePower.type === 'wings') {
                const wingFlap = Math.sin(frameCount * 0.3) * 0.3;
                ctx.fillStyle = 'rgba(255,215,0,0.4)';
                ctx.save();
                ctx.translate(px, slidePy + sprH * 0.3);
                ctx.save(); ctx.rotate(-0.5 + wingFlap);
                ctx.beginPath(); ctx.ellipse(-sprW * 0.4, -sprH * 0.1, sprW * 0.35, sprH * 0.25, -0.3, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                ctx.save(); ctx.rotate(0.5 - wingFlap);
                ctx.beginPath(); ctx.ellipse(sprW * 0.4, -sprH * 0.1, sprW * 0.35, sprH * 0.25, 0.3, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                ctx.restore();
            }
        } else {
            // Canvas fallback
            ctx.save();
            ctx.translate(px, slidePy);
            if (princess.sliding) {
                ctx.rotate(-0.3);
                drawPrincessBody(0, 0, pw, ph, true);
            } else {
                drawPrincessBody(0, 0, pw, ph, false);
            }
            ctx.restore();
        }

        // Sparkle trail when powered up
        if (activePower) {
            const trailColor = activePower.type === 'wand' ? '#E040FB' : activePower.type === 'shield' ? '#4FC3F7' : activePower.type === 'magnet' ? '#FF5722' : '#FFD700';
            for (let i = 0; i < 2; i++) {
                spawnParticle(PRINCESS_X - rng(5, 15), princess.y + rng(5, PRINCESS_H - 5), trailColor, rng(-1, 0), rng(-0.5, 0.5), rng(10, 20), rng(2, 4), 'star');
            }
        }
    }

    function drawPrincessBody(x, y, w, h, sliding) {
        const bounce = Math.sin(runFrame) * gs(1.5);
        const jumpOffset = princess.jumping ? gs(-2) : 0;

        // Dress (gradient using player color)
        const dressGrad = ctx.createLinearGradient(x, y + h * 0.35, x, y + h);
        dressGrad.addColorStop(0, princessColor);
        dressGrad.addColorStop(1, princessColorLight);
        ctx.fillStyle = dressGrad;

        if (!sliding) {
            // Dress shape
            ctx.beginPath();
            ctx.moveTo(x - w * 0.15, y + h * 0.35 + bounce);
            ctx.quadraticCurveTo(x - w * 0.35, y + h * 0.7, x - w * 0.4, y + h);
            ctx.lineTo(x + w * 0.4, y + h);
            ctx.quadraticCurveTo(x + w * 0.35, y + h * 0.7, x + w * 0.15, y + h * 0.35 + bounce);
            ctx.closePath();
            ctx.fill();

            // Dress highlight
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.moveTo(x - w * 0.05, y + h * 0.4 + bounce);
            ctx.quadraticCurveTo(x - w * 0.15, y + h * 0.65, x - w * 0.2, y + h);
            ctx.lineTo(x + w * 0.05, y + h);
            ctx.quadraticCurveTo(x + w * 0.05, y + h * 0.65, x + w * 0.05, y + h * 0.4 + bounce);
            ctx.closePath();
            ctx.fill();
        } else {
            // Sliding dress (compact)
            ctx.beginPath();
            ctx.ellipse(x, y + h * 0.5, w * 0.45, h * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Skin color
        ctx.fillStyle = '#FFE0BD';

        // Head
        const headY = sliding ? y + h * 0.2 : y + h * 0.12 + jumpOffset;
        const headR = w * 0.25;
        ctx.beginPath(); ctx.arc(x, headY, headR, 0, Math.PI * 2); ctx.fill();

        // Hair (flowing behind)
        ctx.fillStyle = '#8B4513';
        const hairLen = sliding ? w * 0.5 : w * 0.7;
        const hairWaveAmt = Math.sin(hairWave) * gs(3);
        ctx.beginPath();
        ctx.moveTo(x - headR * 0.3, headY - headR * 0.8);
        ctx.quadraticCurveTo(x - headR * 1.2, headY - headR * 0.2, x - hairLen + hairWaveAmt, headY + headR * 0.5);
        ctx.quadraticCurveTo(x - hairLen * 0.8, headY + headR * 1.2, x - headR * 0.5, headY + headR * 0.8);
        ctx.quadraticCurveTo(x - headR * 0.2, headY + headR * 0.5, x + headR * 0.3, headY - headR * 0.5);
        ctx.closePath();
        ctx.fill();

        // Hair top volume
        ctx.beginPath();
        ctx.arc(x, headY - headR * 0.15, headR * 1.1, Math.PI, Math.PI * 2);
        ctx.fill();

        // Crown / Tiara
        ctx.fillStyle = '#FFD700';
        const crownY = headY - headR - gs(2);
        ctx.beginPath();
        ctx.moveTo(x - gs(5), headY - headR + gs(1));
        ctx.lineTo(x - gs(4), crownY);
        ctx.lineTo(x - gs(2), headY - headR);
        ctx.lineTo(x, crownY - gs(2));
        ctx.lineTo(x + gs(2), headY - headR);
        ctx.lineTo(x + gs(4), crownY);
        ctx.lineTo(x + gs(5), headY - headR + gs(1));
        ctx.closePath();
        ctx.fill();
        // Crown gem
        ctx.fillStyle = '#FF1493';
        ctx.beginPath(); ctx.arc(x, crownY - gs(1), gs(1.5), 0, Math.PI * 2); ctx.fill();
        // Crown sparkle
        if (frameCount % 30 < 15) {
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.beginPath(); ctx.arc(x + gs(3), crownY - gs(1), gs(1), 0, Math.PI * 2); ctx.fill();
        }

        // Face
        // Eyes (big cute dot eyes)
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(x - headR * 0.3, headY - headR * 0.05, gs(1.8), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + headR * 0.3, headY - headR * 0.05, gs(1.8), 0, Math.PI * 2); ctx.fill();
        // Eye shine
        ctx.fillStyle = '#FFF';
        ctx.beginPath(); ctx.arc(x - headR * 0.3 + gs(0.7), headY - headR * 0.1, gs(0.7), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + headR * 0.3 + gs(0.7), headY - headR * 0.1, gs(0.7), 0, Math.PI * 2); ctx.fill();
        // Blush
        ctx.fillStyle = 'rgba(255,105,180,0.3)';
        ctx.beginPath(); ctx.arc(x - headR * 0.45, headY + headR * 0.15, gs(2.5), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + headR * 0.45, headY + headR * 0.15, gs(2.5), 0, Math.PI * 2); ctx.fill();
        // Smile
        ctx.strokeStyle = '#C06060';
        ctx.lineWidth = gs(1);
        ctx.beginPath();
        ctx.arc(x, headY + headR * 0.1, headR * 0.25, 0.1, Math.PI - 0.1);
        ctx.stroke();

        // Arms
        if (!sliding) {
            ctx.fillStyle = '#FFE0BD';
            if (princess.jumping) {
                // Arms up
                ctx.fillRect(x - w * 0.3, y + h * 0.2 + jumpOffset, gs(4), gs(10));
                ctx.fillRect(x + w * 0.15, y + h * 0.2 + jumpOffset, gs(4), gs(10));
            } else {
                // Arms swinging
                const armSwing = Math.sin(runFrame * 2) * gs(3);
                ctx.fillRect(x - w * 0.3, y + h * 0.35 + armSwing + bounce, gs(4), gs(10));
                ctx.fillRect(x + w * 0.15, y + h * 0.35 - armSwing + bounce, gs(4), gs(10));
            }
        }

        // Shield bubble
        if (activePower && activePower.type === 'shield') {
            ctx.strokeStyle = `rgba(79,195,247,${0.4 + Math.sin(frameCount * 0.1) * 0.2})`;
            ctx.lineWidth = gs(2);
            ctx.beginPath();
            ctx.ellipse(x, sliding ? y + h * 0.5 : y + h * 0.4, w * 0.6, (sliding ? h * 0.5 : h * 0.55), 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Wings
        if (activePower && activePower.type === 'wings') {
            const wingFlap = Math.sin(frameCount * 0.3) * 0.3;
            ctx.fillStyle = 'rgba(255,215,0,0.4)';
            ctx.save();
            ctx.translate(x, y + h * 0.3);
            // Left wing
            ctx.save(); ctx.rotate(-0.5 + wingFlap);
            ctx.beginPath(); ctx.ellipse(-w * 0.4, -h * 0.1, w * 0.35, h * 0.25, -0.3, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            // Right wing
            ctx.save(); ctx.rotate(0.5 - wingFlap);
            ctx.beginPath(); ctx.ellipse(w * 0.4, -h * 0.1, w * 0.35, h * 0.25, 0.3, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            ctx.restore();
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = p.alpha * (p.life / p.maxLife);
            ctx.fillStyle = p.color;
            const s = gs(p.size) * (p.life / p.maxLife);
            if (p.type === 'star') {
                drawStar(gs(p.x), gs(p.y), s, s * 0.4, 4);
            } else if (p.type === 'heart') {
                drawHeart(gs(p.x), gs(p.y), s, p.color);
            } else {
                ctx.beginPath(); ctx.arc(gs(p.x), gs(p.y), s, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
    }

    function drawAmbient() {
        for (const a of ambientParticles) {
            a.twinkle += 0.03;
            const alpha = a.alpha * (0.5 + Math.sin(a.twinkle) * 0.5);
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.beginPath(); ctx.arc(gs(a.x), gs(a.y), gs(a.size), 0, Math.PI * 2); ctx.fill();
        }
    }

    function drawVignette() {
        if (!vignetteGrad) {
            vignetteGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
            vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
            vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.3)');
        }
        ctx.fillStyle = vignetteGrad;
        ctx.fillRect(0, 0, W, H);
    }

    // ── HUD ──
    function drawHUD() {
        ctx.save();
        // Score
        ctx.fillStyle = '#FFF';
        ctx.font = `bold ${gs(14)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = gs(3);
        ctx.fillText(`${score}`, gs(10), gs(10));

        // Distance
        ctx.font = `${gs(10)}px sans-serif`;
        ctx.fillText(`${Math.floor(distance / 6.4)}m`, gs(10), gs(28));

        // Combo
        if (combo > 2) {
            ctx.fillStyle = '#FFD700';
            ctx.font = `bold ${gs(12)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(`x${combo} COMBO!`, gs(GAME_W / 2), gs(10));
        }

        // Health hearts
        ctx.shadowBlur = 0;
        for (let i = 0; i < princess.maxHealth; i++) {
            const hx = W - gs(16) - i * gs(18);
            const hy = gs(8);
            const hsz = gs(14);
            if (i < princess.health) {
                if (!drawSprite('hudHeart', hx - hsz / 2, hy, hsz, hsz)) {
                    drawHeart(hx, hy + hsz / 2, gs(6), '#FF1493');
                }
            } else {
                if (!drawSprite('hudHeartEmpty', hx - hsz / 2, hy, hsz, hsz)) {
                    drawHeart(hx, hy + hsz / 2, gs(6), 'rgba(255,255,255,0.25)');
                }
            }
        }

        // Active power-up indicator
        if (activePower) {
            const icon = activePower.type === 'wand' ? '\u2728' : activePower.type === 'shield' ? '\uD83D\uDEE1' : activePower.type === 'magnet' ? '\uD83E\uDDF2' : '\uD83E\uDE75';
            const pct = activePower.timer / (activePower.type === 'wings' ? 240 : activePower.type === 'wand' ? 300 : activePower.type === 'magnet' ? 360 : 300);
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.roundRect(gs(GAME_W / 2 - 30), gs(GAME_H - 30), gs(60), gs(20), gs(5)); ctx.fill();
            ctx.fillStyle = princessColor;
            ctx.beginPath(); ctx.roundRect(gs(GAME_W / 2 - 29), gs(GAME_H - 29), gs(58 * pct), gs(18), gs(4)); ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.font = `${gs(12)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(icon, gs(GAME_W / 2), gs(GAME_H - 17));
        }

        // Environment name (during transition)
        if (envTransition > 0) {
            ctx.fillStyle = `rgba(255,255,255,${Math.min(1, envTransition / 30)})`;
            ctx.font = `bold ${gs(16)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(env().name, gs(GAME_W / 2), gs(GAME_H / 2 - 20));
        }

        ctx.restore();
    }

    // ── On-screen Controls ──
    function drawControls() {
        if (!HAS_TOUCH) return;
        ctx.save();
        ctx.globalAlpha = 0.3;
        // Jump button (right side)
        ctx.fillStyle = '#FFF';
        ctx.beginPath(); ctx.roundRect(W - gs(80), H - gs(65), gs(60), gs(50), gs(10)); ctx.fill();
        ctx.fillStyle = '#333';
        ctx.font = `bold ${gs(12)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('JUMP', W - gs(50), H - gs(40));

        // Slide button (left side)
        ctx.fillStyle = '#FFF';
        ctx.beginPath(); ctx.roundRect(gs(20), H - gs(65), gs(60), gs(50), gs(10)); ctx.fill();
        ctx.fillStyle = '#333';
        ctx.fillText('SLIDE', gs(50), H - gs(40));
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // ── Loading Screen ──
    function drawLoadingScreen(loaded, total) {
        if (!ctx) return;
        ctx.save();
        // Dark gradient background
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#FFB6C1');
        grad.addColorStop(1, '#FFF0F5');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Title
        ctx.fillStyle = '#FF69B4';
        ctx.font = `bold ${gs(22)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Princess Run', W / 2, H * 0.35);

        // Loading bar background
        const barW = gs(200), barH = gs(12);
        const barX = (W - barW) / 2, barY = H * 0.5;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, gs(6)); ctx.fill();

        // Loading bar fill
        const pct = total > 0 ? loaded / total : 0;
        ctx.fillStyle = '#FF69B4';
        ctx.beginPath(); ctx.roundRect(barX, barY, barW * pct, barH, gs(6)); ctx.fill();

        // Loading text
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.font = `${gs(10)}px sans-serif`;
        ctx.fillText(`Loading sprites... ${loaded}/${total}`, W / 2, H * 0.6);
        ctx.restore();
    }

    // ── Title / Death Screens ──
    function drawTitle() {
        const e = env();
        drawSky(e, e, 0);
        drawParallax(e);
        drawGround(e);
        drawAmbient();

        // Floating princess preview
        const bob = Math.sin(frameCount * 0.04) * 8;
        ctx.save();
        ctx.translate(gs(GAME_W / 2), gs(GAME_H / 2 - 20 + bob));
        drawPrincessBody(0, 0, gs(42), gs(54), false);
        ctx.restore();

        // Title
        ctx.fillStyle = '#FFF';
        ctx.font = `bold ${gs(24)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = gs(5);
        ctx.fillText('Princess Run', gs(GAME_W / 2), gs(55));
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `${gs(11)}px sans-serif`;
        ctx.fillText('Collect gems \u2022 Rescue animals \u2022 Defeat dark magic', gs(GAME_W / 2), gs(78));

        // Tap to start
        const pulse = 0.7 + Math.sin(frameCount * 0.06) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#FFD700';
        ctx.font = `bold ${gs(14)}px sans-serif`;
        ctx.fillText(HAS_TOUCH ? 'Tap to Start' : 'Press Space to Start', gs(GAME_W / 2), gs(GAME_H - 50));
        ctx.globalAlpha = 1;

        // Decorative sparkles
        for (let i = 0; i < 5; i++) {
            const sx = GAME_W * 0.2 + i * (GAME_W * 0.15);
            const sy = 40 + Math.sin(frameCount * 0.05 + i) * 15;
            ctx.fillStyle = `rgba(255,215,0,${0.4 + Math.sin(frameCount * 0.08 + i * 1.5) * 0.3})`;
            drawStar(gs(sx), gs(sy), gs(4), gs(1.5), 4);
        }

        drawVignette();
    }

    function drawDeath() {
        // Dim overlay
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = '#FFF';
        ctx.font = `bold ${gs(22)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = gs(5);
        ctx.fillText('Adventure Over!', gs(GAME_W / 2), gs(GAME_H / 2 - 40));
        ctx.shadowBlur = 0;

        ctx.font = `bold ${gs(16)}px sans-serif`;
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`Score: ${score}`, gs(GAME_W / 2), gs(GAME_H / 2));

        ctx.font = `${gs(12)}px sans-serif`;
        ctx.fillStyle = '#FFF';
        ctx.fillText(`Distance: ${Math.floor(distance / 6.4)}m`, gs(GAME_W / 2), gs(GAME_H / 2 + 25));

        if (bestScore > 0) {
            ctx.font = `${gs(11)}px sans-serif`;
            ctx.fillStyle = score >= bestScore ? '#FFD700' : '#AAA';
            ctx.fillText(score >= bestScore ? `NEW BEST: ${bestScore}` : `Best: ${bestScore}`, gs(GAME_W / 2), gs(GAME_H / 2 + 43));
        }

        const pulse = 0.6 + Math.sin(frameCount * 0.06) * 0.4;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#FFD700';
        ctx.font = `bold ${gs(12)}px sans-serif`;
        ctx.fillText(HAS_TOUCH ? 'Tap to Restart' : 'Press Space to Restart', gs(GAME_W / 2), gs(GAME_H / 2 + 60));
        ctx.globalAlpha = 1;
    }

    // ── Reset Game ──
    function resetGame() {
        distance = 0;
        score = 0;
        scrollSpeed = BASE_SPEED;
        combo = 0; comboTimer = 0;
        envIndex = 0; envProgress = 0; envTransition = 60;
        bossActive = false; boss = null;
        activePower = null;
        screenShake = 0; shakeTimer = 0;
        runFrame = 0; hairWave = 0;
        frameCount = 0;
        particles = [];
        sparkles = [];

        princess = {
            y: GROUND_Y - PRINCESS_H,
            vy: 0,
            onGround: true,
            jumping: false,
            doubleJumped: false,
            sliding: false,
            slideTimer: 0,
            health: 3,
            maxHealth: 5,
            invincible: false,
            invTimer: 0
        };

        resetSpawning();
        initBgLayers();
        initAmbient();
    }

    // ── Input Handlers ──
    function onKeyDown(e) {
        keys[e.code] = true;
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault();
            if (state === ST_TITLE) { state = ST_PLAY; resetGame(); envTransition = 60; }
            else if (state === ST_PLAY || state === ST_BOSS) doJump();
            else if (state === ST_DEAD) { state = ST_PLAY; resetGame(); envTransition = 60; }
        }
        if (e.code === 'ArrowDown' || e.code === 'KeyS') {
            e.preventDefault();
            if (state === ST_PLAY || state === ST_BOSS) doSlide();
        }
    }
    function onKeyUp(e) { keys[e.code] = false; }

    function onTouchStart(e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        for (const t of e.changedTouches) {
            const tx = t.clientX - rect.left, ty = t.clientY - rect.top;
            if (state === ST_TITLE) { state = ST_PLAY; resetGame(); envTransition = 60; return; }
            if (state === ST_DEAD) { state = ST_PLAY; resetGame(); envTransition = 60; return; }
            // Left half = slide, right half = jump
            if (tx < rect.width * 0.4) {
                doSlide();
            } else {
                doJump();
            }
        }
    }
    function onTouchMove(e) { e.preventDefault(); }
    function onTouchEnd(e) { e.preventDefault(); }

    // ── Game Loop ──
    function update() {
        frameCount++;

        if (state === ST_PLAY || state === ST_BOSS) {
            // Speed up over time
            scrollSpeed = Math.min(MAX_SPEED, BASE_SPEED + distance * SPEED_RAMP);
            distance += scrollSpeed;

            // Environment progress
            envProgress += scrollSpeed;
            if (envTransition > 0) envTransition--;

            // Check environment change
            if (envProgress >= ENV_LENGTH && !bossActive) {
                if (isBossTime()) {
                    state = ST_BOSS;
                    spawnBoss();
                } else {
                    envIndex++;
                    envProgress = 0;
                    envTransition = 60;
                }
            }

            updatePrincess();
            if (!bossActive) spawnContent();
            updateCollections();
            updateSparkles();
            updateFollowers();
            if (bossActive) updateBoss();

            // Cleanup off-screen
            gems = gems.filter(g => g.x - distance > -50);
            hearts = hearts.filter(h => h.x - distance > -50);
            cages = cages.filter(c => c.x - distance > -50);
            obstacles = obstacles.filter(o => o.x - distance > -50);
            platforms = platforms.filter(p => p.x - distance + p.w > -50);
            powerups = powerups.filter(p => p.x - distance > -50);

            // Update particles
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx; p.y += p.vy;
                p.vy += 0.05;
                p.life--;
                if (p.life <= 0) particles.splice(i, 1);
            }

            // Update ambient
            for (const a of ambientParticles) {
                a.x -= scrollSpeed * 0.3;
                if (a.x < -10) { a.x = GAME_W + 10; a.y = rng(0, GROUND_Y); }
            }

            // Screen shake decay
            if (shakeTimer > 0) shakeTimer--;
            else screenShake = 0;
        }
    }

    function draw() {
        ctx.save();

        // Screen shake
        if (screenShake > 0 && shakeTimer > 0) {
            ctx.translate(rng(-screenShake, screenShake) * SCALE, rng(-screenShake, screenShake) * SCALE);
        }

        const e = env();
        const blendT = envTransition > 0 ? 0 : 0;

        if (state === ST_TITLE) {
            drawTitle();
            ctx.restore();
            return;
        }

        drawSky(e, e, blendT);
        drawParallax(e);
        drawGround(e);
        drawAmbient();
        drawPlatforms(e);
        drawGems();
        drawHearts();
        drawCages();
        drawObstacles(e);
        drawPowerups();
        drawSparkles();
        drawFollowers();
        drawPrincess();
        if (bossActive) drawBoss();
        drawParticles();
        drawVignette();
        drawHUD();
        drawControls();

        if (state === ST_DEAD) drawDeath();

        ctx.restore();
    }

    function gameLoop(ts) {
        if (!gameActive) return;
        if (state === ST_LOADING) {
            drawLoadingScreen(spritesLoaded, spritesTotal);
            animFrame = requestAnimationFrame(gameLoop);
            return;
        }
        if (state !== ST_TITLE) update();
        else frameCount++;
        draw();
        animFrame = requestAnimationFrame(gameLoop);
    }

    // ── Public API ──
    function init(cvs, playerData, onGameOverCB) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOverCB;
        gameActive = true;
        princessColor = playerData?.color || '#FF69B4';

        const themeId = playerData?.theme || 'candy';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) princessColor = _t.colors[0] || princessColor;

        const pc = hexToRgb(princessColor);
        princessColorLight = rgbStr(Math.min(255, pc.r + 60), Math.min(255, pc.g + 60), Math.min(255, pc.b + 60));

        state = ST_LOADING;
        frameCount = 0;
        keys = {};
        particles = [];
        sparkles = [];

        princess = {
            y: GROUND_Y - PRINCESS_H, vy: 0, onGround: true, jumping: false,
            doubleJumped: false, sliding: false, slideTimer: 0,
            health: 3, maxHealth: 5, invincible: false, invTimer: 0
        };

        runFrame = 0;
        hairWave = 0;
        distance = 0; score = 0; scrollSpeed = BASE_SPEED;
        bestScore = parseInt(localStorage.getItem('ywa_princessrun_best') || '0', 10);
        combo = 0; comboTimer = 0;
        envIndex = 0; envProgress = 0; envTransition = 0;
        bossActive = false; boss = null;
        activePower = null;
        screenShake = 0; shakeTimer = 0;
        followerAnimals = [];
        vignetteGrad = null;

        resetSpawning();
        initBgLayers();
        initAmbient();

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

        // Load sprites then start
        loadSprites(
            (loaded, total) => { drawLoadingScreen(loaded, total); },
            () => { state = ST_TITLE; }
        );

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
