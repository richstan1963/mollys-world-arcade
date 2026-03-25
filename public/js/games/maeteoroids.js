/* Maeteoroids — Theme-aware Asteroids with Kenney CC0 space sprites */
window.Maeteoroids = (() => {

    // ── Sprite Atlas ──
    const SPRITE_BASE = '/img/game-assets/kenney-space';
    const _sprites = {};
    let _spritesLoaded = 0, _spritesTotal = 0, _allSpritesReady = false;
    let _spriteExplosions = [];

    const _SPRITE_MANIFEST = {
        playerBlue:   `${SPRITE_BASE}/ships/playerShip3_blue.png`,
        playerGreen:  `${SPRITE_BASE}/ships/playerShip3_green.png`,
        playerOrange: `${SPRITE_BASE}/ships/playerShip3_orange.png`,
        playerRed:    `${SPRITE_BASE}/ships/playerShip3_red.png`,
        // Meteors
        meteorBig1:   `${SPRITE_BASE}/meteors/meteorBrown_big1.png`,
        meteorBig2:   `${SPRITE_BASE}/meteors/meteorBrown_big2.png`,
        meteorBig3:   `${SPRITE_BASE}/meteors/meteorBrown_big3.png`,
        meteorMed1:   `${SPRITE_BASE}/meteors/meteorBrown_med1.png`,
        meteorMed2:   `${SPRITE_BASE}/meteors/meteorGrey_med1.png`,
        meteorSmall1: `${SPRITE_BASE}/meteors/meteorBrown_small1.png`,
        meteorSmall2: `${SPRITE_BASE}/meteors/meteorGrey_small1.png`,
        meteorGBig1:  `${SPRITE_BASE}/meteors/meteorGrey_big1.png`,
        meteorGBig2:  `${SPRITE_BASE}/meteors/meteorGrey_big2.png`,
        // Lasers
        laserBlue:    `${SPRITE_BASE}/lasers/laserBlue01.png`,
        laserGreen:   `${SPRITE_BASE}/lasers/laserGreen01.png`,
    };

    const _EXPLOSION_FRAME_IDS = [];
    const _EXPLOSION_FRAME_COUNT = 8;
    for (let i = 0; i < 20; i += Math.floor(20 / _EXPLOSION_FRAME_COUNT)) {
        const id = `fire${String(i).padStart(2, '0')}`;
        _SPRITE_MANIFEST[id] = `${SPRITE_BASE}/effects/fire${String(i).padStart(2, '0')}.png`;
        _EXPLOSION_FRAME_IDS.push(id);
        if (_EXPLOSION_FRAME_IDS.length >= _EXPLOSION_FRAME_COUNT) break;
    }

    function _loadSprites(onDone) {
        const keys = Object.keys(_SPRITE_MANIFEST);
        _spritesTotal = keys.length;
        _spritesLoaded = 0;
        let done = 0;
        keys.forEach(key => {
            const img = new Image();
            img.onload = () => { _sprites[key] = img; done++; _spritesLoaded = done; if (done === _spritesTotal) { _allSpritesReady = true; if (onDone) onDone(); } };
            img.onerror = () => { _sprites[key] = null; done++; _spritesLoaded = done; if (done === _spritesTotal) { _allSpritesReady = true; if (onDone) onDone(); } };
            img.src = _SPRITE_MANIFEST[key];
        });
    }

    function _meteorSpriteKey(size) {
        if (size === 'large') return ['meteorBig1', 'meteorBig2', 'meteorBig3', 'meteorGBig1', 'meteorGBig2'][Math.floor(Math.random() * 5)];
        if (size === 'medium') return ['meteorMed1', 'meteorMed2'][Math.floor(Math.random() * 2)];
        return ['meteorSmall1', 'meteorSmall2'][Math.floor(Math.random() * 2)];
    }

    function _playerSpriteKey(color) {
        const c = (color || '').toLowerCase();
        if (c.includes('22c5') || c.includes('34d3') || c.includes('10b9')) return 'playerGreen';
        if (c.includes('f43f') || c.includes('ef44') || c.includes('e11d')) return 'playerRed';
        if (c.includes('f59e') || c.includes('f97') || c.includes('fbb')) return 'playerOrange';
        return 'playerBlue';
    }

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

    // ── Visual upgrade state ──
    let screenShakeX = 0, screenShakeY = 0, screenShakeTimer = 0;
    let scorePopups = [];
    let vignetteGrad = null;

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

    // ── Multi-layer Parallax Starfield ──
    function createStars() {
        stars = [];
        // Layer 0: distant small dim stars
        for (let i = 0; i < STAR_COUNT; i++) {
            stars.push({
                x: rand(0, W), y: rand(0, H),
                size: rand(0.3, 1.2) * SCALE,
                brightness: rand(0.15, 0.45),
                drift: rand(-0.02, 0.02),
                layer: 0
            });
        }
        // Layer 1: mid-distance stars
        for (let i = 0; i < Math.round(STAR_COUNT * 0.4); i++) {
            stars.push({
                x: rand(0, W), y: rand(0, H),
                size: rand(1, 2) * SCALE,
                brightness: rand(0.4, 0.75),
                drift: rand(-0.06, 0.06),
                layer: 1
            });
        }
        // Layer 2: close bright stars with twinkle
        for (let i = 0; i < Math.round(STAR_COUNT * 0.15); i++) {
            stars.push({
                x: rand(0, W), y: rand(0, H),
                size: rand(1.5, 3) * SCALE,
                brightness: rand(0.6, 1),
                drift: rand(-0.1, 0.1),
                layer: 2,
                twinkleSpeed: rand(0.002, 0.008),
                twinklePhase: rand(0, Math.PI * 2)
            });
        }
    }

    function updateStars(dt) {
        for (const s of stars) {
            const speedMult = s.layer === 0 ? 0.3 : s.layer === 1 ? 0.7 : 1;
            s.x += s.drift * dt * speedMult;
            s.y += 0.02 * dt * speedMult;
            if (s.twinklePhase !== undefined) {
                s.twinklePhase += s.twinkleSpeed * dt;
                s.brightness = 0.5 + Math.sin(s.twinklePhase) * 0.5;
            } else {
                s.brightness += rand(-0.005, 0.005);
                s.brightness = Math.max(0.1, Math.min(1, s.brightness));
            }
            if (s.x > W) s.x = 0;
            if (s.x < 0) s.x = W;
            if (s.y > H) s.y = 0;
        }
    }

    function drawStars() {
        for (const s of stars) {
            const alpha = s.brightness * (s.layer === 0 ? 0.4 : s.layer === 1 ? 0.6 : 0.85);
            if (s.layer === 2 && s.size > 2 * SCALE) {
                // Close stars get a subtle cross-shaped twinkle
                const cr = s.size * 1.5;
                ctx.strokeStyle = `rgba(200,210,255,${alpha * 0.3})`;
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(s.x - cr, s.y); ctx.lineTo(s.x + cr, s.y);
                ctx.moveTo(s.x, s.y - cr); ctx.lineTo(s.x, s.y + cr);
                ctx.stroke();
            }
            ctx.fillStyle = `rgba(200,210,255,${alpha})`;
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
            thrustParticles: [],
            flameTime: 0 // for animated flame
        };
    }

    function updateShip(dt) {
        if (!ship.alive) return;
        const rotating = (keys.ArrowLeft || keys.left || touchLeft) ? -1
            : (keys.ArrowRight || keys.right || touchRight) ? 1 : 0;
        ship.rot += rotating * ROTATION_SPEED * dt * 0.016;
        ship.thrusting = !!(keys.ArrowUp || keys.up || touchThrust);
        if (ship.thrusting) {
            ship.flameTime += dt * 0.01;
            ship.vx += Math.cos(ship.rot) * THRUST_POWER * dt * 0.016;
            ship.vy += Math.sin(ship.rot) * THRUST_POWER * dt * 0.016;
            // More plentiful thrust particles
            for (let tp = 0; tp < 2; tp++) {
                if (Math.random() < 0.7) {
                    const angle = ship.rot + Math.PI + rand(-0.4, 0.4);
                    const colors = ['#FDE68A', '#F59E0B', '#EF4444', '#FF6B35'];
                    ship.thrustParticles.push({
                        x: ship.x - Math.cos(ship.rot) * SHIP_SIZE * 0.6 + rand(-2, 2) * SCALE,
                        y: ship.y - Math.sin(ship.rot) * SHIP_SIZE * 0.6 + rand(-2, 2) * SCALE,
                        vx: Math.cos(angle) * rand(1, 4) * SCALE + ship.vx * 0.3,
                        vy: Math.sin(angle) * rand(1, 4) * SCALE + ship.vy * 0.3,
                        life: 1, decay: rand(0.025, 0.055),
                        color: colors[Math.floor(rand(0, colors.length))]
                    });
                }
            }
            playThrust();
        } else {
            ship.flameTime = 0;
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

        // ── Ghost ship at edges (screen wrap visual feedback) ──
        const edgeMargin = S * 2.5;
        const ghostPositions = [];
        if (ship.x < edgeMargin) ghostPositions.push({ x: ship.x + W, y: ship.y });
        if (ship.x > W - edgeMargin) ghostPositions.push({ x: ship.x - W, y: ship.y });
        if (ship.y < edgeMargin) ghostPositions.push({ x: ship.x, y: ship.y + H });
        if (ship.y > H - edgeMargin) ghostPositions.push({ x: ship.x, y: ship.y - H });
        for (const gp of ghostPositions) {
            drawShipBody(gp.x, gp.y, S, 0.25);
        }

        // ── Main ship ──
        drawShipBody(ship.x, ship.y, S, 1);

        // Thrust trail particles with color variation and fading trails
        for (const p of ship.thrustParticles) {
            const alpha = p.life * 0.85;
            const rgb = hexToRgb(p.color);
            ctx.shadowColor = p.color;
            ctx.shadowBlur = Math.round(6 * SCALE * p.life);
            ctx.fillStyle = `rgba(${rgb},${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.life * 3.5 * SCALE, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }

    function drawShipBody(x, y, S, opacity) {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.translate(x, y);
        ctx.rotate(ship.rot);

        // ── Sprite-based ship rendering ──
        const shipSprite = _sprites[_playerSpriteKey(SHIP_COLOR)];
        if (shipSprite && _allSpritesReady) {
            // Rotate -90deg because sprite faces up but ship.rot has 0=right
            ctx.rotate(-Math.PI / 2);
            ctx.drawImage(shipSprite, -S * 0.8, -S * 0.7, S * 1.6, S * 1.4);
            ctx.rotate(Math.PI / 2); // restore rotation for flame

            // Engine glow when thrusting — still canvas for animation
            if (ship.thrusting) {
                ctx.shadowColor = '#F59E0B';
                ctx.shadowBlur = Math.round(22 * SCALE);
                const t = ship.flameTime;
                const flicker1 = 0.7 + Math.sin(t * 15) * 0.15 + Math.sin(t * 23) * 0.15;
                const outerGrad = ctx.createRadialGradient(-S * 0.8, 0, 0, -S * 0.8, 0, S * flicker1 * 0.8);
                outerGrad.addColorStop(0, 'rgba(239,68,68,0.8)');
                outerGrad.addColorStop(0.6, 'rgba(245,158,11,0.4)');
                outerGrad.addColorStop(1, 'rgba(239,68,68,0)');
                ctx.fillStyle = outerGrad;
                ctx.beginPath();
                ctx.moveTo(-S * 0.6, -S * 0.35);
                ctx.quadraticCurveTo(-S * (1.1 + flicker1 * 0.5), 0, -S * 0.6, S * 0.35);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
            return;
        }

        // ── Canvas fallback ──
        // Engine glow halo (behind ship)
        if (ship.thrusting && opacity > 0.5) {
            const haloGrad = ctx.createRadialGradient(-S * 0.5, 0, 0, -S * 0.5, 0, S * 1.5);
            haloGrad.addColorStop(0, 'rgba(245,158,11,0.15)');
            haloGrad.addColorStop(1, 'rgba(245,158,11,0)');
            ctx.fillStyle = haloGrad;
            ctx.beginPath();
            ctx.arc(-S * 0.5, 0, S * 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Ship body gradient
        ctx.shadowColor = SHIP_COLOR;
        ctx.shadowBlur = GLOW_AMOUNT;
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

        // Hull panel lines for detail
        ctx.strokeStyle = 'rgba(103,232,249,0.3)';
        ctx.lineWidth = Math.max(0.5, SCALE);
        ctx.beginPath();
        ctx.moveTo(S * 0.3, -S * 0.08);
        ctx.lineTo(-S * 0.2, -S * 0.25);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(S * 0.3, S * 0.08);
        ctx.lineTo(-S * 0.2, S * 0.25);
        ctx.stroke();

        // Cockpit canopy
        const cockpitGrad = ctx.createRadialGradient(S * 0.2, -S * 0.03, 0, S * 0.2, 0, S * 0.22);
        cockpitGrad.addColorStop(0, 'rgba(255,255,255,0.6)');
        cockpitGrad.addColorStop(0.4, 'rgba(103,232,249,0.35)');
        cockpitGrad.addColorStop(1, 'rgba(6,182,212,0.1)');
        ctx.fillStyle = cockpitGrad;
        ctx.beginPath();
        ctx.ellipse(S * 0.2, 0, S * 0.18, S * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Cockpit highlight dot
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(S * 0.28, -S * 0.04, S * 0.04, 0, Math.PI * 2);
        ctx.fill();

        // Glossy highlight on upper hull
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
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

        // Wing tip lights
        ctx.shadowBlur = Math.round(6 * SCALE);
        ctx.shadowColor = '#FF4D6A';
        ctx.fillStyle = '#FF4D6A';
        ctx.beginPath();
        ctx.arc(-S * 0.68, -S * 0.52, Math.max(1, S * 0.05), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = '#34D399';
        ctx.fillStyle = '#34D399';
        ctx.beginPath();
        ctx.arc(-S * 0.68, S * 0.52, Math.max(1, S * 0.05), 0, Math.PI * 2);
        ctx.fill();

        // Engine glow when thrusting — multi-layer animated flame
        if (ship.thrusting) {
            ctx.shadowColor = '#F59E0B';
            ctx.shadowBlur = Math.round(22 * SCALE);
            const t = ship.flameTime;
            const flicker1 = 0.7 + Math.sin(t * 15) * 0.15 + Math.sin(t * 23) * 0.15;
            const flicker2 = 0.5 + Math.sin(t * 19 + 1) * 0.2 + Math.sin(t * 31) * 0.1;

            // Outer flame (red/orange)
            const outerGrad = ctx.createRadialGradient(-S * 0.8, 0, 0, -S * 0.8, 0, S * flicker1 * 0.8);
            outerGrad.addColorStop(0, 'rgba(239,68,68,0.8)');
            outerGrad.addColorStop(0.6, 'rgba(245,158,11,0.4)');
            outerGrad.addColorStop(1, 'rgba(239,68,68,0)');
            ctx.fillStyle = outerGrad;
            ctx.beginPath();
            ctx.moveTo(-S * 0.6, -S * 0.35);
            ctx.quadraticCurveTo(-S * (1.1 + flicker1 * 0.5), 0, -S * 0.6, S * 0.35);
            ctx.closePath();
            ctx.fill();

            // Inner flame (white/yellow)
            const innerGrad = ctx.createRadialGradient(-S * 0.75, 0, 0, -S * 0.75, 0, S * flicker2 * 0.5);
            innerGrad.addColorStop(0, 'rgba(253,230,138,0.95)');
            innerGrad.addColorStop(0.5, 'rgba(245,158,11,0.6)');
            innerGrad.addColorStop(1, 'rgba(245,158,11,0)');
            ctx.fillStyle = innerGrad;
            ctx.beginPath();
            ctx.moveTo(-S * 0.62, -S * 0.2);
            ctx.quadraticCurveTo(-S * (0.9 + flicker2 * 0.35), 0, -S * 0.62, S * 0.2);
            ctx.closePath();
            ctx.fill();

            // Core (white hot)
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.ellipse(-S * 0.55, 0, S * 0.08, S * 0.12, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
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
            if (b.trail.length > 8) b.trail.shift();
            b.x += b.vx * dt * 0.06;
            b.y += b.vy * dt * 0.06;
            b.life -= dt * 0.06;
            wrap(b);
            if (b.life <= 0) bullets.splice(i, 1);
        }
    }

    function drawBullets() {
        for (const b of bullets) {
            // ── Sprite-based bullet ──
            const bSprite = _sprites['laserBlue'];
            if (bSprite && _allSpritesReady) {
                ctx.save();
                ctx.translate(b.x, b.y);
                const bAngle = Math.atan2(b.vy, b.vx);
                ctx.rotate(bAngle + Math.PI / 2); // laser sprite is vertical
                ctx.drawImage(bSprite, -3 * SCALE, -8 * SCALE, 6 * SCALE, 16 * SCALE);
                ctx.restore();
                // Trail glow (simplified)
                for (let i = 0; i < b.trail.length; i++) {
                    const t = i / b.trail.length;
                    ctx.fillStyle = `rgba(245,158,11,${t * 0.3})`;
                    ctx.beginPath();
                    ctx.arc(b.trail[i].x, b.trail[i].y, (0.5 + t * 1.5) * SCALE, 0, Math.PI * 2);
                    ctx.fill();
                }
                continue;
            }

            // ── Canvas fallback ──
            // Elongated glow trail
            ctx.shadowColor = BULLET_COLOR;
            ctx.shadowBlur = Math.round(10 * SCALE);
            for (let i = 0; i < b.trail.length; i++) {
                const t = i / b.trail.length;
                const alpha = t * 0.5;
                const size = (0.5 + t * 1.5) * SCALE;
                ctx.fillStyle = `rgba(245,158,11,${alpha})`;
                ctx.beginPath();
                ctx.arc(b.trail[i].x, b.trail[i].y, size, 0, Math.PI * 2);
                ctx.fill();
            }
            // Bullet glow halo
            ctx.shadowBlur = Math.round(16 * SCALE);
            const haloGrad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 8 * SCALE);
            haloGrad.addColorStop(0, 'rgba(253,230,138,0.3)');
            haloGrad.addColorStop(1, 'rgba(245,158,11,0)');
            ctx.fillStyle = haloGrad;
            ctx.beginPath();
            ctx.arc(b.x, b.y, 8 * SCALE, 0, Math.PI * 2);
            ctx.fill();
            // Bullet core
            const bGrad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 4 * SCALE);
            bGrad.addColorStop(0, '#FFFFFF');
            bGrad.addColorStop(0.3, '#FDE68A');
            bGrad.addColorStop(0.7, BULLET_COLOR);
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
        const verts = Math.floor(rand(9, 16));
        for (let i = 0; i < verts; i++) {
            const angle = (i / verts) * Math.PI * 2;
            const r = radius * rand(0.65, 1.3);
            pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
        }
        return pts;
    }

    // Generate surface detail: craters and cracks
    function makeAsteroidDetail(radius, size) {
        const detail = { craters: [], cracks: [] };
        // Craters
        const craterCount = size === 'large' ? Math.floor(rand(3, 6)) : size === 'medium' ? Math.floor(rand(2, 4)) : Math.floor(rand(1, 2));
        for (let i = 0; i < craterCount; i++) {
            const ang = rand(0, Math.PI * 2);
            const dist = rand(0.15, 0.65) * radius;
            detail.craters.push({
                x: Math.cos(ang) * dist,
                y: Math.sin(ang) * dist,
                r: rand(0.08, 0.2) * radius,
                depth: rand(0.15, 0.4)
            });
        }
        // Cracks (only on larger asteroids)
        if (size !== 'small') {
            const crackCount = Math.floor(rand(2, 5));
            for (let i = 0; i < crackCount; i++) {
                const startAng = rand(0, Math.PI * 2);
                const startDist = rand(0.2, 0.6) * radius;
                const len = rand(0.2, 0.5) * radius;
                const endAng = startAng + rand(-0.6, 0.6);
                detail.cracks.push({
                    x1: Math.cos(startAng) * startDist,
                    y1: Math.sin(startAng) * startDist,
                    x2: Math.cos(endAng) * (startDist + len),
                    y2: Math.sin(endAng) * (startDist + len)
                });
            }
        }
        return detail;
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
            shape: makeAsteroidShape(radius),
            detail: makeAsteroidDetail(radius, size),
            spriteKey: _meteorSpriteKey(size)
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

            // ── Sprite-based asteroid rendering ──
            const mSprite = a.spriteKey ? _sprites[a.spriteKey] : null;
            if (mSprite && _allSpritesReady) {
                ctx.drawImage(mSprite, -rad, -rad, rad * 2, rad * 2);
                ctx.restore();
                continue;
            }

            // ── Canvas fallback ──
            const rgb = hexToRgb(a.color);

            // Outer glow
            ctx.shadowColor = a.color;
            ctx.shadowBlur = GLOW_AMOUNT;

            // Rocky body using irregular polygon shape
            const darkColor = `rgba(${rgb},0.7)`;
            const bodyGrad = ctx.createRadialGradient(-rad * 0.3, -rad * 0.3, rad * 0.05, 0, 0, rad);
            bodyGrad.addColorStop(0, `rgba(${rgb},1)`);
            bodyGrad.addColorStop(0.5, a.color);
            bodyGrad.addColorStop(1, darkColor);
            ctx.fillStyle = bodyGrad;
            ctx.beginPath();
            ctx.moveTo(a.shape[0].x, a.shape[0].y);
            for (let i = 1; i < a.shape.length; i++) {
                ctx.lineTo(a.shape[i].x, a.shape[i].y);
            }
            ctx.closePath();
            ctx.fill();

            ctx.shadowBlur = 0;

            // Rocky edge outline
            ctx.strokeStyle = `rgba(${rgb},0.5)`;
            ctx.lineWidth = Math.max(1, 1.5 * SCALE);
            ctx.beginPath();
            ctx.moveTo(a.shape[0].x, a.shape[0].y);
            for (let i = 1; i < a.shape.length; i++) {
                ctx.lineTo(a.shape[i].x, a.shape[i].y);
            }
            ctx.closePath();
            ctx.stroke();

            // Craters
            for (const c of a.detail.craters) {
                const craterGrad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
                craterGrad.addColorStop(0, `rgba(0,0,0,${c.depth})`);
                craterGrad.addColorStop(0.7, `rgba(0,0,0,${c.depth * 0.3})`);
                craterGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = craterGrad;
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                ctx.fill();
                // Crater rim highlight
                ctx.strokeStyle = `rgba(255,255,255,${c.depth * 0.3})`;
                ctx.lineWidth = Math.max(0.5, 0.7 * SCALE);
                ctx.beginPath();
                ctx.arc(c.x - c.r * 0.15, c.y - c.r * 0.15, c.r * 0.85, -Math.PI * 0.6, Math.PI * 0.3);
                ctx.stroke();
            }

            // Surface cracks
            for (const cr of a.detail.cracks) {
                ctx.strokeStyle = `rgba(0,0,0,0.3)`;
                ctx.lineWidth = Math.max(0.5, 0.8 * SCALE);
                ctx.beginPath();
                ctx.moveTo(cr.x1, cr.y1);
                ctx.lineTo(cr.x2, cr.y2);
                ctx.stroke();
            }

            // Specular highlight on top-left
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.ellipse(-rad * 0.25, -rad * 0.3, rad * 0.4, rad * 0.2, -0.5, 0, Math.PI * 2);
            ctx.fill();

            // Bright shine dot
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.arc(-rad * 0.3, -rad * 0.35, Math.max(1, rad * 0.07), 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
        ctx.shadowBlur = 0;
    }

    // ── Particles ──
    function spawnExplosion(x, y, color, count) {
        // Sprite explosion
        if (_allSpritesReady && _EXPLOSION_FRAME_IDS.length > 0) {
            const eSize = (count || PARTICLE_COUNT) > 15 ? 80 * SCALE : 50 * SCALE;
            _spriteExplosions.push({ x, y, frame: 0, timer: 0, size: eSize, totalFrames: _EXPLOSION_FRAME_IDS.length, frameDur: 60 });
        }
        const rgb = hexToRgb(color);
        const cnt = count || PARTICLE_COUNT;
        for (let i = 0; i < cnt; i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(1, 6) * SCALE;
            // Mix of colors: base color, white sparks, and darker debris
            const type = Math.random();
            let pColor;
            if (type < 0.3) pColor = '#FFFFFF';
            else if (type < 0.6) pColor = color;
            else {
                const r = Math.max(0, parseInt(color.slice(1, 3), 16) - 60);
                const g = Math.max(0, parseInt(color.slice(3, 5), 16) - 60);
                const b = Math.max(0, parseInt(color.slice(5, 7), 16) - 60);
                pColor = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
            }
            particles.push({
                x: x + rand(-4, 4) * SCALE, y: y + rand(-4, 4) * SCALE,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1, decay: rand(0.012, 0.035),
                color: pColor, size: rand(1, 4.5) * SCALE,
                trail: []
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
                rot: rand(0, Math.PI * 2), rotSpeed: rand(-0.1, 0.1), len: rand(6, 14) * SCALE,
                trail: []
            });
        }
        spawnExplosion(x, y, SHIP_COLOR, Math.round(25 * SCALE));
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            // Store trail positions for fading trails
            if (p.trail && p.life > 0.3) {
                p.trail.push({ x: p.x, y: p.y });
                if (p.trail.length > 5) p.trail.shift();
            }
            p.x += p.vx * dt * 0.06;
            p.y += p.vy * dt * 0.06;
            if (p.rot !== undefined) p.rot += p.rotSpeed * dt * 0.06;
            p.life -= p.decay * dt * 0.06;
            // Slight gravity on particles
            p.vy += 0.01 * dt * 0.06;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = Math.max(0, p.life);
            ctx.shadowColor = p.color;
            ctx.shadowBlur = Math.round(6 * SCALE * alpha);
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
                // Draw fading trail behind particle
                if (p.trail && p.trail.length > 1) {
                    for (let ti = 0; ti < p.trail.length; ti++) {
                        const ta = (ti / p.trail.length) * alpha * 0.3;
                        ctx.fillStyle = `rgba(${hexToRgb(p.color)},${ta})`;
                        ctx.beginPath();
                        ctx.arc(p.trail[ti].x, p.trail[ti].y, p.size * alpha * 0.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.fillStyle = `rgba(${hexToRgb(p.color)},${alpha})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.shadowBlur = 0;
    }

    function hexToRgb(hex) {
        if (!hex || hex.charAt(0) !== '#') return '200,200,200';
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r},${g},${b}`;
    }

    // ── Score Popups ──
    function spawnScorePopup(x, y, points, color) {
        scorePopups.push({
            x: x, y: y,
            text: '+' + points,
            color: color,
            life: 1,
            vy: -1.5 * SCALE
        });
    }

    function updateScorePopups(dt) {
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const p = scorePopups[i];
            p.y += p.vy * dt * 0.06;
            p.life -= 0.015 * dt * 0.06;
            if (p.life <= 0) scorePopups.splice(i, 1);
        }
    }

    function drawScorePopups() {
        const fontSize = Math.max(12, Math.round(16 * SCALE));
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = 'center';
        for (const p of scorePopups) {
            const alpha = Math.max(0, p.life);
            ctx.fillStyle = `rgba(${hexToRgb(p.color)},${alpha})`;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = Math.round(6 * SCALE);
            ctx.fillText(p.text, p.x, p.y);
        }
        ctx.shadowBlur = 0;
    }

    // ── Screen Shake ──
    function triggerScreenShake(intensity) {
        screenShakeTimer = Math.max(screenShakeTimer, 8);
        screenShakeX = rand(-intensity, intensity) * SCALE;
        screenShakeY = rand(-intensity, intensity) * SCALE;
    }

    function updateScreenShake(dt) {
        if (screenShakeTimer > 0) {
            screenShakeTimer -= dt * 0.06;
            const intensity = screenShakeTimer * 0.5;
            screenShakeX = rand(-intensity, intensity) * SCALE;
            screenShakeY = rand(-intensity, intensity) * SCALE;
            if (screenShakeTimer <= 0) {
                screenShakeX = 0;
                screenShakeY = 0;
                screenShakeTimer = 0;
            }
        }
    }

    // ── Vignette ──
    function createVignette() {
        vignetteGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
        vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
    }

    function drawVignette() {
        if (!vignetteGrad) return;
        ctx.fillStyle = vignetteGrad;
        ctx.fillRect(0, 0, W, H);
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
                    spawnExplosion(a.x, a.y, a.color, a.size === 'large' ? 22 : a.size === 'medium' ? 14 : 8);
                    spawnScorePopup(a.x, a.y - a.radius, ASTEROID_SCORES[a.size], a.color);
                    triggerScreenShake(a.size === 'large' ? 5 : a.size === 'medium' ? 3 : 1.5);
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
        triggerScreenShake(8);
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
        ship.flameTime = 0;
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

        // Lives as filled mini ship icons
        const lifeSize = Math.max(6, Math.round(9 * SCALE));
        const lifeSpacing = Math.max(18, Math.round(24 * SCALE));
        for (let i = 0; i < lives; i++) {
            const lx = Math.round(30 * SCALE) + i * lifeSpacing;
            const ly = Math.round(36 * SCALE);
            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(-Math.PI / 2);
            // Filled mini ship
            const miniGrad = ctx.createLinearGradient(-lifeSize, 0, lifeSize, 0);
            miniGrad.addColorStop(0, '#0E7490');
            miniGrad.addColorStop(1, '#67E8F9');
            ctx.fillStyle = miniGrad;
            ctx.shadowColor = SHIP_COLOR;
            ctx.shadowBlur = Math.round(4 * SCALE);
            ctx.beginPath();
            ctx.moveTo(lifeSize, 0);
            ctx.lineTo(-lifeSize * 0.6, -lifeSize * 0.55);
            ctx.lineTo(-lifeSize * 0.35, 0);
            ctx.lineTo(-lifeSize * 0.6, lifeSize * 0.55);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#67E8F9';
            ctx.lineWidth = Math.max(0.7, 1 * SCALE);
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
            // Update sprite explosions
            for (let i = _spriteExplosions.length - 1; i >= 0; i--) {
                const se = _spriteExplosions[i];
                se.timer += dt;
                if (se.timer >= se.frameDur) { se.timer -= se.frameDur; se.frame++; if (se.frame >= se.totalFrames) _spriteExplosions.splice(i, 1); }
            }
            updateScorePopups(dt);
            updateScreenShake(dt);
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
        ctx.save();
        // Apply screen shake
        if (screenShakeTimer > 0) {
            ctx.translate(screenShakeX, screenShakeY);
        }

        // Dark gradient background (themed)
        const bgGradObj = ctx.createLinearGradient(0, 0, W * 0.3, H);
        bgGradObj.addColorStop(0, bgGrad[0]);
        bgGradObj.addColorStop(0.5, bgGrad[1]);
        bgGradObj.addColorStop(1, bgGrad[2]);
        ctx.fillStyle = bgGradObj;
        ctx.fillRect(-10, -10, W + 20, H + 20);

        if (screenFlash > 0) {
            ctx.fillStyle = `rgba(255,255,255,${Math.min(0.08, screenFlash * 0.03)})`;
            ctx.fillRect(0, 0, W, H);
        }

        drawStars();
        drawAsteroids();
        drawBullets();
        drawParticles();
        // Sprite explosions
        for (const se of _spriteExplosions) {
            const fid = _EXPLOSION_FRAME_IDS[se.frame];
            const fSprite = fid ? _sprites[fid] : null;
            if (fSprite) {
                const half = se.size / 2;
                ctx.drawImage(fSprite, se.x - half, se.y - half, se.size, se.size);
            }
        }
        drawShip();
        drawScorePopups();
        drawHUD();
        drawLevelText();

        if (!ship.alive && respawnTimer < 0) drawGameOver();

        ctx.restore();

        // Vignette overlay (drawn after restore so it's not affected by shake)
        drawVignette();

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
        const container = canvas.parentElement;
        if (container) {
            canvas.width = Math.max(480, container.clientWidth || 480);
            canvas.height = Math.max(480, container.clientHeight || 480);
        }
        W = canvas.width || 480;
        H = canvas.height || 480;
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

        // Delayed refit for container layout settling
        requestAnimationFrame(() => {
            if (!canvas || !canvas.parentElement) return;
            const p = canvas.parentElement;
            const pw = Math.max(480, p.clientWidth || 480);
            const ph = Math.max(480, p.clientHeight || 480);
            if (pw !== canvas.width || ph !== canvas.height) {
                canvas.width = pw; canvas.height = ph;
                W = canvas.width; H = canvas.height;
                computeScale();
                createVignette();
            }
        });

        // Compute all scale-dependent values
        computeScale();

        // Reset state
        score = 0; level = 1; lives = 3;
        bullets = []; asteroids = []; particles = [];
        scorePopups = [];
        screenShakeX = 0; screenShakeY = 0; screenShakeTimer = 0;
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
        createVignette();
        spawnWave();
        _spriteExplosions = [];

        // Load sprites (non-blocking — fallback to canvas if they fail)
        _loadSprites(null);

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        window.addEventListener('resize', onResize);

        lastTime = performance.now();
        animFrame = requestAnimationFrame(gameLoop);
    }

    function onResize() {
        if (!canvas || !canvas.parentElement) return;
        const c = canvas.parentElement;
        const pw = Math.max(480, c.clientWidth || 480);
        const ph = Math.max(480, c.clientHeight || 480);
        if (pw !== canvas.width || ph !== canvas.height) {
            canvas.width = pw; canvas.height = ph;
            W = canvas.width; H = canvas.height;
            computeScale();
            createVignette();
        }
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
        window.removeEventListener('resize', onResize);
        if (canvas) {
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        keys = {};
        bullets = []; asteroids = []; particles = []; stars = [];
        scorePopups = [];
        vignetteGrad = null;
        _spriteExplosions = [];
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return level; },
        isActive() { return gameActive; }
    };
})();
