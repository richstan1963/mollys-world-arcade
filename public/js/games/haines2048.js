/* Haines 2048 — Candy-themed 2048 puzzle for Molly's World Arcade
 * Named after Molly Mae Haines. Arcade Original.
 * Vibrant candy color tiles with glow effects and smooth animations.
 * Self-contained: no external dependencies. */
window.Haines2048 = (() => {
    // ── Constants ──
    const SIZE = 4;
    const SLIDE_MS = 140;
    const MERGE_MS = 200;
    const SPAWN_MS = 180;
    const GAME_OVER_DELAY = 1200;

    // ── Candy Tile Colors — vibrant gradients per value ──
    const TILE_STYLES = {
        2:    { bg: '#FF6B9D', bg2: '#C850C0', text: '#FFF', glow: 'rgba(255,107,157,0.4)' },
        4:    { bg: '#FF9A76', bg2: '#FF6B6B', text: '#FFF', glow: 'rgba(255,154,118,0.4)' },
        8:    { bg: '#FECA57', bg2: '#FF9FF3', text: '#FFF', glow: 'rgba(254,202,87,0.5)' },
        16:   { bg: '#48DBFB', bg2: '#0ABDE3', text: '#FFF', glow: 'rgba(72,219,251,0.5)' },
        32:   { bg: '#FF6348', bg2: '#EE5A24', text: '#FFF', glow: 'rgba(255,99,72,0.5)' },
        64:   { bg: '#A55EEA', bg2: '#8854D0', text: '#FFF', glow: 'rgba(165,94,234,0.5)' },
        128:  { bg: '#26DE81', bg2: '#20BF6B', text: '#FFF', glow: 'rgba(38,222,129,0.6)' },
        256:  { bg: '#FD79A8', bg2: '#E84393', text: '#FFF', glow: 'rgba(253,121,168,0.6)' },
        512:  { bg: '#FDCB6E', bg2: '#F0932B', text: '#FFF', glow: 'rgba(253,203,110,0.7)' },
        1024: { bg: '#6C5CE7', bg2: '#A29BFE', text: '#FFF', glow: 'rgba(108,92,231,0.7)' },
        2048: { bg: '#FFD700', bg2: '#FF6B6B', text: '#FFF', glow: 'rgba(255,215,0,0.8)' },
    };
    // Super tiles (4096+)
    const SUPER_STYLE = { bg: '#2D3436', bg2: '#636E72', text: '#FFD700', glow: 'rgba(255,215,0,0.6)' };

    // ── State ──
    let canvas, ctx;
    let score = 0, bestTile = 0, level = 0;
    let gameActive = false;
    let animFrame = null;
    let player = null;
    let onGameOver = null;
    let cells = [];
    let animations = [];
    let floatingTexts = [];
    let gameOverTimer = 0;
    let gameOverShown = false;
    let startTime = 0;
    let particles = [];

    // Layout
    let gridSize = 0, cellSize = 0, cellGap = 0;
    let gridX = 0, gridY = 0, hudHeight = 0;

    // Input
    let touchStartX = 0, touchStartY = 0;
    let boundKeydown = null, boundTouchStart = null, boundTouchEnd = null;

    // Audio
    let audioCtx = null;
    function getAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
        }
        return audioCtx;
    }

    // ── Sound Effects ──
    function playSlide() {
        const ac = getAudio(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, ac.currentTime);
            osc.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.07);
            gain.gain.setValueAtTime(0.06, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.07);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.07);
        } catch {}
    }

    function playMerge(value) {
        const ac = getAudio(); if (!ac) return;
        try {
            const base = 350 + Math.min(Math.log2(value), 11) * 55;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(base, ac.currentTime);
            osc.frequency.exponentialRampToValueAtTime(base * 1.5, ac.currentTime + 0.12);
            gain.gain.setValueAtTime(0.12, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.15);
        } catch {}
    }

    function playBigMerge() {
        const ac = getAudio(); if (!ac) return;
        try {
            [523, 659, 784, 1047].forEach((freq, i) => {
                const osc = ac.createOscillator();
                const gain = ac.createGain();
                osc.connect(gain); gain.connect(ac.destination);
                osc.type = 'sine';
                osc.frequency.value = freq;
                const t = ac.currentTime + i * 0.08;
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                osc.start(t); osc.stop(t + 0.25);
            });
        } catch {}
    }

    // ── Particle system (merge sparks) ──
    function spawnParticles(px, py, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 3;
            particles.push({
                x: px, y: py,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: 0.015 + Math.random() * 0.02,
                size: 2 + Math.random() * 4,
                color,
            });
        }
    }

    function updateParticles() {
        particles = particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05; // gravity
            p.life -= p.decay;
            return p.life > 0;
        });
    }

    function drawParticles() {
        particles.forEach(p => {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    // ── Grid helpers ──
    function emptyGrid() {
        cells = [];
        for (let x = 0; x < SIZE; x++) {
            cells[x] = [];
            for (let y = 0; y < SIZE; y++) cells[x][y] = null;
        }
    }

    function cellAt(x, y) {
        if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return undefined;
        return cells[x][y];
    }

    function availableCells() {
        const avail = [];
        for (let x = 0; x < SIZE; x++)
            for (let y = 0; y < SIZE; y++)
                if (!cells[x][y]) avail.push({ x, y });
        return avail;
    }

    function addRandomTile() {
        const avail = availableCells();
        if (!avail.length) return null;
        const pos = avail[Math.floor(Math.random() * avail.length)];
        const value = Math.random() < 0.9 ? 2 : 4;
        cells[pos.x][pos.y] = { value };
        return { x: pos.x, y: pos.y, value };
    }

    function getVector(dir) {
        return [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][dir];
    }

    function buildTraversals(vec) {
        const t = { x: [], y: [] };
        for (let i = 0; i < SIZE; i++) { t.x.push(i); t.y.push(i); }
        if (vec.x === 1) t.x.reverse();
        if (vec.y === 1) t.y.reverse();
        return t;
    }

    function findFarthest(cx, cy, vec) {
        let px = cx, py = cy;
        let nx = cx + vec.x, ny = cy + vec.y;
        while (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE && !cells[nx][ny]) {
            px = nx; py = ny;
            nx += vec.x; ny += vec.y;
        }
        return { farthest: { x: px, y: py }, next: { x: nx, y: ny } };
    }

    function movesAvailable() {
        if (availableCells().length > 0) return true;
        for (let x = 0; x < SIZE; x++) {
            for (let y = 0; y < SIZE; y++) {
                const tile = cells[x][y];
                if (!tile) continue;
                for (let d = 0; d < 4; d++) {
                    const v = getVector(d);
                    const other = cellAt(x + v.x, y + v.y);
                    if (other && other.value === tile.value) return true;
                }
            }
        }
        return false;
    }

    // ── Core move logic ──
    function executeMove(dir) {
        if (!gameActive || animations.length > 0) return;

        const vec = getVector(dir);
        const traversals = buildTraversals(vec);
        let moved = false;
        const merges = [];
        const slides = [];

        for (let x = 0; x < SIZE; x++)
            for (let y = 0; y < SIZE; y++)
                if (cells[x][y]) cells[x][y]._merged = false;

        traversals.x.forEach(x => {
            traversals.y.forEach(y => {
                const tile = cells[x][y];
                if (!tile) return;

                const { farthest, next } = findFarthest(x, y, vec);
                const nextTile = cellAt(next.x, next.y);

                if (nextTile && nextTile.value === tile.value && !nextTile._merged) {
                    const newVal = tile.value * 2;
                    cells[x][y] = null;
                    cells[next.x][next.y] = { value: newVal, _merged: true };
                    score += newVal;
                    if (newVal > bestTile) bestTile = newVal;
                    level = Math.log2(bestTile);
                    merges.push({ fromX: x, fromY: y, toX: next.x, toY: next.y, value: newVal });
                    moved = true;
                } else if (farthest.x !== x || farthest.y !== y) {
                    cells[farthest.x][farthest.y] = tile;
                    cells[x][y] = null;
                    slides.push({ fromX: x, fromY: y, toX: farthest.x, toY: farthest.y, value: tile.value });
                    moved = true;
                }
            });
        });

        if (!moved) return;

        const now = performance.now();
        playSlide();

        slides.forEach(s => {
            animations.push({
                type: 'slide', startTime: now, duration: SLIDE_MS,
                fromX: s.fromX, fromY: s.fromY, toX: s.toX, toY: s.toY, value: s.value
            });
        });

        merges.forEach(m => {
            animations.push({
                type: 'slide', startTime: now, duration: SLIDE_MS,
                fromX: m.fromX, fromY: m.fromY, toX: m.toX, toY: m.toY, value: m.value / 2
            });
            animations.push({
                type: 'merge', startTime: now + SLIDE_MS, duration: MERGE_MS,
                x: m.toX, y: m.toY, value: m.value
            });
            floatingTexts.push({
                text: '+' + m.value, x: m.toX, y: m.toY,
                startTime: now + SLIDE_MS, duration: 700, color: '#FFD700'
            });
            // Spawn merge particles
            const pos = tilePos(m.toX, m.toY);
            const style = TILE_STYLES[m.value] || SUPER_STYLE;
            setTimeout(() => {
                spawnParticles(
                    pos.px + cellSize / 2, pos.py + cellSize / 2,
                    style.bg, m.value >= 128 ? 20 : 10
                );
            }, SLIDE_MS);

            if (m.value >= 256) {
                playBigMerge();
                // Extra confetti for big merges
                if (window.Confetti && m.value >= 512) {
                    setTimeout(() => {
                        const rect = canvas.getBoundingClientRect();
                        Confetti.burst(
                            rect.left + pos.px + cellSize / 2,
                            rect.top + pos.py + cellSize / 2,
                            m.value >= 2048 ? 60 : 30
                        );
                    }, SLIDE_MS + 50);
                }
            } else {
                setTimeout(() => playMerge(m.value), SLIDE_MS);
            }
        });

        setTimeout(() => {
            const spawned = addRandomTile();
            if (spawned) {
                animations.push({
                    type: 'spawn', startTime: performance.now(), duration: SPAWN_MS,
                    x: spawned.x, y: spawned.y, value: spawned.value
                });
            }
            if (!movesAvailable()) {
                gameOverTimer = performance.now();
            }
        }, SLIDE_MS + 10);
    }

    // ── Layout computation ──
    function computeLayout() {
        const w = canvas.width, h = canvas.height;
        hudHeight = Math.floor(h * 0.16);
        const available = Math.min(w * 0.85, h - hudHeight - 30);
        gridSize = available;
        cellGap = Math.floor(gridSize * 0.025);
        cellSize = Math.floor((gridSize - cellGap * 5) / SIZE);
        gridSize = cellSize * SIZE + cellGap * 5;
        gridX = Math.floor((w - gridSize) / 2);
        gridY = hudHeight + Math.floor((h - hudHeight - gridSize) / 2);
    }

    function tilePos(col, row) {
        return {
            px: gridX + cellGap + col * (cellSize + cellGap),
            py: gridY + cellGap + row * (cellSize + cellGap)
        };
    }

    // ── Drawing — Candy Style ──
    function getTileStyle(value) {
        return TILE_STYLES[value] || SUPER_STYLE;
    }

    function tileFontSize(value) {
        if (value < 100) return Math.floor(cellSize * 0.42);
        if (value < 1000) return Math.floor(cellSize * 0.36);
        if (value < 10000) return Math.floor(cellSize * 0.28);
        return Math.floor(cellSize * 0.22);
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function drawTile(px, py, value, scale) {
        const s = scale || 1;
        const sz = cellSize * s;
        const offset = (cellSize - sz) / 2;
        const r = Math.floor(sz * 0.12);
        const style = getTileStyle(value);
        const cx = px + cellSize / 2;
        const cy = py + cellSize / 2;

        // ── Outer glow for high-value tiles ──
        if (value >= 64) {
            ctx.save();
            ctx.shadowColor = style.glow;
            ctx.shadowBlur = value >= 512 ? 30 : value >= 128 ? 20 : 12;
            ctx.fillStyle = style.bg;
            roundRect(px + offset, py + offset, sz, sz, r);
            ctx.fill();
            ctx.restore();
        }

        // ── Gradient fill ──
        const grd = ctx.createLinearGradient(
            px + offset, py + offset,
            px + offset + sz, py + offset + sz
        );
        grd.addColorStop(0, style.bg);
        grd.addColorStop(1, style.bg2);
        ctx.fillStyle = grd;
        roundRect(px + offset, py + offset, sz, sz, r);
        ctx.fill();

        // ── Glossy highlight (top-left shine) ──
        ctx.save();
        roundRect(px + offset, py + offset, sz, sz, r);
        ctx.clip();
        const shineGrd = ctx.createLinearGradient(
            px + offset, py + offset,
            px + offset + sz * 0.5, py + offset + sz * 0.7
        );
        shineGrd.addColorStop(0, 'rgba(255,255,255,0.3)');
        shineGrd.addColorStop(0.5, 'rgba(255,255,255,0.05)');
        shineGrd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shineGrd;
        ctx.fillRect(px + offset, py + offset, sz, sz);
        ctx.restore();

        // ── Inner border (candy-like) ──
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1.5;
        roundRect(px + offset + 1, py + offset + 1, sz - 2, sz - 2, r - 1);
        ctx.stroke();

        // ── Number with shadow ──
        const fontSize = tileFontSize(value) * s;
        ctx.save();
        // Text shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.font = `bold ${Math.round(fontSize)}px "Fredoka One", "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(value, cx + 1, cy + 2);
        // Main text
        ctx.fillStyle = style.text;
        ctx.fillText(value, cx, cy);
        ctx.restore();
    }

    function drawBackground() {
        const w = canvas.width, h = canvas.height;
        // Deep purple gradient
        const grd = ctx.createLinearGradient(0, 0, w * 0.3, h);
        grd.addColorStop(0, '#1a0f2e');
        grd.addColorStop(0.5, '#16082a');
        grd.addColorStop(1, '#0e0518');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);

        // Subtle background stars
        const now = performance.now();
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        for (let i = 0; i < 25; i++) {
            const bx = (i * 137.5 + now * 0.003) % w;
            const by = (i * 89.3 + Math.sin(now * 0.001 + i) * 8) % h;
            const bs = 1 + Math.sin(now * 0.002 + i * 0.7) * 0.5;
            ctx.beginPath();
            ctx.arc(bx, by, bs, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawGrid() {
        const r = Math.floor(gridSize * 0.025);

        // Grid background with slight gradient
        const gridGrd = ctx.createLinearGradient(gridX, gridY, gridX, gridY + gridSize);
        gridGrd.addColorStop(0, 'rgba(255,255,255,0.06)');
        gridGrd.addColorStop(1, 'rgba(255,255,255,0.03)');
        ctx.fillStyle = gridGrd;
        roundRect(gridX, gridY, gridSize, gridSize, r);
        ctx.fill();

        // Grid border glow
        ctx.strokeStyle = 'rgba(168,85,247,0.15)';
        ctx.lineWidth = 1.5;
        roundRect(gridX, gridY, gridSize, gridSize, r);
        ctx.stroke();

        // Empty cell slots with subtle inner shadow
        for (let x = 0; x < SIZE; x++) {
            for (let y = 0; y < SIZE; y++) {
                const { px, py } = tilePos(x, y);
                const cr = Math.floor(cellSize * 0.1);

                // Inset cell background
                ctx.fillStyle = 'rgba(255,255,255,0.03)';
                roundRect(px, py, cellSize, cellSize, cr);
                ctx.fill();

                // Inner edge highlight
                ctx.strokeStyle = 'rgba(255,255,255,0.04)';
                ctx.lineWidth = 0.5;
                roundRect(px, py, cellSize, cellSize, cr);
                ctx.stroke();
            }
        }
    }

    function drawHUD() {
        const w = canvas.width;
        const cx = w / 2;
        const now = performance.now();

        // ── Title with rainbow gradient text ──
        const titleSize = Math.floor(hudHeight * 0.32);
        ctx.save();
        ctx.font = `bold ${titleSize}px "Fredoka One", "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Animated gradient for title
        const titleGrd = ctx.createLinearGradient(cx - 140, 0, cx + 140, 0);
        const hueShift = (now * 0.02) % 360;
        titleGrd.addColorStop(0, `hsl(${hueShift}, 90%, 70%)`);
        titleGrd.addColorStop(0.33, `hsl(${(hueShift + 60) % 360}, 90%, 70%)`);
        titleGrd.addColorStop(0.66, `hsl(${(hueShift + 120) % 360}, 90%, 70%)`);
        titleGrd.addColorStop(1, `hsl(${(hueShift + 180) % 360}, 90%, 70%)`);
        ctx.fillStyle = titleGrd;
        ctx.fillText('2048', cx, 10);
        ctx.restore();

        // ── Score + Best boxes ──
        const boxW = Math.floor(w * 0.26);
        const boxH = Math.floor(hudHeight * 0.36);
        const boxY = hudHeight - boxH - 4;
        const gap = 14;

        // Score box
        const scoreX = cx - boxW - gap / 2;
        drawScoreBox(scoreX, boxY, boxW, boxH, 'SCORE', score.toLocaleString(), '#FF6B9D', '#C850C0');

        // Best tile box
        const bestX = cx + gap / 2;
        drawScoreBox(bestX, boxY, boxW, boxH, 'BEST', bestTile || '—', '#FECA57', '#FF9FF3');
    }

    function drawScoreBox(x, y, w, h, label, value, color1, color2) {
        const r = 10;

        // Box background
        const bgGrd = ctx.createLinearGradient(x, y, x + w, y + h);
        bgGrd.addColorStop(0, 'rgba(255,255,255,0.07)');
        bgGrd.addColorStop(1, 'rgba(255,255,255,0.03)');
        ctx.fillStyle = bgGrd;
        roundRect(x, y, w, h, r);
        ctx.fill();

        // Colored top border
        const borderGrd = ctx.createLinearGradient(x, y, x + w, y);
        borderGrd.addColorStop(0, color1);
        borderGrd.addColorStop(1, color2);
        ctx.fillStyle = borderGrd;
        roundRect(x, y, w, 3, r);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        roundRect(x, y, w, h, r);
        ctx.stroke();

        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `bold ${Math.floor(h * 0.24)}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(label, x + w / 2, y + 6);

        // Value
        const valGrd = ctx.createLinearGradient(x, y + h * 0.4, x + w, y + h * 0.4);
        valGrd.addColorStop(0, color1);
        valGrd.addColorStop(1, color2);
        ctx.fillStyle = valGrd;
        ctx.font = `bold ${Math.floor(h * 0.42)}px "Fredoka One", "Segoe UI", system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(value, x + w / 2, y + h * 0.62);
    }

    function drawStaticTiles() {
        const animatingTo = new Set();
        animations.forEach(a => {
            if (a.type === 'slide') {
                animatingTo.add(`${a.toX},${a.toY}`);
            }
            if (a.type === 'merge') animatingTo.add(`${a.x},${a.y}`);
            if (a.type === 'spawn') animatingTo.add(`${a.x},${a.y}`);
        });

        for (let x = 0; x < SIZE; x++) {
            for (let y = 0; y < SIZE; y++) {
                const tile = cells[x][y];
                if (!tile) continue;
                const key = `${x},${y}`;
                if (animatingTo.has(key)) continue;
                const { px, py } = tilePos(x, y);
                drawTile(px, py, tile.value, 1);
            }
        }
    }

    function drawAnimations(now) {
        const remaining = [];
        animations.forEach(a => {
            const elapsed = now - a.startTime;
            if (elapsed < 0) { remaining.push(a); return; }
            const t = Math.min(elapsed / a.duration, 1);
            const ease = 1 - Math.pow(1 - t, 3);

            if (a.type === 'slide') {
                const fromPos = tilePos(a.fromX, a.fromY);
                const toPos = tilePos(a.toX, a.toY);
                const px = fromPos.px + (toPos.px - fromPos.px) * ease;
                const py = fromPos.py + (toPos.py - fromPos.py) * ease;
                drawTile(px, py, a.value, 1);
                if (t < 1) remaining.push(a);
            } else if (a.type === 'merge') {
                const { px, py } = tilePos(a.x, a.y);
                // Juicy pop-in: grow to 1.3 then bounce back
                let scale;
                if (t < 0.4) {
                    scale = 1 + 0.3 * (t / 0.4);
                } else if (t < 0.7) {
                    scale = 1.3 - 0.15 * ((t - 0.4) / 0.3);
                } else {
                    scale = 1.15 - 0.15 * ((t - 0.7) / 0.3);
                }
                drawTile(px, py, a.value, scale);
                if (t < 1) remaining.push(a);
            } else if (a.type === 'spawn') {
                const { px, py } = tilePos(a.x, a.y);
                // Elastic bounce in
                const elasticT = t < 1
                    ? 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 1.2)
                    : 1;
                const scale = Math.max(0, Math.min(elasticT, 1.1));
                ctx.globalAlpha = Math.min(t * 3, 1);
                drawTile(px, py, a.value, scale);
                ctx.globalAlpha = 1;
                if (t < 1) remaining.push(a);
            }
        });
        animations = remaining;
    }

    function drawFloatingTexts(now) {
        const remaining = [];
        floatingTexts.forEach(ft => {
            const elapsed = now - ft.startTime;
            if (elapsed < 0) { remaining.push(ft); return; }
            const t = Math.min(elapsed / ft.duration, 1);
            if (t >= 1) return;

            const { px, py } = tilePos(ft.x, ft.y);
            const floatY = py - t * cellSize * 0.9;
            const alpha = 1 - t * t;
            const scale = 1 + t * 0.3;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = ft.color;
            ctx.font = `bold ${Math.floor(cellSize * 0.26 * scale)}px "Fredoka One", "Segoe UI", system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            // Text shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillText(ft.text, px + cellSize / 2 + 1, floatY + 1);
            ctx.fillStyle = ft.color;
            ctx.fillText(ft.text, px + cellSize / 2, floatY);
            ctx.restore();
            remaining.push(ft);
        });
        floatingTexts = remaining;
    }

    function drawGameOver(now) {
        if (!gameOverTimer || !gameOverShown) return;
        const elapsed = now - gameOverTimer;
        const alpha = Math.min(elapsed / 800, 0.85);

        // Dark overlay with vignette
        ctx.fillStyle = `rgba(10,5,20,${alpha})`;
        roundRect(gridX, gridY, gridSize, gridSize, Math.floor(gridSize * 0.025));
        ctx.fill();

        if (elapsed > 400) {
            const textAlpha = Math.min((elapsed - 400) / 500, 1);
            ctx.save();
            ctx.globalAlpha = textAlpha;

            // GAME OVER text with gradient
            const goSize = Math.floor(gridSize * 0.1);
            const goGrd = ctx.createLinearGradient(
                gridX + gridSize * 0.2, 0, gridX + gridSize * 0.8, 0
            );
            goGrd.addColorStop(0, '#FF6B9D');
            goGrd.addColorStop(0.5, '#FECA57');
            goGrd.addColorStop(1, '#A55EEA');
            ctx.fillStyle = goGrd;
            ctx.font = `bold ${goSize}px "Fredoka One", "Segoe UI", system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('GAME OVER', gridX + gridSize / 2, gridY + gridSize * 0.38);

            // Score
            ctx.fillStyle = '#FFF';
            ctx.font = `bold ${Math.floor(gridSize * 0.06)}px "Segoe UI", system-ui, sans-serif`;
            ctx.fillText(`Score: ${score.toLocaleString()}`, gridX + gridSize / 2, gridY + gridSize * 0.52);

            // Best tile with its color
            const bestStyle = getTileStyle(bestTile);
            ctx.fillStyle = bestStyle.bg;
            ctx.font = `bold ${Math.floor(gridSize * 0.055)}px "Segoe UI", system-ui, sans-serif`;
            ctx.fillText(`Best Tile: ${bestTile}`, gridX + gridSize / 2, gridY + gridSize * 0.62);

            ctx.restore();
        }
    }

    // ── Main render loop ──
    function render() {
        if (!gameActive) return;
        const now = performance.now();

        drawBackground();
        drawHUD();
        drawGrid();
        drawStaticTiles();
        drawAnimations(now);
        drawFloatingTexts(now);
        updateParticles();
        drawParticles();
        drawGameOver(now);

        if (gameOverTimer && !gameOverShown) {
            gameOverShown = true;
            const duration = Math.floor((Date.now() - startTime) / 1000);
            setTimeout(() => {
                if (onGameOver) onGameOver({ score, level: bestTile, duration });
            }, GAME_OVER_DELAY);
        }

        animFrame = requestAnimationFrame(render);
    }

    // ── Input handlers ──
    function handleKeydown(e) {
        if (!gameActive) return;
        const map = {
            ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3,
            w: 0, W: 0, d: 1, D: 1, s: 2, S: 2, a: 3, A: 3
        };
        const dir = map[e.key];
        if (dir !== undefined) {
            e.preventDefault();
            executeMove(dir);
        }
    }

    function handleTouchStart(e) {
        if (!gameActive) return;
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }

    function handleTouchEnd(e) {
        if (!gameActive) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (Math.max(absDx, absDy) < 20) return;

        if (absDx > absDy) {
            executeMove(dx > 0 ? 1 : 3);
        } else {
            executeMove(dy > 0 ? 2 : 0);
        }
    }

    // ── Init / Destroy ──
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer;
        onGameOver = gameOverCallback;

        score = 0;
        bestTile = 0;
        level = 0;
        gameActive = true;
        gameOverTimer = 0;
        gameOverShown = false;
        animations = [];
        floatingTexts = [];
        particles = [];
        startTime = Date.now();

        computeLayout();
        emptyGrid();
        addRandomTile();
        addRandomTile();

        for (let x = 0; x < SIZE; x++)
            for (let y = 0; y < SIZE; y++)
                if (cells[x][y] && cells[x][y].value > bestTile) bestTile = cells[x][y].value;
        level = Math.log2(bestTile);

        boundKeydown = handleKeydown;
        boundTouchStart = handleTouchStart;
        boundTouchEnd = handleTouchEnd;
        document.addEventListener('keydown', boundKeydown);
        canvas.addEventListener('touchstart', boundTouchStart, { passive: true });
        canvas.addEventListener('touchend', boundTouchEnd, { passive: true });

        render();
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        if (boundKeydown) document.removeEventListener('keydown', boundKeydown);
        if (canvas && boundTouchStart) canvas.removeEventListener('touchstart', boundTouchStart);
        if (canvas && boundTouchEnd) canvas.removeEventListener('touchend', boundTouchEnd);
        boundKeydown = null; boundTouchStart = null; boundTouchEnd = null;
        canvas = null; ctx = null;
        particles = [];
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return level; },
        isActive() { return gameActive; }
    };
})();
