/* Mini Golf — 9-hole physics mini golf for Your World Arcade */
window.MiniGolf = (() => {

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

    // ── Constants ──────────────────────────────────────────────
    const GAME_W = 480, GAME_H = 640;
    const BALL_R = 6;
    const HOLE_R = 10;
    const MAX_POWER = 14;
    const GRASS_FRICTION = 0.985;
    const SAND_FRICTION = 0.955;
    const WALL_COR = 0.75;
    const MIN_SPEED = 0.06;
    const HOLE_CAPTURE_SPEED = 3.0;  // ball must be this slow to fall in

    // Game states
    const ST_TITLE    = 0;
    const ST_AIMING   = 1;
    const ST_POWER    = 2;
    const ST_ROLLING  = 3;
    const ST_HOLE_IN  = 4;
    const ST_SCORECARD = 5;
    const ST_OVER     = 6;

    // ── Module-level variables ──────────────────────────────────
    let canvas, ctx, W, H, scale;
    let state, gameActive;
    let animFrame = null;
    let audioCtx  = null;
    let player    = null;
    let onGameOver = null;

    // Theme
    let BG_CLR     = '#1A1A2E';
    let ACCENT_CLR = '#F472B6';
    let GRASS_CLR  = '#2D8A4E';
    let GRASS_CLR2 = '#236B3C';

    // Ball
    let ballX, ballY, ballVX, ballVY;
    let ballOnSand = false;
    let ballInWater = false;
    let ballSunk = false;

    // Course
    let currentHole = 0;   // 0-indexed
    let strokes = 0;
    let holeScores = [];   // strokes per hole
    let holePars = [];

    // Aiming
    let aimAngle = 0;
    let aimPower = 0;
    let aimDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let mouseX = 0, mouseY = 0;

    // Effects
    let particles = [];
    let messages = [];
    let holeInTimer = 0;
    let scorecardTimer = 0;

    // Obstacles
    let walls = [];
    let sandTraps = [];
    let waterHazards = [];
    let bumpers = [];
    let windmills = [];
    let tunnels = [];
    let holePos = { x: 0, y: 0 };
    let teePos = { x: 0, y: 0 };

    // Input
    let keys = {};
    let startTime = 0;

    // ── Hole definitions ───────────────────────────────────────
    // Each hole has: par, tee, hole, walls, sand, water, bumpers, windmills, tunnels
    function getHoles() {
        return [
            // Hole 1: Straight shot (par 2)
            {
                par: 2, name: 'The Opener',
                tee: { x: 240, y: 540 },
                hole: { x: 240, y: 120 },
                walls: [
                    { x: 160, y: 60, w: 160, h: 10 },     // top
                    { x: 160, y: 590, w: 160, h: 10 },     // bottom
                    { x: 150, y: 60, w: 10, h: 540 },      // left
                    { x: 320, y: 60, w: 10, h: 540 },      // right
                ],
                sand: [],
                water: [],
                bumpers: [],
                windmills: [],
                tunnels: [],
            },
            // Hole 2: Dogleg left (par 3)
            {
                par: 3, name: 'Dogleg Left',
                tee: { x: 360, y: 540 },
                hole: { x: 120, y: 120 },
                walls: [
                    { x: 80, y: 60, w: 320, h: 10 },
                    { x: 280, y: 460, w: 120, h: 10 },
                    { x: 280, y: 460, w: 10, h: 140 },
                    { x: 390, y: 60, w: 10, h: 540 },
                    { x: 70, y: 60, w: 10, h: 400 },
                    { x: 70, y: 450, w: 220, h: 10 },
                    { x: 280, y: 590, w: 120, h: 10 },
                ],
                sand: [{ x: 180, y: 250, w: 60, h: 60 }],
                water: [],
                bumpers: [],
                windmills: [],
                tunnels: [],
            },
            // Hole 3: Sand trap challenge (par 3)
            {
                par: 3, name: 'Sandy Beach',
                tee: { x: 240, y: 540 },
                hole: { x: 240, y: 100 },
                walls: [
                    { x: 120, y: 50, w: 240, h: 10 },
                    { x: 120, y: 590, w: 240, h: 10 },
                    { x: 110, y: 50, w: 10, h: 550 },
                    { x: 360, y: 50, w: 10, h: 550 },
                ],
                sand: [
                    { x: 160, y: 200, w: 80, h: 50 },
                    { x: 250, y: 300, w: 70, h: 60 },
                    { x: 170, y: 400, w: 60, h: 40 },
                ],
                water: [],
                bumpers: [
                    { x: 200, y: 350, r: 12 },
                    { x: 280, y: 250, r: 12 },
                ],
                windmills: [],
                tunnels: [],
            },
            // Hole 4: Water hazard (par 3)
            {
                par: 3, name: 'Water Crossing',
                tee: { x: 240, y: 560 },
                hole: { x: 240, y: 100 },
                walls: [
                    { x: 100, y: 50, w: 280, h: 10 },
                    { x: 100, y: 590, w: 280, h: 10 },
                    { x: 90, y: 50, w: 10, h: 550 },
                    { x: 380, y: 50, w: 10, h: 550 },
                    // Bridge walls
                    { x: 200, y: 280, w: 10, h: 80 },
                    { x: 270, y: 280, w: 10, h: 80 },
                ],
                sand: [],
                water: [
                    { x: 100, y: 280, w: 100, h: 80 },
                    { x: 280, y: 280, w: 100, h: 80 },
                ],
                bumpers: [],
                windmills: [],
                tunnels: [],
            },
            // Hole 5: Windmill (par 3)
            {
                par: 3, name: 'The Windmill',
                tee: { x: 240, y: 550 },
                hole: { x: 240, y: 100 },
                walls: [
                    { x: 120, y: 50, w: 240, h: 10 },
                    { x: 120, y: 590, w: 240, h: 10 },
                    { x: 110, y: 50, w: 10, h: 550 },
                    { x: 360, y: 50, w: 10, h: 550 },
                ],
                sand: [{ x: 150, y: 400, w: 50, h: 40 }],
                water: [],
                bumpers: [],
                windmills: [
                    { x: 240, y: 300, armLen: 50, speed: 0.02 },
                ],
                tunnels: [],
            },
            // Hole 6: Bumper madness (par 4)
            {
                par: 4, name: 'Pinball Alley',
                tee: { x: 240, y: 560 },
                hole: { x: 240, y: 90 },
                walls: [
                    { x: 100, y: 40, w: 280, h: 10 },
                    { x: 100, y: 590, w: 280, h: 10 },
                    { x: 90, y: 40, w: 10, h: 560 },
                    { x: 380, y: 40, w: 10, h: 560 },
                ],
                sand: [],
                water: [],
                bumpers: [
                    { x: 180, y: 200, r: 15 },
                    { x: 300, y: 200, r: 15 },
                    { x: 240, y: 280, r: 15 },
                    { x: 160, y: 360, r: 12 },
                    { x: 320, y: 360, r: 12 },
                    { x: 240, y: 440, r: 12 },
                ],
                windmills: [],
                tunnels: [],
            },
            // Hole 7: S-curve (par 4)
            {
                par: 4, name: 'The Snake',
                tee: { x: 350, y: 560 },
                hole: { x: 130, y: 90 },
                walls: [
                    { x: 80, y: 40, w: 320, h: 10 },
                    { x: 80, y: 590, w: 320, h: 10 },
                    { x: 70, y: 40, w: 10, h: 560 },
                    { x: 400, y: 40, w: 10, h: 560 },
                    // S-curve walls
                    { x: 70, y: 420, w: 240, h: 10 },
                    { x: 170, y: 230, w: 240, h: 10 },
                ],
                sand: [
                    { x: 320, y: 300, w: 50, h: 50 },
                ],
                water: [
                    { x: 100, y: 130, w: 60, h: 60 },
                ],
                bumpers: [],
                windmills: [],
                tunnels: [],
            },
            // Hole 8: Double windmill (par 4)
            {
                par: 4, name: 'Twin Mills',
                tee: { x: 240, y: 560 },
                hole: { x: 240, y: 90 },
                walls: [
                    { x: 100, y: 40, w: 280, h: 10 },
                    { x: 100, y: 590, w: 280, h: 10 },
                    { x: 90, y: 40, w: 10, h: 560 },
                    { x: 380, y: 40, w: 10, h: 560 },
                ],
                sand: [
                    { x: 140, y: 440, w: 60, h: 40 },
                    { x: 280, y: 440, w: 60, h: 40 },
                ],
                water: [],
                bumpers: [
                    { x: 240, y: 180, r: 10 },
                ],
                windmills: [
                    { x: 170, y: 330, armLen: 40, speed: 0.025 },
                    { x: 310, y: 330, armLen: 40, speed: -0.02 },
                ],
                tunnels: [],
            },
            // Hole 9: The Gauntlet (par 5)
            {
                par: 5, name: 'The Gauntlet',
                tee: { x: 240, y: 570 },
                hole: { x: 240, y: 80 },
                walls: [
                    { x: 80, y: 30, w: 320, h: 10 },
                    { x: 80, y: 590, w: 320, h: 10 },
                    { x: 70, y: 30, w: 10, h: 570 },
                    { x: 400, y: 30, w: 10, h: 570 },
                    // Narrow passages
                    { x: 70, y: 450, w: 130, h: 8 },
                    { x: 270, y: 450, w: 140, h: 8 },
                    { x: 70, y: 300, w: 140, h: 8 },
                    { x: 280, y: 300, w: 130, h: 8 },
                    { x: 70, y: 160, w: 130, h: 8 },
                    { x: 270, y: 160, w: 140, h: 8 },
                ],
                sand: [
                    { x: 120, y: 370, w: 50, h: 40 },
                    { x: 310, y: 220, w: 50, h: 40 },
                ],
                water: [
                    { x: 300, y: 370, w: 60, h: 40 },
                    { x: 120, y: 220, w: 60, h: 40 },
                ],
                bumpers: [
                    { x: 240, y: 500, r: 12 },
                    { x: 240, y: 380, r: 10 },
                    { x: 240, y: 230, r: 10 },
                ],
                windmills: [
                    { x: 240, y: 120, armLen: 35, speed: 0.03 },
                ],
                tunnels: [],
            },
        ];
    }

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

    function noise(dur, vol, freq) {
        const ac = ensureAudio();
        if (!ac) return;
        try {
            const t = ac.currentTime;
            const bufferSize = ac.sampleRate * dur;
            const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
            const src = ac.createBufferSource();
            src.buffer = buffer;
            const g = ac.createGain();
            g.gain.setValueAtTime(vol || 0.05, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            const filt = ac.createBiquadFilter();
            filt.type = 'lowpass';
            filt.frequency.value = freq || 400;
            src.connect(filt);
            filt.connect(g);
            g.connect(ac.destination);
            src.start(t);
            src.stop(t + dur);
        } catch { /* swallow */ }
    }

    function playPutt() {
        tone(800, 0.05, 'sine', 0.10);
        tone(600, 0.03, 'triangle', 0.06);
    }
    function playWallBounce() {
        tone(500, 0.04, 'triangle', 0.08);
        noise(0.03, 0.03, 600);
    }
    function playWaterSplash() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        noise(0.2, 0.10, 1200);
        tone(200, 0.15, 'sine', 0.05, t + 0.05);
    }
    function playHoleDrop() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        tone(400, 0.1, 'sine', 0.08, t);
        tone(600, 0.1, 'sine', 0.08, t + 0.08);
        tone(800, 0.15, 'sine', 0.10, t + 0.16);
    }
    function playBumperHit() {
        tone(900, 0.06, 'sine', 0.10);
        tone(1100, 0.04, 'triangle', 0.06);
    }
    function playHoleInOne() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
            tone(f, 0.22, 'sine', 0.12, t + i * 0.1);
        });
    }
    function playCelebration() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        [523, 659, 784, 1047].forEach((f, i) => {
            tone(f, 0.18, 'sine', 0.10, t + i * 0.1);
        });
    }

    // ── Particle system ────────────────────────────────────────
    function spawnBurst(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 3.5 + 1;
            particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 1.0,
                decay: Math.random() * 0.025 + 0.012,
                r: Math.random() * 3 + 1,
                color: color || '#FFD700',
            });
        }
    }

    function spawnConfetti(x, y, count) {
        const colors = ['#F43F5E', '#FBBF24', '#34D399', '#3B82F6', '#A855F7', '#F472B6', '#FFD700'];
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 6 + 2;
            particles.push({
                x: x + (Math.random() - 0.5) * 80,
                y: y + (Math.random() - 0.5) * 40,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s - 4,
                life: 1.0,
                decay: Math.random() * 0.01 + 0.005,
                r: Math.random() * 4 + 2,
                color: colors[Math.floor(Math.random() * colors.length)],
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x  += p.vx;
            p.y  += p.vy;
            p.vy += 0.05;
            p.vx *= 0.98;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ── Messages ───────────────────────────────────────────────
    function addMessage(text, x, y, color, size) {
        messages.push({ text, x, y, life: 1.0, color: color || '#FFD700', size: size || 20 });
    }

    function updateMessages() {
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            m.y -= 0.5;
            m.life -= 0.01;
            if (m.life <= 0) messages.splice(i, 1);
        }
    }

    function drawMessages() {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const m of messages) {
            ctx.globalAlpha = m.life;
            ctx.font = `bold ${m.size}px "Segoe UI", system-ui, sans-serif`;
            ctx.fillStyle = m.color;
            ctx.shadowColor = m.color;
            ctx.shadowBlur = 10;
            ctx.fillText(m.text, m.x, m.y);
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
    }

    // ── Course loading ─────────────────────────────────────────
    function loadHole(holeIdx) {
        const holes = getHoles();
        const h = holes[holeIdx];

        walls = h.walls;
        sandTraps = h.sand;
        waterHazards = h.water;
        bumpers = h.bumpers;
        windmills = h.windmills.map(wm => ({ ...wm, angle: 0 }));
        tunnels = h.tunnels;
        holePos = { x: h.hole.x, y: h.hole.y };
        teePos = { x: h.tee.x, y: h.tee.y };

        ballX = teePos.x;
        ballY = teePos.y;
        ballVX = 0;
        ballVY = 0;
        ballSunk = false;
        ballInWater = false;
        strokes = 0;
    }

    // ── Physics ─────────────────────────────────────────────────
    function ballSpeed() {
        return Math.sqrt(ballVX * ballVX + ballVY * ballVY);
    }

    function isOnSand() {
        for (const s of sandTraps) {
            if (ballX >= s.x && ballX <= s.x + s.w && ballY >= s.y && ballY <= s.y + s.h) {
                return true;
            }
        }
        return false;
    }

    function isOnWater() {
        for (const w of waterHazards) {
            if (ballX >= w.x && ballX <= w.x + w.w && ballY >= w.y && ballY <= w.y + w.h) {
                return true;
            }
        }
        return false;
    }

    function updatePhysics() {
        if (ballSunk) return;

        ballX += ballVX;
        ballY += ballVY;

        // Friction
        ballOnSand = isOnSand();
        const friction = ballOnSand ? SAND_FRICTION : GRASS_FRICTION;
        ballVX *= friction;
        ballVY *= friction;

        // Stop slow ball
        if (ballSpeed() < MIN_SPEED) {
            ballVX = 0;
            ballVY = 0;
        }

        // Water hazard check
        if (isOnWater() && ballSpeed() < 4) {
            ballInWater = true;
            playWaterSplash();
            spawnBurst(ballX, ballY, 15, '#3B82F6');
            addMessage('SPLASH!', ballX, ballY - 20, '#3B82F6', 22);
            strokes++;  // penalty stroke
            // Reset to tee or last position
            setTimeout(() => {
                ballX = teePos.x;
                ballY = teePos.y;
                ballVX = 0;
                ballVY = 0;
                ballInWater = false;
                state = ST_AIMING;
            }, 800);
            state = ST_ROLLING;  // keep rolling state to show splash
            ballVX = 0;
            ballVY = 0;
            return;
        }

        // Wall collisions
        for (const w of walls) {
            collideWall(w);
        }

        // Bumper collisions
        for (const b of bumpers) {
            const dx = ballX - b.x;
            const dy = ballY - b.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            const minD = BALL_R + b.r;
            if (d < minD && d > 0.1) {
                const nx = dx / d;
                const ny = dy / d;
                const overlap = minD - d;
                ballX += nx * overlap;
                ballY += ny * overlap;

                // Reflect with boost
                const dot = ballVX * nx + ballVY * ny;
                ballVX = (ballVX - 2 * dot * nx) * 1.1;
                ballVY = (ballVY - 2 * dot * ny) * 1.1;

                playBumperHit();
                spawnBurst(b.x + nx * b.r, b.y + ny * b.r, 6, '#FF6B6B');
            }
        }

        // Windmill arm collision
        for (const wm of windmills) {
            const armEndX = wm.x + Math.cos(wm.angle) * wm.armLen;
            const armEndY = wm.y + Math.sin(wm.angle) * wm.armLen;
            const armEndX2 = wm.x - Math.cos(wm.angle) * wm.armLen;
            const armEndY2 = wm.y - Math.sin(wm.angle) * wm.armLen;

            // Check both arms
            for (const [ex, ey] of [[armEndX, armEndY], [armEndX2, armEndY2]]) {
                // Distance from ball to line segment (wm center to arm end)
                const dx = ex - wm.x;
                const dy = ey - wm.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len < 1) continue;
                const t = Math.max(0, Math.min(1, ((ballX - wm.x) * dx + (ballY - wm.y) * dy) / (len * len)));
                const closestX = wm.x + t * dx;
                const closestY = wm.y + t * dy;
                const bd = Math.sqrt((ballX - closestX) ** 2 + (ballY - closestY) ** 2);

                if (bd < BALL_R + 4) {
                    // Push ball away from arm
                    const nx = (ballX - closestX) / (bd || 1);
                    const ny = (ballY - closestY) / (bd || 1);
                    ballX = closestX + nx * (BALL_R + 5);
                    ballY = closestY + ny * (BALL_R + 5);

                    const dot = ballVX * nx + ballVY * ny;
                    ballVX = (ballVX - 2 * dot * nx) * 0.7;
                    ballVY = (ballVY - 2 * dot * ny) * 0.7;

                    // Add arm's rotational velocity
                    const tangentX = -Math.sin(wm.angle) * wm.speed * 60;
                    const tangentY = Math.cos(wm.angle) * wm.speed * 60;
                    ballVX += tangentX * 0.3;
                    ballVY += tangentY * 0.3;

                    playWallBounce();
                }
            }

            // Center hub collision
            const hubD = Math.sqrt((ballX - wm.x) ** 2 + (ballY - wm.y) ** 2);
            if (hubD < BALL_R + 8) {
                const nx = (ballX - wm.x) / (hubD || 1);
                const ny = (ballY - wm.y) / (hubD || 1);
                ballX = wm.x + nx * (BALL_R + 9);
                ballY = wm.y + ny * (BALL_R + 9);
                const dot = ballVX * nx + ballVY * ny;
                ballVX -= 2 * dot * nx * WALL_COR;
                ballVY -= 2 * dot * ny * WALL_COR;
                playWallBounce();
            }
        }

        // Hole detection
        const holeDist = Math.sqrt((ballX - holePos.x) ** 2 + (ballY - holePos.y) ** 2);
        if (holeDist < HOLE_R - 2 && ballSpeed() < HOLE_CAPTURE_SPEED) {
            sinkBall();
        }
        // Edge of hole - gravitational pull
        if (holeDist < HOLE_R + 5 && holeDist > HOLE_R - 3) {
            const pullStrength = 0.15;
            const nx = (holePos.x - ballX) / holeDist;
            const ny = (holePos.y - ballY) / holeDist;
            ballVX += nx * pullStrength;
            ballVY += ny * pullStrength;
        }
    }

    function collideWall(w) {
        // AABB collision with ball
        const closestX = Math.max(w.x, Math.min(ballX, w.x + w.w));
        const closestY = Math.max(w.y, Math.min(ballY, w.y + w.h));
        const dx = ballX - closestX;
        const dy = ballY - closestY;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d < BALL_R && d > 0.01) {
            const nx = dx / d;
            const ny = dy / d;
            const overlap = BALL_R - d;
            ballX += nx * overlap;
            ballY += ny * overlap;

            const dot = ballVX * nx + ballVY * ny;
            ballVX = (ballVX - 2 * dot * nx) * WALL_COR;
            ballVY = (ballVY - 2 * dot * ny) * WALL_COR;

            if (ballSpeed() > 0.5) playWallBounce();
        }
    }

    function sinkBall() {
        ballSunk = true;
        ballVX = 0;
        ballVY = 0;
        ballX = holePos.x;
        ballY = holePos.y;

        playHoleDrop();
        spawnBurst(holePos.x, holePos.y, 15, '#FFD700');

        const par = getHoles()[currentHole].par;
        const diff = strokes - par;

        let msg = '';
        let color = '#FFD700';
        if (strokes === 1) {
            msg = 'HOLE IN ONE!';
            color = '#FF4500';
            playHoleInOne();
            spawnConfetti(holePos.x, holePos.y, 80);
        } else if (diff <= -2) {
            msg = 'EAGLE!';
            color = '#FFD700';
            playCelebration();
            spawnConfetti(holePos.x, holePos.y, 40);
        } else if (diff === -1) {
            msg = 'BIRDIE!';
            color = '#34D399';
            playCelebration();
            spawnBurst(holePos.x, holePos.y, 25, '#34D399');
        } else if (diff === 0) {
            msg = 'PAR';
            color = '#3B82F6';
        } else if (diff === 1) {
            msg = 'BOGEY';
            color = '#F59E0B';
        } else {
            msg = `+${diff}`;
            color = '#F43F5E';
        }

        addMessage(msg, holePos.x, holePos.y - 30, color, 28);

        holeScores.push(strokes);
        state = ST_HOLE_IN;
        holeInTimer = Date.now() + 2000;
    }

    // ── Drawing ─────────────────────────────────────────────────
    function drawCourse() {
        // Background
        ctx.fillStyle = BG_CLR;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Course grass background
        const grassGrad = ctx.createRadialGradient(GAME_W / 2, GAME_H / 2, 20, GAME_W / 2, GAME_H / 2, 400);
        grassGrad.addColorStop(0, GRASS_CLR);
        grassGrad.addColorStop(1, GRASS_CLR2);
        ctx.fillStyle = grassGrad;

        // Find bounding box of course
        let minX = 1000, minY = 1000, maxX = 0, maxY = 0;
        for (const w of walls) {
            minX = Math.min(minX, w.x);
            minY = Math.min(minY, w.y);
            maxX = Math.max(maxX, w.x + w.w);
            maxY = Math.max(maxY, w.y + w.h);
        }

        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

        // Grass texture
        ctx.fillStyle = 'rgba(0,60,0,0.06)';
        for (let i = 0; i < 60; i++) {
            const gx = minX + Math.random() * (maxX - minX);
            const gy = minY + Math.random() * (maxY - minY);
            ctx.beginPath();
            ctx.arc(gx, gy, 0.8, 0, Math.PI * 2);
            ctx.fill();
        }

        // Sand traps
        for (const s of sandTraps) {
            ctx.fillStyle = '#D4A437';
            ctx.beginPath();
            ctx.roundRect(s.x, s.y, s.w, s.h, 8);
            ctx.fill();
            // Sand texture
            ctx.fillStyle = 'rgba(180,140,50,0.3)';
            for (let i = 0; i < 15; i++) {
                const sx = s.x + Math.random() * s.w;
                const sy = s.y + Math.random() * s.h;
                ctx.beginPath();
                ctx.arc(sx, sy, 1, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.strokeStyle = '#B8922A';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(s.x, s.y, s.w, s.h, 8);
            ctx.stroke();
        }

        // Water hazards
        for (const w of waterHazards) {
            // Water gradient
            const waterGrad = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
            waterGrad.addColorStop(0, '#1E6CB0');
            waterGrad.addColorStop(1, '#0E4A7A');
            ctx.fillStyle = waterGrad;
            ctx.beginPath();
            ctx.roundRect(w.x, w.y, w.w, w.h, 6);
            ctx.fill();
            // Water shimmer
            ctx.fillStyle = 'rgba(100,180,255,0.15)';
            const shimTime = Date.now() * 0.002;
            for (let i = 0; i < 5; i++) {
                const sx = w.x + (Math.sin(shimTime + i) * 0.5 + 0.5) * w.w;
                const sy = w.y + (Math.cos(shimTime + i * 1.3) * 0.5 + 0.5) * w.h;
                ctx.beginPath();
                ctx.arc(sx, sy, 3 + Math.sin(shimTime + i) * 1, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.strokeStyle = '#0D3D6B';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(w.x, w.y, w.w, w.h, 6);
            ctx.stroke();
        }

        // Walls
        for (const w of walls) {
            // Wall shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(w.x + 2, w.y + 2, w.w, w.h);

            // Wall body
            const wallGrad = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
            wallGrad.addColorStop(0, '#6B4423');
            wallGrad.addColorStop(0.5, '#8B5A2B');
            wallGrad.addColorStop(1, '#5C3A1E');
            ctx.fillStyle = wallGrad;
            ctx.fillRect(w.x, w.y, w.w, w.h);

            // Wall highlight
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(w.x, w.y, w.w, Math.min(2, w.h));
        }

        // Bumpers
        for (const b of bumpers) {
            // Bumper shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.arc(b.x + 1, b.y + 1, b.r + 1, 0, Math.PI * 2);
            ctx.fill();

            // Bumper body
            const bGrad = ctx.createRadialGradient(b.x - b.r * 0.2, b.y - b.r * 0.2, 1, b.x, b.y, b.r);
            bGrad.addColorStop(0, '#FF8888');
            bGrad.addColorStop(0.7, '#CC3333');
            bGrad.addColorStop(1, '#991111');
            ctx.fillStyle = bGrad;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();

            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.arc(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.3, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#880000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Windmills
        for (const wm of windmills) {
            // Center hub
            ctx.fillStyle = '#8B7355';
            ctx.beginPath();
            ctx.arc(wm.x, wm.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#5C4A32';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(wm.x, wm.y, 8, 0, Math.PI * 2);
            ctx.stroke();

            // Arms (2 opposite arms)
            const armW = 5;
            ctx.save();
            ctx.translate(wm.x, wm.y);
            ctx.rotate(wm.angle);

            // Arm 1
            ctx.fillStyle = '#A0522D';
            ctx.fillRect(-armW / 2, -wm.armLen, armW, wm.armLen);
            ctx.fillStyle = '#CD853F';
            ctx.fillRect(-armW / 2 + 1, -wm.armLen, 1, wm.armLen);

            // Arm 2
            ctx.fillStyle = '#A0522D';
            ctx.fillRect(-armW / 2, 0, armW, wm.armLen);
            ctx.fillStyle = '#CD853F';
            ctx.fillRect(-armW / 2 + 1, 0, 1, wm.armLen);

            ctx.restore();

            // Center bolt
            ctx.fillStyle = '#666';
            ctx.beginPath();
            ctx.arc(wm.x, wm.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Hole
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(holePos.x, holePos.y, HOLE_R, 0, Math.PI * 2);
        ctx.fill();

        // Hole rim
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(holePos.x, holePos.y, HOLE_R, 0, Math.PI * 2);
        ctx.stroke();

        // Flag
        if (!ballSunk) {
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(holePos.x, holePos.y);
            ctx.lineTo(holePos.x, holePos.y - 35);
            ctx.stroke();

            // Flag triangle
            ctx.fillStyle = '#F43F5E';
            ctx.beginPath();
            ctx.moveTo(holePos.x, holePos.y - 35);
            ctx.lineTo(holePos.x + 18, holePos.y - 28);
            ctx.lineTo(holePos.x, holePos.y - 21);
            ctx.closePath();
            ctx.fill();

            // Hole number on flag
            ctx.fillStyle = '#FFF';
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((currentHole + 1).toString(), holePos.x + 8, holePos.y - 28);
        }

        // Tee marker
        if (state === ST_AIMING || state === ST_POWER) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.arc(teePos.x, teePos.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawBall() {
        if (ballSunk || ballInWater) return;

        // Ball shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.arc(ballX + 1.5, ballY + 1.5, BALL_R, 0, Math.PI * 2);
        ctx.fill();

        // Ball body
        const grad = ctx.createRadialGradient(ballX - BALL_R * 0.3, ballY - BALL_R * 0.3, 1, ballX, ballY, BALL_R);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.6, '#F0F0F0');
        grad.addColorStop(1, '#C8C8C8');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2);
        ctx.fill();

        // Dimple pattern
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        for (let a = 0; a < 6; a++) {
            const angle = a * Math.PI / 3;
            const dx = Math.cos(angle) * BALL_R * 0.5;
            const dy = Math.sin(angle) * BALL_R * 0.5;
            ctx.beginPath();
            ctx.arc(ballX + dx, ballY + dy, 1, 0, Math.PI * 2);
            ctx.fill();
        }

        // Specular
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(ballX - BALL_R * 0.25, ballY - BALL_R * 0.3, BALL_R * 0.25, 0, Math.PI * 2);
        ctx.fill();

        // Edge
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawAimLine() {
        if (state !== ST_AIMING && state !== ST_POWER) return;

        const angle = aimAngle;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const lineLen = 80 + aimPower * 8;

        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(ballX, ballY);
        ctx.lineTo(ballX + cos * lineLen, ballY + sin * lineLen);
        ctx.stroke();
        ctx.setLineDash([]);

        // Direction arrow
        const tipX = ballX + cos * lineLen;
        const tipY = ballY + sin * lineLen;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawPowerMeter() {
        if (state !== ST_POWER && state !== ST_AIMING) return;
        if (aimPower < 0.1) return;

        const meterW = 100;
        const meterH = 8;
        const meterX = GAME_W / 2 - meterW / 2;
        const meterY = GAME_H - 35;

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(meterX - 2, meterY - 2, meterW + 4, meterH + 4, 4);
        ctx.fill();

        const pct = aimPower / MAX_POWER;
        const grad = ctx.createLinearGradient(meterX, 0, meterX + meterW, 0);
        grad.addColorStop(0, '#34D399');
        grad.addColorStop(0.5, '#FBBF24');
        grad.addColorStop(1, '#F43F5E');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(meterX, meterY, meterW * pct, meterH, 3);
        ctx.fill();
    }

    function drawHUD() {
        ctx.save();

        const holes = getHoles();
        const h = holes[currentHole];

        // Top bar
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, GAME_W, 30);

        ctx.textBaseline = 'middle';
        ctx.font = '13px "Segoe UI", system-ui, sans-serif';

        // Hole info
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`Hole ${currentHole + 1}/9`, 8, 15);

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`"${h.name}"`, 80, 15);

        // Par / Strokes
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(`Par ${h.par}  •  Strokes: ${strokes}`, GAME_W - 8, 15);

        // Player name (bottom)
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';
        ctx.font = '11px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        const pName = (player?.emoji || '') + ' ' + (player?.name || 'Player');
        ctx.fillText(pName.trim(), 6, GAME_H - 4);

        // Total score
        const totalStrokes = holeScores.reduce((a, b) => a + b, 0) + strokes;
        const totalPar = holes.slice(0, currentHole).reduce((a, h2) => a + h2.par, 0) + h.par;
        const diff = totalStrokes - totalPar;
        ctx.textAlign = 'right';
        ctx.fillStyle = diff <= 0 ? '#34D399' : '#F59E0B';
        ctx.fillText(`Total: ${totalStrokes} (${diff >= 0 ? '+' : ''}${diff})`, GAME_W - 6, GAME_H - 4);

        // Instructions
        if (state === ST_AIMING) {
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '11px "Segoe UI", system-ui, sans-serif';
            ctx.fillText('Drag from ball to aim & set power', GAME_W / 2, GAME_H - 18);
        }

        ctx.restore();
    }

    function drawScoreCard() {
        if (state !== ST_SCORECARD) return;

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        const holes = getHoles();
        const cardW = 420;
        const cardH = 240;
        const cardX = (GAME_W - cardW) / 2;
        const cardY = (GAME_H - cardH) / 2 - 30;

        // Card background
        ctx.fillStyle = 'rgba(20,30,20,0.95)';
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 10);
        ctx.fill();
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 10);
        ctx.stroke();

        // Title
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('SCORECARD', GAME_W / 2, cardY + 25);

        // Column headers
        const colW = cardW / 11;
        const headerY = cardY + 55;
        ctx.font = '11px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('Hole', cardX + colW * 0.5, headerY);
        for (let i = 0; i < 9; i++) {
            ctx.fillText((i + 1).toString(), cardX + colW * (i + 1.5), headerY);
        }
        ctx.fillText('TOT', cardX + colW * 10.5, headerY);

        // Par row
        const parY = headerY + 25;
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('Par', cardX + colW * 0.5, parY);
        let totalPar = 0;
        for (let i = 0; i < 9; i++) {
            ctx.fillText(holes[i].par.toString(), cardX + colW * (i + 1.5), parY);
            totalPar += holes[i].par;
        }
        ctx.fillText(totalPar.toString(), cardX + colW * 10.5, parY);

        // Score row
        const scoreY = parY + 25;
        ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFF';
        ctx.fillText('Score', cardX + colW * 0.5, scoreY);
        let totalStrokes = 0;
        for (let i = 0; i < 9; i++) {
            if (i < holeScores.length) {
                const s = holeScores[i];
                const par = holes[i].par;
                const diff = s - par;
                if (s === 1) ctx.fillStyle = '#FF4500';
                else if (diff <= -2) ctx.fillStyle = '#FFD700';
                else if (diff === -1) ctx.fillStyle = '#34D399';
                else if (diff === 0) ctx.fillStyle = '#3B82F6';
                else if (diff === 1) ctx.fillStyle = '#F59E0B';
                else ctx.fillStyle = '#F43F5E';

                ctx.fillText(s.toString(), cardX + colW * (i + 1.5), scoreY);
                totalStrokes += s;
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.fillText('-', cardX + colW * (i + 1.5), scoreY);
            }
        }
        const totalDiff = totalStrokes - totalPar;
        ctx.fillStyle = totalDiff <= 0 ? '#34D399' : '#F59E0B';
        ctx.fillText(totalStrokes.toString(), cardX + colW * 10.5, scoreY);

        // Diff row
        const diffY = scoreY + 25;
        ctx.font = '11px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText('+/-', cardX + colW * 0.5, diffY);
        for (let i = 0; i < holeScores.length; i++) {
            const diff = holeScores[i] - holes[i].par;
            const sign = diff > 0 ? '+' : '';
            if (diff < 0) ctx.fillStyle = '#34D399';
            else if (diff === 0) ctx.fillStyle = 'rgba(255,255,255,0.4)';
            else ctx.fillStyle = '#F43F5E';
            ctx.fillText(sign + diff.toString(), cardX + colW * (i + 1.5), diffY);
        }
        ctx.fillStyle = totalDiff <= 0 ? '#34D399' : '#F43F5E';
        ctx.fillText((totalDiff >= 0 ? '+' : '') + totalDiff.toString(), cardX + colW * 10.5, diffY);

        // Prompt
        const promptY = cardY + cardH + 30;
        const pulse = 0.4 + Math.sin(Date.now() * 0.005) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 8;
        if (currentHole < 8) {
            ctx.fillText('Tap or Space for Next Hole', GAME_W / 2, promptY);
        } else {
            ctx.fillText('Tap or Space to Finish', GAME_W / 2, promptY);
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    function drawTitleScreen(time) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.font = 'bold 42px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#34D399';
        ctx.shadowColor = '#34D399';
        ctx.shadowBlur = 20;
        ctx.fillText('MINI GOLF', GAME_W / 2, GAME_H * 0.25);
        ctx.shadowBlur = 0;

        ctx.font = '16px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('9 Holes  •  Par for the Course', GAME_W / 2, GAME_H * 0.37);

        ctx.font = '13px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('Drag from ball to aim and set power', GAME_W / 2, GAME_H * 0.48);
        ctx.fillText('Obstacles: Sand, Water, Walls, Bumpers, Windmills', GAME_W / 2, GAME_H * 0.54);

        const pulse = 0.4 + Math.sin(time * 0.005) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 8;
        ctx.fillText('Tap or Space to Start', GAME_W / 2, GAME_H * 0.72);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    function drawGameOverScreen(time) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        const holes = getHoles();
        const totalStrokes = holeScores.reduce((a, b) => a + b, 0);
        const totalPar = holes.reduce((a, h) => a + h.par, 0);
        const diff = totalStrokes - totalPar;

        const great = diff <= 0;
        const title = great ? 'GREAT ROUND!' : 'ROUND COMPLETE';
        const clr = great ? '#34D399' : '#F59E0B';

        ctx.font = 'bold 36px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = clr;
        ctx.shadowColor = clr;
        ctx.shadowBlur = 20;
        ctx.fillText(title, GAME_W / 2, GAME_H * 0.22);
        ctx.shadowBlur = 0;

        ctx.font = 'bold 26px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`${totalStrokes} Strokes`, GAME_W / 2, GAME_H * 0.33);

        ctx.font = '18px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = diff <= 0 ? '#34D399' : '#F43F5E';
        ctx.fillText(`${diff >= 0 ? '+' : ''}${diff} (Par ${totalPar})`, GAME_W / 2, GAME_H * 0.40);

        // Mini scorecard
        ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        const miniY = GAME_H * 0.48;
        for (let i = 0; i < 9; i++) {
            const cx = GAME_W / 2 + (i - 4) * 38;
            const s = holeScores[i];
            const par = holes[i].par;
            const d = s - par;
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillText((i + 1).toString(), cx, miniY);
            ctx.fillStyle = d <= -2 ? '#FFD700' : d === -1 ? '#34D399' : d === 0 ? '#3B82F6' : d === 1 ? '#F59E0B' : '#F43F5E';
            if (s === 1) ctx.fillStyle = '#FF4500';
            ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
            ctx.fillText(s.toString(), cx, miniY + 18);
            ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        }

        const dur = Math.floor((Date.now() - startTime) / 1000);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '13px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(`Duration: ${dur}s`, GAME_W / 2, GAME_H * 0.60);

        const pulse = 0.35 + Math.sin(time * 0.005) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 8;
        ctx.fillText('Tap or Space to Play Again', GAME_W / 2, GAME_H * 0.75);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    // ── Update ──────────────────────────────────────────────────
    function update(time) {
        updateParticles();
        updateMessages();

        // Update windmill angles
        for (const wm of windmills) {
            wm.angle += wm.speed;
        }

        if (state === ST_TITLE || state === ST_OVER) return;

        if (state === ST_ROLLING) {
            if (!ballInWater) {
                updatePhysics();
                if (ballSpeed() < MIN_SPEED && !ballSunk) {
                    ballVX = 0;
                    ballVY = 0;
                    // Max strokes check
                    if (strokes >= getHoles()[currentHole].par * 3) {
                        addMessage('MAX STROKES', ballX, ballY - 20, '#F43F5E');
                        holeScores.push(strokes);
                        state = ST_HOLE_IN;
                        holeInTimer = Date.now() + 1500;
                    } else {
                        state = ST_AIMING;
                    }
                }
            }
            return;
        }

        if (state === ST_HOLE_IN) {
            if (Date.now() >= holeInTimer) {
                state = ST_SCORECARD;
                scorecardTimer = Date.now() + 500;
            }
            return;
        }

        if (state === ST_AIMING || state === ST_POWER) {
            // Handle keyboard aiming
            if (keys['ArrowLeft'] || keys['a']) aimAngle -= 0.03;
            if (keys['ArrowRight'] || keys['d']) aimAngle += 0.03;
            if (keys['ArrowUp'] || keys['w']) aimPower = Math.min(MAX_POWER, aimPower + 0.2);
            if (keys['ArrowDown'] || keys['s']) aimPower = Math.max(0, aimPower - 0.2);
        }
    }

    // ── Draw ────────────────────────────────────────────────────
    function draw(time) {
        ctx.clearRect(0, 0, GAME_W, GAME_H);

        if (state !== ST_TITLE && state !== ST_OVER) {
            drawCourse();
            drawAimLine();
            drawBall();
            drawPowerMeter();
        }

        drawParticles();
        drawMessages();

        if (state !== ST_TITLE && state !== ST_OVER) {
            drawHUD();
        }

        drawScoreCard();

        if (state === ST_TITLE)  drawTitleScreen(time);
        if (state === ST_OVER)   drawGameOverScreen(time);
    }

    // ── Main loop ──────────────────────────────────────────────
    function loop(time) {
        if (!canvas) return;
        update(time);
        draw(time);
        animFrame = requestAnimationFrame(loop);
    }

    // ── Resize handler ─────────────────────────────────────────
    function fitCanvas() {
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;

        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const aspect = GAME_W / GAME_H;
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
        canvas.width  = GAME_W;
        canvas.height = GAME_H;

        W     = GAME_W;
        H     = GAME_H;
        scale = w / GAME_W;
    }

    // ── Start game ─────────────────────────────────────────────
    function startGame() {
        ensureAudio();
        currentHole = 0;
        holeScores = [];
        startTime = Date.now();
        particles = [];
        messages = [];
        gameActive = true;
        loadHole(0);
        state = ST_AIMING;
    }

    function nextHole() {
        currentHole++;
        if (currentHole >= 9) {
            // Game over
            const holes = getHoles();
            const totalStrokes = holeScores.reduce((a, b) => a + b, 0);
            const totalPar = holes.reduce((a, h) => a + h.par, 0);
            score = Math.max(0, (totalPar * 3 - totalStrokes) * 10);

            state = ST_OVER;
            gameActive = false;

            setTimeout(() => {
                if (onGameOver) {
                    onGameOver({
                        score,
                        level: Math.max(1, 10 - Math.floor((totalStrokes - totalPar) / 3)),
                        duration: Math.floor((Date.now() - startTime) / 1000),
                        totalPopped: holeScores.filter((s, i) => s === 1).length,
                        maxCombo: Math.min(...holeScores)
                    });
                }
            }, 2000);
        } else {
            loadHole(currentHole);
            state = ST_AIMING;
        }
    }

    function shootBall() {
        if (aimPower < 0.3) return;
        const power = Math.min(aimPower, MAX_POWER);
        ballVX = Math.cos(aimAngle) * power;
        ballVY = Math.sin(aimAngle) * power;
        strokes++;
        playPutt();
        spawnBurst(ballX, ballY, 4, '#8F8');
        state = ST_ROLLING;
        aimDragging = false;
    }

    // ── Event handlers ─────────────────────────────────────────
    function onKeyDown(e) {
        keys[e.key] = true;

        if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
            e.preventDefault();
            if (state === ST_TITLE) { startGame(); return; }
            if (state === ST_OVER) { state = ST_TITLE; return; }
            if (state === ST_SCORECARD) { nextHole(); return; }
            if ((state === ST_AIMING || state === ST_POWER) && aimPower > 0.3) {
                shootBall();
                return;
            }
        }
    }

    function onKeyUp(e) { keys[e.key] = false; }

    function getCanvasPos(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / scale,
            y: (clientY - rect.top) / scale
        };
    }

    function onMouseDown(e) {
        ensureAudio();
        const pos = getCanvasPos(e.clientX, e.clientY);
        mouseX = pos.x;
        mouseY = pos.y;

        if (state === ST_TITLE) { startGame(); return; }
        if (state === ST_OVER) { state = ST_TITLE; return; }
        if (state === ST_SCORECARD) { nextHole(); return; }

        if (state === ST_AIMING) {
            aimDragging = true;
            dragStartX = ballX;
            dragStartY = ballY;
            state = ST_POWER;
        }
    }

    function onMouseMove(e) {
        const pos = getCanvasPos(e.clientX, e.clientY);
        mouseX = pos.x;
        mouseY = pos.y;

        if (aimDragging && (state === ST_POWER || state === ST_AIMING)) {
            // Aim opposite to drag direction
            const dx = mouseX - dragStartX;
            const dy = mouseY - dragStartY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            aimAngle = Math.atan2(-dy, -dx);
            aimPower = Math.min(MAX_POWER, dist * 0.12);
        }
    }

    function onMouseUp(e) {
        if (aimDragging && (state === ST_POWER) && aimPower > 0.3) {
            shootBall();
        } else if (aimDragging) {
            state = ST_AIMING;
            aimPower = 0;
        }
        aimDragging = false;
    }

    function onTouchStart(e) {
        ensureAudio();
        if (e.touches.length === 0) return;
        const pos = getCanvasPos(e.touches[0].clientX, e.touches[0].clientY);
        mouseX = pos.x;
        mouseY = pos.y;

        if (state === ST_TITLE) { startGame(); return; }
        if (state === ST_OVER) { state = ST_TITLE; return; }
        if (state === ST_SCORECARD) { nextHole(); return; }

        if (state === ST_AIMING) {
            aimDragging = true;
            dragStartX = ballX;
            dragStartY = ballY;
            state = ST_POWER;
        }
    }

    function onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 0) return;
        const pos = getCanvasPos(e.touches[0].clientX, e.touches[0].clientY);
        mouseX = pos.x;
        mouseY = pos.y;

        if (aimDragging && (state === ST_POWER || state === ST_AIMING)) {
            const dx = mouseX - dragStartX;
            const dy = mouseY - dragStartY;
            aimAngle = Math.atan2(-dy, -dx);
            aimPower = Math.min(MAX_POWER, Math.sqrt(dx * dx + dy * dy) * 0.12);
        }
    }

    function onTouchEnd(e) {
        if (aimDragging && (state === ST_POWER) && aimPower > 0.3) {
            shootBall();
        } else if (aimDragging) {
            state = ST_AIMING;
            aimPower = 0;
        }
        aimDragging = false;
    }

    function onResize() { fitCanvas(); }

    // ══════════════════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════════════════
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas     = canvasEl;
        ctx        = canvas.getContext('2d');
        player     = activePlayer || null;
        onGameOver = gameOverCallback || null;

        const themeId = activePlayer?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            BG_CLR     = _t.bgGradient[0] || BG_CLR;
            ACCENT_CLR = _t.colors[0]      || ACCENT_CLR;
        }

        keys = {};
        particles = [];
        messages = [];
        gameActive = false;
        state = ST_TITLE;
        holeScores = [];
        currentHole = 0;

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        loadHole(0);

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup',   onKeyUp);
        window.addEventListener('resize',  onResize);
        canvas.addEventListener('mousedown',  onMouseDown);
        canvas.addEventListener('mousemove',  onMouseMove);
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
            canvas.removeEventListener('mousedown',  onMouseDown);
            canvas.removeEventListener('mousemove',  onMouseMove);
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
        getLevel()  { return currentHole + 1; },
        isActive()  { return gameActive; }
    };
})();
