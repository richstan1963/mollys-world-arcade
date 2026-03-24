/* Cannon Blast — Carnival shooting gallery for Your World Arcade */
window.CannonBlast = (() => {
    // ── Design Constants ──
    const GAME_W = 640, GAME_H = 480;
    const CANNON_Y = GAME_H - 50;
    const CANNON_BASE_W = 60, CANNON_BASE_H = 36;
    const BARREL_LEN = 38, BARREL_W = 12;
    const GRAVITY = 0.12;
    const BALL_R = 5;
    const BALL_SPEED = 7.5;
    const RELOAD_MS = 500;
    const CHARGE_MAX_MS = 1200;
    const INITIAL_LIVES = 3;
    const SHIELD_MAX = 3;
    const STUN_MS = 1000;
    const WAVE_COUNT = 10;

    // States
    const ST_TITLE = 0, ST_PLAY = 1, ST_DEAD = 2, ST_OVER = 3, ST_WAVE_CLEAR = 4, ST_WAVE_INTRO = 5;

    // Target types
    const T_DUCK = 0, T_BALLOON = 1, T_CAN = 2, T_PLATE = 3, T_BULLSEYE = 4, T_GOLDEN = 5, T_BOMB = 6, T_BOSS = 7;

    // Power-up types
    const PW_RAPID = 0, PW_MULTI = 1, PW_EXPLOSIVE = 2, PW_SHIELD = 3, PW_SLOW = 4;

    // ── Mutable State ──
    let canvas, ctx, audioCtx;
    let W, H, SCALE, DPR;
    let animFrame, lastTime, state;
    let score, lives, wave, shields, gameActive, frameCount;
    let cannonAngle, reloadTimer, chargeTimer, charging, stunTimer;
    let cannonBalls, enemyProjectiles, targets, particles, scorePopups, powerups;
    let waveTimer, waveClearTimer, introTimer;
    let targetSpawnTimer, enemyFireTimer;
    let combo, comboTimer, comboColor;
    let rapidFireEnd, multiShotEnd, explosiveEnd, slowEnd;
    let keys = {}, mouseX = GAME_W / 2, mouseY = GAME_H / 2;
    let touchActive = false;
    let gameOverCB, activePlayer, playerColor;
    let highScore = parseInt(localStorage.getItem('ywa_cannonblast_hi') || '0');
    let screenShake;
    let bgGradient;
    let buntingPhase;
    let bossHP, bossMaxHP;
    // backdrop decorations
    let bulbs, tents;

    // ═══════════════════════════════════════════
    //  SOUND
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
    function playNoise(dur, vol) {
        try {
            ensureAudio();
            const n = audioCtx.sampleRate * dur;
            const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
            const src = audioCtx.createBufferSource(), g = audioCtx.createGain();
            src.buffer = buf;
            g.gain.setValueAtTime(vol || 0.06, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            src.connect(g); g.connect(audioCtx.destination);
            src.start();
        } catch {}
    }

    const SND = {
        fire:      () => { playNoise(0.15, 0.12); playTone(100, 0.2, 'sawtooth', 0.1, 40); },
        charge:    () => playTone(200, 0.08, 'sine', 0.04, 400),
        duckHit:   () => { playTone(600, 0.1, 'square', 0.06, 900); playTone(350, 0.06, 'sine', 0.04); },
        popBalloon:() => { playNoise(0.08, 0.1); playTone(1200, 0.06, 'sine', 0.05); },
        canClatter:() => { playNoise(0.15, 0.08); playTone(180, 0.12, 'triangle', 0.06, 90); },
        plateSmash:() => { playNoise(0.2, 0.12); playTone(2000, 0.08, 'sine', 0.04, 4000); },
        bullseye:  () => { playTone(880, 0.08, 'sine', 0.08); setTimeout(() => playTone(1100, 0.1, 'sine', 0.08), 80); },
        golden:    () => { playTone(880, 0.06, 'sine', 0.1); setTimeout(() => playTone(1100, 0.06, 'sine', 0.1), 80); setTimeout(() => playTone(1320, 0.1, 'sine', 0.1), 160); },
        bomb:      () => { playNoise(0.4, 0.15); playTone(60, 0.5, 'sawtooth', 0.12, 20); },
        enemyFire: () => playTone(300, 0.15, 'sawtooth', 0.05, 100),
        shield:    () => playTone(600, 0.15, 'sine', 0.1, 900),
        powerup:   () => { playTone(880, 0.08, 'sine', 0.12); setTimeout(() => playTone(1100, 0.12, 'sine', 0.12), 100); },
        projHit:   () => { playTone(500, 0.06, 'square', 0.06); playNoise(0.06, 0.05); },
        die:       () => { playNoise(0.5, 0.15); playTone(200, 0.5, 'sawtooth', 0.1, 40); },
        waveClear: () => { playTone(523, 0.1, 'square', 0.08); setTimeout(() => playTone(659, 0.1, 'square', 0.08), 120); setTimeout(() => playTone(784, 0.15, 'square', 0.08), 240); },
        bossHit:   () => { playNoise(0.12, 0.1); playTone(120, 0.15, 'sawtooth', 0.08, 60); },
    };

    // ── Helpers ──
    const HAS_TOUCH = ('ontouchstart' in window);
    function gs(v) { return v * SCALE; }
    function gx(v) { return v * SCALE; }
    function gy(v) { return v * SCALE; }
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function hexAlpha(hex, a) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${a})`;
    }

    // ═══════════════════════════════════════════
    //  THEME COLORS
    // ═══════════════════════════════════════════
    let COL_CANNON, COL_ACCENT, COL_HUD, COL_BG1, COL_BG2;
    const COL_DUCK = ['#F59E0B', '#EF4444', '#3B82F6', '#22C55E'];
    const COL_BALLOON = ['#EF4444', '#3B82F6', '#22C55E', '#FBBF24', '#A855F7', '#EC4899'];
    const COL_GOLDEN = '#FFD700';
    const COL_BOMB = '#DC2626';
    const COL_ENEMY_PROJ = '#FF4444';

    function setupColors() {
        const themeId = activePlayer?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        COL_CANNON = activePlayer?.color || '#06B6D4';
        COL_ACCENT = '#FBBF24';
        COL_HUD = '#E0E7FF';
        COL_BG1 = '#1a0a2e';
        COL_BG2 = '#0d1b2a';
        if (_t) {
            COL_CANNON = _t.colors[0] || COL_CANNON;
            COL_ACCENT = _t.colors[1] || COL_ACCENT;
            if (_t.colors[2]) COL_HUD = _t.colors[2];
        }
    }

    // ═══════════════════════════════════════════
    //  BACKDROP
    // ═══════════════════════════════════════════
    function initBackdrop() {
        bulbs = [];
        for (let i = 0; i < 40; i++) {
            bulbs.push({ x: i * (GAME_W / 40) + GAME_W / 80, phase: rng(0, Math.PI * 2), col: pick(COL_BALLOON) });
        }
        tents = [
            { x: 60, w: 120, h: 80, col: '#DC2626' },
            { x: GAME_W - 180, w: 130, h: 90, col: '#2563EB' },
            { x: GAME_W / 2 - 40, w: 80, h: 60, col: '#16A34A' },
        ];
    }

    function drawBackdrop() {
        // Sky gradient
        if (!bgGradient) {
            bgGradient = ctx.createLinearGradient(0, 0, 0, H);
            bgGradient.addColorStop(0, '#0f0c29');
            bgGradient.addColorStop(0.4, '#1a0a2e');
            bgGradient.addColorStop(1, '#2d1b4e');
        }
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, W, H);

        // Stars
        ctx.fillStyle = '#FFF';
        for (let i = 0; i < 60; i++) {
            const sx = (i * 137.5 + 42) % GAME_W;
            const sy = (i * 97.3 + 11) % (GAME_H * 0.35);
            const flicker = 0.3 + 0.7 * Math.sin(frameCount * 0.015 + i * 2.1);
            ctx.globalAlpha = flicker * 0.6;
            ctx.fillRect(gx(sx), gy(sy), gs(1.5), gs(1.5));
        }
        ctx.globalAlpha = 1;

        // Tents
        for (const t of tents) {
            ctx.fillStyle = t.col;
            ctx.beginPath();
            ctx.moveTo(gx(t.x), gy(180));
            ctx.lineTo(gx(t.x + t.w / 2), gy(180 - t.h));
            ctx.lineTo(gx(t.x + t.w), gy(180));
            ctx.fill();
            // stripes
            ctx.strokeStyle = hexAlpha('#FFF', 0.3);
            ctx.lineWidth = gs(2);
            for (let s = 0; s < 4; s++) {
                const sx1 = t.x + t.w * (s + 1) / 5;
                ctx.beginPath();
                ctx.moveTo(gx(sx1), gy(180));
                ctx.lineTo(gx(t.x + t.w / 2), gy(180 - t.h));
                ctx.stroke();
            }
        }

        // Ground / gallery shelf area
        const groundY = GAME_H - 80;
        ctx.fillStyle = '#3b2510';
        ctx.fillRect(0, gy(groundY), W, gy(80));
        ctx.fillStyle = '#5c3a1e';
        ctx.fillRect(0, gy(groundY), W, gs(6));

        // Bunting string across top
        const buntyY = 30;
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = gs(1);
        ctx.beginPath();
        ctx.moveTo(0, gy(buntyY));
        for (let bx = 0; bx < GAME_W; bx += 30) {
            ctx.lineTo(gx(bx + 15), gy(buntyY + 8));
            ctx.lineTo(gx(bx + 30), gy(buntyY));
        }
        ctx.stroke();

        // Bunting flags
        for (let i = 0; i < 20; i++) {
            const fx = i * 32 + 8;
            ctx.fillStyle = i % 2 === 0 ? '#EF4444' : '#FBBF24';
            ctx.beginPath();
            ctx.moveTo(gx(fx), gy(buntyY));
            ctx.lineTo(gx(fx + 12), gy(buntyY));
            ctx.lineTo(gx(fx + 6), gy(buntyY + 16));
            ctx.fill();
        }

        // Light bulbs
        for (const b of bulbs) {
            const glow = 0.5 + 0.5 * Math.sin(frameCount * 0.04 + b.phase);
            ctx.fillStyle = hexAlpha(b.col, glow * 0.8 + 0.2);
            ctx.beginPath();
            ctx.arc(gx(b.x), gy(52), gs(3), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = hexAlpha(b.col, glow * 0.3);
            ctx.beginPath();
            ctx.arc(gx(b.x), gy(52), gs(7), 0, Math.PI * 2);
            ctx.fill();
        }

        // Lane lines (depth guides)
        ctx.strokeStyle = hexAlpha('#FFF', 0.05);
        ctx.lineWidth = gs(1);
        for (const ly of [130, 200, 270, 340]) {
            ctx.beginPath();
            ctx.moveTo(0, gy(ly));
            ctx.lineTo(W, gy(ly));
            ctx.stroke();
        }
    }

    // ═══════════════════════════════════════════
    //  CANNON
    // ═══════════════════════════════════════════
    function updateCannon(dt) {
        // Aim toward mouse
        const dx = mouseX - GAME_W / 2;
        const dy = mouseY - CANNON_Y;
        cannonAngle = Math.atan2(dy, dx);
        cannonAngle = clamp(cannonAngle, -Math.PI + 0.3, -0.3); // restrict to upper half

        if (stunTimer > 0) {
            stunTimer -= dt;
            return;
        }
        if (reloadTimer > 0) reloadTimer -= dt;

        // Charge mechanic
        if (charging && chargeTimer < CHARGE_MAX_MS) {
            chargeTimer += dt;
            if (chargeTimer % 150 < dt) SND.charge();
        }
    }

    function fireCannon() {
        if (stunTimer > 0 || reloadTimer > 0) return;
        const now = performance.now();
        const isRapid = rapidFireEnd > now;
        const isMulti = multiShotEnd > now;
        const isExplosive = explosiveEnd > now;

        const power = clamp(chargeTimer / CHARGE_MAX_MS, 0, 1);
        const ballR = BALL_R + power * 4;
        const speed = BALL_SPEED + power * 2;
        const dmg = 1 + (power > 0.7 ? 1 : 0);

        const angles = isMulti ? [cannonAngle - 0.15, cannonAngle, cannonAngle + 0.15] : [cannonAngle];
        for (const a of angles) {
            cannonBalls.push({
                x: GAME_W / 2 + Math.cos(a) * BARREL_LEN,
                y: CANNON_Y + Math.sin(a) * BARREL_LEN,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                r: ballR,
                dmg,
                explosive: isExplosive,
                trail: [],
            });
        }

        // Muzzle flash
        for (let i = 0; i < 12; i++) {
            const a2 = cannonAngle + rng(-0.4, 0.4);
            const sp = rng(1, 3);
            particles.push({
                x: GAME_W / 2 + Math.cos(cannonAngle) * BARREL_LEN,
                y: CANNON_Y + Math.sin(cannonAngle) * BARREL_LEN,
                vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp,
                life: 15, maxLife: 15,
                r: rng(2, 4), col: pick(['#FBBF24', '#F97316', '#FFF', '#EF4444']),
                type: 'spark',
            });
        }
        // Smoke puff
        for (let i = 0; i < 6; i++) {
            particles.push({
                x: GAME_W / 2 + Math.cos(cannonAngle) * (BARREL_LEN - 5),
                y: CANNON_Y + Math.sin(cannonAngle) * (BARREL_LEN - 5),
                vx: rng(-0.5, 0.5), vy: rng(-1, -0.3),
                life: 30, maxLife: 30,
                r: rng(4, 8), col: '#888',
                type: 'smoke',
            });
        }

        SND.fire();
        reloadTimer = isRapid ? 150 : RELOAD_MS + power * 300;
        chargeTimer = 0;
        charging = false;
    }

    function drawCannon() {
        ctx.save();
        ctx.translate(gx(GAME_W / 2), gy(CANNON_Y));

        // Stun shake
        if (stunTimer > 0) {
            ctx.translate(rng(-3, 3) * SCALE, rng(-2, 2) * SCALE);
        }

        // Shield dome
        if (shieldActive()) {
            ctx.strokeStyle = hexAlpha('#22D3EE', 0.4 + 0.2 * Math.sin(frameCount * 0.1));
            ctx.lineWidth = gs(2);
            ctx.beginPath();
            ctx.arc(0, 0, gs(45), Math.PI, 0);
            ctx.stroke();
            ctx.fillStyle = hexAlpha('#22D3EE', 0.08);
            ctx.beginPath();
            ctx.arc(0, 0, gs(45), Math.PI, 0);
            ctx.fill();
        }

        // Wheels
        ctx.fillStyle = '#5c3a1e';
        ctx.beginPath();
        ctx.arc(gs(-18), gs(12), gs(10), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.arc(gs(18), gs(12), gs(10), 0, Math.PI * 2); ctx.fill();
        // Wheel spokes
        ctx.strokeStyle = '#3b2510';
        ctx.lineWidth = gs(1.5);
        for (const wx of [-18, 18]) {
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
                ctx.beginPath();
                ctx.moveTo(gs(wx), gs(12));
                ctx.lineTo(gs(wx) + Math.cos(a + frameCount * 0.01) * gs(8), gs(12) + Math.sin(a + frameCount * 0.01) * gs(8));
                ctx.stroke();
            }
        }
        // Wheel rims
        ctx.strokeStyle = '#888';
        ctx.lineWidth = gs(2);
        ctx.beginPath(); ctx.arc(gs(-18), gs(12), gs(10), 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(gs(18), gs(12), gs(10), 0, Math.PI * 2); ctx.stroke();

        // Base frame
        ctx.fillStyle = '#6b3e20';
        ctx.fillRect(gs(-25), gs(-5), gs(50), gs(18));
        // Metal bands
        ctx.fillStyle = '#777';
        ctx.fillRect(gs(-27), gs(-2), gs(54), gs(3));
        ctx.fillRect(gs(-27), gs(8), gs(54), gs(3));

        // Barrel (rotates)
        ctx.save();
        ctx.rotate(cannonAngle + Math.PI / 2);
        // Barrel shadow
        ctx.fillStyle = '#444';
        ctx.fillRect(gs(-BARREL_W / 2 - 1), gs(-BARREL_LEN - 2), gs(BARREL_W + 2), gs(BARREL_LEN + 4));
        // Barrel body
        const barrelGrad = ctx.createLinearGradient(gs(-BARREL_W / 2), 0, gs(BARREL_W / 2), 0);
        barrelGrad.addColorStop(0, '#555');
        barrelGrad.addColorStop(0.3, '#999');
        barrelGrad.addColorStop(0.7, '#999');
        barrelGrad.addColorStop(1, '#555');
        ctx.fillStyle = barrelGrad;
        ctx.fillRect(gs(-BARREL_W / 2), gs(-BARREL_LEN), gs(BARREL_W), gs(BARREL_LEN));
        // Barrel mouth
        ctx.fillStyle = '#333';
        ctx.fillRect(gs(-BARREL_W / 2 - 2), gs(-BARREL_LEN - 3), gs(BARREL_W + 4), gs(6));
        // Metal rings
        ctx.fillStyle = '#aaa';
        ctx.fillRect(gs(-BARREL_W / 2 - 1), gs(-BARREL_LEN + 8), gs(BARREL_W + 2), gs(3));
        ctx.fillRect(gs(-BARREL_W / 2 - 1), gs(-BARREL_LEN + 20), gs(BARREL_W + 2), gs(3));
        ctx.restore();

        // Charge indicator
        if (charging && chargeTimer > 50) {
            const pct = clamp(chargeTimer / CHARGE_MAX_MS, 0, 1);
            ctx.fillStyle = hexAlpha('#FBBF24', 0.3 + pct * 0.5);
            ctx.beginPath();
            ctx.arc(0, gs(-5), gs(15 + pct * 10), 0, Math.PI * 2);
            ctx.fill();
        }

        // Reload bar
        if (reloadTimer > 0) {
            const maxR = (rapidFireEnd > performance.now()) ? 150 : RELOAD_MS;
            const pct = 1 - clamp(reloadTimer / maxR, 0, 1);
            ctx.fillStyle = hexAlpha('#FFF', 0.3);
            ctx.fillRect(gs(-20), gs(20), gs(40), gs(4));
            ctx.fillStyle = COL_ACCENT;
            ctx.fillRect(gs(-20), gs(20), gs(40 * pct), gs(4));
        }

        ctx.restore();
    }

    // ═══════════════════════════════════════════
    //  CANNONBALLS
    // ═══════════════════════════════════════════
    function updateBalls(dt) {
        for (let i = cannonBalls.length - 1; i >= 0; i--) {
            const b = cannonBalls[i];
            b.trail.push({ x: b.x, y: b.y });
            if (b.trail.length > 10) b.trail.shift();
            b.x += b.vx * dt / 16;
            b.y += b.vy * dt / 16;
            b.vy += GRAVITY * dt / 16;

            // Off screen
            if (b.y > GAME_H + 20 || b.x < -20 || b.x > GAME_W + 20 || b.y < -40) {
                cannonBalls.splice(i, 1);
                continue;
            }

            // Check target hits
            let hit = false;
            for (let j = targets.length - 1; j >= 0; j--) {
                const t = targets[j];
                if (t.dying) continue;
                if (circRectHit(b.x, b.y, b.r, t.x - t.w / 2, t.y - t.h / 2, t.w, t.h)) {
                    hitTarget(t, b);
                    hit = true;
                    // Explosive splash
                    if (b.explosive) {
                        for (let k = targets.length - 1; k >= 0; k--) {
                            if (k === j || targets[k].dying) continue;
                            const dx = targets[k].x - b.x, dy = targets[k].y - b.y;
                            if (Math.sqrt(dx * dx + dy * dy) < 50) {
                                hitTarget(targets[k], b);
                            }
                        }
                        // Explosion particles
                        for (let p = 0; p < 20; p++) {
                            const a = rng(0, Math.PI * 2), sp = rng(1, 4);
                            particles.push({
                                x: b.x, y: b.y,
                                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                                life: 25, maxLife: 25, r: rng(2, 5),
                                col: pick(['#FBBF24', '#F97316', '#EF4444']),
                                type: 'spark',
                            });
                        }
                    }
                    cannonBalls.splice(i, 1);
                    break;
                }
            }
            if (hit) continue;

            // Check enemy projectile intercept
            for (let j = enemyProjectiles.length - 1; j >= 0; j--) {
                const ep = enemyProjectiles[j];
                const dx = b.x - ep.x, dy = b.y - ep.y;
                if (Math.sqrt(dx * dx + dy * dy) < b.r + 6) {
                    // Intercepted!
                    addScore(200, ep.x, ep.y);
                    SND.projHit();
                    spawnParticles(ep.x, ep.y, 8, ['#22D3EE', '#FFF', '#A855F7']);
                    enemyProjectiles.splice(j, 1);
                    cannonBalls.splice(i, 1);
                    hit = true;
                    break;
                }
            }
        }
    }

    function drawBalls() {
        for (const b of cannonBalls) {
            // Trail
            for (let i = 0; i < b.trail.length; i++) {
                const a = i / b.trail.length;
                ctx.fillStyle = hexAlpha('#777', a * 0.3);
                ctx.beginPath();
                ctx.arc(gx(b.trail[i].x), gy(b.trail[i].y), gs(b.r * a * 0.5), 0, Math.PI * 2);
                ctx.fill();
            }
            // Ball
            const grad = ctx.createRadialGradient(gx(b.x - 1), gy(b.y - 1), 0, gx(b.x), gy(b.y), gs(b.r));
            grad.addColorStop(0, '#666');
            grad.addColorStop(0.6, '#333');
            grad.addColorStop(1, '#111');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(gx(b.x), gy(b.y), gs(b.r), 0, Math.PI * 2);
            ctx.fill();
            // Highlight
            ctx.fillStyle = hexAlpha('#FFF', 0.4);
            ctx.beginPath();
            ctx.arc(gx(b.x - b.r * 0.3), gy(b.y - b.r * 0.3), gs(b.r * 0.3), 0, Math.PI * 2);
            ctx.fill();
            // Explosive glow
            if (b.explosive) {
                ctx.fillStyle = hexAlpha('#F97316', 0.2 + 0.1 * Math.sin(frameCount * 0.2));
                ctx.beginPath();
                ctx.arc(gx(b.x), gy(b.y), gs(b.r + 5), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // ═══════════════════════════════════════════
    //  TARGETS
    // ═══════════════════════════════════════════
    function spawnWaveTargets(dt) {
        const now = performance.now();
        const isSlow = slowEnd > now;
        const spd = isSlow ? 0.5 : 1;
        targetSpawnTimer -= dt * spd;
        if (targetSpawnTimer > 0) return;

        const spawnRate = Math.max(300, 1200 - wave * 80);
        targetSpawnTimer = spawnRate;

        // Decide what to spawn based on wave
        const pool = [];
        pool.push(T_DUCK, T_DUCK);
        pool.push(T_BALLOON, T_BALLOON);
        if (wave >= 3) pool.push(T_CAN, T_PLATE);
        if (wave >= 5) pool.push(T_BULLSEYE, T_GOLDEN);
        if (wave >= 2) pool.push(T_BOMB);
        if (wave >= 5) pool.push(T_GOLDEN);

        const type = pick(pool);
        spawnTarget(type);
    }

    function spawnTarget(type) {
        const lane = rng(0, 1);
        const depth = lane; // 0=far, 1=close
        const yRange = [80, 340];
        const y = yRange[0] + depth * (yRange[1] - yRange[0]);
        const sizeScale = 0.6 + depth * 0.5;
        const speed = (0.4 + depth * 0.8 + rng(-0.2, 0.2)) * (1 + wave * 0.06);
        const dir = Math.random() < 0.5 ? 1 : -1;
        const x = dir > 0 ? -30 : GAME_W + 30;
        const canShoot = wave >= 3 && Math.random() < 0.15 + wave * 0.03;

        let w, h, hp = 1;
        switch (type) {
            case T_DUCK:
                w = 30 * sizeScale; h = 24 * sizeScale;
                break;
            case T_BALLOON:
                w = 18 * sizeScale; h = 24 * sizeScale;
                break;
            case T_CAN:
                w = 14 * sizeScale; h = 20 * sizeScale;
                break;
            case T_PLATE:
                w = 26 * sizeScale; h = 6 * sizeScale;
                break;
            case T_BULLSEYE:
                w = 28 * sizeScale; h = 28 * sizeScale;
                break;
            case T_GOLDEN:
                w = 22 * sizeScale; h = 22 * sizeScale;
                break;
            case T_BOMB:
                w = 22 * sizeScale; h = 22 * sizeScale;
                break;
            case T_BOSS:
                w = 70; h = 55; hp = 5 + wave * 2;
                bossHP = hp; bossMaxHP = hp;
                break;
        }

        targets.push({
            type, x, y, w, h, vx: speed * dir,
            vy: type === T_BALLOON ? -0.3 - rng(0, 0.3) : 0,
            hp, maxHP: hp,
            col: type === T_DUCK ? pick(COL_DUCK) :
                 type === T_BALLOON ? pick(COL_BALLOON) :
                 type === T_GOLDEN ? COL_GOLDEN : '#AAA',
            depth, sizeScale,
            canShoot,
            shootTimer: rng(1500, 3500),
            wobble: 0,
            dying: false, deathTimer: 0,
        });
    }

    function updateTargets(dt) {
        const now = performance.now();
        const isSlow = slowEnd > now;
        const sm = isSlow ? 0.5 : 1;

        for (let i = targets.length - 1; i >= 0; i--) {
            const t = targets[i];
            if (t.dying) {
                t.deathTimer -= dt;
                if (t.deathTimer <= 0) targets.splice(i, 1);
                continue;
            }

            t.x += t.vx * sm * dt / 16;
            t.y += t.vy * sm * dt / 16;
            t.wobble += 0.05;

            // Balloon floats up and off
            if (t.type === T_BALLOON && t.y < -30) { targets.splice(i, 1); continue; }
            // Others scroll off
            if ((t.vx > 0 && t.x > GAME_W + 50) || (t.vx < 0 && t.x < -50)) {
                targets.splice(i, 1); continue;
            }

            // Shooting targets fire at player
            if (t.canShoot && !t.dying) {
                t.shootTimer -= dt * sm;
                if (t.shootTimer <= 0) {
                    t.shootTimer = rng(2000, 4000) - wave * 100;
                    fireEnemyProjectile(t.x, t.y);
                }
            }
            // Boss fires spreads
            if (t.type === T_BOSS && !t.dying) {
                t.shootTimer -= dt * sm;
                if (t.shootTimer <= 0) {
                    t.shootTimer = Math.max(800, 2000 - wave * 100);
                    for (let a = -0.3; a <= 0.3; a += 0.3) {
                        fireEnemyProjectile(t.x, t.y + 20, a);
                    }
                }
            }
        }
    }

    function hitTarget(t, ball) {
        t.hp -= ball.dmg || 1;
        if (t.hp <= 0) {
            t.dying = true;
            t.deathTimer = 20;
            switch (t.type) {
                case T_DUCK:
                    const pts = t.sizeScale < 0.8 ? 100 : 50;
                    addScore(pts, t.x, t.y);
                    SND.duckHit();
                    spawnParticles(t.x, t.y, 10, [t.col, '#FFF', '#F59E0B']);
                    break;
                case T_BALLOON:
                    addScore(30, t.x, t.y);
                    SND.popBalloon();
                    // Confetti
                    for (let p = 0; p < 15; p++) {
                        const a = rng(0, Math.PI * 2), sp = rng(0.5, 3);
                        particles.push({
                            x: t.x, y: t.y,
                            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
                            life: 40, maxLife: 40, r: rng(2, 4),
                            col: pick(COL_BALLOON),
                            type: 'confetti',
                        });
                    }
                    // Combo
                    if (comboColor === t.col && comboTimer > 0) {
                        combo++;
                        addScore(combo * 20, t.x, t.y - 15);
                    } else {
                        combo = 1;
                    }
                    comboColor = t.col;
                    comboTimer = 120;
                    break;
                case T_CAN:
                    addScore(75, t.x, t.y);
                    SND.canClatter();
                    // Tumble effect — spawn a few extra "falling" cans
                    for (let c = 0; c < 2; c++) {
                        particles.push({
                            x: t.x + rng(-5, 5), y: t.y - 10 - c * 15,
                            vx: rng(-1.5, 1.5), vy: rng(-3, -1),
                            life: 40, maxLife: 40, r: 6,
                            col: '#AAA', type: 'can',
                        });
                    }
                    spawnParticles(t.x, t.y, 5, ['#999', '#BBB', '#777']);
                    break;
                case T_PLATE:
                    addScore(60, t.x, t.y);
                    SND.plateSmash();
                    // Glass shards
                    for (let p = 0; p < 12; p++) {
                        const a = rng(0, Math.PI * 2), sp = rng(1, 3);
                        particles.push({
                            x: t.x, y: t.y,
                            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                            life: 30, maxLife: 30, r: rng(1, 3),
                            col: pick(['#E0F2FE', '#BAE6FD', '#FFF', '#7DD3FC']),
                            type: 'shard',
                        });
                    }
                    break;
                case T_BULLSEYE:
                    // Check how centered the hit was
                    const dist = Math.abs(ball.x - t.x) + Math.abs(ball.y - t.y);
                    const ring = dist < 5 ? 150 : dist < 12 ? 100 : 50;
                    addScore(ring, t.x, t.y);
                    if (ring === 150) SND.bullseye();
                    else SND.duckHit();
                    spawnParticles(t.x, t.y, 10, ['#EF4444', '#FFF', '#FBBF24']);
                    break;
                case T_GOLDEN:
                    addScore(500, t.x, t.y);
                    SND.golden();
                    // Sparkle burst
                    for (let p = 0; p < 20; p++) {
                        const a = rng(0, Math.PI * 2), sp = rng(1, 4);
                        particles.push({
                            x: t.x, y: t.y,
                            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                            life: 35, maxLife: 35, r: rng(2, 4),
                            col: pick(['#FFD700', '#FFF', '#FBBF24', '#FDE68A']),
                            type: 'sparkle',
                        });
                    }
                    // Drop power-up
                    spawnPowerup(t.x, t.y);
                    break;
                case T_BOMB:
                    addScore(-200, t.x, t.y);
                    SND.bomb();
                    screenShake = 8;
                    // Explosion
                    for (let p = 0; p < 25; p++) {
                        const a = rng(0, Math.PI * 2), sp = rng(1, 5);
                        particles.push({
                            x: t.x, y: t.y,
                            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                            life: 30, maxLife: 30, r: rng(3, 6),
                            col: pick(['#EF4444', '#F97316', '#FBBF24', '#111']),
                            type: 'spark',
                        });
                    }
                    break;
                case T_BOSS:
                    addScore(1000, t.x, t.y);
                    SND.golden();
                    screenShake = 6;
                    for (let p = 0; p < 30; p++) {
                        const a = rng(0, Math.PI * 2), sp = rng(1, 5);
                        particles.push({
                            x: t.x, y: t.y,
                            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                            life: 40, maxLife: 40, r: rng(3, 6),
                            col: pick(['#FFD700', '#FFF', '#EF4444', '#F97316']),
                            type: 'spark',
                        });
                    }
                    spawnPowerup(t.x, t.y);
                    break;
            }
        } else {
            // Multi-hit (boss)
            SND.bossHit();
            spawnParticles(t.x, t.y, 5, ['#FFF', '#CCC']);
            if (t.type === T_BOSS) bossHP = t.hp;
        }
    }

    function drawTargets() {
        // Sort by depth so far targets draw first
        const sorted = [...targets].sort((a, b) => a.depth - b.depth);
        for (const t of sorted) {
            ctx.save();
            ctx.translate(gx(t.x), gy(t.y));
            const alpha = t.dying ? clamp(t.deathTimer / 20, 0, 1) : 1;
            ctx.globalAlpha = alpha;
            if (t.dying) ctx.translate(0, gs((20 - t.deathTimer) * 0.5));

            switch (t.type) {
                case T_DUCK: drawDuck(t); break;
                case T_BALLOON: drawBalloon(t); break;
                case T_CAN: drawCan(t); break;
                case T_PLATE: drawPlate(t); break;
                case T_BULLSEYE: drawBullseye(t); break;
                case T_GOLDEN: drawGolden(t); break;
                case T_BOMB: drawBomb(t); break;
                case T_BOSS: drawBoss(t); break;
            }

            // Shooter icon
            if (t.canShoot && !t.dying && t.type !== T_BOSS) {
                ctx.fillStyle = hexAlpha('#FF4444', 0.7);
                ctx.font = gs(8) + 'px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('\u25CF', 0, gs(-t.h / 2 - 4));
            }

            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    function drawDuck(t) {
        const s = t.sizeScale;
        const wob = Math.sin(t.wobble * 3) * 2;
        // Body
        ctx.fillStyle = t.col;
        ctx.beginPath();
        ctx.ellipse(0, gs(wob), gs(13 * s), gs(10 * s), 0, 0, Math.PI * 2);
        ctx.fill();
        // Head
        ctx.beginPath();
        ctx.arc(gs(10 * s * (t.vx > 0 ? 1 : -1)), gs(-6 * s + wob), gs(7 * s), 0, Math.PI * 2);
        ctx.fill();
        // Beak
        ctx.fillStyle = '#F97316';
        const dir = t.vx > 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(gs((14 * s + 3) * dir), gs(-6 * s + wob));
        ctx.lineTo(gs((14 * s + 10) * dir), gs(-5 * s + wob));
        ctx.lineTo(gs((14 * s + 3) * dir), gs(-3 * s + wob));
        ctx.fill();
        // Eye
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(gs(12 * s * dir), gs(-8 * s + wob), gs(1.5), 0, Math.PI * 2);
        ctx.fill();
        // Wing
        ctx.fillStyle = hexAlpha(t.col, 0.7);
        const wingFlap = Math.sin(t.wobble * 5) * 3;
        ctx.beginPath();
        ctx.ellipse(gs(-3 * s * dir), gs(-2 * s + wob + wingFlap), gs(6 * s), gs(4 * s), dir * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawBalloon(t) {
        const s = t.sizeScale;
        // String
        ctx.strokeStyle = '#999';
        ctx.lineWidth = gs(1);
        ctx.beginPath();
        ctx.moveTo(0, gs(12 * s));
        ctx.quadraticCurveTo(gs(3), gs(18 * s), gs(-2), gs(24 * s));
        ctx.stroke();
        // Balloon body
        const grad = ctx.createRadialGradient(gs(-3 * s), gs(-5 * s), 0, 0, 0, gs(9 * s));
        grad.addColorStop(0, '#FFF');
        grad.addColorStop(0.3, t.col);
        grad.addColorStop(1, hexAlpha(t.col, 0.8));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, gs(9 * s), gs(12 * s), 0, 0, Math.PI * 2);
        ctx.fill();
        // Shine
        ctx.fillStyle = hexAlpha('#FFF', 0.5);
        ctx.beginPath();
        ctx.ellipse(gs(-3 * s), gs(-4 * s), gs(2.5 * s), gs(4 * s), -0.3, 0, Math.PI * 2);
        ctx.fill();
        // Knot
        ctx.fillStyle = t.col;
        ctx.beginPath();
        ctx.moveTo(gs(-2 * s), gs(11 * s));
        ctx.lineTo(gs(2 * s), gs(11 * s));
        ctx.lineTo(0, gs(14 * s));
        ctx.fill();
    }

    function drawCan(t) {
        const s = t.sizeScale;
        ctx.fillStyle = '#AAA';
        ctx.fillRect(gs(-7 * s), gs(-10 * s), gs(14 * s), gs(20 * s));
        // Label
        ctx.fillStyle = '#EF4444';
        ctx.fillRect(gs(-6 * s), gs(-6 * s), gs(12 * s), gs(12 * s));
        // Rim
        ctx.fillStyle = '#CCC';
        ctx.fillRect(gs(-7 * s), gs(-10 * s), gs(14 * s), gs(3 * s));
        ctx.fillRect(gs(-7 * s), gs(7 * s), gs(14 * s), gs(3 * s));
    }

    function drawPlate(t) {
        const s = t.sizeScale;
        const spin = Math.sin(t.wobble * 4);
        ctx.fillStyle = '#E0F2FE';
        ctx.beginPath();
        ctx.ellipse(0, 0, gs(13 * s), gs(3 * s * Math.abs(spin) + 2), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#93C5FD';
        ctx.lineWidth = gs(1);
        ctx.beginPath();
        ctx.ellipse(0, 0, gs(9 * s), gs(2 * s * Math.abs(spin) + 1), 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawBullseye(t) {
        const s = t.sizeScale;
        const rings = [['#FFF', 14], ['#EF4444', 11], ['#FFF', 8], ['#EF4444', 5], ['#FBBF24', 2]];
        for (const [col, r] of rings) {
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(0, 0, gs(r * s), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawGolden(t) {
        const s = t.sizeScale;
        // Sparkle aura
        const sparkle = 0.5 + 0.5 * Math.sin(frameCount * 0.1);
        ctx.fillStyle = hexAlpha('#FFD700', sparkle * 0.3);
        ctx.beginPath();
        ctx.arc(0, 0, gs(16 * s), 0, Math.PI * 2);
        ctx.fill();
        // Star shape
        ctx.fillStyle = COL_GOLDEN;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const a = (i * Math.PI * 2 / 5) - Math.PI / 2 + frameCount * 0.02;
            const ox = Math.cos(a) * gs(11 * s);
            const oy = Math.sin(a) * gs(11 * s);
            if (i === 0) ctx.moveTo(ox, oy);
            else ctx.lineTo(ox, oy);
            const a2 = a + Math.PI / 5;
            ctx.lineTo(Math.cos(a2) * gs(5 * s), Math.sin(a2) * gs(5 * s));
        }
        ctx.fill();
        // Shine
        ctx.fillStyle = hexAlpha('#FFF', 0.6);
        ctx.beginPath();
        ctx.arc(gs(-3 * s), gs(-3 * s), gs(3 * s), 0, Math.PI * 2);
        ctx.fill();
    }

    function drawBomb(t) {
        const s = t.sizeScale;
        const pulse = 0.8 + 0.2 * Math.sin(frameCount * 0.15);
        // Body
        ctx.fillStyle = '#1F2937';
        ctx.beginPath();
        ctx.arc(0, 0, gs(10 * s * pulse), 0, Math.PI * 2);
        ctx.fill();
        // Fuse
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = gs(2);
        ctx.beginPath();
        ctx.moveTo(gs(5 * s), gs(-8 * s));
        ctx.quadraticCurveTo(gs(10 * s), gs(-14 * s), gs(7 * s), gs(-16 * s));
        ctx.stroke();
        // Spark
        const sp = 0.5 + 0.5 * Math.sin(frameCount * 0.3);
        ctx.fillStyle = hexAlpha('#FBBF24', sp);
        ctx.beginPath();
        ctx.arc(gs(7 * s), gs(-16 * s), gs(3 * sp), 0, Math.PI * 2);
        ctx.fill();
        // Skull icon
        ctx.fillStyle = '#FFF';
        ctx.font = gs(10 * s) + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u2620', 0, gs(1));
    }

    function drawBoss(t) {
        // Armored target
        const pulse = 0.95 + 0.05 * Math.sin(frameCount * 0.08);
        ctx.fillStyle = '#374151';
        ctx.fillRect(gs(-35 * pulse), gs(-28 * pulse), gs(70 * pulse), gs(56 * pulse));
        // Armor plates
        ctx.fillStyle = '#6B7280';
        ctx.fillRect(gs(-32), gs(-25), gs(64), gs(5));
        ctx.fillRect(gs(-32), gs(-10), gs(64), gs(5));
        ctx.fillRect(gs(-32), gs(5), gs(64), gs(5));
        ctx.fillRect(gs(-32), gs(18), gs(64), gs(5));
        // Rivets
        ctx.fillStyle = '#9CA3AF';
        for (const rx of [-28, -14, 0, 14, 28]) {
            for (const ry of [-22, 0, 20]) {
                ctx.beginPath();
                ctx.arc(gs(rx), gs(ry), gs(2), 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // HP bar
        if (t.hp < t.maxHP) {
            const pct = t.hp / t.maxHP;
            ctx.fillStyle = hexAlpha('#000', 0.5);
            ctx.fillRect(gs(-30), gs(-35), gs(60), gs(6));
            ctx.fillStyle = pct > 0.5 ? '#22C55E' : pct > 0.25 ? '#FBBF24' : '#EF4444';
            ctx.fillRect(gs(-30), gs(-35), gs(60 * pct), gs(6));
        }
        // Danger icon
        ctx.fillStyle = '#EF4444';
        ctx.font = gs(16) + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u2605', 0, 0);
    }

    // ═══════════════════════════════════════════
    //  ENEMY PROJECTILES
    // ═══════════════════════════════════════════
    function fireEnemyProjectile(x, y, angleOff) {
        const dx = GAME_W / 2 - x;
        const dy = CANNON_Y - y;
        const a = Math.atan2(dy, dx) + (angleOff || 0);
        const speed = 2.5 + wave * 0.15;
        enemyProjectiles.push({
            x, y,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed * 0.6,
            gravity: 0.02 + wave * 0.003,
            warned: false,
            trail: [],
        });
        SND.enemyFire();
    }

    function updateEnemyProjectiles(dt) {
        for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
            const p = enemyProjectiles[i];
            p.trail.push({ x: p.x, y: p.y });
            if (p.trail.length > 8) p.trail.shift();
            p.x += p.vx * dt / 16;
            p.y += p.vy * dt / 16;
            p.vy += p.gravity * dt / 16;

            if (p.y > GAME_H + 20 || p.x < -30 || p.x > GAME_W + 30) {
                enemyProjectiles.splice(i, 1);
                continue;
            }

            // Hit cannon?
            const dx = p.x - GAME_W / 2;
            const dy = p.y - CANNON_Y;
            if (Math.sqrt(dx * dx + dy * dy) < 25) {
                if (shields > 0) {
                    shields--;
                    SND.shield();
                    spawnParticles(GAME_W / 2, CANNON_Y - 10, 10, ['#22D3EE', '#FFF']);
                } else {
                    lives--;
                    stunTimer = STUN_MS;
                    screenShake = 10;
                    SND.die();
                    spawnParticles(GAME_W / 2, CANNON_Y, 15, ['#EF4444', '#F97316', '#FFF']);
                    if (lives <= 0) {
                        state = ST_DEAD;
                        if (score > highScore) { highScore = score; try { localStorage.setItem('ywa_cannonblast_hi', String(highScore)); } catch {} }
                    }
                }
                enemyProjectiles.splice(i, 1);
            }
        }
    }

    function drawEnemyProjectiles() {
        for (const p of enemyProjectiles) {
            // Warning dotted line
            if (p.y < CANNON_Y - 80) {
                ctx.strokeStyle = hexAlpha('#FF4444', 0.15 + 0.1 * Math.sin(frameCount * 0.2));
                ctx.lineWidth = gs(1);
                ctx.setLineDash([gs(4), gs(4)]);
                ctx.beginPath();
                ctx.moveTo(gx(p.x), gy(p.y));
                ctx.lineTo(gx(GAME_W / 2), gy(CANNON_Y));
                ctx.stroke();
                ctx.setLineDash([]);
            }
            // Trail
            for (let i = 0; i < p.trail.length; i++) {
                const a = i / p.trail.length;
                ctx.fillStyle = hexAlpha('#FF4444', a * 0.4);
                ctx.beginPath();
                ctx.arc(gx(p.trail[i].x), gy(p.trail[i].y), gs(3 * a), 0, Math.PI * 2);
                ctx.fill();
            }
            // Projectile
            const glow = 0.7 + 0.3 * Math.sin(frameCount * 0.2);
            ctx.fillStyle = hexAlpha('#FF4444', glow * 0.3);
            ctx.beginPath();
            ctx.arc(gx(p.x), gy(p.y), gs(10), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = COL_ENEMY_PROJ;
            ctx.beginPath();
            ctx.arc(gx(p.x), gy(p.y), gs(5), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = hexAlpha('#FFF', 0.6);
            ctx.beginPath();
            ctx.arc(gx(p.x - 1.5), gy(p.y - 1.5), gs(2), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ═══════════════════════════════════════════
    //  POWER-UPS
    // ═══════════════════════════════════════════
    function spawnPowerup(x, y) {
        const type = Math.floor(rng(0, 5));
        powerups.push({ x, y, vx: 0, vy: 1, type, life: 300 });
    }

    function updatePowerups(dt) {
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            p.y += p.vy * dt / 16;
            p.life--;
            if (p.life <= 0 || p.y > GAME_H + 20) { powerups.splice(i, 1); continue; }
            // Pickup near cannon
            const dx = p.x - GAME_W / 2, dy = p.y - CANNON_Y;
            if (Math.sqrt(dx * dx + dy * dy) < 40) {
                activatePowerup(p.type);
                SND.powerup();
                spawnParticles(p.x, p.y, 10, ['#22D3EE', '#A855F7', '#FFF']);
                scorePopups.push({ x: p.x, y: p.y, text: pwName(p.type), life: 60, col: '#22D3EE' });
                powerups.splice(i, 1);
            }
        }
    }

    function pwName(type) {
        return ['RAPID!', 'MULTI!', 'BOOM!', '+SHIELD', 'SLOW!'][type];
    }

    function activatePowerup(type) {
        const now = performance.now();
        switch (type) {
            case PW_RAPID: rapidFireEnd = now + 3000; break;
            case PW_MULTI: multiShotEnd = now + 4000; break;
            case PW_EXPLOSIVE: explosiveEnd = now + 4000; break;
            case PW_SHIELD: shields = Math.min(shields + 1, SHIELD_MAX + 2); break;
            case PW_SLOW: slowEnd = now + 5000; break;
        }
    }

    function drawPowerups() {
        const pwCols = ['#22D3EE', '#A855F7', '#F97316', '#3B82F6', '#22C55E'];
        const pwIcons = ['\u26A1', '\u2726', '\u2600', '\u2764', '\u231B'];
        for (const p of powerups) {
            const bob = Math.sin(frameCount * 0.08 + p.x) * 3;
            ctx.fillStyle = hexAlpha(pwCols[p.type], 0.3);
            ctx.beginPath();
            ctx.arc(gx(p.x), gy(p.y + bob), gs(14), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = pwCols[p.type];
            ctx.beginPath();
            ctx.arc(gx(p.x), gy(p.y + bob), gs(10), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.font = gs(10) + 'px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(pwIcons[p.type], gx(p.x), gy(p.y + bob + 1));
        }
    }

    // ═══════════════════════════════════════════
    //  PARTICLES & SCORE POPUPS
    // ═══════════════════════════════════════════
    function spawnParticles(x, y, n, cols) {
        for (let i = 0; i < n; i++) {
            const a = rng(0, Math.PI * 2), sp = rng(0.5, 3);
            particles.push({
                x, y,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.5,
                life: rng(15, 30), maxLife: 30,
                r: rng(1.5, 4),
                col: pick(cols),
                type: 'spark',
            });
        }
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt / 16;
            p.y += p.vy * dt / 16;
            if (p.type === 'smoke') { p.r += 0.15; p.vy -= 0.02; }
            else if (p.type === 'can') { p.vy += 0.12; p.vx *= 0.98; }
            else if (p.type === 'confetti') { p.vy += 0.03; p.vx *= 0.98; }
            else if (p.type === 'shard') { p.vy += 0.08; }
            else if (p.type === 'sparkle') { p.r *= 0.97; }
            else p.vy += 0.03;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = clamp(p.life / (p.maxLife * 0.5), 0, 1);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.col;
            if (p.type === 'smoke') {
                ctx.fillStyle = hexAlpha(p.col, alpha * 0.4);
                ctx.beginPath();
                ctx.arc(gx(p.x), gy(p.y), gs(p.r), 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'confetti') {
                ctx.save();
                ctx.translate(gx(p.x), gy(p.y));
                ctx.rotate(p.vx * 0.5 + frameCount * 0.05);
                ctx.fillRect(gs(-p.r / 2), gs(-p.r / 4), gs(p.r), gs(p.r / 2));
                ctx.restore();
            } else if (p.type === 'can') {
                ctx.fillStyle = '#AAA';
                ctx.fillRect(gx(p.x - 4), gy(p.y - 6), gs(8), gs(12));
                ctx.fillStyle = '#EF4444';
                ctx.fillRect(gx(p.x - 3), gy(p.y - 3), gs(6), gs(6));
            } else {
                ctx.beginPath();
                ctx.arc(gx(p.x), gy(p.y), gs(p.r), 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    function addScore(pts, x, y) {
        score += pts;
        if (score < 0) score = 0;
        const col = pts > 0 ? (pts >= 200 ? '#FFD700' : '#FFF') : '#EF4444';
        const text = pts > 0 ? '+' + pts : '' + pts;
        scorePopups.push({ x, y, text, life: 50, col });
    }

    function updatePopups(dt) {
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const p = scorePopups[i];
            p.y -= 0.8 * dt / 16;
            p.life--;
            if (p.life <= 0) scorePopups.splice(i, 1);
        }
        if (comboTimer > 0) comboTimer--;
    }

    function drawPopups() {
        for (const p of scorePopups) {
            const alpha = clamp(p.life / 25, 0, 1);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.col;
            ctx.font = 'bold ' + gs(12) + 'px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(p.text, gx(p.x), gy(p.y));
        }
        ctx.globalAlpha = 1;

        // Combo display
        if (combo > 1 && comboTimer > 0) {
            const alpha = clamp(comboTimer / 40, 0, 1);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#A855F7';
            ctx.font = 'bold ' + gs(14) + 'px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('COMBO x' + combo, gx(GAME_W / 2), gy(GAME_H / 2 - 30));
            ctx.globalAlpha = 1;
        }
    }

    // ═══════════════════════════════════════════
    //  COLLISION
    // ═══════════════════════════════════════════
    function circRectHit(cx, cy, cr, rx, ry, rw, rh) {
        const nearX = clamp(cx, rx, rx + rw);
        const nearY = clamp(cy, ry, ry + rh);
        const dx = cx - nearX, dy = cy - nearY;
        return dx * dx + dy * dy < cr * cr;
    }

    function shieldActive() {
        return shields > 0;
    }

    // ═══════════════════════════════════════════
    //  WAVES
    // ═══════════════════════════════════════════
    function startWave(w) {
        wave = w;
        targets = [];
        enemyProjectiles = [];
        targetSpawnTimer = 0;
        waveTimer = waveTargetCount() * 400 + 5000;

        // Boss wave
        if (wave === 10 || wave % 10 === 0) {
            spawnTarget(T_BOSS);
        }
    }

    function waveTargetCount() {
        return 8 + wave * 3;
    }

    function checkWaveClear() {
        if (waveTimer <= 0 && targets.length === 0 && enemyProjectiles.length === 0) {
            if (wave >= WAVE_COUNT) {
                state = ST_OVER;
                if (score > highScore) { highScore = score; try { localStorage.setItem('ywa_cannonblast_hi', String(highScore)); } catch {} }
                return;
            }
            state = ST_WAVE_CLEAR;
            waveClearTimer = 120;
            SND.waveClear();
        }
    }

    // ═══════════════════════════════════════════
    //  HUD
    // ═══════════════════════════════════════════
    function drawHUD() {
        ctx.fillStyle = COL_HUD;
        ctx.font = 'bold ' + gs(14) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('SCORE: ' + score, gs(10), gs(20));

        ctx.textAlign = 'right';
        ctx.fillText('WAVE ' + wave + '/' + WAVE_COUNT, gx(GAME_W - 10), gs(20));

        // Lives
        ctx.textAlign = 'left';
        for (let i = 0; i < lives; i++) {
            ctx.fillStyle = '#EF4444';
            ctx.beginPath();
            ctx.arc(gs(14 + i * 18), gs(36), gs(6), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.font = gs(9) + 'px serif';
            ctx.textAlign = 'center';
            ctx.fillText('\u2764', gs(14 + i * 18), gs(38));
        }

        // Shields
        ctx.textAlign = 'left';
        ctx.fillStyle = '#22D3EE';
        ctx.font = gs(10) + 'px monospace';
        for (let i = 0; i < shields; i++) {
            ctx.fillText('\u25C6', gs(10 + i * 14), gs(54));
        }

        // Active power-ups
        const now = performance.now();
        let py = 70;
        ctx.font = gs(9) + 'px monospace';
        if (rapidFireEnd > now) { ctx.fillStyle = '#22D3EE'; ctx.fillText('RAPID', gs(10), gs(py)); py += 12; }
        if (multiShotEnd > now) { ctx.fillStyle = '#A855F7'; ctx.fillText('MULTI', gs(10), gs(py)); py += 12; }
        if (explosiveEnd > now) { ctx.fillStyle = '#F97316'; ctx.fillText('BOOM', gs(10), gs(py)); py += 12; }
        if (slowEnd > now) { ctx.fillStyle = '#22C55E'; ctx.fillText('SLOW', gs(10), gs(py)); py += 12; }

        // Boss HP
        if (bossHP > 0) {
            const pct = bossHP / bossMaxHP;
            ctx.fillStyle = hexAlpha('#000', 0.5);
            ctx.fillRect(gx(GAME_W / 2 - 60), gs(GAME_H - 20), gs(120), gs(8));
            ctx.fillStyle = pct > 0.5 ? '#22C55E' : pct > 0.25 ? '#FBBF24' : '#EF4444';
            ctx.fillRect(gx(GAME_W / 2 - 60), gs(GAME_H - 20), gs(120 * pct), gs(8));
            ctx.fillStyle = '#FFF';
            ctx.font = gs(7) + 'px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('BOSS', gx(GAME_W / 2), gs(GAME_H - 14));
        }
    }

    function drawVignette() {
        const grad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    // ═══════════════════════════════════════════
    //  SCREENS
    // ═══════════════════════════════════════════
    function drawTitle() {
        drawBackdrop();
        drawVignette();

        // Title
        ctx.fillStyle = COL_ACCENT;
        ctx.font = 'bold ' + gs(32) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const bounce = Math.sin(frameCount * 0.04) * 5;
        ctx.fillText('CANNON BLAST', gx(GAME_W / 2), gy(140 + bounce));

        // Subtitle
        ctx.fillStyle = COL_HUD;
        ctx.font = gs(13) + 'px monospace';
        ctx.fillText('Carnival Shooting Gallery', gx(GAME_W / 2), gy(180));

        // Cannon preview
        ctx.save();
        ctx.translate(gx(GAME_W / 2), gy(280));
        ctx.fillStyle = '#6b3e20';
        ctx.fillRect(gs(-20), gs(-5), gs(40), gs(14));
        ctx.fillStyle = '#888';
        ctx.fillRect(gs(-6), gs(-30), gs(12), gs(28));
        ctx.fillStyle = '#5c3a1e';
        ctx.beginPath();
        ctx.arc(gs(-14), gs(10), gs(8), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.arc(gs(14), gs(10), gs(8), 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // Instructions
        ctx.fillStyle = hexAlpha(COL_HUD, 0.6 + 0.3 * Math.sin(frameCount * 0.06));
        ctx.font = gs(12) + 'px monospace';
        ctx.fillText(HAS_TOUCH ? 'TAP TO START' : 'CLICK TO START', gx(GAME_W / 2), gy(370));

        ctx.fillStyle = hexAlpha(COL_HUD, 0.4);
        ctx.font = gs(9) + 'px monospace';
        ctx.fillText('Aim with mouse/touch \u2022 Click to fire', gx(GAME_W / 2), gy(400));
        ctx.fillText('Hold to charge \u2022 Shift/Right-click for shield', gx(GAME_W / 2), gy(415));
    }

    function drawWaveIntro() {
        drawBackdrop();
        drawVignette();
        const flash = 0.5 + 0.5 * Math.sin(frameCount * 0.1);
        ctx.fillStyle = hexAlpha(COL_ACCENT, flash);
        ctx.font = 'bold ' + gs(28) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('WAVE ' + wave, gx(GAME_W / 2), gy(GAME_H / 2 - 20));
        ctx.fillStyle = hexAlpha(COL_HUD, 0.5);
        ctx.font = gs(12) + 'px monospace';
        const desc = wave === 10 ? 'BOSS WAVE!' : wave >= 7 ? 'Heavy Fire!' : wave >= 5 ? 'Golden targets!' : wave >= 3 ? 'Watch for return fire!' : 'Easy pickings!';
        ctx.fillText(desc, gx(GAME_W / 2), gy(GAME_H / 2 + 20));
    }

    function drawWaveClear() {
        drawBackdrop();
        drawCannon();
        drawParticles();
        drawPopups();
        drawVignette();
        drawHUD();
        const flash = 0.5 + 0.5 * Math.sin(frameCount * 0.1);
        ctx.fillStyle = hexAlpha('#22C55E', flash);
        ctx.font = 'bold ' + gs(24) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('WAVE ' + wave + ' CLEAR!', gx(GAME_W / 2), gy(GAME_H / 2));
    }

    function drawGameOver() {
        drawBackdrop();
        drawVignette();
        ctx.fillStyle = '#EF4444';
        ctx.shadowColor = '#EF4444'; ctx.shadowBlur = gs(12);
        ctx.font = 'bold ' + gs(28) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GAME OVER', gx(GAME_W / 2), gy(GAME_H / 2 - 60));
        ctx.shadowBlur = 0;
        ctx.fillStyle = COL_ACCENT;
        ctx.font = 'bold ' + gs(18) + 'px monospace';
        ctx.fillText('SCORE: ' + score.toLocaleString(), gx(GAME_W / 2), gy(GAME_H / 2 - 15));
        if (score >= highScore && score > 0) {
            ctx.fillStyle = '#FBBF24'; ctx.font = 'bold ' + gs(12) + 'px monospace';
            ctx.fillText('\u2605 NEW HIGH SCORE! \u2605', gx(GAME_W / 2), gy(GAME_H / 2 + 10));
        } else {
            ctx.fillStyle = '#666'; ctx.font = gs(11) + 'px monospace';
            ctx.fillText('BEST: ' + highScore.toLocaleString(), gx(GAME_W / 2), gy(GAME_H / 2 + 10));
        }
        ctx.fillStyle = hexAlpha(COL_HUD, 0.5 + 0.3 * Math.sin(frameCount * 0.06));
        ctx.font = gs(12) + 'px monospace';
        ctx.fillText('Wave ' + wave + '/' + WAVE_COUNT, gx(GAME_W / 2), gy(GAME_H / 2 + 35));
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.fillStyle = '#06B6D4';
            ctx.font = gs(13) + 'px monospace';
            ctx.fillText(HAS_TOUCH ? 'TAP TO PLAY AGAIN' : 'CLICK TO PLAY AGAIN', gx(GAME_W / 2), gy(GAME_H / 2 + 70));
        }
    }

    function drawVictory() {
        drawBackdrop();
        drawVignette();
        const bounce = Math.sin(frameCount * 0.04) * 5;
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold ' + gs(28) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('VICTORY!', gx(GAME_W / 2), gy(GAME_H / 2 - 60 + bounce));
        ctx.fillStyle = COL_ACCENT;
        ctx.font = 'bold ' + gs(18) + 'px monospace';
        ctx.fillText('FINAL SCORE: ' + score.toLocaleString(), gx(GAME_W / 2), gy(GAME_H / 2 - 15));
        if (score >= highScore && score > 0) {
            ctx.fillStyle = '#FBBF24'; ctx.font = 'bold ' + gs(12) + 'px monospace';
            ctx.fillText('\u2605 NEW HIGH SCORE! \u2605', gx(GAME_W / 2), gy(GAME_H / 2 + 10));
        } else {
            ctx.fillStyle = '#666'; ctx.font = gs(11) + 'px monospace';
            ctx.fillText('BEST: ' + highScore.toLocaleString(), gx(GAME_W / 2), gy(GAME_H / 2 + 10));
        }
        const blink2 = Math.sin(frameCount * 0.08) > 0;
        if (blink2) {
            ctx.fillStyle = '#22C55E'; ctx.font = gs(13) + 'px monospace';
            ctx.fillText(HAS_TOUCH ? 'TAP TO CONTINUE' : 'CLICK TO CONTINUE', gx(GAME_W / 2), gy(GAME_H / 2 + 50));
        }
    }

    // ═══════════════════════════════════════════
    //  INPUT
    // ═══════════════════════════════════════════
    function canvasCoords(ex, ey) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (ex - rect.left) / rect.width * GAME_W,
            y: (ey - rect.top) / rect.height * GAME_H,
        };
    }

    function onMouseMove(e) {
        const c = canvasCoords(e.clientX, e.clientY);
        mouseX = c.x; mouseY = c.y;
    }

    function endGame() {
        if (gameOverCB) gameOverCB(score);
    }

    function onMouseDown(e) {
        ensureAudio();
        if (state === ST_TITLE) {
            startGame();
            return;
        }
        if (state === ST_DEAD || state === ST_OVER) { endGame(); return; }
        if (e.button === 2 || e.shiftKey) {
            useShield();
            return;
        }
        charging = true;
        chargeTimer = 0;
    }

    function onMouseUp(e) {
        if (state === ST_PLAY && charging) {
            fireCannon();
        }
        charging = false;
    }

    function onContextMenu(e) { e.preventDefault(); }

    function onKeyDown(e) {
        keys[e.key] = true;
        if (state === ST_TITLE && (e.key === ' ' || e.key === 'Enter')) {
            ensureAudio();
            startGame();
        }
        if ((state === ST_DEAD || state === ST_OVER) && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault();
            endGame();
        }
        if (state === ST_PLAY) {
            if (e.key === ' ') {
                if (!charging) { charging = true; chargeTimer = 0; }
            }
            if (e.key === 's' || e.key === 'S') useShield();
        }
    }

    function onKeyUp(e) {
        keys[e.key] = false;
        if (e.key === ' ' && state === ST_PLAY && charging) {
            fireCannon();
        }
    }

    function onTouchStart(e) {
        e.preventDefault();
        ensureAudio();
        if (e.touches.length >= 2) { useShield(); return; }
        const t = e.touches[0];
        const c = canvasCoords(t.clientX, t.clientY);
        mouseX = c.x; mouseY = c.y;
        touchActive = true;
        if (state === ST_TITLE) { startGame(); return; }
        if (state === ST_DEAD || state === ST_OVER) { endGame(); return; }
        if (state === ST_PLAY) { charging = true; chargeTimer = 0; }
    }

    function onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length > 0) {
            const t = e.touches[0];
            const c = canvasCoords(t.clientX, t.clientY);
            mouseX = c.x; mouseY = c.y;
        }
    }

    function onTouchEnd(e) {
        e.preventDefault();
        if (state === ST_PLAY && charging) fireCannon();
        charging = false;
        touchActive = false;
    }

    function useShield() {
        if (shields > 0) {
            // Shield absorb (visual only, actual absorption happens on hit)
            SND.shield();
            spawnParticles(GAME_W / 2, CANNON_Y - 20, 6, ['#22D3EE', '#FFF']);
        }
    }

    // ═══════════════════════════════════════════
    //  GAME FLOW
    // ═══════════════════════════════════════════
    function startGame() {
        state = ST_WAVE_INTRO;
        score = 0;
        lives = INITIAL_LIVES;
        shields = SHIELD_MAX;
        wave = 1;
        cannonAngle = -Math.PI / 2;
        reloadTimer = 0;
        chargeTimer = 0;
        charging = false;
        stunTimer = 0;
        cannonBalls = [];
        enemyProjectiles = [];
        targets = [];
        particles = [];
        scorePopups = [];
        powerups = [];
        combo = 0; comboTimer = 0; comboColor = '';
        rapidFireEnd = 0; multiShotEnd = 0; explosiveEnd = 0; slowEnd = 0;
        bossHP = 0; bossMaxHP = 0;
        introTimer = 90;
        waveTimer = 0;
        screenShake = 0;
        gameActive = true;
    }

    // ═══════════════════════════════════════════
    //  GAME LOOP
    // ═══════════════════════════════════════════
    function gameLoop(ts) {
        if (!gameActive && state !== ST_DEAD && state !== ST_OVER) return;
        animFrame = requestAnimationFrame(gameLoop);
        const dt = lastTime ? Math.min(ts - lastTime, 50) : 16;
        lastTime = ts;
        frameCount++;

        // Keyboard aiming
        if (keys['ArrowLeft'] || keys['a']) mouseX -= 4;
        if (keys['ArrowRight'] || keys['d']) mouseX += 4;
        if (keys['ArrowUp'] || keys['w']) mouseY -= 4;
        if (keys['ArrowDown']) mouseY += 4;
        mouseX = clamp(mouseX, 0, GAME_W);
        mouseY = clamp(mouseY, 0, GAME_H);

        // Screen shake
        if (screenShake > 0) {
            ctx.save();
            ctx.translate(rng(-screenShake, screenShake) * SCALE, rng(-screenShake, screenShake) * SCALE);
            screenShake *= 0.88;
            if (screenShake < 0.3) screenShake = 0;
        }

        if (state === ST_TITLE) {
            drawTitle();
        } else if (state === ST_WAVE_INTRO) {
            introTimer--;
            drawWaveIntro();
            if (introTimer <= 0) {
                state = ST_PLAY;
                startWave(wave);
            }
        } else if (state === ST_PLAY) {
            updateCannon(dt);
            updateBalls(dt);
            updateTargets(dt);
            updateEnemyProjectiles(dt);
            updatePowerups(dt);
            updateParticles(dt);
            updatePopups(dt);
            if (waveTimer > 0) {
                waveTimer -= dt;
                spawnWaveTargets(dt);
            }
            checkWaveClear();

            drawBackdrop();
            drawTargets();
            drawBalls();
            drawEnemyProjectiles();
            drawPowerups();
            drawCannon();
            drawParticles();
            drawPopups();
            drawVignette();
            drawHUD();
            // Crosshair
            drawCrosshair();
        } else if (state === ST_WAVE_CLEAR) {
            waveClearTimer--;
            updateParticles(dt);
            updatePopups(dt);
            drawWaveClear();
            if (waveClearTimer <= 0) {
                wave++;
                // Auto-upgrades per wave
                if (wave % 3 === 0 && shields < SHIELD_MAX + 2) shields++;
                state = ST_WAVE_INTRO;
                introTimer = 90;
            }
        } else if (state === ST_DEAD) {
            drawBackdrop();
            drawCannon();
            drawParticles();
            drawVignette();
            drawGameOver();
            updateParticles(dt);
        } else if (state === ST_OVER) {
            drawBackdrop();
            drawVignette();
            drawVictory();
        }

        if (screenShake > 0) ctx.restore();

        // Touch controls overlay
        if (HAS_TOUCH && state === ST_PLAY) drawTouchControls();
    }

    function drawCrosshair() {
        ctx.strokeStyle = hexAlpha(COL_ACCENT, 0.5);
        ctx.lineWidth = gs(1);
        const cx = gx(mouseX), cy = gy(mouseY), sz = gs(8);
        ctx.beginPath();
        ctx.moveTo(cx - sz, cy); ctx.lineTo(cx + sz, cy);
        ctx.moveTo(cx, cy - sz); ctx.lineTo(cx, cy + sz);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, gs(5), 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawTouchControls() {
        ctx.fillStyle = hexAlpha('#FFF', 0.15);
        ctx.font = gs(9) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('2-finger tap: Shield', gx(GAME_W / 2), gy(GAME_H - 8));
    }

    // ═══════════════════════════════════════════
    //  FIT CANVAS
    // ═══════════════════════════════════════════
    function fitCanvas() {
        if (!canvas || !canvas.parentElement) return;
        const parent = canvas.parentElement;
        const maxW = parent.clientWidth || window.innerWidth;
        const maxH = parent.clientHeight || window.innerHeight;
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        const ratio = GAME_W / GAME_H;
        let cw, ch;
        if (maxW / maxH > ratio) { ch = maxH; cw = ch * ratio; }
        else { cw = maxW; ch = cw / ratio; }
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        canvas.width = Math.round(cw * DPR);
        canvas.height = Math.round(ch * DPR);
        W = canvas.width; H = canvas.height;
        SCALE = W / GAME_W;
        bgGradient = null;
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

        setupColors();
        initBackdrop();

        state = ST_TITLE;
        frameCount = 0;
        lastTime = 0;
        keys = {};
        mouseX = GAME_W / 2;
        mouseY = GAME_H / 2;
        touchActive = false;
        cannonBalls = [];
        enemyProjectiles = [];
        targets = [];
        particles = [];
        scorePopups = [];
        powerups = [];
        screenShake = 0;
        score = 0;
        lives = INITIAL_LIVES;
        shields = SHIELD_MAX;
        wave = 1;
        combo = 0; comboTimer = 0;
        rapidFireEnd = 0; multiShotEnd = 0; explosiveEnd = 0; slowEnd = 0;
        bossHP = 0; bossMaxHP = 0;
        cannonAngle = -Math.PI / 2;
        reloadTimer = 0;
        chargeTimer = 0;
        charging = false;
        stunTimer = 0;

        W = canvas.width || GAME_W;
        H = canvas.height || GAME_H;
        SCALE = W / GAME_W;
        DPR = Math.min(window.devicePixelRatio || 1, 3);

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('contextmenu', onContextMenu);
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
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('contextmenu', onContextMenu);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        window.removeEventListener('resize', fitCanvas);
        keys = {};
        cannonBalls = [];
        enemyProjectiles = [];
        targets = [];
        particles = [];
        scorePopups = [];
        powerups = [];
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getWave() { return wave; },
        isActive() { return gameActive; },
    };
})();
