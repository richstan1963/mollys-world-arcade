/* YWA Qix — Territory-claiming arcade game with Kenney CC0 sprites for Your World Arcade */
window.Qix = (() => {
    // ── Sprite Atlas (Kenney CC0) ──
    const __sprites = {};
    let __spritesLoaded = 0, __spritesTotal = 0, __allSpritesReady = false;
    const __SPRITE_MANIFEST = {
        territory: '/img/game-assets/kenney-tiles/tileBlue_05.png',
        border: '/img/game-assets/kenney-tiles/tileGreen_03.png',
        sparx1: '/img/game-assets/kenney-particles/particleWhite_4.png',
        sparx2: '/img/game-assets/kenney-particles/particleWhite_5.png',
        player: '/img/game-assets/kenney-platform/items/gemYellow.png',
        particle1: '/img/game-assets/kenney-particles/particleWhite_1.png',
        particle2: '/img/game-assets/kenney-particles/particleWhite_2.png',
    };

    function __loadSprites(onDone) {
        const keys = Object.keys(__SPRITE_MANIFEST);
        __spritesTotal = keys.length;
        __spritesLoaded = 0;
        let done = 0;
        keys.forEach(key => {
            const img = new Image();
            img.onload = () => { __sprites[key] = img; done++; __spritesLoaded = done; if (done === __spritesTotal) { __allSpritesReady = true; if (onDone) onDone(); } };
            img.onerror = () => { __sprites[key] = null; done++; __spritesLoaded = done; if (done === __spritesTotal) { __allSpritesReady = true; if (onDone) onDone(); } };
            img.src = __SPRITE_MANIFEST[key];
        });
    }

    function __drawLoadingScreen(cvs, context, title, color) {
        const w = cvs.width, h = cvs.height;
        context.fillStyle = '#0A0E1A';
        context.fillRect(0, 0, w, h);
        context.textAlign = 'center';
        context.fillStyle = color;
        context.shadowColor = color; context.shadowBlur = 10;
        context.font = 'bold ' + Math.round(w * 0.06) + 'px monospace';
        context.fillText(title, w / 2, h / 2 - w * 0.08);
        context.shadowBlur = 0;
        context.fillStyle = '#E0E7FF';
        context.font = Math.round(w * 0.025) + 'px monospace';
        context.fillText('LOADING SPRITES...', w / 2, h / 2);
        const barW = w * 0.35, barH = w * 0.012;
        const pct = __spritesTotal > 0 ? __spritesLoaded / __spritesTotal : 0;
        context.fillStyle = '#333';
        context.fillRect(w / 2 - barW / 2, h / 2 + w * 0.025, barW, barH);
        context.fillStyle = color;
        context.fillRect(w / 2 - barW / 2, h / 2 + w * 0.025, barW * pct, barH);
    }



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
    // ── Design Constants ──
    const GAME_W = 480, GAME_H = 480;
    const BORDER = 8;
    const FIELD_X = BORDER, FIELD_Y = BORDER + 32;
    const FIELD_W = GAME_W - BORDER * 2, FIELD_H = GAME_H - BORDER - FIELD_Y;
    const PLAYER_SPEED_BORDER = 2.5;
    const PLAYER_SPEED_SLOW = 1.4;
    const PLAYER_SPEED_FAST = 2.8;
    const FUSE_TIME = 150; // frames before fuse kills you while stopped drawing
    const CLAIM_TARGET = 0.75;
    const INITIAL_LIVES = 3;

    // States
    const ST_TITLE = 0, ST_PLAY = 1, ST_DYING = 2, ST_GAMEOVER = 3, ST_LEVELDONE = 4;

    // Game state
    let canvas, ctx, W, H, SCALE, DPR, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor, playerColorRGB;
    let state, frameCount, lastTime, keys = {};
    let score, lives, level, startTime;
    let deathTimer, levelDoneTimer;

    // Territory grid (1 = claimed, 0 = unclaimed)
    const GRID_RES = 2; // pixels per grid cell
    let gridW, gridH, grid;
    let claimedPct;

    // Player
    let px, py, pDir; // position and current direction on border
    let drawing, drawSpeed, drawLine; // drawing state
    let fuseTimer, fusePos;

    // Qix entities
    let qixes;

    // Sparx enemies
    let sparx;

    // Visual
    let particles, scorePopups, stars;
    let screenShake;
    let fillAnimQueue; // animated fill regions
    let borderPath; // current border polygon segments
    let fillAnimations; // expanding glow wave animations

    // New gameplay
    let bonusGems; // bonus items in unclaimed territory
    let bonusGemTimer; // timer for spawning gems
    let fuseBombPowerup; // fuse bomb power-up location
    let levelStartTime; // for timer bonus calculation
    let claimAnimations; // claim fill glow waves

    // Audio
    let audioCtx;
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
    function sfxDraw() { playTone(220, 0.05, 'square', 0.04); }
    function sfxClaim() { playTone(600, 0.3, 'sine', 0.12, 1200); }
    function sfxDeath() { playTone(120, 0.5, 'sawtooth', 0.15, 40); }
    function sfxFuse() { playTone(800, 0.08, 'sawtooth', 0.06); }
    function sfxLevel() { playTone(440, 0.15, 'sine', 0.1); setTimeout(() => playTone(660, 0.15, 'sine', 0.1), 150); setTimeout(() => playTone(880, 0.3, 'sine', 0.12), 300); }
    function sfxSparx() { playTone(1200, 0.06, 'square', 0.05); }
    function sfxMove() { playTone(440, 0.02, 'triangle', 0.02); }
    function sfxGem() { playTone(1000, 0.1, 'sine', 0.12); setTimeout(() => playTone(1400, 0.08, 'sine', 0.1), 60); }
    function sfxFuseBomb() { playTone(500, 0.2, 'sawtooth', 0.12); setTimeout(() => playTone(800, 0.15, 'sine', 0.1), 100); }
    function sfxTimerBonus() { playTone(660, 0.1, 'sine', 0.1); setTimeout(() => playTone(880, 0.1, 'sine', 0.1), 80); setTimeout(() => playTone(1100, 0.15, 'sine', 0.12), 160); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

    const HAS_TOUCH = ('ontouchstart' in window);
    function drawOnScreenControls(ctx, W, H, gs, buttons, dpadDirs) {
        if (!HAS_TOUCH) return;
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + gs(14) + 'px monospace';
        var padX = gs(60), padY = H - gs(70);
        var bs = gs(36), gap = gs(4);
        if (dpadDirs.indexOf('U') >= 0) {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.roundRect(padX - bs/2, padY - bs - gap, bs, bs, gs(6)); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillText('\u25B2', padX, padY - bs/2 - gap);
        }
        if (dpadDirs.indexOf('D') >= 0) {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.roundRect(padX - bs/2, padY + gap, bs, bs, gs(6)); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillText('\u25BC', padX, padY + bs/2 + gap);
        }
        if (dpadDirs.indexOf('L') >= 0) {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.roundRect(padX - bs - gap - bs/2, padY - bs/2, bs, bs, gs(6)); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillText('\u25C0', padX - bs - gap, padY);
        }
        if (dpadDirs.indexOf('R') >= 0) {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.roundRect(padX + gap + bs/2, padY - bs/2, bs, bs, gs(6)); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillText('\u25B6', padX + bs + gap, padY);
        }
        var bx = W - gs(60);
        for (var i = buttons.length - 1; i >= 0; i--) {
            var label = buttons[i];
            var bw = Math.max(gs(50), ctx.measureText(label).width + gs(16));
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.roundRect(bx - bw/2, H - gs(55), bw, gs(40), gs(8)); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillText(label, bx, H - gs(35));
            bx -= bw + gs(10);
        }
        ctx.restore();
    }



    function hexToRGB(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }
    function darken(hex, f) {
        const c = hexToRGB(hex);
        return `rgb(${Math.floor(c.r * f)},${Math.floor(c.g * f)},${Math.floor(c.b * f)})`;
    }
    function lighten(hex, amt) {
        const c = hexToRGB(hex);
        return `rgb(${Math.min(255, c.r + 255 * amt)|0},${Math.min(255, c.g + 255 * amt)|0},${Math.min(255, c.b + 255 * amt)|0})`;
    }

    // ── Grid / Territory ──
    function initGrid() {
        gridW = Math.floor(FIELD_W / GRID_RES);
        gridH = Math.floor(FIELD_H / GRID_RES);
        grid = new Uint8Array(gridW * gridH);
        // Claim the border cells (outer 2 cells on each side)
        for (let y = 0; y < gridH; y++) {
            for (let x = 0; x < gridW; x++) {
                if (x < 2 || x >= gridW - 2 || y < 2 || y >= gridH - 2) {
                    grid[y * gridW + x] = 1;
                }
            }
        }
        updateClaimedPct();
    }

    function gridGet(gx, gy) {
        if (gx < 0 || gx >= gridW || gy < 0 || gy >= gridH) return 1;
        return grid[gy * gridW + gx];
    }
    function gridSet(gx, gy, val) {
        if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) grid[gy * gridW + gx] = val;
    }

    function worldToGrid(wx, wy) {
        return {
            gx: Math.floor((wx - FIELD_X) / GRID_RES),
            gy: Math.floor((wy - FIELD_Y) / GRID_RES)
        };
    }
    function gridToWorld(gx, gy) {
        return { wx: FIELD_X + gx * GRID_RES, wy: FIELD_Y + gy * GRID_RES };
    }

    function isOnBorder(wx, wy) {
        const { gx, gy } = worldToGrid(wx, wy);
        if (gridGet(gx, gy) !== 1) return false;
        // Must be adjacent to unclaimed
        return gridGet(gx - 1, gy) === 0 || gridGet(gx + 1, gy) === 0 ||
               gridGet(gx, gy - 1) === 0 || gridGet(gx, gy + 1) === 0 ||
               gx <= 2 || gx >= gridW - 3 || gy <= 2 || gy >= gridH - 3;
    }

    function isOnClaimed(wx, wy) {
        const { gx, gy } = worldToGrid(wx, wy);
        return gridGet(gx, gy) === 1;
    }

    function updateClaimedPct() {
        let claimed = 0, total = gridW * gridH;
        for (let i = 0; i < total; i++) if (grid[i] === 1) claimed++;
        claimedPct = claimed / total;
    }

    // ── Flood Fill for Territory Claim ──
    function claimTerritory() {
        // Mark draw line as claimed
        for (const pt of drawLine) {
            const { gx, gy } = worldToGrid(pt.x, pt.y);
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++)
                    gridSet(gx + dx, gy + dy, 1);
        }

        // Flood fill from each Qix position to find reachable unclaimed areas
        const visited = new Uint8Array(gridW * gridH);
        const qixReachable = new Uint8Array(gridW * gridH);

        for (const q of qixes) {
            const { gx: sx, gy: sy } = worldToGrid(q.x, q.y);
            if (gridGet(sx, sy) === 1) continue;
            const stack = [sx + sy * gridW];
            while (stack.length > 0) {
                const idx = stack.pop();
                if (idx < 0 || idx >= gridW * gridH) continue;
                if (qixReachable[idx]) continue;
                if (grid[idx] === 1) continue;
                qixReachable[idx] = 1;
                const x = idx % gridW, y = (idx / gridW) | 0;
                if (x > 0) stack.push(idx - 1);
                if (x < gridW - 1) stack.push(idx + 1);
                if (y > 0) stack.push(idx - gridW);
                if (y < gridH - 1) stack.push(idx + gridW);
            }
        }

        // Everything NOT reachable by Qix and NOT already claimed becomes claimed
        let newCells = 0;
        for (let i = 0; i < gridW * gridH; i++) {
            if (grid[i] === 0 && !qixReachable[i]) {
                grid[i] = 1;
                newCells++;
            }
        }

        updateClaimedPct();

        // Score: cells claimed * multiplier
        const pts = newCells * (drawSpeed === 'slow' ? 2 : 1) * level;
        score += pts;
        if (pts > 0) {
            sfxClaim();
            scorePopups.push({ x: px, y: py - 10, text: `+${pts}`, life: 60, maxLife: 60 });
            // Territory fill particles
            for (let i = 0; i < Math.min(newCells / 5, 40); i++) {
                const angle = rng(0, Math.PI * 2);
                particles.push({
                    x: px + rng(-30, 30), y: py + rng(-30, 30),
                    vx: Math.cos(angle) * rng(0.5, 2), vy: Math.sin(angle) * rng(0.5, 2),
                    size: rng(1, 3), color: playerColor, life: rng(20, 50), maxLife: 50
                });
            }
            // Expanding glow wave from fill point
            if (claimAnimations) {
                claimAnimations.push({ x: px, y: py, radius: 0, life: 40, maxLife: 40 });
            }
        }

        return newCells;
    }

    // ── Qix Entity ──
    function createQix() {
        const cx = FIELD_X + FIELD_W / 2, cy = FIELD_Y + FIELD_H / 2;
        return {
            x: cx + rng(-40, 40), y: cy + rng(-40, 40),
            vx: rng(-1.5, 1.5) || 0.5, vy: rng(-1.5, 1.5) || 0.5,
            segments: [], // trailing segments for the line effect
            hue: rng(0, 360),
            hueSpeed: rng(1, 3),
            wobble: 0, wobbleSpeed: rng(0.02, 0.06),
            length: 12 + level * 2,
            speed: 1 + level * 0.15
        };
    }

    function updateQix(q, dt) {
        q.wobble += q.wobbleSpeed * dt;
        q.hue = (q.hue + q.hueSpeed * dt) % 360;

        // Random direction changes
        if (Math.random() < 0.02 * dt) q.vx += rng(-0.8, 0.8);
        if (Math.random() < 0.02 * dt) q.vy += rng(-0.8, 0.8);
        // Speed normalization
        const spd = Math.hypot(q.vx, q.vy);
        if (spd > 0) { q.vx = (q.vx / spd) * q.speed; q.vy = (q.vy / spd) * q.speed; }

        q.x += q.vx * dt;
        q.y += q.vy * dt;

        // Bounce off claimed territory
        const { gx, gy } = worldToGrid(q.x, q.y);
        if (gridGet(gx, gy) === 1) {
            q.x -= q.vx * dt * 2;
            q.y -= q.vy * dt * 2;
            if (gridGet(worldToGrid(q.x + q.vx * 3, q.y).gx, worldToGrid(q.x, q.y).gy) === 1) q.vx = -q.vx + rng(-0.3, 0.3);
            if (gridGet(worldToGrid(q.x, q.y + q.vy * 3).gx, worldToGrid(q.x, q.y + q.vy * 3).gy) === 1) q.vy = -q.vy + rng(-0.3, 0.3);
        }

        // Keep in unclaimed area
        q.x = clamp(q.x, FIELD_X + 6, FIELD_X + FIELD_W - 6);
        q.y = clamp(q.y, FIELD_Y + 6, FIELD_Y + FIELD_H - 6);

        // Record trailing segments
        q.segments.unshift({ x: q.x + Math.sin(q.wobble) * 8, y: q.y + Math.cos(q.wobble * 1.3) * 8 });
        while (q.segments.length > q.length) q.segments.pop();
    }

    // ── Sparx Entity ──
    function createSparx(clockwise) {
        // Start at a random border position
        const side = Math.floor(Math.random() * 4);
        let sx, sy;
        if (side === 0) { sx = FIELD_X + 2; sy = FIELD_Y + rng(4, FIELD_H - 4); }
        else if (side === 1) { sx = FIELD_X + FIELD_W - 2; sy = FIELD_Y + rng(4, FIELD_H - 4); }
        else if (side === 2) { sx = FIELD_X + rng(4, FIELD_W - 4); sy = FIELD_Y + 2; }
        else { sx = FIELD_X + rng(4, FIELD_W - 4); sy = FIELD_Y + FIELD_H - 2; }
        return {
            x: sx, y: sy,
            speed: 1.2 + level * 0.15,
            clockwise,
            sparkTimer: 0
        };
    }

    function updateSparx(s, dt) {
        // Move along the border of claimed territory
        const speed = s.speed * dt;
        const dirs = s.clockwise
            ? [[1,0],[0,1],[-1,0],[0,-1]]
            : [[-1,0],[0,-1],[1,0],[0,1]];

        let moved = false;
        for (let attempt = 0; attempt < 4 && !moved; attempt++) {
            for (const [dx, dy] of dirs) {
                const nx = s.x + dx * speed;
                const ny = s.y + dy * speed;
                const { gx, gy } = worldToGrid(nx, ny);
                // Must stay on claimed cells that border unclaimed
                if (gridGet(gx, gy) === 1 &&
                    (gridGet(gx - 1, gy) === 0 || gridGet(gx + 1, gy) === 0 ||
                     gridGet(gx, gy - 1) === 0 || gridGet(gx, gy + 1) === 0 ||
                     gx <= 2 || gx >= gridW - 3 || gy <= 2 || gy >= gridH - 3)) {
                    s.x = nx; s.y = ny;
                    moved = true;
                    break;
                }
            }
            // If stuck, try reversing
            if (!moved) s.clockwise = !s.clockwise;
        }
        // Keep in bounds
        s.x = clamp(s.x, FIELD_X, FIELD_X + FIELD_W);
        s.y = clamp(s.y, FIELD_Y, FIELD_Y + FIELD_H);

        s.sparkTimer += dt;
        if (s.sparkTimer > 3) {
            s.sparkTimer = 0;
            particles.push({
                x: s.x + rng(-3, 3), y: s.y + rng(-3, 3),
                vx: rng(-1, 1), vy: rng(-1, 1),
                size: rng(1, 2), color: '#FBBF24', life: 15, maxLife: 15
            });
        }
    }

    // ── Player Movement ──
    function getInput() {
        let dx = 0, dy = 0;
        if (keys['ArrowLeft'] || keys['a']) dx = -1;
        if (keys['ArrowRight'] || keys['d']) dx = 1;
        if (keys['ArrowUp'] || keys['w']) dy = -1;
        if (keys['ArrowDown'] || keys['s']) dy = 1;
        // Only allow cardinal movement
        if (dx !== 0 && dy !== 0) dy = 0;
        const drawSlow = keys['z'] || keys['Z'];
        const drawFast = keys['x'] || keys['X'];
        return { dx, dy, drawSlow, drawFast };
    }

    function updatePlayer(dt) {
        const input = getInput();
        const wantDraw = input.drawSlow || input.drawFast;
        const onBorder = isOnClaimed(px, py);

        if (!drawing) {
            // Moving along border
            if (input.dx !== 0 || input.dy !== 0) {
                const speed = PLAYER_SPEED_BORDER * dt;
                const nx = px + input.dx * speed;
                const ny = py + input.dy * speed;
                // Stay on claimed territory when not drawing
                if (isOnClaimed(nx, ny)) {
                    px = nx; py = ny;
                } else if (wantDraw) {
                    // Start drawing into unclaimed territory
                    drawing = true;
                    drawSpeed = input.drawSlow ? 'slow' : 'fast';
                    drawLine = [{ x: px, y: py }];
                    fuseTimer = 0;
                    sfxDraw();
                }
            }
            // Clamp to field
            px = clamp(px, FIELD_X, FIELD_X + FIELD_W);
            py = clamp(py, FIELD_Y, FIELD_Y + FIELD_H);
        } else {
            // Drawing mode — moving through unclaimed territory
            const speed = (drawSpeed === 'slow' ? PLAYER_SPEED_SLOW : PLAYER_SPEED_FAST) * dt;

            if (input.dx === 0 && input.dy === 0) {
                // Not moving while drawing — fuse starts
                fuseTimer += dt;
                if (fuseTimer > FUSE_TIME) {
                    killPlayer('fuse');
                    return;
                }
                // Fuse sound
                if (Math.floor(fuseTimer) % 8 === 0) sfxFuse();
            } else {
                fuseTimer = 0;
                const nx = px + input.dx * speed;
                const ny = py + input.dy * speed;

                // Keep in bounds
                const cnx = clamp(nx, FIELD_X + 1, FIELD_X + FIELD_W - 1);
                const cny = clamp(ny, FIELD_Y + 1, FIELD_Y + FIELD_H - 1);

                // Check if we crossed our own draw line
                if (drawLine.length > 3) {
                    for (let i = 0; i < drawLine.length - 3; i++) {
                        if (dist(cnx, cny, drawLine[i].x, drawLine[i].y) < 3) {
                            killPlayer('self');
                            return;
                        }
                    }
                }

                px = cnx; py = cny;
                drawLine.push({ x: px, y: py });

                // Mark draw line on grid as value 2 (in-progress)
                const { gx, gy } = worldToGrid(px, py);
                gridSet(gx, gy, 2);

                // Check if returned to claimed territory
                if (drawLine.length > 5 && isOnClaimed(px, py)) {
                    // Complete the draw — claim territory
                    drawing = false;
                    const claimed = claimTerritory();
                    drawLine = [];
                    // Clean up grid value 2
                    for (let i = 0; i < gridW * gridH; i++) if (grid[i] === 2) grid[i] = 1;

                    if (claimedPct >= CLAIM_TARGET) {
                        levelComplete();
                    }
                }

                // Draw line particle trail
                if (frameCount % 2 === 0) {
                    particles.push({
                        x: px, y: py,
                        vx: rng(-0.3, 0.3), vy: rng(-0.3, 0.3),
                        size: rng(1, 2.5),
                        color: drawSpeed === 'slow' ? '#60A5FA' : '#F59E0B',
                        life: 20, maxLife: 20
                    });
                }
            }
        }
    }

    // ── Collision Detection ──
    function checkCollisions() {
        if (!drawing) return;

        // Qix vs draw line
        for (const q of qixes) {
            for (const seg of q.segments) {
                for (const pt of drawLine) {
                    if (dist(seg.x, seg.y, pt.x, pt.y) < 5) {
                        killPlayer('qix');
                        return;
                    }
                }
            }
            // Qix center vs draw line
            for (const pt of drawLine) {
                if (dist(q.x, q.y, pt.x, pt.y) < 6) {
                    killPlayer('qix');
                    return;
                }
            }
        }

        // Sparx vs player
        for (const s of sparx) {
            if (dist(s.x, s.y, px, py) < 5) {
                killPlayer('sparx');
                return;
            }
        }
    }

    function checkSparxCollisionBorder() {
        // Sparx can kill even when not drawing
        for (const s of sparx) {
            if (dist(s.x, s.y, px, py) < 5) {
                killPlayer('sparx');
                return;
            }
        }
    }

    // ── Player Death ──
    function killPlayer(reason) {
        lives--;
        drawing = false;
        state = ST_DYING;
        deathTimer = 90;
        sfxDeath();
        screenShake = 15;

        // Death explosion particles
        for (let i = 0; i < 40; i++) {
            const angle = rng(0, Math.PI * 2);
            const spd = rng(1, 4);
            particles.push({
                x: px, y: py,
                vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
                size: rng(1.5, 4), color: pick(['#FBBF24', '#F97316', '#EF4444', '#fff', '#60A5FA']),
                life: rng(30, 60), maxLife: 60
            });
        }

        // Clean up draw line from grid
        for (let i = 0; i < gridW * gridH; i++) if (grid[i] === 2) grid[i] = 0;
        drawLine = [];
    }

    function respawn() {
        if (lives <= 0) {
            state = ST_GAMEOVER;
            deathTimer = 120;
            return;
        }
        state = ST_PLAY;
        // Reset player to top-left border
        px = FIELD_X + FIELD_W / 2;
        py = FIELD_Y + 2;
        drawing = false;
        drawLine = [];
        fuseTimer = 0;
    }

    function levelComplete() {
        state = ST_LEVELDONE;
        levelDoneTimer = 120;
        // Timer bonus: faster completion = more points
        const elapsed = (Date.now() - (levelStartTime || Date.now())) / 1000;
        const timerBonus = Math.max(0, Math.floor((120 - elapsed) * 10 * level));
        score += 1000 * level + timerBonus;
        sfxLevel();
        if (timerBonus > 0) sfxTimerBonus();
        scorePopups.push({ x: GAME_W / 2, y: GAME_H / 2 - 20, text: `LEVEL ${level} COMPLETE!`, life: 90, maxLife: 90 });
        if (timerBonus > 0) {
            scorePopups.push({ x: GAME_W / 2, y: GAME_H / 2 + 5, text: `SPEED BONUS +${timerBonus}`, life: 90, maxLife: 90 });
        }
    }

    function nextLevel() {
        level++;
        levelStartTime = Date.now();
        initGrid();
        px = FIELD_X + FIELD_W / 2;
        py = FIELD_Y + 2;
        drawing = false;
        drawLine = [];
        fuseTimer = 0;
        bonusGems = [];
        bonusGemTimer = 0;
        fuseBombPowerup = null;
        claimAnimations = [];
        fillAnimations = [];

        // More Qix and Sparx
        qixes = [];
        const numQix = level >= 3 ? 2 : 1;
        for (let i = 0; i < numQix; i++) qixes.push(createQix());

        sparx = [];
        const numSparx = Math.min(level, 4);
        for (let i = 0; i < numSparx; i++) sparx.push(createSparx(i % 2 === 0));

        state = ST_PLAY;
    }

    // ── Update ──
    function update(dt) {
        frameCount++;

        if (state === ST_PLAY) {
            updatePlayer(dt);
            for (const q of qixes) updateQix(q, dt);
            for (const s of sparx) updateSparx(s, dt);
            checkCollisions();
            if (state === ST_PLAY) checkSparxCollisionBorder();

            // Bonus gems: spawn in unclaimed territory
            bonusGemTimer += dt;
            if (bonusGemTimer > 200 + rng(0, 150) && bonusGems.length < 3) {
                bonusGemTimer = 0;
                // Find random unclaimed cell
                for (let attempt = 0; attempt < 20; attempt++) {
                    const gx2 = Math.floor(rng(4, gridW - 4));
                    const gy2 = Math.floor(rng(4, gridH - 4));
                    if (gridGet(gx2, gy2) === 0) {
                        const wpos = gridToWorld(gx2, gy2);
                        bonusGems.push({
                            x: wpos.wx, y: wpos.wy,
                            value: pick([100, 250, 500]),
                            life: 300 + rng(0, 200), maxLife: 500,
                            hue: rng(0, 360)
                        });
                        break;
                    }
                }
            }
            // Gem lifetime and collection
            for (let i = bonusGems.length - 1; i >= 0; i--) {
                bonusGems[i].life -= dt;
                if (bonusGems[i].life <= 0) { bonusGems.splice(i, 1); continue; }
                // Collect if player is near
                if (dist(px, py, bonusGems[i].x, bonusGems[i].y) < 8) {
                    const gem = bonusGems.splice(i, 1)[0];
                    score += gem.value;
                    sfxGem();
                    scorePopups.push({ x: gem.x, y: gem.y - 5, text: `+${gem.value}`, life: 40, maxLife: 40 });
                    for (let j = 0; j < 8; j++) {
                        const angle = rng(0, Math.PI * 2);
                        particles.push({
                            x: gem.x, y: gem.y,
                            vx: Math.cos(angle) * rng(0.5, 2), vy: Math.sin(angle) * rng(0.5, 2),
                            size: rng(1, 3), color: `hsl(${gem.hue},80%,60%)`, life: rng(15, 30), maxLife: 30
                        });
                    }
                }
            }

            // Fuse bomb power-up: spawns occasionally
            if (!fuseBombPowerup && Math.random() < 0.0005 * dt && sparx.length > 0) {
                for (let attempt = 0; attempt < 20; attempt++) {
                    const gx3 = Math.floor(rng(4, gridW - 4));
                    const gy3 = Math.floor(rng(4, gridH - 4));
                    if (gridGet(gx3, gy3) === 1) {
                        const wpos = gridToWorld(gx3, gy3);
                        fuseBombPowerup = { x: wpos.wx, y: wpos.wy, life: 400 };
                        break;
                    }
                }
            }
            if (fuseBombPowerup) {
                fuseBombPowerup.life -= dt;
                if (fuseBombPowerup.life <= 0) { fuseBombPowerup = null; }
                else if (dist(px, py, fuseBombPowerup.x, fuseBombPowerup.y) < 8) {
                    // Kill nearest sparx
                    if (sparx.length > 0) {
                        let nearIdx = 0, nearDist = Infinity;
                        for (let si = 0; si < sparx.length; si++) {
                            const d = dist(sparx[si].x, sparx[si].y, px, py);
                            if (d < nearDist) { nearDist = d; nearIdx = si; }
                        }
                        const killed = sparx.splice(nearIdx, 1)[0];
                        sfxFuseBomb();
                        score += 300;
                        scorePopups.push({ x: killed.x, y: killed.y - 5, text: 'ZAP! +300', life: 50, maxLife: 50 });
                        for (let j = 0; j < 15; j++) {
                            const angle = rng(0, Math.PI * 2);
                            particles.push({
                                x: killed.x, y: killed.y,
                                vx: Math.cos(angle) * rng(1, 3), vy: Math.sin(angle) * rng(1, 3),
                                size: rng(1, 3), color: pick(['#FBBF24', '#EF4444', '#FFF']), life: rng(20, 40), maxLife: 40
                            });
                        }
                    }
                    fuseBombPowerup = null;
                }
            }

            // Update claim animations (expanding glow waves)
            if (claimAnimations) {
                for (let i = claimAnimations.length - 1; i >= 0; i--) {
                    claimAnimations[i].radius += 2 * dt;
                    claimAnimations[i].life -= dt;
                    if (claimAnimations[i].life <= 0) claimAnimations.splice(i, 1);
                }
            }
        } else if (state === ST_DYING) {
            deathTimer -= dt;
            if (deathTimer <= 0) respawn();
        } else if (state === ST_LEVELDONE) {
            levelDoneTimer -= dt;
            if (levelDoneTimer <= 0) nextLevel();
        } else if (state === ST_GAMEOVER) {
            deathTimer -= dt;
        }

        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
        // Update score popups
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const p = scorePopups[i];
            p.y -= 0.5 * dt;
            p.life -= dt;
            if (p.life <= 0) scorePopups.splice(i, 1);
        }

        if (screenShake > 0) screenShake -= dt;
    }

    // ── Drawing ──
    function draw() {
        ctx.save();
        const shake = screenShake > 0 ? Math.floor(screenShake) : 0;
        if (shake > 0) ctx.translate(rng(-shake, shake) * SCALE, rng(-shake, shake) * SCALE);

        // Background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, '#05050F');
        bgGrad.addColorStop(1, '#0A0A1A');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        drawField();
        drawClaimedTerritory();
        drawClaimAnimations();
        drawBonusGems();
        drawFuseBombPowerup();
        drawDrawLine();
        drawQixes();
        drawSparxEntities();
        drawPlayer();
        drawParticles();
        drawScorePopups();
        drawHUD();
        drawVignette();

        if (state === ST_DYING) drawDeathOverlay();
        if (state === ST_LEVELDONE) drawLevelDone();
        if (state === ST_GAMEOVER) drawGameOverScreen();

        if (state === ST_PLAY) drawOnScreenControls(ctx, W, H, gs, ['SLOW', 'FAST'], 'LRUD');

        ctx.restore();
    }

    function drawField() {
        // Metallic border frame
        const bx = FIELD_X - 3, by = FIELD_Y - 3;
        const bw = FIELD_W + 6, bh = FIELD_H + 6;

        // Outer frame
        ctx.strokeStyle = '#555';
        ctx.lineWidth = gs(3);
        ctx.strokeRect(gs(bx), gs(by), gs(bw), gs(bh));

        // Inner highlight
        ctx.strokeStyle = '#888';
        ctx.lineWidth = gs(1);
        ctx.strokeRect(gs(bx + 1), gs(by + 1), gs(bw - 2), gs(bh - 2));

        // Frame shine
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = gs(1);
        ctx.beginPath();
        ctx.moveTo(gs(bx), gs(by));
        ctx.lineTo(gs(bx + bw), gs(by));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gs(bx), gs(by));
        ctx.lineTo(gs(bx), gs(by + bh));
        ctx.stroke();

        // Unclaimed area — dark with subtle grid
        ctx.fillStyle = '#0A0B14';
        ctx.fillRect(gs(FIELD_X), gs(FIELD_Y), gs(FIELD_W), gs(FIELD_H));

        // Subtle grid pattern in unclaimed
        ctx.strokeStyle = 'rgba(255,255,255,0.02)';
        ctx.lineWidth = gs(0.5);
        for (let x = FIELD_X; x < FIELD_X + FIELD_W; x += 16) {
            ctx.beginPath();
            ctx.moveTo(gs(x), gs(FIELD_Y));
            ctx.lineTo(gs(x), gs(FIELD_Y + FIELD_H));
            ctx.stroke();
        }
        for (let y = FIELD_Y; y < FIELD_Y + FIELD_H; y += 16) {
            ctx.beginPath();
            ctx.moveTo(gs(FIELD_X), gs(y));
            ctx.lineTo(gs(FIELD_X + FIELD_W), gs(y));
            ctx.stroke();
        }
    }

    function drawClaimedTerritory() {
        // Draw claimed territory with player color gradient
        const c = playerColorRGB;
        const imgData = ctx.createImageData(Math.ceil(gs(FIELD_W)), Math.ceil(gs(FIELD_H)));
        const data = imgData.data;
        const imgW = imgData.width;
        const imgH = imgData.height;

        for (let gy = 0; gy < gridH; gy++) {
            for (let gx = 0; gx < gridW; gx++) {
                if (grid[gy * gridW + gx] !== 1) continue;
                // Skip outer border cells (drawn separately)
                if (gx < 2 || gx >= gridW - 2 || gy < 2 || gy >= gridH - 2) continue;

                // Map grid cell to image pixels
                const pixX = Math.floor((gx * GRID_RES) * SCALE);
                const pixY = Math.floor((gy * GRID_RES) * SCALE);
                const pixW = Math.ceil(GRID_RES * SCALE);
                const pixH = Math.ceil(GRID_RES * SCALE);

                // Gradient: darker at edges, lighter in center
                const gradX = gx / gridW;
                const gradY = gy / gridH;
                const gradDist = Math.sqrt((gradX - 0.5) ** 2 + (gradY - 0.5) ** 2);
                const brightness = 0.5 + (1 - gradDist) * 0.5;

                // Pattern: animated diagonal stripes shimmer
                const stripe = Math.sin((gx + gy) * 0.5 + frameCount * 0.03) * 0.04;
                const checker = ((gx + gy) % 4 < 2) ? 1.0 + stripe : 0.92 - stripe;

                const r = Math.floor(c.r * brightness * checker * 0.6);
                const g = Math.floor(c.g * brightness * checker * 0.6);
                const b = Math.floor(c.b * brightness * checker * 0.6);

                for (let py2 = pixY; py2 < pixY + pixH && py2 < imgH; py2++) {
                    for (let px2 = pixX; px2 < pixX + pixW && px2 < imgW; px2++) {
                        const idx = (py2 * imgW + px2) * 4;
                        data[idx] = r;
                        data[idx + 1] = g;
                        data[idx + 2] = b;
                        data[idx + 3] = 200;
                    }
                }
            }
        }
        ctx.putImageData(imgData, gs(FIELD_X), gs(FIELD_Y));
    }

    function drawDrawLine() {
        if (!drawing || drawLine.length < 2) return;

        // Glow trail
        ctx.shadowColor = drawSpeed === 'slow' ? '#60A5FA' : '#F59E0B';
        ctx.shadowBlur = gs(8);
        ctx.strokeStyle = drawSpeed === 'slow' ? '#93C5FD' : '#FCD34D';
        ctx.lineWidth = gs(3);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(gs(drawLine[0].x), gs(drawLine[0].y));
        for (let i = 1; i < drawLine.length; i++) {
            ctx.lineTo(gs(drawLine[i].x), gs(drawLine[i].y));
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Inner bright line
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = gs(1);
        ctx.beginPath();
        ctx.moveTo(gs(drawLine[0].x), gs(drawLine[0].y));
        for (let i = 1; i < drawLine.length; i++) {
            ctx.lineTo(gs(drawLine[i].x), gs(drawLine[i].y));
        }
        ctx.stroke();

        // Fuse animation when stopped
        if (fuseTimer > 0 && drawLine.length > 1) {
            const fuseProgress = fuseTimer / FUSE_TIME;
            const fuseIdx = Math.floor(fuseProgress * (drawLine.length - 1));
            const fusePt = drawLine[Math.min(fuseIdx, drawLine.length - 1)];

            // Fuse sparks
            ctx.fillStyle = '#FF4444';
            ctx.shadowColor = '#FF0000';
            ctx.shadowBlur = gs(12);
            ctx.beginPath();
            ctx.arc(gs(fusePt.x), gs(fusePt.y), gs(3 + Math.sin(frameCount * 0.5) * 2), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Spark particles along the line up to fuse point
            for (let i = 0; i < fuseIdx && i < drawLine.length; i++) {
                if (Math.random() < 0.1) {
                    ctx.fillStyle = `rgba(255,${rng(100,200)|0},0,${rng(0.3,0.8).toFixed(2)})`;
                    ctx.fillRect(gs(drawLine[i].x + rng(-2, 2)), gs(drawLine[i].y + rng(-2, 2)), gs(1.5), gs(1.5));
                }
            }

            // Fuse progress bar
            ctx.fillStyle = 'rgba(255,0,0,0.5)';
            const barW = 30, barH = 3;
            ctx.fillRect(gs(px - barW / 2), gs(py - 12), gs(barW * fuseProgress), gs(barH));
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = gs(0.5);
            ctx.strokeRect(gs(px - barW / 2), gs(py - 12), gs(barW), gs(barH));
        }
    }

    function drawQixes() {
        for (const q of qixes) {
            if (q.segments.length < 2) continue;

            // Draw flowing tentacle-like organic Qix
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Multiple flowing tendrils
            for (let tendril = 0; tendril < 3; tendril++) {
                const offset = tendril * 2.094; // 120 degrees apart
                ctx.lineWidth = gs(3 - tendril * 0.5);
                for (let i = 1; i < q.segments.length; i++) {
                    const t = i / q.segments.length;
                    const hue = (q.hue + i * 12 + tendril * 40) % 360;
                    const wobbleX = Math.sin(frameCount * 0.04 + i * 0.3 + offset) * (3 + t * 5);
                    const wobbleY = Math.cos(frameCount * 0.035 + i * 0.25 + offset) * (3 + t * 5);
                    ctx.strokeStyle = `hsla(${hue}, 90%, ${60 - tendril * 10}%, ${(1 - t * 0.8) * 0.7})`;
                    ctx.shadowColor = `hsla(${hue}, 90%, 50%, 0.4)`;
                    ctx.shadowBlur = gs(5 * (1 - t));
                    ctx.beginPath();
                    ctx.moveTo(gs(q.segments[i - 1].x + wobbleX * (1 - (i-1)/q.segments.length)),
                               gs(q.segments[i - 1].y + wobbleY * (1 - (i-1)/q.segments.length)));
                    ctx.lineTo(gs(q.segments[i].x + wobbleX * (1 - t)),
                               gs(q.segments[i].y + wobbleY * (1 - t)));
                    ctx.stroke();
                }
            }
            ctx.shadowBlur = 0;

            // Main flowing body line
            ctx.lineWidth = gs(3.5);
            for (let i = 1; i < q.segments.length; i++) {
                const t = i / q.segments.length;
                const hue = (q.hue + i * 15) % 360;
                ctx.strokeStyle = `hsla(${hue}, 95%, 65%, ${1 - t * 0.7})`;
                ctx.shadowColor = `hsla(${hue}, 95%, 55%, 0.6)`;
                ctx.shadowBlur = gs(8 * (1 - t));
                ctx.beginPath();
                if (i >= 2) {
                    // Smooth curves for organic feel
                    const p0 = q.segments[i - 2], p1 = q.segments[i - 1], p2 = q.segments[i];
                    ctx.moveTo(gs(p1.x), gs(p1.y));
                    ctx.quadraticCurveTo(gs(p1.x + (p1.x - p0.x) * 0.3), gs(p1.y + (p1.y - p0.y) * 0.3), gs(p2.x), gs(p2.y));
                } else {
                    ctx.moveTo(gs(q.segments[i - 1].x), gs(q.segments[i - 1].y));
                    ctx.lineTo(gs(q.segments[i].x), gs(q.segments[i].y));
                }
                ctx.stroke();
            }
            ctx.shadowBlur = 0;

            // Central glow point with pulsing
            const cHue = q.hue;
            const pulse = 0.7 + 0.3 * Math.sin(frameCount * 0.1);
            ctx.fillStyle = `hsla(${cHue}, 100%, 70%, ${0.8 * pulse})`;
            ctx.shadowColor = `hsla(${cHue}, 100%, 60%, 0.7)`;
            ctx.shadowBlur = gs(18 * pulse);
            ctx.beginPath();
            ctx.arc(gs(q.x), gs(q.y), gs(5 * pulse), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Inner white core
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(gs(q.x), gs(q.y), gs(2), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawSparxEntities() {
        for (const s of sparx) {
            const pulse = 0.7 + Math.sin(frameCount * 0.3 + s.x) * 0.3;

            // Electric trail behind sparx
            ctx.strokeStyle = `rgba(251,191,36,${0.15 * pulse})`;
            ctx.lineWidth = gs(2);
            ctx.shadowColor = '#FBBF24';
            ctx.shadowBlur = gs(4);
            for (let t = 1; t <= 5; t++) {
                const trailAlpha = (5 - t) / 5 * 0.3;
                ctx.strokeStyle = `rgba(251,191,36,${trailAlpha})`;
                ctx.beginPath();
                const tx = s.x - (s.clockwise ? 1 : -1) * t * 2 + rng(-1, 1);
                const ty = s.y + rng(-1, 1);
                ctx.moveTo(gs(s.x), gs(s.y));
                // Jagged bolt trail
                const mx = (s.x + tx) / 2 + rng(-3, 3);
                const my = (s.y + ty) / 2 + rng(-3, 3);
                ctx.lineTo(gs(mx), gs(my));
                ctx.lineTo(gs(tx), gs(ty));
                ctx.stroke();
            }

            // Electric glow (larger)
            ctx.fillStyle = `rgba(251,191,36,${0.25 * pulse})`;
            ctx.shadowColor = '#FBBF24';
            ctx.shadowBlur = gs(14 * pulse);
            ctx.beginPath();
            ctx.arc(gs(s.x), gs(s.y), gs(6 * pulse), 0, Math.PI * 2);
            ctx.fill();

            // Core
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(gs(s.x), gs(s.y), gs(2.5), 0, Math.PI * 2);
            ctx.fill();

            // Electric bolts (more and jagged)
            for (let i = 0; i < 5; i++) {
                const angle = (frameCount * 0.25 + i * 1.257) % (Math.PI * 2);
                const len = 5 + Math.sin(frameCount * 0.5 + i) * 3;
                ctx.strokeStyle = `rgba(251,230,100,${0.5 * pulse})`;
                ctx.lineWidth = gs(1);
                ctx.beginPath();
                ctx.moveTo(gs(s.x), gs(s.y));
                // Two-segment jagged bolt
                const m1x = s.x + Math.cos(angle) * len * 0.3 + rng(-2, 2);
                const m1y = s.y + Math.sin(angle) * len * 0.3 + rng(-2, 2);
                const m2x = s.x + Math.cos(angle) * len * 0.6 + rng(-2, 2);
                const m2y = s.y + Math.sin(angle) * len * 0.6 + rng(-2, 2);
                ctx.lineTo(gs(m1x), gs(m1y));
                ctx.lineTo(gs(m2x), gs(m2y));
                ctx.lineTo(gs(s.x + Math.cos(angle) * len), gs(s.y + Math.sin(angle) * len));
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
        }
    }

    function drawClaimAnimations() {
        if (!claimAnimations) return;
        for (const a of claimAnimations) {
            const alpha = Math.max(0, a.life / a.maxLife);
            ctx.strokeStyle = playerColor;
            ctx.globalAlpha = alpha * 0.5;
            ctx.lineWidth = gs(2);
            ctx.shadowColor = playerColor;
            ctx.shadowBlur = gs(8 * alpha);
            ctx.beginPath();
            ctx.arc(gs(a.x), gs(a.y), gs(a.radius), 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
    }

    function drawBonusGems() {
        if (!bonusGems) return;
        for (const gem of bonusGems) {
            const alpha = Math.min(1, gem.life / 60); // fade in/out
            const fadeOut = gem.life < 80 ? gem.life / 80 : 1;
            const bob = Math.sin(frameCount * 0.12 + gem.x * 0.1) * 2;
            const gx2 = gs(gem.x), gy2 = gs(gem.y + bob);
            const pulse = 0.8 + 0.2 * Math.sin(frameCount * 0.15 + gem.y * 0.1);

            ctx.globalAlpha = alpha * fadeOut;

            // Gem glow
            ctx.shadowColor = `hsl(${gem.hue},80%,60%)`;
            ctx.shadowBlur = gs(10 * pulse);

            // Diamond shape
            ctx.fillStyle = `hsl(${gem.hue},80%,60%)`;
            ctx.beginPath();
            ctx.moveTo(gx2, gy2 - gs(5));
            ctx.lineTo(gx2 + gs(4), gy2);
            ctx.lineTo(gx2, gy2 + gs(5));
            ctx.lineTo(gx2 - gs(4), gy2);
            ctx.closePath();
            ctx.fill();

            // Gem highlight
            ctx.fillStyle = `rgba(255,255,255,${0.4 * pulse})`;
            ctx.beginPath();
            ctx.moveTo(gx2, gy2 - gs(4));
            ctx.lineTo(gx2 + gs(2), gy2 - gs(1));
            ctx.lineTo(gx2, gy2);
            ctx.lineTo(gx2 - gs(2), gy2 - gs(1));
            ctx.closePath();
            ctx.fill();

            // Value text
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${gs(7)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(`${gem.value}`, gx2, gy2 + gs(12));
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
    }

    function drawFuseBombPowerup() {
        if (!fuseBombPowerup) return;
        const fb = fuseBombPowerup;
        const pulse = 0.7 + 0.3 * Math.sin(frameCount * 0.15);
        const bob = Math.sin(frameCount * 0.1) * 2;
        const fx = gs(fb.x), fy = gs(fb.y + bob);
        const fadeOut = fb.life < 80 ? fb.life / 80 : 1;

        ctx.globalAlpha = fadeOut;

        // Glow
        ctx.shadowColor = '#EF4444';
        ctx.shadowBlur = gs(12 * pulse);
        ctx.fillStyle = `rgba(239,68,68,${0.3 * pulse})`;
        ctx.beginPath();
        ctx.arc(fx, fy, gs(8 * pulse), 0, Math.PI * 2);
        ctx.fill();

        // Bomb shape
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(fx, fy, gs(5), 0, Math.PI * 2);
        ctx.fill();
        // Fuse spark
        ctx.fillStyle = '#FBBF24';
        ctx.beginPath();
        ctx.arc(fx + gs(2), fy - gs(6), gs(2 * pulse), 0, Math.PI * 2);
        ctx.fill();
        // Lightning bolt icon
        ctx.strokeStyle = '#FBBF24';
        ctx.lineWidth = gs(1.5);
        ctx.beginPath();
        ctx.moveTo(fx - gs(2), fy - gs(3));
        ctx.lineTo(fx + gs(1), fy);
        ctx.lineTo(fx - gs(1), fy);
        ctx.lineTo(fx + gs(2), fy + gs(3));
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }

    function drawPlayer() {
        if (state === ST_DYING) return;

        const pulse = 0.8 + Math.sin(frameCount * 0.15) * 0.2;

        // Player glow
        ctx.fillStyle = playerColor;
        ctx.shadowColor = playerColor;
        ctx.shadowBlur = gs(10 * pulse);
        ctx.beginPath();
        ctx.arc(gs(px), gs(py), gs(4), 0, Math.PI * 2);
        ctx.fill();

        // Bright center
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(gs(px), gs(py), gs(2), 0, Math.PI * 2);
        ctx.fill();

        // Direction indicator when drawing
        if (drawing) {
            const input = getInput();
            if (input.dx !== 0 || input.dy !== 0) {
                ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                ctx.lineWidth = gs(1);
                ctx.beginPath();
                ctx.moveTo(gs(px), gs(py));
                ctx.lineTo(gs(px + input.dx * 8), gs(py + input.dy * 8));
                ctx.stroke();
            }
        }

        // Draw mode indicator
        if (drawing) {
            const modeColor = drawSpeed === 'slow' ? '#60A5FA' : '#F59E0B';
            ctx.strokeStyle = modeColor;
            ctx.lineWidth = gs(1);
            ctx.beginPath();
            ctx.arc(gs(px), gs(py), gs(6 + Math.sin(frameCount * 0.1) * 1), 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(gs(p.x), gs(p.y), gs(p.size), gs(p.size));
        }
        ctx.globalAlpha = 1;
    }

    function drawScorePopups() {
        ctx.textAlign = 'center';
        for (const p of scorePopups) {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#FBBF24';
            ctx.shadowColor = '#FBBF24';
            ctx.shadowBlur = gs(6);
            ctx.font = `bold ${gs(11)}px monospace`;
            ctx.fillText(p.text, gs(p.x), gs(p.y));
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
    }

    function drawHUD() {
        // HUD bar at top
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, gs(30));
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(0, gs(29), W, gs(1));

        ctx.textAlign = 'left';
        ctx.font = `bold ${gs(11)}px monospace`;

        // Score
        ctx.fillStyle = '#888';
        ctx.fillText('SCORE', gs(6), gs(12));
        ctx.fillStyle = '#FBBF24';
        ctx.fillText(`${score}`, gs(52), gs(12));

        // Level
        ctx.fillStyle = '#888';
        ctx.fillText('LVL', gs(6), gs(26));
        ctx.fillStyle = '#fff';
        ctx.fillText(`${level}`, gs(32), gs(26));

        // Lives (hearts)
        ctx.fillStyle = '#888';
        ctx.font = `bold ${gs(10)}px monospace`;
        ctx.fillText('LIVES', gs(130), gs(12));
        for (let i = 0; i < Math.max(0, lives); i++) {
            ctx.fillStyle = '#EF4444';
            ctx.beginPath();
            const hx = 175 + i * 14, hy = 8;
            ctx.arc(gs(hx - 2.5), gs(hy), gs(3.5), Math.PI, 0);
            ctx.arc(gs(hx + 2.5), gs(hy), gs(3.5), Math.PI, 0);
            ctx.lineTo(gs(hx + 6), gs(hy + 3));
            ctx.lineTo(gs(hx), gs(hy + 8));
            ctx.lineTo(gs(hx - 6), gs(hy + 3));
            ctx.fill();
        }

        // Territory percentage with glow
        const pctText = `${(claimedPct * 100).toFixed(1)}%`;
        ctx.textAlign = 'right';
        ctx.font = `bold ${gs(14)}px monospace`;
        const pctColor = claimedPct >= CLAIM_TARGET ? '#22C55E' : playerColor;
        ctx.fillStyle = pctColor;
        ctx.shadowColor = pctColor;
        ctx.shadowBlur = gs(6);
        ctx.fillText(pctText, gs(GAME_W - 8), gs(14));
        ctx.shadowBlur = 0;

        // Target indicator
        ctx.fillStyle = '#555';
        ctx.font = `${gs(8)}px monospace`;
        ctx.fillText(`/ ${(CLAIM_TARGET * 100).toFixed(0)}%`, gs(GAME_W - 8), gs(26));

        // Progress bar
        const barX = 130, barY = 22, barW = 80, barH = 4;
        ctx.fillStyle = '#222';
        ctx.fillRect(gs(barX), gs(barY), gs(barW), gs(barH));
        const progress = Math.min(claimedPct / CLAIM_TARGET, 1);
        ctx.fillStyle = claimedPct >= CLAIM_TARGET ? '#22C55E' : playerColor;
        ctx.fillRect(gs(barX), gs(barY), gs(barW * progress), gs(barH));
        ctx.strokeStyle = '#444';
        ctx.lineWidth = gs(0.5);
        ctx.strokeRect(gs(barX), gs(barY), gs(barW), gs(barH));

        // Draw mode indicator
        if (drawing) {
            ctx.textAlign = 'center';
            ctx.fillStyle = drawSpeed === 'slow' ? '#60A5FA' : '#F59E0B';
            ctx.font = `bold ${gs(9)}px monospace`;
            ctx.fillText(drawSpeed === 'slow' ? 'SLOW 2x' : 'FAST 1x', gs(GAME_W / 2), gs(26));
        }
    }

    function drawVignette() {
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
    }

    function drawDeathOverlay() {
        const alpha = Math.min(1, (90 - deathTimer) / 30) * 0.3;
        ctx.fillStyle = `rgba(255,0,0,${alpha})`;
        ctx.fillRect(0, 0, W, H);
    }

    function drawLevelDone() {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#22C55E';
        ctx.shadowColor = '#22C55E';
        ctx.shadowBlur = gs(12);
        ctx.font = `bold ${gs(28)}px monospace`;
        ctx.fillText(`LEVEL ${level}`, gs(GAME_W / 2), gs(GAME_H / 2 - 15));
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${gs(16)}px monospace`;
        ctx.fillText('COMPLETE!', gs(GAME_W / 2), gs(GAME_H / 2 + 15));
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#888';
        ctx.font = `${gs(11)}px monospace`;
        ctx.fillText(`+${1000 * level} BONUS`, gs(GAME_W / 2), gs(GAME_H / 2 + 35));
    }

    function drawGameOverScreen() {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#EF4444';
        ctx.font = `bold ${gs(32)}px monospace`;
        ctx.fillText('GAME OVER', gs(GAME_W / 2), gs(GAME_H * 0.38));
        ctx.fillStyle = '#fff';
        ctx.font = `${gs(18)}px monospace`;
        ctx.fillText(`SCORE: ${score}`, gs(GAME_W / 2), gs(GAME_H * 0.48));
        ctx.fillStyle = '#888';
        ctx.font = `${gs(12)}px monospace`;
        ctx.fillText(`LEVEL ${level}  •  ${(claimedPct * 100).toFixed(1)}% CLAIMED`, gs(GAME_W / 2), gs(GAME_H * 0.56));
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink && deathTimer <= 0) {
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${gs(14)}px monospace`;
            ctx.fillText('PRESS SPACE TO CONTINUE', gs(GAME_W / 2), gs(GAME_H * 0.7));
        }
    }

    function drawTitle() {
        // Background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, '#05050F');
        bgGrad.addColorStop(0.5, '#0A0A1A');
        bgGrad.addColorStop(1, '#0F0520');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Animated background lines (Qix-like)
        for (let i = 0; i < 8; i++) {
            const t = (frameCount * 0.01 + i * 0.4) % (Math.PI * 2);
            const hue = (frameCount * 2 + i * 45) % 360;
            ctx.strokeStyle = `hsla(${hue}, 80%, 50%, 0.15)`;
            ctx.lineWidth = gs(2);
            ctx.beginPath();
            const cx = GAME_W / 2 + Math.sin(t * 1.3) * 120;
            const cy = GAME_H / 2 + Math.cos(t * 0.8) * 80;
            ctx.moveTo(gs(cx + Math.sin(t) * 60), gs(cy + Math.cos(t * 1.5) * 40));
            ctx.lineTo(gs(cx + Math.sin(t + 1) * 60), gs(cy + Math.cos(t * 1.5 + 1) * 40));
            ctx.lineTo(gs(cx + Math.sin(t + 2) * 50), gs(cy + Math.cos(t * 1.5 + 2) * 50));
            ctx.stroke();
        }

        // Title
        const titleY = GAME_H * 0.25;
        ctx.textAlign = 'center';
        ctx.font = `bold ${gs(52)}px monospace`;
        ctx.fillStyle = '#220033';
        ctx.fillText('QIX', gs(GAME_W / 2 + 3), gs(titleY + 3));

        const titleHue = (frameCount * 2) % 360;
        ctx.fillStyle = `hsl(${titleHue}, 80%, 60%)`;
        ctx.shadowColor = `hsl(${titleHue}, 80%, 50%)`;
        ctx.shadowBlur = gs(20);
        ctx.fillText('QIX', gs(GAME_W / 2), gs(titleY));
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#666';
        ctx.font = `${gs(10)}px monospace`;
        ctx.fillText('YOUR WORLD ARCADE', gs(GAME_W / 2), gs(titleY + 20));

        // Divider
        ctx.strokeStyle = `hsla(${titleHue}, 60%, 40%, 0.3)`;
        ctx.lineWidth = gs(1);
        ctx.beginPath();
        ctx.moveTo(gs(GAME_W / 2 - 80), gs(titleY + 32));
        ctx.lineTo(gs(GAME_W / 2 + 80), gs(titleY + 32));
        ctx.stroke();

        // Instructions
        ctx.font = `${gs(10)}px monospace`;
        ctx.fillStyle = '#888';
        const instructions = [
            'CLAIM TERRITORY BY DRAWING LINES',
            'AVOID THE QIX AND SPARX',
            'CLAIM 75% TO ADVANCE',
            '',
            'ARROWS  MOVE',
            'Z  SLOW DRAW (2x POINTS)',
            'X  FAST DRAW (1x POINTS)',
        ];
        for (let i = 0; i < instructions.length; i++) {
            ctx.fillText(instructions[i], gs(GAME_W / 2), gs(GAME_H * 0.48 + i * 16));
        }

        // Start prompt
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.fillStyle = '#fff';
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = gs(6);
            ctx.font = `bold ${gs(16)}px monospace`;
            ctx.fillText('PRESS SPACE TO START', gs(GAME_W / 2), gs(GAME_H * 0.87));
            ctx.shadowBlur = 0;
        }

        // Vignette
        drawVignette();
    }

    // ── Game Loop ──
    function gameLoop(ts) {
        if (!gameActive) return;
        // Loading screen
        if (!__allSpritesReady) {
            __drawLoadingScreen(canvas, ctx, 'QIX', '#A855F7');
            animFrame = requestAnimationFrame(gameLoop);
            return;
        }
        const dt = Math.min((ts - (lastTime || ts)) / 16.67, 3);
        lastTime = ts;

        if (state === ST_TITLE) {
            frameCount++;
            drawTitle();
        } else {
            update(dt);
            draw();
        }

        animFrame = requestAnimationFrame(gameLoop);
    }

    function startGame() {
        score = 0;
        lives = INITIAL_LIVES;
        level = 1;
        startTime = Date.now();
        levelStartTime = Date.now();
        particles = [];
        scorePopups = [];
        screenShake = 0;
        bonusGems = [];
        bonusGemTimer = 0;
        fuseBombPowerup = null;
        claimAnimations = [];
        fillAnimations = [];

        initGrid();

        px = FIELD_X + FIELD_W / 2;
        py = FIELD_Y + 2;
        drawing = false;
        drawLine = [];
        fuseTimer = 0;

        qixes = [createQix()];
        sparx = [createSparx(true)];

        state = ST_PLAY;
    }

    function endGame() {
        const duration = Math.round((Date.now() - (startTime || Date.now())) / 1000);
        if (gameOverCB) gameOverCB({ score, level, duration, lives });
    }

    // ── Input ──
    function onKeyDown(e) {
        keys[e.key] = true;
        if (state === ST_TITLE && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); startGame(); }
        if (state === ST_GAMEOVER && deathTimer <= 0 && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); endGame(); }
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    }
    function onKeyUp(e) { keys[e.key] = false; }

    // Touch controls
    function onTouchStart(e) {
        e.preventDefault();
        handleTouch(e.touches);
        if (state === ST_TITLE) startGame();
        if (state === ST_GAMEOVER && deathTimer <= 0) endGame();
    }
    function onTouchMove(e) { e.preventDefault(); handleTouch(e.touches); }
    function onTouchEnd(e) {
        e.preventDefault();
        keys = {};
    }
    function handleTouch(touches) {
        keys = {};
        const rect = canvas.getBoundingClientRect();
        for (const t of touches) {
            const tx = (t.clientX - rect.left) / rect.width;
            const ty = (t.clientY - rect.top) / rect.height;
            // D-pad in bottom-left, buttons in bottom-right
            if (ty > 0.6) {
                if (tx < 0.25) keys['ArrowLeft'] = true;
                else if (tx < 0.5 && ty > 0.8) keys['ArrowDown'] = true;
                else if (tx < 0.5 && ty <= 0.8) keys['ArrowUp'] = true;
                else if (tx > 0.75) keys['x'] = true; // fast draw
                else keys['z'] = true; // slow draw
            } else {
                // Top area — directional
                if (tx < 0.3) keys['ArrowLeft'] = true;
                else if (tx > 0.7) keys['ArrowRight'] = true;
                else if (ty < 0.3) keys['ArrowUp'] = true;
                else keys['ArrowDown'] = true;
            }
        }
    }

    // ── Canvas Sizing ──
    function fitCanvas() {
        if (!canvas) return;
        let pw = canvas.width || 480;
        let ph = canvas.height || 480;
        const parent = canvas.parentElement;
        if (parent && parent.clientWidth > 50 && parent.clientHeight > 50) {
            pw = parent.clientWidth;
            ph = parent.clientHeight;
        }
        const aspect = GAME_W / GAME_H;
        let drawW, drawH;
        if (pw / ph > aspect) { drawH = ph; drawW = Math.floor(ph * aspect); }
        else { drawW = pw; drawH = Math.floor(pw / aspect); }
        drawW = Math.max(drawW, 320);
        drawH = Math.max(drawH, 320);
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = drawW * DPR;
        canvas.height = drawH * DPR;
        canvas.style.width = drawW + 'px';
        canvas.style.height = drawH + 'px';
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
    }

    // ── Init / Destroy ──
    function init(cvs, player, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = player;
        gameOverCB = onGameOver;
        gameActive = true;
        playerColor = player?.color || '#06B6D4';

        const themeId = player?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) playerColor = _t.colors[0] || playerColor;

        playerColorRGB = hexToRGB(playerColor);

        state = ST_TITLE;
        frameCount = 0;
        lastTime = 0;
        keys = {};
        particles = [];
        scorePopups = [];
        screenShake = 0;
        bonusGems = [];
        bonusGemTimer = 0;
        fuseBombPowerup = null;
        claimAnimations = [];
        fillAnimations = [];

        W = canvas.width || 480;
        H = canvas.height || 480;
        SCALE = W / GAME_W;
        DPR = Math.min(window.devicePixelRatio || 1, 3);

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        window.addEventListener('resize', fitCanvas);

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        __loadSprites(null);
        animFrame = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        if (canvas) {
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        window.removeEventListener('resize', fitCanvas);
        keys = {};
        particles = [];
        scorePopups = [];
        grid = null;
    }

    return { init, destroy };
})();
