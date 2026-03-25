/* YWA Dig Dug — Underground digging arcade game for Your World Arcade */
window.DigDug = (() => {

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
    const GAME_W = 480, GAME_H = 560;
    const COLS = 16, ROWS = 14;
    const CELL = 30; // GAME_W / COLS
    const SURFACE_ROWS = 2; // top 2 rows are sky/grass
    const PLAYER_SPEED = 1.8;
    const PUMP_RANGE = 4; // cells the hose can reach
    const PUMP_STAGES = 4; // pumps to pop an enemy
    const PUMP_DEFLATE_MS = 800; // ms before enemy deflates one stage
    const ENEMY_SPEED_BASE = 0.6;
    const GHOST_SPEED = 0.4;
    const GHOST_CHANCE = 0.003; // per frame per enemy
    const ROCK_FALL_SPEED = 2.5;
    const ROCK_SETTLE_FRAMES = 40; // frames before unsupported rock falls
    const FIRE_RANGE = 3; // fygar breath cells
    const FIRE_RANGE_TUNNEL = 5; // extended range through tunnels
    const FIRE_DURATION = 60; // frames
    const DEATH_ANIM_MS = 1500;
    const LEVEL_SPLASH_MS = 1800;
    const INITIAL_LIVES = 3;
    const BONUS_LIFE_SCORE = 20000;
    const DEPTH_SCORE_MULTIPLIER = [1.0, 1.2, 1.5, 2.0]; // multiplier per depth layer

    // States
    const ST_LOADING = -1, ST_TITLE = 0, ST_PLAYING = 1, ST_DYING = 2, ST_LEVEL_SPLASH = 3, ST_GAMEOVER = 4;
    const LS_KEY = 'ywa_digdug_hiscore';
    let hiScore = 0;

    // ── Sprite Atlas (Kenney Platform CC0) ──
    const SPRITE_BASE = '/img/game-assets/kenney-platform';
    const sprites = {};
    let spritesLoaded = 0, spritesTotal = 0, allSpritesReady = false;

    const SPRITE_MANIFEST = {
        // Player (dig dug character with helmet)
        playerStand:  `${SPRITE_BASE}/players/Yellow/alienYellow_stand.png`,
        playerWalk1:  `${SPRITE_BASE}/players/Yellow/alienYellow_walk1.png`,
        playerWalk2:  `${SPRITE_BASE}/players/Yellow/alienYellow_walk2.png`,
        playerFront:  `${SPRITE_BASE}/players/Yellow/alienYellow_front.png`,
        playerHit:    `${SPRITE_BASE}/players/Yellow/alienYellow_hit.png`,
        playerDuck:   `${SPRITE_BASE}/players/Yellow/alienYellow_duck.png`,
        // Enemies (Pooka = slime, Fygar = ladybug/fly)
        enemySlime:   `${SPRITE_BASE}/enemies/slimeGreen.png`,
        enemySlimeM:  `${SPRITE_BASE}/enemies/slimeGreen_move.png`,
        enemySlimeH:  `${SPRITE_BASE}/enemies/slimeGreen_hit.png`,
        enemyLadybug: `${SPRITE_BASE}/enemies/ladybug.png`,
        enemyLadybugM:`${SPRITE_BASE}/enemies/ladybug_move.png`,
        enemyLadybugF:`${SPRITE_BASE}/enemies/ladybug_fly.png`,
        // Dirt tiles
        dirtMid:      `${SPRITE_BASE}/ground/Dirt/dirtMid.png`,
        dirtCenter:   `${SPRITE_BASE}/ground/Dirt/dirtCenter.png`,
        // Surface
        grassMid:     `${SPRITE_BASE}/ground/Grass/grassMid.png`,
        grassCenter:  `${SPRITE_BASE}/ground/Grass/grassCenter.png`,
        // Items
        coinGold:     `${SPRITE_BASE}/items/coinGold.png`,
        gemRed:       `${SPRITE_BASE}/items/gemRed.png`,
        star:         `${SPRITE_BASE}/items/star.png`,
        mushroomRed:  `${SPRITE_BASE}/tiles/mushroomRed.png`,
        mushroomBrown:`${SPRITE_BASE}/tiles/mushroomBrown.png`,
        // Rock
        rock:         `${SPRITE_BASE}/tiles/rock.png`,
        // Fireball
        fireball:     `${SPRITE_BASE}/particles/fireball.png`,
        // HUD
        hudHeart:     `${SPRITE_BASE}/hud/hudHeart_full.png`,
        // Background
        bgDesert:     `${SPRITE_BASE}/backgrounds/colored_desert.png`,
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
        ctx.fillStyle = '#1a0a00';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#F59E0B';
        ctx.shadowColor = '#F59E0B'; ctx.shadowBlur = gs(10);
        ctx.font = `bold ${gs(36)}px monospace`;
        ctx.fillText('DIG DUG', gs(GAME_W / 2), gs(GAME_H / 2 - 50));
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#E0E7FF'; ctx.font = `${gs(13)}px monospace`;
        ctx.fillText('LOADING SPRITES...', gs(GAME_W / 2), gs(GAME_H / 2));
        const barW = 200, barH = 8;
        const pct = spritesTotal > 0 ? spritesLoaded / spritesTotal : 0;
        ctx.fillStyle = '#333';
        ctx.fillRect(gs(GAME_W / 2 - barW / 2), gs(GAME_H / 2 + 20), gs(barW), gs(barH));
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(gs(GAME_W / 2 - barW / 2), gs(GAME_H / 2 + 20), gs(barW * pct), gs(barH));
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `${gs(10)}px monospace`;
        ctx.fillText(`${spritesLoaded} / ${spritesTotal}`, gs(GAME_W / 2), gs(GAME_H / 2 + 45));
    }
    const DIR_NONE = -1, DIR_UP = 0, DIR_RIGHT = 1, DIR_DOWN = 2, DIR_LEFT = 3;
    const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

    // Scoring
    const PUMP_SCORE_BY_DEPTH = [200, 300, 400, 500]; // depth layer bonus
    const ROCK_KILL_SCORES = [0, 1000, 2500, 4000, 6000]; // multi-crush bonus
    const VEGGIE_SCORES = [0, 400, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000];

    // ── State Variables ──
    let canvas, ctx, W, H, SCALE, DPR, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor, playerTheme;
    let state, frameCount, lastTime, keys = {};
    let score, lives, level, nextBonusAt;
    let grid; // COLS x ROWS: 0=empty, 1=dirt
    let tunnels; // set of "col,row" for dug cells
    let player; // {x, y, dir, animFrame, pumping, pumpDir, pumpDist, pumpTarget}
    let enemies; // [{x, y, type, dir, speed, ghosting, ghostTimer, inflateStage, deflateTimer, dead, escaped}]
    let rocks; // [{col, row, falling, settled, settleTimer, crushCount, y, vy, removed}]
    let particles, scorePopups;
    let pumpLine; // {active, x, y, dir, dist, maxDist, targetEnemy}
    let fireBreaths; // [{x, y, dir, timer, fygar}]
    let veggie; // {col, row, type, timer, collected}
    let enemiesKilled; // count for veggie trigger
    let deathTimer, levelSplashTimer;
    let screenShake;
    let touchLeft, touchRight, touchUp, touchDown, touchFire;
    let gems; // embedded sparkle gems in dirt

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
    function sfxDig() { playSound(280, 0.05, 'triangle', 0.06); }
    function sfxPump() { playSound(500, 0.08, 'square', 0.1); }
    function sfxPop() { playSound(150, 0.25, 'sawtooth', 0.15); setTimeout(() => playSound(100, 0.15, 'sine', 0.1), 80); }
    function sfxRockFall() { playSound(80, 0.4, 'sawtooth', 0.12); }
    function sfxCrush() { playSound(60, 0.5, 'sawtooth', 0.18); }
    function sfxDeath() { playSound(400, 0.1, 'square', 0.1); setTimeout(() => playSound(300, 0.1, 'square', 0.1), 120); setTimeout(() => playSound(150, 0.3, 'sawtooth', 0.12), 240); }
    function sfxFire() { playSound(120, 0.3, 'sawtooth', 0.1); }
    function sfxVeggie() { playSound(880, 0.08, 'sine', 0.12); setTimeout(() => playSound(1100, 0.12, 'sine', 0.12), 90); }
    function sfxLevelUp() { [660,880,1100].forEach((f,i) => setTimeout(() => playSound(f, 0.15, 'sine', 0.12), i*120)); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const cellKey = (c, r) => `${c},${r}`;
    const depthLayer = row => clamp(Math.floor((row - SURFACE_ROWS) / 3), 0, 3);

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



    // Dirt layer colors (depth gradient)
    const DIRT_COLORS = ['#C8954C', '#A67435', '#7D5228', '#5A3A1E'];
    const DIRT_DARK = ['#B5843F', '#946530', '#6E4622', '#4D3018'];
    const SKY_COLOR = '#4AA8DB';
    const GRASS_COLOR = '#4CAF50';
    const GRASS_DARK = '#388E3C';

    // ── Canvas Setup ──
    function fitCanvas() {
        if (!canvas) return;
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        let pw = canvas.width || 480, ph = canvas.height || 560;
        const parent = canvas.parentElement;
        if (parent && parent.clientWidth > 50 && parent.clientHeight > 50) {
            pw = parent.clientWidth; ph = parent.clientHeight;
        }
        const aspect = GAME_W / GAME_H;
        if (pw / ph > aspect) {
            H = ph; W = ph * aspect;
        } else {
            W = pw; H = pw / aspect;
        }
        SCALE = W / GAME_W;
        canvas.width = W * DPR;
        canvas.height = H * DPR;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx = canvas.getContext('2d');
        ctx.scale(DPR, DPR);
    }

    // ── Grid ──
    function initGrid() {
        grid = [];
        tunnels = new Set();
        for (let c = 0; c < COLS; c++) {
            grid[c] = [];
            for (let r = 0; r < ROWS; r++) {
                grid[c][r] = r >= SURFACE_ROWS ? 1 : 0; // dirt below surface
                if (r < SURFACE_ROWS) tunnels.add(cellKey(c, r));
            }
        }
    }

    function digCell(col, row) {
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
        const key = cellKey(col, row);
        if (!tunnels.has(key)) {
            tunnels.add(key);
            grid[col][row] = 0;
            sfxDig();
        }
    }

    function isDug(col, row) {
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
        return tunnels.has(cellKey(col, row));
    }

    // ── Level Setup ──
    function initLevel() {
        initGrid();
        particles = [];
        scorePopups = [];
        fireBreaths = [];
        pumpLine = { active: false, x: 0, y: 0, dir: DIR_RIGHT, dist: 0, maxDist: 0, targetEnemy: null };
        veggie = null;
        enemiesKilled = 0;
        screenShake = 0;

        // Player start: center top of dirt
        player = {
            x: Math.floor(COLS / 2) * CELL + CELL / 2,
            y: SURFACE_ROWS * CELL + CELL / 2,
            dir: DIR_RIGHT, moveDir: DIR_NONE,
            anim: 0, pumping: false
        };
        // Dig starting tunnel
        const startCol = Math.floor(COLS / 2);
        digCell(startCol - 1, SURFACE_ROWS);
        digCell(startCol, SURFACE_ROWS);
        digCell(startCol + 1, SURFACE_ROWS);

        // Enemies
        enemies = [];
        const numPookas = 2 + Math.floor(level * 0.8);
        const numFygars = Math.min(1 + Math.floor(level / 2), 4);
        const totalEnemies = Math.min(numPookas + numFygars, 10);

        const spawnPositions = [];
        for (let attempt = 0; attempt < 200 && spawnPositions.length < totalEnemies; attempt++) {
            const c = randInt(1, COLS - 2);
            const r = randInt(SURFACE_ROWS + 2, ROWS - 2);
            const tooClose = spawnPositions.some(p => Math.abs(p.c - c) < 3 && Math.abs(p.r - r) < 2);
            const nearPlayer = Math.abs(c - startCol) < 3 && r < SURFACE_ROWS + 3;
            if (!tooClose && !nearPlayer) spawnPositions.push({ c, r });
        }

        for (let i = 0; i < spawnPositions.length; i++) {
            const pos = spawnPositions[i];
            const type = i < numPookas ? 'pooka' : 'fygar';
            // Dig small pocket for enemy
            digCell(pos.c, pos.r);
            enemies.push({
                x: pos.c * CELL + CELL / 2, y: pos.r * CELL + CELL / 2,
                type, dir: randInt(0, 3), speed: ENEMY_SPEED_BASE + level * 0.06,
                ghosting: false, ghostTimer: 0, ghostTarget: null,
                inflateStage: 0, deflateTimer: 0,
                dead: false, escaped: false, anim: 0,
                fireTimer: 0, firing: false, fireDir: DIR_NONE, fireFrames: 0
            });
        }

        // Embedded gems/crystals in dirt
        gems = [];
        const gemColors = ['#60A5FA', '#A78BFA', '#F472B6', '#34D399', '#FCD34D', '#F87171'];
        const numGems = 8 + level * 2;
        for (let g = 0; g < numGems; g++) {
            const gc = randInt(0, COLS - 1);
            const gr = randInt(SURFACE_ROWS + 1, ROWS - 1);
            gems.push({
                col: gc, row: gr,
                ox: randInt(4, 26), oy: randInt(4, 26),
                size: rand(2, 4),
                color: gemColors[randInt(0, gemColors.length - 1)],
                phase: rand(0, Math.PI * 2)
            });
        }

        // Rocks
        rocks = [];
        const numRocks = 2 + Math.floor(level / 2);
        for (let i = 0; i < numRocks; i++) {
            const c = randInt(1, COLS - 2);
            const r = randInt(SURFACE_ROWS + 1, ROWS - 3);
            // Avoid player start area and enemy pockets
            const nearPlayer = Math.abs(c - startCol) < 2 && r < SURFACE_ROWS + 3;
            if (!nearPlayer) {
                rocks.push({
                    col: c, row: r, x: c * CELL, y: r * CELL,
                    falling: false, settled: true, settleTimer: 0,
                    crushCount: 0, removed: false, shakeAnim: 0
                });
            }
        }
    }

    // ── Input ──
    function onKeyDown(e) {
        keys[e.key] = true;
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
        if ((e.key === ' ' || e.key === 'Enter') && state === ST_TITLE) startGame();
        if ((e.key === ' ' || e.key === 'Enter') && state === ST_GAMEOVER) startGame();
    }
    function onKeyUp(e) { keys[e.key] = false; }

    function onTouchStart(e) {
        e.preventDefault();
        handleTouches(e.touches);
        if (state === ST_TITLE || state === ST_GAMEOVER) startGame();
    }
    function onTouchMove(e) { e.preventDefault(); handleTouches(e.touches); }
    function onTouchEnd(e) {
        e.preventDefault();
        touchLeft = touchRight = touchUp = touchDown = touchFire = false;
        if (e.touches.length) handleTouches(e.touches);
    }
    function handleTouches(touches) {
        touchLeft = touchRight = touchUp = touchDown = touchFire = false;
        const rect = canvas.getBoundingClientRect();
        for (const t of touches) {
            const tx = (t.clientX - rect.left) / rect.width;
            const ty = (t.clientY - rect.top) / rect.height;
            if (tx < 0.25) touchLeft = true;
            else if (tx > 0.75) touchRight = true;
            if (ty < 0.35) touchUp = true;
            else if (ty > 0.65) touchDown = true;
            if (tx > 0.35 && tx < 0.65 && ty > 0.35 && ty < 0.65) touchFire = true;
        }
    }

    // ── Game Start ──
    function startGame() {
        score = 0;
        lives = INITIAL_LIVES;
        level = 1;
        nextBonusAt = BONUS_LIFE_SCORE;
        state = ST_LEVEL_SPLASH;
        levelSplashTimer = LEVEL_SPLASH_MS;
        initLevel();
        sfxLevelUp();
    }

    // ── Player Update ──
    function updatePlayer(dt) {
        if (player.pumping) {
            updatePump(dt);
            return;
        }

        let dir = DIR_NONE;
        if (keys['ArrowUp'] || touchUp) dir = DIR_UP;
        else if (keys['ArrowDown'] || touchDown) dir = DIR_DOWN;
        else if (keys['ArrowLeft'] || touchLeft) dir = DIR_LEFT;
        else if (keys['ArrowRight'] || touchRight) dir = DIR_RIGHT;

        if (dir !== DIR_NONE) {
            player.dir = dir;
            player.moveDir = dir;
            const nx = player.x + DX[dir] * PLAYER_SPEED;
            const ny = player.y + DY[dir] * PLAYER_SPEED;

            // Bounds check
            const halfCell = CELL / 2 - 2;
            if (nx - halfCell >= 0 && nx + halfCell <= GAME_W &&
                ny - halfCell >= SURFACE_ROWS * CELL && ny + halfCell <= GAME_H) {
                // Snap to grid lane (constrain movement to one axis at a time)
                if (dir === DIR_UP || dir === DIR_DOWN) {
                    const targetX = Math.round((player.x - CELL / 2) / CELL) * CELL + CELL / 2;
                    player.x += (targetX - player.x) * 0.3;
                    player.y = ny;
                } else {
                    const targetY = Math.round((player.y - CELL / 2) / CELL) * CELL + CELL / 2;
                    player.y += (targetY - player.y) * 0.3;
                    player.x = nx;
                }
                // Dig the cell we're on
                const col = Math.floor(player.x / CELL);
                const row = Math.floor(player.y / CELL);
                digCell(col, row);
                player.anim += 0.15;
            }
        }

        // Fire pump
        if ((keys[' '] || touchFire) && !player.pumping) {
            player.pumping = true;
            pumpLine = {
                active: true, dir: player.dir,
                x: player.x, y: player.y,
                dist: 0, maxDist: PUMP_RANGE * CELL,
                targetEnemy: null
            };
            sfxPump();
        }
    }

    function updatePump(dt) {
        if (!pumpLine.active) {
            player.pumping = false;
            return;
        }

        // Extend pump hose
        if (!pumpLine.targetEnemy) {
            pumpLine.dist += 4;
            const tipX = pumpLine.x + DX[pumpLine.dir] * pumpLine.dist;
            const tipY = pumpLine.y + DY[pumpLine.dir] * pumpLine.dist;

            // Check if hit an enemy
            for (const e of enemies) {
                if (e.dead || e.escaped) continue;
                const dx = tipX - e.x, dy = tipY - e.y;
                if (Math.sqrt(dx * dx + dy * dy) < CELL * 0.6) {
                    pumpLine.targetEnemy = e;
                    break;
                }
            }

            // Check if hit dirt wall or max range
            const tipCol = Math.floor(tipX / CELL);
            const tipRow = Math.floor(tipY / CELL);
            if (pumpLine.dist >= pumpLine.maxDist || tipCol < 0 || tipCol >= COLS ||
                tipRow < 0 || tipRow >= ROWS || (!isDug(tipCol, tipRow) && !pumpLine.targetEnemy)) {
                if (!pumpLine.targetEnemy) {
                    pumpLine.active = false;
                    player.pumping = false;
                }
            }
        } else {
            // Pumping an enemy
            const e = pumpLine.targetEnemy;
            if (keys[' '] || touchFire) {
                if (frameCount % 12 === 0) {
                    e.inflateStage++;
                    e.deflateTimer = PUMP_DEFLATE_MS;
                    sfxPump();
                    if (e.inflateStage >= PUMP_STAGES) {
                        killEnemy(e, 'pump');
                        pumpLine.active = false;
                        player.pumping = false;
                    }
                }
            } else {
                // Released pump
                pumpLine.active = false;
                player.pumping = false;
            }
        }
    }

    function killEnemy(e, method) {
        e.dead = true;
        const depthIdx = depthLayer(Math.floor(e.y / CELL));
        const depthMult = DEPTH_SCORE_MULTIPLIER[depthIdx] || 1.0;
        let pts;
        if (method === 'pump') {
            pts = Math.round(PUMP_SCORE_BY_DEPTH[depthIdx] * depthMult);
        } else {
            pts = 0; // rock kills handled separately
        }
        if (pts > 0) {
            score += pts;
            const depthLabel = depthMult > 1 ? ` x${depthMult}` : '';
            addScorePopup(e.x, e.y, pts + depthLabel);
        }
        sfxPop();
        // Burst particles
        const color = e.type === 'pooka' ? '#EF4444' : '#22C55E';
        for (let i = 0; i < 12; i++) {
            particles.push({
                x: e.x, y: e.y,
                vx: rand(-3, 3), vy: rand(-4, 1),
                life: rand(20, 40), maxLife: 40,
                size: rand(2, 5), color
            });
        }
        enemiesKilled++;
        checkVeggieSpawn();
        checkBonusLife();
    }

    function checkBonusLife() {
        if (score >= nextBonusAt) {
            lives++;
            nextBonusAt += BONUS_LIFE_SCORE;
            sfxLevelUp();
        }
    }

    function checkVeggieSpawn() {
        if (enemiesKilled >= 2 && !veggie) {
            const veggieType = Math.min(level, VEGGIE_SCORES.length - 1);
            veggie = {
                col: Math.floor(COLS / 2), row: SURFACE_ROWS - 1,
                type: veggieType, timer: 600, collected: false
            };
        }
    }

    // ── Enemy Update ──
    function updateEnemies(dt) {
        const aliveEnemies = enemies.filter(e => !e.dead && !e.escaped);
        const isLast = aliveEnemies.length === 1;

        for (const e of enemies) {
            if (e.dead || e.escaped) continue;

            // Deflate over time
            if (e.inflateStage > 0 && !player.pumping) {
                e.deflateTimer -= 16;
                if (e.deflateTimer <= 0) {
                    e.inflateStage--;
                    e.deflateTimer = PUMP_DEFLATE_MS;
                }
                if (e.inflateStage > 0) continue; // frozen while inflated
            }
            if (e.inflateStage > 0) continue;

            // Last enemy tries to escape
            if (isLast && !e.ghosting) {
                e.ghosting = true;
                e.ghostTarget = { x: e.x, y: SURFACE_ROWS * CELL / 2 };
            }

            e.anim += 0.1;

            // Fygar fire breath - longer range through tunnels
            if (e.type === 'fygar' && !e.ghosting && Math.random() < 0.004 && !e.firing) {
                const eCol = Math.floor(e.x / CELL);
                const eRow = Math.floor(e.y / CELL);
                const pCol = Math.floor(player.x / CELL);
                const pRow = Math.floor(player.y / CELL);
                if (Math.abs(eRow - pRow) < 2 && isDug(eCol, eRow)) {
                    e.firing = true;
                    e.fireDir = pCol > eCol ? DIR_RIGHT : DIR_LEFT;
                    e.fireFrames = FIRE_DURATION;
                    // Check if firing through a clear tunnel (all cells dug in fire direction)
                    let inTunnel = true;
                    for (let d = 1; d <= FIRE_RANGE; d++) {
                        const checkCol = eCol + DX[e.fireDir] * d;
                        if (checkCol < 0 || checkCol >= COLS || !isDug(checkCol, eRow)) {
                            inTunnel = false;
                            break;
                        }
                    }
                    const effectiveRange = inTunnel ? FIRE_RANGE_TUNNEL : FIRE_RANGE;
                    fireBreaths.push({
                        x: e.x, y: e.y, dir: e.fireDir,
                        timer: FIRE_DURATION, fygar: e,
                        range: effectiveRange
                    });
                    sfxFire();
                }
            }
            if (e.firing) {
                e.fireFrames--;
                if (e.fireFrames <= 0) e.firing = false;
            }

            if (e.ghosting) {
                // Ghost movement: move through dirt toward target
                const target = e.ghostTarget || { x: player.x, y: player.y };
                const dx = target.x - e.x, dy = target.y - e.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 2) {
                    e.x += (dx / dist) * GHOST_SPEED;
                    e.y += (dy / dist) * GHOST_SPEED;
                }

                // Reached surface -> escape
                if (isLast && e.y < SURFACE_ROWS * CELL) {
                    e.escaped = true;
                    continue;
                }

                // If reached a dug tunnel, stop ghosting
                const eCol = Math.floor(e.x / CELL);
                const eRow = Math.floor(e.y / CELL);
                if (isDug(eCol, eRow) && !isLast) {
                    e.ghosting = false;
                    e.ghostTimer = 0;
                }
            } else {
                // Normal movement in tunnels
                const eCol = Math.floor(e.x / CELL);
                const eRow = Math.floor(e.y / CELL);

                // Move in current direction
                const nx = e.x + DX[e.dir] * e.speed;
                const ny = e.y + DY[e.dir] * e.speed;
                const nCol = Math.floor(nx / CELL);
                const nRow = Math.floor(ny / CELL);

                if (nCol >= 0 && nCol < COLS && nRow >= 0 && nRow < ROWS && isDug(nCol, nRow)) {
                    e.x = nx;
                    e.y = ny;
                } else {
                    // Pick new direction, prefer toward player
                    const possibleDirs = [];
                    for (let d = 0; d < 4; d++) {
                        const tc = eCol + DX[d], tr = eRow + DY[d];
                        if (tc >= 0 && tc < COLS && tr >= 0 && tr < ROWS && isDug(tc, tr)) {
                            possibleDirs.push(d);
                        }
                    }
                    if (possibleDirs.length > 0) {
                        // Bias toward player
                        const pdx = player.x - e.x, pdy = player.y - e.y;
                        possibleDirs.sort((a, b) => {
                            const sa = pdx * DX[a] + pdy * DY[a];
                            const sb = pdx * DX[b] + pdy * DY[b];
                            return sb - sa;
                        });
                        e.dir = Math.random() < 0.7 ? possibleDirs[0] : possibleDirs[randInt(0, possibleDirs.length - 1)];
                    }
                }

                // Random chance to ghost
                if (!isLast && Math.random() < GHOST_CHANCE) {
                    e.ghosting = true;
                    e.ghostTarget = { x: player.x, y: player.y };
                    e.ghostTimer = 300; // frames to ghost
                }
            }

            // Check collision with player
            const dx = e.x - player.x, dy = e.y - player.y;
            if (Math.sqrt(dx * dx + dy * dy) < CELL * 0.7 && e.inflateStage === 0) {
                playerDeath();
                return;
            }
        }

        // Check if all enemies dealt with
        const remaining = enemies.filter(e => !e.dead && !e.escaped);
        if (remaining.length === 0) {
            nextLevel();
        }
    }

    // ── Fire Breath Update ──
    function updateFireBreaths() {
        for (let i = fireBreaths.length - 1; i >= 0; i--) {
            const f = fireBreaths[i];
            f.timer--;
            if (f.timer <= 0) {
                fireBreaths.splice(i, 1);
                continue;
            }
            // Check if fire hits player
            const fRange = f.range || FIRE_RANGE;
            for (let dist = 0; dist < fRange; dist++) {
                const fx = f.x + DX[f.dir] * dist * CELL;
                const fy = f.y;
                const dx = fx - player.x, dy = fy - player.y;
                if (Math.sqrt(dx * dx + dy * dy) < CELL * 0.8) {
                    playerDeath();
                    return;
                }
            }
        }
    }

    // ── Rock Update ──
    function updateRocks() {
        for (const rock of rocks) {
            if (rock.removed) continue;

            if (!rock.falling) {
                // Check if dirt below was dug
                const belowRow = rock.row + 1;
                if (belowRow < ROWS && isDug(rock.col, belowRow)) {
                    rock.settleTimer++;
                    // Increasingly violent wobble as it's about to fall
                    const wobbleIntensity = rock.settleTimer / ROCK_SETTLE_FRAMES;
                    const wobbleFreq = 0.3 + wobbleIntensity * 0.7;
                    rock.shakeAnim = Math.sin(rock.settleTimer * wobbleFreq) * (1 + wobbleIntensity * 4);
                    // Visual warning particles when close to falling
                    if (wobbleIntensity > 0.5 && frameCount % 8 === 0) {
                        particles.push({
                            x: rock.col * CELL + CELL / 2 + rand(-6, 6),
                            y: rock.row * CELL + CELL,
                            vx: rand(-0.5, 0.5), vy: rand(0.5, 1.5),
                            life: 15, maxLife: 15,
                            size: rand(1, 3), color: '#9CA3AF'
                        });
                    }
                    if (rock.settleTimer > ROCK_SETTLE_FRAMES) {
                        rock.falling = true;
                        rock.settled = false;
                        rock.vy = 0;
                        rock.crushCount = 0;
                        sfxRockFall();
                    }
                } else {
                    rock.settleTimer = 0;
                    rock.shakeAnim = 0;
                }
            } else {
                // Falling
                rock.vy = Math.min(rock.vy + 0.15, ROCK_FALL_SPEED);
                rock.y += rock.vy;
                const newRow = Math.floor(rock.y / CELL);

                // Crush enemies
                for (const e of enemies) {
                    if (e.dead) continue;
                    const dx = (rock.col * CELL + CELL / 2) - e.x;
                    const dy = (rock.y + CELL / 2) - e.y;
                    if (Math.abs(dx) < CELL * 0.7 && Math.abs(dy) < CELL * 0.7) {
                        e.dead = true;
                        rock.crushCount++;
                        // Crush particles
                        for (let j = 0; j < 8; j++) {
                            particles.push({
                                x: e.x, y: e.y,
                                vx: rand(-2, 2), vy: rand(-3, 0),
                                life: rand(15, 30), maxLife: 30,
                                size: rand(2, 4), color: '#8B7355'
                            });
                        }
                        sfxCrush();
                        enemiesKilled++;
                        checkVeggieSpawn();
                    }
                }

                // Crush player
                const dx = (rock.col * CELL + CELL / 2) - player.x;
                const dy = (rock.y + CELL / 2) - player.y;
                if (Math.abs(dx) < CELL * 0.6 && Math.abs(dy) < CELL * 0.6) {
                    playerDeath();
                }

                // Hit solid ground
                if (newRow >= ROWS - 1 || (newRow > rock.row && !isDug(rock.col, newRow + 1))) {
                    rock.falling = false;
                    rock.row = newRow;
                    rock.y = rock.row * CELL;
                    // Award crush bonus
                    if (rock.crushCount > 0) {
                        const bonus = ROCK_KILL_SCORES[Math.min(rock.crushCount, ROCK_KILL_SCORES.length - 1)];
                        score += bonus;
                        addScorePopup(rock.col * CELL + CELL / 2, rock.y + CELL / 2, bonus);
                        screenShake = 8;
                        checkBonusLife();
                    }
                    // Remove rock after landing
                    setTimeout(() => { rock.removed = true; }, 500);
                }

                // Dig through dirt as it falls
                if (newRow >= 0 && newRow < ROWS) {
                    digCell(rock.col, newRow);
                }
            }
        }
    }

    // ── Veggie Update ──
    function updateVeggie() {
        if (!veggie || veggie.collected) return;
        veggie.timer--;
        if (veggie.timer <= 0) { veggie = null; return; }

        const vx = veggie.col * CELL + CELL / 2;
        const vy = veggie.row * CELL + CELL / 2;
        const dx = vx - player.x, dy = vy - player.y;
        if (Math.sqrt(dx * dx + dy * dy) < CELL * 0.8) {
            veggie.collected = true;
            const pts = VEGGIE_SCORES[veggie.type];
            score += pts;
            addScorePopup(vx, vy, pts);
            sfxVeggie();
            checkBonusLife();
        }
    }

    // ── Death / Level ──
    function playerDeath() {
        if (state !== ST_PLAYING) return;
        lives--;
        state = ST_DYING;
        deathTimer = DEATH_ANIM_MS;
        sfxDeath();
        screenShake = 12;
        // Death burst
        for (let i = 0; i < 16; i++) {
            particles.push({
                x: player.x, y: player.y,
                vx: rand(-3, 3), vy: rand(-4, 1),
                life: rand(25, 50), maxLife: 50,
                size: rand(2, 6), color: playerColor || '#06B6D4'
            });
        }
    }

    function nextLevel() {
        level++;
        state = ST_LEVEL_SPLASH;
        levelSplashTimer = LEVEL_SPLASH_MS;
        initLevel();
        sfxLevelUp();
    }

    // ── Particles ──
    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy; p.vy += 0.1;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function addScorePopup(x, y, pts) {
        scorePopups.push({ x, y, text: '' + pts, life: 60, maxLife: 60 });
    }

    function updateScorePopups() {
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const s = scorePopups[i];
            s.y -= 0.5; s.life--;
            if (s.life <= 0) scorePopups.splice(i, 1);
        }
    }

    // ── Drawing ──
    function draw() {
        ctx.save();
        // Screen shake
        if (screenShake > 0) {
            ctx.translate(rand(-screenShake, screenShake) * SCALE, rand(-screenShake, screenShake) * SCALE);
            screenShake *= 0.85;
            if (screenShake < 0.5) screenShake = 0;
        }

        // Sky
        ctx.fillStyle = SKY_COLOR;
        ctx.fillRect(0, 0, W, gs(SURFACE_ROWS * CELL));

        // Draw sun with rays
        const sunX = gs(GAME_W - 50), sunY = gs(20);
        // Sun glow
        ctx.fillStyle = '#FCD34D20';
        ctx.beginPath(); ctx.arc(sunX, sunY, gs(35), 0, Math.PI * 2); ctx.fill();
        // Sun rays
        ctx.strokeStyle = '#FBBF2440';
        ctx.lineWidth = gs(2);
        for (let ray = 0; ray < 8; ray++) {
            const ra = (ray / 8) * Math.PI * 2 + frameCount * 0.003;
            ctx.beginPath();
            ctx.moveTo(sunX + Math.cos(ra) * gs(22), sunY + Math.sin(ra) * gs(22));
            ctx.lineTo(sunX + Math.cos(ra) * gs(32), sunY + Math.sin(ra) * gs(32));
            ctx.stroke();
        }
        // Sun body
        ctx.fillStyle = '#FCD34D';
        ctx.beginPath(); ctx.arc(sunX, sunY, gs(18), 0, Math.PI * 2); ctx.fill();
        // Sun highlight
        ctx.fillStyle = '#FEF9C3';
        ctx.beginPath(); ctx.arc(sunX - gs(5), sunY - gs(5), gs(8), 0, Math.PI * 2); ctx.fill();
        // Outer glow
        ctx.fillStyle = '#FBBF2440';
        ctx.beginPath(); ctx.arc(sunX, sunY, gs(24), 0, Math.PI * 2); ctx.fill();

        // Clouds
        ctx.fillStyle = '#FFFFFF80';
        drawCloud(80, 12, 30);
        drawCloud(250, 20, 22);
        drawCloud(400, 8, 26);

        // Dirt layers
        for (let r = SURFACE_ROWS; r < ROWS; r++) {
            const dl = depthLayer(r);
            for (let c = 0; c < COLS; c++) {
                const x = gs(c * CELL), y = gs(r * CELL);
                const w = gs(CELL), h = gs(CELL);

                if (!isDug(c, r)) {
                    // Try sprite dirt
                    if (allSpritesReady && sprites['dirtCenter']) {
                        ctx.drawImage(sprites['dirtCenter'], x, y, w + 1, h + 1);
                    } else {
                    // Solid dirt fallback
                    ctx.fillStyle = DIRT_COLORS[dl];
                    ctx.fillRect(x, y, w + 1, h + 1);
                    // Dirt texture (speckles)
                    ctx.fillStyle = DIRT_DARK[dl];
                    const seed = c * 17 + r * 31;
                    for (let s = 0; s < 3; s++) {
                        const sx = ((seed * (s + 1) * 7) % 26) + 2;
                        const sy = ((seed * (s + 1) * 13) % 22) + 4;
                        ctx.fillRect(x + gs(sx), y + gs(sy), gs(2), gs(2));
                    }
                    // Small rocks in dirt
                    if ((seed % 7) === 0) {
                        ctx.fillStyle = '#A0907080';
                        ctx.beginPath();
                        ctx.arc(x + gs(15), y + gs(18), gs(3), 0, Math.PI * 2);
                        ctx.fill();
                    }
                    // Embedded gems/crystals that sparkle
                    if (gems) {
                        for (const gem of gems) {
                            if (gem.col === c && gem.row === r) {
                                const sparkle = Math.sin(frameCount * 0.08 + gem.phase) * 0.5 + 0.5;
                                ctx.globalAlpha = 0.4 + sparkle * 0.5;
                                ctx.fillStyle = gem.color;
                                ctx.beginPath();
                                // Diamond shape
                                const gx2 = x + gs(gem.ox);
                                const gy2 = y + gs(gem.oy);
                                const gSize = gs(gem.size);
                                ctx.moveTo(gx2, gy2 - gSize);
                                ctx.lineTo(gx2 + gSize * 0.7, gy2);
                                ctx.lineTo(gx2, gy2 + gSize);
                                ctx.lineTo(gx2 - gSize * 0.7, gy2);
                                ctx.closePath();
                                ctx.fill();
                                // Sparkle highlight
                                if (sparkle > 0.7) {
                                    ctx.fillStyle = '#FFFFFF';
                                    ctx.globalAlpha = (sparkle - 0.7) * 3;
                                    ctx.beginPath();
                                    ctx.arc(gx2, gy2 - gSize * 0.3, gs(1), 0, Math.PI * 2);
                                    ctx.fill();
                                }
                                ctx.globalAlpha = 1;
                            }
                        }
                    }
                    } // end else (fallback dirt)
                } else if (r >= SURFACE_ROWS) {
                    // Dug tunnel - darker background
                    ctx.fillStyle = '#1A1008';
                    ctx.fillRect(x, y, w + 1, h + 1);

                    // Tunnel edges (carved dirt walls)
                    drawTunnelEdges(c, r, x, y, w, h, dl);
                }
            }
        }

        // Grass strip at surface
        ctx.fillStyle = GRASS_COLOR;
        ctx.fillRect(0, gs((SURFACE_ROWS - 1) * CELL + CELL / 2), W, gs(CELL));
        ctx.fillStyle = GRASS_DARK;
        for (let i = 0; i < COLS * 2; i++) {
            const gx = gs(i * CELL / 2);
            const gy = gs((SURFACE_ROWS - 1) * CELL + CELL / 2);
            ctx.fillRect(gx, gy, gs(2), gs(4 + Math.sin(i * 0.8) * 3));
        }

        // Flowers on surface
        drawSurfaceFlowers();

        // Rocks
        for (const rock of rocks) {
            if (rock.removed) continue;
            drawRock(rock);
        }

        // Fire breaths
        for (const f of fireBreaths) {
            drawFireBreath(f);
        }

        // Pump line
        if (pumpLine.active) {
            drawPumpLine();
        }

        // Enemies
        for (const e of enemies) {
            if (e.dead || e.escaped) continue;
            // Try sprite enemy
            let enemySpriteDrawn = false;
            if (allSpritesReady) {
                const anim = Math.floor(frameCount / 10) % 2 === 0;
                let spr = null;
                const sw = gs(CELL * 0.85), sh = gs(CELL * 0.9);
                if (e.type === 'pooka') {
                    if (e.inflateStage > 0) spr = sprites['enemySlimeH'];
                    else spr = sprites[anim ? 'enemySlime' : 'enemySlimeM'];
                } else {
                    if (e.ghosting) spr = sprites['enemyLadybugF'];
                    else spr = sprites[anim ? 'enemyLadybug' : 'enemyLadybugM'];
                }
                if (spr) {
                    const inflate = 1 + (e.inflateStage || 0) * 0.15;
                    ctx.drawImage(spr, gs(e.x) - sw * inflate / 2, gs(e.y) - sh * inflate / 2, sw * inflate, sh * inflate);
                    enemySpriteDrawn = true;
                }
            }
            if (!enemySpriteDrawn) {
                if (e.type === 'pooka') drawPooka(e);
                else drawFygar(e);
            }
        }

        // Veggie
        if (veggie && !veggie.collected) drawVeggie();

        // Player
        if (state !== ST_DYING || Math.floor(deathTimer / 100) % 2) {
            drawPlayer();
        }

        // Particles
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(gs(p.x - p.size / 2), gs(p.y - p.size / 2), gs(p.size), gs(p.size));
        }
        ctx.globalAlpha = 1;

        // Score popups
        for (const s of scorePopups) {
            const alpha = s.life / s.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = gs(2);
            ctx.font = `bold ${gs(11)}px monospace`;
            ctx.textAlign = 'center';
            ctx.strokeText(s.text, gs(s.x), gs(s.y));
            ctx.fillText(s.text, gs(s.x), gs(s.y));
        }
        ctx.globalAlpha = 1;

        // Vignette
        const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.8);
        vg.addColorStop(0, 'transparent');
        vg.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);

        // HUD
        drawHUD();

        if (state === ST_PLAYING) drawOnScreenControls(ctx, W, H, gs, ['PUMP'], 'LRUD');

        ctx.restore();

        // Overlays
        if (state === ST_TITLE) drawTitleScreen();
        else if (state === ST_LEVEL_SPLASH) drawLevelSplash();
        else if (state === ST_GAMEOVER) drawGameOver();
    }

    function drawTunnelEdges(c, r, x, y, w, h, dl) {
        const edgeW = gs(3);
        const edgeColor = DIRT_DARK[dl] + 'C0';
        ctx.fillStyle = edgeColor;
        // Left edge
        if (c > 0 && !isDug(c - 1, r)) ctx.fillRect(x, y, edgeW, h);
        // Right edge
        if (c < COLS - 1 && !isDug(c + 1, r)) ctx.fillRect(x + w - edgeW, y, edgeW, h);
        // Top edge
        if (r > 0 && !isDug(c, r - 1)) ctx.fillRect(x, y, w, edgeW);
        // Bottom edge
        if (r < ROWS - 1 && !isDug(c, r + 1)) ctx.fillRect(x, y + h - edgeW, w, edgeW);
    }

    function drawCloud(cx, cy, size) {
        const x = gs(cx), y = gs(cy), s = gs(size);
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.arc(x + s * 0.8, y - s * 0.3, s * 0.7, 0, Math.PI * 2);
        ctx.arc(x + s * 1.4, y, s * 0.6, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawSurfaceFlowers() {
        const flowerColors = ['#EF4444', '#FBBF24', '#EC4899', '#8B5CF6', '#06B6D4'];
        for (let i = 0; i < 6; i++) {
            const fx = gs(30 + i * 80 + Math.sin(i * 2.3) * 20);
            const fy = gs((SURFACE_ROWS - 1) * CELL + CELL / 2 - 4);
            // Stem
            ctx.strokeStyle = '#22C55E';
            ctx.lineWidth = gs(1.5);
            ctx.beginPath(); ctx.moveTo(fx, fy + gs(8)); ctx.lineTo(fx, fy); ctx.stroke();
            // Petals
            ctx.fillStyle = flowerColors[i % flowerColors.length];
            for (let p = 0; p < 5; p++) {
                const a = (p / 5) * Math.PI * 2 + frameCount * 0.01;
                ctx.beginPath();
                ctx.arc(fx + Math.cos(a) * gs(3), fy + Math.sin(a) * gs(3), gs(2.5), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#FBBF24';
            ctx.beginPath(); ctx.arc(fx, fy, gs(2), 0, Math.PI * 2); ctx.fill();
        }
    }

    function drawPlayer() {
        const px = gs(player.x), py = gs(player.y);
        const s = gs(CELL * 0.42);
        const flip = player.dir === DIR_LEFT ? -1 : 1;

        // Try sprite player
        if (allSpritesReady) {
            const moving = player.moveDir !== DIR_NONE;
            let sprKey;
            if (state === ST_DYING) sprKey = 'playerHit';
            else if (player.pumping) sprKey = 'playerDuck';
            else if (moving) sprKey = (Math.floor(frameCount / 8) % 2 === 0) ? 'playerWalk1' : 'playerWalk2';
            else sprKey = 'playerStand';
            const spr = sprites[sprKey];
            if (spr) {
                const sw = gs(CELL * 0.9), sh = gs(CELL * 0.95);
                ctx.save();
                if (player.dir === DIR_LEFT) {
                    ctx.translate(px + sw / 2, py - sh / 2);
                    ctx.scale(-1, 1);
                    ctx.drawImage(spr, 0, 0, sw, sh);
                } else {
                    ctx.drawImage(spr, px - sw / 2, py - sh / 2, sw, sh);
                }
                ctx.restore();
                return;
            }
        }

        ctx.save();
        ctx.translate(px, py);
        if (player.dir === DIR_LEFT) ctx.scale(-1, 1);

        // Body (blue suit)
        const bodyColor = playerColor || '#3B82F6';
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fill();

        // White face area
        ctx.fillStyle = '#FDE68A';
        ctx.beginPath();
        ctx.arc(gs(2), gs(-2), s * 0.55, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#1E293B';
        ctx.beginPath();
        ctx.arc(gs(3), gs(-4), gs(2), 0, Math.PI * 2);
        ctx.fill();

        // Helmet visor
        ctx.strokeStyle = '#FFFFFF60';
        ctx.lineWidth = gs(1.5);
        ctx.beginPath();
        ctx.arc(gs(2), gs(-2), s * 0.6, -0.8, 0.8);
        ctx.stroke();

        // Pump/drill arm
        const armY = gs(2);
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = gs(3);
        ctx.beginPath();
        ctx.moveTo(s * 0.6, armY);
        const walkBob = Math.sin(player.anim * 3) * gs(2);
        ctx.lineTo(s + gs(6), armY + walkBob);
        ctx.stroke();

        // Pump nozzle
        ctx.fillStyle = '#EF4444';
        ctx.fillRect(s + gs(4), armY + walkBob - gs(2), gs(6), gs(4));

        // Legs walking animation
        const legSwing = Math.sin(player.anim * 4) * gs(4);
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = gs(3);
        ctx.beginPath(); ctx.moveTo(gs(-3), s); ctx.lineTo(gs(-3) + legSwing, s + gs(6)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gs(3), s); ctx.lineTo(gs(3) - legSwing, s + gs(6)); ctx.stroke();

        // Boots
        ctx.fillStyle = '#7C3AED';
        ctx.fillRect(gs(-5) + legSwing, s + gs(4), gs(5), gs(3));
        ctx.fillRect(gs(1) - legSwing, s + gs(4), gs(5), gs(3));

        ctx.restore();
    }

    function drawPooka(e) {
        const ex = gs(e.x), ey = gs(e.y);
        const inflate = e.inflateStage / PUMP_STAGES;
        const baseSize = gs(CELL * 0.4);
        // Multi-stage stretch: grows wider and taller in stages
        const stretchX = 1 + inflate * 1.0;
        const stretchY = 1 + inflate * 0.6;
        const s = baseSize;

        ctx.save();
        ctx.translate(ex, ey);
        ctx.scale(stretchX, stretchY);

        // Ghost effect
        if (e.ghosting) {
            ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.2) * 0.2;
        }

        // Body gets progressively redder as inflated
        const redShift = inflate;
        const r = Math.min(255, Math.floor(239 + redShift * 16));
        const g = Math.max(0, Math.floor(68 - redShift * 68));
        const b = Math.max(0, Math.floor(68 - redShift * 68));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        // Pulsing size when inflated
        const pulseFactor = e.inflateStage > 0 ? 1 + Math.sin(frameCount * 0.3) * 0.05 * e.inflateStage : 1;
        ctx.beginPath();
        ctx.arc(0, 0, s * pulseFactor, 0, Math.PI * 2);
        ctx.fill();

        // Darker circle inside
        ctx.fillStyle = `rgba(${Math.max(0,r-40)},${Math.max(0,g-20)},${Math.max(0,b-20)},0.5)`;
        ctx.beginPath();
        ctx.arc(gs(-2), gs(2), s * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Goggles (stretch with body)
        ctx.fillStyle = '#FFFFFF';
        const goggleSpread = 4 + inflate * 2;
        ctx.beginPath(); ctx.arc(gs(-goggleSpread), gs(-3), gs(4), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(gs(goggleSpread), gs(-3), gs(4), 0, Math.PI * 2); ctx.fill();
        // Goggle strap
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = gs(1.5);
        ctx.beginPath(); ctx.moveTo(gs(-goggleSpread - 4), gs(-3)); ctx.lineTo(gs(goggleSpread + 4), gs(-3)); ctx.stroke();
        // Pupils (widen in panic as inflated)
        ctx.fillStyle = '#1E293B';
        const pupilSize = 2 + inflate * 0.8;
        ctx.beginPath(); ctx.arc(gs(-goggleSpread + 1), gs(-3), gs(pupilSize), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(gs(goggleSpread + 1), gs(-3), gs(pupilSize), 0, Math.PI * 2); ctx.fill();
        // Panic sweat drops when inflated
        if (e.inflateStage >= 2) {
            ctx.fillStyle = '#60A5FA';
            ctx.beginPath();
            ctx.arc(gs(goggleSpread + 5), gs(-1 + Math.sin(frameCount * 0.15) * 2), gs(1.5), 0, Math.PI * 2);
            ctx.fill();
        }

        // Feet stubs
        if (e.inflateStage === 0) {
            const feetBob = Math.sin(e.anim * 4) * gs(2);
            ctx.fillStyle = '#B91C1C';
            ctx.fillRect(gs(-6), s - gs(2) + feetBob, gs(5), gs(4));
            ctx.fillRect(gs(2), s - gs(2) - feetBob, gs(5), gs(4));
        }

        // Inflate stress marks - more dramatic
        if (e.inflateStage >= 1) {
            ctx.strokeStyle = `rgba(255,255,255,${0.3 + inflate * 0.4})`;
            ctx.lineWidth = gs(1 + inflate);
            const markCount = 3 + e.inflateStage * 2;
            for (let i = 0; i < markCount; i++) {
                const a = (i / markCount) * Math.PI * 2 + frameCount * 0.05;
                const r1 = s * (0.6 + inflate * 0.1), r2 = s * (0.9 + inflate * 0.1);
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
                ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
                ctx.stroke();
            }
        }

        // About-to-pop veins at stage 3
        if (e.inflateStage >= 3) {
            ctx.strokeStyle = '#FCA5A5';
            ctx.lineWidth = gs(0.8);
            for (let v = 0; v < 5; v++) {
                const va = (v / 5) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(va) * s * 0.3, Math.sin(va) * s * 0.3);
                ctx.quadraticCurveTo(
                    Math.cos(va + 0.3) * s * 0.6, Math.sin(va + 0.3) * s * 0.6,
                    Math.cos(va) * s * 0.85, Math.sin(va) * s * 0.85
                );
                ctx.stroke();
            }
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawFygar(e) {
        const ex = gs(e.x), ey = gs(e.y);
        const inflate = e.inflateStage / PUMP_STAGES;
        const baseSize = gs(CELL * 0.42);
        // Stretch in stages like Pooka
        const stretchX = 1 + inflate * 0.8;
        const stretchY = 1 + inflate * 0.5;
        const s = baseSize;
        const facing = e.dir === DIR_LEFT ? -1 : 1;

        ctx.save();
        ctx.translate(ex, ey);
        ctx.scale(e.dir === DIR_LEFT ? -stretchX : stretchX, stretchY);

        if (e.ghosting) ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.2) * 0.2;

        // Body (green dragon) - gets lighter/redder as inflated
        const greenR = Math.min(255, 34 + Math.floor(inflate * 120));
        const greenG = Math.max(100, 197 - Math.floor(inflate * 60));
        const greenB = Math.max(50, 94 - Math.floor(inflate * 44));
        ctx.fillStyle = `rgb(${greenR},${greenG},${greenB})`;
        // Elongated body
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.2, s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Belly stripe
        ctx.fillStyle = '#BBF7D0';
        ctx.beginPath();
        ctx.ellipse(gs(2), gs(3), s * 0.7, s * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head/snout
        ctx.fillStyle = e.inflateStage > 0 ? '#4ADE80' : '#22C55E';
        ctx.beginPath();
        ctx.arc(s * 0.9, gs(-2), s * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Eye
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(s * 0.8, gs(-5), gs(3.5), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1E293B';
        ctx.beginPath(); ctx.arc(s * 0.9, gs(-5), gs(2), 0, Math.PI * 2); ctx.fill();
        // Angry brow
        ctx.strokeStyle = '#166534';
        ctx.lineWidth = gs(2);
        ctx.beginPath(); ctx.moveTo(s * 0.5, gs(-8)); ctx.lineTo(s * 1.1, gs(-6)); ctx.stroke();

        // Small wings
        ctx.fillStyle = '#16A34A80';
        const wingFlap = Math.sin(e.anim * 5) * gs(3);
        ctx.beginPath();
        ctx.moveTo(gs(-2), gs(-4));
        ctx.lineTo(gs(-10), gs(-12) + wingFlap);
        ctx.lineTo(gs(-4), gs(-2));
        ctx.fill();

        // Tail
        ctx.strokeStyle = '#16A34A';
        ctx.lineWidth = gs(3);
        ctx.beginPath();
        ctx.moveTo(-s * 0.9, gs(2));
        ctx.quadraticCurveTo(-s * 1.3, gs(-4), -s * 1.6, gs(-2));
        ctx.stroke();

        // Feet
        if (e.inflateStage === 0) {
            const fb = Math.sin(e.anim * 4) * gs(2);
            ctx.fillStyle = '#15803D';
            ctx.fillRect(gs(-4), s - gs(2) + fb, gs(4), gs(3));
            ctx.fillRect(gs(3), s - gs(2) - fb, gs(4), gs(3));
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawFireBreath(f) {
        const progress = 1 - f.timer / FIRE_DURATION;
        const effectiveRange = f.range || FIRE_RANGE;
        const length = effectiveRange * CELL * Math.min(progress * 3, 1);

        ctx.save();
        for (let d = 0; d < length; d += 4) {
            const alpha = 1 - (d / length) * 0.6;
            const wave = Math.sin(d * 0.15 + frameCount * 0.3) * 4;
            const size = 6 + (d / length) * 8;
            const fx = f.x + DX[f.dir] * d;
            const fy = f.y + wave;

            ctx.globalAlpha = alpha * (f.timer / FIRE_DURATION);
            ctx.fillStyle = d / length < 0.3 ? '#FBBF24' : d / length < 0.6 ? '#F97316' : '#EF4444';
            ctx.beginPath();
            ctx.arc(gs(fx), gs(fy), gs(size / 2), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawRock(rock_) {
        const rock = rock_;
        // Try sprite rock
        if (allSpritesReady && sprites['rock']) {
            const rx = gs(rock.col * CELL), ry = gs(rock.y || rock.row * CELL);
            ctx.drawImage(sprites['rock'], rx, ry, gs(CELL), gs(CELL));
            return;
        }
        // Original drawRock follows as fallback
        drawRockFallback(rock);
    }
    function drawRockFallback(rock) {
        const rx = gs(rock.col * CELL + rock.shakeAnim);
        const ry = gs(rock.y);
        const rw = gs(CELL - 2);
        const rh = gs(CELL - 2);

        ctx.save();
        ctx.translate(rx + rw / 2, ry + rh / 2);

        // Main rock body
        ctx.fillStyle = '#9CA3AF';
        ctx.beginPath();
        ctx.moveTo(-rw * 0.45, -rh * 0.3);
        ctx.lineTo(-rw * 0.2, -rh * 0.48);
        ctx.lineTo(rw * 0.15, -rh * 0.45);
        ctx.lineTo(rw * 0.45, -rh * 0.2);
        ctx.lineTo(rw * 0.42, rh * 0.3);
        ctx.lineTo(rw * 0.1, rh * 0.45);
        ctx.lineTo(-rw * 0.3, rh * 0.4);
        ctx.lineTo(-rw * 0.48, rh * 0.1);
        ctx.closePath();
        ctx.fill();

        // Highlights
        ctx.fillStyle = '#D1D5DB';
        ctx.beginPath();
        ctx.moveTo(-rw * 0.3, -rh * 0.35);
        ctx.lineTo(0, -rh * 0.4);
        ctx.lineTo(rw * 0.1, -rh * 0.1);
        ctx.lineTo(-rw * 0.15, -rh * 0.05);
        ctx.closePath();
        ctx.fill();

        // Cracks
        ctx.strokeStyle = '#6B7280';
        ctx.lineWidth = gs(1);
        ctx.beginPath(); ctx.moveTo(-rw * 0.1, -rh * 0.2); ctx.lineTo(rw * 0.15, rh * 0.1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rw * 0.05, -rh * 0.3); ctx.lineTo(rw * 0.25, rh * 0.05); ctx.stroke();

        // Shadow
        ctx.fillStyle = '#4B5563';
        ctx.beginPath();
        ctx.ellipse(rw * 0.05, rh * 0.48, rw * 0.4, rh * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function drawPumpLine() {
        const startX = gs(player.x + DX[pumpLine.dir] * CELL * 0.4);
        const startY = gs(player.y + DY[pumpLine.dir] * CELL * 0.4);
        const endX = gs(pumpLine.x + DX[pumpLine.dir] * pumpLine.dist);
        const endY = gs(pumpLine.y + DY[pumpLine.dir] * pumpLine.dist);

        // Hose body with stretch effect (thinner as it extends further)
        const distRatio = pumpLine.dist / pumpLine.maxDist;
        const hoseWidth = 3.5 - distRatio * 1.5;

        // Outer hose
        ctx.strokeStyle = '#D97706';
        ctx.lineWidth = gs(hoseWidth + 1);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        // Slight wave in the hose for stretch feel
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        const perpX = -(endY - startY) * 0.02 * Math.sin(frameCount * 0.15);
        const perpY = (endX - startX) * 0.02 * Math.sin(frameCount * 0.15);
        ctx.quadraticCurveTo(midX + perpX, midY + perpY, endX, endY);
        ctx.stroke();

        // Inner hose (bright)
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = gs(hoseWidth);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(midX + perpX, midY + perpY, endX, endY);
        ctx.stroke();

        // Animated dash marks showing air flow
        ctx.strokeStyle = '#FDE68A';
        ctx.lineWidth = gs(1.5);
        const dashOffset = (frameCount * 2) % 14;
        ctx.setLineDash([gs(3), gs(4)]);
        ctx.lineDashOffset = -gs(dashOffset);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;

        // Nozzle tip with glow
        ctx.fillStyle = '#EF4444';
        ctx.shadowColor = '#EF4444';
        ctx.shadowBlur = gs(4);
        ctx.beginPath();
        ctx.arc(endX, endY, gs(3.5), 0, Math.PI * 2);
        ctx.fill();
        // Nozzle opening
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(endX + gs(DX[pumpLine.dir] * 2), endY + gs(DY[pumpLine.dir] * 2), gs(1.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Pump pulse effect when connected to enemy
        if (pumpLine.targetEnemy && frameCount % 6 < 3) {
            ctx.fillStyle = '#FDE68A';
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.arc(endX, endY, gs(5), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    function drawVeggie() {
        const vx = gs(veggie.col * CELL + CELL / 2);
        const vy = gs(veggie.row * CELL + CELL / 2);
        const bob = Math.sin(frameCount * 0.08) * gs(3);
        const s = gs(10);

        ctx.save();
        ctx.translate(vx, vy + bob);

        // Different veggies per level
        const colors = ['#22C55E', '#EF4444', '#F97316', '#8B5CF6', '#06B6D4', '#FBBF24', '#EC4899', '#10B981'];
        const color = colors[veggie.type % colors.length];

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fill();

        // Shine
        ctx.fillStyle = '#FFFFFF40';
        ctx.beginPath();
        ctx.arc(-s * 0.3, -s * 0.3, s * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Stem
        ctx.strokeStyle = '#16A34A';
        ctx.lineWidth = gs(2);
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(gs(3), -s - gs(5)); ctx.stroke();
        // Leaf
        ctx.fillStyle = '#22C55E';
        ctx.beginPath();
        ctx.ellipse(gs(4), -s - gs(4), gs(4), gs(2), 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Sparkle
        if (frameCount % 30 < 15) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `${gs(8)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('✦', gs(8), -s - gs(2));
        }

        ctx.restore();
    }

    // ── HUD ──
    function drawHUD() {
        const hudY = gs(8);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${gs(13)}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE ${score}`, gs(8), hudY + gs(12));
        ctx.textAlign = 'right';
        ctx.fillText(`LV ${level}`, gs(GAME_W - 8), hudY + gs(12));

        // Lives
        ctx.textAlign = 'left';
        for (let i = 0; i < lives; i++) {
            const lx = gs(8 + i * 18);
            const ly = gs(GAME_H - 16);
            ctx.fillStyle = playerColor || '#3B82F6';
            ctx.beginPath(); ctx.arc(lx, ly, gs(5), 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#FDE68A';
            ctx.beginPath(); ctx.arc(lx + gs(1), ly - gs(1), gs(2.5), 0, Math.PI * 2); ctx.fill();
        }
    }

    function drawTitleScreen() {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';

        // Title
        ctx.fillStyle = '#EF4444';
        ctx.font = `bold ${gs(42)}px monospace`;
        ctx.fillText('DIG DUG', W / 2, H * 0.28);

        // Subtitle
        ctx.fillStyle = '#FBBF24';
        ctx.font = `${gs(14)}px monospace`;
        ctx.fillText('UNDERGROUND ADVENTURE', W / 2, H * 0.36);

        // Instructions
        ctx.fillStyle = '#E0E7FF';
        ctx.font = `${gs(12)}px monospace`;
        ctx.fillText('ARROW KEYS TO MOVE', W / 2, H * 0.50);
        ctx.fillText('SPACE TO PUMP ENEMIES', W / 2, H * 0.56);
        ctx.fillText('DIG TUNNELS & POP ENEMIES', W / 2, H * 0.62);

        // Blinking prompt
        if (Math.floor(frameCount / 30) % 2 === 0) {
            ctx.fillStyle = '#22C55E';
            ctx.font = `bold ${gs(16)}px monospace`;
            ctx.fillText('PRESS SPACE TO START', W / 2, H * 0.78);
        }

        // Mini characters
        drawMiniPooka(W * 0.25, H * 0.44);
        drawMiniFygar(W * 0.75, H * 0.44);
    }

    function drawMiniPooka(x, y) {
        ctx.fillStyle = '#EF4444';
        ctx.beginPath(); ctx.arc(x, y, gs(12), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(x - gs(3), y - gs(2), gs(3), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + gs(3), y - gs(2), gs(3), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1E293B';
        ctx.beginPath(); ctx.arc(x - gs(2), y - gs(2), gs(1.5), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + gs(4), y - gs(2), gs(1.5), 0, Math.PI * 2); ctx.fill();
    }

    function drawMiniFygar(x, y) {
        ctx.fillStyle = '#22C55E';
        ctx.beginPath(); ctx.ellipse(x, y, gs(15), gs(10), 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(x + gs(6), y - gs(4), gs(3), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1E293B';
        ctx.beginPath(); ctx.arc(x + gs(7), y - gs(4), gs(1.5), 0, Math.PI * 2); ctx.fill();
    }

    function drawLevelSplash() {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#FBBF24';
        ctx.font = `bold ${gs(32)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`ROUND ${level}`, W / 2, H * 0.4);

        ctx.fillStyle = '#E0E7FF';
        ctx.font = `${gs(14)}px monospace`;
        const depthText = level <= 3 ? 'SHALLOW DEPTHS' : level <= 6 ? 'DEEP UNDERGROUND' : 'THE ABYSS';
        ctx.fillText(depthText, W / 2, H * 0.52);
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#EF4444';
        ctx.font = `bold ${gs(36)}px monospace`;
        ctx.fillText('GAME OVER', W / 2, H * 0.32);

        ctx.fillStyle = '#FBBF24';
        ctx.font = `bold ${gs(20)}px monospace`;
        ctx.fillText(`SCORE: ${score}`, W / 2, H * 0.45);

        ctx.fillStyle = '#E0E7FF';
        ctx.font = `${gs(13)}px monospace`;
        ctx.fillText(`ROUND ${level}`, W / 2, H * 0.53);

        if (hiScore > 0) {
            ctx.fillStyle = score >= hiScore ? '#22C55E' : '#FBBF24';
            ctx.font = `bold ${gs(13)}px monospace`;
            ctx.fillText(score >= hiScore ? 'NEW HIGH SCORE!' : `HIGH SCORE: ${hiScore}`, W / 2, H * 0.62);
        }

        if (Math.floor(frameCount / 30) % 2 === 0) {
            ctx.fillStyle = '#22C55E';
            ctx.font = `bold ${gs(14)}px monospace`;
            ctx.fillText('PRESS SPACE TO RETRY', W / 2, H * 0.74);
        }
    }

    // ── Game Loop ──
    function gameLoop(now) {
        if (!gameActive) return;
        animFrame = requestAnimationFrame(gameLoop);

        const dt = Math.min(now - (lastTime || now), 50);
        lastTime = now;
        frameCount++;

        switch (state) {
            case ST_LOADING:
                drawLoading();
                if (allSpritesReady) state = ST_TITLE;
                return;

            case ST_TITLE:
                break;

            case ST_PLAYING:
                updatePlayer(dt);
                updateEnemies(dt);
                updateFireBreaths();
                updateRocks();
                updateVeggie();
                updateParticles();
                updateScorePopups();
                break;

            case ST_DYING:
                deathTimer -= dt;
                updateParticles();
                updateScorePopups();
                if (deathTimer <= 0) {
                    if (lives <= 0) {
                        state = ST_GAMEOVER;
                        if (score > hiScore) { hiScore = score; try { localStorage.setItem(LS_KEY, hiScore); } catch {} }
                        if (gameOverCB) gameOverCB(score);
                    } else {
                        // Reset player position, keep level
                        player.x = Math.floor(COLS / 2) * CELL + CELL / 2;
                        player.y = SURFACE_ROWS * CELL + CELL / 2;
                        player.pumping = false;
                        pumpLine.active = false;
                        fireBreaths = [];
                        // Reset enemy inflate states
                        for (const e of enemies) {
                            e.inflateStage = 0;
                            e.deflateTimer = 0;
                        }
                        state = ST_PLAYING;
                    }
                }
                break;

            case ST_LEVEL_SPLASH:
                levelSplashTimer -= dt;
                if (levelSplashTimer <= 0) state = ST_PLAYING;
                break;

            case ST_GAMEOVER:
                updateParticles();
                break;
        }

        draw();
    }

    // ── Init / Destroy ──
    function init(cvs, playerData, onGameOver) {
        canvas = cvs;
        gameOverCB = onGameOver;
        activePlayer = playerData;
        playerColor = playerData?.color || '#3B82F6';
        playerTheme = playerData?.theme || 'retro';
        try { hiScore = parseInt(localStorage.getItem(LS_KEY)) || 0; } catch { hiScore = 0; }
        gameActive = true;
        state = ST_LOADING;
        if (!allSpritesReady) loadSprites();
        frameCount = 0;
        lastTime = 0;
        keys = {};
        score = 0;
        lives = INITIAL_LIVES;
        level = 1;
        particles = [];
        scorePopups = [];
        enemies = [];
        rocks = [];
        fireBreaths = [];
        touchLeft = touchRight = touchUp = touchDown = touchFire = false;
        screenShake = 0;
        gems = [];

        player = { x: 0, y: 0, dir: DIR_RIGHT, moveDir: DIR_NONE, anim: 0, pumping: false };
        pumpLine = { active: false, x: 0, y: 0, dir: DIR_RIGHT, dist: 0, maxDist: 0, targetEnemy: null };

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
        if (audioCtx) {
            try { audioCtx.close(); } catch {}
            audioCtx = null;
        }
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
        enemies = [];
        rocks = [];
        fireBreaths = [];
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return level; },
        isActive() { return gameActive; },
    };
})();
