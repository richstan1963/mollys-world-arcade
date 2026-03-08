/* MollyPong — Theme-aware Pong for Your World Arcade */
window.MollyPong = (() => {
    // ── Constants ──────────────────────────────────────────────
    const BASE_W = 480, BASE_H = 640;
    const WIN_SCORE      = 7;
    const PADDLE_W       = 80;
    const PADDLE_H       = 12;
    const PADDLE_RADIUS  = 6;
    const PADDLE_MARGIN  = 30;       // distance from top/bottom edge
    const BALL_R         = 10;
    const BALL_SPEED_0   = 5.0;      // starting speed (px per frame)
    const BALL_SPEED_INC = 1.08;     // 8 % faster each point
    const MAX_ANGLE      = Math.PI / 3;   // 60 ° max deflection
    const TRAIL_LEN      = 8;
    const SERVE_PAUSE    = 1500;     // ms pause after a point
    const SHAKE_FRAMES   = 3;

    // AI tuning per level (index 0 = level 1)
    const AI_SPEED  = [2.8, 3.2, 3.6, 4.0, 4.5, 5.2, 6.0];
    const AI_REACT  = [0.35, 0.42, 0.50, 0.60, 0.70, 0.82, 0.95];

    // Palette (theme-overridable)
    let BG_TOP      = '#0F1117';
    let BG_BOT      = '#1a1a2e';
    let DEFAULT_CLR = '#F472B6';
    let AI_CLR      = '#8B5CF6';
    const BALL_CLR  = '#ffffff';
    let GLOW_CLR    = '#F472B6';

    // ── Game states ───────────────────────────────────────────
    const ST_TITLE   = 0;
    const ST_PLAYING = 1;
    const ST_SCORED  = 2;
    const ST_OVER    = 3;

    // ── Module-level variables ────────────────────────────────
    let canvas, ctx, W, H, scale;
    let state, gameActive;
    let animFrame  = null;
    let audioCtx   = null;
    let player     = null;
    let onGameOver = null;

    // Scores & stats
    let playerScore, aiScore, level, score;
    let startTime, totalRallies, longestRally, currentRally;
    let ballSpeed;

    // Objects
    let playerX, aiX;          // paddle center-X
    let ballX, ballY, bvx, bvy;
    let trail;

    // Serve / scoring
    let lastScorer;            // 'player' | 'ai'
    let serveTimer;

    // Effects
    let particles;
    let shakeTimer, shakeX, shakeY;
    let titleBallX, titleBallY, titleBVX, titleBVY; // demo ball

    // Input
    let keys, mouseX, touchX, inputActive;

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
            const t  = when || ac.currentTime;
            const o  = ac.createOscillator();
            const g  = ac.createGain();
            o.type   = type || 'square';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(vol || 0.10, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.1));
            o.connect(g);
            g.connect(ac.destination);
            o.start(t);
            o.stop(t + (dur || 0.1));
        } catch { /* swallow */ }
    }

    function playBounce()  { tone(660, 0.07, 'square',   0.10); }
    function playWall()    { tone(330, 0.06, 'triangle',  0.08); }
    function playScore()   {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        tone(523, 0.12, 'sine', 0.12, t);
        tone(659, 0.12, 'sine', 0.12, t + 0.10);
        tone(784, 0.18, 'sine', 0.12, t + 0.20);
    }
    function playLose() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        tone(440, 0.18, 'sawtooth', 0.08, t);
        tone(330, 0.22, 'sawtooth', 0.08, t + 0.15);
    }
    function playWin() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        [523, 659, 784, 1047, 1319].forEach((f, i) => {
            tone(f, 0.22, 'sine', 0.13, t + i * 0.12);
        });
    }

    // ── Particle system ───────────────────────────────────────
    function spawnBurst(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 3.5 + 1.5;
            particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 1.0,
                decay: Math.random() * 0.03 + 0.02,
                r: Math.random() * 3 + 1.5,
                color: color || BALL_CLR
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x  += p.vx;
            p.y  += p.vy;
            p.vy += 0.05;          // slight gravity
            p.vx *= 0.98;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = p.life * 0.8;
            ctx.fillStyle   = p.color;
            ctx.shadowColor  = p.color;
            ctx.shadowBlur   = 5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur  = 0;
    }

    // ── Drawing helpers ───────────────────────────────────────
    function playerColor() {
        return (player && player.color) ? player.color : DEFAULT_CLR;
    }

    function drawBackground() {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, BG_TOP);
        g.addColorStop(1, BG_BOT);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    function drawCenterLine() {
        ctx.save();
        ctx.setLineDash([8, 8]);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawPaddle(cx, cy, color) {
        const x = cx - PADDLE_W / 2;
        const y = cy - PADDLE_H / 2;

        // Gradient fill
        const grad = ctx.createLinearGradient(x, y, x, y + PADDLE_H);
        grad.addColorStop(0, color);
        grad.addColorStop(1, shadeColor(color, -30));
        ctx.fillStyle   = grad;
        ctx.shadowColor  = color;
        ctx.shadowBlur   = 12;

        ctx.beginPath();
        ctx.roundRect(x, y, PADDLE_W, PADDLE_H, PADDLE_RADIUS);
        ctx.fill();

        // Glossy highlight
        ctx.shadowBlur  = 0;
        ctx.globalAlpha = 0.30;
        ctx.fillStyle   = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(x + 4, y + 1, PADDLE_W - 8, PADDLE_H / 2 - 1, [PADDLE_RADIUS, PADDLE_RADIUS, 0, 0]);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    /** Darken or lighten a hex color by `amt` (-100..100). */
    function shadeColor(hex, amt) {
        let c = hex.replace('#', '');
        if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
        const num = parseInt(c, 16);
        let r = Math.min(255, Math.max(0, (num >> 16)         + amt));
        let g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
        let b = Math.min(255, Math.max(0, (num & 0xff)        + amt));
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function drawBallTrail() {
        for (let i = 0; i < trail.length; i++) {
            const t     = trail[i];
            const frac  = (i + 1) / trail.length;
            const alpha = frac * 0.30;
            const rad   = BALL_R * (0.3 + frac * 0.7);
            ctx.globalAlpha = alpha;
            ctx.fillStyle   = playerColor();
            ctx.shadowColor  = playerColor();
            ctx.shadowBlur   = 4;
            ctx.beginPath();
            ctx.arc(t.x, t.y, rad, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur  = 0;
    }

    function drawBall(bx, by) {
        // Outer glow
        ctx.shadowColor = BALL_CLR;
        ctx.shadowBlur  = 18;
        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, BALL_R);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.6, 'rgba(255,255,255,0.6)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(bx, by, BALL_R + 4, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.shadowBlur = 8;
        ctx.fillStyle  = '#ffffff';
        ctx.beginPath();
        ctx.arc(bx, by, BALL_R * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    function drawScores(time) {
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        // AI score — upper half
        ctx.font      = 'bold 72px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(139, 92, 246, 0.12)';
        ctx.fillText(String(aiScore), W / 2, H * 0.25);

        // Player score — lower half
        ctx.fillStyle = hexAlpha(playerColor(), 0.12);
        ctx.fillText(String(playerScore), W / 2, H * 0.75);

        ctx.restore();
    }

    function hexAlpha(hex, a) {
        let c = hex.replace('#', '');
        if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
        const n = parseInt(c, 16);
        return `rgba(${n >> 16},${(n >> 8) & 0xff},${n & 0xff},${a})`;
    }

    // ── Title screen ──────────────────────────────────────────
    function drawTitleScreen(time) {
        drawBackground();
        drawCenterLine();

        // Animate a demo ball bouncing around
        titleBallX += titleBVX;
        titleBallY += titleBVY;
        if (titleBallX < BALL_R || titleBallX > W - BALL_R) {
            titleBVX = -titleBVX;
            titleBallX = Math.max(BALL_R, Math.min(W - BALL_R, titleBallX));
        }
        if (titleBallY < BALL_R || titleBallY > H - BALL_R) {
            titleBVY = -titleBVY;
            titleBallY = Math.max(BALL_R, Math.min(H - BALL_R, titleBallY));
        }

        ctx.globalAlpha = 0.25;
        drawBall(titleBallX, titleBallY);
        ctx.globalAlpha = 1;

        // Title text
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        // "MOLLY PONG" — gradient
        ctx.font = 'bold 48px "Segoe UI", system-ui, sans-serif';
        const tg = ctx.createLinearGradient(W / 2 - 120, 0, W / 2 + 120, 0);
        tg.addColorStop(0, playerColor());
        tg.addColorStop(0.5, '#FFD700');
        tg.addColorStop(1, AI_CLR);
        ctx.fillStyle   = tg;
        ctx.shadowColor  = playerColor();
        ctx.shadowBlur   = 16;
        ctx.fillText('PONG', W / 2, H * 0.32);
        ctx.shadowBlur = 0;

        // Player emoji + name
        if (player) {
            ctx.font      = '24px "Segoe UI", system-ui, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            const label   = (player.emoji || '') + ' ' + (player.name || 'Player');
            ctx.fillText(label.trim(), W / 2, H * 0.42);
        }

        // Prompt
        const pulse = 0.4 + Math.sin(time * 0.004) * 0.35;
        ctx.globalAlpha = pulse;
        ctx.font      = 'bold 18px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur  = 6;
        ctx.fillText('Tap or Space to Start', W / 2, H * 0.58);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Instructions
        ctx.font      = '14px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText('First to 7 wins', W / 2, H * 0.65);
        ctx.fillText('Move paddle with mouse, touch, or arrow keys', W / 2, H * 0.69);

        ctx.restore();
    }

    // ── Game-over screen ──────────────────────────────────────
    function drawGameOverScreen(time) {
        // Dim overlay
        ctx.fillStyle = 'rgba(15,17,23,0.78)';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        const won   = playerScore >= WIN_SCORE;
        const title = won ? 'YOU WIN!' : 'GAME OVER';
        const tClr  = won ? '#34D399' : '#F43F5E';

        // Title
        ctx.font        = 'bold 44px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle    = tClr;
        ctx.shadowColor  = tClr;
        ctx.shadowBlur   = 22;
        ctx.fillText(title, W / 2, H * 0.35);
        ctx.shadowBlur = 0;

        // Score line
        ctx.font      = '22px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(`${playerScore}  —  ${aiScore}`, W / 2, H * 0.44);

        // Stats
        ctx.font      = '14px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        const dur = Math.floor((Date.now() - startTime) / 1000);
        ctx.fillText(`Level ${level}  •  Rallies: ${totalRallies}  •  Best rally: ${longestRally}`, W / 2, H * 0.51);
        ctx.fillText(`Duration: ${dur}s`, W / 2, H * 0.55);

        // Prompt
        const pulse = 0.35 + Math.sin(time * 0.005) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.font        = 'bold 16px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle   = '#FFD700';
        ctx.fillText('Tap or Space to Continue', W / 2, H * 0.65);
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    // ── Point-scored screen ───────────────────────────────────
    function drawScoredScreen(time) {
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        const msg   = lastScorer === 'player' ? 'POINT!' : 'AI Scores';
        const color = lastScorer === 'player' ? playerColor() : AI_CLR;

        const pulse = 0.5 + Math.sin(time * 0.008) * 0.3;
        ctx.globalAlpha  = pulse;
        ctx.font         = 'bold 32px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle    = color;
        ctx.shadowColor  = color;
        ctx.shadowBlur   = 14;
        ctx.fillText(msg, W / 2, H / 2);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    // ── Screen shake ──────────────────────────────────────────
    function triggerShake() {
        shakeTimer = SHAKE_FRAMES;
    }

    function applyShake() {
        if (shakeTimer > 0) {
            shakeTimer--;
            shakeX = (Math.random() - 0.5) * shakeTimer * 2.5;
            shakeY = (Math.random() - 0.5) * shakeTimer * 2.5;
        } else {
            shakeX = 0;
            shakeY = 0;
        }
    }

    // ── Serve ball ────────────────────────────────────────────
    function serveBall() {
        ballX = W / 2;
        ballY = H / 2;
        trail = [];
        currentRally = 0;

        // Ball speed scales per level
        ballSpeed = BALL_SPEED_0 * Math.pow(BALL_SPEED_INC, playerScore + aiScore);

        // Direction: toward the player who just got scored ON
        // (i.e. the other side "serves" to the scorer's opponent)
        const dir = lastScorer === 'player' ? -1 : 1;  // -1 = upward (toward AI)
        const angle = (Math.random() * 0.8 - 0.4);     // slight random
        bvx = Math.sin(angle) * ballSpeed;
        bvy = Math.cos(angle) * ballSpeed * dir;

        state = ST_PLAYING;
    }

    // ── AI logic ──────────────────────────────────────────────
    function updateAI() {
        const lvl       = Math.min(playerScore + aiScore, 6); // 0-indexed into arrays
        const speed     = AI_SPEED[lvl];
        const react     = AI_REACT[lvl];

        // Target: predict where ball will reach AI's y-line
        let targetX = W / 2;
        if (bvy < 0) {  // ball moving toward AI (upward)
            const timeToReach = (ballY - (PADDLE_MARGIN + PADDLE_H)) / Math.max(-bvy, 0.1);
            targetX = ballX + bvx * timeToReach * react;
            // Clamp to canvas
            targetX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, targetX));
        }

        // Introduce slight imprecision
        const noise = Math.sin(Date.now() * 0.002) * (35 - lvl * 4);
        targetX += noise;

        const diff = targetX - aiX;
        const move = Math.sign(diff) * Math.min(Math.abs(diff), speed);
        aiX += move;
        aiX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, aiX));
    }

    // ── Player input ──────────────────────────────────────────
    function updatePlayer() {
        const speed = 7;
        let target  = null;

        if (touchX !== null)                          target = touchX;
        else if (mouseX !== null && inputActive)      target = mouseX;

        if (target !== null) {
            const diff = target - playerX;
            playerX += Math.sign(diff) * Math.min(Math.abs(diff), speed * 2);
        } else {
            if (keys['ArrowLeft']  || keys['a'] || keys['A']) playerX -= speed;
            if (keys['ArrowRight'] || keys['d'] || keys['D']) playerX += speed;
        }

        playerX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, playerX));
    }

    // ── Paddle collision ──────────────────────────────────────
    function checkPaddleHit() {
        const playerPY = H - PADDLE_MARGIN;   // player paddle center Y
        const aiPY     = PADDLE_MARGIN;        // AI paddle center Y

        // Player paddle (bottom)
        if (bvy > 0 &&
            ballY + BALL_R >= playerPY - PADDLE_H / 2 &&
            ballY + BALL_R <= playerPY + PADDLE_H / 2 + 6 &&
            ballX >= playerX - PADDLE_W / 2 - BALL_R &&
            ballX <= playerX + PADDLE_W / 2 + BALL_R) {

            ballY = playerPY - PADDLE_H / 2 - BALL_R;
            const hitPos = (ballX - playerX) / (PADDLE_W / 2); // -1 to +1
            const angle  = hitPos * MAX_ANGLE;
            bvx =  Math.sin(angle) * ballSpeed;
            bvy = -Math.cos(angle) * ballSpeed;

            currentRally++;
            playBounce();
            spawnBurst(ballX, playerPY - PADDLE_H / 2, 8, playerColor());
            return;
        }

        // AI paddle (top)
        if (bvy < 0 &&
            ballY - BALL_R <= aiPY + PADDLE_H / 2 &&
            ballY - BALL_R >= aiPY - PADDLE_H / 2 - 6 &&
            ballX >= aiX - PADDLE_W / 2 - BALL_R &&
            ballX <= aiX + PADDLE_W / 2 + BALL_R) {

            ballY = aiPY + PADDLE_H / 2 + BALL_R;
            const hitPos = (ballX - aiX) / (PADDLE_W / 2);
            const angle  = hitPos * MAX_ANGLE;
            bvx = Math.sin(angle) * ballSpeed;
            bvy = Math.cos(angle) * ballSpeed;

            currentRally++;
            playBounce();
            spawnBurst(ballX, aiPY + PADDLE_H / 2, 8, AI_CLR);
        }
    }

    // ── Score a point ─────────────────────────────────────────
    function pointScored(scorer) {
        // Track rally
        totalRallies += currentRally;
        if (currentRally > longestRally) longestRally = currentRally;
        currentRally = 0;

        if (scorer === 'player') {
            playerScore++;
            level = playerScore;
            score += 100;
            playScore();
            spawnBurst(W / 2, H - 40, 20, playerColor());
        } else {
            aiScore++;
            playLose();
            spawnBurst(W / 2, 40, 20, AI_CLR);
        }

        lastScorer = scorer;
        triggerShake();

        // Check for game over
        if (playerScore >= WIN_SCORE || aiScore >= WIN_SCORE) {
            state = ST_OVER;
            gameActive = false;
            if (playerScore >= WIN_SCORE) playWin();
            // Fire callback after a brief delay so animations play
            setTimeout(() => {
                if (onGameOver) {
                    onGameOver({
                        score: playerScore,
                        level: playerScore,
                        duration: Math.floor((Date.now() - startTime) / 1000),
                        totalPopped: totalRallies,
                        maxCombo: longestRally
                    });
                }
            }, 1600);
        } else {
            // Brief pause then re-serve
            state      = ST_SCORED;
            serveTimer = Date.now() + SERVE_PAUSE;
        }
    }

    // ── Update (one frame) ────────────────────────────────────
    function update(time) {
        applyShake();
        updateParticles();

        if (state === ST_TITLE) return;

        if (state === ST_SCORED) {
            updatePlayer();
            updateAI();
            if (Date.now() >= serveTimer) serveBall();
            return;
        }

        if (state === ST_OVER) return;

        // ── ST_PLAYING ──
        updatePlayer();
        updateAI();

        // Move ball
        ballX += bvx;
        ballY += bvy;

        // Trail
        trail.push({ x: ballX, y: ballY });
        if (trail.length > TRAIL_LEN) trail.shift();

        // Wall bounce (left / right)
        if (ballX - BALL_R <= 0) {
            ballX = BALL_R;
            bvx   = Math.abs(bvx);
            playWall();
            spawnBurst(0, ballY, 6, '#A855F7');
        }
        if (ballX + BALL_R >= W) {
            ballX = W - BALL_R;
            bvx   = -Math.abs(bvx);
            playWall();
            spawnBurst(W, ballY, 6, '#A855F7');
        }

        // Paddle collisions
        checkPaddleHit();

        // Ball past bottom = AI scores
        if (ballY - BALL_R > H + 20) {
            pointScored('ai');
            return;
        }
        // Ball past top = Player scores
        if (ballY + BALL_R < -20) {
            pointScored('player');
            return;
        }
    }

    // ── Draw (one frame) ──────────────────────────────────────
    function draw(time) {
        ctx.save();
        ctx.translate(shakeX, shakeY);

        drawBackground();
        drawCenterLine();
        drawScores(time);

        // Paddles
        drawPaddle(playerX, H - PADDLE_MARGIN, playerColor());
        drawPaddle(aiX,     PADDLE_MARGIN,     AI_CLR);

        // Ball + trail (only during play/scored)
        if (state === ST_PLAYING) {
            drawBallTrail();
            drawBall(ballX, ballY);
        }

        // Particles
        drawParticles();

        // HUD — level & player name at very top
        ctx.save();
        ctx.textBaseline = 'top';
        ctx.font      = '12px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        if (player) {
            ctx.textAlign = 'left';
            const label = (player.emoji || '') + ' ' + (player.name || 'Player');
            ctx.fillText(label.trim(), 8, 4);
        }
        ctx.textAlign = 'right';
        ctx.fillText('Level ' + Math.max(level, 1), W - 8, 4);
        ctx.restore();

        ctx.restore();   // undo shake translate

        // Overlays (drawn outside shake)
        if (state === ST_TITLE)  drawTitleScreen(time);
        if (state === ST_SCORED) drawScoredScreen(time);
        if (state === ST_OVER)   drawGameOverScreen(time);
    }

    // ── Main loop ─────────────────────────────────────────────
    function loop(time) {
        if (!canvas) return;
        update(time);
        draw(time);
        animFrame = requestAnimationFrame(loop);
    }

    // ── Resize handler ────────────────────────────────────────
    function fitCanvas() {
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;

        const cw = container.clientWidth;
        const ch = container.clientHeight;

        // Maintain 480:640 aspect ratio
        const aspect = BASE_W / BASE_H;
        let w, h;
        if (cw / ch > aspect) {
            h = ch;
            w = ch * aspect;
        } else {
            w = cw;
            h = cw / aspect;
        }

        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';
        canvas.width  = BASE_W;
        canvas.height = BASE_H;

        W     = BASE_W;
        H     = BASE_H;
        scale = w / BASE_W;
    }

    // ── Start from title ──────────────────────────────────────
    function startGame() {
        ensureAudio();
        playerScore  = 0;
        aiScore      = 0;
        level        = 0;
        score        = 0;
        totalRallies = 0;
        longestRally = 0;
        currentRally = 0;
        startTime    = Date.now();
        ballSpeed    = BALL_SPEED_0;
        particles    = [];
        trail        = [];

        playerX = W / 2;
        aiX     = W / 2;

        lastScorer = 'ai';   // player "receives" first serve
        gameActive = true;
        serveBall();
    }

    // ── Event handlers (named for cleanup) ────────────────────
    function onKeyDown(e) {
        keys[e.key] = true;
        if (e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            if (state === ST_TITLE) startGame();
            else if (state === ST_OVER) {
                state = ST_TITLE;
                initTitleBall();
            }
        }
    }
    function onKeyUp(e)   { keys[e.key] = false; }

    function onMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        mouseX      = (e.clientX - rect.left) / scale;
        inputActive = true;   // paddle tracks mouse whenever it moves
    }
    function onMouseDown(e) {
        ensureAudio();
        const rect = canvas.getBoundingClientRect();
        mouseX      = (e.clientX - rect.left) / scale;
        inputActive = true;
        if (state === ST_TITLE) startGame();
        else if (state === ST_OVER) {
            state = ST_TITLE;
            initTitleBall();
        }
    }
    function onMouseUp() { /* keep inputActive true — paddle always tracks cursor */ }

    function onTouchStart(e) {
        ensureAudio();
        if (e.touches.length === 0) return;
        const rect = canvas.getBoundingClientRect();
        touchX = (e.touches[0].clientX - rect.left) / scale;
        if (state === ST_TITLE) startGame();
        else if (state === ST_OVER) {
            state = ST_TITLE;
            initTitleBall();
        }
    }
    function onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 0) return;
        const rect = canvas.getBoundingClientRect();
        touchX = (e.touches[0].clientX - rect.left) / scale;
    }
    function onTouchEnd(e) {
        if (e.touches.length === 0) touchX = null;
    }
    function onResize() { fitCanvas(); }

    // ── Title ball init ───────────────────────────────────────
    function initTitleBall() {
        titleBallX  = W / 2;
        titleBallY  = H / 2;
        titleBVX    = 2.2;
        titleBVY    = 2.8;
    }

    // ══════════════════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════════════════
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas     = canvasEl;
        ctx        = canvas.getContext('2d');
        player     = activePlayer || null;
        onGameOver = gameOverCallback || null;

        // Load player theme
        const themeId = activePlayer?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            BG_TOP      = _t.bgGradient[0] || BG_TOP;
            BG_BOT      = _t.bgGradient[1] || BG_BOT;
            DEFAULT_CLR = _t.colors[0]     || DEFAULT_CLR;
            AI_CLR      = _t.colors[3]     || AI_CLR;
            GLOW_CLR    = _t.colors[0]     || GLOW_CLR;
        }

        keys        = {};
        mouseX      = null;
        touchX      = null;
        inputActive = false;
        particles   = [];
        trail       = [];
        shakeTimer  = 0;
        shakeX      = 0;
        shakeY      = 0;

        fitCanvas();
        initTitleBall();

        playerX = W / 2;
        aiX     = W / 2;

        playerScore  = 0;
        aiScore      = 0;
        level        = 0;
        score        = 0;
        gameActive   = false;
        state        = ST_TITLE;

        // Bind events
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup',   onKeyUp);
        window.addEventListener('resize',  onResize);
        canvas.addEventListener('mousemove',  onMouseMove);
        canvas.addEventListener('mousedown',  onMouseDown);
        canvas.addEventListener('mouseup',    onMouseUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: true });
        canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
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
            canvas.removeEventListener('mousemove',  onMouseMove);
            canvas.removeEventListener('mousedown',  onMouseDown);
            canvas.removeEventListener('mouseup',    onMouseUp);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove',  onTouchMove);
            canvas.removeEventListener('touchend',   onTouchEnd);
        }
        canvas = null;
        ctx    = null;

        if (audioCtx) {
            try { audioCtx.close(); } catch { /* ignore */ }
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
