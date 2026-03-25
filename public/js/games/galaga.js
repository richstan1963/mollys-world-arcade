/* YWA Galaga — Canvas arcade shooter with Kenney CC0 space sprites,
   tractor beam, dual fighter, challenge stages, boss split, smart bombs,
   star power, bonus items, nebula starfield, advanced dive patterns */
window.Galaga = (() => {

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
    const GAME_W = 480, GAME_H = 640;
    const PLAYER_W = 32, PLAYER_H = 28;
    const BULLET_W = 6, BULLET_H = 20;
    const BULLET_SPEED = 8;
    const PLAYER_SPEED = 5.5;
    const FIRE_COOLDOWN = 200;
    const INITIAL_LIVES = 3;
    const BONUS_LIFE_SCORE = 30000;
    const ENEMY_BULLET_SPEED = 3.5;
    const FORMATION_TOP = 60;
    const FORMATION_COLS = 10;
    const FORMATION_ROWS = 5;
    const CELL_W = 38, CELL_H = 34;
    const CHALLENGE_INTERVAL = 3;
    const DEATH_ANIM_MS = 1800;
    const LEVEL_SPLASH_MS = 2000;
    const TRACTOR_BEAM_DUR = 3000;
    const STAR_POWER_DUR = 5000;
    const SMART_BOMB_EARN_INTERVAL = 5;

    // Enemy types
    const E_GRUNT = 0, E_COMMANDER = 1, E_BOSS = 2, E_MINIBOSS = 3;
    const ENEMY_W = [28, 30, 40, 22];
    const ENEMY_H = [24, 26, 36, 18];
    const ENEMY_SCORES = [50, 100, 150, 75];
    const DIVE_SCORES = [100, 200, 400, 150];

    // Bonus item types
    const BONUS_SCORE_MULT = 0, BONUS_SHIELD = 1, BONUS_RAPID = 2;
    const BONUS_NAMES = ['x2', 'SHIELD', 'RAPID'];
    const BONUS_COLORS = ['#FBBF24', '#22D3EE', '#F97316'];
    const BONUS_DURATION = 6000;

    // States
    const ST_LOADING = -1, ST_TITLE = 0, ST_PLAYING = 1, ST_DYING = 2, ST_LEVEL_SPLASH = 3,
          ST_GAMEOVER = 4, ST_CHALLENGE = 5, ST_CHALLENGE_RESULT = 6, ST_CAPTURED = 7;

    // Theme colors (defaults)
    let PLAYER_COLOR = '#06B6D4';
    let PLAYER_GLOW = '#22D3EE';
    let BULLET_COLOR = '#F59E0B';
    let BEAM_COLOR = '#A855F7';
    let HUD_COLOR = '#E0E7FF';
    let EXPLOSION_COLORS = ['#FBBF24', '#F97316', '#EF4444', '#FFFFFF', '#A855F7'];

    // ── Sprite Atlas ──
    const SPRITE_BASE = '/img/game-assets/kenney-space';
    const sprites = {};
    let spritesLoaded = 0, spritesTotal = 0, allSpritesReady = false;

    const SPRITE_MANIFEST = {
        // Player ships by color variant
        playerBlue:  `${SPRITE_BASE}/ships/playerShip1_blue.png`,
        playerGreen: `${SPRITE_BASE}/ships/playerShip1_green.png`,
        playerOrange:`${SPRITE_BASE}/ships/playerShip1_orange.png`,
        playerRed:   `${SPRITE_BASE}/ships/playerShip1_red.png`,
        // Enemies
        grunt1:      `${SPRITE_BASE}/enemies/enemyBlue1.png`,
        grunt2:      `${SPRITE_BASE}/enemies/enemyBlue2.png`,
        commander1:  `${SPRITE_BASE}/enemies/enemyRed1.png`,
        commander2:  `${SPRITE_BASE}/enemies/enemyRed3.png`,
        boss1:       `${SPRITE_BASE}/enemies/enemyGreen4.png`,
        boss2:       `${SPRITE_BASE}/enemies/enemyGreen5.png`,
        miniboss:    `${SPRITE_BASE}/enemies/enemyBlack2.png`,
        // Lasers
        laserBlue:   `${SPRITE_BASE}/lasers/laserBlue01.png`,
        laserRed:    `${SPRITE_BASE}/lasers/laserRed01.png`,
        laserGreen:  `${SPRITE_BASE}/lasers/laserGreen01.png`,
        // Power-ups
        puShield:    `${SPRITE_BASE}/powerups/powerupBlue_shield.png`,
        puBolt:      `${SPRITE_BASE}/powerups/powerupRed_bolt.png`,
        puStar:      `${SPRITE_BASE}/powerups/powerupGreen_star.png`,
        // Effects
        shield1:     `${SPRITE_BASE}/effects/shield1.png`,
        shield2:     `${SPRITE_BASE}/effects/shield2.png`,
        shield3:     `${SPRITE_BASE}/effects/shield3.png`,
        star1:       `${SPRITE_BASE}/effects/star1.png`,
        star2:       `${SPRITE_BASE}/effects/star2.png`,
        speed:       `${SPRITE_BASE}/effects/speed.png`,
        // Meteors (background depth)
        meteorBig1:  `${SPRITE_BASE}/meteors/meteorBrown_big1.png`,
        meteorBig2:  `${SPRITE_BASE}/meteors/meteorBrown_big2.png`,
        meteorMed1:  `${SPRITE_BASE}/meteors/meteorBrown_med1.png`,
        meteorSmall1:`${SPRITE_BASE}/meteors/meteorBrown_small1.png`,
        meteorSmall2:`${SPRITE_BASE}/meteors/meteorBrown_small2.png`,
    };

    // Explosion frames (fire00 - fire19 subset for 8-frame animation)
    const EXPLOSION_FRAME_IDS = [];
    const EXPLOSION_FRAME_COUNT = 8;
    for (let i = 0; i < 20; i += Math.floor(20 / EXPLOSION_FRAME_COUNT)) {
        const id = `fire${String(i).padStart(2, '0')}`;
        SPRITE_MANIFEST[id] = `${SPRITE_BASE}/effects/fire${String(i).padStart(2, '0')}.png`;
        EXPLOSION_FRAME_IDS.push(id);
        if (EXPLOSION_FRAME_IDS.length >= EXPLOSION_FRAME_COUNT) break;
    }

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

    // ── State variables ──
    let canvas, ctx, audioCtx;
    let W, H, SCALE, DPR;
    let animFrame, lastTime, state;
    let score, level, lives, gameActive;
    let playerX, playerBullets;
    let enemies, enemyBullets, formation;
    let particles, scorePopups, stars;
    let spriteExplosions;  // animated sprite-based explosions
    let keys = {}, lastFireTime = 0;
    let deathTimer = 0, levelSplashTimer = 0;
    let nextBonusAt;
    let gameOverCB, activePlayer, playerColor, playerShipKey;
    let highScore = parseInt(localStorage.getItem('ywa_galaga_hi') || '0');
    let touchLeft = false, touchRight = false, touchFire = false, touchBomb = false;
    let frameCount = 0;
    let screenShake = 0;
    let dualFighter = false;
    let capturedShip = null;
    let tractorBeam = null;
    let challengeKills, challengeTotal;
    let challengeResultTimer;
    let entryQueue = [];
    let formationOfsX = 0, formationDir = 1, formationTimer = 0;
    let diveTimer = 0;
    let starLayers;
    let capturePhase = 0, captureTimer = 0;

    // New state for upgrades
    let bonusItems = [];
    let activeBonuses = {};
    let bonusCollectedThisLevel = 0;
    let starPowerTimer = 0;
    let smartBombs = 0;
    let lastSmartBombLevel = 0;
    let nebulaClouds = [];
    let bgMeteors = [];
    let entryTrails = [];
    let rapidFireCooldown = 80;

    // ═══════════════════════════════════════════
    //  SOUND — Web Audio synthesis
    // ═══════════════════════════════════════════
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
    function sfxShoot() { playTone(880, 0.06, 'square', 0.1); }
    function sfxHit() { playTone(200, 0.2, 'sawtooth', 0.12); }
    function sfxEnemyHit() { playTone(300, 0.15, 'square', 0.1, 80); }
    function sfxDeath() { playTone(120, 0.6, 'sawtooth', 0.18, 40); }
    function sfxDive() { playTone(600, 0.12, 'triangle', 0.06, 300); }
    function sfxCapture() { playTone(440, 0.3, 'sine', 0.15, 220); }
    function sfxRescue() { playTone(523, 0.1, 'sine', 0.12); setTimeout(() => playTone(659, 0.1, 'sine', 0.12), 100); setTimeout(() => playTone(784, 0.15, 'sine', 0.12), 200); }
    function sfxBonus() { playTone(1047, 0.08, 'sine', 0.1); setTimeout(() => playTone(1319, 0.12, 'sine', 0.1), 80); }
    function sfxBeam() { playTone(200, 0.8, 'sine', 0.1, 100); }
    function sfxChallenge() { playTone(660, 0.15, 'square', 0.1); setTimeout(() => playTone(880, 0.15, 'square', 0.1), 150); setTimeout(() => playTone(1100, 0.2, 'square', 0.1), 300); }
    function sfxSmartBomb() { playTone(80, 0.5, 'sawtooth', 0.2, 20); setTimeout(() => playTone(150, 0.4, 'square', 0.15, 40), 200); }
    function sfxStarPower() { playTone(880, 0.15, 'sine', 0.12); setTimeout(() => playTone(1100, 0.15, 'sine', 0.12), 100); setTimeout(() => playTone(1320, 0.15, 'sine', 0.12), 200); setTimeout(() => playTone(1760, 0.3, 'sine', 0.15), 300); }
    function sfxBonusPickup() { playTone(660, 0.08, 'sine', 0.1); setTimeout(() => playTone(880, 0.1, 'sine', 0.1), 60); }
    function sfxBossSplit() { playTone(400, 0.3, 'sawtooth', 0.14, 800); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const gx = v => v * SCALE;
    const gy = v => v * SCALE;
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const lerp = (a, b, t) => a + (b - a) * t;

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

    // ── Sprite drawing helpers ──
    function drawSprite(img, cx, cy, w, h, rot, alpha) {
        if (!img) return;
        ctx.save();
        ctx.translate(gx(cx), gy(cy));
        if (rot) ctx.rotate(rot);
        if (alpha !== undefined) ctx.globalAlpha = alpha;
        ctx.drawImage(img, gs(-w / 2), gs(-h / 2), gs(w), gs(h));
        ctx.restore();
    }

    function drawSpriteWhite(img, cx, cy, w, h) {
        // Draw white-tinted version (hit flash)
        if (!img) return;
        ctx.save();
        ctx.translate(gx(cx), gy(cy));
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(img, gs(-w / 2), gs(-h / 2), gs(w), gs(h));
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(gs(-w / 2), gs(-h / 2), gs(w), gs(h));
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }

    function getEnemySprite(e) {
        if (e.type === E_GRUNT) return sprites[e.idx % 2 === 0 ? 'grunt1' : 'grunt2'];
        if (e.type === E_COMMANDER) return sprites[e.idx % 2 === 0 ? 'commander1' : 'commander2'];
        if (e.type === E_BOSS) return sprites[e.idx % 2 === 0 ? 'boss1' : 'boss2'];
        if (e.type === E_MINIBOSS) return sprites.miniboss;
        return sprites.grunt1;
    }

    function getPlayerSprite() {
        return sprites[playerShipKey] || sprites.playerBlue;
    }

    // ═══════════════════════════════════════════
    //  STAR FIELD — parallax layers with nebula clouds
    // ═══════════════════════════════════════════
    function createStars() {
        starLayers = [
            { stars: [], speed: 0.3, size: 1, alpha: 0.3 },
            { stars: [], speed: 0.7, size: 1.5, alpha: 0.5 },
            { stars: [], speed: 1.4, size: 2, alpha: 0.8 },
        ];
        starLayers.forEach(layer => {
            const count = layer === starLayers[0] ? 60 : layer === starLayers[1] ? 40 : 20;
            for (let i = 0; i < count; i++) {
                layer.stars.push({
                    x: rand(0, GAME_W), y: rand(0, GAME_H),
                    twinkle: rand(0, Math.PI * 2),
                    color: pick(['#C8D6E5', '#DFE6E9', '#A0C4FF', '#FFD6A5', '#CAFFBF'])
                });
            }
        });
        nebulaClouds = [];
        const nebulaColors = [
            'rgba(88, 28, 135, 0.08)', 'rgba(30, 58, 138, 0.06)',
            'rgba(6, 78, 59, 0.05)', 'rgba(127, 29, 29, 0.05)', 'rgba(55, 48, 163, 0.07)',
        ];
        for (let i = 0; i < 6; i++) {
            nebulaClouds.push({
                x: rand(-50, GAME_W + 50), y: rand(-50, GAME_H + 50),
                rx: rand(60, 140), ry: rand(40, 100),
                color: pick(nebulaColors), speed: rand(0.05, 0.15),
                drift: rand(-0.1, 0.1), phase: rand(0, Math.PI * 2), rot: rand(0, Math.PI * 2)
            });
        }
        // Background meteors for depth
        bgMeteors = [];
        const meteorKeys = ['meteorBig1', 'meteorBig2', 'meteorMed1', 'meteorSmall1', 'meteorSmall2'];
        for (let i = 0; i < 5; i++) {
            bgMeteors.push({
                x: rand(0, GAME_W), y: rand(0, GAME_H),
                spriteKey: meteorKeys[i % meteorKeys.length],
                size: rand(12, 28), speed: rand(0.1, 0.35),
                rot: rand(0, Math.PI * 2), rotSpeed: rand(-0.003, 0.003),
                alpha: rand(0.08, 0.18)
            });
        }
    }

    function updateStars(dt) {
        starLayers.forEach(layer => {
            layer.stars.forEach(s => {
                s.y += layer.speed * dt * 60;
                s.twinkle += dt * 2;
                if (s.y > GAME_H) { s.y = -2; s.x = rand(0, GAME_W); }
            });
        });
        nebulaClouds.forEach(n => {
            n.y += n.speed * dt * 60;
            n.x += n.drift * dt * 60;
            n.phase += dt * 0.3;
            if (n.y - n.ry > GAME_H + 20) { n.y = -n.ry - 20; n.x = rand(-50, GAME_W + 50); }
        });
        bgMeteors.forEach(m => {
            m.y += m.speed * dt * 60;
            m.rot += m.rotSpeed * dt * 60;
            if (m.y > GAME_H + 40) { m.y = -40; m.x = rand(0, GAME_W); }
        });
    }

    function drawStars() {
        // Nebula
        nebulaClouds.forEach(n => {
            ctx.save();
            ctx.translate(gx(n.x), gy(n.y));
            ctx.rotate(n.rot);
            const pulse = 1 + 0.15 * Math.sin(n.phase);
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, gs(n.rx * pulse));
            grad.addColorStop(0, n.color);
            grad.addColorStop(0.5, n.color.replace(/[\d.]+\)$/, (parseFloat(n.color.match(/[\d.]+\)$/)[0]) * 0.5) + ')'));
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(0, 0, gs(n.rx * pulse), gs(n.ry * pulse), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
        // Background meteors
        bgMeteors.forEach(m => {
            const img = sprites[m.spriteKey];
            if (img) drawSprite(img, m.x, m.y, m.size, m.size, m.rot, m.alpha);
        });
        // Stars
        starLayers.forEach(layer => {
            layer.stars.forEach(s => {
                const flicker = 0.6 + 0.4 * Math.sin(s.twinkle);
                ctx.globalAlpha = layer.alpha * flicker;
                ctx.fillStyle = s.color || '#C8D6E5';
                ctx.beginPath();
                ctx.arc(gx(s.x), gy(s.y), gs(layer.size) * 0.5, 0, Math.PI * 2);
                ctx.fill();
                if (layer === starLayers[2] && flicker > 0.85) {
                    ctx.globalAlpha = (flicker - 0.85) * 4 * layer.alpha;
                    ctx.strokeStyle = s.color || '#C8D6E5';
                    ctx.lineWidth = gs(0.5);
                    const sp = gs(layer.size * 2);
                    ctx.beginPath();
                    ctx.moveTo(gx(s.x) - sp, gy(s.y)); ctx.lineTo(gx(s.x) + sp, gy(s.y));
                    ctx.moveTo(gx(s.x), gy(s.y) - sp); ctx.lineTo(gx(s.x), gy(s.y) + sp);
                    ctx.stroke();
                }
            });
        });
        ctx.globalAlpha = 1;
    }

    // ═══════════════════════════════════════════
    //  FORMATION — grid positions & entry paths
    // ═══════════════════════════════════════════
    function formationX(col) {
        return (GAME_W - FORMATION_COLS * CELL_W) / 2 + col * CELL_W + CELL_W / 2 + formationOfsX;
    }
    function formationY(row) {
        return FORMATION_TOP + row * CELL_H + CELL_H / 2;
    }

    function spawnFormation() {
        enemies = [];
        entryQueue = [];
        let idx = 0;
        for (let r = 0; r < FORMATION_ROWS; r++) {
            for (let c = 0; c < FORMATION_COLS; c++) {
                let type = E_GRUNT;
                if (r === 0) type = E_BOSS;
                else if (r <= 1) type = E_COMMANDER;
                if (r === 0 && (c < 2 || c > 7)) continue;
                const e = {
                    type, row: r, col: c, hp: type === E_BOSS ? 2 : 1,
                    x: 0, y: 0, targetX: 0, targetY: 0,
                    alive: true, inFormation: false, diving: false,
                    divePath: null, diveT: 0,
                    entryPath: null, entryT: 0, entering: false,
                    hasCaptured: false, capturedShipVis: false,
                    hitFlash: 0, idx,
                    pulsePhase: rand(0, Math.PI * 2)
                };
                enemies.push(e);
                idx++;
            }
        }
        const waves = [];
        let waveIdx = 0;
        for (let i = 0; i < enemies.length; i += 4) {
            waves.push({ enemies: enemies.slice(i, i + 4), delay: waveIdx * 800 });
            waveIdx++;
        }
        waves.forEach(wave => {
            wave.enemies.forEach((e, gi) => {
                const delay = wave.delay + gi * 120;
                const side = Math.random() < 0.5 ? -1 : 1;
                const startX = side > 0 ? GAME_W + 40 : -40;
                const startY = -30 - gi * 15;
                const midX = GAME_W / 2 + side * rand(-60, 60);
                const midY = rand(80, 200);
                e.entryPath = [
                    { x: startX, y: startY },
                    { x: startX - side * 30, y: startY + 60 },
                    { x: midX + side * 80, y: midY - 40 },
                    { x: midX, y: midY },
                    { x: formationX(e.col), y: formationY(e.row) }
                ];
                e.entryDelay = delay;
                e.entryTimer = 0;
                e.entering = false;
                e.x = startX; e.y = startY;
                e.prevX = startX; e.prevY = startY;
                entryQueue.push(e);
            });
        });
    }

    function bezierPoint(pts, t) {
        if (pts.length === 2) return { x: lerp(pts[0].x, pts[1].x, t), y: lerp(pts[0].y, pts[1].y, t) };
        const newPts = [];
        for (let i = 0; i < pts.length - 1; i++) {
            newPts.push({ x: lerp(pts[i].x, pts[i + 1].x, t), y: lerp(pts[i].y, pts[i + 1].y, t) });
        }
        return bezierPoint(newPts, t);
    }

    // ═══════════════════════════════════════════
    //  DIVE BOMB PATTERNS
    // ═══════════════════════════════════════════
    function startDive(e) {
        if (!e.alive || e.diving || !e.inFormation) return;
        e.diving = true;
        e.diveT = 0;
        sfxDive();
        const px = playerX;
        const startX = e.x, startY = e.y;
        const pattern = Math.random();
        if (pattern < 0.25) {
            const loopDir = Math.random() < 0.5 ? -1 : 1;
            const loopR = rand(40, 70);
            e.divePath = [
                { x: startX, y: startY },
                { x: startX + loopDir * loopR, y: startY + 50 },
                { x: startX + loopDir * loopR * 1.8, y: startY - 10 },
                { x: startX + loopDir * loopR * 0.5, y: startY - 30 },
                { x: startX, y: startY + 30 },
                { x: startX + loopDir * 40, y: startY + 120 },
                { x: px + rand(-40, 40), y: GAME_H - 60 },
                { x: rand(40, GAME_W - 40), y: GAME_H + 40 }
            ];
        } else if (pattern < 0.45) {
            const dir = Math.random() < 0.5 ? -1 : 1;
            const w = rand(50, 80);
            e.divePath = [
                { x: startX, y: startY },
                { x: startX + dir * w, y: startY + 40 },
                { x: startX + dir * w * 1.5, y: startY + 100 },
                { x: startX, y: startY + 140 },
                { x: startX - dir * w, y: startY + 180 },
                { x: startX - dir * w * 1.5, y: startY + 240 },
                { x: startX, y: startY + 280 },
                { x: px + rand(-30, 30), y: GAME_H - 50 },
                { x: rand(40, GAME_W - 40), y: GAME_H + 40 }
            ];
        } else if (pattern < 0.6) {
            const dir = Math.random() < 0.5 ? -1 : 1;
            const amp = rand(30, 50);
            const steps = 6;
            const pts = [{ x: startX, y: startY }];
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const angle = t * Math.PI * 4;
                pts.push({ x: startX + Math.sin(angle) * amp * dir, y: startY + t * (GAME_H * 0.8) });
            }
            pts.push({ x: rand(40, GAME_W - 40), y: GAME_H + 40 });
            e.divePath = pts;
        } else {
            e.divePath = [
                { x: startX, y: startY },
                { x: startX + rand(-80, 80), y: startY + 120 },
                { x: px + rand(-30, 30), y: GAME_H - 80 },
                { x: rand(40, GAME_W - 40), y: GAME_H + 40 }
            ];
        }
        e.diveSpeed = 0.005 + level * 0.0006;
    }

    function startGroupDive() {
        const formationEnemies = enemies.filter(e => e.alive && e.inFormation && !e.diving);
        if (formationEnemies.length < 2) return;
        const leader = pick(formationEnemies);
        const group = [leader];
        formationEnemies.forEach(e => {
            if (e === leader) return;
            if (group.length >= 3) return;
            if (Math.abs(e.col - leader.col) <= 2 && Math.abs(e.row - leader.row) <= 1) group.push(e);
        });
        if (group.length < 2) { startDive(leader); return; }
        const px = playerX;
        const dir = Math.random() < 0.5 ? -1 : 1;
        group.forEach((e, i) => {
            e.diving = true;
            e.diveT = -i * 0.05;
            const offset = (i - (group.length - 1) / 2) * 25;
            e.divePath = [
                { x: e.x, y: e.y },
                { x: e.x + dir * 60, y: e.y + 80 },
                { x: px + offset + dir * 40, y: GAME_H * 0.5 },
                { x: px + offset, y: GAME_H - 60 },
                { x: rand(40, GAME_W - 40), y: GAME_H + 40 }
            ];
            e.diveSpeed = 0.006 + level * 0.0006;
        });
        sfxDive();
    }

    function startTractorBeam(bossIdx) {
        const boss = enemies[bossIdx];
        if (!boss || !boss.alive || !boss.inFormation || boss.hasCaptured) return;
        boss.diving = true;
        boss.diveT = 0;
        boss.divePath = [
            { x: boss.x, y: boss.y },
            { x: playerX, y: GAME_H * 0.45 }
        ];
        boss.diveSpeed = 0.02;
        boss.tractorIntent = true;
    }

    // ═══════════════════════════════════════════
    //  BONUS ITEMS — power-up sprite pickups
    // ═══════════════════════════════════════════
    function spawnBonusItem(x, y) {
        if (Math.random() > 0.25) return;
        const type = pick([BONUS_SCORE_MULT, BONUS_SHIELD, BONUS_RAPID]);
        bonusItems.push({ x, y, type, vy: 1.2, life: 1, phase: rand(0, Math.PI * 2) });
    }

    function updateBonusItems(dt) {
        for (let i = bonusItems.length - 1; i >= 0; i--) {
            const b = bonusItems[i];
            b.y += b.vy * dt * 60;
            b.phase += dt * 4;
            b.x += Math.sin(b.phase) * 0.5;
            if (b.y > GAME_H + 20) { bonusItems.splice(i, 1); continue; }
            const pw = dualFighter ? PLAYER_W + 18 : PLAYER_W;
            if (Math.abs(b.x - playerX) < (pw + 20) / 2 && Math.abs(b.y - (GAME_H - 50)) < 22) {
                bonusItems.splice(i, 1);
                activateBonus(b.type);
                sfxBonusPickup();
                spawnScorePopup(b.x, b.y, BONUS_NAMES[b.type], BONUS_COLORS[b.type]);
                bonusCollectedThisLevel++;
                if (bonusCollectedThisLevel >= 3 && starPowerTimer <= 0) {
                    starPowerTimer = STAR_POWER_DUR;
                    sfxStarPower();
                    spawnScorePopup(playerX, GAME_H - 80, 'STAR POWER!', '#FFD700');
                    spawnSpriteExplosion(playerX, GAME_H - 50, 1.8);
                    screenShake = 6;
                }
            }
        }
        for (const key in activeBonuses) {
            activeBonuses[key] -= dt * 1000;
            if (activeBonuses[key] <= 0) delete activeBonuses[key];
        }
        if (starPowerTimer > 0) {
            starPowerTimer -= dt * 1000;
            if (starPowerTimer <= 0) starPowerTimer = 0;
        }
    }

    function activateBonus(type) {
        activeBonuses[type] = BONUS_DURATION;
        if (type === BONUS_SCORE_MULT) addScore(500, playerX, GAME_H - 70);
    }
    function hasBonus(type) { return activeBonuses[type] > 0; }

    function drawBonusItems() {
        const puMap = [sprites.puStar, sprites.puShield, sprites.puBolt];
        bonusItems.forEach(b => {
            const bob = Math.sin(b.phase) * 3;
            const img = puMap[b.type];
            if (img) {
                ctx.save();
                // Glow behind
                ctx.shadowColor = BONUS_COLORS[b.type];
                ctx.shadowBlur = gs(10);
                drawSprite(img, b.x, b.y + bob, 22, 22);
                ctx.shadowBlur = 0;
                ctx.restore();
            } else {
                // Fallback circle
                ctx.save();
                ctx.fillStyle = BONUS_COLORS[b.type];
                ctx.beginPath();
                ctx.arc(gx(b.x), gy(b.y + bob), gs(8), 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#111';
                ctx.font = `bold ${gs(8)}px monospace`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(BONUS_NAMES[b.type][0], gx(b.x), gy(b.y + bob));
                ctx.restore();
            }
        });
    }

    // ═══════════════════════════════════════════
    //  SMART BOMB
    // ═══════════════════════════════════════════
    function useSmartBomb() {
        if (smartBombs <= 0) return;
        smartBombs--;
        sfxSmartBomb();
        screenShake = 15;
        particles.push({
            x: GAME_W / 2, y: GAME_H / 2, vx: 0, vy: 0,
            life: 1, decay: 0.03, size: GAME_W, color: '#FFFFFF', type: 'flash'
        });
        let killCount = 0;
        enemies.forEach(e => {
            if (!e.alive) return;
            e.alive = false;
            killCount++;
            spawnSpriteExplosion(e.x, e.y, e.type === E_BOSS ? 2.0 : 1.2);
            const pts = e.diving ? DIVE_SCORES[e.type] : ENEMY_SCORES[e.type];
            score += pts;
            if (state === ST_CHALLENGE) challengeKills++;
        });
        if (killCount > 0) spawnScorePopup(GAME_W / 2, GAME_H / 2, `BOMB x${killCount}`, '#FF4444');
        enemyBullets = [];
    }

    // ═══════════════════════════════════════════
    //  SPRITE EXPLOSIONS — animated fire frames
    // ═══════════════════════════════════════════
    function spawnSpriteExplosion(x, y, scale) {
        spriteExplosions.push({
            x, y, scale: scale || 1.0,
            frame: 0, frameTimer: 0,
            frameDuration: 45, // ms per frame
            totalFrames: EXPLOSION_FRAME_IDS.length
        });
    }

    function updateSpriteExplosions(dt) {
        for (let i = spriteExplosions.length - 1; i >= 0; i--) {
            const ex = spriteExplosions[i];
            ex.frameTimer += dt * 1000;
            if (ex.frameTimer >= ex.frameDuration) {
                ex.frameTimer -= ex.frameDuration;
                ex.frame++;
                if (ex.frame >= ex.totalFrames) {
                    spriteExplosions.splice(i, 1);
                }
            }
        }
    }

    function drawSpriteExplosions() {
        spriteExplosions.forEach(ex => {
            const id = EXPLOSION_FRAME_IDS[ex.frame];
            const img = sprites[id];
            if (!img) return;
            const sz = 40 * ex.scale;
            const progress = ex.frame / ex.totalFrames;
            const alpha = 1 - progress * 0.3;
            drawSprite(img, ex.x, ex.y, sz, sz, 0, alpha);
        });
    }

    // ═══════════════════════════════════════════
    //  PLAYER DRAWING — Kenney ship sprite
    // ═══════════════════════════════════════════
    function drawShip(cx, cy, _color, _glow) {
        const img = getPlayerSprite();
        ctx.save();

        // Star power aura
        if (starPowerTimer > 0) {
            const spPulse = 0.5 + 0.5 * Math.sin(frameCount * 0.3);
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = gs(12 + spPulse * 8);
            ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
            ctx.beginPath();
            ctx.arc(gx(cx), gy(cy), gs(22 + spPulse * 5), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Shield ring
        if (hasBonus(BONUS_SHIELD) || starPowerTimer > 0) {
            const sImg = sprites.shield1;
            if (sImg) {
                const sAlpha = 0.35 + 0.2 * Math.sin(frameCount * 0.15);
                drawSprite(sImg, cx, cy, 44, 44, 0, sAlpha);
            } else {
                ctx.strokeStyle = starPowerTimer > 0 ? '#FFD700' : '#22D3EE';
                ctx.lineWidth = gs(1.5);
                ctx.globalAlpha = 0.4 + 0.3 * Math.sin(frameCount * 0.15);
                ctx.beginPath();
                ctx.arc(gx(cx), gy(cy), gs(20), 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }

        // Thruster glow behind ship
        const thrusterPulse = 0.5 + 0.5 * Math.sin(frameCount * 0.4);
        ctx.fillStyle = hasBonus(BONUS_RAPID) ? '#F97316' : PLAYER_GLOW;
        ctx.globalAlpha = 0.25 + thrusterPulse * 0.2;
        ctx.beginPath();
        const flameH = hasBonus(BONUS_RAPID) ? 18 : 12;
        ctx.moveTo(gx(cx - 5), gy(cy + 12));
        ctx.lineTo(gx(cx), gy(cy + 12 + flameH + thrusterPulse * 4));
        ctx.lineTo(gx(cx + 5), gy(cy + 12));
        ctx.fill();
        ctx.globalAlpha = 1;

        // Speed effect sprite behind ship during rapid fire
        if (hasBonus(BONUS_RAPID) && sprites.speed) {
            drawSprite(sprites.speed, cx, cy + 22, 14, 24, 0, 0.3 + thrusterPulse * 0.2);
        }

        // Ship sprite
        if (img) {
            const tint = starPowerTimer > 0 ? 0.6 : 0;
            ctx.save();
            ctx.translate(gx(cx), gy(cy));
            ctx.drawImage(img, gs(-PLAYER_W / 2), gs(-PLAYER_H / 2), gs(PLAYER_W), gs(PLAYER_H));
            // Golden overlay for star power
            if (tint > 0) {
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fillStyle = `rgba(255, 215, 0, ${tint * (0.3 + 0.15 * Math.sin(frameCount * 0.2))})`;
                ctx.fillRect(gs(-PLAYER_W / 2), gs(-PLAYER_H / 2), gs(PLAYER_W), gs(PLAYER_H));
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.restore();
        }

        ctx.restore();
    }

    // ═══════════════════════════════════════════
    //  ENEMY DRAWING — Kenney enemy sprites with animation
    // ═══════════════════════════════════════════
    function drawEnemy(e) {
        if (!e.alive) return;
        const img = getEnemySprite(e);
        const ew = ENEMY_W[e.type], eh = ENEMY_H[e.type];

        // Scale pulsing animation (replaces wing-flap)
        const pulseSpeed = e.diving ? 0.18 : 0.08;
        const pulse = 1 + 0.05 * Math.sin(frameCount * pulseSpeed + (e.pulsePhase || 0));

        // Rotation wobble during dives
        let rot = 0;
        if (e.diving && e.diveT > 0 && e.diveT < 1 && e.divePath) {
            // Compute heading from dive path tangent
            const t1 = Math.max(0, e.diveT - 0.02);
            const t2 = Math.min(1, e.diveT + 0.02);
            const p1 = bezierPoint(e.divePath, t1);
            const p2 = bezierPoint(e.divePath, t2);
            rot = Math.atan2(p2.y - p1.y, p2.x - p1.x) - Math.PI / 2;
            // Clamp rotation to prevent full flip
            rot = clamp(rot, -0.8, 0.8);
        } else if (!e.inFormation && e.entering) {
            // Subtle entry wobble
            rot = Math.sin(frameCount * 0.15 + (e.pulsePhase || 0)) * 0.15;
        }

        const sw = ew * pulse;
        const sh = eh * pulse;
        const bossScale = e.type === E_BOSS ? 1.4 : 1;

        if (e.hitFlash > 0) {
            e.hitFlash -= 1;
            // Draw white-tinted
            if (img) {
                ctx.save();
                ctx.translate(gx(e.x), gy(e.y));
                if (rot) ctx.rotate(rot);
                // Draw original then overlay white
                ctx.drawImage(img, gs(-sw * bossScale / 2), gs(-sh * bossScale / 2), gs(sw * bossScale), gs(sh * bossScale));
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(gs(-sw * bossScale / 2), gs(-sh * bossScale / 2), gs(sw * bossScale), gs(sh * bossScale));
                ctx.globalCompositeOperation = 'source-over';
                ctx.restore();
            }
            return;
        }

        // Boss: aura glow
        if (e.type === E_BOSS) {
            const bPulse = 0.85 + 0.15 * Math.sin(frameCount * 0.06);
            ctx.save();
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = '#4ADE80';
            ctx.beginPath();
            ctx.arc(gx(e.x), gy(e.y), gs(24 * bPulse), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        // Mini-boss speed trail
        if (e.type === E_MINIBOSS && e.diving) {
            ctx.globalAlpha = 0.15;
            const mbImg = sprites.miniboss;
            if (mbImg) {
                for (let t = 1; t <= 3; t++) {
                    drawSprite(mbImg, e.x, e.y + t * 8, sw * 0.8, sh * 0.8, rot, 0.15 / t);
                }
            }
            ctx.globalAlpha = 1;
        }

        // Draw enemy sprite
        if (img) {
            drawSprite(img, e.x, e.y, sw * bossScale, sh * bossScale, rot);
        }

        // Captured ship indicator on boss
        if (e.type === E_BOSS && e.hasCaptured) {
            const pImg = getPlayerSprite();
            if (pImg) {
                drawSprite(pImg, e.x, e.y + eh * bossScale * 0.6, 16, 14, Math.PI, 0.6);
            }
        }
    }

    // ═══════════════════════════════════════════
    //  TRACTOR BEAM — dramatic capture effect
    // ═══════════════════════════════════════════
    function drawTractorBeam() {
        if (!tractorBeam) return;
        const boss = enemies[tractorBeam.bossIdx];
        if (!boss) return;
        const progress = Math.min(tractorBeam.timer / TRACTOR_BEAM_DUR, 1);
        const beamH = progress * (GAME_H - boss.y - 40);
        const beamW = 40 + 20 * Math.sin(frameCount * 0.1);

        if (progress > 0.3) {
            ctx.save();
            ctx.fillStyle = `rgba(0, 0, 0, ${Math.min((progress - 0.3) * 0.4, 0.25)})`;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        ctx.save();
        for (let layer = 0; layer < 3; layer++) {
            const layerW = beamW * (1 + layer * 0.3);
            const grd = ctx.createLinearGradient(gx(boss.x), gy(boss.y + 14), gx(boss.x), gy(boss.y + 14 + beamH));
            grd.addColorStop(0, BEAM_COLOR);
            grd.addColorStop(1, 'rgba(168,85,247,0)');
            ctx.fillStyle = grd;
            ctx.globalAlpha = (0.3 - layer * 0.08) + 0.15 * Math.sin(frameCount * 0.15 + layer);
            ctx.beginPath();
            ctx.moveTo(gx(boss.x - 8 - layer * 4), gy(boss.y + 14));
            ctx.lineTo(gx(boss.x - layerW / 2), gy(boss.y + 14 + beamH));
            ctx.lineTo(gx(boss.x + layerW / 2), gy(boss.y + 14 + beamH));
            ctx.lineTo(gx(boss.x + 8 + layer * 4), gy(boss.y + 14));
            ctx.closePath();
            ctx.fill();
        }
        // Beam rings
        ctx.strokeStyle = BEAM_COLOR;
        ctx.lineWidth = gs(1.5);
        for (let i = 0; i < 8; i++) {
            const ry = boss.y + 14 + beamH * (i / 8) + (frameCount * 2 % (beamH / 5));
            if (ry > boss.y + 14 + beamH) continue;
            const rw = 8 + (beamW - 16) * ((ry - boss.y) / beamH);
            ctx.globalAlpha = 0.15 + 0.2 * Math.sin(frameCount * 0.2 + i * 0.8);
            ctx.beginPath();
            ctx.ellipse(gx(boss.x), gy(ry), gs(rw / 2), gs(3), 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        // Sparkles
        for (let i = 0; i < 4; i++) {
            const sparkY = boss.y + 20 + Math.random() * beamH * 0.8;
            const sparkX = boss.x + rand(-beamW * 0.3, beamW * 0.3);
            ctx.fillStyle = '#E9D5FF';
            ctx.globalAlpha = rand(0.3, 0.7);
            ctx.beginPath();
            ctx.arc(gx(sparkX), gy(sparkY), gs(rand(0.5, 1.5)), 0, Math.PI * 2);
            ctx.fill();
        }
        // Zoom lines at base
        if (progress > 0.5) {
            ctx.strokeStyle = '#C084FC';
            ctx.lineWidth = gs(0.8);
            ctx.globalAlpha = (progress - 0.5) * 0.6;
            for (let i = 0; i < 6; i++) {
                const ang = (frameCount * 0.03 + i * Math.PI / 3) % (Math.PI * 2);
                const r1 = 20 + beamW * 0.3, r2 = 30 + beamW * 0.5;
                const baseY = boss.y + 14 + beamH;
                ctx.beginPath();
                ctx.moveTo(gx(boss.x + Math.cos(ang) * r1), gy(baseY + Math.sin(ang) * 8));
                ctx.lineTo(gx(boss.x + Math.cos(ang) * r2), gy(baseY + Math.sin(ang) * 12));
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // ═══════════════════════════════════════════
    //  PARTICLES & EFFECTS
    // ═══════════════════════════════════════════
    function spawnExplosion(x, y, count, colors, sizeBase) {
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = rand(0.5, 3);
            particles.push({
                x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                life: 1, decay: rand(0.015, 0.04),
                size: rand(sizeBase * 0.5, sizeBase * 1.5),
                color: pick(colors), type: 'circle'
            });
        }
    }

    function spawnEntryTrail(x, y, e) {
        // Fire sprite trail for entering enemies
        const fireIdx = Math.floor(rand(0, 4));
        const id = EXPLOSION_FRAME_IDS[fireIdx];
        entryTrails.push({
            x, y, spriteId: id,
            life: 1, decay: rand(0.05, 0.1),
            size: rand(10, 16), rot: rand(0, Math.PI * 2)
        });
    }

    function spawnScorePopup(x, y, text, color) {
        scorePopups.push({ x, y, text: String(text), color: color || '#FBBF24', life: 1, vy: -1.5 });
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt * 60;
            p.y += p.vy * dt * 60;
            p.life -= p.decay * dt * 60;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = entryTrails.length - 1; i >= 0; i--) {
            const t = entryTrails[i];
            t.life -= t.decay * dt * 60;
            if (t.life <= 0) entryTrails.splice(i, 1);
        }
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const sp = scorePopups[i];
            sp.y += sp.vy * dt * 60;
            sp.life -= 0.02 * dt * 60;
            if (sp.life <= 0) scorePopups.splice(i, 1);
        }
        updateSpriteExplosions(dt);
    }

    function drawParticles() {
        // Entry trails using fire sprites
        entryTrails.forEach(t => {
            const img = sprites[t.spriteId];
            if (img) {
                drawSprite(img, t.x, t.y, t.size * t.life, t.size * t.life, t.rot, t.life * 0.7);
            } else {
                ctx.globalAlpha = t.life * 0.6;
                ctx.fillStyle = '#F97316';
                ctx.beginPath();
                ctx.arc(gx(t.x), gy(t.y), gs(t.size * t.life * 0.3), 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // Flash effect (smart bomb) + richer particle explosions
        particles.forEach(p => {
            if (p.type === 'flash') {
                ctx.globalAlpha = p.life * 0.6;
                ctx.fillStyle = p.color;
                ctx.fillRect(0, 0, W, H);
                return;
            }
            const sz = p.size * p.life;
            // Outer glow ring for larger particles
            if (sz > 2) {
                ctx.globalAlpha = p.life * 0.3;
                const rg = ctx.createRadialGradient(gx(p.x), gy(p.y), 0, gx(p.x), gy(p.y), gs(sz * 2.5));
                rg.addColorStop(0, p.color);
                rg.addColorStop(1, 'transparent');
                ctx.fillStyle = rg;
                ctx.fillRect(gx(p.x) - gs(sz * 2.5), gy(p.y) - gs(sz * 2.5), gs(sz * 5), gs(sz * 5));
            }
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = gs(6);
            ctx.beginPath();
            ctx.arc(gx(p.x), gy(p.y), gs(sz), 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Sprite-based explosions
        drawSpriteExplosions();

        // Score popups — scale up then fade
        scorePopups.forEach(sp => {
            const age = 1 - sp.life;
            const sc = age < 0.15 ? 0.8 + age * 4 : 1.4 - age * 0.5;
            ctx.globalAlpha = sp.life;
            ctx.save();
            ctx.translate(gx(sp.x), gy(sp.y));
            ctx.scale(sc, sc);
            ctx.fillStyle = '#000';
            ctx.font = `bold ${gs(13)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(sp.text, gs(1), gs(1));
            ctx.fillStyle = sp.color;
            ctx.fillText(sp.text, 0, 0);
            ctx.restore();
        });
        ctx.globalAlpha = 1;
    }

    // ═══════════════════════════════════════════
    //  BULLETS — laser sprites
    // ═══════════════════════════════════════════
    function drawBullet(bx, by, isPlayer) {
        if (isPlayer) {
            const img = sprites.laserBlue;
            if (img) {
                drawSprite(img, bx, by, BULLET_W, BULLET_H);
                // Glow trail
                ctx.globalAlpha = 0.25;
                drawSprite(img, bx, by + BULLET_H * 0.6, BULLET_W * 0.8, BULLET_H * 0.5);
                ctx.globalAlpha = 1;
            } else {
                ctx.save();
                ctx.shadowColor = BULLET_COLOR;
                ctx.shadowBlur = gs(8);
                ctx.fillStyle = BULLET_COLOR;
                ctx.fillRect(gx(bx - BULLET_W / 2), gy(by - BULLET_H / 2), gs(BULLET_W), gs(BULLET_H));
                ctx.shadowBlur = 0;
                ctx.restore();
            }
            // Gradient trail behind player bullet
            const tg = ctx.createLinearGradient(gx(bx), gy(by + BULLET_H), gx(bx), gy(by + BULLET_H + 18));
            tg.addColorStop(0, 'rgba(56,189,248,0.3)');
            tg.addColorStop(0.5, 'rgba(56,189,248,0.1)');
            tg.addColorStop(1, 'rgba(56,189,248,0)');
            ctx.fillStyle = tg;
            ctx.fillRect(gx(bx - BULLET_W / 2), gy(by + BULLET_H / 2), gs(BULLET_W), gs(18));
        } else {
            const img = sprites.laserRed;
            if (img) {
                drawSprite(img, bx, by, 5, 14);
            } else {
                ctx.fillStyle = '#EF4444';
                ctx.shadowColor = '#EF4444';
                ctx.shadowBlur = gs(4);
                ctx.beginPath();
                ctx.arc(gx(bx), gy(by), gs(2.5), 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            // Enemy bullet trail
            const etg = ctx.createLinearGradient(gx(bx), gy(by - 10), gx(bx), gy(by));
            etg.addColorStop(0, 'rgba(239,68,68,0)');
            etg.addColorStop(1, 'rgba(239,68,68,0.15)');
            ctx.fillStyle = etg;
            ctx.fillRect(gx(bx - 2), gy(by - 10), gs(4), gs(10));
        }
    }

    // ═══════════════════════════════════════════
    //  GAME LOGIC
    // ═══════════════════════════════════════════
    function resetLevel() {
        playerBullets = [];
        enemyBullets = [];
        particles = [];
        scorePopups = [];
        bonusItems = [];
        entryTrails = [];
        formationOfsX = 0;
        formationDir = 1;
        formationTimer = 0;
        diveTimer = 0;
        tractorBeam = null;
        entryQueue = [];
        bonusCollectedThisLevel = 0;

        if (level > 0 && level % SMART_BOMB_EARN_INTERVAL === 0 && level !== lastSmartBombLevel) {
            smartBombs++;
            lastSmartBombLevel = level;
            spawnScorePopup(GAME_W / 2, GAME_H / 2 + 40, '+1 BOMB!', '#EF4444');
        }

        const isChallenge = level % CHALLENGE_INTERVAL === 0 && level > 0;
        if (isChallenge) {
            state = ST_CHALLENGE;
            challengeKills = 0;
            challengeTotal = 0;
            spawnChallengeWave();
            sfxChallenge();
        } else {
            state = ST_LEVEL_SPLASH;
            levelSplashTimer = LEVEL_SPLASH_MS;
            spawnFormation();
        }
    }

    function spawnChallengeWave() {
        enemies = [];
        entryQueue = [];
        const count = 20 + level * 2;
        challengeTotal = count;
        const patternType = level % 4;
        for (let i = 0; i < count; i++) {
            const e = {
                type: pick([E_GRUNT, E_COMMANDER]), row: 0, col: 0, hp: 1,
                x: 0, y: -30,
                alive: true, inFormation: false, diving: false,
                divePath: null, diveT: 0,
                entryPath: null, entryT: 0, entering: true,
                hasCaptured: false, hitFlash: 0, idx: i,
                pulsePhase: rand(0, Math.PI * 2)
            };
            const t = i / count;
            if (patternType === 0) {
                const angle = t * Math.PI * 6;
                const radius = 200 - t * 140;
                const cx = GAME_W / 2, cy = GAME_H * 0.4;
                e.x = -30; e.y = -30;
                e.entryPath = [
                    { x: -30, y: GAME_H * 0.3 },
                    { x: cx + Math.cos(angle) * radius * 1.2, y: cy + Math.sin(angle) * radius * 0.6 - 50 },
                    { x: cx + Math.cos(angle + 1) * radius, y: cy + Math.sin(angle + 1) * radius * 0.5 },
                    { x: cx + Math.cos(angle + 2) * radius * 0.6, y: cy + Math.sin(angle + 2) * radius * 0.3 },
                    { x: GAME_W + 30, y: rand(100, 400) }
                ];
            } else if (patternType === 1) {
                const angle = t * Math.PI * 4;
                const cx = GAME_W / 2, cy = GAME_H * 0.35;
                const rx = 160, ry = 100;
                const side = i % 2 === 0 ? 1 : -1;
                e.x = side > 0 ? GAME_W + 30 : -30; e.y = -30;
                e.entryPath = [
                    { x: e.x, y: cy - 80 },
                    { x: cx + Math.sin(angle) * rx, y: cy + Math.sin(angle * 2) * ry * 0.5 },
                    { x: cx + Math.sin(angle + 1.5) * rx * 0.8, y: cy + Math.sin((angle + 1.5) * 2) * ry * 0.4 },
                    { x: cx + Math.sin(angle + 3) * rx * 0.5, y: cy + Math.sin((angle + 3) * 2) * ry * 0.3 },
                    { x: -side * 30, y: rand(200, 500) }
                ];
            } else if (patternType === 2) {
                const side = i % 2 === 0 ? -1 : 1;
                const startX = side > 0 ? GAME_W + 30 : -30;
                const yBase = 60 + (i % 5) * 80;
                const amplitude = rand(80, 140);
                const freq = rand(1.5, 3);
                e.x = startX; e.y = -30;
                const pts = [{ x: startX, y: yBase }];
                for (let s = 1; s <= 5; s++) {
                    const progress = s / 5;
                    pts.push({ x: startX + ((-side * (GAME_W + 60)) * progress), y: yBase + Math.sin(progress * Math.PI * freq) * amplitude });
                }
                e.entryPath = pts;
            } else {
                const groupIdx = Math.floor(i / 5);
                const posInGroup = i % 5;
                const side = groupIdx % 2 === 0 ? -1 : 1;
                const startX = side > 0 ? GAME_W + 50 : -50;
                const exitX = -side * 50;
                const cy = 100 + (groupIdx % 3) * 120;
                const offsets = [{ dx: 0, dy: 0 }, { dx: -20, dy: -15 }, { dx: 20, dy: -15 }, { dx: -20, dy: 15 }, { dx: 20, dy: 15 }];
                const off = offsets[posInGroup] || offsets[0];
                e.x = startX; e.y = -30;
                e.entryPath = [
                    { x: startX, y: cy },
                    { x: GAME_W * 0.5 + off.dx * 2 + side * 60, y: cy + off.dy - 40 },
                    { x: GAME_W * 0.5 + off.dx, y: cy + off.dy },
                    { x: GAME_W * 0.5 + off.dx * 2 - side * 60, y: cy + off.dy + 40 },
                    { x: exitX, y: cy + rand(-30, 30) }
                ];
            }
            e.entryDelay = i * 180;
            e.entryTimer = 0;
            e.challengeEnemy = true;
            enemies.push(e);
        }
    }

    function addScore(pts, x, y) {
        const multiplier = hasBonus(BONUS_SCORE_MULT) ? 2 : 1;
        score += pts * multiplier;
        if (x !== undefined) spawnScorePopup(x, y, pts * multiplier);
        if (score >= nextBonusAt) {
            lives++;
            nextBonusAt += BONUS_LIFE_SCORE;
            sfxBonus();
            spawnScorePopup(GAME_W / 2, GAME_H / 2, '1UP!', '#22C55E');
        }
    }

    function killEnemy(e, idx) {
        e.alive = false;
        const pts = e.diving ? DIVE_SCORES[e.type] : ENEMY_SCORES[e.type];
        addScore(pts, e.x, e.y);

        // Sprite explosion + small particle burst
        spawnSpriteExplosion(e.x, e.y, e.type === E_BOSS ? 2.2 : e.type === E_MINIBOSS ? 1.0 : 1.3);
        const colors = e.type === E_BOSS ? ['#22C55E', '#4ADE80', '#FFFFFF', '#FBBF24']
            : e.type === E_COMMANDER ? ['#EF4444', '#FBBF24', '#FFFFFF']
            : e.type === E_MINIBOSS ? ['#F472B6', '#EC4899', '#FFFFFF', '#FDE68A']
            : ['#3B82F6', '#60A5FA', '#FFFFFF'];
        spawnExplosion(e.x, e.y, 8, colors, 1.5);
        sfxEnemyHit();
        screenShake = 4;

        // Boss split
        if (e.type === E_BOSS && !e.hasCaptured) {
            sfxBossSplit();
            for (let side = -1; side <= 1; side += 2) {
                const mini = {
                    type: E_MINIBOSS, row: 0, col: 0, hp: 1,
                    x: e.x + side * 15, y: e.y,
                    alive: true, inFormation: false, diving: true,
                    divePath: [
                        { x: e.x + side * 15, y: e.y },
                        { x: e.x + side * 60, y: e.y + 40 },
                        { x: playerX + side * rand(10, 50), y: GAME_H - 60 },
                        { x: rand(40, GAME_W - 40), y: GAME_H + 40 }
                    ],
                    diveT: 0, diveSpeed: 0.006 + level * 0.0007,
                    entryPath: null, entryT: 0, entering: false,
                    hasCaptured: false, hitFlash: 0,
                    idx: enemies.length, pulsePhase: rand(0, Math.PI * 2)
                };
                enemies.push(mini);
            }
            spawnScorePopup(e.x, e.y - 20, 'SPLIT!', '#F472B6');
        }

        if (e.type === E_BOSS && e.hasCaptured && !dualFighter) {
            dualFighter = true;
            capturedShip = null;
            sfxRescue();
            spawnScorePopup(e.x, e.y - 20, 'DUAL FIGHTER!', '#22D3EE');
        }

        if (e.diving && e.type !== E_MINIBOSS) spawnBonusItem(e.x, e.y);
        if (state === ST_CHALLENGE) challengeKills++;
    }

    function playerHit() {
        if (starPowerTimer > 0) {
            spawnSpriteExplosion(playerX, GAME_H - 50, 0.8);
            screenShake = 3;
            return;
        }
        if (hasBonus(BONUS_SHIELD)) {
            delete activeBonuses[BONUS_SHIELD];
            spawnSpriteExplosion(playerX, GAME_H - 50, 0.9);
            spawnScorePopup(playerX, GAME_H - 70, 'SHIELD!', '#22D3EE');
            sfxHit();
            screenShake = 4;
            return;
        }
        if (dualFighter) {
            dualFighter = false;
            spawnSpriteExplosion(playerX + 18, GAME_H - 50, 1.0);
            sfxHit();
            screenShake = 6;
            return;
        }
        lives--;
        state = ST_DYING;
        deathTimer = DEATH_ANIM_MS;
        spawnSpriteExplosion(playerX, GAME_H - 50, 1.8);
        spawnExplosion(playerX, GAME_H - 50, 15, EXPLOSION_COLORS, 3);
        sfxDeath();
        screenShake = 10;
    }

    function capturePlayer() {
        if (starPowerTimer > 0) {
            spawnSpriteExplosion(playerX, GAME_H - 50, 0.8);
            if (tractorBeam) {
                const boss = enemies[tractorBeam.bossIdx];
                if (boss) { boss.diving = false; boss.inFormation = true; }
                tractorBeam = null;
            }
            return;
        }
        state = ST_CAPTURED;
        capturePhase = 0;
        captureTimer = 0;
        sfxCapture();
    }

    // ═══════════════════════════════════════════
    //  UPDATE
    // ═══════════════════════════════════════════
    function update(dt) {
        frameCount++;
        if (screenShake > 0) screenShake *= 0.9;
        if (screenShake < 0.3) screenShake = 0;
        updateStars(dt);
        updateParticles(dt);

        if (state === ST_TITLE) {
            if (keys['Space'] || keys['Enter'] || touchFire) {
                state = ST_LEVEL_SPLASH;
                levelSplashTimer = LEVEL_SPLASH_MS;
                score = 0; lives = INITIAL_LIVES; level = 1;
                nextBonusAt = BONUS_LIFE_SCORE;
                dualFighter = false; capturedShip = null;
                smartBombs = 1; lastSmartBombLevel = 0;
                bonusCollectedThisLevel = 0; starPowerTimer = 0;
                activeBonuses = {};
                playerX = GAME_W / 2;
                spriteExplosions = [];
                spawnFormation();
            }
            return;
        }
        if (state === ST_GAMEOVER) {
            if (keys['Space'] || keys['Enter'] || touchFire) {
                if (gameOverCB) gameOverCB({ score, level });
            }
            return;
        }
        if (state === ST_LEVEL_SPLASH) {
            levelSplashTimer -= dt * 1000;
            if (levelSplashTimer <= 0) {
                state = enemies.some(e => e.challengeEnemy) ? ST_CHALLENGE : ST_PLAYING;
            }
            return;
        }
        if (state === ST_DYING) {
            deathTimer -= dt * 1000;
            if (deathTimer <= 0) {
                if (lives <= 0) { state = ST_GAMEOVER; if (score > highScore) { highScore = score; try { localStorage.setItem('ywa_galaga_hi', String(highScore)); } catch {} } return; }
                dualFighter = false;
                playerX = GAME_W / 2;
                state = ST_PLAYING;
                enemyBullets = [];
                tractorBeam = null;
            }
            return;
        }
        if (state === ST_CAPTURED) {
            captureTimer += dt * 1000;
            if (capturePhase === 0 && captureTimer > 1500) {
                capturePhase = 1;
                captureTimer = 0;
                lives--;
                if (tractorBeam) {
                    const boss = enemies[tractorBeam.bossIdx];
                    if (boss) { boss.hasCaptured = true; boss.diving = false; boss.inFormation = true; }
                }
                tractorBeam = null;
            }
            if (capturePhase === 1 && captureTimer > 1000) {
                if (lives <= 0) { state = ST_GAMEOVER; if (score > highScore) { highScore = score; try { localStorage.setItem('ywa_galaga_hi', String(highScore)); } catch {} } return; }
                playerX = GAME_W / 2;
                state = ST_PLAYING;
                enemyBullets = [];
            }
            return;
        }
        if (state === ST_CHALLENGE_RESULT) {
            challengeResultTimer -= dt * 1000;
            if (challengeResultTimer <= 0) { level++; resetLevel(); }
            return;
        }

        // Player movement
        let moveDir = 0;
        if (keys['ArrowLeft'] || keys['KeyA'] || touchLeft) moveDir = -1;
        if (keys['ArrowRight'] || keys['KeyD'] || touchRight) moveDir = 1;
        const speed = PLAYER_SPEED + (dualFighter ? 0.5 : 0);
        playerX += moveDir * speed * dt * 60;
        const halfW = dualFighter ? PLAYER_W + 8 : PLAYER_W / 2 + 2;
        playerX = clamp(playerX, halfW, GAME_W - halfW);

        // Smart bomb
        if ((keys['KeyB'] || keys['ShiftLeft'] || touchBomb) && smartBombs > 0 && (state === ST_PLAYING || state === ST_CHALLENGE)) {
            keys['KeyB'] = false; keys['ShiftLeft'] = false; touchBomb = false;
            useSmartBomb();
        }

        // Firing
        const now = performance.now();
        const cooldown = hasBonus(BONUS_RAPID) ? rapidFireCooldown : FIRE_COOLDOWN;
        if ((keys['Space'] || keys['ArrowUp'] || touchFire) && now - lastFireTime > cooldown) {
            lastFireTime = now;
            const maxBullets = dualFighter ? 6 : (hasBonus(BONUS_RAPID) ? 4 : 2);
            if (playerBullets.length < maxBullets) {
                playerBullets.push({ x: playerX, y: GAME_H - 60 });
                if (dualFighter) playerBullets.push({ x: playerX + 18, y: GAME_H - 60 });
                sfxShoot();
            }
        }

        updateBonusItems(dt);

        // Player bullets
        for (let i = playerBullets.length - 1; i >= 0; i--) {
            const b = playerBullets[i];
            b.y -= BULLET_SPEED * dt * 60;
            if (b.y < -10) { playerBullets.splice(i, 1); continue; }
            for (let j = 0; j < enemies.length; j++) {
                const e = enemies[j];
                if (!e.alive) continue;
                const ew = ENEMY_W[e.type] || 28, eh = ENEMY_H[e.type] || 24;
                if (b.x > e.x - ew / 2 && b.x < e.x + ew / 2 && b.y > e.y - eh / 2 && b.y < e.y + eh / 2) {
                    playerBullets.splice(i, 1);
                    e.hp--;
                    if (e.hp <= 0) {
                        killEnemy(e, j);
                    } else {
                        e.hitFlash = 6;
                        sfxHit();
                        spawnExplosion(b.x, b.y, 5, ['#FFFFFF', '#FBBF24'], 1.5);
                    }
                    break;
                }
            }
        }

        // Formation sway — smooth sinusoidal motion
        formationTimer += dt;
        const swayPeriod = Math.max(3.0 - level * 0.1, 1.5); // seconds per full cycle
        const swayAmplitude = Math.min(25 + level * 1.5, 40);
        formationOfsX = Math.sin(formationTimer * Math.PI * 2 / swayPeriod) * swayAmplitude;

        // Entry animation with fire trails
        const entrySpeed = 0.012 + level * 0.001;
        entryQueue.forEach(e => {
            if (!e.alive) return;
            if (e.entering) {
                e.prevX = e.x; e.prevY = e.y;
                e.entryT += entrySpeed * dt * 60;
                if (e.entryT >= 1) {
                    e.entryT = 1;
                    e.entering = false;
                    if (!e.challengeEnemy) {
                        e.inFormation = true;
                        e.x = formationX(e.col); e.y = formationY(e.row);
                    } else {
                        e.alive = false;
                    }
                } else {
                    const pos = bezierPoint(e.entryPath, e.entryT);
                    e.x = pos.x; e.y = pos.y;
                    if (frameCount % 2 === 0) spawnEntryTrail(e.prevX, e.prevY, e);
                }
            } else {
                e.entryDelay -= dt * 1000;
                if (e.entryDelay <= 0) e.entering = true;
            }
        });

        // Formation position update
        enemies.forEach(e => {
            if (!e.alive) return;
            if (e.inFormation && !e.diving) {
                e.x = formationX(e.col); e.y = formationY(e.row);
            }
        });

        // Dive attacks
        if (state === ST_PLAYING) {
            diveTimer += dt * 1000;
            const diveRate = Math.max(3500 - level * 150, 1800);
            if (diveTimer > diveRate) {
                diveTimer = 0;
                const formationEnemies = enemies.filter(e => e.alive && e.inFormation && !e.diving);
                if (formationEnemies.length > 0) {
                    const diver = pick(formationEnemies);
                    if (diver.type === E_BOSS && !diver.hasCaptured && !dualFighter && !capturedShip && Math.random() < 0.25) {
                        startTractorBeam(enemies.indexOf(diver));
                    } else if (Math.random() < 0.15 && level >= 4) {
                        startGroupDive();
                    } else {
                        startDive(diver);
                    }
                }
            }
        }

        // Dive movement
        enemies.forEach(e => {
            if (!e.alive || !e.diving) return;
            e.diveT += (e.diveSpeed || 0.005) * dt * 60;
            if (e.tractorIntent && e.diveT >= 1 && !tractorBeam) {
                e.diveT = 1; e.diving = false;
                tractorBeam = { bossIdx: enemies.indexOf(e), timer: 0 };
                sfxBeam(); e.tractorIntent = false;
                return;
            }
            if (e.diveT >= 1) {
                // Keep moving past bezier endpoint until off-screen
                e.y += 3 * dt * 60;
                if (e.y > GAME_H + 40) {
                    if (e.type === E_MINIBOSS) { e.alive = false; }
                    else { e.y = -30; e.diving = false; e.inFormation = true; e.divePath = null; }
                }
            } else if (e.divePath) {
                const pos = bezierPoint(e.divePath, Math.max(e.diveT, 0));
                e.x = pos.x; e.y = pos.y;
            }
            if (e.diving && e.diveT > 0 && Math.random() < 0.015 * dt * 60) {
                enemyBullets.push({ x: e.x, y: e.y + (ENEMY_H[e.type] || 24) / 2, fromBoss: e.type === E_BOSS });
            }
        });

        // Tractor beam
        if (tractorBeam) {
            tractorBeam.timer += dt * 1000;
            const boss = enemies[tractorBeam.bossIdx];
            if (boss && boss.alive) {
                const bW = 40;
                const inBeam = Math.abs(playerX - boss.x) < bW / 2 && tractorBeam.timer > 800;
                if (inBeam && tractorBeam.timer > 1500) capturePlayer();
                if (tractorBeam.timer > TRACTOR_BEAM_DUR) {
                    tractorBeam = null;
                    if (boss.alive) { boss.diving = false; boss.inFormation = true; }
                }
            } else { tractorBeam = null; }
        }

        // Enemy bullets
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const b = enemyBullets[i];
            b.y += ENEMY_BULLET_SPEED * dt * 60;
            if (b.y > GAME_H + 10) { enemyBullets.splice(i, 1); continue; }
            if (state === ST_PLAYING) {
                const pw = dualFighter ? PLAYER_W + 18 : PLAYER_W;
                if (b.x > playerX - pw / 2 && b.x < playerX + pw / 2 && b.y > GAME_H - 65 && b.y < GAME_H - 35) {
                    enemyBullets.splice(i, 1);
                    playerHit();
                    break;
                }
            }
        }

        // Diving enemy collision
        if (state === ST_PLAYING) {
            enemies.forEach(e => {
                if (!e.alive || (!e.diving && !e.entering)) return;
                const pw = dualFighter ? PLAYER_W + 18 : PLAYER_W;
                const ew = ENEMY_W[e.type] || 28, eh = ENEMY_H[e.type] || 24;
                if (Math.abs(e.x - playerX) < (pw + ew) / 2 &&
                    Math.abs(e.y - (GAME_H - 50)) < (28 + eh) / 2) {
                    e.alive = false;
                    spawnSpriteExplosion(e.x, e.y, 1.2);
                    playerHit();
                }
            });
        }

        // Level clear check
        if (state === ST_PLAYING) {
            if (enemies.filter(e => e.alive).length === 0) { level++; resetLevel(); }
        }
        if (state === ST_CHALLENGE) {
            const remaining = enemies.filter(e => e.alive || e.entering).length;
            const allDone = entryQueue.every(e => !e.entering && (e.entryT >= 1 || !e.alive));
            if (allDone && remaining === 0) {
                state = ST_CHALLENGE_RESULT;
                challengeResultTimer = 3000;
                const bonus = challengeKills * 100;
                if (challengeKills === challengeTotal) {
                    addScore(10000, GAME_W / 2, GAME_H / 2);
                    spawnScorePopup(GAME_W / 2, GAME_H / 2 - 30, 'PERFECT!', '#FBBF24');
                } else { addScore(bonus); }
            }
        }

        // Formation shooting
        if (state === ST_PLAYING || state === ST_CHALLENGE) {
            enemies.forEach(e => {
                if (!e.alive || !e.inFormation || e.diving) return;
                if (Math.random() < (0.0004 + level * 0.0002) * dt * 60) {
                    enemyBullets.push({ x: e.x, y: e.y + (ENEMY_H[e.type] || 24) / 2 });
                }
            });
        }
    }

    // ═══════════════════════════════════════════
    //  DRAW
    // ═══════════════════════════════════════════
    function draw() {
        ctx.save();
        if (screenShake > 0.5) {
            ctx.translate(rand(-screenShake, screenShake) * SCALE, rand(-screenShake, screenShake) * SCALE);
        }

        // Background — deeper space gradient
        if (!this._bgGrad) {
            this._bgGrad = ctx.createLinearGradient(0, 0, 0, H);
            this._bgGrad.addColorStop(0, '#020208');
            this._bgGrad.addColorStop(0.35, '#04040f');
            this._bgGrad.addColorStop(0.65, '#030312');
            this._bgGrad.addColorStop(1, '#020206');
        }
        ctx.fillStyle = this._bgGrad;
        ctx.fillRect(0, 0, W, H);
        // Deep space nebula wash
        const nbPulse = 0.5 + 0.2 * Math.sin(frameCount * 0.004);
        const nb1 = ctx.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, W * 0.45);
        nb1.addColorStop(0, `rgba(40,15,70,${0.05 * nbPulse})`);
        nb1.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = nb1;
        ctx.fillRect(0, 0, W, H);
        const nb2 = ctx.createRadialGradient(W * 0.2, H * 0.6, 0, W * 0.2, H * 0.6, W * 0.35);
        nb2.addColorStop(0, `rgba(10,20,60,${0.04 * nbPulse})`);
        nb2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = nb2;
        ctx.fillRect(0, 0, W, H);
        drawStars();

        // Vignette
        const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);

        if (state === ST_TITLE) { drawTitle(); ctx.restore(); return; }

        // Formation grid dots with subtle glow
        if (state === ST_PLAYING || state === ST_LEVEL_SPLASH) {
            for (let r = 0; r < FORMATION_ROWS; r++) {
                for (let c = 0; c < FORMATION_COLS; c++) {
                    const gxp = gx(formationX(c)), gyp = gy(formationY(r));
                    // Soft glow
                    const dg = ctx.createRadialGradient(gxp, gyp, 0, gxp, gyp, gs(4));
                    dg.addColorStop(0, 'rgba(100,120,255,0.06)');
                    dg.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = dg;
                    ctx.fillRect(gxp - gs(4), gyp - gs(4), gs(8), gs(8));
                    // Dot
                    ctx.fillStyle = 'rgba(255,255,255,0.05)';
                    ctx.beginPath();
                    ctx.arc(gxp, gyp, gs(1), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // Enemies
        enemies.forEach(e => drawEnemy(e));
        drawTractorBeam();
        drawBonusItems();
        playerBullets.forEach(b => drawBullet(b.x, b.y, true));
        enemyBullets.forEach(b => {
            const img = b.fromBoss ? sprites.laserGreen : sprites.laserRed;
            if (img) drawSprite(img, b.x, b.y, 5, 14);
            else drawBullet(b.x, b.y, false);
        });

        // Player
        if (state === ST_PLAYING || state === ST_CHALLENGE || state === ST_LEVEL_SPLASH) {
            drawShip(playerX, GAME_H - 50, playerColor, PLAYER_GLOW);
            if (dualFighter) drawShip(playerX + 18, GAME_H - 50, playerColor, PLAYER_GLOW);
        }

        // Captured animation
        if (state === ST_CAPTURED && capturePhase === 0) {
            const rise = Math.min(captureTimer / 1500, 1);
            const cy = lerp(GAME_H - 50, enemies[tractorBeam?.bossIdx]?.y || 200, rise);
            drawShip(playerX, cy, playerColor, PLAYER_GLOW);
        }

        drawParticles();

        // Star power tint
        if (starPowerTimer > 0) {
            ctx.globalAlpha = 0.05 + 0.03 * Math.sin(frameCount * 0.2);
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
        }

        drawActiveBonus();
        drawHUD();

        if (state === ST_LEVEL_SPLASH) drawLevelSplash();
        if (state === ST_CHALLENGE) drawChallengeHUD();
        if (state === ST_CHALLENGE_RESULT) drawChallengeResult();
        if (state === ST_GAMEOVER) drawGameOver();

        if (state === ST_PLAYING) {
            const btns = smartBombs > 0 ? ['FIRE', 'BOMB'] : ['FIRE'];
            drawOnScreenControls(ctx, W, H, gs, btns, 'LR');
        }
        ctx.restore();
    }

    function drawActiveBonus() {
        let bx = GAME_W / 2 - 50;
        const by = 32;
        for (const key in activeBonuses) {
            const type = parseInt(key);
            const remaining = activeBonuses[key];
            const pct = remaining / BONUS_DURATION;
            ctx.fillStyle = BONUS_COLORS[type] || '#FFF';
            ctx.globalAlpha = 0.7;
            ctx.font = `bold ${gs(9)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(BONUS_NAMES[type], gx(bx), gy(by));
            ctx.fillStyle = BONUS_COLORS[type] || '#FFF';
            ctx.globalAlpha = 0.4;
            ctx.fillRect(gx(bx - 15), gy(by + 3), gs(30 * pct), gs(2));
            ctx.globalAlpha = 1;
            bx += 40;
        }
        if (starPowerTimer > 0) {
            const pct = starPowerTimer / STAR_POWER_DUR;
            ctx.fillStyle = '#FFD700';
            ctx.globalAlpha = 0.8 + 0.2 * Math.sin(frameCount * 0.3);
            ctx.font = `bold ${gs(10)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('STAR POWER', gx(GAME_W / 2), gy(by + 14));
            ctx.globalAlpha = 0.5;
            ctx.fillRect(gx(GAME_W / 2 - 30), gy(by + 17), gs(60 * pct), gs(2));
            ctx.globalAlpha = 1;
        }
    }

    function drawTitle() {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#22C55E';
        ctx.shadowColor = '#4ADE80';
        ctx.shadowBlur = gs(15);
        ctx.font = `bold ${gs(48)}px monospace`;
        ctx.fillText('GALAGA', gx(GAME_W / 2), gy(180));
        ctx.shadowBlur = gs(8);
        ctx.font = `${gs(14)}px monospace`;
        ctx.fillStyle = HUD_COLOR;
        ctx.fillText('YOUR WORLD ARCADE', gx(GAME_W / 2), gy(220));

        // Demo enemy sprites on title screen
        const demoY = 290;
        const demoX = GAME_W / 2 - 60;
        const gruntImg = sprites.grunt1;
        const cmdImg = sprites.commander1;
        const bossImg = sprites.boss1;
        if (gruntImg) drawSprite(gruntImg, demoX, demoY, 24, 20);
        ctx.fillStyle = HUD_COLOR; ctx.shadowBlur = 0;
        ctx.font = `${gs(11)}px monospace`; ctx.textAlign = 'left';
        ctx.fillText('50 PTS', gx(demoX + 25), gy(demoY + 4));

        if (cmdImg) drawSprite(cmdImg, demoX, demoY + 35, 26, 22);
        ctx.fillStyle = HUD_COLOR;
        ctx.font = `${gs(11)}px monospace`; ctx.textAlign = 'left';
        ctx.fillText('100 PTS', gx(demoX + 25), gy(demoY + 39));

        if (bossImg) drawSprite(bossImg, demoX, demoY + 72, 34, 30);
        ctx.fillStyle = HUD_COLOR;
        ctx.font = `${gs(11)}px monospace`; ctx.textAlign = 'left';
        ctx.fillText('150 PTS', gx(demoX + 30), gy(demoY + 76));

        if (Math.floor(frameCount / 30) % 2 === 0) {
            ctx.fillStyle = '#FBBF24';
            ctx.textAlign = 'center';
            ctx.font = `${gs(15)}px monospace`;
            ctx.fillText('PRESS SPACE TO START', gx(GAME_W / 2), gy(460));
        }
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = `${gs(10)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('ARROWS / TOUCH TO MOVE \u2022 SPACE TO FIRE', gx(GAME_W / 2), gy(540));
        ctx.fillText('B / SHIFT = SMART BOMB', gx(GAME_W / 2), gy(560));
    }

    function drawHUD() {
        // HUD backdrop panels
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.roundRect(gx(4), gy(6), gs(160), gs(18), gs(4));
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(gx(GAME_W - 100), gy(6), gs(96), gs(18), gs(4));
        ctx.fill();

        ctx.textAlign = 'left';
        ctx.fillStyle = HUD_COLOR;
        ctx.font = `bold ${gs(14)}px monospace`;
        ctx.fillText(`SCORE ${String(score).padStart(7, '0')}`, gx(10), gy(20));
        ctx.textAlign = 'right';
        ctx.fillText(`STAGE ${level}`, gx(GAME_W - 10), gy(20));
        // Lives with mini ship sprites
        for (let i = 0; i < Math.min(lives - 1, 5); i++) {
            const lx = 16 + i * 22;
            const pImg = getPlayerSprite();
            if (pImg) drawSprite(pImg, lx, GAME_H - 16, 14, 12);
            else drawMiniLife(lx, GAME_H - 16);
        }
        if (lives > 6) {
            ctx.fillStyle = HUD_COLOR; ctx.textAlign = 'left';
            ctx.font = `${gs(10)}px monospace`;
            ctx.fillText(`+${lives - 6}`, gx(16 + 5 * 22), gy(GAME_H - 12));
        }
        if (smartBombs > 0) {
            ctx.textAlign = 'right';
            ctx.fillStyle = '#EF4444';
            ctx.font = `bold ${gs(11)}px monospace`;
            ctx.fillText(`BOMB x${smartBombs}`, gx(GAME_W - 10), gy(GAME_H - 12));
        }
    }

    function drawMiniLife(x, y) {
        ctx.save();
        ctx.translate(gx(x), gy(y));
        const s = gs(1);
        ctx.fillStyle = playerColor;
        ctx.beginPath();
        ctx.moveTo(0, -5 * s); ctx.lineTo(6 * s, 4 * s); ctx.lineTo(-6 * s, 4 * s);
        ctx.closePath(); ctx.fill();
        ctx.restore();
    }

    function drawLevelSplash() {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FBBF24'; ctx.shadowColor = '#FBBF24'; ctx.shadowBlur = gs(10);
        ctx.font = `bold ${gs(28)}px monospace`;
        const isChallenge = level % CHALLENGE_INTERVAL === 0 && level > 0;
        ctx.fillText(isChallenge ? 'CHALLENGING STAGE' : `STAGE ${level}`, gx(GAME_W / 2), gy(GAME_H / 2 - 10));
        ctx.shadowBlur = 0;
        ctx.font = `${gs(13)}px monospace`; ctx.fillStyle = HUD_COLOR;
        ctx.fillText('GET READY', gx(GAME_W / 2), gy(GAME_H / 2 + 25));
        if (level > 0 && level % SMART_BOMB_EARN_INTERVAL === 0) {
            ctx.fillStyle = '#EF4444'; ctx.font = `bold ${gs(12)}px monospace`;
            ctx.fillText('+1 SMART BOMB!', gx(GAME_W / 2), gy(GAME_H / 2 + 50));
        }
        if (isChallenge) {
            for (let i = 0; i < 8; i++) {
                const ang = (frameCount * 0.05 + i * Math.PI / 4) % (Math.PI * 2);
                const r = 80 + 20 * Math.sin(frameCount * 0.1 + i);
                const sx = GAME_W / 2 + Math.cos(ang) * r;
                const sy = GAME_H / 2 - 10 + Math.sin(ang) * r * 0.4;
                // Use star sprites for sparkle
                const starImg = sprites[pick(['star1', 'star2'])];
                if (starImg) {
                    drawSprite(starImg, sx, sy, 8, 8, ang, 0.5 + 0.5 * Math.sin(frameCount * 0.15 + i));
                } else {
                    ctx.fillStyle = pick(['#FBBF24', '#F97316', '#FFFFFF', '#A855F7']);
                    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(frameCount * 0.15 + i);
                    ctx.beginPath(); ctx.arc(gx(sx), gy(sy), gs(2), 0, Math.PI * 2); ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        }
    }

    function drawChallengeHUD() {
        ctx.textAlign = 'center'; ctx.fillStyle = '#FBBF24';
        ctx.font = `${gs(11)}px monospace`;
        ctx.fillText(`HITS: ${challengeKills}`, gx(GAME_W / 2), gy(35));
    }

    function drawChallengeResult() {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FBBF24'; ctx.shadowColor = '#FBBF24'; ctx.shadowBlur = gs(8);
        ctx.font = `bold ${gs(22)}px monospace`;
        ctx.fillText('RESULTS', gx(GAME_W / 2), gy(GAME_H / 2 - 60));
        ctx.shadowBlur = 0;
        ctx.fillStyle = HUD_COLOR; ctx.font = `${gs(14)}px monospace`;
        ctx.fillText(`ENEMIES HIT: ${challengeKills} / ${challengeTotal}`, gx(GAME_W / 2), gy(GAME_H / 2 - 20));
        if (challengeKills === challengeTotal) {
            ctx.fillStyle = '#22C55E'; ctx.font = `bold ${gs(20)}px monospace`;
            ctx.fillText('PERFECT! 10000 PTS', gx(GAME_W / 2), gy(GAME_H / 2 + 20));
        } else {
            ctx.fillStyle = BULLET_COLOR; ctx.font = `${gs(16)}px monospace`;
            ctx.fillText(`BONUS: ${challengeKills * 100} PTS`, gx(GAME_W / 2), gy(GAME_H / 2 + 20));
        }
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#EF4444'; ctx.shadowColor = '#EF4444'; ctx.shadowBlur = gs(15);
        ctx.font = `bold ${gs(38)}px monospace`;
        ctx.fillText('GAME OVER', gx(GAME_W / 2), gy(GAME_H / 2 - 50));
        ctx.shadowBlur = 0;
        ctx.fillStyle = HUD_COLOR; ctx.font = `bold ${gs(18)}px monospace`;
        ctx.fillText(`FINAL SCORE: ${score.toLocaleString()}`, gx(GAME_W / 2), gy(GAME_H / 2 - 5));
        if (score >= highScore && score > 0) {
            ctx.fillStyle = '#FBBF24'; ctx.font = `bold ${gs(13)}px monospace`;
            ctx.fillText('\u2605 NEW HIGH SCORE! \u2605', gx(GAME_W / 2), gy(GAME_H / 2 + 18));
        } else {
            ctx.fillStyle = '#888'; ctx.font = `${gs(12)}px monospace`;
            ctx.fillText(`BEST: ${highScore.toLocaleString()}`, gx(GAME_W / 2), gy(GAME_H / 2 + 18));
        }
        ctx.fillStyle = '#94A3B8'; ctx.font = `${gs(14)}px monospace`;
        ctx.fillText(`STAGE: ${level}`, gx(GAME_W / 2), gy(GAME_H / 2 + 42));
        if (Math.floor(frameCount / 30) % 2 === 0) {
            ctx.fillStyle = '#FBBF24'; ctx.font = `${gs(14)}px monospace`;
            ctx.fillText(HAS_TOUCH ? 'TAP TO PLAY AGAIN' : 'PRESS SPACE TO PLAY AGAIN', gx(GAME_W / 2), gy(GAME_H / 2 + 78));
        }
    }

    // ═══════════════════════════════════════════
    //  LOADING SCREEN
    // ═══════════════════════════════════════════
    function drawLoading() {
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#22C55E';
        ctx.shadowColor = '#4ADE80'; ctx.shadowBlur = gs(10);
        ctx.font = `bold ${gs(36)}px monospace`;
        ctx.fillText('GALAGA', gx(GAME_W / 2), gy(GAME_H / 2 - 60));
        ctx.shadowBlur = 0;
        ctx.fillStyle = HUD_COLOR; ctx.font = `${gs(13)}px monospace`;
        ctx.fillText('LOADING SPRITES...', gx(GAME_W / 2), gy(GAME_H / 2));
        // Progress bar
        const barW = 200, barH = 8;
        const pct = spritesTotal > 0 ? spritesLoaded / spritesTotal : 0;
        ctx.fillStyle = '#333';
        ctx.fillRect(gx(GAME_W / 2 - barW / 2), gy(GAME_H / 2 + 20), gs(barW), gs(barH));
        ctx.fillStyle = '#22C55E';
        ctx.fillRect(gx(GAME_W / 2 - barW / 2), gy(GAME_H / 2 + 20), gs(barW * pct), gs(barH));
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `${gs(10)}px monospace`;
        ctx.fillText(`${spritesLoaded} / ${spritesTotal}`, gx(GAME_W / 2), gy(GAME_H / 2 + 45));
    }

    // ═══════════════════════════════════════════
    //  GAME LOOP
    // ═══════════════════════════════════════════
    function gameLoop(ts) {
        if (!gameActive) return;
        const dt = lastTime ? Math.min((ts - lastTime) / 1000, 0.05) : 0.016;
        lastTime = ts;
        if (state === ST_LOADING) {
            drawLoading();
            if (allSpritesReady) state = ST_TITLE;
        } else {
            update(dt);
            draw();
        }
        animFrame = requestAnimationFrame(gameLoop);
    }

    // ═══════════════════════════════════════════
    //  INPUT
    // ═══════════════════════════════════════════
    function onKeyDown(e) {
        keys[e.code] = true;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }
    function onKeyUp(e) { keys[e.code] = false; }

    function onTouchStart(e) {
        e.preventDefault();
        handleTouches(e.touches);
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }
    function onTouchMove(e) { e.preventDefault(); handleTouches(e.touches); }
    function onTouchEnd(e) {
        e.preventDefault();
        touchLeft = false; touchRight = false; touchFire = false; touchBomb = false;
        if (e.touches.length > 0) handleTouches(e.touches);
    }
    function handleTouches(touches) {
        touchLeft = false; touchRight = false; touchFire = false; touchBomb = false;
        for (let i = 0; i < touches.length; i++) {
            const t = touches[i];
            const rect = canvas.getBoundingClientRect();
            const tx = (t.clientX - rect.left) / rect.width;
            const ty = (t.clientY - rect.top) / rect.height;
            if (ty > 0.7) {
                // Bottom zone: left third = left, middle third = right, right third = fire/bomb
                if (tx < 0.33) touchLeft = true;
                else if (tx < 0.55) touchRight = true;
                else if (tx > 0.82) touchBomb = true;
                else touchFire = true;
            } else {
                // Upper screen tap = fire
                touchFire = true;
            }
        }
    }

    function fitCanvas() {
        if (!canvas) return;
        let pw = canvas.width || 480;
        let ph = canvas.height || 640;
        const parent = canvas.parentElement;
        if (parent && parent.clientWidth > 50 && parent.clientHeight > 50) {
            pw = parent.clientWidth;
            ph = parent.clientHeight;
        }
        const aspect = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > aspect) { ch = ph; cw = ch * aspect; }
        else { cw = pw; ch = cw / aspect; }
        cw = Math.max(cw, 320);
        ch = Math.max(ch, 400);
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = Math.round(cw * DPR);
        canvas.height = Math.round(ch * DPR);
        canvas.style.width = `${Math.round(cw)}px`;
        canvas.style.height = `${Math.round(ch)}px`;
        W = canvas.width; H = canvas.height;
        SCALE = W / GAME_W;
    }

    // ═══════════════════════════════════════════
    //  INIT / DESTROY
    // ═══════════════════════════════════════════
    function init(cvs, player, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = player;
        gameOverCB = onGameOver;
        gameActive = true;
        playerColor = player?.color || PLAYER_COLOR;

        // Pick player ship color variant based on theme
        const themeId = player?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            PLAYER_COLOR = _t.colors[0] || PLAYER_COLOR;
            PLAYER_GLOW = _t.colors[1] || PLAYER_GLOW;
            BULLET_COLOR = _t.colors[3] || BULLET_COLOR;
            playerColor = _t.colors[0] || playerColor;
        }
        // Map theme color to ship variant
        const pc = (playerColor || '').toLowerCase();
        if (pc.includes('22c55e') || pc.includes('4ade80') || pc.includes('green')) playerShipKey = 'playerGreen';
        else if (pc.includes('f97316') || pc.includes('fbbf24') || pc.includes('orange')) playerShipKey = 'playerOrange';
        else if (pc.includes('ef4444') || pc.includes('f87171') || pc.includes('red')) playerShipKey = 'playerRed';
        else playerShipKey = 'playerBlue';

        state = ST_LOADING;
        frameCount = 0;
        lastTime = 0;
        keys = {};
        particles = [];
        scorePopups = [];
        playerBullets = [];
        enemyBullets = [];
        enemies = [];
        entryQueue = [];
        entryTrails = [];
        bonusItems = [];
        activeBonuses = {};
        spriteExplosions = [];
        tractorBeam = null;
        dualFighter = false;
        capturedShip = null;
        screenShake = 0;
        score = 0; level = 1; lives = INITIAL_LIVES;
        nextBonusAt = BONUS_LIFE_SCORE;
        playerX = GAME_W / 2;
        smartBombs = 1; lastSmartBombLevel = 0;
        starPowerTimer = 0; bonusCollectedThisLevel = 0;

        W = canvas.width || 480; H = canvas.height || 640;
        SCALE = W / GAME_W;
        DPR = Math.min(window.devicePixelRatio || 1, 3);

        createStars();

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        window.addEventListener('resize', fitCanvas);

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        // Load sprites then start game loop
        loadSprites(
            (loaded, total) => { /* progress tracked via spritesLoaded */ },
            () => { /* allSpritesReady set in loadSprites */ }
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
        keys = {};
        particles = [];
        enemies = [];
        playerBullets = [];
        enemyBullets = [];
        bonusItems = [];
        entryTrails = [];
        spriteExplosions = [];
        activeBonuses = {};
    }

    return { init, destroy };
})();
