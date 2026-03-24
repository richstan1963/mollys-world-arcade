/* MinniePac — Minnie Mouse themed Pac-Man for Your World Arcade */
window.MinniePac = (() => {
    // ── Constants ──
    const TILE_WALL = 1, TILE_DOT = 2, TILE_POWER = 3, TILE_EMPTY = 0;
    const TILE_TUNNEL = 4, TILE_GHOST_HOUSE = 5, TILE_GHOST_DOOR = 6;
    const COLS = 21, ROWS = 22;
    const DIR = { NONE: -1, UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };
    const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
    const DOT_SCORE = 10, POWER_SCORE = 50;
    const GHOST_SCORES = [200, 400, 800, 1600];
    const POWER_DURATION = 7000;
    const START_LIVES = 3;
    const BG_COLOR = '#1a0a14';
    let WALL_COLOR = '#E91E8C'; // Pink/magenta walls
    const GHOST_COLORS = {
        blinky: '#F43F5E', pinky: '#EC4899',
        inky: '#06B6D4',   clyde: '#F97316'
    };
    const FRIGHTENED_COLOR = '#1E3A8A';
    const FRIGHTENED_BLINK = '#FFFFFF';

    // Pink dot colors
    let CANDY_COLORS = ['#FF69B4','#FF85C8','#FFB6D9','#FF4DA6','#FF1493','#FF6EB4'];

    // Fruit definitions for bonus items
    const FRUITS = [
        { name: 'cherry',     color: '#EF4444', accent: '#22C55E', score: 100 },
        { name: 'strawberry', color: '#F43F5E', accent: '#4ADE80', score: 300 },
        { name: 'orange',     color: '#F97316', accent: '#FCD34D', score: 500 },
        { name: 'apple',      color: '#22C55E', accent: '#EF4444', score: 700 },
        { name: 'grape',      color: '#8B5CF6', accent: '#C4B5FD', score: 1000 },
        { name: 'galaxian',   color: '#3B82F6', accent: '#FACC15', score: 2000 },
        { name: 'bell',       color: '#FACC15', accent: '#F59E0B', score: 3000 },
        { name: 'key',        color: '#06B6D4', accent: '#E0E7FF', score: 5000 },
    ];

    // Classic-inspired 21×22 maze
    const MAZE_TEMPLATE = [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,3,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,3,1],
        [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
        [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
        [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
        [1,2,1,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,1,2,1],
        [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
        [1,1,1,1,2,1,1,1,0,1,1,1,0,1,1,1,2,1,1,1,1],
        [0,0,0,1,2,1,0,0,0,0,0,0,0,0,0,1,2,1,0,0,0],
        [1,1,1,1,2,1,0,1,1,6,0,6,1,1,0,1,2,1,1,1,1],
        [4,0,0,0,2,0,0,1,5,5,5,5,5,1,0,0,2,0,0,0,4],
        [1,1,1,1,2,1,0,1,1,1,1,1,1,1,0,1,2,1,1,1,1],
        [0,0,0,1,2,1,0,0,0,0,0,0,0,0,0,1,2,1,0,0,0],
        [1,1,1,1,2,1,0,1,1,1,1,1,1,1,0,1,2,1,1,1,1],
        [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
        [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
        [1,3,2,1,2,2,2,2,2,2,0,2,2,2,2,2,2,1,2,3,1],
        [1,1,2,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,2,1,1],
        [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
        [1,2,1,1,1,1,1,1,2,1,1,1,2,1,1,1,1,1,1,2,1],
        [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ];

    // ── State ──
    const LS_KEY = 'ywa_minniepac_hiscore';
    const ST_TITLE = 0, ST_PLAYING = 1;
    let canvas, ctx;
    let tileSize = 0, offsetX = 0, offsetY = 0;
    let maze = [];
    let score = 0, level = 1, lives = START_LIVES, hiScore = 0;
    let totalDots = 0, dotsEaten = 0;
    let gameState = ST_TITLE;
    let gameActive = false;
    let animFrame = null;
    let player = null;
    let onGameOver = null;
    let frameCount = 0;
    let lastTime = 0;
    let startTime = 0;
    let scorePopups = [];
    let keys = {};

    // Minnie
    let pacX = 0, pacY = 0;
    let pacDir = DIR.NONE, pacNextDir = DIR.NONE;
    let pacMouthAngle = 0, pacMouthDir = 1;
    let pacSpeed = 0;
    let pacAlive = true;
    let deathTimer = 0;
    const DEATH_DURATION = 1500;

    // Trail
    let pacTrail = [];
    const PAC_TRAIL_MAX = 8;

    // Power pellet
    let powerActive = false, powerTimer = 0;
    let ghostsEatenThisPower = 0;
    let pelletPulse = 0;

    // Screen flash
    let screenFlashTimer = 0;
    const SCREEN_FLASH_DURATION = 300;

    // Fruit bonus
    let activeFruit = null;
    let fruitTimer = 0;
    let fruitSpawnDots = 0;

    // Level clear
    let levelClearing = false, levelClearTimer = 0;
    const LEVEL_CLEAR_DURATION = 2000;

    // Level splash
    let levelSplash = false, levelSplashTimer = 0;
    const LEVEL_SPLASH_DURATION = 1500;

    // Ready countdown
    let readyTimer = 0;
    const READY_DURATION = 2000;

    // Ghosts
    let ghosts = [];
    const GHOST_NAMES = ['blinky', 'pinky', 'inky', 'clyde'];
    const GHOST_HOME_X = 10, GHOST_HOME_Y = 10;
    const GHOST_SCATTER_TARGETS = [
        { x: COLS - 2, y: 0 },
        { x: 1, y: 0 },
        { x: COLS - 2, y: ROWS - 1 },
        { x: 1, y: ROWS - 1 }
    ];

    // Audio
    let audioCtx = null;
    let wakaToggle = false;

    // Touch
    let touchStartX = 0, touchStartY = 0;

    // Background stars (pink-tinted sparkles)
    let bgStars = [];

    // Offscreen maze cache
    let mazeCache = null;

    // ══════════════════════════════════════════════
    // AUDIO
    // ══════════════════════════════════════════════
    function getAudioCtx() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
        }
        return audioCtx;
    }

    function playWaka() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.value = wakaToggle ? 520 : 580;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.07, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.07);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.07);
            wakaToggle = !wakaToggle;
        } catch {}
    }

    function playPowerSound() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.value = 90; osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.06, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.4);
        } catch {}
    }

    function playEatGhost() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.type = 'square';
            osc.frequency.setValueAtTime(300, ac.currentTime);
            osc.frequency.linearRampToValueAtTime(900, ac.currentTime + 0.15);
            gain.gain.setValueAtTime(0.1, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.2);
        } catch {}
    }

    function playDeath() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, ac.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.8);
            gain.gain.setValueAtTime(0.12, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.8);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.8);
        } catch {}
    }

    function playLevelClear() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            [0, 0.12, 0.24, 0.36].forEach((t, i) => {
                const osc = ac.createOscillator();
                const gain = ac.createGain();
                osc.connect(gain); gain.connect(ac.destination);
                osc.type = 'sine';
                osc.frequency.value = [523, 659, 784, 1047][i];
                gain.gain.setValueAtTime(0, ac.currentTime + t);
                gain.gain.linearRampToValueAtTime(0.1, ac.currentTime + t + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.3);
                osc.start(ac.currentTime + t); osc.stop(ac.currentTime + t + 0.3);
            });
        } catch {}
    }

    // ══════════════════════════════════════════════
    // MAZE
    // ══════════════════════════════════════════════
    function buildMaze() {
        maze = [];
        totalDots = 0;
        dotsEaten = 0;
        for (let r = 0; r < ROWS; r++) {
            maze[r] = [];
            for (let c = 0; c < COLS; c++) {
                const v = (r < MAZE_TEMPLATE.length && c < MAZE_TEMPLATE[0].length)
                    ? MAZE_TEMPLATE[r][c] : TILE_WALL;
                maze[r][c] = v;
                if (v === TILE_DOT || v === TILE_POWER) totalDots++;
            }
        }
    }

    function isWalkable(gx, gy) {
        if (gy < 0 || gy >= ROWS) return false;
        if (gx < 0 || gx >= COLS) {
            if (maze[gy] && (maze[gy][0] === TILE_TUNNEL || maze[gy][COLS - 1] === TILE_TUNNEL))
                return true;
            return false;
        }
        return maze[gy][gx] !== TILE_WALL;
    }

    function isWalkableForGhost(gx, gy, canUseDoor) {
        if (gy < 0 || gy >= ROWS) return false;
        if (gx < 0 || gx >= COLS) {
            if (maze[gy] && (maze[gy][0] === TILE_TUNNEL || maze[gy][COLS - 1] === TILE_TUNNEL))
                return true;
            return false;
        }
        const t = maze[gy][gx];
        if (t === TILE_WALL) return false;
        if (t === TILE_GHOST_DOOR && !canUseDoor) return false;
        return true;
    }

    // ══════════════════════════════════════════════
    // BACKGROUND SPARKLES (pink-tinted)
    // ══════════════════════════════════════════════
    function initBgStars() {
        bgStars = [];
        for (let i = 0; i < 60; i++) {
            bgStars.push({
                x: Math.random(), y: Math.random(),
                r: 0.5 + Math.random() * 1.5,
                a: 0.08 + Math.random() * 0.2,
                speed: 0.2 + Math.random() * 0.6,
                phase: Math.random() * Math.PI * 2,
                hue: Math.random() * 40 + 320, // pink-magenta range
            });
        }
    }

    function drawBgStars(w, h) {
        const t = frameCount * 0.02;
        for (const s of bgStars) {
            const twinkle = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
            ctx.globalAlpha = s.a * twinkle;
            ctx.fillStyle = `hsl(${s.hue}, 70%, 75%)`;
            ctx.beginPath();
            ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ══════════════════════════════════════════════
    // VIGNETTE + ATMOSPHERE
    // ══════════════════════════════════════════════
    function drawVignette(w, h) {
        const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.75);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(0.7, 'rgba(0,0,0,0.15)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
    }

    function drawScreenFlash(w, h) {
        if (screenFlashTimer <= 0) return;
        const alpha = (screenFlashTimer / SCREEN_FLASH_DURATION) * 0.3;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FF69B4';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    // ══════════════════════════════════════════════
    // GHOST AI
    // ══════════════════════════════════════════════
    function createGhost(name, index) {
        return {
            name, index,
            x: 9 + index, y: 10,
            dir: DIR.UP, nextDir: DIR.UP,
            color: GHOST_COLORS[name],
            state: 'home',
            homeTimer: index * 80 + 60,
            speed: 0.06 + level * 0.003,
            targetX: 0, targetY: 0,
            wobble: Math.random() * Math.PI * 2,
        };
    }

    function initGhosts() {
        ghosts = GHOST_NAMES.map((name, i) => createGhost(name, i));
    }

    function getGhostTarget(ghost) {
        const px = Math.round(pacX), py = Math.round(pacY);
        if (ghost.state === 'frightened')
            return { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
        if (ghost.state === 'eaten')
            return { x: GHOST_HOME_X, y: 9 };
        if (ghost.state === 'scatter')
            return GHOST_SCATTER_TARGETS[ghost.index];

        switch (ghost.name) {
            case 'blinky': return { x: px, y: py };
            case 'pinky': {
                const d = pacDir !== DIR.NONE ? pacDir : DIR.RIGHT;
                return {
                    x: Math.max(0, Math.min(COLS - 1, px + DX[d] * 4)),
                    y: Math.max(0, Math.min(ROWS - 1, py + DY[d] * 4))
                };
            }
            case 'inky':
                if (Math.random() < 0.3) return { x: px, y: py };
                return { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
            case 'clyde': {
                const dist = Math.abs(ghost.x - px) + Math.abs(ghost.y - py);
                return dist > 8 ? { x: px, y: py } : GHOST_SCATTER_TARGETS[ghost.index];
            }
            default: return { x: px, y: py };
        }
    }

    function chooseGhostDir(ghost) {
        const gx = Math.round(ghost.x), gy = Math.round(ghost.y);
        const target = getGhostTarget(ghost);
        ghost.targetX = target.x;
        ghost.targetY = target.y;
        const canUseDoor = (ghost.state === 'home' || ghost.state === 'eaten');
        const opposite = (ghost.dir + 2) % 4;
        let bestDir = ghost.dir;
        let bestDist = Infinity;

        for (let d = 0; d < 4; d++) {
            if (d === opposite && ghost.state !== 'eaten' && ghost.state !== 'home') continue;
            const nx = gx + DX[d], ny = gy + DY[d];
            if (!isWalkableForGhost(nx, ny, canUseDoor)) continue;
            if (ghost.state === 'frightened' && Math.random() < 0.3) { bestDir = d; break; }
            const dist = (nx - target.x) ** 2 + (ny - target.y) ** 2;
            if (dist < bestDist) { bestDist = dist; bestDir = d; }
        }
        return bestDir;
    }

    function updateGhost(ghost, dt) {
        const baseSpeed = ghost.state === 'eaten' ? ghost.speed * 2.5 :
                          ghost.state === 'frightened' ? ghost.speed * 0.6 :
                          ghost.speed;
        const speed = baseSpeed * dt * 60;
        ghost.wobble += dt * 4;

        if (ghost.state === 'home') {
            ghost.homeTimer -= dt * 60;
            if (ghost.homeTimer <= 0) {
                ghost.state = (frameCount % 800 < 400) ? 'scatter' : 'chase';
                ghost.y = 9; ghost.x = 10; ghost.dir = DIR.UP;
            }
            return;
        }

        if (ghost.state === 'eaten') {
            const homeX = GHOST_HOME_X, homeY = 10;
            if (Math.abs(ghost.x - homeX) < 0.5 && Math.abs(ghost.y - homeY) < 0.5) {
                ghost.x = homeX; ghost.y = homeY;
                ghost.state = 'chase'; ghost.dir = DIR.UP;
                return;
            }
        }

        if (ghost.state !== 'frightened' && ghost.state !== 'eaten') {
            ghost.state = ((frameCount + ghost.index * 100) % 1200) < 400 ? 'scatter' : 'chase';
        }

        const gx = Math.round(ghost.x), gy = Math.round(ghost.y);
        const atCenter = Math.abs(ghost.x - gx) < speed * 1.2 &&
                         Math.abs(ghost.y - gy) < speed * 1.2;
        if (atCenter) {
            ghost.x = gx; ghost.y = gy;
            ghost.dir = chooseGhostDir(ghost);
        }

        const nx = ghost.x + DX[ghost.dir] * speed;
        const ny = ghost.y + DY[ghost.dir] * speed;

        if (nx < -1) { ghost.x = COLS; return; }
        if (nx > COLS) { ghost.x = -1; return; }

        const canUseDoor = (ghost.state === 'eaten' || ghost.state === 'home');
        const checkX = Math.round(nx), checkY = Math.round(ny);
        if (checkX >= 0 && checkX < COLS && checkY >= 0 && checkY < ROWS &&
            isWalkableForGhost(checkX, checkY, canUseDoor)) {
            ghost.x = nx; ghost.y = ny;
        } else {
            ghost.x = gx; ghost.y = gy;
            ghost.dir = chooseGhostDir(ghost);
        }
    }

    function frightenGhosts() {
        ghostsEatenThisPower = 0;
        ghosts.forEach(g => {
            if (g.state !== 'eaten' && g.state !== 'home') {
                g.state = 'frightened';
                g.dir = (g.dir + 2) % 4;
            }
        });
        powerActive = true;
        powerTimer = POWER_DURATION;
        screenFlashTimer = SCREEN_FLASH_DURATION;
    }

    // ══════════════════════════════════════════════
    // MINNIE MOVEMENT (same as PacMae)
    // ══════════════════════════════════════════════
    function initPacMae() {
        pacX = 10; pacY = 16;
        pacDir = DIR.NONE;
        pacNextDir = DIR.NONE;
        pacAlive = true;
        pacSpeed = 0.09 + level * 0.005;
        if (pacSpeed > 0.16) pacSpeed = 0.16;
        pacTrail = [];
    }

    function getInputDir() {
        if (keys['ArrowUp']    || keys['w'] || keys['W']) return DIR.UP;
        if (keys['ArrowDown']  || keys['s'] || keys['S']) return DIR.DOWN;
        if (keys['ArrowLeft']  || keys['a'] || keys['A']) return DIR.LEFT;
        if (keys['ArrowRight'] || keys['d'] || keys['D']) return DIR.RIGHT;
        return DIR.NONE;
    }

    function updatePacMae(dt) {
        if (!pacAlive) return;

        pacMouthAngle += pacMouthDir * dt * 12;
        if (pacMouthAngle > 0.35) { pacMouthAngle = 0.35; pacMouthDir = -1; }
        if (pacMouthAngle < 0.02) { pacMouthAngle = 0.02; pacMouthDir = 1; }

        const heldDir = getInputDir();
        if (heldDir !== DIR.NONE) pacNextDir = heldDir;

        if (pacDir === DIR.NONE && pacNextDir === DIR.NONE) return;

        const move = pacSpeed * dt * 60;

        if (pacDir !== DIR.NONE && frameCount % 2 === 0) {
            pacTrail.push({ x: pacX, y: pacY, life: 1.0 });
            if (pacTrail.length > PAC_TRAIL_MAX) pacTrail.shift();
        }

        const gx = Math.round(pacX), gy = Math.round(pacY);
        const nearCenter = Math.abs(pacX - gx) < move * 1.5 &&
                           Math.abs(pacY - gy) < move * 1.5;

        if (pacNextDir !== DIR.NONE && nearCenter) {
            const nx = gx + DX[pacNextDir], ny = gy + DY[pacNextDir];
            if (isWalkable(nx, ny)) {
                pacX = gx; pacY = gy;
                pacDir = pacNextDir;
                pacNextDir = DIR.NONE;
            }
        }

        if (pacDir === DIR.NONE) return;

        const nx = pacX + DX[pacDir] * move;
        const ny = pacY + DY[pacDir] * move;

        if (nx < -0.5) { pacX = COLS - 0.5; return; }
        if (nx > COLS - 0.5) { pacX = -0.5; return; }

        const checkX = Math.round(nx), checkY = Math.round(ny);
        if (isWalkable(checkX, checkY)) {
            pacX = nx; pacY = ny;
        } else {
            pacX = Math.round(pacX);
            pacY = Math.round(pacY);
            pacDir = DIR.NONE;
        }

        const eatX = Math.round(pacX), eatY = Math.round(pacY);
        if (eatY >= 0 && eatY < ROWS && eatX >= 0 && eatX < COLS) {
            const tile = maze[eatY][eatX];
            if (tile === TILE_DOT) {
                maze[eatY][eatX] = TILE_EMPTY;
                score += DOT_SCORE;
                dotsEaten++;
                if (frameCount % 3 === 0) playWaka();
            } else if (tile === TILE_POWER) {
                maze[eatY][eatX] = TILE_EMPTY;
                score += POWER_SCORE;
                dotsEaten++;
                frightenGhosts();
                playPowerSound();
            }
        }
    }

    // ══════════════════════════════════════════════
    // FRUIT BONUS
    // ══════════════════════════════════════════════
    function spawnFruit() {
        const fruitIdx = Math.min(level - 1, FRUITS.length - 1);
        const fruit = FRUITS[fruitIdx];
        activeFruit = {
            x: 10, y: 13,
            ...fruit,
            timer: 8000,
            pulse: 0,
        };
    }

    function updateFruit(dt) {
        if (!activeFruit) {
            if (!fruitSpawnDots && dotsEaten >= Math.floor(totalDots * 0.3)) {
                fruitSpawnDots = 1;
                spawnFruit();
            } else if (fruitSpawnDots === 1 && dotsEaten >= Math.floor(totalDots * 0.7)) {
                fruitSpawnDots = 2;
                spawnFruit();
            }
            return;
        }
        activeFruit.timer -= dt * 1000;
        activeFruit.pulse += dt * 5;
        if (activeFruit.timer <= 0) {
            activeFruit = null;
            return;
        }
        const dist = Math.abs(pacX - activeFruit.x) + Math.abs(pacY - activeFruit.y);
        if (dist < 0.8 && pacAlive) {
            score += activeFruit.score;
            scorePopups.push({
                x: activeFruit.x, y: activeFruit.y,
                text: `+${activeFruit.score}`, life: 1.5,
                color: activeFruit.color
            });
            activeFruit = null;
        }
    }

    // ══════════════════════════════════════════════
    // COLLISION
    // ══════════════════════════════════════════════
    function checkCollisions() {
        if (!pacAlive) return;
        for (const ghost of ghosts) {
            if (ghost.state === 'home') continue;
            const dist = Math.abs(ghost.x - pacX) + Math.abs(ghost.y - pacY);
            if (dist < 0.8) {
                if (ghost.state === 'frightened') {
                    ghost.state = 'eaten';
                    const pts = GHOST_SCORES[Math.min(ghostsEatenThisPower, 3)];
                    score += pts;
                    ghostsEatenThisPower++;
                    scorePopups.push({ x: ghost.x, y: ghost.y, text: `+${pts}`, life: 1.0, color: ghost.color });
                    playEatGhost();
                    if (typeof Confetti !== 'undefined') Confetti.burst(toPixel(ghost.x, ghost.y).px, toPixel(ghost.x, ghost.y).py, 10);
                } else if (ghost.state !== 'eaten') {
                    pacAlive = false;
                    deathTimer = DEATH_DURATION;
                    playDeath();
                }
            }
        }
    }

    // ══════════════════════════════════════════════
    // DRAWING HELPERS
    // ══════════════════════════════════════════════
    function toPixel(gx, gy) {
        return {
            px: offsetX + gx * tileSize + tileSize / 2,
            py: offsetY + gy * tileSize + tileSize / 2
        };
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 233, g: 30, b: 140 };
    }

    function lightenColor(hex, amount) {
        const rgb = hexToRgb(hex);
        const r = Math.min(255, rgb.r + amount);
        const g = Math.min(255, rgb.g + amount);
        const b = Math.min(255, rgb.b + amount);
        return `rgb(${r},${g},${b})`;
    }

    // Pre-render walls to offscreen canvas (pink/magenta glow)
    function prerenderMaze() {
        const offscreen = document.createElement('canvas');
        offscreen.width = canvas.width;
        offscreen.height = canvas.height;
        const oc = offscreen.getContext('2d');

        const wallLineW = Math.max(2, tileSize * 0.1);
        const isW = (c, r) => (r >= 0 && r < ROWS && c >= 0 && c < COLS && MAZE_TEMPLATE[r][c] === TILE_WALL);

        const wallRgb = hexToRgb(WALL_COLOR);
        const wallLight = lightenColor(WALL_COLOR, 80);

        // Outer glow
        oc.strokeStyle = `rgba(${wallRgb.r},${wallRgb.g},${wallRgb.b},0.3)`;
        oc.lineWidth = wallLineW + 4;
        oc.lineCap = 'round';
        oc.lineJoin = 'round';
        oc.shadowColor = WALL_COLOR;
        oc.shadowBlur = 12;
        drawWallLines(oc, isW, wallLineW + 4);

        // Main wall with gradient
        oc.shadowBlur = 6;
        oc.shadowColor = wallLight;
        oc.lineWidth = wallLineW;

        const wallGrad = oc.createLinearGradient(0, offsetY, 0, offsetY + ROWS * tileSize);
        wallGrad.addColorStop(0, wallLight);
        wallGrad.addColorStop(0.5, WALL_COLOR);
        wallGrad.addColorStop(1, wallLight);
        oc.strokeStyle = wallGrad;
        drawWallLines(oc, isW, wallLineW);

        // Inner highlight
        oc.shadowBlur = 0;
        oc.lineWidth = Math.max(1, wallLineW * 0.4);
        oc.strokeStyle = `rgba(255,255,255,0.12)`;
        drawWallLines(oc, isW, Math.max(1, wallLineW * 0.4));

        mazeCache = offscreen;
    }

    function drawWallLines(oc, isW, lineWidth) {
        const half = tileSize * 0.48;
        const rad = tileSize * 0.22;

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (MAZE_TEMPLATE[r][c] !== TILE_WALL) continue;
                const px = offsetX + c * tileSize;
                const py = offsetY + r * tileSize;
                const cx = px + tileSize / 2;
                const cy = py + tileSize / 2;

                if (!isW(c, r-1)) { oc.beginPath(); oc.moveTo(cx-half, cy-half); oc.lineTo(cx+half, cy-half); oc.stroke(); }
                if (!isW(c, r+1)) { oc.beginPath(); oc.moveTo(cx-half, cy+half); oc.lineTo(cx+half, cy+half); oc.stroke(); }
                if (!isW(c-1, r)) { oc.beginPath(); oc.moveTo(cx-half, cy-half); oc.lineTo(cx-half, cy+half); oc.stroke(); }
                if (!isW(c+1, r)) { oc.beginPath(); oc.moveTo(cx+half, cy-half); oc.lineTo(cx+half, cy+half); oc.stroke(); }

                if (!isW(c,r-1) && !isW(c-1,r)) { oc.beginPath(); oc.arc(cx-half+rad, cy-half+rad, rad, Math.PI, Math.PI*1.5); oc.stroke(); }
                if (!isW(c,r-1) && !isW(c+1,r)) { oc.beginPath(); oc.arc(cx+half-rad, cy-half+rad, rad, Math.PI*1.5, 0); oc.stroke(); }
                if (!isW(c,r+1) && !isW(c-1,r)) { oc.beginPath(); oc.arc(cx-half+rad, cy+half-rad, rad, Math.PI*0.5, Math.PI); oc.stroke(); }
                if (!isW(c,r+1) && !isW(c+1,r)) { oc.beginPath(); oc.arc(cx+half-rad, cy+half-rad, rad, 0, Math.PI*0.5); oc.stroke(); }
            }
        }
    }

    function drawMaze() {
        // Blit cached walls
        if (mazeCache) {
            if (levelClearing && Math.sin(frameCount * 0.2) > 0) {
                ctx.globalAlpha = 0.5;
            }
            ctx.drawImage(mazeCache, 0, 0);
            ctx.globalAlpha = 1;
        }

        // Draw dots, power pellets, ghost door
        pelletPulse += 0.08;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const t = maze[r][c];
                const px = offsetX + c * tileSize + tileSize / 2;
                const py = offsetY + r * tileSize + tileSize / 2;

                if (t === TILE_DOT) {
                    // Pink dots
                    const cIdx = (r * COLS + c) % CANDY_COLORS.length;
                    const dotR = tileSize * 0.14;
                    const dotColor = CANDY_COLORS[cIdx];

                    ctx.save();
                    ctx.shadowColor = dotColor;
                    ctx.shadowBlur = tileSize * 0.25;
                    ctx.fillStyle = dotColor;
                    ctx.beginPath();
                    ctx.arc(px, py, dotR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    // Bright inner shine
                    ctx.fillStyle = 'rgba(255,255,255,0.7)';
                    ctx.beginPath();
                    ctx.arc(px - dotR * 0.25, py - dotR * 0.25, dotR * 0.35, 0, Math.PI * 2);
                    ctx.fill();
                } else if (t === TILE_POWER) {
                    // Heart-shaped power pellet (red)
                    const pulseScale = 0.3 + Math.sin(pelletPulse) * 0.08;
                    const pr = tileSize * pulseScale;
                    const heartColor = '#FF1744';
                    const glowIntensity = 0.6 + Math.sin(pelletPulse * 2) * 0.4;

                    // Outer glow
                    ctx.save();
                    ctx.shadowColor = heartColor;
                    ctx.shadowBlur = tileSize * 0.8 * glowIntensity;
                    const glowGrad = ctx.createRadialGradient(px, py, 0, px, py, pr * 2);
                    glowGrad.addColorStop(0, heartColor);
                    glowGrad.addColorStop(0.5, heartColor);
                    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.globalAlpha = 0.3 * glowIntensity;
                    ctx.fillStyle = glowGrad;
                    ctx.beginPath();
                    ctx.arc(px, py, pr * 2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    // Draw heart shape
                    ctx.save();
                    ctx.shadowColor = heartColor;
                    ctx.shadowBlur = tileSize * 0.5;
                    const hs = pr * 1.1; // heart scale
                    ctx.fillStyle = heartColor;
                    ctx.beginPath();
                    ctx.moveTo(px, py + hs * 0.6);
                    ctx.bezierCurveTo(px - hs * 1.2, py - hs * 0.2, px - hs * 0.6, py - hs * 1.0, px, py - hs * 0.4);
                    ctx.bezierCurveTo(px + hs * 0.6, py - hs * 1.0, px + hs * 1.2, py - hs * 0.2, px, py + hs * 0.6);
                    ctx.fill();
                    ctx.restore();

                    // Heart highlight
                    ctx.save();
                    ctx.globalAlpha = 0.5;
                    ctx.fillStyle = '#FFF';
                    ctx.beginPath();
                    ctx.arc(px - hs * 0.25, py - hs * 0.35, hs * 0.18, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    // Sparkle lines around heart
                    const sparkleAngle = pelletPulse * 1.5;
                    ctx.save();
                    ctx.globalAlpha = 0.6 * glowIntensity;
                    ctx.strokeStyle = '#FFF';
                    ctx.lineWidth = 1;
                    for (let i = 0; i < 4; i++) {
                        const a = sparkleAngle + i * Math.PI / 4;
                        const inner = pr * 0.8;
                        const outer = pr * 1.6;
                        ctx.beginPath();
                        ctx.moveTo(px + Math.cos(a) * inner, py + Math.sin(a) * inner);
                        ctx.lineTo(px + Math.cos(a) * outer, py + Math.sin(a) * outer);
                        ctx.stroke();
                    }
                    ctx.restore();
                } else if (t === TILE_GHOST_DOOR) {
                    // Glowing ghost door (pink)
                    ctx.save();
                    ctx.shadowColor = '#FF69B4';
                    ctx.shadowBlur = 6;
                    ctx.fillStyle = '#FF69B4';
                    const doorPx = offsetX + c * tileSize;
                    const doorPy = offsetY + r * tileSize;
                    ctx.fillRect(doorPx + 1, doorPy + tileSize / 2 - 1.5, tileSize - 2, 3);
                    ctx.restore();
                }
            }
        }
    }

    // ══════════════════════════════════════════════
    // FRUIT DRAWING
    // ══════════════════════════════════════════════
    function drawFruit() {
        if (!activeFruit) return;
        const { px, py } = toPixel(activeFruit.x, activeFruit.y);
        const r = tileSize * 0.38;
        const pulse = 1 + Math.sin(activeFruit.pulse) * 0.08;
        const fadeAlpha = activeFruit.timer < 2000 ? activeFruit.timer / 2000 : 1;

        ctx.save();
        ctx.globalAlpha = fadeAlpha;

        ctx.shadowColor = activeFruit.color;
        ctx.shadowBlur = tileSize * 0.5;

        const fruitGrad = ctx.createRadialGradient(px - r * 0.2, py - r * 0.2, 0, px, py, r * pulse);
        fruitGrad.addColorStop(0, lightenColor(activeFruit.color, 60));
        fruitGrad.addColorStop(0.6, activeFruit.color);
        fruitGrad.addColorStop(1, lightenColor(activeFruit.color, -40));
        ctx.fillStyle = fruitGrad;
        ctx.beginPath();
        ctx.arc(px, py, r * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = activeFruit.accent;
        ctx.beginPath();
        ctx.ellipse(px, py - r * pulse * 0.85, r * 0.25, r * 0.15, -0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.ellipse(px - r * 0.2, py - r * 0.3, r * 0.25, r * 0.15, -0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = `bold ${Math.max(8, tileSize * 0.35)}px "Segoe UI", system-ui`;
        ctx.textAlign = 'center';
        ctx.fillStyle = activeFruit.color;
        ctx.fillText(`${activeFruit.score}`, px, py + r * pulse + tileSize * 0.4);

        ctx.restore();
    }

    // ══════════════════════════════════════════════
    // MINNIE DRAWING
    // ══════════════════════════════════════════════
    function drawPacTrail() {
        if (pacTrail.length === 0) return;
        for (let i = pacTrail.length - 1; i >= 0; i--) {
            pacTrail[i].life -= 0.04;
            if (pacTrail[i].life <= 0) { pacTrail.splice(i, 1); continue; }
            const t = pacTrail[i];
            const { px, py } = toPixel(t.x, t.y);
            const r = tileSize * 0.3 * t.life;
            ctx.save();
            ctx.globalAlpha = t.life * 0.3;
            ctx.fillStyle = '#FF69B4';
            ctx.shadowColor = '#FF69B4';
            ctx.shadowBlur = tileSize * 0.3;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // Draw Minnie's polka-dot bow
    function drawMinnieBow(radius) {
        const bowSize = radius * 0.38;
        const bowY = -radius * 0.75;

        // Left loop
        ctx.fillStyle = '#E91E63';
        ctx.beginPath();
        ctx.ellipse(-bowSize * 0.65, bowY, bowSize * 1.0, bowSize * 0.55, -0.3, 0, Math.PI * 2);
        ctx.fill();
        // Right loop
        ctx.beginPath();
        ctx.ellipse(bowSize * 0.65, bowY, bowSize * 1.0, bowSize * 0.55, 0.3, 0, Math.PI * 2);
        ctx.fill();
        // Center knot
        ctx.fillStyle = '#C2185B';
        ctx.beginPath();
        ctx.arc(0, bowY, bowSize * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Polka dots on left loop
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(-bowSize * 0.9, bowY - bowSize * 0.1, bowSize * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-bowSize * 0.4, bowY + bowSize * 0.15, bowSize * 0.1, 0, Math.PI * 2);
        ctx.fill();
        // Polka dots on right loop
        ctx.beginPath();
        ctx.arc(bowSize * 0.9, bowY - bowSize * 0.1, bowSize * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bowSize * 0.4, bowY + bowSize * 0.15, bowSize * 0.1, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw Minnie's eyelashes
    function drawEyelashes(eyeX, eyeY, radius) {
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = Math.max(1, radius * 0.04);
        ctx.lineCap = 'round';
        // 3 lashes fanning upward
        for (let i = -1; i <= 1; i++) {
            const angle = -Math.PI / 2 + i * 0.35;
            const lashLen = radius * 0.18;
            ctx.beginPath();
            ctx.moveTo(eyeX + Math.cos(angle) * radius * 0.12, eyeY + Math.sin(angle) * radius * 0.12);
            ctx.lineTo(eyeX + Math.cos(angle) * (radius * 0.12 + lashLen), eyeY + Math.sin(angle) * (radius * 0.12 + lashLen));
            ctx.stroke();
        }
    }

    function drawPacMae() {
        if (!pacAlive) {
            // Death animation: shrink + spin + pink particles
            const progress = 1 - (deathTimer / DEATH_DURATION);
            const { px, py } = toPixel(pacX, pacY);
            const radius = tileSize * 0.42 * (1 - progress);
            if (radius <= 0) return;

            ctx.save();
            ctx.translate(px, py);

            // Pink particle burst
            if (progress > 0.2) {
                const particleCount = 8;
                for (let i = 0; i < particleCount; i++) {
                    const angle = (i / particleCount) * Math.PI * 2 + progress * 3;
                    const dist = tileSize * progress * 1.5;
                    const pSize = tileSize * 0.06 * (1 - progress);
                    if (pSize > 0) {
                        ctx.globalAlpha = (1 - progress) * 0.8;
                        ctx.fillStyle = i % 2 === 0 ? '#FF69B4' : '#E91E63';
                        ctx.beginPath();
                        ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, pSize, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }

            ctx.globalAlpha = 1;
            ctx.rotate(progress * Math.PI * 6);
            const mA = Math.PI * progress;

            ctx.shadowColor = '#FF69B4';
            ctx.shadowBlur = tileSize * 0.4 * (1 - progress);
            ctx.fillStyle = '#FF69B4';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, radius, mA, Math.PI * 2 - mA);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            return;
        }

        const { px, py } = toPixel(pacX, pacY);
        const radius = tileSize * 0.42;

        let rotation = 0;
        if (pacDir === DIR.UP) rotation = -Math.PI / 2;
        else if (pacDir === DIR.DOWN) rotation = Math.PI / 2;
        else if (pacDir === DIR.LEFT) rotation = Math.PI;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rotation);

        // Pink glow behind Minnie
        ctx.shadowColor = '#FF69B4';
        ctx.shadowBlur = tileSize * 0.4;

        // Body with pink gradient (Minnie's main color)
        const mA = pacMouthAngle * Math.PI;
        const bodyGrad = ctx.createRadialGradient(-radius * 0.15, -radius * 0.1, 0, 0, 0, radius);
        bodyGrad.addColorStop(0, '#FFB6D9'); // light pink center
        bodyGrad.addColorStop(0.5, '#FF69B4');
        bodyGrad.addColorStop(1, '#E91E63');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, mA, -mA + Math.PI * 2);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;

        // Mouth interior
        if (mA > 0.1) {
            ctx.fillStyle = 'rgba(120, 20, 60, 0.4)';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, radius * 0.8, mA * 0.5, -mA * 0.5 + Math.PI * 2);
            ctx.closePath();
            ctx.fill();
        }

        // Minnie's polka-dot bow
        drawMinnieBow(radius);

        // Eye with eyelashes
        const eyeX = radius * 0.15, eyeY = -radius * 0.3;
        // Eye white
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.ellipse(eyeX, eyeY, radius * 0.14, radius * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        // Pupil
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.arc(eyeX + radius * 0.02, eyeY + radius * 0.02, radius * 0.09, 0, Math.PI * 2);
        ctx.fill();
        // Eye highlight
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(eyeX + radius * 0.06, eyeY - radius * 0.05, radius * 0.04, 0, Math.PI * 2);
        ctx.fill();

        // Eyelashes
        drawEyelashes(eyeX, eyeY, radius);

        // Beauty mark on cheek (small dark dot)
        ctx.fillStyle = '#4a1a2e';
        ctx.beginPath();
        ctx.arc(radius * 0.25, radius * 0.12, radius * 0.04, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // ══════════════════════════════════════════════
    // GHOST DRAWING (same as PacMae)
    // ══════════════════════════════════════════════
    function drawGhost(ghost) {
        if (ghost.state === 'home' && ghost.homeTimer > 0) {
            const { px, py } = toPixel(ghost.x, ghost.y);
            ctx.globalAlpha = 0.5;
            drawGhostShape(px, py, ghost.color, ghost.wobble, false, ghost.name);
            ctx.globalAlpha = 1;
            return;
        }

        const { px, py } = toPixel(ghost.x, ghost.y);

        if (ghost.state === 'eaten') {
            ctx.save();
            ctx.globalAlpha = 0.15;
            drawGhostShape(px, py, ghost.color, ghost.wobble, false, ghost.name);
            ctx.globalAlpha = 1;
            ctx.restore();
            drawGhostEyes(px, py, ghost.dir);
            return;
        }

        const isFrightened = ghost.state === 'frightened';
        let color = ghost.color;
        let isBlinking = false;

        if (isFrightened) {
            if (powerTimer < 2000) {
                isBlinking = Math.floor(frameCount / 8) % 2 === 0;
                color = isBlinking ? FRIGHTENED_BLINK : FRIGHTENED_COLOR;
            } else {
                color = FRIGHTENED_COLOR;
            }
        }

        drawGhostShape(px, py, color, ghost.wobble, isFrightened, ghost.name);
        if (!isFrightened) {
            drawGhostFace(px, py, ghost.dir, ghost.name);
        } else {
            drawFrightenedFace(px, py, isBlinking);
        }
    }

    function drawGhostShape(px, py, color, wobble, frightened, name) {
        const r = tileSize * 0.42;
        const bodyBot = py + r * 0.7;

        ctx.save();

        ctx.shadowColor = color;
        ctx.shadowBlur = frightened ? tileSize * 0.3 : tileSize * 0.2;

        const bodyGrad = ctx.createLinearGradient(px - r, py - r, px + r, bodyBot);
        bodyGrad.addColorStop(0, lightenColor(color, 50));
        bodyGrad.addColorStop(0.4, color);
        bodyGrad.addColorStop(1, lightenColor(color, -30));
        ctx.fillStyle = bodyGrad;

        ctx.beginPath();
        ctx.arc(px, py - r * 0.15, r, Math.PI, 0);
        ctx.lineTo(px + r, bodyBot);

        const waves = 4, waveW = (r * 2) / waves;
        const waveH = tileSize * 0.15;
        for (let i = 0; i < waves; i++) {
            const wx = px + r - waveW * i;
            const wob = Math.sin(wobble + i * 1.8) * waveH * 0.5;
            ctx.quadraticCurveTo(wx - waveW * 0.5, bodyBot + waveH + wob, wx - waveW, bodyBot);
        }
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;

        const highlightGrad = ctx.createRadialGradient(px - r * 0.3, py - r * 0.5, 0, px, py - r * 0.15, r);
        highlightGrad.addColorStop(0, 'rgba(255,255,255,0.25)');
        highlightGrad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
        highlightGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = highlightGrad;
        ctx.beginPath();
        ctx.arc(px, py - r * 0.15, r * 0.95, Math.PI, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    function drawGhostFace(px, py, dir, name) {
        drawGhostEyes(px, py, dir);

        const mouthY = py + tileSize * 0.1;
        const mouthW = tileSize * 0.2;

        ctx.save();
        ctx.lineWidth = Math.max(1, tileSize * 0.04);
        ctx.lineCap = 'round';

        switch (name) {
            case 'blinky':
                ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                ctx.lineWidth = Math.max(1, tileSize * 0.05);
                ctx.beginPath();
                ctx.moveTo(px - tileSize * 0.22, py - tileSize * 0.3);
                ctx.lineTo(px - tileSize * 0.08, py - tileSize * 0.24);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(px + tileSize * 0.22, py - tileSize * 0.3);
                ctx.lineTo(px + tileSize * 0.08, py - tileSize * 0.24);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(0,0,0,0.35)';
                ctx.lineWidth = Math.max(1, tileSize * 0.04);
                ctx.beginPath();
                ctx.arc(px, mouthY + tileSize * 0.08, mouthW * 0.7, Math.PI * 1.2, Math.PI * 1.8);
                ctx.stroke();
                break;

            case 'pinky':
                ctx.fillStyle = 'rgba(255,150,180,0.35)';
                ctx.beginPath();
                ctx.arc(px - tileSize * 0.2, py + tileSize * 0.02, tileSize * 0.06, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(px + tileSize * 0.2, py + tileSize * 0.02, tileSize * 0.06, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath();
                ctx.arc(px, mouthY - tileSize * 0.02, mouthW * 0.5, 0.1, Math.PI - 0.1);
                ctx.stroke();
                break;

            case 'inky':
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath();
                ctx.ellipse(px, mouthY + tileSize * 0.02, tileSize * 0.05, tileSize * 0.06, 0, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'clyde':
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath();
                ctx.arc(px, mouthY - tileSize * 0.02, mouthW * 0.5, 0.1, Math.PI - 0.1);
                ctx.stroke();
                ctx.fillStyle = 'rgba(255,100,100,0.5)';
                ctx.beginPath();
                ctx.ellipse(px + tileSize * 0.02, mouthY + tileSize * 0.06, tileSize * 0.05, tileSize * 0.04, 0, 0, Math.PI);
                ctx.fill();
                break;
        }
        ctx.restore();
    }

    function drawGhostEyes(px, py, dir) {
        const eyeOffX = tileSize * 0.14;
        const eyeR = tileSize * 0.11;
        const pupilR = tileSize * 0.055;
        const pupilOff = tileSize * 0.04;

        let pdx = 0, pdy = 0;
        if (dir === DIR.LEFT) pdx = -pupilOff;
        else if (dir === DIR.RIGHT) pdx = pupilOff;
        else if (dir === DIR.UP) pdy = -pupilOff;
        else if (dir === DIR.DOWN) pdy = pupilOff;

        for (let side = -1; side <= 1; side += 2) {
            const ex = px + side * eyeOffX;
            const ey = py - tileSize * 0.12;
            const eyeGrad = ctx.createRadialGradient(ex - eyeR * 0.2, ey - eyeR * 0.2, 0, ex, ey, eyeR * 1.2);
            eyeGrad.addColorStop(0, '#FFFFFF');
            eyeGrad.addColorStop(1, '#E8E8F0');
            ctx.fillStyle = eyeGrad;
            ctx.beginPath();
            ctx.ellipse(ex, ey, eyeR, eyeR * 1.25, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1E40AF';
            ctx.beginPath();
            ctx.arc(ex + pdx, ey + pdy, pupilR * 1.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0a0a1a';
            ctx.beginPath();
            ctx.arc(ex + pdx, ey + pdy, pupilR * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.beginPath();
            ctx.arc(ex + pdx * 0.3 + pupilR * 0.3, ey + pdy * 0.3 - pupilR * 0.3, pupilR * 0.35, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawFrightenedFace(px, py, blinking) {
        const color = blinking ? '#F43F5E' : '#FFF';

        ctx.fillStyle = color;
        for (let side = -1; side <= 1; side += 2) {
            const ex = px + side * tileSize * 0.12;
            const ey = py - tileSize * 0.12;
            if (blinking) {
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(1, tileSize * 0.04);
                const s = tileSize * 0.05;
                ctx.beginPath();
                ctx.moveTo(ex - s, ey - s); ctx.lineTo(ex + s, ey + s);
                ctx.moveTo(ex + s, ey - s); ctx.lineTo(ex - s, ey + s);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(ex, ey, tileSize * 0.055, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, tileSize * 0.04);
        ctx.beginPath();
        const mY = py + tileSize * 0.08;
        const mW = tileSize * 0.28;
        const teeth = 5;
        ctx.moveTo(px - mW, mY);
        for (let i = 0; i <= teeth; i++) {
            const wobble = Math.sin(frameCount * 0.15 + i) * 1.5;
            ctx.lineTo(px - mW + (mW * 2 / teeth) * i, mY + (i % 2 === 0 ? -2.5 : 2.5) + wobble);
        }
        ctx.stroke();
    }

    // ══════════════════════════════════════════════
    // SCORE POPUPS
    // ══════════════════════════════════════════════
    function drawScorePopups(dt) {
        scorePopups = scorePopups.filter(p => {
            p.life -= dt * 0.6;
            if (p.life <= 0) return false;
            const { px, py } = toPixel(p.x, p.y);
            const floatY = py - (1 - p.life) * tileSize * 2.5;
            const scale = p.life > 0.7 ? 1 + (1 - (p.life - 0.7) / 0.3) * 0.3 : 1;

            ctx.save();
            ctx.globalAlpha = Math.min(p.life * 1.5, 1);
            ctx.translate(px, floatY);
            ctx.scale(scale, scale);

            const fontSize = Math.max(11, tileSize * 0.75);
            ctx.font = `bold ${fontSize}px "Orbitron", "Press Start 2P", monospace`;
            ctx.textAlign = 'center';

            ctx.shadowColor = p.color || '#FFF';
            ctx.shadowBlur = 8;

            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.strokeText(p.text, 0, 0);

            const textGrad = ctx.createLinearGradient(0, -fontSize * 0.5, 0, fontSize * 0.3);
            textGrad.addColorStop(0, '#FFF');
            textGrad.addColorStop(1, p.color || '#FFF');
            ctx.fillStyle = textGrad;
            ctx.fillText(p.text, 0, 0);

            ctx.restore();
            return true;
        });
    }

    // ══════════════════════════════════════════════
    // HUD (pink/red Minnie theme)
    // ══════════════════════════════════════════════
    function drawHUD(w, h) {
        const hudH = offsetY - 4;

        // HUD background
        const hudGrad = ctx.createLinearGradient(0, 0, 0, hudH);
        hudGrad.addColorStop(0, 'rgba(26, 10, 20, 0.97)');
        hudGrad.addColorStop(1, 'rgba(26, 10, 20, 0.7)');
        ctx.fillStyle = hudGrad;
        ctx.fillRect(0, 0, w, hudH);

        // Title with pink rainbow gradient
        const titleSize = Math.max(14, tileSize * 0.9);
        ctx.font = `bold ${titleSize}px "Orbitron", "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        const titleGrad = ctx.createLinearGradient(w / 2 - 60, 0, w / 2 + 60, 0);
        const hue = (frameCount * 2) % 360;
        titleGrad.addColorStop(0, `hsl(${(hue + 320) % 360}, 90%, 65%)`);
        titleGrad.addColorStop(0.5, `hsl(${(hue + 340) % 360}, 90%, 75%)`);
        titleGrad.addColorStop(1, `hsl(${(hue + 350) % 360}, 90%, 65%)`);

        ctx.save();
        ctx.shadowColor = '#FF69B4';
        ctx.shadowBlur = 8;
        ctx.fillStyle = titleGrad;
        ctx.fillText('MINNIE PAC', w / 2, hudH * 0.42);
        ctx.restore();

        // Score with pink glow
        const scoreSize = Math.max(12, tileSize * 0.65);
        ctx.font = `bold ${scoreSize}px "Orbitron", "Press Start 2P", monospace`;
        ctx.save();
        ctx.shadowColor = '#FF69B4';
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#FF69B4';
        ctx.textAlign = 'center';
        ctx.fillText(score.toLocaleString(), w / 2, hudH * 0.78);
        ctx.restore();

        // Player info (left)
        ctx.textAlign = 'left';
        ctx.font = `bold ${Math.max(11, tileSize * 0.55)}px "Segoe UI", system-ui`;
        ctx.fillStyle = player?.color || '#FF69B4';
        ctx.fillText(`${player?.emoji || ''} ${player?.name || 'Player'}`, 8, hudH * 0.55);

        // Level (right)
        ctx.textAlign = 'right';
        ctx.save();
        ctx.shadowColor = '#FFB6D9';
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#FFB6D9';
        ctx.font = `bold ${Math.max(11, tileSize * 0.55)}px "Segoe UI", system-ui`;
        ctx.fillText(`Level ${level}`, w - 8, hudH * 0.42);
        ctx.restore();

        // Lives as mini Minnie icons
        ctx.save();
        ctx.shadowColor = '#FF69B4';
        ctx.shadowBlur = 3;
        const lifeSize = Math.max(7, tileSize * 0.32);
        for (let i = 0; i < lives; i++) {
            const lx = w - 12 - (lives - 1 - i) * (lifeSize * 2.5);
            const ly = hudH * 0.72;

            // Mini pink pac body
            const miniGrad = ctx.createRadialGradient(lx - lifeSize * 0.2, ly - lifeSize * 0.2, 0, lx, ly, lifeSize);
            miniGrad.addColorStop(0, '#FFB6D9');
            miniGrad.addColorStop(1, '#E91E63');
            ctx.fillStyle = miniGrad;
            ctx.beginPath();
            ctx.arc(lx, ly, lifeSize, 0.25 * Math.PI, 1.75 * Math.PI);
            ctx.lineTo(lx, ly);
            ctx.closePath();
            ctx.fill();

            // Mini bow on life icon
            ctx.fillStyle = '#E91E63';
            const mbSize = lifeSize * 0.3;
            ctx.beginPath();
            ctx.ellipse(lx - mbSize * 0.3, ly - lifeSize * 0.7, mbSize, mbSize * 0.4, -0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(lx + mbSize * 0.3, ly - lifeSize * 0.7, mbSize, mbSize * 0.4, 0.3, 0, Math.PI * 2);
            ctx.fill();

            // Mini eye
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(lx + lifeSize * 0.15, ly - lifeSize * 0.35, lifeSize * 0.15, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // HUD bottom border (pink glow)
        ctx.save();
        const borderGrad = ctx.createLinearGradient(0, 0, w, 0);
        borderGrad.addColorStop(0, 'rgba(233, 30, 140, 0)');
        borderGrad.addColorStop(0.3, 'rgba(233, 30, 140, 0.4)');
        borderGrad.addColorStop(0.5, 'rgba(233, 30, 140, 0.8)');
        borderGrad.addColorStop(0.7, 'rgba(233, 30, 140, 0.4)');
        borderGrad.addColorStop(1, 'rgba(233, 30, 140, 0)');
        ctx.fillStyle = borderGrad;
        ctx.shadowColor = WALL_COLOR;
        ctx.shadowBlur = 6;
        ctx.fillRect(0, hudH - 1, w, 2);
        ctx.restore();

        // Power mode indicator
        if (powerActive) {
            const blinkAlpha = 0.5 + Math.sin(frameCount * 0.3) * 0.5;
            ctx.save();
            ctx.globalAlpha = blinkAlpha;
            ctx.font = `bold ${Math.max(9, tileSize * 0.4)}px "Segoe UI", system-ui`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FF1744';
            ctx.shadowColor = '#FF1744';
            ctx.shadowBlur = 6;
            ctx.fillText('POWER!', w / 2, hudH * 0.95);
            ctx.restore();
        }
    }

    function drawReadyScreen() {
        if (readyTimer <= 0) return;
        const alpha = Math.min(readyTimer / 500, 1);
        ctx.save();
        ctx.globalAlpha = alpha;

        ctx.shadowColor = '#FF69B4';
        ctx.shadowBlur = 15;
        ctx.font = `bold ${Math.max(18, tileSize * 1.2)}px "Orbitron", "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FF69B4';
        const { py } = toPixel(10, 13);
        ctx.fillText('READY!', canvas.width / 2, py);

        ctx.shadowBlur = 0;
        ctx.font = `${Math.max(9, tileSize * 0.45)}px "Segoe UI", system-ui`;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('Use Arrow Keys or Swipe to Move', canvas.width / 2, py + Math.max(16, tileSize * 0.9));
        ctx.restore();
    }

    function drawGameOver(w, h) {
        ctx.save();
        ctx.fillStyle = 'rgba(26, 10, 20, 0.8)';
        ctx.fillRect(0, 0, w, h);

        ctx.shadowColor = '#E91E63';
        ctx.shadowBlur = 20;
        ctx.font = `bold ${Math.max(22, tileSize * 1.5)}px "Orbitron", "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        const goGrad = ctx.createLinearGradient(w / 2 - 80, h / 2 - 50, w / 2 + 80, h / 2 - 20);
        goGrad.addColorStop(0, '#E91E63');
        goGrad.addColorStop(0.5, '#FF69B4');
        goGrad.addColorStop(1, '#E91E63');
        ctx.fillStyle = goGrad;
        ctx.fillText('GAME OVER', w / 2, h / 2 - 40);

        ctx.shadowBlur = 0;

        ctx.font = `bold ${Math.max(14, tileSize * 0.8)}px "Orbitron", "Press Start 2P", monospace`;
        ctx.fillStyle = '#FF69B4';
        ctx.shadowColor = '#FF69B4';
        ctx.shadowBlur = 6;
        ctx.fillText(`${score.toLocaleString()}`, w / 2, h / 2);

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#94A3B8';
        ctx.font = `${Math.max(11, tileSize * 0.6)}px "Segoe UI", system-ui`;
        ctx.fillText(`Level ${level} \u2022 ${dotsEaten} treats eaten`, w / 2, h / 2 + 25);

        // High score
        if (hiScore > 0) {
            ctx.fillStyle = score >= hiScore ? '#22C55E' : '#FF69B4';
            ctx.font = `bold ${Math.max(12, tileSize * 0.65)}px "Orbitron", monospace`;
            ctx.fillText(score >= hiScore ? 'NEW HIGH SCORE!' : `HIGH SCORE: ${hiScore.toLocaleString()}`, w / 2, h / 2 + 55);
        }

        // Play again prompt
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.fillStyle = '#FF69B4';
            ctx.font = `bold ${Math.max(11, tileSize * 0.5)}px "Orbitron", monospace`;
            ctx.fillText('PRESS ANY KEY OR TAP TO PLAY AGAIN', w / 2, h / 2 + 85);
        }

        ctx.restore();
    }

    // ══════════════════════════════════════════════
    // TITLE SCREEN
    // ══════════════════════════════════════════════
    function drawTitleScreen(w, h) {
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, w, h);
        drawBgStars(w, h);

        const titleY = h * 0.25;
        const titleSize = Math.max(22, w * 0.07);
        ctx.save();
        ctx.shadowColor = '#FF69B4';
        ctx.shadowBlur = 20;
        ctx.font = `bold ${titleSize}px "Orbitron", "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        const hue = (frameCount * 2) % 360;
        const tGrad = ctx.createLinearGradient(w / 2 - 100, titleY - 20, w / 2 + 100, titleY + 20);
        tGrad.addColorStop(0, '#FF69B4');
        tGrad.addColorStop(0.5, '#FF85C8');
        tGrad.addColorStop(1, '#E91E63');
        ctx.fillStyle = tGrad;
        ctx.fillText('MINNIE PAC', w / 2, titleY);
        ctx.restore();

        // Animated Minnie character
        const pacY = h * 0.42;
        const pacR = w * 0.06;
        const mouth = 0.2 + Math.abs(Math.sin(frameCount * 0.1)) * 0.25;
        const pacXPos = w * 0.3 + (frameCount * 1.5) % (w * 0.4);
        ctx.save();
        ctx.shadowColor = '#FF69B4';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#FF69B4';
        ctx.beginPath();
        ctx.moveTo(pacXPos, pacY);
        ctx.arc(pacXPos, pacY, pacR, mouth * Math.PI, -mouth * Math.PI + Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        // Bow
        ctx.fillStyle = '#E91E63';
        ctx.beginPath();
        ctx.ellipse(pacXPos - pacR * 0.3, pacY - pacR * 0.9, pacR * 0.4, pacR * 0.25, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(pacXPos + pacR * 0.3, pacY - pacR * 0.9, pacR * 0.4, pacR * 0.25, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pacXPos, pacY - pacR * 0.9, pacR * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Trailing dots
        for (let i = 1; i <= 4; i++) {
            const dx = pacXPos - i * pacR * 1.5;
            if (dx > w * 0.2 && dx < w * 0.8) {
                ctx.fillStyle = CANDY_COLORS[i % CANDY_COLORS.length];
                ctx.beginPath();
                ctx.arc(dx, pacY, pacR * 0.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `${Math.max(12, w * 0.028)}px "Segoe UI", system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText('Arrow Keys / WASD / Swipe to Move', w / 2, h * 0.56);

        if (hiScore > 0) {
            ctx.fillStyle = '#FF69B4';
            ctx.font = `bold ${Math.max(13, w * 0.03)}px "Orbitron", monospace`;
            ctx.fillText(`HIGH SCORE: ${hiScore.toLocaleString()}`, w / 2, h * 0.66);
        }

        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.fillStyle = '#FF69B4';
            ctx.font = `bold ${Math.max(14, w * 0.032)}px "Orbitron", monospace`;
            ctx.fillText('PRESS ANY KEY OR TAP TO START', w / 2, h * 0.78);
        }
        drawVignette(w, h);
    }

    // ══════════════════════════════════════════════
    // LEVEL SPLASH
    // ══════════════════════════════════════════════
    function drawLevelSplash(w, h) {
        const progress = 1 - (levelSplashTimer / LEVEL_SPLASH_DURATION);
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, w, h);
        drawBgStars(w, h);

        const scale = progress < 0.3 ? progress / 0.3 : 1;
        const alpha = progress > 0.7 ? (1 - progress) / 0.3 : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(w / 2, h / 2);
        ctx.scale(scale, scale);

        ctx.shadowColor = '#FF69B4';
        ctx.shadowBlur = 25;
        ctx.font = `bold ${Math.max(28, w * 0.08)}px "Orbitron", "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FF69B4';
        ctx.fillText(`LEVEL ${level}`, 0, -10);

        ctx.shadowBlur = 0;
        ctx.font = `${Math.max(13, w * 0.032)}px "Segoe UI", system-ui`;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('GET READY!', 0, 30);
        ctx.restore();
        drawVignette(w, h);
    }

    // ══════════════════════════════════════════════
    // ON-SCREEN D-PAD (touch devices)
    // ══════════════════════════════════════════════
    function drawTouchDpad(w, h) {
        if (!('ontouchstart' in window)) return;
        const cx = w * 0.15, cy = h - w * 0.15;
        const sz = Math.max(16, w * 0.06);
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#FFF';
        ctx.beginPath(); ctx.moveTo(cx, cy - sz * 1.6); ctx.lineTo(cx - sz * 0.7, cy - sz * 0.6); ctx.lineTo(cx + sz * 0.7, cy - sz * 0.6); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, cy + sz * 1.6); ctx.lineTo(cx - sz * 0.7, cy + sz * 0.6); ctx.lineTo(cx + sz * 0.7, cy + sz * 0.6); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx - sz * 1.6, cy); ctx.lineTo(cx - sz * 0.6, cy - sz * 0.7); ctx.lineTo(cx - sz * 0.6, cy + sz * 0.7); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + sz * 1.6, cy); ctx.lineTo(cx + sz * 0.6, cy - sz * 0.7); ctx.lineTo(cx + sz * 0.6, cy + sz * 0.7); ctx.closePath(); ctx.fill();
        ctx.restore();
    }

    // ══════════════════════════════════════════════
    // CANVAS SIZING
    // ══════════════════════════════════════════════
    function fitCanvas() {
        if (!canvas) return;
        const parent = canvas.parentElement;
        const pw = parent ? (parent.clientWidth || 480) : 480;
        const ph = parent ? (parent.clientHeight || 640) : 640;
        if (pw < 50 || ph < 50) return;
        canvas.width = pw;
        canvas.height = ph;
        const hudSpace = Math.max(50, canvas.height * 0.1);
        const availH = canvas.height - hudSpace - 10;
        const availW = canvas.width - 10;
        tileSize = Math.floor(Math.min(availW / COLS, availH / ROWS));
        if (tileSize < 8) tileSize = 8;
        offsetX = Math.round((canvas.width - tileSize * COLS) / 2);
        offsetY = Math.round(hudSpace);
        if (maze.length > 0) prerenderMaze();
    }

    // ══════════════════════════════════════════════
    // GAME LOOP
    // ══════════════════════════════════════════════
    function update(dt) {

        if (screenFlashTimer > 0) screenFlashTimer -= dt * 1000;

        if (readyTimer > 0) {
            readyTimer -= dt * 1000;
            return;
        }

        if (levelSplash) {
            levelSplashTimer -= dt * 1000;
            if (levelSplashTimer <= 0) {
                levelSplash = false;
                readyTimer = READY_DURATION;
            }
            return;
        }

        if (levelClearing) {
            levelClearTimer -= dt * 1000;
            if (levelClearTimer <= 0) {
                levelClearing = false;
                level++;
                buildMaze();
                prerenderMaze();
                initPacMae();
                initGhosts();
                activeFruit = null;
                fruitSpawnDots = 0;
                levelSplash = true;
                levelSplashTimer = LEVEL_SPLASH_DURATION;
                if (typeof Confetti !== 'undefined') Confetti.rain(2000);
            }
            return;
        }

        if (!pacAlive) {
            deathTimer -= dt * 1000;
            if (deathTimer <= 0) {
                lives--;
                if (lives <= 0) {
                    // Save high score
                    if (score > hiScore) {
                        hiScore = score;
                        try { localStorage.setItem(LS_KEY, hiScore); } catch {}
                    }
                    if (onGameOver) {
                        const duration = Math.round((Date.now() - startTime) / 1000);
                        setTimeout(() => onGameOver({ score, level, duration, dotsEaten }), 1500);
                    }
                    return;
                }
                initPacMae();
                ghosts.forEach((g, i) => {
                    g.x = 9 + i; g.y = 10;
                    g.state = 'home';
                    g.homeTimer = i * 80 + 60;
                    g.dir = DIR.UP;
                });
                readyTimer = READY_DURATION;
            }
            return;
        }

        if (powerActive) {
            powerTimer -= dt * 1000;
            if (powerTimer <= 0) {
                powerActive = false;
                ghosts.forEach(g => {
                    if (g.state === 'frightened') g.state = 'chase';
                });
            }
        }

        updatePacMae(dt);
        ghosts.forEach(g => updateGhost(g, dt));
        updateFruit(dt);
        checkCollisions();

        if (dotsEaten >= totalDots) {
            levelClearing = true;
            levelClearTimer = LEVEL_CLEAR_DURATION;
            playLevelClear();
        }
    }

    function render() {
        if (!canvas || !ctx) return;
        animFrame = requestAnimationFrame(render);

        const now = performance.now();
        const dt = Math.min((now - (lastTime || now)) / 1000, 0.05);
        lastTime = now;
        frameCount++;

        const w = canvas.width, h = canvas.height;

        // Title screen
        if (gameState === ST_TITLE) {
            drawTitleScreen(w, h);
            return;
        }

        // Level splash
        if (levelSplash) {
            update(dt);
            drawLevelSplash(w, h);
            return;
        }

        // Dark pink-tinted background
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, w, h);
        drawBgStars(w, h);

        if (gameActive || (!gameActive && lives <= 0)) {
            update(dt);
        }

        drawMaze();
        drawFruit();
        drawPacTrail();
        drawPacMae();
        ghosts.forEach(g => drawGhost(g));
        drawScorePopups(dt);
        drawVignette(w, h);
        drawScreenFlash(w, h);
        drawHUD(w, h);
        drawReadyScreen();
        drawTouchDpad(w, h);

        if (!gameActive && lives <= 0) {
            drawGameOver(w, h);
        }
    }

    // ══════════════════════════════════════════════
    // INPUT
    // ══════════════════════════════════════════════
    function startGame() {
        score = 0; level = 1; lives = START_LIVES;
        gameState = ST_PLAYING;
        gameActive = true;
        powerActive = false; powerTimer = 0;
        levelClearing = false; levelSplash = false; pelletPulse = 0;
        scorePopups = [];
        pacMouthAngle = 0.2; pacMouthDir = 1;
        pacTrail = [];
        screenFlashTimer = 0;
        activeFruit = null;
        fruitSpawnDots = 0;
        startTime = Date.now();
        buildMaze();
        initPacMae();
        initGhosts();
        prerenderMaze();
        readyTimer = READY_DURATION;
    }

    function handleKeyDown(e) {
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        if (gameState === ST_TITLE) { startGame(); e.preventDefault(); return; }
        if (!gameActive && lives <= 0) { startGame(); e.preventDefault(); return; }
        if (!gameActive) return;
        const k = e.key;
        keys[k] = true;

        let dir = DIR.NONE;
        switch (k) {
            case 'ArrowUp':    case 'w': case 'W': dir = DIR.UP;    break;
            case 'ArrowRight': case 'd': case 'D': dir = DIR.RIGHT; break;
            case 'ArrowDown':  case 's': case 'S': dir = DIR.DOWN;  break;
            case 'ArrowLeft':  case 'a': case 'A': dir = DIR.LEFT;  break;
            default: return;
        }
        e.preventDefault();
        e.stopPropagation();
        pacNextDir = dir;
    }

    function handleKeyUp(e) {
        keys[e.key] = false;
    }

    function handleTouchStart(e) {
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        e.preventDefault();
        if (gameState === ST_TITLE) { startGame(); return; }
        if (!gameActive && lives <= 0) { startGame(); return; }
        if (!gameActive) return;
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }

    function handleTouchMove(e) {
        e.preventDefault();
    }

    function handleTouchEnd(e) {
        if (!gameActive) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        const minSwipe = 15;
        if (Math.abs(dx) < minSwipe && Math.abs(dy) < minSwipe) return;

        if (Math.abs(dx) > Math.abs(dy)) {
            pacNextDir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
        } else {
            pacNextDir = dy > 0 ? DIR.DOWN : DIR.UP;
        }
        e.preventDefault();
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

        // Load high score
        try { hiScore = parseInt(localStorage.getItem(LS_KEY)) || 0; } catch { hiScore = 0; }

        // Always use Minnie pink wall color
        WALL_COLOR = '#E91E8C';
        CANDY_COLORS = ['#FF69B4','#FF85C8','#FFB6D9','#FF4DA6','#FF1493','#FF6EB4'];

        // Canvas sizing
        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        // Init state for title screen
        gameState = ST_TITLE;
        gameActive = false;
        frameCount = 0; lastTime = 0;
        keys = {};
        levelSplash = false;
        initBgStars();
        buildMaze();
        initPacMae();
        initGhosts();
        prerenderMaze();

        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('keyup', handleKeyUp, true);
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
        window.addEventListener('resize', fitCanvas);

        canvas.setAttribute('tabindex', '0');
        canvas.style.outline = 'none';
        canvas.focus();

        render();
    }

    function destroy() {
        gameActive = false;
        gameState = ST_TITLE;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('keyup', handleKeyUp, true);
        window.removeEventListener('resize', fitCanvas);
        if (canvas) {
            canvas.removeEventListener('touchstart', handleTouchStart);
            canvas.removeEventListener('touchmove', handleTouchMove);
            canvas.removeEventListener('touchend', handleTouchEnd);
        }
        canvas = null; ctx = null;
        keys = {};
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
