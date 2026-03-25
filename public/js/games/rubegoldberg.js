/* Rube Goldberg Machine Builder — Kenney Physics Pack Edition
 * Tetris meets The Incredible Machine: panic-build a machine ahead of a rolling ball.
 * Uses Kenney Physics Pack sprites for a polished, professional look.
 * Self-contained, no dependencies, canvas-rendered */
window.RubeGoldberg = (() => {

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

    // ── Constants ─────────────────────────────────────────────
    const GAME_W = 640, GAME_H = 480;
    const GRAVITY = 0.35;
    const FRICTION = 0.985;
    const BOUNCE_DAMP = 0.6;
    const BALL_R = 10;
    const PIECE_W = 80, PIECE_H = 60;
    const QUEUE_X = 570, QUEUE_Y = 60, QUEUE_GAP = 75;
    const HUD_H = 40;

    // ── Isometric / diorama depth constants ─────────────────
    const DEPTH_X = 10, DEPTH_Y = 12;  // shadow offset — LARGE for obvious 3D
    const DEPTH_ALPHA = 0.55;           // shadow layer opacity — punchy

    // ── Piece types ──────────────────────────────────────────
    const PIECE_TYPES = [
        'ramp', 'funnel', 'seesaw', 'trampoline', 'dominos', 'fan',
        'bucket', 'spring', 'conveyor', 'catapult', 'pipe', 'wheel'
    ];
    const PIECE_NAMES = {
        ramp: 'Ramp', funnel: 'Funnel', seesaw: 'Seesaw', trampoline: 'Trampoline',
        dominos: 'Dominos', fan: 'Fan', bucket: 'Bucket', spring: 'Spring',
        conveyor: 'Conveyor', catapult: 'Catapult', pipe: 'Pipe', wheel: 'Wheel'
    };

    // ── States ────────────────────────────────────────────────
    const ST_LOADING = -1, ST_TITLE = 0, ST_PLAYING = 1, ST_LEVEL_COMPLETE = 2, ST_GAME_OVER = 3;

    // ── Theme colors (overridden in init) ─────────────────────
    let BG_TOP = '#0a1628', BG_BOT = '#0d2137';
    let CLR_PRIMARY = '#3B82F6', CLR_SECONDARY = '#10B981';
    let CLR_ACCENT = '#F59E0B', CLR_DANGER = '#EF4444';
    let CLR_TEXT = '#E2E8F0', CLR_DIM = '#64748B';

    // ── Module state ──────────────────────────────────────────
    let canvas, ctx, scale;
    let state, gameActive;
    let animFrame = null;
    let audioCtx = null;
    let player = null, onGameOver = null;
    let level, score, lives;
    let combo, lastPlaceTime;
    let totalScore;

    // Level data
    let trackSegments, gaps, placedPieces;
    let ball, ballTrail;
    let cameraX, targetCameraX;
    let worldWidth;

    // Queue & dragging
    let queue, dragPiece, dragX, dragY, dragFromQueue;
    let activeGapIdx;

    // Effects
    let particles, flashEffects;
    let panicMeter;
    let levelStartTime;

    // Timing
    let lastTime;

    // Multi-ball for later levels
    let balls;

    // ── Sprite System ────────────────────────────────────────
    const sprites = {};
    let spritesLoaded = false;
    let spritesTotal = 0;
    let spritesCount = 0;

    const SPRITE_BASE = '/img/game-assets/kenney-physics';
    const SPACE_BASE = '/img/game-assets/kenney-space/effects';

    // Sprite manifest: all images we need
    const SPRITE_MANIFEST = {
        // Wood elements
        woodBlock:    `${SPRITE_BASE}/wood/elementWood010.png`,
        woodPlank:    `${SPRITE_BASE}/wood/elementWood019.png`,
        woodWheel:    `${SPRITE_BASE}/wood/elementWood003.png`,
        woodChannel:  `${SPRITE_BASE}/wood/elementWood040.png`,
        woodWide:     `${SPRITE_BASE}/wood/elementWood011.png`,
        woodSmall:    `${SPRITE_BASE}/wood/elementWood014.png`,
        woodTiny:     `${SPRITE_BASE}/wood/elementWood004.png`,
        woodBeam:     `${SPRITE_BASE}/wood/elementWood018.png`,
        woodPost:     `${SPRITE_BASE}/wood/elementWood016.png`,
        woodSquare:   `${SPRITE_BASE}/wood/elementWood001.png`,
        // Metal elements
        metalGear:    `${SPRITE_BASE}/metal/elementMetal010.png`,
        metalPlate:   `${SPRITE_BASE}/metal/elementMetal019.png`,
        metalTriangle:`${SPRITE_BASE}/metal/elementMetal009.png`,
        metalFrame:   `${SPRITE_BASE}/metal/elementMetal040.png`,
        metalSmall:   `${SPRITE_BASE}/metal/elementMetal014.png`,
        metalBlock:   `${SPRITE_BASE}/metal/elementMetal011.png`,
        metalBar:     `${SPRITE_BASE}/metal/elementMetal018.png`,
        metalBolt:    `${SPRITE_BASE}/metal/elementMetal004.png`,
        metalRound:   `${SPRITE_BASE}/metal/elementMetal003.png`,
        // Glass elements
        glassBlock:   `${SPRITE_BASE}/glass/elementGlass010.png`,
        glassTube:    `${SPRITE_BASE}/glass/elementGlass019.png`,
        glassSmall:   `${SPRITE_BASE}/glass/elementGlass011.png`,
        glassTriangle:`${SPRITE_BASE}/glass/elementGlass009.png`,
        // Stone elements
        stoneBlock:   `${SPRITE_BASE}/stone/elementStone010.png`,
        stoneWide:    `${SPRITE_BASE}/stone/elementStone011.png`,
        stoneSquare:  `${SPRITE_BASE}/stone/elementStone001.png`,
        // Explosive elements
        tntBlock:     `${SPRITE_BASE}/explosive/elementExplosive010.png`,
        tntTriangle:  `${SPRITE_BASE}/explosive/elementExplosive009.png`,
        // Backgrounds
        bgDesert:     `${SPRITE_BASE}/backgrounds/colored_land.png`,
        // Other
        coinGold:     `${SPRITE_BASE}/other/coinGold.png`,
        coinSilver:   `${SPRITE_BASE}/other/coinSilver.png`,
        starGold:     `${SPRITE_BASE}/other/starGold.png`,
        starBronze:   `${SPRITE_BASE}/other/starBronze.png`,
        flagGreen:    `${SPRITE_BASE}/other/flagGreen.png`,
        flagRed:      `${SPRITE_BASE}/other/flagRed.png`,
        grass:        `${SPRITE_BASE}/other/grass.png`,
        dirt:         `${SPRITE_BASE}/other/dirt.png`,
        sand:         `${SPRITE_BASE}/other/sand.png`,
        rock:         `${SPRITE_BASE}/other/rock.png`,
        cactus:       `${SPRITE_BASE}/other/cactus.png`,
        // Debris
        debrisWood1:  `${SPRITE_BASE}/debris/debrisWood_1.png`,
        debrisWood2:  `${SPRITE_BASE}/debris/debrisWood_2.png`,
        debrisWood3:  `${SPRITE_BASE}/debris/debrisWood_3.png`,
        debrisMetal1: `${SPRITE_BASE}/debris/debrisStone_1.png`,
        debrisMetal2: `${SPRITE_BASE}/debris/debrisStone_2.png`,
        debrisMetal3: `${SPRITE_BASE}/debris/debrisStone_3.png`,
        debrisGlass1: `${SPRITE_BASE}/debris/debrisGlass_1.png`,
        debrisGlass2: `${SPRITE_BASE}/debris/debrisGlass_2.png`,
        debrisGlass3: `${SPRITE_BASE}/debris/debrisGlass_3.png`,
        // Space effects (ball trail)
        star1:        `${SPACE_BASE}/star1.png`,
        star2:        `${SPACE_BASE}/star2.png`,
        star3:        `${SPACE_BASE}/star3.png`,
        fire00:       `${SPACE_BASE}/fire00.png`,
        fire05:       `${SPACE_BASE}/fire05.png`,
        fire10:       `${SPACE_BASE}/fire10.png`,
    };

    function loadSprites(onDone) {
        const keys = Object.keys(SPRITE_MANIFEST);
        spritesTotal = keys.length;
        spritesCount = 0;
        let failed = 0;
        keys.forEach(key => {
            const img = new Image();
            img.onload = () => { sprites[key] = img; spritesCount++; checkDone(); };
            img.onerror = () => { failed++; spritesCount++; checkDone(); };
            img.src = SPRITE_MANIFEST[key];
        });
        function checkDone() {
            if (spritesCount >= spritesTotal) {
                spritesLoaded = true;
                if (onDone) onDone();
            }
        }
    }

    // Helper: draw sprite scaled to fit a rect, optionally rotated
    function drawSprite(key, x, y, w, h, angle, alpha, flipX) {
        const img = sprites[key];
        if (!img) return;
        ctx.save();
        if (alpha !== undefined) ctx.globalAlpha = alpha;
        ctx.translate(x + w / 2, y + h / 2);
        if (angle) ctx.rotate(angle);
        if (flipX) ctx.scale(-1, 1);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
    }

    // Helper: draw sprite centered at a point
    function drawSpriteAt(key, cx, cy, size, angle, alpha) {
        const img = sprites[key];
        if (!img) return;
        ctx.save();
        if (alpha !== undefined) ctx.globalAlpha = alpha;
        ctx.translate(cx, cy);
        if (angle) ctx.rotate(angle);
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
    }

    // ── Isometric depth helpers ─────────────────────────────
    // Draw a depth-shadow layer beneath any rectangular area
    function drawDepthShadow(x, y, w, h) {
        ctx.save();
        ctx.globalAlpha = DEPTH_ALPHA;
        ctx.fillStyle = 'rgba(10,5,2,1)';
        // Soft blurred shadow offset behind piece
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = DEPTH_X * 0.5;
        ctx.shadowOffsetY = DEPTH_Y * 0.5;
        ctx.fillRect(x + DEPTH_X, y + DEPTH_Y, w, h);
        ctx.restore();
    }

    // Draw THICK side-face parallelogram (L-shaped extrusion) for obvious 3D
    function drawSideFace(x, y, w, h) {
        ctx.save();
        // BOTTOM face — thick parallelogram
        const bottomGrad = ctx.createLinearGradient(x, y + h, x, y + h + DEPTH_Y);
        bottomGrad.addColorStop(0, 'rgba(80,55,30,0.85)');
        bottomGrad.addColorStop(1, 'rgba(30,18,8,0.9)');
        ctx.fillStyle = bottomGrad;
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + DEPTH_X, y + h + DEPTH_Y);
        ctx.lineTo(x + w + DEPTH_X, y + h + DEPTH_Y);
        ctx.lineTo(x + w, y + h);
        ctx.closePath();
        ctx.fill();
        // Subtle line at bottom face top edge
        ctx.strokeStyle = 'rgba(120,85,45,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w, y + h);
        ctx.stroke();

        // RIGHT face — thick parallelogram
        const rightGrad = ctx.createLinearGradient(x + w, y, x + w + DEPTH_X, y);
        rightGrad.addColorStop(0, 'rgba(65,42,22,0.8)');
        rightGrad.addColorStop(1, 'rgba(20,10,4,0.85)');
        ctx.fillStyle = rightGrad;
        ctx.beginPath();
        ctx.moveTo(x + w, y);
        ctx.lineTo(x + w + DEPTH_X, y + DEPTH_Y);
        ctx.lineTo(x + w + DEPTH_X, y + h + DEPTH_Y);
        ctx.lineTo(x + w, y + h);
        ctx.closePath();
        ctx.fill();
        // Subtle line at right face left edge
        ctx.strokeStyle = 'rgba(120,85,45,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w, y);
        ctx.lineTo(x + w, y + h);
        ctx.stroke();

        // Corner join highlight (where bottom and right meet)
        ctx.fillStyle = 'rgba(100,70,35,0.5)';
        ctx.beginPath();
        ctx.moveTo(x + w, y + h);
        ctx.lineTo(x + w + DEPTH_X, y + h + DEPTH_Y);
        ctx.lineTo(x + w + DEPTH_X * 0.7, y + h + DEPTH_Y * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // Ambient-occlusion gradient at the base of a standing piece — THICK
    function drawAmbientOcclusion(x, y, w, h) {
        ctx.save();
        const aoH = Math.min(22, h * 0.4);
        const aoGrad = ctx.createLinearGradient(x, y + h - aoH, x, y + h + 6);
        aoGrad.addColorStop(0, 'rgba(0,0,0,0)');
        aoGrad.addColorStop(0.5, 'rgba(0,0,0,0.15)');
        aoGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = aoGrad;
        ctx.fillRect(x - 6, y + h - aoH, w + 12 + DEPTH_X, aoH + 6);
        // Also add an elliptical contact shadow directly under
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x + w / 2 + DEPTH_X * 0.3, y + h + 2, w * 0.55, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Top-left highlight + bottom-right shadow on EVERY piece (lighting cue)
    function drawHighlightEdge(x, y, w, h) {
        ctx.save();
        // TOP-LEFT highlight — bright, 3px wide
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = 'rgba(255,245,210,1)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.stroke();
        // Inner glow along top edge
        const topGlow = ctx.createLinearGradient(x, y, x, y + 8);
        topGlow.addColorStop(0, 'rgba(255,240,200,0.25)');
        topGlow.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = topGlow;
        ctx.globalAlpha = 1;
        ctx.fillRect(x, y, w, 8);
        // Inner glow along left edge
        const leftGlow = ctx.createLinearGradient(x, y, x + 8, y);
        leftGlow.addColorStop(0, 'rgba(255,240,200,0.2)');
        leftGlow.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = leftGlow;
        ctx.fillRect(x, y, 8, h);

        // BOTTOM-RIGHT shadow edge — dark, 2px
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = 'rgba(10,5,0,1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + w, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.stroke();
        ctx.restore();
    }

    // ── Audio ─────────────────────────────────────────────────
    function ensureAudio() {
        if (audioCtx) return;
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    }

    function playTone(freq, dur, type, vol) {
        if (!audioCtx) return;
        try {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = type || 'sine';
            o.frequency.value = freq;
            g.gain.setValueAtTime(vol || 0.15, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + dur);
        } catch {}
    }

    function playNoise(dur, vol) {
        if (!audioCtx) return;
        try {
            const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
            const src = audioCtx.createBufferSource();
            const g = audioCtx.createGain();
            src.buffer = buf;
            g.gain.setValueAtTime(vol || 0.08, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            src.connect(g); g.connect(audioCtx.destination);
            src.start();
        } catch {}
    }

    function sndPlace()    { playTone(880, 0.12, 'square', 0.12); playTone(1320, 0.08, 'sine', 0.08); }
    function sndWrong()    { playTone(200, 0.3, 'sawtooth', 0.15); playTone(150, 0.4, 'sawtooth', 0.1); }
    function sndBounce()   { playTone(660, 0.1, 'sine', 0.1); }
    function sndSpring()   { playTone(440, 0.05, 'sine', 0.12); playTone(880, 0.15, 'sine', 0.12); }
    function sndFan()      { playNoise(0.3, 0.06); }
    function sndDominos()  { for (let i = 0; i < 5; i++) setTimeout(() => playTone(600 + i * 80, 0.05, 'square', 0.06), i * 40); }
    function sndSeesaw()   { playTone(220, 0.2, 'triangle', 0.1); }
    function sndConveyor() { playNoise(0.15, 0.04); }
    function sndWheel()    { playTone(330, 0.15, 'triangle', 0.08); }
    function sndCatapult()  { playTone(300, 0.05, 'square', 0.1); playTone(900, 0.15, 'sine', 0.12); }
    function sndPipe()     { playTone(500, 0.08, 'sine', 0.06); playTone(700, 0.1, 'sine', 0.06); }
    function sndBucket()   { playTone(180, 0.2, 'triangle', 0.1); playTone(350, 0.15, 'sine', 0.08); }
    function sndGameOver() { playTone(300, 0.2, 'sawtooth', 0.12); setTimeout(() => playTone(200, 0.3, 'sawtooth', 0.12), 200); setTimeout(() => playTone(120, 0.5, 'sawtooth', 0.15), 400); }
    function sndLevelDone(){ for (let i = 0; i < 6; i++) setTimeout(() => playTone(440 + i * 110, 0.15, 'square', 0.08), i * 80); }

    // Rolling sound (looped noise)
    let rollingNode = null, rollingGain = null;
    function startRollingSound() {
        if (!audioCtx || rollingNode) return;
        try {
            const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.15;
            rollingNode = audioCtx.createBufferSource();
            rollingGain = audioCtx.createGain();
            rollingNode.buffer = buf;
            rollingNode.loop = true;
            rollingGain.gain.value = 0;
            const filt = audioCtx.createBiquadFilter();
            filt.type = 'lowpass'; filt.frequency.value = 400;
            rollingNode.connect(filt); filt.connect(rollingGain); rollingGain.connect(audioCtx.destination);
            rollingNode.start();
        } catch {}
    }
    function stopRollingSound() {
        if (rollingNode) { try { rollingNode.stop(); } catch {} rollingNode = null; rollingGain = null; }
    }
    function setRollingVolume(v) {
        if (rollingGain) rollingGain.gain.value = Math.min(0.1, Math.max(0, v));
    }

    // ── Level generation ─────────────────────────────────────
    const LEVEL_DEFS = buildLevelDefs();

    function buildLevelDefs() {
        const defs = [];
        const easy = ['ramp', 'trampoline', 'ramp'];
        const med = ['ramp', 'trampoline', 'funnel', 'seesaw', 'dominos'];
        const hard = ['ramp', 'trampoline', 'funnel', 'seesaw', 'dominos', 'fan', 'conveyor', 'spring'];
        const expert = ['ramp', 'trampoline', 'funnel', 'seesaw', 'dominos', 'fan', 'conveyor', 'spring', 'bucket', 'catapult', 'pipe'];
        const insane = PIECE_TYPES.slice();

        for (let i = 0; i < 20; i++) {
            let gapCount, speedMult, pool, multiBall;
            if (i < 3)      { gapCount = 3 + i; speedMult = 0.6 + i * 0.05; pool = easy; multiBall = false; }
            else if (i < 7)  { gapCount = 5 + (i - 3); speedMult = 0.75 + (i - 3) * 0.05; pool = med; multiBall = false; }
            else if (i < 12) { gapCount = 7 + Math.floor((i - 7) / 2); speedMult = 0.9 + (i - 7) * 0.04; pool = hard; multiBall = false; }
            else if (i < 17) { gapCount = 8 + (i - 12); speedMult = 1.05 + (i - 12) * 0.05; pool = expert; multiBall = false; }
            else             { gapCount = 10 + (i - 17); speedMult = 1.25 + (i - 17) * 0.08; pool = insane; multiBall = i >= 19; }
            defs.push({ gapCount, speedMult, pool, multiBall });
        }
        return defs;
    }

    function generateLevel(lvl) {
        const def = LEVEL_DEFS[Math.min(lvl, LEVEL_DEFS.length - 1)];
        trackSegments = [];
        gaps = [];
        placedPieces = [];

        let cx = 60, cy = 100;
        const segW = 120;

        // Start platform
        trackSegments.push({ x: 0, y: cy, w: cx + 20, type: 'flat' });

        for (let g = 0; g < def.gapCount; g++) {
            const segLen = segW + Math.random() * 60;
            const slopeRoll = Math.random();
            let segType = 'flat';
            let nextY = cy;
            if (slopeRoll < 0.3) { segType = 'slope_down'; nextY = cy + 40 + Math.random() * 30; }
            else if (slopeRoll < 0.45) { segType = 'slope_up'; nextY = Math.max(60, cy - 30 - Math.random() * 20); }

            trackSegments.push({ x: cx, y: cy, w: segLen, type: segType, endY: nextY });
            cx += segLen;
            cy = nextY;

            const gapW = PIECE_W;
            const piece = def.pool[Math.floor(Math.random() * def.pool.length)];

            let gapY = cy;
            if (piece === 'trampoline' || piece === 'spring' || piece === 'catapult') {
                gapY = cy + 10;
            } else if (piece === 'funnel' || piece === 'bucket') {
                gapY = cy - 20;
            }

            gaps.push({
                x: cx, y: gapY, w: gapW, h: PIECE_H,
                requiredPiece: piece, filled: false, placedPiece: null,
                activated: false, animTimer: 0
            });
            cx += gapW;
        }

        // Final track segment to finish
        trackSegments.push({ x: cx, y: cy, w: 150, type: 'flat', endY: cy });
        cx += 150;
        worldWidth = cx + 50;

        // Init ball(s)
        balls = [{
            x: 40, y: 60, vx: 1.2 * def.speedMult, vy: 0,
            onTrack: true, alive: true, rolling: false, angle: 0
        }];
        if (def.multiBall) {
            balls.push({
                x: 40, y: 40, vx: 1.0 * def.speedMult, vy: 0,
                onTrack: true, alive: true, rolling: false, angle: 0
            });
        }

        ballTrail = [];
        cameraX = 0;
        targetCameraX = 0;

        buildQueue(def);
        panicMeter = 0;
        activeGapIdx = 0;
        levelStartTime = Date.now();
    }

    function buildQueue(def) {
        queue = [];
        refillQueue();
    }

    function refillQueue() {
        while (queue.length < 3) {
            const nextGap = gaps.find((g, i) => !g.filled && i >= activeGapIdx);
            if (nextGap) {
                if (Math.random() < 0.7 || level < 3) {
                    queue.push({ type: nextGap.requiredPiece });
                } else {
                    const pool = LEVEL_DEFS[Math.min(level, LEVEL_DEFS.length - 1)].pool;
                    queue.push({ type: pool[Math.floor(Math.random() * pool.length)] });
                }
            } else {
                queue.push({ type: PIECE_TYPES[Math.floor(Math.random() * 6)] });
            }
        }
    }

    // ── Physics ───────────────────────────────────────────────
    function getTrackYAt(x) {
        for (const seg of trackSegments) {
            if (x >= seg.x && x < seg.x + seg.w) {
                if (seg.type === 'flat') return seg.y;
                if (seg.type === 'slope_down' || seg.type === 'slope_up') {
                    const t = (x - seg.x) / seg.w;
                    return seg.y + t * ((seg.endY || seg.y) - seg.y);
                }
            }
        }
        return null;
    }

    function isInGap(x) {
        for (let i = 0; i < gaps.length; i++) {
            const g = gaps[i];
            if (x >= g.x && x < g.x + g.w) return i;
        }
        return -1;
    }

    function updateBall(b, dt) {
        if (!b.alive) return;

        b.angle += b.vx * 0.1;
        b.vy += GRAVITY * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        const trackY = getTrackYAt(b.x);
        const gapIdx = isInGap(b.x);

        if (gapIdx >= 0) {
            const gap = gaps[gapIdx];
            if (gap.filled && gap.placedPiece) {
                handlePieceInteraction(b, gap);
            } else {
                if (b.y > gap.y + PIECE_H) {
                    b.alive = false;
                }
            }
        } else if (trackY !== null) {
            if (b.y + BALL_R >= trackY) {
                b.y = trackY - BALL_R;
                if (b.vy > 0) {
                    b.vy = -b.vy * 0.2;
                    if (Math.abs(b.vy) < 1) b.vy = 0;
                }
                b.vx *= FRICTION;
                b.rolling = true;

                const seg = trackSegments.find(s => b.x >= s.x && b.x < s.x + s.w);
                if (seg) {
                    if (seg.type === 'slope_down') {
                        const slope = ((seg.endY || seg.y) - seg.y) / seg.w;
                        b.vx += slope * 0.5 * dt;
                    } else if (seg.type === 'slope_up') {
                        const slope = ((seg.endY || seg.y) - seg.y) / seg.w;
                        b.vx += slope * 0.3 * dt;
                    }
                    const def = LEVEL_DEFS[Math.min(level, LEVEL_DEFS.length - 1)];
                    if (b.vx < 0.5 * def.speedMult) b.vx = 0.5 * def.speedMult;
                }
            } else {
                b.rolling = false;
            }
        } else {
            b.rolling = false;
        }

        if (b.y > GAME_H + 50) b.alive = false;
        if (b.y - BALL_R < 0) { b.y = BALL_R; b.vy = Math.abs(b.vy) * 0.5; }

        ballTrail.push({ x: b.x, y: b.y, age: 0 });
        if (ballTrail.length > 25) ballTrail.shift();
    }

    function handlePieceInteraction(b, gap) {
        const px = gap.x, py = gap.y;
        const pType = gap.placedPiece;

        if (!gap.activated) {
            gap.activated = true;
            gap.animTimer = 0;
        }
        gap.animTimer += 1;

        switch (pType) {
            case 'ramp': {
                const t = (b.x - px) / PIECE_W;
                const surfaceY = py - 10 + t * 30;
                if (b.y + BALL_R > surfaceY) {
                    b.y = surfaceY - BALL_R;
                    b.vy = -1;
                    b.vx = Math.max(b.vx, 2);
                    b.rolling = true;
                }
                if (gap.animTimer === 1) sndBounce();
                break;
            }
            case 'funnel': {
                const cx = px + PIECE_W / 2;
                const dx = cx - b.x;
                b.vx += dx * 0.05;
                const surfaceY = py + PIECE_H - 15;
                if (b.y + BALL_R > surfaceY && Math.abs(b.x - cx) < 12) {
                    b.y = surfaceY - BALL_R;
                    b.vy = 2;
                    b.vx = 1.5;
                }
                if (gap.animTimer === 1) sndPipe();
                break;
            }
            case 'seesaw': {
                const cx = px + PIECE_W / 2;
                const pivotY = py + PIECE_H / 2;
                if (b.x < cx) {
                    const surfaceY = pivotY + (b.x - px) / (PIECE_W / 2) * 15;
                    if (b.y + BALL_R > surfaceY) {
                        b.y = surfaceY - BALL_R;
                        b.vy = -6;
                        b.vx = 3;
                    }
                } else {
                    const surfaceY = pivotY - (b.x - cx) / (PIECE_W / 2) * 15;
                    if (b.y + BALL_R > surfaceY) {
                        b.y = surfaceY - BALL_R;
                        b.vy = -4;
                        b.vx = 2.5;
                    }
                }
                if (gap.animTimer === 1) sndSeesaw();
                break;
            }
            case 'trampoline': {
                const surfaceY = py + 10;
                if (b.y + BALL_R > surfaceY && b.vy > 0) {
                    b.vy = -8 - Math.abs(b.vy) * 0.3;
                    b.y = surfaceY - BALL_R;
                    b.vx = Math.max(b.vx, 2);
                    spawnDebris(b.x, b.y, 'metal', 6);
                    sndSpring();
                }
                break;
            }
            case 'dominos': {
                const progress = Math.min(gap.animTimer / 30, 1);
                if (progress < 1) {
                    b.vx *= 0.95;
                } else {
                    b.vx = Math.max(b.vx, 3);
                    b.vy = -2;
                }
                const surfaceY = py + PIECE_H - 10;
                if (b.y + BALL_R > surfaceY) {
                    b.y = surfaceY - BALL_R;
                    b.vy = 0;
                }
                if (gap.animTimer === 1) sndDominos();
                break;
            }
            case 'fan': {
                b.vx += 0.3;
                b.vy -= 0.15;
                if (gap.animTimer % 10 === 1) sndFan();
                break;
            }
            case 'bucket': {
                const cx = px + PIECE_W / 2;
                const progress = Math.min(gap.animTimer / 20, 1);
                if (progress < 0.5) {
                    const dx = cx - b.x;
                    b.vx += dx * 0.08;
                    const surfaceY = py + PIECE_H - 15;
                    if (b.y + BALL_R > surfaceY) { b.y = surfaceY - BALL_R; b.vy = 0; }
                } else {
                    b.vy = -6;
                    b.vx = 2.5;
                }
                if (gap.animTimer === 1) sndBucket();
                break;
            }
            case 'spring': {
                const surfaceY = py + PIECE_H - 10;
                const compress = Math.min(gap.animTimer / 10, 1);
                if (compress < 0.5 && b.y + BALL_R > surfaceY) {
                    b.y = surfaceY - BALL_R;
                    b.vy = 0;
                    b.vx *= 0.9;
                } else if (compress >= 0.5) {
                    b.vy = -10;
                    b.vx = 3;
                    if (gap.animTimer === 6) {
                        spawnDebris(b.x, b.y, 'metal', 8);
                        sndSpring();
                    }
                }
                break;
            }
            case 'conveyor': {
                const surfaceY = py + 5;
                if (b.y + BALL_R > surfaceY) {
                    b.y = surfaceY - BALL_R;
                    b.vy = 0;
                }
                b.vx = Math.max(b.vx, 2.5);
                b.rolling = true;
                if (gap.animTimer % 15 === 1) sndConveyor();
                break;
            }
            case 'catapult': {
                const progress = Math.min(gap.animTimer / 15, 1);
                const surfaceY = py + PIECE_H - 15;
                if (progress < 0.6) {
                    if (b.y + BALL_R > surfaceY) { b.y = surfaceY - BALL_R; b.vy = 0; b.vx *= 0.9; }
                } else {
                    b.vy = -12;
                    b.vx = 4;
                    if (gap.animTimer === 10) {
                        spawnDebris(b.x, b.y, 'wood', 10);
                        sndCatapult();
                    }
                }
                break;
            }
            case 'pipe': {
                const t = (b.x - px) / PIECE_W;
                b.y = py + PIECE_H / 2 + Math.sin(t * Math.PI) * 10;
                b.vy = 0;
                b.vx = Math.max(b.vx, 2);
                b.rolling = true;
                if (gap.animTimer === 1) sndPipe();
                break;
            }
            case 'wheel': {
                const cx = px + PIECE_W / 2;
                const cy2 = py + PIECE_H / 2;
                const angle = gap.animTimer * 0.08;
                const armLen = 25;
                const bx = cx + Math.cos(angle) * armLen;
                const by = cy2 + Math.sin(angle) * armLen;
                b.x = bx;
                b.y = by - BALL_R;
                if (gap.animTimer > 20) {
                    b.vx = 3;
                    b.vy = -3;
                }
                if (gap.animTimer === 1) sndWheel();
                break;
            }
        }
    }

    // ── Particles & Debris ──────────────────────────────────
    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                life: 1,
                decay: 0.02 + Math.random() * 0.03,
                color, size: 2 + Math.random() * 3,
                sprite: null
            });
        }
    }

    function spawnDebris(x, y, material, count) {
        const debrisKeys = {
            wood:  ['debrisWood1', 'debrisWood2', 'debrisWood3'],
            metal: ['debrisMetal1', 'debrisMetal2', 'debrisMetal3'],
            glass: ['debrisGlass1', 'debrisGlass2', 'debrisGlass3']
        };
        const keys = debrisKeys[material] || debrisKeys.wood;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 4;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 3,
                life: 1,
                decay: 0.015 + Math.random() * 0.02,
                color: null,
                size: 8 + Math.random() * 12,
                sprite: keys[Math.floor(Math.random() * keys.length)],
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.3
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1;
            if (p.rotation !== undefined) p.rotation += p.rotSpeed || 0;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    // ── Flash effects ─────────────────────────────────────────
    function addFlash(x, y, color, radius) {
        flashEffects.push({ x, y, color, radius, life: 1, decay: 0.05 });
    }

    function updateFlashes() {
        for (let i = flashEffects.length - 1; i >= 0; i--) {
            flashEffects[i].life -= flashEffects[i].decay;
            if (flashEffects[i].life <= 0) flashEffects.splice(i, 1);
        }
    }

    // ── Drawing: Background ──────────────────────────────────
    let bgPattern = null;
    function drawBackground() {
        // Warm workshop gradient — VERY dark top, lighter bottom = looking DOWN at table
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
        grad.addColorStop(0, '#120a04');    // near-black top (far away)
        grad.addColorStop(0.1, '#1a0f07');
        grad.addColorStop(0.25, '#2a1a0e');
        grad.addColorStop(0.5, '#4a3320');
        grad.addColorStop(0.75, '#6b5138');
        grad.addColorStop(1, '#8a6b48');    // warm bright bottom (close to viewer)
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Tiled background image if loaded
        if (sprites.bgDesert) {
            ctx.globalAlpha = 0.12;
            const bgW = sprites.bgDesert.width;
            const bgH = sprites.bgDesert.height;
            const scaleX = GAME_W / bgW;
            const scaleY = GAME_H / bgH;
            const s = Math.max(scaleX, scaleY);
            ctx.drawImage(sprites.bgDesert, 0, 0, bgW * s, bgH * s);
            ctx.globalAlpha = 1;
        }

        // ── Heavy top-edge darkening (diorama depth — far end of table) ──
        const topDark = ctx.createLinearGradient(0, HUD_H, 0, HUD_H + 180);
        topDark.addColorStop(0, 'rgba(0,0,0,0.45)');
        topDark.addColorStop(0.5, 'rgba(0,0,0,0.15)');
        topDark.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = topDark;
        ctx.fillRect(0, HUD_H, GAME_W, 180);

        // ── Perspective grid — tiles CONVERGE toward vanishing point at top ──
        // This is the key "tilted table" illusion
        const vanishX = GAME_W / 2;    // vanishing point X
        const vanishY = HUD_H - 40;    // vanishing point above screen
        const gridRows = 14;
        const gridCols = 16;
        const offX = cameraX % (GAME_W / gridCols);

        ctx.save();
        ctx.strokeStyle = 'rgba(200, 170, 120, 0.07)';
        ctx.lineWidth = 0.5;

        // Horizontal lines — closer together at top, wider apart at bottom
        for (let row = 0; row <= gridRows; row++) {
            const t = row / gridRows;
            // Perspective: rows crowd together near top
            const perspT = t * t; // quadratic for perspective effect
            const rowY = HUD_H + perspT * (GAME_H - HUD_H);
            ctx.beginPath();
            ctx.moveTo(0, rowY);
            ctx.lineTo(GAME_W, rowY);
            ctx.stroke();
        }

        // Vertical lines — converge toward vanishing point
        for (let col = 0; col <= gridCols; col++) {
            const bottomX = (col / gridCols) * GAME_W - offX;
            // Lines converge toward vanishX at the top
            const topX = vanishX + (bottomX - vanishX) * 0.35;
            ctx.beginPath();
            ctx.moveTo(topX, HUD_H);
            ctx.lineTo(bottomX, GAME_H);
            ctx.stroke();
        }
        ctx.restore();

        // ── Bottom-edge brightening (close to viewer, warm light spill) ──
        const botLight = ctx.createLinearGradient(0, GAME_H - 60, 0, GAME_H);
        botLight.addColorStop(0, 'rgba(180,140,80,0)');
        botLight.addColorStop(1, 'rgba(180,140,80,0.08)');
        ctx.fillStyle = botLight;
        ctx.fillRect(0, GAME_H - 60, GAME_W, 60);

        // ── Vignette edges (tilt-shift style) ──
        // Left edge shadow
        const leftVig = ctx.createLinearGradient(0, 0, 80, 0);
        leftVig.addColorStop(0, 'rgba(0,0,0,0.25)');
        leftVig.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = leftVig;
        ctx.fillRect(0, HUD_H, 80, GAME_H - HUD_H);
        // Right edge shadow
        const rightVig = ctx.createLinearGradient(GAME_W, 0, GAME_W - 80, 0);
        rightVig.addColorStop(0, 'rgba(0,0,0,0.25)');
        rightVig.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rightVig;
        ctx.fillRect(GAME_W - 80, HUD_H, 80, GAME_H - HUD_H);

        // Ground strip with dirt/grass sprites
        drawGroundStrip();
    }

    function drawGroundStrip() {
        const groundY = GAME_H - 40;

        // ── Perspective tile grid (workbench surface) — DRAMATIC perspective ──
        const tileBase = 44;
        const tileRows = 6;
        const offX = cameraX % tileBase;

        for (let row = 0; row < tileRows; row++) {
            const t = row / tileRows;                          // 0 = bottom, 1 = top
            const tileW = tileBase * (1 - t * 0.3);           // STRONG shrink toward top
            const tileH = (40 / tileRows) * (1 - t * 0.25);
            const rowY = groundY + (40 / tileRows) * (tileRows - 1 - row);
            // Brightness: front rows lighter, back rows darker
            const brightness = 1 - t * 0.4;

            for (let x = -offX - tileW; x < GAME_W + tileW; x += tileW) {
                const col = Math.floor((x + offX) / tileW);
                const isLight = (row + col) % 2 === 0;
                const r = Math.round((isLight ? 120 : 95) * brightness);
                const g = Math.round((isLight ? 85 : 68) * brightness);
                const b = Math.round((isLight ? 55 : 42) * brightness);
                ctx.fillStyle = `rgba(${r},${g},${b},0.75)`;
                ctx.fillRect(x, rowY, tileW - 1, tileH - 0.5);
            }
        }

        // Dirt base sprites on top of tiles
        if (sprites.dirt) {
            const dirtW = 70, dirtH = 35;
            ctx.globalAlpha = 0.35;
            for (let x = -(cameraX % dirtW); x < GAME_W + dirtW; x += dirtW) {
                ctx.drawImage(sprites.dirt, x, groundY, dirtW, dirtH);
            }
            ctx.globalAlpha = 1;
        }

        // Front edge of workbench — THICK isometric thickness (like viewing table edge)
        const edgeH = 14;
        const edgeGrad = ctx.createLinearGradient(0, GAME_H - edgeH, 0, GAME_H);
        edgeGrad.addColorStop(0, 'rgba(90,62,35,0.9)');
        edgeGrad.addColorStop(0.3, 'rgba(70,48,28,0.85)');
        edgeGrad.addColorStop(1, 'rgba(35,22,10,0.9)');
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(0, GAME_H - edgeH, GAME_W, edgeH);
        // Bright top edge of table front
        ctx.strokeStyle = 'rgba(160,120,70,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, GAME_H - edgeH);
        ctx.lineTo(GAME_W, GAME_H - edgeH);
        ctx.stroke();

        // Occasional grass tufts with drop shadow
        if (sprites.grass) {
            for (let x = -(cameraX % 120); x < GAME_W + 120; x += 120) {
                // Grass shadow
                ctx.save();
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = 'rgba(0,0,0,1)';
                ctx.beginPath();
                ctx.ellipse(x + 40 + DEPTH_X * 0.5, groundY - 2 + DEPTH_Y * 0.5, 20, 4, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                ctx.drawImage(sprites.grass, x + 20, groundY - 14, 40, 22);
            }
        }
        // Occasional rocks with LARGE drop shadow
        if (sprites.rock) {
            for (let x = -(cameraX % 300) + 50; x < GAME_W + 300; x += 300) {
                ctx.save();
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = 'rgba(10,5,2,1)';
                ctx.beginPath();
                ctx.ellipse(x + 12 + DEPTH_X, groundY - 2 + DEPTH_Y, 18, 7, 0.1, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                ctx.drawImage(sprites.rock, x, groundY - 10, 26, 20);
                // Highlight on top-left of rock
                ctx.save();
                ctx.globalAlpha = 0.2;
                ctx.strokeStyle = 'rgba(255,240,200,1)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x + 6, groundY - 6, 8, Math.PI, Math.PI * 1.5);
                ctx.stroke();
                ctx.restore();
            }
        }
    }

    // ── Drawing: Track ───────────────────────────────────────
    function drawTrack() {
        ctx.save();
        ctx.translate(-cameraX, 0);

        // Draw track segments using wood sprites
        for (const seg of trackSegments) {
            drawTrackSegment(seg);
        }

        // Draw gaps (placement zones)
        for (let i = 0; i < gaps.length; i++) {
            const g = gaps[i];
            if (g.filled) {
                drawPlacedPiece(g);
            } else {
                drawEmptyGap(g, i === activeGapIdx);
            }
        }

        // Finish flag
        drawFinishFlag();

        ctx.restore();
    }

    function drawTrackSegment(seg) {
        const endY = seg.endY || seg.y;
        const thickness = 14;  // thicker track planks

        // ── THICK isometric underside for track — clearly visible depth ──
        // Right side face of track (dark)
        ctx.save();
        const rightFaceGrad = ctx.createLinearGradient(seg.x + seg.w, seg.y, seg.x + seg.w + DEPTH_X, seg.y);
        rightFaceGrad.addColorStop(0, 'rgba(65,42,22,0.7)');
        rightFaceGrad.addColorStop(1, 'rgba(20,10,4,0.8)');
        ctx.fillStyle = rightFaceGrad;
        ctx.beginPath();
        ctx.moveTo(seg.x + seg.w, endY - 1);
        ctx.lineTo(seg.x + seg.w + DEPTH_X, endY + DEPTH_Y - 1);
        ctx.lineTo(seg.x + seg.w + DEPTH_X, endY + thickness + DEPTH_Y);
        ctx.lineTo(seg.x + seg.w, endY + thickness);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Bottom face of track (visible underside — dark wood)
        ctx.save();
        const botFaceGrad = ctx.createLinearGradient(seg.x, seg.y + thickness, seg.x, seg.y + thickness + DEPTH_Y);
        botFaceGrad.addColorStop(0, 'rgba(80,55,30,0.75)');
        botFaceGrad.addColorStop(1, 'rgba(30,18,8,0.85)');
        ctx.fillStyle = botFaceGrad;
        ctx.beginPath();
        ctx.moveTo(seg.x, seg.y + thickness);
        ctx.lineTo(seg.x + DEPTH_X, seg.y + thickness + DEPTH_Y);
        ctx.lineTo(seg.x + seg.w + DEPTH_X, endY + thickness + DEPTH_Y);
        ctx.lineTo(seg.x + seg.w, endY + thickness);
        ctx.closePath();
        ctx.fill();
        // Subtle line at top of bottom face
        ctx.strokeStyle = 'rgba(100,70,40,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(seg.x, seg.y + thickness);
        ctx.lineTo(seg.x + seg.w, endY + thickness);
        ctx.stroke();
        ctx.restore();

        // Drop shadow under the entire track segment
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.beginPath();
        ctx.moveTo(seg.x + DEPTH_X + 2, seg.y + thickness + DEPTH_Y + 4);
        ctx.lineTo(seg.x + seg.w + DEPTH_X + 2, endY + thickness + DEPTH_Y + 4);
        ctx.lineTo(seg.x + seg.w + DEPTH_X + 2, endY + thickness + DEPTH_Y + 8);
        ctx.lineTo(seg.x + DEPTH_X + 2, seg.y + thickness + DEPTH_Y + 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Wood plank track surface
        if (sprites.woodPlank) {
            const segLen = seg.w;
            const plankW = 70;
            const steps = Math.ceil(segLen / plankW);

            for (let i = 0; i < steps; i++) {
                const t0 = i / steps;
                const t1 = Math.min((i + 1) / steps, 1);
                const x0 = seg.x + t0 * segLen;
                const y0 = seg.y + t0 * (endY - seg.y);
                const x1 = seg.x + t1 * segLen;
                const y1 = seg.y + t1 * (endY - seg.y);
                const angle = Math.atan2(y1 - y0, x1 - x0);
                const pw = Math.min(plankW, (t1 - t0) * segLen + 4);

                ctx.save();
                ctx.translate((x0 + x1) / 2, (y0 + y1) / 2);
                ctx.rotate(angle);
                ctx.drawImage(sprites.woodPlank, -pw / 2, -thickness / 2, pw, thickness);
                ctx.restore();
            }

            // ── Top-left highlight on track surface ──
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = 'rgba(255,245,210,1)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(seg.x, seg.y - 1);
            ctx.lineTo(seg.x + seg.w, endY - 1);
            ctx.stroke();
            ctx.restore();
            // ── Bottom-right shadow on track surface ──
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.strokeStyle = 'rgba(10,5,0,1)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(seg.x, seg.y + thickness);
            ctx.lineTo(seg.x + seg.w, endY + thickness);
            ctx.stroke();
            ctx.restore();
        } else {
            // Fallback: simple line
            ctx.strokeStyle = '#8B7355';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(seg.x, seg.y);
            ctx.lineTo(seg.x + seg.w, endY);
            ctx.stroke();
        }

        // Support posts under track — with thick depth faces
        if (sprites.woodPost) {
            const postSpacing = 80;
            const postW = 10;
            for (let px = seg.x + 20; px < seg.x + seg.w - 10; px += postSpacing) {
                const t = (px - seg.x) / seg.w;
                const py = seg.y + t * (endY - seg.y) + thickness;
                const postH = Math.min(60, GAME_H - py - 40);
                if (postH > 10) {
                    // Post right side face
                    ctx.save();
                    ctx.fillStyle = 'rgba(50,30,15,0.6)';
                    ctx.beginPath();
                    ctx.moveTo(px + postW / 2, py);
                    ctx.lineTo(px + postW / 2 + DEPTH_X * 0.6, py + DEPTH_Y * 0.6);
                    ctx.lineTo(px + postW / 2 + DEPTH_X * 0.6, py + postH + DEPTH_Y * 0.6);
                    ctx.lineTo(px + postW / 2, py + postH);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                    // Post shadow
                    ctx.globalAlpha = 0.35;
                    ctx.fillStyle = 'rgba(10,5,2,1)';
                    ctx.fillRect(px - postW / 2 + DEPTH_X, py + DEPTH_Y, postW, postH);
                    ctx.globalAlpha = 0.6;
                    ctx.drawImage(sprites.woodPost, px - postW / 2, py, postW, postH);
                    // Post highlight (left edge)
                    ctx.globalAlpha = 0.2;
                    ctx.strokeStyle = 'rgba(255,240,200,1)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(px - postW / 2, py);
                    ctx.lineTo(px - postW / 2, py + postH);
                    ctx.stroke();
                    // Ambient occlusion at post base
                    drawAmbientOcclusion(px - postW / 2 - 2, py, postW + 4, postH);
                    ctx.globalAlpha = 1;
                }
            }
        }
    }

    function drawEmptyGap(g, isNext) {
        // Highlighted zone with dashed border
        ctx.fillStyle = isNext ? 'rgba(255, 200, 50, 0.12)' : 'rgba(255, 100, 100, 0.06)';
        ctx.fillRect(g.x, g.y - PIECE_H + 10, g.w, PIECE_H);

        ctx.strokeStyle = isNext ? 'rgba(255, 200, 50, 0.5)' : 'rgba(255, 100, 100, 0.25)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(g.x, g.y - PIECE_H + 10, g.w, PIECE_H);
        ctx.setLineDash([]);

        // Small piece-type icon hint
        if (isNext) {
            ctx.fillStyle = 'rgba(255, 200, 50, 0.8)';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(PIECE_NAMES[g.requiredPiece], g.x + g.w / 2, g.y - PIECE_H + 5);

            // Pulsing arrow indicator
            const pulse = Math.sin(Date.now() * 0.006) * 4;
            ctx.fillStyle = 'rgba(255, 200, 50, 0.6)';
            ctx.beginPath();
            ctx.moveTo(g.x + g.w / 2, g.y - PIECE_H - 5 + pulse);
            ctx.lineTo(g.x + g.w / 2 - 8, g.y - PIECE_H - 15 + pulse);
            ctx.lineTo(g.x + g.w / 2 + 8, g.y - PIECE_H - 15 + pulse);
            ctx.closePath();
            ctx.fill();
        }
    }

    function drawFinishFlag() {
        const lastSeg = trackSegments[trackSegments.length - 1];
        if (!lastSeg) return;
        const fx = lastSeg.x + lastSeg.w - 20;
        const fy = (lastSeg.endY || lastSeg.y) - 50;

        // ── LARGE isometric flag shadow ──
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = 'rgba(5,2,0,1)';
        ctx.beginPath();
        ctx.ellipse(fx + 15 + DEPTH_X * 1.5, fy + 55 + DEPTH_Y * 1.2, 28, 10, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = 'rgba(10,5,2,1)';
        ctx.beginPath();
        ctx.ellipse(fx + 15 + DEPTH_X, fy + 52 + DEPTH_Y, 20, 7, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (sprites.flagGreen) {
            ctx.drawImage(sprites.flagGreen, fx - 5, fy - 5, 40, 55);
            // Highlight edge on flag pole (top-left light) — strong
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = 'rgba(255,245,210,1)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(fx - 3, fy + 50);
            ctx.lineTo(fx - 3, fy - 3);
            ctx.stroke();
            ctx.restore();
            // Flag pole right-side dark edge
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.strokeStyle = 'rgba(10,5,0,1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(fx + 1, fy + 50);
            ctx.lineTo(fx + 1, fy - 3);
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.fillStyle = CLR_SECONDARY;
            ctx.fillRect(fx, fy, 4, 50);
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 3; c++) {
                    ctx.fillStyle = ((r + c) % 2 === 0) ? '#fff' : '#111';
                    ctx.fillRect(fx + 4 + c * 8, fy + r * 8, 8, 8);
                }
            }
        }
    }

    // ── Drawing: Piece Graphics (Kenney Sprites) ─────────────
    function drawPieceGraphic(type, x, y, w, h, animT, ctx2) {
        const c = ctx2 || ctx;
        c.save();

        switch (type) {
            case 'ramp': drawRamp(c, x, y, w, h, animT); break;
            case 'funnel': drawFunnel(c, x, y, w, h, animT); break;
            case 'seesaw': drawSeesaw(c, x, y, w, h, animT); break;
            case 'trampoline': drawTrampoline(c, x, y, w, h, animT); break;
            case 'dominos': drawDominos(c, x, y, w, h, animT); break;
            case 'fan': drawFan(c, x, y, w, h, animT); break;
            case 'bucket': drawBucket(c, x, y, w, h, animT); break;
            case 'spring': drawSpring(c, x, y, w, h, animT); break;
            case 'conveyor': drawConveyor(c, x, y, w, h, animT); break;
            case 'catapult': drawCatapult(c, x, y, w, h, animT); break;
            case 'pipe': drawPipe(c, x, y, w, h, animT); break;
            case 'wheel': drawWheel(c, x, y, w, h, animT); break;
        }

        c.restore();
    }

    function drawRamp(c, x, y, w, h, animT) {
        // Angled wood plank ramp
        if (sprites.woodPlank) {
            const angle = Math.atan2(20, w);
            c.save();
            c.translate(x + w / 2, y + h / 2 + 5);
            c.rotate(angle);
            c.drawImage(sprites.woodPlank, -w / 2, -6, w, 12);
            c.restore();
            // Support triangles underneath
            if (sprites.woodTiny) {
                c.drawImage(sprites.woodTiny, x + 2, y + h - 16, 16, 16);
                c.drawImage(sprites.woodTiny, x + w - 18, y + h - 12, 16, 12);
            }
        } else {
            c.fillStyle = '#8B6914';
            c.beginPath();
            c.moveTo(x, y + h);
            c.lineTo(x + w, y + h - 5);
            c.lineTo(x + w, y + 10);
            c.closePath();
            c.fill();
        }
    }

    function drawFunnel(c, x, y, w, h, animT) {
        // Two angled glass/wood pieces forming a V
        if (sprites.glassTriangle) {
            // Left funnel wall
            c.save();
            c.translate(x + w * 0.25, y + h * 0.4);
            c.rotate(-0.4);
            c.drawImage(sprites.glassTriangle, -12, -20, 24, 40);
            c.restore();
            // Right funnel wall (mirrored)
            c.save();
            c.translate(x + w * 0.75, y + h * 0.4);
            c.rotate(0.4);
            c.drawImage(sprites.glassTriangle, -12, -20, 24, 40);
            c.restore();
            // Bottom chute
            if (sprites.metalBar) {
                c.drawImage(sprites.metalBar, x + w / 2 - 8, y + h - 14, 16, 14);
            }
        } else {
            c.fillStyle = '#4ade80';
            c.beginPath();
            c.moveTo(x + 5, y);
            c.lineTo(x + w - 5, y);
            c.lineTo(x + w / 2 + 8, y + h - 5);
            c.lineTo(x + w / 2 - 8, y + h - 5);
            c.closePath();
            c.fill();
        }
    }

    function drawSeesaw(c, x, y, w, h, animT) {
        const pivotX = x + w / 2;
        const pivotY = y + h - 10;
        const tilt = animT ? Math.sin(animT * 0.1) * 0.2 : 0;

        // Metal gear as pivot
        if (sprites.metalGear) {
            const gearAngle = animT ? animT * 0.05 : 0;
            c.save();
            c.translate(pivotX, pivotY);
            c.rotate(gearAngle);
            c.drawImage(sprites.metalGear, -12, -12, 24, 24);
            c.restore();
        } else {
            c.fillStyle = '#888';
            c.beginPath();
            c.moveTo(pivotX - 5, pivotY + 10);
            c.lineTo(pivotX + 5, pivotY + 10);
            c.lineTo(pivotX, pivotY);
            c.closePath();
            c.fill();
        }

        // Wood plank as the beam
        if (sprites.woodPlank) {
            c.save();
            c.translate(pivotX, pivotY - 4);
            c.rotate(tilt);
            c.drawImage(sprites.woodPlank, -(w - 10) / 2, -5, w - 10, 10);
            c.restore();
        } else {
            c.save();
            c.translate(pivotX, pivotY);
            c.rotate(tilt);
            c.fillStyle = CLR_ACCENT;
            c.fillRect(-w / 2 + 5, -4, w - 10, 8);
            c.restore();
        }
    }

    function drawTrampoline(c, x, y, w, h, animT) {
        const compress = animT ? Math.max(0, 1 - animT / 10) * 5 : 0;

        // Metal legs
        if (sprites.metalSmall) {
            c.drawImage(sprites.metalSmall, x + 8, y + h - 18, 8, 18);
            c.drawImage(sprites.metalSmall, x + w - 16, y + h - 18, 8, 18);
        } else {
            c.fillStyle = '#888';
            c.fillRect(x + 10, y + h - 15, 5, 15);
            c.fillRect(x + w - 15, y + h - 15, 5, 15);
        }

        // Bouncy red surface — metal plate with spring curve
        if (sprites.metalPlate) {
            c.save();
            c.translate(x + w / 2, y + h - 18 + compress);
            const scaleY = 1 - compress * 0.05;
            c.scale(1, scaleY);
            c.drawImage(sprites.metalPlate, -(w - 16) / 2, -5, w - 16, 10);
            c.restore();
        }

        // Spring coils visual
        c.strokeStyle = '#EF4444';
        c.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            const sx = x + 18 + i * ((w - 36) / 2);
            c.beginPath();
            c.moveTo(sx, y + h - 6);
            c.quadraticCurveTo(sx + 6, y + h - 14 + compress, sx + 12, y + h - 6);
            c.stroke();
        }
    }

    function drawDominos(c, x, y, w, h, animT) {
        const count = 5;
        const spacing = (w - 10) / count;

        for (let i = 0; i < count; i++) {
            const fallAngle = animT ? Math.min(1, Math.max(0, (animT - i * 5) / 10)) * Math.PI / 3 : 0;

            c.save();
            c.translate(x + 10 + i * spacing, y + h - 5);
            c.rotate(-fallAngle);

            if (sprites.woodBlock) {
                c.drawImage(sprites.woodBlock, -5, -28, 10, 28);
            } else {
                c.fillStyle = i % 2 === 0 ? '#8B6914' : '#A0791A';
                c.fillRect(-4, -25, 8, 25);
            }
            c.restore();
        }

        // Base platform
        if (sprites.woodWide) {
            c.globalAlpha = 0.7;
            c.drawImage(sprites.woodWide, x + 3, y + h - 6, w - 6, 6);
            c.globalAlpha = 1;
        }
    }

    function drawFan(c, x, y, w, h, animT) {
        const bladeAngle = animT ? animT * 0.3 : 0;

        // Fan housing / stand
        if (sprites.metalBlock) {
            c.drawImage(sprites.metalBlock, x + w / 2 - 8, y + h - 22, 16, 22);
        } else {
            c.fillStyle = '#555';
            c.fillRect(x + w / 2 - 5, y + h - 20, 10, 20);
        }

        // Spinning blades using gear sprite
        if (sprites.metalGear) {
            c.save();
            c.translate(x + w / 2, y + h - 24);
            c.rotate(bladeAngle);
            c.drawImage(sprites.metalGear, -18, -18, 36, 36);
            c.restore();
        } else {
            c.save();
            c.translate(x + w / 2, y + h - 22);
            for (let b = 0; b < 4; b++) {
                c.save();
                c.rotate(bladeAngle + b * Math.PI / 2);
                c.fillStyle = '#10B981';
                c.beginPath();
                c.ellipse(0, -12, 4, 12, 0, 0, Math.PI * 2);
                c.fill();
                c.restore();
            }
            c.restore();
        }

        // Wind effect lines
        if (animT > 0) {
            c.strokeStyle = 'rgba(180, 230, 255, 0.4)';
            c.lineWidth = 1.5;
            for (let i = 0; i < 4; i++) {
                const ly = y + h - 30 + i * 7;
                const lx = x + w / 2 + 18 + ((animT * 3 + i * 12) % 35);
                c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 18, ly); c.stroke();
            }
        }
    }

    function drawBucket(c, x, y, w, h, animT) {
        // Pulley mechanism at top
        if (sprites.metalRound) {
            c.drawImage(sprites.metalRound, x + w / 2 - 8, y - 2, 16, 16);
        }
        // Rope
        c.strokeStyle = '#A0791A';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x + w / 2, y + 10);
        c.lineTo(x + w / 2, y + 18);
        c.stroke();

        // Bucket body using wood sprites
        if (sprites.woodChannel) {
            c.drawImage(sprites.woodChannel, x + 12, y + 16, w - 24, h - 20);
        } else {
            c.fillStyle = '#8B6914';
            c.beginPath();
            c.moveTo(x + 15, y + 10);
            c.lineTo(x + w - 15, y + 10);
            c.lineTo(x + w - 20, y + h - 5);
            c.lineTo(x + 20, y + h - 5);
            c.closePath();
            c.fill();
        }

        // Metal rim bands
        if (sprites.metalSmall) {
            c.globalAlpha = 0.6;
            c.drawImage(sprites.metalSmall, x + 14, y + 20, w - 28, 4);
            c.drawImage(sprites.metalSmall, x + 16, y + h - 12, w - 32, 4);
            c.globalAlpha = 1;
        }
    }

    function drawSpring(c, x, y, w, h, animT) {
        const compress = animT ? Math.sin(Math.min(animT * 0.3, Math.PI)) * 10 : 0;

        // Base stone block
        if (sprites.stoneBlock) {
            c.drawImage(sprites.stoneBlock, x + 10, y + h - 12, w - 20, 12);
        } else {
            c.fillStyle = '#666';
            c.fillRect(x + 10, y + h - 10, w - 20, 10);
        }

        // Spring coils (drawn)
        c.strokeStyle = '#EF4444';
        c.lineWidth = 3;
        c.beginPath();
        const coils = 5;
        for (let i = 0; i <= coils; i++) {
            const cy2 = y + h - 12 - (i / coils) * (h - 22 - compress);
            const cx2 = x + w / 2 + ((i % 2 === 0) ? -12 : 12);
            if (i === 0) c.moveTo(x + w / 2, y + h - 12);
            else c.lineTo(cx2, cy2);
        }
        c.stroke();

        // Top launch plate (metal)
        if (sprites.metalPlate) {
            c.drawImage(sprites.metalPlate, x + 8, y + 8 + compress, w - 16, 8);
        } else {
            c.fillStyle = '#888';
            c.fillRect(x + 10, y + 10 + compress, w - 20, 6);
        }

        // TNT decoration for explosive feel
        if (sprites.tntTriangle) {
            c.globalAlpha = 0.4;
            c.drawImage(sprites.tntTriangle, x + w / 2 - 8, y + h / 2 - 4 + compress / 2, 16, 12);
            c.globalAlpha = 1;
        }
    }

    function drawConveyor(c, x, y, w, h, animT) {
        // Metal frame
        if (sprites.metalBlock) {
            c.globalAlpha = 0.8;
            c.drawImage(sprites.metalBlock, x + 3, y + 3, w - 6, h - 6);
            c.globalAlpha = 1;
        } else {
            c.fillStyle = '#444';
            c.fillRect(x + 5, y + 5, w - 10, h - 10);
        }

        // Belt surface - moving metal plates
        const rollOffset = animT ? (animT * 2) % 22 : 0;
        if (sprites.metalSmall) {
            for (let i = -1; i < 5; i++) {
                const rx = x + 6 + i * 18 + rollOffset;
                if (rx > x + 3 && rx < x + w - 14) {
                    c.drawImage(sprites.metalSmall, rx, y + h / 2 - 4, 14, 8);
                }
            }
        }

        // Roller wheels on ends
        if (sprites.metalRound) {
            c.drawImage(sprites.metalRound, x + 2, y + h / 2 - 6, 12, 12);
            c.drawImage(sprites.metalRound, x + w - 14, y + h / 2 - 6, 12, 12);
        }

        // Direction arrows
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.font = 'bold 14px monospace';
        c.textAlign = 'center';
        c.fillText('\u00BB\u00BB', x + w / 2, y + h / 2 + 5);
    }

    function drawCatapult(c, x, y, w, h, animT) {
        const armAngle = animT ? Math.min(animT / 15, 1) * -Math.PI / 3 : 0;

        // Stone base
        if (sprites.stoneWide) {
            c.drawImage(sprites.stoneWide, x + 8, y + h - 14, w - 16, 14);
        } else {
            c.fillStyle = '#654321';
            c.fillRect(x + 10, y + h - 12, w - 20, 12);
        }

        // Arm pivot
        c.save();
        c.translate(x + w * 0.4, y + h - 14);
        c.rotate(armAngle);

        // Wood beam arm
        if (sprites.woodBeam) {
            c.drawImage(sprites.woodBeam, -4, -(h - 22), 8, h - 22);
        } else {
            c.fillStyle = '#8B6914';
            c.fillRect(-3, -h + 20, 6, h - 20);
        }

        // Cup at end (using wood channel)
        if (sprites.woodChannel) {
            c.drawImage(sprites.woodChannel, -12, -(h - 18), 24, 14);
        } else {
            c.fillStyle = CLR_ACCENT;
            c.beginPath();
            c.arc(0, -h + 20, 10, 0, Math.PI);
            c.fill();
        }
        c.restore();

        // Metal bolt pivot point
        if (sprites.metalBolt) {
            c.drawImage(sprites.metalBolt, x + w * 0.4 - 5, y + h - 18, 10, 10);
        }
    }

    function drawPipe(c, x, y, w, h, animT) {
        // Pipe body using glass tube or metal
        if (sprites.glassTube) {
            c.drawImage(sprites.glassTube, x + 2, y + h / 2 - 14, w - 4, 28);
        } else if (sprites.metalBar) {
            c.drawImage(sprites.metalBar, x + 2, y + h / 2 - 12, w - 4, 24);
        } else {
            c.fillStyle = '#666';
            c.beginPath();
            c.roundRect(x + 2, y + h / 2 - 12, w - 4, 24, [12]);
            c.fill();
        }

        // Pipe openings (metal rounds)
        if (sprites.metalRound) {
            c.drawImage(sprites.metalRound, x - 2, y + h / 2 - 10, 20, 20);
            c.drawImage(sprites.metalRound, x + w - 18, y + h / 2 - 10, 20, 20);
        }

        // Flow indicator ball inside pipe
        if (animT > 0) {
            const t = (animT * 5) % w;
            if (sprites.coinSilver) {
                drawSpriteAt('coinSilver', x + t, y + h / 2, 10, 0, 0.6);
            } else {
                c.fillStyle = 'rgba(100, 200, 255, 0.5)';
                c.beginPath(); c.arc(x + t, y + h / 2, 4, 0, Math.PI * 2); c.fill();
            }
        }
    }

    function drawWheel(c, x, y, w, h, animT) {
        const cx2 = x + w / 2;
        const cy2 = y + h / 2;
        const radius = Math.min(w, h) / 2 - 5;
        const angle = animT ? animT * 0.08 : 0;

        // Wood wheel rim
        if (sprites.woodWheel) {
            c.save();
            c.translate(cx2, cy2);
            c.rotate(angle);
            c.drawImage(sprites.woodWheel, -radius, -radius, radius * 2, radius * 2);
            c.restore();
        } else {
            c.strokeStyle = CLR_ACCENT;
            c.lineWidth = 3;
            c.beginPath(); c.arc(cx2, cy2, radius, 0, Math.PI * 2); c.stroke();
        }

        // Metal gear overlay (inner)
        if (sprites.metalGear) {
            c.save();
            c.translate(cx2, cy2);
            c.rotate(-angle * 0.5);
            c.globalAlpha = 0.6;
            c.drawImage(sprites.metalGear, -radius * 0.5, -radius * 0.5, radius, radius);
            c.globalAlpha = 1;
            c.restore();
        }

        // Paddles / spokes
        c.strokeStyle = '#A0791A';
        c.lineWidth = 3;
        for (let p = 0; p < 4; p++) {
            const a = angle + p * Math.PI / 2;
            c.beginPath();
            c.moveTo(cx2, cy2);
            c.lineTo(cx2 + Math.cos(a) * radius * 0.9, cy2 + Math.sin(a) * radius * 0.9);
            c.stroke();
        }

        // Center axle bolt
        if (sprites.metalBolt) {
            c.drawImage(sprites.metalBolt, cx2 - 5, cy2 - 5, 10, 10);
        }
    }

    function drawPlacedPiece(gap) {
        const animT = gap.activated ? gap.animTimer : 0;
        const px = gap.x, py = gap.y - PIECE_H + 10;

        // ── Isometric depth shadow behind piece ──
        drawDepthShadow(px, py, gap.w, PIECE_H);
        // Side face (bottom + right edge)
        drawSideFace(px, py, gap.w, PIECE_H);

        // Main piece render
        drawPieceGraphic(gap.placedPiece, px, py, gap.w, PIECE_H, animT);

        // ── Ambient occlusion at base ──
        drawAmbientOcclusion(px, py, gap.w, PIECE_H);
        // ── Top-left highlight edge ──
        drawHighlightEdge(px, py, gap.w, PIECE_H);
    }

    // ── Drawing: Ball (Gold Coin Sprite) ─────────────────────
    function drawBalls() {
        ctx.save();
        ctx.translate(-cameraX, 0);

        // Ball trail using star sprites
        for (let i = 0; i < ballTrail.length; i++) {
            const t = ballTrail[i];
            const alpha = (i / ballTrail.length) * 0.4;
            const size = BALL_R * 1.5 * (i / ballTrail.length);
            const starKeys = ['star1', 'star2', 'star3'];
            const key = starKeys[i % 3];
            if (sprites[key]) {
                drawSpriteAt(key, t.x, t.y, size, t.age * 0.05, alpha);
            } else {
                ctx.fillStyle = `rgba(255, 200, 100, ${alpha})`;
                ctx.beginPath();
                ctx.arc(t.x, t.y, size * 0.3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        for (const b of balls) {
            if (!b.alive) continue;

            // ── LARGE isometric drop shadow — clearly separated from ball ──
            const trackYAtBall = getTrackYAt(b.x);
            const heightAboveTrack = trackYAtBall !== null ? Math.max(0, trackYAtBall - b.y) : 40;
            const shadowScale = 1.3 + heightAboveTrack * 0.025;
            const shadowSep = Math.max(6, heightAboveTrack * 0.4);  // separation grows with height
            const shadowAlpha = Math.max(0.15, 0.55 - heightAboveTrack * 0.004);
            ctx.save();
            // Outer soft shadow (large, blurry)
            ctx.globalAlpha = shadowAlpha * 0.5;
            ctx.fillStyle = 'rgba(5,2,0,1)';
            ctx.beginPath();
            ctx.ellipse(
                b.x + DEPTH_X * 1.2,
                (trackYAtBall !== null ? trackYAtBall : b.y + shadowSep) + DEPTH_Y + 2,
                BALL_R * shadowScale * 1.8,
                BALL_R * shadowScale * 0.7,
                0.15, 0, Math.PI * 2
            );
            ctx.fill();
            // Inner hard shadow (darker, sharper)
            ctx.globalAlpha = shadowAlpha;
            ctx.fillStyle = 'rgba(10,5,2,1)';
            ctx.beginPath();
            ctx.ellipse(
                b.x + DEPTH_X,
                (trackYAtBall !== null ? trackYAtBall : b.y + shadowSep) + DEPTH_Y,
                BALL_R * shadowScale * 1.3,
                BALL_R * shadowScale * 0.5,
                0.15, 0, Math.PI * 2
            );
            ctx.fill();
            ctx.restore();

            // Outer glow
            const grd = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, BALL_R * 3);
            grd.addColorStop(0, 'rgba(255, 215, 0, 0.25)');
            grd.addColorStop(1, 'rgba(255, 215, 0, 0)');
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(b.x, b.y, BALL_R * 3, 0, Math.PI * 2);
            ctx.fill();

            // Gold coin sprite as ball
            if (sprites.coinGold) {
                drawSpriteAt('coinGold', b.x, b.y, BALL_R * 2.4, b.angle);
            } else {
                // Fallback: shiny metallic ball
                const ballGrad = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, BALL_R);
                ballGrad.addColorStop(0, '#FFD700');
                ballGrad.addColorStop(0.5, '#DAA520');
                ballGrad.addColorStop(1, '#B8860B');
                ctx.fillStyle = ballGrad;
                ctx.beginPath();
                ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
                ctx.fill();
            }

            // Sparkle effect when rolling fast
            if (b.rolling && Math.abs(b.vx) > 2) {
                const sparkleKey = ['star1', 'star2', 'star3'][Math.floor(Date.now() / 100) % 3];
                if (sprites[sparkleKey]) {
                    drawSpriteAt(sparkleKey, b.x - b.vx * 2, b.y, 8, Date.now() * 0.01, 0.5);
                }
            }
        }

        ctx.restore();
    }

    // ── Drawing: Particles & Effects ─────────────────────────
    function drawParticles() {
        ctx.save();
        ctx.translate(-cameraX, 0);
        for (const p of particles) {
            ctx.globalAlpha = p.life;
            if (p.sprite && sprites[p.sprite]) {
                // Debris sprite particle
                ctx.save();
                ctx.translate(p.x, p.y);
                if (p.rotation) ctx.rotate(p.rotation);
                const s = p.size * p.life;
                ctx.drawImage(sprites[p.sprite], -s / 2, -s / 2, s, s);
                ctx.restore();
            } else if (p.color) {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawFlashes() {
        ctx.save();
        ctx.translate(-cameraX, 0);
        for (const f of flashEffects) {
            ctx.globalAlpha = f.life * 0.5;
            // Use star sprite for flash
            if (sprites.star1) {
                const size = f.radius * (2 - f.life) * 2;
                drawSpriteAt('star1', f.x, f.y, size, Date.now() * 0.01, f.life * 0.6);
            } else {
                ctx.fillStyle = f.color;
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.radius * (2 - f.life), 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // ── Drawing: Queue Panel ─────────────────────────────────
    function drawQueue() {
        // Panel background (workshop-styled)
        ctx.fillStyle = 'rgba(45, 30, 18, 0.9)';
        ctx.beginPath();
        ctx.roundRect(QUEUE_X - 5, QUEUE_Y - 25, 70, QUEUE_GAP * 3 + 35, [8]);
        ctx.fill();
        ctx.strokeStyle = 'rgba(160, 120, 60, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Wood texture overlay on panel
        if (sprites.woodWide) {
            ctx.globalAlpha = 0.15;
            ctx.drawImage(sprites.woodWide, QUEUE_X - 5, QUEUE_Y - 25, 70, QUEUE_GAP * 3 + 35);
            ctx.globalAlpha = 1;
        }

        ctx.fillStyle = '#E2D5C3';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NEXT', QUEUE_X + 30, QUEUE_Y - 12);

        for (let i = 0; i < queue.length && i < 3; i++) {
            const qx = QUEUE_X;
            const qy = QUEUE_Y + i * QUEUE_GAP;
            const qw = 60, qh = 50;

            // Piece slot background
            ctx.fillStyle = i === 0 ? 'rgba(255, 200, 50, 0.1)' : 'rgba(120, 90, 50, 0.15)';
            ctx.fillRect(qx, qy, qw, qh);
            ctx.strokeStyle = i === 0 ? 'rgba(255, 200, 50, 0.5)' : 'rgba(120, 90, 50, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(qx, qy, qw, qh);

            // Mini 3D extrusion on queue pieces
            const miniDX = 4, miniDY = 5;
            ctx.save();
            ctx.fillStyle = 'rgba(40,25,12,0.5)';
            // Bottom face
            ctx.beginPath();
            ctx.moveTo(qx + 2, qy + qh - 2);
            ctx.lineTo(qx + 2 + miniDX, qy + qh - 2 + miniDY);
            ctx.lineTo(qx + qw - 2 + miniDX, qy + qh - 2 + miniDY);
            ctx.lineTo(qx + qw - 2, qy + qh - 2);
            ctx.closePath();
            ctx.fill();
            // Right face
            ctx.fillStyle = 'rgba(30,16,6,0.45)';
            ctx.beginPath();
            ctx.moveTo(qx + qw - 2, qy + 2);
            ctx.lineTo(qx + qw - 2 + miniDX, qy + 2 + miniDY);
            ctx.lineTo(qx + qw - 2 + miniDX, qy + qh - 2 + miniDY);
            ctx.lineTo(qx + qw - 2, qy + qh - 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            drawPieceGraphic(queue[i].type, qx + 2, qy + 2, qw - 4, qh - 4, 0);

            // Label
            ctx.fillStyle = '#B8A88A';
            ctx.font = '8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(PIECE_NAMES[queue[i].type], qx + qw / 2, qy + qh + 10);
        }
    }

    function drawDragPiece() {
        if (!dragPiece) return;
        const dx = dragX - PIECE_W / 2, dy = dragY - PIECE_H / 2;
        // Lifted shadow (large, offset, separated — piece is "held up")
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.beginPath();
        ctx.ellipse(dragX + DEPTH_X * 2, dragY + PIECE_H / 2 + DEPTH_Y * 2, PIECE_W * 0.55, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Side faces (piece is elevated)
        drawSideFace(dx, dy, PIECE_W, PIECE_H);
        ctx.globalAlpha = 0.85;
        drawPieceGraphic(dragPiece.type, dx, dy, PIECE_W, PIECE_H, 0);
        ctx.globalAlpha = 1;
        drawHighlightEdge(dx, dy, PIECE_W, PIECE_H);
    }

    // ── Drawing: HUD ─────────────────────────────────────────
    function drawHUD() {
        // Top bar with wood texture
        ctx.fillStyle = 'rgba(35, 22, 12, 0.85)';
        ctx.fillRect(0, 0, GAME_W, HUD_H);

        // Wood grain overlay
        if (sprites.woodWide) {
            ctx.globalAlpha = 0.1;
            ctx.drawImage(sprites.woodWide, 0, 0, GAME_W, HUD_H);
            ctx.globalAlpha = 1;
        }

        ctx.fillStyle = '#E2D5C3';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`LVL ${level + 1}`, 10, 26);

        ctx.textAlign = 'center';

        // Score with coin icon
        if (sprites.coinGold) {
            ctx.drawImage(sprites.coinGold, GAME_W / 2 - 130, 10, 20, 20);
        }
        ctx.fillText(`${totalScore}`, GAME_W / 2 - 80, 26);

        // Panic meter
        const meterW = 100, meterH = 14;
        const mx = GAME_W / 2 + 20, my = 13;
        ctx.fillStyle = 'rgba(50, 30, 15, 0.8)';
        ctx.fillRect(mx, my, meterW, meterH);
        const panicColor = panicMeter < 0.5 ? '#10B981' : (panicMeter < 0.8 ? '#F59E0B' : '#EF4444');
        ctx.fillStyle = panicColor;
        ctx.fillRect(mx, my, meterW * Math.min(1, panicMeter), meterH);
        ctx.strokeStyle = 'rgba(200, 170, 120, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(mx, my, meterW, meterH);

        ctx.fillStyle = '#E2D5C3';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PANIC', mx + meterW / 2, my + 11);

        // Lives with ball icon
        ctx.textAlign = 'right';
        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = '#E2D5C3';
        ctx.fillText(`x${lives}`, GAME_W - 70, 26);
        if (sprites.coinGold) {
            ctx.drawImage(sprites.coinGold, GAME_W - 90, 10, 18, 18);
        }

        // Combo indicator
        if (combo > 1) {
            ctx.fillStyle = '#F59E0B';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`x${combo} COMBO!`, 100, 26);
        }

        // Star rating display
        drawStarRating();
    }

    function drawStarRating() {
        // Show earned stars based on current performance
        const filledGaps = gaps ? gaps.filter(g => g.filled).length : 0;
        const totalGaps = gaps ? gaps.length : 1;
        const ratio = filledGaps / totalGaps;

        const starSize = 16;
        const startX = GAME_W - 55;
        const starY = 12;

        for (let i = 0; i < 3; i++) {
            const threshold = (i + 1) / 3;
            const key = ratio >= threshold ? 'starGold' : 'starBronze';
            if (sprites[key]) {
                ctx.drawImage(sprites[key], startX + i * 18, starY, starSize, starSize);
            }
        }
    }

    // ── Drawing: Title Screen ────────────────────────────────
    function drawTitle() {
        drawBackground();

        // Title with workshop aesthetic
        ctx.fillStyle = '#E2D5C3';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('RUBE GOLDBERG', GAME_W / 2, 110);

        ctx.font = 'bold 18px monospace';
        ctx.fillStyle = '#F59E0B';
        ctx.fillText('MACHINE BUILDER', GAME_W / 2, 140);

        // Decorative machine preview using sprites
        const cx = GAME_W / 2, cy = 250;
        ctx.save();

        // Track preview with wood planks
        if (sprites.woodPlank) {
            // Ramp section
            ctx.save();
            ctx.translate(cx - 120, cy);
            ctx.rotate(0.15);
            ctx.drawImage(sprites.woodPlank, -40, -5, 80, 10);
            ctx.restore();

            // Flat section
            ctx.drawImage(sprites.woodPlank, cx - 50, cy + 15, 60, 8);
            ctx.drawImage(sprites.woodPlank, cx + 60, cy + 25, 80, 8);
        }

        // Gear decoration
        if (sprites.metalGear) {
            const gAngle = Date.now() * 0.002;
            ctx.save();
            ctx.translate(cx + 10, cy + 10);
            ctx.rotate(gAngle);
            ctx.drawImage(sprites.metalGear, -15, -15, 30, 30);
            ctx.restore();
        }

        // Spring decoration
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            const sx = cx - 10 + i * 8;
            ctx.beginPath();
            ctx.moveTo(sx, cy + 15);
            ctx.lineTo(sx + 4, cy + 5);
            ctx.lineTo(sx + 8, cy + 15);
            ctx.stroke();
        }

        // Animated demo ball (gold coin)
        const t = Date.now() * 0.002;
        const bx = cx - 140 + ((t * 40) % 300);
        const by = cy - 15 + Math.sin(t * 3) * 15;
        if (sprites.coinGold) {
            drawSpriteAt('coinGold', bx, by, 18, t * 2);
        }

        // Trail sparkles behind demo ball
        for (let i = 1; i <= 4; i++) {
            const tx = bx - i * 12;
            const ty = cy - 15 + Math.sin((t - i * 0.05) * 3) * 15;
            const key = ['star1', 'star2', 'star3'][i % 3];
            if (sprites[key]) {
                drawSpriteAt(key, tx, ty, 6, t * 3, 0.3 / i);
            }
        }

        ctx.restore();

        // Instructions
        ctx.fillStyle = '#B8A88A';
        ctx.font = '12px monospace';
        ctx.fillText('Drag pieces from the queue into gaps', GAME_W / 2, 330);
        ctx.fillText('before the ball reaches them!', GAME_W / 2, 348);

        // Start prompt
        ctx.fillStyle = '#E2D5C3';
        ctx.font = 'bold 16px monospace';
        const pulse = 0.7 + Math.sin(Date.now() * 0.004) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.fillText('CLICK TO START', GAME_W / 2, 410);
        ctx.globalAlpha = 1;
    }

    // ── Drawing: Level Complete ───────────────────────────────
    function drawLevelComplete() {
        drawBackground();
        drawTrack();
        drawBalls();
        drawParticles();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.fillStyle = '#10B981';
        ctx.font = 'bold 30px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('LEVEL COMPLETE!', GAME_W / 2, 170);

        const timeBonus = Math.max(0, Math.floor(5000 - (Date.now() - levelStartTime) / 10));
        const perfectBonus = gaps.every(g => g.filled) ? 2000 : 0;

        // Star rating
        const stars = perfectBonus > 0 ? 3 : (timeBonus > 2000 ? 2 : 1);
        for (let i = 0; i < 3; i++) {
            const key = i < stars ? 'starGold' : 'starBronze';
            if (sprites[key]) {
                const bounce = Math.sin(Date.now() * 0.005 + i * 0.5) * 3;
                ctx.drawImage(sprites[key], GAME_W / 2 - 48 + i * 32, 185 + bounce, 28, 28);
            }
        }

        ctx.fillStyle = '#E2D5C3';
        ctx.font = '14px monospace';
        ctx.fillText(`Pieces placed: ${gaps.filter(g => g.filled).length}/${gaps.length}`, GAME_W / 2, 240);
        ctx.fillText(`Time bonus: ${timeBonus}`, GAME_W / 2, 265);
        if (perfectBonus > 0) {
            ctx.fillStyle = '#F59E0B';
            ctx.fillText(`PERFECT MACHINE: +${perfectBonus}`, GAME_W / 2, 290);
        }

        // Coin score display
        if (sprites.coinGold) {
            ctx.drawImage(sprites.coinGold, GAME_W / 2 - 60, 298, 20, 20);
        }
        ctx.fillStyle = '#E2D5C3';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(`+${score + timeBonus + perfectBonus}`, GAME_W / 2 + 5, 315);

        ctx.font = 'bold 16px monospace';
        const pulse = 0.7 + Math.sin(Date.now() * 0.004) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.fillText('CLICK FOR NEXT LEVEL', GAME_W / 2, 370);
        ctx.globalAlpha = 1;
    }

    // ── Drawing: Game Over ───────────────────────────────────
    function drawGameOver() {
        drawBackground();

        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 30px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', GAME_W / 2, 150);

        ctx.fillStyle = '#E2D5C3';
        ctx.font = '16px monospace';
        ctx.fillText(`Final Score: ${totalScore}`, GAME_W / 2, 200);
        ctx.fillText(`Level Reached: ${level + 1}`, GAME_W / 2, 230);

        // Broken machine illustration with debris sprites
        if (sprites.debrisWood1 && sprites.debrisWood2 && sprites.debrisWood3) {
            const scatter = Date.now() * 0.001;
            for (let i = 0; i < 8; i++) {
                const key = ['debrisWood1', 'debrisWood2', 'debrisWood3', 'debrisMetal1', 'debrisMetal2'][i % 5];
                if (sprites[key]) {
                    const dx = GAME_W / 2 - 80 + i * 22;
                    const dy = 280 + Math.sin(scatter + i * 0.7) * 8;
                    const r = scatter * 0.5 + i;
                    drawSpriteAt(key, dx, dy, 18, r, 0.6);
                }
            }
        }

        // Falling ball
        if (sprites.coinGold) {
            const fallY = 330 + Math.sin(Date.now() * 0.003) * 15;
            drawSpriteAt('coinGold', GAME_W / 2, fallY, 22, Date.now() * 0.005, 0.7);
        }

        // Red flag
        if (sprites.flagRed) {
            ctx.drawImage(sprites.flagRed, GAME_W / 2 - 15, 340, 30, 40);
        }

        ctx.fillStyle = '#E2D5C3';
        ctx.font = 'bold 16px monospace';
        const pulse = 0.7 + Math.sin(Date.now() * 0.004) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.fillText('CLICK TO RETRY', GAME_W / 2, 420);
        ctx.globalAlpha = 1;
    }

    // ── Drawing: Loading Screen ──────────────────────────────
    function drawLoading() {
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
        grad.addColorStop(0, '#4a3728');
        grad.addColorStop(1, '#3d2e20');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.fillStyle = '#E2D5C3';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('LOADING WORKSHOP...', GAME_W / 2, GAME_H / 2 - 30);

        // Progress bar
        const barW = 200, barH = 16;
        const bx = GAME_W / 2 - barW / 2;
        const by = GAME_H / 2;
        const progress = spritesTotal > 0 ? spritesCount / spritesTotal : 0;

        ctx.fillStyle = 'rgba(50, 30, 15, 0.8)';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(bx, by, barW * progress, barH);
        ctx.strokeStyle = 'rgba(200, 170, 120, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, barW, barH);

        ctx.fillStyle = '#B8A88A';
        ctx.font = '11px monospace';
        ctx.fillText(`${spritesCount}/${spritesTotal} sprites`, GAME_W / 2, by + barH + 20);

        // Spinning gear animation
        const gearT = Date.now() * 0.003;
        ctx.save();
        ctx.translate(GAME_W / 2, GAME_H / 2 + 70);
        ctx.rotate(gearT);
        ctx.strokeStyle = '#A0791A';
        ctx.lineWidth = 3;
        const gr = 15;
        ctx.beginPath(); ctx.arc(0, 0, gr, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * (gr - 3), Math.sin(a) * (gr - 3));
            ctx.lineTo(Math.cos(a) * (gr + 5), Math.sin(a) * (gr + 5));
            ctx.stroke();
        }
        ctx.restore();
    }

    // ── Update ────────────────────────────────────────────────
    function update(time) {
        if (state === ST_LOADING) return;
        if (!lastTime) { lastTime = time; return; }
        const rawDt = (time - lastTime) / 16.67;
        const dt = Math.min(rawDt, 3);
        lastTime = time;

        if (state === ST_PLAYING) {
            let allDead = true;
            let anyAlive = false;
            for (const b of balls) {
                if (b.alive) {
                    anyAlive = true;
                    updateBall(b, dt);
                    if (b.alive) allDead = false;
                }
            }

            if (anyAlive && allDead) {
                lives--;
                if (lives <= 0) {
                    state = ST_GAME_OVER;
                    sndGameOver();
                    stopRollingSound();
                    if (onGameOver) {
                        onGameOver({
                            score: totalScore,
                            level: level + 1,
                            duration: Math.floor((Date.now() - levelStartTime) / 1000)
                        });
                    }
                } else {
                    generateLevel(level);
                    startRollingSound();
                }
                return;
            }

            const lastSeg = trackSegments[trackSegments.length - 1];
            if (lastSeg) {
                const finishX = lastSeg.x + lastSeg.w - 30;
                const allFinished = balls.every(b => !b.alive || b.x >= finishX);
                if (allFinished && balls.some(b => b.alive)) {
                    state = ST_LEVEL_COMPLETE;
                    const timeBonus = Math.max(0, Math.floor(5000 - (Date.now() - levelStartTime) / 10));
                    const perfectBonus = gaps.every(g => g.filled) ? 2000 : 0;
                    totalScore += score + timeBonus + perfectBonus;
                    sndLevelDone();
                    stopRollingSound();
                    return;
                }
            }

            const leadBall = balls.find(b => b.alive) || balls[0];
            targetCameraX = Math.max(0, leadBall.x - GAME_W * 0.3);
            cameraX += (targetCameraX - cameraX) * 0.08;

            updatePanicMeter(leadBall);

            if (leadBall.alive && leadBall.rolling) {
                setRollingVolume(Math.abs(leadBall.vx) * 0.02);
            } else {
                setRollingVolume(0);
            }

            for (let i = 0; i < gaps.length; i++) {
                if (!gaps[i].filled) { activeGapIdx = i; break; }
                if (i === gaps.length - 1) activeGapIdx = gaps.length;
            }

            updateParticles();
            updateFlashes();

            for (const t of ballTrail) t.age++;
        }
    }

    function updatePanicMeter(leadBall) {
        const nextGap = gaps.find(g => !g.filled);
        if (!nextGap) { panicMeter = 0; return; }

        const dist = nextGap.x - leadBall.x;
        const maxDist = 300;
        if (dist > 0) {
            panicMeter = Math.max(0, 1 - dist / maxDist);
        } else {
            panicMeter = 1;
        }
    }

    // ── Draw frame ────────────────────────────────────────────
    function draw(time) {
        ctx.clearRect(0, 0, GAME_W, GAME_H);

        if (state === ST_LOADING) { drawLoading(); return; }
        if (state === ST_TITLE) { drawTitle(); return; }
        if (state === ST_LEVEL_COMPLETE) { drawLevelComplete(); return; }
        if (state === ST_GAME_OVER) { drawGameOver(); return; }

        // Playing state — isometric diorama perspective
        drawBackground();

        // ── Diorama depth layer: shadow pass ──
        // Offset down-right matching DEPTH_X/DEPTH_Y, blurred and blackened
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.translate(DEPTH_X, DEPTH_Y);
        ctx.filter = 'blur(3px) brightness(0)';
        drawTrack();
        drawBalls();
        ctx.restore();

        // Main render pass
        drawTrack();
        drawFlashes();
        drawBalls();
        drawParticles();

        // ── Diorama ground edge — isometric front lip ──
        ctx.save();
        ctx.translate(-cameraX, 0);
        const groundY = GAME_H - 40;
        // Light edge (top-left lit)
        ctx.fillStyle = 'rgba(180,140,90,0.15)';
        ctx.fillRect(0, groundY, GAME_W * 3, 2);
        // Shadow edge
        ctx.fillStyle = 'rgba(139,90,43,0.3)';
        ctx.fillRect(0, groundY + 2, GAME_W * 3, 6);
        ctx.fillStyle = 'rgba(80,50,20,0.25)';
        ctx.fillRect(0, groundY + 8, GAME_W * 3, 4);
        ctx.restore();

        // ── Subtle vignette for diorama depth ──
        const vg = ctx.createRadialGradient(GAME_W / 2, GAME_H / 2, GAME_H * 0.25, GAME_W / 2, GAME_H / 2, GAME_H * 0.75);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // ── Bottom-right shadow gradient (light from top-left) ──
        const lrGrad = ctx.createLinearGradient(GAME_W, GAME_H, GAME_W * 0.4, GAME_H * 0.4);
        lrGrad.addColorStop(0, 'rgba(0,0,0,0.12)');
        lrGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lrGrad;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        drawQueue();
        drawDragPiece();
        drawHUD();
    }

    // ── Main loop ─────────────────────────────────────────────
    function loop(time) {
        if (!canvas) return;
        update(time);
        draw(time);
        animFrame = requestAnimationFrame(loop);
    }

    // ── Input handling ────────────────────────────────────────
    function getCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) / scale,
            y: (clientY - rect.top) / scale
        };
    }

    function onPointerDown(e) {
        e.preventDefault();
        ensureAudio();

        const pos = getCanvasPos(e);

        if (state === ST_TITLE) {
            startGame();
            return;
        }
        if (state === ST_LEVEL_COMPLETE) {
            level++;
            score = 0;
            combo = 0;
            generateLevel(level);
            state = ST_PLAYING;
            startRollingSound();
            return;
        }
        if (state === ST_GAME_OVER) {
            level = 0;
            totalScore = 0;
            lives = 3;
            score = 0;
            combo = 0;
            generateLevel(level);
            state = ST_PLAYING;
            startRollingSound();
            return;
        }

        // Check if clicking on queue piece
        for (let i = 0; i < queue.length && i < 3; i++) {
            const qx = QUEUE_X, qy = QUEUE_Y + i * QUEUE_GAP;
            const qw = 60, qh = 50;
            if (pos.x >= qx && pos.x <= qx + qw && pos.y >= qy && pos.y <= qy + qh) {
                dragPiece = queue[i];
                dragFromQueue = i;
                dragX = pos.x;
                dragY = pos.y;
                return;
            }
        }
    }

    function onPointerMove(e) {
        if (!dragPiece) return;
        e.preventDefault();
        const pos = getCanvasPos(e);
        dragX = pos.x;
        dragY = pos.y;
    }

    function onPointerUp(e) {
        if (!dragPiece) return;
        e.preventDefault();

        const pos = getCanvasPos(e);
        const worldX = pos.x + cameraX;
        const worldY = pos.y;

        let placed = false;
        for (let i = 0; i < gaps.length; i++) {
            const g = gaps[i];
            if (g.filled) continue;

            const gapScreenX = g.x - cameraX;
            const gapScreenY = g.y - PIECE_H + 10;

            if (pos.x >= gapScreenX && pos.x <= gapScreenX + g.w &&
                pos.y >= gapScreenY - 20 && pos.y <= gapScreenY + PIECE_H + 20) {

                if (dragPiece.type === g.requiredPiece) {
                    g.filled = true;
                    g.placedPiece = dragPiece.type;
                    placed = true;

                    const now = Date.now();
                    const timeSinceLast = now - lastPlaceTime;
                    lastPlaceTime = now;

                    let pts = 100;
                    if (timeSinceLast < 3000) { combo++; pts *= combo; }
                    else { combo = 1; }

                    const panicBonus = Math.floor(panicMeter * 200);
                    pts += panicBonus;
                    score += pts;
                    totalScore += pts;

                    addFlash(g.x + g.w / 2, g.y, CLR_SECONDARY, 30);
                    spawnDebris(g.x + g.w / 2, g.y, 'wood', 12);
                    sndPlace();
                } else {
                    addFlash(g.x + g.w / 2, g.y, CLR_DANGER, 20);
                    spawnDebris(g.x + g.w / 2, g.y, 'glass', 6);
                    sndWrong();
                    combo = 0;
                }
                break;
            }
        }

        if (placed) {
            queue.splice(dragFromQueue, 1);
            refillQueue();
        }

        dragPiece = null;
        dragFromQueue = -1;
    }

    function onKeyDown(e) {
        if (e.key === 'Escape') {
            if (state === ST_PLAYING) {
                state = ST_GAME_OVER;
                stopRollingSound();
            }
        }
    }

    // ── Resize ────────────────────────────────────────────────
    function fitCanvas() {
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;

        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const dpr = window.devicePixelRatio || 1;

        const aspect = GAME_W / GAME_H;
        let w, h;
        if (cw / ch > aspect) {
            h = ch;
            w = ch * aspect;
        } else {
            w = cw;
            h = cw / aspect;
        }

        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        canvas.width = GAME_W * dpr;
        canvas.height = GAME_H * dpr;

        scale = w / GAME_W;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ── Start game ────────────────────────────────────────────
    function startGame() {
        level = 0;
        totalScore = 0;
        lives = 3;
        score = 0;
        combo = 0;
        lastPlaceTime = Date.now();
        generateLevel(level);
        state = ST_PLAYING;
        startRollingSound();
    }

    // ══════════════════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════════════════
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer || null;
        onGameOver = gameOverCallback || null;

        // Load player theme
        const themeId = activePlayer?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            BG_TOP = _t.bgGradient?.[0] || BG_TOP;
            BG_BOT = _t.bgGradient?.[1] || BG_BOT;
            CLR_PRIMARY = _t.colors?.[0] || CLR_PRIMARY;
            CLR_SECONDARY = _t.colors?.[1] || CLR_SECONDARY;
            CLR_ACCENT = _t.colors?.[2] || CLR_ACCENT;
            CLR_DANGER = _t.colors?.[3] || CLR_DANGER;
            CLR_TEXT = _t.colors?.[4] || CLR_TEXT;
        }

        // State init
        state = ST_LOADING;
        gameActive = true;
        particles = [];
        flashEffects = [];
        ballTrail = [];
        lastTime = null;
        dragPiece = null;
        dragFromQueue = -1;

        fitCanvas();

        // Bind events
        canvas.addEventListener('mousedown', onPointerDown);
        canvas.addEventListener('mousemove', onPointerMove);
        canvas.addEventListener('mouseup', onPointerUp);
        canvas.addEventListener('touchstart', onPointerDown, { passive: false });
        canvas.addEventListener('touchmove', onPointerMove, { passive: false });
        canvas.addEventListener('touchend', onPointerUp, { passive: false });
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', fitCanvas);

        // Start loop immediately (shows loading screen)
        animFrame = requestAnimationFrame(loop);

        // Load sprites, then transition to title
        loadSprites(() => {
            state = ST_TITLE;
        });
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;

        stopRollingSound();
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }

        if (canvas) {
            canvas.removeEventListener('mousedown', onPointerDown);
            canvas.removeEventListener('mousemove', onPointerMove);
            canvas.removeEventListener('mouseup', onPointerUp);
            canvas.removeEventListener('touchstart', onPointerDown);
            canvas.removeEventListener('touchmove', onPointerMove);
            canvas.removeEventListener('touchend', onPointerUp);
        }
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', fitCanvas);
    }

    return {
        init,
        destroy,
        getScore()  { return totalScore || 0; },
        getLevel()  { return (level || 0) + 1; },
        isActive()  { return gameActive; }
    };
})();
