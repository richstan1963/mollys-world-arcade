/* Maeteoroids — Theme-aware Asteroids for Your World Arcade */
window.Maeteoroids = (() => {
    // ── Colors (theme-overridable) ──
    let BG_COLOR        = '#0a0515';
    let SHIP_COLOR      = '#06B6D4';
    let BULLET_COLOR    = '#F59E0B';
    let ASTEROID_COLORS = ['#A78BFA', '#F472B6', '#34D399', '#60A5FA', '#FBBF24', '#F43F5E'];
    let TITLE_COLOR     = '#06B6D4';
    const HUD_COLOR     = '#e0e7ff';
    let bgGrad          = ['#1a1030', '#120a20', '#0a0515'];

    // ── Scale-dependent constants (set in init based on canvas size) ──
    let SCALE = 1;
    let GLOW_AMOUNT, SHIP_SIZE;
    let ROTATION_SPEED = 5;
    let THRUST_POWER, MAX_SPEED, FRICTION;
    let BULLET_SPEED, BULLET_LIFE, MAX_BULLETS, FIRE_RATE;
    let INVULN_TIME = 2000, RESPAWN_DELAY = 1500, LEVEL_DISPLAY_TIME = 2000;
    let STAR_COUNT, PARTICLE_COUNT;
    let ASTEROID_SCORES = { large: 20, medium: 50, small: 100 };
    let ASTEROID_SIZES = {}, ASTEROID_SPEEDS = {};
    let INITIAL_ASTEROIDS = 4;

    // ── State ──
    let canvas, ctx, W, H;
    let gameActive = false, paused = false;
    let score = 0, level = 1, lives = 3;
    let ship, bullets, asteroids, particles, stars;
    let keys = {};
    let lastFireTime = 0;
    let invulnTimer = 0;
    let respawnTimer = 0;
    let levelDisplayTimer = 0;
    let screenFlash = 0;
    let gameOverCallback = null;
    let activePlayer = null;
    let animFrame = null;
    let lastTime = 0;
    let audioCtx = null;
    let startTime = 0;

    // ── Touch state ──
    let touchLeft = false, touchRight = false, touchThrust = false, touchFire = false;
    let lastTapTime = 0;

    // ── Compute scale-dependent values ──
    function computeScale() {
        const ref = 600; // reference dimension
        SCALE = Math.min(W, H) / ref;
        SCALE = Math.max(SCALE, 0.4); // minimum scale

        GLOW_AMOUNT = Math.round(12 * SCALE);
        SHIP_SIZE = Math.round(24 * SCALE);
        THRUST_POWER = 0.15;
        MAX_SPEED = 6 * SCALE;
        FRICTION = 0.992;
        BULLET_SPEED = 8 * SCALE;
        BULLET_LIFE = 55;
        MAX_BULLETS = 8;
        FIRE_RATE = 150;
        STAR_COUNT = Math.round(120 * SCALE * SCALE);
        PARTICLE_COUNT = Math.round(14 * SCALE);

        ASTEROID_SIZES = {
            large: Math.round(45 * SCALE),
            medium: Math.round(24 * SCALE),
            small: Math.round(12 * SCALE)
        };
        ASTEROID_SPEEDS = {
            large: 1.2 * SCALE,
            medium: 2 * SCALE,
            small: 3 * SCALE
        };
    }

    // ── Utility ──
    function rand(min, max) { return Math.random() * (max - min) + min; }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function wrap(obj) {
        const margin = 30 * SCALE;
        if (obj.x > W + margin) obj.x = -margin;
        else if (obj.x < -margin) obj.x = W + margin;
        if (obj.y > H + margin) obj.y = -margin;
        else if (obj.y < -margin) obj.y = H + margin;
    }

    // ── Stars ──
    function createStars() {
        stars = [];
        for (let i = 0; i < STAR_COUNT; i++) {
            stars.push({
                x: rand(0, W), y: rand(0, H),
                size: rand(0.5, 2.5) * SCALE,
                brightness: rand(0.3, 1),
                drift: rand(-0.05, 0.05)
            });
        }
    }

    function updateStars(dt) {
        for (const s of stars) {
            s.x += s.drift * dt;
            s.y += 0.02 * dt;
            s.brightness += rand(-0.01, 0.01);
            s.brightness = Math.max(0.2, Math.min(1, s.brightness));
            if (s.x > W) s.x = 0;
            if (s.x < 0) s.x = W;
            if (s.y > H) s.y = 0;
        }
    }

    function drawStars() {
        for (const s of stars) {
            ctx.fillStyle = `rgba(200,210,255,${s.brightness * 0.6})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── Ship ──
    function createShip() {
        return {
            x: W / 2, y: H / 2, rot: -Math.PI / 2,
            vx: 0, vy: 0, alive: true, thrusting: false,
            thrustParticles: []
        };
    }

    function updateShip(dt) {
        if (!ship.alive) return;
        const rotating = (keys.ArrowLeft || keys.left || touchLeft) ? -1
            : (keys.ArrowRight || keys.right || touchRight) ? 1 : 0;
        ship.rot += rotating * ROTATION_SPEED * dt * 0.016;
        ship.thrusting = !!(keys.ArrowUp || keys.up || touchThrust);
        if (ship.thrusting) {
            ship.vx += Math.cos(ship.rot) * THRUST_POWER * dt * 0.016;
            ship.vy += Math.sin(ship.rot) * THRUST_POWER * dt * 0.016;
            if (Math.random() < 0.6) {
                const angle = ship.rot + Math.PI + rand(-0.3, 0.3);
                ship.thrustParticles.push({
                    x: ship.x - Math.cos(ship.rot) * SHIP_SIZE * 0.6,
                    y: ship.y - Math.sin(ship.rot) * SHIP_SIZE * 0.6,
                    vx: Math.cos(angle) * rand(1, 3) * SCALE + ship.vx * 0.3,
                    vy: Math.sin(angle) * rand(1, 3) * SCALE + ship.vy * 0.3,
                    life: 1, decay: rand(0.03, 0.06)
                });
            }
            playThrust();
        }
        const speed = Math.hypot(ship.vx, ship.vy);
        if (speed > MAX_SPEED) {
            ship.vx *= MAX_SPEED / speed;
            ship.vy *= MAX_SPEED / speed;
        }
        ship.vx *= Math.pow(FRICTION, dt * 0.016 * 60);
        ship.vy *= Math.pow(FRICTION, dt * 0.016 * 60);
        ship.x += ship.vx * dt * 0.06;
        ship.y += ship.vy * dt * 0.06;
        wrap(ship);
        // Thrust particles
        for (let i = ship.thrustParticles.length - 1; i >= 0; i--) {
            const p = ship.thrustParticles[i];
            p.x += p.vx * dt * 0.06;
            p.y += p.vy * dt * 0.06;
            p.life -= p.decay * dt * 0.06;
            if (p.life <= 0) ship.thrustParticles.splice(i, 1);
        }
        if (invulnTimer > 0) invulnTimer -= dt;
    }

    function drawShip() {
        if (!ship.alive) return;
        if (invulnTimer > 0 && Math.floor(invulnTimer / 80) % 2 === 0) return;
        const S = SHIP_SIZE;
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.rot);
        ctx.shadowColor = SHIP_COLOR;
        ctx.shadowBlur = GLOW_AMOUNT;

        // Solid candy ship body with gradient
        const shipGrad = ctx.createLinearGradient(-S, 0, S, 0);
        shipGrad.addColorStop(0, '#0E7490');
        shipGrad.addColorStop(0.4, '#06B6D4');
        shipGrad.addColorStop(1, '#67E8F9');
        ctx.fillStyle = shipGrad;
        ctx.beginPath();
        ctx.moveTo(S, 0);
        ctx.lineTo(-S * 0.7, -S * 0.55);
        ctx.lineTo(-S * 0.35, 0);
        ctx.lineTo(-S * 0.7, S * 0.55);
        ctx.closePath();
        ctx.fill();

        // Glossy highlight on upper half
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.moveTo(S * 0.7, -S * 0.05);
        ctx.quadraticCurveTo(S * 0.2, -S * 0.4, -S * 0.5, -S * 0.4);
        ctx.lineTo(-S * 0.35, 0);
        ctx.lineTo(S * 0.7, -S * 0.05);
        ctx.closePath();
        ctx.fill();

        // Bright outline
        ctx.strokeStyle = '#67E8F9';
        ctx.lineWidth = Math.max(1.5, 2 * SCALE);
        ctx.beginPath();
        ctx.moveTo(S, 0);
        ctx.lineTo(-S * 0.7, -S * 0.55);
        ctx.lineTo(-S * 0.35, 0);
        ctx.lineTo(-S * 0.7, S * 0.55);
        ctx.closePath();
        ctx.stroke();

        // Engine glow when thrusting — filled candy flame
        if (ship.thrusting) {
            ctx.shadowColor = '#F59E0B';
            ctx.shadowBlur = Math.round(18 * SCALE);
            const flicker = rand(0.6, 1);
            const flameGrad = ctx.createRadialGradient(-S * 0.85, 0, 0, -S * 0.85, 0, S * flicker * 0.6);
            flameGrad.addColorStop(0, '#FDE68A');
            flameGrad.addColorStop(0.4, '#F59E0B');
            flameGrad.addColorStop(1, 'rgba(239,68,68,0)');
            ctx.fillStyle = flameGrad;
            ctx.beginPath();
            ctx.moveTo(-S * 0.65, -S * 0.3);
            ctx.quadraticCurveTo(-S * (1 + flicker * 0.4), 0, -S * 0.65, S * 0.3);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        // Thrust trail particles
        ctx.shadowColor = '#F59E0B';
        ctx.shadowBlur = Math.round(8 * SCALE);
        for (const p of ship.thrustParticles) {
            const alpha = p.life * 0.8;
            ctx.fillStyle = `rgba(245,158,11,${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.life * 3 * SCALE, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }

    // ── Bullets ──
    function fireBullet() {
        const now = performance.now();
        if (now - lastFireTime < FIRE_RATE) return;
        if (bullets.length >= MAX_BULLETS) return;
        if (!ship.alive) return;
        lastFireTime = now;
        bullets.push({
            x: ship.x + Math.cos(ship.rot) * SHIP_SIZE,
            y: ship.y + Math.sin(ship.rot) * SHIP_SIZE,
            vx: Math.cos(ship.rot) * BULLET_SPEED + ship.vx * 0.3,
            vy: Math.sin(ship.rot) * BULLET_SPEED + ship.vy * 0.3,
            life: BULLET_LIFE, trail: []
        });
        playShoot();
    }

    function updateBullets(dt) {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.trail.push({ x: b.x, y: b.y });
            if (b.trail.length > 6) b.trail.shift();
            b.x += b.vx * dt * 0.06;
            b.y += b.vy * dt * 0.06;
            b.life -= dt * 0.06;
            wrap(b);
            if (b.life <= 0) bullets.splice(i, 1);
        }
    }

    function drawBullets() {
        for (const b of bullets) {
            // Trail
            ctx.shadowColor = BULLET_COLOR;
            ctx.shadowBlur = Math.round(8 * SCALE);
            for (let i = 0; i < b.trail.length; i++) {
                const alpha = (i / b.trail.length) * 0.4;
                ctx.fillStyle = `rgba(245,158,11,${alpha})`;
                ctx.beginPath();
                ctx.arc(b.trail[i].x, b.trail[i].y, 1.5 * SCALE, 0, Math.PI * 2);
                ctx.fill();
            }
            // Candy bullet — glowing gradient ball
            ctx.shadowBlur = Math.round(12 * SCALE);
            const bGrad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 4 * SCALE);
            bGrad.addColorStop(0, '#FDE68A');
            bGrad.addColorStop(0.5, BULLET_COLOR);
            bGrad.addColorStop(1, '#D97706');
            ctx.fillStyle = bGrad;
            ctx.beginPath();
            ctx.arc(b.x, b.y, 3.5 * SCALE, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }

    // ── Asteroids ──
    function makeAsteroidShape(radius) {
        const pts = [];
        const verts = Math.floor(rand(8, 14));
        for (let i = 0; i < verts; i++) {
            const angle = (i / verts) * Math.PI * 2;
            const r = radius * rand(0.7, 1.3);
            pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
        }
        return pts;
    }

    function spawnAsteroid(x, y, size) {
        const radius = ASTEROID_SIZES[size];
        const speed = ASTEROID_SPEEDS[size] * rand(0.6, 1.4);
        const angle = rand(0, Math.PI * 2);
        asteroids.push({
            x: x, y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            rot: 0, rotSpeed: rand(-0.03, 0.03),
            size: size, radius: radius,
            color: ASTEROID_COLORS[Math.floor(rand(0, ASTEROID_COLORS.length))],
            shape: makeAsteroidShape(radius)
        });
    }

    function spawnWave() {
        const count = INITIAL_ASTEROIDS + level - 1;
        const safeRadius = 120 * SCALE;
        for (let i = 0; i < Math.min(count, 12); i++) {
            let x, y;
            const margin = 30 * SCALE;
            do {
                const edge = Math.floor(rand(0, 4));
                if (edge === 0) { x = rand(0, W); y = -margin; }
                else if (edge === 1) { x = W + margin; y = rand(0, H); }
                else if (edge === 2) { x = rand(0, W); y = H + margin; }
                else { x = -margin; y = rand(0, H); }
            } while (ship && dist({ x, y }, ship) < safeRadius);
            spawnAsteroid(x, y, 'large');
        }
    }

    function updateAsteroids(dt) {
        for (const a of asteroids) {
            a.x += a.vx * dt * 0.06;
            a.y += a.vy * dt * 0.06;
            a.rot += a.rotSpeed * dt * 0.06;
            wrap(a);
        }
    }

    function drawAsteroids() {
        for (const a of asteroids) {
            ctx.save();
            ctx.translate(a.x, a.y);
            ctx.rotate(a.rot);

            const rad = a.radius;
            const rgb = hexToRgb(a.color);

            // Candy ball — filled gradient circle
            ctx.shadowColor = a.color;
            ctx.shadowBlur = GLOW_AMOUNT;
            const grad = ctx.createRadialGradient(-rad * 0.25, -rad * 0.25, rad * 0.1, 0, 0, rad);
            grad.addColorStop(0, 'rgba(255,255,255,0.55)');
            grad.addColorStop(0.35, a.color);
            grad.addColorStop(1, `rgba(${rgb},0.5)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, rad, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Swirl pattern for large/medium
            if (a.size !== 'small') {
                ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                ctx.lineWidth = Math.max(1, rad * 0.06);
                ctx.beginPath();
                for (let ang = 0; ang < Math.PI * 4; ang += 0.15) {
                    const sr = rad * 0.15 + (ang / (Math.PI * 4)) * rad * 0.65;
                    const sx = Math.cos(ang) * sr;
                    const sy = Math.sin(ang) * sr;
                    if (ang < 0.01) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
                }
                ctx.stroke();
            }

            // Glossy highlight
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.ellipse(-rad * 0.22, -rad * 0.28, rad * 0.35, rad * 0.18, -0.5, 0, Math.PI * 2);
            ctx.fill();

            // Shine dot
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath();
            ctx.arc(-rad * 0.3, -rad * 0.35, Math.max(1.5, rad * 0.1), 0, Math.PI * 2);
            ctx.fill();

            // Subtle border ring
            ctx.strokeStyle = `rgba(${rgb},0.3)`;
            ctx.lineWidth = Math.max(1, rad * 0.04);
            ctx.beginPath();
            ctx.arc(0, 0, rad * 0.95, 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();
        }
        ctx.shadowBlur = 0;
    }

    // ── Particles ──
    function spawnExplosion(x, y, color, count) {
        for (let i = 0; i < (count || PARTICLE_COUNT); i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(1, 5) * SCALE;
            particles.push({
                x: x, y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1, decay: rand(0.015, 0.04),
                color: color, size: rand(1, 4) * SCALE
            });
        }
    }

    function spawnShipDeath(x, y) {
        const S = SHIP_SIZE;
        const frags = [
            { dx: S, dy: 0 },
            { dx: -S * 0.7, dy: -S * 0.55 },
            { dx: -S * 0.7, dy: S * 0.55 }
        ];
        for (const f of frags) {
            const angle = Math.atan2(f.dy, f.dx) + rand(-0.5, 0.5);
            const speed = rand(1, 3) * SCALE;
            particles.push({
                x: x + f.dx * 0.5, y: y + f.dy * 0.5,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: 1, decay: 0.012, color: SHIP_COLOR, size: 3 * SCALE, isLine: true,
                rot: rand(0, Math.PI * 2), rotSpeed: rand(-0.1, 0.1), len: rand(6, 14) * SCALE
            });
        }
        spawnExplosion(x, y, SHIP_COLOR, Math.round(20 * SCALE));
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt * 0.06;
            p.y += p.vy * dt * 0.06;
            if (p.rot !== undefined) p.rot += p.rotSpeed * dt * 0.06;
            p.life -= p.decay * dt * 0.06;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = Math.max(0, p.life);
            ctx.shadowColor = p.color;
            ctx.shadowBlur = Math.round(6 * SCALE);
            if (p.isLine) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.strokeStyle = `rgba(${hexToRgb(p.color)},${alpha})`;
                ctx.lineWidth = Math.max(1, 2 * SCALE);
                ctx.beginPath();
                ctx.moveTo(-p.len / 2, 0);
                ctx.lineTo(p.len / 2, 0);
                ctx.stroke();
                ctx.restore();
            } else {
                ctx.fillStyle = `rgba(${hexToRgb(p.color)},${alpha})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.shadowBlur = 0;
    }

    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r},${g},${b}`;
    }

    // ── Collisions ──
    function checkCollisions() {
        if (!ship.alive || invulnTimer > 0) return;
        for (let i = asteroids.length - 1; i >= 0; i--) {
            const a = asteroids[i];
            if (dist(ship, a) < a.radius + SHIP_SIZE * 0.5) {
                killShip();
                return;
            }
        }
    }

    function checkBulletHits() {
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            for (let ai = asteroids.length - 1; ai >= 0; ai--) {
                const a = asteroids[ai];
                if (dist(b, a) < a.radius + 3 * SCALE) {
                    score += ASTEROID_SCORES[a.size];
                    spawnExplosion(a.x, a.y, a.color, a.size === 'large' ? 18 : a.size === 'medium' ? 12 : 8);
                    screenFlash = 3;
                    playExplode(a.size);
                    // Confetti for large asteroid kills
                    if (a.size === 'large' && typeof Confetti !== 'undefined') {
                        Confetti.burst(a.x, a.y, 10);
                    }
                    if (a.size === 'large') {
                        spawnAsteroid(a.x, a.y, 'medium');
                        spawnAsteroid(a.x, a.y, 'medium');
                    } else if (a.size === 'medium') {
                        spawnAsteroid(a.x, a.y, 'small');
                        spawnAsteroid(a.x, a.y, 'small');
                    }
                    asteroids.splice(ai, 1);
                    bullets.splice(bi, 1);
                    break;
                }
            }
        }
    }

    function killShip() {
        ship.alive = false;
        spawnShipDeath(ship.x, ship.y);
        playDeath();
        lives--;
        if (lives <= 0) {
            respawnTimer = -1;
        } else {
            respawnTimer = RESPAWN_DELAY;
        }
    }

    function respawnShip() {
        ship.x = W / 2;
        ship.y = H / 2;
        ship.vx = 0;
        ship.vy = 0;
        ship.rot = -Math.PI / 2;
        ship.alive = true;
        ship.thrustParticles = [];
        invulnTimer = INVULN_TIME;
    }

    // ── Audio (Web Audio API) ──
    function ensureAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch (e) { audioCtx = null; }
        }
    }

    function playShoot() {
        ensureAudio();
        if (!audioCtx) return;
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(880, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.1);
        } catch (e) {}
    }

    let thrustOsc = null, thrustGain = null;
    function playThrust() {
        ensureAudio();
        if (!audioCtx) return;
        if (thrustOsc) return;
        try {
            thrustOsc = audioCtx.createOscillator();
            thrustGain = audioCtx.createGain();
            thrustOsc.type = 'sawtooth';
            thrustOsc.frequency.setValueAtTime(55, audioCtx.currentTime);
            thrustGain.gain.setValueAtTime(0.04, audioCtx.currentTime);
            thrustOsc.connect(thrustGain);
            thrustGain.connect(audioCtx.destination);
            thrustOsc.start();
        } catch (e) {}
    }

    function stopThrust() {
        if (thrustOsc) {
            try {
                thrustOsc.stop();
                thrustOsc.disconnect();
                thrustGain.disconnect();
            } catch (e) {}
            thrustOsc = null;
            thrustGain = null;
        }
    }

    function playExplode(size) {
        ensureAudio();
        if (!audioCtx) return;
        try {
            const bufSize = 4096;
            const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
            const src = audioCtx.createBufferSource();
            src.buffer = buf;
            const gain = audioCtx.createGain();
            const vol = size === 'large' ? 0.12 : size === 'medium' ? 0.08 : 0.05;
            gain.gain.setValueAtTime(vol, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(size === 'large' ? 600 : 1200, audioCtx.currentTime);
            src.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            src.start();
            src.stop(audioCtx.currentTime + 0.3);
        } catch (e) {}
    }

    function playDeath() {
        ensureAudio();
        if (!audioCtx) return;
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.8);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.8);
            const bufSize = audioCtx.sampleRate;
            const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
            const src = audioCtx.createBufferSource();
            src.buffer = buf;
            const ng = audioCtx.createGain();
            ng.gain.setValueAtTime(0.1, audioCtx.currentTime);
            ng.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
            src.connect(ng);
            ng.connect(audioCtx.destination);
            src.start();
            src.stop(audioCtx.currentTime + 0.6);
        } catch (e) {}
    }

    // ── HUD ──
    function drawHUD() {
        ctx.shadowBlur = 0;
        const fontSize = Math.max(13, Math.round(16 * SCALE));
        const titleSize = Math.max(14, Math.round(18 * SCALE));
        const scoreSize = Math.max(18, Math.round(24 * SCALE));

        // Title
        ctx.fillStyle = TITLE_COLOR;
        ctx.shadowColor = TITLE_COLOR;
        ctx.shadowBlur = Math.round(8 * SCALE);
        ctx.font = `bold ${titleSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('ASTEROIDS', W / 2, Math.round(24 * SCALE));
        ctx.shadowBlur = 0;

        // Score
        ctx.fillStyle = HUD_COLOR;
        ctx.font = `bold ${scoreSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(String(score).padStart(6, '0'), W / 2, Math.round(52 * SCALE));

        // Lives (small ship icons)
        const lifeSize = Math.max(6, Math.round(8 * SCALE));
        const lifeSpacing = Math.max(18, Math.round(24 * SCALE));
        for (let i = 0; i < lives; i++) {
            const lx = Math.round(30 * SCALE) + i * lifeSpacing;
            const ly = Math.round(36 * SCALE);
            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(-Math.PI / 2);
            ctx.strokeStyle = SHIP_COLOR;
            ctx.shadowColor = SHIP_COLOR;
            ctx.shadowBlur = Math.round(4 * SCALE);
            ctx.lineWidth = Math.max(1, 1.5 * SCALE);
            ctx.beginPath();
            ctx.moveTo(lifeSize, 0);
            ctx.lineTo(-lifeSize * 0.6, -lifeSize * 0.55);
            ctx.lineTo(-lifeSize * 0.35, 0);
            ctx.lineTo(-lifeSize * 0.6, lifeSize * 0.55);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
        }
        ctx.shadowBlur = 0;

        // Player info
        if (activePlayer) {
            ctx.fillStyle = 'rgba(224,231,255,0.7)';
            ctx.font = `${fontSize}px monospace`;
            ctx.textAlign = 'right';
            const label = (activePlayer.emoji || '') + ' ' + (activePlayer.name || 'Player');
            ctx.fillText(label, W - Math.round(16 * SCALE), Math.round(36 * SCALE));
        }

        // Level
        ctx.fillStyle = 'rgba(224,231,255,0.5)';
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'right';
        ctx.fillText('WAVE ' + level, W - Math.round(16 * SCALE), Math.round(52 * SCALE));
    }

    function drawLevelText() {
        if (levelDisplayTimer > 0) {
            const alpha = Math.min(1, levelDisplayTimer / 500);
            const textSize = Math.max(28, Math.round(48 * SCALE));
            ctx.fillStyle = `rgba(6,182,212,${alpha})`;
            ctx.shadowColor = SHIP_COLOR;
            ctx.shadowBlur = Math.round(20 * SCALE);
            ctx.font = `bold ${textSize}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('WAVE ' + level, W / 2, H / 2 - 10);
            ctx.shadowBlur = 0;
        }
    }

    function drawGameOver() {
        const titleSize = Math.max(30, Math.round(52 * SCALE));
        const scoreTextSize = Math.max(16, Math.round(20 * SCALE));
        const subSize = Math.max(12, Math.round(14 * SCALE));

        ctx.fillStyle = '#FF4D6A';
        ctx.shadowColor = '#FF4D6A';
        ctx.shadowBlur = Math.round(20 * SCALE);
        ctx.font = `bold ${titleSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', W / 2, H / 2 - Math.round(20 * SCALE));
        ctx.shadowBlur = 0;
        ctx.fillStyle = HUD_COLOR;
        ctx.font = `${scoreTextSize}px monospace`;
        ctx.fillText('SCORE: ' + score, W / 2, H / 2 + Math.round(20 * SCALE));
        ctx.fillStyle = 'rgba(224,231,255,0.5)';
        ctx.font = `${subSize}px monospace`;
        ctx.fillText('WAVE ' + level, W / 2, H / 2 + Math.round(48 * SCALE));
    }

    // ── Main Loop ──
    function gameLoop(timestamp) {
        if (!gameActive) return;
        const dt = Math.min(timestamp - lastTime, 50);
        lastTime = timestamp;

        if (ship.alive && !ship.thrusting && thrustOsc) stopThrust();
        if (!ship.alive && thrustOsc) stopThrust();

        if (!paused) {
            updateStars(dt);
            if (ship.alive) {
                updateShip(dt);
                if (keys.Space || keys.space || touchFire) fireBullet();
            }
            updateBullets(dt);
            updateAsteroids(dt);
            updateParticles(dt);
            checkBulletHits();
            checkCollisions();

            if (screenFlash > 0) screenFlash -= dt * 0.02;
            if (levelDisplayTimer > 0) levelDisplayTimer -= dt;

            if (!ship.alive && respawnTimer > 0) {
                respawnTimer -= dt;
                if (respawnTimer <= 0) respawnShip();
            }

            if (!ship.alive && respawnTimer < 0) {
                if (respawnTimer === -1) {
                    respawnTimer = -2;
                    const duration = Math.floor((Date.now() - startTime) / 1000);
                    setTimeout(() => {
                        if (gameOverCallback) {
                            gameOverCallback({ score: score, level: level, duration: duration });
                        }
                    }, 2500);
                }
            }

            if (asteroids.length === 0 && ship.alive && levelDisplayTimer <= 0 && respawnTimer <= 0) {
                level++;
                levelDisplayTimer = LEVEL_DISPLAY_TIME;
                setTimeout(() => { if (gameActive) spawnWave(); }, 800);
            }
        }

        // Draw
        // Dark gradient background (themed)
        const bgGradObj = ctx.createLinearGradient(0, 0, W * 0.3, H);
        bgGradObj.addColorStop(0, bgGrad[0]);
        bgGradObj.addColorStop(0.5, bgGrad[1]);
        bgGradObj.addColorStop(1, bgGrad[2]);
        ctx.fillStyle = bgGradObj;
        ctx.fillRect(0, 0, W, H);

        if (screenFlash > 0) {
            ctx.fillStyle = `rgba(255,255,255,${Math.min(0.08, screenFlash * 0.03)})`;
            ctx.fillRect(0, 0, W, H);
        }

        drawStars();
        drawAsteroids();
        drawBullets();
        drawParticles();
        drawShip();
        drawHUD();
        drawLevelText();

        if (!ship.alive && respawnTimer < 0) drawGameOver();

        animFrame = requestAnimationFrame(gameLoop);
    }

    // ── Input Handlers ──
    function onKeyDown(e) {
        const k = e.code || e.key;
        keys[k] = true;
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) {
            e.preventDefault();
        }
    }

    function onKeyUp(e) {
        const k = e.code || e.key;
        keys[k] = false;
    }

    function onTouchStart(e) {
        e.preventDefault();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        for (const touch of e.changedTouches) {
            const rect = canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            const w3 = W / 3;
            if (x < w3) touchLeft = true;
            else if (x > w3 * 2) touchRight = true;
            else {
                // Middle zone: top half = thrust, bottom half = fire
                if (y < H / 2) {
                    touchThrust = true;
                } else {
                    fireBullet();
                    touchFire = true;
                }
            }
        }
    }

    function onTouchEnd(e) {
        e.preventDefault();
        touchLeft = false;
        touchRight = false;
        touchThrust = false;
        touchFire = false;
    }

    // ── Public API ──
    function init(canvasEl, player, onGameOver) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        W = canvas.width;
        H = canvas.height;
        activePlayer = player || null;
        gameOverCallback = onGameOver || null;
        startTime = Date.now();

        // Load player theme
        const themeId = activePlayer?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            SHIP_COLOR      = _t.colors[0] || SHIP_COLOR;
            BULLET_COLOR    = _t.colors[1] || BULLET_COLOR;
            TITLE_COLOR     = _t.colors[0] || TITLE_COLOR;
            ASTEROID_COLORS = _t.colors.slice(0, 6);
            bgGrad          = [_t.bgGradient[0], _t.bgGradient[1], _t.bgGradient[1]];
        }

        // Compute all scale-dependent values
        computeScale();

        // Reset state
        score = 0; level = 1; lives = 3;
        bullets = []; asteroids = []; particles = [];
        keys = {};
        lastFireTime = 0;
        invulnTimer = INVULN_TIME;
        respawnTimer = 0;
        levelDisplayTimer = LEVEL_DISPLAY_TIME;
        screenFlash = 0;
        paused = false;
        gameActive = true;
        touchLeft = false; touchRight = false;
        touchThrust = false; touchFire = false;
        lastTapTime = 0;
        thrustOsc = null; thrustGain = null;
        audioCtx = null;

        ship = createShip();
        createStars();
        spawnWave();

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });

        lastTime = performance.now();
        animFrame = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        stopThrust();
        if (audioCtx) {
            try { audioCtx.close(); } catch (e) {}
            audioCtx = null;
        }
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        if (canvas) {
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        keys = {};
        bullets = []; asteroids = []; particles = []; stars = [];
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return level; },
        isActive() { return gameActive; }
    };
})();
