/* YWA CentiBalls — 8-Ball Pool
   Full 8-ball pool from break to finish. Slingshot aiming, elastic collision
   physics, turn-based play vs AI, solids/stripes assignment, fouls, and
   win/lose conditions. Hi-res 4x pre-cached ball rendering. */
window.CentiBalls = (() => {
    // ── Design Constants ──
    const GAME_W = 640, GAME_H = 640;
    const BALL_R = 11;
    const CUE_R = 12;
    const POCKET_R = 22;
    const RAIL_W = 18;
    const FRICTION = 0.991;
    const WALL_COR = 0.82;
    const BALL_COR = 0.95;
    const MAX_SHOT_POWER = 18;
    const MIN_SHOT_POWER = 2;
    const SPEED_THRESHOLD = 0.12;

    // Table geometry — rectangular pool table
    const TABLE_TOP = RAIL_W + BALL_R;
    const TABLE_BOT = GAME_H - RAIL_W - BALL_R;
    const TABLE_LEFT = RAIL_W + BALL_R;
    const TABLE_RIGHT = GAME_W - RAIL_W - BALL_R;
    const TABLE_CX = GAME_W / 2;
    const TABLE_CY = GAME_H / 2;

    // Rack / break positions
    const FOOT_SPOT_Y = GAME_H * 0.30;   // where the rack apex sits
    const HEAD_STRING_Y = GAME_H * 0.72;  // cue ball placement line
    const KITCHEN_Y = HEAD_STRING_Y;

    // States
    const ST_TITLE = 0, ST_AIMING = 1, ST_SHOOTING = 2, ST_RESOLVING = 3;
    const ST_BALL_IN_HAND = 4, ST_AI_THINKING = 5, ST_AI_SHOOTING = 6;
    const ST_GAME_WON = 7, ST_GAME_LOST = 8;

    // Turn
    const TURN_PLAYER = 0, TURN_AI = 1;

    // Group
    const GRP_NONE = 0, GRP_SOLIDS = 1, GRP_STRIPES = 2;

    // Billiard ball colors (solids 1-7, stripe 9-15)
    const BALL_COLORS = {
        1: '#FBBF24', 2: '#3B82F6', 3: '#EF4444', 4: '#7C3AED',
        5: '#F97316', 6: '#22C55E', 7: '#7C2D12', 8: '#111827',
        9: '#FBBF24', 10: '#3B82F6', 11: '#EF4444', 12: '#7C3AED',
        13: '#F97316', 14: '#22C55E', 15: '#7C2D12'
    };

    // Theme defaults
    let CLR_FELT = '#1B6B3A';
    let CLR_FELT2 = '#176332';
    let CLR_RAIL = '#8B5E3C';
    let CLR_RAIL_EDGE = '#6B4226';
    let CLR_HUD = '#F0E6D2';
    let CLR_CUE = '#F5F5F0';

    // Hi-res ball cache (4x resolution)
    const BALL_CACHE_SCALE = 4;
    let ballCanvasCache = {};

    // Sprites
    const SPRITE_BASE = '/img/game-assets';
    const sprites = {};
    const spriteList = {
        woodH: `${SPRITE_BASE}/kenney-physics/wood/elementWood019.png`,
        woodV: `${SPRITE_BASE}/kenney-physics/wood/elementWood020.png`,
        woodCorner: `${SPRITE_BASE}/kenney-physics/wood/elementWood047.png`,
        metalPocket: `${SPRITE_BASE}/kenney-physics/metal/elementMetal044.png`,
        coin: `${SPRITE_BASE}/kenney-coins/coin_01.png`,
        starGold: `${SPRITE_BASE}/kenney-physics/other/starGold.png`,
        debris1: `${SPRITE_BASE}/kenney-physics/debris/debrisWood_1.png`,
        debris2: `${SPRITE_BASE}/kenney-physics/debris/debrisWood_2.png`,
        debris3: `${SPRITE_BASE}/kenney-physics/debris/debrisWood_3.png`,
        particle1: `${SPRITE_BASE}/kenney-particles/particleWhite_1.png`,
        particle2: `${SPRITE_BASE}/kenney-particles/particleWhite_3.png`,
        particle3: `${SPRITE_BASE}/kenney-particles/particleWhite_5.png`,
    };
    let spritesLoaded = 0, spritesTotal = 0;

    function loadSprites() {
        const keys = Object.keys(spriteList);
        spritesTotal = keys.length;
        spritesLoaded = 0;
        keys.forEach(k => {
            const img = new Image();
            img.onload = () => { spritesLoaded++; };
            img.onerror = () => { spritesLoaded++; };
            img.src = spriteList[k];
            sprites[k] = img;
        });
    }

    // ── State ──
    let canvas, ctx, audioCtx;
    let W, H, SCALE, DPR;
    let animFrame, lastTime, state, gameActive = false;
    let activePlayer, gameOverCB, playerColor;
    let highScore = parseInt(localStorage.getItem('ywa_centiballs_hi') || '0');
    let frameCount = 0, screenShake = 0;
    let mouseX = GAME_W / 2, mouseY = GAME_H - 100;
    let aimStartX = 0, aimStartY = 0, isAiming = false;
    let keys_pressed = {};

    // Game entities
    let cueBall, balls, pockets;
    let particles, scorePopups;
    let pocketAnims;
    let score, shotsFired;

    // 8-ball state
    let currentTurn;       // TURN_PLAYER or TURN_AI
    let playerGroup;       // GRP_SOLIDS, GRP_STRIPES, or GRP_NONE
    let aiGroup;
    let isBreakShot;       // true until groups are assigned
    let pottedThisTurn;    // balls potted during current shot
    let firstHitThisTurn;  // first ball the cue ball hit this shot
    let cuePotted;         // cue ball went in a pocket
    let foulThisTurn;      // any foul occurred
    let turnMessage;       // status message to display
    let turnMessageTimer;
    let ballInHandRestricted; // during break foul, behind head string
    let playerBallsLeft;   // count of player's group remaining
    let aiBallsLeft;       // count of AI's group remaining
    let aiThinkTimer;      // countdown before AI shoots
    let aiTargetAngle;     // angle AI will shoot
    let aiTargetPower;     // power AI will shoot
    let gameResult;        // 'win' or 'lose'
    let eightBallPotted;

    // ═══════════════════════════════════════════
    //  AUDIO ENGINE
    // ═══════════════════════════════════════════
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
    function playNoise(dur, vol) {
        try {
            ensureAudio();
            const bufSize = audioCtx.sampleRate * dur | 0;
            const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
            const src = audioCtx.createBufferSource();
            src.buffer = buf;
            const g = audioCtx.createGain();
            g.gain.setValueAtTime(vol || 0.08, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            src.connect(g); g.connect(audioCtx.destination);
            src.start(); src.stop(audioCtx.currentTime + dur);
        } catch {}
    }
    function sfxCueStrike() {
        playTone(220, 0.12, 'triangle', 0.1, 110);
        playNoise(0.05, 0.06);
    }
    function sfxBallClick() {
        playTone(800, 0.04, 'sine', 0.07, 1200);
        playNoise(0.02, 0.04);
    }
    function sfxCushionBounce() {
        playNoise(0.06, 0.05);
        playTone(150, 0.08, 'triangle', 0.04, 80);
    }
    function sfxPocketThud() {
        playTone(80, 0.2, 'sine', 0.12, 40);
        playNoise(0.1, 0.08);
    }
    function sfxScratch() {
        playTone(200, 0.3, 'sawtooth', 0.1, 80);
        playNoise(0.2, 0.06);
    }
    function sfxWin() {
        [523, 659, 784, 1047].forEach((f, i) => {
            setTimeout(() => playTone(f, 0.25, 'sine', 0.1), i * 140);
        });
    }
    function sfxLose() {
        [400, 350, 300, 200].forEach((f, i) => {
            setTimeout(() => playTone(f, 0.25, 'triangle', 0.08), i * 180);
        });
    }
    function sfxFoul() {
        playTone(150, 0.25, 'sawtooth', 0.08, 80);
        playNoise(0.15, 0.05);
    }
    function sfxAssign() {
        playTone(440, 0.1, 'sine', 0.08, 880);
        playTone(660, 0.15, 'sine', 0.06, 1320);
    }

    // ═══════════════════════════════════════════
    //  UTILITY
    // ═══════════════════════════════════════════
    function dist(ax, ay, bx, by) {
        const dx = ax - bx, dy = ay - by;
        return Math.sqrt(dx * dx + dy * dy);
    }
    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function randRange(a, b) { return a + Math.random() * (b - a); }
    function randInt(a, b) { return Math.floor(randRange(a, b + 1)); }

    function roundRect(c, x, y, w, h, r) {
        if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
        c.beginPath();
        c.moveTo(x + r, y);
        c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
        c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
        c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r);
        c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r);
        c.closePath();
    }

    function ballGroup(num) {
        if (num === 0 || num === 8) return GRP_NONE;
        return num <= 7 ? GRP_SOLIDS : GRP_STRIPES;
    }

    // ═══════════════════════════════════════════
    //  PHYSICS — Elastic ball-ball collision
    // ═══════════════════════════════════════════
    function resolveCollision(a, b, cor) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d === 0) return;
        const nx = dx / d, ny = dy / d;
        const overlap = (a.r + b.r) - d;
        if (overlap > 0) {
            const sep = overlap / 2 + 0.5;
            a.x -= nx * sep; a.y -= ny * sep;
            b.x += nx * sep; b.y += ny * sep;
        }
        const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
        const dvn = dvx * nx + dvy * ny;
        if (dvn <= 0) return;
        const restitution = cor || BALL_COR;
        const ma = a.mass || 1, mb = b.mass || 1;
        const j = (1 + restitution) * dvn / (1 / ma + 1 / mb);
        a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny;
        b.vx += (j / mb) * nx; b.vy += (j / mb) * ny;
    }

    function wallBounce(ball) {
        const left = RAIL_W + ball.r;
        const right = GAME_W - RAIL_W - ball.r;
        const top = RAIL_W + ball.r;
        const bottom = GAME_H - RAIL_W - ball.r;

        let bounced = false;
        if (ball.x < left) { ball.x = left; ball.vx = Math.abs(ball.vx) * WALL_COR; bounced = true; }
        if (ball.x > right) { ball.x = right; ball.vx = -Math.abs(ball.vx) * WALL_COR; bounced = true; }
        if (ball.y < top) { ball.y = top; ball.vy = Math.abs(ball.vy) * WALL_COR; bounced = true; }
        if (ball.y > bottom) { ball.y = bottom; ball.vy = -Math.abs(ball.vy) * WALL_COR; bounced = true; }
        if (bounced) sfxCushionBounce();
    }

    function checkPocket(ball) {
        for (const p of pockets) {
            if (dist(ball.x, ball.y, p.x, p.y) < POCKET_R) {
                return p;
            }
        }
        return null;
    }

    function applyFriction(ball) {
        ball.vx *= FRICTION;
        ball.vy *= FRICTION;
        if (Math.abs(ball.vx) < 0.01) ball.vx = 0;
        if (Math.abs(ball.vy) < 0.01) ball.vy = 0;
    }

    function ballSpeed(b) {
        return Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    }

    function ballMoving(b) {
        return ballSpeed(b) > SPEED_THRESHOLD;
    }

    function anyBallMoving() {
        if (cueBall && ballMoving(cueBall)) return true;
        for (const b of balls) {
            if (ballMoving(b)) return true;
        }
        return false;
    }

    // ═══════════════════════════════════════════
    //  POCKETS
    // ═══════════════════════════════════════════
    function createPockets() {
        pockets = [
            { x: RAIL_W + 6, y: RAIL_W + 6 },
            { x: GAME_W - RAIL_W - 6, y: RAIL_W + 6 },
            { x: RAIL_W + 6, y: GAME_H - RAIL_W - 6 },
            { x: GAME_W - RAIL_W - 6, y: GAME_H - RAIL_W - 6 },
            { x: GAME_W / 2, y: RAIL_W + 2 },
            { x: GAME_W / 2, y: GAME_H - RAIL_W - 2 }
        ];
    }

    // ═══════════════════════════════════════════
    //  RACK / SETUP
    // ═══════════════════════════════════════════
    function rackBalls() {
        balls = [];
        // Standard 8-ball triangle rack at foot spot
        // Row 0: apex ball, Row 1: 2 balls, ... Row 4: 5 balls
        // 8-ball must be in center (row 2, pos 1)
        // One solid in one back corner, one stripe in the other
        const spacing = BALL_R * 2.05;
        const rowH = spacing * Math.sin(Math.PI / 3);

        // Build the 15-ball order with 8 in the center
        // Shuffle a set that satisfies: 8 in middle, corners of back row = one solid + one stripe
        let solids = [1, 2, 3, 4, 5, 6, 7];
        let stripes = [9, 10, 11, 12, 13, 14, 15];
        shuffle(solids);
        shuffle(stripes);

        // Positions in triangle (row, col within row)
        // Row 0: 1 ball (apex)
        // Row 1: 2 balls
        // Row 2: 3 balls (8 in middle)
        // Row 3: 4 balls
        // Row 4: 5 balls (corners must be one solid + one stripe)
        const rackOrder = new Array(15);

        // Place 8-ball at position index 4 (row 2, middle)
        rackOrder[4] = 8;

        // Row 4 corners: indices 10 and 14
        // One solid corner, one stripe corner
        if (Math.random() < 0.5) {
            rackOrder[10] = solids.pop();
            rackOrder[14] = stripes.pop();
        } else {
            rackOrder[10] = stripes.pop();
            rackOrder[14] = solids.pop();
        }

        // Apex (index 0): random
        const apex = Math.random() < 0.5 ? solids.pop() : stripes.pop();
        rackOrder[0] = apex;

        // Fill remaining positions with alternating-ish solids and stripes
        const remaining = [...solids, ...stripes];
        shuffle(remaining);
        let ri = 0;
        for (let i = 0; i < 15; i++) {
            if (rackOrder[i] === undefined) {
                rackOrder[i] = remaining[ri++];
            }
        }

        // Map rack index to (row, col) position
        let idx = 0;
        for (let row = 0; row < 5; row++) {
            const count = row + 1;
            for (let col = 0; col < count; col++) {
                const num = rackOrder[idx];
                const bx = TABLE_CX + (col - (count - 1) / 2) * spacing;
                const by = FOOT_SPOT_Y + row * rowH;
                balls.push({
                    x: bx + randRange(-0.3, 0.3), // tiny jitter for natural look
                    y: by + randRange(-0.3, 0.3),
                    vx: 0, vy: 0,
                    r: BALL_R, num: num, mass: 1, potted: false
                });
                idx++;
            }
        }
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    function resetCueBall(behindHeadString) {
        cueBall = {
            x: TABLE_CX, y: HEAD_STRING_Y,
            vx: 0, vy: 0,
            r: CUE_R, mass: 1, isCue: true
        };
        if (behindHeadString) {
            // Restrict placement to kitchen
            ballInHandRestricted = true;
        }
    }

    // ═══════════════════════════════════════════
    //  SHOOTING
    // ═══════════════════════════════════════════
    function shoot(dirX, dirY, power) {
        const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
        const nx = dirX / len, ny = dirY / len;
        const p = clamp(power, MIN_SHOT_POWER, MAX_SHOT_POWER);
        cueBall.vx = nx * p;
        cueBall.vy = ny * p;

        if (state === ST_AIMING || state === ST_BALL_IN_HAND) {
            state = ST_SHOOTING;
        } else if (state === ST_AI_SHOOTING) {
            state = ST_SHOOTING;
        }

        shotsFired++;
        pottedThisTurn = [];
        firstHitThisTurn = null;
        cuePotted = false;
        foulThisTurn = false;
        eightBallPotted = false;
        sfxCueStrike();
    }

    // ═══════════════════════════════════════════
    //  PARTICLES / EFFECTS
    // ═══════════════════════════════════════════
    function spawnParticles(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = randRange(1, 4);
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                r: randRange(1.5, 4),
                color: color || '#FFF',
                life: randRange(20, 45),
                maxLife: 45
            });
        }
    }

    function spawnPocketSwirl(x, y, color) {
        for (let i = 0; i < 15; i++) {
            const angle = (i / 15) * Math.PI * 2;
            const speed = randRange(0.5, 2);
            particles.push({
                x: x + Math.cos(angle) * 8,
                y: y + Math.sin(angle) * 8,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                r: randRange(2, 5),
                color: color,
                life: randRange(20, 40),
                maxLife: 40
            });
        }
    }

    function addScore(pts, x, y) {
        score += pts;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('ywa_centiballs_hi', String(highScore));
        }
        if (pts !== 0) {
            scorePopups.push({
                x, y, text: (pts > 0 ? '+' : '') + pts,
                life: 50, vy: -1.5,
                color: pts >= 100 ? '#FBBF24' : pts > 0 ? '#FFF' : '#EF4444'
            });
        }
    }

    function showMessage(msg, dur) {
        turnMessage = msg;
        turnMessageTimer = dur || 120;
    }

    // ═══════════════════════════════════════════
    //  GAME SETUP
    // ═══════════════════════════════════════════
    function startGame() {
        score = 0;
        shotsFired = 0;
        currentTurn = TURN_PLAYER;
        playerGroup = GRP_NONE;
        aiGroup = GRP_NONE;
        isBreakShot = true;
        pottedThisTurn = [];
        firstHitThisTurn = null;
        cuePotted = false;
        foulThisTurn = false;
        eightBallPotted = false;
        turnMessage = '';
        turnMessageTimer = 0;
        ballInHandRestricted = false;
        aiThinkTimer = 0;
        gameResult = null;
        frameCount = 0;
        screenShake = 0;
        particles = [];
        scorePopups = [];
        pocketAnims = [];

        createPockets();
        rackBalls();
        resetCueBall(true); // behind head string for break
        ballInHandRestricted = false; // break doesn't restrict placement
        state = ST_AIMING;
        showMessage('YOUR BREAK', 90);
    }

    // ═══════════════════════════════════════════
    //  COUNT BALLS
    // ═══════════════════════════════════════════
    function countBalls() {
        let solids = 0, stripes = 0;
        for (const b of balls) {
            if (b.potted) continue;
            if (b.num >= 1 && b.num <= 7) solids++;
            if (b.num >= 9 && b.num <= 15) stripes++;
        }
        if (playerGroup === GRP_SOLIDS) {
            playerBallsLeft = solids;
            aiBallsLeft = stripes;
        } else if (playerGroup === GRP_STRIPES) {
            playerBallsLeft = stripes;
            aiBallsLeft = solids;
        } else {
            playerBallsLeft = 7;
            aiBallsLeft = 7;
        }
    }

    function isPlayerOnEightBall() {
        return playerGroup !== GRP_NONE && playerBallsLeft === 0;
    }

    function isAIOnEightBall() {
        return aiGroup !== GRP_NONE && aiBallsLeft === 0;
    }

    // ═══════════════════════════════════════════
    //  RESOLVE TURN — called when all balls stop
    // ═══════════════════════════════════════════
    function resolveTurn() {
        countBalls();

        // Check game-ending conditions first
        if (eightBallPotted) {
            const shooter = currentTurn;
            const shooterGroup = shooter === TURN_PLAYER ? playerGroup : aiGroup;
            const shooterClear = shooter === TURN_PLAYER ? playerBallsLeft === 0 : aiBallsLeft === 0;

            // Potting 8-ball early or scratching on 8-ball = loss
            if (cuePotted || !shooterClear) {
                // Shooter loses
                if (shooter === TURN_PLAYER) {
                    endGame('lose', cuePotted ? 'Scratched on the 8-ball!' : 'Potted 8-ball too early!');
                } else {
                    endGame('win', 'AI potted 8-ball illegally!');
                }
            } else {
                // Legal 8-ball pot = shooter wins
                if (shooter === TURN_PLAYER) {
                    endGame('win', 'You potted the 8-ball!');
                } else {
                    endGame('lose', 'AI cleared the table!');
                }
            }
            return;
        }

        // Determine fouls
        if (cuePotted) {
            foulThisTurn = true;
        }

        // Check first-hit foul (must hit your own group first, or any ball if open)
        if (!isBreakShot && firstHitThisTurn !== null && playerGroup !== GRP_NONE) {
            const shooterGroup = currentTurn === TURN_PLAYER ? playerGroup : aiGroup;
            const shooterOnEight = currentTurn === TURN_PLAYER ? isPlayerOnEightBall() : isAIOnEightBall();
            if (shooterOnEight) {
                // Must hit 8-ball first when on the 8
                if (firstHitThisTurn !== 8) foulThisTurn = true;
            } else {
                const hitGroup = ballGroup(firstHitThisTurn);
                if (hitGroup !== shooterGroup && firstHitThisTurn !== 8) {
                    foulThisTurn = true;
                }
            }
        }

        // No ball hit = foul
        if (firstHitThisTurn === null && !isBreakShot) {
            foulThisTurn = true;
        }

        // Handle group assignment (first legal pot after break)
        if (isBreakShot) {
            isBreakShot = false;
            // If balls were potted on break, assign groups
            if (pottedThisTurn.length > 0 && !cuePotted) {
                assignGroups(pottedThisTurn, currentTurn);
            }
        } else if (playerGroup === GRP_NONE && pottedThisTurn.length > 0 && !foulThisTurn) {
            assignGroups(pottedThisTurn, currentTurn);
        }

        countBalls(); // recount after assignment

        // Handle foul
        if (foulThisTurn) {
            if (cuePotted) {
                sfxFoul();
                showMessage('SCRATCH! Ball in hand.', 120);
            } else {
                sfxFoul();
                showMessage('FOUL! Ball in hand.', 120);
            }
            addScore(-25, GAME_W / 2, GAME_H / 2);

            // Switch turn, give ball in hand
            switchTurn();
            placeBallInHand();
            return;
        }

        // Check if shooter potted any of their own balls
        let pottedOwn = false;
        if (pottedThisTurn.length > 0) {
            const shooterGroup = currentTurn === TURN_PLAYER ? playerGroup : aiGroup;
            for (const num of pottedThisTurn) {
                if (num === 8) continue;
                if (shooterGroup === GRP_NONE || ballGroup(num) === shooterGroup) {
                    pottedOwn = true;
                }
            }
        }

        if (pottedOwn) {
            // Shooter continues
            if (currentTurn === TURN_PLAYER) {
                showMessage('Nice shot! Shoot again.', 80);
            }
            beginTurn(currentTurn);
        } else {
            // Switch turn
            switchTurn();
            beginTurn(currentTurn);
        }
    }

    function assignGroups(potted, shooter) {
        // Find the first non-8 ball potted
        let assignNum = null;
        for (const num of potted) {
            if (num !== 8) { assignNum = num; break; }
        }
        if (assignNum === null) return;

        const grp = ballGroup(assignNum);
        if (grp === GRP_NONE) return;

        if (shooter === TURN_PLAYER) {
            playerGroup = grp;
            aiGroup = grp === GRP_SOLIDS ? GRP_STRIPES : GRP_SOLIDS;
        } else {
            aiGroup = grp;
            playerGroup = grp === GRP_SOLIDS ? GRP_STRIPES : GRP_SOLIDS;
        }

        const playerName = playerGroup === GRP_SOLIDS ? 'SOLIDS (1-7)' : 'STRIPES (9-15)';
        showMessage('You are ' + playerName, 150);
        sfxAssign();
    }

    function switchTurn() {
        currentTurn = currentTurn === TURN_PLAYER ? TURN_AI : TURN_PLAYER;
    }

    function beginTurn(who) {
        if (who === TURN_PLAYER) {
            state = ST_AIMING;
            if (!turnMessage || turnMessageTimer <= 0) {
                showMessage('YOUR SHOT', 60);
            }
        } else {
            // AI turn
            state = ST_AI_THINKING;
            aiThinkTimer = 60 + Math.floor(Math.random() * 40); // ~1-1.5 sec "thinking"
            showMessage('AI THINKING...', 120);
            planAIShot();
        }
    }

    function placeBallInHand() {
        // Remove cue ball, place it for the opponent
        cueBall = {
            x: TABLE_CX, y: TABLE_CY,
            vx: 0, vy: 0,
            r: CUE_R, mass: 1, isCue: true
        };
        if (currentTurn === TURN_PLAYER) {
            state = ST_BALL_IN_HAND;
            ballInHandRestricted = false;
        } else {
            // AI places cue ball and shoots
            aiPlaceCueBall();
            state = ST_AI_THINKING;
            aiThinkTimer = 50 + Math.floor(Math.random() * 30);
            planAIShot();
        }
    }

    function endGame(result, message) {
        gameResult = result;
        if (result === 'win') {
            state = ST_GAME_WON;
            addScore(500, GAME_W / 2, GAME_H / 2);
            sfxWin();
            showMessage(message || 'YOU WIN!', 999);
        } else {
            state = ST_GAME_LOST;
            sfxLose();
            showMessage(message || 'YOU LOSE', 999);
        }
        if (gameOverCB) {
            setTimeout(() => gameOverCB(score), 100);
        }
    }

    // ═══════════════════════════════════════════
    //  AI OPPONENT
    // ═══════════════════════════════════════════
    function planAIShot() {
        if (!cueBall) return;

        // Find target balls
        let targets = [];
        const myGroup = aiGroup;

        if (isAIOnEightBall()) {
            // Target the 8-ball
            const eight = balls.find(b => b.num === 8 && !b.potted);
            if (eight) targets = [eight];
        } else if (myGroup !== GRP_NONE) {
            targets = balls.filter(b => !b.potted && ballGroup(b.num) === myGroup);
        } else {
            // Open table: target any non-8 ball
            targets = balls.filter(b => !b.potted && b.num !== 8);
        }

        if (targets.length === 0) {
            // Fallback: aim at any ball
            targets = balls.filter(b => !b.potted);
        }

        let bestScore = -Infinity;
        let bestAngle = 0;
        let bestPower = 10;

        // Evaluate shots at each target toward each pocket
        for (const target of targets) {
            for (const pocket of pockets) {
                // Direction from target to pocket
                const tpx = pocket.x - target.x;
                const tpy = pocket.y - target.y;
                const tpd = Math.sqrt(tpx * tpx + tpy * tpy);
                if (tpd < 1) continue;
                const tpnx = tpx / tpd, tpny = tpy / tpd;

                // Ghost ball position (where cue ball needs to be to send target to pocket)
                const ghostX = target.x - tpnx * (BALL_R + CUE_R);
                const ghostY = target.y - tpny * (BALL_R + CUE_R);

                // Direction from cue ball to ghost position
                const cgx = ghostX - cueBall.x;
                const cgy = ghostY - cueBall.y;
                const cgd = Math.sqrt(cgx * cgx + cgy * cgy);
                if (cgd < 1) continue;

                const angle = Math.atan2(cgy, cgx);

                // Score this shot
                let shotScore = 0;

                // Prefer closer targets
                shotScore -= cgd * 0.01;

                // Prefer shots where target is closer to pocket
                shotScore -= tpd * 0.005;

                // Check for clear path (no obstructing balls)
                let obstructed = false;
                const stepX = cgx / cgd, stepY = cgy / cgd;
                for (let s = CUE_R * 2; s < cgd - BALL_R * 2; s += BALL_R) {
                    const checkX = cueBall.x + stepX * s;
                    const checkY = cueBall.y + stepY * s;
                    for (const b of balls) {
                        if (b === target || b.potted) continue;
                        if (dist(checkX, checkY, b.x, b.y) < BALL_R * 2.2) {
                            obstructed = true;
                            break;
                        }
                    }
                    if (obstructed) break;
                }

                if (obstructed) shotScore -= 50;

                // Angle quality — straighter shots score higher
                const cueToBall = Math.atan2(target.y - ghostY, target.x - ghostX);
                const ballToPocket = Math.atan2(tpy, tpx);
                let angleDiff = Math.abs(cueToBall - ballToPocket);
                if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
                shotScore -= angleDiff * 20;

                if (shotScore > bestScore) {
                    bestScore = shotScore;
                    bestAngle = angle;
                    // Power based on distance
                    bestPower = clamp(cgd * 0.06 + 4, 6, 14);
                }
            }
        }

        // Add some randomness to make AI imperfect
        const angleNoise = randRange(-0.06, 0.06);
        const powerNoise = randRange(-1.5, 1.5);
        aiTargetAngle = bestAngle + angleNoise;
        aiTargetPower = clamp(bestPower + powerNoise, 5, 15);
    }

    function aiPlaceCueBall() {
        if (!cueBall) return;
        // AI places cue ball at a reasonable position
        // Try to find a good spot near center or with clear shot to a target
        let bestX = TABLE_CX, bestY = TABLE_CY;
        let bestClearance = 0;

        for (let attempt = 0; attempt < 20; attempt++) {
            const tx = randRange(TABLE_LEFT + 40, TABLE_RIGHT - 40);
            const ty = randRange(TABLE_TOP + 40, TABLE_BOT - 40);

            // Check no overlap with existing balls
            let tooClose = false;
            for (const b of balls) {
                if (b.potted) continue;
                if (dist(tx, ty, b.x, b.y) < BALL_R + CUE_R + 4) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            // Find minimum distance to any target ball (want it moderate, not too close or far)
            let minDist = Infinity;
            for (const b of balls) {
                if (b.potted) continue;
                const d = dist(tx, ty, b.x, b.y);
                if (d < minDist) minDist = d;
            }

            if (minDist > bestClearance && minDist > CUE_R + BALL_R + 10) {
                bestClearance = minDist;
                bestX = tx;
                bestY = ty;
            }
        }

        cueBall.x = bestX;
        cueBall.y = bestY;
    }

    function executeAIShot() {
        const dx = Math.cos(aiTargetAngle);
        const dy = Math.sin(aiTargetAngle);
        shoot(dx, dy, aiTargetPower);
    }

    // ═══════════════════════════════════════════
    //  UPDATE
    // ═══════════════════════════════════════════
    function update(dt) {
        frameCount++;

        // Message timer
        if (turnMessageTimer > 0) turnMessageTimer--;

        // AI thinking
        if (state === ST_AI_THINKING) {
            aiThinkTimer--;
            if (aiThinkTimer <= 0) {
                state = ST_AI_SHOOTING;
                executeAIShot();
            }
            return;
        }

        // Keyboard aiming
        if (state === ST_AIMING || state === ST_BALL_IN_HAND) {
            if (keys_pressed['ArrowLeft'] || keys_pressed['a']) mouseX -= 3;
            if (keys_pressed['ArrowRight'] || keys_pressed['d']) mouseX += 3;
            if (keys_pressed['ArrowUp'] || keys_pressed['w']) mouseY -= 3;
            if (keys_pressed['ArrowDown'] || keys_pressed['s']) mouseY += 3;
            mouseX = clamp(mouseX, RAIL_W, GAME_W - RAIL_W);
            mouseY = clamp(mouseY, RAIL_W, GAME_H - RAIL_W);
        }

        // Ball in hand — move cue ball with mouse
        if (state === ST_BALL_IN_HAND && cueBall) {
            cueBall.x = clamp(mouseX, TABLE_LEFT, TABLE_RIGHT);
            cueBall.y = clamp(mouseY, TABLE_TOP, TABLE_BOT);

            // Check not overlapping any ball
            for (const b of balls) {
                if (b.potted) continue;
                if (dist(cueBall.x, cueBall.y, b.x, b.y) < CUE_R + BALL_R + 2) {
                    // Push cue ball away
                    const dx = cueBall.x - b.x;
                    const dy = cueBall.y - b.y;
                    const d = Math.sqrt(dx * dx + dy * dy) || 1;
                    cueBall.x = b.x + (dx / d) * (CUE_R + BALL_R + 3);
                    cueBall.y = b.y + (dy / d) * (CUE_R + BALL_R + 3);
                    cueBall.x = clamp(cueBall.x, TABLE_LEFT, TABLE_RIGHT);
                    cueBall.y = clamp(cueBall.y, TABLE_TOP, TABLE_BOT);
                }
            }
        }

        if (state === ST_SHOOTING) {
            // Physics step — run multiple sub-steps for accuracy
            const subSteps = 2;
            for (let sub = 0; sub < subSteps; sub++) {
                // Update cue ball
                if (cueBall && !cuePotted) {
                    cueBall.x += cueBall.vx / subSteps;
                    cueBall.y += cueBall.vy / subSteps;
                    applyFriction(cueBall);
                    wallBounce(cueBall);

                    // Cue ball vs object balls
                    for (const b of balls) {
                        if (b.potted) continue;
                        if (dist(cueBall.x, cueBall.y, b.x, b.y) < cueBall.r + b.r) {
                            // Track first hit
                            if (firstHitThisTurn === null) {
                                firstHitThisTurn = b.num;
                            }
                            resolveCollision(cueBall, b, BALL_COR);
                            sfxBallClick();
                        }
                    }

                    // Cue pocket check (scratch)
                    const p = checkPocket(cueBall);
                    if (p) {
                        sfxScratch();
                        cuePotted = true;
                        spawnPocketSwirl(p.x, p.y, CLR_CUE);
                        addPocketAnim(p.x, p.y, 0, true);
                        cueBall.vx = 0; cueBall.vy = 0;
                        cueBall.x = -100; cueBall.y = -100; // hide it
                    }
                }

                // Update object balls
                for (let i = 0; i < balls.length; i++) {
                    const b = balls[i];
                    if (b.potted) continue;

                    b.x += b.vx / subSteps;
                    b.y += b.vy / subSteps;
                    applyFriction(b);
                    wallBounce(b);

                    // Ball-ball collisions
                    for (let j = i + 1; j < balls.length; j++) {
                        const b2 = balls[j];
                        if (b2.potted) continue;
                        if (dist(b.x, b.y, b2.x, b2.y) < b.r + b2.r) {
                            resolveCollision(b, b2, BALL_COR);
                            sfxBallClick();
                        }
                    }

                    // Pocket check
                    const p = checkPocket(b);
                    if (p) {
                        sfxPocketThud();
                        b.potted = true;
                        b.vx = 0; b.vy = 0;
                        pottedThisTurn.push(b.num);
                        spawnPocketSwirl(p.x, p.y, BALL_COLORS[b.num] || '#FFF');
                        addPocketAnim(p.x, p.y, b.num, false);
                        spawnParticles(p.x, p.y, 10, BALL_COLORS[b.num] || '#FFF');

                        if (b.num === 8) {
                            eightBallPotted = true;
                            screenShake = 8;
                        } else {
                            addScore(50, p.x, p.y);
                        }
                    }
                }
            }

            // Check if all balls stopped
            if (!anyBallMoving()) {
                state = ST_RESOLVING;
            }
        }

        if (state === ST_RESOLVING) {
            // Small delay then resolve
            resolveTurn();
        }

        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vx *= 0.96; p.vy *= 0.96;
            p.vy += 0.03;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Update score popups
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const sp = scorePopups[i];
            sp.y += sp.vy;
            sp.life--;
            if (sp.life <= 0) scorePopups.splice(i, 1);
        }

        // Update pocket animations
        updatePocketAnims();

        // Screen shake decay
        if (screenShake > 0) screenShake *= 0.88;
        if (screenShake < 0.5) screenShake = 0;
    }

    // Pocket swallow animations
    let pocketAnimsList = [];
    function addPocketAnim(x, y, num, isCue) {
        pocketAnimsList.push({
            x, y, num, isCue,
            r: isCue ? CUE_R : BALL_R,
            angle: 0, shrink: 1,
            life: 25, maxLife: 25
        });
    }

    function updatePocketAnims() {
        for (let i = pocketAnimsList.length - 1; i >= 0; i--) {
            const pa = pocketAnimsList[i];
            pa.life--;
            pa.angle += 0.4;
            pa.shrink = pa.life / pa.maxLife;
            if (pa.life <= 0) pocketAnimsList.splice(i, 1);
        }
    }

    // ═══════════════════════════════════════════
    //  DRAW
    // ═══════════════════════════════════════════
    function draw() {
        ctx.save();
        ctx.setTransform(SCALE * DPR, 0, 0, SCALE * DPR, 0, 0);

        if (screenShake > 0) {
            ctx.translate(randRange(-screenShake, screenShake), randRange(-screenShake, screenShake));
        }

        drawTable();
        drawFeltLines();
        drawPockets();
        drawPocketAnims();
        drawBallTrails();
        drawObjectBalls();
        if (cueBall && !cuePotted) drawCueBall();
        if ((state === ST_AIMING || state === ST_BALL_IN_HAND) && currentTurn === TURN_PLAYER) drawAimLine();
        if (state === ST_BALL_IN_HAND) drawBallInHandGuide();
        if (state === ST_AI_THINKING) drawAIThinking();
        drawParticles();
        drawScorePopups();
        drawHUD();
        drawTurnMessage();
        drawPottedBallsTracker();

        if (state === ST_TITLE) drawTitleScreen();
        if (state === ST_GAME_WON) drawWinScreen();
        if (state === ST_GAME_LOST) drawLoseScreen();

        ctx.restore();
    }

    function drawTable() {
        const TW = GAME_W - RAIL_W * 2, TH = GAME_H - RAIL_W * 2;

        // ── FELT SURFACE (draw first, rails overlay) ──
        const feltGrd = ctx.createRadialGradient(GAME_W / 2, GAME_H / 2, 50, GAME_W / 2, GAME_H / 2, 400);
        feltGrd.addColorStop(0, CLR_FELT); feltGrd.addColorStop(1, CLR_FELT2);
        ctx.fillStyle = feltGrd;
        ctx.fillRect(0, 0, GAME_W, GAME_H);
        // Felt noise
        for (let i = 0; i < 300; i++) {
            const fx = (i * 97.3) % GAME_W, fy = (i * 143.7) % GAME_H;
            ctx.fillStyle = (i % 3 !== 0) ? 'rgba(0,20,0,0.04)' : 'rgba(40,100,40,0.03)';
            ctx.fillRect(fx, fy, 1, 1);
        }

        // ── RICH MAHOGANY RAILS ──
        let rGrad = ctx.createLinearGradient(0, 0, 0, RAIL_W);
        rGrad.addColorStop(0, '#3D1C0A'); rGrad.addColorStop(0.15, '#4A2210');
        rGrad.addColorStop(0.4, '#5C2D12'); rGrad.addColorStop(0.6, '#5C2D12');
        rGrad.addColorStop(0.85, '#4A2210'); rGrad.addColorStop(1, '#3D1C0A');
        ctx.fillStyle = rGrad; ctx.fillRect(0, 0, GAME_W, RAIL_W);

        rGrad = ctx.createLinearGradient(0, GAME_H - RAIL_W, 0, GAME_H);
        rGrad.addColorStop(0, '#3D1C0A'); rGrad.addColorStop(0.15, '#4A2210');
        rGrad.addColorStop(0.4, '#5C2D12'); rGrad.addColorStop(0.6, '#5C2D12');
        rGrad.addColorStop(0.85, '#4A2210'); rGrad.addColorStop(1, '#3D1C0A');
        ctx.fillStyle = rGrad; ctx.fillRect(0, GAME_H - RAIL_W, GAME_W, RAIL_W);

        rGrad = ctx.createLinearGradient(0, 0, RAIL_W, 0);
        rGrad.addColorStop(0, '#3D1C0A'); rGrad.addColorStop(0.15, '#4A2210');
        rGrad.addColorStop(0.4, '#5C2D12'); rGrad.addColorStop(0.6, '#5C2D12');
        rGrad.addColorStop(0.85, '#4A2210'); rGrad.addColorStop(1, '#3D1C0A');
        ctx.fillStyle = rGrad; ctx.fillRect(0, RAIL_W, RAIL_W, TH);

        rGrad = ctx.createLinearGradient(GAME_W - RAIL_W, 0, GAME_W, 0);
        rGrad.addColorStop(0, '#3D1C0A'); rGrad.addColorStop(0.15, '#4A2210');
        rGrad.addColorStop(0.4, '#5C2D12'); rGrad.addColorStop(0.6, '#5C2D12');
        rGrad.addColorStop(0.85, '#4A2210'); rGrad.addColorStop(1, '#3D1C0A');
        ctx.fillStyle = rGrad; ctx.fillRect(GAME_W - RAIL_W, RAIL_W, RAIL_W, TH);

        // Subtle noise on rails
        for (let i = 0; i < 500; i++) {
            const nx = (i * 197.3 + 13) % GAME_W, ny = (i * 127.7 + 41) % GAME_H;
            if (ny < RAIL_W || ny > GAME_H - RAIL_W || nx < RAIL_W || nx > GAME_W - RAIL_W) {
                ctx.fillStyle = (i % 2 === 0) ? 'rgba(0,0,0,0.03)' : 'rgba(255,200,140,0.02)';
                ctx.fillRect(nx, ny, 1, 1);
            }
        }

        // Green cushion bumper strip
        ctx.fillStyle = '#1B7A3D';
        ctx.fillRect(RAIL_W - 1, RAIL_W - 3, TW + 2, 3);
        ctx.fillRect(RAIL_W - 1, GAME_H - RAIL_W, TW + 2, 3);
        ctx.fillRect(RAIL_W - 3, RAIL_W - 1, 3, TH + 2);
        ctx.fillRect(GAME_W - RAIL_W, RAIL_W - 1, 3, TH + 2);
        ctx.fillStyle = 'rgba(50,180,90,0.3)';
        ctx.fillRect(RAIL_W, RAIL_W - 1, TW, 1);
        ctx.fillRect(RAIL_W, GAME_H - RAIL_W, TW, 1);
        ctx.fillRect(RAIL_W - 1, RAIL_W, 1, TH);
        ctx.fillRect(GAME_W - RAIL_W, RAIL_W, 1, TH);

        // Inner bevel highlight
        ctx.fillStyle = 'rgba(200,170,120,0.35)';
        ctx.fillRect(RAIL_W - 4, RAIL_W - 4, TW + 8, 1);
        ctx.fillRect(RAIL_W - 4, RAIL_W - 4, 1, TH + 8);
        // Outer bevel shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, GAME_W, 1); ctx.fillRect(0, GAME_H - 1, GAME_W, 1);
        ctx.fillRect(0, 0, 1, GAME_H); ctx.fillRect(GAME_W - 1, 0, 1, GAME_H);

        // Gold corner brackets
        ctx.fillStyle = '#C8A050';
        ctx.fillRect(3, 3, 12, 2); ctx.fillRect(3, 3, 2, 12);
        ctx.fillRect(GAME_W - 15, 3, 12, 2); ctx.fillRect(GAME_W - 5, 3, 2, 12);
        ctx.fillRect(3, GAME_H - 5, 12, 2); ctx.fillRect(3, GAME_H - 15, 2, 12);
        ctx.fillRect(GAME_W - 15, GAME_H - 5, 12, 2); ctx.fillRect(GAME_W - 5, GAME_H - 15, 2, 12);
        ctx.fillStyle = 'rgba(255,220,120,0.4)';
        ctx.fillRect(3, 3, 10, 1); ctx.fillRect(3, 3, 1, 10);
        ctx.fillRect(GAME_W - 13, 3, 10, 1); ctx.fillRect(GAME_W - 4, 3, 1, 10);
        ctx.fillRect(3, GAME_H - 4, 10, 1); ctx.fillRect(3, GAME_H - 13, 1, 10);
        ctx.fillRect(GAME_W - 13, GAME_H - 4, 10, 1); ctx.fillRect(GAME_W - 4, GAME_H - 13, 1, 10);

        // Diamond sights
        ctx.fillStyle = '#C8A860';
        const diamonds = [0.2, 0.35, 0.5, 0.65, 0.8];
        for (const d of diamonds) {
            drawDiamond(GAME_W * d, RAIL_W / 2, 3);
            drawDiamond(GAME_W * d, GAME_H - RAIL_W / 2, 3);
            drawDiamond(RAIL_W / 2, GAME_H * d, 3);
            drawDiamond(GAME_W - RAIL_W / 2, GAME_H * d, 3);
        }
    }

    function drawDiamond(cx, cy, s) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s, cy);
        ctx.lineTo(cx, cy + s);
        ctx.lineTo(cx - s, cy);
        ctx.closePath();
        ctx.fill();
    }

    function drawPockets() {
        for (const p of pockets) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R + 3, 0, Math.PI * 2);
            ctx.fill();

            const pGrd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, POCKET_R);
            pGrd.addColorStop(0, '#000');
            pGrd.addColorStop(0.8, '#111');
            pGrd.addColorStop(1, '#333');
            ctx.fillStyle = pGrd;
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#555';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    function drawFeltLines() {
        // Head string line
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(RAIL_W + 10, HEAD_STRING_Y);
        ctx.lineTo(GAME_W - RAIL_W - 10, HEAD_STRING_Y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Foot spot
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.arc(TABLE_CX, FOOT_SPOT_Y, 3, 0, Math.PI * 2);
        ctx.fill();

        // Head spot
        ctx.beginPath();
        ctx.arc(TABLE_CX, HEAD_STRING_Y, 3, 0, Math.PI * 2);
        ctx.fill();

        // Center spot
        ctx.beginPath();
        ctx.arc(TABLE_CX, TABLE_CY, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // ═══════════════════════════════════════════════════════════════
    //  PRE-RENDERED BALL CACHE (4x resolution for crisp rendering)
    // ═══════════════════════════════════════════════════════════════
    function buildBallCanvas(num) {
        const color = BALL_COLORS[num] || '#888';
        const isStripe = num >= 9;
        const sz = BALL_R * 2 * BALL_CACHE_SCALE;
        const cen = sz / 2;
        const r = sz / 2 - 2;
        const c = document.createElement('canvas');
        c.width = sz; c.height = sz;
        const cx = c.getContext('2d');

        // Drop shadow
        cx.fillStyle = 'rgba(0,0,0,0.25)';
        cx.beginPath();
        cx.ellipse(cen + 2, cen + 3, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
        cx.fill();

        if (isStripe) {
            // White base
            const baseGrad = cx.createRadialGradient(
                cen - r * 0.28, cen - r * 0.28, r * 0.05,
                cen + r * 0.05, cen + r * 0.05, r
            );
            baseGrad.addColorStop(0, '#FFFFFF');
            baseGrad.addColorStop(0.45, '#F8F8F2');
            baseGrad.addColorStop(0.75, '#E8E8E0');
            baseGrad.addColorStop(1, '#CCCCC4');
            cx.fillStyle = baseGrad;
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.fill();

            // Colored stripe band
            cx.save();
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.clip();
            const bandH = r * 1.1;
            const bandGrad = cx.createLinearGradient(cen - r, cen - bandH / 2, cen + r, cen + bandH / 2);
            bandGrad.addColorStop(0, darkenColor(color, 40));
            bandGrad.addColorStop(0.15, color);
            bandGrad.addColorStop(0.35, lightenColor(color, 30));
            bandGrad.addColorStop(0.5, color);
            bandGrad.addColorStop(0.65, lightenColor(color, 30));
            bandGrad.addColorStop(0.85, color);
            bandGrad.addColorStop(1, darkenColor(color, 40));
            cx.fillStyle = bandGrad;
            cx.fillRect(cen - r, cen - bandH / 2, r * 2, bandH);
            // Edge darkening
            const edgeFade = cx.createLinearGradient(0, cen - bandH / 2, 0, cen + bandH / 2);
            edgeFade.addColorStop(0, 'rgba(0,0,0,0.2)');
            edgeFade.addColorStop(0.12, 'rgba(0,0,0,0)');
            edgeFade.addColorStop(0.88, 'rgba(0,0,0,0)');
            edgeFade.addColorStop(1, 'rgba(0,0,0,0.2)');
            cx.fillStyle = edgeFade;
            cx.fillRect(cen - r, cen - bandH / 2, r * 2, bandH);
            cx.restore();
        } else if (num === 8) {
            // 8-ball: solid black with glossy finish
            const grad = cx.createRadialGradient(
                cen - r * 0.3, cen - r * 0.3, 0, cen, cen, r
            );
            grad.addColorStop(0, '#444');
            grad.addColorStop(0.3, '#222');
            grad.addColorStop(0.7, '#111');
            grad.addColorStop(1, '#000');
            cx.fillStyle = grad;
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.fill();
        } else {
            // Solid ball with rich gradient
            const grad = cx.createRadialGradient(
                cen - r * 0.3, cen - r * 0.3, r * 0.05,
                cen + r * 0.05, cen + r * 0.05, r
            );
            grad.addColorStop(0, lightenColor(color, 60));
            grad.addColorStop(0.25, lightenColor(color, 20));
            grad.addColorStop(0.55, color);
            grad.addColorStop(0.8, darkenColor(color, 25));
            grad.addColorStop(1, darkenColor(color, 50));
            cx.fillStyle = grad;
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.fill();
        }

        // Subsurface glow
        if (num !== 8) {
            cx.save();
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.clip();
            const glowGrad = cx.createRadialGradient(cen + r * 0.15, cen + r * 0.2, 0, cen, cen, r);
            glowGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
            glowGrad.addColorStop(1, 'rgba(0,0,0,0.1)');
            cx.fillStyle = glowGrad;
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.fill();
            cx.restore();
        }

        // Number circle
        if (num > 0) {
            const ncr = r * 0.42;
            cx.shadowColor = 'rgba(0,0,0,0.3)';
            cx.shadowBlur = 3;
            cx.fillStyle = '#FFFFFF';
            cx.beginPath();
            cx.arc(cen, cen, ncr, 0, Math.PI * 2);
            cx.fill();
            cx.shadowBlur = 0;
            const ncGrad = cx.createRadialGradient(cen - ncr * 0.2, cen - ncr * 0.2, 0, cen, cen, ncr);
            ncGrad.addColorStop(0, '#FFFFFF');
            ncGrad.addColorStop(0.7, '#F8F8F4');
            ncGrad.addColorStop(1, '#E8E8E0');
            cx.fillStyle = ncGrad;
            cx.beginPath();
            cx.arc(cen, cen, ncr - 0.5, 0, Math.PI * 2);
            cx.fill();
            cx.fillStyle = '#111111';
            cx.font = `bold ${r * 0.58}px "Segoe UI", system-ui, sans-serif`;
            cx.textAlign = 'center';
            cx.textBaseline = 'middle';
            cx.fillText(num.toString(), cen, cen + 1);
        }

        // Primary specular highlight
        const specGrad = cx.createRadialGradient(
            cen - r * 0.32, cen - r * 0.38, 0,
            cen - r * 0.2, cen - r * 0.25, r * 0.55
        );
        specGrad.addColorStop(0, 'rgba(255,255,255,0.7)');
        specGrad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
        specGrad.addColorStop(0.6, 'rgba(255,255,255,0.08)');
        specGrad.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = specGrad;
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.fill();

        // Secondary specular dot
        cx.fillStyle = 'rgba(255,255,255,0.85)';
        cx.beginPath();
        cx.arc(cen - r * 0.28, cen - r * 0.32, r * 0.1, 0, Math.PI * 2);
        cx.fill();

        // Rim light
        cx.save();
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.clip();
        const rimGrad = cx.createRadialGradient(cen + r * 0.1, cen + r * 0.5, r * 0.3, cen, cen, r);
        rimGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
        rimGrad.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = rimGrad;
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.fill();
        cx.restore();

        // Edge ring
        cx.strokeStyle = 'rgba(0,0,0,0.2)';
        cx.lineWidth = 1;
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.stroke();

        return c;
    }

    function buildCueBallCanvas() {
        const sz = CUE_R * 2 * BALL_CACHE_SCALE;
        const cen = sz / 2;
        const r = sz / 2 - 2;
        const c = document.createElement('canvas');
        c.width = sz; c.height = sz;
        const cx = c.getContext('2d');

        // Drop shadow
        cx.fillStyle = 'rgba(0,0,0,0.2)';
        cx.beginPath();
        cx.ellipse(cen + 2, cen + 3, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
        cx.fill();

        // White ball
        const grad = cx.createRadialGradient(
            cen - r * 0.3, cen - r * 0.3, r * 0.05,
            cen + r * 0.05, cen + r * 0.05, r
        );
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.3, '#FCFCF8');
        grad.addColorStop(0.5, '#F5F5F0');
        grad.addColorStop(0.85, '#D8D8D4');
        grad.addColorStop(1, '#C0C0BC');
        cx.fillStyle = grad;
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.fill();

        // Subtle blue tint
        cx.fillStyle = 'rgba(200,210,255,0.06)';
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.fill();

        // Extra-bright specular
        const specGrad = cx.createRadialGradient(
            cen - r * 0.32, cen - r * 0.38, 0,
            cen - r * 0.2, cen - r * 0.25, r * 0.55
        );
        specGrad.addColorStop(0, 'rgba(255,255,255,0.85)');
        specGrad.addColorStop(0.3, 'rgba(255,255,255,0.45)');
        specGrad.addColorStop(0.6, 'rgba(255,255,255,0.1)');
        specGrad.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = specGrad;
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.fill();

        // Sharp specular dot
        cx.fillStyle = 'rgba(255,255,255,0.9)';
        cx.beginPath();
        cx.arc(cen - r * 0.28, cen - r * 0.32, r * 0.12, 0, Math.PI * 2);
        cx.fill();

        // Rim light
        cx.save();
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.clip();
        const rimGrad = cx.createRadialGradient(cen + r * 0.1, cen + r * 0.5, r * 0.3, cen, cen, r);
        rimGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
        rimGrad.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = rimGrad;
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.fill();
        cx.restore();

        // Edge ring
        cx.strokeStyle = 'rgba(0,0,0,0.12)';
        cx.lineWidth = 1;
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.stroke();

        return c;
    }

    function prebuildBallCanvases() {
        ballCanvasCache = {};
        for (let n = 1; n <= 15; n++) {
            ballCanvasCache[n] = buildBallCanvas(n);
        }
        ballCanvasCache['cue'] = buildCueBallCanvas();
    }

    function drawBilliardBall(bx, by, r, num) {
        const cached = ballCanvasCache[num];
        if (!cached) return;

        const drawSize = r * 2;
        ctx.save();
        ctx.translate(bx, by);
        ctx.drawImage(cached, -drawSize / 2 - 0.5, -drawSize / 2 - 0.5, drawSize + 1, drawSize + 1);
        ctx.restore();
    }

    function lightenColor(hex, amt) {
        const c = hexToRgb(hex);
        return `rgb(${clamp(c.r + amt, 0, 255)},${clamp(c.g + amt, 0, 255)},${clamp(c.b + amt, 0, 255)})`;
    }
    function darkenColor(hex, amt) {
        const c = hexToRgb(hex);
        return `rgb(${clamp(c.r - amt, 0, 255)},${clamp(c.g - amt, 0, 255)},${clamp(c.b - amt, 0, 255)})`;
    }
    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16) || 128;
        const g = parseInt(hex.slice(3, 5), 16) || 128;
        const b = parseInt(hex.slice(5, 7), 16) || 128;
        return { r, g, b };
    }

    function drawObjectBalls() {
        for (const b of balls) {
            if (b.potted) continue;
            drawBilliardBall(b.x, b.y, b.r, b.num);

            // Highlight player's ball group
            if (playerGroup !== GRP_NONE && ballGroup(b.num) === playerGroup && state === ST_AIMING) {
                ctx.strokeStyle = `rgba(255,255,255,${0.15 + 0.1 * Math.sin(frameCount * 0.08)})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }

    function drawCueBall() {
        const cached = ballCanvasCache['cue'];
        if (!cached || !cueBall) return;

        const drawSize = cueBall.r * 2;
        ctx.save();
        ctx.translate(cueBall.x, cueBall.y);
        ctx.drawImage(cached, -drawSize / 2 - 0.5, -drawSize / 2 - 0.5, drawSize + 1, drawSize + 1);
        ctx.restore();
    }

    function drawCueBallAt(bx, by, r) {
        const cached = ballCanvasCache['cue'];
        if (!cached) return;
        const drawSize = r * 2;
        ctx.save();
        ctx.translate(bx, by);
        ctx.drawImage(cached, -drawSize / 2 - 0.5, -drawSize / 2 - 0.5, drawSize + 1, drawSize + 1);
        ctx.restore();
    }

    function drawAimLine() {
        if (!cueBall) return;
        const dx = cueBall.x - mouseX;
        const dy = cueBall.y - mouseY;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / d, ny = dy / d;

        // Dotted trajectory line
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(cueBall.x, cueBall.y);

        // Project and check for ball collision along the aim line
        let hitBall = null;
        let hitDist = Infinity;
        const step = 2;
        for (let s = CUE_R + 2; s < 400; s += step) {
            const cx2 = cueBall.x + nx * s;
            const cy2 = cueBall.y + ny * s;

            // Check wall
            if (cx2 < RAIL_W + CUE_R || cx2 > GAME_W - RAIL_W - CUE_R ||
                cy2 < RAIL_W + CUE_R || cy2 > GAME_H - RAIL_W - CUE_R) {
                hitDist = s;
                break;
            }

            // Check ball collision
            for (const b of balls) {
                if (b.potted) continue;
                if (dist(cx2, cy2, b.x, b.y) < CUE_R + b.r) {
                    hitBall = b;
                    hitDist = s;
                    break;
                }
            }
            if (hitBall || hitDist < Infinity) break;
        }

        const projLen = Math.min(hitDist, 400);
        const endX = cueBall.x + nx * projLen;
        const endY = cueBall.y + ny * projLen;
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw ghost ball and deflection preview if hitting a ball
        if (hitBall) {
            // Ghost ball position
            const gbx = endX, gby = endY;
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(gbx, gby, CUE_R, 0, Math.PI * 2);
            ctx.stroke();

            // Deflection line showing where object ball would go
            const toBallX = hitBall.x - gbx;
            const toBallY = hitBall.y - gby;
            const toBallD = Math.sqrt(toBallX * toBallX + toBallY * toBallY) || 1;
            const deflX = toBallX / toBallD, deflY = toBallY / toBallD;

            ctx.strokeStyle = 'rgba(255,200,100,0.35)';
            ctx.setLineDash([3, 5]);
            ctx.beginPath();
            ctx.moveTo(hitBall.x, hitBall.y);
            ctx.lineTo(hitBall.x + deflX * 60, hitBall.y + deflY * 60);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Aim direction indicator
        const arrowDist = 30;
        const ax = cueBall.x + nx * arrowDist;
        const ay = cueBall.y + ny * arrowDist;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(ax, ay, 3, 0, Math.PI * 2);
        ctx.fill();

        // Power indicator if dragging
        if (isAiming) {
            const power = clamp(d / 30, 0, 1);
            const barW = 60, barH = 6;
            const barX = cueBall.x - barW / 2;
            const barY = cueBall.y + cueBall.r + 12;

            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            roundRect(ctx, barX - 1, barY - 1, barW + 2, barH + 2, 3);
            ctx.fill();

            const pColor = power < 0.5 ? '#22C55E' : power < 0.8 ? '#FBBF24' : '#EF4444';
            ctx.fillStyle = pColor;
            roundRect(ctx, barX, barY, barW * power, barH, 3);
            ctx.fill();
        }

        // Cue stick visualization
        if (isAiming) {
            const pullDist = clamp(dist(mouseX, mouseY, cueBall.x, cueBall.y) / 3, 5, 30);
            const stickStartX = cueBall.x - nx * (cueBall.r + pullDist + 5);
            const stickStartY = cueBall.y - ny * (cueBall.r + pullDist + 5);
            const stickEndX = stickStartX - nx * 100;
            const stickEndY = stickStartY - ny * 100;

            ctx.strokeStyle = '#C4956A';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(stickStartX, stickStartY);
            ctx.lineTo(stickEndX, stickEndY);
            ctx.stroke();

            ctx.strokeStyle = '#E8DFD0';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(stickStartX, stickStartY);
            ctx.lineTo(stickStartX - nx * 8, stickStartY - ny * 8);
            ctx.stroke();
        }
    }

    function drawBallInHandGuide() {
        if (!cueBall) return;
        // Pulsing ring around cue ball to show it can be placed
        const pulse = 0.4 + 0.3 * Math.sin(frameCount * 0.1);
        ctx.strokeStyle = `rgba(100,200,255,${pulse})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(cueBall.x, cueBall.y, CUE_R + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Instruction text
        ctx.fillStyle = 'rgba(100,200,255,0.8)';
        ctx.font = '11px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Click to place, then aim', cueBall.x, cueBall.y - CUE_R - 14);
    }

    function drawAIThinking() {
        // Show dots animation while AI thinks
        const dots = '.'.repeat(1 + Math.floor((frameCount / 15) % 4));
        ctx.fillStyle = 'rgba(255,200,100,0.7)';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('AI thinking' + dots, GAME_W / 2, GAME_H - RAIL_W - 40);
    }

    function drawBallTrails() {
        const allBalls = [...balls.filter(b => !b.potted)];
        if (cueBall && !cuePotted) allBalls.push(cueBall);
        for (const b of allBalls) {
            const spd = ballSpeed(b);
            if (spd > 3) {
                const steps = clamp(Math.floor(spd / 3), 1, 5);
                for (let s = 1; s <= steps; s++) {
                    const t = s / (steps + 1);
                    const tx = b.x - b.vx * s * 1.5;
                    const ty = b.y - b.vy * s * 1.5;
                    const alpha = (1 - t) * 0.15;
                    const tr = b.r * (1 - t * 0.3);
                    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
                    ctx.beginPath();
                    ctx.arc(tx, ty, tr, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    function drawPocketAnims() {
        for (const pa of pocketAnimsList) {
            const ox = Math.cos(pa.angle) * POCKET_R * 0.3 * pa.shrink;
            const oy = Math.sin(pa.angle) * POCKET_R * 0.3 * pa.shrink;
            const drawR = pa.r * pa.shrink;
            if (drawR < 1) continue;
            ctx.globalAlpha = pa.shrink;
            if (pa.isCue) {
                drawCueBallAt(pa.x + ox, pa.y + oy, drawR);
            } else {
                drawBilliardBall(pa.x + ox, pa.y + oy, drawR, pa.num);
            }
            ctx.globalAlpha = 1;
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = p.life / (p.maxLife || 40);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    function drawScorePopups() {
        for (const sp of scorePopups) {
            const alpha = sp.life / 50;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = sp.color;
            ctx.font = 'bold 14px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(sp.text, sp.x, sp.y);
            ctx.globalAlpha = 1;
        }
    }

    function drawHUD() {
        const pad = 6;
        // Top bar background
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        roundRect(ctx, RAIL_W + 2, RAIL_W + 2, GAME_W - 2 * RAIL_W - 4, 26, 4);
        ctx.fill();

        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.textBaseline = 'middle';
        const ty = RAIL_W + 15;

        // Turn indicator
        const isPlayerTurn = currentTurn === TURN_PLAYER;
        ctx.textAlign = 'left';
        ctx.fillStyle = isPlayerTurn ? '#3B82F6' : '#F97316';
        const turnLabel = isPlayerTurn ? '\u25B6 PLAYER' : '\u25B6 AI';
        ctx.fillText(turnLabel, RAIL_W + pad + 4, ty);

        // Group indicator
        ctx.textAlign = 'center';
        if (playerGroup === GRP_NONE) {
            ctx.fillStyle = '#94A3B8';
            ctx.fillText('OPEN TABLE', GAME_W / 2, ty);
        } else {
            const pLabel = playerGroup === GRP_SOLIDS ? 'SOLIDS' : 'STRIPES';
            const aLabel = aiGroup === GRP_SOLIDS ? 'SOLIDS' : 'STRIPES';
            ctx.fillStyle = '#3B82F6';
            ctx.font = 'bold 10px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('You: ' + pLabel, GAME_W / 2 - 50, ty);
            ctx.fillStyle = '#F97316';
            ctx.fillText('AI: ' + aLabel, GAME_W / 2 + 50, ty);
        }

        // Score
        ctx.textAlign = 'right';
        ctx.fillStyle = CLR_HUD;
        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.fillText(`SCORE: ${score}`, GAME_W - RAIL_W - pad - 4, ty);
    }

    function drawPottedBallsTracker() {
        // Bottom bar showing remaining balls for each side
        if (playerGroup === GRP_NONE && !isBreakShot) return;
        if (state === ST_TITLE) return;

        countBalls();

        const barY = GAME_H - RAIL_W - 28;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        roundRect(ctx, RAIL_W + 2, barY - 2, GAME_W - 2 * RAIL_W - 4, 24, 4);
        ctx.fill();

        const miniR = 6;
        const spacing = 16;

        // Player's balls (left side)
        const playerNums = playerGroup === GRP_SOLIDS ? [1,2,3,4,5,6,7] :
                           playerGroup === GRP_STRIPES ? [9,10,11,12,13,14,15] : [];
        let px = RAIL_W + 14;
        ctx.fillStyle = '#3B82F6';
        ctx.font = 'bold 8px Arial, sans-serif';
        ctx.textAlign = 'left';
        if (playerNums.length > 0) {
            ctx.fillText('YOU', px, barY + 4);
            px += 24;
        }

        for (const num of playerNums) {
            const potted = balls.find(b => b.num === num && b.potted);
            if (potted) {
                // Dimmed / crossed out
                ctx.globalAlpha = 0.25;
            }
            const cached = ballCanvasCache[num];
            if (cached) {
                ctx.drawImage(cached, px - miniR, barY + 2, miniR * 2, miniR * 2);
            }
            ctx.globalAlpha = 1;
            px += spacing;
        }

        // 8-ball in center
        const eightPotted = balls.find(b => b.num === 8 && b.potted);
        const eightX = GAME_W / 2;
        if (!eightPotted) {
            const cached = ballCanvasCache[8];
            if (cached) {
                ctx.drawImage(cached, eightX - miniR, barY + 2, miniR * 2, miniR * 2);
            }
        }

        // AI's balls (right side)
        const aiNums = aiGroup === GRP_SOLIDS ? [1,2,3,4,5,6,7] :
                       aiGroup === GRP_STRIPES ? [9,10,11,12,13,14,15] : [];
        let ax = GAME_W - RAIL_W - 14 - aiNums.length * spacing - 20;
        ctx.fillStyle = '#F97316';
        ctx.font = 'bold 8px Arial, sans-serif';
        ctx.textAlign = 'left';
        if (aiNums.length > 0) {
            ctx.fillText('AI', ax, barY + 4);
            ax += 16;
        }

        for (const num of aiNums) {
            const potted = balls.find(b => b.num === num && b.potted);
            if (potted) ctx.globalAlpha = 0.25;
            const cached = ballCanvasCache[num];
            if (cached) {
                ctx.drawImage(cached, ax - miniR, barY + 2, miniR * 2, miniR * 2);
            }
            ctx.globalAlpha = 1;
            ax += spacing;
        }
    }

    function drawTurnMessage() {
        if (turnMessageTimer <= 0 || !turnMessage) return;
        const alpha = clamp(turnMessageTimer / 30, 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha;

        // Background pill
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const w = ctx.measureText ? 240 : 240;
        roundRect(ctx, GAME_W / 2 - 120, GAME_H / 2 - 18, 240, 36, 8);
        ctx.fill();

        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 16px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(turnMessage, GAME_W / 2, GAME_H / 2);

        ctx.restore();
    }

    function drawTitleScreen() {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.fillStyle = '#FBBF24';
        ctx.font = 'bold 42px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('8-BALL POOL', GAME_W / 2, GAME_H * 0.2);

        ctx.fillStyle = '#94A3B8';
        ctx.font = '15px Arial, sans-serif';
        ctx.fillText('CentiBalls', GAME_W / 2, GAME_H * 0.27);

        // Decorative balls
        const demoNums = [1, 3, 5, 8, 11, 14];
        for (let i = 0; i < demoNums.length; i++) {
            const angle = frameCount * 0.01 + (i / demoNums.length) * Math.PI * 2;
            const bx = GAME_W / 2 + Math.cos(angle) * 80;
            const by = GAME_H * 0.40 + Math.sin(angle) * 25;
            drawBilliardBall(bx, by, 14, demoNums[i]);
        }

        ctx.fillStyle = '#E0E7FF';
        ctx.font = '13px Arial, sans-serif';
        const instructions = [
            'Drag from the cue ball to aim and set power',
            'Pot all your balls (solids or stripes)',
            'Then sink the 8-ball to win!',
            '',
            'Scratching gives opponent ball-in-hand',
            'Potting 8-ball early = you lose',
        ];
        instructions.forEach((line, i) => {
            ctx.fillText(line, GAME_W / 2, GAME_H * 0.55 + i * 20);
        });

        const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.06);
        ctx.fillStyle = `rgba(251,191,36,${pulse})`;
        ctx.font = 'bold 18px Arial, sans-serif';
        ctx.fillText('CLICK TO BREAK', GAME_W / 2, GAME_H * 0.88);
    }

    function drawWinScreen() {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.fillStyle = '#22C55E';
        ctx.font = 'bold 44px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('YOU WIN!', GAME_W / 2, GAME_H * 0.3);

        ctx.fillStyle = '#E0E7FF';
        ctx.font = '20px Arial, sans-serif';
        ctx.fillText(`Score: ${score}`, GAME_W / 2, GAME_H * 0.42);

        ctx.fillStyle = '#94A3B8';
        ctx.font = '14px Arial, sans-serif';
        ctx.fillText(`Shots taken: ${shotsFired}`, GAME_W / 2, GAME_H * 0.50);

        if (score >= highScore && score > 0) {
            ctx.fillStyle = '#FBBF24';
            ctx.font = 'bold 16px Arial, sans-serif';
            const shimmer = 0.7 + 0.3 * Math.sin(frameCount * 0.1);
            ctx.globalAlpha = shimmer;
            ctx.fillText('NEW HIGH SCORE!', GAME_W / 2, GAME_H * 0.60);
            ctx.globalAlpha = 1;
        }

        const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.06);
        ctx.fillStyle = `rgba(251,191,36,${pulse})`;
        ctx.font = 'bold 18px Arial, sans-serif';
        ctx.fillText('CLICK TO PLAY AGAIN', GAME_W / 2, GAME_H * 0.78);
    }

    function drawLoseScreen() {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 44px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('YOU LOSE', GAME_W / 2, GAME_H * 0.3);

        ctx.fillStyle = '#E0E7FF';
        ctx.font = '18px Arial, sans-serif';
        ctx.fillText(turnMessage || '', GAME_W / 2, GAME_H * 0.42);

        ctx.fillStyle = '#94A3B8';
        ctx.font = '14px Arial, sans-serif';
        ctx.fillText(`Score: ${score}  |  Shots: ${shotsFired}`, GAME_W / 2, GAME_H * 0.52);

        const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.06);
        ctx.fillStyle = `rgba(251,191,36,${pulse})`;
        ctx.font = 'bold 18px Arial, sans-serif';
        ctx.fillText('CLICK TO PLAY AGAIN', GAME_W / 2, GAME_H * 0.78);
    }

    // ═══════════════════════════════════════════
    //  GAME LOOP
    // ═══════════════════════════════════════════
    function gameLoop(ts) {
        if (!gameActive) return;
        const dt = Math.min((ts - (lastTime || ts)) / 1000, 0.05);
        lastTime = ts;

        if (state !== ST_TITLE && state !== ST_GAME_WON && state !== ST_GAME_LOST) {
            update(dt);
        } else {
            // Still update visual effects on end screens
            frameCount++;
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx; p.y += p.vy;
                p.vx *= 0.96; p.vy *= 0.96;
                p.life--;
                if (p.life <= 0) particles.splice(i, 1);
            }
            for (let i = scorePopups.length - 1; i >= 0; i--) {
                scorePopups[i].y += scorePopups[i].vy;
                scorePopups[i].life--;
                if (scorePopups[i].life <= 0) scorePopups.splice(i, 1);
            }
            updatePocketAnims();
        }
        draw();

        animFrame = requestAnimationFrame(gameLoop);
    }

    // ═══════════════════════════════════════════
    //  INPUT
    // ═══════════════════════════════════════════
    function getCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        const sx = GAME_W / rect.width;
        const sy = GAME_H / rect.height;
        const cx2 = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const cy2 = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
        return { x: (cx2 - rect.left) * sx, y: (cy2 - rect.top) * sy };
    }

    function onMouseDown(e) {
        e.preventDefault();
        ensureAudio();
        const pos = getCanvasPos(e);
        mouseX = pos.x; mouseY = pos.y;

        if (state === ST_TITLE) {
            startGame();
            return;
        }
        if (state === ST_GAME_WON || state === ST_GAME_LOST) {
            startGame();
            return;
        }
        if (state === ST_BALL_IN_HAND && currentTurn === TURN_PLAYER) {
            // Place the cue ball, then switch to aiming
            state = ST_AIMING;
            ballInHandRestricted = false;
            return;
        }
        if (state === ST_AIMING && cueBall && currentTurn === TURN_PLAYER) {
            isAiming = true;
            aimStartX = pos.x;
            aimStartY = pos.y;
        }
    }

    function onMouseMove(e) {
        const pos = getCanvasPos(e);
        mouseX = pos.x; mouseY = pos.y;
    }

    function onMouseUp(e) {
        if (!isAiming || state !== ST_AIMING || !cueBall || currentTurn !== TURN_PLAYER) {
            isAiming = false;
            return;
        }
        isAiming = false;
        const pos = getCanvasPos(e);
        const dx = cueBall.x - pos.x;
        const dy = cueBall.y - pos.y;
        const pullDist = Math.sqrt(dx * dx + dy * dy);
        if (pullDist < 10) return; // too small, ignore

        const power = clamp(pullDist / 25, MIN_SHOT_POWER / MAX_SHOT_POWER, 1) * MAX_SHOT_POWER;
        shoot(dx, dy, power);
    }

    function onTouchStart(e) {
        e.preventDefault();
        onMouseDown(e.touches[0] || e);
    }
    function onTouchMove(e) {
        e.preventDefault();
        onMouseMove(e.touches[0] || e);
    }
    function onTouchEnd(e) {
        e.preventDefault();
        const touch = e.changedTouches ? e.changedTouches[0] : e;
        onMouseUp(touch);
    }

    function onKeyDown(e) {
        keys_pressed[e.key] = true;
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (state === ST_TITLE) {
                startGame();
            } else if (state === ST_GAME_WON || state === ST_GAME_LOST) {
                startGame();
            } else if (state === ST_BALL_IN_HAND && currentTurn === TURN_PLAYER) {
                state = ST_AIMING;
                ballInHandRestricted = false;
            } else if (state === ST_AIMING && cueBall && currentTurn === TURN_PLAYER) {
                const dx = cueBall.x - mouseX;
                const dy = cueBall.y - mouseY;
                shoot(dx, dy, MAX_SHOT_POWER * 0.5);
            }
        }
    }

    function onKeyUp(e) {
        keys_pressed[e.key] = false;
    }

    // ═══════════════════════════════════════════
    //  CANVAS SIZING
    // ═══════════════════════════════════════════
    function fitCanvas() {
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        const maxW = parent.clientWidth || 640;
        const maxH = parent.clientHeight || 640;
        const side = Math.min(maxW, maxH, 640);
        canvas.style.width = side + 'px';
        canvas.style.height = side + 'px';
        canvas.width = side * DPR;
        canvas.height = side * DPR;
        SCALE = side / GAME_W;
        W = canvas.width;
        H = canvas.height;
    }

    // ═══════════════════════════════════════════
    //  INIT / DESTROY
    // ═══════════════════════════════════════════
    function init(cvs, player, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = player;
        gameOverCB = onGameOver;
        gameActive = true;
        lastTime = 0;
        state = ST_TITLE;
        score = 0;
        shotsFired = 0;
        frameCount = 0;
        screenShake = 0;
        balls = [];
        particles = [];
        scorePopups = [];
        pockets = [];
        pocketAnimsList = [];
        cueBall = null;
        cuePotted = false;
        isAiming = false;
        keys_pressed = {};
        currentTurn = TURN_PLAYER;
        playerGroup = GRP_NONE;
        aiGroup = GRP_NONE;
        isBreakShot = true;
        turnMessage = '';
        turnMessageTimer = 0;
        gameResult = null;

        playerColor = (player && player.color) || '#3B82F6';
        const _t = (window.ThemeEngine && ThemeEngine.getCurrentTheme) ? ThemeEngine.getCurrentTheme() : null;
        if (_t && _t.colors && _t.colors.length >= 4) {
            playerColor = _t.colors[0] || playerColor;
        }

        loadSprites();
        prebuildBallCanvases();

        DPR = Math.min(window.devicePixelRatio || 1, 3);
        SCALE = 1;

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
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
        if (canvas) {
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', fitCanvas);
        keys_pressed = {};
        balls = [];
        particles = [];
        scorePopups = [];
        pocketAnimsList = [];
    }

    return { init, destroy };
})();
