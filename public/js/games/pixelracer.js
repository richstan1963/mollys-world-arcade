/* PixelRacer — Top-down pixel racing game for Your World Arcade
 * Self-contained, no dependencies, canvas-rendered, theme-aware */
window.PixelRacer = (() => {

    // -- roundRect polyfill (Safari <16, older browsers) --
    if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
            if (!Array.isArray(radii)) radii = [radii || 0];
            const r = radii.map(v => Math.min(Math.max(0, v || 0), Math.min(w, h) / 2));
            while (r.length < 4) r.push(r[r.length - 1] || 0);
            this.moveTo(x + r[0], y);
            this.arcTo(x + w, y,     x + w, y + h, r[1]);
            this.arcTo(x + w, y + h, x,     y + h, r[2]);
            this.arcTo(x,     y + h, x,     y + h, r[3]);
            this.arcTo(x,     y,     x + w, y,     r[0]);
            this.closePath();
            return this;
        };
    }

    // ── Constants ──
    const GAME_W = 480, GAME_H = 640;
    const NUM_LANES = 5;
    const LANE_W = 60;
    const ROAD_W = NUM_LANES * LANE_W;
    const ROAD_X = (GAME_W - ROAD_W) / 2;
    const PLAYER_W = 40, PLAYER_H = 70;
    const COIN_R = 10;
    const POWERUP_R = 14;
    const STRIPE_H = 40, STRIPE_GAP = 30;
    const HUD_H = 50;

    // Car types: [width, height, speed_factor, color_index, name]
    const CAR_TYPES = [
        { w: 36, h: 60, sf: 0.7, ci: 0, name: 'sedan' },
        { w: 44, h: 80, sf: 0.5, ci: 1, name: 'truck' },
        { w: 34, h: 55, sf: 1.2, ci: 2, name: 'sports' },
        { w: 38, h: 65, sf: 0.8, ci: 3, name: 'suv' },
    ];

    // Environment configs
    const ENVS = [
        { name: 'Highway',       road: '#444444', shoulder: '#666', grass: '#2d5a27', sky: ['#1a2a3a', '#0a1520'], treeLine: true,  buildings: false },
        { name: 'Desert Road',   road: '#8B7355', shoulder: '#A0895C', grass: '#C2A64D', sky: ['#3D2B1F', '#1A0F0A'], treeLine: false, buildings: false },
        { name: 'City Streets',  road: '#333333', shoulder: '#555', grass: '#3a3a3a', sky: ['#1a1a2e', '#0f0f1a'], treeLine: false, buildings: true },
        { name: 'Mountain Pass', road: '#555555', shoulder: '#777', grass: '#1a4a20', sky: ['#1a2040', '#0a0a20'], treeLine: true,  buildings: false },
    ];

    // Power-up types
    const PU_NITRO   = 0;
    const PU_SHIELD  = 1;
    const PU_MAGNET  = 2;

    // ── State ──
    let canvas, ctx, W, H, scale;
    let animFrame = null;
    let audioCtx  = null;
    let player    = null;
    let onGameOver = null;
    let gameActive = false;

    // Game state
    const ST_TITLE   = 0;
    const ST_PLAYING = 1;
    const ST_OVER    = 2;
    let state = ST_TITLE;

    let score, distance, speed, baseSpeed, maxSpeed;
    let lane;               // 0..NUM_LANES-1
    let playerY;            // vertical position (fixed near bottom)
    let playerX;            // computed from lane
    let targetX;            // smooth movement target
    let scrollY;            // road scroll offset
    let startTime;
    let envIndex;
    let carsAvoided;

    // Traffic
    let traffic = [];
    let coins   = [];
    let powerups = [];
    let coinCount = 0;

    // Power-up active timers
    let nitroTimer  = 0;
    let shieldTimer = 0;
    let magnetTimer = 0;

    // Scenery
    let scenery = [];       // trees, buildings, etc.
    let stripeOffset = 0;

    // Particles / effects
    let particles = [];
    let scorePopups = [];
    let screenShake = 0;
    let comboCount  = 0;
    let comboTimer  = 0;
    let flashAlpha  = 0;

    // Input
    let keys = {};
    let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
    let touchActive = false;
    let swipeHandled = false;

    // Theme colors
    let BG_TOP   = '#0F1117';
    let BG_BOT   = '#1a1a2e';
    let ACCENT   = '#F43F5E';
    let ACCENT2  = '#3B82F6';
    let ACCENT3  = '#22C55E';
    let ACCENT4  = '#FBBF24';
    let TC = ['#F43F5E', '#3B82F6', '#22C55E', '#FBBF24', '#A855F7', '#06B6D4'];

    // ── Audio ──
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
            const t = when || ac.currentTime;
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = type || 'square';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(vol || 0.10, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.1));
            o.connect(g);
            g.connect(ac.destination);
            o.start(t);
            o.stop(t + (dur || 0.1));
        } catch { /* swallow */ }
    }

    function playCoin()    { tone(880, 0.08, 'sine', 0.12); tone(1100, 0.08, 'sine', 0.10, ensureAudio()?.currentTime + 0.06); }
    function playHit()     { tone(150, 0.3, 'sawtooth', 0.15); }
    function playPowerup() { const ac = ensureAudio(); if (!ac) return; const t = ac.currentTime; tone(523, 0.1, 'sine', 0.12, t); tone(659, 0.1, 'sine', 0.12, t + 0.08); tone(784, 0.15, 'sine', 0.12, t + 0.16); }
    function playNitro()   { tone(200, 0.5, 'sawtooth', 0.08); tone(400, 0.5, 'sawtooth', 0.06, ensureAudio()?.currentTime + 0.1); }
    function playLane()    { tone(440, 0.04, 'square', 0.06); }
    function playPass()    { tone(660, 0.06, 'triangle', 0.08); }
    function playEngine(spd) {
        const ac = ensureAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(40 + spd * 0.5, t);
            g.gain.setValueAtTime(0.02, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
            o.connect(g);
            g.connect(ac.destination);
            o.start(t);
            o.stop(t + 0.06);
        } catch { /* swallow */ }
    }
    function playGameOver() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        tone(440, 0.2, 'sawtooth', 0.10, t);
        tone(330, 0.25, 'sawtooth', 0.10, t + 0.18);
        tone(220, 0.4, 'sawtooth', 0.10, t + 0.38);
    }

    // ── Helpers ──
    function hexAlpha(hex, a) {
        let c = hex.replace('#', '');
        if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
        const n = parseInt(c, 16);
        return `rgba(${n >> 16},${(n >> 8) & 0xff},${n & 0xff},${a})`;
    }

    function laneX(l) {
        return ROAD_X + l * LANE_W + LANE_W / 2;
    }

    function rand(a, b) { return Math.random() * (b - a) + a; }
    function randInt(a, b) { return Math.floor(rand(a, b + 1)); }

    // ── Particles ──
    function spawnBurst(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 5 + 2;
            particles.push({
                x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: 1.0, decay: Math.random() * 0.03 + 0.015,
                r: Math.random() * 4 + 1.5, color: color || '#FFF'
            });
        }
    }

    function spawnScorePopup(x, y, text, color) {
        scorePopups.push({ x, y, text, color: color || '#FFD700', life: 1.0, vy: -1.5 });
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.05; p.vx *= 0.98;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const p = scorePopups[i];
            p.y += p.vy; p.life -= 0.02;
            if (p.life <= 0) scorePopups.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = p.life * 0.8;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        for (const p of scorePopups) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.text, p.x, p.y);
        }
        ctx.globalAlpha = 1;
    }

    // ── Canvas fit (DPR-aware) ──
    function fitCanvas() {
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;

        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const aspect = GAME_W / GAME_H;
        let w, h;
        if (cw / ch > aspect) { h = ch; w = ch * aspect; }
        else { w = cw; h = cw / aspect; }

        const dpr = window.devicePixelRatio || 1;
        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width  = Math.round(w) + 'px';
        canvas.style.height = Math.round(h) + 'px';
        W = GAME_W;
        H = GAME_H;
        scale = (w * dpr) / GAME_W;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }

    function onResize() { fitCanvas(); }

    // ── Drawing: Car sprites ──
    function drawPlayerCar(x, y) {
        const cw = PLAYER_W, ch = PLAYER_H;
        const cx = x - cw / 2, cy = y - ch / 2;

        ctx.save();

        // Shield glow
        if (shieldTimer > 0) {
            ctx.shadowColor = '#38BDF8';
            ctx.shadowBlur = 20;
            ctx.strokeStyle = hexAlpha('#38BDF8', 0.6 + Math.sin(Date.now() * 0.01) * 0.3);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(x, y, cw / 2 + 8, ch / 2 + 10, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Nitro flame
        if (nitroTimer > 0) {
            const flameH = 15 + Math.random() * 10;
            const flameGrad = ctx.createLinearGradient(x, cy + ch, x, cy + ch + flameH);
            flameGrad.addColorStop(0, '#FF6600');
            flameGrad.addColorStop(0.4, '#FFAA00');
            flameGrad.addColorStop(1, 'rgba(255,100,0,0)');
            ctx.fillStyle = flameGrad;
            ctx.beginPath();
            ctx.moveTo(x - 8, cy + ch);
            ctx.quadraticCurveTo(x - 3, cy + ch + flameH * 0.6, x, cy + ch + flameH);
            ctx.quadraticCurveTo(x + 3, cy + ch + flameH * 0.6, x + 8, cy + ch);
            ctx.fill();

            // Second flame
            const f2 = 8 + Math.random() * 8;
            ctx.fillStyle = hexAlpha('#FFDD00', 0.7);
            ctx.beginPath();
            ctx.moveTo(x - 4, cy + ch);
            ctx.quadraticCurveTo(x, cy + ch + f2, x + 4, cy + ch);
            ctx.fill();
        }

        // Body
        const bodyGrad = ctx.createLinearGradient(cx, cy, cx + cw, cy);
        bodyGrad.addColorStop(0, ACCENT);
        bodyGrad.addColorStop(0.5, hexAlpha(ACCENT, 0.85));
        bodyGrad.addColorStop(1, hexAlpha(ACCENT, 0.7));
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.roundRect(cx + 2, cy + 10, cw - 4, ch - 15, [4, 4, 6, 6]);
        ctx.fill();

        // Hood
        ctx.fillStyle = hexAlpha(ACCENT, 0.9);
        ctx.beginPath();
        ctx.roundRect(cx + 5, cy, cw - 10, 18, [8, 8, 2, 2]);
        ctx.fill();

        // Windshield
        ctx.fillStyle = hexAlpha('#88CCFF', 0.7);
        ctx.beginPath();
        ctx.roundRect(cx + 7, cy + 14, cw - 14, 12, [2]);
        ctx.fill();

        // Rear window
        ctx.fillStyle = hexAlpha('#6699CC', 0.5);
        ctx.beginPath();
        ctx.roundRect(cx + 8, cy + ch - 20, cw - 16, 8, [2]);
        ctx.fill();

        // Wheels
        ctx.fillStyle = '#222';
        ctx.fillRect(cx - 2, cy + 8, 6, 14);
        ctx.fillRect(cx + cw - 4, cy + 8, 6, 14);
        ctx.fillRect(cx - 2, cy + ch - 22, 6, 14);
        ctx.fillRect(cx + cw - 4, cy + ch - 22, 6, 14);

        // Wheel caps
        ctx.fillStyle = '#666';
        ctx.fillRect(cx - 1, cy + 12, 4, 6);
        ctx.fillRect(cx + cw - 3, cy + 12, 4, 6);
        ctx.fillRect(cx - 1, cy + ch - 18, 4, 6);
        ctx.fillRect(cx + cw - 3, cy + ch - 18, 4, 6);

        // Headlights
        ctx.fillStyle = '#FFFFAA';
        ctx.shadowColor = '#FFFFAA';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(cx + 8, cy + 3, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + cw - 8, cy + 3, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Tail lights
        ctx.fillStyle = '#FF3333';
        ctx.shadowColor = '#FF3333';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(cx + 6, cy + ch - 5, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + cw - 6, cy + ch - 5, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Racing stripe
        ctx.fillStyle = hexAlpha('#FFF', 0.2);
        ctx.fillRect(x - 2, cy + 2, 4, ch - 6);

        ctx.restore();
    }

    function drawTrafficCar(x, y, type, hpRatio) {
        const t = CAR_TYPES[type];
        const cw = t.w, ch = t.h;
        const cx = x - cw / 2, cy = y - ch / 2;
        const color = TC[t.ci % TC.length];

        ctx.save();

        // Body
        const bodyGrad = ctx.createLinearGradient(cx, cy, cx + cw, cy);
        bodyGrad.addColorStop(0, color);
        bodyGrad.addColorStop(1, hexAlpha(color, 0.7));
        ctx.fillStyle = bodyGrad;

        if (t.name === 'truck') {
            // Truck: boxy
            ctx.beginPath();
            ctx.roundRect(cx + 1, cy + 5, cw - 2, ch - 8, [3, 3, 4, 4]);
            ctx.fill();
            // Cab
            ctx.fillStyle = hexAlpha(color, 0.9);
            ctx.beginPath();
            ctx.roundRect(cx + 4, cy + ch - 25, cw - 8, 20, [2, 2, 4, 4]);
            ctx.fill();
        } else if (t.name === 'sports') {
            // Sports: sleek
            ctx.beginPath();
            ctx.roundRect(cx + 3, cy + 3, cw - 6, ch - 6, [10, 10, 5, 5]);
            ctx.fill();
            // Spoiler
            ctx.fillStyle = hexAlpha(color, 0.6);
            ctx.fillRect(cx + 2, cy, cw - 4, 4);
        } else {
            // Sedan/SUV
            ctx.beginPath();
            ctx.roundRect(cx + 2, cy + 8, cw - 4, ch - 12, [4, 4, 5, 5]);
            ctx.fill();
            // Hood
            ctx.fillStyle = hexAlpha(color, 0.85);
            ctx.beginPath();
            ctx.roundRect(cx + 5, cy + ch - 15, cw - 10, 14, [6, 6, 2, 2]);
            ctx.fill();
        }

        // Windshield (facing down = player sees top = rear of traffic car)
        ctx.fillStyle = hexAlpha('#88CCFF', 0.5);
        ctx.beginPath();
        ctx.roundRect(cx + 6, cy + 12, cw - 12, 10, [2]);
        ctx.fill();

        // Wheels
        ctx.fillStyle = '#222';
        ctx.fillRect(cx - 1, cy + 10, 5, 12);
        ctx.fillRect(cx + cw - 4, cy + 10, 5, 12);
        ctx.fillRect(cx - 1, cy + ch - 22, 5, 12);
        ctx.fillRect(cx + cw - 4, cy + ch - 22, 5, 12);

        // Tail lights (top of car since driving away from us)
        ctx.fillStyle = '#FF4444';
        ctx.shadowColor = '#FF4444';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(cx + 5, cy + 4, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + cw - 5, cy + 4, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    // ── Drawing: Road & scenery ──
    function drawRoad() {
        const env = ENVS[envIndex];

        // Sky gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, GAME_H);
        skyGrad.addColorStop(0, env.sky[0]);
        skyGrad.addColorStop(1, env.sky[1]);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Grass/ground
        ctx.fillStyle = env.grass;
        ctx.fillRect(0, 0, ROAD_X, GAME_H);
        ctx.fillRect(ROAD_X + ROAD_W, 0, GAME_W - ROAD_X - ROAD_W, GAME_H);

        // Road shoulder
        ctx.fillStyle = env.shoulder;
        ctx.fillRect(ROAD_X - 6, 0, 6, GAME_H);
        ctx.fillRect(ROAD_X + ROAD_W, 0, 6, GAME_H);

        // Road surface
        ctx.fillStyle = env.road;
        ctx.fillRect(ROAD_X, 0, ROAD_W, GAME_H);

        // Lane stripes
        const stripeTotal = STRIPE_H + STRIPE_GAP;
        const offset = stripeOffset % stripeTotal;
        ctx.fillStyle = '#FFFFFF';
        for (let l = 1; l < NUM_LANES; l++) {
            const sx = ROAD_X + l * LANE_W - 1;
            for (let y = -stripeTotal + offset; y < GAME_H + stripeTotal; y += stripeTotal) {
                ctx.globalAlpha = 0.5;
                ctx.fillRect(sx, y, 2, STRIPE_H);
            }
        }
        ctx.globalAlpha = 1;

        // Road edge lines (solid)
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = 0.7;
        ctx.fillRect(ROAD_X + 2, 0, 3, GAME_H);
        ctx.fillRect(ROAD_X + ROAD_W - 5, 0, 3, GAME_H);
        ctx.globalAlpha = 1;
    }

    function drawScenery() {
        const env = ENVS[envIndex];
        for (const s of scenery) {
            ctx.save();
            if (s.side === 'left') {
                drawSceneryItem(ROAD_X - 20 - s.xOff, s.y, s.type, env, -1);
            } else {
                drawSceneryItem(ROAD_X + ROAD_W + 20 + s.xOff, s.y, s.type, env, 1);
            }
            ctx.restore();
        }
    }

    function drawSceneryItem(x, y, type, env, dir) {
        if (type === 'tree') {
            // Trunk
            ctx.fillStyle = '#5C3D2E';
            ctx.fillRect(x - 3, y - 5, 6, 20);
            // Canopy
            ctx.fillStyle = env.name === 'Desert Road' ? '#8B7B42' : '#1B8A1B';
            ctx.beginPath();
            ctx.arc(x, y - 12, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = hexAlpha(env.name === 'Desert Road' ? '#A09050' : '#22AA22', 0.5);
            ctx.beginPath();
            ctx.arc(x + 3, y - 15, 10, 0, Math.PI * 2);
            ctx.fill();
        } else if (type === 'building') {
            const bw = 25 + Math.abs(Math.sin(x * 0.1)) * 20;
            const bh = 60 + Math.abs(Math.cos(x * 0.07)) * 80;
            ctx.fillStyle = '#2a2a3a';
            ctx.beginPath();
            ctx.roundRect(x - bw / 2, y - bh, bw, bh, [3, 3, 0, 0]);
            ctx.fill();
            // Windows
            ctx.fillStyle = '#FFEE88';
            for (let wy = y - bh + 8; wy < y - 5; wy += 14) {
                for (let wx = x - bw / 2 + 5; wx < x + bw / 2 - 5; wx += 10) {
                    if (Math.random() > 0.3) {
                        ctx.globalAlpha = 0.3 + Math.random() * 0.5;
                        ctx.fillRect(wx, wy, 5, 7);
                    }
                }
            }
            ctx.globalAlpha = 1;
        } else if (type === 'cactus') {
            ctx.fillStyle = '#2D6B30';
            ctx.fillRect(x - 3, y - 25, 6, 30);
            // Arms
            ctx.fillRect(x - 12, y - 18, 10, 5);
            ctx.fillRect(x - 12, y - 25, 5, 12);
            ctx.fillRect(x + 5, y - 12, 10, 5);
            ctx.fillRect(x + 10, y - 20, 5, 13);
        } else if (type === 'rock') {
            ctx.fillStyle = '#666';
            ctx.beginPath();
            ctx.moveTo(x - 10, y);
            ctx.lineTo(x - 8, y - 14);
            ctx.lineTo(x + 2, y - 18);
            ctx.lineTo(x + 10, y - 10);
            ctx.lineTo(x + 8, y);
            ctx.closePath();
            ctx.fill();
        } else if (type === 'sign') {
            ctx.fillStyle = '#888';
            ctx.fillRect(x - 1, y - 30, 2, 30);
            ctx.fillStyle = '#227722';
            ctx.beginPath();
            ctx.roundRect(x - 14, y - 35, 28, 14, [2]);
            ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.font = '8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(Math.floor(distance / 100) + 'km', x, y - 25);
        }
    }

    // ── Drawing: Coins & power-ups ──
    function drawCoin(x, y) {
        const pulse = Math.sin(Date.now() * 0.006) * 2;
        ctx.save();
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 8 + pulse;
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(x, y, COIN_R + pulse * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Inner
        ctx.fillStyle = '#FFEE55';
        ctx.beginPath();
        ctx.arc(x, y, COIN_R * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // $ symbol
        ctx.fillStyle = '#CC9900';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', x, y + 1);
        ctx.restore();
    }

    function drawPowerUp(x, y, type) {
        const pulse = Math.sin(Date.now() * 0.008) * 3;
        const colors = ['#FF6600', '#38BDF8', '#A855F7'];
        const icons  = ['N', 'S', 'M'];  // Nitro, Shield, Magnet
        const clr = colors[type];

        ctx.save();
        ctx.shadowColor = clr;
        ctx.shadowBlur = 12 + pulse;

        // Outer glow ring
        ctx.strokeStyle = hexAlpha(clr, 0.6);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, POWERUP_R + pulse * 0.5, 0, Math.PI * 2);
        ctx.stroke();

        // Body
        ctx.fillStyle = clr;
        ctx.beginPath();
        ctx.arc(x, y, POWERUP_R, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        // Icon
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icons[type], x, y + 1);
        ctx.restore();
    }

    // ── Drawing: HUD ──
    function drawHUD() {
        ctx.save();

        // HUD background bar
        ctx.fillStyle = hexAlpha('#000', 0.6);
        ctx.fillRect(0, 0, GAME_W, HUD_H);

        // Score
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('Score: ' + score, 10, 18);

        // Coins
        ctx.fillStyle = '#FFEE55';
        ctx.fillText('x' + coinCount, 10, 40);

        // Speed
        const kmh = Math.floor(speed * 10);
        ctx.fillStyle = nitroTimer > 0 ? '#FF6600' : '#FFF';
        ctx.textAlign = 'center';
        ctx.fillText(kmh + ' km/h', GAME_W / 2, 18);

        // Distance
        ctx.fillStyle = '#AAA';
        ctx.font = '14px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(Math.floor(distance) + 'm', GAME_W / 2, 38);

        // Environment name
        ctx.fillStyle = ACCENT3;
        ctx.textAlign = 'right';
        ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(ENVS[envIndex].name, GAME_W - 10, 18);

        // Combo display
        if (comboCount > 1 && comboTimer > 0) {
            ctx.fillStyle = hexAlpha('#FFD700', comboTimer);
            ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('x' + comboCount + ' COMBO!', GAME_W - 10, 38);
        }

        // Power-up indicators
        let px = GAME_W - 10;
        if (nitroTimer > 0) {
            ctx.fillStyle = '#FF6600';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('NITRO ' + Math.ceil(nitroTimer / 60), px, HUD_H - 4);
            px -= 70;
        }
        if (shieldTimer > 0) {
            ctx.fillStyle = '#38BDF8';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('SHIELD ' + Math.ceil(shieldTimer / 60), px, HUD_H - 4);
            px -= 80;
        }
        if (magnetTimer > 0) {
            ctx.fillStyle = '#A855F7';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('MAGNET ' + Math.ceil(magnetTimer / 60), px, HUD_H - 4);
        }

        ctx.restore();
    }

    // ── Spawning ──
    function spawnTraffic() {
        const type = randInt(0, CAR_TYPES.length - 1);
        const l = randInt(0, NUM_LANES - 1);
        // Check overlap with existing traffic
        const sx = laneX(l);
        for (const c of traffic) {
            if (Math.abs(c.x - sx) < 30 && c.y < 80) return;
        }
        traffic.push({
            x: sx, y: -100, lane: l, type,
            speed: speed * CAR_TYPES[type].sf * (0.5 + Math.random() * 0.3),
            passed: false
        });
    }

    function spawnCoin() {
        const l = randInt(0, NUM_LANES - 1);
        coins.push({ x: laneX(l), y: -30, lane: l });
    }

    function spawnPowerup() {
        const l = randInt(0, NUM_LANES - 1);
        const type = randInt(0, 2);
        powerups.push({ x: laneX(l), y: -30, lane: l, type });
    }

    function spawnSceneryItem() {
        const env = ENVS[envIndex];
        const side = Math.random() > 0.5 ? 'left' : 'right';
        let type;
        if (env.buildings && Math.random() > 0.4) type = 'building';
        else if (env.name === 'Desert Road') type = Math.random() > 0.5 ? 'cactus' : 'rock';
        else if (env.treeLine) type = Math.random() > 0.2 ? 'tree' : 'sign';
        else type = Math.random() > 0.5 ? 'tree' : 'sign';

        scenery.push({
            side, y: -50, xOff: rand(5, 40), type
        });
    }

    // ── Game logic ──
    function startGame() {
        state = ST_PLAYING;
        gameActive = true;
        score = 0;
        distance = 0;
        speed = 3;
        baseSpeed = 3;
        maxSpeed = 14;
        lane = Math.floor(NUM_LANES / 2);
        playerY = GAME_H - 100;
        playerX = laneX(lane);
        targetX = playerX;
        scrollY = 0;
        stripeOffset = 0;
        envIndex = 0;
        carsAvoided = 0;
        coinCount = 0;
        traffic = [];
        coins = [];
        powerups = [];
        scenery = [];
        particles = [];
        scorePopups = [];
        nitroTimer = 0;
        shieldTimer = 0;
        magnetTimer = 0;
        comboCount = 0;
        comboTimer = 0;
        screenShake = 0;
        flashAlpha = 0;
        startTime = Date.now();
    }

    function moveLane(dir) {
        const newLane = lane + dir;
        if (newLane < 0 || newLane >= NUM_LANES) return;
        lane = newLane;
        targetX = laneX(lane);
        playLane();
    }

    function activateNitro() {
        if (nitroTimer <= 0) {
            nitroTimer = 180; // 3 seconds at 60fps
            playNitro();
        }
    }

    function update() {
        if (state !== ST_PLAYING) return;

        const dt = 1; // fixed timestep

        // Speed ramp
        const elapsed = (Date.now() - startTime) / 1000;
        baseSpeed = 3 + elapsed * 0.04;
        if (baseSpeed > maxSpeed) baseSpeed = maxSpeed;
        speed = baseSpeed + (nitroTimer > 0 ? 4 : 0);

        // Environment switching
        const newEnv = Math.min(Math.floor(distance / 2000), ENVS.length - 1);
        if (newEnv !== envIndex) {
            envIndex = newEnv;
            flashAlpha = 0.5;
        }

        // Scroll
        stripeOffset += speed * 1.5;
        distance += speed * 0.05;

        // Power-up timers
        if (nitroTimer > 0) nitroTimer--;
        if (shieldTimer > 0) shieldTimer--;
        if (magnetTimer > 0) magnetTimer--;
        if (comboTimer > 0) { comboTimer -= 0.01; if (comboTimer <= 0) comboCount = 0; }
        if (flashAlpha > 0) flashAlpha -= 0.015;

        // Smooth player X movement
        playerX += (targetX - playerX) * 0.2;

        // Input
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) moveLane(-1);
        if (keys['ArrowRight'] || keys['d'] || keys['D']) moveLane(1);
        if (keys['ArrowUp'] || keys[' ']) activateNitro();
        // Clear single-press keys
        delete keys['ArrowLeft']; delete keys['ArrowRight'];
        delete keys['ArrowUp']; delete keys[' '];
        delete keys['a']; delete keys['d'];
        delete keys['A']; delete keys['D'];

        // Spawn traffic
        const spawnRate = Math.max(20, 60 - Math.floor(elapsed * 0.5));
        if (Math.random() < 1 / spawnRate) spawnTraffic();

        // Spawn coins
        if (Math.random() < 0.02) spawnCoin();

        // Spawn power-ups
        if (Math.random() < 0.003) spawnPowerup();

        // Spawn scenery
        if (Math.random() < 0.05) spawnSceneryItem();

        // Update traffic
        for (let i = traffic.length - 1; i >= 0; i--) {
            const c = traffic[i];
            c.y += speed - c.speed;
            // Passed scoring
            if (!c.passed && c.y > playerY + PLAYER_H / 2) {
                c.passed = true;
                score += 10;
                carsAvoided++;
                comboCount++;
                comboTimer = 1.0;
                if (comboCount > 1) {
                    score += comboCount * 5;
                    spawnScorePopup(playerX, playerY - 40, '+' + (comboCount * 5) + ' COMBO', '#FFD700');
                }
                playPass();
            }
            if (c.y > GAME_H + 100) traffic.splice(i, 1);
        }

        // Update coins
        for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i];
            c.y += speed;

            // Magnet pull
            if (magnetTimer > 0) {
                const dx = playerX - c.x;
                const dy = playerY - c.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150) {
                    c.x += dx * 0.08;
                    c.y += dy * 0.08;
                }
            }

            // Collect
            const dx = playerX - c.x;
            const dy = playerY - c.y;
            if (Math.sqrt(dx * dx + dy * dy) < 25) {
                coinCount++;
                score += 25;
                spawnBurst(c.x, c.y, 8, '#FFD700');
                spawnScorePopup(c.x, c.y, '+25', '#FFD700');
                playCoin();
                coins.splice(i, 1);
                continue;
            }
            if (c.y > GAME_H + 30) coins.splice(i, 1);
        }

        // Update power-ups
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            p.y += speed;
            const dx = playerX - p.x;
            const dy = playerY - p.y;
            if (Math.sqrt(dx * dx + dy * dy) < 30) {
                if (p.type === PU_NITRO) { nitroTimer = 180; spawnScorePopup(p.x, p.y, 'NITRO!', '#FF6600'); }
                else if (p.type === PU_SHIELD) { shieldTimer = 300; spawnScorePopup(p.x, p.y, 'SHIELD!', '#38BDF8'); }
                else if (p.type === PU_MAGNET) { magnetTimer = 360; spawnScorePopup(p.x, p.y, 'MAGNET!', '#A855F7'); }
                spawnBurst(p.x, p.y, 15, ['#FF6600', '#38BDF8', '#A855F7'][p.type]);
                playPowerup();
                powerups.splice(i, 1);
                continue;
            }
            if (p.y > GAME_H + 30) powerups.splice(i, 1);
        }

        // Update scenery
        for (let i = scenery.length - 1; i >= 0; i--) {
            scenery[i].y += speed;
            if (scenery[i].y > GAME_H + 100) scenery.splice(i, 1);
        }

        // Collision with traffic
        for (const c of traffic) {
            const t = CAR_TYPES[c.type];
            const dx = Math.abs(playerX - c.x);
            const dy = Math.abs(playerY - c.y);
            if (dx < (PLAYER_W + t.w) / 2 - 6 && dy < (PLAYER_H + t.h) / 2 - 6) {
                if (shieldTimer > 0) {
                    // Shield absorbs hit
                    shieldTimer = 0;
                    screenShake = 10;
                    spawnBurst(c.x, c.y, 20, '#38BDF8');
                    // Push car away
                    c.y -= 50;
                    playHit();
                } else {
                    // Game over
                    gameOver();
                    return;
                }
            }
        }

        // Engine sound (periodic)
        if (Math.random() < 0.15) playEngine(speed);

        updateParticles();

        // Screen shake decay
        if (screenShake > 0) screenShake *= 0.85;
        if (screenShake < 0.5) screenShake = 0;
    }

    function gameOver() {
        state = ST_OVER;
        gameActive = false;
        screenShake = 15;
        spawnBurst(playerX, playerY, 30, ACCENT);
        playGameOver();
        // Calculate final score
        score += coinCount * 10;
        score += Math.floor(distance);
    }

    // ── Main draw ──
    function draw(time) {
        ctx.save();

        // Screen shake
        if (screenShake > 0) {
            const sx = (Math.random() - 0.5) * screenShake;
            const sy = (Math.random() - 0.5) * screenShake;
            ctx.translate(sx, sy);
        }

        if (state === ST_TITLE) {
            drawTitleScreen(time);
        } else {
            drawRoad();
            drawScenery();

            // Draw coins
            for (const c of coins) drawCoin(c.x, c.y);

            // Draw power-ups
            for (const p of powerups) drawPowerUp(p.x, p.y, p.type);

            // Draw traffic
            for (const c of traffic) drawTrafficCar(c.x, c.y, c.type);

            // Draw player
            drawPlayerCar(playerX, playerY);

            // Draw particles
            drawParticles();

            // Flash effect
            if (flashAlpha > 0) {
                ctx.fillStyle = hexAlpha('#FFF', flashAlpha);
                ctx.fillRect(0, 0, GAME_W, GAME_H);
            }

            // HUD
            drawHUD();

            // Touch zones indicator
            drawTouchZones();

            if (state === ST_OVER) {
                drawGameOverScreen(time);
            }
        }

        ctx.restore();
    }

    function drawTouchZones() {
        if (!touchActive) return;
        // Subtle left/right indicators
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#FFF';
        // Left zone
        ctx.beginPath();
        ctx.moveTo(0, GAME_H);
        ctx.lineTo(GAME_W / 2, GAME_H);
        ctx.lineTo(GAME_W / 2, GAME_H - 100);
        ctx.closePath();
        ctx.fill();
        // Right zone
        ctx.beginPath();
        ctx.moveTo(GAME_W / 2, GAME_H);
        ctx.lineTo(GAME_W, GAME_H);
        ctx.lineTo(GAME_W / 2, GAME_H - 100);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawTitleScreen(time) {
        const env = ENVS[0];
        const skyGrad = ctx.createLinearGradient(0, 0, 0, GAME_H);
        skyGrad.addColorStop(0, env.sky[0]);
        skyGrad.addColorStop(1, env.sky[1]);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Animated road preview
        drawRoad();

        // Darken overlay
        ctx.fillStyle = hexAlpha('#000', 0.5);
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Title
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const bob = Math.sin((time || 0) * 0.003) * 5;

        // "PIXEL RACER"
        ctx.font = 'bold 48px "Segoe UI", system-ui, sans-serif';
        const tg = ctx.createLinearGradient(GAME_W / 2 - 140, 0, GAME_W / 2 + 140, 0);
        tg.addColorStop(0, ACCENT);
        tg.addColorStop(0.5, '#FFD700');
        tg.addColorStop(1, ACCENT2);
        ctx.fillStyle = tg;
        ctx.shadowColor = ACCENT;
        ctx.shadowBlur = 20;
        ctx.fillText('PIXEL RACER', GAME_W / 2, GAME_H / 2 - 80 + bob);
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.font = '18px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#AAA';
        ctx.fillText('Dodge traffic, collect coins, race forever!', GAME_W / 2, GAME_H / 2 - 30);

        // Controls
        ctx.font = '14px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#888';
        ctx.fillText('Arrow keys / tap to steer', GAME_W / 2, GAME_H / 2 + 20);
        ctx.fillText('Up / swipe up for nitro boost', GAME_W / 2, GAME_H / 2 + 42);

        // Start prompt
        const blink = Math.sin((time || 0) * 0.005) * 0.3 + 0.7;
        ctx.globalAlpha = blink;
        ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFF';
        ctx.fillText('TAP or PRESS SPACE to START', GAME_W / 2, GAME_H / 2 + 100);
        ctx.globalAlpha = 1;

        // Draw a demo car
        drawPlayerCar(GAME_W / 2, GAME_H / 2 + 180 + bob * 0.5);

        ctx.restore();
    }

    function drawGameOverScreen(time) {
        ctx.save();
        ctx.fillStyle = hexAlpha('#000', 0.65);
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // GAME OVER
        ctx.font = 'bold 44px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = ACCENT;
        ctx.shadowColor = ACCENT;
        ctx.shadowBlur = 20;
        ctx.fillText('GAME OVER', GAME_W / 2, GAME_H / 2 - 90);
        ctx.shadowBlur = 0;

        // Stats
        ctx.font = '20px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('Score: ' + score, GAME_W / 2, GAME_H / 2 - 30);

        ctx.fillStyle = '#AAA';
        ctx.font = '16px "Segoe UI", system-ui, sans-serif';
        ctx.fillText('Distance: ' + Math.floor(distance) + 'm', GAME_W / 2, GAME_H / 2 + 5);
        ctx.fillText('Coins: ' + coinCount, GAME_W / 2, GAME_H / 2 + 30);
        ctx.fillText('Cars Passed: ' + carsAvoided, GAME_W / 2, GAME_H / 2 + 55);

        // Restart prompt
        const blink = Math.sin((time || 0) * 0.005) * 0.3 + 0.7;
        ctx.globalAlpha = blink;
        ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFF';
        ctx.fillText('TAP or PRESS SPACE to RESTART', GAME_W / 2, GAME_H / 2 + 110);
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    // ── Game loop ──
    let lastTime = 0;
    let accumulator = 0;
    const TICK = 1000 / 60;

    function loop(time) {
        if (!canvas) return;
        animFrame = requestAnimationFrame(loop);

        const delta = Math.min(time - (lastTime || time), 50);
        lastTime = time;
        accumulator += delta;

        while (accumulator >= TICK) {
            update();
            accumulator -= TICK;
        }

        draw(time);
    }

    // ── Input handlers ──
    function onKeyDown(e) {
        keys[e.key] = true;
        ensureAudio();
        if ((e.key === ' ' || e.key === 'Enter') && (state === ST_TITLE || state === ST_OVER)) {
            e.preventDefault();
            startGame();
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === ' ') {
            e.preventDefault();
        }
    }

    function onKeyUp(e) {
        // Keep single-press keys handled in update
    }

    function onTouchStart(e) {
        ensureAudio();
        touchActive = true;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        touchStartX = (touch.clientX - rect.left) / rect.width * GAME_W;
        touchStartY = (touch.clientY - rect.top) / rect.height * GAME_H;
        touchStartTime = Date.now();
        swipeHandled = false;

        if (state === ST_TITLE || state === ST_OVER) {
            startGame();
            return;
        }
    }

    function onTouchMove(e) {
        if (state !== ST_PLAYING || swipeHandled) return;
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const tx = (touch.clientX - rect.left) / rect.width * GAME_W;
        const ty = (touch.clientY - rect.top) / rect.height * GAME_H;

        const dx = tx - touchStartX;
        const dy = ty - touchStartY;

        // Swipe up for nitro
        if (dy < -40 && Math.abs(dx) < 40) {
            activateNitro();
            swipeHandled = true;
            return;
        }

        // Horizontal swipe for lane change
        if (Math.abs(dx) > 30) {
            if (dx > 0) moveLane(1);
            else moveLane(-1);
            touchStartX = tx;
            swipeHandled = true;
        }
    }

    function onTouchEnd(e) {
        if (swipeHandled) return;
        // Tap left/right half for lane change
        if (state === ST_PLAYING && Date.now() - touchStartTime < 300) {
            if (touchStartX < GAME_W / 2) moveLane(-1);
            else moveLane(1);
        }
    }

    function onMouseDown(e) {
        ensureAudio();
        if (state === ST_TITLE || state === ST_OVER) {
            startGame();
        }
    }

    // ── Public API ──
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer || null;
        onGameOver = gameOverCallback || null;

        // Theme
        const themeId = activePlayer?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            BG_TOP  = _t.bgGradient[0] || BG_TOP;
            BG_BOT  = _t.bgGradient[1] || BG_BOT;
            ACCENT  = _t.colors[0] || ACCENT;
            ACCENT2 = _t.colors[1] || ACCENT2;
            ACCENT3 = _t.colors[2] || ACCENT3;
            ACCENT4 = _t.colors[3] || ACCENT4;
            TC = _t.colors || TC;
        }

        keys = {};
        particles = [];
        scorePopups = [];
        traffic = [];
        coins = [];
        powerups = [];
        scenery = [];
        state = ST_TITLE;
        gameActive = false;

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('resize', onResize);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('touchstart', onTouchStart, { passive: true });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: true });

        animFrame = requestAnimationFrame(loop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;

        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', onResize);

        if (canvas) {
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        canvas = null;
        ctx = null;

        if (audioCtx) {
            try { audioCtx.close(); } catch { /* ignore */ }
            audioCtx = null;
        }
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return envIndex + 1; },
        isActive() { return gameActive; }
    };
})();
