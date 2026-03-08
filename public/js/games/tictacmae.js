/* Tic Tac — Theme-aware Tic Tac Toe for Your World Arcade
 * O = Themed circle + emoji   X = Themed crossed bars
 * Player vs AI with best-of-5 rounds. Canvas 2D, zero dependencies. */
window.TicTacMae = (() => {
    let canvas, ctx;
    let player = null, onGameOver = null;
    let gameActive = false;
    let animFrame = null;
    let frameCount = 0;
    let lastTime = 0;
    let startTime = 0;

    // Board state
    let board = []; // 0=empty, 1=player(O), 2=AI(X)
    let currentTurn = 1; // 1=player, 2=AI
    let roundOver = false;
    let winner = 0; // 0=none, 1=player, 2=AI, 3=draw
    let winLine = null; // {cells:[[r,c],[r,c],[r,c]], progress:0}
    let roundTimer = 0;
    let aiThinkTimer = 0;
    const AI_THINK_DELAY = 600;

    // Match state (best of 5)
    let playerWins = 0, aiWins = 0, draws = 0;
    let roundNum = 0;
    const MAX_ROUNDS = 5;
    let matchOver = false;
    let matchTimer = 0;

    // Animation
    let placedPieces = []; // {row, col, who, scale, alpha, time}
    let bgStars = [];
    let particles = [];

    // Layout
    let gridSize = 0, cellSize = 0, gridX = 0, gridY = 0;
    let SCALE = 1;

    // Theme-driven colors (set in init from ArcadeThemes)
    let STICK_COLORS = ['#F43F5E', '#EC4899']; // X piece colors
    let LOLLI_COLORS = ['#06B6D4', '#3B82F6', '#10B981']; // O piece colors
    let BOARD_COLOR = '#8B5CF6'; // Grid lines
    let BG_GRAD = ['#0A0A1A', '#1A0A2E']; // Background gradient
    let THEME_EMOJI = ['🎮', '🎯', '🧩', '🎲', '🎪', '🎨', '🎭']; // Piece emoji
    let THEME_ICON = '🎮'; // Scoreboard icon

    // ══════════════════════════════════════════════
    // AUDIO
    // ══════════════════════════════════════════════
    let audioCtx = null;
    function getAudioCtx() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
        }
        return audioCtx;
    }

    function playPlace() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.value = 660; osc.type = 'sine';
            gain.gain.setValueAtTime(0.1, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.12);
        } catch {}
    }

    function playWin() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            [0, 0.1, 0.2, 0.35].forEach((t, i) => {
                const osc = ac.createOscillator();
                const gain = ac.createGain();
                osc.connect(gain); gain.connect(ac.destination);
                osc.type = 'sine';
                osc.frequency.value = [523, 659, 784, 1047][i];
                gain.gain.setValueAtTime(0, ac.currentTime + t);
                gain.gain.linearRampToValueAtTime(0.12, ac.currentTime + t + 0.04);
                gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.25);
                osc.start(ac.currentTime + t); osc.stop(ac.currentTime + t + 0.25);
            });
        } catch {}
    }

    function playLose() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, ac.currentTime);
            osc.frequency.exponentialRampToValueAtTime(150, ac.currentTime + 0.5);
            gain.gain.setValueAtTime(0.1, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.5);
        } catch {}
    }

    function playDraw() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.type = 'triangle'; osc.frequency.value = 350;
            gain.gain.setValueAtTime(0.08, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.3);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.3);
        } catch {}
    }

    // ══════════════════════════════════════════════
    // BACKGROUND
    // ══════════════════════════════════════════════
    function initBgStars() {
        bgStars = [];
        for (let i = 0; i < 50; i++) {
            bgStars.push({
                x: Math.random(), y: Math.random(),
                r: 0.5 + Math.random() * 1.5,
                a: 0.08 + Math.random() * 0.2,
                speed: 0.3 + Math.random() * 0.7,
                phase: Math.random() * Math.PI * 2,
            });
        }
    }

    function drawBg(w, h) {
        // Themed gradient background
        const grad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h) * 0.7);
        grad.addColorStop(0, BG_GRAD[1] || '#1A0A2E');
        grad.addColorStop(1, BG_GRAD[0] || '#0A0A1A');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Animated stars (tinted to board color)
        const starColor = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.lighten(BOARD_COLOR, 40) : '#C4B5FD';
        const t = frameCount * 0.02;
        for (const s of bgStars) {
            const twinkle = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
            ctx.globalAlpha = s.a * twinkle;
            ctx.fillStyle = starColor;
            ctx.beginPath();
            ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ══════════════════════════════════════════════
    // PARTICLES
    // ══════════════════════════════════════════════
    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 120;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                r: 2 + Math.random() * 4,
                color,
                life: 1.0,
                decay: 0.6 + Math.random() * 0.8,
            });
        }
    }

    function updateParticles(dt) {
        particles = particles.filter(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 150 * dt; // gravity
            p.life -= p.decay * dt;
            return p.life > 0;
        });
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ══════════════════════════════════════════════
    // GAME LOGIC
    // ══════════════════════════════════════════════
    function resetBoard() {
        board = [[0,0,0],[0,0,0],[0,0,0]];
        placedPieces = [];
        roundOver = false;
        winner = 0;
        winLine = null;
        roundTimer = 0;
        aiThinkTimer = 0;
        // Alternate who goes first each round
        currentTurn = (roundNum % 2 === 0) ? 1 : 2;
        if (currentTurn === 2) aiThinkTimer = AI_THINK_DELAY;
    }

    function checkWin(b) {
        const lines = [
            [[0,0],[0,1],[0,2]], [[1,0],[1,1],[1,2]], [[2,0],[2,1],[2,2]], // rows
            [[0,0],[1,0],[2,0]], [[0,1],[1,1],[2,1]], [[0,2],[1,2],[2,2]], // cols
            [[0,0],[1,1],[2,2]], [[0,2],[1,1],[2,0]], // diagonals
        ];
        for (const line of lines) {
            const [a, b2, c] = line;
            if (b[a[0]][a[1]] && b[a[0]][a[1]] === b[b2[0]][b2[1]] && b[a[0]][a[1]] === b[c[0]][c[1]]) {
                return { winner: b[a[0]][a[1]], cells: line };
            }
        }
        // Check draw
        let full = true;
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (b[r][c] === 0) full = false;
        if (full) return { winner: 3, cells: null };
        return null;
    }

    function makeMove(row, col, who) {
        if (board[row][col] !== 0 || roundOver) return false;
        board[row][col] = who;
        placedPieces.push({
            row, col, who,
            scale: 0, alpha: 0,
            time: performance.now(),
        });
        playPlace();

        // Spawn small particles
        const cx = gridX + col * cellSize + cellSize / 2;
        const cy = gridY + row * cellSize + cellSize / 2;
        const color = who === 1 ? LOLLI_COLORS[0] : STICK_COLORS[0];
        spawnParticles(cx, cy, color, 8);

        // Check result
        const result = checkWin(board);
        if (result) {
            roundOver = true;
            winner = result.winner;
            if (result.cells) {
                winLine = { cells: result.cells, progress: 0 };
            }
            roundTimer = 0;

            if (winner === 1) {
                playerWins++;
                playWin();
                if (typeof Confetti !== 'undefined') Confetti.burst(canvas.width / 2, canvas.height / 2, 30);
            } else if (winner === 2) {
                aiWins++;
                playLose();
            } else {
                draws++;
                playDraw();
            }
            roundNum++;

            // Check if match is over
            if (playerWins >= 3 || aiWins >= 3 || roundNum >= MAX_ROUNDS) {
                matchOver = true;
                matchTimer = 0;
            }
        } else {
            currentTurn = who === 1 ? 2 : 1;
            if (currentTurn === 2) aiThinkTimer = AI_THINK_DELAY;
        }
        return true;
    }

    // ── AI (Minimax with occasional random for fun) ──
    function minimax(b, depth, isMax, alpha, beta) {
        const result = checkWin(b);
        if (result) {
            if (result.winner === 2) return 10 - depth; // AI wins
            if (result.winner === 1) return depth - 10; // Player wins
            return 0; // Draw
        }

        if (isMax) {
            let best = -Infinity;
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 3; c++) {
                    if (b[r][c] === 0) {
                        b[r][c] = 2;
                        best = Math.max(best, minimax(b, depth + 1, false, alpha, beta));
                        b[r][c] = 0;
                        alpha = Math.max(alpha, best);
                        if (beta <= alpha) return best;
                    }
                }
            }
            return best;
        } else {
            let best = Infinity;
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 3; c++) {
                    if (b[r][c] === 0) {
                        b[r][c] = 1;
                        best = Math.min(best, minimax(b, depth + 1, true, alpha, beta));
                        b[r][c] = 0;
                        beta = Math.min(beta, best);
                        if (beta <= alpha) return best;
                    }
                }
            }
            return best;
        }
    }

    function aiMove() {
        // 20% chance of random move for fun (so kids can sometimes win)
        if (Math.random() < 0.2) {
            const empties = [];
            for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (board[r][c] === 0) empties.push([r, c]);
            if (empties.length > 0) {
                const [r, c] = empties[Math.floor(Math.random() * empties.length)];
                makeMove(r, c, 2);
                return;
            }
        }

        let bestScore = -Infinity;
        let bestMove = null;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                if (board[r][c] === 0) {
                    board[r][c] = 2;
                    const score = minimax(board, 0, false, -Infinity, Infinity);
                    board[r][c] = 0;
                    if (score > bestScore) { bestScore = score; bestMove = [r, c]; }
                }
            }
        }
        if (bestMove) makeMove(bestMove[0], bestMove[1], 2);
    }

    // ══════════════════════════════════════════════
    // DRAWING
    // ══════════════════════════════════════════════
    function computeLayout() {
        const W = canvas.width, H = canvas.height;
        SCALE = Math.min(W, H) / 500;
        const hudH = Math.max(60, H * 0.13);
        const scoreH = Math.max(40, H * 0.08);
        const availH = H - hudH - scoreH - 30;
        const availW = W - 40;
        gridSize = Math.min(availW, availH);
        cellSize = Math.floor(gridSize / 3);
        gridSize = cellSize * 3;
        gridX = Math.round((W - gridSize) / 2);
        gridY = Math.round(hudH + 10);
    }

    function drawGrid() {
        const lineW = Math.max(3, 5 * SCALE);
        ctx.save();
        ctx.strokeStyle = BOARD_COLOR;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'round';
        ctx.shadowColor = BOARD_COLOR;
        ctx.shadowBlur = 8 * SCALE;

        // Vertical lines
        for (let i = 1; i < 3; i++) {
            const x = gridX + i * cellSize;
            ctx.beginPath();
            ctx.moveTo(x, gridY + 8);
            ctx.lineTo(x, gridY + gridSize - 8);
            ctx.stroke();
        }
        // Horizontal lines
        for (let i = 1; i < 3; i++) {
            const y = gridY + i * cellSize;
            ctx.beginPath();
            ctx.moveTo(gridX + 8, y);
            ctx.lineTo(gridX + gridSize - 8, y);
            ctx.stroke();
        }
        ctx.restore();

        // Cell hover effect for empty cells on player's turn
        if (currentTurn === 1 && !roundOver && !matchOver) {
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 3; c++) {
                    if (board[r][c] === 0) {
                        const cx = gridX + c * cellSize + cellSize / 2;
                        const cy = gridY + r * cellSize + cellSize / 2;
                        const pulse = 0.03 + 0.02 * Math.sin(frameCount * 0.06 + r * 2 + c);
                        ctx.save();
                        const hoverHex = BOARD_COLOR.replace('#', '');
                        const hR = parseInt(hoverHex.substring(0, 2), 16);
                        const hG = parseInt(hoverHex.substring(2, 4), 16);
                        const hB = parseInt(hoverHex.substring(4, 6), 16);
                        ctx.fillStyle = `rgba(${hR}, ${hG}, ${hB}, ${pulse})`;
                        ctx.beginPath();
                        ctx.arc(cx, cy, cellSize * 0.35, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();
                    }
                }
            }
        }
    }

    function drawLollipop(cx, cy, size, piece) {
        // O piece — Themed circle with emoji
        const elapsed = (performance.now() - piece.time) / 1000;
        const scale = Math.min(1, piece.scale);
        const r = size * 0.35 * scale;
        const wobble = Math.sin(elapsed * 2.0) * 0.05; // Gentle wobble

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.rotate(wobble);

        // Filled circle with gradient (light center to dark edge)
        const lightColor = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.lighten(LOLLI_COLORS[0], 30) : LOLLI_COLORS[0];
        const darkColor = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.darken(LOLLI_COLORS[0], 20) : LOLLI_COLORS[1];
        const circGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
        circGrad.addColorStop(0, lightColor);
        circGrad.addColorStop(1, darkColor);

        ctx.shadowColor = LOLLI_COLORS[0];
        ctx.shadowBlur = 8 * SCALE;
        ctx.fillStyle = circGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // Outer ring
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = Math.max(1, size * 0.02);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();

        // Glossy highlight
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.25, -r * 0.3, r * 0.25, r * 0.14, -0.4, 0, Math.PI * 2);
        ctx.fill();

        // Emoji in center
        ctx.shadowBlur = 0;
        const emojiSize = Math.max(14, r * 1.1);
        ctx.font = `${emojiSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(THEME_EMOJI[1] || '🎯', 0, 0);

        ctx.restore();
    }

    function drawCrossedSticks(cx, cy, size, piece) {
        // X piece — Two themed crossed bars with rounded ends
        const scale = Math.min(1, piece.scale);
        const arm = size * 0.35 * scale;
        const stickW = Math.max(4, size * 0.09);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);

        // Draw two crossed bars
        for (let s = 0; s < 2; s++) {
            const angle = s === 0 ? Math.PI / 4 : -Math.PI / 4;
            const color = STICK_COLORS[s];

            ctx.save();
            ctx.rotate(angle);

            // Glow
            ctx.shadowColor = color;
            ctx.shadowBlur = 6 * SCALE;

            // Main bar with rounded ends
            ctx.strokeStyle = color;
            ctx.lineWidth = stickW;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, -arm);
            ctx.lineTo(0, arm);
            ctx.stroke();

            // Subtle highlight stripe down center
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = Math.max(1, stickW * 0.3);
            ctx.beginPath();
            ctx.moveTo(0, -arm * 0.85);
            ctx.lineTo(0, arm * 0.85);
            ctx.stroke();

            ctx.restore();
        }

        // Emoji in center (optional)
        ctx.shadowBlur = 0;
        const emojiSize = Math.max(12, arm * 0.7);
        ctx.font = `${emojiSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(THEME_EMOJI[0] || '🎮', 0, 0);

        ctx.restore();
    }

    function drawPieces() {
        const now = performance.now();
        for (const piece of placedPieces) {
            const elapsed = (now - piece.time) / 1000;
            // Elastic scale-in animation
            piece.scale = Math.min(1, elapsed * 4);
            if (piece.scale < 1) {
                piece.scale = 1 - Math.pow(1 - piece.scale, 3); // ease-out cubic
                piece.scale = piece.scale + Math.sin(piece.scale * Math.PI) * 0.15; // overshoot
            }

            const cx = gridX + piece.col * cellSize + cellSize / 2;
            const cy = gridY + piece.row * cellSize + cellSize / 2;

            if (piece.who === 1) {
                drawLollipop(cx, cy, cellSize, piece);
            } else {
                drawCrossedSticks(cx, cy, cellSize, piece);
            }
        }
    }

    function drawWinLine() {
        if (!winLine) return;
        winLine.progress = Math.min(1, winLine.progress + 0.03);

        const [a, b2, c] = winLine.cells;
        const ax = gridX + a[1] * cellSize + cellSize / 2;
        const ay = gridY + a[0] * cellSize + cellSize / 2;
        const cx2 = gridX + c[1] * cellSize + cellSize / 2;
        const cy2 = gridY + c[0] * cellSize + cellSize / 2;

        const prog = winLine.progress;
        const ex = ax + (cx2 - ax) * prog;
        const ey = ay + (cy2 - ay) * prog;

        ctx.save();
        ctx.strokeStyle = winner === 1 ? LOLLI_COLORS[0] : STICK_COLORS[0];
        ctx.lineWidth = Math.max(4, 6 * SCALE);
        ctx.lineCap = 'round';
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 12 * SCALE;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.restore();
    }

    function drawHUD(w, h) {
        const hudH = gridY - 5;

        // Title with animated gradient
        const titleSize = Math.max(16, 28 * SCALE);
        ctx.font = `bold ${titleSize}px "Orbitron", "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        const hue = (frameCount * 2) % 360;
        const titleGrad = ctx.createLinearGradient(w/2 - 80, 0, w/2 + 80, 0);
        titleGrad.addColorStop(0, `hsl(${hue}, 85%, 65%)`);
        titleGrad.addColorStop(0.5, `hsl(${(hue + 60) % 360}, 85%, 75%)`);
        titleGrad.addColorStop(1, `hsl(${(hue + 120) % 360}, 85%, 65%)`);
        ctx.fillStyle = titleGrad;
        ctx.shadowColor = '#A855F7';
        ctx.shadowBlur = 8;
        ctx.fillText('TIC TAC TOE', w / 2, hudH * 0.42);
        ctx.shadowBlur = 0;

        // Player info
        ctx.textAlign = 'left';
        ctx.font = `bold ${Math.max(11, 14 * SCALE)}px "Segoe UI", system-ui`;
        ctx.fillStyle = player?.color || LOLLI_COLORS[0];
        ctx.fillText(`${player?.emoji || THEME_ICON} ${player?.name || 'Player'}`, 10, hudH * 0.72);

        // Round info
        ctx.textAlign = 'right';
        ctx.fillStyle = '#94A3B8';
        ctx.font = `${Math.max(10, 12 * SCALE)}px "Segoe UI", system-ui`;
        ctx.fillText(`Round ${Math.min(roundNum + 1, MAX_ROUNDS)} / ${MAX_ROUNDS}`, w - 10, hudH * 0.72);
    }

    function drawScoreboard(w, h) {
        const sbY = gridY + gridSize + 12;
        const sbH = h - sbY - 5;
        if (sbH < 20) return;

        const boxW = Math.min(gridSize, w - 20);
        const boxX = (w - boxW) / 2;

        // Score boxes
        const third = boxW / 3;
        const items = [
            { label: `${THEME_ICON} You`, val: playerWins, color: LOLLI_COLORS[0] },
            { label: '🤝 Draw', val: draws, color: '#94A3B8' },
            { label: '🤖 Mae', val: aiWins, color: STICK_COLORS[0] },
        ];

        const fontSize = Math.max(10, 13 * SCALE);
        const valSize = Math.max(16, 24 * SCALE);

        items.forEach((item, i) => {
            const cx = boxX + third * i + third / 2;
            const cy = sbY + sbH * 0.4;

            // Box background
            const bgHex = item.color.replace('#', '');
            const bgR = parseInt(bgHex.substring(0, 2), 16);
            const bgG = parseInt(bgHex.substring(2, 4), 16);
            const bgB = parseInt(bgHex.substring(4, 6), 16);
            ctx.fillStyle = `rgba(${bgR},${bgG},${bgB}, 0.1)`;
            const bx = boxX + third * i + 4;
            const bw = third - 8;
            const bh = sbH - 8;
            ctx.beginPath();
            roundRect(ctx, bx, sbY + 2, bw, bh, 8);
            ctx.fill();

            // Value
            ctx.font = `bold ${valSize}px "Orbitron", monospace`;
            ctx.textAlign = 'center';
            ctx.fillStyle = item.color;
            ctx.fillText(item.val, cx, cy);

            // Label
            ctx.font = `${fontSize}px "Segoe UI", system-ui`;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText(item.label, cx, cy + valSize * 0.8);
        });

        // Turn indicator
        if (!roundOver && !matchOver) {
            ctx.textAlign = 'center';
            ctx.font = `bold ${Math.max(11, 13 * SCALE)}px "Segoe UI", system-ui`;
            const pulse = 0.6 + 0.4 * Math.sin(frameCount * 0.08);
            if (currentTurn === 1) {
                const oHex = LOLLI_COLORS[0].replace('#', '');
                const oR = parseInt(oHex.substring(0, 2), 16);
                const oG = parseInt(oHex.substring(2, 4), 16);
                const oB = parseInt(oHex.substring(4, 6), 16);
                ctx.fillStyle = `rgba(${oR}, ${oG}, ${oB}, ${pulse})`;
                ctx.fillText(`${THEME_ICON} Your turn — tap a square!`, w / 2, sbY - 3);
            } else {
                const xHex = STICK_COLORS[0].replace('#', '');
                const xR = parseInt(xHex.substring(0, 2), 16);
                const xG = parseInt(xHex.substring(2, 4), 16);
                const xB = parseInt(xHex.substring(4, 6), 16);
                ctx.fillStyle = `rgba(${xR}, ${xG}, ${xB}, ${pulse})`;
                ctx.fillText('🤖 AI is thinking...', w / 2, sbY - 3);
            }
        }
    }

    function drawRoundResult(w, h) {
        if (!roundOver || matchOver) return;
        roundTimer += 1;
        if (roundTimer < 30) return; // Brief delay

        const alpha = Math.min(1, (roundTimer - 30) / 20);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';

        const msg = winner === 1 ? `${THEME_ICON} You Win!` : winner === 2 ? '🤖 Mae Wins!' : '🤝 Draw!';
        const color = winner === 1 ? LOLLI_COLORS[0] : winner === 2 ? STICK_COLORS[0] : '#FFD700';
        const size = Math.max(18, 28 * SCALE);

        ctx.font = `bold ${size}px "Orbitron", "Press Start 2P", monospace`;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fillText(msg, w / 2, gridY + gridSize / 2);
        ctx.shadowBlur = 0;

        // "Tap to continue" hint
        if (roundTimer > 60) {
            const hintPulse = 0.4 + 0.4 * Math.sin(frameCount * 0.08);
            ctx.font = `${Math.max(10, 12 * SCALE)}px "Segoe UI", system-ui`;
            ctx.fillStyle = `rgba(255,255,255,${hintPulse})`;
            ctx.fillText('Tap to continue', w / 2, gridY + gridSize / 2 + size + 5);
        }
        ctx.restore();
    }

    function drawMatchResult(w, h) {
        if (!matchOver) return;
        matchTimer += 1;
        const alpha = Math.min(1, matchTimer / 30);

        ctx.save();
        ctx.globalAlpha = alpha * 0.7;
        ctx.fillStyle = BG_GRAD[0] || '#0A0A1A';
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = alpha;

        ctx.textAlign = 'center';
        const isWin = playerWins > aiWins;
        const isDraw = playerWins === aiWins;
        const title = isWin ? '🏆 You Win the Match!' : isDraw ? '🤝 Match Drawn!' : '🤖 Mae Wins the Match!';
        const color = isWin ? '#FFD700' : isDraw ? '#94A3B8' : STICK_COLORS[0];
        const titleSize = Math.max(18, 26 * SCALE);

        ctx.font = `bold ${titleSize}px "Orbitron", "Press Start 2P", monospace`;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.fillText(title, w / 2, h * 0.35);
        ctx.shadowBlur = 0;

        // Score summary
        ctx.font = `bold ${Math.max(14, 18 * SCALE)}px "Segoe UI", system-ui`;
        ctx.fillStyle = '#FFF';
        ctx.fillText(`${playerWins} - ${aiWins}`, w / 2, h * 0.47);
        ctx.font = `${Math.max(10, 12 * SCALE)}px "Segoe UI", system-ui`;
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(`${draws} draw${draws !== 1 ? 's' : ''}`, w / 2, h * 0.53);

        // Total score
        const totalScore = playerWins * 200 + draws * 50;
        ctx.font = `bold ${Math.max(20, 30 * SCALE)}px "Orbitron", monospace`;
        ctx.fillStyle = '#FFD700';
        ctx.fillText(`${totalScore} pts`, w / 2, h * 0.65);

        ctx.restore();
    }

    function roundRect(c, x, y, w, h, r) {
        c.moveTo(x + r, y);
        c.lineTo(x + w - r, y);
        c.arcTo(x + w, y, x + w, y + r, r);
        c.lineTo(x + w, y + h - r);
        c.arcTo(x + w, y + h, x + w - r, y + h, r);
        c.lineTo(x + r, y + h);
        c.arcTo(x, y + h, x, y + h - r, r);
        c.lineTo(x, y + r);
        c.arcTo(x, y, x + r, y, r);
    }

    // ══════════════════════════════════════════════
    // GAME LOOP
    // ══════════════════════════════════════════════
    function update(dt) {
        frameCount++;
        updateParticles(dt);

        if (!gameActive) return;
        if (matchOver) {
            if (matchTimer > 90 && onGameOver) {
                gameActive = false;
                const duration = Math.round((Date.now() - startTime) / 1000);
                const totalScore = playerWins * 200 + draws * 50;
                onGameOver({
                    score: totalScore,
                    level: roundNum,
                    duration,
                    playerWins, aiWins, draws,
                });
            }
            return;
        }

        // AI turn
        if (currentTurn === 2 && !roundOver) {
            aiThinkTimer -= dt * 1000;
            if (aiThinkTimer <= 0) {
                aiMove();
            }
        }

        // Auto-advance round after delay
        if (roundOver && !matchOver && roundTimer > 120) {
            // Auto-advance after ~2 seconds if not tapped
            resetBoard();
        }
    }

    function render() {
        if (!canvas || !ctx) return;
        animFrame = requestAnimationFrame(render);

        const now = performance.now();
        const dt = Math.min((now - (lastTime || now)) / 1000, 0.05);
        lastTime = now;

        const w = canvas.width, h = canvas.height;

        drawBg(w, h);
        update(dt);

        if (!matchOver) {
            drawGrid();
            drawPieces();
            drawWinLine();
        }

        drawHUD(w, h);
        drawScoreboard(w, h);
        drawRoundResult(w, h);
        drawMatchResult(w, h);
        drawParticles();
    }

    // ══════════════════════════════════════════════
    // INPUT
    // ══════════════════════════════════════════════
    function handleClick(e) {
        if (!gameActive) return;
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // If round is over, advance
        if (roundOver && !matchOver) {
            resetBoard();
            return;
        }

        if (currentTurn !== 1 || roundOver || matchOver) return;

        // Check which cell was clicked
        const col = Math.floor((x - gridX) / cellSize);
        const row = Math.floor((y - gridY) / cellSize);

        if (row >= 0 && row < 3 && col >= 0 && col < 3) {
            makeMove(row, col, 1);
        }
    }

    function handleTouch(e) {
        e.preventDefault();
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            handleClick({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }

    function handleKeyDown(e) {
        if (!gameActive) return;
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

        // Space/Enter to advance round
        if ((e.key === ' ' || e.key === 'Enter') && roundOver && !matchOver) {
            e.preventDefault();
            resetBoard();
            return;
        }

        // Number keys 1-9 (numpad layout) to place
        if (currentTurn === 1 && !roundOver && !matchOver) {
            const num = parseInt(e.key);
            if (num >= 1 && num <= 9) {
                e.preventDefault();
                // Numpad layout: 7-8-9 = top row, 4-5-6 = mid, 1-2-3 = bottom
                const map = { 7:[0,0], 8:[0,1], 9:[0,2], 4:[1,0], 5:[1,1], 6:[1,2], 1:[2,0], 2:[2,1], 3:[2,2] };
                const cell = map[num];
                if (cell) makeMove(cell[0], cell[1], 1);
            }
        }
    }

    // ══════════════════════════════════════════════
    // PUBLIC API
    // ══════════════════════════════════════════════
    function init(canvasEl, activePlayer, gameOverCallback) {
        destroy();

        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer;
        onGameOver = gameOverCallback;

        // Load theme from ArcadeThemes
        const themeId = activePlayer?.theme || 'retro';
        const theme = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        const TC = theme ? theme.colors : ['#F43F5E','#EC4899','#06B6D4','#3B82F6','#8B5CF6','#10B981'];
        const TE = theme ? theme.blockEmoji : ['🎮','🎯','🧩','🎲','🎪','🎨','🎭'];
        STICK_COLORS = [TC[0], TC[1]];
        LOLLI_COLORS = [TC[2], TC[3], TC[5]];
        BOARD_COLOR = TC[4];
        BG_GRAD = theme ? theme.bgGradient : ['#0A0A1A', '#1A0A2E'];
        THEME_EMOJI = TE;
        THEME_ICON = theme?.icon || '🎮';

        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        if (canvas.width < 100) canvas.width = 480;
        if (canvas.height < 100) canvas.height = 640;

        computeLayout();

        score = 0; playerWins = 0; aiWins = 0; draws = 0;
        roundNum = 0; matchOver = false; matchTimer = 0;
        gameActive = true;
        frameCount = 0; lastTime = 0;
        startTime = Date.now();
        particles = [];

        initBgStars();
        resetBoard();

        // Bind events
        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('touchstart', handleTouch, { passive: false });
        document.addEventListener('keydown', handleKeyDown, true);

        canvas.setAttribute('tabindex', '0');
        canvas.style.outline = 'none';
        canvas.focus();

        render();
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        if (canvas) {
            canvas.removeEventListener('click', handleClick);
            canvas.removeEventListener('touchstart', handleTouch);
        }
        document.removeEventListener('keydown', handleKeyDown, true);
        canvas = null; ctx = null;
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
    }

    return {
        init,
        destroy,
        getScore() { return playerWins * 200 + draws * 50; },
        getLevel() { return roundNum; },
        isActive() { return gameActive; },
    };
})();
