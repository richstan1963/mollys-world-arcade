/* Tetris — Theme-aware block stacker for Your World Arcade
 * Self-contained, no dependencies, canvas-rendered */
window.Maetris = (() => {
    // ── Grid ──
    const NX = 10, NY = 20;

    // ── Tetromino colors (theme-driven, populated in init) ──
    let COLORS = {};
    let bgGrad = ['#0a0a1a', '#1a0a2e'];

    function buildColors(TC) {
        function hexToGlow(hex) { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},0.5)`; }
        const A = typeof ArcadeThemes !== 'undefined' ? ArcadeThemes : null;
        const li = (h,p) => A ? A.lighten(h,p) : h;
        const dk = (h,p) => A ? A.darken(h,p) : h;
        const c = (hex) => ({ base: hex, light: li(hex,30), dark: dk(hex,20), glow: hexToGlow(hex) });
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
    const BASE_SPEED = 800;
    const MIN_SPEED = 80;
    const SPEED_FACTOR = 60;

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

    // ── Background stars ──
    function initBgStars() {
        bgStars = [];
        for (let i = 0; i < 60; i++) {
            bgStars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 0.5,
                speed: Math.random() * 0.3 + 0.05,
                twinkle: Math.random() * Math.PI * 2
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

    // ── Drawing ──
    function drawBackground() {
        const W = canvas.width, H = canvas.height;
        const t = (Date.now() - startTime) / 1000;

        // Dark gradient background (themed)
        const grad = ctx.createLinearGradient(0, 0, W * 0.3, H);
        grad.addColorStop(0, bgGrad[0]);
        grad.addColorStop(0.5, bgGrad[1] || bgGrad[0]);
        grad.addColorStop(1, bgGrad[1]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Animated background stars
        for (const star of bgStars) {
            star.y += star.speed;
            if (star.y > H) { star.y = 0; star.x = Math.random() * W; }
            star.twinkle += 0.02;
            const alpha = 0.3 + Math.sin(star.twinkle) * 0.25;
            ctx.fillStyle = `rgba(167,139,250,${alpha})`;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawBoard() {
        // Board background with subtle gradient
        const boardGrad = ctx.createLinearGradient(boardX, boardY, boardX, boardY + boardH);
        boardGrad.addColorStop(0, 'rgba(30,15,50,0.7)');
        boardGrad.addColorStop(1, 'rgba(10,5,20,0.8)');
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

        // Grid lines
        ctx.strokeStyle = 'rgba(168,85,247,0.08)';
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
                            const scale = 1 + progress * 0.3;
                            const alpha = 1 - progress;
                            drawCandy(boardX + c * cellSize, boardY + r * cellSize, cellSize, board[r][c], alpha, scale);
                            // White flash
                            ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - progress)})`;
                            ctx.fillRect(boardX + c * cellSize, boardY + r * cellSize, cellSize, cellSize);
                        }
                    } else {
                        drawCandy(boardX + c * cellSize, boardY + r * cellSize, cellSize, board[r][c], 1, 1);
                    }
                }
            }
        }

        // Board border with glow
        ctx.save();
        ctx.shadowColor = 'rgba(168,85,247,0.4)';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = 'rgba(168,85,247,0.5)';
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

    function drawCandy(x, y, sz, type, alpha, scale) {
        const col = COLORS[type];
        if (!col) return;
        const pad = Math.max(1, sz * 0.05);
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

        // Outer glow for big cells
        if (sz >= 20) {
            ctx.shadowColor = col.glow;
            ctx.shadowBlur = 6;
        }

        // Base fill with gradient
        const grad = ctx.createLinearGradient(bx, by, bx + bsz * 0.3, by + bsz);
        grad.addColorStop(0, col.light);
        grad.addColorStop(0.35, col.base);
        grad.addColorStop(1, col.dark);
        ctx.fillStyle = grad;
        roundRect(ctx, bx, by, bsz, bsz, r);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Inner border (darker)
        ctx.strokeStyle = col.dark;
        ctx.lineWidth = 1;
        ctx.globalAlpha = alpha * 0.4;
        roundRect(ctx, bx + 1, by + 1, bsz - 2, bsz - 2, r - 1);
        ctx.stroke();
        ctx.globalAlpha = alpha;

        // Glossy highlight (top half)
        const hl = ctx.createLinearGradient(bx, by, bx, by + bsz * 0.55);
        hl.addColorStop(0, 'rgba(255,255,255,0.45)');
        hl.addColorStop(0.6, 'rgba(255,255,255,0.08)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hl;
        roundRect(ctx, bx, by, bsz, bsz * 0.55, r);
        ctx.fill();

        // Shine dot
        if (sz >= 16) {
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.arc(bx + bsz * 0.26, by + bsz * 0.24, bsz * 0.09, 0, Math.PI * 2);
            ctx.fill();
        }

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
        for (const [cx, cy] of cells(current.type, current.rot)) {
            const px = boardX + (current.x + cx) * cellSize;
            const py = boardY + (gy + cy) * cellSize;
            const pad = 2;
            // Ghost as translucent block
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = col.base;
            roundRect(ctx, px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2, 3);
            ctx.fill();
            // Dashed border
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = col.light;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            roundRect(ctx, px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2, 3);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        }
    }

    function drawCurrent() {
        if (!current || paused) return;
        for (const [cx, cy] of cells(current.type, current.rot)) {
            const py = current.y + cy;
            if (py < 0) continue;
            drawCandy(boardX + (current.x + cx) * cellSize, boardY + py * cellSize, cellSize, current.type, 1, 1);
        }
    }

    function drawHardDropTrail() {
        for (let i = hardDropTrail.length - 1; i >= 0; i--) {
            const t = hardDropTrail[i];
            t.alpha -= 0.06;
            if (t.alpha <= 0) { hardDropTrail.splice(i, 1); continue; }
            const col = COLORS[t.type];
            ctx.globalAlpha = t.alpha * 0.3;
            ctx.fillStyle = col.light;
            ctx.fillRect(boardX + t.x * cellSize + 2, boardY + t.y * cellSize + 2, cellSize - 4, cellSize - 4);
            ctx.globalAlpha = 1;
        }
    }

    function drawHUD() {
        const W = canvas.width, H = canvas.height;
        const cx = hudCenterX;
        const t = (Date.now() - startTime) / 1000;

        // ── Title: "MAE-TRIS" with animated gradient ──
        const titleSize = Math.max(11, Math.min(18, hudW * 0.16)) | 0;
        const titleY = boardY + titleSize + 2;

        ctx.save();
        ctx.font = `bold ${titleSize}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        const hue = (t * 40) % 360;
        const tg = ctx.createLinearGradient(cx - 40, titleY, cx + 40, titleY);
        tg.addColorStop(0, `hsl(${hue}, 80%, 65%)`);
        tg.addColorStop(0.5, `hsl(${(hue + 120) % 360}, 80%, 65%)`);
        tg.addColorStop(1, `hsl(${(hue + 240) % 360}, 80%, 65%)`);
        ctx.fillStyle = tg;
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

        // ── Stats (compact inline) ──
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

        const labelSize = Math.max(7, Math.min(9, boxH * 0.3)) | 0;
        const valueSize = Math.max(10, Math.min(15, boxH * 0.5)) | 0;

        stats.forEach((s, i) => {
            const by = statY + i * (boxH + boxGap);

            // Subtle box bg
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            roundRect(ctx, boxX, by, boxW, boxH, 4);
            ctx.fill();

            // Colored left accent
            ctx.fillStyle = s.color;
            ctx.fillRect(boxX, by + 2, 2, boxH - 4);

            // Label left
            ctx.font = `600 ${labelSize}px "Segoe UI", system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.textAlign = 'left';
            ctx.fillText(s.label, boxX + 6, by + boxH / 2 + labelSize * 0.35);

            // Value right
            ctx.font = `bold ${valueSize}px "Segoe UI", system-ui, sans-serif`;
            ctx.fillStyle = s.color;
            ctx.textAlign = 'right';
            ctx.fillText(s.value, boxX + boxW - 4, by + boxH / 2 + valueSize * 0.35);
        });

        // ── NEXT preview ──
        const nextY = statY + stats.length * (boxH + boxGap) + 4;
        ctx.font = `600 ${labelSize}px "Segoe UI", system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.textAlign = 'center';
        ctx.fillText('NEXT', cx, nextY + labelSize);

        const previewSize = Math.max(8, Math.min(cellSize * 0.5, 14));

        for (let ni = 0; ni < Math.min(2, nextPieces.length); ni++) {
            const np = nextPieces[ni];
            const ps = PIECES[np].size;
            const pw = ps * previewSize;
            const ph = ps * previewSize;
            const pxOff = cx - pw / 2;
            const pyOff = nextY + labelSize + 6 + ni * (ph + 6);

            ctx.fillStyle = 'rgba(30,15,50,0.3)';
            roundRect(ctx, pxOff - 3, pyOff - 2, pw + 6, ph + 4, 3);
            ctx.fill();

            for (const [ccx, ccy] of cells(np, 0)) {
                drawCandy(pxOff + ccx * previewSize, pyOff + ccy * previewSize, previewSize, np, ni === 0 ? 1 : 0.4, 1);
            }
        }

        // ── Level up animation ──
        if (levelUpAnim > 0) {
            ctx.save();
            const alpha = Math.min(1, levelUpAnim / 30);
            const scale = 1 + (1 - alpha) * 0.3;
            const lcx = boardX + boardW / 2;
            const lcy = boardY + boardH / 2;
            ctx.translate(lcx, lcy);
            ctx.scale(scale, scale);
            ctx.translate(-lcx, -lcy);
            ctx.globalAlpha = alpha;
            const luSize = Math.max(24, cellSize * 1.5) | 0;
            ctx.font = `bold ${luSize}px "Segoe UI", system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.shadowColor = '#F59E0B';
            ctx.shadowBlur = 20;
            const luGrad = ctx.createLinearGradient(lcx - 80, lcy, lcx + 80, lcy);
            luGrad.addColorStop(0, '#FCD34D');
            luGrad.addColorStop(0.5, '#F59E0B');
            luGrad.addColorStop(1, '#FCD34D');
            ctx.fillStyle = luGrad;
            ctx.fillText(`LEVEL ${level}!`, lcx, lcy);
            ctx.restore();
            levelUpAnim--;
        }

        // ── Pause overlay ──
        if (paused) {
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(boardX, boardY, boardW, boardH);
            const pauseSize = Math.max(24, cellSize * 1.3) | 0;
            ctx.font = `bold ${pauseSize}px "Segoe UI", system-ui, sans-serif`;
            ctx.fillStyle = '#A855F7';
            ctx.textAlign = 'center';
            ctx.shadowColor = '#A855F7';
            ctx.shadowBlur = 16;
            ctx.fillText('PAUSED', boardX + boardW / 2, boardY + boardH / 2);
            ctx.shadowBlur = 0;
            ctx.font = `${Math.max(12, pauseSize * 0.45)|0}px "Segoe UI", system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText('Press P to resume', boardX + boardW / 2, boardY + boardH / 2 + pauseSize);
        }
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
        placePiece();
    }

    function placePiece() {
        lockPiece();
        const fullRows = getFullRows();
        if (fullRows.length > 0) {
            const n = fullRows.length;
            const gained = (LINE_SCORES[n] || 800) * level;
            score += gained;
            lines += n;

            if (n === 4) {
                playSound('tetris');
                // Confetti for Tetris!
                if (typeof Confetti !== 'undefined') Confetti.burst(boardX + boardW / 2, boardY + boardH / 2, 30);
            } else {
                playSound('clear');
            }

            const newLevel = Math.floor(lines / LINES_PER_LEVEL) + 1;
            if (newLevel > level) {
                level = newLevel;
                levelUpAnim = 60;
                playSound('levelup');
                if (typeof Confetti !== 'undefined') Confetti.rain(1500);
            }

            clearAnim = { rows: fullRows, start: Date.now(), duration: 350 };
            current = null;
        } else {
            spawn();
        }
    }

    // ── Input handling ──
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
            case 'ArrowLeft':  e.preventDefault(); moveLeft(); break;
            case 'ArrowRight': e.preventDefault(); moveRight(); break;
            case 'ArrowUp':    e.preventDefault(); tryRotate(); break;
            case 'ArrowDown':  e.preventDefault(); softDrop(); break;
            case ' ':          e.preventDefault(); hardDrop(); break;
        }
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

        if (paused) { render(); return; }

        // Handle clear animation completion
        if (clearAnim) {
            if (Date.now() - clearAnim.start >= clearAnim.duration) {
                removeRows(clearAnim.rows);
                clearAnim = null;
                spawn();
            }
            render();
            return;
        }

        if (!current) { render(); return; }

        // Gravity
        dropTimer += dt;
        if (dropTimer >= currentSpeed()) {
            dropTimer = 0;
            if (!softDrop()) {
                placePiece();
            }
        }

        render();
    }

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground();
        drawBoard();
        drawGhost();
        drawHardDropTrail();
        drawCurrent();
        drawHUD();
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

        computeLayout();
        clearBoard();
        initAudio();
        initBgStars();

        // Fill next queue and spawn
        while (nextPieces.length < 3) nextPieces.push(nextType());
        spawn();

        gameActive = true;

        // Listeners
        document.addEventListener('keydown', handleKeyDown);
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd);
        window.addEventListener('resize', onResize);

        animFrame = requestAnimationFrame(frame);
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
