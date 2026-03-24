/* Breakout — Theme-aware brick breaker for Your World Arcade */
window.Maekout = (() => {

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
    // ── Constants ──
    const PADDLE_WIDTH_RATIO = 0.15;
    const PADDLE_HEIGHT = 14;
    const BALL_RADIUS = 7;
    const BALL_SPEED_BASE = 320;
    const BALL_SPEED_INCREMENT = 18;
    const BRICK_ROWS = 6;
    const BRICK_COLS = 8;
    const BRICK_PAD = 3;
    const LIVES_MAX = 3;
    const POWERUP_CHANCE = 0.12;
    const POWERUP_SPEED = 120;
    const POWERUP_DURATION = 8000;
    const TRAIL_LENGTH = 8;
    const PARTICLE_COUNT = 14;

    // Theme-driven — populated in init() from ArcadeThemes
    let BLOCK_COLORS = [];
    let theme = null;
    let bgColors = ['#1a1025', '#0d0a14']; // fallback bg

    const POWERUP_TYPES = [
        { id: 'wide',  label: 'W', color: '#22C55E', desc: 'Wide Paddle' },
        { id: 'multi', label: 'M', color: '#A855F7', desc: 'Multi-Ball' },
        { id: 'slow',  label: 'S', color: '#3B82F6', desc: 'Slow Ball' },
    ];

    // ── Level patterns ──
    function generateLevel(lvl) {
        const grid = [];
        const n = ((lvl - 1) % 5);
        for (let r = 0; r < BRICK_ROWS; r++) {
            grid[r] = [];
            for (let c = 0; c < BRICK_COLS; c++) {
                let alive = false;
                switch (n) {
                    case 0: alive = true; break;
                    case 1: { // Diamond
                        const cr = BRICK_ROWS / 2, cc = BRICK_COLS / 2;
                        const dr = Math.abs(r - cr) / cr, dc = Math.abs(c - cc) / cc;
                        alive = (dr + dc) <= 1.0;
                    } break;
                    case 2: alive = (r + c) % 2 === 0; break;
                    case 3: { // Heart
                        const hr = r, hc = c;
                        if (hr === 0 && (hc >= 1 && hc <= 2 || hc >= 5 && hc <= 6)) alive = true;
                        if (hr === 1 && (hc >= 0 && hc <= 3 || hc >= 4 && hc <= 7)) alive = true;
                        if (hr === 2 && hc >= 0 && hc <= 7) alive = true;
                        if (hr === 3 && hc >= 1 && hc <= 6) alive = true;
                        if (hr === 4 && hc >= 2 && hc <= 5) alive = true;
                        if (hr === 5 && hc >= 3 && hc <= 4) alive = true;
                    } break;
                    case 4: alive = Math.random() < 0.62; break;
                }
                grid[r][c] = alive ? 1 : 0;
            }
        }
        return grid;
    }

    // ── State ──
    let canvas, ctx, W, H;
    let score = 0, level = 1, lives = LIVES_MAX;
    let gameActive = false, paused = false, waitingLaunch = true;
    let animFrame = null;
    let player = null, onGameOver = null;
    let lastTime = 0, startTime = 0;
    let bricksDestroyed = 0;

    let paddle = {}, balls = [], bricks = [], particles = [], powerups = [];
    let floatingTexts = [], trail = [];
    let activePowerups = {};
    let brickArea = {};
    let lastHitColor = '#FFFFFF';
    let levelClearAnim = 0;
    let lifeLostAnim = 0;
    let shakeAmount = 0;
    let stars = [];

    // Input
    let keysDown = {};
    let mouseX = null;
    let touchActive = false;

    // Audio
    let audioCtx = null;
    function getAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
        }
        return audioCtx;
    }

    // ── Sound Effects ──
    function playPaddleHit() {
        const ac = getAudio(); if (!ac) return;
        const osc = ac.createOscillator(), g = ac.createGain();
        osc.connect(g); g.connect(ac.destination);
        osc.type = 'triangle'; osc.frequency.value = 280;
        g.gain.setValueAtTime(0.12, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.12);
    }

    function playBrickHit(row) {
        const ac = getAudio(); if (!ac) return;
        const osc = ac.createOscillator(), g = ac.createGain();
        osc.connect(g); g.connect(ac.destination);
        osc.type = 'sine';
        osc.frequency.value = 500 + (BRICK_ROWS - row) * 80;
        g.gain.setValueAtTime(0.1, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.1);
    }

    function playWallBounce() {
        const ac = getAudio(); if (!ac) return;
        const osc = ac.createOscillator(), g = ac.createGain();
        osc.connect(g); g.connect(ac.destination);
        osc.type = 'sine'; osc.frequency.value = 200;
        g.gain.setValueAtTime(0.05, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.06);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.06);
    }

    function playPowerup() {
        const ac = getAudio(); if (!ac) return;
        [523, 659, 784, 1047].forEach((freq, i) => {
            const osc = ac.createOscillator(), g = ac.createGain();
            osc.connect(g); g.connect(ac.destination);
            osc.type = 'sine'; osc.frequency.value = freq;
            const t = ac.currentTime + i * 0.07;
            g.gain.setValueAtTime(0.08, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc.start(t); osc.stop(t + 0.15);
        });
    }

    function playLifeLost() {
        const ac = getAudio(); if (!ac) return;
        [400, 320, 240, 180].forEach((freq, i) => {
            const osc = ac.createOscillator(), g = ac.createGain();
            osc.connect(g); g.connect(ac.destination);
            osc.type = 'sawtooth'; osc.frequency.value = freq;
            const t = ac.currentTime + i * 0.12;
            g.gain.setValueAtTime(0.08, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            osc.start(t); osc.stop(t + 0.2);
        });
    }

    function playLevelClear() {
        const ac = getAudio(); if (!ac) return;
        [523, 659, 784, 1047, 1319].forEach((freq, i) => {
            const osc = ac.createOscillator(), g = ac.createGain();
            osc.connect(g); g.connect(ac.destination);
            osc.type = 'sine'; osc.frequency.value = freq;
            const t = ac.currentTime + i * 0.1;
            g.gain.setValueAtTime(0.1, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc.start(t); osc.stop(t + 0.3);
        });
    }

    // ── Stars ──
    function generateStars() {
        stars = [];
        for (let i = 0; i < 60; i++) {
            stars.push({
                x: Math.random() * 1000,
                y: Math.random() * 1000,
                r: 0.5 + Math.random() * 1.5,
                twinkle: Math.random() * Math.PI * 2,
                speed: 0.5 + Math.random() * 1.5,
            });
        }
    }

    // ── Layout ──
    function calcLayout() {
        W = canvas.width;
        H = canvas.height;
        const margin = 50;
        const bw = (W - 20) / BRICK_COLS;
        const bh = Math.min(bw * 0.55, 30);
        brickArea = {
            x: (W - bw * BRICK_COLS) / 2,
            y: margin + 10,
            bw, bh,
            totalW: bw * BRICK_COLS,
            totalH: bh * BRICK_ROWS
        };
        const pw = activePowerups.wide && Date.now() < activePowerups.wide
            ? W * PADDLE_WIDTH_RATIO * 1.6
            : W * PADDLE_WIDTH_RATIO;
        paddle.w = pw;
        paddle.h = PADDLE_HEIGHT;
        paddle.y = H - 35;
        if (paddle.x === undefined) paddle.x = (W - pw) / 2;
        paddle.x = Math.max(0, Math.min(W - pw, paddle.x));
    }

    // ── Bricks (lollipops!) ──
    function buildBricks() {
        bricks = [];
        const layout = generateLevel(level);
        for (let r = 0; r < BRICK_ROWS; r++) {
            for (let c = 0; c < BRICK_COLS; c++) {
                if (layout[r][c]) {
                    const color = BLOCK_COLORS[r % BLOCK_COLORS.length];
                    bricks.push({
                        r, c, alive: true,
                        x: brickArea.x + c * brickArea.bw + BRICK_PAD,
                        y: brickArea.y + r * brickArea.bh + BRICK_PAD,
                        w: brickArea.bw - BRICK_PAD * 2,
                        h: brickArea.bh - BRICK_PAD * 2,
                        color,
                        score: (BRICK_ROWS - r) * 10,
                        flash: 0,
                        wobble: Math.random() * Math.PI * 2,
                    });
                }
            }
        }
    }

    // ── Ball ──
    function createBall(x, y, dx, dy) {
        const spd = BALL_SPEED_BASE + (level - 1) * BALL_SPEED_INCREMENT;
        const currentSpd = (activePowerups.slow && Date.now() < activePowerups.slow) ? spd * 0.6 : spd;
        return { x, y, dx, dy, speed: currentSpd, radius: BALL_RADIUS, alive: true };
    }

    function resetBall() {
        balls = [];
        waitingLaunch = true;
        trail = [];
    }

    function launchBall() {
        if (!waitingLaunch) return;
        waitingLaunch = false;
        const bx = paddle.x + paddle.w / 2;
        const by = paddle.y - BALL_RADIUS - 1;
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
        balls.push(createBall(bx, by, Math.cos(angle), Math.sin(angle)));
    }

    // ── Particles ──
    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < (count || PARTICLE_COUNT); i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 200;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.4 + Math.random() * 0.4,
                maxLife: 0.4 + Math.random() * 0.4,
                color: color || '#FFF',
                size: 2 + Math.random() * 4,
            });
        }
    }

    function spawnFloatingText(x, y, text, color) {
        floatingTexts.push({ x, y, text, color: color || '#FFF', life: 1.0, vy: -60 });
    }

    function spawnCelebration() {
        for (let i = 0; i < 60; i++) {
            const x = Math.random() * W;
            const y = Math.random() * H * 0.5;
            const c = BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)];
            spawnParticles(x, y, c.hex, 3);
        }
        try { if (window.Confetti) Confetti.rain(2000); } catch(e) {}
    }

    // ── Power-ups ──
    function maybeSpawnPowerup(brick) {
        if (Math.random() > POWERUP_CHANCE) return;
        const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
        powerups.push({
            x: brick.x + brick.w / 2,
            y: brick.y + brick.h / 2,
            type,
            vy: POWERUP_SPEED,
            size: 14,
            glow: 0,
        });
    }

    function applyPowerup(pu) {
        playPowerup();
        spawnFloatingText(pu.x, pu.y, pu.type.desc, pu.type.color);
        switch (pu.type.id) {
            case 'wide':
                activePowerups.wide = Date.now() + POWERUP_DURATION;
                calcLayout();
                break;
            case 'slow':
                activePowerups.slow = Date.now() + POWERUP_DURATION;
                balls.forEach(b => b.speed = (BALL_SPEED_BASE + (level - 1) * BALL_SPEED_INCREMENT) * 0.6);
                break;
            case 'multi':
                if (balls.length > 0 && balls.length < 12) {
                    const src = balls[0];
                    for (let i = 0; i < 2; i++) {
                        const angle = Math.atan2(src.dy, src.dx) + (i === 0 ? -0.4 : 0.4);
                        balls.push(createBall(src.x, src.y, Math.cos(angle), Math.sin(angle)));
                    }
                }
                break;
        }
    }

    // ── Collision ──
    function ballVsBricks(ball) {
        for (let i = bricks.length - 1; i >= 0; i--) {
            const br = bricks[i];
            if (!br.alive) continue;
            const closestX = Math.max(br.x, Math.min(ball.x, br.x + br.w));
            const closestY = Math.max(br.y, Math.min(ball.y, br.y + br.h));
            const dx = ball.x - closestX, dy = ball.y - closestY;
            if (dx * dx + dy * dy < ball.radius * ball.radius) {
                br.alive = false;
                br.flash = 0.3;
                score += br.score;
                bricksDestroyed++;
                lastHitColor = br.color.hex;
                spawnParticles(br.x + br.w / 2, br.y + br.h / 2, br.color.hex, PARTICLE_COUNT);
                spawnParticles(br.x + br.w / 2, br.y + br.h / 2, br.color.light, 6);
                spawnFloatingText(br.x + br.w / 2, br.y, '+' + br.score, br.color.light);
                playBrickHit(br.r);
                maybeSpawnPowerup(br);
                // Big pop confetti
                if (bricksDestroyed % 10 === 0) {
                    try { if (window.Confetti) Confetti.burst(br.x + br.w/2, br.y + br.h/2, 10); } catch(e) {}
                }
                const overlapX = ball.radius - Math.abs(dx);
                const overlapY = ball.radius - Math.abs(dy);
                if (overlapX < overlapY) ball.dx = -ball.dx;
                else ball.dy = -ball.dy;
                if (bricks.every(b => !b.alive)) levelClear();
                return;
            }
        }
    }

    function ballVsPaddle(ball) {
        if (ball.dy < 0) return;
        if (ball.y + ball.radius >= paddle.y &&
            ball.y - ball.radius <= paddle.y + paddle.h &&
            ball.x >= paddle.x &&
            ball.x <= paddle.x + paddle.w) {
            const hit = (ball.x - paddle.x) / paddle.w;
            const angle = (hit - 0.5) * Math.PI * 0.7;
            ball.dx = Math.sin(angle);
            ball.dy = -Math.cos(angle);
            ball.y = paddle.y - ball.radius - 1;
            const mag = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
            ball.dx /= mag; ball.dy /= mag;
            playPaddleHit();
            shakeAmount = 2;
        }
    }

    function ballVsWalls(ball) {
        if (ball.x - ball.radius <= 0) {
            ball.x = ball.radius; ball.dx = Math.abs(ball.dx); playWallBounce();
        }
        if (ball.x + ball.radius >= W) {
            ball.x = W - ball.radius; ball.dx = -Math.abs(ball.dx); playWallBounce();
        }
        if (ball.y - ball.radius <= 0) {
            ball.y = ball.radius; ball.dy = Math.abs(ball.dy); playWallBounce();
        }
        if (ball.y - ball.radius > H + 10) ball.alive = false;
    }

    // ── Game flow ──
    function levelClear() {
        playLevelClear();
        levelClearAnim = 2.0;
        spawnCelebration();
        level++;
        setTimeout(() => {
            buildBricks();
            resetBall();
            activePowerups = {};
            calcLayout();
            levelClearAnim = 0;
        }, 1800);
    }

    function loseLife() {
        playLifeLost();
        lives--;
        lifeLostAnim = 1.0;
        shakeAmount = 5;
        if (lives <= 0) {
            gameActive = false;
            const duration = Math.floor((Date.now() - startTime) / 1000);
            setTimeout(() => {
                if (onGameOver) onGameOver({ score, level, duration, bricksDestroyed });
            }, 1200);
        } else {
            resetBall();
        }
    }

    // ── Update ──
    function update(dt) {
        if (!gameActive || paused) return;
        if (levelClearAnim > 0) { levelClearAnim -= dt; return; }

        const now = Date.now();
        if (activePowerups.wide && now >= activePowerups.wide) {
            delete activePowerups.wide; calcLayout();
        }
        if (activePowerups.slow && now >= activePowerups.slow) {
            delete activePowerups.slow;
            balls.forEach(b => b.speed = BALL_SPEED_BASE + (level - 1) * BALL_SPEED_INCREMENT);
        }

        // Paddle input
        const paddleSpeed = 500;
        if (keysDown['ArrowLeft'] || keysDown['a']) paddle.x -= paddleSpeed * dt;
        if (keysDown['ArrowRight'] || keysDown['d']) paddle.x += paddleSpeed * dt;
        if (mouseX !== null) paddle.x = mouseX - paddle.w / 2;
        paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

        const pw = activePowerups.wide && Date.now() < activePowerups.wide
            ? W * PADDLE_WIDTH_RATIO * 1.6 : W * PADDLE_WIDTH_RATIO;
        if (Math.abs(paddle.w - pw) > 1) {
            paddle.w = pw;
            paddle.x = Math.max(0, Math.min(W - pw, paddle.x));
        }

        // Update balls
        for (let i = balls.length - 1; i >= 0; i--) {
            const b = balls[i];
            b.x += b.dx * b.speed * dt;
            b.y += b.dy * b.speed * dt;
            ballVsBricks(b);
            ballVsPaddle(b);
            ballVsWalls(b);
            if (!b.alive) balls.splice(i, 1);
        }

        if (!waitingLaunch && balls.length === 0) loseLife();

        // Trail
        if (balls.length > 0) {
            trail.push({ x: balls[0].x, y: balls[0].y, color: lastHitColor });
            if (trail.length > TRAIL_LENGTH) trail.shift();
        }

        // Powerups fall
        for (let i = powerups.length - 1; i >= 0; i--) {
            const pu = powerups[i];
            pu.y += pu.vy * dt;
            pu.glow += dt * 4;
            if (pu.y + pu.size >= paddle.y && pu.y - pu.size <= paddle.y + paddle.h &&
                pu.x >= paddle.x && pu.x <= paddle.x + paddle.w) {
                applyPowerup(pu); powerups.splice(i, 1); continue;
            }
            if (pu.y > H + 20) powerups.splice(i, 1);
        }

        // Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.vy += 200 * dt;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Floating texts
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            const ft = floatingTexts[i];
            ft.y += ft.vy * dt; ft.life -= dt;
            if (ft.life <= 0) floatingTexts.splice(i, 1);
        }

        if (shakeAmount > 0) shakeAmount *= 0.9;
        if (shakeAmount < 0.1) shakeAmount = 0;
        if (lifeLostAnim > 0) lifeLostAnim -= dt;

        // Brick wobble animation
        bricks.forEach(b => {
            if (b.alive) b.wobble += dt * 1.2;
            if (b.flash > 0) b.flash -= dt;
        });
    }

    // ── Color helpers ──
    function shadeColor(hex, amt) {
        let c = hex.replace('#', '');
        if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
        const num = parseInt(c, 16);
        let r = Math.min(255, Math.max(0, (num >> 16)         + amt));
        let g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
        let b = Math.min(255, Math.max(0, (num & 0xff)        + amt));
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    // ── Draw helpers — theme-aware brick rendering ──
    function drawBrick(x, y, w, h, color, wobblePhase) {
        const style = theme ? theme.blockStyle : 'round';
        const r = Math.min(w, h) * 0.18;
        ctx.save();

        // Enhanced glow
        ctx.shadowColor = color.hex;
        ctx.shadowBlur = 8;

        if (style === 'pixel') {
            // Flat pixel block with inner border
            ctx.fillStyle = color.hex;
            ctx.fillRect(x, y, w, h);
            ctx.shadowBlur = 0;
            ctx.strokeStyle = color.light;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
            // Dark bottom/right edge
            ctx.strokeStyle = color.dark;
            ctx.beginPath();
            ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
            ctx.stroke();
            // Pixel shine
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(x + 2, y + 2, w * 0.4, 2);
        } else if (style === 'sharp') {
            // Angular block with chevron highlight
            ctx.fillStyle = color.hex;
            ctx.beginPath();
            ctx.moveTo(x + 2, y); ctx.lineTo(x + w - 2, y);
            ctx.lineTo(x + w, y + 2); ctx.lineTo(x + w, y + h - 2);
            ctx.lineTo(x + w - 2, y + h); ctx.lineTo(x + 2, y + h);
            ctx.lineTo(x, y + h - 2); ctx.lineTo(x, y + 2);
            ctx.closePath(); ctx.fill();
            ctx.shadowBlur = 0;
            // Chevron accent
            ctx.fillStyle = color.light;
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.moveTo(x + 2, y); ctx.lineTo(x + w / 2, y + h * 0.35);
            ctx.lineTo(x + w - 2, y); ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 1;
            // Edge highlight
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(x + 2, y); ctx.lineTo(x + w - 2, y);
            ctx.stroke();
        } else if (style === 'jagged') {
            // Irregular rocky block
            ctx.fillStyle = color.hex;
            ctx.beginPath();
            ctx.moveTo(x + 3, y + 1); ctx.lineTo(x + w * 0.3, y);
            ctx.lineTo(x + w * 0.7, y + 2); ctx.lineTo(x + w - 2, y);
            ctx.lineTo(x + w, y + h * 0.4); ctx.lineTo(x + w - 1, y + h);
            ctx.lineTo(x + w * 0.6, y + h - 1); ctx.lineTo(x + w * 0.3, y + h);
            ctx.lineTo(x, y + h * 0.6); ctx.closePath(); ctx.fill();
            ctx.shadowBlur = 0;
            // Inner texture lines
            ctx.strokeStyle = color.dark;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(x + w * 0.2, y + h * 0.3);
            ctx.lineTo(x + w * 0.8, y + h * 0.5);
            ctx.stroke();
            ctx.globalAlpha = 1;
            // Rock highlights
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.beginPath();
            ctx.arc(x + w * 0.35, y + h * 0.3, 3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Round (default) — rounded rect with enhanced gradient + shine
            const grad = ctx.createLinearGradient(x, y, x, y + h);
            grad.addColorStop(0, color.light);
            grad.addColorStop(0.35, color.hex);
            grad.addColorStop(0.65, color.hex);
            grad.addColorStop(1, color.dark);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
            ctx.fill();

            // Neon edge stroke
            ctx.shadowBlur = 0;
            ctx.strokeStyle = color.light;
            ctx.globalAlpha = 0.25;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
            ctx.stroke();
            ctx.globalAlpha = 1;

            // Glossy shine highlight (elongated)
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.ellipse(x + w * 0.35, y + h * 0.22, w * 0.25, h * 0.15, -0.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.15;
            ctx.beginPath();
            ctx.roundRect(x + 3, y + 1, w - 6, h * 0.35, [r, r, 0, 0]);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Bottom edge shadow
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.beginPath();
            ctx.roundRect(x + 2, y + h - 3, w - 4, 3, [0, 0, r, r]);
            ctx.fill();
        }

        // Emoji overlay (all styles)
        if (color.emoji && w > 16) {
            ctx.shadowBlur = 0;
            const fs = Math.min(w * 0.5, h * 0.7, 16);
            ctx.font = fs + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(color.emoji, x + w / 2, y + h / 2 + 1);
        }
        ctx.restore();
    }

    // ── Draw ──
    function draw() {
        ctx.save();

        if (shakeAmount > 0) {
            const sx = (Math.random() - 0.5) * shakeAmount * 2;
            const sy = (Math.random() - 0.5) * shakeAmount * 2;
            ctx.translate(sx, sy);
        }

        // Background gradient (themed)
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, bgColors[0]);
        bgGrad.addColorStop(1, bgColors[1]);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(-5, -5, W + 10, H + 10);

        // Stars
        const t = Date.now() / 1000;
        stars.forEach(s => {
            const sx = (s.x / 1000) * W;
            const sy = (s.y / 1000) * H;
            const alpha = 0.3 + 0.4 * Math.sin(t * s.speed + s.twinkle);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // Themed bricks!
        bricks.forEach(br => {
            if (!br.alive) return;
            drawBrick(br.x, br.y, br.w, br.h, br.color, br.wobble);

            // Flash on nearby break
            if (br.flash > 0) {
                ctx.save();
                ctx.globalAlpha = br.flash;
                ctx.fillStyle = '#FFF';
                ctx.beginPath();
                ctx.roundRect(br.x - 2, br.y - 2, br.w + 4, br.h + 4, 4);
                ctx.fill();
                ctx.restore();
            }
        });

        // Trail with glow effect
        trail.forEach((tp, i) => {
            const frac = (i + 1) / trail.length;
            const alpha = frac * 0.45;
            const rad = BALL_RADIUS * (0.2 + 0.8 * frac);
            ctx.save();
            ctx.globalAlpha = alpha;
            // Glow halo
            const trailGrad = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, rad * 1.8);
            trailGrad.addColorStop(0, tp.color);
            trailGrad.addColorStop(0.5, tp.color);
            trailGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = trailGrad;
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, rad * 1.8, 0, Math.PI * 2);
            ctx.fill();
            // Core dot
            ctx.globalAlpha = alpha * 1.5;
            ctx.fillStyle = tp.color;
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, rad * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // Balls — enhanced jawbreaker style with glow
        balls.forEach(b => {
            ctx.save();
            // Outer glow ring
            ctx.shadowColor = lastHitColor;
            ctx.shadowBlur = 18;
            ctx.strokeStyle = lastHitColor;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.25;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;

            // Main ball with gradient
            ctx.shadowBlur = 14;
            const grad = ctx.createRadialGradient(b.x - 2, b.y - 2, 0, b.x, b.y, b.radius);
            grad.addColorStop(0, '#FFFFFF');
            grad.addColorStop(0.3, '#FDE68A');
            grad.addColorStop(0.7, '#F59E0B');
            grad.addColorStop(1, '#B45309');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.fill();

            // Specular highlight
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(b.x - 2, b.y - 2, b.radius * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.ellipse(b.x, b.y - b.radius * 0.3, b.radius * 0.5, b.radius * 0.2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // Ball on paddle (waiting)
        if (waitingLaunch) {
            const bx = paddle.x + paddle.w / 2;
            const by = paddle.y - BALL_RADIUS - 1;
            ctx.save();
            // Pulsing glow
            const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 200);
            ctx.shadowColor = '#FDE68A';
            ctx.shadowBlur = 10 + pulse * 6;
            const grad = ctx.createRadialGradient(bx - 2, by - 2, 0, bx, by, BALL_RADIUS);
            grad.addColorStop(0, '#FFFFFF');
            grad.addColorStop(0.3, '#FDE68A');
            grad.addColorStop(0.7, '#F59E0B');
            grad.addColorStop(1, '#B45309');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(bx, by, BALL_RADIUS, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            // Specular
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(bx - 2, by - 2, BALL_RADIUS * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            if (gameActive) {
                ctx.save();
                ctx.globalAlpha = 0.5 + 0.3 * Math.sin(Date.now() / 300);
                ctx.fillStyle = '#DDD';
                ctx.shadowColor = '#FDE68A';
                ctx.shadowBlur = 6;
                ctx.font = 'bold 12px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('SPACE / TAP to launch', W / 2, paddle.y - 28);
                ctx.restore();
            }
        }

        // Paddle — neon glow themed
        {
            const pc = BLOCK_COLORS[0] || { hex: '#EC4899', light: '#F9A8D4', dark: '#BE185D' };
            const pc2 = BLOCK_COLORS[1] || pc;
            ctx.save();
            const pr = paddle.h / 2;

            // Outer neon glow (double layer)
            ctx.shadowColor = pc.hex;
            ctx.shadowBlur = activePowerups.wide ? 28 : 18;
            ctx.fillStyle = 'rgba(0,0,0,0)';
            ctx.beginPath();
            ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, pr);
            ctx.fill();

            // Main body gradient
            const pg = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
            pg.addColorStop(0, pc.light);
            pg.addColorStop(0.4, pc.hex);
            pg.addColorStop(0.6, pc.hex);
            pg.addColorStop(1, pc.dark);
            ctx.fillStyle = pg;
            ctx.shadowBlur = activePowerups.wide ? 22 : 14;
            ctx.beginPath();
            ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, pr);
            ctx.fill();

            // Neon edge stroke
            ctx.shadowBlur = 8;
            ctx.strokeStyle = pc.light;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, pr);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Accent stripe down the middle
            ctx.fillStyle = pc2.hex;
            ctx.globalAlpha = 0.3;
            ctx.fillRect(paddle.x + paddle.w * 0.4, paddle.y + 1, paddle.w * 0.2, paddle.h - 2);
            ctx.globalAlpha = 1;

            // Glossy top highlight
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.ellipse(paddle.x + paddle.w / 2, paddle.y + 3, paddle.w * 0.35, 3, 0, 0, Math.PI * 2);
            ctx.fill();

            // Core bright line
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = pc.light;
            ctx.beginPath();
            ctx.roundRect(paddle.x + 8, paddle.y + paddle.h / 2 - 0.5, paddle.w - 16, 1, 1);
            ctx.fill();
            ctx.restore();
        }

        // Power-ups — glowing capsule design
        powerups.forEach(pu => {
            ctx.save();
            const glowPulse = 8 + Math.sin(pu.glow) * 4;
            const capsuleW = pu.size * 2.2;
            const capsuleH = pu.size * 1.2;

            // Outer glow
            ctx.shadowColor = pu.type.color;
            ctx.shadowBlur = glowPulse;

            // Capsule body with gradient
            const capGrad = ctx.createLinearGradient(pu.x, pu.y - capsuleH / 2, pu.x, pu.y + capsuleH / 2);
            capGrad.addColorStop(0, pu.type.color);
            capGrad.addColorStop(0.5, pu.type.color);
            capGrad.addColorStop(1, shadeColor(pu.type.color, -40));
            ctx.fillStyle = capGrad;
            ctx.beginPath();
            ctx.roundRect(pu.x - capsuleW / 2, pu.y - capsuleH / 2, capsuleW, capsuleH, capsuleH / 2);
            ctx.fill();

            // Neon edge
            ctx.strokeStyle = shadeColor(pu.type.color, 40);
            ctx.lineWidth = 1;
            ctx.shadowBlur = glowPulse * 0.5;
            ctx.beginPath();
            ctx.roundRect(pu.x - capsuleW / 2, pu.y - capsuleH / 2, capsuleW, capsuleH, capsuleH / 2);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Glossy highlight
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.ellipse(pu.x, pu.y - capsuleH * 0.18, capsuleW * 0.35, capsuleH * 0.2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Label
            ctx.fillStyle = '#FFF';
            ctx.font = 'bold 12px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(pu.type.label, pu.x, pu.y + 1);
            ctx.restore();
        });

        // Particles with glow
        particles.forEach(p => {
            ctx.save();
            const lifeRatio = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = lifeRatio;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 6;
            const sz = p.size * lifeRatio;
            // Some particles are debris (rectangular)
            if (Math.random() > 0.7 && sz > 2) {
                ctx.translate(p.x, p.y);
                ctx.rotate(p.life * 5);
                ctx.fillRect(-sz / 2, -sz / 2, sz, sz * 0.6);
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        });

        // Floating texts with glow
        floatingTexts.forEach(ft => {
            ctx.save();
            const alpha = Math.max(0, ft.life);
            const scale = 1 + (1 - alpha) * 0.25;
            ctx.globalAlpha = alpha;
            ctx.translate(ft.x, ft.y);
            ctx.scale(scale, scale);
            ctx.shadowColor = ft.color;
            ctx.shadowBlur = 10;
            ctx.fillStyle = ft.color;
            ctx.font = 'bold 14px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 2;
            ctx.strokeText(ft.text, 0, 0);
            ctx.fillText(ft.text, 0, 0);
            ctx.restore();
        });

        // Vignette overlay
        const vigGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8);
        vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vigGrad.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, W, H);

        drawHUD();

        // Level clear overlay
        if (levelClearAnim > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, levelClearAnim);
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#FDE68A';
            ctx.font = 'bold 36px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((theme ? theme.icon + ' ' : '') + 'LEVEL CLEAR!', W / 2, H / 2 - 10);
            ctx.font = '18px "Segoe UI", sans-serif';
            ctx.fillStyle = '#AAA';
            ctx.fillText('Level ' + level + ' incoming...', W / 2, H / 2 + 25);
            ctx.restore();
        }

        // Life lost flash
        if (lifeLostAnim > 0) {
            ctx.save();
            ctx.globalAlpha = lifeLostAnim * 0.3;
            ctx.fillStyle = '#F43F5E';
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        // Game over
        if (!gameActive && lives <= 0) {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#F43F5E';
            ctx.font = 'bold 40px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('GAME OVER', W / 2, H / 2 - 30);
            ctx.fillStyle = '#FDE68A';
            ctx.font = '22px "Segoe UI", sans-serif';
            ctx.fillText('Score: ' + score.toLocaleString(), W / 2, H / 2 + 10);
            ctx.fillStyle = '#94A3B8';
            ctx.font = '14px "Segoe UI", sans-serif';
            ctx.fillText('🧱 ' + bricksDestroyed + ' bricks smashed!', W / 2, H / 2 + 40);
            ctx.restore();
        }

        ctx.restore();
    }

    function drawHUD() {
        const hudY = 14;

        // Rainbow title
        ctx.save();
        ctx.font = 'bold 16px "Segoe UI", sans-serif';
        ctx.textBaseline = 'top';
        const titleGrad = ctx.createLinearGradient(0, hudY, 100, hudY + 18);
        titleGrad.addColorStop(0, '#EC4899');
        titleGrad.addColorStop(0.5, '#F59E0B');
        titleGrad.addColorStop(1, '#A855F7');
        ctx.fillStyle = titleGrad;
        ctx.textAlign = 'left';
        ctx.fillText('🏓 BREAKOUT', 10, hudY);
        ctx.restore();

        // Player
        if (player) {
            ctx.save();
            ctx.font = '12px "Segoe UI", sans-serif';
            ctx.fillStyle = '#888';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText((player.emoji || '') + ' ' + (player.name || 'Player'), 10, hudY + 20);
            ctx.restore();
        }

        // Score
        ctx.save();
        ctx.font = 'bold 15px "Segoe UI", sans-serif';
        ctx.fillStyle = '#FDE68A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('SCORE ' + score.toLocaleString(), W / 2, hudY);
        ctx.restore();

        // Level + Lives
        ctx.save();
        ctx.font = '13px "Segoe UI", sans-serif';
        ctx.fillStyle = '#67E8F9';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('LVL ' + level, W - 10, hudY);
        ctx.fillStyle = '#F43F5E';
        ctx.font = '14px "Segoe UI", sans-serif';
        let livesStr = '';
        for (let i = 0; i < lives; i++) livesStr += '\u2665 ';
        ctx.fillText(livesStr.trim(), W - 10, hudY + 18);
        ctx.restore();

        // Active powerup indicators
        const puLabels = [];
        if (activePowerups.wide && Date.now() < activePowerups.wide) {
            const secs = Math.ceil((activePowerups.wide - Date.now()) / 1000);
            puLabels.push({ label: '✨ WIDE ' + secs + 's', color: '#22C55E' });
        }
        if (activePowerups.slow && Date.now() < activePowerups.slow) {
            const secs = Math.ceil((activePowerups.slow - Date.now()) / 1000);
            puLabels.push({ label: '🐌 SLOW ' + secs + 's', color: '#3B82F6' });
        }
        puLabels.forEach((pl, i) => {
            ctx.save();
            ctx.font = 'bold 10px "Segoe UI", sans-serif';
            ctx.fillStyle = pl.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(pl.label, W / 2, hudY + 18 + i * 14);
            ctx.restore();
        });
    }

    // ── Game loop ──
    function gameLoop(ts) {
        if (!gameActive && lives > 0) { animFrame = requestAnimationFrame(gameLoop); return; }
        const dt = Math.min((ts - lastTime) / 1000, 0.05);
        lastTime = ts;
        update(dt);
        draw();
        if (gameActive || particles.length > 0 || lifeLostAnim > 0) {
            animFrame = requestAnimationFrame(gameLoop);
        } else {
            draw();
        }
    }

    // ── Input handlers ──
    function onKeyDown(e) {
        if (!gameActive) return;
        e.stopPropagation();
        keysDown[e.key] = true;
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            launchBall();
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
    }
    function onKeyUp(e) {
        delete keysDown[e.key];
    }
    function onMouseMove(e) {
        if (!gameActive) return;
        const rect = canvas.getBoundingClientRect();
        mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    }
    function onMouseLeave() { mouseX = null; }
    function onClick(e) {
        if (!gameActive) return;
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        launchBall();
    }
    function onTouchStart(e) {
        if (!gameActive) return;
        e.preventDefault();
        touchActive = true;
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        const rect = canvas.getBoundingClientRect();
        if (e.touches.length > 0) {
            mouseX = (e.touches[0].clientX - rect.left) * (canvas.width / rect.width);
        }
        launchBall();
    }
    function onTouchMove(e) {
        if (!gameActive) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        if (e.touches.length > 0) {
            mouseX = (e.touches[0].clientX - rect.left) * (canvas.width / rect.width);
        }
    }
    function onTouchEnd(e) {
        if (e.touches.length === 0) { touchActive = false; mouseX = null; }
    }

    function bindEvents() {
        document.addEventListener('keydown', onKeyDown, { capture: true });
        document.addEventListener('keyup', onKeyUp, { capture: true });
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseleave', onMouseLeave);
        canvas.addEventListener('click', onClick);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd);
    }

    function unbindEvents() {
        document.removeEventListener('keydown', onKeyDown, { capture: true });
        document.removeEventListener('keyup', onKeyUp, { capture: true });
        if (canvas) {
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseleave', onMouseLeave);
            canvas.removeEventListener('click', onClick);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
    }

    // ── Public API ──
    function init(canvasEl, activePlayer, gameOverCallback) {
        destroy(); // Clean up any previous instance
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer;
        onGameOver = gameOverCallback;

        // Load theme
        const themeId = activePlayer?.theme || 'retro';
        theme = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (theme) {
            BLOCK_COLORS = theme.colors.map((hex, i) => ({
                hex,
                light: ArcadeThemes.lighten(hex, 30),
                dark: ArcadeThemes.darken(hex, 20),
                emoji: (theme.blockEmoji && theme.blockEmoji[i]) || ''
            }));
            bgColors = theme.bgGradient || ['#1a1025', '#0d0a14'];
        } else {
            BLOCK_COLORS = [
                { hex: '#F43F5E', light: '#FDA4AF', dark: '#BE123C', emoji: '' },
                { hex: '#A855F7', light: '#D8B4FE', dark: '#7C3AED', emoji: '' },
                { hex: '#3B82F6', light: '#93C5FD', dark: '#1D4ED8', emoji: '' },
                { hex: '#22C55E', light: '#86EFAC', dark: '#15803D', emoji: '' },
                { hex: '#F59E0B', light: '#FDE68A', dark: '#B45309', emoji: '' },
                { hex: '#EC4899', light: '#F9A8D4', dark: '#BE185D', emoji: '' },
                { hex: '#06B6D4', light: '#67E8F9', dark: '#0891B2', emoji: '' },
            ];
            bgColors = ['#1a1025', '#0d0a14'];
        }

        const parent = canvas.parentElement;
        if (parent) {
            canvas.width = Math.max(200, parent.clientWidth || 480);
            canvas.height = Math.max(300, parent.clientHeight || 640);
        }
        if (canvas.width < 100) canvas.width = 480;
        if (canvas.height < 100) canvas.height = 640;

        // Delayed refit for container layout settling
        requestAnimationFrame(() => {
            if (!canvas || !canvas.parentElement) return;
            const p = canvas.parentElement;
            const pw = Math.max(200, p.clientWidth || 480);
            const ph = Math.max(300, p.clientHeight || 640);
            if (pw !== canvas.width || ph !== canvas.height) {
                canvas.width = pw; canvas.height = ph;
                calcLayout();
            }
        });

        score = 0; level = 1; lives = LIVES_MAX;
        gameActive = true; paused = false; waitingLaunch = true;
        balls = []; particles = []; powerups = [];
        floatingTexts = []; trail = [];
        activePowerups = {};
        keysDown = {}; mouseX = null;
        lastHitColor = '#FFFFFF';
        levelClearAnim = 0; lifeLostAnim = 0; shakeAmount = 0;
        bricksDestroyed = 0;
        startTime = Date.now();

        generateStars();
        paddle = { x: undefined, y: 0, w: 0, h: PADDLE_HEIGHT };
        calcLayout();
        paddle.x = (W - paddle.w) / 2;
        buildBricks();

        bindEvents();
        lastTime = performance.now();
        animFrame = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        unbindEvents();
        if (audioCtx) {
            try { audioCtx.close(); } catch(e) {}
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
