/* YWA Joust — Physics-based aerial jousting with wave progression */
window.Joust = (() => {

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
    const GAME_W = 480, GAME_H = 560;
    const GRAVITY = 0.22, FLAP_VEL = -4.2, MAX_FALL = 5.5;
    const PLAYER_SPEED = 2.6, PLAYER_W = 30, PLAYER_H = 26;
    const LANCE_LEN = 16, LANCE_H = 4;
    const LAVA_H = 36, LAVA_Y = GAME_H - LAVA_H;
    const EGG_HATCH_MS = 6000, EGG_W = 10, EGG_H = 12;
    const PTERO_DELAY_MS = 25000; // pterodactyl appears after this
    const PTERO_W = 48, PTERO_H = 28;
    const INITIAL_LIVES = 3;
    const WRAP_MARGIN = 30;
    const INVULN_MS = 2000;
    const DEATH_ANIM_MS = 1500;
    const WAVE_SPLASH_MS = 2200;

    // Enemy types
    const ET_BOUNDER = 0, ET_HUNTER = 1, ET_SHADOW = 2;
    const ENEMY_COLORS = ['#EF4444', '#94A3B8', '#3B82F6'];
    const ENEMY_GLOWS  = ['#FCA5A5', '#CBD5E1', '#93C5FD'];
    const ENEMY_SPEEDS = [1.4, 2.0, 2.8];
    const ENEMY_FLAP_RATES = [0.025, 0.035, 0.05];
    const ENEMY_SCORES = [500, 750, 1500];
    const EGG_SCORE = 250;

    // Platform data (x, y, w) — 3 floating + ground ledges
    const PLATFORMS = [
        { x: 60,  y: 180, w: 120 },
        { x: 200, y: 320, w: 100 },
        { x: 320, y: 220, w: 110 },
        { x: 0,   y: 440, w: 80 },
        { x: 400, y: 440, w: 80 },
    ];
    const PLAT_H = 12;

    // States
    const ST_LOADING = -1, ST_TITLE = 0, ST_PLAY = 1, ST_DYING = 2, ST_WAVE_SPLASH = 3, ST_GAMEOVER = 4;
    const LS_KEY = 'ywa_joust_hiscore';
    let hiScore = 0;

    // ── Sprite Atlas (Kenney Platform CC0) ──
    const SPRITE_BASE = '/img/game-assets/kenney-platform';
    const sprites = {};
    let spritesLoaded = 0, spritesTotal = 0, allSpritesReady = false;

    const SPRITE_MANIFEST = {
        // Player knight (blue)
        playerStand:  `${SPRITE_BASE}/players/Blue/alienBlue_stand.png`,
        playerWalk1:  `${SPRITE_BASE}/players/Blue/alienBlue_walk1.png`,
        playerWalk2:  `${SPRITE_BASE}/players/Blue/alienBlue_walk2.png`,
        playerJump:   `${SPRITE_BASE}/players/Blue/alienBlue_jump.png`,
        playerHit:    `${SPRITE_BASE}/players/Blue/alienBlue_hit.png`,
        // Enemy knights
        enemyRed:     `${SPRITE_BASE}/players/Pink/alienPink_stand.png`,
        enemyRedW:    `${SPRITE_BASE}/players/Pink/alienPink_walk1.png`,
        enemyRedJ:    `${SPRITE_BASE}/players/Pink/alienPink_jump.png`,
        enemyGrey:    `${SPRITE_BASE}/players/Beige/alienBeige_stand.png`,
        enemyGreyJ:   `${SPRITE_BASE}/players/Beige/alienBeige_jump.png`,
        enemyShadow:  `${SPRITE_BASE}/players/Green/alienGreen_stand.png`,
        enemyShadowJ: `${SPRITE_BASE}/players/Green/alienGreen_jump.png`,
        // Platforms
        stoneMid:     `${SPRITE_BASE}/ground/Stone/stoneMid.png`,
        stoneLeft:    `${SPRITE_BASE}/ground/Stone/stoneLeft.png`,
        stoneRight:   `${SPRITE_BASE}/ground/Stone/stoneRight.png`,
        // Lava
        lava:         `${SPRITE_BASE}/tiles/lava.png`,
        lavaTop:      `${SPRITE_BASE}/tiles/lavaTop_high.png`,
        // Items (eggs)
        coinGold:     `${SPRITE_BASE}/items/coinGold.png`,
        star:         `${SPRITE_BASE}/items/star.png`,
        gemYellow:    `${SPRITE_BASE}/items/gemYellow.png`,
        // Pterodactyl
        enemyBee:     `${SPRITE_BASE}/enemies/bee.png`,
        enemyBeeM:    `${SPRITE_BASE}/enemies/bee_move.png`,
        // HUD
        hudHeart:     `${SPRITE_BASE}/hud/hudHeart_full.png`,
        // Misc
        spikes:       `${SPRITE_BASE}/tiles/spikes.png`,
        fireball:     `${SPRITE_BASE}/particles/fireball.png`,
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
        ctx.fillStyle = '#0a0010';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#F59E0B';
        ctx.shadowColor = '#F59E0B'; ctx.shadowBlur = gs(10);
        ctx.font = `bold ${gs(40)}px monospace`;
        ctx.fillText('JOUST', gs(GAME_W / 2), gs(GAME_H / 2 - 50));
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#E0E7FF'; ctx.font = `${gs(13)}px monospace`;
        ctx.fillText('LOADING SPRITES...', gs(GAME_W / 2), gs(GAME_H / 2));
        const barW = 200, barH = 8;
        const pct = spritesTotal > 0 ? spritesLoaded / spritesTotal : 0;
        ctx.fillStyle = '#333';
        ctx.fillRect(gs(GAME_W / 2 - barW / 2), gs(GAME_H / 2 + 20), gs(barW), gs(barH));
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(gs(GAME_W / 2 - barW / 2), gs(GAME_H / 2 + 20), gs(barW * pct), gs(barH));
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `${gs(10)}px monospace`;
        ctx.fillText(`${spritesLoaded} / ${spritesTotal}`, gs(GAME_W / 2), gs(GAME_H / 2 + 45));
    }

    // ── Mutable State ──
    let canvas, ctx, audioCtx;
    let W, H, SCALE, DPR;
    let animFrame, lastTime, state;
    let score, lives, wave, gameActive, startTime;
    let player, enemies, eggs, particles, scorePopups;
    let keys = {}, frameCount = 0;
    let deathTimer = 0, waveSplashTimer = 0;
    let pteroTimer = 0, ptero = null;
    let gameOverCB, activePlayer, playerColor, playerTheme;
    let touchLeft = false, touchRight = false, touchFlap = false;
    let screenShake = 0;
    let stalactites = [], lavaParticles = [];
    let invulnTimer = 0;
    let waveEnemyCount = 0;
    // New features
    let lavaHand = null; // hand-of-god troll hand from lava
    let lavaHandTimer = 0;
    let bonusWave = false; // egg collection bonus wave
    let lanceChargeTimer = 0; // lance charge mechanic

    // ═══════════════════════════════════════
    //  SOUND — Web Audio synthesis
    // ═══════════════════════════════════════
    function ensureAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function playTone(freq, dur, type, vol, slide) {
        try {
            ensureAudio();
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = type || 'square';
            o.frequency.setValueAtTime(freq, audioCtx.currentTime);
            if (slide) o.frequency.linearRampToValueAtTime(slide, audioCtx.currentTime + dur);
            g.gain.setValueAtTime(vol || 0.08, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + dur);
        } catch {}
    }

    function sfxFlap()    { playTone(320, 0.06, 'triangle', 0.07); }
    function sfxJoust()   { playTone(900, 0.12, 'sawtooth', 0.12); setTimeout(() => playTone(1200, 0.08, 'square', 0.1), 60); }
    function sfxDeath()   { playTone(120, 0.5, 'sawtooth', 0.15, 40); }
    function sfxEggPop()  { playTone(600, 0.1, 'sine', 0.1); }
    function sfxHatch()   { playTone(200, 0.3, 'sawtooth', 0.1, 500); }
    function sfxLava()    { playTone(60, 0.4, 'sawtooth', 0.06); }
    function sfxWave()    { playTone(440, 0.15, 'sine', 0.12); setTimeout(() => playTone(660, 0.15, 'sine', 0.12), 150); setTimeout(() => playTone(880, 0.2, 'sine', 0.12), 300); }
    function sfxPtero()   { playTone(80, 0.6, 'sawtooth', 0.15, 200); }
    function sfxBonk()    { playTone(150, 0.15, 'square', 0.1); }
    function sfxHand()    { playTone(60, 0.8, 'sawtooth', 0.12, 30); }
    function sfxGrab()    { playTone(100, 0.4, 'square', 0.15, 50); }
    function sfxBonus()   { playTone(880, 0.15, 'sine', 0.12); setTimeout(() => playTone(1100, 0.12, 'sine', 0.1), 80); }

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

    // ── Helpers ──
    const gs = v => v * SCALE;
    const gx = v => v * SCALE;
    const gy = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    function boxOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x &&
               a.y < b.y + b.h && a.y + a.h > b.y;
    }

    // ═══════════════════════════════════════
    //  INIT WORLD
    // ═══════════════════════════════════════
    function generateStalactites() {
        stalactites = [];
        for (let i = 0; i < 14; i++) {
            stalactites.push({
                x: rng(10, GAME_W - 10),
                h: rng(18, 55),
                w: rng(6, 14),
            });
        }
    }

    function resetPlayer() {
        player = {
            x: GAME_W / 2, y: 380, vx: 0, vy: 0,
            facing: 1, flapping: false, flapFrame: 0,
            onGround: false, alive: true,
        };
    }

    function spawnWaveEnemies() {
        enemies = [];
        const count = Math.min(3 + wave, 10);
        waveEnemyCount = count;
        for (let i = 0; i < count; i++) {
            const type = wave <= 2 ? ET_BOUNDER :
                         wave <= 5 ? (Math.random() < 0.5 ? ET_BOUNDER : ET_HUNTER) :
                         pick([ET_BOUNDER, ET_HUNTER, ET_SHADOW]);
            enemies.push(makeEnemy(type));
        }
    }

    function makeEnemy(type) {
        const side = Math.random() < 0.5 ? -20 : GAME_W + 20;
        return {
            x: side, y: rng(60, 300),
            vx: (side < 0 ? 1 : -1) * ENEMY_SPEEDS[type] * rng(0.8, 1.2),
            vy: rng(-1, 1),
            type, facing: side < 0 ? 1 : -1,
            flapFrame: rng(0, Math.PI * 2),
            alive: true, w: 28, h: 24,
        };
    }

    // ═══════════════════════════════════════
    //  GAME LOOP
    // ═══════════════════════════════════════
    function gameLoop(ts) {
        if (!gameActive) return;
        const dt = Math.min((ts - (lastTime || ts)) / 1000, 0.05);
        lastTime = ts;
        frameCount++;

        if (state === ST_LOADING) {
            drawLoading();
            if (allSpritesReady) state = ST_TITLE;
            animFrame = requestAnimationFrame(gameLoop);
            return;
        }

        switch (state) {
            case ST_TITLE:    updateTitle(dt); break;
            case ST_PLAY:     updatePlay(dt); break;
            case ST_DYING:    updateDying(dt); break;
            case ST_WAVE_SPLASH: updateWaveSplash(dt); break;
            case ST_GAMEOVER: updateGameOver(dt); break;
        }

        render();
        animFrame = requestAnimationFrame(gameLoop);
    }

    // ── TITLE ──
    function updateTitle(dt) {
        updateParticles(dt);
        animateLava(dt);
        if (keys['Space'] || keys['Enter'] || touchFlap) {
            keys['Space'] = false;
            keys['Enter'] = false;
            touchFlap = false;
            startGame();
        }
    }

    function startGame() {
        score = 0; lives = INITIAL_LIVES; wave = 0;
        particles = []; scorePopups = []; eggs = [];
        ptero = null; pteroTimer = 0;
        nextWave();
    }

    function nextWave() {
        wave++;
        ptero = null;
        pteroTimer = 0;
        lavaHand = null;
        lavaHandTimer = 0;
        lanceChargeTimer = 0;
        resetPlayer();

        // Every 5th wave is a bonus egg collection wave
        bonusWave = (wave % 5 === 0 && wave > 0);
        if (bonusWave) {
            enemies = [];
            eggs = [];
            // Spawn eggs scattered across platforms
            const eggCount = 8 + wave;
            for (let i = 0; i < eggCount; i++) {
                const plat = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)];
                eggs.push({
                    x: plat.x + rng(10, plat.w - 10), y: plat.y - 20,
                    vy: 0, sourceType: ET_BOUNDER, age: 0,
                    collected: false, hatched: false, crack: 0,
                    bonus: true
                });
            }
            waveEnemyCount = 0;
            sfxBonus();
        } else {
            spawnWaveEnemies();
            eggs = [];
        }

        state = ST_WAVE_SPLASH;
        waveSplashTimer = WAVE_SPLASH_MS;
        invulnTimer = INVULN_MS;
        sfxWave();
    }

    // ── WAVE SPLASH ──
    function updateWaveSplash(dt) {
        waveSplashTimer -= dt * 1000;
        updateParticles(dt);
        animateLava(dt);
        if (waveSplashTimer <= 0) {
            state = ST_PLAY;
        }
    }

    // ── PLAY ──
    function updatePlay(dt) {
        const ms = dt * 1000;

        // Invulnerability countdown
        if (invulnTimer > 0) invulnTimer -= ms;

        // Player input
        const moveLeft  = keys['ArrowLeft']  || keys['KeyA'] || touchLeft;
        const moveRight = keys['ArrowRight'] || keys['KeyD'] || touchRight;
        const flap      = keys['Space']      || keys['KeyW'] || keys['ArrowUp'] || touchFlap;

        if (moveLeft)  { player.vx = -PLAYER_SPEED; player.facing = -1; }
        else if (moveRight) { player.vx = PLAYER_SPEED; player.facing = 1; }
        else { player.vx *= 0.88; }

        // Flap
        if (flap && frameCount % 4 === 0) {
            player.vy = Math.max(player.vy + FLAP_VEL, -6);
            player.flapping = true;
            player.flapFrame = 6;
            sfxFlap();
            // Wind particles — bigger and more visible
            for (let i = 0; i < 5; i++) {
                particles.push({
                    x: player.x + rng(-6, 6), y: player.y + PLAYER_H / 2,
                    vx: rng(-1.5, 1.5), vy: rng(1.5, 4),
                    life: 0.5, maxLife: 0.5,
                    r: rng(3, 6), color: 'rgba(200,220,255,0.5)', type: 'wind',
                });
            }
        }

        // Physics
        player.vy += GRAVITY;
        if (player.vy > MAX_FALL) player.vy = MAX_FALL;
        player.x += player.vx;
        player.y += player.vy;
        player.onGround = false;

        // Flap animation countdown
        if (player.flapFrame > 0) player.flapFrame--;
        else player.flapping = false;

        // Horizontal wrap
        if (player.x < -WRAP_MARGIN) player.x = GAME_W + WRAP_MARGIN;
        if (player.x > GAME_W + WRAP_MARGIN) player.x = -WRAP_MARGIN;

        // Platform collisions
        platformCollide(player);

        // Lava death
        if (player.y + PLAYER_H > LAVA_Y) {
            playerDie();
            sfxLava();
            for (let i = 0; i < 20; i++) {
                particles.push({
                    x: player.x, y: LAVA_Y,
                    vx: rng(-3, 3), vy: rng(-5, -1),
                    life: 0.8, maxLife: 0.8,
                    r: rng(3, 6), color: pick(['#FF4500', '#FF6347', '#FFD700']), type: 'spark',
                });
            }
            return;
        }

        // Ceiling
        if (player.y < 0) { player.y = 0; player.vy = 1; }

        // ── Lance charge: holding direction while falling gives extra damage range ──
        if (player.vy > 1 && (moveLeft || moveRight)) {
            lanceChargeTimer += dt * 1000;
        } else {
            lanceChargeTimer = Math.max(0, lanceChargeTimer - dt * 2000);
        }

        // ── Lava hand (troll hand) — reaches up to grab players near surface ──
        lavaHandTimer += ms;
        if (!lavaHand && lavaHandTimer > 8000 + rng(0, 5000) && player.y + PLAYER_H > LAVA_Y - 80) {
            lavaHand = {
                x: player.x + rng(-30, 30),
                y: LAVA_Y + 20,
                targetY: LAVA_Y - 60,
                phase: 'rising', // rising, grabbing, retracting
                timer: 0,
                grabTarget: null
            };
            sfxHand();
            lavaHandTimer = 0;
        }
        if (lavaHand) {
            lavaHand.timer += ms;
            if (lavaHand.phase === 'rising') {
                lavaHand.y += (lavaHand.targetY - lavaHand.y) * 0.08;
                if (Math.abs(lavaHand.y - lavaHand.targetY) < 2) lavaHand.phase = 'grabbing';
                // Check grab on player
                if (invulnTimer <= 0 && Math.abs(player.x - lavaHand.x) < 25 && Math.abs(player.y - lavaHand.y) < 30) {
                    sfxGrab();
                    playerDie();
                    lavaHand.phase = 'retracting';
                    return;
                }
            } else if (lavaHand.phase === 'grabbing') {
                if (lavaHand.timer > 1500) lavaHand.phase = 'retracting';
                // Still can grab
                if (invulnTimer <= 0 && Math.abs(player.x - lavaHand.x) < 25 && Math.abs(player.y - lavaHand.y) < 30) {
                    sfxGrab();
                    playerDie();
                    lavaHand.phase = 'retracting';
                    return;
                }
            } else {
                lavaHand.y += 2;
                if (lavaHand.y > LAVA_Y + 30) lavaHand = null;
            }
        }

        // ── Enemy AI ──
        for (const e of enemies) {
            if (!e.alive) continue;
            e.flapFrame += ENEMY_FLAP_RATES[e.type];

            // Simple AI: move toward player's general area, flap periodically
            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const spd = ENEMY_SPEEDS[e.type];

            // Egg-stealing: enemies prioritize collecting unhatched eggs
            const nearestEgg = eggs.find(egg => !egg.collected && !egg.hatched && Math.abs(egg.x - e.x) < 120 && Math.abs(egg.y - e.y) < 80);
            const chaseTarget = nearestEgg && Math.random() < 0.6 ? { x: nearestEgg.x, y: nearestEgg.y } : { x: player.x, y: player.y };
            const tdx = chaseTarget.x - e.x;
            const tdy = chaseTarget.y - e.y;

            // Enemy steals egg on contact
            if (nearestEgg && Math.abs(nearestEgg.x - e.x) < 16 && Math.abs(nearestEgg.y - e.y) < 16) {
                nearestEgg.collected = true; // enemy "steals" it
                // Spawn hatched enemy immediately
                const ne = makeEnemy(Math.min(nearestEgg.sourceType + 1, ET_SHADOW));
                ne.x = nearestEgg.x; ne.y = nearestEgg.y - 20;
                enemies.push(ne);
                waveEnemyCount++;
                sfxHatch();
            }

            // Horizontal chase with some randomness
            if (Math.abs(tdx) > 40) {
                e.vx += (tdx > 0 ? 0.08 : -0.08) * spd;
            } else {
                e.vx += rng(-0.1, 0.1);
            }
            e.vx = clamp(e.vx, -spd * 1.3, spd * 1.3);
            e.facing = e.vx > 0 ? 1 : -1;

            // Flap to stay airborne / chase altitude
            if (Math.sin(e.flapFrame) > 0.6 || (tdy < -30 && Math.random() < 0.04 * spd)) {
                e.vy += FLAP_VEL * 0.6;
            }

            e.vy += GRAVITY;
            if (e.vy > MAX_FALL) e.vy = MAX_FALL;
            e.x += e.vx;
            e.y += e.vy;

            // Horizontal wrap
            if (e.x < -WRAP_MARGIN) e.x = GAME_W + WRAP_MARGIN;
            if (e.x > GAME_W + WRAP_MARGIN) e.x = -WRAP_MARGIN;

            // Platform collisions for enemies
            platformCollide(e);

            // Lava kills enemies too - drop egg first
            if (e.y + e.h > LAVA_Y) {
                e.alive = false;
                sfxLava();
            }
        }

        // ── Joust collision ──
        if (invulnTimer <= 0) {
            for (const e of enemies) {
                if (!e.alive) continue;
                const pb = { x: player.x - PLAYER_W / 2, y: player.y - PLAYER_H / 2, w: PLAYER_W, h: PLAYER_H };
                const eb = { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };

                if (boxOverlap(pb, eb)) {
                    // Lance charge: extra damage range when falling + holding direction
                    const chargeBonus = lanceChargeTimer > 300 ? 12 : 0;
                    // Whoever is higher (lower y) wins
                    const playerLance = player.y - 2 - chargeBonus;
                    const enemyLance  = e.y - 2;

                    if (playerLance < enemyLance - 4) {
                        // Player wins
                        defeatEnemy(e);
                    } else if (enemyLance < playerLance - 4) {
                        // Enemy wins
                        playerDie();
                        return;
                    } else {
                        // Bounce off
                        player.vy = -3;
                        player.vx = (player.x < e.x ? -3 : 3);
                        e.vy = -3;
                        e.vx = (e.x < player.x ? -3 : 3);
                        sfxBonk();
                        screenShake = 4;
                    }
                }
            }
        }

        // ── Pterodactyl ──
        pteroTimer += ms;
        if (!ptero && enemies.some(e => e.alive) && pteroTimer > PTERO_DELAY_MS) {
            spawnPtero();
        }
        if (ptero) {
            updatePtero(dt);
            // Ptero vs player
            if (invulnTimer <= 0) {
                const pb2 = { x: player.x - PLAYER_W / 2, y: player.y - PLAYER_H / 2, w: PLAYER_W, h: PLAYER_H };
                const ptb = { x: ptero.x - PTERO_W / 2, y: ptero.y - PTERO_H / 2, w: PTERO_W, h: PTERO_H };
                if (boxOverlap(pb2, ptb)) {
                    // Can only kill ptero by hitting its mouth area
                    const mouthX = ptero.x + ptero.facing * PTERO_W * 0.4;
                    const mouthY = ptero.y - 2;
                    if (Math.abs(player.x - mouthX) < 12 && Math.abs(player.y - mouthY) < 12) {
                        score += 2000;
                        spawnScorePopup(ptero.x, ptero.y, 2000);
                        sfxJoust();
                        ptero = null;
                        screenShake = 8;
                    } else {
                        playerDie();
                        return;
                    }
                }
            }
        }

        // ── Eggs ──
        for (const egg of eggs) {
            if (egg.collected || egg.hatched) continue;

            // Egg physics
            egg.vy += GRAVITY * 0.5;
            egg.y += egg.vy;
            platformCollideEgg(egg);

            // Collect
            const ed = dist({ x: player.x, y: player.y }, { x: egg.x, y: egg.y });
            if (ed < 18) {
                egg.collected = true;
                score += EGG_SCORE;
                spawnScorePopup(egg.x, egg.y, EGG_SCORE);
                sfxEggPop();
                continue;
            }

            // Hatch timer
            egg.age += ms;
            if (egg.age > EGG_HATCH_MS) {
                egg.hatched = true;
                // Spawn a stronger enemy
                const newType = Math.min(egg.sourceType + 1, ET_SHADOW);
                const ne = makeEnemy(newType);
                ne.x = egg.x; ne.y = egg.y - 20;
                enemies.push(ne);
                waveEnemyCount++;
                sfxHatch();
                for (let i = 0; i < 8; i++) {
                    particles.push({
                        x: egg.x, y: egg.y,
                        vx: rng(-2, 2), vy: rng(-3, 0),
                        life: 0.5, maxLife: 0.5,
                        r: 3, color: '#FFFDE7', type: 'spark',
                    });
                }
            }

            // Egg falls in lava
            if (egg.y > LAVA_Y) { egg.collected = true; }
        }

        // ── Wave complete? ──
        const aliveEnemies = enemies.filter(e => e.alive).length;
        const activeEggs = eggs.filter(e => !e.collected && !e.hatched).length;
        if (bonusWave) {
            // Bonus wave ends when all eggs collected or gone
            if (activeEggs === 0) {
                bonusWave = false;
                nextWave();
            }
        } else if (aliveEnemies === 0 && activeEggs === 0) {
            nextWave();
        }

        // Update effects
        updateParticles(dt);
        updateScorePopups(dt);
        animateLava(dt);
        if (screenShake > 0) screenShake -= dt * 20;
    }

    function platformCollide(ent) {
        const hw = (ent.w || PLAYER_W) / 2;
        const hh = (ent.h || PLAYER_H) / 2;
        for (const p of PLATFORMS) {
            if (ent.x + hw > p.x && ent.x - hw < p.x + p.w) {
                // Landing on top
                if (ent.vy > 0 && ent.y + hh >= p.y && ent.y + hh - ent.vy <= p.y + 4) {
                    ent.y = p.y - hh;
                    ent.vy = 0;
                    ent.onGround = true;
                }
                // Hitting bottom
                if (ent.vy < 0 && ent.y - hh <= p.y + PLAT_H && ent.y - hh - ent.vy >= p.y + PLAT_H - 4) {
                    ent.y = p.y + PLAT_H + hh;
                    ent.vy = 1;
                }
            }
        }
    }

    function platformCollideEgg(egg) {
        for (const p of PLATFORMS) {
            if (egg.x > p.x && egg.x < p.x + p.w) {
                if (egg.vy > 0 && egg.y + EGG_H / 2 >= p.y && egg.y + EGG_H / 2 - egg.vy <= p.y + 4) {
                    egg.y = p.y - EGG_H / 2;
                    egg.vy = 0;
                }
            }
        }
    }

    function defeatEnemy(e) {
        e.alive = false;
        score += ENEMY_SCORES[e.type];
        spawnScorePopup(e.x, e.y, ENEMY_SCORES[e.type]);
        sfxJoust();
        screenShake = 6;

        // Spawn egg
        eggs.push({
            x: e.x, y: e.y, vy: -2,
            sourceType: e.type, age: 0,
            collected: false, hatched: false,
            crack: 0,
        });

        // Impact sparks
        for (let i = 0; i < 12; i++) {
            particles.push({
                x: e.x, y: e.y,
                vx: rng(-4, 4), vy: rng(-4, 2),
                life: 0.6, maxLife: 0.6,
                r: rng(2, 5), color: pick(['#FFD700', '#FF6347', '#FFF']), type: 'spark',
            });
        }

        // Rider falls off
        particles.push({
            x: e.x, y: e.y - 10,
            vx: rng(-2, 2), vy: -4,
            life: 2.0, maxLife: 2.0,
            r: 8, color: ENEMY_COLORS[e.type], type: 'rider',
            gy: 0.15,
        });

        player.vy = -3; // bounce after kill
    }

    function playerDie() {
        sfxDeath();
        screenShake = 10;
        lives--;
        state = ST_DYING;
        deathTimer = DEATH_ANIM_MS;
        player.alive = false;

        // Death particles
        for (let i = 0; i < 15; i++) {
            particles.push({
                x: player.x, y: player.y,
                vx: rng(-3, 3), vy: rng(-5, 1),
                life: 1.0, maxLife: 1.0,
                r: rng(2, 5), color: pick([playerColor, '#FFF', '#FFD700']), type: 'spark',
            });
        }
        // Rider falls
        particles.push({
            x: player.x, y: player.y - 10,
            vx: rng(-2, 2), vy: -5,
            life: 2.0, maxLife: 2.0,
            r: 8, color: playerColor, type: 'rider',
            gy: 0.15,
        });
    }

    function spawnPtero() {
        const side = Math.random() < 0.5 ? -40 : GAME_W + 40;
        ptero = {
            x: side, y: rng(80, 250),
            vx: (side < 0 ? 1.8 : -1.8), vy: 0,
            facing: side < 0 ? 1 : -1,
            wingFrame: 0,
        };
        sfxPtero();
    }

    function updatePtero(dt) {
        ptero.wingFrame += dt * 8;
        // Chase player loosely
        const dx = player.x - ptero.x;
        const dy = player.y - ptero.y;
        ptero.vx += (dx > 0 ? 0.04 : -0.04);
        ptero.vy += (dy > 0 ? 0.03 : -0.03);
        ptero.vx = clamp(ptero.vx, -3, 3);
        ptero.vy = clamp(ptero.vy, -2, 2);
        ptero.x += ptero.vx;
        ptero.y += ptero.vy;
        ptero.facing = ptero.vx > 0 ? 1 : -1;

        // Wrap
        if (ptero.x < -60) ptero.x = GAME_W + 60;
        if (ptero.x > GAME_W + 60) ptero.x = -60;
    }

    // ── DYING ──
    function updateDying(dt) {
        deathTimer -= dt * 1000;
        updateParticles(dt);
        updateScorePopups(dt);
        animateLava(dt);

        // Enemies still move
        for (const e of enemies) {
            if (!e.alive) continue;
            e.vy += GRAVITY;
            e.y += e.vy;
            e.x += e.vx;
            platformCollide(e);
            if (e.x < -WRAP_MARGIN) e.x = GAME_W + WRAP_MARGIN;
            if (e.x > GAME_W + WRAP_MARGIN) e.x = -WRAP_MARGIN;
        }

        if (deathTimer <= 0) {
            if (lives <= 0) {
                state = ST_GAMEOVER;
                if (score > hiScore) { hiScore = score; try { localStorage.setItem(LS_KEY, hiScore); } catch {} }
                if (gameOverCB) gameOverCB(score);
            } else {
                resetPlayer();
                invulnTimer = INVULN_MS;
                state = ST_PLAY;
            }
        }
    }

    // ── GAME OVER ──
    function updateGameOver(dt) {
        updateParticles(dt);
        animateLava(dt);
        if (keys['Space'] || keys['Enter'] || touchFlap) {
            keys['Space'] = false;
            keys['Enter'] = false;
            touchFlap = false;
            state = ST_TITLE;
        }
    }

    // ── PARTICLES ──
    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            p.x += p.vx;
            if (p.gy) p.vy += p.gy;
            p.vy += (p.type === 'rider' ? 0.15 : 0);
            p.y += p.vy;
            // Rider bounces on platforms/lava
            if (p.type === 'rider') {
                if (p.y > LAVA_Y - 4) { p.y = LAVA_Y - 4; p.vy = -Math.abs(p.vy) * 0.5; }
                for (const pl of PLATFORMS) {
                    if (p.x > pl.x && p.x < pl.x + pl.w && p.y > pl.y - 4 && p.y < pl.y + PLAT_H) {
                        p.y = pl.y - 4;
                        p.vy = -Math.abs(p.vy) * 0.5;
                    }
                }
            }
        }
    }

    function updateScorePopups(dt) {
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const s = scorePopups[i];
            s.life -= dt;
            s.y -= 30 * dt;
            if (s.life <= 0) scorePopups.splice(i, 1);
        }
    }

    function spawnScorePopup(x, y, val) {
        scorePopups.push({ x, y, val, life: 1.2, maxLife: 1.2 });
    }

    function animateLava(dt) {
        // Refresh lava bubble particles
        if (frameCount % 8 === 0) {
            lavaParticles.push({
                x: rng(0, GAME_W), y: LAVA_Y + rng(0, LAVA_H * 0.3),
                r: rng(2, 5), life: rng(0.5, 1.2), maxLife: 1.2, vy: rng(-0.5, -0.1),
            });
        }
        for (let i = lavaParticles.length - 1; i >= 0; i--) {
            lavaParticles[i].life -= dt;
            lavaParticles[i].y += lavaParticles[i].vy;
            if (lavaParticles[i].life <= 0) lavaParticles.splice(i, 1);
        }
    }

    // ═══════════════════════════════════════
    //  RENDERING
    // ═══════════════════════════════════════
    function render() {
        ctx.save();
        // Screen shake
        if (screenShake > 0) {
            ctx.translate(rng(-screenShake, screenShake) * SCALE, rng(-screenShake, screenShake) * SCALE);
        }

        drawBackground();
        drawPlatforms();
        drawLava();
        drawEggs();

        if (state === ST_PLAY || state === ST_DYING || state === ST_WAVE_SPLASH) {
            drawEnemies();
            if (ptero) drawPtero();
            if (player.alive) drawPlayer();
        }

        drawParticles();
        drawScorePopups();
        drawVignette();
        drawHUD();

        if (state === ST_TITLE) drawTitleScreen();
        if (state === ST_WAVE_SPLASH) drawWaveSplash();
        if (state === ST_GAMEOVER) drawGameOverScreen();

        // Touch controls overlay
        if (state === ST_PLAY) drawOnScreenControls(ctx, W, H, gs, ['FLAP'], 'LR');

        ctx.restore();
    }

    function drawBackground() {
        // Dark cave gradient
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#0a0a1a');
        grad.addColorStop(0.5, '#111128');
        grad.addColorStop(1, '#1a0a0a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Stalactites
        ctx.fillStyle = '#1a1a2e';
        for (const s of stalactites) {
            const sx = gx(s.x), sw = gs(s.w), sh = gs(s.h);
            ctx.beginPath();
            ctx.moveTo(sx - sw / 2, 0);
            ctx.lineTo(sx + sw / 2, 0);
            ctx.lineTo(sx + sw * 0.15, sh);
            ctx.lineTo(sx - sw * 0.15, sh);
            ctx.closePath();
            ctx.fill();
        }
        // Stalactite tips glow
        ctx.fillStyle = '#2a2a4e';
        for (const s of stalactites) {
            const sx = gx(s.x), sh = gs(s.h);
            ctx.beginPath();
            ctx.arc(sx, sh, gs(2), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawPlatforms() {
        for (const p of PLATFORMS) {
            const px = gx(p.x), py = gy(p.y), pw = gs(p.w), ph = gs(PLAT_H);

            // Try sprite platform
            if (allSpritesReady && sprites['stoneMid']) {
                const tileW = gs(40);
                for (let tx = 0; tx < pw; tx += tileW) {
                    const drawW = Math.min(tileW, pw - tx);
                    ctx.drawImage(sprites['stoneMid'], px + tx, py, drawW, ph + gs(4));
                }
                continue;
            }

            // Platform body — stone texture fallback
            const grad = ctx.createLinearGradient(px, py, px, py + ph);
            grad.addColorStop(0, '#5C534A');
            grad.addColorStop(0.5, '#3E362E');
            grad.addColorStop(1, '#2A2420');
            ctx.fillStyle = grad;
            ctx.fillRect(px, py, pw, ph);

            // Top edge highlight
            ctx.fillStyle = '#7A7068';
            ctx.fillRect(px, py, pw, gs(2));

            // Edge stones
            ctx.fillStyle = '#4A4238';
            ctx.fillRect(px, py, gs(4), ph);
            ctx.fillRect(px + pw - gs(4), py, gs(4), ph);

            // Rock texture dots
            ctx.fillStyle = '#504840';
            for (let dx = 8; dx < p.w - 8; dx += 12) {
                for (let dy = 4; dy < PLAT_H - 2; dy += 5) {
                    if (Math.sin(dx * 3.7 + dy * 2.3) > 0.3) {
                        ctx.fillRect(gx(p.x + dx), gy(p.y + dy), gs(2), gs(1));
                    }
                }
            }

            // Moss patches on top — more visible
            ctx.fillStyle = 'rgba(34,140,60,0.55)';
            for (let mx = 4; mx < p.w - 4; mx += 7) {
                if (Math.sin(mx * 2.1 + p.x) > 0) {
                    const mw = 5 + Math.sin(mx * 1.3) * 3;
                    ctx.fillRect(gx(p.x + mx), py - gs(1), gs(mw), gs(4));
                }
            }
            // Moss drip — more visible
            ctx.fillStyle = 'rgba(34,140,60,0.35)';
            for (let mx = 10; mx < p.w - 10; mx += 18) {
                if (Math.sin(mx * 3.3 + p.x * 0.5) > 0.4) {
                    ctx.fillRect(gx(p.x + mx), py + ph, gs(2), gs(rng(3, 8)));
                }
            }

            // Stone crack details
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth = gs(0.5);
            for (let cx = 15; cx < p.w - 15; cx += 25) {
                if (Math.sin(cx * 5.1 + p.y) > 0.5) {
                    ctx.beginPath();
                    ctx.moveTo(gx(p.x + cx), py + gs(2));
                    ctx.lineTo(gx(p.x + cx + rng(-4, 4)), py + ph - gs(2));
                    ctx.stroke();
                }
            }
        }
    }

    function drawLava() {
        // Try sprite lava tiles
        if (allSpritesReady && sprites['lava'] && sprites['lavaTop']) {
            const ly = gy(LAVA_Y);
            const tileW = gs(40), tileH = gs(LAVA_H);
            // Top row
            for (let tx = 0; tx < W; tx += tileW) {
                ctx.drawImage(sprites['lavaTop'], tx, ly - gs(4), tileW, gs(20));
            }
            // Fill
            for (let tx = 0; tx < W; tx += tileW) {
                ctx.drawImage(sprites['lava'], tx, ly + gs(14), tileW, tileH);
            }
            // Glow effect
            ctx.fillStyle = 'rgba(255,69,0,0.15)';
            ctx.fillRect(0, ly - gs(20), W, gs(20));
            return;
        }
        const ly = gy(LAVA_Y), lh = gs(LAVA_H);

        // Lava glow
        const glowGrad = ctx.createLinearGradient(0, ly - gs(20), 0, ly);
        glowGrad.addColorStop(0, 'rgba(255,69,0,0)');
        glowGrad.addColorStop(1, 'rgba(255,69,0,0.3)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, ly - gs(20), W, gs(20));

        // Lava surface wave
        ctx.beginPath();
        ctx.moveTo(0, ly);
        for (let x = 0; x <= GAME_W; x += 4) {
            const waveY = Math.sin(x * 0.04 + frameCount * 0.05) * 3 +
                          Math.sin(x * 0.08 + frameCount * 0.03) * 1.5;
            ctx.lineTo(gx(x), gy(LAVA_Y + waveY));
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();

        const lavaGrad = ctx.createLinearGradient(0, ly, 0, H);
        lavaGrad.addColorStop(0, '#FF4500');
        lavaGrad.addColorStop(0.3, '#FF6347');
        lavaGrad.addColorStop(0.6, '#DC2626');
        lavaGrad.addColorStop(1, '#7F1D1D');
        ctx.fillStyle = lavaGrad;
        ctx.fill();

        // Lava bubbles with pop effect
        for (const b of lavaParticles) {
            const alpha = b.life / b.maxLife;
            ctx.globalAlpha = alpha;
            // Bubble glow
            ctx.shadowColor = '#FF6347';
            ctx.shadowBlur = gs(b.r * 2);
            ctx.fillStyle = alpha > 0.3 ? '#FFD700' : '#FF4500';
            ctx.beginPath();
            ctx.arc(gx(b.x), gy(b.y), gs(b.r * (1 + (1 - alpha) * 0.3)), 0, Math.PI * 2);
            ctx.fill();
            // Bubble highlight
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.arc(gx(b.x) - gs(1), gy(b.y) - gs(1), gs(b.r * 0.3), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;

        // More frequent eruption particles — bigger and more visible
        if (frameCount % 25 === 0) {
            const ex = rng(20, GAME_W - 20);
            for (let i = 0; i < 8; i++) {
                particles.push({
                    x: ex + rng(-12, 12), y: LAVA_Y,
                    vx: rng(-2, 2), vy: rng(-8, -3),
                    life: rng(0.5, 1.0), maxLife: 1.0,
                    r: rng(2, 5), color: pick(['#FF4500', '#FFD700', '#FF6347', '#FFAA00']), type: 'spark',
                });
            }
        }
        // Secondary small bubbles constantly rising
        if (frameCount % 8 === 0) {
            particles.push({
                x: rng(10, GAME_W - 10), y: LAVA_Y + rng(5, 20),
                vx: rng(-0.5, 0.5), vy: rng(-2, -0.5),
                life: rng(0.2, 0.5), maxLife: 0.5,
                r: rng(1, 3), color: '#FFD700', type: 'spark',
            });
        }

        // Draw lava hand if active
        if (lavaHand) {
            drawLavaHand();
        }
    }

    function drawLavaHand() {
        if (!lavaHand) return;
        const hx = gx(lavaHand.x), hy = gy(lavaHand.y);

        ctx.save();
        ctx.translate(hx, hy);

        // Arm coming from lava
        const armGrad = ctx.createLinearGradient(0, gs(60), 0, 0);
        armGrad.addColorStop(0, '#8B0000');
        armGrad.addColorStop(0.5, '#5C3A1E');
        armGrad.addColorStop(1, '#4A2F1A');
        ctx.fillStyle = armGrad;
        ctx.fillRect(-gs(8), 0, gs(16), gs(LAVA_Y - lavaHand.y + 30));

        // Troll hand
        ctx.fillStyle = '#5C3A1E';
        // Palm
        ctx.beginPath();
        ctx.ellipse(0, 0, gs(14), gs(10), 0, 0, Math.PI * 2);
        ctx.fill();
        // Fingers (grabbing motion)
        const grabAngle = lavaHand.phase === 'grabbing' ? Math.sin(frameCount * 0.15) * 0.3 : 0;
        for (let i = -2; i <= 2; i++) {
            const angle = i * 0.35 - Math.PI / 2 + grabAngle;
            const fLen = gs(12 + Math.abs(i) * 2);
            ctx.strokeStyle = '#5C3A1E';
            ctx.lineWidth = gs(4);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * gs(10), Math.sin(angle) * gs(7));
            ctx.lineTo(Math.cos(angle - 0.3) * fLen, Math.sin(angle - 0.3) * fLen);
            ctx.stroke();
            // Claws
            ctx.strokeStyle = '#2A1A0A';
            ctx.lineWidth = gs(2);
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle - 0.3) * fLen, Math.sin(angle - 0.3) * fLen);
            ctx.lineTo(Math.cos(angle - 0.5) * (fLen + gs(4)), Math.sin(angle - 0.5) * (fLen + gs(4)));
            ctx.stroke();
        }

        // Warning glow
        ctx.shadowColor = '#FF4500';
        ctx.shadowBlur = gs(15) + Math.sin(frameCount * 0.2) * gs(5);
        ctx.fillStyle = 'rgba(255,69,0,0.15)';
        ctx.beginPath();
        ctx.arc(0, 0, gs(25), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    function drawPlayer() {
        const px = gx(player.x), py = gy(player.y);
        const f = player.facing;
        const blink = invulnTimer > 0 && Math.floor(frameCount / 3) % 2 === 0;
        if (blink) return;

        // Try sprite player
        if (allSpritesReady) {
            const flapping = player.vy < -1;
            let sprKey;
            if (flapping) sprKey = 'playerJump';
            else if (Math.abs(player.vx) > 0.5) sprKey = (Math.floor(frameCount / 8) % 2 === 0) ? 'playerWalk1' : 'playerWalk2';
            else sprKey = 'playerStand';
            const spr = sprites[sprKey];
            if (spr) {
                drawSprite(spr, player.x - PLAYER_W / 2 - 4, player.y - PLAYER_H / 2 - 6, PLAYER_W + 8, PLAYER_H + 10, f < 0);
                return;
            }
        }

        ctx.save();
        ctx.translate(px, py);
        ctx.scale(f * SCALE, SCALE);

        // Ostrich body
        ctx.fillStyle = '#D4A574';
        ctx.beginPath();
        ctx.ellipse(0, 4, 12, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ostrich legs
        ctx.strokeStyle = '#B8860B';
        ctx.lineWidth = 1.5;
        const legPhase = player.onGround ? 0 : Math.sin(frameCount * 0.3) * 0.4;
        ctx.beginPath();
        ctx.moveTo(-4, 10);
        ctx.lineTo(-6, 18 + Math.sin(legPhase) * 3);
        ctx.moveTo(4, 10);
        ctx.lineTo(6, 18 + Math.cos(legPhase) * 3);
        ctx.stroke();

        // Wings — animated flap cycle (up/down)
        const flapCycle = player.flapping ? -0.9 - Math.sin(frameCount * 0.8) * 0.3 : 0.3 + Math.sin(frameCount * 0.1) * 0.1;
        // Upper wing
        ctx.fillStyle = '#C09060';
        ctx.save();
        ctx.translate(-2, -2);
        ctx.rotate(flapCycle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-12, -4);
        ctx.lineTo(-10, 2);
        ctx.closePath();
        ctx.fill();
        // Wing feather tips
        ctx.fillStyle = '#A07848';
        ctx.beginPath();
        ctx.moveTo(-10, -3);
        ctx.lineTo(-15, -6);
        ctx.lineTo(-12, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // Lower wing (slight offset for flap depth)
        ctx.fillStyle = '#B08050';
        ctx.save();
        ctx.translate(-2, 2);
        ctx.rotate(flapCycle * 0.7 + 0.2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-10, 3);
        ctx.lineTo(-8, -1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Ostrich neck
        ctx.strokeStyle = '#D4A574';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(6, -2);
        ctx.quadraticCurveTo(10, -10, 8, -14);
        ctx.stroke();

        // Ostrich head
        ctx.fillStyle = '#D4A574';
        ctx.beginPath();
        ctx.arc(8, -15, 4, 0, Math.PI * 2);
        ctx.fill();

        // Beak
        ctx.fillStyle = '#F4A460';
        ctx.beginPath();
        ctx.moveTo(11, -16);
        ctx.lineTo(16, -15);
        ctx.lineTo(11, -13);
        ctx.closePath();
        ctx.fill();

        // Eye
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(10, -16, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Knight body (rider)
        ctx.fillStyle = playerColor;
        ctx.beginPath();
        ctx.ellipse(0, -6, 7, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Helmet
        ctx.fillStyle = playerColor;
        ctx.beginPath();
        ctx.arc(0, -14, 5, 0, Math.PI * 2);
        ctx.fill();
        // Visor
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(2, -16, 4, 3);
        // Helmet plume
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.moveTo(-2, -19);
        ctx.quadraticCurveTo(0, -24, 6, -20);
        ctx.lineTo(0, -18);
        ctx.closePath();
        ctx.fill();

        // Lance with armor detail
        ctx.fillStyle = '#C0C0C0';
        ctx.fillRect(8, -8, LANCE_LEN + 2, LANCE_H / 2 + 1);
        ctx.fillStyle = '#E0E0E0';
        ctx.fillRect(8, -8, LANCE_LEN, LANCE_H / 2);
        // Lance tip
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.moveTo(8 + LANCE_LEN, -10);
        ctx.lineTo(8 + LANCE_LEN + 6, -7);
        ctx.lineTo(8 + LANCE_LEN, -4);
        ctx.closePath();
        ctx.fill();
        // Lance charge glow
        if (lanceChargeTimer > 300) {
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 8 + Math.sin(frameCount * 0.3) * 3;
            ctx.fillStyle = 'rgba(255,215,0,0.4)';
            ctx.beginPath();
            ctx.ellipse(8 + LANCE_LEN + 3, -7, 8, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Armor detail on rider
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(0, -6, 5, 0.5, 2.5);
        ctx.stroke();

        ctx.restore();
    }

    function drawEnemies() {
        for (const e of enemies) {
            if (!e.alive) continue;
            const ex = gx(e.x), ey = gy(e.y);
            const f = e.facing;

            // Try sprite enemy
            if (allSpritesReady) {
                const flapping = e.vy < -0.5;
                let sprKey;
                if (e.type === ET_BOUNDER) sprKey = flapping ? 'enemyRedJ' : 'enemyRed';
                else if (e.type === ET_HUNTER) sprKey = flapping ? 'enemyGreyJ' : 'enemyGrey';
                else sprKey = flapping ? 'enemyShadowJ' : 'enemyShadow';
                const spr = sprites[sprKey];
                if (spr) {
                    drawSprite(spr, e.x - PLAYER_W / 2 - 2, e.y - PLAYER_H / 2 - 4, PLAYER_W + 4, PLAYER_H + 6, f < 0);
                    continue;
                }
            }

            ctx.save();
            ctx.translate(ex, ey);
            ctx.scale(f * SCALE, SCALE);

            // Buzzard body
            ctx.fillStyle = '#4A3728';
            ctx.beginPath();
            ctx.ellipse(0, 4, 11, 7, 0, 0, Math.PI * 2);
            ctx.fill();

            // Buzzard wings — animated flap cycle
            const wingAngle = Math.sin(e.flapFrame) * 0.8;
            // Upper wing
            ctx.fillStyle = '#3A2818';
            ctx.save();
            ctx.translate(-2, -1);
            ctx.rotate(wingAngle);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-14, -5);
            ctx.lineTo(-11, 2);
            ctx.closePath();
            ctx.fill();
            // Wing feather tips
            ctx.fillStyle = '#2A1808';
            ctx.beginPath();
            ctx.moveTo(-11, -4);
            ctx.lineTo(-17, -7);
            ctx.lineTo(-13, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            // Lower wing
            ctx.fillStyle = '#3A2818';
            ctx.save();
            ctx.translate(-2, 2);
            ctx.rotate(wingAngle * 0.6 + 0.2);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-12, 4);
            ctx.lineTo(-9, -1);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // Buzzard legs
            ctx.strokeStyle = '#5A4728';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(-3, 9); ctx.lineTo(-5, 16);
            ctx.moveTo(3, 9); ctx.lineTo(5, 16);
            ctx.stroke();

            // Buzzard head
            ctx.fillStyle = '#4A3728';
            ctx.beginPath();
            ctx.arc(7, -8, 4, 0, Math.PI * 2);
            ctx.fill();
            // Beak
            ctx.fillStyle = '#8B7355';
            ctx.beginPath();
            ctx.moveTo(10, -9);
            ctx.lineTo(15, -7);
            ctx.lineTo(10, -6);
            ctx.closePath();
            ctx.fill();

            // Enemy rider body
            ctx.fillStyle = ENEMY_COLORS[e.type];
            ctx.beginPath();
            ctx.ellipse(0, -5, 6, 5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Helmet
            ctx.fillStyle = ENEMY_COLORS[e.type];
            ctx.beginPath();
            ctx.arc(0, -12, 4.5, 0, Math.PI * 2);
            ctx.fill();
            // Visor
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(2, -14, 3.5, 2.5);

            // Enemy lance
            ctx.fillStyle = ENEMY_GLOWS[e.type];
            ctx.fillRect(6, -7, 12, 1.5);

            // Glow effect for Shadow Lord
            if (e.type === ET_SHADOW) {
                ctx.shadowColor = ENEMY_GLOWS[e.type];
                ctx.shadowBlur = 8;
                ctx.fillStyle = 'rgba(59,130,246,0.15)';
                ctx.beginPath();
                ctx.ellipse(0, 0, 16, 12, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            ctx.restore();
        }
    }

    function drawPtero() {
        const px = gx(ptero.x), py = gy(ptero.y);
        const f = ptero.facing;
        const wingAngle = Math.sin(ptero.wingFrame) * 0.6;

        ctx.save();
        ctx.translate(px, py);
        ctx.scale(f * SCALE, SCALE);

        // Warning glow
        ctx.shadowColor = '#FF0000';
        ctx.shadowBlur = 10 + Math.sin(frameCount * 0.2) * 5;

        // Body
        ctx.fillStyle = '#4A5568';
        ctx.beginPath();
        ctx.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Wings
        ctx.fillStyle = '#374151';
        ctx.save();
        ctx.rotate(wingAngle);
        ctx.beginPath();
        ctx.moveTo(-5, -2);
        ctx.lineTo(-24, -14);
        ctx.lineTo(-20, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.rotate(-wingAngle * 0.8);
        ctx.beginPath();
        ctx.moveTo(-5, 2);
        ctx.lineTo(-24, 14);
        ctx.lineTo(-20, -2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Head
        ctx.fillStyle = '#4A5568';
        ctx.beginPath();
        ctx.arc(16, -2, 7, 0, Math.PI * 2);
        ctx.fill();

        // Crest
        ctx.fillStyle = '#DC2626';
        ctx.beginPath();
        ctx.moveTo(12, -8);
        ctx.lineTo(18, -14);
        ctx.lineTo(20, -6);
        ctx.closePath();
        ctx.fill();

        // Mouth (kill zone)
        ctx.fillStyle = '#FF4444';
        ctx.beginPath();
        ctx.moveTo(20, -3);
        ctx.lineTo(28, -1);
        ctx.lineTo(20, 1);
        ctx.closePath();
        ctx.fill();

        // Eye
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(18, -4, 2, 0, Math.PI * 2);
        ctx.fill();

        // Tail
        ctx.fillStyle = '#374151';
        ctx.beginPath();
        ctx.moveTo(-18, -3);
        ctx.lineTo(-30, -8);
        ctx.lineTo(-28, 0);
        ctx.lineTo(-30, 8);
        ctx.lineTo(-18, 3);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    function drawEggs() {
        for (const egg of eggs) {
            if (egg.collected || egg.hatched) continue;
            const ex = gx(egg.x), ey = gy(egg.y);
            const hatchProgress = egg.age / EGG_HATCH_MS;

            ctx.save();
            ctx.translate(ex, ey);

            // Try sprite egg
            if (allSpritesReady && sprites['coinGold']) {
                ctx.drawImage(sprites['coinGold'], -gs(EGG_W / 2), -gs(EGG_H / 2), gs(EGG_W), gs(EGG_H));
                ctx.restore();
                continue;
            }
            // Egg body fallback
            ctx.fillStyle = hatchProgress > 0.7 ? '#FFCCCC' : '#FFFFF0';
            ctx.beginPath();
            ctx.ellipse(0, 0, gs(EGG_W / 2), gs(EGG_H / 2), 0, 0, Math.PI * 2);
            ctx.fill();

            // Egg outline
            ctx.strokeStyle = '#999';
            ctx.lineWidth = gs(1);
            ctx.stroke();

            // Cracks as it ages
            if (hatchProgress > 0.3) {
                ctx.strokeStyle = '#666';
                ctx.lineWidth = gs(0.5);
                const n = Math.floor(hatchProgress * 5);
                for (let i = 0; i < n; i++) {
                    const angle = (i / n) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(angle) * gs(EGG_W * 0.4), Math.sin(angle) * gs(EGG_H * 0.4));
                    ctx.stroke();
                }
            }

            // Shake when about to hatch
            if (hatchProgress > 0.8) {
                const shake = Math.sin(frameCount * 0.5) * gs(1);
                ctx.translate(shake, 0);
            }

            ctx.restore();
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = clamp(p.life / p.maxLife, 0, 1);
            ctx.globalAlpha = alpha;

            if (p.type === 'rider') {
                // Fallen rider
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(gx(p.x), gy(p.y), gs(p.r), 0, Math.PI * 2);
                ctx.fill();
                // Arms flailing
                ctx.strokeStyle = p.color;
                ctx.lineWidth = gs(1);
                const armAngle = Math.sin(frameCount * 0.3) * 0.5;
                ctx.beginPath();
                ctx.moveTo(gx(p.x) - gs(4), gy(p.y));
                ctx.lineTo(gx(p.x) - gs(10), gy(p.y) - gs(6) * Math.sin(armAngle));
                ctx.moveTo(gx(p.x) + gs(4), gy(p.y));
                ctx.lineTo(gx(p.x) + gs(10), gy(p.y) + gs(6) * Math.cos(armAngle));
                ctx.stroke();
            } else if (p.type === 'wind') {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(gx(p.x), gy(p.y), gs(p.r * alpha), 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Spark
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(gx(p.x), gy(p.y), gs(p.r * alpha), 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawScorePopups() {
        for (const s of scorePopups) {
            const alpha = clamp(s.life / s.maxLife, 0, 1);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#FFD700';
            ctx.font = `bold ${gs(12)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(`+${s.val}`, gx(s.x), gy(s.y));
        }
        ctx.globalAlpha = 1;
    }

    function drawVignette() {
        const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    function drawHUD() {
        if (state === ST_TITLE) return;
        ctx.fillStyle = '#E0E7FF';
        ctx.font = `bold ${gs(14)}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE ${String(score).padStart(7, '0')}`, gs(8), gs(18));
        ctx.textAlign = 'right';
        ctx.fillText(`WAVE ${wave}`, gs(GAME_W - 8), gs(18));

        // Lives
        ctx.textAlign = 'left';
        for (let i = 0; i < lives; i++) {
            const lx = gs(8 + i * 18), ly = gs(30);
            ctx.fillStyle = playerColor;
            ctx.beginPath();
            ctx.arc(lx + gs(6), ly + gs(4), gs(5), 0, Math.PI * 2);
            ctx.fill();
            // Mini lance
            ctx.fillStyle = '#E0E0E0';
            ctx.fillRect(lx + gs(10), ly + gs(2), gs(6), gs(1.5));
        }
    }

    function drawTitleScreen() {
        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(10,10,26,0.7)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';

        // Title
        ctx.fillStyle = '#FFD700';
        ctx.font = `bold ${gs(36)}px monospace`;
        ctx.fillText('JOUST', W / 2, H * 0.3);

        // Subtitle
        ctx.fillStyle = '#94A3B8';
        ctx.font = `${gs(12)}px monospace`;
        ctx.fillText('Flap to fly. Be higher to win.', W / 2, H * 0.38);

        // Controls
        ctx.fillStyle = '#64748B';
        ctx.font = `${gs(10)}px monospace`;
        ctx.fillText('ARROWS / WASD to move', W / 2, H * 0.50);
        ctx.fillText('SPACE / UP to flap', W / 2, H * 0.55);
        ctx.fillText('Joust: higher lance wins!', W / 2, H * 0.60);
        ctx.fillText('Collect eggs before they hatch!', W / 2, H * 0.65);

        // Start prompt
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.fillStyle = '#FFD700';
            ctx.font = `bold ${gs(14)}px monospace`;
            ctx.fillText('PRESS SPACE TO START', W / 2, H * 0.78);
        }

        // Knight + ostrich illustration
        drawTitleKnight(W / 2, H * 0.15);
    }

    function drawTitleKnight(x, y) {
        ctx.save();
        ctx.translate(x, y);

        // Big ostrich
        ctx.fillStyle = '#D4A574';
        ctx.beginPath();
        ctx.ellipse(0, gs(10), gs(24), gs(16), 0, 0, Math.PI * 2);
        ctx.fill();

        // Wing flap animation
        const wingA = Math.sin(frameCount * 0.06) * 0.5;
        ctx.fillStyle = '#C09060';
        ctx.save();
        ctx.rotate(wingA);
        ctx.beginPath();
        ctx.ellipse(-gs(4), -gs(6), gs(20), gs(8), -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Knight
        ctx.fillStyle = playerColor || '#06B6D4';
        ctx.beginPath();
        ctx.ellipse(0, -gs(8), gs(14), gs(12), 0, 0, Math.PI * 2);
        ctx.fill();

        // Helmet
        ctx.beginPath();
        ctx.arc(0, -gs(22), gs(10), 0, Math.PI * 2);
        ctx.fill();

        // Lance
        ctx.fillStyle = '#E0E0E0';
        ctx.fillRect(gs(12), -gs(14), gs(30), gs(3));
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(gs(38), -gs(16), gs(6), gs(7));

        ctx.restore();
    }

    function drawWaveSplash() {
        ctx.fillStyle = 'rgba(10,10,26,0.6)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700';
        ctx.font = `bold ${gs(28)}px monospace`;
        ctx.fillText(`WAVE ${wave}`, W / 2, H * 0.4);

        ctx.fillStyle = '#94A3B8';
        ctx.font = `${gs(12)}px monospace`;
        if (bonusWave) {
            ctx.fillStyle = '#22C55E';
            ctx.font = `bold ${gs(14)}px monospace`;
            ctx.fillText('BONUS WAVE!', W / 2, H * 0.46);
            ctx.fillStyle = '#94A3B8';
            ctx.font = `${gs(11)}px monospace`;
            ctx.fillText('Collect all the eggs!', W / 2, H * 0.52);
        } else {
            const count = enemies.filter(e => e.alive).length;
            const types = [];
            if (enemies.some(e => e.type === ET_BOUNDER)) types.push('Bounders');
            if (enemies.some(e => e.type === ET_HUNTER)) types.push('Hunters');
            if (enemies.some(e => e.type === ET_SHADOW)) types.push('Shadow Lords');
            ctx.fillText(`${count} enemies: ${types.join(', ')}`, W / 2, H * 0.48);
        }

        // Progress bar
        const progress = 1 - waveSplashTimer / WAVE_SPLASH_MS;
        const barW = gs(160);
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(W / 2 - barW / 2, H * 0.55, barW, gs(6));
        ctx.fillStyle = playerColor;
        ctx.fillRect(W / 2 - barW / 2, H * 0.55, barW * progress, gs(6));
    }

    function drawGameOverScreen() {
        ctx.fillStyle = 'rgba(10,10,26,0.8)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#EF4444';
        ctx.font = `bold ${gs(28)}px monospace`;
        ctx.fillText('GAME OVER', W / 2, H * 0.35);

        ctx.fillStyle = '#FFD700';
        ctx.font = `bold ${gs(18)}px monospace`;
        ctx.fillText(`SCORE: ${score}`, W / 2, H * 0.45);

        ctx.fillStyle = '#94A3B8';
        ctx.font = `${gs(12)}px monospace`;
        ctx.fillText(`Reached Wave ${wave}`, W / 2, H * 0.53);

        if (hiScore > 0) {
            ctx.fillStyle = score >= hiScore ? '#22C55E' : '#FFD700';
            ctx.font = `bold ${gs(12)}px monospace`;
            ctx.fillText(score >= hiScore ? 'NEW HIGH SCORE!' : `HIGH SCORE: ${hiScore}`, W / 2, H * 0.61);
        }

        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.fillStyle = '#64748B';
            ctx.font = `${gs(11)}px monospace`;
            ctx.fillText('PRESS SPACE TO CONTINUE', W / 2, H * 0.71);
        }
    }

    function drawTouchControls() {
        if (!('ontouchstart' in window)) return;
        ctx.globalAlpha = 0.15;

        // Left zone
        ctx.fillStyle = touchLeft ? '#FFF' : '#888';
        ctx.fillRect(0, H * 0.5, W * 0.25, H * 0.5);
        ctx.fillStyle = '#FFF';
        ctx.font = `${gs(20)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('<', W * 0.125, H * 0.78);

        // Right zone
        ctx.fillStyle = touchRight ? '#FFF' : '#888';
        ctx.fillRect(W * 0.25, H * 0.5, W * 0.25, H * 0.5);
        ctx.fillStyle = '#FFF';
        ctx.fillText('>', W * 0.375, H * 0.78);

        // Flap zone (right half)
        ctx.fillStyle = touchFlap ? '#FFF' : '#888';
        ctx.fillRect(W * 0.5, H * 0.3, W * 0.5, H * 0.7);
        ctx.fillStyle = '#FFF';
        ctx.font = `${gs(14)}px monospace`;
        ctx.fillText('FLAP', W * 0.75, H * 0.65);

        ctx.globalAlpha = 1;
    }

    // ═══════════════════════════════════════
    //  INPUT HANDLERS
    // ═══════════════════════════════════════
    function onKeyDown(e) {
        keys[e.code] = true;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            e.preventDefault();
        }
    }

    function onKeyUp(e) {
        keys[e.code] = false;
    }

    function onTouchStart(e) {
        e.preventDefault();
        handleTouches(e.touches);
    }

    function onTouchMove(e) {
        e.preventDefault();
        handleTouches(e.touches);
    }

    function onTouchEnd(e) {
        e.preventDefault();
        touchLeft = false;
        touchRight = false;
        touchFlap = false;
        handleTouches(e.touches);
    }

    function handleTouches(touches) {
        touchLeft = false; touchRight = false; touchFlap = false;
        const rect = canvas.getBoundingClientRect();
        for (let i = 0; i < touches.length; i++) {
            const tx = (touches[i].clientX - rect.left) / rect.width;
            const ty = (touches[i].clientY - rect.top) / rect.height;
            if (tx < 0.25 && ty > 0.5) touchLeft = true;
            else if (tx < 0.5 && ty > 0.5) touchRight = true;
            if (tx > 0.5) touchFlap = true;
        }
    }

    // ═══════════════════════════════════════
    //  CANVAS SIZING
    // ═══════════════════════════════════════
    function fitCanvas() {
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;
        const pw = parent.clientWidth || 480;
        const ph = parent.clientHeight || 560;
        DPR = Math.min(window.devicePixelRatio || 1, 3);

        const aspect = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > aspect) {
            ch = ph;
            cw = ch * aspect;
        } else {
            cw = pw;
            ch = cw / aspect;
        }

        canvas.style.width = `${cw}px`;
        canvas.style.height = `${ch}px`;
        canvas.width = Math.round(cw * DPR);
        canvas.height = Math.round(ch * DPR);
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
    }

    // ═══════════════════════════════════════
    //  INIT / DESTROY
    // ═══════════════════════════════════════
    function init(cvs, playerData, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOver;
        playerColor = (playerData && playerData.color) || '#06B6D4';
        playerTheme = (playerData && playerData.theme) || 'retro';
        try { hiScore = parseInt(localStorage.getItem(LS_KEY)) || 0; } catch { hiScore = 0; }

        gameActive = true;
        frameCount = 0;
        lastTime = 0;
        state = ST_LOADING;
        if (!allSpritesReady) loadSprites();
        score = 0; lives = INITIAL_LIVES; wave = 0;
        keys = {};
        particles = []; scorePopups = []; eggs = [];
        enemies = []; ptero = null;
        lavaParticles = [];
        screenShake = 0;
        lavaHand = null; lavaHandTimer = 0;
        bonusWave = false; lanceChargeTimer = 0;

        generateStalactites();
        resetPlayer();

        W = canvas.width || 480;
        H = canvas.height || 560;
        SCALE = W / GAME_W;
        DPR = Math.min(window.devicePixelRatio || 1, 3);

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
        if (audioCtx) {
            try { audioCtx.close(); } catch {}
            audioCtx = null;
        }
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        if (canvas) {
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        window.removeEventListener('resize', fitCanvas);
        keys = {};
        particles = [];
        enemies = [];
        eggs = [];
        scorePopups = [];
        lavaParticles = [];
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getWave() { return wave; },
        isActive() { return gameActive; },
    };
})();
