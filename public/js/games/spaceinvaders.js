/* YWA Space Invaders — 4K-quality canvas arcade game with Kenney CC0 space sprites */
window.SpaceInvaders = (() => {

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

    // ── Sprite Atlas ──
    const SPRITE_BASE = '/img/game-assets/kenney-space';
    const sprites = {};
    let spritesLoaded = 0, spritesTotal = 0, allSpritesReady = false;

    const SPRITE_MANIFEST = {
        // Player ships
        playerBlue:   `${SPRITE_BASE}/ships/playerShip1_blue.png`,
        playerGreen:  `${SPRITE_BASE}/ships/playerShip1_green.png`,
        playerOrange: `${SPRITE_BASE}/ships/playerShip1_orange.png`,
        playerRed:    `${SPRITE_BASE}/ships/playerShip1_red.png`,
        // Aliens row by row (top→bottom: 5 rows)
        alien0a:      `${SPRITE_BASE}/enemies/enemyRed1.png`,
        alien0b:      `${SPRITE_BASE}/enemies/enemyRed2.png`,
        alien1a:      `${SPRITE_BASE}/enemies/enemyBlue3.png`,
        alien1b:      `${SPRITE_BASE}/enemies/enemyBlue4.png`,
        alien2a:      `${SPRITE_BASE}/enemies/enemyGreen1.png`,
        alien2b:      `${SPRITE_BASE}/enemies/enemyGreen2.png`,
        alien3a:      `${SPRITE_BASE}/enemies/enemyBlack1.png`,
        alien3b:      `${SPRITE_BASE}/enemies/enemyBlack2.png`,
        alien4a:      `${SPRITE_BASE}/enemies/enemyBlue1.png`,
        alien4b:      `${SPRITE_BASE}/enemies/enemyBlue2.png`,
        // UFO
        ufo:          `${SPRITE_BASE}/enemies/enemyRed4.png`,
        // Boss
        boss:         `${SPRITE_BASE}/enemies/enemyGreen5.png`,
        // Lasers
        laserBlue:    `${SPRITE_BASE}/lasers/laserBlue01.png`,
        laserRed:     `${SPRITE_BASE}/lasers/laserRed01.png`,
        laserGreen:   `${SPRITE_BASE}/lasers/laserGreen01.png`,
        // Power-ups
        puSpeed:      `${SPRITE_BASE}/powerups/powerupBlue_bolt.png`,
        puDouble:     `${SPRITE_BASE}/powerups/powerupRed_bolt.png`,
        puRepair:     `${SPRITE_BASE}/powerups/powerupGreen_shield.png`,
        // Meteors (background)
        meteorBig1:   `${SPRITE_BASE}/meteors/meteorBrown_big1.png`,
        meteorSmall1: `${SPRITE_BASE}/meteors/meteorBrown_small1.png`,
    };

    // Explosion frames (fire00-fire19, pick 8 evenly spaced)
    const EXPLOSION_FRAME_IDS = [];
    const EXPLOSION_FRAME_COUNT = 8;
    for (let i = 0; i < 20; i += Math.floor(20 / EXPLOSION_FRAME_COUNT)) {
        const id = `fire${String(i).padStart(2, '0')}`;
        SPRITE_MANIFEST[id] = `${SPRITE_BASE}/effects/fire${String(i).padStart(2, '0')}.png`;
        EXPLOSION_FRAME_IDS.push(id);
        if (EXPLOSION_FRAME_IDS.length >= EXPLOSION_FRAME_COUNT) break;
    }

    let spriteExplosions = [];

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

    function drawSpriteOrFallback(spriteKey, x, y, w, h, fallbackFn) {
        const s = sprites[spriteKey];
        if (s && allSpritesReady) {
            ctx.drawImage(s, gx(x), gy(y), gs(w), gs(h));
        } else if (fallbackFn) {
            fallbackFn();
        }
    }

    // Map player color → sprite key
    function playerSpriteKey() {
        const c = (playerColor || PLAYER_COLOR).toLowerCase();
        if (c.includes('22c5') || c.includes('34d3') || c.includes('10b9')) return 'playerGreen';
        if (c.includes('f43f') || c.includes('ef44') || c.includes('e11d')) return 'playerRed';
        if (c.includes('f59e') || c.includes('f97') || c.includes('fbb')) return 'playerOrange';
        return 'playerBlue';
    }

    // Map alien row (0-4) to sprite keys (a/b for animation frame)
    function alienSpriteKeys(row) {
        const r = Math.min(row, 4);
        return [`alien${r}a`, `alien${r}b`];
    }

    // ── Design Constants ──
    const GAME_W = 960, GAME_H = 1080; // Internal resolution (scales to any display)
    const COLS = 11, ROWS = 5;
    const ALIEN_W = 48, ALIEN_H = 36;
    const ALIEN_PAD_X = 16, ALIEN_PAD_Y = 12;
    const SHIELD_COUNT = 4;
    const SHIELD_W = 80, SHIELD_H = 56;
    const PLAYER_W = 52, PLAYER_H = 32;
    const BULLET_W = 4, BULLET_H = 16;
    const UFO_W = 60, UFO_H = 24;
    const FIRE_COOLDOWN = 350;
    const ALIEN_FIRE_INTERVAL = 900;
    const INITIAL_STEP_MS = 700;
    const MIN_STEP_MS = 80;
    const INITIAL_LIVES = 3;
    const BONUS_LIFE_SCORE = 10000;
    const DEATH_ANIM_MS = 1500;
    const LEVEL_SPLASH_MS = 2000;
    const UFO_INTERVAL_MIN = 18000;
    const UFO_INTERVAL_MAX = 30000;
    const BOSS_EVERY = 5; // Boss wave every N levels
    const POWERUP_CHANCE = 0.10; // 10% drop from destroyed aliens
    const POWERUP_W = 24, POWERUP_H = 24;
    const POWERUP_FALL_SPEED = 2;
    const POWERUP_DURATION = 8000; // ms for timed powerups
    const BOSS_HP_BASE = 30;
    const BOSS_HP_SCALE = 10; // extra HP per boss encounter
    const BOSS_W = 120, BOSS_H = 80;
    const BOSS_FIRE_INTERVAL = 1200;
    const WAVE_FLASH_MS = 500;

    const ALIEN_SCORES = [30, 20, 20, 10, 10]; // top row → bottom row
    const UFO_SCORES = [50, 100, 150, 300];
    const POWERUP_TYPES = ['speed', 'double', 'repair'];

    // ── Theme Colors (overridable) ──
    let BG_COLOR = '#05050F';
    let PLAYER_COLOR = '#06B6D4';
    let PLAYER_GLOW = '#22D3EE';
    let BULLET_COLOR = '#F59E0B';
    let ALIEN_COLORS = ['#F43F5E', '#EC4899', '#A855F7', '#3B82F6', '#06B6D4'];
    let ALIEN_GLOW = ['#FF6B8A', '#F9A8D4', '#C084FC', '#60A5FA', '#22D3EE'];
    let SHIELD_COLOR = '#22C55E';
    let UFO_COLOR = '#F43F5E';
    let STAR_COLOR = '#E0E7FF';
    let HUD_COLOR = '#E0E7FF';
    let EXPLOSION_COLORS = ['#FBBF24', '#F97316', '#EF4444', '#FFFFFF'];
    let POWERUP_COLORS = { speed: '#3B82F6', double: '#F59E0B', repair: '#22C55E' };
    let BOSS_COLOR = '#9333EA';
    let BOSS_GLOW = '#C084FC';

    // ── State ──
    const ST_LOADING = -1, ST_TITLE = 0, ST_PLAYING = 1, ST_DYING = 2, ST_LEVEL_SPLASH = 3, ST_GAMEOVER = 4, ST_BOSS = 5;
    let canvas, ctx, audioCtx;
    let W, H, SCALE, DPR;
    let animFrame, lastTime, state;
    let score, level, lives, gameActive, startTime;
    let playerX, playerBullets; // changed to array for double-shot
    let aliens, alienDir, alienStepTimer, alienStepMs, alienDropNext;
    let alienBullets, alienFireTimer;
    let shields;
    let ufo, ufoTimer;
    let particles, scorePopups, stars;
    let keys = {}, lastFireTime = 0;
    let deathTimer = 0, levelSplashTimer = 0;
    let nextBonusAt;
    let gameOverCB, activePlayer, playerColor;
    let highScore = parseInt(localStorage.getItem('ywa_spaceinvaders_hi') || '0');
    let touchLeft = false, touchRight = false, touchFire = false;
    let frameCount = 0;
    let screenShake = 0;
    let bgGradient;
    // Power-up state
    let powerups; // active falling powerups on screen
    let activePowerup; // { type, timer } or null
    // Boss state
    let boss; // { x, y, hp, maxHp, vx, fireTimer, phase } or null
    let bossBullets;
    // Wave flash
    let waveFlashTimer = 0;

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

    function playNoise(dur, vol) {
        try {
            ensureAudio();
            const bufSize = audioCtx.sampleRate * dur;
            const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
            const src = audioCtx.createBufferSource();
            const g = audioCtx.createGain();
            src.buffer = buf;
            g.gain.setValueAtTime(vol || 0.06, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            src.connect(g); g.connect(audioCtx.destination);
            src.start();
        } catch {}
    }

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


    const SND = {
        shoot:     () => playTone(880, 0.08, 'square', 0.06, 440),
        hit:       () => playNoise(0.15, 0.08),
        explode:   () => { playNoise(0.3, 0.12); playTone(80, 0.3, 'sawtooth', 0.06, 30); },
        die:       () => { playNoise(0.5, 0.15); playTone(200, 0.5, 'sawtooth', 0.1, 40); },
        ufo:       () => playTone(440, 0.1, 'sine', 0.04, 880),
        ufoHit:    () => { playTone(1200, 0.15, 'square', 0.08, 200); playNoise(0.2, 0.1); },
        step:      (n) => playTone(60 + (n % 4) * 20, 0.06, 'square', 0.03),
        levelUp:   () => { playTone(523, 0.1, 'square', 0.08); setTimeout(() => playTone(659, 0.1, 'square', 0.08), 120); setTimeout(() => playTone(784, 0.15, 'square', 0.08), 240); },
        bonusLife: () => { playTone(784, 0.08, 'sine', 0.1); setTimeout(() => playTone(1047, 0.15, 'sine', 0.1), 100); },
        powerup:   () => { playTone(660, 0.06, 'sine', 0.08); setTimeout(() => playTone(880, 0.06, 'sine', 0.08), 80); setTimeout(() => playTone(1100, 0.08, 'sine', 0.08), 160); },
        bossHit:   () => { playTone(120, 0.1, 'sawtooth', 0.08, 60); playNoise(0.08, 0.06); },
        bossDie:   () => { playNoise(0.6, 0.18); playTone(60, 0.6, 'sawtooth', 0.12, 20); },
        waveFlash: () => { playTone(1047, 0.08, 'sine', 0.1); setTimeout(() => playTone(1318, 0.12, 'sine', 0.1), 100); },
    };

    // ═══════════════════════════════════════════
    //  RENDERING HELPERS
    // ═══════════════════════════════════════════
    function gx(x) { return x * SCALE; }
    function gy(y) { return y * SCALE; }
    function gs(s) { return s * SCALE; }

    function drawGlow(x, y, radius, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha || 0.3;
        const grad = ctx.createRadialGradient(gx(x), gy(y), 0, gx(x), gy(y), gs(radius));
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(gx(x) - gs(radius), gy(y) - gs(radius), gs(radius * 2), gs(radius * 2));
        ctx.restore();
    }

    // ── Alien Drawing (sprite-based with canvas fallback) ──
    function drawAlienSprite(x, y, w, h, row, frame) {
        const keys = alienSpriteKeys(row);
        const key = frame ? keys[1] : keys[0];
        const s = sprites[key];
        if (s && allSpritesReady) {
            ctx.drawImage(s, gx(x), gy(y), gs(w), gs(h));
            return true;
        }
        return false;
    }

    function drawAlienType0(x, y, w, h, color, glow, frame) {
        if (drawAlienSprite(x, y, w, h, 0, frame)) return;
        // Squid type — top row, pointy head with detailed tentacles
        const cx = gx(x + w/2), cy = gy(y + h/2);
        const s = gs(1);
        ctx.save();
        drawGlow(x + w/2, y + h/2, w * 0.8, glow, 0.18);
        ctx.fillStyle = color;
        // Main body - tapered oval
        ctx.beginPath();
        ctx.moveTo(cx, cy - gs(h*0.48));
        ctx.bezierCurveTo(cx + gs(w*0.3), cy - gs(h*0.4), cx + gs(w*0.35), cy + gs(h*0.05), cx + gs(w*0.2), cy + gs(h*0.12));
        ctx.lineTo(cx - gs(w*0.2), cy + gs(h*0.12));
        ctx.bezierCurveTo(cx - gs(w*0.35), cy + gs(h*0.05), cx - gs(w*0.3), cy - gs(h*0.4), cx, cy - gs(h*0.48));
        ctx.fill();
        // Inner body pattern
        ctx.fillStyle = glow;
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.ellipse(cx, cy - gs(h*0.15), gs(w*0.15), gs(h*0.2), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // Eyes - angry slits
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.moveTo(cx - gs(w*0.16), cy - gs(h*0.12));
        ctx.lineTo(cx - gs(w*0.06), cy - gs(h*0.16));
        ctx.lineTo(cx - gs(w*0.06), cy - gs(h*0.08));
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx + gs(w*0.16), cy - gs(h*0.12));
        ctx.lineTo(cx + gs(w*0.06), cy - gs(h*0.16));
        ctx.lineTo(cx + gs(w*0.06), cy - gs(h*0.08));
        ctx.fill();
        // Pupils
        ctx.fillStyle = '#000';
        ctx.fillRect(cx - gs(w*0.12), cy - gs(h*0.14), gs(3), gs(3));
        ctx.fillRect(cx + gs(w*0.08), cy - gs(h*0.14), gs(3), gs(3));
        // Tentacles - wavy with segments
        const legSpread = frame ? 1.3 : 0.7;
        ctx.strokeStyle = color;
        ctx.lineWidth = gs(2.5);
        ctx.lineCap = 'round';
        for (let i = -2; i <= 2; i++) {
            const wave = Math.sin(frameCount * 0.12 + i * 1.2) * 4 * legSpread;
            ctx.beginPath();
            ctx.moveTo(cx + gs(i * w * 0.08), cy + gs(h*0.1));
            ctx.quadraticCurveTo(
                cx + gs(i * w * 0.1 + wave), cy + gs(h*0.25),
                cx + gs(i * w * 0.12 * legSpread), cy + gs(h*0.42)
            );
            ctx.stroke();
            // Tentacle tips - small dots
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(cx + gs(i * w * 0.12 * legSpread), cy + gs(h*0.42), gs(1.5), 0, Math.PI * 2);
            ctx.fill();
        }
        // Crown spikes
        ctx.fillStyle = color;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(cx + gs(i * w * 0.1), cy - gs(h*0.48));
            ctx.lineTo(cx + gs(i * w * 0.1 - 3), cy - gs(h*0.35));
            ctx.lineTo(cx + gs(i * w * 0.1 + 3), cy - gs(h*0.35));
            ctx.fill();
        }
        ctx.restore();
    }

    function drawAlienType1(x, y, w, h, color, glow, frame) {
        if (drawAlienSprite(x, y, w, h, 1, frame)) return;
        // Crab type — mid rows, armored body with snapping claws
        const cx = gx(x + w/2), cy = gy(y + h/2);
        ctx.save();
        drawGlow(x + w/2, y + h/2, w * 0.7, glow, 0.14);
        ctx.fillStyle = color;
        // Body - hexagonal shape
        const bw = gs(w * 0.32), bh = gs(h * 0.28);
        ctx.beginPath();
        ctx.moveTo(cx - bw, cy - bh * 0.5);
        ctx.lineTo(cx - bw * 0.6, cy - bh);
        ctx.lineTo(cx + bw * 0.6, cy - bh);
        ctx.lineTo(cx + bw, cy - bh * 0.5);
        ctx.lineTo(cx + bw, cy + bh * 0.5);
        ctx.lineTo(cx + bw * 0.6, cy + bh);
        ctx.lineTo(cx - bw * 0.6, cy + bh);
        ctx.lineTo(cx - bw, cy + bh * 0.5);
        ctx.closePath();
        ctx.fill();
        // Armor plates
        ctx.strokeStyle = glow;
        ctx.lineWidth = gs(1);
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(cx - bw * 0.3, cy - bh);
        ctx.lineTo(cx - bw * 0.3, cy + bh);
        ctx.moveTo(cx + bw * 0.3, cy - bh);
        ctx.lineTo(cx + bw * 0.3, cy + bh);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Eyes - round and glowing
        ctx.fillStyle = '#FFF';
        const eyeR = gs(w * 0.055);
        ctx.beginPath();
        ctx.arc(cx - gs(w * 0.1), cy - gs(h * 0.04), eyeR, 0, Math.PI * 2);
        ctx.arc(cx + gs(w * 0.1), cy - gs(h * 0.04), eyeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(cx - gs(w * 0.1), cy - gs(h * 0.04), eyeR * 0.5, 0, Math.PI * 2);
        ctx.arc(cx + gs(w * 0.1), cy - gs(h * 0.04), eyeR * 0.5, 0, Math.PI * 2);
        ctx.fill();
        // Antennae
        ctx.strokeStyle = color;
        ctx.lineWidth = gs(1.5);
        for (const dir of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(cx + gs(dir * w * 0.12), cy - bh);
            ctx.quadraticCurveTo(cx + gs(dir * w * 0.2), cy - bh - gs(h * 0.2), cx + gs(dir * w * 0.25), cy - bh - gs(h * 0.15));
            ctx.stroke();
            // Antenna tip
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(cx + gs(dir * w * 0.25), cy - bh - gs(h * 0.15), gs(2), 0, Math.PI * 2);
            ctx.fill();
        }
        // Claws — articulated
        ctx.fillStyle = color;
        const clawOpen = frame ? 0.5 : -0.1;
        for (const dir of [-1, 1]) {
            ctx.save();
            ctx.translate(cx + gs(dir * w * 0.32), cy + gs(2));
            // Upper arm
            ctx.rotate(dir * 0.2);
            ctx.fillRect(-gs(2), -gs(3), gs(w * 0.12), gs(5));
            // Claw pincer
            ctx.translate(gs(w * 0.1) * dir, 0);
            ctx.rotate(dir * clawOpen);
            ctx.beginPath();
            ctx.moveTo(0, -gs(5));
            ctx.lineTo(gs(dir * 8), -gs(2));
            ctx.lineTo(gs(dir * 8), gs(2));
            ctx.lineTo(0, gs(5));
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        // Legs
        ctx.strokeStyle = color;
        ctx.lineWidth = gs(1.5);
        for (let i = -1; i <= 1; i++) {
            const legY = frame ? gs(h * 0.38) : gs(h * 0.32);
            ctx.beginPath();
            ctx.moveTo(cx + gs(i * w * 0.1), cy + bh);
            ctx.lineTo(cx + gs(i * w * 0.14), cy + bh + legY * 0.5);
            ctx.lineTo(cx + gs(i * w * 0.12), cy + bh + legY);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawAlienType2(x, y, w, h, color, glow, frame) {
        if (drawAlienSprite(x, y, w, h, 3, frame)) return;
        // Octopus type — bottom rows, round squishy with pulsing tentacles
        const cx = gx(x + w/2), cy = gy(y + h/2);
        ctx.save();
        drawGlow(x + w/2, y + h/2, w * 0.6, glow, 0.12);
        ctx.fillStyle = color;
        // Round body with slight squish
        const squish = frame ? 0.92 : 1.08;
        ctx.beginPath();
        ctx.ellipse(cx, cy - gs(4), gs(w * 0.28 * squish), gs(w * 0.28 / squish), 0, 0, Math.PI * 2);
        ctx.fill();
        // Dome highlight
        ctx.fillStyle = glow;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.ellipse(cx - gs(5), cy - gs(10), gs(w * 0.1), gs(w * 0.08), -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // Spots pattern
        ctx.fillStyle = glow;
        ctx.globalAlpha = 0.1;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(cx + gs((i - 1) * 8), cy - gs(2), gs(3), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Eyes - big expressive
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.ellipse(cx - gs(w*0.1), cy - gs(5), gs(4), gs(5), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + gs(w*0.06), cy - gs(5), gs(4), gs(5), 0, 0, Math.PI * 2);
        ctx.fill();
        // Pupils - follow animation
        const pupOff = frame ? 1 : -1;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(cx - gs(w*0.1) + gs(pupOff), cy - gs(4), gs(2.5), 0, Math.PI * 2);
        ctx.arc(cx + gs(w*0.06) + gs(pupOff), cy - gs(4), gs(2.5), 0, Math.PI * 2);
        ctx.fill();
        // Mouth
        ctx.strokeStyle = glow;
        ctx.lineWidth = gs(1);
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(cx, cy + gs(2), gs(4), 0.1, Math.PI - 0.1);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Tentacles — curvy with suction cups
        ctx.strokeStyle = color;
        ctx.lineWidth = gs(2.5);
        ctx.lineCap = 'round';
        for (let i = -2; i <= 2; i++) {
            const wave = Math.sin(frameCount * 0.1 + i * 0.9) * (frame ? 6 : 3);
            const wave2 = Math.cos(frameCount * 0.08 + i * 1.1) * 3;
            ctx.beginPath();
            ctx.moveTo(cx + gs(i * w * 0.1), cy + gs(h * 0.05));
            ctx.bezierCurveTo(
                cx + gs(i * w * 0.12 + wave), cy + gs(h * 0.18),
                cx + gs(i * w * 0.08 + wave2), cy + gs(h * 0.3),
                cx + gs(i * w * 0.1 + wave * 0.5), cy + gs(h * 0.42)
            );
            ctx.stroke();
            // Suction cups
            ctx.fillStyle = glow;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(cx + gs(i * w * 0.11 + wave * 0.5), cy + gs(h * 0.25), gs(1.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    }

    const ALIEN_DRAW = [drawAlienType0, drawAlienType1, drawAlienType1, drawAlienType2, drawAlienType2];

    // ── Player Ship (sprite-based with canvas fallback) ──
    function drawPlayer(x, y) {
        const cx = gx(x + PLAYER_W / 2), cy = gy(y + PLAYER_H / 2);
        ctx.save();

        // Engine glow - larger, pulsing
        const thrustPulse = 0.25 + Math.sin(frameCount * 0.25) * 0.08;
        drawGlow(x + PLAYER_W/2, y + PLAYER_H + 6, 24, PLAYER_GLOW, thrustPulse);

        // Sprite-based player rendering
        const pKey = playerSpriteKey();
        const pSprite = sprites[pKey];
        if (pSprite && allSpritesReady) {
            ctx.drawImage(pSprite, gx(x - 2), gy(y - 4), gs(PLAYER_W + 4), gs(PLAYER_H + 8));
            // Engine thrust — dual flame (still canvas for animation)
            for (const dir of [-1, 1]) {
                const thrustH = gs(5 + Math.random() * 8);
                const ex = cx + gs(dir * PLAYER_W * 0.08);
                const grad = ctx.createLinearGradient(ex, cy + gs(PLAYER_H * 0.5), ex, cy + gs(PLAYER_H * 0.5) + thrustH);
                grad.addColorStop(0, '#FFF');
                grad.addColorStop(0.2, '#FFE066');
                grad.addColorStop(0.5, PLAYER_GLOW);
                grad.addColorStop(1, 'transparent');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.moveTo(ex - gs(5), cy + gs(PLAYER_H * 0.48));
                ctx.lineTo(ex, cy + gs(PLAYER_H * 0.48) + thrustH);
                ctx.lineTo(ex + gs(5), cy + gs(PLAYER_H * 0.48));
                ctx.fill();
            }
            // Double-shot indicator
            if (activePowerup && activePowerup.type === 'double') {
                ctx.fillStyle = POWERUP_COLORS.double;
                ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.2) * 0.3;
                ctx.beginPath();
                ctx.arc(cx - gs(PLAYER_W * 0.3), cy - gs(4), gs(3), 0, Math.PI * 2);
                ctx.arc(cx + gs(PLAYER_W * 0.3), cy - gs(4), gs(3), 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
            ctx.restore();
            return;
        }

        // ── Canvas fallback below ──

        // Speed boost trail
        if (activePowerup && activePowerup.type === 'speed') {
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = POWERUP_COLORS.speed;
            for (let i = 1; i <= 4; i++) {
                ctx.beginPath();
                ctx.moveTo(cx, cy + gs(PLAYER_H * 0.5) + gs(i * 8));
                ctx.lineTo(cx - gs(6 + i * 2), cy + gs(PLAYER_H * 0.5) + gs(i * 8 + 6));
                ctx.lineTo(cx + gs(6 + i * 2), cy + gs(PLAYER_H * 0.5) + gs(i * 8 + 6));
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // Wing glow underlay
        const wingGlow = ctx.createRadialGradient(cx, cy + gs(4), gs(5), cx, cy + gs(4), gs(PLAYER_W * 0.6));
        wingGlow.addColorStop(0, 'transparent');
        wingGlow.addColorStop(0.5, 'transparent');
        wingGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = playerColor || PLAYER_COLOR;

        // Ship body — angular with swept wings
        ctx.beginPath();
        // Nose
        ctx.moveTo(cx, cy - gs(PLAYER_H * 0.55));
        // Right side
        ctx.lineTo(cx + gs(4), cy - gs(PLAYER_H * 0.3));
        ctx.lineTo(cx + gs(PLAYER_W * 0.18), cy - gs(PLAYER_H * 0.1));
        // Right wing tip
        ctx.lineTo(cx + gs(PLAYER_W * 0.52), cy + gs(PLAYER_H * 0.2));
        ctx.lineTo(cx + gs(PLAYER_W * 0.48), cy + gs(PLAYER_H * 0.35));
        // Right wing root
        ctx.lineTo(cx + gs(PLAYER_W * 0.2), cy + gs(PLAYER_H * 0.3));
        // Engine area
        ctx.lineTo(cx + gs(PLAYER_W * 0.15), cy + gs(PLAYER_H * 0.5));
        ctx.lineTo(cx - gs(PLAYER_W * 0.15), cy + gs(PLAYER_H * 0.5));
        // Left wing root
        ctx.lineTo(cx - gs(PLAYER_W * 0.2), cy + gs(PLAYER_H * 0.3));
        // Left wing tip
        ctx.lineTo(cx - gs(PLAYER_W * 0.48), cy + gs(PLAYER_H * 0.35));
        ctx.lineTo(cx - gs(PLAYER_W * 0.52), cy + gs(PLAYER_H * 0.2));
        // Left side
        ctx.lineTo(cx - gs(PLAYER_W * 0.18), cy - gs(PLAYER_H * 0.1));
        ctx.lineTo(cx - gs(4), cy - gs(PLAYER_H * 0.3));
        ctx.closePath();
        ctx.fill();

        // Wing panel lines
        ctx.strokeStyle = PLAYER_GLOW;
        ctx.lineWidth = gs(0.8);
        ctx.globalAlpha = 0.3;
        // Right wing line
        ctx.beginPath();
        ctx.moveTo(cx + gs(PLAYER_W * 0.15), cy + gs(2));
        ctx.lineTo(cx + gs(PLAYER_W * 0.45), cy + gs(PLAYER_H * 0.25));
        ctx.stroke();
        // Left wing line
        ctx.beginPath();
        ctx.moveTo(cx - gs(PLAYER_W * 0.15), cy + gs(2));
        ctx.lineTo(cx - gs(PLAYER_W * 0.45), cy + gs(PLAYER_H * 0.25));
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Cockpit — layered glass effect
        const cockpitGrad = ctx.createLinearGradient(cx, cy - gs(10), cx, cy + gs(4));
        cockpitGrad.addColorStop(0, '#FFFFFF');
        cockpitGrad.addColorStop(0.3, PLAYER_GLOW);
        cockpitGrad.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = cockpitGrad;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.ellipse(cx, cy - gs(4), gs(5), gs(9), 0, 0, Math.PI * 2);
        ctx.fill();
        // Cockpit reflection
        ctx.fillStyle = '#FFF';
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.ellipse(cx - gs(2), cy - gs(8), gs(2), gs(3), -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Wing tip lights
        const lightPulse = Math.sin(frameCount * 0.15) * 0.3 + 0.7;
        ctx.fillStyle = '#FF3333';
        ctx.globalAlpha = lightPulse;
        ctx.beginPath();
        ctx.arc(cx - gs(PLAYER_W * 0.5), cy + gs(PLAYER_H * 0.25), gs(2), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#33FF33';
        ctx.beginPath();
        ctx.arc(cx + gs(PLAYER_W * 0.5), cy + gs(PLAYER_H * 0.25), gs(2), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Engine thrust — dual flame with variation
        for (const dir of [-1, 1]) {
            const thrustH = gs(5 + Math.random() * 8);
            const ex = cx + gs(dir * PLAYER_W * 0.08);
            const grad = ctx.createLinearGradient(ex, cy + gs(PLAYER_H * 0.5), ex, cy + gs(PLAYER_H * 0.5) + thrustH);
            grad.addColorStop(0, '#FFF');
            grad.addColorStop(0.2, '#FFE066');
            grad.addColorStop(0.5, PLAYER_GLOW);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(ex - gs(5), cy + gs(PLAYER_H * 0.48));
            ctx.lineTo(ex, cy + gs(PLAYER_H * 0.48) + thrustH);
            ctx.lineTo(ex + gs(5), cy + gs(PLAYER_H * 0.48));
            ctx.fill();
        }

        // Double-shot indicator
        if (activePowerup && activePowerup.type === 'double') {
            ctx.fillStyle = POWERUP_COLORS.double;
            ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.2) * 0.3;
            ctx.beginPath();
            ctx.arc(cx - gs(PLAYER_W * 0.3), cy - gs(4), gs(3), 0, Math.PI * 2);
            ctx.arc(cx + gs(PLAYER_W * 0.3), cy - gs(4), gs(3), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    // ── UFO (sprite-based with canvas fallback) ──
    function drawUFO(u) {
        const cx = gx(u.x + UFO_W/2), cy = gy(u.y + UFO_H/2);
        ctx.save();
        drawGlow(u.x + UFO_W/2, u.y + UFO_H/2, UFO_W * 0.9, UFO_COLOR, 0.25 + Math.sin(frameCount * 0.15) * 0.1);

        // Sprite rendering
        const ufoSprite = sprites['ufo'];
        if (ufoSprite && allSpritesReady) {
            ctx.drawImage(ufoSprite, gx(u.x), gy(u.y - 4), gs(UFO_W), gs(UFO_H + 8));
            // Rotating lights overlay (still canvas for animation)
            for (let i = 0; i < 6; i++) {
                const angle = (frameCount * 0.05) + i * (Math.PI / 3);
                const lx = cx + Math.cos(angle) * gs(UFO_W * 0.38);
                const ly = cy + Math.sin(angle) * gs(UFO_H * 0.18);
                const pulse = Math.sin(frameCount * 0.2 + i * 1.2) * 0.5 + 0.5;
                ctx.fillStyle = i % 2 === 0 ? '#FFFF00' : '#00FFFF';
                ctx.globalAlpha = 0.5 + pulse * 0.5;
                ctx.beginPath();
                ctx.arc(lx, ly, gs(2.5), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.restore();
            return;
        }

        // ── Canvas fallback below ──
        // Beam below
        ctx.fillStyle = UFO_COLOR;
        ctx.globalAlpha = 0.05 + Math.sin(frameCount * 0.1) * 0.03;
        ctx.beginPath();
        ctx.moveTo(cx - gs(UFO_W * 0.2), cy + gs(UFO_H * 0.3));
        ctx.lineTo(cx - gs(UFO_W * 0.4), cy + gs(UFO_H * 2));
        ctx.lineTo(cx + gs(UFO_W * 0.4), cy + gs(UFO_H * 2));
        ctx.lineTo(cx + gs(UFO_W * 0.2), cy + gs(UFO_H * 0.3));
        ctx.fill();
        ctx.globalAlpha = 1;
        // Dome
        const domeGrad = ctx.createRadialGradient(cx - gs(5), cy - gs(8), 0, cx, cy - gs(4), gs(UFO_W * 0.22));
        domeGrad.addColorStop(0, '#FF8888');
        domeGrad.addColorStop(1, UFO_COLOR);
        ctx.fillStyle = domeGrad;
        ctx.beginPath();
        ctx.ellipse(cx, cy - gs(4), gs(UFO_W * 0.2), gs(UFO_H * 0.45), 0, Math.PI, 0);
        ctx.fill();
        // Body
        ctx.fillStyle = UFO_COLOR;
        ctx.beginPath();
        ctx.ellipse(cx, cy, gs(UFO_W * 0.5), gs(UFO_H * 0.3), 0, 0, Math.PI * 2);
        ctx.fill();
        // Body ring
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = gs(1);
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.ellipse(cx, cy + gs(1), gs(UFO_W * 0.45), gs(UFO_H * 0.15), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Lights — rotating
        for (let i = 0; i < 6; i++) {
            const angle = (frameCount * 0.05) + i * (Math.PI / 3);
            const lx = cx + Math.cos(angle) * gs(UFO_W * 0.38);
            const ly = cy + Math.sin(angle) * gs(UFO_H * 0.18);
            const pulse = Math.sin(frameCount * 0.2 + i * 1.2) * 0.5 + 0.5;
            ctx.fillStyle = i % 2 === 0 ? '#FFFF00' : '#00FFFF';
            ctx.globalAlpha = 0.5 + pulse * 0.5;
            ctx.beginPath();
            ctx.arc(lx, ly, gs(2.5), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // ── Shields (pixel grid destructible) ──
    function createShield(sx, sy) {
        const grid = [];
        const cols = 20, rows = 14;
        const cellW = SHIELD_W / cols, cellH = SHIELD_H / rows;
        for (let r = 0; r < rows; r++) {
            grid[r] = [];
            for (let c = 0; c < cols; c++) {
                // Shape: arch with flat top, notch at bottom center
                const inArch = (r < rows - 4 || c < 6 || c > 13);
                const inTop = r > 0 || (c > 2 && c < cols - 3);
                const inSides = c > 0 && c < cols - 1;
                const isRounded = !(r === 0 && (c < 3 || c > cols - 4));
                grid[r][c] = (inArch && inTop && inSides && isRounded) ? 1 : 0;
            }
        }
        return { x: sx, y: sy, grid, cols, rows, cellW, cellH };
    }

    function drawShield(s) {
        for (let r = 0; r < s.rows; r++) {
            for (let c = 0; c < s.cols; c++) {
                if (!s.grid[r][c]) continue;
                // Edge cells get darker shade for depth
                const hasTop = r > 0 && s.grid[r-1] && s.grid[r-1][c];
                const hasBot = r < s.rows - 1 && s.grid[r+1] && s.grid[r+1][c];
                const hasLeft = c > 0 && s.grid[r][c-1];
                const hasRight = c < s.cols - 1 && s.grid[r][c+1];
                const isEdge = !hasTop || !hasBot || !hasLeft || !hasRight;
                if (isEdge) {
                    ctx.fillStyle = SHIELD_COLOR;
                    ctx.globalAlpha = 0.9;
                } else {
                    ctx.fillStyle = SHIELD_COLOR;
                    ctx.globalAlpha = 0.55 + Math.random() * 0.15;
                }
                ctx.fillRect(
                    gx(s.x + c * s.cellW), gy(s.y + r * s.cellH),
                    gs(s.cellW) + 1, gs(s.cellH) + 1
                );
            }
        }
        ctx.globalAlpha = 1;
    }

    function damageShield(s, bx, by, radius) {
        let hit = false;
        const cr = radius || 3;
        for (let r = 0; r < s.rows; r++) {
            for (let c = 0; c < s.cols; c++) {
                if (!s.grid[r][c]) continue;
                const px = s.x + c * s.cellW + s.cellW/2;
                const py = s.y + r * s.cellH + s.cellH/2;
                if (Math.abs(bx - px) < cr * s.cellW && Math.abs(by - py) < cr * s.cellH) {
                    s.grid[r][c] = 0;
                    hit = true;
                    // Crumble particles
                    if (Math.random() < 0.4) {
                        particles.push({
                            x: px, y: py,
                            vx: (Math.random() - 0.5) * 2,
                            vy: Math.random() * 2,
                            life: 0.3 + Math.random() * 0.3,
                            maxLife: 0.6,
                            color: SHIELD_COLOR,
                            size: 1 + Math.random() * 2,
                        });
                    }
                }
            }
        }
        return hit;
    }

    // ── Particles ──
    function spawnExplosion(x, y, count, colors, sizeRange, debrisShape) {
        // Add sprite explosion if sprites are loaded
        if (allSpritesReady && EXPLOSION_FRAME_IDS.length > 0) {
            spriteExplosions.push({
                x, y, frame: 0, timer: 0,
                size: (sizeRange ? (sizeRange[1] || 24) : 24) * 2.5,
                totalFrames: EXPLOSION_FRAME_IDS.length,
                frameDur: 60 // ms per frame
            });
        }
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 4;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.5 + Math.random() * 0.8,
                maxLife: 0.5 + Math.random() * 0.8,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: (sizeRange?.[0] || 2) + Math.random() * ((sizeRange?.[1] || 5) - (sizeRange?.[0] || 2)),
                shape: debrisShape || 'square',
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.3,
            });
        }
    }

    // Alien-shaped debris explosion
    function spawnAlienDebris(x, y, row) {
        const color = ALIEN_COLORS[row];
        const glow = ALIEN_GLOW[row];
        // Debris chunks that match alien shape
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 3;
            particles.push({
                x: x + (Math.random() - 0.5) * ALIEN_W * 0.6,
                y: y + (Math.random() - 0.5) * ALIEN_H * 0.6,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1,
                life: 0.6 + Math.random() * 0.6,
                maxLife: 1.2,
                color: i % 3 === 0 ? glow : color,
                size: 2 + Math.random() * 4,
                shape: i % 2 === 0 ? 'triangle' : 'square',
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.4,
            });
        }
        // Inner flash
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 2;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.2 + Math.random() * 0.3,
                maxLife: 0.5,
                color: '#FFFFFF',
                size: 3 + Math.random() * 4,
                shape: 'circle',
                rotation: 0,
                rotSpeed: 0,
            });
        }
    }

    function spawnScorePopup(x, y, text) {
        scorePopups.push({ x, y, text, life: 1.2, maxLife: 1.2 });
    }

    // ── Stars (parallax background) ──
    function createStars() {
        stars = [];
        for (let i = 0; i < 200; i++) {
            stars.push({
                x: Math.random() * GAME_W,
                y: Math.random() * GAME_H,
                size: 0.5 + Math.random() * 2,
                brightness: 0.2 + Math.random() * 0.8,
                twinkleSpeed: 0.01 + Math.random() * 0.03,
            });
        }
    }

    function drawStars() {
        const starColors = ['#E0E7FF', '#A5B4FC', '#C8D6E5', '#F9D5BB', '#D4DBFF'];
        for (const s of stars) {
            const b = s.brightness * (0.7 + Math.sin(frameCount * s.twinkleSpeed) * 0.3);
            const col = starColors[Math.floor(s.x + s.y) % starColors.length];
            ctx.globalAlpha = b;
            if (s.size > 1.5) {
                // Bright stars get a soft glow halo
                const sg = ctx.createRadialGradient(gx(s.x), gy(s.y), 0, gx(s.x), gy(s.y), gs(s.size * 3));
                sg.addColorStop(0, col);
                sg.addColorStop(0.4, col.replace('FF', '66'));
                sg.addColorStop(1, 'transparent');
                ctx.fillStyle = sg;
                ctx.fillRect(gx(s.x) - gs(s.size * 3), gy(s.y) - gs(s.size * 3), gs(s.size * 6), gs(s.size * 6));
                // Cross spikes on brightest stars
                if (b > 0.8) {
                    ctx.strokeStyle = col;
                    ctx.lineWidth = gs(0.5);
                    ctx.globalAlpha = (b - 0.8) * 3;
                    const sp = gs(s.size * 4);
                    ctx.beginPath();
                    ctx.moveTo(gx(s.x) - sp, gy(s.y)); ctx.lineTo(gx(s.x) + sp, gy(s.y));
                    ctx.moveTo(gx(s.x), gy(s.y) - sp); ctx.lineTo(gx(s.x), gy(s.y) + sp);
                    ctx.stroke();
                    ctx.globalAlpha = b;
                }
            }
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(gx(s.x), gy(s.y), gs(s.size * 0.5), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ═══════════════════════════════════════════
    //  POWER-UP SYSTEM
    // ═══════════════════════════════════════════
    function spawnPowerup(x, y) {
        const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
        powerups.push({ x: x - POWERUP_W/2, y, type, bobPhase: Math.random() * Math.PI * 2 });
    }

    function drawPowerup(pu) {
        const cx = gx(pu.x + POWERUP_W/2);
        const cy = gy(pu.y + POWERUP_H/2);
        const bob = Math.sin(frameCount * 0.08 + pu.bobPhase) * gs(3);
        const col = POWERUP_COLORS[pu.type];

        ctx.save();
        // Glow
        drawGlow(pu.x + POWERUP_W/2, pu.y + POWERUP_H/2, POWERUP_W, col, 0.25);

        // Sprite rendering
        const puKeyMap = { speed: 'puSpeed', double: 'puDouble', repair: 'puRepair' };
        const puSprite = sprites[puKeyMap[pu.type]];
        if (puSprite && allSpritesReady) {
            ctx.drawImage(puSprite, cx - gs(POWERUP_W/2), cy - gs(POWERUP_H/2) + bob, gs(POWERUP_W), gs(POWERUP_H));
            ctx.restore();
            return;
        }

        // ── Canvas fallback below ──

        // Outer ring
        ctx.strokeStyle = col;
        ctx.lineWidth = gs(2);
        ctx.beginPath();
        ctx.arc(cx, cy + bob, gs(POWERUP_W * 0.4), 0, Math.PI * 2);
        ctx.stroke();

        // Inner icon
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.9;
        if (pu.type === 'speed') {
            // Lightning bolt
            ctx.beginPath();
            ctx.moveTo(cx + gs(2), cy + bob - gs(8));
            ctx.lineTo(cx - gs(3), cy + bob);
            ctx.lineTo(cx + gs(1), cy + bob);
            ctx.lineTo(cx - gs(2), cy + bob + gs(8));
            ctx.lineTo(cx + gs(3), cy + bob);
            ctx.lineTo(cx - gs(1), cy + bob);
            ctx.closePath();
            ctx.fill();
        } else if (pu.type === 'double') {
            // Double arrows
            ctx.beginPath();
            ctx.moveTo(cx - gs(4), cy + bob - gs(5));
            ctx.lineTo(cx - gs(4), cy + bob + gs(5));
            ctx.lineTo(cx - gs(1), cy + bob + gs(2));
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(cx + gs(4), cy + bob - gs(5));
            ctx.lineTo(cx + gs(4), cy + bob + gs(5));
            ctx.lineTo(cx + gs(1), cy + bob + gs(2));
            ctx.fill();
        } else if (pu.type === 'repair') {
            // Plus/cross
            ctx.fillRect(cx - gs(1.5), cy + bob - gs(6), gs(3), gs(12));
            ctx.fillRect(cx - gs(6), cy + bob - gs(1.5), gs(12), gs(3));
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function activatePowerup(type) {
        SND.powerup();
        if (type === 'repair') {
            // Repair shields — restore ~30% of destroyed cells
            for (const s of shields) {
                for (let r = 0; r < s.rows; r++) {
                    for (let c = 0; c < s.cols; c++) {
                        if (s.grid[r][c] === 0) {
                            // Check if it should be part of the shield shape
                            const inArch = (r < s.rows - 4 || c < 6 || c > 13);
                            const inTop = r > 0 || (c > 2 && c < s.cols - 3);
                            const inSides = c > 0 && c < s.cols - 1;
                            if (inArch && inTop && inSides && Math.random() < 0.3) {
                                s.grid[r][c] = 1;
                            }
                        }
                    }
                }
            }
            spawnScorePopup(GAME_W / 2, GAME_H / 2, 'SHIELDS REPAIRED!');
        } else {
            activePowerup = { type, timer: POWERUP_DURATION };
            const label = type === 'speed' ? 'SPEED BOOST!' : 'DOUBLE SHOT!';
            spawnScorePopup(GAME_W / 2, GAME_H / 2, label);
        }
    }

    // ═══════════════════════════════════════════
    //  BOSS SYSTEM
    // ═══════════════════════════════════════════
    function isBossWave() {
        return level % BOSS_EVERY === 0;
    }

    function createBoss() {
        const encounter = Math.floor(level / BOSS_EVERY);
        const hp = BOSS_HP_BASE + encounter * BOSS_HP_SCALE;
        boss = {
            x: GAME_W / 2 - BOSS_W / 2,
            y: 60,
            hp,
            maxHp: hp,
            vx: 1.5 + encounter * 0.3,
            fireTimer: BOSS_FIRE_INTERVAL,
            phase: 0,
            hitFlash: 0,
        };
        bossBullets = [];
    }

    function drawBoss() {
        if (!boss) return;
        const cx = gx(boss.x + BOSS_W/2), cy = gy(boss.y + BOSS_H/2);
        ctx.save();

        // Pulsing aura
        drawGlow(boss.x + BOSS_W/2, boss.y + BOSS_H/2, BOSS_W, BOSS_GLOW, 0.15 + Math.sin(frameCount * 0.05) * 0.05);

        // Hit flash
        if (boss.hitFlash > 0) {
            ctx.fillStyle = '#FFF';
            ctx.globalAlpha = boss.hitFlash;
            ctx.beginPath();
            ctx.ellipse(cx, cy, gs(BOSS_W * 0.55), gs(BOSS_H * 0.5), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Sprite rendering
        const bossSprite = sprites['boss'];
        if (bossSprite && allSpritesReady) {
            ctx.drawImage(bossSprite, gx(boss.x), gy(boss.y), gs(BOSS_W), gs(BOSS_H));
            // HP bar
            const barW = BOSS_W * 1.2;
            const barH = 8;
            const barX = boss.x + BOSS_W/2 - barW/2;
            const barY = boss.y - 20;
            const hpPct = boss.hp / boss.maxHp;
            ctx.fillStyle = '#333';
            ctx.fillRect(gx(barX), gy(barY), gs(barW), gs(barH));
            const hpColor = hpPct > 0.5 ? '#22C55E' : hpPct > 0.25 ? '#F59E0B' : '#EF4444';
            ctx.fillStyle = hpColor;
            ctx.fillRect(gx(barX), gy(barY), gs(barW * hpPct), gs(barH));
            ctx.strokeStyle = '#FFF'; ctx.lineWidth = gs(1);
            ctx.strokeRect(gx(barX), gy(barY), gs(barW), gs(barH));
            ctx.fillStyle = '#FFF'; ctx.font = `bold ${gs(10)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(`${boss.hp}/${boss.maxHp}`, gx(boss.x + BOSS_W/2), gy(barY - 4));
            ctx.restore();
            return;
        }

        // ── Canvas fallback below ──
        // Main body — large armored alien
        ctx.fillStyle = BOSS_COLOR;
        ctx.beginPath();
        // Helmet/head
        ctx.moveTo(cx, cy - gs(BOSS_H * 0.48));
        ctx.bezierCurveTo(cx + gs(BOSS_W * 0.45), cy - gs(BOSS_H * 0.4), cx + gs(BOSS_W * 0.5), cy + gs(BOSS_H * 0.1), cx + gs(BOSS_W * 0.35), cy + gs(BOSS_H * 0.35));
        ctx.lineTo(cx + gs(BOSS_W * 0.15), cy + gs(BOSS_H * 0.48));
        ctx.lineTo(cx - gs(BOSS_W * 0.15), cy + gs(BOSS_H * 0.48));
        ctx.lineTo(cx - gs(BOSS_W * 0.35), cy + gs(BOSS_H * 0.35));
        ctx.bezierCurveTo(cx - gs(BOSS_W * 0.5), cy + gs(BOSS_H * 0.1), cx - gs(BOSS_W * 0.45), cy - gs(BOSS_H * 0.4), cx, cy - gs(BOSS_H * 0.48));
        ctx.fill();

        // Inner armor plates
        ctx.strokeStyle = BOSS_GLOW;
        ctx.lineWidth = gs(1.5);
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.ellipse(cx, cy - gs(5), gs(BOSS_W * 0.25), gs(BOSS_H * 0.25), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Eyes — three menacing
        ctx.fillStyle = '#FF0000';
        const eyePulse = 0.7 + Math.sin(frameCount * 0.1) * 0.3;
        ctx.globalAlpha = eyePulse;
        ctx.beginPath();
        ctx.arc(cx - gs(18), cy - gs(10), gs(6), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + gs(18), cy - gs(10), gs(6), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy - gs(18), gs(4), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Eye pupils
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(cx - gs(18), cy - gs(10), gs(3), 0, Math.PI * 2);
        ctx.arc(cx + gs(18), cy - gs(10), gs(3), 0, Math.PI * 2);
        ctx.arc(cx, cy - gs(18), gs(2), 0, Math.PI * 2);
        ctx.fill();

        // Tentacles / appendages
        ctx.strokeStyle = BOSS_COLOR;
        ctx.lineWidth = gs(4);
        ctx.lineCap = 'round';
        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < 3; i++) {
                const wave = Math.sin(frameCount * 0.06 + i * 1.5 + side) * 10;
                ctx.beginPath();
                ctx.moveTo(cx + gs(side * BOSS_W * 0.3), cy + gs(BOSS_H * 0.2 + i * 8));
                ctx.quadraticCurveTo(
                    cx + gs(side * (BOSS_W * 0.45 + wave)), cy + gs(BOSS_H * 0.3 + i * 8),
                    cx + gs(side * (BOSS_W * 0.4 + wave * 0.5)), cy + gs(BOSS_H * 0.45 + i * 5)
                );
                ctx.stroke();
            }
        }

        // HP bar
        const barW = BOSS_W * 1.2;
        const barH = 8;
        const barX = boss.x + BOSS_W/2 - barW/2;
        const barY = boss.y - 20;
        const hpPct = boss.hp / boss.maxHp;
        // Background
        ctx.fillStyle = '#333';
        ctx.fillRect(gx(barX), gy(barY), gs(barW), gs(barH));
        // HP fill
        const hpColor = hpPct > 0.5 ? '#22C55E' : hpPct > 0.25 ? '#F59E0B' : '#EF4444';
        ctx.fillStyle = hpColor;
        ctx.fillRect(gx(barX), gy(barY), gs(barW * hpPct), gs(barH));
        // Border
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = gs(1);
        ctx.strokeRect(gx(barX), gy(barY), gs(barW), gs(barH));
        // HP text
        ctx.fillStyle = '#FFF';
        ctx.font = `bold ${gs(10)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`${boss.hp}/${boss.maxHp}`, gx(boss.x + BOSS_W/2), gy(barY - 4));

        ctx.restore();
    }

    function updateBoss(dt) {
        if (!boss) return;

        // Movement — bounce side to side
        boss.x += boss.vx;
        if (boss.x < 40 || boss.x + BOSS_W > GAME_W - 40) {
            boss.vx *= -1;
            boss.x = Math.max(40, Math.min(GAME_W - 40 - BOSS_W, boss.x));
        }

        // Phase movement — slight vertical bob
        boss.phase += dt * 0.002;
        boss.y = 60 + Math.sin(boss.phase) * 20;

        // Hit flash decay
        if (boss.hitFlash > 0) boss.hitFlash -= dt * 0.003;

        // Firing — spread shots
        boss.fireTimer -= dt;
        if (boss.fireTimer <= 0) {
            boss.fireTimer = Math.max(600, BOSS_FIRE_INTERVAL - (level * 20));
            const bx = boss.x + BOSS_W / 2;
            const by = boss.y + BOSS_H;
            // Spread shot: 3-5 bullets in a fan
            const spreadCount = boss.hp < boss.maxHp * 0.5 ? 5 : 3;
            const spreadAngle = Math.PI * 0.4;
            for (let i = 0; i < spreadCount; i++) {
                const angle = Math.PI / 2 - spreadAngle / 2 + (spreadAngle / (spreadCount - 1)) * i;
                const speed = 3 + level * 0.15;
                bossBullets.push({
                    x: bx - 2,
                    y: by,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                });
            }
            playTone(200, 0.12, 'sawtooth', 0.06, 100);
        }

        // Update boss bullets
        for (let i = bossBullets.length - 1; i >= 0; i--) {
            const b = bossBullets[i];
            b.x += b.vx;
            b.y += b.vy;
            if (b.y > GAME_H + 20 || b.x < -20 || b.x > GAME_W + 20) {
                bossBullets.splice(i, 1);
            }
        }
    }

    function checkBossCollisions() {
        if (!boss) return;

        // Player bullets → boss
        for (let i = playerBullets.length - 1; i >= 0; i--) {
            const b = playerBullets[i];
            if (rectsOverlap(b.x, b.y, BULLET_W, BULLET_H, boss.x, boss.y, BOSS_W, BOSS_H)) {
                playerBullets.splice(i, 1);
                boss.hp--;
                boss.hitFlash = 1;
                SND.bossHit();
                screenShake = 3;
                spawnExplosion(b.x, b.y, 5, [BOSS_GLOW, '#FFF'], [1, 3]);

                if (boss.hp <= 0) {
                    // Boss defeated
                    const pts = 500 + Math.floor(level / BOSS_EVERY) * 250;
                    score += pts;
                    spawnExplosion(boss.x + BOSS_W/2, boss.y + BOSS_H/2, 60, [BOSS_COLOR, BOSS_GLOW, '#FFF', '#FBBF24', '#F43F5E'], [4, 12]);
                    spawnScorePopup(boss.x + BOSS_W/2, boss.y, `+${pts}`);
                    SND.bossDie();
                    screenShake = 15;
                    boss = null;
                    bossBullets = [];
                    waveFlashTimer = WAVE_FLASH_MS;
                    SND.waveFlash();
                    // Advance level
                    level++;
                    setTimeout(() => startLevel(), 1500);
                    checkBonusLife();
                    return;
                }
            }
        }

        // Boss bullets → player
        for (let i = bossBullets.length - 1; i >= 0; i--) {
            const b = bossBullets[i];
            if (rectsOverlap(b.x - 3, b.y - 3, 6, 6, playerX, GAME_H - 60, PLAYER_W, PLAYER_H)) {
                bossBullets.splice(i, 1);
                playerDeath();
                return;
            }
            // Boss bullets → shields
            for (const s of shields) {
                if (rectsOverlap(b.x - 3, b.y - 3, 6, 6, s.x, s.y, SHIELD_W, SHIELD_H)) {
                    if (damageShield(s, b.x, b.y, 2)) {
                        bossBullets.splice(i, 1);
                        break;
                    }
                }
            }
        }
    }

    // ═══════════════════════════════════════════
    //  GAME LOGIC
    // ═══════════════════════════════════════════
    function resetAliens() {
        aliens = [];
        const totalW = COLS * (ALIEN_W + ALIEN_PAD_X) - ALIEN_PAD_X;
        const startX = (GAME_W - totalW) / 2;
        const startY = 80 + Math.min(level - 1, 8) * 8; // creep lower each level

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                aliens.push({
                    x: startX + c * (ALIEN_W + ALIEN_PAD_X),
                    y: startY + r * (ALIEN_H + ALIEN_PAD_Y),
                    row: r, col: c,
                    alive: true,
                    frame: 0,
                });
            }
        }
        alienDir = 1;
        alienStepMs = Math.max(MIN_STEP_MS, INITIAL_STEP_MS - (level - 1) * 50);
        alienStepTimer = alienStepMs;
        alienDropNext = false;
        alienFireTimer = ALIEN_FIRE_INTERVAL;
    }

    function resetShields() {
        shields = [];
        const spacing = GAME_W / (SHIELD_COUNT + 1);
        for (let i = 0; i < SHIELD_COUNT; i++) {
            shields.push(createShield(spacing * (i + 1) - SHIELD_W / 2, GAME_H - 180));
        }
    }

    function startLevel() {
        if (isBossWave()) {
            // Boss wave — no regular aliens
            aliens = [];
            createBoss();
        } else {
            resetAliens();
            boss = null;
            bossBullets = [];
        }
        resetShields();
        playerBullets = [];
        alienBullets = [];
        powerups = [];
        ufo = null;
        ufoTimer = rand(UFO_INTERVAL_MIN, UFO_INTERVAL_MAX);
        particles = [];
        scorePopups = [];
        state = ST_LEVEL_SPLASH;
        levelSplashTimer = LEVEL_SPLASH_MS;
        SND.levelUp();
    }

    function startGame() {
        score = 0;
        level = 1;
        lives = INITIAL_LIVES;
        nextBonusAt = BONUS_LIFE_SCORE;
        playerX = GAME_W / 2 - PLAYER_W / 2;
        startTime = Date.now();
        activePowerup = null;
        powerups = [];
        boss = null;
        bossBullets = [];
        waveFlashTimer = 0;
        createStars();
        startLevel();
    }

    // ── Alien step logic (speed scales with fewer aliens) ──
    function stepAliens(dt) {
        alienStepTimer -= dt;
        if (alienStepTimer > 0) return;

        const alive = aliens.filter(a => a.alive);
        if (alive.length === 0) return;

        // Recalc step speed — gets dramatically faster with fewer aliens
        const total = COLS * ROWS;
        const pct = alive.length / total;
        // Exponential curve: last few aliens are very fast
        const speedFactor = Math.pow(pct, 1.5);
        alienStepMs = Math.max(MIN_STEP_MS, INITIAL_STEP_MS * speedFactor - (level - 1) * 30);
        alienStepTimer = alienStepMs;

        // Toggle animation frame
        for (const a of alive) a.frame = 1 - a.frame;

        if (alienDropNext) {
            // Drop down
            for (const a of alive) a.y += ALIEN_H * 0.6;
            alienDir *= -1;
            alienDropNext = false;
            SND.step(frameCount);
        } else {
            // Move horizontally — wider steps when fewer remain
            const stepX = 8 + (1 - pct) * 20;
            let hitEdge = false;
            for (const a of alive) {
                a.x += alienDir * stepX;
                if (a.x < 20 || a.x + ALIEN_W > GAME_W - 20) hitEdge = true;
            }
            if (hitEdge) alienDropNext = true;
            SND.step(frameCount);
        }
    }

    // ── Alien firing ──
    function alienShoot(dt) {
        alienFireTimer -= dt;
        if (alienFireTimer > 0) return;
        alienFireTimer = Math.max(300, ALIEN_FIRE_INTERVAL - level * 60);

        // Find lowest alive alien in each column, pick one at random
        const lowest = {};
        for (const a of aliens) {
            if (!a.alive) continue;
            if (!lowest[a.col] || a.y > lowest[a.col].y) lowest[a.col] = a;
        }
        const shooters = Object.values(lowest);
        if (shooters.length === 0) return;
        const shooter = shooters[Math.floor(Math.random() * shooters.length)];

        alienBullets.push({
            x: shooter.x + ALIEN_W / 2 - 2,
            y: shooter.y + ALIEN_H,
            vy: 3.5 + level * 0.3,
        });
    }

    // ── UFO logic ──
    function updateUFO(dt) {
        if (boss) return; // No UFO during boss wave
        if (ufo) {
            ufo.x += ufo.vx * dt / 16;
            if (ufo.x < -UFO_W || ufo.x > GAME_W + UFO_W) ufo = null;
            if (ufo && frameCount % 8 === 0) SND.ufo();
        } else {
            ufoTimer -= dt;
            if (ufoTimer <= 0) {
                const fromLeft = Math.random() > 0.5;
                ufo = {
                    x: fromLeft ? -UFO_W : GAME_W,
                    y: 30,
                    vx: fromLeft ? 2.5 : -2.5,
                    score: UFO_SCORES[Math.floor(Math.random() * UFO_SCORES.length)],
                };
                ufoTimer = rand(UFO_INTERVAL_MIN, UFO_INTERVAL_MAX);
            }
        }
    }

    // ── Collision ──
    function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function updateCollisions() {
        // Player bullets → aliens
        for (let bi = playerBullets.length - 1; bi >= 0; bi--) {
            const b = playerBullets[bi];
            let bulletHit = false;
            for (const a of aliens) {
                if (!a.alive) continue;
                if (rectsOverlap(b.x, b.y, BULLET_W, BULLET_H, a.x, a.y, ALIEN_W, ALIEN_H)) {
                    a.alive = false;
                    const pts = ALIEN_SCORES[a.row] || 10;
                    score += pts;
                    spawnAlienDebris(a.x + ALIEN_W/2, a.y + ALIEN_H/2, a.row);
                    spawnScorePopup(a.x + ALIEN_W/2, a.y, `+${pts}`);
                    SND.hit();
                    playerBullets.splice(bi, 1);
                    bulletHit = true;
                    screenShake = 4;
                    checkBonusLife();

                    // Power-up drop chance
                    if (Math.random() < POWERUP_CHANCE) {
                        spawnPowerup(a.x + ALIEN_W/2, a.y + ALIEN_H);
                    }

                    // All dead? → wave clear flash + next level
                    if (!aliens.some(a2 => a2.alive)) {
                        waveFlashTimer = WAVE_FLASH_MS;
                        SND.waveFlash();
                        level++;
                        setTimeout(() => startLevel(), 800);
                    }
                    break;
                }
            }
            if (bulletHit) continue;

            // Player bullets → UFO
            if (ufo && rectsOverlap(b.x, b.y, BULLET_W, BULLET_H, ufo.x, ufo.y, UFO_W, UFO_H)) {
                score += ufo.score;
                spawnExplosion(ufo.x + UFO_W/2, ufo.y + UFO_H/2, 30, [UFO_COLOR, '#FFF', '#FBBF24'], [3, 8]);
                spawnScorePopup(ufo.x + UFO_W/2, ufo.y, `+${ufo.score}`);
                SND.ufoHit();
                screenShake = 6;
                ufo = null;
                playerBullets.splice(bi, 1);
                checkBonusLife();
                continue;
            }

            // Player bullets → shields
            for (const s of shields) {
                if (rectsOverlap(b.x, b.y, BULLET_W, BULLET_H, s.x, s.y, SHIELD_W, SHIELD_H)) {
                    if (damageShield(s, b.x + BULLET_W/2, b.y, 1.5)) {
                        playerBullets.splice(bi, 1);
                        bulletHit = true;
                        break;
                    }
                }
            }
        }

        // Alien bullets → player
        for (let i = alienBullets.length - 1; i >= 0; i--) {
            const b = alienBullets[i];
            if (rectsOverlap(b.x, b.y, BULLET_W, BULLET_H, playerX, GAME_H - 60, PLAYER_W, PLAYER_H)) {
                alienBullets.splice(i, 1);
                playerDeath();
                return;
            }
            // Alien bullets → shields
            for (const s of shields) {
                if (rectsOverlap(b.x, b.y, BULLET_W, BULLET_H, s.x, s.y, SHIELD_W, SHIELD_H)) {
                    if (damageShield(s, b.x + BULLET_W/2, b.y + BULLET_H, 1.5)) {
                        alienBullets.splice(i, 1);
                        break;
                    }
                }
            }
        }

        // Aliens reaching shields — destroy shield cells on contact
        for (const a of aliens) {
            if (!a.alive) continue;
            for (const s of shields) {
                if (rectsOverlap(a.x, a.y, ALIEN_W, ALIEN_H, s.x, s.y, SHIELD_W, SHIELD_H)) {
                    damageShield(s, a.x + ALIEN_W/2, a.y + ALIEN_H, 3);
                }
            }
            // Aliens reach player level → game over
            if (a.y + ALIEN_H >= GAME_H - 60) {
                state = ST_GAMEOVER;
                SND.die();
                if (score > highScore) { highScore = score; try { localStorage.setItem('ywa_spaceinvaders_hi', String(highScore)); } catch {} }
            }
        }

        // Power-ups → player
        for (let i = powerups.length - 1; i >= 0; i--) {
            const pu = powerups[i];
            if (rectsOverlap(pu.x, pu.y, POWERUP_W, POWERUP_H, playerX, GAME_H - 60, PLAYER_W, PLAYER_H)) {
                activatePowerup(pu.type);
                powerups.splice(i, 1);
            }
        }
    }

    function checkBonusLife() {
        if (score >= nextBonusAt) {
            lives++;
            nextBonusAt += BONUS_LIFE_SCORE;
            SND.bonusLife();
            spawnScorePopup(GAME_W / 2, GAME_H / 2, '1UP!');
        }
    }

    function playerDeath() {
        lives--;
        spawnExplosion(playerX + PLAYER_W/2, GAME_H - 44, 40, EXPLOSION_COLORS, [3, 10]);
        SND.die();
        screenShake = 10;
        activePowerup = null;
        if (lives <= 0) {
            state = ST_GAMEOVER;
            if (score > highScore) { highScore = score; try { localStorage.setItem('ywa_spaceinvaders_hi', String(highScore)); } catch {} }
        } else {
            state = ST_DYING;
            deathTimer = DEATH_ANIM_MS;
        }
    }

    // ═══════════════════════════════════════════
    //  UPDATE
    // ═══════════════════════════════════════════
    function update(dt) {
        frameCount++;
        if (screenShake > 0) screenShake *= 0.85;
        if (screenShake < 0.5) screenShake = 0;

        // Wave flash timer
        if (waveFlashTimer > 0) waveFlashTimer -= dt;

        // Power-up timer
        if (activePowerup) {
            activePowerup.timer -= dt;
            if (activePowerup.timer <= 0) activePowerup = null;
        }

        // Update sprite explosions
        for (let i = spriteExplosions.length - 1; i >= 0; i--) {
            const se = spriteExplosions[i];
            se.timer += dt;
            if (se.timer >= se.frameDur) {
                se.timer -= se.frameDur;
                se.frame++;
                if (se.frame >= se.totalFrames) spriteExplosions.splice(i, 1);
            }
        }

        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.05;
            if (p.rotation !== undefined) p.rotation += p.rotSpeed || 0;
            p.life -= dt / 1000;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const p = scorePopups[i];
            p.y -= 0.8;
            p.life -= dt / 1000;
            if (p.life <= 0) scorePopups.splice(i, 1);
        }

        // Update falling power-ups
        if (powerups) {
            for (let i = powerups.length - 1; i >= 0; i--) {
                powerups[i].y += POWERUP_FALL_SPEED;
                if (powerups[i].y > GAME_H + 30) powerups.splice(i, 1);
            }
        }

        if (state === ST_TITLE) return;

        if (state === ST_LEVEL_SPLASH) {
            levelSplashTimer -= dt;
            if (levelSplashTimer <= 0) {
                state = boss ? ST_BOSS : ST_PLAYING;
            }
            return;
        }

        if (state === ST_DYING) {
            deathTimer -= dt;
            if (deathTimer <= 0) {
                playerX = GAME_W / 2 - PLAYER_W / 2;
                state = boss ? ST_BOSS : ST_PLAYING;
            }
            return;
        }

        if (state === ST_GAMEOVER) return;

        // ── Playing / Boss state ──
        const baseSpeed = 5;
        const speed = activePowerup && activePowerup.type === 'speed' ? baseSpeed * 1.6 : baseSpeed;
        if (keys['ArrowLeft'] || keys['a'] || keys['A'] || touchLeft) {
            playerX = Math.max(10, playerX - speed);
        }
        if (keys['ArrowRight'] || keys['d'] || keys['D'] || touchRight) {
            playerX = Math.min(GAME_W - PLAYER_W - 10, playerX + speed);
        }

        const isDoubleShot = activePowerup && activePowerup.type === 'double';
        const maxBullets = isDoubleShot ? 2 : 1;
        if ((keys[' '] || keys['ArrowUp'] || touchFire) && playerBullets.length < maxBullets && Date.now() - lastFireTime > (isDoubleShot ? FIRE_COOLDOWN * 0.6 : FIRE_COOLDOWN)) {
            if (isDoubleShot) {
                playerBullets.push({ x: playerX + PLAYER_W * 0.2 - BULLET_W / 2, y: GAME_H - 65 });
                playerBullets.push({ x: playerX + PLAYER_W * 0.8 - BULLET_W / 2, y: GAME_H - 65 });
            } else {
                playerBullets.push({ x: playerX + PLAYER_W / 2 - BULLET_W / 2, y: GAME_H - 65 });
            }
            lastFireTime = Date.now();
            SND.shoot();
        }

        // Player bullets movement
        for (let i = playerBullets.length - 1; i >= 0; i--) {
            playerBullets[i].y -= 8;
            if (playerBullets[i].y < -BULLET_H) playerBullets.splice(i, 1);
        }

        // Alien bullets
        for (let i = alienBullets.length - 1; i >= 0; i--) {
            alienBullets[i].y += alienBullets[i].vy;
            if (alienBullets[i].y > GAME_H + 20) alienBullets.splice(i, 1);
        }

        if (state === ST_BOSS) {
            updateBoss(dt);
            checkBossCollisions();
            updateUFO(dt);
        } else {
            stepAliens(dt);
            alienShoot(dt);
            updateUFO(dt);
            updateCollisions();
        }
    }

    // ═══════════════════════════════════════════
    //  DRAW
    // ═══════════════════════════════════════════
    function draw() {
        ctx.save();

        // Screen shake
        if (screenShake > 0) {
            ctx.translate(
                (Math.random() - 0.5) * screenShake * SCALE,
                (Math.random() - 0.5) * screenShake * SCALE
            );
        }

        // Background — deep space with multiple gradient layers
        if (!bgGradient) {
            bgGradient = ctx.createLinearGradient(0, 0, 0, H);
            bgGradient.addColorStop(0, '#030308');
            bgGradient.addColorStop(0.3, '#04040e');
            bgGradient.addColorStop(0.6, '#030310');
            bgGradient.addColorStop(0.85, '#050308');
            bgGradient.addColorStop(1, '#020204');
        }
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, W, H);
        // Subtle nebula wash
        const nPulse = 0.5 + 0.2 * Math.sin(frameCount * 0.003);
        const nebG = ctx.createRadialGradient(W * 0.3, H * 0.4, 0, W * 0.3, H * 0.4, W * 0.5);
        nebG.addColorStop(0, `rgba(60,20,80,${0.04 * nPulse})`);
        nebG.addColorStop(0.5, `rgba(20,10,60,${0.03 * nPulse})`);
        nebG.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = nebG;
        ctx.fillRect(0, 0, W, H);

        // Loading screen
        if (state === ST_LOADING) {
            drawLoadingScreen();
            ctx.restore();
            return;
        }

        drawStars();

        // Wave clear flash overlay
        if (waveFlashTimer > 0) {
            const flashAlpha = (waveFlashTimer / WAVE_FLASH_MS) * 0.6;
            ctx.fillStyle = '#FFF';
            ctx.globalAlpha = flashAlpha;
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
        }

        if (state === ST_TITLE) {
            drawTitle();
            ctx.restore();
            return;
        }

        // Shields
        for (const s of shields) drawShield(s);

        // Aliens with glow halos
        for (const a of aliens) {
            if (!a.alive) continue;
            // Subtle under-glow halo per alien
            const glowCol = ALIEN_GLOW[a.row];
            const haloAlpha = 0.08 + 0.04 * Math.sin(frameCount * 0.06 + a.x * 0.1);
            const hg = ctx.createRadialGradient(gx(a.x + ALIEN_W/2), gy(a.y + ALIEN_H/2), 0, gx(a.x + ALIEN_W/2), gy(a.y + ALIEN_H/2), gs(ALIEN_W * 1.2));
            hg.addColorStop(0, glowCol);
            hg.addColorStop(1, 'transparent');
            ctx.globalAlpha = haloAlpha;
            ctx.fillStyle = hg;
            ctx.fillRect(gx(a.x + ALIEN_W/2) - gs(ALIEN_W * 1.2), gy(a.y + ALIEN_H/2) - gs(ALIEN_W * 1.2), gs(ALIEN_W * 2.4), gs(ALIEN_W * 2.4));
            ctx.globalAlpha = 1;
            ALIEN_DRAW[a.row](a.x, a.y, ALIEN_W, ALIEN_H, ALIEN_COLORS[a.row], glowCol, a.frame);
        }

        // Boss
        if (boss) drawBoss();

        // UFO
        if (ufo) drawUFO(ufo);

        // Power-ups
        if (powerups) {
            for (const pu of powerups) drawPowerup(pu);
        }

        // Player
        if (state !== ST_DYING) {
            drawPlayer(playerX, GAME_H - 60);
        }

        // Player bullets (sprite laser or canvas fallback) with gradient trails
        for (const b of playerBullets) {
            drawGlow(b.x + BULLET_W/2, b.y + BULLET_H/2, 10, BULLET_COLOR, 0.35);
            const laserS = sprites['laserBlue'];
            if (laserS && allSpritesReady) {
                ctx.drawImage(laserS, gx(b.x - 2), gy(b.y - 2), gs(BULLET_W + 4), gs(BULLET_H + 4));
            } else {
                ctx.fillStyle = BULLET_COLOR;
                ctx.fillRect(gx(b.x), gy(b.y), gs(BULLET_W), gs(BULLET_H));
            }
            // Gradient bullet trail
            const trailGrad = ctx.createLinearGradient(gx(b.x + BULLET_W/2), gy(b.y + BULLET_H), gx(b.x + BULLET_W/2), gy(b.y + BULLET_H + 20));
            trailGrad.addColorStop(0, 'rgba(56,189,248,0.25)');
            trailGrad.addColorStop(0.5, 'rgba(56,189,248,0.08)');
            trailGrad.addColorStop(1, 'rgba(56,189,248,0)');
            ctx.fillStyle = trailGrad;
            ctx.fillRect(gx(b.x), gy(b.y + BULLET_H), gs(BULLET_W), gs(20));
        }

        // Alien bullets (sprite laser or canvas fallback)
        for (const b of alienBullets) {
            drawGlow(b.x + 2, b.y + 8, 6, '#F43F5E', 0.2);
            const aLaser = sprites['laserRed'];
            if (aLaser && allSpritesReady) {
                ctx.drawImage(aLaser, gx(b.x - 2), gy(b.y), gs(8), gs(18));
            } else {
                ctx.fillStyle = '#F43F5E';
                ctx.beginPath();
                ctx.moveTo(gx(b.x), gy(b.y));
                ctx.lineTo(gx(b.x + 4), gy(b.y + 5));
                ctx.lineTo(gx(b.x), gy(b.y + 10));
                ctx.lineTo(gx(b.x + 4), gy(b.y + 16));
                ctx.lineWidth = gs(2);
                ctx.strokeStyle = '#F43F5E';
                ctx.stroke();
            }
        }

        // Boss bullets — glowing orbs
        if (bossBullets) {
            for (const b of bossBullets) {
                drawGlow(b.x, b.y, 10, BOSS_GLOW, 0.3);
                ctx.fillStyle = BOSS_COLOR;
                ctx.beginPath();
                ctx.arc(gx(b.x), gy(b.y), gs(4), 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#FFF';
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.arc(gx(b.x) - gs(1), gy(b.y) - gs(1), gs(1.5), 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }

        // Particles — now with shapes
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.save();
            ctx.translate(gx(p.x), gy(p.y));
            if (p.rotation) ctx.rotate(p.rotation);
            const sz = gs(p.size);
            if (p.shape === 'triangle') {
                ctx.beginPath();
                ctx.moveTo(0, -sz/2);
                ctx.lineTo(-sz/2, sz/2);
                ctx.lineTo(sz/2, sz/2);
                ctx.closePath();
                ctx.fill();
            } else if (p.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(0, 0, sz/2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(-sz/2, -sz/2, sz, sz);
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        // Sprite explosions
        for (const se of spriteExplosions) {
            const fid = EXPLOSION_FRAME_IDS[se.frame];
            const fSprite = fid ? sprites[fid] : null;
            if (fSprite) {
                const half = se.size / 2;
                ctx.drawImage(fSprite, gx(se.x - half), gy(se.y - half), gs(se.size), gs(se.size));
            }
        }

        // Score popups — scale up then fade
        for (const p of scorePopups) {
            const alpha = p.life / p.maxLife;
            const age = 1 - alpha;
            const sc = age < 0.2 ? 0.8 + age * 3 : 1.4 - age * 0.5;
            ctx.globalAlpha = alpha;
            ctx.save();
            ctx.translate(gx(p.x), gy(p.y));
            ctx.scale(sc, sc);
            ctx.fillStyle = '#000';
            ctx.font = `bold ${gs(16)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(p.text, gs(1), gs(1));
            ctx.fillStyle = '#FBBF24';
            ctx.fillText(p.text, 0, 0);
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        // Screen edge vignette
        const vig = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.72);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);

        // HUD
        drawHUD();

        // Active power-up indicator
        if (activePowerup) {
            const puCol = POWERUP_COLORS[activePowerup.type];
            const remaining = activePowerup.timer / POWERUP_DURATION;
            const barW = 120;
            const barX = GAME_W / 2 - barW / 2;
            const barY = GAME_H - 20;
            // Background
            ctx.fillStyle = '#333';
            ctx.globalAlpha = 0.6;
            ctx.fillRect(gx(barX), gy(barY), gs(barW), gs(6));
            // Fill
            ctx.fillStyle = puCol;
            ctx.globalAlpha = 0.8;
            ctx.fillRect(gx(barX), gy(barY), gs(barW * remaining), gs(6));
            ctx.globalAlpha = 1;
            // Label
            ctx.fillStyle = puCol;
            ctx.font = `bold ${gs(10)}px monospace`;
            ctx.textAlign = 'center';
            const label = activePowerup.type === 'speed' ? 'SPEED' : 'DOUBLE';
            ctx.fillText(label, gx(GAME_W / 2), gy(barY - 4));
        }

        // Level splash
        if (state === ST_LEVEL_SPLASH) {
            ctx.fillStyle = '#000';
            ctx.globalAlpha = 0.5;
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
            ctx.fillStyle = HUD_COLOR;
            ctx.font = `bold ${gs(36)}px monospace`;
            ctx.textAlign = 'center';
            if (isBossWave()) {
                ctx.fillStyle = BOSS_COLOR;
                ctx.fillText(`BOSS WAVE`, W / 2, H / 2 - gs(20));
                ctx.font = `${gs(16)}px monospace`;
                ctx.fillStyle = '#F43F5E';
                ctx.fillText('DEFEAT THE MOTHERSHIP', W / 2, H / 2 + gs(20));
            } else {
                ctx.fillText(`WAVE ${level}`, W / 2, H / 2 - gs(20));
                ctx.font = `${gs(16)}px monospace`;
                ctx.fillStyle = '#A78BFA';
                ctx.fillText('GET READY', W / 2, H / 2 + gs(20));
            }
        }

        // Game over
        if (state === ST_GAMEOVER) {
            ctx.fillStyle = '#000';
            ctx.globalAlpha = 0.65;
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#F43F5E';
            ctx.shadowColor = '#F43F5E'; ctx.shadowBlur = gs(15);
            ctx.font = `bold ${gs(42)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', W / 2, H / 2 - gs(50));
            ctx.shadowBlur = 0;
            ctx.fillStyle = HUD_COLOR;
            ctx.font = `bold ${gs(20)}px monospace`;
            ctx.fillText(`SCORE: ${score.toLocaleString()}`, W / 2, H / 2 - gs(5));
            if (score >= highScore) {
                ctx.fillStyle = '#FBBF24';
                ctx.font = `bold ${gs(14)}px monospace`;
                ctx.fillText('\u2605 NEW HIGH SCORE! \u2605', W / 2, H / 2 + gs(18));
            } else {
                ctx.fillStyle = '#888';
                ctx.font = `${gs(13)}px monospace`;
                ctx.fillText(`BEST: ${highScore.toLocaleString()}`, W / 2, H / 2 + gs(18));
            }
            ctx.fillStyle = '#94A3B8';
            ctx.font = `${gs(14)}px monospace`;
            ctx.fillText(`WAVE: ${level}`, W / 2, H / 2 + gs(42));
            const blink = Math.sin(frameCount * 0.08) > 0;
            if (blink) {
                ctx.fillStyle = '#06B6D4';
                ctx.font = `${gs(15)}px monospace`;
                ctx.fillText(HAS_TOUCH ? 'TAP TO PLAY AGAIN' : 'PRESS SPACE TO PLAY AGAIN', W / 2, H / 2 + gs(75));
            }
        }

        if (state === ST_PLAYING || state === ST_BOSS) drawOnScreenControls(ctx, W, H, gs, ['FIRE'], 'LR');

        ctx.restore();
    }

    function drawHUD() {
        // Semi-transparent HUD backdrop panels
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.roundRect(gx(10), gy(10), gs(180), gs(50), gs(6));
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(gx(GAME_W - 120), gy(10), gs(110), gs(30), gs(6));
        ctx.fill();
        // Accent line
        ctx.fillStyle = 'rgba(56,189,248,0.2)';
        ctx.fillRect(gx(10), gy(58), gs(180), gs(1));

        ctx.fillStyle = HUD_COLOR;
        ctx.font = `bold ${gs(18)}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE ${score.toLocaleString()}`, gx(20), gy(30));
        ctx.textAlign = 'right';
        ctx.fillText(`WAVE ${level}`, gx(GAME_W - 20), gy(30));
        // Lives
        ctx.textAlign = 'left';
        for (let i = 0; i < lives; i++) {
            const lx = 20 + i * 30, ly = 45;
            ctx.fillStyle = playerColor || PLAYER_COLOR;
            ctx.beginPath();
            ctx.moveTo(gx(lx + 8), gy(ly));
            ctx.lineTo(gx(lx + 16), gy(ly + 12));
            ctx.lineTo(gx(lx), gy(ly + 12));
            ctx.fill();
        }
    }

    function drawTitle() {
        ctx.fillStyle = '#FFF';
        ctx.font = `bold ${gs(42)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('SPACE INVADERS', W / 2, H * 0.3);

        ctx.fillStyle = '#A78BFA';
        ctx.font = `${gs(16)}px monospace`;
        ctx.fillText('YOUR WORLD ARCADE', W / 2, H * 0.3 + gs(35));

        // Draw sample aliens — clean vertical list
        const demoY = GAME_H * 0.42;
        const demoX = GAME_W / 2 - 60;
        for (let i = 0; i < 5; i++) {
            const dy = demoY + i * (ALIEN_H + 14);
            ALIEN_DRAW[i](demoX, dy, ALIEN_W, ALIEN_H, ALIEN_COLORS[i], ALIEN_GLOW[i], frameCount % 60 < 30 ? 0 : 1);
            ctx.fillStyle = HUD_COLOR;
            ctx.font = `${gs(14)}px monospace`;
            ctx.textAlign = 'left';
            ctx.fillText(`= ${ALIEN_SCORES[i]} PTS`, gx(demoX + ALIEN_W + 20), gy(dy + ALIEN_H / 2 + 5));
        }

        ctx.fillStyle = '#06B6D4';
        ctx.font = `${gs(18)}px monospace`;
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) ctx.fillText('PRESS SPACE TO START', W / 2, H * 0.82);

        // Touch hint
        ctx.fillStyle = '#666';
        ctx.font = `${gs(12)}px monospace`;
        ctx.fillText('\u2190 \u2192 MOVE  |  SPACE FIRE', W / 2, H * 0.88);
    }

    // ═══════════════════════════════════════════
    //  INPUT
    // ═══════════════════════════════════════════
    function onKeyDown(e) {
        keys[e.key] = true;
        if (state === ST_TITLE && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault();
            startGame();
        }
        if (state === ST_GAMEOVER && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault();
            endGame();
        }
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
        }
    }

    function onKeyUp(e) { keys[e.key] = false; }

    function onTouchStart(e) {
        e.preventDefault();
        handleTouch(e.touches);
        if (state === ST_TITLE) startGame();
        if (state === ST_GAMEOVER) endGame();
    }
    function onTouchMove(e) { e.preventDefault(); handleTouch(e.touches); }
    function onTouchEnd(e) {
        e.preventDefault();
        if (e.touches.length === 0) { touchLeft = false; touchRight = false; touchFire = false; }
        else handleTouch(e.touches);
    }

    function handleTouch(touches) {
        touchLeft = false; touchRight = false; touchFire = false;
        const rect = canvas.getBoundingClientRect();
        for (const t of touches) {
            const tx = (t.clientX - rect.left) / rect.width;
            const ty = (t.clientY - rect.top) / rect.height;
            if (ty < 0.7) { touchFire = true; }
            else if (tx < 0.4) { touchLeft = true; }
            else if (tx > 0.6) { touchRight = true; }
            else { touchFire = true; }
        }
    }

    // ═══════════════════════════════════════════
    //  GAME LOOP
    // ═══════════════════════════════════════════
    function gameLoop(ts) {
        if (!gameActive && state !== ST_LOADING && state !== ST_TITLE && state !== ST_GAMEOVER) return;
        animFrame = requestAnimationFrame(gameLoop);
        const dt = Math.min(ts - (lastTime || ts), 50);
        lastTime = ts;
        update(dt);
        draw();
    }

    function endGame() {
        const duration = Math.round((Date.now() - startTime) / 1000);
        if (gameOverCB) {
            gameOverCB({ score, level, duration, lives });
        }
    }

    // ═══════════════════════════════════════════
    //  INIT / DESTROY
    // ═══════════════════════════════════════════
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
        let drawW, drawH;
        if (pw / ph > aspect) {
            drawH = ph; drawW = Math.floor(ph * aspect);
        } else {
            drawW = pw; drawH = Math.floor(pw / aspect);
        }
        drawW = Math.max(drawW, 320);
        drawH = Math.max(drawH, 400);
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = drawW * DPR;
        canvas.height = drawH * DPR;
        canvas.style.width = drawW + 'px';
        canvas.style.height = drawH + 'px';
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
        bgGradient = null;
    }

    function drawLoadingScreen() {
        ctx.fillStyle = '#080818';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#E0E7FF';
        ctx.font = `bold ${gs(20)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('LOADING SPRITES...', W / 2, H * 0.45);
        // Progress bar
        const barW = gs(200), barH = gs(12);
        const barX = W / 2 - barW / 2, barY = H * 0.52;
        ctx.strokeStyle = '#334155'; ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barW, barH);
        const pct = spritesTotal > 0 ? spritesLoaded / spritesTotal : 0;
        ctx.fillStyle = '#06B6D4';
        ctx.fillRect(barX + 2, barY + 2, (barW - 4) * pct, barH - 4);
        ctx.fillStyle = '#94A3B8';
        ctx.font = `${gs(11)}px monospace`;
        ctx.fillText(`${spritesLoaded}/${spritesTotal}`, W / 2, barY + barH + gs(18));
    }

    function init(cvs, player, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = player;
        gameOverCB = onGameOver;
        gameActive = true;
        playerColor = player?.color || PLAYER_COLOR;

        // Theme colors
        const themeId = player?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            PLAYER_COLOR = _t.colors[0] || PLAYER_COLOR;
            PLAYER_GLOW = _t.colors[1] || PLAYER_GLOW;
            SHIELD_COLOR = _t.colors[2] || SHIELD_COLOR;
            BULLET_COLOR = _t.colors[3] || BULLET_COLOR;
            playerColor = _t.colors[0] || playerColor;
        }

        state = ST_LOADING;
        frameCount = 0;
        lastTime = 0;
        keys = {};
        particles = [];
        scorePopups = [];
        aliens = [];
        alienBullets = [];
        playerBullets = [];
        ufo = null;
        screenShake = 0;
        powerups = [];
        activePowerup = null;
        boss = null;
        bossBullets = [];
        waveFlashTimer = 0;

        W = canvas.width || 480;
        H = canvas.height || 640;
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

        // Load sprites then transition to title
        spriteExplosions = [];
        loadSprites(null, () => {
            if (state === ST_LOADING) state = ST_TITLE;
        });
        // Fallback: if sprites take too long, go to title after 5s
        setTimeout(() => { if (state === ST_LOADING) state = ST_TITLE; }, 5000);

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
        aliens = [];
        alienBullets = [];
        playerBullets = [];
        powerups = [];
        boss = null;
        bossBullets = [];
        spriteExplosions = [];
    }

    function rand(min, max) { return min + Math.random() * (max - min); }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return level; },
        isActive() { return gameActive },
    };
})();
