/* Tetris — Theme-aware block stacker for Your World Arcade
 * Kenney CC0 sprite rendering — self-contained, no dependencies */
window.Maetris = (() => {
    // ── Grid ──
    const NX = 10, NY = 20;

    // ══════════════════════════════════════════
    //  SPRITE SYSTEM — Kenney tiles + platform
    // ══════════════════════════════════════════
    const SPRITES = {};
    let spritesLoaded = false;
    let spriteLoadTotal = 0, spriteLoadDone = 0;
    const SPRITE_OK = {};

    const TILE_COLORS = ['Blue','Red','Green','Yellow','Pink','Orange'];
    const SPRITE_MANIFEST = {};

    // Kenney colored tile sprites (6 colors x 10 variants)
    for (const color of TILE_COLORS) {
        for (let v = 1; v <= 10; v++) {
            const vStr = String(v).padStart(2, '0');
            SPRITE_MANIFEST[`tile${color}_${vStr}`] = `/img/game-assets/kenney-tiles/tile${color}_${vStr}.png`;
        }
    }
    // Platform border tiles
    SPRITE_MANIFEST['borderStone'] = '/img/game-assets/kenney-platform/ground/Stone/stone.png';
    SPRITE_MANIFEST['borderStoneMid'] = '/img/game-assets/kenney-platform/ground/Stone/stoneMid.png';
    // HUD items
    SPRITE_MANIFEST['star'] = '/img/game-assets/kenney-ui/star.png';
    SPRITE_MANIFEST['coin'] = '/img/game-assets/kenney-platform/items/coinGold.png';
    SPRITE_MANIFEST['gem'] = '/img/game-assets/kenney-platform/items/gemBlue.png';

    // Piece-to-tile-color mapping (I=Blue, O=Yellow, T=Pink, S=Green, Z=Red, J=Orange, L=Blue)
    const PIECE_TILE_MAP = { I: 'Blue', O: 'Yellow', T: 'Pink', S: 'Green', Z: 'Red', J: 'Orange', L: 'Blue' };
    // Each piece uses a specific tile variant for visual variety
    const PIECE_TILE_VARIANT = { I: '01', O: '03', T: '05', S: '07', Z: '09', J: '02', L: '04' };

    function getTileSprite(pieceType) {
        const color = PIECE_TILE_MAP[pieceType];
        const variant = PIECE_TILE_VARIANT[pieceType];
        const key = `tile${color}_${variant}`;
        return SPRITE_OK[key] ? SPRITES[key] : null;
    }

    function preloadSprites(onProgress, onDone) {
        const keys = Object.keys(SPRITE_MANIFEST);
        spriteLoadTotal = keys.length;
        spriteLoadDone = 0;
        if (keys.length === 0) { spritesLoaded = true; onDone(); return; }
        for (const key of keys) {
            const img = new Image();
            img.onload = () => {
                SPRITE_OK[key] = true;
                spriteLoadDone++;
                onProgress(spriteLoadDone / spriteLoadTotal);
                if (spriteLoadDone >= spriteLoadTotal) { spritesLoaded = true; onDone(); }
            };
            img.onerror = () => {
                SPRITE_OK[key] = false;
                spriteLoadDone++;
                onProgress(spriteLoadDone / spriteLoadTotal);
                if (spriteLoadDone >= spriteLoadTotal) { spritesLoaded = true; onDone(); }
            };
            img.src = SPRITE_MANIFEST[key];
            SPRITES[key] = img;
        }
    }

    function spr(key) { return SPRITE_OK[key] ? SPRITES[key] : null; }

    let loadingProgress = 0;
    let isLoading = true;

    function drawLoadingScreen() {
        const W = canvas.width, H = canvas.height;
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, W, H);
        // Title
        ctx.fillStyle = '#A855F7';
        ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('BLOCK STACK', W / 2, H / 2 - 40);
        // Progress bar
        const barW = W * 0.5, barH = 12;
        const barX = (W - barW) / 2, barY = H / 2;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#A855F7';
        ctx.fillRect(barX, barY, barW * loadingProgress, barH);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        ctx.fillText('Loading sprites...', W / 2, barY + barH + 20);
    }

    // ── Tetromino colors (theme-driven, populated in init) ──
    let COLORS = {};
    let bgGrad = ['#0a0a1a', '#1a0a2e'];

    function buildColors(TC) {
        function hexToGlow(hex) { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},0.5)`; }
        function hexToRgb(hex) { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return [r,g,b]; }
        const A = typeof ArcadeThemes !== 'undefined' ? ArcadeThemes : null;
        const li = (h,p) => A ? A.lighten(h,p) : h;
        const dk = (h,p) => A ? A.darken(h,p) : h;
        const c = (hex) => ({ base: hex, light: li(hex,30), dark: dk(hex,20), glow: hexToGlow(hex), rgb: hexToRgb(hex) });
        COLORS = { I: c(TC[0]), O: c(TC[1]), T: c(TC[2]), S: c(TC[3]), Z: c(TC[4]), J: c(TC[5]), L: c(TC[0]) };
    }
    // Default colors (overridden in init by theme)
    buildColors(['#06B6D4','#F59E0B','#A855F7','#10B981','#F43F5E','#3B82F6']);

    // ── SRS piece data (4x4 bitmasks, 4 rotations each) ──
    const PIECES = {
        I: { size: 4, rotations: [
            [0,0,0,0, 1,1,1,1, 0,0,0,0, 0,0,0,0],
            [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
            [0,0,0,0, 0,0,0,0, 1,1,1,1, 0,0,0,0],
            [0,1,0,0, 0,1,0,0, 0,1,0,0, 0,1,0,0]
        ]},
        O: { size: 2, rotations: [
            [1,1, 1,1], [1,1, 1,1], [1,1, 1,1], [1,1, 1,1]
        ]},
        T: { size: 3, rotations: [
            [0,1,0, 1,1,1, 0,0,0],
            [0,1,0, 0,1,1, 0,1,0],
            [0,0,0, 1,1,1, 0,1,0],
            [0,1,0, 1,1,0, 0,1,0]
        ]},
        S: { size: 3, rotations: [
            [0,1,1, 1,1,0, 0,0,0],
            [0,1,0, 0,1,1, 0,0,1],
            [0,0,0, 0,1,1, 1,1,0],
            [1,0,0, 1,1,0, 0,1,0]
        ]},
        Z: { size: 3, rotations: [
            [1,1,0, 0,1,1, 0,0,0],
            [0,0,1, 0,1,1, 0,1,0],
            [0,0,0, 1,1,0, 0,1,1],
            [0,1,0, 1,1,0, 1,0,0]
        ]},
        J: { size: 3, rotations: [
            [1,0,0, 1,1,1, 0,0,0],
            [0,1,1, 0,1,0, 0,1,0],
            [0,0,0, 1,1,1, 0,0,1],
            [0,1,0, 0,1,0, 1,1,0]
        ]},
        L: { size: 3, rotations: [
            [0,0,1, 1,1,1, 0,0,0],
            [0,1,0, 0,1,0, 0,1,1],
            [0,0,0, 1,1,1, 1,0,0],
            [1,1,0, 0,1,0, 0,1,0]
        ]}
    };

    // ── SRS wall kick data ──
    const KICK_JLSTZ = [
        [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
        [[0,0],[1,0],[1,-1],[0,2],[1,2]],
        [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
        [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]]
    ];
    const KICK_I = [
        [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
        [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
        [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
        [[0,0],[1,0],[-2,0],[1,-2],[-2,1]]
    ];

    // ── Scoring ──
    const LINE_SCORES = [0, 100, 300, 500, 800];
    const LINES_PER_LEVEL = 10;
    const BASE_SPEED = 1000;
    const MIN_SPEED = 80;
    const SPEED_FACTOR = 55;

    // DAS (Delayed Auto-Shift) for snappy horizontal movement
    const DAS_DELAY = 170;  // ms before auto-repeat starts
    const ARR_RATE  = 50;   // ms between auto-repeat moves
    let dasDir = 0;         // -1 left, 1 right, 0 none
    let dasTimer = 0;
    let arrTimer = 0;
    let softDropHeld = false;

    // ── State ──
    let canvas, ctx;
    let cellSize, boardX, boardY, boardW, boardH;
    let hudX, hudW, hudCenterX;
    let board = [];
    let current = null;
    let nextPieces = [];
    let bag = [];
    let score = 0, level = 1, lines = 0;
    let dropTimer = 0, lastTime = 0;
    let gameActive = false, paused = false;
    let animFrame = null;
    let player = null;
    let onGameOver = null;
    let lockDelay = 0;
    let clearAnim = null;
    let levelUpAnim = 0;
    let hardDropTrail = [];
    let audioCtx = null;
    let bgStars = [];
    let bgParticles = [];
    let startTime = 0;
    let frameCount = 0;

    // ── Visual FX state ──
    let particles = [];
    let scorePopups = [];
    let screenShake = 0;
    let comboCount = 0;
    let lockParticles = [];
    let gridPulse = 0;

    // ── Touch state ──
    let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
    let touchMoved = false;

    // ── Helpers ──
    function cells(type, rot) {
        const p = PIECES[type];
        const s = p.size;
        const data = p.rotations[rot];
        const out = [];
        for (let r = 0; r < s; r++)
            for (let c = 0; c < s; c++)
                if (data[r * s + c]) out.push([c, r]);
        return out;
    }

    function fits(type, rot, px, py) {
        for (const [cx, cy] of cells(type, rot)) {
            const bx = px + cx, by = py + cy;
            if (bx < 0 || bx >= NX || by >= NY) return false;
            if (by >= 0 && board[by][bx] !== null) return false;
        }
        return true;
    }

    function ghostY() {
        let gy = current.y;
        while (fits(current.type, current.rot, current.x, gy + 1)) gy++;
        return gy;
    }

    const rng = (a, b) => Math.random() * (b - a) + a;

    // ── 7-bag randomizer ──
    function fillBag() {
        bag = Object.keys(PIECES).slice();
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
        }
    }

    function nextType() {
        if (bag.length === 0) fillBag();
        return bag.pop();
    }

    function spawnPiece(type) {
        const s = PIECES[type].size;
        return { type, rot: 0, x: Math.floor((NX - s) / 2), y: type === 'I' ? -1 : 0 };
    }

    // ── Board ops ──
    function clearBoard() {
        board = [];
        for (let r = 0; r < NY; r++) {
            board[r] = [];
            for (let c = 0; c < NX; c++) board[r][c] = null;
        }
    }

    function lockPiece() {
        for (const [cx, cy] of cells(current.type, current.rot)) {
            const bx = current.x + cx, by = current.y + cy;
            if (by >= 0 && by < NY) board[by][bx] = current.type;
        }
        // Spawn lock particles at each cell
        spawnLockParticles(current);
        playSound('lock');
    }

    function getFullRows() {
        const full = [];
        for (let r = 0; r < NY; r++) {
            if (board[r].every(c => c !== null)) full.push(r);
        }
        return full;
    }

    function removeRows(rows) {
        for (const r of rows.sort((a, b) => b - a)) {
            board.splice(r, 1);
            const empty = [];
            for (let c = 0; c < NX; c++) empty.push(null);
            board.unshift(empty);
        }
    }

    // ── Rotation with SRS kicks ──
    function tryRotate() {
        const newRot = (current.rot + 1) % 4;
        const kicks = current.type === 'I' ? KICK_I[current.rot] : KICK_JLSTZ[current.rot];
        for (const [dx, dy] of kicks) {
            if (fits(current.type, newRot, current.x + dx, current.y - dy)) {
                current.x += dx;
                current.y -= dy;
                current.rot = newRot;
                playSound('rotate');
                return true;
            }
        }
        return false;
    }

    // ── Sound (Web Audio API) ──
    function initAudio() {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }

    function playTone(freq, dur, type = 'square', vol = 0.08) {
        if (!audioCtx) return;
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(vol, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + dur);
        } catch (e) {}
    }

    function playSound(name) {
        switch (name) {
            case 'move':    playTone(300, 0.05, 'sine', 0.04); break;
            case 'rotate':  playTone(500, 0.08, 'sine', 0.06); break;
            case 'lock':    playTone(150, 0.12, 'triangle', 0.06); break;
            case 'drop':    playTone(100, 0.15, 'triangle', 0.08); break;
            case 'clear':
                playTone(523, 0.1, 'square', 0.06);
                setTimeout(() => playTone(659, 0.1, 'square', 0.06), 80);
                setTimeout(() => playTone(784, 0.15, 'square', 0.06), 160);
                break;
            case 'tetris':
                [523, 659, 784, 1047].forEach((f, i) =>
                    setTimeout(() => playTone(f, 0.18, 'square', 0.07), i * 100));
                setTimeout(() => playTone(1175, 0.3, 'sine', 0.08), 400);
                break;
            case 'levelup':
                [440, 554, 659, 880].forEach((f, i) =>
                    setTimeout(() => playTone(f, 0.2, 'sine', 0.07), i * 120));
                break;
            case 'gameover':
                [400, 350, 300, 250].forEach((f, i) =>
                    setTimeout(() => playTone(f, 0.3, 'triangle', 0.06), i * 200));
                break;
        }
    }

    // ── Particle system ──
    function spawnParticles(x, y, color, count, speedMult) {
        const sm = speedMult || 1;
        for (let i = 0; i < count; i++) {
            particles.push({
                x, y,
                vx: rng(-2.5, 2.5) * sm,
                vy: rng(-3, 1) * sm,
                life: rng(300, 700),
                max: 700,
                color,
                size: rng(1.5, 4)
            });
        }
    }

    function spawnLockParticles(piece) {
        const col = COLORS[piece.type];
        if (!col) return;
        for (const [cx, cy] of cells(piece.type, piece.rot)) {
            const px = boardX + (piece.x + cx) * cellSize + cellSize / 2;
            const py = boardY + (piece.y + cy) * cellSize + cellSize / 2;
            spawnParticles(px, py, col.base, 3, 0.6);
        }
    }

    function spawnLineClearParticles(rows) {
        for (const r of rows) {
            for (let c = 0; c < NX; c++) {
                const type = board[r][c];
                const col = COLORS[type];
                if (!col) continue;
                const px = boardX + c * cellSize + cellSize / 2;
                const py = boardY + r * cellSize + cellSize / 2;
                spawnParticles(px, py, col.base, 4, 1.2);
                // Extra white sparkle particles
                spawnParticles(px, py, '#FFFFFF', 2, 0.8);
            }
        }
    }

    function spawnScorePopup(x, y, text, color) {
        scorePopups.push({ x, y, text, life: 1200, max: 1200, color: color || '#FBBF24' });
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * (dt / 16);
            p.y += p.vy * (dt / 16);
            p.vy += 0.04 * (dt / 16); // gravity
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            scorePopups[i].y -= 0.8 * (dt / 16);
            scorePopups[i].life -= dt;
            if (scorePopups[i].life <= 0) scorePopups.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.save();
            const alpha = p.life / p.max;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 4;
            const sz = p.size * alpha;
            ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
            ctx.restore();
        }
    }

    function drawScorePopups() {
        for (const s of scorePopups) {
            ctx.save();
            const progress = s.life / s.max;
            ctx.globalAlpha = progress;
            const scale = 1 + (1 - progress) * 0.3;
            ctx.translate(s.x, s.y);
            ctx.scale(scale, scale);
            ctx.translate(-s.x, -s.y);
            ctx.fillStyle = s.color;
            ctx.shadowColor = s.color;
            ctx.shadowBlur = 8;
            const sz = Math.max(12, cellSize * 0.7) | 0;
            ctx.font = `bold ${sz}px "Segoe UI", system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(s.text, s.x, s.y);
            ctx.restore();
        }
    }

    // ── Background stars (animated starfield) ──
    function initBgStars() {
        bgStars = [];
        for (let i = 0; i < 100; i++) {
            bgStars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2.5 + 0.3,
                speed: Math.random() * 0.4 + 0.05,
                twinkle: Math.random() * Math.PI * 2,
                hue: Math.random() * 60 + 220 // blue-purple range
            });
        }
    }

    // ── Sizing — CRITICAL for proper layout ──
    function computeLayout() {
        const W = canvas.width, H = canvas.height;
        const pad = Math.max(8, Math.floor(Math.min(W, H) * 0.02));

        // HUD gets a fixed compact width, board gets the rest
        const maxHudW = 130;
        const minHudW = 80;
        hudW = Math.max(minHudW, Math.min(maxHudW, Math.floor(W * 0.18)));

        // Board gets remaining width
        const gap = Math.max(8, Math.floor(W * 0.02));
        const availW_forBoard = W - hudW - gap - pad * 2;
        const availH = H - pad * 2;

        const cellFromH = Math.floor(availH / NY);
        const cellFromW = Math.floor(availW_forBoard / NX);
        cellSize = Math.min(cellFromH, cellFromW);
        cellSize = Math.max(cellSize, 12);

        boardW = cellSize * NX;
        boardH = cellSize * NY;

        // Center board in its available area
        const boardAreaW = W - hudW - gap - pad;
        boardX = Math.max(pad, Math.floor((boardAreaW - boardW) / 2));
        boardY = Math.floor((H - boardH) / 2);

        // HUD panel on right side, tight
        hudX = boardX + boardW + gap;
        hudW = W - hudX - pad;
        hudCenterX = hudX + hudW / 2;
    }

    // ══════════════════════════════════════════
    //  DRAWING
    // ══════════════════════════════════════════
    function drawBackground() {
        const W = canvas.width, H = canvas.height;
        const t = (Date.now() - startTime) / 1000;

        // Deep dark gradient background (themed)
        const grad = ctx.createLinearGradient(0, 0, W * 0.3, H);
        grad.addColorStop(0, bgGrad[0]);
        grad.addColorStop(0.5, bgGrad[1] || bgGrad[0]);
        grad.addColorStop(1, bgGrad[1]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Animated starfield with colored twinkle
        for (const star of bgStars) {
            star.y += star.speed;
            star.x += star.speed * 0.1;
            if (star.y > H) { star.y = 0; star.x = Math.random() * W; }
            if (star.x > W) { star.x = 0; }
            star.twinkle += 0.03;
            const alpha = 0.2 + Math.sin(star.twinkle) * 0.3;
            const hue = star.hue + Math.sin(t * 0.5 + star.twinkle) * 20;
            ctx.fillStyle = `hsla(${hue}, 70%, 75%, ${Math.max(0, alpha)})`;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fill();
            // Larger stars get a soft glow
            if (star.size > 1.5) {
                ctx.fillStyle = `hsla(${hue}, 70%, 75%, ${Math.max(0, alpha * 0.15)})`;
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Subtle scrolling grid overlay on background
        ctx.save();
        ctx.globalAlpha = 0.025;
        ctx.strokeStyle = '#A855F7';
        ctx.lineWidth = 0.5;
        const gridStep = 40;
        const scrollY = (t * 8) % gridStep;
        for (let x = 0; x < W; x += gridStep) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = -gridStep + scrollY; y < H + gridStep; y += gridStep) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawBoard() {
        // Board background with subtle gradient
        const boardGrad = ctx.createLinearGradient(boardX, boardY, boardX, boardY + boardH);
        boardGrad.addColorStop(0, 'rgba(30,15,50,0.75)');
        boardGrad.addColorStop(0.5, 'rgba(15,8,35,0.85)');
        boardGrad.addColorStop(1, 'rgba(10,5,20,0.9)');
        ctx.fillStyle = boardGrad;

        // Rounded board rectangle
        const br = 6;
        ctx.beginPath();
        ctx.moveTo(boardX + br, boardY);
        ctx.arcTo(boardX + boardW, boardY, boardX + boardW, boardY + boardH, br);
        ctx.arcTo(boardX + boardW, boardY + boardH, boardX, boardY + boardH, br);
        ctx.arcTo(boardX, boardY + boardH, boardX, boardY, br);
        ctx.arcTo(boardX, boardY, boardX + boardW, boardY, br);
        ctx.fill();

        // Grid lines with pulsing effect on line clears
        const gpAlpha = 0.06 + gridPulse * 0.08;
        ctx.strokeStyle = `rgba(168,85,247,${gpAlpha})`;
        ctx.lineWidth = 0.5;
        for (let c = 1; c < NX; c++) {
            ctx.beginPath();
            ctx.moveTo(boardX + c * cellSize, boardY);
            ctx.lineTo(boardX + c * cellSize, boardY + boardH);
            ctx.stroke();
        }
        for (let r = 1; r < NY; r++) {
            ctx.beginPath();
            ctx.moveTo(boardX, boardY + r * cellSize);
            ctx.lineTo(boardX + boardW, boardY + r * cellSize);
            ctx.stroke();
        }

        // Locked blocks
        for (let r = 0; r < NY; r++) {
            for (let c = 0; c < NX; c++) {
                if (board[r][c] !== null) {
                    if (clearAnim && clearAnim.rows.includes(r)) {
                        const progress = (Date.now() - clearAnim.start) / clearAnim.duration;
                        if (progress < 1) {
                            const scale = 1 + progress * 0.4;
                            const alpha = 1 - progress;
                            drawNeonBlock(boardX + c * cellSize, boardY + r * cellSize, cellSize, board[r][c], alpha, scale);
                            // Intense white flash that fades
                            ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - progress)})`;
                            ctx.fillRect(boardX + c * cellSize, boardY + r * cellSize, cellSize, cellSize);
                            // Row-wide flash bar
                            if (c === 0) {
                                ctx.save();
                                ctx.globalAlpha = 0.3 * (1 - progress);
                                ctx.fillStyle = '#FFFFFF';
                                ctx.fillRect(boardX, boardY + r * cellSize, boardW, cellSize);
                                ctx.restore();
                            }
                        }
                    } else {
                        drawNeonBlock(boardX + c * cellSize, boardY + r * cellSize, cellSize, board[r][c], 1, 1);
                    }
                }
            }
        }

        // Board border — use stone sprite tiles if available, else animated glow
        const stoneSpr = spr('borderStone');
        const t = (Date.now() - startTime) / 1000;
        if (stoneSpr) {
            const bdr = cellSize * 0.6;
            ctx.save();
            ctx.globalAlpha = 0.85;
            // Left and right borders
            for (let r = 0; r < NY; r++) {
                ctx.drawImage(stoneSpr, boardX - bdr, boardY + r * cellSize, bdr, cellSize);
                ctx.drawImage(stoneSpr, boardX + boardW, boardY + r * cellSize, bdr, cellSize);
            }
            // Bottom border
            for (let c = -1; c <= NX; c++) {
                ctx.drawImage(stoneSpr, boardX + c * cellSize, boardY + boardH, cellSize, bdr);
            }
            ctx.restore();
        } else {
            const borderPulse = 0.4 + Math.sin(t * 2) * 0.15;
            ctx.save();
            ctx.shadowColor = `rgba(168,85,247,${borderPulse})`;
            ctx.shadowBlur = 14 + Math.sin(t * 3) * 4;
            ctx.strokeStyle = `rgba(168,85,247,${borderPulse + 0.1})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(boardX + br, boardY);
            ctx.arcTo(boardX + boardW, boardY, boardX + boardW, boardY + boardH, br);
            ctx.arcTo(boardX + boardW, boardY + boardH, boardX, boardY + boardH, br);
            ctx.arcTo(boardX, boardY + boardH, boardX, boardY, br);
            ctx.arcTo(boardX, boardY, boardX + boardW, boardY, br);
            ctx.stroke();
            ctx.restore();
        }
    }

    function drawNeonBlock(x, y, sz, type, alpha, scale) {
        const col = COLORS[type];
        if (!col) return;
        const pad = Math.max(1, sz * 0.06);
        const bsz = sz - pad * 2;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Scale from center of cell
        if (scale && scale !== 1) {
            const cx = x + sz / 2, cy = y + sz / 2;
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.translate(-cx, -cy);
        }

        const bx = x + pad, by = y + pad;
        const r = Math.max(3, bsz * 0.18);

        // TRY SPRITE FIRST — Kenney tile
        const sprite = getTileSprite(type);
        if (sprite) {
            // Neon glow behind sprite
            if (sz >= 16) {
                ctx.shadowColor = col.glow;
                ctx.shadowBlur = 8;
            }
            ctx.drawImage(sprite, bx, by, bsz, bsz);
            ctx.shadowBlur = 0;
            // Glossy overlay for depth
            const hl = ctx.createLinearGradient(bx, by, bx, by + bsz * 0.5);
            hl.addColorStop(0, 'rgba(255,255,255,0.25)');
            hl.addColorStop(0.5, 'rgba(255,255,255,0.05)');
            hl.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = hl;
            roundRect(ctx, bx, by, bsz, bsz * 0.5, r);
            ctx.fill();
            ctx.restore();
            return;
        }

        // FALLBACK — original gradient drawing
        if (sz >= 16) {
            ctx.shadowColor = col.glow;
            ctx.shadowBlur = 10;
        }
        const grad = ctx.createLinearGradient(bx, by, bx + bsz * 0.4, by + bsz);
        const rgb = col.rgb || [128, 128, 128];
        grad.addColorStop(0, `rgba(${Math.min(255, rgb[0] + 70)},${Math.min(255, rgb[1] + 70)},${Math.min(255, rgb[2] + 70)},1)`);
        grad.addColorStop(0.3, col.light);
        grad.addColorStop(0.6, col.base);
        grad.addColorStop(1, col.dark);
        ctx.fillStyle = grad;
        roundRect(ctx, bx, by, bsz, bsz, r);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = col.dark;
        ctx.lineWidth = 1;
        ctx.globalAlpha = alpha * 0.35;
        roundRect(ctx, bx + 1, by + 1, bsz - 2, bsz - 2, Math.max(1, r - 1));
        ctx.stroke();
        ctx.globalAlpha = alpha;
        const hl = ctx.createLinearGradient(bx, by, bx, by + bsz * 0.5);
        hl.addColorStop(0, 'rgba(255,255,255,0.5)');
        hl.addColorStop(0.3, 'rgba(255,255,255,0.18)');
        hl.addColorStop(0.6, 'rgba(255,255,255,0.04)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hl;
        roundRect(ctx, bx + 1, by + 1, bsz - 2, bsz * 0.5, Math.max(1, r - 1));
        ctx.fill();

        ctx.restore();
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function drawGhost() {
        if (!current || paused) return;
        const gy = ghostY();
        if (gy === current.y) return;
        const col = COLORS[current.type];
        const t = (Date.now() - startTime) / 1000;
        const pulse = 0.12 + Math.sin(t * 4) * 0.06;

        for (const [cx, cy] of cells(current.type, current.rot)) {
            const px = boardX + (current.x + cx) * cellSize;
            const py = boardY + (gy + cy) * cellSize;
            const pad = 2;
            const bsz = cellSize - pad * 2;
            const r = Math.max(2, bsz * 0.15);

            // Translucent fill with slight glow
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.fillStyle = col.base;
            ctx.shadowColor = col.glow;
            ctx.shadowBlur = 6;
            roundRect(ctx, px + pad, py + pad, bsz, bsz, r);
            ctx.fill();
            ctx.restore();

            // Dashed outline border
            ctx.save();
            ctx.globalAlpha = 0.4 + Math.sin(t * 3) * 0.1;
            ctx.strokeStyle = col.light;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            roundRect(ctx, px + pad, py + pad, bsz, bsz, r);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
    }

    function drawCurrent() {
        if (!current || paused) return;
        for (const [cx, cy] of cells(current.type, current.rot)) {
            const py = current.y + cy;
            if (py < 0) continue;
            drawNeonBlock(boardX + (current.x + cx) * cellSize, boardY + py * cellSize, cellSize, current.type, 1, 1);
        }
    }

    function drawHardDropTrail() {
        for (let i = hardDropTrail.length - 1; i >= 0; i--) {
            const t = hardDropTrail[i];
            t.alpha -= 0.05;
            if (t.alpha <= 0) { hardDropTrail.splice(i, 1); continue; }
            const col = COLORS[t.type];
            ctx.save();
            ctx.globalAlpha = t.alpha * 0.35;
            ctx.fillStyle = col.light;
            ctx.shadowColor = col.glow;
            ctx.shadowBlur = 4;
            ctx.fillRect(boardX + t.x * cellSize + 3, boardY + t.y * cellSize + 3, cellSize - 6, cellSize - 6);
            ctx.restore();
        }
    }

    function drawHUD() {
        const W = canvas.width, H = canvas.height;
        const cx = hudCenterX;
        const t = (Date.now() - startTime) / 1000;

        // ── HUD backdrop: semi-transparent panel ──
        ctx.save();
        const hudPadding = 4;
        const hudBoxX = hudX - hudPadding;
        const hudBoxY = boardY - 2;
        const hudBoxW = hudW + hudPadding * 2;
        const hudBoxH = boardH + 4;
        const hudGrad = ctx.createLinearGradient(hudBoxX, hudBoxY, hudBoxX, hudBoxY + hudBoxH);
        hudGrad.addColorStop(0, 'rgba(15,8,30,0.5)');
        hudGrad.addColorStop(0.5, 'rgba(20,10,40,0.4)');
        hudGrad.addColorStop(1, 'rgba(15,8,30,0.5)');
        ctx.fillStyle = hudGrad;
        roundRect(ctx, hudBoxX, hudBoxY, hudBoxW, hudBoxH, 8);
        ctx.fill();
        // Subtle border for HUD panel
        ctx.strokeStyle = 'rgba(168,85,247,0.15)';
        ctx.lineWidth = 1;
        roundRect(ctx, hudBoxX, hudBoxY, hudBoxW, hudBoxH, 8);
        ctx.stroke();
        ctx.restore();

        // ── Title: "BLOCK STACK" with animated gradient ──
        const titleSize = Math.max(11, Math.min(18, hudW * 0.16)) | 0;
        const titleY = boardY + titleSize + 4;

        ctx.save();
        ctx.font = `bold ${titleSize}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        const hue = (t * 40) % 360;
        const tg = ctx.createLinearGradient(cx - 40, titleY, cx + 40, titleY);
        tg.addColorStop(0, `hsl(${hue}, 80%, 65%)`);
        tg.addColorStop(0.5, `hsl(${(hue + 120) % 360}, 80%, 65%)`);
        tg.addColorStop(1, `hsl(${(hue + 240) % 360}, 80%, 65%)`);
        ctx.fillStyle = tg;
        ctx.shadowColor = `hsl(${hue}, 80%, 65%)`;
        ctx.shadowBlur = 8;
        ctx.fillText('BLOCK STACK', cx, titleY);
        ctx.restore();

        // ── Player info ──
        let nextSectionY = titleY + 4;
        if (player) {
            const playerSize = Math.max(8, Math.min(11, hudW * 0.1)) | 0;
            nextSectionY = titleY + playerSize + 4;
            ctx.font = `${playerSize}px "Segoe UI", system-ui, sans-serif`;
            ctx.fillStyle = player.color || '#E0E0E0';
            ctx.textAlign = 'center';
            ctx.fillText(`${player.emoji || ''} ${player.name || ''}`, cx, nextSectionY - 2);
        }

        // ── Stats (compact inline) with glowing values ──
        const boxGap = 3;
        const boxW = hudW - 6;
        const boxH = Math.max(22, Math.min(32, H * 0.04));
        const boxX = hudX + 3;
        let statY = nextSectionY + 6;

        const stats = [
            { label: 'SCORE', value: score.toLocaleString(), color: '#06B6D4' },
            { label: 'LEVEL', value: String(level), color: '#A855F7' },
            { label: 'LINES', value: String(lines), color: '#10B981' }
        ];

        // Combo counter
        if (comboCount > 1) {
            stats.push({ label: 'COMBO', value: `x${comboCount}`, color: '#F59E0B' });
        }

        const labelSize = Math.max(7, Math.min(9, boxH * 0.3)) | 0;
        const valueSize = Math.max(10, Math.min(15, boxH * 0.5)) | 0;

        stats.forEach((s, i) => {
            const by = statY + i * (boxH + boxGap);

            // Subtle box bg with gradient
            const statGrad = ctx.createLinearGradient(boxX, by, boxX + boxW, by);
            statGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
            statGrad.addColorStop(1, 'rgba(255,255,255,0.02)');
            ctx.fillStyle = statGrad;
            roundRect(ctx, boxX, by, boxW, boxH, 4);
            ctx.fill();

            // Colored left accent with glow
            ctx.save();
            ctx.shadowColor = s.color;
            ctx.shadowBlur = 4;
            ctx.fillStyle = s.color;
            ctx.fillRect(boxX, by + 2, 2, boxH - 4);
            ctx.restore();

            // Label left
            ctx.font = `600 ${labelSize}px "Segoe UI", system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.textAlign = 'left';
            ctx.fillText(s.label, boxX + 6, by + boxH / 2 + labelSize * 0.35);

            // Value right with glow
            ctx.save();
            ctx.font = `bold ${valueSize}px "Segoe UI", system-ui, sans-serif`;
            ctx.fillStyle = s.color;
            ctx.shadowColor = s.color;
            ctx.shadowBlur = 6;
            ctx.textAlign = 'right';
            ctx.fillText(s.value, boxX + boxW - 4, by + boxH / 2 + valueSize * 0.35);
            ctx.restore();
        });

        // ── NEXT preview with styled box ──
        const nextY = statY + stats.length * (boxH + boxGap) + 6;

        // Next box background
        const nextBoxW = hudW - 10;
        const nextBoxX = hudX + 5;
        const nextBoxTopY = nextY - 2;
        const previewSize = Math.max(8, Math.min(cellSize * 0.5, 14));
        const nextBoxH = labelSize + 12 + Math.min(2, nextPieces.length) * (PIECES[nextPieces[0] || 'T'].size * previewSize + 8);

        // Styled next-piece container
        ctx.save();
        const nextBgGrad = ctx.createLinearGradient(nextBoxX, nextBoxTopY, nextBoxX, nextBoxTopY + nextBoxH);
        nextBgGrad.addColorStop(0, 'rgba(30,15,60,0.4)');
        nextBgGrad.addColorStop(1, 'rgba(20,10,40,0.3)');
        ctx.fillStyle = nextBgGrad;
        roundRect(ctx, nextBoxX, nextBoxTopY, nextBoxW, nextBoxH, 5);
        ctx.fill();
        ctx.strokeStyle = 'rgba(168,85,247,0.2)';
        ctx.lineWidth = 1;
        roundRect(ctx, nextBoxX, nextBoxTopY, nextBoxW, nextBoxH, 5);
        ctx.stroke();
        ctx.restore();

        ctx.font = `600 ${labelSize}px "Segoe UI", system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center';
        ctx.fillText('NEXT', cx, nextY + labelSize);

        for (let ni = 0; ni < Math.min(2, nextPieces.length); ni++) {
            const np = nextPieces[ni];
            const ps = PIECES[np].size;
            const pw = ps * previewSize;
            const ph = ps * previewSize;
            const pxOff = cx - pw / 2;
            const pyOff = nextY + labelSize + 8 + ni * (ph + 8);

            for (const [ccx, ccy] of cells(np, 0)) {
                drawNeonBlock(pxOff + ccx * previewSize, pyOff + ccy * previewSize, previewSize, np, ni === 0 ? 1 : 0.35, 1);
            }
        }

        // ── Level up animation ──
        if (levelUpAnim > 0) {
            ctx.save();
            const alpha = Math.min(1, levelUpAnim / 30);
            const scale = 1 + (1 - alpha) * 0.4;
            const lcx = boardX + boardW / 2;
            const lcy = boardY + boardH / 2;
            ctx.translate(lcx, lcy);
            ctx.scale(scale, scale);
            ctx.translate(-lcx, -lcy);
            ctx.globalAlpha = alpha;
            const luSize = Math.max(24, cellSize * 1.5) | 0;
            ctx.font = `bold ${luSize}px "Segoe UI", system-ui, sans-serif`;
            ctx.textAlign = 'center';
            // Double glow for emphasis
            ctx.shadowColor = '#F59E0B';
            ctx.shadowBlur = 25;
            const luGrad = ctx.createLinearGradient(lcx - 80, lcy, lcx + 80, lcy);
            luGrad.addColorStop(0, '#FCD34D');
            luGrad.addColorStop(0.5, '#F59E0B');
            luGrad.addColorStop(1, '#FCD34D');
            ctx.fillStyle = luGrad;
            ctx.fillText(`LEVEL ${level}!`, lcx, lcy);
            // Second pass for extra glow
            ctx.shadowBlur = 40;
            ctx.globalAlpha = alpha * 0.3;
            ctx.fillText(`LEVEL ${level}!`, lcx, lcy);
            ctx.restore();
            levelUpAnim--;
        }

        // ── Combo flash banner ──
        if (comboCount > 1) {
            const comboAlpha = Math.min(1, 0.5 + Math.sin(t * 8) * 0.3);
            ctx.save();
            ctx.globalAlpha = comboAlpha * 0.7;
            const comboSize = Math.max(14, cellSize * 0.8) | 0;
            ctx.font = `bold ${comboSize}px "Segoe UI", system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FBBF24';
            ctx.shadowColor = '#F59E0B';
            ctx.shadowBlur = 12;
            ctx.fillText(`${comboCount}x COMBO`, boardX + boardW / 2, boardY + boardH * 0.15);
            ctx.restore();
        }

        // ── Pause overlay ──
        if (paused) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(boardX, boardY, boardW, boardH);
            const pauseSize = Math.max(24, cellSize * 1.3) | 0;
            ctx.save();
            ctx.font = `bold ${pauseSize}px "Segoe UI", system-ui, sans-serif`;
            ctx.fillStyle = '#A855F7';
            ctx.textAlign = 'center';
            ctx.shadowColor = '#A855F7';
            ctx.shadowBlur = 20;
            ctx.fillText('PAUSED', boardX + boardW / 2, boardY + boardH / 2);
            ctx.shadowBlur = 0;
            ctx.font = `${Math.max(12, pauseSize * 0.45)|0}px "Segoe UI", system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText('Press P to resume', boardX + boardW / 2, boardY + boardH / 2 + pauseSize);
            ctx.restore();
        }
    }

    function drawVignette() {
        const W = canvas.width, H = canvas.height;
        const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
        vg.addColorStop(0, 'transparent');
        vg.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
    }

    // ── Game logic ──
    function currentSpeed() {
        return Math.max(MIN_SPEED, BASE_SPEED - (level - 1) * SPEED_FACTOR);
    }

    function spawn() {
        while (nextPieces.length < 3) nextPieces.push(nextType());
        const type = nextPieces.shift();
        nextPieces.push(nextType());
        current = spawnPiece(type);

        if (!fits(current.type, current.rot, current.x, current.y)) {
            gameActive = false;
            playSound('gameover');
            const duration = Math.floor((Date.now() - startTime) / 1000);
            if (onGameOver) onGameOver({ score, level, lines, duration });
        }
    }

    function moveLeft() {
        if (fits(current.type, current.rot, current.x - 1, current.y)) {
            current.x--;
            playSound('move');
            return true;
        }
        return false;
    }

    function moveRight() {
        if (fits(current.type, current.rot, current.x + 1, current.y)) {
            current.x++;
            playSound('move');
            return true;
        }
        return false;
    }

    function softDrop() {
        if (fits(current.type, current.rot, current.x, current.y + 1)) {
            current.y++;
            score += 1;
            dropTimer = 0;
            return true;
        }
        return false;
    }

    function hardDrop() {
        let dist = 0;
        while (fits(current.type, current.rot, current.x, current.y + 1)) {
            for (const [cx, cy] of cells(current.type, current.rot)) {
                if (current.y + cy >= 0)
                    hardDropTrail.push({ x: current.x + cx, y: current.y + cy, alpha: 0.7, type: current.type });
            }
            current.y++;
            dist++;
        }
        score += dist * 2;
        playSound('drop');
        screenShake = Math.min(6, dist * 0.5);
        placePiece();
    }

    function placePiece() {
        lockPiece();
        const fullRows = getFullRows();
        if (fullRows.length > 0) {
            const n = fullRows.length;
            comboCount++;
            const gained = (LINE_SCORES[n] || 800) * level;
            const comboBonus = comboCount > 1 ? comboCount * 50 : 0;
            score += gained + comboBonus;
            lines += n;

            // Line clear particles
            spawnLineClearParticles(fullRows);
            gridPulse = 1;
            screenShake = n >= 4 ? 10 : n >= 2 ? 5 : 3;

            if (n === 4) {
                playSound('tetris');
                spawnScorePopup(boardX + boardW / 2, boardY + fullRows[0] * cellSize, 'TETRIS!', '#FBBF24');
                if (typeof Confetti !== 'undefined') Confetti.burst(boardX + boardW / 2, boardY + boardH / 2, 30);
            } else {
                playSound('clear');
                if (n >= 2) {
                    spawnScorePopup(boardX + boardW / 2, boardY + fullRows[0] * cellSize, `+${gained}`, '#06B6D4');
                }
            }

            if (comboCount > 1) {
                spawnScorePopup(boardX + boardW / 2, boardY + fullRows[0] * cellSize - cellSize, `${comboCount}x COMBO!`, '#F59E0B');
            }

            const newLevel = Math.floor(lines / LINES_PER_LEVEL) + 1;
            if (newLevel > level) {
                level = newLevel;
                levelUpAnim = 60;
                playSound('levelup');
                screenShake = 8;
                if (typeof Confetti !== 'undefined') Confetti.rain(1500);
            }

            clearAnim = { rows: fullRows, start: Date.now(), duration: 400 };
            current = null;
        } else {
            comboCount = 0;
            spawn();
        }
    }

    // ── Input handling with DAS ──
    function handleKeyDown(e) {
        if (!gameActive) return;
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

        if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
            e.preventDefault();
            paused = !paused;
            return;
        }

        if (paused || !current) return;

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                if (dasDir !== -1) { moveLeft(); dasDir = -1; dasTimer = 0; arrTimer = 0; }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (dasDir !== 1) { moveRight(); dasDir = 1; dasTimer = 0; arrTimer = 0; }
                break;
            case 'ArrowUp':    e.preventDefault(); tryRotate(); break;
            case 'ArrowDown':  e.preventDefault(); softDropHeld = true; softDrop(); break;
            case ' ':          e.preventDefault(); hardDrop(); break;
        }
    }

    function handleKeyUp(e) {
        if (e.key === 'ArrowLeft' && dasDir === -1) dasDir = 0;
        if (e.key === 'ArrowRight' && dasDir === 1) dasDir = 0;
        if (e.key === 'ArrowDown') softDropHeld = false;
    }

    function handleTouchStart(e) {
        if (!gameActive || paused || !current) return;
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        touchStartTime = Date.now();
        touchMoved = false;
    }

    function handleTouchMove(e) {
        if (!gameActive || paused || !current) return;
        e.preventDefault();
        const t = e.touches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        const threshold = cellSize * 0.8;

        if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
            touchMoved = true;
            if (dx > 0) moveRight(); else moveLeft();
            touchStartX = t.clientX;
            touchStartY = t.clientY;
        } else if (dy > threshold && dy > Math.abs(dx)) {
            touchMoved = true;
            softDrop();
            touchStartY = t.clientY;
        }
    }

    function handleTouchEnd(e) {
        if (!gameActive || paused || !current) return;
        if (!touchMoved && (Date.now() - touchStartTime) < 250) {
            tryRotate();
        }
    }

    // ── Main loop ──
    function frame(time) {
        if (!gameActive) return;
        animFrame = requestAnimationFrame(frame);

        if (lastTime === 0) { lastTime = time; return; }
        const dt = time - lastTime;
        lastTime = time;
        frameCount++;

        if (paused) { render(dt); return; }

        // Update particles
        updateParticles(dt);

        // Decay screen shake
        screenShake = Math.max(0, screenShake - dt * 0.008);
        // Decay grid pulse
        gridPulse = Math.max(0, gridPulse - dt * 0.003);

        // Handle clear animation completion
        if (clearAnim) {
            if (Date.now() - clearAnim.start >= clearAnim.duration) {
                removeRows(clearAnim.rows);
                clearAnim = null;
                spawn();
            }
            render(dt);
            return;
        }

        if (!current) { render(dt); return; }

        // DAS auto-repeat
        if (dasDir !== 0 && current) {
            dasTimer += dt;
            if (dasTimer >= DAS_DELAY) {
                arrTimer += dt;
                while (arrTimer >= ARR_RATE) {
                    arrTimer -= ARR_RATE;
                    if (dasDir === -1) moveLeft();
                    else if (dasDir === 1) moveRight();
                }
            }
        }

        // Soft drop auto-repeat
        if (softDropHeld && current) {
            softDrop();
        }

        // Gravity
        dropTimer += dt;
        if (dropTimer >= currentSpeed()) {
            dropTimer = 0;
            if (!softDrop()) {
                placePiece();
            }
        }

        render(dt);
    }

    function render(dt) {
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        // Apply screen shake
        ctx.save();
        if (screenShake > 0.1) {
            const sx = rng(-screenShake, screenShake);
            const sy = rng(-screenShake, screenShake);
            ctx.translate(sx, sy);
        }

        drawBackground();
        drawBoard();
        drawGhost();
        drawHardDropTrail();
        drawCurrent();
        drawParticles();
        drawScorePopups();
        drawHUD();

        ctx.restore();

        // Vignette always on top, outside shake transform
        drawVignette();
    }

    // ── Public API ──
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer;
        onGameOver = gameOverCallback;

        // Load player theme
        const themeId = activePlayer?.theme || 'retro';
        const t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (t) { buildColors(t.colors); bgGrad = t.bgGradient || bgGrad; }

        // Size canvas from container with safe fallbacks
        const container = canvas.parentElement;
        if (container) {
            canvas.width = Math.max(300, container.clientWidth || 480);
            canvas.height = Math.max(400, container.clientHeight || 640);
        }
        if (canvas.width < 100) canvas.width = 480;
        if (canvas.height < 100) canvas.height = 640;

        // Show loading screen and preload sprites
        isLoading = true;
        loadingProgress = 0;
        drawLoadingScreen();

        preloadSprites(
            (progress) => { loadingProgress = progress; drawLoadingScreen(); },
            () => { isLoading = false; startGame(); }
        );

        function startGame() {
            // Reset state
            score = 0; level = 1; lines = 0;
            dropTimer = 0; lastTime = 0;
            paused = false;
            clearAnim = null;
            levelUpAnim = 0;
            hardDropTrail = [];
            bag = [];
            nextPieces = [];
            current = null;
            startTime = Date.now();
            frameCount = 0;
            particles = [];
            scorePopups = [];
            screenShake = 0;
            comboCount = 0;
            gridPulse = 0;
            dasDir = 0; dasTimer = 0; arrTimer = 0; softDropHeld = false;

            computeLayout();

            // Delayed refit for container layout settling
            requestAnimationFrame(() => {
                if (!canvas || !canvas.parentElement) return;
                const p = canvas.parentElement;
                const pw = Math.max(300, p.clientWidth || 480);
                const ph = Math.max(400, p.clientHeight || 640);
                if (pw !== canvas.width || ph !== canvas.height) {
                    canvas.width = pw; canvas.height = ph;
                    computeLayout();
                }
            });

            clearBoard();
            initAudio();
            initBgStars();

            // Fill next queue and spawn
            while (nextPieces.length < 3) nextPieces.push(nextType());
            spawn();

            gameActive = true;

            // Listeners
            document.addEventListener('keydown', handleKeyDown);
            document.addEventListener('keyup', handleKeyUp);
            canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
            canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
            canvas.addEventListener('touchend', handleTouchEnd);
            window.addEventListener('resize', onResize);

            animFrame = requestAnimationFrame(frame);
        }
    }

    function onResize() {
        if (!canvas) return;
        computeLayout();
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        if (canvas) {
            canvas.removeEventListener('touchstart', handleTouchStart);
            canvas.removeEventListener('touchmove', handleTouchMove);
            canvas.removeEventListener('touchend', handleTouchEnd);
        }
        window.removeEventListener('resize', onResize);
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
