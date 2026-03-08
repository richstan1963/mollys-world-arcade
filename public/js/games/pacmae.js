/* Pac — Theme-aware Pac-Man for Your World Arcade */
window.PacMae = (() => {
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
    const BG_COLOR = '#0a0515';
    let WALL_COLOR = '#8B5CF6'; // Default wall color (theme-overridable)
    const GHOST_COLORS = {
        blinky: '#F43F5E', pinky: '#EC4899',
        inky: '#06B6D4',   clyde: '#F97316'
    };
    const FRIGHTENED_COLOR = '#1E3A8A';
    const FRIGHTENED_BLINK = '#FFFFFF';

    // Dot colors (cycle through, theme-overridable)
    let CANDY_COLORS = ['#FF69B4','#FFD700','#00FFAB','#06B6D4','#F97316','#A78BFA'];

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
    let canvas, ctx;
    let tileSize = 0, offsetX = 0, offsetY = 0;
    let maze = [];
    let score = 0, level = 1, lives = START_LIVES;
    let totalDots = 0, dotsEaten = 0;
    let gameActive = false;
    let animFrame = null;
    let player = null;
    let onGameOver = null;
    let frameCount = 0;
    let lastTime = 0;
    let startTime = 0;
    let scorePopups = [];
    let keys = {}; // currently held keys

    // Pac-Mae
    let pacX = 0, pacY = 0;
    let pacDir = DIR.NONE, pacNextDir = DIR.NONE;
    let pacMouthAngle = 0, pacMouthDir = 1;
    let pacSpeed = 0;
    let pacAlive = true;
    let deathTimer = 0;
    const DEATH_DURATION = 1500;

    // Power pellet
    let powerActive = false, powerTimer = 0;
    let ghostsEatenThisPower = 0;
    let pelletPulse = 0;

    // Level clear
    let levelClearing = false, levelClearTimer = 0;
    const LEVEL_CLEAR_DURATION = 2000;

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

    // Background stars
    let bgStars = [];

    // Offscreen maze cache (walls only — redrawn once per level)
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
            osc.frequency.value = wakaToggle ? 440 : 490;
            osc.type = 'triangle';
            gain.gain.setValueAtTime(0.08, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
            osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.08);
            wakaToggle = !wakaToggle;
        } catch {}
    }

    function playPowerSound() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.value = 80; osc.type = 'sawtooth';
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
    // BACKGROUND STARS
    // ══════════════════════════════════════════════
    function initBgStars() {
        bgStars = [];
        for (let i = 0; i < 40; i++) {
            bgStars.push({
                x: Math.random(), y: Math.random(),
                r: 0.5 + Math.random() * 1.2,
                a: 0.1 + Math.random() * 0.25,
                speed: 0.2 + Math.random() * 0.6,
                phase: Math.random() * Math.PI * 2,
            });
        }
    }

    function drawBgStars(w, h) {
        const t = frameCount * 0.02;
        for (const s of bgStars) {
            const twinkle = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
            ctx.globalAlpha = s.a * twinkle;
            ctx.fillStyle = '#C4B5FD';
            ctx.beginPath();
            ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
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
        // Frame-rate independent movement: normalize to 60fps
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
    }

    // ══════════════════════════════════════════════
    // PAC-MAE MOVEMENT  (FIXED — robust controls)
    // ══════════════════════════════════════════════
    function initPacMae() {
        pacX = 10; pacY = 16;
        pacDir = DIR.NONE;
        pacNextDir = DIR.NONE;
        pacAlive = true;
        pacSpeed = 0.09 + level * 0.005;
        if (pacSpeed > 0.16) pacSpeed = 0.16;
    }

    function getInputDir() {
        // Read currently-held keys for responsive controls
        if (keys['ArrowUp']    || keys['w'] || keys['W']) return DIR.UP;
        if (keys['ArrowDown']  || keys['s'] || keys['S']) return DIR.DOWN;
        if (keys['ArrowLeft']  || keys['a'] || keys['A']) return DIR.LEFT;
        if (keys['ArrowRight'] || keys['d'] || keys['D']) return DIR.RIGHT;
        return DIR.NONE;
    }

    function updatePacMae(dt) {
        if (!pacAlive) return;

        // Mouth animation
        pacMouthAngle += pacMouthDir * dt * 12;
        if (pacMouthAngle > 0.35) { pacMouthAngle = 0.35; pacMouthDir = -1; }
        if (pacMouthAngle < 0.02) { pacMouthAngle = 0.02; pacMouthDir = 1; }

        // Read currently held keys for the most responsive feel
        const heldDir = getInputDir();
        if (heldDir !== DIR.NONE) pacNextDir = heldDir;

        if (pacDir === DIR.NONE && pacNextDir === DIR.NONE) return;

        // Frame-rate independent movement: normalize to 60fps
        const move = pacSpeed * dt * 60;

        const gx = Math.round(pacX), gy = Math.round(pacY);
        const nearCenter = Math.abs(pacX - gx) < move * 1.5 &&
                           Math.abs(pacY - gy) < move * 1.5;

        // Try queued direction at grid centers
        if (pacNextDir !== DIR.NONE && nearCenter) {
            const nx = gx + DX[pacNextDir], ny = gy + DY[pacNextDir];
            if (isWalkable(nx, ny)) {
                pacX = gx; pacY = gy;
                pacDir = pacNextDir;
                pacNextDir = DIR.NONE;
            }
        }

        if (pacDir === DIR.NONE) return;

        // Move in current direction
        const nx = pacX + DX[pacDir] * move;
        const ny = pacY + DY[pacDir] * move;

        // Tunnel wrap
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

        // Eat dots
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
    // DRAWING
    // ══════════════════════════════════════════════
    function toPixel(gx, gy) {
        return {
            px: offsetX + gx * tileSize + tileSize / 2,
            py: offsetY + gy * tileSize + tileSize / 2
        };
    }

    // Pre-render walls to offscreen canvas (called once per level)
    function prerenderMaze() {
        const offscreen = document.createElement('canvas');
        offscreen.width = canvas.width;
        offscreen.height = canvas.height;
        const oc = offscreen.getContext('2d');

        const wallLineW = Math.max(1.5, tileSize * 0.08);
        const isW = (c, r) => (r >= 0 && r < ROWS && c >= 0 && c < COLS && MAZE_TEMPLATE[r][c] === TILE_WALL);

        // Draw walls with glow ONCE
        oc.strokeStyle = WALL_COLOR;
        oc.lineWidth = wallLineW;
        oc.lineCap = 'round';
        oc.lineJoin = 'round';
        oc.shadowColor = WALL_COLOR;
        oc.shadowBlur = 4;

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (MAZE_TEMPLATE[r][c] !== TILE_WALL) continue;
                const px = offsetX + c * tileSize;
                const py = offsetY + r * tileSize;
                const cx = px + tileSize / 2;
                const cy = py + tileSize / 2;
                const half = tileSize * 0.48;
                const rad = tileSize * 0.22;

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
        mazeCache = offscreen;
    }

    function drawMaze() {
        // Blit cached walls (one drawImage instead of ~1400 strokes)
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
                    const cIdx = (r * COLS + c) % CANDY_COLORS.length;
                    const dotR = tileSize * 0.14;
                    ctx.fillStyle = CANDY_COLORS[cIdx];
                    ctx.beginPath();
                    ctx.arc(px, py, dotR, 0, Math.PI * 2);
                    ctx.fill();
                    // Tiny white shine (no shadow)
                    ctx.fillStyle = 'rgba(255,255,255,0.6)';
                    ctx.beginPath();
                    ctx.arc(px - dotR * 0.3, py - dotR * 0.3, dotR * 0.3, 0, Math.PI * 2);
                    ctx.fill();
                } else if (t === TILE_POWER) {
                    // Pulsing power pellet circle
                    const pulseScale = 0.3 + Math.sin(pelletPulse) * 0.06;
                    const pr = tileSize * pulseScale;
                    const pelletColor = CANDY_COLORS[0] || '#FF69B4';

                    // Outer glow
                    ctx.save();
                    ctx.shadowColor = pelletColor;
                    ctx.shadowBlur = tileSize * 0.4 + Math.sin(pelletPulse) * tileSize * 0.15;
                    ctx.fillStyle = pelletColor;
                    ctx.beginPath();
                    ctx.arc(px, py, pr, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    // Bright inner core
                    ctx.fillStyle = 'rgba(255,255,255,0.45)';
                    ctx.beginPath();
                    ctx.arc(px, py, pr * 0.45, 0, Math.PI * 2);
                    ctx.fill();
                } else if (t === TILE_GHOST_DOOR) {
                    ctx.fillStyle = '#F472B6';
                    const doorPx = offsetX + c * tileSize;
                    const doorPy = offsetY + r * tileSize;
                    ctx.fillRect(doorPx + 1, doorPy + tileSize / 2 - 1, tileSize - 2, 2);
                }
            }
        }
    }

    function drawPacMae() {
        if (!pacAlive) {
            const progress = 1 - (deathTimer / DEATH_DURATION);
            const { px, py } = toPixel(pacX, pacY);
            const radius = tileSize * 0.4 * (1 - progress);
            if (radius <= 0) return;

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(progress * Math.PI * 4);
            const mA = Math.PI * progress;
            ctx.fillStyle = '#FACC15';
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

        // Body (no shadowBlur for performance)
        const mA = pacMouthAngle * Math.PI;
        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, mA, -mA + Math.PI * 2);
        ctx.closePath();
        ctx.fill();

        // Player color bow accent
        if (player?.color) {
            ctx.fillStyle = player.color;
            const bowSize = radius * 0.3;
            const bowY = -radius * 0.7;
            ctx.beginPath();
            ctx.ellipse(-bowSize * 0.5, bowY, bowSize, bowSize * 0.5, -0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(bowSize * 0.5, bowY, bowSize, bowSize * 0.5, 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(0, bowY, bowSize * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Eye
        const eyeX = radius * 0.15, eyeY = -radius * 0.3;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, radius * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(eyeX + radius * 0.04, eyeY - radius * 0.04, radius * 0.05, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function drawGhost(ghost) {
        if (ghost.state === 'home' && ghost.homeTimer > 0) {
            const { px, py } = toPixel(ghost.x, ghost.y);
            ctx.globalAlpha = 0.5;
            drawGhostShape(px, py, ghost.color, ghost.wobble, false);
            ctx.globalAlpha = 1;
            return;
        }

        const { px, py } = toPixel(ghost.x, ghost.y);

        if (ghost.state === 'eaten') {
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

        drawGhostShape(px, py, color, ghost.wobble, isFrightened);
        if (!isFrightened) drawGhostEyes(px, py, ghost.dir);
        else drawFrightenedFace(px, py, isBlinking);
    }

    function drawGhostShape(px, py, color, wobble, frightened) {
        const r = tileSize * 0.42;
        const bodyBot = py + r * 0.7;

        ctx.save();
        ctx.fillStyle = color;

        ctx.beginPath();
        ctx.arc(px, py - r * 0.15, r, Math.PI, 0);
        ctx.lineTo(px + r, bodyBot);

        const waves = 3, waveW = (r * 2) / waves;
        const waveH = tileSize * 0.12;
        for (let i = 0; i < waves; i++) {
            const wx = px + r - waveW * i;
            const wob = Math.sin(wobble + i * 1.5) * waveH * 0.3;
            ctx.quadraticCurveTo(wx - waveW * 0.5, bodyBot + waveH + wob, wx - waveW, bodyBot);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function drawGhostEyes(px, py, dir) {
        const eyeOffX = tileSize * 0.14;
        const eyeR = tileSize * 0.1;
        const pupilR = tileSize * 0.055;
        const pupilOff = tileSize * 0.04;

        let pdx = 0, pdy = 0;
        if (dir === DIR.LEFT) pdx = -pupilOff;
        else if (dir === DIR.RIGHT) pdx = pupilOff;
        else if (dir === DIR.UP) pdy = -pupilOff;
        else if (dir === DIR.DOWN) pdy = pupilOff;

        for (let side = -1; side <= 1; side += 2) {
            const ex = px + side * eyeOffX;
            const ey = py - tileSize * 0.15;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.ellipse(ex, ey, eyeR, eyeR * 1.2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1E40AF';
            ctx.beginPath();
            ctx.arc(ex + pdx, ey + pdy, pupilR, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawFrightenedFace(px, py, blinking) {
        const color = blinking ? '#F43F5E' : '#FFF';
        ctx.fillStyle = color;
        for (let side = -1; side <= 1; side += 2) {
            ctx.beginPath();
            ctx.arc(px + side * tileSize * 0.12, py - tileSize * 0.15, tileSize * 0.05, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const mY = py + tileSize * 0.05;
        const mW = tileSize * 0.3;
        ctx.moveTo(px - mW, mY);
        for (let i = 0; i <= 6; i++) {
            ctx.lineTo(px - mW + (mW * 2 / 6) * i, mY + (i % 2 === 0 ? -2 : 2));
        }
        ctx.stroke();
    }

    function drawScorePopups(dt) {
        scorePopups = scorePopups.filter(p => {
            p.life -= dt * 0.8;
            if (p.life <= 0) return false;
            const { px, py } = toPixel(p.x, p.y);
            const floatY = py - (1 - p.life) * tileSize * 2;
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.font = `bold ${Math.max(10, tileSize * 0.7)}px "Segoe UI", system-ui`;
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.strokeText(p.text, px, floatY);
            ctx.fillStyle = p.color || '#FFF';
            ctx.fillText(p.text, px, floatY);
            ctx.restore();
            return true;
        });
    }

    function drawHUD(w, h) {
        const hudH = offsetY - 4;

        const hudGrad = ctx.createLinearGradient(0, 0, 0, hudH);
        hudGrad.addColorStop(0, 'rgba(10, 5, 21, 0.95)');
        hudGrad.addColorStop(1, 'rgba(10, 5, 21, 0.6)');
        ctx.fillStyle = hudGrad;
        ctx.fillRect(0, 0, w, hudH);

        // Title with rainbow gradient
        const titleSize = Math.max(14, tileSize * 0.9);
        ctx.font = `bold ${titleSize}px "Orbitron", "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        const titleGrad = ctx.createLinearGradient(w / 2 - 60, 0, w / 2 + 60, 0);
        const hue = (frameCount * 2) % 360;
        titleGrad.addColorStop(0, `hsl(${hue}, 90%, 65%)`);
        titleGrad.addColorStop(0.5, `hsl(${(hue + 60) % 360}, 90%, 75%)`);
        titleGrad.addColorStop(1, `hsl(${(hue + 120) % 360}, 90%, 65%)`);
        ctx.fillStyle = titleGrad;
        ctx.fillText('PAC CHASE', w / 2, hudH * 0.42);

        // Score
        ctx.font = `bold ${Math.max(11, tileSize * 0.6)}px "Segoe UI", system-ui`;
        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'center';
        ctx.fillText(`Score: ${score.toLocaleString()}`, w / 2, hudH * 0.78);

        // Player info (left)
        ctx.textAlign = 'left';
        ctx.font = `bold ${Math.max(11, tileSize * 0.55)}px "Segoe UI", system-ui`;
        ctx.fillStyle = player?.color || '#A855F7';
        ctx.fillText(`${player?.emoji || ''} ${player?.name || 'Player'}`, 8, hudH * 0.55);

        // Level (right)
        ctx.textAlign = 'right';
        ctx.fillStyle = '#67E8F9';
        ctx.fillText(`Level ${level}`, w - 8, hudH * 0.42);

        // Lives (right, pac-man icons)
        ctx.fillStyle = '#FACC15';
        const lifeSize = Math.max(6, tileSize * 0.3);
        for (let i = 0; i < lives; i++) {
            const lx = w - 12 - (lives - 1 - i) * (lifeSize * 2.5);
            const ly = hudH * 0.72;
            ctx.beginPath();
            ctx.arc(lx, ly, lifeSize, 0.25 * Math.PI, 1.75 * Math.PI);
            ctx.lineTo(lx, ly);
            ctx.closePath();
            ctx.fill();
        }

        // HUD bottom border
        const borderGrad = ctx.createLinearGradient(0, 0, w, 0);
        borderGrad.addColorStop(0, 'rgba(139, 92, 246, 0)');
        borderGrad.addColorStop(0.5, 'rgba(139, 92, 246, 0.6)');
        borderGrad.addColorStop(1, 'rgba(139, 92, 246, 0)');
        ctx.fillStyle = borderGrad;
        ctx.fillRect(0, hudH - 1, w, 1);
    }

    function drawReadyScreen() {
        if (readyTimer <= 0) return;
        const alpha = Math.min(readyTimer / 500, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.max(18, tileSize * 1.2)}px "Orbitron", "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FACC15';
        const { py } = toPixel(10, 13);
        ctx.fillText('READY!', canvas.width / 2, py);
        ctx.font = `${Math.max(9, tileSize * 0.45)}px "Segoe UI", system-ui`;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('Use Arrow Keys or Swipe to Move', canvas.width / 2, py + Math.max(16, tileSize * 0.9));
        ctx.restore();
    }

    function drawGameOver(w, h) {
        ctx.save();
        ctx.fillStyle = 'rgba(10, 5, 21, 0.7)';
        ctx.fillRect(0, 0, w, h);

        ctx.font = `bold ${Math.max(22, tileSize * 1.5)}px "Orbitron", "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#F43F5E';
        ctx.fillText('GAME OVER', w / 2, h / 2 - 20);
        ctx.font = `bold ${Math.max(14, tileSize * 0.8)}px "Segoe UI", system-ui`;
        ctx.fillStyle = '#FFF';
        ctx.fillText(`Final Score: ${score.toLocaleString()}`, w / 2, h / 2 + 20);
        ctx.fillStyle = '#94A3B8';
        ctx.font = `${Math.max(11, tileSize * 0.6)}px "Segoe UI", system-ui`;
        ctx.fillText(`Level ${level} • ${dotsEaten} candies eaten`, w / 2, h / 2 + 45);
        ctx.restore();
    }

    // ══════════════════════════════════════════════
    // GAME LOOP
    // ══════════════════════════════════════════════
    function update(dt) {
        frameCount++;

        if (readyTimer > 0) {
            readyTimer -= dt * 1000;
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
                readyTimer = READY_DURATION;
                if (typeof Confetti !== 'undefined') Confetti.rain(2000);
            }
            return;
        }

        if (!pacAlive) {
            deathTimer -= dt * 1000;
            if (deathTimer <= 0) {
                lives--;
                if (lives <= 0) {
                    gameActive = false;
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

        const w = canvas.width, h = canvas.height;

        // Background
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, w, h);
        drawBgStars(w, h);

        if (gameActive || (!gameActive && lives <= 0)) {
            update(dt);
        }

        drawMaze();
        drawPacMae();
        ghosts.forEach(g => drawGhost(g));
        drawScorePopups(dt);
        drawHUD(w, h);
        drawReadyScreen();

        if (!gameActive && lives <= 0) {
            drawGameOver(w, h);
        }
    }

    // ══════════════════════════════════════════════
    // INPUT — Robust keyboard + touch + virtual dpad
    // ══════════════════════════════════════════════
    function handleKeyDown(e) {
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

        // Resume audio
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }

    function handleKeyUp(e) {
        keys[e.key] = false;
    }

    function handleTouchStart(e) {
        if (!gameActive) return;
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        e.preventDefault();
    }

    function handleTouchMove(e) {
        e.preventDefault(); // Prevent scroll
    }

    function handleTouchEnd(e) {
        if (!gameActive) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        const minSwipe = 15; // Lower threshold for easier control
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
        // Destroy previous instance if any
        destroy();

        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer;
        onGameOver = gameOverCallback;

        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;

        // Ensure canvas has minimum usable dimensions
        if (canvas.width < 100) canvas.width = 480;
        if (canvas.height < 100) canvas.height = 640;

        // Calculate tile size to fit maze
        const hudSpace = Math.max(50, canvas.height * 0.1);
        const availH = canvas.height - hudSpace - 10;
        const availW = canvas.width - 10;
        tileSize = Math.floor(Math.min(availW / COLS, availH / ROWS));
        if (tileSize < 8) tileSize = 8; // Floor
        offsetX = Math.round((canvas.width - tileSize * COLS) / 2);
        offsetY = Math.round(hudSpace);

        score = 0; level = 1; lives = START_LIVES;
        gameActive = true;
        frameCount = 0; lastTime = 0;
        startTime = Date.now();
        powerActive = false; powerTimer = 0;
        levelClearing = false; pelletPulse = 0;
        scorePopups = [];
        pacMouthAngle = 0.2; pacMouthDir = 1;
        keys = {};

        // Load theme colors before maze prerender (WALL_COLOR bakes into offscreen canvas)
        const themeId = activePlayer?.theme || 'retro';
        const theme = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (theme) {
            WALL_COLOR = theme.colors[4] || theme.colors[2];
            CANDY_COLORS = theme.colors.slice(0, 6);
        }

        buildMaze();
        initPacMae();
        initGhosts();
        initBgStars();
        prerenderMaze();
        readyTimer = READY_DURATION;

        // Bind events — use document level for keyboard reliability
        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('keyup', handleKeyUp, true);
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

        // Ensure canvas is focusable and focused
        canvas.setAttribute('tabindex', '0');
        canvas.style.outline = 'none';
        canvas.focus();

        render();
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
