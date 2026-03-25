/* YWA Contra — Side-scrolling run-and-gun with color-chain combo system
   Upgraded: new enemies, hazards, mid-boss, vehicle section, weapon combos,
   destructible environment, parallax foreground, weather, muzzle flash per weapon,
   ragdoll enemy deaths — Kenney Platform CC0 sprites */
window.Contra = (() => {

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
    const GAME_W = 960, GAME_H = 540;
    const GRAVITY = 0.55, JUMP_VEL = -11, MAX_FALL = 12;
    const PLAYER_SPEED = 3.5, PLAYER_W = 28, PLAYER_H = 40;
    const PRONE_H = 20;
    const BULLET_SPEED = 10, BULLET_SIZE = 4;
    const FIRE_COOLDOWN_MS = 180;
    const SPREAD_ANGLE = 0.18;
    const ENEMY_COLORS = ['#EF4444','#3B82F6','#22C55E','#FBBF24'];
    const CHAIN_WINDOW_MS = 1500;
    const SCROLL_SPEED = 1.2;
    const LEVEL_LENGTH = 9600; // longer for vehicle + mid-boss

    // States
    const ST_LOADING = -1, ST_TITLE = 0, ST_PLAY = 1, ST_DEAD = 2, ST_GAMEOVER = 3, ST_WIN = 4;

    // ── Sprite Atlas (Kenney Platform CC0) ──
    const SPRITE_BASE = '/img/game-assets/kenney-platform';
    const sprites = {};
    let spritesLoaded = 0, spritesTotal = 0, allSpritesReady = false;

    const SPRITE_MANIFEST = {
        // Player
        playerStand:  `${SPRITE_BASE}/players/Blue/alienBlue_stand.png`,
        playerWalk1:  `${SPRITE_BASE}/players/Blue/alienBlue_walk1.png`,
        playerWalk2:  `${SPRITE_BASE}/players/Blue/alienBlue_walk2.png`,
        playerJump:   `${SPRITE_BASE}/players/Blue/alienBlue_jump.png`,
        playerDuck:   `${SPRITE_BASE}/players/Blue/alienBlue_duck.png`,
        playerHit:    `${SPRITE_BASE}/players/Blue/alienBlue_hit.png`,
        // Enemies
        enemySlime:   `${SPRITE_BASE}/enemies/slimeGreen.png`,
        enemySlimeM:  `${SPRITE_BASE}/enemies/slimeGreen_move.png`,
        enemyBee:     `${SPRITE_BASE}/enemies/bee.png`,
        enemyBeeM:    `${SPRITE_BASE}/enemies/bee_move.png`,
        enemyFly:     `${SPRITE_BASE}/enemies/fly.png`,
        enemyFlyM:    `${SPRITE_BASE}/enemies/fly_move.png`,
        enemyMouse:   `${SPRITE_BASE}/enemies/mouse.png`,
        enemyMouseM:  `${SPRITE_BASE}/enemies/mouse_move.png`,
        enemySnail:   `${SPRITE_BASE}/enemies/snail.png`,
        enemySnailM:  `${SPRITE_BASE}/enemies/snail_move.png`,
        enemySaw:     `${SPRITE_BASE}/enemies/saw.png`,
        enemySawM:    `${SPRITE_BASE}/enemies/saw_move.png`,
        // Tiles / platforms
        grassMid:     `${SPRITE_BASE}/ground/Grass/grassMid.png`,
        grassLeft:    `${SPRITE_BASE}/ground/Grass/grassLeft.png`,
        grassRight:   `${SPRITE_BASE}/ground/Grass/grassRight.png`,
        grassCenter:  `${SPRITE_BASE}/ground/Grass/grassCenter.png`,
        stoneMid:     `${SPRITE_BASE}/ground/Stone/stoneMid.png`,
        stoneCenter:  `${SPRITE_BASE}/ground/Stone/stoneCenter.png`,
        // Items
        coinGold:     `${SPRITE_BASE}/items/coinGold.png`,
        gemBlue:      `${SPRITE_BASE}/items/gemBlue.png`,
        gemRed:       `${SPRITE_BASE}/items/gemRed.png`,
        gemGreen:     `${SPRITE_BASE}/items/gemGreen.png`,
        star:         `${SPRITE_BASE}/items/star.png`,
        keyBlue:      `${SPRITE_BASE}/items/keyBlue.png`,
        fireball:     `${SPRITE_BASE}/particles/fireball.png`,
        // Tiles - props
        boxCrate:     `${SPRITE_BASE}/tiles/boxCrate.png`,
        boxExplosive: `${SPRITE_BASE}/tiles/boxExplosive.png`,
        bomb:         `${SPRITE_BASE}/tiles/bomb.png`,
        spikes:       `${SPRITE_BASE}/tiles/spikes.png`,
        bush:         `${SPRITE_BASE}/tiles/bush.png`,
        rock:         `${SPRITE_BASE}/tiles/rock.png`,
        flagRed:      `${SPRITE_BASE}/items/flagRed1.png`,
        // HUD
        hudHeart:     `${SPRITE_BASE}/hud/hudHeart_full.png`,
        hudHeartE:    `${SPRITE_BASE}/hud/hudHeart_empty.png`,
        // Background
        bgGrass:      `${SPRITE_BASE}/backgrounds/blue_grass.png`,
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
                done++; spritesLoaded = done;
                if (onProgress) onProgress(done, spritesTotal);
                if (done === spritesTotal) { allSpritesReady = true; if (onDone) onDone(); }
            };
            img.onerror = () => {
                sprites[key] = null;
                done++; spritesLoaded = done;
                if (onProgress) onProgress(done, spritesTotal);
                if (done === spritesTotal) { allSpritesReady = true; if (onDone) onDone(); }
            };
            img.src = SPRITE_MANIFEST[key];
        });
    }

    function drawSprite(img, x, y, w, h, flipX) {
        if (!img) return false;
        ctx.save();
        if (flipX) {
            ctx.translate(gx(x + w), gy(y));
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0, gs(w), gs(h));
        } else {
            ctx.drawImage(img, gx(x), gy(y), gs(w), gs(h));
        }
        ctx.restore();
        return true;
    }

    function drawLoading() {
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#EF4444';
        ctx.shadowColor = '#EF4444'; ctx.shadowBlur = gs(10);
        ctx.font = `bold ${gs(44)}px monospace`;
        ctx.fillText('CONTRA', gs(GAME_W / 2), gs(GAME_H / 2 - 50));
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#E0E7FF'; ctx.font = `${gs(13)}px monospace`;
        ctx.fillText('LOADING SPRITES...', gs(GAME_W / 2), gs(GAME_H / 2));
        const barW = 200, barH = 8;
        const pct = spritesTotal > 0 ? spritesLoaded / spritesTotal : 0;
        ctx.fillStyle = '#333';
        ctx.fillRect(gs(GAME_W / 2 - barW / 2), gs(GAME_H / 2 + 20), gs(barW), gs(barH));
        ctx.fillStyle = '#EF4444';
        ctx.fillRect(gs(GAME_W / 2 - barW / 2), gs(GAME_H / 2 + 20), gs(barW * pct), gs(barH));
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `${gs(10)}px monospace`;
        ctx.fillText(`${spritesLoaded} / ${spritesTotal}`, gs(GAME_W / 2), gs(GAME_H / 2 + 45));
    }

    // Game state
    let canvas, ctx, W, H, SCALE, DPR, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor;
    let highScore = parseInt(localStorage.getItem('ywa_contra_hi') || '0');
    let state, frameCount, lastTime, keys = {};
    let score, lives, level, cameraX;
    let player, bullets, enemies, enemyBullets, particles, scorePopups, powerups;
    let lastFireTime, lastChainColor, chainCount, chainTimer;
    let weapon, weaponTimer, weaponLevel; // weaponLevel: 1=normal, 2=upgraded
    let screenShake;
    let bgLayers;
    let platforms;
    let spawnTimer, spawnRate;
    let bossActive, boss;
    let midBossActive, midBoss; // wall-mounted turret array
    let deathTimer;
    let stars;
    // New systems
    let hazards;       // environmental hazards
    let destructibles; // destructible walls/crates
    let foregroundElements; // parallax foreground vines/grass
    let weatherParticles;   // rain or snow
    let ragdolls;      // enemy ragdoll death bodies
    let vehicleSection; // tank riding segment
    let rainSplashes;  // rain splash effects on platforms

    // Audio
    let audioCtx;
    function getAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
    function playSound(freq, dur, type = 'square', vol = 0.15) {
        try {
            const a = getAudio(), o = a.createOscillator(), g = a.createGain();
            o.type = type; o.frequency.value = freq;
            g.gain.setValueAtTime(vol, a.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
            o.connect(g); g.connect(a.destination);
            o.start(); o.stop(a.currentTime + dur);
        } catch {}
    }
    function sfxShoot() { playSound(800, 0.06, 'square', 0.1); }
    function sfxSpread() { playSound(600, 0.08, 'sawtooth', 0.08); }
    function sfxHit() { playSound(200, 0.15, 'sawtooth', 0.12); }
    function sfxChain() { playSound(1200, 0.3, 'sine', 0.2); }
    function sfxDeath() { playSound(150, 0.5, 'sawtooth', 0.15); }
    function sfxPowerup() { playSound(880, 0.1, 'sine', 0.15); setTimeout(() => playSound(1100, 0.15, 'sine', 0.15), 100); }
    function sfxJump() { playSound(400, 0.1, 'triangle', 0.08); }
    function sfxBoss() { playSound(80, 0.6, 'sawtooth', 0.2); }
    function sfxExplosion() { playSound(60, 0.4, 'sawtooth', 0.18); playSound(100, 0.3, 'square', 0.1); }
    function sfxBarrel() { playSound(90, 0.35, 'sawtooth', 0.2); }
    function sfxDestroy() { playSound(180, 0.2, 'square', 0.12); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const gx = v => (v - cameraX) * SCALE;
    const gy = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

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

    // ── Level Generation ──
    function generateLevel() {
        platforms = [];
        destructibles = [];
        hazards = [];
        foregroundElements = [];

        // Ground
        platforms.push({ x: 0, y: GAME_H - 40, w: LEVEL_LENGTH + 200, h: 40, type: 'ground' });

        // Platforms (semi-random with guaranteed reachability)
        let px = 200;
        while (px < LEVEL_LENGTH - 400) {
            const pw = rng(80, 200);
            const py = rng(GAME_H - 200, GAME_H - 100);
            platforms.push({ x: px, y: py, w: pw, h: 16, type: 'platform' });

            // Some gaps in ground to add danger
            if (Math.random() < 0.15) {
                const gapX = px + pw + 40;
                const gapW = rng(60, 120);
                platforms.push({ x: gapX, y: GAME_H - 40, w: gapW, h: 40, type: 'gap' });
            }

            // Occasional high platforms
            if (Math.random() < 0.3) {
                platforms.push({ x: px + rng(0, 100), y: rng(GAME_H - 320, GAME_H - 220), w: rng(60, 120), h: 16, type: 'platform' });
            }

            // Destructible crates near platforms (feature 6)
            if (Math.random() < 0.18) {
                const crateX = px + rng(0, pw);
                destructibles.push({
                    x: crateX, y: GAME_H - 40 - 24, w: 24, h: 24,
                    hp: 2, type: Math.random() < 0.4 ? 'wall' : 'crate',
                    secret: Math.random() < 0.5 ? pick(['spread','rapid','laser','life']) : null,
                    alive: true,
                });
            }

            // Exploding barrels (feature 2)
            if (Math.random() < 0.12 && px > 400) {
                hazards.push({
                    x: px + rng(20, pw - 20), y: GAME_H - 40 - 20, w: 16, h: 20,
                    type: 'barrel', hp: 1, alive: true, explodeRadius: 60, explodeTimer: 0,
                });
            }

            // Foreground vines/grass (feature 7)
            if (Math.random() < 0.2) {
                foregroundElements.push({
                    x: px + rng(-20, pw),
                    type: Math.random() < 0.5 ? 'vine' : 'tallgrass',
                    h: rng(30, 80),
                });
            }

            px += pw + rng(100, 250);
        }

        // Cave section with falling rocks (feature 2)
        const caveStart = LEVEL_LENGTH * 0.3;
        const caveEnd = LEVEL_LENGTH * 0.45;
        for (let cx = caveStart; cx < caveEnd; cx += rng(150, 300)) {
            hazards.push({
                x: cx, y: -20, w: rng(14, 24), h: rng(14, 24),
                type: 'fallingrock', vy: 0, triggerX: cx, alive: true, triggered: false,
            });
        }

        // Rising water zone (feature 2)
        hazards.push({
            x: LEVEL_LENGTH * 0.55, y: GAME_H, w: LEVEL_LENGTH * 0.12, h: 0,
            type: 'risingwater', waterLevel: GAME_H, maxRise: GAME_H - 160, riseSpeed: 0.3,
            active: false,
        });

        // Vehicle section zone marker (feature 4)
        vehicleSection = {
            startX: LEVEL_LENGTH * 0.68,
            endX: LEVEL_LENGTH * 0.68 + 800,
            active: false,
            tankX: 0, tankY: GAME_H - 40 - 30, tankSpeed: 2.5,
            turretAngle: 0,
            entered: false, exited: false,
        };

        // Boss platform
        platforms.push({ x: LEVEL_LENGTH - 300, y: GAME_H - 180, w: 300, h: 16, type: 'platform' });
    }

    function createStars() {
        stars = [];
        for (let i = 0; i < 80; i++) stars.push({ x: rng(0, GAME_W * 2), y: rng(0, GAME_H * 0.6), s: rng(0.5, 2), b: rng(0.3, 1) });
    }

    function createBgLayers() {
        bgLayers = [
            { speed: 0.1, color: '#1a1a2e', hills: [] },
            { speed: 0.25, color: '#16213e', hills: [] },
            { speed: 0.5, color: '#0f3460', hills: [] },
        ];
        for (const layer of bgLayers) {
            let lx = 0;
            while (lx < LEVEL_LENGTH + GAME_W) {
                layer.hills.push({ x: lx, w: rng(100, 300), h: rng(60, 180) });
                lx += rng(80, 200);
            }
        }
    }

    function createWeather() {
        weatherParticles = [];
        rainSplashes = [];
        // Create initial rain particles
        for (let i = 0; i < 120; i++) {
            weatherParticles.push({
                x: rng(0, GAME_W), y: rng(-GAME_H, GAME_H),
                vx: -1.5, vy: rng(8, 14), len: rng(6, 14),
                alpha: rng(0.15, 0.4),
            });
        }
    }

    // ── Player ──
    function resetPlayer() {
        player = {
            x: 100, y: GAME_H - 100, vx: 0, vy: 0,
            prone: false, grounded: false,
            facing: 1, aimX: 1, aimY: 0,
            invincible: 0, flash: 0,
            onVehicle: false,
        };
    }

    // ── Collision ──
    function rectOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function isOnGround(x, y, w, h) {
        for (const p of platforms) {
            if (p.type === 'gap') continue;
            if (x + w > p.x && x < p.x + p.w && y + h >= p.y && y + h <= p.y + 8) {
                return p.y;
            }
        }
        // Check destructible walls/crates as solid surfaces
        for (const d of destructibles) {
            if (!d.alive) continue;
            if (x + w > d.x && x < d.x + d.w && y + h >= d.y && y + h <= d.y + 8) {
                return d.y;
            }
        }
        return null;
    }

    function collidesWithLevel(x, y, w, h) {
        for (const p of platforms) {
            if (p.type === 'gap') continue;
            if (rectOverlap({ x, y, w, h }, p)) return true;
        }
        for (const d of destructibles) {
            if (!d.alive) continue;
            if (rectOverlap({ x, y, w, h }, d)) return true;
        }
        return false;
    }

    // ── Enemies (feature 1: new enemy types) ──
    function spawnEnemy() {
        const ex = cameraX + GAME_W + rng(20, 100);
        const color = pick(ENEMY_COLORS);
        // Weighted type selection including new types
        const roll = Math.random();
        let type;
        if (roll < 0.2) type = 'runner';
        else if (roll < 0.4) type = 'soldier';
        else if (roll < 0.55) type = 'turret';
        else if (roll < 0.7) type = 'sniper';      // new: stationary, accurate
        else if (roll < 0.85) type = 'grenadier';   // new: lob arc shots
        else type = 'shield';                        // new: shield soldier

        let ey;
        if (type === 'turret' || type === 'sniper') {
            const validPlats = platforms.filter(p => p.type !== 'gap' && p.x < ex + 100 && p.x + p.w > ex && p.y < GAME_H - 40);
            if (validPlats.length) {
                ey = pick(validPlats).y - 30;
            } else {
                ey = GAME_H - 70;
            }
        } else {
            ey = GAME_H - 70;
        }

        const hpMap = { runner: 1, soldier: 2, turret: 3, sniper: 2, grenadier: 2, shield: 4 };
        const vxMap = { runner: -rng(2, 4), soldier: -rng(0.5, 1.5), turret: 0, sniper: 0, grenadier: -rng(0.3, 1), shield: -rng(1, 2) };

        enemies.push({
            x: ex, y: ey, w: 24, h: 30,
            vx: vxMap[type], vy: 0,
            type, color, hp: hpMap[type],
            fireTimer: rng(60, 120),
            alive: true,
            shieldAngle: 0, // for shield type — angle facing player
            shieldUp: true,
        });
    }

    // ── Mid-Boss: Wall-mounted turret array (feature 3) ──
    function spawnMidBoss() {
        midBossActive = true;
        const mbx = LEVEL_LENGTH * 0.48;
        midBoss = {
            x: mbx, y: GAME_H - 280, w: 120, h: 140,
            hp: 20, maxHp: 20,
            turrets: [
                { offX: 10, offY: 20, angle: 0, fireTimer: 30, alive: true, hp: 5 },
                { offX: 55, offY: 10, angle: 0, fireTimer: 50, alive: true, hp: 5 },
                { offX: 100, offY: 25, angle: 0, fireTimer: 70, alive: true, hp: 5 },
                { offX: 55, offY: 80, angle: 0, fireTimer: 90, alive: true, hp: 5 },
            ],
            flash: 0, alive: true, phase: 0, phaseTimer: 0,
        };
        sfxBoss();
    }

    function spawnBoss() {
        bossActive = true;
        boss = {
            x: LEVEL_LENGTH - 150, y: GAME_H - 250, w: 80, h: 100,
            hp: 30, maxHp: 30,
            phase: 0, phaseTimer: 0, fireTimer: 0,
            color: '#F43F5E', alive: true, flash: 0,
        };
        sfxBoss();
    }

    // ── Weapon with combo upgrade (feature 5) ──
    function fireBullet() {
        const now = performance.now();
        const isUpgraded = weaponLevel >= 2;
        let cooldown = FIRE_COOLDOWN_MS;
        if (weapon === 'rapid') cooldown = isUpgraded ? 50 : 80;

        if (now - lastFireTime < cooldown) return;
        lastFireTime = now;

        const bx = player.x + (player.facing > 0 ? PLAYER_W : 0);
        const by = player.y + (player.prone ? PRONE_H / 2 : PLAYER_H / 2) - 2;

        muzzleFlash = 4;
        muzzleType = weapon; // track for per-weapon flash (feature 9)

        if (weapon === 'spread') {
            sfxSpread();
            const count = isUpgraded ? 7 : 5; // Spread+ fires 7-way
            const halfCount = Math.floor(count / 2);
            for (let i = -halfCount; i <= halfCount; i++) {
                const angle = Math.atan2(player.aimY, player.aimX) + i * SPREAD_ANGLE;
                bullets.push({ x: bx, y: by, vx: Math.cos(angle) * BULLET_SPEED, vy: Math.sin(angle) * BULLET_SPEED, size: 3, weapon: 'spread' });
            }
        } else if (weapon === 'laser') {
            sfxShoot();
            bullets.push({
                x: bx, y: by,
                vx: player.aimX * BULLET_SPEED * 1.5, vy: player.aimY * BULLET_SPEED * 1.5,
                size: 6, laser: true, pierce: isUpgraded ? 3 : 0, weapon: 'laser', // Laser+ pierces multiple
            });
        } else {
            sfxShoot();
            bullets.push({ x: bx, y: by, vx: player.aimX * BULLET_SPEED, vy: player.aimY * BULLET_SPEED, size: BULLET_SIZE, weapon: 'normal' });
        }
    }

    // ── Particles ──
    function spawnParticles(x, y, color, count, spread = 3) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x, y, vx: rng(-spread, spread), vy: rng(-spread, spread),
                color, size: rng(2, 5), life: rng(15, 40), maxLife: 40,
            });
        }
    }

    function addScorePopup(x, y, text) {
        scorePopups.push({ x, y, text, life: 60, maxLife: 60 });
    }

    // ── Ragdoll death system (feature 10) ──
    function spawnRagdoll(x, y, w, h, color, type) {
        const dir = player.x < x ? 1 : -1;
        ragdolls.push({
            // head
            headX: x + w/2, headY: y, headVx: rng(-1, 1) + dir * 2, headVy: rng(-6, -3),
            headR: 0, headSpin: rng(-0.2, 0.2),
            // torso
            torsoX: x + w/2, torsoY: y + h * 0.4, torsoVx: dir * rng(1, 3), torsoVy: rng(-4, -1),
            torsoR: 0, torsoSpin: rng(-0.15, 0.15),
            // legs
            legX: x + w/2, legY: y + h * 0.7, legVx: dir * rng(0.5, 2), legVy: rng(-3, 0),
            legR: 0, legSpin: rng(-0.1, 0.1),
            color, life: 80, maxLife: 80, type,
            grounded: false,
        });
    }

    // ── Chain System ──
    function registerKill(color, x, y) {
        const now = performance.now();
        if (color === lastChainColor && now - chainTimer < CHAIN_WINDOW_MS) {
            chainCount++;
            chainTimer = now;
            if (chainCount >= 3) {
                const bonus = chainCount * 100;
                score += bonus;
                sfxChain();
                addScorePopup(x, y - 20, `CHAIN ${chainCount}x +${bonus}`);
                spawnParticles(x, y, color, 30, 6);
                if (chainCount >= 5 && Math.random() < 0.5) {
                    const wtype = pick(['spread', 'rapid', 'laser']);
                    powerups.push({ x, y: y - 20, w: 20, h: 20, type: wtype, vy: -2, life: 300 });
                }
            } else {
                addScorePopup(x, y - 10, `${chainCount}x`);
            }
        } else {
            lastChainColor = color;
            chainCount = 1;
            chainTimer = now;
        }
    }

    // ── Update ──
    let muzzleFlash = 0;
    let muzzleType = 'normal';

    function update(dt) {
        frameCount++;

        // ── Vehicle section logic (feature 4) ──
        if (!vehicleSection.exited) {
            if (player.x >= vehicleSection.startX && !vehicleSection.entered) {
                vehicleSection.entered = true;
                vehicleSection.active = true;
                vehicleSection.tankX = player.x - 30;
                player.onVehicle = true;
                addScorePopup(player.x, player.y - 30, 'TANK SECTION!');
            }
            if (vehicleSection.active) {
                vehicleSection.tankX += vehicleSection.tankSpeed;
                player.x = vehicleSection.tankX + 30;
                player.y = vehicleSection.tankY - PLAYER_H;
                player.grounded = true;
                player.vy = 0;
                if (vehicleSection.tankX > vehicleSection.endX) {
                    vehicleSection.active = false;
                    vehicleSection.exited = true;
                    player.onVehicle = false;
                    addScorePopup(player.x, player.y - 30, 'DISMOUNT!');
                }
            }
        }

        // ── Player Input ──
        const ph = player.prone ? PRONE_H : PLAYER_H;

        if (!vehicleSection.active) {
            player.vx = 0;
            if (keys['ArrowLeft'] || keys['a'] || keys['A']) { player.vx = -PLAYER_SPEED; player.facing = -1; }
            if (keys['ArrowRight'] || keys['d'] || keys['D']) { player.vx = PLAYER_SPEED; player.facing = 1; }
        } else {
            player.facing = 1;
            player.vx = 0;
        }

        player.prone = !!(keys['ArrowDown'] || keys['s'] || keys['S']) && player.grounded && !vehicleSection.active;

        // Aim direction (8-way)
        let ax = player.facing, ay = 0;
        if (keys['ArrowUp'] || keys['w'] || keys['W']) ay = -1;
        if (keys['ArrowDown'] || keys['s'] || keys['S']) ay = 1;
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) ax = -1;
        if (keys['ArrowRight'] || keys['d'] || keys['D']) ax = 1;
        const alen = Math.sqrt(ax * ax + ay * ay) || 1;
        player.aimX = ax / alen;
        player.aimY = ay / alen;

        // Jump (not during vehicle)
        if (!vehicleSection.active && (keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' ']) && player.grounded && !player.prone) {
            player.vy = JUMP_VEL;
            player.grounded = false;
            sfxJump();
        }

        // Fire
        if (keys['z'] || keys['Z'] || keys['x'] || keys['X'] || keys['j'] || keys['J'] || keys[' ']) {
            fireBullet();
        }

        // ── Player Physics ──
        if (!vehicleSection.active) {
            player.vy += GRAVITY;
            if (player.vy > MAX_FALL) player.vy = MAX_FALL;
            player.x += player.vx;
            player.y += player.vy;

            if (player.x < cameraX - 10) player.x = cameraX - 10;
            if (player.x > LEVEL_LENGTH) player.x = LEVEL_LENGTH;

            const groundY = isOnGround(player.x, player.y, PLAYER_W, ph);
            if (groundY !== null && player.vy >= 0) {
                player.y = groundY - ph;
                player.vy = 0;
                player.grounded = true;
            } else {
                player.grounded = false;
            }

            if (player.y > GAME_H + 50) killPlayer();
        }

        if (player.invincible > 0) player.invincible--;

        // ── Camera ──
        const targetCam = player.x - GAME_W * 0.35;
        cameraX += (targetCam - cameraX) * 0.08;
        if (cameraX < 0) cameraX = 0;
        if (cameraX > LEVEL_LENGTH - GAME_W) cameraX = LEVEL_LENGTH - GAME_W;

        // ── Bullets ──
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            if (b.x < cameraX - 20 || b.x > cameraX + GAME_W + 20 || b.y < -20 || b.y > GAME_H + 20) {
                bullets.splice(i, 1);
                continue;
            }

            // Hit destructibles (feature 6)
            for (let di = destructibles.length - 1; di >= 0; di--) {
                const d = destructibles[di];
                if (!d.alive) continue;
                if (b.x > d.x && b.x < d.x + d.w && b.y > d.y && b.y < d.y + d.h) {
                    d.hp--;
                    if (d.hp <= 0) {
                        d.alive = false;
                        sfxDestroy();
                        spawnParticles(d.x + d.w/2, d.y + d.h/2, d.type === 'crate' ? '#8B6914' : '#888', 10, 4);
                        screenShake = 4;
                        // Secret drop
                        if (d.secret) {
                            if (d.secret === 'life') {
                                lives++;
                                addScorePopup(d.x, d.y - 15, 'EXTRA LIFE!');
                            } else {
                                powerups.push({ x: d.x, y: d.y - 10, w: 20, h: 20, type: d.secret, vy: -2, life: 400 });
                                addScorePopup(d.x, d.y - 15, 'SECRET!');
                            }
                        }
                    }
                    spawnParticles(b.x, b.y, '#fff', 3, 2);
                    if (!b.laser) { bullets.splice(i, 1); break; }
                }
            }
            if (i >= bullets.length) continue;

            // Hit barrels (hazards)
            for (const hz of hazards) {
                if (hz.type !== 'barrel' || !hz.alive) continue;
                if (b.x > hz.x && b.x < hz.x + hz.w && b.y > hz.y && b.y < hz.y + hz.h) {
                    hz.alive = false;
                    hz.explodeTimer = 1;
                    sfxBarrel();
                    if (!b.laser) { bullets.splice(i, 1); break; }
                }
            }
            if (i >= bullets.length) continue;

            // Hit enemies
            let hitSomething = false;
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];
                if (!e.alive) continue;
                if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
                    // Shield soldier: block frontal hits (feature 1)
                    if (e.type === 'shield' && e.shieldUp) {
                        const bulletFromFront = (b.vx > 0 && player.x < e.x) || (b.vx < 0 && player.x > e.x);
                        if (bulletFromFront) {
                            spawnParticles(b.x, b.y, '#FFD700', 4, 2);
                            hitSomething = true;
                            break; // blocked
                        }
                    }
                    e.hp--;
                    if (e.hp <= 0) {
                        e.alive = false;
                        const pts = { turret: 150, runner: 50, soldier: 100, sniper: 200, grenadier: 120, shield: 180 }[e.type] || 100;
                        score += pts;
                        addScorePopup(e.x, e.y - 10, `+${pts}`);
                        // Ragdoll death instead of just particles (feature 10)
                        spawnRagdoll(e.x, e.y, e.w, e.h, e.color, e.type);
                        spawnParticles(e.x + e.w/2, e.y + e.h/2, e.color, 8);
                        sfxHit();
                        registerKill(e.color, e.x, e.y);
                        if (Math.random() < 0.08) {
                            const wtype = pick(['spread', 'rapid', 'laser']);
                            powerups.push({ x: e.x, y: e.y, w: 20, h: 20, type: wtype, vy: -1, life: 300 });
                        }
                    } else {
                        spawnParticles(b.x, b.y, '#fff', 3, 2);
                    }
                    hitSomething = true;
                    break;
                }
            }

            // Hit mid-boss turrets (feature 3)
            if (midBossActive && midBoss && midBoss.alive && !hitSomething) {
                for (const t of midBoss.turrets) {
                    if (!t.alive) continue;
                    const tx = midBoss.x + t.offX, ty = midBoss.y + t.offY;
                    if (b.x > tx - 12 && b.x < tx + 12 && b.y > ty - 12 && b.y < ty + 12) {
                        t.hp--;
                        midBoss.flash = 4;
                        spawnParticles(b.x, b.y, '#fff', 4, 2);
                        hitSomething = true;
                        if (t.hp <= 0) {
                            t.alive = false;
                            spawnParticles(tx, ty, '#F97316', 15, 5);
                            sfxExplosion();
                            score += 300;
                            addScorePopup(tx, ty - 10, '+300');
                            midBoss.hp -= 5;
                            if (midBoss.hp <= 0) {
                                midBoss.alive = false;
                                midBossActive = false;
                                score += 1500;
                                addScorePopup(midBoss.x + 60, midBoss.y, '+1500 MID-BOSS DESTROYED');
                                spawnParticles(midBoss.x + 60, midBoss.y + 70, '#F97316', 40, 8);
                                sfxChain();
                                screenShake = 15;
                            }
                        }
                        break;
                    }
                }
            }

            // Hit boss
            if (bossActive && boss && boss.alive && !hitSomething) {
                if (b.x > boss.x && b.x < boss.x + boss.w && b.y > boss.y && b.y < boss.y + boss.h) {
                    boss.hp--;
                    boss.flash = 6;
                    spawnParticles(b.x, b.y, '#fff', 4, 2);
                    hitSomething = true;
                    if (boss.hp <= 0) {
                        boss.alive = false;
                        score += 2000;
                        addScorePopup(boss.x, boss.y - 30, '+2000 BOSS DESTROYED');
                        spawnParticles(boss.x + boss.w/2, boss.y + boss.h/2, '#F43F5E', 50, 8);
                        sfxChain();
                        state = ST_WIN;
                        deathTimer = 180;
                        if (score > highScore) { highScore = score; try { localStorage.setItem('ywa_contra_hi', String(highScore)); } catch {} }
                    }
                }
            }
            if (hitSomething) {
                if (b.laser) {
                    if (b.pierce !== undefined && b.pierce > 0) { b.pierce--; }
                    else { bullets.splice(i, 1); }
                } else {
                    bullets.splice(i, 1);
                }
            }
        }

        // ── Enemy Update ──
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (!e.alive) { enemies.splice(i, 1); continue; }
            if (e.x < cameraX - 100) { enemies.splice(i, 1); continue; }

            e.x += e.vx;
            e.vy = (e.vy || 0) + GRAVITY * 0.5;
            e.y += e.vy;
            const gy2 = isOnGround(e.x, e.y, e.w, e.h);
            if (gy2 !== null) { e.y = gy2 - e.h; e.vy = 0; }

            // Shield soldier faces player
            if (e.type === 'shield') {
                e.shieldAngle = Math.atan2(player.y - e.y, player.x - e.x);
            }

            // Firing
            e.fireTimer--;
            if (e.fireTimer <= 0 && e.type !== 'runner') {
                const dx = player.x - e.x, dy = player.y - e.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                if (dist < GAME_W * 0.8) {
                    if (e.type === 'sniper') {
                        // Sniper: accurate single shot, longer cooldown
                        e.fireTimer = rng(120, 200);
                        enemyBullets.push({
                            x: e.x + e.w/2, y: e.y + e.h/2,
                            vx: (dx / dist) * 6, vy: (dy / dist) * 6,
                            color: '#FF6600', type: 'sniper',
                        });
                    } else if (e.type === 'grenadier') {
                        // Grenadier: arc shot (feature 1)
                        e.fireTimer = rng(100, 180);
                        const arc_vx = (dx / dist) * 3;
                        const arc_vy = -5; // lob upward
                        enemyBullets.push({
                            x: e.x + e.w/2, y: e.y,
                            vx: arc_vx, vy: arc_vy,
                            color: '#FF4500', type: 'grenade', gravity: 0.15, bounces: 1,
                        });
                    } else if (e.type === 'shield') {
                        e.fireTimer = rng(100, 160);
                        // Shield soldiers fire less often
                        enemyBullets.push({
                            x: e.x + e.w/2, y: e.y + e.h/2,
                            vx: (dx / dist) * 3.5, vy: (dy / dist) * 3.5,
                            color: e.color,
                        });
                    } else {
                        e.fireTimer = rng(80, 160);
                        enemyBullets.push({
                            x: e.x + e.w/2, y: e.y + e.h/2,
                            vx: (dx / dist) * 4, vy: (dy / dist) * 4,
                            color: e.color,
                        });
                    }
                } else {
                    e.fireTimer = 30;
                }
            }

            // Contact damage
            if (player.invincible <= 0) {
                const ph2 = player.prone ? PRONE_H : PLAYER_H;
                if (rectOverlap({ x: player.x, y: player.y, w: PLAYER_W, h: ph2 }, e)) {
                    killPlayer();
                }
            }
        }

        // ── Enemy Bullets (with grenade physics) ──
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const b = enemyBullets[i];
            b.x += b.vx;
            if (b.gravity) {
                b.vy += b.gravity;
            }
            b.y += b.vy;

            // Grenade bouncing
            if (b.type === 'grenade') {
                const gHit = isOnGround(b.x - 4, b.y - 4, 8, 8);
                if (gHit !== null && b.vy > 0) {
                    if (b.bounces > 0) {
                        b.bounces--;
                        b.vy = -b.vy * 0.5;
                        b.y = gHit - 8;
                    } else {
                        // Explode
                        spawnParticles(b.x, b.y, '#FF4500', 12, 5);
                        sfxExplosion();
                        // Damage player in radius
                        if (player.invincible <= 0) {
                            const gDist = Math.sqrt((player.x - b.x) ** 2 + (player.y - b.y) ** 2);
                            if (gDist < 50) killPlayer();
                        }
                        enemyBullets.splice(i, 1);
                        continue;
                    }
                }
            }

            if (b.x < cameraX - 20 || b.x > cameraX + GAME_W + 20 || b.y < -20 || b.y > GAME_H + 20) {
                enemyBullets.splice(i, 1);
                continue;
            }
            // Hit player
            if (player.invincible <= 0) {
                const ph2 = player.prone ? PRONE_H : PLAYER_H;
                if (b.x > player.x && b.x < player.x + PLAYER_W && b.y > player.y && b.y < player.y + ph2) {
                    killPlayer();
                    enemyBullets.splice(i, 1);
                }
            }
        }

        // ── Mid-Boss Update (feature 3) ──
        if (midBossActive && midBoss && midBoss.alive) {
            if (midBoss.flash > 0) midBoss.flash--;
            for (const t of midBoss.turrets) {
                if (!t.alive) continue;
                t.angle = Math.atan2(player.y - (midBoss.y + t.offY), player.x - (midBoss.x + t.offX));
                t.fireTimer--;
                if (t.fireTimer <= 0) {
                    t.fireTimer = rng(50, 90);
                    const tx = midBoss.x + t.offX, ty = midBoss.y + t.offY;
                    enemyBullets.push({
                        x: tx, y: ty,
                        vx: Math.cos(t.angle) * 4, vy: Math.sin(t.angle) * 4,
                        color: '#F97316',
                    });
                }
            }
        }

        // ── Boss Update ──
        if (bossActive && boss && boss.alive) {
            boss.phaseTimer++;
            if (boss.flash > 0) boss.flash--;
            boss.fireTimer--;
            if (boss.fireTimer <= 0) {
                boss.fireTimer = boss.hp < 15 ? 20 : 40;
                const dx = player.x - boss.x, dy = player.y - boss.y;
                for (let a = -2; a <= 2; a++) {
                    const angle = Math.atan2(dy, dx) + a * 0.15;
                    enemyBullets.push({
                        x: boss.x, y: boss.y + boss.h/2,
                        vx: Math.cos(angle) * 3.5, vy: Math.sin(angle) * 3.5,
                        color: '#F43F5E',
                    });
                }
            }
        }

        // ── Spawn enemies ──
        if (!bossActive) {
            spawnTimer--;
            if (spawnTimer <= 0) {
                spawnTimer = spawnRate;
                if (enemies.length < 12) spawnEnemy();
            }
            // Mid-boss trigger
            if (player.x > LEVEL_LENGTH * 0.45 && !midBossActive && !midBoss) {
                spawnMidBoss();
            }
            // Boss trigger near end
            if (player.x > LEVEL_LENGTH - 500 && !bossActive) {
                spawnBoss();
            }
        }

        // ── Hazards Update (feature 2) ──
        for (const hz of hazards) {
            if (hz.type === 'barrel' && !hz.alive && hz.explodeTimer > 0) {
                hz.explodeTimer--;
                if (hz.explodeTimer <= 0) {
                    // Barrel explosion damage
                    spawnParticles(hz.x + hz.w/2, hz.y + hz.h/2, '#FF6600', 20, 6);
                    sfxExplosion();
                    screenShake = 8;
                    // Damage nearby enemies
                    for (const e of enemies) {
                        if (!e.alive) continue;
                        const dist = Math.sqrt((e.x - hz.x) ** 2 + (e.y - hz.y) ** 2);
                        if (dist < hz.explodeRadius) { e.hp -= 3; if (e.hp <= 0) { e.alive = false; spawnRagdoll(e.x, e.y, e.w, e.h, e.color, e.type); score += 50; } }
                    }
                    // Damage player
                    if (player.invincible <= 0) {
                        const pDist = Math.sqrt((player.x - hz.x) ** 2 + (player.y - hz.y) ** 2);
                        if (pDist < hz.explodeRadius) killPlayer();
                    }
                }
            }
            if (hz.type === 'fallingrock' && !hz.triggered) {
                if (Math.abs(player.x - hz.triggerX) < 100 && player.x > hz.triggerX - 120) {
                    hz.triggered = true;
                }
            }
            if (hz.type === 'fallingrock' && hz.triggered && hz.alive) {
                hz.vy += 0.3;
                hz.y += hz.vy;
                // Hit player
                if (player.invincible <= 0 && rectOverlap({ x: hz.x, y: hz.y, w: hz.w, h: hz.h }, { x: player.x, y: player.y, w: PLAYER_W, h: ph })) {
                    killPlayer();
                }
                // Hit ground
                if (hz.y > GAME_H - 40) {
                    hz.alive = false;
                    spawnParticles(hz.x + hz.w/2, GAME_H - 40, '#888', 8, 3);
                    screenShake = 3;
                }
            }
            if (hz.type === 'risingwater') {
                if (player.x > hz.x && player.x < hz.x + hz.w) {
                    hz.active = true;
                }
                if (hz.active && hz.waterLevel > hz.maxRise) {
                    hz.waterLevel -= hz.riseSpeed;
                    // Drown player if below water
                    if (player.invincible <= 0 && player.y + PLAYER_H > hz.waterLevel + 10 && player.x > hz.x && player.x < hz.x + hz.w) {
                        killPlayer();
                    }
                }
            }
        }

        // ── Powerups (feature 5: weapon combo upgrade) ──
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            p.vy += 0.2;
            p.y += p.vy;
            p.life--;
            const gy3 = isOnGround(p.x, p.y, p.w, p.h);
            if (gy3 !== null) { p.y = gy3 - p.h; p.vy = 0; }
            if (p.life <= 0 || p.y > GAME_H + 50) { powerups.splice(i, 1); continue; }

            const ph2 = player.prone ? PRONE_H : PLAYER_H;
            if (rectOverlap({ x: player.x, y: player.y, w: PLAYER_W, h: ph2 }, p)) {
                // Weapon combo: same weapon twice = upgrade
                if (weapon === p.type && weaponLevel < 2) {
                    weaponLevel = 2;
                    weaponTimer = 900;
                    sfxPowerup();
                    sfxChain();
                    const upgName = { spread: 'SPREAD+', rapid: 'RAPID+', laser: 'LASER+' }[p.type] || p.type.toUpperCase();
                    addScorePopup(p.x, p.y - 15, upgName + ' UPGRADE!');
                } else {
                    weapon = p.type;
                    weaponLevel = 1;
                    weaponTimer = 600;
                    sfxPowerup();
                    addScorePopup(p.x, p.y - 15, weapon.toUpperCase() + '!');
                }
                powerups.splice(i, 1);
            }
        }

        // Weapon timer
        if (weapon !== 'normal') {
            weaponTimer--;
            if (weaponTimer <= 0) { weapon = 'normal'; weaponLevel = 1; }
        }

        // ── Ragdoll Update (feature 10) ──
        for (let i = ragdolls.length - 1; i >= 0; i--) {
            const r = ragdolls[i];
            r.life--;
            if (r.life <= 0) { ragdolls.splice(i, 1); continue; }
            // Head physics
            r.headX += r.headVx; r.headY += r.headVy; r.headVy += 0.3; r.headR += r.headSpin;
            if (r.headY > GAME_H - 45) { r.headY = GAME_H - 45; r.headVy = -r.headVy * 0.3; r.headVx *= 0.8; }
            // Torso physics
            r.torsoX += r.torsoVx; r.torsoY += r.torsoVy; r.torsoVy += 0.25; r.torsoR += r.torsoSpin;
            if (r.torsoY > GAME_H - 48) { r.torsoY = GAME_H - 48; r.torsoVy = -r.torsoVy * 0.2; r.torsoVx *= 0.7; }
            // Leg physics
            r.legX += r.legVx; r.legY += r.legVy; r.legVy += 0.2; r.legR += r.legSpin;
            if (r.legY > GAME_H - 44) { r.legY = GAME_H - 44; r.legVy = 0; r.legVx *= 0.5; }
        }

        // ── Weather Update (feature 8) ──
        for (const wp of weatherParticles) {
            wp.x += wp.vx;
            wp.y += wp.vy;
            if (wp.y > GAME_H) {
                // Spawn rain splash on platform hit
                if (Math.random() < 0.3) {
                    rainSplashes.push({ x: wp.x + cameraX, y: GAME_H - 40, life: 8, maxLife: 8 });
                }
                wp.y = rng(-20, -5);
                wp.x = rng(0, GAME_W);
            }
            if (wp.x < -10) wp.x = GAME_W + 5;
        }
        for (let i = rainSplashes.length - 1; i >= 0; i--) {
            rainSplashes[i].life--;
            if (rainSplashes[i].life <= 0) rainSplashes.splice(i, 1);
        }

        // ── Particles ──
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.1;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Score Popups
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            scorePopups[i].y -= 0.8;
            scorePopups[i].life--;
            if (scorePopups[i].life <= 0) scorePopups.splice(i, 1);
        }

        // Screen shake decay
        if (screenShake > 0) screenShake *= 0.85;
        if (screenShake < 0.5) screenShake = 0;
    }

    function killPlayer() {
        if (player.invincible > 0) return;
        lives--;
        sfxDeath();
        spawnParticles(player.x + PLAYER_W/2, player.y + PLAYER_H/2, playerColor, 20, 5);
        screenShake = 12;
        if (vehicleSection.active) {
            vehicleSection.active = false;
            vehicleSection.exited = true;
            player.onVehicle = false;
        }
        if (lives <= 0) { state = ST_GAMEOVER; deathTimer = 120; if (score > highScore) { highScore = score; try { localStorage.setItem('ywa_contra_hi', String(highScore)); } catch {} } }
        else { state = ST_DEAD; deathTimer = 60; }
    }

    function respawn() {
        player.x = cameraX + 60;
        player.y = GAME_H - 120;
        player.vx = 0; player.vy = 0;
        player.invincible = 120;
        player.prone = false;
        player.onVehicle = false;
        weapon = 'normal'; weaponLevel = 1;
        enemyBullets = [];
        state = ST_PLAY;
    }

    // ── Glow Helper ──
    function drawGlow(x, y, r, color, alpha = 0.4) {
        const g = ctx.createRadialGradient(gx(x), gy(y), 0, gx(x), gy(y), gs(r));
        g.addColorStop(0, color);
        g.addColorStop(1, 'transparent');
        ctx.globalAlpha = alpha;
        ctx.fillStyle = g;
        ctx.fillRect(gx(x) - gs(r), gy(y) - gs(r), gs(r * 2), gs(r * 2));
        ctx.globalAlpha = 1;
    }

    // ── Draw ──
    function draw() {
        ctx.save();

        if (screenShake > 0) {
            ctx.translate(rng(-screenShake, screenShake) * SCALE, rng(-screenShake, screenShake) * SCALE);
        }

        // ── Sky gradient — richer with warm horizon ──
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#030308');
        grad.addColorStop(0.15, '#070718');
        grad.addColorStop(0.35, '#0a0a2a');
        grad.addColorStop(0.55, '#0f1535');
        grad.addColorStop(0.7, '#1a1a3e');
        grad.addColorStop(0.85, '#1e2848');
        grad.addColorStop(0.95, '#25303a');
        grad.addColorStop(1, '#1e2d4a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        // Warm horizon glow
        const hrzGrad = ctx.createLinearGradient(0, gy(GAME_H - 80), 0, gy(GAME_H - 30));
        hrzGrad.addColorStop(0, 'rgba(40,25,15,0)');
        hrzGrad.addColorStop(1, 'rgba(40,25,15,0.08)');
        ctx.fillStyle = hrzGrad;
        ctx.fillRect(0, gy(GAME_H - 80), W, gs(50));

        // ── Stars ──
        for (const s of stars) {
            const sx = ((s.x - cameraX * 0.05) % (GAME_W * 2) + GAME_W * 2) % (GAME_W * 2);
            if (sx > GAME_W) continue;
            const flicker = s.b + Math.sin(frameCount * 0.03 + s.x) * 0.3;
            ctx.globalAlpha = Math.max(0, Math.min(1, flicker));
            const colors = ['#fff', '#FFE4C4', '#B0C4FF', '#FFDAB9'];
            ctx.fillStyle = colors[Math.floor(s.x) % colors.length];
            const sz = s.s * (1 + Math.sin(frameCount * 0.05 + s.y) * 0.3);
            ctx.fillRect(gs(sx), gs(s.y), gs(sz), gs(sz));
            if (s.b > 0.7) drawGlow(sx, s.y, 4, '#fff', 0.1);
        }
        ctx.globalAlpha = 1;

        // ── Moon ──
        const moonX = GAME_W * 0.8 - cameraX * 0.02;
        const moonY = 60;
        drawGlow(moonX, moonY, 50, '#445577', 0.15);
        ctx.fillStyle = '#334466';
        ctx.beginPath(); ctx.arc(gs(moonX), gs(moonY), gs(20), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a3a55';
        ctx.beginPath(); ctx.arc(gs(moonX - 5), gs(moonY - 3), gs(4), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(gs(moonX + 7), gs(moonY + 5), gs(3), 0, Math.PI * 2); ctx.fill();

        // ── Parallax Background ──
        const layerColors = [['#0d1520','#141e30'],['#111d2b','#1a2940'],['#162235','#1f3050']];
        for (let li = 0; li < bgLayers.length; li++) {
            const layer = bgLayers[li];
            const [baseC, peakC] = layerColors[li];
            for (const hill of layer.hills) {
                const hx = (hill.x - cameraX * layer.speed);
                if (hx + hill.w < -50 || hx > GAME_W + 50) continue;
                const baseY = GAME_H - 40;
                const peakY = baseY - hill.h;
                ctx.beginPath();
                ctx.moveTo(gs(hx - 20), gy(baseY));
                ctx.quadraticCurveTo(gs(hx + hill.w * 0.25), gy(peakY + hill.h * 0.1), gs(hx + hill.w * 0.5), gy(peakY));
                ctx.quadraticCurveTo(gs(hx + hill.w * 0.75), gy(peakY + hill.h * 0.15), gs(hx + hill.w + 20), gy(baseY));
                ctx.closePath();
                const mg = ctx.createLinearGradient(0, gy(peakY), 0, gy(baseY));
                mg.addColorStop(0, peakC); mg.addColorStop(1, baseC);
                ctx.fillStyle = mg; ctx.fill();
                if (li === 0 && hill.h > 120) {
                    ctx.fillStyle = 'rgba(200,210,230,0.15)';
                    ctx.beginPath();
                    ctx.moveTo(gs(hx + hill.w * 0.4), gy(peakY + 15));
                    ctx.lineTo(gs(hx + hill.w * 0.5), gy(peakY));
                    ctx.lineTo(gs(hx + hill.w * 0.6), gy(peakY + 15));
                    ctx.closePath(); ctx.fill();
                }
            }
        }

        // Fog
        const fogGrad = ctx.createLinearGradient(0, gy(GAME_H - 120), 0, gy(GAME_H - 40));
        fogGrad.addColorStop(0, 'rgba(20,30,50,0)');
        fogGrad.addColorStop(1, 'rgba(20,30,50,0.3)');
        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, gy(GAME_H - 120), W, gs(80));

        // ── Rising water hazard rendering (feature 2) ──
        for (const hz of hazards) {
            if (hz.type === 'risingwater' && hz.active) {
                const wx = hz.x - cameraX;
                if (wx + hz.w < 0 || wx > GAME_W) continue;
                const wGrad = ctx.createLinearGradient(0, gy(hz.waterLevel), 0, gy(GAME_H));
                wGrad.addColorStop(0, 'rgba(30,80,180,0.35)');
                wGrad.addColorStop(0.5, 'rgba(20,60,150,0.5)');
                wGrad.addColorStop(1, 'rgba(10,30,80,0.65)');
                ctx.fillStyle = wGrad;
                ctx.fillRect(gx(hz.x), gy(hz.waterLevel), gs(hz.w), gs(GAME_H - hz.waterLevel));
                // Water surface shimmer
                ctx.strokeStyle = 'rgba(100,180,255,0.4)';
                ctx.lineWidth = gs(2);
                ctx.beginPath();
                for (let wx2 = hz.x; wx2 < hz.x + hz.w; wx2 += 8) {
                    const wave = Math.sin(frameCount * 0.06 + wx2 * 0.05) * 3;
                    if (wx2 === hz.x) ctx.moveTo(gx(wx2), gy(hz.waterLevel + wave));
                    else ctx.lineTo(gx(wx2), gy(hz.waterLevel + wave));
                }
                ctx.stroke();
            }
        }

        // ── Platforms ──
        for (const p of platforms) {
            if (p.type === 'gap') continue;
            const px2 = p.x - cameraX;
            if (px2 + p.w < -10 || px2 > GAME_W + 10) continue;

            // Sprite-based platform rendering
            let platSpriteDrawn = false;
            if (allSpritesReady) {
                const tileW = 40;
                if (p.type === 'ground') {
                    const grassImg = sprites['grassMid'];
                    const dirtImg = sprites['grassCenter'];
                    if (grassImg) {
                        for (let tx = p.x; tx < p.x + p.w; tx += tileW) {
                            const screenX = tx - cameraX;
                            if (screenX + tileW < -5 || screenX > GAME_W + 5) continue;
                            ctx.drawImage(grassImg, gx(tx), gy(p.y), gs(tileW), gs(20));
                            if (dirtImg) ctx.drawImage(dirtImg, gx(tx), gy(p.y + 20), gs(tileW), gs(p.h - 20));
                        }
                        platSpriteDrawn = true;
                    }
                } else {
                    const stoneImg = sprites['stoneMid'];
                    if (stoneImg) {
                        for (let tx = p.x; tx < p.x + p.w; tx += tileW) {
                            const screenX = tx - cameraX;
                            if (screenX + tileW < -5 || screenX > GAME_W + 5) continue;
                            ctx.drawImage(stoneImg, gx(tx), gy(p.y), gs(tileW), gs(p.h + 4));
                        }
                        platSpriteDrawn = true;
                    }
                }
            }

            if (!platSpriteDrawn && p.type === 'ground') {
                const gGrad = ctx.createLinearGradient(0, gy(p.y), 0, gy(p.y + p.h));
                gGrad.addColorStop(0, '#2a3a2a');
                gGrad.addColorStop(0.3, '#1e2e1e');
                gGrad.addColorStop(1, '#151f15');
                ctx.fillStyle = gGrad;
                ctx.fillRect(gx(p.x), gy(p.y), gs(p.w), gs(p.h));
                ctx.fillStyle = '#3a7a35';
                ctx.fillRect(gx(p.x), gy(p.y), gs(p.w), gs(4));
                ctx.fillStyle = '#4a9a45';
                ctx.fillRect(gx(p.x), gy(p.y), gs(p.w), gs(2));
                ctx.strokeStyle = '#4aaa45';
                ctx.lineWidth = gs(1);
                for (let gxi = p.x; gxi < p.x + p.w; gxi += 12) {
                    if (gxi - cameraX < -5 || gxi - cameraX > GAME_W + 5) continue;
                    const sway = Math.sin(frameCount * 0.04 + gxi * 0.1) * 2;
                    ctx.beginPath();
                    ctx.moveTo(gx(gxi), gy(p.y));
                    ctx.lineTo(gx(gxi + sway), gy(p.y - 5 - Math.random() * 3));
                    ctx.stroke();
                }
                ctx.fillStyle = '#2a3020';
                for (let dx = p.x; dx < p.x + p.w; dx += 30) {
                    if (dx - cameraX < -5 || dx - cameraX > GAME_W + 5) continue;
                    ctx.fillRect(gx(dx + 5), gy(p.y + 8), gs(3), gs(2));
                    ctx.fillRect(gx(dx + 15), gy(p.y + 14), gs(2), gs(2));
                }
            } else if (!platSpriteDrawn) {
                const pGrad = ctx.createLinearGradient(0, gy(p.y), 0, gy(p.y + p.h));
                pGrad.addColorStop(0, '#6a6a7a');
                pGrad.addColorStop(0.5, '#4a4a5a');
                pGrad.addColorStop(1, '#3a3a4a');
                ctx.fillStyle = pGrad;
                ctx.fillRect(gx(p.x), gy(p.y), gs(p.w), gs(p.h));
                ctx.fillStyle = '#8a8a9a';
                ctx.fillRect(gx(p.x), gy(p.y), gs(p.w), gs(2));
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.fillRect(gx(p.x), gy(p.y + p.h - 2), gs(p.w), gs(2));
                ctx.fillStyle = '#555';
                for (let rx = p.x + 8; rx < p.x + p.w - 8; rx += 20) {
                    ctx.beginPath();
                    ctx.arc(gx(rx), gy(p.y + p.h/2), gs(2), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // ── Destructibles (feature 6) ──
        for (const d of destructibles) {
            if (!d.alive) continue;
            const dx = d.x - cameraX;
            if (dx + d.w < -5 || dx > GAME_W + 5) continue;
            let destSpriteDrawn = false;
            if (allSpritesReady) {
                const dImg = sprites[d.type === 'crate' ? 'boxCrate' : 'rock'];
                if (dImg) {
                    ctx.drawImage(dImg, gx(d.x), gy(d.y), gs(d.w), gs(d.h));
                    if (d.secret) {
                        ctx.fillStyle = 'rgba(255,200,50,0.2)';
                        ctx.fillRect(gx(d.x + 2), gy(d.y + 2), gs(d.w - 4), gs(d.h - 4));
                    }
                    destSpriteDrawn = true;
                }
            }
            if (!destSpriteDrawn && d.type === 'crate') {
                ctx.fillStyle = '#6B4423';
                ctx.fillRect(gx(d.x), gy(d.y), gs(d.w), gs(d.h));
                ctx.strokeStyle = '#4A2F14';
                ctx.lineWidth = gs(1.5);
                ctx.strokeRect(gx(d.x + 1), gy(d.y + 1), gs(d.w - 2), gs(d.h - 2));
                // Cross bands
                ctx.strokeStyle = '#8B6914';
                ctx.lineWidth = gs(1);
                ctx.beginPath();
                ctx.moveTo(gx(d.x), gy(d.y)); ctx.lineTo(gx(d.x + d.w), gy(d.y + d.h));
                ctx.moveTo(gx(d.x + d.w), gy(d.y)); ctx.lineTo(gx(d.x), gy(d.y + d.h));
                ctx.stroke();
                // Secret indicator (subtle glow)
                if (d.secret) {
                    ctx.fillStyle = 'rgba(255,200,50,0.15)';
                    ctx.fillRect(gx(d.x + 2), gy(d.y + 2), gs(d.w - 4), gs(d.h - 4));
                }
            } else if (!destSpriteDrawn) { // wall
                ctx.fillStyle = '#555';
                ctx.fillRect(gx(d.x), gy(d.y), gs(d.w), gs(d.h));
                ctx.fillStyle = '#666';
                ctx.fillRect(gx(d.x), gy(d.y), gs(d.w), gs(3));
                ctx.strokeStyle = '#444';
                ctx.lineWidth = gs(0.5);
                ctx.beginPath();
                ctx.moveTo(gx(d.x + 5), gy(d.y + 5));
                ctx.lineTo(gx(d.x + 12), gy(d.y + 14));
                ctx.lineTo(gx(d.x + 8), gy(d.y + 20));
                ctx.stroke();
            }
        }

        // ── Exploding barrels (feature 2) ──
        for (const hz of hazards) {
            if (hz.type === 'barrel' && hz.alive) {
                const bx = hz.x - cameraX;
                if (bx + hz.w < -5 || bx > GAME_W + 5) continue;
                // Try sprite
                if (allSpritesReady && sprites['boxExplosive']) {
                    ctx.drawImage(sprites['boxExplosive'], gx(hz.x), gy(hz.y), gs(hz.w), gs(hz.h));
                    continue;
                }
                // Red barrel body fallback
                ctx.fillStyle = '#CC2200';
                ctx.fillRect(gx(hz.x), gy(hz.y), gs(hz.w), gs(hz.h));
                ctx.fillStyle = '#FF4400';
                ctx.fillRect(gx(hz.x + 2), gy(hz.y + 2), gs(hz.w - 4), gs(hz.h * 0.4));
                // Danger stripe
                ctx.fillStyle = '#FFD700';
                ctx.fillRect(gx(hz.x), gy(hz.y + hz.h * 0.45), gs(hz.w), gs(3));
                // Warning icon
                ctx.fillStyle = '#000';
                ctx.font = `bold ${gs(8)}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('!', gx(hz.x + hz.w/2), gy(hz.y + hz.h * 0.75));
                ctx.textAlign = 'left';
            }
            // Falling rocks (feature 2)
            if (hz.type === 'fallingrock' && hz.triggered && hz.alive) {
                ctx.fillStyle = '#7a7a7a';
                ctx.save();
                ctx.translate(gx(hz.x + hz.w/2), gy(hz.y + hz.h/2));
                ctx.rotate(frameCount * 0.1);
                ctx.fillRect(-gs(hz.w/2), -gs(hz.h/2), gs(hz.w), gs(hz.h));
                ctx.fillStyle = '#999';
                ctx.fillRect(-gs(hz.w/2 - 2), -gs(hz.h/2 - 2), gs(hz.w * 0.4), gs(hz.h * 0.4));
                ctx.restore();
            }
        }

        // ── Vehicle / Tank (feature 4) ──
        if (vehicleSection.active || (vehicleSection.entered && !vehicleSection.exited)) {
            const tx = vehicleSection.tankX, ty = vehicleSection.tankY;
            // Treads
            ctx.fillStyle = '#333';
            ctx.fillRect(gx(tx - 15), gy(ty + 15), gs(90), gs(18));
            ctx.fillStyle = '#444';
            for (let tw = tx - 12; tw < tx + 72; tw += 10) {
                ctx.fillRect(gx(tw), gy(ty + 17), gs(7), gs(14));
            }
            // Hull
            ctx.fillStyle = '#4a5a3a';
            ctx.beginPath();
            ctx.roundRect(gx(tx - 5), gy(ty - 5), gs(70), gs(25), gs(4));
            ctx.fill();
            ctx.fillStyle = '#5a6a4a';
            ctx.fillRect(gx(tx), gy(ty - 3), gs(60), gs(4));
            // Turret base
            ctx.fillStyle = '#3a4a2a';
            ctx.beginPath();
            ctx.roundRect(gx(tx + 15), gy(ty - 18), gs(30), gs(16), gs(3));
            ctx.fill();
            // Barrel
            ctx.strokeStyle = '#556';
            ctx.lineWidth = gs(4);
            ctx.beginPath();
            ctx.moveTo(gx(tx + 45), gy(ty - 12));
            ctx.lineTo(gx(tx + 75), gy(ty - 12));
            ctx.stroke();
            // Star emblem
            ctx.fillStyle = '#FFD700';
            ctx.font = `bold ${gs(8)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('*', gx(tx + 30), gy(ty + 5));
            ctx.textAlign = 'left';
        }

        // ── Powerups ──
        for (const p of powerups) {
            const blink = Math.sin(frameCount * 0.15) > 0;
            if (!blink && p.life < 100) continue;
            const pc = p.type === 'spread' ? '#F59E0B' : (p.type === 'rapid' ? '#EF4444' : '#3B82F6');
            drawGlow(p.x + p.w/2, p.y + p.h/2, 18, pc, 0.3);
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.roundRect(gx(p.x - 1), gy(p.y - 1), gs(p.w + 2), gs(p.h + 2), gs(4));
            ctx.fill();
            ctx.fillStyle = pc;
            ctx.beginPath();
            ctx.roundRect(gx(p.x), gy(p.y), gs(p.w), gs(p.h), gs(3));
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${gs(12)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.type[0].toUpperCase(), gx(p.x + p.w/2), gy(p.y + p.h/2 + 1));
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
        }

        // ── Enemies ──
        for (const e of enemies) {
            if (!e.alive) continue;
            const ex = e.x - cameraX;
            if (ex + e.w < -5 || ex > GAME_W + 5) continue;

            const gdir = player.x > e.x ? 1 : -1;
            const cx = e.x + e.w/2, cy = e.y;

            drawGlow(cx, cy + e.h/2, 20, e.color, 0.12);

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath();
            ctx.ellipse(gx(cx), gy(e.y + e.h + 2), gs(10), gs(3), 0, 0, Math.PI * 2);
            ctx.fill();

            // Try sprite rendering for enemies
            let enemySpriteDrawn = false;
            if (allSpritesReady) {
                const anim = Math.floor(frameCount / 10) % 2 === 0;
                let eSpr = null;
                if (e.type === 'turret') eSpr = sprites[anim ? 'enemySaw' : 'enemySawM'];
                else if (e.type === 'sniper') eSpr = sprites[anim ? 'enemyBee' : 'enemyBeeM'];
                else if (e.type === 'grenadier') eSpr = sprites[anim ? 'enemyFly' : 'enemyFlyM'];
                else if (e.type === 'shield') eSpr = sprites[anim ? 'enemySnail' : 'enemySnailM'];
                else if (e.type === 'runner') eSpr = sprites[anim ? 'enemyMouse' : 'enemyMouseM'];
                else eSpr = sprites[anim ? 'enemySlime' : 'enemySlimeM'];
                if (eSpr) {
                    enemySpriteDrawn = drawSprite(eSpr, e.x - 4, e.y - 4, e.w + 8, e.h + 8, gdir < 0);
                }
            }

            if (!enemySpriteDrawn && e.type === 'turret') {
                ctx.fillStyle = '#444';
                ctx.fillRect(gx(e.x - 4), gy(e.y + e.h - 12), gs(e.w + 8), gs(12));
                ctx.fillStyle = '#555';
                ctx.fillRect(gx(e.x - 2), gy(e.y + e.h - 14), gs(e.w + 4), gs(4));
                ctx.fillStyle = e.color;
                ctx.beginPath();
                ctx.arc(gx(cx), gy(e.y + e.h - 14), gs(12), Math.PI, 0);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.fillRect(gx(cx - 6 * gdir), gy(e.y + e.h - 22), gs(8), gs(3));
                ctx.fillStyle = '#111';
                ctx.fillRect(gx(cx - 4 * gdir), gy(e.y + e.h - 22), gs(4), gs(3));
                ctx.strokeStyle = '#777';
                ctx.lineWidth = gs(4);
                ctx.beginPath();
                ctx.moveTo(gx(cx), gy(e.y + e.h - 18));
                const bAngle = Math.atan2(player.y - (e.y + e.h - 18), player.x - cx);
                ctx.lineTo(gx(cx + Math.cos(bAngle) * 20), gy(e.y + e.h - 18 + Math.sin(bAngle) * 20));
                ctx.stroke();
            } else if (!enemySpriteDrawn && e.type === 'sniper') {
                // Sniper: camo-themed, scope glint (feature 1)
                const lo = 0; // stationary
                // Body — darker tone
                ctx.fillStyle = darkenColor(e.color, 0.5);
                ctx.fillRect(gx(e.x + 4), gy(e.y + 10), gs(e.w - 8), gs(e.h - 18));
                ctx.fillStyle = e.color;
                ctx.fillRect(gx(e.x + 6), gy(e.y + 12), gs(e.w - 12), gs(4));
                // Head with hood
                ctx.fillStyle = darkenColor(e.color, 0.4);
                ctx.beginPath();
                ctx.arc(gx(cx), gy(e.y + 5), gs(8), 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#d4a574';
                ctx.beginPath();
                ctx.arc(gx(cx + gdir * 2), gy(e.y + 7), gs(4), 0, Math.PI * 2);
                ctx.fill();
                // Scope glint
                const glint = Math.sin(frameCount * 0.1) > 0.7;
                if (glint) {
                    ctx.fillStyle = '#FF0';
                    ctx.beginPath();
                    ctx.arc(gx(cx + gdir * 18), gy(e.y + 14), gs(2), 0, Math.PI * 2);
                    ctx.fill();
                    drawGlow(cx + gdir * 18, e.y + 14, 6, '#FF0', 0.3);
                }
                // Sniper rifle
                ctx.strokeStyle = '#555';
                ctx.lineWidth = gs(2.5);
                ctx.beginPath();
                ctx.moveTo(gx(cx), gy(e.y + 16));
                ctx.lineTo(gx(cx + gdir * 22), gy(e.y + 14));
                ctx.stroke();
                // Legs
                ctx.fillStyle = darkenColor(e.color, 0.6);
                ctx.fillRect(gx(e.x + 6), gy(e.y + e.h - 10), gs(5), gs(10));
                ctx.fillRect(gx(e.x + e.w - 11), gy(e.y + e.h - 10), gs(5), gs(10));
            } else if (!enemySpriteDrawn && e.type === 'grenadier') {
                // Grenadier: bulky, holding grenade (feature 1)
                const lo = Math.sin(frameCount * 0.2 + e.x) * 3;
                // Legs
                ctx.fillStyle = darkenColor(e.color, 0.6);
                ctx.fillRect(gx(e.x + 6), gy(e.y + e.h - 10 + lo), gs(5), gs(10));
                ctx.fillRect(gx(e.x + e.w - 11), gy(e.y + e.h - 10 - lo), gs(5), gs(10));
                // Bulky torso
                ctx.fillStyle = e.color;
                ctx.fillRect(gx(e.x + 2), gy(e.y + 10), gs(e.w - 4), gs(e.h - 18));
                ctx.fillStyle = darkenColor(e.color, 0.7);
                ctx.fillRect(gx(e.x + 3), gy(e.y + 12), gs(e.w - 6), gs(3));
                // Ammo belt
                ctx.fillStyle = '#8B6914';
                ctx.fillRect(gx(e.x + 3), gy(e.y + e.h - 18), gs(e.w - 6), gs(3));
                // Head
                ctx.fillStyle = '#d4a574';
                ctx.beginPath(); ctx.arc(gx(cx), gy(e.y + 7), gs(7), 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = darkenColor(e.color, 0.5);
                ctx.beginPath(); ctx.arc(gx(cx), gy(e.y + 5), gs(8), Math.PI, 0); ctx.fill();
                // Grenade in hand
                ctx.fillStyle = '#444';
                ctx.beginPath();
                ctx.arc(gx(e.x + (gdir > 0 ? e.w + 4 : -4)), gy(e.y + 18), gs(4), 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#FF4500';
                ctx.beginPath();
                ctx.arc(gx(e.x + (gdir > 0 ? e.w + 4 : -4)), gy(e.y + 18), gs(2.5), 0, Math.PI * 2);
                ctx.fill();
            } else if (!enemySpriteDrawn && e.type === 'shield') {
                // Shield soldier (feature 1)
                const lo = Math.sin(frameCount * 0.25 + e.x) * 4;
                // Legs
                ctx.fillStyle = darkenColor(e.color, 0.6);
                ctx.fillRect(gx(e.x + 6), gy(e.y + e.h - 10 + lo), gs(5), gs(10));
                ctx.fillRect(gx(e.x + e.w - 11), gy(e.y + e.h - 10 - lo), gs(5), gs(10));
                ctx.fillStyle = '#333';
                ctx.fillRect(gx(e.x + 5), gy(e.y + e.h - 2 + lo), gs(7), gs(3));
                ctx.fillRect(gx(e.x + e.w - 12), gy(e.y + e.h - 2 - lo), gs(7), gs(3));
                // Torso
                ctx.fillStyle = e.color;
                ctx.fillRect(gx(e.x + 4), gy(e.y + 10), gs(e.w - 8), gs(e.h - 18));
                // Shield (front-facing)
                const shieldX = e.x + (gdir > 0 ? -8 : e.w - 2);
                ctx.fillStyle = '#C0C0C0';
                ctx.beginPath();
                ctx.roundRect(gx(shieldX), gy(e.y + 4), gs(10), gs(e.h - 8), gs(2));
                ctx.fill();
                ctx.fillStyle = '#A0A0A0';
                ctx.beginPath();
                ctx.roundRect(gx(shieldX + 1), gy(e.y + 6), gs(8), gs(e.h - 12), gs(1));
                ctx.fill();
                // Shield cross
                ctx.strokeStyle = '#888';
                ctx.lineWidth = gs(1);
                ctx.beginPath();
                ctx.moveTo(gx(shieldX + 5), gy(e.y + 8));
                ctx.lineTo(gx(shieldX + 5), gy(e.y + e.h - 6));
                ctx.moveTo(gx(shieldX + 2), gy(e.y + e.h/2));
                ctx.lineTo(gx(shieldX + 8), gy(e.y + e.h/2));
                ctx.stroke();
                // Head
                ctx.fillStyle = '#d4a574';
                ctx.beginPath(); ctx.arc(gx(cx), gy(e.y + 7), gs(7), 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = darkenColor(e.color, 0.5);
                ctx.beginPath(); ctx.arc(gx(cx), gy(e.y + 5), gs(8), Math.PI, 0); ctx.fill();
                ctx.fillStyle = '#111';
                ctx.fillRect(gx(cx + gdir * 2), gy(e.y + 6), gs(2), gs(2));
            } else if (!enemySpriteDrawn) {
                // Standard soldier / runner
                const running = e.type === 'runner';
                const legSpeed = running ? 0.4 : 0.2;
                const legAmp = running ? 6 : 3;
                const lo = Math.sin(frameCount * legSpeed + e.x) * legAmp;
                ctx.fillStyle = darkenColor(e.color, 0.6);
                ctx.fillRect(gx(e.x + 6), gy(e.y + e.h - 10 + lo), gs(5), gs(10));
                ctx.fillRect(gx(e.x + e.w - 11), gy(e.y + e.h - 10 - lo), gs(5), gs(10));
                ctx.fillStyle = '#333';
                ctx.fillRect(gx(e.x + 5), gy(e.y + e.h - 2 + lo), gs(7), gs(3));
                ctx.fillRect(gx(e.x + e.w - 12), gy(e.y + e.h - 2 - lo), gs(7), gs(3));
                ctx.fillStyle = e.color;
                ctx.fillRect(gx(e.x + 4), gy(e.y + 10), gs(e.w - 8), gs(e.h - 18));
                ctx.fillStyle = lightenColor(e.color, 0.2);
                ctx.fillRect(gx(e.x + 6), gy(e.y + 12), gs(e.w - 12), gs(4));
                ctx.fillStyle = darkenColor(e.color, 0.7);
                ctx.fillRect(gx(e.x + (gdir > 0 ? 1 : e.w - 5)), gy(e.y + 12), gs(4), gs(12));
                const armX = e.x + (gdir > 0 ? e.w - 5 : 1);
                ctx.fillRect(gx(armX), gy(e.y + 12), gs(4), gs(10));
                ctx.fillStyle = '#d4a574';
                ctx.beginPath(); ctx.arc(gx(cx), gy(e.y + 7), gs(7), 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = darkenColor(e.color, 0.5);
                ctx.beginPath(); ctx.arc(gx(cx), gy(e.y + 5), gs(8), Math.PI, 0); ctx.fill();
                ctx.fillStyle = '#111';
                ctx.fillRect(gx(cx + gdir * 2), gy(e.y + 6), gs(2), gs(2));
                ctx.fillStyle = '#888';
                ctx.strokeStyle = '#666';
                ctx.lineWidth = gs(3);
                ctx.beginPath();
                ctx.moveTo(gx(armX + 2), gy(e.y + 16));
                ctx.lineTo(gx(armX + 2 + gdir * 16), gy(e.y + 16));
                ctx.stroke();
                ctx.fillStyle = '#555';
                ctx.fillRect(gx(armX + 2 + gdir * 14), gy(e.y + 14), gs(4), gs(6));
            }
        }

        // ── Ragdoll corpses (feature 10) ──
        for (const r of ragdolls) {
            const alpha = Math.min(1, r.life / 30);
            ctx.globalAlpha = alpha;
            // Head
            ctx.save();
            ctx.translate(gx(r.headX), gy(r.headY));
            ctx.rotate(r.headR);
            ctx.fillStyle = '#d4a574';
            ctx.beginPath(); ctx.arc(0, 0, gs(5), 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            // Torso
            ctx.save();
            ctx.translate(gx(r.torsoX), gy(r.torsoY));
            ctx.rotate(r.torsoR);
            ctx.fillStyle = r.color;
            ctx.fillRect(-gs(6), -gs(8), gs(12), gs(16));
            ctx.restore();
            // Legs
            ctx.save();
            ctx.translate(gx(r.legX), gy(r.legY));
            ctx.rotate(r.legR);
            ctx.fillStyle = darkenColor(r.color, 0.6);
            ctx.fillRect(-gs(4), -gs(5), gs(4), gs(10));
            ctx.fillRect(gs(1), -gs(5), gs(4), gs(10));
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        // ── Mid-Boss (feature 3) ──
        if (midBossActive && midBoss && midBoss.alive) {
            const mbx = midBoss.x, mby = midBoss.y;
            const flash = midBoss.flash > 0;
            // Wall mount base
            ctx.fillStyle = flash ? '#fff' : '#3a3a4a';
            ctx.beginPath();
            ctx.roundRect(gx(mbx), gy(mby), gs(midBoss.w), gs(midBoss.h), gs(6));
            ctx.fill();
            // Armor plating
            ctx.fillStyle = '#4a4a5a';
            ctx.fillRect(gx(mbx + 5), gy(mby + 5), gs(midBoss.w - 10), gs(midBoss.h - 10));
            ctx.strokeStyle = '#555';
            ctx.lineWidth = gs(1);
            for (let ly = mby + 20; ly < mby + midBoss.h - 10; ly += 25) {
                ctx.beginPath(); ctx.moveTo(gx(mbx + 8), gy(ly)); ctx.lineTo(gx(mbx + midBoss.w - 8), gy(ly)); ctx.stroke();
            }
            // Turret nodes
            for (const t of midBoss.turrets) {
                const tx = mbx + t.offX, ty = mby + t.offY;
                if (!t.alive) {
                    // Destroyed turret
                    ctx.fillStyle = '#333';
                    ctx.beginPath(); ctx.arc(gx(tx), gy(ty), gs(8), 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#555';
                    ctx.lineWidth = gs(1);
                    ctx.beginPath();
                    ctx.moveTo(gx(tx - 5), gy(ty - 5)); ctx.lineTo(gx(tx + 5), gy(ty + 5));
                    ctx.moveTo(gx(tx + 5), gy(ty - 5)); ctx.lineTo(gx(tx - 5), gy(ty + 5));
                    ctx.stroke();
                    continue;
                }
                // Active turret node
                ctx.fillStyle = '#F97316';
                ctx.beginPath(); ctx.arc(gx(tx), gy(ty), gs(10), 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#222';
                ctx.beginPath(); ctx.arc(gx(tx), gy(ty), gs(7), 0, Math.PI * 2); ctx.fill();
                // Barrel
                ctx.strokeStyle = '#888';
                ctx.lineWidth = gs(3);
                ctx.beginPath();
                ctx.moveTo(gx(tx), gy(ty));
                ctx.lineTo(gx(tx + Math.cos(t.angle) * 16), gy(ty + Math.sin(t.angle) * 16));
                ctx.stroke();
                // Eye glow
                ctx.fillStyle = '#F97316';
                ctx.shadowColor = '#F97316';
                ctx.shadowBlur = gs(6);
                ctx.beginPath(); ctx.arc(gx(tx), gy(ty), gs(3), 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            }
            // HP bar
            const hpBarW = midBoss.w;
            ctx.fillStyle = '#111';
            ctx.fillRect(gx(mbx), gy(mby - 18), gs(hpBarW), gs(8));
            const hpPct = midBoss.hp / midBoss.maxHp;
            ctx.fillStyle = '#F97316';
            ctx.fillRect(gx(mbx + 1), gy(mby - 17), gs((hpBarW - 2) * hpPct), gs(6));
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${gs(9)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('TURRET ARRAY', gx(mbx + midBoss.w/2), gy(mby - 22));
            ctx.textAlign = 'left';
        }

        // ── Boss ──
        if (bossActive && boss && boss.alive) {
            const bx = boss.x, by = boss.y, bw = boss.w, bh = boss.h;
            const bc = boss.flash > 0 ? '#fff' : boss.color;
            const pulse = Math.sin(frameCount * 0.06) * 0.15;
            drawGlow(bx + bw/2, by + bh/2, 80, '#F43F5E', 0.1 + pulse * 0.05);
            ctx.fillStyle = '#333';
            ctx.fillRect(gx(bx - 10), gy(by + bh - 20), gs(bw + 20), gs(20));
            ctx.fillStyle = '#444';
            for (let tx = bx - 8; tx < bx + bw + 8; tx += 12) {
                ctx.fillRect(gx(tx), gy(by + bh - 18), gs(8), gs(16));
            }
            const bodyGrad = ctx.createLinearGradient(gx(bx), gy(by + 20), gx(bx), gy(by + bh - 20));
            bodyGrad.addColorStop(0, bc);
            bodyGrad.addColorStop(0.5, darkenColor(bc, 0.7));
            bodyGrad.addColorStop(1, darkenColor(bc, 0.4));
            ctx.fillStyle = bodyGrad;
            ctx.beginPath();
            ctx.roundRect(gx(bx + 5), gy(by + 20), gs(bw - 10), gs(bh - 40), gs(6));
            ctx.fill();
            ctx.strokeStyle = darkenColor(bc, 0.5);
            ctx.lineWidth = gs(1);
            for (let ly = by + 30; ly < by + bh - 25; ly += 15) {
                ctx.beginPath(); ctx.moveTo(gx(bx + 10), gy(ly)); ctx.lineTo(gx(bx + bw - 10), gy(ly)); ctx.stroke();
            }
            ctx.fillStyle = '#555';
            ctx.fillRect(gx(bx - 25), gy(by + 25), gs(30), gs(12));
            ctx.fillRect(gx(bx + bw - 5), gy(by + 25), gs(30), gs(12));
            ctx.fillStyle = '#777';
            ctx.beginPath(); ctx.arc(gx(bx - 25), gy(by + 31), gs(6), 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(gx(bx + bw + 25), gy(by + 31), gs(6), 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.roundRect(gx(bx + 15), gy(by + 5), gs(bw - 30), gs(25), gs(4));
            ctx.fill();
            const visorGlow = boss.hp < 10 ? '#FF0000' : '#F43F5E';
            ctx.fillStyle = visorGlow;
            ctx.shadowColor = visorGlow;
            ctx.shadowBlur = gs(8);
            ctx.fillRect(gx(bx + 20), gy(by + 12), gs(bw - 40), gs(6));
            ctx.shadowBlur = 0;
            const scanX = bx + 22 + ((frameCount * 2) % (bw - 44));
            ctx.fillStyle = '#fff';
            ctx.fillRect(gx(scanX), gy(by + 13), gs(8), gs(4));
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.arc(gx(bx + bw/2), gy(by + bh/2 + 5), gs(16), 0, Math.PI * 2); ctx.fill();
            const coreColor = boss.hp < 10 ? '#FF4444' : '#F43F5E';
            ctx.fillStyle = coreColor;
            ctx.shadowColor = coreColor;
            ctx.shadowBlur = gs(10 + pulse * 20);
            ctx.beginPath(); ctx.arc(gx(bx + bw/2), gy(by + bh/2 + 5), gs(10 + pulse * 3), 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            const hpBarW = bw + 20;
            ctx.fillStyle = '#111';
            ctx.fillRect(gx(bx - 10), gy(by - 20), gs(hpBarW), gs(10));
            ctx.strokeStyle = '#555';
            ctx.lineWidth = gs(1);
            ctx.strokeRect(gx(bx - 10), gy(by - 20), gs(hpBarW), gs(10));
            const hpPct = boss.hp / boss.maxHp;
            const hpColor = hpPct > 0.5 ? '#EF4444' : (hpPct > 0.25 ? '#F59E0B' : '#FF0000');
            ctx.fillStyle = hpColor;
            ctx.fillRect(gx(bx - 8), gy(by - 18), gs((hpBarW - 4) * hpPct), gs(6));
            ctx.strokeStyle = '#111';
            for (let si = 1; si < 10; si++) {
                const sx = bx - 10 + (hpBarW / 10) * si;
                ctx.beginPath(); ctx.moveTo(gx(sx), gy(by - 20)); ctx.lineTo(gx(sx), gy(by - 10)); ctx.stroke();
            }
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${gs(10)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('WAR MACHINE', gx(bx + bw/2), gy(by - 24));
            ctx.textAlign = 'left';
        }

        // ── Player ──
        if (state !== ST_DEAD && state !== ST_GAMEOVER) {
            if (player.invincible > 0 && Math.floor(player.invincible / 4) % 2) {
                // blink
            } else {
                const ph = player.prone ? PRONE_H : PLAYER_H;
                const px = player.x, py = player.y;
                const f = player.facing;

                // Shadow
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath();
                ctx.ellipse(gx(px + PLAYER_W/2), gy(py + ph + 2), gs(12), gs(3), 0, 0, Math.PI * 2);
                ctx.fill();

                // Try sprite rendering first
                let playerSpriteDrawn = false;
                if (allSpritesReady) {
                    let sprKey;
                    if (player.prone) sprKey = 'playerDuck';
                    else if (!player.grounded) sprKey = 'playerJump';
                    else if (Math.abs(player.vx) > 0) sprKey = (Math.floor(frameCount / 8) % 2 === 0) ? 'playerWalk1' : 'playerWalk2';
                    else sprKey = 'playerStand';
                    playerSpriteDrawn = drawSprite(sprites[sprKey], px - 4, py - 6, PLAYER_W + 8, ph + 8, f < 0);
                }

                if (!playerSpriteDrawn && player.prone) {
                    ctx.fillStyle = darkenColor(playerColor, 0.7);
                    ctx.fillRect(gx(px), gy(py + 6), gs(PLAYER_W), gs(PRONE_H - 6));
                    ctx.fillStyle = playerColor;
                    ctx.fillRect(gx(px + 2), gy(py + 8), gs(PLAYER_W - 4), gs(PRONE_H - 10));
                    ctx.fillStyle = '#d4a574';
                    ctx.beginPath();
                    ctx.arc(gx(px + (f > 0 ? PLAYER_W - 4 : 4)), gy(py + 12), gs(5), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = darkenColor(playerColor, 0.5);
                    ctx.beginPath();
                    ctx.arc(gx(px + (f > 0 ? PLAYER_W - 4 : 4)), gy(py + 10), gs(6), Math.PI, 0);
                    ctx.fill();
                } else if (!playerSpriteDrawn) {
                    const running = player.grounded && Math.abs(player.vx) > 0;
                    const lo = running ? Math.sin(frameCount * 0.35) * 5 : 0;
                    ctx.fillStyle = darkenColor(playerColor, 0.5);
                    ctx.fillRect(gx(px + 7), gy(py + ph - 12 + lo), gs(5), gs(12));
                    ctx.fillRect(gx(px + PLAYER_W - 12), gy(py + ph - 12 - lo), gs(5), gs(12));
                    ctx.fillStyle = '#333';
                    ctx.fillRect(gx(px + 6), gy(py + ph - 2 + lo), gs(7), gs(3));
                    ctx.fillRect(gx(px + PLAYER_W - 13), gy(py + ph - 2 - lo), gs(7), gs(3));
                    ctx.fillStyle = playerColor;
                    ctx.fillRect(gx(px + 5), gy(py + 12), gs(PLAYER_W - 10), gs(ph - 24));
                    ctx.fillStyle = darkenColor(playerColor, 0.4);
                    ctx.fillRect(gx(px + 4), gy(py + ph - 16), gs(PLAYER_W - 8), gs(3));
                    ctx.fillStyle = lightenColor(playerColor, 0.15);
                    ctx.fillRect(gx(px + 7), gy(py + 14), gs(PLAYER_W - 14), gs(6));
                    ctx.fillStyle = darkenColor(playerColor, 0.6);
                    ctx.fillRect(gx(px + (f > 0 ? 2 : PLAYER_W - 6)), gy(py + 14), gs(4), gs(12));
                    ctx.fillRect(gx(px + (f > 0 ? PLAYER_W - 6 : 2)), gy(py + 14), gs(4), gs(10));
                    ctx.fillStyle = '#d4a574';
                    ctx.beginPath();
                    ctx.arc(gx(px + PLAYER_W/2), gy(py + 8), gs(7), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#C0392B';
                    ctx.fillRect(gx(px + PLAYER_W/2 - 8), gy(py + 5), gs(16), gs(3));
                    if (f > 0) {
                        ctx.fillRect(gx(px + PLAYER_W/2 - 8), gy(py + 4), gs(3), gs(6));
                        const tailWave = Math.sin(frameCount * 0.1) * 2;
                        ctx.fillRect(gx(px + PLAYER_W/2 - 11 + tailWave), gy(py + 3), gs(4), gs(3));
                    } else {
                        ctx.fillRect(gx(px + PLAYER_W/2 + 5), gy(py + 4), gs(3), gs(6));
                        const tailWave = Math.sin(frameCount * 0.1) * 2;
                        ctx.fillRect(gx(px + PLAYER_W/2 + 7 + tailWave), gy(py + 3), gs(4), gs(3));
                    }
                    ctx.fillStyle = '#111';
                    ctx.fillRect(gx(px + PLAYER_W/2 + f * 3), gy(py + 7), gs(2), gs(2));
                }

                // Gun
                const weaponColors = { normal: ['#888','#666'], spread: ['#F59E0B','#D97706'], rapid: ['#EF4444','#DC2626'], laser: ['#3B82F6','#2563EB'] };
                const [gunC1, gunC2] = weaponColors[weapon];
                const gunLen = weapon === 'laser' ? 22 : 16;
                const gunX = px + PLAYER_W/2 + player.aimX * 8;
                const gunY = py + (player.prone ? PRONE_H/2 : PLAYER_H/2 - 2) + player.aimY * 4;
                ctx.strokeStyle = gunC1;
                ctx.lineWidth = gs(3.5);
                ctx.beginPath();
                ctx.moveTo(gx(gunX), gy(gunY));
                ctx.lineTo(gx(gunX + player.aimX * gunLen), gy(gunY + player.aimY * gunLen));
                ctx.stroke();
                ctx.strokeStyle = gunC2;
                ctx.lineWidth = gs(5);
                ctx.beginPath();
                ctx.moveTo(gx(gunX), gy(gunY));
                ctx.lineTo(gx(gunX + player.aimX * 8), gy(gunY + player.aimY * 8));
                ctx.stroke();

                // Weapon level indicator
                if (weaponLevel >= 2 && weapon !== 'normal') {
                    ctx.fillStyle = weaponColors[weapon][0];
                    ctx.shadowColor = weaponColors[weapon][0];
                    ctx.shadowBlur = gs(4);
                    ctx.font = `bold ${gs(8)}px monospace`;
                    ctx.textAlign = 'center';
                    ctx.fillText('+', gx(px + PLAYER_W/2), gy(py - 4));
                    ctx.shadowBlur = 0;
                    ctx.textAlign = 'left';
                }

                // Muzzle flash — per weapon type (feature 9)
                if (muzzleFlash > 0) {
                    muzzleFlash--;
                    const mx = gunX + player.aimX * gunLen;
                    const my = gunY + player.aimY * gunLen;
                    const flashIntensity = muzzleFlash / 4;
                    if (muzzleType === 'spread') {
                        // Wide orange fan flash with spark cone
                        drawGlow(mx, my, 22, '#F59E0B', 0.6 * flashIntensity);
                        drawGlow(mx, my, 10, '#FFF', 0.3 * flashIntensity);
                        ctx.fillStyle = '#FFDD44';
                        const baseAngle = Math.atan2(player.aimY, player.aimX);
                        for (let fi = -3; fi <= 3; fi++) {
                            const fAngle = baseAngle + fi * 0.25;
                            const fDist = 4 + Math.random() * 6;
                            ctx.globalAlpha = flashIntensity * (0.5 + Math.random() * 0.5);
                            ctx.beginPath();
                            ctx.arc(gx(mx + Math.cos(fAngle) * fDist), gy(my + Math.sin(fAngle) * fDist), gs(1.5 + Math.random()), 0, Math.PI * 2);
                            ctx.fill();
                        }
                        ctx.globalAlpha = 1;
                    } else if (muzzleType === 'rapid') {
                        // Compact red strobe flash
                        drawGlow(mx, my, 10, '#EF4444', 0.5 * flashIntensity);
                        ctx.fillStyle = '#FF8888';
                        ctx.globalAlpha = flashIntensity;
                        ctx.beginPath();
                        ctx.arc(gx(mx), gy(my), gs(2 + Math.random() * 3), 0, Math.PI * 2);
                        ctx.fill();
                        // Mini sparks
                        ctx.fillStyle = '#FFCCCC';
                        for (let si = 0; si < 2; si++) {
                            ctx.beginPath();
                            ctx.arc(gx(mx + rng(-4, 4)), gy(my + rng(-4, 4)), gs(1), 0, Math.PI * 2);
                            ctx.fill();
                        }
                        ctx.globalAlpha = 1;
                    } else if (muzzleType === 'laser') {
                        // Blue electric flash with lightning arcs
                        drawGlow(mx, my, 18, '#3B82F6', 0.6 * flashIntensity);
                        drawGlow(mx, my, 8, '#FFFFFF', 0.3 * flashIntensity);
                        ctx.strokeStyle = '#88CCFF';
                        ctx.lineWidth = gs(1);
                        ctx.globalAlpha = flashIntensity;
                        for (let li = 0; li < 4; li++) {
                            ctx.beginPath();
                            ctx.moveTo(gx(mx), gy(my));
                            const lx = mx + rng(-10, 10), ly = my + rng(-10, 10);
                            ctx.lineTo(gx(mx + (lx - mx) * 0.5 + rng(-3, 3)), gy(my + (ly - my) * 0.5 + rng(-3, 3)));
                            ctx.lineTo(gx(lx), gy(ly));
                            ctx.stroke();
                        }
                        ctx.globalAlpha = 1;
                    } else {
                        // Default yellow flash — star burst
                        drawGlow(mx, my, 14, '#FBBF24', 0.5 * flashIntensity);
                        ctx.fillStyle = '#fff';
                        ctx.globalAlpha = flashIntensity;
                        ctx.beginPath();
                        ctx.arc(gx(mx), gy(my), gs(3 + Math.random() * 2), 0, Math.PI * 2);
                        ctx.fill();
                        // Radial lines
                        ctx.strokeStyle = 'rgba(255,220,100,0.5)';
                        ctx.lineWidth = gs(0.8);
                        for (let ri = 0; ri < 4; ri++) {
                            const ra = ri * Math.PI / 2 + frameCount * 0.2;
                            ctx.beginPath();
                            ctx.moveTo(gx(mx + Math.cos(ra) * 3), gy(my + Math.sin(ra) * 3));
                            ctx.lineTo(gx(mx + Math.cos(ra) * 8), gy(my + Math.sin(ra) * 8));
                            ctx.stroke();
                        }
                        ctx.globalAlpha = 1;
                    }
                }
            }
        }

        // ── Bullets ──
        for (const b of bullets) {
            if (b.laser) {
                ctx.strokeStyle = '#60A5FA';
                ctx.shadowColor = '#3B82F6';
                ctx.shadowBlur = gs(10);
                ctx.lineWidth = gs(3);
                ctx.beginPath();
                ctx.moveTo(gx(b.x - b.vx * 2), gy(b.y - b.vy * 2));
                ctx.lineTo(gx(b.x), gy(b.y));
                ctx.stroke();
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(gx(b.x), gy(b.y), gs(2), 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
            } else {
                ctx.fillStyle = 'rgba(251,191,36,0.3)';
                ctx.fillRect(gx(b.x - b.vx * 1.5), gy(b.y - b.vy * 1.5), gs(b.size), gs(b.size));
                ctx.fillStyle = '#FBBF24';
                ctx.fillRect(gx(b.x), gy(b.y), gs(b.size), gs(b.size));
                ctx.fillStyle = '#fff';
                ctx.fillRect(gx(b.x + 1), gy(b.y + 1), gs(b.size - 2), gs(b.size - 2));
            }
        }

        // ── Enemy Bullets ──
        for (const b of enemyBullets) {
            const ec = b.color || '#F43F5E';
            if (b.type === 'grenade') {
                // Draw grenade as circle
                ctx.fillStyle = '#444';
                ctx.beginPath(); ctx.arc(gx(b.x), gy(b.y), gs(5), 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#FF4500';
                ctx.beginPath(); ctx.arc(gx(b.x), gy(b.y), gs(3), 0, Math.PI * 2); ctx.fill();
                // Fuse spark
                ctx.fillStyle = '#FFD700';
                ctx.beginPath(); ctx.arc(gx(b.x + rng(-2, 2)), gy(b.y - 4 + rng(-2, 0)), gs(1.5), 0, Math.PI * 2); ctx.fill();
            } else if (b.type === 'sniper') {
                // Sniper tracer — bright line
                ctx.strokeStyle = '#FF6600';
                ctx.shadowColor = '#FF6600';
                ctx.shadowBlur = gs(4);
                ctx.lineWidth = gs(2);
                ctx.beginPath();
                ctx.moveTo(gx(b.x - b.vx * 3), gy(b.y - b.vy * 3));
                ctx.lineTo(gx(b.x), gy(b.y));
                ctx.stroke();
                ctx.shadowBlur = 0;
            } else {
                drawGlow(b.x, b.y, 8, ec, 0.25);
                ctx.fillStyle = ec;
                ctx.beginPath(); ctx.arc(gx(b.x), gy(b.y), gs(3.5), 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(gx(b.x - 0.5), gy(b.y - 0.5), gs(1.5), 0, Math.PI * 2); ctx.fill();
            }
        }

        // ── Particles — with glow halos ──
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            // Glow halo for larger explosion particles
            if (p.size > 3) {
                ctx.globalAlpha = alpha * 0.2;
                const pg = ctx.createRadialGradient(gx(p.x), gy(p.y), 0, gx(p.x), gy(p.y), gs(p.size * 2));
                pg.addColorStop(0, p.color);
                pg.addColorStop(1, 'transparent');
                ctx.fillStyle = pg;
                ctx.fillRect(gx(p.x) - gs(p.size * 2), gy(p.y) - gs(p.size * 2), gs(p.size * 4), gs(p.size * 4));
            }
            // Trail
            ctx.globalAlpha = alpha * 0.3;
            ctx.fillStyle = p.color;
            ctx.fillRect(gx(p.x - p.vx), gy(p.y - p.vy), gs(p.size * 0.7), gs(p.size * 0.7));
            // Core
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(gx(p.x + p.size/2), gy(p.y + p.size/2), gs(p.size * 0.5), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // ── Rain splashes (feature 8) ──
        for (const sp of rainSplashes) {
            const alpha = sp.life / sp.maxLife;
            ctx.globalAlpha = alpha * 0.4;
            ctx.strokeStyle = '#8ab4f8';
            ctx.lineWidth = gs(0.5);
            const spread = (1 - sp.life / sp.maxLife) * 6;
            ctx.beginPath();
            ctx.arc(gx(sp.x), gy(sp.y), gs(spread), 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // ── Weather — Rain (feature 8) ──
        ctx.strokeStyle = 'rgba(150,180,220,0.35)';
        ctx.lineWidth = gs(1);
        for (const wp of weatherParticles) {
            ctx.globalAlpha = wp.alpha;
            ctx.beginPath();
            ctx.moveTo(gs(wp.x), gs(wp.y));
            ctx.lineTo(gs(wp.x + wp.vx * 0.5), gs(wp.y + wp.len));
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // ── Parallax Foreground (feature 7) — enhanced depth ──
        for (const fe of foregroundElements) {
            const fx = fe.x - cameraX * 1.1; // slightly faster than camera = foreground
            if (fx < -30 || fx > GAME_W + 30) continue;
            if (fe.type === 'vine') {
                // Hanging vine with depth layering
                const baseY = GAME_H - 40 - fe.h;
                // Back vine (darker, less sway)
                ctx.strokeStyle = 'rgba(20,80,20,0.18)';
                ctx.lineWidth = gs(3);
                ctx.beginPath();
                ctx.moveTo(gs(fx - 3), gy(baseY));
                for (let vy = 0; vy < fe.h; vy += 8) {
                    const sway = Math.sin(frameCount * 0.015 + vy * 0.08 + fe.x * 0.04) * 3;
                    ctx.lineTo(gs(fx - 3 + sway), gy(baseY + vy));
                }
                ctx.stroke();
                // Front vine
                ctx.strokeStyle = 'rgba(40,130,40,0.35)';
                ctx.lineWidth = gs(2);
                ctx.beginPath();
                ctx.moveTo(gs(fx), gy(baseY));
                for (let vy = 0; vy < fe.h; vy += 8) {
                    const sway = Math.sin(frameCount * 0.02 + vy * 0.1 + fe.x * 0.05) * 4;
                    ctx.lineTo(gs(fx + sway), gy(baseY + vy));
                }
                ctx.stroke();
                // Leaves with depth variation
                for (let ly = 0; ly < fe.h; ly += 12) {
                    const lsway = Math.sin(frameCount * 0.02 + ly * 0.1 + fe.x * 0.05) * 4;
                    const leafAlpha = 0.18 + 0.12 * Math.sin(ly * 0.3);
                    ctx.fillStyle = `rgba(50,140,50,${leafAlpha})`;
                    ctx.beginPath();
                    ctx.ellipse(gs(fx + lsway + 3), gy(baseY + ly), gs(6), gs(3), 0.3, 0, Math.PI * 2);
                    ctx.fill();
                    // Second smaller leaf
                    ctx.fillStyle = `rgba(60,160,60,${leafAlpha * 0.7})`;
                    ctx.beginPath();
                    ctx.ellipse(gs(fx + lsway - 2), gy(baseY + ly + 4), gs(4), gs(2), -0.4, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else { // tallgrass — more blades, depth layers
                const baseY = GAME_H - 40;
                // Back layer (darker)
                ctx.strokeStyle = 'rgba(40,100,30,0.15)';
                ctx.lineWidth = gs(2);
                for (let gi = 0; gi < 3; gi++) {
                    const gOffset = gi * 7 - 8;
                    const sway = Math.sin(frameCount * 0.02 + gi + fe.x * 0.08) * 2;
                    const grassH = fe.h * (0.5 + gi * 0.12);
                    ctx.beginPath();
                    ctx.moveTo(gs(fx + gOffset), gy(baseY));
                    ctx.quadraticCurveTo(gs(fx + gOffset + sway), gy(baseY - grassH * 0.5), gs(fx + gOffset + sway * 1.5), gy(baseY - grassH));
                    ctx.stroke();
                }
                // Front layer (brighter)
                ctx.strokeStyle = 'rgba(60,140,40,0.3)';
                ctx.lineWidth = gs(1.5);
                for (let gi = 0; gi < 5; gi++) {
                    const gOffset = gi * 5 - 10;
                    const sway = Math.sin(frameCount * 0.03 + gi + fe.x * 0.1) * 3;
                    const grassH = fe.h * (0.6 + gi * 0.1);
                    ctx.beginPath();
                    ctx.moveTo(gs(fx + gOffset), gy(baseY));
                    ctx.quadraticCurveTo(gs(fx + gOffset + sway), gy(baseY - grassH * 0.5), gs(fx + gOffset + sway * 1.5), gy(baseY - grassH));
                    ctx.stroke();
                }
            }
        }

        // ── Score Popups ──
        for (const p of scorePopups) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#FBBF24';
            ctx.shadowColor = '#FBBF24';
            ctx.shadowBlur = gs(6);
            ctx.font = `bold ${gs(14)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(p.text, gx(p.x), gy(p.y));
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;

        // ── HUD ──
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, gs(240), gs(68));
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(0, gs(67), gs(240), gs(1));

        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${gs(14)}px monospace`;
        ctx.fillText('SCORE', gs(8), gs(18));
        ctx.fillStyle = '#FBBF24';
        ctx.fillText(`${score}`, gs(65), gs(18));

        ctx.fillStyle = '#fff';
        ctx.font = `bold ${gs(12)}px monospace`;
        ctx.fillText('LIVES', gs(8), gs(38));
        for (let i = 0; i < Math.max(0, lives); i++) {
            const hx2 = 68 + i * 16, hy2 = 28;
            if (allSpritesReady && sprites['hudHeart']) {
                ctx.drawImage(sprites['hudHeart'], gs(hx2 - 7), gs(hy2 - 4), gs(14), gs(14));
            } else {
                ctx.fillStyle = '#EF4444';
                ctx.beginPath();
                ctx.arc(gs(hx2 - 3), gs(hy2), gs(4), Math.PI, 0);
                ctx.arc(gs(hx2 + 3), gs(hy2), gs(4), Math.PI, 0);
                ctx.lineTo(gs(hx2 + 7), gs(hy2 + 4));
                ctx.lineTo(gs(hx2), gs(hy2 + 10));
                ctx.lineTo(gs(hx2 - 7), gs(hy2 + 4));
                ctx.fill();
            }
        }

        // Weapon indicator with upgrade level
        if (weapon !== 'normal') {
            const wc = weapon === 'spread' ? '#F59E0B' : (weapon === 'rapid' ? '#EF4444' : '#3B82F6');
            ctx.fillStyle = wc;
            ctx.font = `bold ${gs(11)}px monospace`;
            const lvlStr = weaponLevel >= 2 ? '+' : '';
            ctx.fillText(`■ ${weapon.toUpperCase()}${lvlStr} ${Math.ceil(weaponTimer / 60)}s`, gs(8), gs(58));
        }

        // Chain indicator
        if (chainCount >= 2) {
            const chainW = 140;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(gs(GAME_W) - gs(chainW + 10), 0, gs(chainW + 10), gs(35));
            ctx.fillStyle = lastChainColor;
            ctx.shadowColor = lastChainColor;
            ctx.shadowBlur = gs(8);
            ctx.textAlign = 'right';
            ctx.font = `bold ${gs(16)}px monospace`;
            ctx.fillText(`${chainCount}x CHAIN`, gs(GAME_W - 10), gs(22));
            ctx.shadowBlur = 0;
        }

        // Progress bar
        const barW = 180, barH = 6, barX = GAME_W/2 - barW/2, barY = 6;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.roundRect(gs(barX - 2), gs(barY - 2), gs(barW + 4), gs(barH + 4), gs(4));
        ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.roundRect(gs(barX), gs(barY), gs(barW), gs(barH), gs(3));
        ctx.fill();
        const progress = Math.min(1, player.x / LEVEL_LENGTH);
        ctx.fillStyle = '#22C55E';
        ctx.shadowColor = '#22C55E';
        ctx.shadowBlur = gs(4);
        ctx.beginPath();
        ctx.roundRect(gs(barX), gs(barY), gs(barW * progress), gs(barH), gs(3));
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(gs(barX + barW * progress), gs(barY + barH/2), gs(4), 0, Math.PI * 2);
        ctx.fill();

        // Vignette
        const vg = ctx.createRadialGradient(W/2, H/2, H * 0.35, W/2, H/2, H * 0.9);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);

        if (state === ST_PLAY) drawOnScreenControls(ctx, W, H, gs, ['FIRE', 'JUMP'], 'LRUD');

        ctx.restore();
    }

    // ── Color utilities ──
    function darkenColor(hex, factor) {
        if (!hex || hex[0] !== '#') return hex;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgb(${Math.floor(r * factor)},${Math.floor(g * factor)},${Math.floor(b * factor)})`;
    }
    function lightenColor(hex, amount) {
        if (!hex || hex[0] !== '#') return hex;
        const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + 255 * amount);
        const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + 255 * amount);
        const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + 255 * amount);
        return `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
    }

    function drawTitle() {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#050510');
        grad.addColorStop(0.4, '#0a0a1a');
        grad.addColorStop(0.7, '#150a0a');
        grad.addColorStop(1, '#1a0808');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        for (const s of stars) {
            const flicker = s.b + Math.sin(frameCount * 0.03 + s.x) * 0.2;
            ctx.globalAlpha = Math.max(0, Math.min(1, flicker));
            ctx.fillStyle = '#fff';
            ctx.fillRect(gs(s.x % GAME_W), gs(s.y), gs(s.s), gs(s.s));
        }
        ctx.globalAlpha = 1;

        const titleY = GAME_H * 0.28;
        drawGlow(GAME_W/2, titleY, 120, '#EF4444', 0.08);

        ctx.textAlign = 'center';
        ctx.font = `bold ${gs(56)}px monospace`;
        ctx.fillStyle = '#330000';
        ctx.fillText('CONTRA', gs(GAME_W/2 + 3), gs(titleY + 3));
        ctx.fillStyle = '#EF4444';
        ctx.shadowColor = '#EF4444';
        ctx.shadowBlur = gs(15);
        ctx.fillText('CONTRA', gs(GAME_W/2), gs(titleY));
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#888';
        ctx.font = `${gs(12)}px monospace`;
        ctx.fillText('YOUR WORLD ARCADE', gs(GAME_W/2), gs(titleY + 22));

        ctx.strokeStyle = 'rgba(239,68,68,0.3)';
        ctx.lineWidth = gs(1);
        ctx.beginPath();
        ctx.moveTo(gs(GAME_W/2 - 120), gs(titleY + 35));
        ctx.lineTo(gs(GAME_W/2 + 120), gs(titleY + 35));
        ctx.stroke();

        const legendY = GAME_H * 0.5;
        ctx.font = `${gs(11)}px monospace`;
        ctx.fillStyle = '#666';
        ctx.fillText('CHAIN COMBO SYSTEM', gs(GAME_W/2), gs(legendY - 15));
        ctx.fillStyle = '#999';
        ctx.font = `${gs(10)}px monospace`;
        ctx.fillText('Kill same-colored enemies in sequence for bonus explosions', gs(GAME_W/2), gs(legendY));

        const colors = ENEMY_COLORS;
        const names = ['SOLDIER','SNIPER','RUNNER','SCOUT'];
        const totalW = colors.length * 80;
        const startX = GAME_W/2 - totalW/2;
        for (let i = 0; i < colors.length; i++) {
            const cx2 = startX + i * 80 + 40;
            drawGlow(cx2, legendY + 28, 14, colors[i], 0.2);
            ctx.fillStyle = colors[i];
            ctx.beginPath();
            ctx.arc(gs(cx2), gs(legendY + 28), gs(8), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#555';
            ctx.font = `${gs(8)}px monospace`;
            ctx.fillText(names[i], gs(cx2), gs(legendY + 46));
        }

        ctx.font = `${gs(11)}px monospace`;
        ctx.fillStyle = '#555';
        const controls = [
            'ARROWS MOVE    UP JUMP    DOWN PRONE',
            'Z / X / J  FIRE    AIM WITH ARROWS',
            'SAME WEAPON x2 = UPGRADE!',
        ];
        for (let i = 0; i < controls.length; i++) {
            ctx.fillText(controls[i], gs(GAME_W/2), gs(GAME_H * 0.68 + i * 18));
        }

        ctx.fillStyle = '#fff';
        ctx.font = `bold ${gs(18)}px monospace`;
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = gs(6);
            ctx.fillText('PRESS SPACE TO START', gs(GAME_W/2), gs(GAME_H * 0.88));
            ctx.shadowBlur = 0;
        }

        const vg = ctx.createRadialGradient(W/2, H/2, H * 0.3, W/2, H/2, H * 0.85);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        const isWin = state === ST_WIN;
        ctx.fillStyle = isWin ? '#22C55E' : '#EF4444';
        ctx.shadowColor = isWin ? '#22C55E' : '#EF4444'; ctx.shadowBlur = gs(12);
        ctx.font = `bold ${gs(36)}px monospace`;
        ctx.fillText(isWin ? 'MISSION COMPLETE' : 'GAME OVER', gs(GAME_W/2), gs(GAME_H * 0.34));
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${gs(20)}px monospace`;
        ctx.fillText(`SCORE: ${score.toLocaleString()}`, gs(GAME_W/2), gs(GAME_H * 0.46));
        if (score >= highScore && score > 0) {
            ctx.fillStyle = '#FBBF24'; ctx.font = `bold ${gs(12)}px monospace`;
            ctx.fillText('\u2605 NEW HIGH SCORE! \u2605', gs(GAME_W/2), gs(GAME_H * 0.52));
        } else {
            ctx.fillStyle = '#666'; ctx.font = `${gs(11)}px monospace`;
            ctx.fillText(`BEST: ${highScore.toLocaleString()}`, gs(GAME_W/2), gs(GAME_H * 0.52));
        }
        ctx.fillStyle = '#888'; ctx.font = `${gs(14)}px monospace`;
        ctx.fillText(`STAGE ${level}`, gs(GAME_W/2), gs(GAME_H * 0.59));
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink && deathTimer <= 0) {
            ctx.fillStyle = '#06B6D4'; ctx.font = `${gs(14)}px monospace`;
            ctx.fillText(HAS_TOUCH ? 'TAP TO PLAY AGAIN' : 'PRESS SPACE TO PLAY AGAIN', gs(GAME_W/2), gs(GAME_H * 0.70));
        }
    }

    // ── Game Loop ──
    function gameLoop(ts) {
        if (!gameActive) return;
        const dt = Math.min((ts - (lastTime || ts)) / 16.67, 3);
        lastTime = ts;
        frameCount++;

        if (state === ST_LOADING) {
            drawLoading();
            if (allSpritesReady) state = ST_TITLE;
        } else if (state === ST_TITLE) {
            drawTitle();
        } else if (state === ST_PLAY) {
            update(dt);
            draw();
        } else if (state === ST_DEAD) {
            draw();
            deathTimer--;
            if (deathTimer <= 0) respawn();
        } else if (state === ST_GAMEOVER || state === ST_WIN) {
            if (state !== ST_WIN) draw();
            drawGameOver();
            deathTimer--;
        }

        animFrame = requestAnimationFrame(gameLoop);
    }

    function startGame() {
        score = 0; lives = 3; level = 1;
        cameraX = 0;
        weapon = 'normal'; weaponTimer = 0; weaponLevel = 1;
        lastFireTime = 0; lastChainColor = null; chainCount = 0; chainTimer = 0;
        bullets = []; enemies = []; enemyBullets = []; particles = []; scorePopups = []; powerups = [];
        ragdolls = []; rainSplashes = [];
        screenShake = 0;
        bossActive = false; boss = null;
        midBossActive = false; midBoss = null;
        spawnTimer = 60; spawnRate = 90;
        deathTimer = 0;
        generateLevel();
        createBgLayers();
        createWeather();
        resetPlayer();
        state = ST_PLAY;
    }

    function endGame() {
        const duration = 0;
        if (gameOverCB) gameOverCB({ score, level, duration, lives });
    }

    // ── Input ──
    function onKeyDown(e) {
        keys[e.key] = true;
        if (state === ST_TITLE && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); startGame(); }
        if ((state === ST_GAMEOVER || state === ST_WIN) && deathTimer <= 0 && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); endGame(); }
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    }
    function onKeyUp(e) { keys[e.key] = false; }

    // Touch controls
    let touchLeft = false, touchRight = false, touchJump = false, touchFire = false;
    function onTouchStart(e) {
        e.preventDefault();
        handleTouch(e.touches);
        if (state === ST_TITLE) startGame();
        if ((state === ST_GAMEOVER || state === ST_WIN) && deathTimer <= 0) endGame();
    }
    function onTouchMove(e) { e.preventDefault(); handleTouch(e.touches); }
    function onTouchEnd(e) {
        e.preventDefault();
        if (e.touches.length === 0) { touchLeft = false; touchRight = false; touchJump = false; touchFire = false; keys = {}; }
        else handleTouch(e.touches);
    }
    function handleTouch(touches) {
        touchLeft = false; touchRight = false; touchJump = false; touchFire = false;
        const rect = canvas.getBoundingClientRect();
        for (const t of touches) {
            const tx = (t.clientX - rect.left) / rect.width;
            const ty = (t.clientY - rect.top) / rect.height;
            if (ty < 0.4) { keys['ArrowUp'] = true; keys[' '] = true; }
            else if (ty > 0.7 && tx < 0.3) { keys['ArrowLeft'] = true; }
            else if (ty > 0.7 && tx > 0.7) { keys['ArrowRight'] = true; }
            else { keys['z'] = true; }
        }
    }

    // ── Canvas sizing ──
    function fitCanvas() {
        if (!canvas) return;
        let pw = canvas.width || 960;
        let ph = canvas.height || 540;
        const parent = canvas.parentElement;
        if (parent && parent.clientWidth > 50 && parent.clientHeight > 50) {
            pw = parent.clientWidth;
            ph = parent.clientHeight;
        }
        const aspect = GAME_W / GAME_H;
        let drawW, drawH;
        if (pw / ph > aspect) { drawH = ph; drawW = Math.floor(ph * aspect); }
        else { drawW = pw; drawH = Math.floor(pw / aspect); }
        drawW = Math.max(drawW, 480);
        drawH = Math.max(drawH, 270);
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = drawW * DPR;
        canvas.height = drawH * DPR;
        canvas.style.width = drawW + 'px';
        canvas.style.height = drawH + 'px';
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
    }

    // ── Init / Destroy ──
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

        state = ST_LOADING;
        frameCount = 0;
        lastTime = 0;
        keys = {};
        cameraX = 0;
        score = 0; lives = 3; level = 1;
        screenShake = 0;
        muzzleFlash = 0;
        muzzleType = 'normal';
        weapon = 'normal'; weaponLevel = 1;
        ragdolls = []; rainSplashes = [];
        weatherParticles = [];

        W = canvas.width || 960;
        H = canvas.height || 540;
        SCALE = W / GAME_W;
        DPR = Math.min(window.devicePixelRatio || 1, 3);

        if (!allSpritesReady) loadSprites();

        createStars();

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
