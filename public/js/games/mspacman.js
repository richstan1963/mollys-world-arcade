/* YWA Ms. Pac-Man — Multiple mazes, roaming fruit, Kenney CC0 sprites, unpredictable ghosts */
window.MsPacMan = (() => {
    // ── Sprite Atlas (Kenney CC0) ──
    const __sprites = {};
    let __spritesLoaded = 0, __spritesTotal = 0, __allSpritesReady = false;
    const __SPRITE_MANIFEST = {
        ghostRed: '/img/game-assets/kenney-platform/enemies/slimeGreen.png',
        ghostPink: '/img/game-assets/kenney-platform/enemies/slimePurple.png',
        ghostCyan: '/img/game-assets/kenney-platform/enemies/slimeBlue.png',
        ghostOrange: '/img/game-assets/kenney-platform/enemies/fly.png',
        ghostFright: '/img/game-assets/kenney-platform/enemies/snail_shell.png',
        dot: '/img/game-assets/kenney-coins/coin_01.png',
        powerDot: '/img/game-assets/kenney-coins/coin_02.png',
        cherry: '/img/game-assets/kenney-platform/items/gemRed.png',
        particle1: '/img/game-assets/kenney-particles/particleWhite_1.png',
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


    // ── Constants ──
    const GAME_W = 448, GAME_H = 496;
    const TILE = 16;
    const COLS = 28, ROWS = 31;
    const DIR = { NONE: -1, UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };
    const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
    const OPP = [2, 3, 0, 1]; // opposite direction
    const W = 1, D = 2, P = 3, E = 0, T = 4, G = 5, GD = 6; // tile types
    const DOT_SCORE = 10, POWER_SCORE = 50;
    const GHOST_SCORES = [200, 400, 800, 1600];
    const POWER_DURATION = 7000;
    const START_LIVES = 3;
    const BONUS_LIFE_AT = 10000;
    const DEATH_MS = 1500;
    const READY_MS = 2200;
    const LEVEL_SPLASH_MS = 2000;
    const LEVEL_CLEAR_MS = 1800;

    const GHOST_NAMES = ['blinky', 'pinky', 'inky', 'sue'];
    const GHOST_COLORS = { blinky: '#F43F5E', pinky: '#EC4899', inky: '#06B6D4', sue: '#F97316' };
    const FRIGHTENED_COLOR = '#1E3A8A';
    const FRIGHTENED_BLINK = '#FFFFFF';

    const FRUITS = [
        { name: 'cherry',     color: '#EF4444', accent: '#22C55E', score: 100 },
        { name: 'strawberry', color: '#F43F5E', accent: '#4ADE80', score: 200 },
        { name: 'orange',     color: '#F97316', accent: '#FCD34D', score: 500 },
        { name: 'pretzel',    color: '#D97706', accent: '#FDE68A', score: 700 },
        { name: 'apple',      color: '#22C55E', accent: '#EF4444', score: 1000 },
        { name: 'pear',       color: '#84CC16', accent: '#FCD34D', score: 2000 },
        { name: 'banana',     color: '#FDE047', accent: '#D97706', score: 5000 },
    ];

    // ── 4 Maze Layouts (28×31 each) — built programmatically ──
    const MAZE_COLORS = ['#F472B6', '#60A5FA', '#FB923C', '#4ADE80'];
    const MAZES = [];

    // Build mazes programmatically to guarantee correct 28×31 dimensions
    function initMazes() {
        if (MAZES.length > 0) return;
        // Shared ghost house rows (rows 9-17, 28 cols each)
        // Using numeric tile constants
        const _gh = [
            // row 9: wall above ghost house
            [W,W,W,W,W,W,D,W,W,W,W,W,E,W,W,E,W,W,W,W,W,D,W,W,W,W,W,W],
            // row 10
            [E,E,E,E,E,W,D,W,E,E,E,E,E,E,E,E,E,E,E,E,W,D,W,E,E,E,E,E],
            // row 11
            [E,E,E,E,E,W,D,W,E,E,E,E,E,E,E,E,E,E,E,E,W,D,W,E,E,E,E,E],
            // row 12: ghost door row
            [E,E,E,E,E,W,D,W,E,W,W,W,GD,GD,W,W,W,E,E,E,W,D,W,E,E,E,E,E],
            // row 13: ghost house interior
            [W,W,W,W,W,W,D,W,E,W,G,G,G,G,G,G,W,E,E,E,W,D,W,W,W,W,W,W],
            // row 14: tunnel row
            [T,E,E,E,E,E,D,D,E,W,E,E,E,E,E,E,W,E,E,D,D,E,E,E,E,E,E,T],
            // row 15
            [W,W,W,W,W,W,D,W,E,W,W,W,W,W,W,W,W,E,E,E,W,D,W,W,W,W,W,W],
            // row 16
            [E,E,E,E,E,W,D,W,E,E,E,E,E,E,E,E,E,E,E,E,W,D,W,E,E,E,E,E],
            // row 17
            [W,W,W,W,W,W,D,W,E,W,W,W,W,W,W,W,W,E,E,E,W,D,W,W,W,W,W,W],
        ];

        // Helper: fill maze array from simple top/bottom sections + ghost house
        function makeMaze(topRows, botRows) {
            const m = [];
            // top section (rows 0-8)
            for (const row of topRows) {
                const r = [...row];
                while (r.length < COLS) r.push(W);
                m.push(r.slice(0, COLS));
            }
            // ghost house (rows 9-17)
            for (const row of _gh) {
                const r = [...row];
                while (r.length < COLS) r.push(W);
                m.push(r.slice(0, COLS));
            }
            // bottom section (rows 18-30)
            for (const row of botRows) {
                const r = [...row];
                while (r.length < COLS) r.push(W);
                m.push(r.slice(0, COLS));
            }
            while (m.length < ROWS) m.push(new Array(COLS).fill(W));
            return m;
        }

        // Shorthand row builder: string 'WDP...' → array
        function R(s) {
            const row = [];
            for (let i = 0; i < s.length; i++) {
                const c = s[i];
                row.push(c==='W'?W : c==='D'?D : c==='P'?P : c==='T'?T : c==='G'?G : c==='g'?GD : E);
            }
            return row;
        }

        // Maze 1 — Pink
        MAZES.push(makeMaze(
            [ // rows 0-8
                R('WWWWWWWWWWWWWWWWWWWWWWWWWWWW'),
                R('WDDDDDDDDDDDDWWDDDDDDDDDDW'),
                R('WDWWWWDWWWWWDWWDWWWWWDWWWWDW'),
                R('WPWWWWDWWWWWDWWDWWWWWDWWWWPW'),
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WDWWWWDWWDWWWWWWWWDWWDWWWWDW'),
                R('WDWWWWDWWDWWWWWWWWDWWDWWWWDW'),
                R('WDDDDDDWWDDDDWWDDDDWWDDDDW'),
                R('WWWWWWDWWWWWEWWEWWWWWDWWWWWW'),
            ],
            [ // rows 18-30
                R('WDDDDDDDDDDDDWWDDDDDDDDDDW'),
                R('WDWWWWDWWWWWDWWDWWWWWDWWWWDW'),
                R('WPDDWWDDDDDDDEEDDDDDDWWDDPW'),
                R('WWWDWWDWWDWWWWWWWWDWWDWWDWWW'),
                R('WWWDDDDWWDDDDWWDDDDWWDDDDWW'),
                R('WDDDDDDDDDDDDWWDDDDDDDDDDW'),
                R('WDWWWWWWWWWWDWWDWWWWWWWWWWDW'),
                R('WDDDDDDDDDDDDWWDDDDDDDDDDW'),
                R('WDWWWWDWWWWWDWWDWWWWWDWWWWDW'),
                R('WDWWWWDWWWWWDWWDWWWWWDWWWWDW'),
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WWWWWWWWWWWWWWWWWWWWWWWWWWWW'),
            ]
        ));

        // Maze 2 — Blue
        MAZES.push(makeMaze(
            [
                R('WWWWWWWWWWWWWWWWWWWWWWWWWWWW'),
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WDWWWWWWDWWWWDDWWWWDWWWWWWDW'),
                R('WPWWWWWWDWWWWDDWWWWDWWWWWWPW'),
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WDWWDWWWWWDWWWWWWDWWWWWDWWDW'),
                R('WDDWDDDDDDDDWWWWDDDDDDWDDW'),
                R('WDDDDDDWWDDDDWWDDDDWWDDDDW'),
                R('WWWWWWDWWWWWEWWEWWWWWDWWWWWW'),
            ],
            [
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WDWWWWDWWWWWDWWDWWWWWDWWWWDW'),
                R('WPDDWWDDDDDDDEEDDDDDDWWDDPW'),
                R('WWWDWWDWWDWWWWWWWWDWWDWWDWWW'),
                R('WWWDDDDWWDDDDWWDDDDWWDDDDWW'),
                R('WDWWWWWWWWWWDWWDWWWWWWWWWWDW'),
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WDWWWWDWWWWWWDDWWWWWDWWWWDW'),
                R('WDWWWWDWWWWWWDDWWWWWDWWWWDW'),
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WDWWWWWWWWWWDWWDWWWWWWWWWWDW'),
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WWWWWWWWWWWWWWWWWWWWWWWWWWWW'),
            ]
        ));

        // Maze 3 — Orange
        MAZES.push(makeMaze(
            [
                R('WWWWWWWWWWWWWWWWWWWWWWWWWWWW'),
                R('WPDDDDDDDDDDDDDDDDDDDDDDPW'),
                R('WDWWWWDWWWWWDWWDWWWWWDWWWWDW'),
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WDWWDWWWWWDWWWWWWDWWWWWDWWDW'),
                R('WDWWDDDDDDDDDDDDDDDDDDWWDW'),
                R('WDDWDWWDWWWWDWWDWWWWDWWDDDW'),
                R('WDDDDWWDDDDDDDDDDDDWWDDDDW'),
                R('WWWWWWDWWWWWEWWEWWWWWDWWWWWW'),
            ],
            [
                R('WDDDDDDDDDDDDWWDDDDDDDDDDW'),
                R('WDWWWWDWWWWWDWWDWWWWWDWWWWDW'),
                R('WPDDWWDDDDDDDEEDDDDDDWWDDPW'),
                R('WWWDWWDWWDWWWWWWWWDWWDWWDWWW'),
                R('WDDDDDDWWDDDDDDDDDDWWDDDDW'),
                R('WDWWWWWWWWDWWWWWWDWWWWWWWWDW'),
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WDWWWWDWWWWWDWWDWWWWWDWWWWDW'),
                R('WDWWWWDDDDDDDDDDDDDDWWWWDW'),
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WDWWWWWWWWWWDWWDWWWWWWWWWWDW'),
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WWWWWWWWWWWWWWWWWWWWWWWWWWWW'),
            ]
        ));

        // Maze 4 — Green
        MAZES.push(makeMaze(
            [
                R('WWWWWWWWWWWWWWWWWWWWWWWWWWWW'),
                R('WDDDDDDWWDDDDDDDDDDWWDDDDW'),
                R('WDWWWWDWWDWWWWWWWWDWWDWWWWPW'),
                R('WPDDDDDDDDDDDDDDDDDDDDDDPW'),
                R('WDWWDWWWWWDWWWWWWDWWWWWDWWDW'),
                R('WDWWDDDDDDDDWWDDDDDDDDWWDW'),
                R('WDDWDWWDWWWDWWDWWWDWWDWDDDW'),
                R('WWDDDDDDDDDDDDDDDDDDDDDDWW'),
                R('WWWWWWDWWWWWEWWEWWWWWDWWWWWW'),
            ],
            [
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WDWWWWDWWWWWDWWDWWWWWDWWWWDW'),
                R('WDDDWWDDDDDDDEEDDDDDDWWDDDW'),
                R('WWWDWWDWWDWWWWWWWWDWWDWWDWWW'),
                R('WDDDDDDWWDDDDWWDDDDWWDDDDW'),
                R('WDWWWWWWWWWWDWWDWWWWWWWWWWDW'),
                R('WPDDDDDDDDDDDDDDDDDDDDDDPW'),
                R('WDWWWWDWWWWWDWWDWWWWWDWWWWDW'),
                R('WDWWWWDDDDDDWWDDDDDDWWWWDW'),
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WDWWWWWWWWWWDWWDWWWWWWWWWWDW'),
                R('WDDDDDDDDDDDDDDDDDDDDDDDDW'),
                R('WWWWWWWWWWWWWWWWWWWWWWWWWWWW'),
            ]
        ));
    }

    // ── State ──
    const ST_TITLE = 0, ST_READY = 1, ST_PLAYING = 2, ST_DYING = 3,
          ST_LEVEL_CLEAR = 4, ST_LEVEL_SPLASH = 5, ST_GAMEOVER = 6,
          ST_INTERMISSION = 7;

    const LS_KEY = 'ywa_mspacman_hiscore';
    let hiScore = 0;
    let canvas, ctx, audioCtx;
    let SCALE, DPR;
    let animFrame, lastTime, state;
    let score, level, lives, gameActive, startTime;
    let nextBonusAt, bonusGiven;
    let maze, totalDots, dotsEaten;
    let frameCount;
    let readyTimer, deathTimer, levelClearTimer, levelSplashTimer, intermissionTimer;
    let scorePopups, particles;
    let mazeCanvas, mazeCtx; // prerendered maze
    let wallColor;
    let activePlayer, gameOverCB, playerColor;
    let keys = {};
    let candyColors;

    // Ms. Pac-Man state
    let msX, msY, msDir, msNextDir, msSpeed;
    let msMouth, msMouthDir;
    let msAlive;
    let msTrail;

    // Ghost state
    let ghosts;
    let powerActive, powerTimer, ghostsEatenThisPower;
    let pelletPulse;

    // Fruit state
    let fruit; // { x, y, vx, vy, type, bounces, active, timer }

    // Screen effects
    let screenFlash;
    let bgStars;

    // Audio
    function getAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        return audioCtx;
    }
    function playTone(freq, dur, type = 'square', vol = 0.12) {
        try {
            const a = getAudio(), o = a.createOscillator(), g = a.createGain();
            o.type = type; o.frequency.value = freq;
            g.gain.setValueAtTime(vol, a.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
            o.connect(g); g.connect(a.destination);
            o.start(); o.stop(a.currentTime + dur);
        } catch {}
    }
    function sfxChomp() { playTone(450 + (frameCount % 2) * 100, 0.06, 'square', 0.08); }
    function sfxDeath() {
        for (let i = 0; i < 8; i++) setTimeout(() => playTone(400 - i * 40, 0.12, 'sawtooth', 0.1), i * 120);
    }
    function sfxGhostEat() { playTone(800, 0.08, 'square', 0.1); setTimeout(() => playTone(1200, 0.12, 'sine', 0.12), 80); }
    function sfxFruit() { playTone(600, 0.06, 'sine', 0.1); setTimeout(() => playTone(900, 0.08, 'sine', 0.1), 60); setTimeout(() => playTone(1200, 0.1, 'sine', 0.12), 120); }
    function sfxPower() { playTone(200, 0.3, 'sine', 0.12); playTone(250, 0.3, 'triangle', 0.08); }
    function sfxSiren() { if (frameCount % 30 === 0) playTone(120 + Math.sin(frameCount * 0.05) * 40, 0.15, 'sine', 0.04); }
    function sfxExtraLife() { for (let i = 0; i < 5; i++) setTimeout(() => playTone(600 + i * 150, 0.1, 'sine', 0.1), i * 80); }
    function sfxIntermission() { playTone(523, 0.15, 'sine', 0.08); setTimeout(() => playTone(659, 0.15, 'sine', 0.08), 150); setTimeout(() => playTone(784, 0.2, 'sine', 0.1), 300); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const gx = v => v * SCALE;
    const gy = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const lerp = (a, b, t) => a + (b - a) * t;
    const HAS_TOUCH = ('ontouchstart' in window);

    function tileAt(col, row) {
        if (row < 0 || row >= ROWS) return W;
        // Wrap columns for tunnel
        const c = ((col % COLS) + COLS) % COLS;
        return maze[row][c];
    }

    function isWalkable(col, row) {
        const t = tileAt(col, row);
        return t !== W;
    }

    function canMove(col, row, dir) {
        const nc = col + DX[dir], nr = row + DY[dir];
        // Tunnel wrapping
        if (nc < 0 || nc >= COLS) return true;
        const t = tileAt(nc, nr);
        return t !== W && t !== GD;
    }

    function canGhostMove(col, row, dir, isLeavingHouse) {
        const nc = col + DX[dir], nr = row + DY[dir];
        if (nc < 0 || nc >= COLS) return true;
        const t = tileAt(nc, nr);
        if (t === W) return false;
        if (t === GD && !isLeavingHouse) return false;
        return true;
    }

    // ── Maze building ──
    function loadMaze(levelNum) {
        initMazes();
        const idx = (levelNum - 1) % MAZES.length;
        wallColor = MAZE_COLORS[idx];
        // Deep copy
        maze = MAZES[idx].map(row => [...row]);
        totalDots = 0;
        dotsEaten = 0;
        for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++)
                if (maze[r][c] === D || maze[r][c] === P) totalDots++;
    }

    function prerenderMaze() {
        mazeCanvas = document.createElement('canvas');
        mazeCanvas.width = canvas.width;
        mazeCanvas.height = canvas.height;
        mazeCtx = mazeCanvas.getContext('2d');
        mazeCtx.clearRect(0, 0, mazeCanvas.width, mazeCanvas.height);

        // Wall glow color
        const glow = wallColor;
        const dark = '#0a0515';

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (maze[r][c] !== W) continue;
                const x = gx(c * TILE), y = gy(r * TILE);
                const s = gs(TILE);

                // Check neighbors for edge detection
                const hasTop = r > 0 && maze[r-1][c] === W;
                const hasBot = r < ROWS-1 && maze[r+1][c] === W;
                const hasLeft = c > 0 && maze[r][c-1] === W;
                const hasRight = c < COLS-1 && maze[r][c+1] === W;

                // Glow gradient fill
                const grad = mazeCtx.createRadialGradient(x + s/2, y + s/2, 0, x + s/2, y + s/2, s * 0.8);
                grad.addColorStop(0, glow + '60');
                grad.addColorStop(1, glow + '18');
                mazeCtx.fillStyle = grad;
                mazeCtx.fillRect(x, y, s, s);

                // Bright edges where wall meets path
                mazeCtx.strokeStyle = glow;
                mazeCtx.lineWidth = gs(1.5);
                if (!hasTop) { mazeCtx.beginPath(); mazeCtx.moveTo(x, y); mazeCtx.lineTo(x + s, y); mazeCtx.stroke(); }
                if (!hasBot) { mazeCtx.beginPath(); mazeCtx.moveTo(x, y + s); mazeCtx.lineTo(x + s, y + s); mazeCtx.stroke(); }
                if (!hasLeft) { mazeCtx.beginPath(); mazeCtx.moveTo(x, y); mazeCtx.lineTo(x, y + s); mazeCtx.stroke(); }
                if (!hasRight) { mazeCtx.beginPath(); mazeCtx.moveTo(x + s, y); mazeCtx.lineTo(x + s, y + s); mazeCtx.stroke(); }
            }
        }
    }

    // ── Init characters ──
    function initMsPacMan() {
        // Start in lower-center of maze
        msX = 14; msY = 23;
        msDir = DIR.LEFT;
        msNextDir = DIR.NONE;
        msSpeed = 0.12 + level * 0.003;
        if (msSpeed > 0.18) msSpeed = 0.18;
        msMouth = 0.2;
        msMouthDir = 1;
        msAlive = true;
        msTrail = [];
    }

    function initGhosts() {
        const homeRow = 13, homeCol = 13;
        ghosts = GHOST_NAMES.map((name, i) => ({
            name, color: GHOST_COLORS[name],
            x: homeCol + (i - 1.5), y: i === 0 ? homeRow - 2 : homeRow,
            dir: i % 2 === 0 ? DIR.LEFT : DIR.RIGHT,
            mode: i === 0 ? 'scatter' : 'house', // blinky starts outside
            releaseTimer: i * 3000 + 1000,
            speed: 0.09 + level * 0.002 + Math.random() * 0.01,
            frightened: false,
            eaten: false,
            flashTimer: 0,
            targetX: 0, targetY: 0,
            scatterTarget: [
                { x: COLS - 3, y: 0 },     // blinky top-right
                { x: 2, y: 0 },            // pinky top-left
                { x: COLS - 1, y: ROWS - 1 }, // inky bottom-right
                { x: 0, y: ROWS - 1 },     // sue bottom-left
            ][i],
        }));
        powerActive = false;
        powerTimer = 0;
        ghostsEatenThisPower = 0;
    }

    // ── Ghost AI (more random than Pac-Man) ──
    function updateGhostTarget(g, idx) {
        if (g.eaten) {
            // Return to ghost house
            g.targetX = 13; g.targetY = 12;
            return;
        }
        if (g.frightened) {
            // Random movement
            g.targetX = Math.floor(Math.random() * COLS);
            g.targetY = Math.floor(Math.random() * ROWS);
            return;
        }

        // Ms. Pac-Man ghosts are MORE RANDOM than Pac-Man ghosts
        // Mix target-based with random element
        const randomFactor = 0.35; // 35% chance of random target
        if (Math.random() < randomFactor) {
            g.targetX = Math.floor(Math.random() * COLS);
            g.targetY = Math.floor(Math.random() * ROWS);
            return;
        }

        if (g.mode === 'scatter') {
            g.targetX = g.scatterTarget.x;
            g.targetY = g.scatterTarget.y;
            return;
        }

        // Chase mode — each ghost has different but MORE random targeting
        switch (idx) {
            case 0: // Blinky — direct chase with jitter
                g.targetX = Math.round(msX) + Math.floor(rng(-3, 3));
                g.targetY = Math.round(msY) + Math.floor(rng(-3, 3));
                break;
            case 1: // Pinky — ambush ahead with randomness
                g.targetX = Math.round(msX) + DX[msDir] * (4 + Math.floor(rng(-2, 2)));
                g.targetY = Math.round(msY) + DY[msDir] * (4 + Math.floor(rng(-2, 2)));
                break;
            case 2: // Inky — flanking with random offset
                const blinky = ghosts[0];
                g.targetX = Math.round(msX) * 2 - Math.round(blinky.x) + Math.floor(rng(-4, 4));
                g.targetY = Math.round(msY) * 2 - Math.round(blinky.y) + Math.floor(rng(-4, 4));
                break;
            case 3: // Sue — random patrol, chases when far
                const dist = Math.hypot(g.x - msX, g.y - msY);
                if (dist > 8) {
                    g.targetX = Math.round(msX);
                    g.targetY = Math.round(msY);
                } else {
                    g.targetX = g.scatterTarget.x;
                    g.targetY = g.scatterTarget.y;
                }
                break;
        }
    }

    function moveGhost(g, idx, dt) {
        if (g.mode === 'house') {
            g.releaseTimer -= dt;
            // Bob up and down in house
            g.y += Math.sin(frameCount * 0.08 + idx) * 0.03;
            if (g.releaseTimer <= 0) {
                g.mode = 'leaving';
                g.x = 13.5;
            }
            return;
        }

        if (g.mode === 'leaving') {
            // Move up out of ghost house
            if (g.y > 11) {
                g.y -= g.speed * 0.7;
            } else {
                g.mode = 'chase';
                g.y = 11;
                g.dir = Math.random() < 0.5 ? DIR.LEFT : DIR.RIGHT;
            }
            return;
        }

        // Normal grid-based movement
        const spd = g.eaten ? g.speed * 2.5 : (g.frightened ? g.speed * 0.6 : g.speed);

        // Move along current direction
        g.x += DX[g.dir] * spd;
        g.y += DY[g.dir] * spd;

        // Tunnel wrapping
        if (g.x < -1) g.x = COLS;
        if (g.x > COLS) g.x = -1;

        // At tile center — decide new direction
        const cx = Math.round(g.x), cy = Math.round(g.y);
        const atCenter = Math.abs(g.x - cx) < spd * 1.2 && Math.abs(g.y - cy) < spd * 1.2;

        if (atCenter) {
            g.x = cx; g.y = cy;

            // Check if eaten ghost reached home
            if (g.eaten && Math.abs(g.x - 13) < 2 && Math.abs(g.y - 13) < 2) {
                g.eaten = false;
                g.frightened = false;
                g.mode = 'leaving';
                g.y = 13;
                g.x = 13;
                return;
            }

            updateGhostTarget(g, idx);

            // Get valid directions (no reverse unless frightened)
            const dirs = [];
            for (let d = 0; d < 4; d++) {
                if (d === OPP[g.dir] && !g.eaten) continue; // no reversing (unless eaten)
                if (canGhostMove(cx, cy, d, g.mode === 'leaving' || g.eaten)) {
                    dirs.push(d);
                }
            }

            if (dirs.length === 0) {
                // Dead end — reverse
                g.dir = OPP[g.dir];
            } else if (dirs.length === 1) {
                g.dir = dirs[0];
            } else {
                // Pick direction closest to target (with random tie-breaking for Ms. Pac-Man)
                let bestDir = dirs[0], bestDist = Infinity;
                // Shuffle for randomness in ties
                for (let i = dirs.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
                }
                for (const d of dirs) {
                    const nx = cx + DX[d], ny = cy + DY[d];
                    const dist = Math.hypot(nx - g.targetX, ny - g.targetY);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestDir = d;
                    }
                }
                g.dir = bestDir;
            }
        }
    }

    // ── Roaming fruit ──
    function spawnFruit() {
        if (fruit && fruit.active) return;
        const fruitIdx = Math.min(Math.floor((level - 1) / 1), FRUITS.length - 1);
        const def = FRUITS[fruitIdx];
        // Enter from one of the two tunnel sides
        const fromLeft = Math.random() < 0.5;
        fruit = {
            x: fromLeft ? -1 : COLS,
            y: 14, // tunnel row
            vx: fromLeft ? 0.08 : -0.08,
            vy: 0,
            type: def,
            bounces: 0,
            active: true,
            timer: 15000,
            turnCooldown: 0,
        };
    }

    function updateFruit(dt) {
        if (!fruit || !fruit.active) return;
        fruit.timer -= dt;
        if (fruit.timer <= 0) { fruit.active = false; return; }
        fruit.turnCooldown -= dt;

        // Move
        fruit.x += fruit.vx;
        fruit.y += fruit.vy;

        // Tunnel wrapping
        if (fruit.x < -2) { fruit.active = false; return; }
        if (fruit.x > COLS + 1) { fruit.active = false; return; }

        // At intersections, randomly change direction
        const cx = Math.round(fruit.x), cy = Math.round(fruit.y);
        const atCenter = Math.abs(fruit.x - cx) < 0.12 && Math.abs(fruit.y - cy) < 0.12;

        if (atCenter && fruit.turnCooldown <= 0 && cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) {
            fruit.x = cx; fruit.y = cy;
            // Collect available directions
            const dirs = [];
            for (let d = 0; d < 4; d++) {
                const nc = cx + DX[d], nr = cy + DY[d];
                if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                    const t = maze[nr][nc];
                    if (t !== W && t !== G && t !== GD) dirs.push(d);
                }
            }
            if (dirs.length > 0) {
                // Prefer continuing or random turn
                const d = Math.random() < 0.5 ? pick(dirs) : dirs[0];
                fruit.vx = DX[d] * 0.08;
                fruit.vy = DY[d] * 0.08;
                fruit.turnCooldown = 200;
                fruit.bounces++;
            }
        }

        // Check collision with Ms. Pac-Man
        if (Math.abs(fruit.x - msX) < 0.8 && Math.abs(fruit.y - msY) < 0.8) {
            score += fruit.type.score;
            addScorePopup(fruit.x * TILE, fruit.y * TILE, fruit.type.score, fruit.type.color);
            sfxFruit();
            fruit.active = false;
        }
    }

    // ── Score popups & particles ──
    function addScorePopup(x, y, value, color = '#FFFFFF') {
        scorePopups.push({ x, y, value, color, life: 1.0 });
    }

    function addParticles(x, y, color, count = 8) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x, y,
                vx: rng(-3, 3), vy: rng(-3, 3),
                color, life: 1.0, size: rng(1.5, 4),
            });
        }
    }

    // ── Background stars ──
    function initBgStars() {
        bgStars = [];
        for (let i = 0; i < 40; i++) {
            bgStars.push({
                x: Math.random() * GAME_W,
                y: Math.random() * GAME_H,
                size: rng(0.5, 1.5),
                brightness: rng(0.2, 0.6),
                twinkleSpeed: rng(0.02, 0.06),
            });
        }
    }

    // ── Mode switching (scatter/chase cycles, more aggressive in Ms. Pac-Man) ──
    function getGhostMode() {
        const elapsed = (Date.now() - startTime) / 1000;
        // Ms. Pac-Man has shorter scatter phases
        if (elapsed < 5) return 'scatter';
        if (elapsed < 25) return 'chase';
        if (elapsed < 28) return 'scatter';
        if (elapsed < 50) return 'chase';
        if (elapsed < 53) return 'scatter';
        return 'chase'; // permanent chase
    }

    // ── Update ──
    function update(dt) {
        frameCount++;
        pelletPulse += 0.06;

        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.08;
            p.life -= 0.025;
            if (p.life <= 0) particles.splice(i, 1);
        }
        // Update score popups
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const s = scorePopups[i];
            s.y -= 0.5;
            s.life -= 0.015;
            if (s.life <= 0) scorePopups.splice(i, 1);
        }
        // Screen flash decay
        if (screenFlash > 0) screenFlash -= 0.03;

        if (state === ST_READY) {
            readyTimer -= dt;
            if (readyTimer <= 0) state = ST_PLAYING;
            return;
        }

        if (state === ST_DYING) {
            deathTimer -= dt;
            if (deathTimer <= 0) {
                lives--;
                if (lives <= 0) {
                    state = ST_GAMEOVER;
                    if (score > hiScore) { hiScore = score; try { localStorage.setItem(LS_KEY, hiScore); } catch {} }
                    setTimeout(() => { if (gameActive && gameOverCB) gameOverCB(score); }, 2500);
                } else {
                    initMsPacMan();
                    initGhosts();
                    state = ST_READY;
                    readyTimer = READY_MS;
                }
            }
            return;
        }

        if (state === ST_LEVEL_CLEAR) {
            levelClearTimer -= dt;
            if (levelClearTimer <= 0) {
                level++;
                // Intermission after levels 2, 5, 9
                if (level === 3 || level === 6 || level === 10) {
                    state = ST_INTERMISSION;
                    intermissionTimer = 3000;
                    sfxIntermission();
                } else {
                    state = ST_LEVEL_SPLASH;
                    levelSplashTimer = LEVEL_SPLASH_MS;
                    startLevel();
                }
            }
            return;
        }

        if (state === ST_INTERMISSION) {
            intermissionTimer -= dt;
            if (intermissionTimer <= 0) {
                state = ST_LEVEL_SPLASH;
                levelSplashTimer = LEVEL_SPLASH_MS;
                startLevel();
            }
            return;
        }

        if (state === ST_LEVEL_SPLASH) {
            levelSplashTimer -= dt;
            if (levelSplashTimer <= 0) {
                state = ST_READY;
                readyTimer = READY_MS;
            }
            return;
        }

        if (state !== ST_PLAYING) return;

        // Siren sound
        sfxSiren();

        // ── Move Ms. Pac-Man ──
        // Try queued direction first
        const cx = Math.round(msX), cy = Math.round(msY);
        if (msNextDir !== DIR.NONE && canMove(cx, cy, msNextDir)) {
            msDir = msNextDir;
            msNextDir = DIR.NONE;
        }

        if (msDir !== DIR.NONE && canMove(cx, cy, msDir)) {
            const atCenter = Math.abs(msX - cx) < msSpeed * 1.2 && Math.abs(msY - cy) < msSpeed * 1.2;
            msX += DX[msDir] * msSpeed;
            msY += DY[msDir] * msSpeed;

            // Snap to grid on axis perpendicular to movement
            if (msDir === DIR.LEFT || msDir === DIR.RIGHT) msY = lerp(msY, cy, 0.3);
            else msX = lerp(msX, cx, 0.3);
        } else {
            // Snap to tile center when hitting wall
            msX = lerp(msX, cx, 0.4);
            msY = lerp(msY, cy, 0.4);
        }

        // Tunnel wrapping
        if (msX < -1) msX = COLS;
        if (msX > COLS) msX = -1;

        // Chomp animation
        msMouth += msMouthDir * 0.12;
        if (msMouth > 0.8) { msMouth = 0.8; msMouthDir = -1; }
        if (msMouth < 0.05) { msMouth = 0.05; msMouthDir = 1; }

        // Trail
        if (frameCount % 3 === 0) {
            msTrail.push({ x: msX, y: msY, life: 1.0 });
            if (msTrail.length > 10) msTrail.shift();
        }
        for (let i = msTrail.length - 1; i >= 0; i--) {
            msTrail[i].life -= 0.06;
            if (msTrail[i].life <= 0) msTrail.splice(i, 1);
        }

        // Eat dots
        const tileCol = Math.round(msX), tileRow = Math.round(msY);
        if (tileCol >= 0 && tileCol < COLS && tileRow >= 0 && tileRow < ROWS) {
            const t = maze[tileRow][tileCol];
            if (t === D) {
                maze[tileRow][tileCol] = E;
                score += DOT_SCORE;
                dotsEaten++;
                sfxChomp();
                prerenderMaze();
            } else if (t === P) {
                maze[tileRow][tileCol] = E;
                score += POWER_SCORE;
                dotsEaten++;
                activatePower();
                prerenderMaze();
            }
        }

        // Bonus life
        if (!bonusGiven && score >= BONUS_LIFE_AT) {
            bonusGiven = true;
            lives++;
            sfxExtraLife();
            screenFlash = 1.0;
        }

        // Spawn roaming fruit
        if (dotsEaten === 64 || dotsEaten === 172) {
            spawnFruit();
        }
        updateFruit(dt);

        // Level clear
        if (dotsEaten >= totalDots) {
            state = ST_LEVEL_CLEAR;
            levelClearTimer = LEVEL_CLEAR_MS;
            screenFlash = 1.0;
            return;
        }

        // ── Ghost mode ──
        const modeNow = getGhostMode();

        // Power timer
        if (powerActive) {
            powerTimer -= dt;
            if (powerTimer <= 0) {
                powerActive = false;
                for (const g of ghosts) {
                    g.frightened = false;
                    g.flashTimer = 0;
                }
            } else if (powerTimer < 2000) {
                // Flash ghosts
                for (const g of ghosts) {
                    if (g.frightened && !g.eaten) g.flashTimer += dt;
                }
            }
        }

        // ── Move ghosts ──
        for (let i = 0; i < ghosts.length; i++) {
            const g = ghosts[i];
            if (g.mode !== 'house' && g.mode !== 'leaving' && !g.eaten) {
                g.mode = modeNow;
            }
            moveGhost(g, i, dt);

            // Collision with Ms. Pac-Man
            if (g.mode !== 'house' && g.mode !== 'leaving') {
                const dist = Math.hypot(g.x - msX, g.y - msY);
                if (dist < 0.8) {
                    if (g.frightened && !g.eaten) {
                        // Eat ghost
                        g.eaten = true;
                        g.frightened = false;
                        const pts = GHOST_SCORES[Math.min(ghostsEatenThisPower, 3)];
                        ghostsEatenThisPower++;
                        score += pts;
                        addScorePopup(g.x * TILE, g.y * TILE, pts, '#22D3EE');
                        sfxGhostEat();
                        addParticles(g.x * TILE, g.y * TILE, g.color, 12);
                    } else if (!g.eaten) {
                        // Ms. Pac-Man dies
                        msAlive = false;
                        state = ST_DYING;
                        deathTimer = DEATH_MS;
                        sfxDeath();
                        addParticles(msX * TILE, msY * TILE, playerColor || '#FBBF24', 20);
                    }
                }
            }
        }
    }

    function activatePower() {
        powerActive = true;
        powerTimer = POWER_DURATION - level * 200;
        if (powerTimer < 2000) powerTimer = 2000;
        ghostsEatenThisPower = 0;
        for (const g of ghosts) {
            if (g.mode !== 'house' && !g.eaten) {
                g.frightened = true;
                g.flashTimer = 0;
                // Reverse direction
                g.dir = OPP[g.dir];
            }
        }
        sfxPower();
        screenFlash = 0.6;
    }

    // ── Drawing ──
    function draw() {
        ctx.save();
        // Background
        ctx.fillStyle = '#0a0515';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Stars
        for (const s of bgStars) {
            const b = s.brightness + Math.sin(frameCount * s.twinkleSpeed) * 0.15;
            ctx.globalAlpha = Math.max(0, Math.min(1, b));
            ctx.fillStyle = '#E0E7FF';
            ctx.beginPath();
            ctx.arc(gx(s.x), gy(s.y), gs(s.size), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Prerendered maze
        if (mazeCanvas) {
            ctx.drawImage(mazeCanvas, 0, 0);
        }

        // Dots and power pellets
        drawDots();

        // Fruit
        if (fruit && fruit.active) drawFruit();

        // Ghost trail / Ms. Pac-Man trail
        drawTrail();

        // Ghosts
        for (let i = 0; i < ghosts.length; i++) drawGhost(ghosts[i], i);

        // Ms. Pac-Man
        if (state !== ST_DYING || deathTimer > DEATH_MS * 0.2) {
            drawMsPacMan();
        } else {
            drawDeathAnimation();
        }

        // Score popups
        for (const s of scorePopups) {
            ctx.globalAlpha = s.life;
            ctx.fillStyle = s.color;
            ctx.font = `bold ${gs(8)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(s.value, gx(s.x), gy(s.y));
        }
        ctx.globalAlpha = 1;

        // Particles — with glow
        for (const p of particles) {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = gs(4);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(gx(p.x), gy(p.y), gs(p.size), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        // HUD
        drawHUD();

        // Screen flash — brighter radial burst
        if (screenFlash > 0) {
            ctx.globalAlpha = screenFlash * 0.35;
            const sfGrad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width * 0.6);
            sfGrad.addColorStop(0, '#FFFFFF');
            sfGrad.addColorStop(0.4, '#FBBF24');
            sfGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = sfGrad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;
        }

        // Vignette
        drawVignette();

        // Overlays
        if (state === ST_READY) drawReady();
        if (state === ST_LEVEL_SPLASH) drawLevelSplash();
        if (state === ST_GAMEOVER) drawGameOver();
        if (state === ST_INTERMISSION) drawIntermission();
        if (state === ST_LEVEL_CLEAR) drawLevelClear();

        // Touch controls
        if (HAS_TOUCH) drawTouchControls();

        ctx.restore();
    }

    function drawDots() {
        const _dotSz = gs(TILE * 0.4);
        const _pwSz = gs(TILE * 0.7);
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const t = maze[r][c];
                if (t === D) {
                    const px = gx(c * TILE + TILE / 2);
                    const py = gy(r * TILE + TILE / 2);
                    const colorIdx = (r * COLS + c) % candyColors.length;
                    ctx.fillStyle = candyColors[colorIdx];
                    ctx.beginPath();
                    ctx.arc(px, py, gs(1.8), 0, Math.PI * 2);
                    ctx.fill();
                } else if (t === P) {
                    const px = gx(c * TILE + TILE / 2);
                    const py = gy(r * TILE + TILE / 2);
                    const pulse = 0.7 + Math.sin(pelletPulse) * 0.3;
                    const rad = gs(5 * pulse);
                    // Glow
                    ctx.save();
                    ctx.shadowColor = '#FBBF24';
                    ctx.shadowBlur = gs(8);
                    ctx.fillStyle = '#FBBF24';
                    ctx.beginPath();
                    ctx.arc(px, py, rad, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }
        }
    }

    function drawMsPacMan() {
        const px = gx(msX * TILE + TILE / 2);
        const py = gy(msY * TILE + TILE / 2);
        const radius = gs(TILE * 0.55);
        const mouthAngle = msMouth * Math.PI * 0.4;

        let angle = 0;
        if (msDir === DIR.RIGHT) angle = 0;
        else if (msDir === DIR.DOWN) angle = Math.PI / 2;
        else if (msDir === DIR.LEFT) angle = Math.PI;
        else if (msDir === DIR.UP) angle = -Math.PI / 2;

        ctx.save();
        // Glow
        ctx.shadowColor = playerColor || '#FBBF24';
        ctx.shadowBlur = gs(10);

        // Body (yellow)
        ctx.fillStyle = '#FBBF24';
        ctx.beginPath();
        ctx.arc(px, py, radius, angle + mouthAngle, angle + Math.PI * 2 - mouthAngle);
        ctx.lineTo(px, py);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;

        // Lipstick (red on mouth edges)
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = gs(2);
        const lipLen = radius * 0.7;
        // Upper lip
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(angle + mouthAngle) * lipLen, py + Math.sin(angle + mouthAngle) * lipLen);
        ctx.stroke();
        // Lower lip
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(angle - mouthAngle + Math.PI * 2) * lipLen, py + Math.sin(angle - mouthAngle + Math.PI * 2) * lipLen);
        ctx.stroke();

        // Eye
        const eyeAngle = angle - Math.PI * 0.25;
        const eyeDist = radius * 0.4;
        const eyeX = px + Math.cos(eyeAngle) * eyeDist;
        const eyeY = py + Math.sin(eyeAngle) * eyeDist;
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, gs(2), 0, Math.PI * 2);
        ctx.fill();

        // Beauty mark
        const markAngle = angle - Math.PI * 0.55;
        const markDist = radius * 0.65;
        ctx.fillStyle = '#1E1B4B';
        ctx.beginPath();
        ctx.arc(px + Math.cos(markAngle) * markDist, py + Math.sin(markAngle) * markDist, gs(1.2), 0, Math.PI * 2);
        ctx.fill();

        // Bow (on top)
        const bowAngle = angle - Math.PI * 0.5;
        const bowX = px + Math.cos(bowAngle) * (radius * 0.85);
        const bowY = py + Math.sin(bowAngle) * (radius * 0.85);
        drawBow(bowX, bowY, gs(6));

        ctx.restore();
    }

    function drawBow(x, y, size) {
        ctx.fillStyle = '#EF4444';
        // Left loop
        ctx.beginPath();
        ctx.ellipse(x - size * 0.6, y, size * 0.55, size * 0.35, -0.2, 0, Math.PI * 2);
        ctx.fill();
        // Right loop
        ctx.beginPath();
        ctx.ellipse(x + size * 0.6, y, size * 0.55, size * 0.35, 0.2, 0, Math.PI * 2);
        ctx.fill();
        // Center knot
        ctx.fillStyle = '#DC2626';
        ctx.beginPath();
        ctx.arc(x, y, size * 0.2, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawTrail() {
        for (const t of msTrail) {
            ctx.globalAlpha = t.life * 0.25;
            ctx.fillStyle = playerColor || '#FBBF24';
            ctx.beginPath();
            ctx.arc(gx(t.x * TILE + TILE / 2), gy(t.y * TILE + TILE / 2), gs(TILE * 0.3 * t.life), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawGhost(g, idx) {
        if (g.mode === 'house' && g.releaseTimer > 10000) return; // not yet visible
        const px = gx(g.x * TILE + TILE / 2);
        const py = gy(g.y * TILE + TILE / 2);
        const r = gs(TILE * 0.55);
        const _gsz = gs(TILE * 1.1);

        // Sprite ghosts
        if (g.eaten) {
            drawGhostEyes(px, py, r, g.dir);
            return;
        }
        if (g.frightened && __sprites.ghostFright) {
            ctx.drawImage(__sprites.ghostFright, px - _gsz/2, py - _gsz/2, _gsz, _gsz);
            return;
        }
        const _gmap = { blinky: 'ghostRed', pinky: 'ghostPink', inky: 'ghostCyan', sue: 'ghostOrange' };
        const _gk = _gmap[g.name] || 'ghostRed';
        if (__sprites[_gk] && !g.frightened) {
            ctx.drawImage(__sprites[_gk], px - _gsz/2, py - _gsz/2, _gsz, _gsz);
            return;
        }

        let color = g.color;
        if (g.frightened) {
            const flashing = powerTimer < 2000 && Math.floor(g.flashTimer / 200) % 2 === 0;
            color = flashing ? FRIGHTENED_BLINK : FRIGHTENED_COLOR;
        }

        ctx.save();
        // Glow
        ctx.shadowColor = color;
        ctx.shadowBlur = gs(6);

        // Body (rounded top + wavy bottom)
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py - r * 0.15, r, Math.PI, 0); // dome
        // Wavy bottom
        const waveY = py + r * 0.85;
        const waveAmp = r * 0.2;
        const waveOff = frameCount * 0.15 + idx;
        ctx.lineTo(px + r, waveY);
        const segments = 6;
        for (let i = segments; i >= 0; i--) {
            const sx = px - r + (r * 2 * i / segments);
            const sy = waveY + Math.sin(waveOff + i * 1.5) * waveAmp;
            ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Eyes
        if (!g.frightened) {
            drawGhostEyes(px, py, r, g.dir);
        } else {
            // Frightened face
            const eyeR = r * 0.15;
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(px - r * 0.3, py - r * 0.15, eyeR, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(px + r * 0.3, py - r * 0.15, eyeR, 0, Math.PI * 2);
            ctx.fill();
            // Wobbly mouth
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = gs(1);
            ctx.beginPath();
            for (let i = 0; i <= 6; i++) {
                const mx = px - r * 0.4 + (r * 0.8 * i / 6);
                const my = py + r * 0.25 + (i % 2 === 0 ? gs(2) : -gs(2));
                if (i === 0) ctx.moveTo(mx, my);
                else ctx.lineTo(mx, my);
            }
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawGhostEyes(px, py, r, dir) {
        const eyeR = r * 0.22;
        const pupilR = r * 0.12;
        const eyeOffX = r * 0.32;
        const eyeY = py - r * 0.15;

        // Direction offset for pupils
        let pdx = 0, pdy = 0;
        if (dir === DIR.LEFT) pdx = -pupilR * 0.5;
        else if (dir === DIR.RIGHT) pdx = pupilR * 0.5;
        else if (dir === DIR.UP) pdy = -pupilR * 0.5;
        else if (dir === DIR.DOWN) pdy = pupilR * 0.5;

        for (const ox of [-eyeOffX, eyeOffX]) {
            // White
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.ellipse(px + ox, eyeY, eyeR, eyeR * 1.2, 0, 0, Math.PI * 2);
            ctx.fill();
            // Pupil
            ctx.fillStyle = '#1E3A8A';
            ctx.beginPath();
            ctx.arc(px + ox + pdx, eyeY + pdy, pupilR, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawFruit() {
        if (!fruit || !fruit.active) return;
        const px = gx(fruit.x * TILE + TILE / 2);
        const py = gy(fruit.y * TILE + TILE / 2);
        const r = gs(TILE * 0.45);
        const def = fruit.type;

        ctx.save();

        // Sparkle trail behind roaming fruit
        if (fruit.roaming) {
            for (let i = 0; i < 4; i++) {
                const sparkAngle = frameCount * 0.15 + i * Math.PI * 0.5;
                const sparkDist = r * 1.2 + Math.sin(frameCount * 0.08 + i) * r * 0.4;
                const sx = px + Math.cos(sparkAngle) * sparkDist;
                const sy = py + Math.sin(sparkAngle) * sparkDist;
                const sparkSize = gs(1.5 + Math.sin(frameCount * 0.1 + i * 2) * 1);
                ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.12 + i) * 0.3;
                ctx.fillStyle = '#FFFFFF';
                ctx.shadowColor = def.color;
                ctx.shadowBlur = gs(6);
                ctx.beginPath();
                ctx.arc(sx, sy, sparkSize, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // Sparkle ring around fruit (always visible)
        for (let i = 0; i < 6; i++) {
            const sa = frameCount * 0.06 + i * Math.PI / 3;
            const sd = r * 1.5;
            const ssz = gs(1 + Math.sin(frameCount * 0.1 + i) * 0.5);
            ctx.globalAlpha = 0.3 + Math.sin(frameCount * 0.08 + i * 1.5) * 0.3;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(px + Math.cos(sa) * sd, py + Math.sin(sa) * sd, ssz, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.shadowColor = def.color;
        ctx.shadowBlur = gs(12);

        // Fruit body
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();

        // Accent highlight
        ctx.fillStyle = def.accent;
        ctx.beginPath();
        ctx.arc(px - r * 0.2, py - r * 0.3, r * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Stem
        ctx.strokeStyle = def.accent;
        ctx.lineWidth = gs(1.5);
        ctx.beginPath();
        ctx.moveTo(px, py - r);
        ctx.lineTo(px + r * 0.2, py - r * 1.5);
        ctx.stroke();

        // Score text below
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${gs(5)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(def.score, px, py + r + gs(7));

        ctx.restore();
    }

    function drawDeathAnimation() {
        const progress = 1 - deathTimer / DEATH_MS;
        const px = gx(msX * TILE + TILE / 2);
        const py = gy(msY * TILE + TILE / 2);
        const radius = gs(TILE * 0.55);

        ctx.save();
        ctx.fillStyle = '#FBBF24';
        const startAngle = Math.PI * 0.5 + progress * Math.PI;
        const endAngle = Math.PI * 0.5 - progress * Math.PI + Math.PI * 2;
        if (endAngle > startAngle) {
            ctx.beginPath();
            ctx.arc(px, py, radius * (1 - progress * 0.3), startAngle, endAngle);
            ctx.lineTo(px, py);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    function drawHUD() {
        const hudY = gs(GAME_H - 14);

        // Score
        ctx.fillStyle = '#E0E7FF';
        ctx.font = `bold ${gs(10)}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE ${score}`, gs(8), hudY);

        // Level
        ctx.textAlign = 'center';
        ctx.fillText(`LV ${level}`, gx(GAME_W / 2), hudY);

        // Lives
        ctx.textAlign = 'right';
        for (let i = 0; i < lives - 1; i++) {
            const lx = gx(GAME_W - 16 - i * 18);
            const ly = hudY - gs(5);
            ctx.fillStyle = '#FBBF24';
            ctx.beginPath();
            ctx.arc(lx, ly, gs(5), 0.2 * Math.PI, 1.8 * Math.PI);
            ctx.lineTo(lx, ly);
            ctx.closePath();
            ctx.fill();
            // Mini bow
            drawBow(lx + gs(1), ly - gs(5), gs(3));
        }
    }

    function drawReady() {
        ctx.fillStyle = '#FBBF24';
        ctx.font = `bold ${gs(14)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('READY!', gx(GAME_W / 2), gy(GAME_H / 2 + 16));
    }

    function drawLevelSplash() {
        ctx.fillStyle = 'rgba(10,5,21,0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = wallColor || '#F472B6';
        ctx.font = `bold ${gs(18)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`MAZE ${((level - 1) % 4) + 1}`, gx(GAME_W / 2), gy(GAME_H / 2 - 20));
        ctx.fillStyle = '#E0E7FF';
        ctx.font = `bold ${gs(12)}px monospace`;
        ctx.fillText(`LEVEL ${level}`, gx(GAME_W / 2), gy(GAME_H / 2 + 15));
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(10,5,21,0.75)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#EF4444';
        ctx.font = `bold ${gs(20)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GAME OVER', gx(GAME_W / 2), gy(GAME_H / 2 - 20));
        ctx.fillStyle = '#E0E7FF';
        ctx.font = `bold ${gs(12)}px monospace`;
        ctx.fillText(`FINAL SCORE: ${score}`, gx(GAME_W / 2), gy(GAME_H / 2 + 10));
        if (hiScore > 0) {
            ctx.fillStyle = score >= hiScore ? '#22C55E' : '#FBBF24';
            ctx.font = `bold ${gs(10)}px monospace`;
            ctx.fillText(score >= hiScore ? 'NEW HIGH SCORE!' : `HIGH SCORE: ${hiScore}`, gx(GAME_W / 2), gy(GAME_H / 2 + 30));
        }
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.fillStyle = '#64748B';
            ctx.font = `${gs(9)}px monospace`;
            ctx.fillText('PRESS ANY KEY TO RESTART', gx(GAME_W / 2), gy(GAME_H / 2 + 50));
        }
    }

    function drawIntermission() {
        ctx.fillStyle = 'rgba(10,5,21,0.95)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const cx = gx(GAME_W / 2), cy = gy(GAME_H / 2);
        const t = 1 - intermissionTimer / 3000;

        // Ambient sparkle stars in background
        for (let i = 0; i < 20; i++) {
            const sx = gx((Math.sin(i * 7.3 + frameCount * 0.003) * 0.5 + 0.5) * GAME_W);
            const sy = gy((Math.cos(i * 5.1 + frameCount * 0.004) * 0.5 + 0.5) * GAME_H);
            const sb = 0.2 + Math.sin(frameCount * 0.05 + i * 2) * 0.2;
            ctx.globalAlpha = sb;
            ctx.fillStyle = '#F9A8D4';
            ctx.beginPath();
            ctx.arc(sx, sy, gs(1), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Spotlight gradient behind characters
        const spotlight = ctx.createRadialGradient(cx, cy, 0, cx, cy, gs(80));
        spotlight.addColorStop(0, 'rgba(251,191,36,0.08)');
        spotlight.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = spotlight;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Ms. Pac-Man and Pac-Man meet
        const msPx = gx(GAME_W * 0.3 + t * GAME_W * 0.15);
        const pPx = gx(GAME_W * 0.7 - t * GAME_W * 0.15);

        // Ms. Pac-Man (moving right) with glow
        ctx.save();
        ctx.shadowColor = '#FBBF24';
        ctx.shadowBlur = gs(12);
        ctx.fillStyle = '#FBBF24';
        ctx.beginPath();
        ctx.arc(msPx, cy, gs(18), 0.15 * Math.PI, 1.85 * Math.PI);
        ctx.lineTo(msPx, cy);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        drawBow(msPx + gs(2), cy - gs(18), gs(8));

        // Pac-Man (moving left) with glow
        ctx.save();
        ctx.shadowColor = '#FBBF24';
        ctx.shadowBlur = gs(12);
        ctx.fillStyle = '#FBBF24';
        ctx.beginPath();
        ctx.arc(pPx, cy, gs(18), 1.15 * Math.PI, 0.85 * Math.PI + Math.PI * 2);
        ctx.lineTo(pPx, cy);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Heart between them when close — pulsing with glow
        if (t > 0.6) {
            const heartX = (msPx + pPx) / 2;
            const heartY = cy - gs(30) + Math.sin(frameCount * 0.1) * gs(3);
            const heartScale = 1 + Math.sin(frameCount * 0.15) * 0.15;
            ctx.save();
            ctx.shadowColor = '#EF4444';
            ctx.shadowBlur = gs(15);
            ctx.fillStyle = '#EF4444';
            ctx.font = `${gs(20 * heartScale)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('\u2665', heartX, heartY);
            ctx.restore();
            // Tiny heart particles
            for (let i = 0; i < 3; i++) {
                const hp = (t - 0.6) / 0.4;
                const hx = heartX + Math.sin(frameCount * 0.08 + i * 2.5) * gs(15);
                const hy = heartY - gs(10 + hp * 20 + i * 8);
                ctx.globalAlpha = 0.4 * (1 - hp * 0.5);
                ctx.fillStyle = '#F9A8D4';
                ctx.font = `${gs(8)}px sans-serif`;
                ctx.fillText('\u2665', hx, hy);
            }
            ctx.globalAlpha = 1;
        }

        // Title text with glow
        ctx.save();
        ctx.shadowColor = '#F472B6';
        ctx.shadowBlur = gs(10);
        ctx.fillStyle = '#F472B6';
        ctx.font = `bold ${gs(12)}px monospace`;
        ctx.textAlign = 'center';
        const acts = ['ACT I: THEY MEET', 'ACT II: THE CHASE', 'ACT III: JUNIOR'];
        const actIdx = level <= 3 ? 0 : level <= 6 ? 1 : 2;
        ctx.fillText(acts[actIdx], cx, gy(GAME_H * 0.25));
        ctx.restore();
    }

    function drawLevelClear() {
        // Flash the maze walls
        const flash = Math.floor(levelClearTimer / 200) % 2;
        if (flash) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;
        }
    }

    function drawVignette() {
        const g = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, canvas.height * 0.3,
            canvas.width / 2, canvas.height / 2, canvas.height * 0.75
        );
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // ── Touch controls ──
    let touchStartX = 0, touchStartY = 0, touchActive = false;
    function handleTouchStart(e) {
        e.preventDefault();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        if (state === ST_GAMEOVER) { restartGame(); return; }
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        touchActive = true;
    }
    function handleTouchMove(e) {
        e.preventDefault();
        if (!touchActive) return;
        const t = e.touches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        const threshold = 15;
        if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
            if (Math.abs(dx) > Math.abs(dy)) {
                msNextDir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
            } else {
                msNextDir = dy > 0 ? DIR.DOWN : DIR.UP;
            }
            touchStartX = t.clientX;
            touchStartY = t.clientY;
        }
    }
    function handleTouchEnd(e) {
        e.preventDefault();
        touchActive = false;
    }

    function drawTouchControls() {
        // Subtle D-pad overlay
        const cx = gx(GAME_W / 2), by = gy(GAME_H - 60);
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = '#E0E7FF';
        ctx.lineWidth = gs(2);
        // Up arrow
        ctx.beginPath(); ctx.moveTo(cx, by - gs(20)); ctx.lineTo(cx - gs(8), by - gs(8)); ctx.lineTo(cx + gs(8), by - gs(8)); ctx.closePath(); ctx.stroke();
        // Down arrow
        ctx.beginPath(); ctx.moveTo(cx, by + gs(20)); ctx.lineTo(cx - gs(8), by + gs(8)); ctx.lineTo(cx + gs(8), by + gs(8)); ctx.closePath(); ctx.stroke();
        // Left arrow
        ctx.beginPath(); ctx.moveTo(cx - gs(30), by); ctx.lineTo(cx - gs(18), by - gs(8)); ctx.lineTo(cx - gs(18), by + gs(8)); ctx.closePath(); ctx.stroke();
        // Right arrow
        ctx.beginPath(); ctx.moveTo(cx + gs(30), by); ctx.lineTo(cx + gs(18), by - gs(8)); ctx.lineTo(cx + gs(18), by + gs(8)); ctx.closePath(); ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // ── Input ──
    function restartGame() {
        score = 0; level = 1; lives = START_LIVES;
        bonusGiven = false; nextBonusAt = BONUS_LIFE_AT;
        frameCount = 0; startTime = Date.now();
        scorePopups = []; particles = [];
        startLevel();
        state = ST_LEVEL_SPLASH;
        levelSplashTimer = LEVEL_SPLASH_MS;
    }

    function handleKeyDown(e) {
        keys[e.key] = true;
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        if (state === ST_GAMEOVER) { restartGame(); e.preventDefault(); return; }
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') { msNextDir = DIR.LEFT; e.preventDefault(); }
        if (k === 'ArrowRight' || k === 'd' || k === 'D') { msNextDir = DIR.RIGHT; e.preventDefault(); }
        if (k === 'ArrowUp' || k === 'w' || k === 'W') { msNextDir = DIR.UP; e.preventDefault(); }
        if (k === 'ArrowDown' || k === 's' || k === 'S') { msNextDir = DIR.DOWN; e.preventDefault(); }
    }
    function handleKeyUp(e) {
        keys[e.key] = false;
    }

    // ── Game loop ──
    function gameLoop(timestamp) {
        if (!gameActive) return;
        // Loading screen
        if (!__allSpritesReady) {
            __drawLoadingScreen(canvas, ctx, 'MS. PAC-MAN', '#F472B6');
            animFrame = requestAnimationFrame(gameLoop);
            return;
        }
        animFrame = requestAnimationFrame(gameLoop);

        const dt = lastTime ? Math.min(timestamp - lastTime, 50) : 16;
        lastTime = timestamp;

        update(dt);
        draw();
    }

    // ── Level setup ──
    function startLevel() {
        loadMaze(level);
        initMsPacMan();
        initGhosts();
        fruit = null;
        prerenderMaze();
    }

    // ── Canvas sizing ──
    function fitCanvas() {
        if (!canvas) return;
        DPR = window.devicePixelRatio || 1;
        const parent = canvas.parentElement;
        const pw = parent ? parent.clientWidth : window.innerWidth;
        const ph = parent ? parent.clientHeight : window.innerHeight;
        const scaleX = pw / GAME_W;
        const scaleY = ph / GAME_H;
        SCALE = Math.min(scaleX, scaleY);
        canvas.width = Math.round(GAME_W * SCALE * DPR);
        canvas.height = Math.round(GAME_H * SCALE * DPR);
        canvas.style.width = Math.round(GAME_W * SCALE) + 'px';
        canvas.style.height = Math.round(GAME_H * SCALE) + 'px';
        SCALE *= DPR;
        if (mazeCanvas) prerenderMaze();
    }

    // ── Public API ──
    function init(cvs, player, onGameOverFn) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = player;
        gameOverCB = onGameOverFn;

        // Theme colors
        playerColor = player?.color || '#FBBF24';
        const themeId = player?.theme || 'retro';
        const theme = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        candyColors = ['#FF69B4', '#FFD700', '#00FFAB', '#06B6D4', '#F97316', '#A78BFA'];
        if (theme) {
            candyColors = theme.colors.slice(0, 6);
        }

        // Load high score
        try { hiScore = parseInt(localStorage.getItem(LS_KEY)) || 0; } catch { hiScore = 0; }

        // Init state
        score = 0;
        level = 1;
        lives = START_LIVES;
        bonusGiven = false;
        nextBonusAt = BONUS_LIFE_AT;
        gameActive = true;
        frameCount = 0;
        lastTime = 0;
        startTime = Date.now();
        scorePopups = [];
        particles = [];
        screenFlash = 0;
        pelletPulse = 0;
        fruit = null;

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });
        window.addEventListener('resize', fitCanvas);

        initBgStars();
        startLevel();

        state = ST_LEVEL_SPLASH;
        levelSplashTimer = LEVEL_SPLASH_MS;

        // Bind events
        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('keyup', handleKeyUp, true);
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

        canvas.setAttribute('tabindex', '0');
        canvas.style.outline = 'none';
        canvas.focus();

        __loadSprites(null);
        animFrame = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('keyup', handleKeyUp, true);
        if (canvas) {
            canvas.removeEventListener('touchstart', handleTouchStart);
            canvas.removeEventListener('touchmove', handleTouchMove);
            canvas.removeEventListener('touchend', handleTouchEnd);
        }
        window.removeEventListener('resize', fitCanvas);
        canvas = null;
        ctx = null;
        keys = {};
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return level; },
        isActive() { return gameActive; },
    };
})();
