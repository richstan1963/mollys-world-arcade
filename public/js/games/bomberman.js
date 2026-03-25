/* YWA Bomberman — Classic maze bomber with power-ups, chain explosions & cute sprites */
window.Bomberman = (() => {

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
    const GAME_W = 480, GAME_H = 448;
    const COLS = 15, ROWS = 13;
    const TILE = 32;
    const HUD_H = GAME_H - ROWS * TILE; // 32px HUD at bottom
    const BOMB_TIMER = 2000;
    const ANIM_RATE = 150; // ms per walk frame
    const INVULN_MS = 2000;
    const DOOR_FLASH_MS = 400;

    // Power-up types
    const PW_BOMB = 0, PW_FIRE = 1, PW_SPEED = 2, PW_WALLPASS = 3, PW_BOMBPASS = 4;
    const PW_REMOTE = 5, PW_KICK = 6, PW_SKULL = 7;
    const PW_NAMES = ['Bomb', 'Fire', 'Speed', 'WallPass', 'BombPass', 'Remote', 'Kick', 'Skull'];
    const PW_COLORS = ['#3B82F6', '#EF4444', '#22C55E', '#A855F7', '#F59E0B', '#EC4899', '#14B8A6', '#6B7280'];

    // Enemy types
    const EN_BALLOOM = 0, EN_ONEAL = 1, EN_DORIA = 2;

    // States
    const ST_LOADING = -1, ST_TITLE = 0, ST_PLAY = 1, ST_DYING = 2, ST_GAMEOVER = 3, ST_WIN = 4, ST_CLEAR = 5;
    const LS_KEY = 'ywa_bomberman_hiscore';
    let hiScore = 0;

    // ── Sprite Atlas (Kenney Platform CC0) ──
    const SPRITE_BASE = '/img/game-assets/kenney-platform';
    const sprites = {};
    let spritesLoaded = 0, spritesTotal = 0, allSpritesReady = false;

    const SPRITE_MANIFEST = {
        // Player (Bomberman character)
        playerStand:  `${SPRITE_BASE}/players/Beige/alienBeige_stand.png`,
        playerWalk1:  `${SPRITE_BASE}/players/Beige/alienBeige_walk1.png`,
        playerWalk2:  `${SPRITE_BASE}/players/Beige/alienBeige_walk2.png`,
        playerFront:  `${SPRITE_BASE}/players/Beige/alienBeige_front.png`,
        playerHit:    `${SPRITE_BASE}/players/Beige/alienBeige_hit.png`,
        playerDuck:   `${SPRITE_BASE}/players/Beige/alienBeige_duck.png`,
        // Walls (hard = stone, soft = brick)
        stoneMid:     `${SPRITE_BASE}/ground/Stone/stoneMid.png`,
        stoneCenter:  `${SPRITE_BASE}/ground/Stone/stoneCenter.png`,
        brickBrown:   `${SPRITE_BASE}/tiles/brickBrown.png`,
        brickGrey:    `${SPRITE_BASE}/tiles/brickGrey.png`,
        // Enemies
        enemySlime:   `${SPRITE_BASE}/enemies/slimeBlue.png`,
        enemySlimeM:  `${SPRITE_BASE}/enemies/slimeBlue_move.png`,
        enemySlimeP:  `${SPRITE_BASE}/enemies/slimePurple.png`,
        enemySlimePM: `${SPRITE_BASE}/enemies/slimePurple_move.png`,
        enemyFrog:    `${SPRITE_BASE}/enemies/frog.png`,
        enemyFrogM:   `${SPRITE_BASE}/enemies/frog_move.png`,
        // Bombs and explosions
        bomb:         `${SPRITE_BASE}/tiles/bomb.png`,
        bombWhite:    `${SPRITE_BASE}/tiles/bombWhite.png`,
        fireball:     `${SPRITE_BASE}/particles/fireball.png`,
        // Items / Power-ups
        coinGold:     `${SPRITE_BASE}/items/coinGold.png`,
        gemBlue:      `${SPRITE_BASE}/items/gemBlue.png`,
        gemRed:       `${SPRITE_BASE}/items/gemRed.png`,
        gemGreen:     `${SPRITE_BASE}/items/gemGreen.png`,
        gemYellow:    `${SPRITE_BASE}/items/gemYellow.png`,
        star:         `${SPRITE_BASE}/items/star.png`,
        keyBlue:      `${SPRITE_BASE}/items/keyBlue.png`,
        keyRed:       `${SPRITE_BASE}/items/keyRed.png`,
        // Ground
        grassMid:     `${SPRITE_BASE}/ground/Grass/grassMid.png`,
        sandMid:      `${SPRITE_BASE}/ground/Sand/sandMid.png`,
        // Tiles
        doorClosed:   `${SPRITE_BASE}/tiles/doorClosed_mid.png`,
        spikes:       `${SPRITE_BASE}/tiles/spikes.png`,
        // HUD
        hudHeart:     `${SPRITE_BASE}/hud/hudHeart_full.png`,
    };

    function loadSprites(onProgress, onDone) {
        const keys = Object.keys(SPRITE_MANIFEST);
        spritesTotal = keys.length;
        spritesLoaded = 0;
        let done = 0;
        keys.forEach(key => {
            const img = new Image();
            img.onload = () => {
                sprites[key] = img;
                done++; spritesLoaded = done;
                if (onProgress) onProgress(done, spritesTotal);
                if (done === spritesTotal) { allSpritesReady = true; if (onDone) onDone(); }
            };
            img.onerror = () => {
                sprites[key] = null;
                done++; spritesLoaded = done;
                if (onProgress) onProgress(done, spritesTotal);
                if (done === spritesTotal) { allSpritesReady = true; if (onDone) onDone(); }
            };
            img.src = SPRITE_MANIFEST[key];
        });
    }

    function drawLoading() {
        ctx.fillStyle = '#0A0A12';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#3B82F6';
        ctx.shadowColor = '#3B82F6'; ctx.shadowBlur = gs(10);
        ctx.font = `bold ${gs(32)}px monospace`;
        ctx.fillText('BOMBERMAN', gs(GAME_W / 2), gs(GAME_H / 2 - 50));
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#E0E7FF'; ctx.font = `${gs(13)}px monospace`;
        ctx.fillText('LOADING SPRITES...', gs(GAME_W / 2), gs(GAME_H / 2));
        const barW = 200, barH = 8;
        const pct = spritesTotal > 0 ? spritesLoaded / spritesTotal : 0;
        ctx.fillStyle = '#333';
        ctx.fillRect(gs(GAME_W / 2 - barW / 2), gs(GAME_H / 2 + 20), gs(barW), gs(barH));
        ctx.fillStyle = '#3B82F6';
        ctx.fillRect(gs(GAME_W / 2 - barW / 2), gs(GAME_H / 2 + 20), gs(barW * pct), gs(barH));
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `${gs(10)}px monospace`;
        ctx.fillText(`${spritesLoaded} / ${spritesTotal}`, gs(GAME_W / 2), gs(GAME_H / 2 + 45));
    }

    // ── Mutable State ──
    let canvas, ctx, W, H, SCALE, DPR, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor, playerTheme;
    let state, frameCount, lastTime, keys = {};
    let score, lives, level;
    let player, bombs, explosions, enemies, particles, powerups, scorePopups;
    let grid; // 0=floor, 1=hard, 2=soft, 3=door(hidden), 4=door(revealed)
    let maxBombs, fireRange, speedMult, hasWallPass, hasBombPass;
    let hasRemote, hasKick, skullTimer, skullEffect; // new power-ups
    let victoryDanceTimer; // victory dance on level clear
    let screenShake, invulnTimer, deathTimer, clearTimer;
    let touchDir, touchBomb;

    // ── Audio ──
    let audioCtx;
    function getAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
    function playSound(freq, dur, type = 'square', vol = 0.12) {
        try {
            const a = getAudio(), o = a.createOscillator(), g = a.createGain();
            o.type = type; o.frequency.value = freq;
            g.gain.setValueAtTime(vol, a.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
            o.connect(g); g.connect(a.destination);
            o.start(); o.stop(a.currentTime + dur);
        } catch {}
    }
    function sfxBomb() { playSound(120, 0.4, 'sawtooth', 0.18); playSound(60, 0.5, 'sine', 0.15); }
    function sfxPlace() { playSound(300, 0.08, 'triangle', 0.08); }
    function sfxPowerup() { playSound(880, 0.1, 'sine', 0.15); setTimeout(() => playSound(1100, 0.12, 'sine', 0.15), 80); }
    function sfxDeath() { playSound(200, 0.3, 'sawtooth', 0.15); playSound(100, 0.5, 'sawtooth', 0.1); }
    function sfxKill() { playSound(600, 0.15, 'square', 0.1); }
    function sfxDoor() { playSound(440, 0.15, 'sine', 0.12); setTimeout(() => playSound(660, 0.15, 'sine', 0.12), 120); setTimeout(() => playSound(880, 0.2, 'sine', 0.15), 240); }
    function sfxClear() { [0,100,200,300].forEach((d,i) => setTimeout(() => playSound(440+i*220, 0.2, 'sine', 0.12), d)); }
    function sfxSkull() { playSound(150, 0.3, 'sawtooth', 0.12); playSound(90, 0.4, 'square', 0.08); }
    function sfxKick() { playSound(400, 0.1, 'triangle', 0.1); playSound(200, 0.15, 'triangle', 0.08); }
    function sfxRemote() { playSound(700, 0.08, 'sine', 0.1); playSound(900, 0.1, 'sine', 0.1); }

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

    // ── Helpers ──
    const gs = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const tileAt = (px, py) => { const c = Math.floor(px / TILE), r = Math.floor(py / TILE); return (c >= 0 && c < COLS && r >= 0 && r < ROWS) ? grid[r][c] : 1; };
    const setTile = (c, r, v) => { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) grid[r][c] = v; };

    function bombAt(c, r) { return bombs.some(b => b.col === c && b.row === r); }

    // ── Grid Generation ──
    function generateGrid() {
        grid = [];
        for (let r = 0; r < ROWS; r++) {
            grid[r] = [];
            for (let c = 0; c < COLS; c++) {
                if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) grid[r][c] = 1; // border walls
                else if (r % 2 === 0 && c % 2 === 0) grid[r][c] = 1; // checkerboard hard
                else grid[r][c] = 0;
            }
        }
        // Place soft blocks (~40-55%)
        const softChance = Math.min(0.55, 0.40 + level * 0.02);
        for (let r = 1; r < ROWS - 1; r++) {
            for (let c = 1; c < COLS - 1; c++) {
                if (grid[r][c] !== 0) continue;
                // Keep spawn area clear (top-left)
                if ((r <= 2 && c <= 2)) continue;
                if (Math.random() < softChance) grid[r][c] = 2;
            }
        }
        // Place hidden door under a random soft block
        const softCells = [];
        for (let r = 1; r < ROWS - 1; r++)
            for (let c = 1; c < COLS - 1; c++)
                if (grid[r][c] === 2 && !(r <= 2 && c <= 2)) softCells.push([r, c]);
        if (softCells.length > 0) {
            const [dr, dc] = softCells[Math.floor(Math.random() * softCells.length)];
            grid[dr][dc] = 3; // hidden door
        }
        // Place power-ups hidden in soft blocks
        const pwCount = Math.max(2, 5 - Math.floor(level / 3));
        const available = softCells.filter(([r, c]) => grid[r][c] === 2);
        for (let i = 0; i < pwCount && available.length > 0; i++) {
            const idx = Math.floor(Math.random() * available.length);
            const [pr, pc] = available.splice(idx, 1)[0];
            const type = (i === 0) ? PW_BOMB : (i === 1) ? PW_FIRE : Math.floor(Math.random() * 8);
            powerups.push({ col: pc, row: pr, type, revealed: false });
        }
    }

    // ── Spawn Enemies ──
    function spawnEnemies() {
        enemies = [];
        const base = 3 + level * 2;
        const count = Math.min(base, 12);
        const freeCells = [];
        for (let r = 1; r < ROWS - 1; r++)
            for (let c = 1; c < COLS - 1; c++)
                if (grid[r][c] === 0 && !(r <= 2 && c <= 2)) freeCells.push([r, c]);
        for (let i = 0; i < count && freeCells.length > 0; i++) {
            const idx = Math.floor(Math.random() * freeCells.length);
            const [er, ec] = freeCells.splice(idx, 1)[0];
            let type = EN_BALLOOM;
            if (level >= 3 && Math.random() < 0.3 + level * 0.05) type = EN_ONEAL;
            if (level >= 5 && Math.random() < 0.15 + level * 0.03) type = EN_DORIA;
            enemies.push({
                x: ec * TILE + TILE / 2, y: er * TILE + TILE / 2,
                type, dir: Math.floor(Math.random() * 4),
                speed: type === EN_BALLOOM ? 0.6 : type === EN_ONEAL ? 1.0 : 1.4,
                moveTimer: 0, changeDirTimer: rng(500, 2000),
                animFrame: 0, animTimer: 0, alive: true, deathTimer: 0
            });
        }
    }

    // ── Reset Level ──
    function resetLevel() {
        bombs = []; explosions = []; particles = []; scorePopups = []; powerups = [];
        screenShake = 0; invulnTimer = 0; clearTimer = 0; victoryDanceTimer = 0;
        player = {
            x: 1.5 * TILE, y: 1.5 * TILE,
            dir: 2, // 0=up,1=right,2=down,3=left
            animFrame: 0, animTimer: 0, moving: false
        };
        generateGrid();
        spawnEnemies();
    }

    function startGame() {
        score = 0; lives = 3; level = 1;
        maxBombs = 1; fireRange = 1; speedMult = 1.0;
        hasWallPass = false; hasBombPass = false;
        hasRemote = false; hasKick = false; skullTimer = 0; skullEffect = null;
        resetLevel();
        state = ST_PLAY;
    }

    // ── Bomb & Explosion Logic ──
    function placeBomb() {
        const pc = Math.floor(player.x / TILE), pr = Math.floor(player.y / TILE);
        const activeBombs = bombs.filter(b => b.active).length;
        // Remote detonation: if we have remote and there are active bombs, detonate them
        if (hasRemote && activeBombs > 0 && bombAt(pc, pr)) {
            const remoteBombs = bombs.filter(b => b.active && b.remote);
            if (remoteBombs.length > 0) {
                remoteBombs.forEach(b => { b.timer = 0; });
                sfxRemote();
                return;
            }
        }
        if (activeBombs >= maxBombs) {
            // Remote detonation: pressing bomb again detonates all remote bombs
            if (hasRemote) {
                const remoteBombs = bombs.filter(b => b.active && b.remote);
                if (remoteBombs.length > 0) { remoteBombs.forEach(b => { b.timer = 0; }); sfxRemote(); }
            }
            return;
        }
        if (bombAt(pc, pr)) return;
        bombs.push({ col: pc, row: pr, timer: hasRemote ? 999999 : BOMB_TIMER, active: true, range: fireRange, owner: true, remote: hasRemote, sliding: false, slideDir: -1, slideSpeed: 0 });
        sfxPlace();
    }

    function detonateBomb(bomb) {
        bomb.active = false;
        sfxBomb();
        screenShake = 8;
        const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
        // Center explosion
        explosions.push({ col: bomb.col, row: bomb.row, timer: 500, center: true });
        spawnExplosionParticles(bomb.col * TILE + TILE / 2, bomb.row * TILE + TILE / 2);
        for (const [dc, dr] of dirs) {
            for (let i = 1; i <= bomb.range; i++) {
                const nc = bomb.col + dc * i, nr = bomb.row + dr * i;
                if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) break;
                const tile = grid[nr][nc];
                if (tile === 1) break; // hard wall stops
                explosions.push({ col: nc, row: nr, timer: 500, tip: i === bomb.range, center: false });
                spawnExplosionParticles(nc * TILE + TILE / 2, nr * TILE + TILE / 2);
                // Chain detonate other bombs
                const chainBomb = bombs.find(b => b.active && b.col === nc && b.row === nr);
                if (chainBomb) { chainBomb.timer = 0; }
                if (tile === 2 || tile === 3) {
                    // Destroy soft block / reveal door
                    if (tile === 3) { setTile(nc, nr, 4); sfxDoor(); } // reveal door
                    else setTile(nc, nr, 0);
                    // Reveal power-up
                    const pw = powerups.find(p => p.col === nc && p.row === nr && !p.revealed);
                    if (pw) pw.revealed = true;
                    // Crumbling debris particles — bricks and dust
                    const brickColors = tile === 3 ? ['#A855F7', '#C084FC', '#7C3AED'] : ['#C2956A', '#A0784A', '#8B6040', '#D4A574'];
                    for (let j = 0; j < 14; j++) {
                        const isChunk = j < 6;
                        particles.push({
                            x: nc * TILE + rng(4, TILE - 4), y: nr * TILE + rng(4, TILE - 4),
                            vx: rng(-3, 3), vy: rng(-4, -0.5),
                            life: rng(400, 900), maxLife: 900,
                            color: brickColors[Math.floor(Math.random() * brickColors.length)],
                            size: isChunk ? rng(3, 7) : rng(1, 3),
                            gravity: isChunk ? 0.08 : 0.03,
                            rotate: rng(0, 6.28), rotateSpd: rng(-0.1, 0.1),
                            debris: true
                        });
                    }
                    break; // blast stops at soft block
                }
            }
        }
    }

    function spawnExplosionParticles(x, y) {
        for (let i = 0; i < 4; i++) {
            particles.push({
                x, y, vx: rng(-1.5, 1.5), vy: rng(-2, 0.5),
                life: rng(200, 400), maxLife: 400,
                color: Math.random() < 0.5 ? '#FBBF24' : '#F97316', size: rng(1.5, 4), gravity: 0.04
            });
        }
    }

    function isExplosionAt(c, r) { return explosions.some(e => e.col === c && e.row === r); }

    // ── Movement Helpers ──
    const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

    function canMove(x, y) {
        const margin = 4;
        const corners = [
            [x - TILE / 2 + margin, y - TILE / 2 + margin],
            [x + TILE / 2 - margin, y - TILE / 2 + margin],
            [x - TILE / 2 + margin, y + TILE / 2 - margin],
            [x + TILE / 2 - margin, y + TILE / 2 - margin]
        ];
        for (const [cx, cy] of corners) {
            const t = tileAt(cx, cy);
            if (t === 1) return false;
            if (t === 2 || t === 3) { if (!hasWallPass) return false; }
            if (!hasBombPass) {
                const gc = Math.floor(cx / TILE), gr = Math.floor(cy / TILE);
                const pCol = Math.floor(player.x / TILE), pRow = Math.floor(player.y / TILE);
                if (bombAt(gc, gr) && !(gc === pCol && gr === pRow)) return false;
            }
        }
        return true;
    }

    function canEnemyMove(x, y, type) {
        const margin = 5;
        const corners = [
            [x - TILE / 2 + margin, y - TILE / 2 + margin],
            [x + TILE / 2 - margin, y - TILE / 2 + margin],
            [x - TILE / 2 + margin, y + TILE / 2 - margin],
            [x + TILE / 2 - margin, y + TILE / 2 - margin]
        ];
        for (const [cx, cy] of corners) {
            const t = tileAt(cx, cy);
            if (t === 1) return false;
            if ((t === 2 || t === 3) && type !== EN_DORIA) return false;
            const gc = Math.floor(cx / TILE), gr = Math.floor(cy / TILE);
            if (bombAt(gc, gr)) return false;
        }
        return true;
    }

    // ── Update ──
    function update(dt) {
        frameCount++;
        if (state === ST_PLAY) updatePlay(dt);
        else if (state === ST_DYING) { deathTimer -= dt; if (deathTimer <= 0) { if (lives <= 0) { state = ST_GAMEOVER; if (score > hiScore) { hiScore = score; try { localStorage.setItem(LS_KEY, hiScore); } catch {} } } else { resetLevel(); state = ST_PLAY; invulnTimer = INVULN_MS; } } }
        else if (state === ST_CLEAR) { clearTimer -= dt; victoryDanceTimer += dt; if (clearTimer <= 0) { level++; resetLevel(); state = ST_PLAY; } }
        // Particles always update
        updateParticles(dt);
        scorePopups = scorePopups.filter(p => { p.y -= 0.5; p.life -= dt; return p.life > 0; });
        if (screenShake > 0) screenShake *= 0.88;
        if (screenShake < 0.3) screenShake = 0;
    }

    function updatePlay(dt) {
        // ── Skull curse timer ──
        if (skullTimer > 0) {
            skullTimer -= dt;
            if (skullTimer <= 0) { skullEffect = null; }
        }

        // ── Player movement ──
        let dx = 0, dy = 0;
        if (keys['ArrowUp'] || keys['KeyW'] || touchDir === 0) dy = -1;
        if (keys['ArrowDown'] || keys['KeyS'] || touchDir === 2) dy = 1;
        if (keys['ArrowLeft'] || keys['KeyA'] || touchDir === 3) dx = -1;
        if (keys['ArrowRight'] || keys['KeyD'] || touchDir === 1) dx = 1;
        if (dx !== 0 && dy !== 0) { dy = 0; } // no diagonal

        // Skull curse: inverted controls
        if (skullEffect === 'invert') { dx = -dx; dy = -dy; }

        const spd = 2.0 * speedMult;
        player.moving = dx !== 0 || dy !== 0;
        if (player.moving) {
            if (dx !== 0) player.dir = dx > 0 ? 1 : 3;
            else player.dir = dy > 0 ? 2 : 0;
            const nx = player.x + dx * spd, ny = player.y + dy * spd;
            // Try full move, then slide
            if (canMove(nx, ny)) { player.x = nx; player.y = ny; }
            else if (dx !== 0 && canMove(nx, player.y)) { player.x = nx; }
            else if (dy !== 0 && canMove(player.x, ny)) { player.y = ny; }
            // Snap to grid center for smooth cornering
            if (dx !== 0) {
                const centerY = Math.floor(player.y / TILE) * TILE + TILE / 2;
                player.y = lerp(player.y, centerY, 0.25);
            }
            if (dy !== 0) {
                const centerX = Math.floor(player.x / TILE) * TILE + TILE / 2;
                player.x = lerp(player.x, centerX, 0.25);
            }
            player.animTimer += dt;
            if (player.animTimer >= ANIM_RATE) { player.animTimer = 0; player.animFrame = (player.animFrame + 1) % 4; }
        } else {
            player.animFrame = 0; player.animTimer = 0;
        }

        // Skull curse: uncontrollable bomb dropping
        if (skullEffect === 'bombs' && Math.random() < 0.03) { placeBomb(); }

        // Place bomb
        if (keys['Space'] || touchBomb) {
            placeBomb();
            keys['Space'] = false;
            touchBomb = false;
        }

        // ── Kick bomb: walk into bomb to kick it ──
        if (hasKick) {
            const pc2 = Math.floor(player.x / TILE), pr2 = Math.floor(player.y / TILE);
            const kickDir = player.dir;
            const kickDC = DX[kickDir], kickDR = DY[kickDir];
            const kickCol = pc2 + kickDC, kickRow = pr2 + kickDR;
            for (const b of bombs) {
                if (!b.active || b.sliding) continue;
                if (b.col === kickCol && b.row === kickRow && player.moving) {
                    b.sliding = true; b.slideDir = kickDir; b.slideSpeed = 4;
                    b.slideX = b.col * TILE + TILE / 2; b.slideY = b.row * TILE + TILE / 2;
                    sfxKick();
                }
            }
        }

        // ── Bombs ──
        for (const b of bombs) {
            if (!b.active) continue;
            // Sliding bombs
            if (b.sliding) {
                const sdx = DX[b.slideDir] * b.slideSpeed;
                const sdy = DY[b.slideDir] * b.slideSpeed;
                const nx = b.slideX + sdx, ny = b.slideY + sdy;
                const nc = Math.floor(nx / TILE), nr = Math.floor(ny / TILE);
                if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS || grid[nr][nc] === 1 || grid[nr][nc] === 2 || grid[nr][nc] === 3 || (bombAt(nc, nr) && !(b.col === nc && b.row === nr))) {
                    // Stop sliding
                    b.sliding = false;
                    b.col = Math.floor(b.slideX / TILE); b.row = Math.floor(b.slideY / TILE);
                } else {
                    b.slideX = nx; b.slideY = ny;
                    b.col = Math.floor(nx / TILE); b.row = Math.floor(ny / TILE);
                }
            }
            b.timer -= dt;
            if (b.timer <= 0) detonateBomb(b);
        }
        bombs = bombs.filter(b => b.active || false);

        // ── Explosions ──
        for (const e of explosions) e.timer -= dt;
        explosions = explosions.filter(e => e.timer > 0);

        // ── Invulnerability ──
        if (invulnTimer > 0) invulnTimer -= dt;

        // ── Player vs explosion ──
        if (invulnTimer <= 0) {
            const pc = Math.floor(player.x / TILE), pr = Math.floor(player.y / TILE);
            if (isExplosionAt(pc, pr)) { killPlayer(); return; }
        }

        // ── Power-up pickup ──
        const pc = Math.floor(player.x / TILE), pr = Math.floor(player.y / TILE);
        for (let i = powerups.length - 1; i >= 0; i--) {
            const pw = powerups[i];
            if (!pw.revealed) continue;
            if (pw.col === pc && pw.row === pr) {
                applyPowerup(pw.type);
                scorePopups.push({ x: pw.col * TILE + TILE / 2, y: pw.row * TILE, text: PW_NAMES[pw.type], life: 800, color: PW_COLORS[pw.type] });
                powerups.splice(i, 1);
                sfxPowerup();
            }
        }

        // ── Door check ──
        if (grid[pr][pc] === 4 && enemies.filter(e => e.alive).length === 0) {
            state = ST_CLEAR;
            clearTimer = 1500;
            score += 1000 * level;
            sfxClear();
            scorePopups.push({ x: player.x, y: player.y - 20, text: `Level ${level} Clear!`, life: 1400, color: '#22C55E' });
        }

        // ── Enemies ──
        updateEnemies(dt);

        // ── Player vs enemy ──
        if (invulnTimer <= 0) {
            for (const e of enemies) {
                if (!e.alive) continue;
                const dx = player.x - e.x, dy = player.y - e.y;
                if (Math.abs(dx) < TILE * 0.7 && Math.abs(dy) < TILE * 0.7) { killPlayer(); return; }
            }
        }

        // ── Enemy vs explosion ──
        for (const e of enemies) {
            if (!e.alive) continue;
            const ec = Math.floor(e.x / TILE), er = Math.floor(e.y / TILE);
            if (isExplosionAt(ec, er)) {
                e.alive = false;
                e.deathTimer = 400;
                const pts = (e.type + 1) * 100;
                score += pts;
                sfxKill();
                scorePopups.push({ x: e.x, y: e.y - 10, text: `+${pts}`, life: 700, color: '#FBBF24' });
                for (let j = 0; j < 8; j++) {
                    particles.push({
                        x: e.x, y: e.y, vx: rng(-2, 2), vy: rng(-3, 0),
                        life: rng(300, 500), maxLife: 500,
                        color: e.type === 0 ? '#F87171' : e.type === 1 ? '#60A5FA' : '#A78BFA',
                        size: rng(2, 5), gravity: 0.05
                    });
                }
            }
        }
        enemies = enemies.filter(e => e.alive || e.deathTimer > 0);
        for (const e of enemies) { if (!e.alive) e.deathTimer -= dt; }
    }

    function killPlayer() {
        lives--;
        state = ST_DYING;
        deathTimer = 1500;
        sfxDeath();
        screenShake = 10;
        for (let i = 0; i < 15; i++) {
            particles.push({
                x: player.x, y: player.y, vx: rng(-3, 3), vy: rng(-4, 1),
                life: rng(400, 800), maxLife: 800,
                color: Math.random() < 0.5 ? playerColor : '#FFF', size: rng(2, 6), gravity: 0.05
            });
        }
    }

    function applyPowerup(type) {
        if (type === PW_BOMB) maxBombs = Math.min(maxBombs + 1, 8);
        else if (type === PW_FIRE) fireRange = Math.min(fireRange + 1, 7);
        else if (type === PW_SPEED) speedMult = Math.min(speedMult + 0.2, 2.0);
        else if (type === PW_WALLPASS) hasWallPass = true;
        else if (type === PW_BOMBPASS) hasBombPass = true;
        else if (type === PW_REMOTE) hasRemote = true;
        else if (type === PW_KICK) hasKick = true;
        else if (type === PW_SKULL) {
            sfxSkull();
            skullTimer = 5000;
            skullEffect = Math.random() < 0.5 ? 'invert' : 'bombs';
        }
    }

    // ── Enemy AI ──
    function nearestBombDist(ex, ey) {
        let minD = Infinity, bx = 0, by = 0;
        for (const b of bombs) {
            if (!b.active) continue;
            const dx = (b.col + 0.5) * TILE - ex, dy = (b.row + 0.5) * TILE - ey;
            const d = Math.abs(dx) + Math.abs(dy);
            if (d < minD) { minD = d; bx = b.col * TILE + TILE / 2; by = b.row * TILE + TILE / 2; }
        }
        return { dist: minD, bx, by };
    }

    function updateEnemies(dt) {
        for (const e of enemies) {
            if (!e.alive) continue;
            e.animTimer += dt;
            if (e.animTimer >= 200) { e.animTimer = 0; e.animFrame = (e.animFrame + 1) % 2; }

            e.changeDirTimer -= dt;
            if (e.changeDirTimer <= 0) {
                e.changeDirTimer = e.type === EN_ONEAL ? rng(400, 1200) : rng(800, 2500);

                // Fleeing behavior: enemies flee from nearby lit bombs
                const bomb = nearestBombDist(e.x, e.y);
                if (bomb.dist < TILE * 3.5) {
                    // Flee away from bomb
                    const fdx = e.x - bomb.bx, fdy = e.y - bomb.by;
                    if (Math.abs(fdx) > Math.abs(fdy)) e.dir = fdx > 0 ? 1 : 3;
                    else e.dir = fdy > 0 ? 2 : 0;
                    e.changeDirTimer = rng(150, 400); // react quickly
                } else if (e.type === EN_ONEAL && Math.random() < 0.6) {
                    // Chase player
                    const adx = player.x - e.x, ady = player.y - e.y;
                    if (Math.abs(adx) > Math.abs(ady)) e.dir = adx > 0 ? 1 : 3;
                    else e.dir = ady > 0 ? 2 : 0;
                } else {
                    e.dir = Math.floor(Math.random() * 4);
                }
            }

            const nx = e.x + DX[e.dir] * e.speed, ny = e.y + DY[e.dir] * e.speed;
            if (canEnemyMove(nx, ny, e.type)) {
                e.x = nx; e.y = ny;
                // Snap to grid lane
                if (DX[e.dir] !== 0) e.y = lerp(e.y, Math.floor(e.y / TILE) * TILE + TILE / 2, 0.15);
                if (DY[e.dir] !== 0) e.x = lerp(e.x, Math.floor(e.x / TILE) * TILE + TILE / 2, 0.15);
            } else {
                e.changeDirTimer = 0; // pick new dir next frame
            }
        }
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy; p.vy += (p.gravity || 0);
            if (p.rotateSpd) p.rotate = (p.rotate || 0) + p.rotateSpd;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    // ── Drawing ──
    function draw() {
        ctx.save();
        const shake = screenShake > 0.5 ? screenShake : 0;
        ctx.translate(rng(-shake, shake) * SCALE, rng(-shake, shake) * SCALE);

        drawFloor();
        drawGrid();
        drawPowerups();
        drawBombs();
        drawExplosions();
        drawEnemies();
        if (state !== ST_DYING) drawPlayer();
        drawParticles();
        drawScorePopups();
        drawHUD();
        drawVignette();

        ctx.restore();

        if (state === ST_TITLE) drawTitle();
        else if (state === ST_GAMEOVER) drawGameOver();
        else if (state === ST_CLEAR) drawLevelClear();
        else if (state === ST_DYING) drawDeathOverlay();
        if (state === ST_PLAY) drawOnScreenControls(ctx, W, H, gs, ['BOMB'], 'LRUD');
    }

    function drawFloor() {
        ctx.fillStyle = '#2D2D1F';
        ctx.fillRect(0, 0, W, ROWS * TILE * SCALE);
        // Subtle tile pattern
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c] === 0 || grid[r][c] === 4) {
                    const x = c * TILE * SCALE, y = r * TILE * SCALE, s = TILE * SCALE;
                    ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
                }
            }
        }
    }

    function drawGrid() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const x = c * TILE * SCALE, y = r * TILE * SCALE, s = TILE * SCALE;
                const t = grid[r][c];
                if (t === 1) drawHardBlock(x, y, s);
                else if (t === 2 || t === 3) drawSoftBlock(x, y, s);
                else if (t === 4) drawDoor(x, y, s);
            }
        }
    }

    function drawHardBlock(x, y, s) {
        // Try sprite
        if (allSpritesReady && sprites['stoneCenter']) {
            ctx.drawImage(sprites['stoneCenter'], x, y, s, s);
            return;
        }
        // Dark stone with rivets fallback
        const grad = ctx.createLinearGradient(x, y, x, y + s);
        grad.addColorStop(0, '#4A4A5A');
        grad.addColorStop(0.5, '#3A3A48');
        grad.addColorStop(1, '#2A2A36');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, s, s);
        ctx.strokeStyle = '#1A1A24';
        ctx.lineWidth = gs(1);
        ctx.strokeRect(x + gs(1), y + gs(1), s - gs(2), s - gs(2));
        // Rivets
        ctx.fillStyle = '#5A5A6A';
        const rs = gs(3);
        ctx.beginPath(); ctx.arc(x + gs(5), y + gs(5), rs, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + s - gs(5), y + gs(5), rs, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + gs(5), y + s - gs(5), rs, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + s - gs(5), y + s - gs(5), rs, 0, Math.PI * 2); ctx.fill();
        // Highlight edge
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x, y, s, gs(2));
    }

    function drawSoftBlock(x, y, s) {
        // Try sprite
        if (allSpritesReady && sprites['brickBrown']) {
            ctx.drawImage(sprites['brickBrown'], x, y, s, s);
            return;
        }
        // Brick texture fallback
        ctx.fillStyle = '#B8845A';
        ctx.fillRect(x, y, s, s);
        ctx.strokeStyle = '#8B6040';
        ctx.lineWidth = gs(1);
        // Brick lines
        const h = s / 4;
        for (let i = 0; i < 4; i++) {
            const by = y + i * h;
            ctx.strokeRect(x + gs(1), by + gs(0.5), s - gs(2), h - gs(1));
            // Offset every other row
            if (i % 2 === 1) {
                ctx.beginPath();
                ctx.moveTo(x + s / 2, by);
                ctx.lineTo(x + s / 2, by + h);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.moveTo(x + s * 0.25, by);
                ctx.lineTo(x + s * 0.25, by + h);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x + s * 0.75, by);
                ctx.lineTo(x + s * 0.75, by + h);
                ctx.stroke();
            }
        }
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(x, y + s - gs(3), s, gs(3));
    }

    function drawDoor(x, y, s) {
        // Revealed exit door
        const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.08);
        ctx.fillStyle = '#1A1A24';
        ctx.fillRect(x, y, s, s);
        // Door shape
        const pad = gs(4);
        ctx.fillStyle = `rgba(168,85,247,${0.4 + pulse * 0.4})`;
        ctx.beginPath();
        ctx.roundRect(x + pad, y + pad, s - pad * 2, s - pad * 2, gs(4));
        ctx.fill();
        // Glow
        ctx.shadowColor = '#A855F7';
        ctx.shadowBlur = gs(8) * pulse;
        ctx.fillStyle = '#C084FC';
        ctx.beginPath();
        ctx.roundRect(x + pad + gs(3), y + pad + gs(3), s - pad * 2 - gs(6), s - pad * 2 - gs(6), gs(3));
        ctx.fill();
        ctx.shadowBlur = 0;
        // Door handle
        ctx.fillStyle = '#FDE68A';
        ctx.beginPath();
        ctx.arc(x + s * 0.65, y + s * 0.5, gs(2.5), 0, Math.PI * 2);
        ctx.fill();
    }

    function drawPlayer() {
        const px = player.x * SCALE, py = player.y * SCALE;
        const s = TILE * SCALE;
        const half = s / 2;
        const flash = invulnTimer > 0 && Math.floor(invulnTimer / 100) % 2;

        // Try sprite player
        if (allSpritesReady && !flash) {
            const moving = player.dir !== -1;
            let sprKey;
            if (state === ST_DYING) sprKey = 'playerHit';
            else if (moving) sprKey = (Math.floor(frameCount / 8) % 2 === 0) ? 'playerWalk1' : 'playerWalk2';
            else sprKey = 'playerFront';
            const spr = sprites[sprKey];
            if (spr) {
                const flipX = player.dir === 3; // left
                ctx.save();
                if (flipX) {
                    ctx.translate(px + s, py);
                    ctx.scale(-1, 1);
                    ctx.drawImage(spr, s * 0.1, -s * 0.15, s * 0.8, s * 0.95);
                } else {
                    ctx.drawImage(spr, px + s * 0.1, py - s * 0.15, s * 0.8, s * 0.95);
                }
                ctx.restore();
                return;
            }
        }
        if (flash) { ctx.globalAlpha = 0.4; }

        // Skull curse visual indicator
        if (skullTimer > 0) {
            ctx.save();
            ctx.translate(px, py);
            ctx.globalAlpha = 0.3 + 0.2 * Math.sin(frameCount * 0.2);
            ctx.fillStyle = '#6B7280';
            ctx.beginPath();
            ctx.arc(0, 0, half * 0.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        ctx.save();
        ctx.translate(px, py);

        // Victory dance: bounce and spin on level clear
        if (state === ST_CLEAR && victoryDanceTimer > 0) {
            const dancePhase = victoryDanceTimer * 0.008;
            const bounce = Math.abs(Math.sin(dancePhase * 3)) * gs(6);
            const wiggle = Math.sin(dancePhase * 5) * 0.2;
            ctx.translate(0, -bounce);
            ctx.rotate(wiggle);
            // Sparkle particles during dance
            if (frameCount % 6 === 0) {
                particles.push({
                    x: player.x + rng(-12, 12), y: player.y + rng(-16, 4),
                    vx: rng(-1, 1), vy: rng(-2, -0.5),
                    life: rng(300, 600), maxLife: 600,
                    color: ['#FBBF24', '#F97316', '#22C55E', '#EC4899'][Math.floor(Math.random() * 4)],
                    size: rng(1.5, 3.5), gravity: -0.01
                });
            }
        }
        // Body (round)
        ctx.fillStyle = playerColor;
        ctx.beginPath();
        ctx.ellipse(0, gs(2), half * 0.55, half * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Head
        ctx.fillStyle = '#FDE68A';
        ctx.beginPath();
        ctx.arc(0, -half * 0.2, half * 0.42, 0, Math.PI * 2);
        ctx.fill();
        // Helmet
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(0, -half * 0.35, half * 0.38, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = playerColor;
        ctx.beginPath();
        ctx.arc(0, -half * 0.38, half * 0.3, Math.PI * 1.1, -0.1 * Math.PI);
        ctx.fill();
        // Eyes
        const eyeOff = player.dir === 1 ? gs(3) : player.dir === 3 ? -gs(3) : 0;
        const eyeY = player.dir === 0 ? -half * 0.3 : player.dir === 2 ? -half * 0.1 : -half * 0.2;
        ctx.fillStyle = '#1A1A2E';
        ctx.beginPath(); ctx.arc(eyeOff - gs(4), eyeY, gs(2.5), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(eyeOff + gs(4), eyeY, gs(2.5), 0, Math.PI * 2); ctx.fill();
        // Pupils
        ctx.fillStyle = '#FFF';
        ctx.beginPath(); ctx.arc(eyeOff - gs(3.5), eyeY - gs(0.5), gs(1), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(eyeOff + gs(4.5), eyeY - gs(0.5), gs(1), 0, Math.PI * 2); ctx.fill();
        // Feet (animated)
        const step = player.moving ? Math.sin(player.animFrame * Math.PI / 2) * gs(3) : 0;
        ctx.fillStyle = '#1A1A2E';
        ctx.fillRect(-gs(6), half * 0.45, gs(5), gs(4) + step);
        ctx.fillRect(gs(1), half * 0.45, gs(5), gs(4) - step);

        ctx.restore();
        ctx.globalAlpha = 1;
    }

    function drawBombs() {
        for (const b of bombs) {
            if (!b.active) continue;
            const x = (b.col + 0.5) * TILE * SCALE, y = (b.row + 0.5) * TILE * SCALE;
            const s = TILE * SCALE;
            const pulse = 1 + 0.12 * Math.sin(frameCount * 0.3);
            const urgent = b.timer < 600;
            const blink = urgent && Math.floor(b.timer / 80) % 2;
            // Try sprite bomb
            if (allSpritesReady && sprites['bomb']) {
                const bombSize = s * 0.7 * pulse;
                ctx.drawImage(sprites[blink ? 'bombWhite' : 'bomb'] || sprites['bomb'], x - bombSize / 2, y - bombSize / 2 + gs(2), bombSize, bombSize);
                // Fuse spark still
                if (!blink) {
                    ctx.fillStyle = urgent ? '#EF4444' : '#FBBF24';
                    ctx.beginPath();
                    ctx.arc(x + gs(3), y - s * 0.35, gs(3) * pulse, 0, Math.PI * 2);
                    ctx.fill();
                }
                continue;
            }
            // Shadow fallback
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(x, y + s * 0.35, s * 0.3, s * 0.1, 0, 0, Math.PI * 2);
            ctx.fill();
            // Bomb body
            ctx.fillStyle = blink ? '#555' : '#1A1A2E';
            ctx.beginPath();
            ctx.arc(x, y + gs(2), s * 0.32 * pulse, 0, Math.PI * 2);
            ctx.fill();
            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.arc(x - gs(4), y - gs(2), s * 0.12, 0, Math.PI * 2);
            ctx.fill();
            // Fuse
            ctx.strokeStyle = '#8B6040';
            ctx.lineWidth = gs(2);
            ctx.beginPath();
            ctx.moveTo(x, y - s * 0.28);
            ctx.quadraticCurveTo(x + gs(6), y - s * 0.45, x + gs(3), y - s * 0.5);
            ctx.stroke();
            // Fuse spark
            if (!blink) {
                ctx.fillStyle = urgent ? '#EF4444' : '#FBBF24';
                ctx.beginPath();
                ctx.arc(x + gs(3), y - s * 0.5, gs(3) * pulse, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#FFF';
                ctx.beginPath();
                ctx.arc(x + gs(3), y - s * 0.5, gs(1.5), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function drawExplosions() {
        for (const e of explosions) {
            const x = e.col * TILE * SCALE, y = e.row * TILE * SCALE, s = TILE * SCALE;
            const cx = x + s / 2, cy = y + s / 2;
            const t = 1 - e.timer / 500;
            const alpha = t < 0.2 ? t / 0.2 : t > 0.7 ? (1 - t) / 0.3 : 1;
            const expand = t < 0.3 ? t / 0.3 : 1;
            const pad = gs(2) * (1 - expand);

            // Base fire gradient
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.6);
            grad.addColorStop(0, `rgba(255,255,255,${alpha * 0.9})`);
            grad.addColorStop(0.3, `rgba(255,200,50,${alpha * 0.8})`);
            grad.addColorStop(0.7, `rgba(255,100,20,${alpha * 0.6})`);
            grad.addColorStop(1, `rgba(200,30,0,${alpha * 0.2})`);
            ctx.fillStyle = grad;
            ctx.fillRect(x + pad, y + pad, s - pad * 2, s - pad * 2);

            // Animated flame tongues that lick outward
            ctx.globalAlpha = alpha * 0.8;
            const tongueCount = 6;
            for (let i = 0; i < tongueCount; i++) {
                const angle = (i / tongueCount) * Math.PI * 2 + frameCount * 0.15 + e.col * 0.5;
                const tongueLen = s * 0.3 * expand * (0.6 + 0.4 * Math.sin(frameCount * 0.3 + i * 1.5));
                const tx = cx + Math.cos(angle) * tongueLen;
                const ty = cy + Math.sin(angle) * tongueLen;
                const midX = cx + Math.cos(angle) * tongueLen * 0.5 + Math.sin(frameCount * 0.2 + i) * gs(3);
                const midY = cy + Math.sin(angle) * tongueLen * 0.5 + Math.cos(frameCount * 0.25 + i) * gs(3);

                const tGrad = ctx.createRadialGradient(tx, ty, 0, tx, ty, gs(6));
                tGrad.addColorStop(0, `rgba(255,230,100,${alpha * 0.7})`);
                tGrad.addColorStop(1, `rgba(255,80,0,0)`);
                ctx.fillStyle = tGrad;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(angle - 0.3) * gs(4), cy + Math.sin(angle - 0.3) * gs(4));
                ctx.quadraticCurveTo(midX, midY, tx, ty);
                ctx.quadraticCurveTo(midX + gs(2), midY + gs(2), cx + Math.cos(angle + 0.3) * gs(4), cy + Math.sin(angle + 0.3) * gs(4));
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
    }

    function drawEnemies() {
        for (const e of enemies) {
            const x = e.x * SCALE, y = e.y * SCALE;
            const s = TILE * SCALE;
            const half = s / 2;
            if (!e.alive) {
                ctx.globalAlpha = e.deathTimer / 400;
                ctx.fillStyle = '#FFF';
                ctx.beginPath(); ctx.arc(x, y, half * 0.5, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
                continue;
            }
            // Try sprite enemy
            if (allSpritesReady) {
                const anim = Math.floor(frameCount / 10) % 2 === 0;
                let spr = null;
                if (e.type === EN_BALLOOM) spr = sprites[anim ? 'enemySlime' : 'enemySlimeM'];
                else if (e.type === EN_ONEAL) spr = sprites[anim ? 'enemySlimeP' : 'enemySlimePM'];
                else spr = sprites[anim ? 'enemyFrog' : 'enemyFrogM'];
                if (spr) {
                    ctx.drawImage(spr, x - half * 0.5, y - half * 0.6, s * 0.65, s * 0.7);
                    ctx.restore && 0; // no save/restore needed
                    continue;
                }
            }
            ctx.save();
            ctx.translate(x, y);
            const bob = Math.sin(frameCount * 0.1 + e.x) * gs(2);
            if (e.type === EN_BALLOOM) {
                // Orange blob
                ctx.fillStyle = '#F97316';
                ctx.beginPath();
                ctx.ellipse(0, bob, half * 0.5, half * 0.55, 0, 0, Math.PI * 2);
                ctx.fill();
                // Eyes
                ctx.fillStyle = '#FFF';
                ctx.beginPath(); ctx.arc(-gs(4), bob - gs(3), gs(4), 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(gs(4), bob - gs(3), gs(4), 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#1A1A2E';
                ctx.beginPath(); ctx.arc(-gs(3), bob - gs(3), gs(2), 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(gs(5), bob - gs(3), gs(2), 0, Math.PI * 2); ctx.fill();
                // Feet tendrils
                const wave = e.animFrame * gs(2);
                ctx.fillStyle = '#F97316';
                ctx.fillRect(-gs(6), half * 0.35 + bob, gs(4), gs(4) + wave);
                ctx.fillRect(gs(2), half * 0.35 + bob, gs(4), gs(4) - wave);
            } else if (e.type === EN_ONEAL) {
                // Blue ghost
                ctx.fillStyle = '#3B82F6';
                ctx.beginPath();
                ctx.arc(0, bob - gs(2), half * 0.48, Math.PI, 0);
                ctx.lineTo(half * 0.48, half * 0.35 + bob);
                for (let i = 0; i < 4; i++) {
                    const wx = half * 0.48 - i * half * 0.24;
                    ctx.lineTo(wx - half * 0.12, half * 0.2 + bob + (i % 2 ? gs(4) : 0));
                }
                ctx.lineTo(-half * 0.48, half * 0.35 + bob);
                ctx.closePath();
                ctx.fill();
                // Eyes
                ctx.fillStyle = '#FFF';
                ctx.beginPath(); ctx.arc(-gs(4), bob - gs(4), gs(4), 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(gs(4), bob - gs(4), gs(4), 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#1A1A2E';
                ctx.beginPath(); ctx.arc(-gs(3), bob - gs(3), gs(2.5), 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(gs(5), bob - gs(3), gs(2.5), 0, Math.PI * 2); ctx.fill();
            } else {
                // Purple fast enemy
                ctx.fillStyle = '#A855F7';
                ctx.beginPath();
                ctx.moveTo(0, -half * 0.5 + bob);
                ctx.lineTo(half * 0.5, half * 0.3 + bob);
                ctx.lineTo(half * 0.25, half * 0.45 + bob);
                ctx.lineTo(-half * 0.25, half * 0.45 + bob);
                ctx.lineTo(-half * 0.5, half * 0.3 + bob);
                ctx.closePath();
                ctx.fill();
                // Inner
                ctx.fillStyle = '#C084FC';
                ctx.beginPath();
                ctx.arc(0, bob, half * 0.25, 0, Math.PI * 2);
                ctx.fill();
                // Eyes - angry
                ctx.fillStyle = '#FFF';
                ctx.beginPath(); ctx.arc(-gs(3), bob - gs(2), gs(3), 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(gs(3), bob - gs(2), gs(3), 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#EF4444';
                ctx.beginPath(); ctx.arc(-gs(2.5), bob - gs(1.5), gs(1.5), 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(gs(3.5), bob - gs(1.5), gs(1.5), 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }
    }

    function drawPowerups() {
        for (const pw of powerups) {
            if (!pw.revealed) continue;
            const bob = Math.sin(frameCount * 0.08 + pw.col * 2 + pw.row) * gs(3);
            const x = (pw.col + 0.5) * TILE * SCALE, y = (pw.row + 0.5) * TILE * SCALE + bob;
            const s = TILE * SCALE;
            const pulse = 0.8 + 0.2 * Math.sin(frameCount * 0.12 + pw.col);

            // Outer glow ring
            ctx.shadowColor = PW_COLORS[pw.type];
            ctx.shadowBlur = gs(12) * pulse;
            ctx.fillStyle = `rgba(${pw.type === PW_BOMB ? '59,130,246' : pw.type === PW_FIRE ? '239,68,68' : pw.type === PW_SPEED ? '34,197,94' : pw.type === PW_WALLPASS ? '168,85,247' : pw.type === PW_BOMBPASS ? '245,158,11' : pw.type === PW_REMOTE ? '236,72,153' : pw.type === PW_KICK ? '20,184,166' : '107,114,128'},0.25)`;
            ctx.beginPath();
            ctx.arc(x, y, s * 0.42 * pulse, 0, Math.PI * 2);
            ctx.fill();

            // Capsule with gradient
            const capGrad = ctx.createLinearGradient(x - gs(8), y - gs(6), x + gs(8), y + gs(6));
            capGrad.addColorStop(0, PW_COLORS[pw.type]);
            capGrad.addColorStop(1, '#FFF');
            ctx.fillStyle = PW_COLORS[pw.type];
            ctx.beginPath();
            ctx.roundRect(x - gs(9), y - gs(7), gs(18), gs(14), gs(5));
            ctx.fill();
            // Capsule highlight
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.roundRect(x - gs(7), y - gs(6), gs(14), gs(5), gs(3));
            ctx.fill();
            ctx.shadowBlur = 0;

            // Icon
            ctx.fillStyle = '#FFF';
            ctx.font = `bold ${gs(10)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const icons = ['B', 'F', 'S', 'W', 'P', 'R', 'K', '\u2620'];
            ctx.fillText(icons[pw.type], x, y + gs(1));
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = clamp(p.life / p.maxLife, 0, 1);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            if (p.debris && p.rotate !== undefined) {
                ctx.save();
                ctx.translate(p.x * SCALE, p.y * SCALE);
                ctx.rotate(p.rotate);
                ctx.fillRect(-p.size * SCALE / 2, -p.size * SCALE / 2, p.size * SCALE, p.size * SCALE * 0.6);
                ctx.restore();
            } else {
                ctx.fillRect(p.x * SCALE - p.size * SCALE / 2, p.y * SCALE - p.size * SCALE / 2, p.size * SCALE, p.size * SCALE);
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawScorePopups() {
        for (const p of scorePopups) {
            const alpha = clamp(p.life / 600, 0, 1);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color || '#FFF';
            ctx.font = `bold ${gs(10)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(p.text, p.x * SCALE, p.y * SCALE);
        }
        ctx.globalAlpha = 1;
    }

    function drawHUD() {
        const hudY = ROWS * TILE * SCALE;
        ctx.fillStyle = '#111118';
        ctx.fillRect(0, hudY, W, H - hudY);
        // Divider
        ctx.fillStyle = playerColor;
        ctx.fillRect(0, hudY, W, gs(2));

        ctx.fillStyle = '#E0E7FF';
        ctx.font = `bold ${gs(11)}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const ty = hudY + (H - hudY) / 2;
        ctx.fillText(`LV ${level}`, gs(6), ty);

        ctx.textAlign = 'center';
        ctx.fillText(`SCORE ${String(score).padStart(6, '0')}`, W / 2, ty);

        // Lives as hearts
        ctx.textAlign = 'right';
        ctx.fillStyle = '#EF4444';
        let lx = W - gs(6);
        for (let i = 0; i < lives; i++) {
            ctx.fillText('\u2665', lx, ty);
            lx -= gs(14);
        }
        // Power-up indicators
        ctx.font = `${gs(8)}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#60A5FA';
        const infoY = ty;
        let pwText = `B:${maxBombs} F:${fireRange}`;
        if (hasRemote) pwText += ' R';
        if (hasKick) pwText += ' K';
        ctx.fillText(pwText, gs(60), infoY);
        // Skull curse warning
        if (skullTimer > 0) {
            ctx.fillStyle = '#EF4444';
            ctx.font = `bold ${gs(9)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(`CURSED: ${skullEffect === 'invert' ? 'INVERTED' : 'BOMB DROP'} ${(skullTimer / 1000).toFixed(1)}s`, W / 2, ty + gs(10));
        }
    }

    function drawVignette() {
        const grad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    function drawTitle() {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = playerColor;
        ctx.font = `bold ${gs(28)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BOMBERMAN', W / 2, H * 0.33);
        ctx.fillStyle = '#E0E7FF';
        ctx.font = `${gs(12)}px monospace`;
        ctx.fillText('Arrow Keys to Move / Space to Bomb', W / 2, H * 0.50);
        ctx.fillText('Destroy blocks, find the exit!', W / 2, H * 0.57);
        const blink = Math.sin(frameCount * 0.06) > 0;
        if (blink) {
            ctx.fillStyle = '#FBBF24';
            ctx.font = `bold ${gs(14)}px monospace`;
            ctx.fillText('PRESS SPACE OR TAP TO START', W / 2, H * 0.72);
        }
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#EF4444';
        ctx.font = `bold ${gs(28)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', W / 2, H * 0.35);
        ctx.fillStyle = '#E0E7FF';
        ctx.font = `${gs(14)}px monospace`;
        ctx.fillText(`Final Score: ${score}`, W / 2, H * 0.47);
        if (hiScore > 0) {
            ctx.fillStyle = score >= hiScore ? '#22C55E' : '#FBBF24';
            ctx.font = `bold ${gs(12)}px monospace`;
            ctx.fillText(score >= hiScore ? 'NEW HIGH SCORE!' : `HIGH SCORE: ${hiScore}`, W / 2, H * 0.56);
        }
        ctx.fillStyle = '#94A3B8';
        ctx.font = `${gs(11)}px monospace`;
        ctx.fillText('Tap or press Space to restart', W / 2, H * 0.68);
    }

    function drawLevelClear() {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#22C55E';
        ctx.font = `bold ${gs(24)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`LEVEL ${level} CLEAR!`, W / 2, H * 0.42);
        ctx.fillStyle = '#FBBF24';
        ctx.font = `${gs(14)}px monospace`;
        ctx.fillText(`+${1000 * level} pts`, W / 2, H * 0.55);
    }

    function drawDeathOverlay() {
        const alpha = clamp(1 - deathTimer / 1500, 0, 0.5);
        ctx.fillStyle = `rgba(200,30,0,${alpha})`;
        ctx.fillRect(0, 0, W, H);
    }

    // ── Touch Controls ──
    function drawTouchControls() {
        if (!('ontouchstart' in window)) return;
        ctx.globalAlpha = 0.2;
        // D-pad (bottom-left)
        const cx = gs(60), cy = H - gs(65);
        const sz = gs(22);
        ctx.fillStyle = '#FFF';
        // Up
        ctx.beginPath(); ctx.moveTo(cx, cy - sz * 1.4); ctx.lineTo(cx - sz * 0.6, cy - sz * 0.5); ctx.lineTo(cx + sz * 0.6, cy - sz * 0.5); ctx.closePath(); ctx.fill();
        // Down
        ctx.beginPath(); ctx.moveTo(cx, cy + sz * 1.4); ctx.lineTo(cx - sz * 0.6, cy + sz * 0.5); ctx.lineTo(cx + sz * 0.6, cy + sz * 0.5); ctx.closePath(); ctx.fill();
        // Left
        ctx.beginPath(); ctx.moveTo(cx - sz * 1.4, cy); ctx.lineTo(cx - sz * 0.5, cy - sz * 0.6); ctx.lineTo(cx - sz * 0.5, cy + sz * 0.6); ctx.closePath(); ctx.fill();
        // Right
        ctx.beginPath(); ctx.moveTo(cx + sz * 1.4, cy); ctx.lineTo(cx + sz * 0.5, cy - sz * 0.6); ctx.lineTo(cx + sz * 0.5, cy + sz * 0.6); ctx.closePath(); ctx.fill();
        // Bomb button (bottom-right)
        const bx = W - gs(55), by = H - gs(55);
        ctx.beginPath(); ctx.arc(bx, by, gs(25), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#FFF';
        ctx.font = `bold ${gs(14)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('B', bx, by);
        ctx.globalAlpha = 1;
    }

    // ── Input Handlers ──
    function onKeyDown(e) {
        keys[e.code] = true;
        if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
        if (state === ST_TITLE && (e.code === 'Space' || e.code === 'Enter')) startGame();
        if (state === ST_GAMEOVER && (e.code === 'Space' || e.code === 'Enter')) {
            if (gameOverCB) gameOverCB(score);
            startGame();
        }
    }
    function onKeyUp(e) { keys[e.code] = false; }

    function onTouchStart(e) {
        e.preventDefault();
        handleTouch(e.touches);
        if (state === ST_TITLE || state === ST_GAMEOVER) {
            if (state === ST_GAMEOVER && gameOverCB) gameOverCB(score);
            startGame();
        }
    }
    function onTouchMove(e) { e.preventDefault(); handleTouch(e.touches); }
    function onTouchEnd(e) { e.preventDefault(); touchDir = null; touchBomb = false; if (e.touches.length > 0) handleTouch(e.touches); }

    function handleTouch(touches) {
        const rect = canvas.getBoundingClientRect();
        touchDir = null; touchBomb = false;
        for (const t of touches) {
            const tx = t.clientX - rect.left, ty = t.clientY - rect.top;
            // Bomb button (bottom-right quadrant)
            const bx = (W / SCALE / DPR) - 55, by = (H / SCALE / DPR) - 55;
            if (tx > rect.width * 0.7 && ty > rect.height * 0.65) { touchBomb = true; continue; }
            // D-pad (bottom-left)
            if (tx < rect.width * 0.35 && ty > rect.height * 0.55) {
                const cx = rect.width * 0.13, cy = rect.height * 0.85;
                const dx = tx - cx, dy = ty - cy;
                if (Math.abs(dx) > Math.abs(dy)) touchDir = dx > 0 ? 1 : 3;
                else touchDir = dy > 0 ? 2 : 0;
            }
        }
    }

    // ── Canvas Sizing ──
    function fitCanvas() {
        if (!canvas) return;
        let pw = canvas.width || 480;
        let ph = canvas.height || 448;
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
        drawH = Math.max(drawH, 300);
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = drawW * DPR;
        canvas.height = drawH * DPR;
        canvas.style.width = drawW + 'px';
        canvas.style.height = drawH + 'px';
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
    }

    // ── Game Loop ──
    function gameLoop(ts) {
        if (!gameActive) return;
        if (!lastTime) lastTime = ts;
        const dt = Math.min(ts - lastTime, 50);
        lastTime = ts;

        if (state === ST_LOADING) {
            drawLoading();
            if (allSpritesReady) state = ST_TITLE;
        } else {
            update(dt);
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = '#0A0A12';
            ctx.fillRect(0, 0, W, H);
            draw();
        }

        animFrame = requestAnimationFrame(gameLoop);
    }

    // ── Init / Destroy ──
    function init(cvs, playerData, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOver;
        try { hiScore = parseInt(localStorage.getItem(LS_KEY)) || 0; } catch { hiScore = 0; }
        gameActive = true;
        playerColor = playerData?.color || '#06B6D4';
        playerTheme = playerData?.theme || 'retro';

        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(playerTheme) : null;
        if (_t) playerColor = _t.colors[0] || playerColor;

        state = ST_LOADING;
        if (!allSpritesReady) loadSprites();
        frameCount = 0;
        lastTime = 0;
        keys = {};
        touchDir = null;
        touchBomb = false;
        particles = [];
        scorePopups = [];

        W = canvas.width || 480;
        H = canvas.height || 448;
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
    }

    return { init, destroy };
})();
