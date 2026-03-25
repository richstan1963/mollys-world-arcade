/* 10-Pin Bowling — Kenney Physics Pack Edition — Your World Arcade */
window.Bowling = (() => {

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

    //  SPRITE PRELOADER
    const ASSET_BASE = '/img/game-assets/kenney-physics';
    const sprites = {};
    let spritesLoaded = 0;
    let spritesTotal  = 0;
    let allSpritesReady = false;

    const SPRITE_MANIFEST = {
        // Wood planks for lane surface
        woodPlank70: 'wood/elementWood010.png', woodSquare: 'wood/elementWood013.png',
        woodBlock1: 'wood/elementWood000.png', woodBlock2: 'wood/elementWood001.png',
        woodBlock3: 'wood/elementWood003.png', woodBlock4: 'wood/elementWood004.png',
        // Metal for gutters
        metalSquare: 'metal/elementMetal010.png', metalBlock1: 'metal/elementMetal001.png',
        metalBlock2: 'metal/elementMetal002.png', metalBlock3: 'metal/elementMetal004.png',
        // Stone for walls
        stoneSquare: 'stone/elementStone001.png',
        // Backgrounds
        bgBlueLand: 'backgrounds/blue_land.png',
        // Debris for pin scatter
        debrisWood1: 'debris/debrisWood_1.png', debrisWood2: 'debris/debrisWood_2.png',
        debrisWood3: 'debris/debrisWood_3.png',
        // Decorative
        coinGold: 'other/coinGold.png', starGold: 'other/starGold.png',
        flagYellow: 'other/flagYellow.png',
    };

    function loadSprites(onComplete) {
        const keys = Object.keys(SPRITE_MANIFEST);
        spritesTotal = keys.length;
        spritesLoaded = 0;
        allSpritesReady = false;

        if (keys.length === 0) { allSpritesReady = true; onComplete(); return; }

        keys.forEach(key => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                sprites[key] = img;
                spritesLoaded++;
                if (spritesLoaded >= spritesTotal) {
                    allSpritesReady = true;
                    if (onComplete) onComplete();
                }
            };
            img.onerror = () => {
                sprites[key] = null;
                spritesLoaded++;
                if (spritesLoaded >= spritesTotal) {
                    allSpritesReady = true;
                    if (onComplete) onComplete();
                }
            };
            img.src = `${ASSET_BASE}/${SPRITE_MANIFEST[key]}`;
        });
    }

    // Helper to draw a sprite if loaded, with fallback
    function drawSprite(key, x, y, w, h) {
        const img = sprites[key];
        if (img) {
            ctx.drawImage(img, x, y, w, h);
            return true;
        }
        return false;
    }

    function drawSpriteRotated(key, cx, cy, w, h, angle) {
        const img = sprites[key];
        if (!img) return false;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
        return true;
    }

    // ── Constants ──────────────────────────────────────────────
    const GAME_W = 480, GAME_H = 640;
    const LANE_L = 100, LANE_R = 380;
    const LANE_W = LANE_R - LANE_L;
    const GUTTER_W = 18;
    const FOUL_LINE_Y = 480;
    const PIN_START_Y = 80;
    const PIN_R = 8;
    const PIN_SPACING = 22;
    const BALL_R = 14;
    const BALL_FRICTION = 0.997;
    const PIN_FRICTION = 0.96;
    const PIN_COR = 0.7;
    const BALL_PIN_COR = 0.6;
    const PIN_MIN_SPEED = 0.15;
    const MAX_BALL_SPEED = 12;
    const HOOK_STRENGTH = 0.08;

    // Game states
    const ST_TITLE    = 0;
    const ST_POSITION = 1;
    const ST_AIM      = 2;
    const ST_POWER    = 3;
    const ST_ROLLING  = 4;
    const ST_SCORING  = 5;
    const ST_OVER     = 6;
    const ST_LOADING  = 7;

    // ── Module-level variables ──────────────────────────────────
    let canvas, ctx, W, H, scale;
    let state, gameActive;
    let animFrame = null;
    let audioCtx  = null;
    let player    = null;
    let onGameOver = null;

    // Theme colors (fallbacks)
    let BG_CLR     = '#1A1A2E';
    let ACCENT_CLR = '#F472B6';
    let LANE_CLR   = '#D4A868';
    let LANE_CLR2  = '#B8924A';

    // Ball state
    let ballX, ballY, ballVX, ballVY;
    let ballHook = 0;
    let ballRolling = false;
    let ballInGutter = false;
    let ballRotation = 0;

    // Pins
    let pins = [];

    // Scoring
    let frame = 1;
    let roll = 1;
    let scores = [];
    let totalScore = 0;
    let pinsDownThisFrame = 0;
    let pinsDownFirstRoll = 0;
    let score = 0;

    // Positioning
    let posX = LANE_L + LANE_W / 2;
    let aimAngle = 0;
    let powerLevel = 0;
    let powerDir = 1;
    let aimDir = 1;

    // Effects
    let particles = [];
    let messages = [];
    let debrisChunks = [];
    let celebrationTimer = 0;
    let celebrationType = '';
    let scoringTimer = 0;
    let strikeFlashAlpha = 0;

    // Input
    let keys = {};
    let mouseX = 0, mouseY = 0;

    // Pre-rendered canvases for pin and ball (built once sprites load)
    let pinCanvas = null;
    let ballCanvas = null;
    let lanePatternCanvas = null;
    let gutterPatternCanvas = null;

    //  PRE-RENDERED CACHED SPRITES

    function buildPinSprite() {
        const size = PIN_R * 6;
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const pc = c.getContext('2d');
        const cx = size / 2, cy = size / 2;
        const r = PIN_R * 2;

        // Outer shadow
        pc.fillStyle = 'rgba(0,0,0,0.18)';
        pc.beginPath();
        pc.arc(cx + 1.5, cy + 1.5, r + 1, 0, Math.PI * 2);
        pc.fill();

        // Main pin body - glossy white
        const bodyGrad = pc.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.1, cx, cy, r);
        bodyGrad.addColorStop(0, '#FFFFFF');
        bodyGrad.addColorStop(0.35, '#FAFAFA');
        bodyGrad.addColorStop(0.65, '#F0F0F0');
        bodyGrad.addColorStop(0.85, '#E0E0E0');
        bodyGrad.addColorStop(1, '#CCCCCC');
        pc.fillStyle = bodyGrad;
        pc.beginPath();
        pc.arc(cx, cy, r, 0, Math.PI * 2);
        pc.fill();

        // Red stripe band — top
        pc.save();
        pc.beginPath();
        pc.arc(cx, cy, r, 0, Math.PI * 2);
        pc.clip();
        const stripeGrad = pc.createLinearGradient(cx - r, cy - r * 0.55, cx + r, cy - r * 0.25);
        stripeGrad.addColorStop(0, '#DC2626');
        stripeGrad.addColorStop(0.3, '#EF4444');
        stripeGrad.addColorStop(0.7, '#DC2626');
        stripeGrad.addColorStop(1, '#B91C1C');
        pc.fillStyle = stripeGrad;
        pc.fillRect(cx - r, cy - r * 0.55, r * 2, r * 0.38);
        pc.restore();

        // Second red stripe — bottom thinner
        pc.save();
        pc.beginPath();
        pc.arc(cx, cy, r, 0, Math.PI * 2);
        pc.clip();
        const stripe2Grad = pc.createLinearGradient(cx - r, cy + r * 0.18, cx + r, cy + r * 0.42);
        stripe2Grad.addColorStop(0, '#DC2626');
        stripe2Grad.addColorStop(0.5, '#EF4444');
        stripe2Grad.addColorStop(1, '#B91C1C');
        pc.fillStyle = stripe2Grad;
        pc.fillRect(cx - r, cy + r * 0.18, r * 2, r * 0.22);
        pc.restore();

        // Glossy specular highlight
        const specGrad = pc.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx - r * 0.3, cy - r * 0.35, r * 0.55);
        specGrad.addColorStop(0, 'rgba(255,255,255,0.7)');
        specGrad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
        specGrad.addColorStop(1, 'rgba(255,255,255,0)');
        pc.fillStyle = specGrad;
        pc.beginPath();
        pc.arc(cx, cy, r, 0, Math.PI * 2);
        pc.fill();

        // Small secondary highlight
        pc.fillStyle = 'rgba(255,255,255,0.4)';
        pc.beginPath();
        pc.arc(cx - r * 0.2, cy - r * 0.3, r * 0.18, 0, Math.PI * 2);
        pc.fill();

        // Crisp outline
        pc.strokeStyle = 'rgba(0,0,0,0.12)';
        pc.lineWidth = 0.8;
        pc.beginPath();
        pc.arc(cx, cy, r, 0, Math.PI * 2);
        pc.stroke();

        // Inner edge glow
        const edgeGrad = pc.createRadialGradient(cx, cy, r * 0.85, cx, cy, r);
        edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
        edgeGrad.addColorStop(1, 'rgba(0,0,0,0.06)');
        pc.fillStyle = edgeGrad;
        pc.beginPath();
        pc.arc(cx, cy, r, 0, Math.PI * 2);
        pc.fill();

        pinCanvas = c;
    }

    function buildBallSprite() {
        const size = BALL_R * 5;
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const bc = c.getContext('2d');
        const cx = size / 2, cy = size / 2;
        const r = BALL_R * 2;

        // Drop shadow
        bc.fillStyle = 'rgba(0,0,0,0.3)';
        bc.beginPath();
        bc.arc(cx + 2, cy + 2, r + 0.5, 0, Math.PI * 2);
        bc.fill();

        // Rich gradient ball body - deep blue/purple
        const bodyGrad = bc.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx + r * 0.1, cy + r * 0.1, r * 1.1);
        bodyGrad.addColorStop(0, '#6D5FE8');
        bodyGrad.addColorStop(0.2, '#4A3FCC');
        bodyGrad.addColorStop(0.5, '#3020A8');
        bodyGrad.addColorStop(0.8, '#1A1070');
        bodyGrad.addColorStop(1, '#0E0840');
        bc.fillStyle = bodyGrad;
        bc.beginPath();
        bc.arc(cx, cy, r, 0, Math.PI * 2);
        bc.fill();

        // Marble swirl effect
        bc.save();
        bc.beginPath(); bc.arc(cx, cy, r, 0, Math.PI * 2); bc.clip();
        bc.globalAlpha = 0.12;
        for (let i = 0; i < 5; i++) {
            const sx = cx + Math.cos(i * 1.2) * r * 0.4, sy = cy + Math.sin(i * 1.2) * r * 0.3;
            const sg = bc.createRadialGradient(sx, sy, 0, sx, sy, r * 0.5);
            sg.addColorStop(0, '#8B7FF0'); sg.addColorStop(1, 'transparent');
            bc.fillStyle = sg; bc.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
        bc.globalAlpha = 1; bc.restore();

        // Finger holes with depth
        const holes = [
            { x: cx - r * 0.2, y: cy - r * 0.28, s: r * 0.16 },
            { x: cx + r * 0.2, y: cy - r * 0.28, s: r * 0.16 },
            { x: cx,           y: cy + r * 0.12,  s: r * 0.18 },
        ];
        for (const h of holes) {
            const hg = bc.createRadialGradient(h.x, h.y, h.s * 0.4, h.x, h.y, h.s * 1.3);
            hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(0.7, 'rgba(0,0,0,0.15)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
            bc.fillStyle = hg; bc.beginPath(); bc.arc(h.x, h.y, h.s * 1.3, 0, Math.PI * 2); bc.fill();
            const dg = bc.createRadialGradient(h.x - h.s * 0.15, h.y - h.s * 0.15, 0, h.x, h.y, h.s);
            dg.addColorStop(0, '#060320'); dg.addColorStop(0.6, '#0A0530'); dg.addColorStop(1, '#1A1060');
            bc.fillStyle = dg; bc.beginPath(); bc.arc(h.x, h.y, h.s, 0, Math.PI * 2); bc.fill();
            bc.strokeStyle = 'rgba(100,90,200,0.25)'; bc.lineWidth = 0.6;
            bc.beginPath(); bc.arc(h.x, h.y, h.s, 0, Math.PI * 2); bc.stroke();
        }

        // Specular highlights
        const sg = bc.createRadialGradient(cx - r * 0.32, cy - r * 0.38, 0, cx - r * 0.32, cy - r * 0.38, r * 0.5);
        sg.addColorStop(0, 'rgba(255,255,255,0.55)'); sg.addColorStop(0.4, 'rgba(255,255,255,0.18)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        bc.fillStyle = sg; bc.beginPath(); bc.arc(cx, cy, r, 0, Math.PI * 2); bc.fill();
        const s2 = bc.createRadialGradient(cx + r * 0.4, cy + r * 0.3, 0, cx + r * 0.4, cy + r * 0.3, r * 0.35);
        s2.addColorStop(0, 'rgba(255,255,255,0.12)'); s2.addColorStop(1, 'rgba(255,255,255,0)');
        bc.fillStyle = s2; bc.beginPath(); bc.arc(cx, cy, r, 0, Math.PI * 2); bc.fill();
        bc.strokeStyle = 'rgba(0,0,0,0.25)'; bc.lineWidth = 0.8;
        bc.beginPath(); bc.arc(cx, cy, r, 0, Math.PI * 2); bc.stroke();

        ballCanvas = c;
    }

    function buildLanePattern() {
        const pw = LANE_W;
        const ph = FOUL_LINE_Y;
        const c = document.createElement('canvas');
        c.width = pw; c.height = ph;
        const lc = c.getContext('2d');

        // Rich amber base (polished maple)
        const baseGrad = lc.createLinearGradient(0, 0, pw, 0);
        baseGrad.addColorStop(0, '#A07040');
        baseGrad.addColorStop(0.08, '#C89860');
        baseGrad.addColorStop(0.2, '#D4A868');
        baseGrad.addColorStop(0.5, '#DCBA78');
        baseGrad.addColorStop(0.8, '#D4A868');
        baseGrad.addColorStop(0.92, '#C89860');
        baseGrad.addColorStop(1, '#A07040');
        lc.fillStyle = baseGrad;
        lc.fillRect(0, 0, pw, ph);

        // Wood plank lines (vertical seams between boards)
        const boardW = pw / 39; // ~39 boards on a real lane
        lc.strokeStyle = 'rgba(120,80,30,0.12)';
        lc.lineWidth = 0.5;
        for (let lx = boardW; lx < pw; lx += boardW) {
            lc.beginPath(); lc.moveTo(lx, 0); lc.lineTo(lx, ph); lc.stroke();
        }

        // Subtle grain variation per board
        for (let bx = 0; bx < pw; bx += boardW) {
            const grainAlpha = 0.02 + ((bx * 7.3) % 3) * 0.008;
            lc.fillStyle = `rgba(80,50,15,${grainAlpha})`;
            lc.fillRect(bx, 0, boardW, ph);
        }

        // Tile wood sprites if available (very subtle)
        const woodKeys = ['woodPlank70', 'woodSquare', 'woodBlock1', 'woodBlock2', 'woodBlock3', 'woodBlock4'];
        const tileSize = 35;
        for (let ty = 0; ty < ph; ty += tileSize) {
            for (let tx = 0; tx < pw; tx += tileSize) {
                const key = woodKeys[(tx + ty * 7) % woodKeys.length];
                const img = sprites[key];
                if (img) {
                    lc.globalAlpha = 0.15;
                    lc.drawImage(img, tx, ty, tileSize, tileSize);
                }
            }
        }
        lc.globalAlpha = 1.0;

        // Polished reflection sheen (horizontal gloss band)
        const sheenGrad = lc.createLinearGradient(0, 0, 0, ph);
        sheenGrad.addColorStop(0, 'rgba(255,245,220,0.08)');
        sheenGrad.addColorStop(0.15, 'rgba(255,255,240,0.12)');
        sheenGrad.addColorStop(0.3, 'rgba(255,255,255,0.04)');
        sheenGrad.addColorStop(0.5, 'rgba(255,255,240,0)');
        sheenGrad.addColorStop(0.85, 'rgba(255,230,180,0.06)');
        sheenGrad.addColorStop(1, 'rgba(255,220,160,0.1)');
        lc.fillStyle = sheenGrad;
        lc.fillRect(0, 0, pw, ph);

        // Oil pattern zone (slightly darker in the "head" area, lighter in "backend")
        const oilGrad = lc.createLinearGradient(0, 0, 0, ph);
        oilGrad.addColorStop(0, 'rgba(0,0,0,0.04)');
        oilGrad.addColorStop(0.4, 'rgba(0,0,0,0.02)');
        oilGrad.addColorStop(0.65, 'rgba(0,0,0,0)');
        oilGrad.addColorStop(1, 'rgba(0,0,0,0)');
        lc.fillStyle = oilGrad;
        lc.fillRect(0, 0, pw, ph);

        lanePatternCanvas = c;
    }

    function buildGutterPattern() {
        const pw = GUTTER_W;
        const ph = FOUL_LINE_Y;
        const c = document.createElement('canvas');
        c.width = pw; c.height = ph;
        const gc = c.getContext('2d');

        // Brushed steel base
        const baseGrad = gc.createLinearGradient(0, 0, pw, 0);
        baseGrad.addColorStop(0, '#3A3A3E');
        baseGrad.addColorStop(0.15, '#55555A');
        baseGrad.addColorStop(0.35, '#6A6A70');
        baseGrad.addColorStop(0.5, '#757580');
        baseGrad.addColorStop(0.65, '#6A6A70');
        baseGrad.addColorStop(0.85, '#55555A');
        baseGrad.addColorStop(1, '#3A3A3E');
        gc.fillStyle = baseGrad;
        gc.fillRect(0, 0, pw, ph);

        // Tile metal sprites (very subtle)
        const metalKeys = ['metalSquare', 'metalBlock1', 'metalBlock2', 'metalBlock3'];
        const tileH = 18;
        for (let ty = 0; ty < ph; ty += tileH) {
            const key = metalKeys[(ty / tileH | 0) % metalKeys.length];
            const img = sprites[key];
            if (img) { gc.globalAlpha = 0.2; gc.drawImage(img, 0, ty, pw, tileH); }
        }
        gc.globalAlpha = 1.0;

        // Brushed metal horizontal lines
        gc.strokeStyle = 'rgba(200,200,210,0.04)';
        gc.lineWidth = 0.5;
        for (let ly = 0; ly < ph; ly += 2) {
            gc.beginPath(); gc.moveTo(0, ly); gc.lineTo(pw, ly); gc.stroke();
        }

        // Center groove (concave depression)
        const grooveGrad = gc.createLinearGradient(pw * 0.3, 0, pw * 0.7, 0);
        grooveGrad.addColorStop(0, 'rgba(0,0,0,0.15)');
        grooveGrad.addColorStop(0.3, 'rgba(0,0,0,0.06)');
        grooveGrad.addColorStop(0.5, 'rgba(200,200,210,0.08)');
        grooveGrad.addColorStop(0.7, 'rgba(0,0,0,0.06)');
        grooveGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
        gc.fillStyle = grooveGrad;
        gc.fillRect(0, 0, pw, ph);

        // Lip edges (raised metal rim)
        gc.fillStyle = 'rgba(160,160,170,0.2)';
        gc.fillRect(0, 0, 1, ph);
        gc.fillRect(pw - 1, 0, 1, ph);

        gutterPatternCanvas = c;
    }

    function buildCachedSprites() {
        buildPinSprite();
        buildBallSprite();
        buildLanePattern();
        buildGutterPattern();
    }

    //  AUDIO

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

    function playBallRoll()  { noise(0.6, 0.04, 200); }
    function playPinCrash() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        noise(0.25, 0.12, 800);
        tone(200, 0.08, 'triangle', 0.08, t);
        tone(150, 0.1, 'sine', 0.06, t + 0.05);
    }
    function playGutter() {
        tone(120, 0.25, 'sine', 0.08);
        noise(0.15, 0.04, 200);
    }
    function playStrike() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        noise(0.3, 0.15, 1000);
        [523, 659, 784, 1047].forEach((f, i) => {
            tone(f, 0.2, 'sine', 0.12, t + 0.2 + i * 0.1);
        });
    }
    function playSpare() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        tone(523, 0.15, 'sine', 0.10, t);
        tone(659, 0.15, 'sine', 0.10, t + 0.12);
        tone(784, 0.2, 'sine', 0.10, t + 0.24);
    }

    //  PARTICLE & DEBRIS SYSTEM

    function spawnBurst(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 4 + 1;
            particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 1.0,
                decay: Math.random() * 0.025 + 0.012,
                r: Math.random() * 3.5 + 1,
                color: color || '#FFD700',
            });
        }
    }

    function spawnConfetti(x, y, count) {
        const colors = ['#F43F5E', '#FBBF24', '#34D399', '#3B82F6', '#A855F7', '#F472B6'];
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 5 + 2;
            particles.push({
                x: x + (Math.random() - 0.5) * 100,
                y: y + (Math.random() - 0.5) * 40,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s - 3,
                life: 1.0,
                decay: Math.random() * 0.012 + 0.006,
                r: Math.random() * 4 + 2,
                color: colors[Math.floor(Math.random() * colors.length)],
            });
        }
    }

    function spawnDebris(x, y, count) {
        const debrisKeys = ['debrisWood1', 'debrisWood2', 'debrisWood3', 'debrisStone1', 'debrisStone2'];
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 3 + 1.5;
            debrisChunks.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s - 1,
                life: 1.0,
                decay: Math.random() * 0.015 + 0.008,
                size: Math.random() * 10 + 6,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.15,
                spriteKey: debrisKeys[Math.floor(Math.random() * debrisKeys.length)],
            });
        }
    }

    function spawnStrikeExplosion(x, y) {
        strikeFlashAlpha = 1.0;
        spawnConfetti(x, y, 60);
        spawnDebris(x, y, 8);
        spawnBurst(x, y, 20, '#FFD700');
        spawnBurst(x, y, 15, '#FF6B00');
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x  += p.vx;
            p.y  += p.vy;
            p.vy += 0.06;
            p.vx *= 0.98;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = debrisChunks.length - 1; i >= 0; i--) {
            const d = debrisChunks[i];
            d.x += d.vx;
            d.y += d.vy;
            d.vy += 0.08;
            d.vx *= 0.97;
            d.rotation += d.rotSpeed;
            d.life -= d.decay;
            if (d.life <= 0) debrisChunks.splice(i, 1);
        }
        if (strikeFlashAlpha > 0) strikeFlashAlpha -= 0.03;
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        for (const d of debrisChunks) {
            ctx.globalAlpha = d.life;
            if (!drawSpriteRotated(d.spriteKey, d.x, d.y, d.size, d.size, d.rotation)) {
                ctx.fillStyle = '#8B6914';
                ctx.fillRect(d.x - d.size / 2, d.y - d.size / 2, d.size, d.size);
            }
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
            m.y -= 0.6;
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
            // Text shadow for readability
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillText(m.text, m.x + 1, m.y + 1);
            ctx.fillStyle = m.color;
            ctx.shadowColor = m.color;
            ctx.shadowBlur = 12;
            ctx.fillText(m.text, m.x, m.y);
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
    }

    //  PIN SETUP

    function setupPins() {
        pins = [];
        const centerX = LANE_L + LANE_W / 2;
        let pinNum = 0;
        for (let row = 0; row < 4; row++) {
            const count = row + 1;
            const rowY = PIN_START_Y + row * PIN_SPACING;
            const startX = centerX - (count - 1) * PIN_SPACING * 0.5;
            for (let col = 0; col < count; col++) {
                const px = startX + col * PIN_SPACING;
                pins.push({
                    x: px, y: rowY,
                    vx: 0, vy: 0,
                    standing: true,
                    origX: px, origY: rowY,
                    id: pinNum++,
                    wobble: 0,
                    wobbleSpeed: 0,
                });
            }
        }
    }

    function resetStandingPins() {
        for (const p of pins) {
            if (p.standing) {
                p.x = p.origX;
                p.y = p.origY;
                p.vx = 0;
                p.vy = 0;
                p.wobble = 0;
                p.wobbleSpeed = 0;
            }
        }
    }

    function countStandingPins() {
        return pins.filter(p => p.standing).length;
    }

    //  PHYSICS

    function updateBallPhysics() {
        if (!ballRolling) return;

        // Apply hook/curve
        if (ballHook !== 0 && !ballInGutter) {
            ballVX += ballHook * HOOK_STRENGTH;
        }

        ballX += ballVX;
        ballY += ballVY;

        // Rotation for visual spin
        const spd = Math.sqrt(ballVX * ballVX + ballVY * ballVY);
        ballRotation += spd * 0.05 + ballHook * 0.1;

        // Friction
        if (spd > 0.1) {
            ballVX *= BALL_FRICTION;
            ballVY *= BALL_FRICTION;
        }

        // Gutter detection
        if (!ballInGutter) {
            if (ballX - BALL_R < LANE_L) {
                ballInGutter = true;
                ballVX = 0;
                ballX = LANE_L - GUTTER_W / 2;
                playGutter();
                addMessage('GUTTER!', GAME_W / 2, GAME_H / 2, '#F43F5E', 28);
            }
            if (ballX + BALL_R > LANE_R) {
                ballInGutter = true;
                ballVX = 0;
                ballX = LANE_R + GUTTER_W / 2;
                playGutter();
                addMessage('GUTTER!', GAME_W / 2, GAME_H / 2, '#F43F5E', 28);
            }
        }

        // Ball-pin collisions
        if (!ballInGutter) {
            for (const p of pins) {
                if (!p.standing) continue;
                const dx = p.x - ballX;
                const dy = p.y - ballY;
                const d = Math.sqrt(dx * dx + dy * dy);
                const minD = BALL_R + PIN_R;
                if (d < minD && d > 0.1) {
                    const nx = dx / d;
                    const ny = dy / d;
                    const overlap = minD - d;
                    p.x += nx * overlap;
                    p.y += ny * overlap;

                    const relVX = ballVX - p.vx;
                    const relVY = ballVY - p.vy;
                    const relDotN = relVX * nx + relVY * ny;

                    if (relDotN > 0) {
                        const massRatio = 0.25;
                        const impulse = relDotN * (1 + BALL_PIN_COR);

                        ballVX -= impulse * nx * massRatio;
                        ballVY -= impulse * ny * massRatio;
                        p.vx += impulse * nx * (1 - massRatio);
                        p.vy += impulse * ny * (1 - massRatio);
                        p.vx += ballHook * 0.5;

                        // Trigger wobble on hit
                        p.wobbleSpeed = (Math.random() - 0.5) * 0.3;

                        playPinCrash();
                    }
                }
            }
        }

        // Pin-pin collisions
        for (let i = 0; i < pins.length; i++) {
            for (let j = i + 1; j < pins.length; j++) {
                const a = pins[i];
                const b = pins[j];
                if (!a.standing && !b.standing) continue;
                const aMoving = Math.abs(a.vx) + Math.abs(a.vy) > 0.1;
                const bMoving = Math.abs(b.vx) + Math.abs(b.vy) > 0.1;
                if (!aMoving && !bMoving) continue;

                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                const minD = PIN_R * 2;

                if (d < minD && d > 0.1) {
                    const nx = dx / d;
                    const ny = dy / d;
                    const overlap = minD - d;
                    a.x -= nx * overlap * 0.5;
                    a.y -= ny * overlap * 0.5;
                    b.x += nx * overlap * 0.5;
                    b.y += ny * overlap * 0.5;

                    const dvx = a.vx - b.vx;
                    const dvy = a.vy - b.vy;
                    const dvDotN = dvx * nx + dvy * ny;

                    if (dvDotN > 0) {
                        const impulse = dvDotN * PIN_COR;
                        a.vx -= impulse * nx * 0.5;
                        a.vy -= impulse * ny * 0.5;
                        b.vx += impulse * nx * 0.5;
                        b.vy += impulse * ny * 0.5;
                    }
                }
            }
        }

        // Update pin positions and knockdown detection
        for (const p of pins) {
            if (!p.standing) continue;
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= PIN_FRICTION;
            p.vy *= PIN_FRICTION;

            // Wobble animation
            p.wobble += p.wobbleSpeed;
            p.wobbleSpeed *= 0.92;

            const distFromOrig = Math.sqrt((p.x - p.origX) ** 2 + (p.y - p.origY) ** 2);
            if (distFromOrig > PIN_R * 1.5 ||
                p.x < LANE_L - 10 || p.x > LANE_R + 10 ||
                p.y < PIN_START_Y - 40 || p.y > PIN_START_Y + 100) {
                p.standing = false;
                spawnBurst(p.x, p.y, 8, '#FFF');
                spawnDebris(p.x, p.y, 2);
            }

            if (Math.abs(p.vx) < PIN_MIN_SPEED) p.vx = 0;
            if (Math.abs(p.vy) < PIN_MIN_SPEED) p.vy = 0;
        }

        // Check if ball has passed pins
        if (ballY < PIN_START_Y - 50) {
            ballRolling = false;
        }

        // Check if ball stopped on lane
        if (spd < 0.3 && ballY < FOUL_LINE_Y) {
            ballRolling = false;
        }
    }

    function allPinsStopped() {
        for (const p of pins) {
            if (p.standing && (Math.abs(p.vx) > PIN_MIN_SPEED || Math.abs(p.vy) > PIN_MIN_SPEED)) {
                return false;
            }
        }
        return true;
    }

    //  SCORING (full 10-frame bowling rules)

    function initScoring() {
        scores = [];
        for (let i = 0; i < 10; i++) {
            scores.push({ rolls: [], score: null, display: '', cumulative: null });
        }
        totalScore = 0;
        frame = 1;
        roll = 1;
        pinsDownThisFrame = 0;
        pinsDownFirstRoll = 0;
    }

    function recordRoll() {
        const standing = countStandingPins();
        const knocked = (roll === 1) ? (10 - standing) : (10 - pinsDownFirstRoll - standing);
        const fi = frame - 1;

        scores[fi].rolls.push(knocked);

        if (frame < 10) {
            if (roll === 1 && standing === 0) {
                // Strike
                scores[fi].display = 'X';
                celebrationType = 'strike';
                celebrationTimer = Date.now() + 2000;
                playStrike();
                spawnStrikeExplosion(GAME_W / 2, GAME_H * 0.3);
                addMessage('STRIKE!', GAME_W / 2, GAME_H * 0.35, '#FFD700', 36);
                nextFrame();
            } else if (roll === 2) {
                if (standing === 0) {
                    scores[fi].display = '/';
                    celebrationType = 'spare';
                    celebrationTimer = Date.now() + 1500;
                    playSpare();
                    spawnConfetti(GAME_W / 2, GAME_H * 0.3, 30);
                    addMessage('SPARE!', GAME_W / 2, GAME_H * 0.35, '#34D399', 30);
                }
                nextFrame();
            } else {
                pinsDownFirstRoll = knocked;
                pinsDownThisFrame = knocked;
                roll = 2;
                resetStandingPins();
                startPositioning();
            }
        } else {
            handle10thFrame(knocked, standing);
        }

        calculateScores();
    }

    function handle10thFrame(knocked, standing) {
        const fi = 9;
        const rollNum = scores[fi].rolls.length;

        if (rollNum === 1) {
            if (standing === 0) {
                scores[fi].display = 'X';
                celebrationType = 'strike';
                celebrationTimer = Date.now() + 1500;
                playStrike();
                spawnStrikeExplosion(GAME_W / 2, GAME_H * 0.3);
                addMessage('STRIKE!', GAME_W / 2, GAME_H * 0.35, '#FFD700', 32);
                setupPins();
                roll = 2;
                startPositioning();
            } else {
                pinsDownFirstRoll = knocked;
                roll = 2;
                resetStandingPins();
                startPositioning();
            }
        } else if (rollNum === 2) {
            const firstWasStrike = scores[fi].rolls[0] === 10;
            if (firstWasStrike) {
                if (standing === 0) {
                    scores[fi].display += 'X';
                    playStrike();
                    spawnConfetti(GAME_W / 2, GAME_H * 0.3, 30);
                    setupPins();
                }
                roll = 3;
                if (standing === 0) setupPins();
                startPositioning();
            } else {
                if (standing === 0) {
                    scores[fi].display = scores[fi].rolls[0] + '/';
                    celebrationType = 'spare';
                    celebrationTimer = Date.now() + 1200;
                    playSpare();
                    addMessage('SPARE!', GAME_W / 2, GAME_H * 0.35, '#34D399', 28);
                    setupPins();
                    roll = 3;
                    startPositioning();
                } else {
                    endGame();
                }
            }
        } else if (rollNum === 3) {
            endGame();
        }
    }

    function nextFrame() {
        frame++;
        roll = 1;
        pinsDownThisFrame = 0;
        pinsDownFirstRoll = 0;

        if (frame > 10) {
            endGame();
            return;
        }

        setupPins();
        startPositioning();
    }

    function calculateScores() {
        let running = 0;
        for (let i = 0; i < 10; i++) {
            const s = scores[i];
            if (s.rolls.length === 0) break;

            if (i < 9) {
                if (s.rolls[0] === 10) {
                    const next2 = getNextRolls(i, 2);
                    if (next2 !== null) {
                        s.score = 10 + next2;
                        running += s.score;
                        s.cumulative = running;
                    }
                } else if (s.rolls.length >= 2 && s.rolls[0] + s.rolls[1] === 10) {
                    const next1 = getNextRolls(i, 1);
                    if (next1 !== null) {
                        s.score = 10 + next1;
                        running += s.score;
                        s.cumulative = running;
                    }
                } else if (s.rolls.length >= 2) {
                    s.score = s.rolls[0] + s.rolls[1];
                    running += s.score;
                    s.cumulative = running;
                }
            } else {
                let sum = 0;
                for (const r of s.rolls) sum += r;
                const neededRolls = (s.rolls[0] === 10 || (s.rolls.length >= 2 && s.rolls[0] + s.rolls[1] === 10)) ? 3 : 2;
                if (s.rolls.length >= neededRolls) {
                    s.score = sum;
                    running += s.score;
                    s.cumulative = running;
                }
            }
        }
        totalScore = running;
        score = totalScore;
    }

    function getNextRolls(frameIdx, count) {
        let rolls = [];
        for (let i = frameIdx + 1; i < 10 && rolls.length < count; i++) {
            for (const r of scores[i].rolls) {
                rolls.push(r);
                if (rolls.length >= count) break;
            }
        }
        return rolls.length >= count ? rolls.reduce((a, b) => a + b, 0) : null;
    }

    function endGame() {
        calculateScores();
        state = ST_OVER;
        gameActive = false;

        if (totalScore >= 200) {
            spawnConfetti(GAME_W / 2, GAME_H / 2, 60);
        }
        if (totalScore === 300) {
            spawnStrikeExplosion(GAME_W / 2, GAME_H * 0.4);
        }

        setTimeout(() => {
            if (onGameOver) {
                onGameOver({
                    score: totalScore,
                    level: Math.floor(totalScore / 30),
                    duration: Math.floor((Date.now() - startTime) / 1000),
                    totalPopped: 0,
                    maxCombo: totalScore
                });
            }
        }, 2000);
    }

    let startTime = 0;

    //  STATE TRANSITIONS

    function startPositioning() {
        posX = LANE_L + LANE_W / 2;
        aimAngle = 0;
        powerLevel = 0;
        powerDir = 1;
        ballHook = 0;
        ballInGutter = false;
        ballRotation = 0;
        state = ST_POSITION;
    }

    function launchBall() {
        ballX = posX;
        ballY = FOUL_LINE_Y + BALL_R + 10;
        const speed = MAX_BALL_SPEED * (0.4 + powerLevel * 0.6);
        ballVX = Math.sin(aimAngle) * speed;
        ballVY = -Math.cos(aimAngle) * speed;
        ballRolling = true;
        ballInGutter = false;
        ballHook = 0;
        ballRotation = 0;
        state = ST_ROLLING;
        playBallRoll();
    }

    //  DRAWING — LANE WITH KENNEY SPRITES

    function drawBackground() {
        // Tiled background using Kenney backgrounds
        const bgImg = sprites['bgBlueLand'] || sprites['bgLand'];
        if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, GAME_W, GAME_H);
            // Darken for contrast
            ctx.fillStyle = 'rgba(10,10,30,0.7)';
            ctx.fillRect(0, 0, GAME_W, GAME_H);
        } else {
            ctx.fillStyle = BG_CLR;
            ctx.fillRect(0, 0, GAME_W, GAME_H);
        }
    }

    function drawAlleyEnvironment() {
        const wallW = LANE_L - GUTTER_W - 2;
        const stoneImg = sprites['stoneSquare'];
        if (stoneImg) {
            ctx.globalAlpha = 0.5;
            for (let sy = 0; sy < FOUL_LINE_Y; sy += 25) {
                ctx.drawImage(stoneImg, 0, sy, wallW, 25);
                ctx.drawImage(stoneImg, LANE_R + GUTTER_W + 2, sy, GAME_W - LANE_R - GUTTER_W - 2, 25);
            }
            ctx.globalAlpha = 1.0;
        }
        ctx.fillStyle = 'rgba(15,15,30,0.55)';
        ctx.fillRect(0, 0, LANE_L - GUTTER_W, FOUL_LINE_Y);
        ctx.fillRect(LANE_R + GUTTER_W, 0, GAME_W - LANE_R - GUTTER_W, FOUL_LINE_Y);
    }

    function drawLane() {
        drawBackground();
        drawAlleyEnvironment();

        // Approach area (polished darker wood behind foul line)
        const approachGrad = ctx.createLinearGradient(LANE_L - GUTTER_W, 0, LANE_R + GUTTER_W, 0);
        approachGrad.addColorStop(0, '#6B4E30');
        approachGrad.addColorStop(0.1, '#8B6840');
        approachGrad.addColorStop(0.5, '#9B7848');
        approachGrad.addColorStop(0.9, '#8B6840');
        approachGrad.addColorStop(1, '#6B4E30');
        ctx.fillStyle = approachGrad;
        ctx.fillRect(LANE_L - GUTTER_W, FOUL_LINE_Y, LANE_W + GUTTER_W * 2, GAME_H - FOUL_LINE_Y);
        // Approach wood sprites (subtle)
        const woodSq = sprites['woodSquare'];
        if (woodSq) {
            ctx.globalAlpha = 0.2;
            for (let ty = FOUL_LINE_Y; ty < GAME_H; ty += 30)
                for (let tx = LANE_L - GUTTER_W; tx < LANE_R + GUTTER_W; tx += 30)
                    ctx.drawImage(woodSq, tx, ty, 30, 30);
            ctx.globalAlpha = 1.0;
        }

        // Gutters (brushed metal)
        if (gutterPatternCanvas) {
            ctx.drawImage(gutterPatternCanvas, LANE_L - GUTTER_W, 0);
            ctx.drawImage(gutterPatternCanvas, LANE_R, 0);
        } else {
            const gg = ctx.createLinearGradient(LANE_L - GUTTER_W, 0, LANE_L, 0);
            gg.addColorStop(0, '#3A3A3E'); gg.addColorStop(0.3, '#60606A');
            gg.addColorStop(0.5, '#75757F'); gg.addColorStop(0.7, '#60606A'); gg.addColorStop(1, '#3A3A3E');
            ctx.fillStyle = gg;
            ctx.fillRect(LANE_L - GUTTER_W, 0, GUTTER_W, FOUL_LINE_Y);
            ctx.fillRect(LANE_R, 0, GUTTER_W, FOUL_LINE_Y);
        }
        // Gutter edge shadows
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(LANE_L - GUTTER_W, 0, 1, FOUL_LINE_Y);
        ctx.fillRect(LANE_R + GUTTER_W - 1, 0, 1, FOUL_LINE_Y);
        // Gutter-lane transition highlight
        ctx.fillStyle = 'rgba(200,200,210,0.12)';
        ctx.fillRect(LANE_L - 1, 0, 1, FOUL_LINE_Y);
        ctx.fillRect(LANE_R, 0, 1, FOUL_LINE_Y);

        // Lane surface (polished maple)
        if (lanePatternCanvas) { ctx.drawImage(lanePatternCanvas, LANE_L, 0); }
        else {
            const lg = ctx.createLinearGradient(LANE_L, 0, LANE_R, 0);
            lg.addColorStop(0, '#A07040'); lg.addColorStop(0.08, '#C89860');
            lg.addColorStop(0.2, '#D4A868'); lg.addColorStop(0.5, '#DCBA78');
            lg.addColorStop(0.8, '#D4A868'); lg.addColorStop(0.92, '#C89860');
            lg.addColorStop(1, '#A07040');
            ctx.fillStyle = lg; ctx.fillRect(LANE_L, 0, LANE_W, FOUL_LINE_Y);
        }

        // Wax sheen (polished reflection)
        const wg = ctx.createLinearGradient(0, 0, 0, FOUL_LINE_Y);
        wg.addColorStop(0, 'rgba(255,245,220,0.07)');
        wg.addColorStop(0.15, 'rgba(255,255,240,0.1)');
        wg.addColorStop(0.35, 'rgba(255,255,255,0.03)');
        wg.addColorStop(0.55, 'rgba(255,255,240,0)');
        wg.addColorStop(0.85, 'rgba(255,230,180,0.05)');
        wg.addColorStop(1, 'rgba(255,220,160,0.08)');
        ctx.fillStyle = wg; ctx.fillRect(LANE_L, 0, LANE_W, FOUL_LINE_Y);

        // Lane arrows and dots
        const arrowSpacing = LANE_W / 8;
        ctx.fillStyle = 'rgba(120,60,15,0.25)';
        for (let i = 1; i <= 7; i++) drawArrow(LANE_L + i * arrowSpacing, 300, 6);
        ctx.fillStyle = 'rgba(120,60,15,0.2)';
        for (let i = 1; i <= 7; i++) {
            const dx = LANE_L + i * arrowSpacing;
            for (const dy of [380, 420]) { ctx.beginPath(); ctx.arc(dx, dy, 2.5, 0, Math.PI * 2); ctx.fill(); }
        }

        // Foul line (polished chrome strip)
        const fg = ctx.createLinearGradient(0, FOUL_LINE_Y - 3, 0, FOUL_LINE_Y + 3);
        fg.addColorStop(0, '#444'); fg.addColorStop(0.2, '#888');
        fg.addColorStop(0.4, '#BBB'); fg.addColorStop(0.5, '#DDD');
        fg.addColorStop(0.6, '#BBB'); fg.addColorStop(0.8, '#888');
        fg.addColorStop(1, '#444');
        ctx.fillStyle = fg; ctx.fillRect(LANE_L - GUTTER_W, FOUL_LINE_Y - 3, LANE_W + GUTTER_W * 2, 6);

        // Lane edge rails (thin chrome)
        const rg = ctx.createLinearGradient(LANE_L - 2, 0, LANE_L + 2, 0);
        rg.addColorStop(0, '#333'); rg.addColorStop(0.3, '#777');
        rg.addColorStop(0.5, '#AAA'); rg.addColorStop(0.7, '#777'); rg.addColorStop(1, '#333');
        ctx.fillStyle = rg;
        ctx.fillRect(LANE_L - 1, 0, 2, FOUL_LINE_Y);
        ctx.fillRect(LANE_R - 1, 0, 2, FOUL_LINE_Y);

        // Pin deck (lighter wood area)
        const deckGrad = ctx.createRadialGradient(LANE_L + LANE_W / 2, PIN_START_Y + 15, 10, LANE_L + LANE_W / 2, PIN_START_Y + 15, 60);
        deckGrad.addColorStop(0, 'rgba(220,180,130,0.15)');
        deckGrad.addColorStop(1, 'rgba(200,160,110,0.05)');
        ctx.fillStyle = deckGrad;
        ctx.fillRect(LANE_L, PIN_START_Y - 25, LANE_W, 80);
        // Pin spots
        ctx.fillStyle = 'rgba(120,60,15,0.12)';
        const centerX = LANE_L + LANE_W / 2;
        for (let row = 0; row < 4; row++) {
            const count = row + 1, rowY = PIN_START_Y + row * PIN_SPACING;
            const sx = centerX - (count - 1) * PIN_SPACING * 0.5;
            for (let col = 0; col < count; col++) { ctx.beginPath(); ctx.arc(sx + col * PIN_SPACING, rowY, 3, 0, Math.PI * 2); ctx.fill(); }
        }
    }

    function drawArrow(x, y, size) {
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size * 0.6, y + size * 0.3);
        ctx.lineTo(x + size * 0.2, y + size * 0.3);
        ctx.lineTo(x + size * 0.2, y + size);
        ctx.lineTo(x - size * 0.2, y + size);
        ctx.lineTo(x - size * 0.2, y + size * 0.3);
        ctx.lineTo(x - size * 0.6, y + size * 0.3);
        ctx.closePath();
        ctx.fill();
    }

    //  DRAWING — PINS (cached sprite)

    function drawPin(p) {
        if (!p.standing) return;

        const drawR = PIN_R * 2;
        const spriteSize = PIN_R * 6;

        if (pinCanvas) {
            ctx.save();
            ctx.translate(p.x, p.y);
            // Apply wobble rotation
            if (Math.abs(p.wobble) > 0.001) {
                ctx.rotate(p.wobble);
            }
            ctx.drawImage(pinCanvas, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
            ctx.restore();
        } else {
            // Fallback procedural pin
            ctx.fillStyle = '#F0F0F0';
            ctx.beginPath(); ctx.arc(p.x, p.y, PIN_R, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#DC2626';
            ctx.beginPath(); ctx.arc(p.x, p.y, PIN_R * 0.5, 0, Math.PI * 2); ctx.fill();
        }
    }

    //  DRAWING — BALL (cached sprite + rotation)

    function drawBall() {
        if (state === ST_ROLLING || state === ST_POSITION || state === ST_AIM || state === ST_POWER) {
            const bx = (state === ST_ROLLING) ? ballX : posX;
            const by = (state === ST_ROLLING) ? ballY : FOUL_LINE_Y + BALL_R + 20;
            const spriteSize = BALL_R * 5;

            if (ballCanvas) {
                ctx.save();
                ctx.translate(bx, by);
                if (state === ST_ROLLING) {
                    ctx.rotate(ballRotation);
                }
                ctx.drawImage(ballCanvas, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
                ctx.restore();
            } else {
                // Fallback procedural ball
                ctx.fillStyle = '#2020A0';
                ctx.beginPath(); ctx.arc(bx, by, BALL_R, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                ctx.beginPath(); ctx.arc(bx - 3, by - 4, 2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(bx + 3, by - 4, 2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(bx, by + 2, 2, 0, Math.PI * 2); ctx.fill();
            }
        }
    }

    //  DRAWING — UI INDICATORS

    function drawAimIndicator() {
        if (state !== ST_AIM) return;
        const bx = posX, by = FOUL_LINE_Y + BALL_R + 20;
        const endX = bx + Math.sin(aimAngle) * 100, endY = by - Math.cos(aimAngle) * 100;
        ctx.strokeStyle = 'rgba(255,200,80,0.2)'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(endX, endY); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(endX, endY); ctx.stroke(); ctx.setLineDash([]);
        if (!drawSprite('flagYellow', endX - 5, endY - 10, 10, 15)) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(endX, endY, 4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.fillText('AIM - Tap to set', GAME_W / 2, FOUL_LINE_Y + 55);
    }

    function drawPowerMeter() {
        if (state !== ST_POWER) return;
        const mH = 200, mW = 20, mX = GAME_W - 50, mY = GAME_H / 2 - 100;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.roundRect(mX - 3, mY - 3, mW + 6, mH + 6, 6); ctx.fill();
        const fillH = mH * powerLevel;
        const gr = ctx.createLinearGradient(0, mY + mH, 0, mY);
        gr.addColorStop(0, '#34D399'); gr.addColorStop(0.5, '#FBBF24'); gr.addColorStop(1, '#F43F5E');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(mX, mY + mH - fillH, mW, fillH, 4); ctx.fill();
        const mkY = mY + mH - fillH;
        if (!drawSprite('coinGold', mX - 8, mkY - 8, 16, 16)) {
            ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.moveTo(mX - 5, mkY); ctx.lineTo(mX, mkY - 4); ctx.lineTo(mX, mkY + 4); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '11px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('POWER', mX + mW / 2, mY + mH + 18); ctx.fillText('Tap to throw', mX + mW / 2, mY + mH + 32);
    }

    function drawPositionIndicator() {
        if (state !== ST_POSITION) return;
        const by = FOUL_LINE_Y + BALL_R + 20;
        ctx.strokeStyle = 'rgba(255,200,100,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(posX, by); ctx.lineTo(posX, 0); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,200,100,0.3)';
        ctx.beginPath(); ctx.moveTo(posX - 30, by + 25); ctx.lineTo(posX - 20, by + 20); ctx.lineTo(posX - 20, by + 30); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(posX + 30, by + 25); ctx.lineTo(posX + 20, by + 20); ctx.lineTo(posX + 20, by + 30); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.fillText('POSITION - Left/Right or Tap', GAME_W / 2, FOUL_LINE_Y + 55);
    }

    function drawHookIndicator() {
        if (state !== ST_ROLLING || ballInGutter || !ballRolling) return;

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '11px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('< Left / Right > for Hook', GAME_W / 2, GAME_H - 30);
    }

    function drawStrikeFlash() {
        if (strikeFlashAlpha > 0) {
            ctx.fillStyle = `rgba(255,200,50,${strikeFlashAlpha * 0.15})`;
            ctx.fillRect(0, 0, GAME_W, GAME_H);
        }
    }

    //  DRAWING — SCORECARD

    function drawScoreCard() {
        const cardY = FOUL_LINE_Y + 70, cellW = 40, cellH = 42;
        const startX = (GAME_W - cellW * 10) / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.roundRect(startX - 8, cardY - 8, cellW * 10 + 16, cellH + 34, 8); ctx.fill();
        ctx.strokeStyle = 'rgba(255,215,0,0.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(startX - 8, cardY - 8, cellW * 10 + 16, cellH + 34, 8); ctx.stroke();
        for (let i = 0; i < 10; i++) {
            const cx = startX + i * cellW, s = scores[i], isCur = i === frame - 1 && state !== ST_OVER;
            if (isCur) { ctx.fillStyle = 'rgba(255,215,0,0.08)'; ctx.fillRect(cx + 1, cardY + 1, cellW - 2, cellH - 2); }
            ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.strokeRect(cx, cardY, cellW, cellH);
            ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '9px "Segoe UI", system-ui, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText((i + 1).toString(), cx + cellW / 2, cardY + 2);
            ctx.font = '12px "Segoe UI", system-ui, sans-serif';
            if (s.rolls.length > 0) {
                const r1 = s.rolls[0] === 10 ? 'X' : s.rolls[0].toString();
                ctx.fillStyle = s.rolls[0] === 10 ? '#FFD700' : '#FFF'; ctx.fillText(r1, cx + cellW * 0.3, cardY + 16);
                if (s.rolls.length > 1) {
                    let r2 = i < 9 ? ((s.rolls[0] + s.rolls[1] === 10) ? '/' : s.rolls[1].toString())
                        : (s.rolls[1] === 10 ? 'X' : (s.rolls[0] !== 10 && s.rolls[0] + s.rolls[1] === 10) ? '/' : s.rolls[1].toString());
                    ctx.fillStyle = (r2 === '/' || r2 === 'X') ? '#34D399' : '#FFF'; ctx.fillText(r2, cx + cellW * 0.7, cardY + 16);
                }
                if (i === 9 && s.rolls.length > 2) { ctx.fillStyle = '#FFF'; ctx.fillText(s.rolls[2] === 10 ? 'X' : s.rolls[2].toString(), cx + cellW * 0.5, cardY + 26); }
            }
            if (s.cumulative !== null) {
                ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = '#FFD700';
                ctx.textBaseline = 'bottom'; ctx.fillText(s.cumulative.toString(), cx + cellW / 2, cardY + cellH - 2); ctx.textBaseline = 'top';
            }
            if (isCur) { ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2; ctx.strokeRect(cx + 1, cardY + 1, cellW - 2, cellH - 2); }
        }
        ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = '#FFD700'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const tt = 'Total: ' + totalScore, tw = ctx.measureText(tt).width;
        drawSprite('starGold', GAME_W / 2 - tw / 2 - 18, cardY + cellH + 4, 14, 14);
        drawSprite('starGold', GAME_W / 2 + tw / 2 + 4, cardY + cellH + 4, 14, 14);
        ctx.fillText(tt, GAME_W / 2, cardY + cellH + 6);
    }

    function drawHUD() {
        ctx.save();
        ctx.textBaseline = 'top';
        ctx.font = '12px "Segoe UI", system-ui, sans-serif';

        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        const pName = (player?.emoji || '') + ' ' + (player?.name || 'Player');
        ctx.fillText(pName.trim(), 6, FOUL_LINE_Y + 55);

        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        if (state !== ST_TITLE && state !== ST_OVER && state !== ST_LOADING) {
            ctx.fillText(`Frame ${frame} / Roll ${roll}`, GAME_W - 6, FOUL_LINE_Y + 55);
        }

        ctx.restore();
    }

    //  DRAWING — TITLE & GAME OVER SCREENS

    function drawLoadingScreen() {
        ctx.fillStyle = BG_CLR;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 24px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('LOADING SPRITES...', GAME_W / 2, GAME_H * 0.4);

        // Progress bar
        const barW = 200;
        const barH = 12;
        const barX = (GAME_W - barW) / 2;
        const barY = GAME_H * 0.5;
        const pct = spritesTotal > 0 ? spritesLoaded / spritesTotal : 0;

        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 6);
        ctx.fill();

        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * pct, barH, 6);
        ctx.fill();

        ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText(`${spritesLoaded} / ${spritesTotal}`, GAME_W / 2, barY + 28);
    }

    function drawTitleScreen(time) {
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, GAME_W, GAME_H);
        drawSprite('coinGold', GAME_W * 0.2 - 15, GAME_H * 0.18, 30, 30);
        drawSprite('coinGold', GAME_W * 0.8 - 15, GAME_H * 0.18, 30, 30);
        drawSprite('starGold', GAME_W * 0.3 - 10, GAME_H * 0.15, 20, 20);
        drawSprite('starGold', GAME_W * 0.7 - 10, GAME_H * 0.15, 20, 20);
        ctx.font = 'bold 40px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700'; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 20;
        ctx.fillText('BOWLING', GAME_W / 2, GAME_H * 0.25); ctx.shadowBlur = 0;
        ctx.font = '16px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('10-Pin Bowling  \u2022  10 Frames', GAME_W / 2, GAME_H * 0.36);
        ctx.font = '13px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        const instructions = ['1. Position ball left/right', '2. Set aim angle', '3. Set power and throw', '4. Arrow keys for hook/spin during roll'];
        instructions.forEach((txt, i) => ctx.fillText(txt, GAME_W / 2, GAME_H * (0.46 + i * 0.05)));
        if (pinCanvas) {
            ctx.drawImage(pinCanvas, GAME_W * 0.35 - 12, GAME_H * 0.68, 24, 24);
            ctx.drawImage(pinCanvas, GAME_W * 0.5 - 12, GAME_H * 0.66, 24, 24);
            ctx.drawImage(pinCanvas, GAME_W * 0.65 - 12, GAME_H * 0.68, 24, 24);
        }
        if (ballCanvas) ctx.drawImage(ballCanvas, GAME_W * 0.5 - 15, GAME_H * 0.72, 30, 30);
        ctx.globalAlpha = 0.4 + Math.sin(time * 0.005) * 0.3;
        ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700'; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 8;
        ctx.fillText('Tap or Space to Start', GAME_W / 2, GAME_H * 0.82);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawGameOverScreen(time) {
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, GAME_W, GAME_H);
        const great = totalScore >= 200, perfect = totalScore === 300;
        const title = perfect ? 'PERFECT GAME!' : great ? 'GREAT GAME!' : 'GAME OVER';
        const clr = perfect ? '#FFD700' : great ? '#34D399' : '#F59E0B';
        if (great) {
            const sc = perfect ? 5 : totalScore >= 250 ? 3 : 2, sp = 28;
            const sx = GAME_W / 2 - (sc - 1) * sp / 2;
            for (let i = 0; i < sc; i++) drawSprite('starGold', sx + i * sp - 10, GAME_H * 0.17, 20, 20);
        }
        ctx.font = 'bold 36px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = clr; ctx.shadowColor = clr; ctx.shadowBlur = 20;
        ctx.fillText(title, GAME_W / 2, GAME_H * 0.25); ctx.shadowBlur = 0;
        ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`Final Score: ${totalScore}`, GAME_W / 2, GAME_H * 0.36);
        ctx.font = '14px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`Duration: ${Math.floor((Date.now() - startTime) / 1000)}s`, GAME_W / 2, GAME_H * 0.44);
        const rating = totalScore === 300 ? 'PERFECT GAME!' : totalScore >= 250 ? 'Outstanding!' :
            totalScore >= 200 ? 'Great!' : totalScore >= 150 ? 'Good!' : totalScore >= 100 ? 'Not bad!' : 'Keep practicing!';
        ctx.fillText(rating, GAME_W / 2, GAME_H * 0.50);
        ctx.globalAlpha = 0.35 + Math.sin(time * 0.005) * 0.3;
        ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700'; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 8;
        ctx.fillText('Tap or Space to Play Again', GAME_W / 2, GAME_H * 0.65);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        ctx.restore();
    }

    //  UPDATE LOOP

    function update(time) {
        updateParticles();
        updateMessages();

        if (state === ST_LOADING || state === ST_TITLE || state === ST_OVER) return;

        if (state === ST_POSITION) {
            if (keys['ArrowLeft'] || keys['a']) posX -= 2;
            if (keys['ArrowRight'] || keys['d']) posX += 2;
            posX = Math.max(LANE_L + BALL_R + 2, Math.min(LANE_R - BALL_R - 2, posX));
            return;
        }

        if (state === ST_AIM) {
            aimAngle += aimDir * 0.015;
            if (aimAngle > 0.4) aimDir = -1;
            if (aimAngle < -0.4) aimDir = 1;

            if (keys['ArrowLeft'] || keys['a']) aimAngle -= 0.02;
            if (keys['ArrowRight'] || keys['d']) aimAngle += 0.02;
            aimAngle = Math.max(-0.5, Math.min(0.5, aimAngle));
            return;
        }

        if (state === ST_POWER) {
            powerLevel += powerDir * 0.018;
            if (powerLevel >= 1) { powerLevel = 1; powerDir = -1; }
            if (powerLevel <= 0) { powerLevel = 0; powerDir = 1; }
            return;
        }

        if (state === ST_ROLLING) {
            if (keys['ArrowLeft'] || keys['a']) ballHook = -1;
            else if (keys['ArrowRight'] || keys['d']) ballHook = 1;
            else ballHook = 0;

            updateBallPhysics();

            if (!ballRolling && allPinsStopped()) {
                state = ST_SCORING;
                scoringTimer = Date.now() + 1200;
            }
            return;
        }

        if (state === ST_SCORING) {
            if (Date.now() >= scoringTimer) {
                recordRoll();
            }
            return;
        }
    }

    //  DRAW LOOP

    function draw(time) {
        ctx.clearRect(0, 0, GAME_W, GAME_H);

        if (state === ST_LOADING) {
            drawLoadingScreen();
            return;
        }

        drawLane();

        // Draw pin shadows first (layered under pins)
        for (const p of pins) {
            if (!p.standing) continue;
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.beginPath();
            ctx.ellipse(p.x + 1.5, p.y + 2, PIN_R + 1, PIN_R * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        for (const p of pins) drawPin(p);

        drawBall();
        drawPositionIndicator();
        drawAimIndicator();
        drawPowerMeter();
        drawHookIndicator();
        drawStrikeFlash();
        drawScoreCard();
        drawParticles();
        drawMessages();
        drawHUD();

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
        setupPins();
        initScoring();
        startTime = Date.now();
        particles = [];
        messages = [];
        debrisChunks = [];
        strikeFlashAlpha = 0;
        gameActive = true;
        startPositioning();
    }

    //  EVENT HANDLERS

    function onKeyDown(e) {
        keys[e.key] = true;

        if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
            e.preventDefault();
            if (state === ST_TITLE) { startGame(); return; }
            if (state === ST_OVER) { state = ST_TITLE; return; }
            if (state === ST_POSITION) { state = ST_AIM; return; }
            if (state === ST_AIM) { state = ST_POWER; return; }
            if (state === ST_POWER) { launchBall(); return; }
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

    function handleTap(cx, cy) {
        ensureAudio();
        if (state === ST_TITLE) { startGame(); return; }
        if (state === ST_OVER) { state = ST_TITLE; return; }

        if (state === ST_POSITION) {
            if (cy > FOUL_LINE_Y) {
                posX = Math.max(LANE_L + BALL_R + 2, Math.min(LANE_R - BALL_R - 2, cx));
            }
            state = ST_AIM;
            return;
        }

        if (state === ST_AIM) {
            state = ST_POWER;
            return;
        }

        if (state === ST_POWER) {
            launchBall();
            return;
        }
    }

    function onMouseDown(e) {
        const pos = getCanvasPos(e.clientX, e.clientY);
        mouseX = pos.x;
        mouseY = pos.y;
        handleTap(pos.x, pos.y);
    }

    function onMouseMove(e) {
        const pos = getCanvasPos(e.clientX, e.clientY);
        mouseX = pos.x;
        mouseY = pos.y;
        if (state === ST_POSITION) {
            posX = Math.max(LANE_L + BALL_R + 2, Math.min(LANE_R - BALL_R - 2, pos.x));
        }
    }

    function onTouchStart(e) {
        if (e.touches.length === 0) return;
        const pos = getCanvasPos(e.touches[0].clientX, e.touches[0].clientY);
        mouseX = pos.x;
        mouseY = pos.y;
        handleTap(pos.x, pos.y);
    }

    function onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 0) return;
        const pos = getCanvasPos(e.touches[0].clientX, e.touches[0].clientY);
        mouseX = pos.x;
        mouseY = pos.y;
        if (state === ST_POSITION) {
            posX = Math.max(LANE_L + BALL_R + 2, Math.min(LANE_R - BALL_R - 2, pos.x));
        }
        if (state === ST_ROLLING && ballRolling) {
            const center = GAME_W / 2;
            if (pos.x < center - 40) ballHook = -1;
            else if (pos.x > center + 40) ballHook = 1;
            else ballHook = 0;
        }
    }

    function onTouchEnd() {
        if (state === ST_ROLLING) ballHook = 0;
    }

    function onResize() { fitCanvas(); }

    //  PUBLIC API

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
        debrisChunks = [];
        gameActive = false;
        state = ST_LOADING;

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        setupPins();

        // Start sprite loading, transition to title when done
        loadSprites(() => {
            buildCachedSprites();
            state = ST_TITLE;
        });

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup',   onKeyUp);
        window.addEventListener('resize',  onResize);
        canvas.addEventListener('mousedown',  onMouseDown);
        canvas.addEventListener('mousemove',  onMouseMove);
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
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove',  onTouchMove);
            canvas.removeEventListener('touchend',   onTouchEnd);
        }
        canvas = null;
        ctx    = null;

        // Clear cached canvases
        pinCanvas = null;
        ballCanvas = null;
        lanePatternCanvas = null;
        gutterPatternCanvas = null;

        if (audioCtx) {
            try { audioCtx.close(); } catch { /* ignore */ }
            audioCtx = null;
        }
    }

    return {
        init,
        destroy,
        getScore()  { return totalScore; },
        getLevel()  { return Math.floor(totalScore / 30); },
        isActive()  { return gameActive; }
    };
})();
