/* Flappy — Theme-aware flappy bird for Your World Arcade */
window.FlappyMae = (() => {
    // ── Constants ──
    const W = 320, H = 480;
    const GRAVITY = 0.45;
    const JUMP_VEL = -7.5;
    const PIPE_WIDTH = 52;
    const PIPE_SPEED_BASE = 2.2;
    const PIPE_SPACING = 180; // horizontal distance between pipes
    const GAP_START = 140;    // initial gap size (generous)
    const GAP_MIN = 90;       // smallest gap (hard mode)
    const GAP_SHRINK = 2;     // gap shrinks per level
    const GROUND_H = 60;
    const BIRD_R = 14;        // candy body radius
    const CLOUD_COUNT = 4;

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

    // Clouds
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

    // Audio context
    let audioCtx = null;

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

    // ── Drawing helpers ──
    function drawCandySky() {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, TBG[0]);
        grad.addColorStop(1, TBG[1]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    function drawClouds() {
        const cloudColor = (typeof ArcadeThemes !== 'undefined' && TC[5])
            ? ArcadeThemes.lighten(TC[5], 60) : '#FFFFFF';
        ctx.fillStyle = cloudColor + 'B3'; // ~0.7 opacity via hex alpha
        for (const c of clouds) {
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
            ctx.arc(c.x + c.r * 1.1, c.y - c.r * 0.4, c.r * 0.8, 0, Math.PI * 2);
            ctx.arc(c.x + c.r * 1.8, c.y, c.r * 0.65, 0, Math.PI * 2);
            ctx.arc(c.x - c.r * 0.6, c.y + c.r * 0.15, c.r * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawCandyGround() {
        const stripeW = 20;
        const y = H - GROUND_H;
        const baseColor = (typeof ArcadeThemes !== 'undefined')
            ? ArcadeThemes.darken(TC[4] || '#F59E0B', 30) : '#A16207';
        const stripeColor = TC[5] || '#A78BFA';
        // Ground body
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y, W, GROUND_H);
        ctx.clip();
        for (let x = -stripeW + (groundX % (stripeW * 2)); x < W + stripeW * 2; x += stripeW) {
            if (Math.floor((x - groundX) / stripeW) % 2 === 0) {
                ctx.fillStyle = baseColor;
            } else {
                ctx.fillStyle = stripeColor + '44'; // low opacity accent
            }
            ctx.save();
            ctx.translate(x + stripeW / 2, y + GROUND_H / 2);
            ctx.rotate(-0.3);
            ctx.fillRect(-stripeW, -GROUND_H, stripeW * 2, GROUND_H * 2);
            ctx.restore();
        }
        ctx.restore();
        // Top edge
        ctx.fillStyle = TC[0] || '#F43F5E';
        ctx.fillRect(0, y, W, 3);
    }

    function drawCandyPipe(px, topH, bottomY, gap) {
        const capH = 14;
        const capOverhang = 6;
        const pipeBody = TC[2] || '#F472B6';
        const pipeEdge = TC[3] || '#FB923C';
        const pipeCap  = TC[4] || '#FBBF24';

        // Helper: draw solid column with themed cap
        function drawColumn(x, y, w, h, capAtBottom) {
            // Pipe body
            ctx.fillStyle = pipeBody;
            ctx.fillRect(x, y, w, h);
            // Edge highlights (left/right)
            ctx.fillStyle = pipeEdge + '66'; // semi-transparent
            ctx.fillRect(x, y, 4, h);
            ctx.fillRect(x + w - 4, y, 4, h);

            // Cap (rounded rectangle)
            const capX = x - capOverhang;
            const capW = w + capOverhang * 2;
            const capY = capAtBottom ? y : y + h - capH;
            const capR = 7;
            ctx.fillStyle = pipeCap;
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

            // Highlight stripe on cap
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(capX + 4, capY + 3, capW - 8, 3);
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

    function drawBird(x, y, angle, wingUp, color, alive) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        const r = BIRD_R;
        const bodyColor = TC[0] || color;
        const lightColor = (typeof ArcadeThemes !== 'undefined')
            ? ArcadeThemes.lighten(bodyColor, 30) : shadeColor(bodyColor, 40);

        // Body (filled circle with gradient)
        const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        grad.addColorStop(0, lightColor);
        grad.addColorStop(1, bodyColor);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // Emoji face in center
        const emoji = TE[0] || '🍬';
        ctx.font = (r * 1.1) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, 0, 1);

        // Dead overlay: X eyes
        if (!alive) {
            const eyeY = -3;
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 1.5;
            [-4, 5].forEach(ex => {
                ctx.beginPath();
                ctx.moveTo(ex - 2, eyeY - 2);
                ctx.lineTo(ex + 2, eyeY + 2);
                ctx.moveTo(ex + 2, eyeY - 2);
                ctx.lineTo(ex - 2, eyeY + 2);
                ctx.stroke();
            });
        }

        // Wings
        ctx.fillStyle = shadeColor(bodyColor, 20);
        const wy = wingUp ? -6 : 4;
        // Left wing
        ctx.beginPath();
        ctx.ellipse(-r - 3, wy, 7, 4, -0.4, 0, Math.PI * 2);
        ctx.fill();
        // Right wing (small)
        ctx.beginPath();
        ctx.ellipse(r + 1, wy + 2, 5, 3, 0.3, 0, Math.PI * 2);
        ctx.fill();

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
        // Outline
        ctx.strokeStyle = '#7C3AED';
        ctx.lineWidth = 5;
        ctx.strokeText(text, W / 2, 30);
        // Fill
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, W / 2, 30);
        ctx.textAlign = 'left';
    }

    function drawHUD() {
        // Player info top-left
        ctx.font = '14px sans-serif';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(playerEmoji() + ' ' + playerName(), 8, 8);
    }

    function drawFloats() {
        for (let i = floats.length - 1; i >= 0; i--) {
            const f = floats[i];
            f.y -= 1.5;
            f.life -= 1;
            const alpha = Math.max(0, f.life / f.maxLife);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = 'bold 22px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#F59E0B';
            ctx.strokeStyle = '#7C3AED';
            ctx.lineWidth = 3;
            ctx.strokeText(f.text, f.x, f.y);
            ctx.fillText(f.text, f.x, f.y);
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
        ctx.fillText('FLAPPY', W / 2 + 2, 102);
        // Gradient text
        const tgrad = ctx.createLinearGradient(W / 2 - 100, 80, W / 2 + 100, 120);
        tgrad.addColorStop(0, '#A855F7');
        tgrad.addColorStop(0.5, '#EC4899');
        tgrad.addColorStop(1, '#F59E0B');
        ctx.fillStyle = tgrad;
        ctx.fillText('FLAPPY', W / 2, 100);

        // Bouncing bird
        const by = 210 + splashBounce * 12;
        drawBird(W / 2, by, 0, splashBounce > 0, playerColor(), true);

        // Subtitle
        ctx.font = '18px sans-serif';
        ctx.fillStyle = '#7C3AED';
        ctx.fillText('Tap or Press Space', W / 2, 300);
        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#A855F7';
        ctx.fillText('to Start!', W / 2, 324);

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
        ctx.fillText('Score: ' + score, W / 2, py + 80);
        ctx.fillText('Level: ' + level, W / 2, py + 106);

        // Best
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#A855F7';
        ctx.fillText('Best: ' + bestScore, W / 2, py + 136);

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
        pipes.push({
            x: W + 10,
            topH: topH,
            bottomY: topH + gapSize,
            scored: false
        });
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
        pipeTimer = 0;
        groundX = 0;
        gapSize = GAP_START;
        pipeSpeed = PIPE_SPEED_BASE;
        flap(); // initial jump
    }

    function resetToSplash() {
        state = SPLASH;
        splashBounce = 0;
        splashDir = 1;
        pipes = [];
        floats = [];
    }

    function die() {
        birdAlive = false;
        playHit();
        setTimeout(playFall, 200);
        deathTimer = 60; // frames before allowing retry
        if (score > bestScore) bestScore = score;
        state = GAMEOVER;
        if (onGameOver) {
            onGameOver({ score: score, level: level });
        }
    }

    // ── Main loop ──
    function update() {
        updateClouds();

        if (state === PLAYING) {
            // Bird physics
            birdVel += GRAVITY;
            birdY += birdVel;

            // Rotation based on velocity
            birdAngle = Math.max(-0.5, Math.min(birdVel * 0.07, 1.4));

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

            // Update pipes
            for (let i = pipes.length - 1; i >= 0; i--) {
                const p = pipes[i];
                p.x -= pipeSpeed;

                // Score when bird passes pipe center
                if (!p.scored && p.x + PIPE_WIDTH < 70) {
                    p.scored = true;
                    score++;
                    level = Math.floor(score / 10) + 1;
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

            // Collision
            if (checkCollision()) {
                die();
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

        // Clouds (behind everything)
        drawClouds();

        // Pipes
        for (const p of pipes) {
            drawCandyPipe(p.x, p.topH, p.bottomY, gapSize);
        }

        // Ground
        drawCandyGround();

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
        update();
        render();
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
        bestScore = 0;
        pipes = [];
        floats = [];
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

        initClouds();
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
