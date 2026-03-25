/* Flappy — Theme-aware flappy bird with Kenney CC0 sprites for Your World Arcade */
window.FlappyMae = (() => {
    // ── Sprite Atlas (Kenney CC0) ──
    const __sprites = {};
    let __spritesLoaded = 0, __spritesTotal = 0, __allSpritesReady = false;
    const __SPRITE_MANIFEST = {
        bird: '/img/game-assets/kenney-platform/players/Pink/alienPink_stand.png',
        birdFlap: '/img/game-assets/kenney-platform/players/Pink/alienPink_jump.png',
        pipeBody: '/img/game-assets/kenney-tiles/tileGreen_06.png',
        pipeCap: '/img/game-assets/kenney-tiles/tileGreen_01.png',
        cloud: '/img/game-assets/kenney-coins/coin_02.png',
        coin: '/img/game-assets/kenney-coins/coin_01.png',
        ground: '/img/game-assets/kenney-platform/tiles/brickBrown.png',
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


    // ── Constants ──
    const W = 320, H = 480;
    const GRAVITY = 0.22;
    const JUMP_VEL = -5.0;
    const PIPE_WIDTH = 48;
    const PIPE_SPEED_BASE = 1.6;
    const PIPE_SPACING = 220; // horizontal distance between pipes (wider = more time)
    const GAP_START = 180;    // initial gap size (very generous)
    const GAP_MIN = 120;      // smallest gap (still fair)
    const GAP_SHRINK = 2;     // gap shrinks per level
    const GROUND_H = 60;
    const BIRD_R = 14;        // candy body radius
    const CLOUD_COUNT = 4;

    // ── Cloud Pop constants ──
    const CP_COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#FBBF24'];
    const CP_COLOR_NAMES = ['red', 'blue', 'green', 'yellow'];
    const CP_CYCLE_MS = 3000;        // color cycles every 3 seconds
    const CP_POP_SCORE = 50;
    const CP_GOLDEN_SCORE = 200;
    const CP_COMBO_WINDOW = 2000;    // 2 second combo window
    const CP_CLOUD_R = 16;           // base cloud radius
    const CP_BOUNCE_VEL = -2.5;      // upward push on wrong-color bounce
    const CP_STUN_FRAMES = 12;       // wobble duration after bounce

    // ── Game states ──
    const SPLASH = 0, PLAYING = 1, GAMEOVER = 2;

    // ── State variables ──
    let canvas, ctx;
    let state = SPLASH;
    let score = 0, bestScore = 0, level = 1;
    let gameActive = false;
    let animFrame = null;
    let player = null;
    let onGameOver = null;

    // Bird
    let birdY, birdVel, birdAngle, birdWingUp, birdWingTimer;
    let birdAlive;

    // Pipes
    let pipes = [];
    let pipeTimer = 0;
    let pipeSpeed;
    let gapSize;

    // Ground scroll
    let groundX = 0;

    // Clouds (decorative background)
    let clouds = [];

    // Floating score texts
    let floats = [];

    // Splash bounce
    let splashBounce = 0;
    let splashDir = 1;

    // Theme
    let theme = null;
    let TC = [];  // theme colors
    let TE = [];  // theme emoji
    let TBG = []; // theme bg gradient

    // Death tumble
    let deathTimer = 0;

    // Feather particles
    let feathers = [];

    // Parallax hills
    let hills = [];
    let hillsInited = false;

    // Audio context
    let audioCtx = null;

    // ── Cloud Pop state ──
    let birdColorIdx = 0;           // index into CP_COLORS
    let birdColorTimer = 0;         // ms since last color change
    let lastFrameTime = 0;          // for delta time
    let popClouds = [];             // colored clouds for Cloud Pop mechanic
    let popParticles = [];          // burst particles from popped clouds
    let comboCount = 0;             // consecutive same-color pops
    let comboTimer = 0;             // ms since last pop (combo window)
    let comboMultiplier = 1;
    let comboDisplayTimer = 0;      // frames to show combo text
    let comboDisplayText = '';
    let stunTimer = 0;              // frames of stun wobble remaining
    let cloudPopScore = 0;          // separate cloud pop score (added to main)
    let screenClearActive = false;  // flash for 5+ chain burst
    let screenClearTimer = 0;
    let pipesSpawnedTotal = 0;      // track for level progression

    // ── Audio ──
    function getAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
        }
        return audioCtx;
    }

    function playFlap() {
        const ac = getAudio(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.setValueAtTime(600, ac.currentTime);
            osc.frequency.exponentialRampToValueAtTime(900, ac.currentTime + 0.08);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.15, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
            osc.start(ac.currentTime);
            osc.stop(ac.currentTime + 0.12);
        } catch (e) {}
    }

    function playScore() {
        const ac = getAudio(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.setValueAtTime(880, ac.currentTime);
            osc.frequency.setValueAtTime(1100, ac.currentTime + 0.06);
            osc.frequency.setValueAtTime(1320, ac.currentTime + 0.12);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.12, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
            osc.start(ac.currentTime);
            osc.stop(ac.currentTime + 0.2);
        } catch (e) {}
    }

    function playHit() {
        const ac = getAudio(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.setValueAtTime(150, ac.currentTime);
            osc.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.2);
            osc.type = 'square';
            gain.gain.setValueAtTime(0.2, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
            osc.start(ac.currentTime);
            osc.stop(ac.currentTime + 0.25);
        } catch (e) {}
    }

    function playFall() {
        const ac = getAudio(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.setValueAtTime(400, ac.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.5);
            osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.08, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
            osc.start(ac.currentTime);
            osc.stop(ac.currentTime + 0.5);
        } catch (e) {}
    }

    function playCloudPop() {
        const ac = getAudio(); if (!ac) return;
        try {
            // Bright sparkle pop sound
            const osc = ac.createOscillator();
            const osc2 = ac.createOscillator();
            const gain = ac.createGain();
            const gain2 = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc2.connect(gain2); gain2.connect(ac.destination);
            osc.frequency.setValueAtTime(1200, ac.currentTime);
            osc.frequency.exponentialRampToValueAtTime(2400, ac.currentTime + 0.06);
            osc.frequency.exponentialRampToValueAtTime(1800, ac.currentTime + 0.12);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.15, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
            osc2.frequency.setValueAtTime(800, ac.currentTime);
            osc2.frequency.exponentialRampToValueAtTime(1600, ac.currentTime + 0.08);
            osc2.type = 'triangle';
            gain2.gain.setValueAtTime(0.08, ac.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
            osc.start(ac.currentTime);
            osc.stop(ac.currentTime + 0.18);
            osc2.start(ac.currentTime);
            osc2.stop(ac.currentTime + 0.15);
        } catch (e) {}
    }

    function playCloudBounce() {
        const ac = getAudio(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.setValueAtTime(300, ac.currentTime);
            osc.frequency.exponentialRampToValueAtTime(150, ac.currentTime + 0.15);
            osc.type = 'triangle';
            gain.gain.setValueAtTime(0.12, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
            osc.start(ac.currentTime);
            osc.stop(ac.currentTime + 0.18);
        } catch (e) {}
    }

    function playCombo() {
        const ac = getAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.setValueAtTime(880, t);
            osc.frequency.setValueAtTime(1100, t + 0.05);
            osc.frequency.setValueAtTime(1320, t + 0.1);
            osc.frequency.setValueAtTime(1760, t + 0.15);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.3);
        } catch (e) {}
    }

    function playScreenClear() {
        const ac = getAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            for (let i = 0; i < 3; i++) {
                const osc = ac.createOscillator();
                const gain = ac.createGain();
                osc.connect(gain); gain.connect(ac.destination);
                osc.frequency.setValueAtTime(800 + i * 400, t + i * 0.08);
                osc.frequency.exponentialRampToValueAtTime(2000 + i * 200, t + i * 0.08 + 0.1);
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.12, t + i * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
                osc.start(t + i * 0.08);
                osc.stop(t + i * 0.08 + 0.2);
            }
        } catch (e) {}
    }

    function playStormShuffle() {
        const ac = getAudio(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.setValueAtTime(200, ac.currentTime);
            osc.frequency.linearRampToValueAtTime(600, ac.currentTime + 0.05);
            osc.frequency.linearRampToValueAtTime(100, ac.currentTime + 0.1);
            osc.frequency.linearRampToValueAtTime(500, ac.currentTime + 0.15);
            osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.1, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
            osc.start(ac.currentTime);
            osc.stop(ac.currentTime + 0.2);
        } catch (e) {}
    }

    // ── Color helpers ──
    function playerColor() {
        return (player && player.color) ? player.color : '#F472B6';
    }

    function playerEmoji() {
        return (player && player.emoji) ? player.emoji : (TE[0] || '🎮');
    }

    function playerName() {
        return (player && player.name) ? player.name : 'Player';
    }

    // ── Feather particle system ──
    function spawnFeathers(x, y, color) {
        for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2;
            const spd = 1.5 + Math.random() * 3;
            feathers.push({
                x, y,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd - 1.5,
                life: 1.0,
                rot: Math.random() * Math.PI * 2,
                rotSpd: (Math.random() - 0.5) * 0.2,
                size: 3 + Math.random() * 4,
                color: color || TC[0] || '#F472B6',
                drift: (Math.random() - 0.5) * 0.3
            });
        }
    }

    function updateFeathers() {
        for (let i = feathers.length - 1; i >= 0; i--) {
            const f = feathers[i];
            f.x += f.vx + f.drift;
            f.y += f.vy;
            f.vy += 0.04; // gentle gravity
            f.vx *= 0.98;
            f.rot += f.rotSpd;
            f.life -= 0.015;
            if (f.life <= 0) feathers.splice(i, 1);
        }
    }

    function drawFeathers() {
        for (const f of feathers) {
            ctx.save();
            ctx.globalAlpha = f.life * 0.8;
            ctx.translate(f.x, f.y);
            ctx.rotate(f.rot);
            // Feather shape
            ctx.fillStyle = f.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, f.size, f.size * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
            // Feather spine
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(-f.size, 0);
            ctx.lineTo(f.size, 0);
            ctx.stroke();
            ctx.restore();
        }
    }

    // ── Parallax hills ──
    function initHills() {
        hills = [];
        // Back hills (slower, lighter)
        for (let i = 0; i < 6; i++) {
            hills.push({
                x: i * 80 - 40,
                h: 30 + Math.random() * 40,
                w: 60 + Math.random() * 50,
                layer: 0,
                speed: 0.3
            });
        }
        // Front hills (faster, darker)
        for (let i = 0; i < 5; i++) {
            hills.push({
                x: i * 90 - 20,
                h: 20 + Math.random() * 30,
                w: 50 + Math.random() * 60,
                layer: 1,
                speed: 0.7
            });
        }
        hillsInited = true;
    }

    function updateHills() {
        if (state !== PLAYING) return;
        for (const h of hills) {
            h.x -= pipeSpeed * h.speed;
            if (h.x + h.w < -20) {
                h.x = W + 20 + Math.random() * 40;
                h.h = 20 + Math.random() * 40;
                h.w = 50 + Math.random() * 60;
            }
        }
    }

    function drawHills() {
        const groundY = H - GROUND_H;
        // Back layer
        const backColor = (typeof ArcadeThemes !== 'undefined' && TC[2])
            ? ArcadeThemes.darken(TC[2], 20) + '55' : 'rgba(100,80,140,0.25)';
        for (const h of hills) {
            if (h.layer !== 0) continue;
            ctx.fillStyle = backColor;
            ctx.beginPath();
            ctx.moveTo(h.x, groundY);
            ctx.quadraticCurveTo(h.x + h.w * 0.5, groundY - h.h, h.x + h.w, groundY);
            ctx.closePath();
            ctx.fill();
        }
        // Front layer
        const frontColor = (typeof ArcadeThemes !== 'undefined' && TC[3])
            ? ArcadeThemes.darken(TC[3], 30) + '44' : 'rgba(60,50,90,0.2)';
        for (const h of hills) {
            if (h.layer !== 1) continue;
            ctx.fillStyle = frontColor;
            ctx.beginPath();
            ctx.moveTo(h.x, groundY);
            ctx.quadraticCurveTo(h.x + h.w * 0.5, groundY - h.h, h.x + h.w, groundY);
            ctx.closePath();
            ctx.fill();
        }
    }

    // ── Drawing helpers ──
    function drawCandySky() {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, TBG[0]);
        grad.addColorStop(0.4, TBG[1]);
        // Add a warm horizon glow
        const horizonColor = (typeof ArcadeThemes !== 'undefined' && TC[4])
            ? ArcadeThemes.lighten(TC[4], 20) + '33' : 'rgba(255,180,100,0.15)';
        grad.addColorStop(0.75, horizonColor);
        grad.addColorStop(1, TBG[1]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    function drawClouds() {
        for (const c of clouds) {
            // Soft cloud shadow
            ctx.fillStyle = 'rgba(0,0,0,0.04)';
            ctx.beginPath();
            ctx.arc(c.x + 2, c.y + 3, c.r, 0, Math.PI * 2);
            ctx.arc(c.x + c.r * 1.1 + 2, c.y - c.r * 0.4 + 3, c.r * 0.8, 0, Math.PI * 2);
            ctx.arc(c.x + c.r * 1.8 + 2, c.y + 3, c.r * 0.65, 0, Math.PI * 2);
            ctx.fill();

            // Cloud body with gradient
            const cloudGrad = ctx.createRadialGradient(c.x, c.y - c.r * 0.3, c.r * 0.2, c.x + c.r * 0.5, c.y, c.r * 2.5);
            cloudGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
            cloudGrad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
            cloudGrad.addColorStop(1, 'rgba(255,255,255,0.15)');
            ctx.fillStyle = cloudGrad;
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
            ctx.arc(c.x + c.r * 1.1, c.y - c.r * 0.4, c.r * 0.8, 0, Math.PI * 2);
            ctx.arc(c.x + c.r * 1.8, c.y, c.r * 0.65, 0, Math.PI * 2);
            ctx.arc(c.x - c.r * 0.6, c.y + c.r * 0.15, c.r * 0.5, 0, Math.PI * 2);
            ctx.fill();

            // Cloud highlight top edge
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(c.x + c.r * 0.3, c.y - c.r * 0.3, c.r * 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function drawCandyGround() {
        const stripeW = 20;
        const y = H - GROUND_H;
        const baseColor = (typeof ArcadeThemes !== 'undefined')
            ? ArcadeThemes.darken(TC[4] || '#F59E0B', 30) : '#A16207';
        const stripeColor = TC[5] || '#A78BFA';

        // Ground body with texture
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y, W, GROUND_H);
        ctx.clip();

        // Base fill
        const groundGrad = ctx.createLinearGradient(0, y, 0, y + GROUND_H);
        groundGrad.addColorStop(0, baseColor);
        groundGrad.addColorStop(1, (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.darken(baseColor, 20) : '#7C4A08');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, y, W, GROUND_H);

        // Diagonal stripes
        for (let x = -stripeW + (groundX % (stripeW * 2)); x < W + stripeW * 2; x += stripeW) {
            if (Math.floor((x - groundX) / stripeW) % 2 === 0) continue;
            ctx.fillStyle = stripeColor + '33';
            ctx.save();
            ctx.translate(x + stripeW / 2, y + GROUND_H / 2);
            ctx.rotate(-0.3);
            ctx.fillRect(-stripeW, -GROUND_H, stripeW * 2, GROUND_H * 2);
            ctx.restore();
        }

        // Noise texture dots
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = '#000';
        for (let tx = 0; tx < W; tx += 6) {
            for (let ty = y; ty < H; ty += 6) {
                if (Math.random() > 0.5) {
                    ctx.fillRect(tx, ty, 2, 2);
                }
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // Top edge with highlight
        const edgeGrad = ctx.createLinearGradient(0, y - 1, 0, y + 5);
        edgeGrad.addColorStop(0, TC[0] || '#F43F5E');
        edgeGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(0, y, W, 5);

        // Grass tufts
        ctx.fillStyle = (typeof ArcadeThemes !== 'undefined' && TC[2])
            ? ArcadeThemes.lighten(TC[2], 10) : '#6EE7B7';
        for (let gx = 0; gx < W; gx += 12) {
            const offset = (gx + Math.floor(groundX)) % 24;
            if (offset < 12) {
                ctx.beginPath();
                ctx.moveTo(gx, y);
                ctx.quadraticCurveTo(gx + 2, y - 5 - (gx % 7), gx + 5, y);
                ctx.fill();
            }
        }
    }

    function drawCandyPipe(px, topH, bottomY, gap) {
        const capH = 16;
        const capOverhang = 7;
        const pipeBody = TC[2] || '#F472B6';
        const pipeEdge = TC[3] || '#FB923C';
        const pipeCap  = TC[4] || '#FBBF24';

        function drawColumn(x, y, w, h, capAtBottom) {
            // Pipe body with metallic gradient
            const bodyGrad = ctx.createLinearGradient(x, y, x + w, y);
            const lightBody = (typeof ArcadeThemes !== 'undefined')
                ? ArcadeThemes.lighten(pipeBody, 25) : shadeColor(pipeBody, 30);
            const darkBody = (typeof ArcadeThemes !== 'undefined')
                ? ArcadeThemes.darken(pipeBody, 25) : shadeColor(pipeBody, -30);
            bodyGrad.addColorStop(0, darkBody);
            bodyGrad.addColorStop(0.25, lightBody);
            bodyGrad.addColorStop(0.5, pipeBody);
            bodyGrad.addColorStop(0.75, darkBody);
            bodyGrad.addColorStop(1, darkBody);
            ctx.fillStyle = bodyGrad;
            ctx.fillRect(x, y, w, h);

            // Metallic sheen lines — richer reflections
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(x + w * 0.18, y, 4, h);
            ctx.globalAlpha = 0.15;
            ctx.fillRect(x + w * 0.32, y, 2, h);
            ctx.globalAlpha = 0.08;
            ctx.fillStyle = '#FFFBE8';
            ctx.fillRect(x + w * 0.45, y, 3, h);
            ctx.restore();

            // Edge highlights (left/right)
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(x, y, 2, h);
            ctx.fillRect(x + w - 2, y, 2, h);

            // Cap (rounded rectangle with gradient)
            const capX = x - capOverhang;
            const capW = w + capOverhang * 2;
            const capY = capAtBottom ? y : y + h - capH;
            const capR = 8;

            // Cap shadow
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath();
            ctx.moveTo(capX + capR, capY + 2);
            ctx.lineTo(capX + capW - capR, capY + 2);
            ctx.quadraticCurveTo(capX + capW, capY + 2, capX + capW, capY + capR + 2);
            ctx.lineTo(capX + capW, capY + capH - capR + 2);
            ctx.quadraticCurveTo(capX + capW, capY + capH + 2, capX + capW - capR, capY + capH + 2);
            ctx.lineTo(capX + capR, capY + capH + 2);
            ctx.quadraticCurveTo(capX, capY + capH + 2, capX, capY + capH - capR + 2);
            ctx.lineTo(capX, capY + capR + 2);
            ctx.quadraticCurveTo(capX, capY + 2, capX + capR, capY + 2);
            ctx.closePath();
            ctx.fill();

            // Cap body with gradient
            const capGrad = ctx.createLinearGradient(capX, capY, capX + capW, capY);
            const lightCap = (typeof ArcadeThemes !== 'undefined')
                ? ArcadeThemes.lighten(pipeCap, 20) : shadeColor(pipeCap, 25);
            capGrad.addColorStop(0, pipeCap);
            capGrad.addColorStop(0.3, lightCap);
            capGrad.addColorStop(0.7, pipeCap);
            capGrad.addColorStop(1, (typeof ArcadeThemes !== 'undefined')
                ? ArcadeThemes.darken(pipeCap, 15) : shadeColor(pipeCap, -15));
            ctx.fillStyle = capGrad;
            ctx.beginPath();
            ctx.moveTo(capX + capR, capY);
            ctx.lineTo(capX + capW - capR, capY);
            ctx.quadraticCurveTo(capX + capW, capY, capX + capW, capY + capR);
            ctx.lineTo(capX + capW, capY + capH - capR);
            ctx.quadraticCurveTo(capX + capW, capY + capH, capX + capW - capR, capY + capH);
            ctx.lineTo(capX + capR, capY + capH);
            ctx.quadraticCurveTo(capX, capY + capH, capX, capY + capH - capR);
            ctx.lineTo(capX, capY + capR);
            ctx.quadraticCurveTo(capX, capY, capX + capR, capY);
            ctx.closePath();
            ctx.fill();

            // Cap highlight stripe
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillRect(capX + 5, capY + 3, capW - 10, 3);
            // Cap bottom edge
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.fillRect(capX + 3, capY + capH - 3, capW - 6, 2);
        }

        // Top pipe (cap at bottom)
        if (topH > 0) {
            drawColumn(px, 0, PIPE_WIDTH, topH, false);
        }
        // Bottom pipe (cap at top)
        const bh = H - bottomY;
        if (bh > 0) {
            drawColumn(px, bottomY, PIPE_WIDTH, bh, true);
        }
    }

    function drawBird_sprite() {
        const _bsz = BIRD_R * 2.2;
        const _bk = birdVel < -1 ? 'birdFlap' : 'bird';
        if (__sprites[_bk]) {
            ctx.save();
            ctx.translate(W * 0.25, birdY);
            ctx.rotate(Math.min(birdAngle, 0.5));
            ctx.drawImage(__sprites[_bk], -_bsz/2, -_bsz/2, _bsz, _bsz);
            ctx.restore();
            return true;
        }
        return false;
    }
    function drawBird(x, y, angle, wingUp, color, alive) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        const r = BIRD_R;
        const bodyColor = TC[0] || color;
        const lightColor = (typeof ArcadeThemes !== 'undefined')
            ? ArcadeThemes.lighten(bodyColor, 30) : shadeColor(bodyColor, 40);
        const darkColor = (typeof ArcadeThemes !== 'undefined')
            ? ArcadeThemes.darken(bodyColor, 20) : shadeColor(bodyColor, -20);

        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(2, 3, r, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body (filled circle with gradient)
        const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        grad.addColorStop(0, lightColor);
        grad.addColorStop(0.7, bodyColor);
        grad.addColorStop(1, darkColor);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // Body outline
        ctx.strokeStyle = darkColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Belly highlight
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.ellipse(-1, 3, r * 0.6, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Wing with flap animation
        const wingColor = shadeColor(bodyColor, 20);
        const wingDarkColor = shadeColor(bodyColor, -10);
        const wy = wingUp ? -8 : 3;
        const wingAngle = wingUp ? -0.5 : 0.15;

        // Left wing (main, larger)
        ctx.save();
        ctx.translate(-r * 0.5, wy);
        ctx.rotate(wingAngle);
        const wingGrad = ctx.createLinearGradient(0, -5, 0, 5);
        wingGrad.addColorStop(0, wingColor);
        wingGrad.addColorStop(1, wingDarkColor);
        ctx.fillStyle = wingGrad;
        ctx.beginPath();
        ctx.ellipse(-5, 0, 9, 5, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = darkColor;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.restore();

        // Tail feathers
        ctx.fillStyle = wingDarkColor;
        ctx.beginPath();
        ctx.ellipse(-r - 1, 2, 5, 3, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-r - 2, -1, 4, 2.5, -0.2, 0, Math.PI * 2);
        ctx.fill();

        // Eye (white with pupil)
        if (alive) {
            // Eye white
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.ellipse(5, -4, 5, 4.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = darkColor;
            ctx.lineWidth = 0.7;
            ctx.stroke();
            // Pupil
            ctx.fillStyle = '#1a1a2e';
            ctx.beginPath();
            ctx.arc(6.5, -3.5, 2.2, 0, Math.PI * 2);
            ctx.fill();
            // Eye glint
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(7.5, -4.5, 0.8, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Dead X eyes
            const eyeY = -3;
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            [4, 8].forEach(ex => {
                ctx.beginPath();
                ctx.moveTo(ex - 2.5, eyeY - 2.5);
                ctx.lineTo(ex + 2.5, eyeY + 2.5);
                ctx.moveTo(ex + 2.5, eyeY - 2.5);
                ctx.lineTo(ex - 2.5, eyeY + 2.5);
                ctx.stroke();
            });
        }

        // Beak
        if (alive) {
            ctx.fillStyle = '#F59E0B';
            ctx.beginPath();
            ctx.moveTo(r - 2, -1);
            ctx.lineTo(r + 7, 1);
            ctx.lineTo(r - 2, 4);
            ctx.closePath();
            ctx.fill();
            // Beak highlight
            ctx.fillStyle = '#FDE68A';
            ctx.beginPath();
            ctx.moveTo(r - 1, -0.5);
            ctx.lineTo(r + 5, 0.5);
            ctx.lineTo(r - 1, 1.5);
            ctx.closePath();
            ctx.fill();
            // Mouth line
            ctx.strokeStyle = '#B45309';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(r - 2, 1.5);
            ctx.lineTo(r + 6, 1.5);
            ctx.stroke();
        }

        // Emoji face overlay (smaller, positioned)
        const emoji = TE[0] || '🍬';
        ctx.font = (r * 0.7) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.4;
        ctx.fillText(emoji, -2, 2);
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    function shadeColor(color, amount) {
        let r = parseInt(color.slice(1, 3), 16) + amount;
        let g = parseInt(color.slice(3, 5), 16) + amount;
        let b = parseInt(color.slice(5, 7), 16) + amount;
        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    }

    function drawScore() {
        const text = score.toString();
        ctx.font = 'bold 42px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Glow effect
        ctx.save();
        ctx.shadowColor = '#A855F7';
        ctx.shadowBlur = 20;
        ctx.fillStyle = 'rgba(168,85,247,0.3)';
        ctx.fillText(text, W / 2, 30);
        ctx.restore();

        // Outline
        ctx.strokeStyle = '#7C3AED';
        ctx.lineWidth = 5;
        ctx.strokeText(text, W / 2, 30);
        // Fill
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, W / 2, 30);
        // Inner shadow
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#7C3AED';
        ctx.fillText(text, W / 2, 31);
        ctx.restore();

        ctx.textAlign = 'left';
    }

    function drawHUD() {
        // Player info top-left with subtle backdrop
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        const nameText = playerEmoji() + ' ' + playerName();
        ctx.font = '14px sans-serif';
        const nameW = ctx.measureText(nameText).width;
        roundRect(ctx, 4, 4, nameW + 12, 22, 6, true, false);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(nameText, 10, 8);
        ctx.restore();
    }

    function drawFloats() {
        for (let i = floats.length - 1; i >= 0; i--) {
            const f = floats[i];
            f.y -= 1.5;
            f.life -= 1;
            const alpha = Math.max(0, f.life / f.maxLife);
            const scale = 1 + (1 - alpha) * 0.3; // grow slightly as it fades
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(f.x, f.y);
            ctx.scale(scale, scale);

            // Glow
            ctx.shadowColor = '#F59E0B';
            ctx.shadowBlur = 12;

            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#F59E0B';
            ctx.strokeStyle = '#7C3AED';
            ctx.lineWidth = 3;
            ctx.strokeText(f.text, 0, 0);
            ctx.fillText(f.text, 0, 0);
            ctx.restore();
            if (f.life <= 0) floats.splice(i, 1);
        }
    }

    // ── Splash screen ──
    function drawSplash() {
        splashBounce += splashDir * 0.06;
        if (splashBounce > 1) splashDir = -1;
        if (splashBounce < -1) splashDir = 1;

        // Title
        ctx.font = 'bold 38px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillText('FLAPPY POP', W / 2 + 2, 102);
        // Gradient text
        const tgrad = ctx.createLinearGradient(W / 2 - 100, 80, W / 2 + 100, 120);
        tgrad.addColorStop(0, '#A855F7');
        tgrad.addColorStop(0.5, '#EC4899');
        tgrad.addColorStop(1, '#F59E0B');
        ctx.fillStyle = tgrad;
        ctx.fillText('FLAPPY POP', W / 2, 100);

        // Bouncing bird
        const by = 210 + splashBounce * 12;
        drawBird(W / 2, by, 0, splashBounce > 0, playerColor(), true);

        // Subtitle
        ctx.font = '18px sans-serif';
        ctx.fillStyle = '#7C3AED';
        ctx.fillText('Pop the Clouds!', W / 2, 300);
        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#A855F7';
        ctx.fillText('Tap or Space to Start', W / 2, 324);

        // Credits
        ctx.font = '11px sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillText("Your World Arcade", W / 2, H - GROUND_H - 16);
    }

    // ── Game Over screen ──
    function drawGameOver() {
        // Overlay
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, W, H);

        // Panel
        const px = 40, py = 100, pw = W - 80, ph = 220;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        roundRect(ctx, px, py, pw, ph, 16, true, false);

        // Title
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#7C3AED';
        ctx.fillText('GAME OVER', W / 2, py + 40);

        // Score
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = '#333';
        ctx.fillText('Score: ' + score, W / 2, py + 72);
        ctx.fillText('Level: ' + level, W / 2, py + 94);

        // Cloud Pop bonus
        if (cloudPopScore > 0) {
            ctx.font = '14px sans-serif';
            ctx.fillStyle = '#3B82F6';
            ctx.fillText('Cloud Pop Bonus: ' + cloudPopScore, W / 2, py + 114);
        }

        // Best
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#A855F7';
        ctx.fillText('Best: ' + bestScore, W / 2, py + 138);

        // Medal
        if (score >= 40) {
            ctx.fillText('PLATINUM', W / 2, py + 162);
        } else if (score >= 30) {
            ctx.fillText('GOLD', W / 2, py + 162);
        } else if (score >= 20) {
            ctx.fillText('SILVER', W / 2, py + 162);
        } else if (score >= 10) {
            ctx.fillText('BRONZE', W / 2, py + 162);
        }

        // Retry
        ctx.font = '15px sans-serif';
        ctx.fillStyle = '#EC4899';
        ctx.fillText('Tap or Space to Retry', W / 2, py + ph - 20);

        ctx.textAlign = 'left';
    }

    function roundRect(ctx, x, y, w, h, r, fill, stroke) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
    }

    // ── Pipe spawning ──
    function spawnPipe() {
        const minTop = 50;
        const maxTop = H - GROUND_H - gapSize - 50;
        const topH = minTop + Math.random() * (maxTop - minTop);
        const pipe = {
            x: W + 10,
            topH: topH,
            bottomY: topH + gapSize,
            scored: false,
            colorSections: []
        };
        addColoredSections(pipe);
        pipes.push(pipe);
        pipesSpawnedTotal++;
        // Spawn colored clouds in the gap region ahead of this pipe
        spawnPopCloudsForPipe(pipe);
    }

    // ── Cloud helpers ──
    function initClouds() {
        clouds = [];
        for (let i = 0; i < CLOUD_COUNT; i++) {
            clouds.push({
                x: Math.random() * W,
                y: 20 + Math.random() * (H * 0.35),
                r: 18 + Math.random() * 22,
                vx: -(0.15 + Math.random() * 0.25)
            });
        }
    }

    function updateClouds() {
        for (const c of clouds) {
            c.x += c.vx;
            if (c.x < -c.r * 3) {
                c.x = W + c.r * 2;
                c.y = 20 + Math.random() * (H * 0.35);
                c.r = 18 + Math.random() * 22;
            }
        }
    }

    // ── Cloud Pop: colored cloud system ──
    function spawnPopCloudsForPipe(pipe) {
        // Determine how many clouds based on level
        let minClouds = 2, maxClouds = 4;
        if (level >= 3) { minClouds = 3; maxClouds = 5; }
        if (level >= 5) { minClouds = 4; maxClouds = 6; }
        const count = minClouds + Math.floor(Math.random() * (maxClouds - minClouds + 1));

        // Clouds spawn between this pipe and the next gap area
        const spawnXBase = pipe.x + PIPE_WIDTH + 30;
        const spawnXRange = PIPE_SPACING * 0.5;
        const minY = pipe.topH + 15;
        const maxY = pipe.bottomY - 15;

        for (let i = 0; i < count; i++) {
            let cType = 'normal';
            // 5% chance golden, 8% storm (only level 5+)
            const roll = Math.random();
            if (roll < 0.05) {
                cType = 'golden';
            } else if (roll < 0.13 && level >= 5) {
                cType = 'storm';
            }

            const colorIdx = Math.floor(Math.random() * 4);
            const cx = spawnXBase + Math.random() * spawnXRange;
            const cy = minY + Math.random() * (maxY - minY);
            const r = CP_CLOUD_R + Math.random() * 6 - 3;

            popClouds.push({
                x: cx,
                y: cy,
                baseY: cy,
                r: r,
                colorIdx: colorIdx,
                color: cType === 'storm' ? '#6B7280' : (cType === 'golden' ? '#F59E0B' : CP_COLORS[colorIdx]),
                type: cType,         // 'normal', 'golden', 'storm'
                alive: true,
                bobPhase: Math.random() * Math.PI * 2,
                bobSpeed: 0.03 + Math.random() * 0.02,
                sparklePhase: Math.random() * Math.PI * 2  // for golden sparkle
            });
        }
    }

    function updatePopClouds(dt) {
        for (let i = popClouds.length - 1; i >= 0; i--) {
            const c = popClouds[i];
            c.x -= pipeSpeed;
            // Gentle bob
            c.bobPhase += c.bobSpeed;
            c.y = c.baseY + Math.sin(c.bobPhase) * 5;
            // Golden sparkle rotation
            c.sparklePhase += 0.05;
            // Remove offscreen
            if (c.x < -40) {
                popClouds.splice(i, 1);
            }
        }
    }

    function drawPopCloud(c) {
        if (!c.alive) return;
        ctx.save();

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.beginPath();
        ctx.arc(c.x + 2, c.y + 3, c.r, 0, Math.PI * 2);
        ctx.fill();

        // Main cloud body: radial gradient (white center -> cloud color)
        const grad = ctx.createRadialGradient(c.x - c.r * 0.2, c.y - c.r * 0.2, c.r * 0.1, c.x, c.y, c.r);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.35, c.color + 'EE');
        grad.addColorStop(0.7, c.color + 'CC');
        grad.addColorStop(1, c.color + '88');
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = grad;
        ctx.beginPath();
        // Soft bumpy cloud shape
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
        // Secondary smaller blob for softness
        ctx.beginPath();
        ctx.arc(c.x + c.r * 0.5, c.y - c.r * 0.3, c.r * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(c.x - c.r * 0.4, c.y + c.r * 0.2, c.r * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Outer glow — vibrant pulsing
        const popPulse = 0.4 + Math.sin(performance.now() * 0.006 + c.x) * 0.15;
        ctx.globalAlpha = popPulse;
        ctx.shadowColor = c.color;
        ctx.shadowBlur = 20;
        ctx.fillStyle = c.color + '66';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r + 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Golden sparkle particles orbiting
        if (c.type === 'golden') {
            ctx.globalAlpha = 0.8;
            for (let s = 0; s < 4; s++) {
                const angle = c.sparklePhase + (s * Math.PI / 2);
                const sx = c.x + Math.cos(angle) * (c.r + 4);
                const sy = c.y + Math.sin(angle) * (c.r + 4);
                ctx.fillStyle = '#FDE68A';
                ctx.beginPath();
                // Star shape
                for (let p = 0; p < 4; p++) {
                    const a = p * Math.PI / 2 + c.sparklePhase * 2;
                    const pr = 2 + Math.sin(c.sparklePhase * 3 + s) * 1;
                    ctx.lineTo(sx + Math.cos(a) * pr, sy + Math.sin(a) * pr);
                }
                ctx.closePath();
                ctx.fill();
            }
        }

        // Storm cloud: dark inner swirl
        if (c.type === 'storm') {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#374151';
            ctx.beginPath();
            ctx.arc(c.x + Math.sin(c.bobPhase * 2) * 3, c.y, c.r * 0.6, 0, Math.PI * 2);
            ctx.fill();
            // Lightning bolt hint
            ctx.globalAlpha = 0.5 + Math.sin(c.bobPhase * 5) * 0.3;
            ctx.strokeStyle = '#FBBF24';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(c.x - 2, c.y - 4);
            ctx.lineTo(c.x + 1, c.y);
            ctx.lineTo(c.x - 1, c.y);
            ctx.lineTo(c.x + 2, c.y + 5);
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawAllPopClouds() {
        for (const c of popClouds) {
            drawPopCloud(c);
        }
    }

    // ── Cloud Pop particles ──
    function spawnPopParticles(x, y, color, count) {
        count = count || 10;
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const spd = 2 + Math.random() * 3;
            popParticles.push({
                x, y,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd - 1,
                life: 1.0,
                size: 2 + Math.random() * 4,
                color: color
            });
        }
        // Expanding ring
        popParticles.push({
            x, y, vx: 0, vy: 0,
            life: 1.0,
            size: 5,
            color: color,
            ring: true,
            ringR: 5
        });
    }

    function updatePopParticles() {
        for (let i = popParticles.length - 1; i >= 0; i--) {
            const p = popParticles[i];
            if (p.ring) {
                p.ringR += 3;
                p.life -= 0.04;
            } else {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.06;
                p.vx *= 0.97;
                p.life -= 0.025;
            }
            if (p.life <= 0) popParticles.splice(i, 1);
        }
    }

    function drawPopParticles() {
        for (const p of popParticles) {
            ctx.save();
            ctx.globalAlpha = p.life * 0.95;
            if (p.ring) {
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 3;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.ringR, 0, Math.PI * 2);
                ctx.stroke();
                // Second inner ring
                ctx.globalAlpha = p.life * 0.4;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.ringR * 0.7, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 1.2, 0, Math.PI * 2);
                ctx.fill();
                // Bright core
                ctx.fillStyle = '#FFFFFF';
                ctx.globalAlpha = p.life * 0.6;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    // ── Cloud Pop collision ──
    function checkPopCloudCollisions() {
        if (state !== PLAYING || !birdAlive) return;
        const bx = 70;
        const by = birdY;
        const br = BIRD_R;

        for (let i = popClouds.length - 1; i >= 0; i--) {
            const c = popClouds[i];
            if (!c.alive) continue;
            const dx = bx - c.x;
            const dy = by - c.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < br + c.r * 0.7) {
                c.alive = false;

                if (c.type === 'storm') {
                    // Storm cloud: shuffle bird color randomly
                    birdColorIdx = Math.floor(Math.random() * 4);
                    birdColorTimer = 0;
                    playStormShuffle();
                    spawnPopParticles(c.x, c.y, '#6B7280', 8);
                    floats.push({ x: c.x, y: c.y - 20, text: '⚡', life: 30, maxLife: 30 });
                    popClouds.splice(i, 1);
                    continue;
                }

                const colorMatch = c.type === 'golden' || c.colorIdx === birdColorIdx;

                if (colorMatch) {
                    // POP! Matching color or golden cloud
                    const baseScore = c.type === 'golden' ? CP_GOLDEN_SCORE : CP_POP_SCORE;

                    // Combo system
                    const now = performance.now();
                    if (comboTimer > 0 && (now - comboTimer) < CP_COMBO_WINDOW) {
                        comboCount++;
                    } else {
                        comboCount = 1;
                    }
                    comboTimer = now;
                    comboMultiplier = Math.max(1, comboCount >= 3 ? comboCount - 1 : 1);

                    const pts = baseScore * comboMultiplier;
                    score += pts;
                    cloudPopScore += pts;
                    playCloudPop();

                    // Particles
                    spawnPopParticles(c.x, c.y, c.color, 10);

                    // Score float
                    const comboText = comboMultiplier > 1 ? (' x' + comboMultiplier) : '';
                    floats.push({
                        x: c.x, y: c.y - 20,
                        text: '+' + pts + comboText,
                        life: 45, maxLife: 45
                    });

                    // Combo display
                    if (comboCount >= 3) {
                        playCombo();
                        comboDisplayText = comboCount + ' CHAIN!';
                        comboDisplayTimer = 50;
                    }

                    // Screen clear at 5+ chain
                    if (comboCount >= 5 && !screenClearActive) {
                        screenClearActive = true;
                        screenClearTimer = 20;
                        playScreenClear();
                        // Pop ALL visible clouds
                        for (let j = popClouds.length - 1; j >= 0; j--) {
                            if (popClouds[j].alive && j !== i) {
                                spawnPopParticles(popClouds[j].x, popClouds[j].y, popClouds[j].color, 6);
                                const bonusPts = popClouds[j].type === 'golden' ? CP_GOLDEN_SCORE : CP_POP_SCORE;
                                score += bonusPts;
                                floats.push({
                                    x: popClouds[j].x, y: popClouds[j].y - 15,
                                    text: '+' + bonusPts, life: 30, maxLife: 30
                                });
                                popClouds[j].alive = false;
                            }
                        }
                        popClouds = popClouds.filter(c2 => c2.alive);
                        comboDisplayText = 'CLOUD BURST!';
                        comboDisplayTimer = 70;
                    }
                } else {
                    // BOUNCE: wrong color
                    birdVel = CP_BOUNCE_VEL;
                    stunTimer = CP_STUN_FRAMES;
                    playCloudBounce();
                    spawnPopParticles(c.x, c.y, c.color, 4);
                    comboCount = 0; // break combo
                    comboTimer = 0;
                    floats.push({
                        x: c.x, y: c.y - 15,
                        text: 'BOUNCE', life: 25, maxLife: 25
                    });
                }

                popClouds.splice(i, 1);
            }
        }
    }

    // ── Colored pipe sections ──
    function addColoredSections(pipe) {
        if (level < 5) { pipe.colorSections = []; return; }
        const sections = [];
        const sectionCount = 2 + (level >= 7 ? 1 : 0);
        // Add colored stripes to top pipe
        for (let s = 0; s < sectionCount; s++) {
            const sectionH = 14 + Math.random() * 10;
            const sectionY = 20 + Math.random() * (pipe.topH - 40);
            sections.push({
                y: sectionY,
                h: sectionH,
                colorIdx: Math.floor(Math.random() * 4),
                pipe: 'top',
                popped: false
            });
        }
        // Add to bottom pipe
        for (let s = 0; s < sectionCount; s++) {
            const sectionH = 14 + Math.random() * 10;
            const sectionY = pipe.bottomY + 20 + Math.random() * (H - GROUND_H - pipe.bottomY - 40);
            sections.push({
                y: sectionY,
                h: sectionH,
                colorIdx: Math.floor(Math.random() * 4),
                pipe: 'bottom',
                popped: false
            });
        }
        pipe.colorSections = sections;
    }

    function drawPipeColorSections(pipe) {
        if (!pipe.colorSections) return;
        for (const s of pipe.colorSections) {
            if (s.popped) continue;
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = CP_COLORS[s.colorIdx];
            // Rounded stripe
            const sx = pipe.x + 3;
            const sw = PIPE_WIDTH - 6;
            ctx.beginPath();
            const cr = 3;
            ctx.moveTo(sx + cr, s.y);
            ctx.lineTo(sx + sw - cr, s.y);
            ctx.quadraticCurveTo(sx + sw, s.y, sx + sw, s.y + cr);
            ctx.lineTo(sx + sw, s.y + s.h - cr);
            ctx.quadraticCurveTo(sx + sw, s.y + s.h, sx + sw - cr, s.y + s.h);
            ctx.lineTo(sx + cr, s.y + s.h);
            ctx.quadraticCurveTo(sx, s.y + s.h, sx, s.y + s.h - cr);
            ctx.lineTo(sx, s.y + cr);
            ctx.quadraticCurveTo(sx, s.y, sx + cr, s.y);
            ctx.closePath();
            ctx.fill();
            // Highlight
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(sx + 4, s.y + 2, sw - 8, 3);
            ctx.restore();
        }
    }

    function checkColoredPipeSections() {
        if (state !== PLAYING || !birdAlive || level < 5) return false;
        const bx = 70;
        const by = birdY;
        const br = BIRD_R - 2;

        for (const p of pipes) {
            if (!p.colorSections) continue;
            // Only check if bird is horizontally within pipe
            if (bx + br <= p.x || bx - br >= p.x + PIPE_WIDTH) continue;

            for (const s of p.colorSections) {
                if (s.popped) continue;
                // Check if bird overlaps this section vertically
                if (by + br > s.y && by - br < s.y + s.h) {
                    if (s.colorIdx === birdColorIdx) {
                        // Match! Pop the section instead of dying
                        s.popped = true;
                        spawnPopParticles(p.x + PIPE_WIDTH / 2, s.y + s.h / 2, CP_COLORS[s.colorIdx], 8);
                        playCloudPop();
                        score += 25;
                        floats.push({
                            x: p.x + PIPE_WIDTH / 2, y: s.y - 10,
                            text: '+25 SAVE!', life: 40, maxLife: 40
                        });
                        return true; // signal that a section saved the bird
                    }
                }
            }
        }
        return false;
    }

    // ── Bird color aura drawing ──
    function drawBirdColorAura(x, y) {
        if (state !== PLAYING) return;
        const color = CP_COLORS[birdColorIdx];
        ctx.save();

        // Stun wobble
        if (stunTimer > 0) {
            const wobble = Math.sin(stunTimer * 0.8) * 3;
            ctx.translate(wobble, 0);
        }

        // Outer glow — wider, more visible
        ctx.globalAlpha = 0.45 + Math.sin(performance.now() * 0.005) * 0.15;
        ctx.shadowColor = color;
        ctx.shadowBlur = 28;
        ctx.fillStyle = color + '55';
        ctx.beginPath();
        ctx.arc(x, y, BIRD_R + 10, 0, Math.PI * 2);
        ctx.fill();

        // Second glow ring
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = color + '33';
        ctx.beginPath();
        ctx.arc(x, y, BIRD_R + 16, 0, Math.PI * 2);
        ctx.fill();

        // Inner ring — brighter
        ctx.globalAlpha = 0.65;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(x, y, BIRD_R + 4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    // ── Cloud Pop HUD ──
    function drawCloudPopHUD() {
        if (state !== PLAYING) return;

        // Color indicator top-right
        const indicatorX = W - 35;
        const indicatorY = 12;
        const indicatorR = 10;

        ctx.save();
        // Backdrop
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        roundRect(ctx, indicatorX - 16, indicatorY - 5, 32, 28, 6, true, false);

        // Current color circle
        const curColor = CP_COLORS[birdColorIdx];
        ctx.shadowColor = curColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = curColor;
        ctx.beginPath();
        ctx.arc(indicatorX, indicatorY + 8, indicatorR, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // White border
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Timer arc showing time until next color
        const progress = birdColorTimer / CP_CYCLE_MS;
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(indicatorX, indicatorY + 8, indicatorR + 3, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.stroke();

        ctx.restore();

        // Combo display (big center text)
        if (comboDisplayTimer > 0) {
            comboDisplayTimer--;
            const alpha = Math.min(1, comboDisplayTimer / 15);
            const scale = 1 + (1 - alpha) * 0.5;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(W / 2, H / 2 - 60);
            ctx.scale(scale, scale);
            ctx.font = 'bold 28px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#7C3AED';
            ctx.lineWidth = 4;
            ctx.strokeText(comboDisplayText, 0, 0);
            ctx.fillStyle = '#FBBF24';
            ctx.fillText(comboDisplayText, 0, 0);
            ctx.restore();
        }

        // Screen clear flash
        if (screenClearActive && screenClearTimer > 0) {
            screenClearTimer--;
            ctx.save();
            ctx.globalAlpha = screenClearTimer / 20 * 0.3;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
            if (screenClearTimer <= 0) screenClearActive = false;
        }
    }

    // ── Collision detection ──
    function checkCollision() {
        const bx = 70;
        const by = birdY;
        const br = BIRD_R - 2; // slightly forgiving

        // Ground
        if (by + br >= H - GROUND_H) return true;
        // Ceiling
        if (by - br <= 0) return true;

        // Pipes
        for (const p of pipes) {
            // Bird bounding box vs pipe rectangles
            const bLeft = bx - br;
            const bRight = bx + br;
            const bTop = by - br;
            const bBottom = by + br;

            // Pipe horizontal bounds
            if (bRight > p.x && bLeft < p.x + PIPE_WIDTH) {
                // Top pipe
                if (bTop < p.topH) return true;
                // Bottom pipe
                if (bBottom > p.bottomY) return true;
            }
        }
        return false;
    }

    // ── Input handling ──
    let inputBound = false;
    function handleInput(e) {
        if (!gameActive) return;
        if (e.type === 'keydown' && e.code !== 'Space') return;
        e.preventDefault();

        if (state === SPLASH) {
            startGame();
        } else if (state === PLAYING) {
            flap();
        } else if (state === GAMEOVER) {
            if (deathTimer <= 0) {
                resetToSplash();
            }
        }
    }

    function flap() {
        if (!birdAlive) return;
        birdVel = JUMP_VEL;
        birdWingUp = true;
        birdWingTimer = 8;
        playFlap();
    }

    function startGame() {
        state = PLAYING;
        score = 0;
        level = 1;
        birdY = H / 2 - 40;
        birdVel = 0;
        birdAngle = 0;
        birdWingUp = false;
        birdWingTimer = 0;
        birdAlive = true;
        pipes = [];
        floats = [];
        feathers = [];
        pipeTimer = 0;
        groundX = 0;
        gapSize = GAP_START;
        pipeSpeed = PIPE_SPEED_BASE;
        // Cloud Pop reset
        popClouds = [];
        popParticles = [];
        birdColorIdx = 0;
        birdColorTimer = 0;
        lastFrameTime = performance.now();
        comboCount = 0;
        comboTimer = 0;
        comboMultiplier = 1;
        comboDisplayTimer = 0;
        stunTimer = 0;
        cloudPopScore = 0;
        screenClearActive = false;
        screenClearTimer = 0;
        pipesSpawnedTotal = 0;
        flap(); // initial jump
    }

    function resetToSplash() {
        state = SPLASH;
        splashBounce = 0;
        splashDir = 1;
        pipes = [];
        floats = [];
        feathers = [];
        popClouds = [];
        popParticles = [];
        comboDisplayTimer = 0;
        screenClearActive = false;
    }

    function die() {
        birdAlive = false;
        playHit();
        setTimeout(playFall, 200);
        deathTimer = 60; // frames before allowing retry
        if (score > bestScore) {
            bestScore = score;
            try { localStorage.setItem('ywa_flappy_best', bestScore); } catch(e) {}
        }
        // Spawn feather burst
        spawnFeathers(70, birdY, TC[0] || playerColor());
        spawnFeathers(70, birdY, TC[2] || '#FFFFFF');
        state = GAMEOVER;
        if (onGameOver) {
            onGameOver({ score: score, level: level });
        }
    }

    // ── Main loop ──
    function update() {
        const now = performance.now();
        const dt = now - (lastFrameTime || now);
        lastFrameTime = now;

        updateClouds();
        updateHills();
        updateFeathers();
        updatePopParticles();

        if (state === PLAYING) {
            // Bird color cycling
            birdColorTimer += dt;
            if (birdColorTimer >= CP_CYCLE_MS) {
                birdColorTimer -= CP_CYCLE_MS;
                birdColorIdx = (birdColorIdx + 1) % 4;
            }

            // Stun timer countdown
            if (stunTimer > 0) stunTimer--;

            // Bird physics (capped terminal velocity for floaty feel)
            birdVel += GRAVITY;
            if (birdVel > 5.5) birdVel = 5.5;
            birdY += birdVel;

            // Rotation based on velocity (with stun wobble)
            birdAngle = Math.max(-0.5, Math.min(birdVel * 0.07, 1.4));
            if (stunTimer > 0) {
                birdAngle += Math.sin(stunTimer * 0.8) * 0.3;
            }

            // Wing animation
            if (birdWingTimer > 0) {
                birdWingTimer--;
                if (birdWingTimer <= 0) birdWingUp = false;
            }

            // Ground scroll
            groundX -= pipeSpeed;

            // Pipe spawning
            pipeTimer++;
            const spawnInterval = Math.floor(PIPE_SPACING / pipeSpeed);
            if (pipeTimer >= spawnInterval) {
                spawnPipe();
                pipeTimer = 0;
            }

            // Update pop clouds
            updatePopClouds(dt);

            // Check pop cloud collisions
            checkPopCloudCollisions();

            // Update pipes
            for (let i = pipes.length - 1; i >= 0; i--) {
                const p = pipes[i];
                p.x -= pipeSpeed;

                // Score when bird passes pipe center
                if (!p.scored && p.x + PIPE_WIDTH < 70) {
                    p.scored = true;
                    score++;
                    // Level based on pipes passed (every 10 pipes)
                    level = Math.floor(pipesSpawnedTotal / 10) + 1;
                    playScore();
                    floats.push({
                        x: 70, y: birdY - 30,
                        text: '+1', life: 40, maxLife: 40
                    });

                    // Difficulty scaling
                    gapSize = Math.max(GAP_MIN, GAP_START - (level - 1) * GAP_SHRINK);
                    pipeSpeed = PIPE_SPEED_BASE + level * 0.15;
                }

                // Remove offscreen pipes
                if (p.x < -PIPE_WIDTH - 10) {
                    pipes.splice(i, 1);
                }
            }

            // Collision — check colored pipe sections first for saves
            if (checkCollision()) {
                if (!checkColoredPipeSections()) {
                    die();
                }
            }
        } else if (state === GAMEOVER) {
            // Bird continues to fall
            birdVel += GRAVITY * 0.7;
            birdY += birdVel;
            birdAngle = Math.min(birdAngle + 0.05, 2);
            if (birdY > H - GROUND_H - BIRD_R) {
                birdY = H - GROUND_H - BIRD_R;
                birdVel = 0;
            }
            if (deathTimer > 0) deathTimer--;
            // Still scroll ground slowly to a stop
        }
    }

    function render() {
        // Sky
        drawCandySky();

        // Clouds (decorative behind everything)
        drawClouds();

        // Parallax hills
        drawHills();

        // Pop clouds (colored, between pipes and bird)
        drawAllPopClouds();

        // Pipes
        for (const p of pipes) {
            drawCandyPipe(p.x, p.topH, p.bottomY, gapSize);
            drawPipeColorSections(p);
        }

        // Ground
        drawCandyGround();

        // Feathers (in front of ground but behind bird during play)
        drawFeathers();

        // Pop particles (in front of pipes, behind bird)
        drawPopParticles();

        // Bird color aura
        if (state === PLAYING && birdAlive) {
            drawBirdColorAura(70, birdY);
        }

        // Bird
        if (state === PLAYING || state === GAMEOVER) {
            drawBird(70, birdY, birdAngle, birdWingUp, playerColor(), birdAlive);
        }

        // Floating texts
        drawFloats();

        // HUD
        if (state === PLAYING) {
            drawScore();
            drawHUD();
            drawCloudPopHUD();
        }

        // Splash overlay
        if (state === SPLASH) {
            drawHUD();
            drawSplash();
        }

        // Game over overlay
        if (state === GAMEOVER) {
            drawScore();
            drawGameOver();
        }
    }

    function loop() {
        if (!gameActive) return;
        if (!__allSpritesReady) {
            __drawLoadingScreen(canvas, ctx, 'FLAPPY MAE', '#F472B6');
            animFrame = requestAnimationFrame(loop);
            return;
        }
        update();
        render();
        __loadSprites(null);
        animFrame = requestAnimationFrame(loop);
    }

    // ── Resize: keep design res, CSS-scale to fill container ──
    function fitCanvas() {
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (cw < 10 || ch < 10) return;
        const aspect = W / H;
        let drawW, drawH;
        if (cw / ch > aspect) { drawH = ch; drawW = ch * aspect; }
        else { drawW = cw; drawH = cw / aspect; }
        canvas.style.width  = drawW + 'px';
        canvas.style.height = drawH + 'px';
    }

    // ── Public API ──
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        canvas.width = W;
        canvas.height = H;
        player = activePlayer || null;

        // Load theme from ArcadeThemes system
        const themeId = activePlayer?.theme || 'retro';
        theme = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        TC = theme ? theme.colors : ['#F43F5E','#EC4899','#F472B6','#FB923C','#FBBF24','#A78BFA'];
        TE = theme ? theme.blockEmoji : ['🍬','🍭','🧁','🍩','🍫','🍪','🍡'];
        TBG = theme ? theme.bgGradient : ['#2D1B3D', '#1A0B2E'];

        onGameOver = gameOverCallback || null;
        gameActive = true;

        // Reset state
        state = SPLASH;
        score = 0;
        level = 1;
        bestScore = parseInt(localStorage.getItem('ywa_flappy_best') || '0', 10);
        pipes = [];
        floats = [];
        feathers = [];
        birdY = H / 2;
        birdVel = 0;
        birdAngle = 0;
        birdWingUp = false;
        birdAlive = true;
        splashBounce = 0;
        splashDir = 1;
        deathTimer = 0;
        groundX = 0;
        gapSize = GAP_START;
        pipeSpeed = PIPE_SPEED_BASE;
        pipeTimer = 0;
        // Cloud Pop init
        popClouds = [];
        popParticles = [];
        birdColorIdx = 0;
        birdColorTimer = 0;
        lastFrameTime = performance.now();
        comboCount = 0;
        comboTimer = 0;
        comboMultiplier = 1;
        comboDisplayTimer = 0;
        stunTimer = 0;
        cloudPopScore = 0;
        screenClearActive = false;
        screenClearTimer = 0;
        pipesSpawnedTotal = 0;

        initClouds();
        initHills();
        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        // Bind input
        if (!inputBound) {
            canvas.addEventListener('click', handleInput);
            canvas.addEventListener('touchstart', handleInput, { passive: false });
            document.addEventListener('keydown', handleInput);
            window.addEventListener('resize', fitCanvas);
            inputBound = true;
        }

        // Start loop
        loop();
    }

    function destroy() {
        gameActive = false;
        if (animFrame) {
            cancelAnimationFrame(animFrame);
            animFrame = null;
        }
        if (canvas) {
            canvas.removeEventListener('click', handleInput);
            canvas.removeEventListener('touchstart', handleInput);
        }
        document.removeEventListener('keydown', handleInput);
        window.removeEventListener('resize', fitCanvas);
        inputBound = false;
        // Clean up audio
        if (audioCtx) {
            try { audioCtx.close(); } catch (e) {}
            audioCtx = null;
        }
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return level; },
        isActive() { return gameActive; }
    };
})();
