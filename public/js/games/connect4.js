/* Connect4 — Kenney Board Game Pack CC0 sprites — Connect Four for Your World Arcade
 * Player (red) vs AI (yellow) with minimax alpha-beta pruning.
 * Best-of-5 series, 3 difficulty levels. Canvas 2D, zero dependencies. */
window.Connect4 = (() => {

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

    // ══════════════════════════════════════════
    //  SPRITE SYSTEM — Kenney Board Game Pack
    // ══════════════════════════════════════════
    const SPRITES = {};
    let spritesLoaded = false;
    let spriteLoadTotal = 0, spriteLoadDone = 0;
    const SPRITE_OK = {};
    const BG_ASSET = '/img/game-assets/kenney-boardgame/';
    const SPRITE_MANIFEST = {
        // Board-game chips & pieces for discs
        'chipRed':        BG_ASSET + 'chipRedWhite_border.png',
        'chipBlue':       BG_ASSET + 'chipBlue_border.png',
        'pieceRed':       BG_ASSET + 'pieceRed_border00.png',
        'pieceYellow':    BG_ASSET + 'pieceYellow_border00.png',
        // Side-view chips for decorative elements
        'chipRedSide':    BG_ASSET + 'chipRedWhite_sideBorder.png',
        'chipBlueSide':   BG_ASSET + 'chipBlueWhite_sideBorder.png',
        // Legacy fallback keys (mapped to board game pack)
        'discRed':        BG_ASSET + 'chipRedWhite_border.png',
        'discYellow':     BG_ASSET + 'pieceYellow_border00.png',
        'star':           '/img/game-assets/kenney-ui/star.png',
    };

    function preloadSprites(onProgress, onDone) {
        const keys = Object.keys(SPRITE_MANIFEST);
        spriteLoadTotal = keys.length;
        spriteLoadDone = 0;
        if (keys.length === 0) { spritesLoaded = true; onDone(); return; }
        for (const key of keys) {
            const img = new Image();
            img.onload = () => { SPRITE_OK[key] = true; spriteLoadDone++; onProgress(spriteLoadDone / spriteLoadTotal); if (spriteLoadDone >= spriteLoadTotal) { spritesLoaded = true; onDone(); } };
            img.onerror = () => { SPRITE_OK[key] = false; spriteLoadDone++; onProgress(spriteLoadDone / spriteLoadTotal); if (spriteLoadDone >= spriteLoadTotal) { spritesLoaded = true; onDone(); } };
            img.src = SPRITE_MANIFEST[key];
            SPRITES[key] = img;
        }
    }

    function spr(key) { return SPRITE_OK[key] ? SPRITES[key] : null; }

    let loadingProgress = 0;
    let isLoading = true;

    function drawLoadingScreen() {
        const cW = canvas.width, cH = canvas.height;
        ctx.fillStyle = '#0A0A1A';
        ctx.fillRect(0, 0, cW, cH);
        ctx.fillStyle = '#3B82F6';
        ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('CONNECT 4', cW / 2, cH / 2 - 40);
        const barW = cW * 0.5, barH = 12;
        const barX = (cW - barW) / 2, barY = cH / 2;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#3B82F6';
        ctx.fillRect(barX, barY, barW * loadingProgress, barH);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        ctx.fillText('Loading sprites...', cW / 2, barY + barH + 20);
    }

    // ── Constants ──────────────────────────────────────────────
    const BASE_W = 480, BASE_H = 640;
    const COLS = 7, ROWS = 6;
    const CELL_SIZE = 58;
    const DISC_R = 24;
    const BOARD_PAD = 12;
    const BOARD_W = COLS * CELL_SIZE + BOARD_PAD * 2;
    const BOARD_H = ROWS * CELL_SIZE + BOARD_PAD * 2;
    const BOARD_X = (BASE_W - BOARD_W) / 2;
    const BOARD_Y = 160;
    const BOARD_RADIUS = 14;

    const GRAVITY = 0.65;
    const BOUNCE_DAMP = 0.35;
    const MIN_BOUNCE_VEL = 1.5;

    const MAX_ROUNDS = 5;
    const WIN_ROUNDS = 3;

    // AI depth per difficulty
    const DIFFICULTY = { easy: 0, medium: 3, hard: 6 };

    // Game states
    const ST_TITLE   = 0;
    const ST_PLAYING = 1;
    const ST_DROPPING = 2;
    const ST_WIN     = 3;
    const ST_DRAW    = 4;
    const ST_MATCH_OVER = 5;

    // ── Theme colors (overridden in init) ──────────────────────
    let BG_TOP       = '#0A0A1A';
    let BG_BOT       = '#1A0A2E';
    let BOARD_CLR    = '#1E40AF';
    let BOARD_CLR2   = '#1E3A8A';
    let PLAYER_CLR   = '#EF4444';
    let PLAYER_CLR2  = '#DC2626';
    let AI_CLR       = '#FACC15';
    let AI_CLR2      = '#EAB308';
    let GLOW_CLR     = '#F472B6';
    let TEXT_CLR     = '#FFFFFF';
    let HOLE_CLR     = '#0F172A';

    // High score tracking
    const LS_KEY = 'connect4_highscore';
    function loadHighScore() { try { return parseInt(localStorage.getItem(LS_KEY)) || 0; } catch { return 0; } }
    function saveHighScore(s) { try { localStorage.setItem(LS_KEY, s); } catch {} }
    let highScore = 0;

    // ── Module-level variables ────────────────────────────────
    let canvas, ctx, W, H, scale;
    let state;
    let animFrame = null;
    let audioCtx  = null;
    let player    = null;
    let onGameOver = null;
    let gameActive = false;

    // Board: 0=empty, 1=player, 2=AI
    let board;
    let currentTurn; // 1=player, 2=AI
    let difficulty;
    let hoverCol;

    // Drop animation
    let dropCol, dropRow, dropY, dropVY, dropWho;
    let dropTargetY;

    // Win state
    let winCells;
    let winPulse;

    // Series
    let playerWins, aiWins, roundNum;
    let roundPauseTimer;
    let score, level;
    let startTime;

    // Effects
    let particles;
    let bgStars;
    let frameCount;
    let titlePulse;

    // Input
    let keys;
    let selectedCol;
    let aiThinkTimer;
    let aiMoveCol;

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

    function playDrop() { tone(280, 0.06, 'sine', 0.08); }
    function playLand() {
        const ac = ensureAudio(); if (!ac) return;
        try {
            const t = ac.currentTime;
            // Thud — low noise burst
            const buf = ac.createBuffer(1, ac.sampleRate * 0.08, ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.02));
            }
            const src = ac.createBufferSource();
            src.buffer = buf;
            const g = ac.createGain();
            g.gain.setValueAtTime(0.15, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            const filt = ac.createBiquadFilter();
            filt.type = 'lowpass';
            filt.frequency.value = 200;
            src.connect(filt);
            filt.connect(g);
            g.connect(ac.destination);
            src.start(t);
        } catch {}
    }
    function playWin() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        [523, 659, 784, 1047, 1319].forEach((f, i) => {
            tone(f, 0.22, 'sine', 0.13, t + i * 0.1);
        });
    }
    function playLose() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        tone(440, 0.18, 'sawtooth', 0.08, t);
        tone(330, 0.25, 'sawtooth', 0.08, t + 0.15);
    }
    function playDraw() {
        const ac = ensureAudio(); if (!ac) return;
        tone(350, 0.3, 'triangle', 0.08);
    }
    function playSelect() { tone(440, 0.05, 'sine', 0.06); }

    // ── Particle system ───────────────────────────────────────
    function spawnBurst(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 4 + 1.5;
            particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s - 1,
                life: 1.0,
                decay: Math.random() * 0.02 + 0.012,
                r: Math.random() * 4 + 1.5,
                color: color || '#FFF'
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.06;
            p.vx *= 0.98;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
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
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    // ── Background ────────────────────────────────────────────
    function initBgStars() {
        bgStars = [];
        for (let i = 0; i < 60; i++) {
            bgStars.push({
                x: Math.random() * BASE_W,
                y: Math.random() * BASE_H,
                r: Math.random() * 1.5 + 0.3,
                twinkle: Math.random() * Math.PI * 2,
                speed: Math.random() * 0.02 + 0.01
            });
        }
    }

    function drawBackground() {
        const grad = ctx.createLinearGradient(0, 0, 0, BASE_H);
        grad.addColorStop(0, BG_TOP);
        grad.addColorStop(1, BG_BOT);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, BASE_W, BASE_H);

        // Stars
        for (const s of bgStars) {
            s.twinkle += s.speed;
            const alpha = 0.3 + 0.4 * Math.sin(s.twinkle);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ── Canvas sizing ─────────────────────────────────────────
    function fitCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const parent = canvas.parentElement;
        if (!parent) return;
        const pw = parent.clientWidth;
        const ph = parent.clientHeight;
        const aspect = BASE_W / BASE_H;
        let w, h;
        if (pw / ph > aspect) { h = ph; w = h * aspect; }
        else { w = pw; h = w / aspect; }
        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';
        canvas.width  = BASE_W * dpr;
        canvas.height = BASE_H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        W = BASE_W;
        H = BASE_H;
        scale = w / BASE_W;
    }

    // ── Board helpers ─────────────────────────────────────────
    function resetBoard() {
        board = [];
        for (let r = 0; r < ROWS; r++) {
            board.push(new Array(COLS).fill(0));
        }
    }

    function cellCenter(r, c) {
        return {
            x: BOARD_X + BOARD_PAD + c * CELL_SIZE + CELL_SIZE / 2,
            y: BOARD_Y + BOARD_PAD + r * CELL_SIZE + CELL_SIZE / 2
        };
    }

    function lowestEmptyRow(col) {
        for (let r = ROWS - 1; r >= 0; r--) {
            if (board[r][col] === 0) return r;
        }
        return -1;
    }

    function boardFull() {
        for (let c = 0; c < COLS; c++) {
            if (board[0][c] === 0) return false;
        }
        return true;
    }

    // ── Win detection ─────────────────────────────────────────
    function checkWin(who) {
        // Directions: right, down, down-right, down-left
        const dirs = [[0,1],[1,0],[1,1],[1,-1]];
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (board[r][c] !== who) continue;
                for (const [dr, dc] of dirs) {
                    let cells = [[r, c]];
                    for (let i = 1; i < 4; i++) {
                        const nr = r + dr * i;
                        const nc = c + dc * i;
                        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
                        if (board[nr][nc] !== who) break;
                        cells.push([nr, nc]);
                    }
                    if (cells.length === 4) return cells;
                }
            }
        }
        return null;
    }

    // ── AI: Minimax with alpha-beta pruning ───────────────────
    function evaluate(b) {
        // Score the board for AI (who=2)
        let score = 0;
        // Center column preference
        for (let r = 0; r < ROWS; r++) {
            if (b[r][3] === 2) score += 3;
            else if (b[r][3] === 1) score -= 3;
        }
        // Evaluate all windows of 4
        const dirs = [[0,1],[1,0],[1,1],[1,-1]];
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                for (const [dr, dc] of dirs) {
                    const window = [];
                    for (let i = 0; i < 4; i++) {
                        const nr = r + dr * i;
                        const nc = c + dc * i;
                        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
                        window.push(b[nr][nc]);
                    }
                    if (window.length === 4) {
                        score += scoreWindow(window);
                    }
                }
            }
        }
        return score;
    }

    function scoreWindow(w) {
        const ai = w.filter(v => v === 2).length;
        const pl = w.filter(v => v === 1).length;
        const em = w.filter(v => v === 0).length;
        let s = 0;
        if (ai === 4) s += 1000;
        else if (ai === 3 && em === 1) s += 50;
        else if (ai === 2 && em === 2) s += 10;
        if (pl === 3 && em === 1) s -= 80; // Block urgency
        else if (pl === 4) s -= 1000;
        return s;
    }

    function getValidCols(b) {
        const cols = [];
        for (let c = 0; c < COLS; c++) {
            if (b[0][c] === 0) cols.push(c);
        }
        return cols;
    }

    function dropPiece(b, col, who) {
        for (let r = ROWS - 1; r >= 0; r--) {
            if (b[r][col] === 0) { b[r][col] = who; return r; }
        }
        return -1;
    }

    function hasWin(b, who) {
        const dirs = [[0,1],[1,0],[1,1],[1,-1]];
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (b[r][c] !== who) continue;
                for (const [dr, dc] of dirs) {
                    let count = 1;
                    for (let i = 1; i < 4; i++) {
                        const nr = r + dr * i;
                        const nc = c + dc * i;
                        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
                        if (b[nr][nc] !== who) break;
                        count++;
                    }
                    if (count >= 4) return true;
                }
            }
        }
        return false;
    }

    function isFull(b) {
        for (let c = 0; c < COLS; c++) {
            if (b[0][c] === 0) return false;
        }
        return true;
    }

    function minimax(b, depth, alpha, beta, maximizing) {
        if (hasWin(b, 2)) return { score: 100000 + depth };
        if (hasWin(b, 1)) return { score: -100000 - depth };
        const valid = getValidCols(b);
        if (valid.length === 0 || depth === 0) return { score: evaluate(b) };

        if (maximizing) {
            let best = { score: -Infinity, col: valid[0] };
            for (const c of valid) {
                const nb = b.map(r => [...r]);
                dropPiece(nb, c, 2);
                const val = minimax(nb, depth - 1, alpha, beta, false).score;
                if (val > best.score) { best.score = val; best.col = c; }
                alpha = Math.max(alpha, val);
                if (alpha >= beta) break;
            }
            return best;
        } else {
            let best = { score: Infinity, col: valid[0] };
            for (const c of valid) {
                const nb = b.map(r => [...r]);
                dropPiece(nb, c, 1);
                const val = minimax(nb, depth - 1, alpha, beta, true).score;
                if (val < best.score) { best.score = val; best.col = c; }
                beta = Math.min(beta, val);
                if (alpha >= beta) break;
            }
            return best;
        }
    }

    function getAIMove() {
        const valid = getValidCols(board);
        if (valid.length === 0) return -1;

        if (difficulty === 'easy') {
            // Random with slight preference for center
            const weighted = [];
            for (const c of valid) {
                const w = c === 3 ? 3 : (c === 2 || c === 4) ? 2 : 1;
                for (let i = 0; i < w; i++) weighted.push(c);
            }
            return weighted[Math.floor(Math.random() * weighted.length)];
        }

        const depth = DIFFICULTY[difficulty];
        const result = minimax(board.map(r => [...r]), depth, -Infinity, Infinity, true);
        return result.col !== undefined ? result.col : valid[Math.floor(Math.random() * valid.length)];
    }

    // ── Drop animation ────────────────────────────────────────
    function startDrop(col, who) {
        const row = lowestEmptyRow(col);
        if (row < 0) return false;

        dropCol = col;
        dropRow = row;
        dropWho = who;
        dropY = BOARD_Y - CELL_SIZE;
        dropVY = 0;
        const target = cellCenter(row, col);
        dropTargetY = target.y;
        state = ST_DROPPING;
        playDrop();
        return true;
    }

    function updateDrop() {
        dropVY += GRAVITY;
        dropY += dropVY;

        if (dropY >= dropTargetY) {
            dropY = dropTargetY;
            if (Math.abs(dropVY) > MIN_BOUNCE_VEL) {
                dropVY = -dropVY * BOUNCE_DAMP;
                playLand();
            } else {
                // Landed
                dropVY = 0;
                dropY = dropTargetY;
                board[dropRow][dropCol] = dropWho;
                playLand();

                // Spawn landing particles
                const cx = cellCenter(dropRow, dropCol);
                const clr = dropWho === 1 ? PLAYER_CLR : AI_CLR;
                spawnBurst(cx.x, cx.y + DISC_R, 12, clr);

                // Check win
                const cells = checkWin(dropWho);
                if (cells) {
                    winCells = cells;
                    winPulse = 0;
                    if (dropWho === 1) {
                        playerWins++;
                        score += 100 + (roundNum * 25);
                        playWin();
                    } else {
                        aiWins++;
                        playLose();
                    }
                    roundNum++;

                    // Burst on winning cells
                    for (const [wr, wc] of winCells) {
                        const cc = cellCenter(wr, wc);
                        spawnBurst(cc.x, cc.y, 20, dropWho === 1 ? PLAYER_CLR : AI_CLR);
                    }

                    if (playerWins >= WIN_ROUNDS || aiWins >= WIN_ROUNDS || roundNum >= MAX_ROUNDS) {
                        state = ST_MATCH_OVER;
                        roundPauseTimer = 3000;
                        if (playerWins > aiWins) {
                            score += 500;
                            level++;
                        }
                        if (score > highScore) { highScore = score; saveHighScore(highScore); }
                    } else {
                        state = ST_WIN;
                        roundPauseTimer = 2200;
                    }
                } else if (boardFull()) {
                    state = ST_DRAW;
                    roundPauseTimer = 2000;
                    roundNum++;
                    playDraw();
                    if (roundNum >= MAX_ROUNDS) {
                        state = ST_MATCH_OVER;
                        roundPauseTimer = 3000;
                        if (playerWins > aiWins) {
                            score += 300;
                            level++;
                        }
                        if (score > highScore) { highScore = score; saveHighScore(highScore); }
                    }
                } else {
                    // Next turn
                    currentTurn = dropWho === 1 ? 2 : 1;
                    if (currentTurn === 2) {
                        aiThinkTimer = 400 + Math.random() * 300;
                        aiMoveCol = -1;
                    }
                    state = ST_PLAYING;
                }
            }
        }
    }

    // ── Drawing ───────────────────────────────────────────────
    function playerColor() {
        return (player && player.color) ? player.color : PLAYER_CLR;
    }

    function drawDisc(x, y, who, alpha, glowing) {
        const clr1 = who === 1 ? playerColor() : AI_CLR;
        const clr2 = who === 1 ? PLAYER_CLR2 : AI_CLR2;

        ctx.save();
        ctx.globalAlpha = alpha || 1;

        if (glowing) {
            ctx.shadowColor = clr1;
            ctx.shadowBlur = 12 + Math.sin(winPulse) * 6;
        }

        // TRY SPRITE FIRST — Kenney Board Game Pack chips/pieces
        const sprKey = who === 1 ? 'chipRed' : 'pieceYellow';
        const sprAlt = who === 1 ? 'discRed' : 'discYellow';
        const discSprite = spr(sprKey) || spr(sprAlt);
        if (discSprite) {
            const sz = DISC_R * 2.2;
            ctx.drawImage(discSprite, x - sz / 2, y - sz / 2, sz, sz);
            // Specular highlight overlay
            ctx.shadowBlur = 0;
            ctx.globalAlpha = (alpha || 1) * 0.18;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.ellipse(x - DISC_R * 0.2, y - DISC_R * 0.25, DISC_R * 0.35, DISC_R * 0.2, -0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            ctx.shadowBlur = 0;
            return;
        }

        // FALLBACK — gradient disc
        const grad = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, DISC_R);
        grad.addColorStop(0, lighten(clr1, 40));
        grad.addColorStop(0.6, clr1);
        grad.addColorStop(1, clr2);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, DISC_R, 0, Math.PI * 2);
        ctx.fill();

        // Shine highlight
        ctx.globalAlpha = (alpha || 1) * 0.4;
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(x - 6, y - 7, DISC_R * 0.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        ctx.shadowBlur = 0;
    }

    function lighten(hex, amt) {
        let r = parseInt(hex.slice(1,3), 16);
        let g = parseInt(hex.slice(3,5), 16);
        let b = parseInt(hex.slice(5,7), 16);
        r = Math.min(255, r + amt);
        g = Math.min(255, g + amt);
        b = Math.min(255, b + amt);
        return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
    }

    function drawBoard() {
        // Board shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.roundRect(BOARD_X + 4, BOARD_Y + 4, BOARD_W, BOARD_H, [BOARD_RADIUS]);
        ctx.fill();

        // Board body — deep blue gradient (classic Connect4 board)
        const bgrad = ctx.createLinearGradient(BOARD_X, BOARD_Y, BOARD_X, BOARD_Y + BOARD_H);
        bgrad.addColorStop(0, BOARD_CLR);
        bgrad.addColorStop(0.5, lighten(BOARD_CLR, 8));
        bgrad.addColorStop(1, BOARD_CLR2);
        ctx.fillStyle = bgrad;
        ctx.beginPath();
        ctx.roundRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H, [BOARD_RADIUS]);
        ctx.fill();

        // Subtle cell grid texture
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let c = 1; c < COLS; c++) {
            const lx = BOARD_X + BOARD_PAD + c * CELL_SIZE;
            ctx.beginPath();
            ctx.moveTo(lx, BOARD_Y + BOARD_PAD);
            ctx.lineTo(lx, BOARD_Y + BOARD_H - BOARD_PAD);
            ctx.stroke();
        }
        for (let r = 1; r < ROWS; r++) {
            const ly = BOARD_Y + BOARD_PAD + r * CELL_SIZE;
            ctx.beginPath();
            ctx.moveTo(BOARD_X + BOARD_PAD, ly);
            ctx.lineTo(BOARD_X + BOARD_W - BOARD_PAD, ly);
            ctx.stroke();
        }

        // Board border
        ctx.strokeStyle = lighten(BOARD_CLR, 30);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H, [BOARD_RADIUS]);
        ctx.stroke();

        // Holes / discs
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const { x, y } = cellCenter(r, c);
                if (board[r][c] === 0) {
                    // Empty hole showing background
                    ctx.fillStyle = HOLE_CLR;
                    ctx.beginPath();
                    ctx.arc(x, y, DISC_R + 1, 0, Math.PI * 2);
                    ctx.fill();
                    // Inner shadow
                    ctx.fillStyle = 'rgba(0,0,0,0.2)';
                    ctx.beginPath();
                    ctx.arc(x, y + 2, DISC_R - 2, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    const isWin = winCells && winCells.some(([wr, wc]) => wr === r && wc === c);
                    drawDisc(x, y, board[r][c], 1, isWin);
                }
            }
        }
    }

    function drawDroppingDisc() {
        if (state !== ST_DROPPING) return;
        const cx = cellCenter(0, dropCol).x;
        drawDisc(cx, dropY, dropWho, 1, false);
    }

    function drawHoverPreview() {
        if (state !== ST_PLAYING || currentTurn !== 1) return;
        if (hoverCol < 0 || hoverCol >= COLS) return;
        const row = lowestEmptyRow(hoverCol);
        if (row < 0) return;

        // Ghost disc above board
        const cx = cellCenter(0, hoverCol).x;
        const topY = BOARD_Y - CELL_SIZE / 2 - 8;
        drawDisc(cx, topY, 1, 0.6, false);

        // Ghost in landing position
        const { x, y } = cellCenter(row, hoverCol);
        drawDisc(x, y, 1, 0.25, false);
    }

    function drawScoreboard() {
        const y = 18;

        // Title
        ctx.fillStyle = TEXT_CLR;
        ctx.font = 'bold 22px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CONNECT 4', BASE_W / 2, y + 16);

        // Difficulty
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(difficulty.toUpperCase(), BASE_W / 2, y + 34);

        // Scores
        const scoreY = y + 60;
        ctx.font = 'bold 14px "Press Start 2P", monospace';

        // Player score
        ctx.textAlign = 'right';
        ctx.fillStyle = playerColor();
        ctx.fillText('YOU', BASE_W / 2 - 40, scoreY);
        ctx.font = 'bold 28px "Press Start 2P", monospace';
        ctx.fillText(String(playerWins), BASE_W / 2 - 40, scoreY + 30);

        // VS
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = 'bold 14px "Press Start 2P", monospace';
        ctx.fillText('VS', BASE_W / 2, scoreY + 18);

        // AI score
        ctx.textAlign = 'left';
        ctx.fillStyle = AI_CLR;
        ctx.font = 'bold 14px "Press Start 2P", monospace';
        ctx.fillText('CPU', BASE_W / 2 + 40, scoreY);
        ctx.font = 'bold 28px "Press Start 2P", monospace';
        ctx.fillText(String(aiWins), BASE_W / 2 + 40, scoreY + 30);

        // Round indicator
        ctx.textAlign = 'center';
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText(`ROUND ${Math.min(roundNum + 1, MAX_ROUNDS)} / ${MAX_ROUNDS}`, BASE_W / 2, scoreY + 52);

        // Turn indicator
        if (state === ST_PLAYING) {
            const turnY = BOARD_Y + BOARD_H + 20;
            ctx.font = '12px "Press Start 2P", monospace';
            if (currentTurn === 1) {
                ctx.fillStyle = playerColor();
                ctx.fillText('YOUR TURN', BASE_W / 2, turnY);
            } else {
                ctx.fillStyle = AI_CLR;
                ctx.fillText('CPU THINKING...', BASE_W / 2, turnY);
            }
        }
    }

    function drawResultOverlay() {
        if (state !== ST_WIN && state !== ST_DRAW && state !== ST_MATCH_OVER) return;

        const msgY = BOARD_Y + BOARD_H + 30;
        ctx.textAlign = 'center';

        if (state === ST_MATCH_OVER) {
            ctx.font = 'bold 18px "Press Start 2P", monospace';
            if (playerWins > aiWins) {
                ctx.fillStyle = playerColor();
                ctx.fillText('YOU WIN!', BASE_W / 2, msgY);
            } else if (aiWins > playerWins) {
                ctx.fillStyle = AI_CLR;
                ctx.fillText('CPU WINS', BASE_W / 2, msgY);
            } else {
                ctx.fillStyle = TEXT_CLR;
                ctx.fillText('DRAW MATCH', BASE_W / 2, msgY);
            }
            ctx.font = '10px "Press Start 2P", monospace';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText(`SCORE: ${score}`, BASE_W / 2, msgY + 24);
            if (highScore > 0) {
                ctx.fillStyle = score >= highScore ? '#FFD700' : 'rgba(255,255,255,0.35)';
                ctx.fillText(score >= highScore ? 'NEW BEST!' : `BEST: ${highScore}`, BASE_W / 2, msgY + 42);
            }
        } else if (state === ST_WIN) {
            ctx.font = 'bold 14px "Press Start 2P", monospace';
            const winner = winCells ? board[winCells[0][0]][winCells[0][1]] : 0;
            if (winner === 1) {
                ctx.fillStyle = playerColor();
                ctx.fillText('YOU WIN THIS ROUND!', BASE_W / 2, msgY);
            } else {
                ctx.fillStyle = AI_CLR;
                ctx.fillText('CPU WINS THIS ROUND', BASE_W / 2, msgY);
            }
        } else if (state === ST_DRAW) {
            ctx.font = 'bold 14px "Press Start 2P", monospace';
            ctx.fillStyle = TEXT_CLR;
            ctx.fillText('DRAW!', BASE_W / 2, msgY);
        }
    }

    function drawTitleScreen() {
        drawBackground();

        // Animated board preview
        titlePulse += 0.03;
        const bx = (BASE_W - 200) / 2;
        const by = 200;
        const cellSz = 28;
        const brd = 8;

        ctx.fillStyle = BOARD_CLR;
        ctx.beginPath();
        ctx.roundRect(bx, by, 7 * cellSz + brd * 2, 6 * cellSz + brd * 2, [10]);
        ctx.fill();

        // Draw some demo discs
        const demoPattern = [
            [0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0],
            [0,0,0,2,0,0,0],
            [0,0,1,1,0,0,0],
            [0,2,2,1,0,0,0],
            [1,1,2,2,1,0,2]
        ];
        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 7; c++) {
                const dx = bx + brd + c * cellSz + cellSz / 2;
                const dy = by + brd + r * cellSz + cellSz / 2;
                if (demoPattern[r][c] === 0) {
                    ctx.fillStyle = HOLE_CLR;
                    ctx.beginPath();
                    ctx.arc(dx, dy, 11, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    // Use board game sprites on title if loaded
                    const demoSprKey = demoPattern[r][c] === 1 ? 'chipRed' : 'pieceYellow';
                    const demoSpr = spr(demoSprKey);
                    if (demoSpr) {
                        ctx.drawImage(demoSpr, dx - 11, dy - 11, 22, 22);
                    } else {
                        const clr = demoPattern[r][c] === 1 ? PLAYER_CLR : AI_CLR;
                        ctx.fillStyle = clr;
                        ctx.beginPath();
                        ctx.arc(dx, dy, 11, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = 'rgba(255,255,255,0.3)';
                        ctx.beginPath();
                        ctx.arc(dx - 3, dy - 3, 4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }

        // Title
        ctx.fillStyle = TEXT_CLR;
        ctx.font = 'bold 28px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CONNECT 4', BASE_W / 2, 60);

        // Subtitle pulse
        const alpha = 0.5 + 0.5 * Math.sin(titlePulse * 2);
        ctx.globalAlpha = alpha;
        ctx.font = '11px "Press Start 2P", monospace';
        ctx.fillStyle = GLOW_CLR;
        ctx.fillText('TAP OR PRESS ENTER', BASE_W / 2, BASE_H - 140);
        ctx.globalAlpha = 1;

        // Difficulty selection
        const diffs = ['easy', 'medium', 'hard'];
        const diffLabels = ['EASY', 'MEDIUM', 'HARD'];
        const diffY = BASE_H - 90;

        for (let i = 0; i < 3; i++) {
            const dx = BASE_W / 2 + (i - 1) * 130;
            const isSelected = diffs[i] === difficulty;
            ctx.font = (isSelected ? 'bold ' : '') + '12px "Press Start 2P", monospace';
            ctx.fillStyle = isSelected ? GLOW_CLR : 'rgba(255,255,255,0.4)';
            if (isSelected) {
                ctx.shadowColor = GLOW_CLR;
                ctx.shadowBlur = 8;
            }
            ctx.fillText(diffLabels[i], dx, diffY);
            ctx.shadowBlur = 0;
        }

        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText('1/2/3 TO CHANGE DIFFICULTY', BASE_W / 2, diffY + 20);
    }

    // ── Input handlers ────────────────────────────────────────
    function colFromX(px) {
        const bx = (px / scale - BOARD_X - BOARD_PAD);
        if (bx < 0 || bx >= COLS * CELL_SIZE) return -1;
        return Math.floor(bx / CELL_SIZE);
    }

    function handleColumnSelect(col) {
        if (state === ST_PLAYING && currentTurn === 1 && col >= 0 && col < COLS) {
            if (lowestEmptyRow(col) >= 0) {
                ensureAudio();
                playSelect();
                startDrop(col, 1);
            }
        }
    }

    function onKeyDown(e) {
        keys[e.key] = true;

        if (state === ST_TITLE) {
            if (e.key === '1') difficulty = 'easy';
            else if (e.key === '2') difficulty = 'medium';
            else if (e.key === '3') difficulty = 'hard';
            else if (e.key === 'Enter' || e.key === ' ') {
                ensureAudio();
                startNewMatch();
            }
            return;
        }

        if (state === ST_PLAYING && currentTurn === 1) {
            if (e.key === 'ArrowLeft') {
                selectedCol = Math.max(0, selectedCol - 1);
                hoverCol = selectedCol;
                playSelect();
            } else if (e.key === 'ArrowRight') {
                selectedCol = Math.min(COLS - 1, selectedCol + 1);
                hoverCol = selectedCol;
                playSelect();
            } else if (e.key === ' ' || e.key === 'Enter') {
                handleColumnSelect(selectedCol);
            }
        }
    }

    function onKeyUp(e) {
        keys[e.key] = false;
    }

    function onMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        const col = colFromX(e.clientX - rect.left);
        hoverCol = col;
        if (col >= 0) selectedCol = col;
    }

    function onMouseDown(e) {
        ensureAudio();
        if (state === ST_TITLE) {
            // Check difficulty buttons
            const rect = canvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left) / scale;
            const my = (e.clientY - rect.top) / scale;
            const diffY = BASE_H - 90;
            const diffs = ['easy', 'medium', 'hard'];
            for (let i = 0; i < 3; i++) {
                const dx = BASE_W / 2 + (i - 1) * 130;
                if (Math.abs(mx - dx) < 50 && Math.abs(my - diffY) < 15) {
                    difficulty = diffs[i];
                    return;
                }
            }
            startNewMatch();
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const col = colFromX(e.clientX - rect.left);
        handleColumnSelect(col);
    }

    function onTouchStart(e) {
        ensureAudio();
        const touch = e.touches[0];
        if (state === ST_TITLE) {
            startNewMatch();
            return;
        }
        const rect = canvas.getBoundingClientRect();
        const col = colFromX(touch.clientX - rect.left);
        if (col >= 0) {
            hoverCol = col;
            selectedCol = col;
        }
    }

    function onTouchEnd(e) {
        if (state === ST_PLAYING && currentTurn === 1 && hoverCol >= 0) {
            handleColumnSelect(hoverCol);
        }
    }

    function onTouchMove(e) {
        if (e.cancelable) e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const col = colFromX(touch.clientX - rect.left);
        if (col >= 0) {
            hoverCol = col;
            selectedCol = col;
        }
    }

    function onResize() {
        fitCanvas();
    }

    // ── Game flow ─────────────────────────────────────────────
    function startNewMatch() {
        playerWins = 0;
        aiWins = 0;
        roundNum = 0;
        score = 0;
        level = 0;
        startTime = Date.now();
        gameActive = true;
        startNewRound();
    }

    function startNewRound() {
        resetBoard();
        winCells = null;
        winPulse = 0;
        currentTurn = 1; // Player goes first
        hoverCol = 3;
        selectedCol = 3;
        aiThinkTimer = 0;
        aiMoveCol = -1;
        state = ST_PLAYING;
    }

    // ── Main loop ─────────────────────────────────────────────
    let lastTime = 0;

    function loop(timestamp) {
        animFrame = requestAnimationFrame(loop);
        const dt = timestamp - (lastTime || timestamp);
        lastTime = timestamp;
        frameCount++;

        ctx.save();

        if (state === ST_TITLE) {
            drawTitleScreen();
            drawParticles();
            updateParticles();
            ctx.restore();
            return;
        }

        // Background
        drawBackground();

        // Update
        if (state === ST_DROPPING) {
            updateDrop();
        }

        if (state === ST_WIN || state === ST_DRAW) {
            winPulse += 0.08;
            roundPauseTimer -= dt;
            if (roundPauseTimer <= 0) {
                startNewRound();
            }
        }

        if (state === ST_MATCH_OVER) {
            winPulse += 0.08;
            roundPauseTimer -= dt;
            if (roundPauseTimer <= 0) {
                gameActive = false;
                state = ST_TITLE;
                if (onGameOver) {
                    onGameOver({
                        score,
                        level,
                        time: Math.floor((Date.now() - startTime) / 1000),
                        stats: {
                            playerWins,
                            aiWins,
                            rounds: roundNum,
                            difficulty
                        }
                    });
                }
            }
        }

        // AI turn
        if (state === ST_PLAYING && currentTurn === 2) {
            aiThinkTimer -= dt;
            if (aiThinkTimer <= 0 && aiMoveCol < 0) {
                aiMoveCol = getAIMove();
            }
            if (aiMoveCol >= 0 && aiThinkTimer <= 0) {
                startDrop(aiMoveCol, 2);
                aiMoveCol = -1;
            }
        }

        // Draw
        drawHoverPreview();
        drawBoard();
        drawDroppingDisc();
        drawScoreboard();
        drawResultOverlay();
        updateParticles();
        drawParticles();

        ctx.restore();
    }

    // ── Public API ────────────────────────────────────────────
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas     = canvasEl;
        ctx        = canvas.getContext('2d');
        player     = activePlayer || null;
        onGameOver = gameOverCallback || null;

        // Load theme
        const themeId = activePlayer?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            BG_TOP    = _t.bgGradient[0] || BG_TOP;
            BG_BOT    = _t.bgGradient[1] || BG_BOT;
            GLOW_CLR  = _t.colors[0]     || GLOW_CLR;
            if (_t.colors[1]) PLAYER_CLR = _t.colors[1];
            if (_t.colors[3]) AI_CLR     = _t.colors[3];
        }

        highScore = loadHighScore();
        keys = {};
        particles = [];
        frameCount = 0;
        titlePulse = 0;
        difficulty = 'medium';
        state = ST_TITLE;
        gameActive = false;
        hoverCol = 3;
        selectedCol = 3;

        // Show loading screen and preload sprites
        isLoading = true;
        loadingProgress = 0;
        fitCanvas();
        drawLoadingScreen();

        preloadSprites(
            (progress) => { loadingProgress = progress; if (isLoading) drawLoadingScreen(); },
            () => {
                isLoading = false;
                initBgStars();
                resetBoard();
                fitCanvas();
                requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

                // Bind events
                window.addEventListener('keydown', onKeyDown);
                window.addEventListener('keyup',   onKeyUp);
                window.addEventListener('resize',  onResize);
                canvas.addEventListener('mousemove',  onMouseMove);
                canvas.addEventListener('mousedown',  onMouseDown);
                canvas.addEventListener('touchstart', onTouchStart, { passive: true });
                canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
                canvas.addEventListener('touchend',   onTouchEnd,   { passive: true });

                lastTime = 0;
                animFrame = requestAnimationFrame(loop);
            }
        );
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;

        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup',   onKeyUp);
        window.removeEventListener('resize',  onResize);

        if (canvas) {
            canvas.removeEventListener('mousemove',  onMouseMove);
            canvas.removeEventListener('mousedown',  onMouseDown);
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
        getLevel()  { return level; },
        isActive()  { return gameActive; }
    };
})();
