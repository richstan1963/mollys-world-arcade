/* YWA CentiBalls — Centipede meets Billiards.
   A centipede chain of billiard balls descends from the top of the table
   toward the player at the bottom. The chain weaves horizontally, dropping
   a row at each wall edge and at mushroom bumpers. Shoot the cue ball to
   break segments loose, then pot them into the 6 pockets for bonus points.
   Real pool physics — balls scatter, ricochet off mushrooms, chain-react. */
window.CentiBalls = (() => {
    // ── Design Constants ──
    const GAME_W = 640, GAME_H = 640;
    const BALL_R = 12;
    const CUE_R = 13;
    const POCKET_R = 22;
    const RAIL_W = 18;
    const MUSH_R = 14;
    const MUSH_HP_MAX = 3;
    const FRICTION = 0.993;
    const WALL_COR = 0.85;
    const MUSH_COR = 1.1;
    const BALL_COR = 0.96;
    const MAX_SHOT_POWER = 16;
    const MIN_SHOT_POWER = 3;
    const CHAIN_SPEED_BASE = 0.5;
    const CHAIN_DROP = BALL_R * 2.5;
    const GRID_COLS = 18;
    const GRID_ROWS = 16;
    const GRID_OFFSET_X = RAIL_W + BALL_R + 4;
    const GRID_OFFSET_Y = RAIL_W + BALL_R + 4;
    const GRID_SPACE_X = (GAME_W - 2 * RAIL_W - 2 * BALL_R - 8) / (GRID_COLS - 1);
    const GRID_SPACE_Y = (GAME_H - 2 * RAIL_W - 100) / (GRID_ROWS - 1);
    const CUE_HOME_Y = GAME_H - RAIL_W - 30;
    const SPEED_THRESHOLD = 0.15;
    const POWERUP_DUR = 8000;

    // States
    const ST_TITLE = 0, ST_AIMING = 1, ST_SHOOTING = 2, ST_RESOLVING = 3;
    const ST_LEVEL_CLEAR = 4, ST_GAMEOVER = 5;

    // Power-up types
    const PW_MEGA = 0, PW_MULTI = 1, PW_EXPLOSIVE = 2, PW_SLOW = 3;
    const PW_NAMES = ['MEGA', 'MULTI', 'EXPLODE', 'SLOW'];
    const PW_COLORS = ['#F97316', '#3B82F6', '#EF4444', '#A855F7'];

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
    let CLR_POCKET = '#0D1117';
    let CLR_HUD = '#F0E6D2';
    let CLR_MUSH_CAP = '#22C55E';
    let CLR_MUSH_STEM = '#166534';
    let CLR_MUSH_GOLD = '#FBBF24';
    let CLR_CUE = '#F5F5F0';
    let CLR_CHAIN_LINK = 'rgba(255,255,255,0.25)';

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
        mushroom: `${SPRITE_BASE}/kenney-platform/tiles/bush.png`,
        mushGold: `${SPRITE_BASE}/kenney-platform/items/star.png`,
        fire0: `${SPRITE_BASE}/kenney-space/effects/fire00.png`,
        fire1: `${SPRITE_BASE}/kenney-space/effects/fire04.png`,
        fire2: `${SPRITE_BASE}/kenney-space/effects/fire08.png`,
        fire3: `${SPRITE_BASE}/kenney-space/effects/fire12.png`,
        coin: `${SPRITE_BASE}/kenney-coins/coin_01.png`,
        starGold: `${SPRITE_BASE}/kenney-physics/other/starGold.png`,
        debris1: `${SPRITE_BASE}/kenney-physics/debris/debrisWood_1.png`,
        debris2: `${SPRITE_BASE}/kenney-physics/debris/debrisWood_2.png`,
        debris3: `${SPRITE_BASE}/kenney-physics/debris/debrisWood_3.png`,
        particle1: `${SPRITE_BASE}/kenney-particles/particleWhite_1.png`,
        particle2: `${SPRITE_BASE}/kenney-particles/particleWhite_3.png`,
        particle3: `${SPRITE_BASE}/kenney-particles/particleWhite_5.png`,
        fireball: `${SPRITE_BASE}/kenney-platform/particles/fireball.png`,
        gemRed: `${SPRITE_BASE}/kenney-platform/items/gemRed.png`,
        gemBlue: `${SPRITE_BASE}/kenney-platform/items/gemBlue.png`,
        gemGreen: `${SPRITE_BASE}/kenney-platform/items/gemGreen.png`,
        gemYellow: `${SPRITE_BASE}/kenney-platform/items/gemYellow.png`,
        heart: `${SPRITE_BASE}/kenney-platform/hud/hudHeart_full.png`,
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
    let score, level, lives, shotsFired;
    let activePlayer, gameOverCB, playerColor;
    let highScore = parseInt(localStorage.getItem('ywa_centiballs_hi') || '0');
    let frameCount = 0, screenShake = 0;
    let mouseX = GAME_W / 2, mouseY = GAME_H - 100;
    let aimStartX = 0, aimStartY = 0, isAiming = false;
    let keys_pressed = {};

    // Game entities
    let cueBall, freeBalls, chains, mushrooms, pockets;
    let particles, scorePopups, powerups, explosions;
    let activePowerup, powerupTimer;
    let levelClearTimer, comboCount;
    let totalSegments, segmentsCleared;
    let cueScratch;

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
    function sfxMushroomPing() {
        playTone(660, 0.08, 'sine', 0.08, 880);
    }
    function sfxPocketThud() {
        playTone(80, 0.2, 'sine', 0.12, 40);
        playNoise(0.1, 0.08);
    }
    function sfxChainReaction() {
        playNoise(0.3, 0.14);
        playTone(100, 0.3, 'sawtooth', 0.1, 50);
        playTone(200, 0.2, 'square', 0.06, 400);
    }
    function sfxLevelClear() {
        [523, 659, 784, 1047].forEach((f, i) => {
            setTimeout(() => playTone(f, 0.2, 'sine', 0.1), i * 120);
        });
    }
    function sfxPowerup() {
        playTone(440, 0.1, 'sine', 0.08, 880);
        playTone(660, 0.15, 'sine', 0.06, 1320);
    }
    function sfxScratch() {
        playTone(200, 0.3, 'sawtooth', 0.1, 80);
        playNoise(0.2, 0.06);
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

    // roundRect polyfill
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

    // ═══════════════════════════════════════════
    //  PHYSICS — Elastic ball-ball collision
    // ═══════════════════════════════════════════
    function resolveCollision(a, b, cor) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d === 0) return;
        const nx = dx / d, ny = dy / d;
        // Separate overlap
        const overlap = (a.r + b.r) - d;
        if (overlap > 0) {
            const sep = overlap / 2 + 0.5;
            a.x -= nx * sep; a.y -= ny * sep;
            b.x += nx * sep; b.y += ny * sep;
        }
        // Relative velocity along normal
        const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
        const dvn = dvx * nx + dvy * ny;
        if (dvn <= 0) return; // moving apart
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

        if (ball.x < left) { ball.x = left; ball.vx = Math.abs(ball.vx) * WALL_COR; sfxCushionBounce(); }
        if (ball.x > right) { ball.x = right; ball.vx = -Math.abs(ball.vx) * WALL_COR; sfxCushionBounce(); }
        if (ball.y < top) { ball.y = top; ball.vy = Math.abs(ball.vy) * WALL_COR; sfxCushionBounce(); }
        if (ball.y > bottom) { ball.y = bottom; ball.vy = -Math.abs(ball.vy) * WALL_COR; sfxCushionBounce(); }
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
        const f = (activePowerup === PW_SLOW) ? 0.985 : FRICTION;
        ball.vx *= f;
        ball.vy *= f;
        if (Math.abs(ball.vx) < 0.01) ball.vx = 0;
        if (Math.abs(ball.vy) < 0.01) ball.vy = 0;
    }

    function ballSpeed(b) {
        return Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    }

    function ballMoving(b) {
        return ballSpeed(b) > SPEED_THRESHOLD;
    }

    // ═══════════════════════════════════════════
    //  MUSHROOM SYSTEM
    // ═══════════════════════════════════════════
    function createMushrooms() {
        mushrooms = [];
        const density = 0.15 + level * 0.03;
        const goldChance = 0.08 + level * 0.01;
        for (let row = 1; row < GRID_ROWS - 2; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
                if (Math.random() < density) {
                    const mx = GRID_OFFSET_X + col * GRID_SPACE_X;
                    const my = GRID_OFFSET_Y + row * GRID_SPACE_Y;
                    mushrooms.push({
                        x: mx, y: my, r: MUSH_R,
                        hp: MUSH_HP_MAX,
                        golden: Math.random() < goldChance,
                        hitFlash: 0, shakeX: 0, shakeY: 0
                    });
                }
            }
        }
    }

    function mushroomBounce(ball) {
        for (let i = mushrooms.length - 1; i >= 0; i--) {
            const m = mushrooms[i];
            const d = dist(ball.x, ball.y, m.x, m.y);
            if (d < ball.r + m.r) {
                // Bounce off mushroom like a bumper
                const nx = (ball.x - m.x) / d;
                const ny = (ball.y - m.y) / d;
                const overlap = ball.r + m.r - d;
                ball.x += nx * (overlap + 1);
                ball.y += ny * (overlap + 1);
                const dot = ball.vx * nx + ball.vy * ny;
                ball.vx = (ball.vx - 2 * dot * nx) * MUSH_COR;
                ball.vy = (ball.vy - 2 * dot * ny) * MUSH_COR;

                m.hitFlash = 8;
                m.shakeX = randRange(-3, 3);
                m.shakeY = randRange(-3, 3);
                sfxMushroomPing();

                // Damage mushroom
                m.hp--;
                if (m.hp <= 0) {
                    // Destroy mushroom
                    spawnMushroomDebris(m.x, m.y, m.golden);
                    if (m.golden) {
                        spawnPowerup(m.x, m.y);
                    }
                    addScore(50, m.x, m.y);
                    mushrooms.splice(i, 1);
                } else {
                    spawnParticles(m.x, m.y, 3, m.golden ? CLR_MUSH_GOLD : CLR_MUSH_CAP);
                }
                return true;
            }
        }
        return false;
    }

    // ═══════════════════════════════════════════
    //  CHAIN (CENTIPEDE) SYSTEM
    // ═══════════════════════════════════════════
    function createChain(segCount, startX, startY, dir) {
        const segs = [];
        for (let i = 0; i < segCount; i++) {
            const num = ((level - 1) * 15 + segs.length) % 15 + 1;
            segs.push({
                x: startX - i * BALL_R * 2.2 * dir,
                y: startY,
                targetX: 0, targetY: 0,
                num: num,
                r: BALL_R
            });
        }
        return {
            segs, dir, speed: CHAIN_SPEED_BASE + level * 0.06,
            rowY: startY, moving: true
        };
    }

    function updateChain(chain, dt) {
        if (!chain.moving || chain.segs.length === 0) return;
        const head = chain.segs[0];
        const spd = chain.speed * (activePowerup === PW_SLOW ? 0.4 : 1);

        // Move head horizontally
        head.x += chain.dir * spd;

        // Check wall collision — drop and reverse
        const left = RAIL_W + BALL_R + 2;
        const right = GAME_W - RAIL_W - BALL_R - 2;
        let turned = false;
        if (head.x < left) {
            head.x = left;
            chain.dir = 1;
            chain.rowY += CHAIN_DROP;
            turned = true;
        } else if (head.x > right) {
            head.x = right;
            chain.dir = -1;
            chain.rowY += CHAIN_DROP;
            turned = true;
        }

        // Mushroom collision — chain turns at mushrooms like classic Centipede
        if (!turned) {
            for (const m of mushrooms) {
                if (dist(head.x, head.y, m.x, m.y) < BALL_R + m.r) {
                    // Push head back out of mushroom
                    head.x -= chain.dir * spd;
                    // Reverse direction and drop down a row
                    chain.dir = -chain.dir;
                    chain.rowY += CHAIN_DROP;
                    // Visual feedback on mushroom
                    m.hitFlash = 4;
                    m.shakeX = randRange(-1.5, 1.5);
                    m.shakeY = randRange(-1.5, 1.5);
                    break;
                }
            }
        }

        head.y += (chain.rowY - head.y) * 0.1;

        // Body follows head
        for (let i = 1; i < chain.segs.length; i++) {
            const prev = chain.segs[i - 1];
            const seg = chain.segs[i];
            const dx = prev.x - seg.x, dy = prev.y - seg.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            const desired = BALL_R * 2.2;
            if (d > desired) {
                const pull = (d - desired) / d;
                seg.x += dx * pull * 0.15;
                seg.y += dy * pull * 0.15;
            }
        }

        // Check if chain reached bottom
        if (chain.rowY > GAME_H - RAIL_W - 60) {
            // Game over condition — chain reached the bottom
            lives--;
            if (lives <= 0) {
                state = ST_GAMEOVER;
            } else {
                // Reset chain position
                chain.rowY = RAIL_W + 40;
                for (const s of chain.segs) s.y = chain.rowY;
            }
        }
    }

    function hitChainSegment(chain, segIndex, hittingBall) {
        const seg = chain.segs[segIndex];
        comboCount++;

        // Detach segment — becomes a free ball
        const freed = {
            x: seg.x, y: seg.y,
            vx: 0, vy: 0,
            r: BALL_R, num: seg.num,
            mass: 1, fromChain: true
        };

        // Calculate collision impulse from hitting ball
        const dx = seg.x - hittingBall.x;
        const dy = seg.y - hittingBall.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / d, ny = dy / d;
        const impactSpeed = ballSpeed(hittingBall);
        freed.vx = nx * impactSpeed * 0.7 + randRange(-1, 1);
        freed.vy = ny * impactSpeed * 0.7 + randRange(-1, 1);

        freeBalls.push(freed);

        // Explosive powerup: splash damage
        if (activePowerup === PW_EXPLOSIVE && hittingBall === cueBall) {
            spawnExplosion(seg.x, seg.y);
            explosiveSplash(seg.x, seg.y, chain);
        }

        // Split chain into two
        const before = chain.segs.slice(0, segIndex);
        const after = chain.segs.slice(segIndex + 1);

        // Score with combo multiplier
        const pts = 100 * Math.min(comboCount, 5);
        addScore(pts, seg.x, seg.y);
        segmentsCleared++;

        sfxBallClick();
        if (comboCount > 1) {
            sfxChainReaction();
            screenShake = Math.min(4 + comboCount * 2, 16);
        }

        spawnParticles(seg.x, seg.y, 8, BALL_COLORS[seg.num] || '#FFF');

        // Replace original chain with the two halves
        const chainIdx = chains.indexOf(chain);
        if (chainIdx === -1) return;
        chains.splice(chainIdx, 1);

        if (before.length > 0) {
            chains.push({
                segs: before, dir: chain.dir, speed: chain.speed,
                rowY: before[0].y, moving: true
            });
        }
        if (after.length > 0) {
            // Reverse second half so it has its own head
            chains.push({
                segs: after, dir: -chain.dir, speed: chain.speed,
                rowY: after[0].y, moving: true
            });
        }
    }

    function explosiveSplash(cx, cy, sourceChain) {
        const splashR = 60;
        for (const chain of [...chains]) {
            for (let i = chain.segs.length - 1; i >= 0; i--) {
                const s = chain.segs[i];
                if (dist(cx, cy, s.x, s.y) < splashR) {
                    hitChainSegment(chain, i, { x: cx, y: cy, vx: 0, vy: 0 });
                    if (!chains.includes(chain)) break;
                }
            }
        }
    }

    function checkBallChainCollisions(ball) {
        for (const chain of [...chains]) {
            for (let i = 0; i < chain.segs.length; i++) {
                const seg = chain.segs[i];
                if (dist(ball.x, ball.y, seg.x, seg.y) < ball.r + seg.r) {
                    hitChainSegment(chain, i, ball);
                    return true;
                }
            }
        }
        return false;
    }

    // ═══════════════════════════════════════════
    //  POCKETS
    // ═══════════════════════════════════════════
    function createPockets() {
        pockets = [
            { x: RAIL_W + 6, y: RAIL_W + 6 },                          // top-left
            { x: GAME_W - RAIL_W - 6, y: RAIL_W + 6 },                 // top-right
            { x: RAIL_W + 6, y: GAME_H - RAIL_W - 6 },                 // bottom-left
            { x: GAME_W - RAIL_W - 6, y: GAME_H - RAIL_W - 6 },        // bottom-right
            { x: GAME_W / 2, y: RAIL_W + 2 },                           // top-center (side)
            { x: GAME_W / 2, y: GAME_H - RAIL_W - 2 }                   // bottom-center (side)
        ];
    }

    // ═══════════════════════════════════════════
    //  POWERUPS
    // ═══════════════════════════════════════════
    function spawnPowerup(x, y) {
        const type = randInt(0, 3);
        powerups.push({
            x, y, type, r: 10,
            vy: 0.5, life: 600, bobT: Math.random() * Math.PI * 2
        });
    }

    function collectPowerup(pu) {
        activePowerup = pu.type;
        powerupTimer = POWERUP_DUR;
        sfxPowerup();
        addScore(150, pu.x, pu.y);
        spawnParticles(pu.x, pu.y, 12, PW_COLORS[pu.type]);
    }

    // ═══════════════════════════════════════════
    //  CUE BALL + SHOOTING
    // ═══════════════════════════════════════════
    function resetCueBall() {
        cueBall = {
            x: GAME_W / 2, y: CUE_HOME_Y,
            vx: 0, vy: 0,
            r: activePowerup === PW_MEGA ? CUE_R * 1.5 : CUE_R,
            mass: activePowerup === PW_MEGA ? 2.0 : 1.0,
            isCue: true
        };
        cueScratch = false;
    }

    function shoot(dirX, dirY, power) {
        if (state !== ST_AIMING) return;
        const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
        const nx = dirX / len, ny = dirY / len;
        const p = clamp(power, MIN_SHOT_POWER, MAX_SHOT_POWER);
        cueBall.vx = nx * p;
        cueBall.vy = ny * p;
        state = ST_SHOOTING;
        shotsFired++;
        comboCount = 0;
        sfxCueStrike();

        // Multi-shot powerup
        if (activePowerup === PW_MULTI) {
            const angle1 = Math.atan2(ny, nx) - 0.2;
            const angle2 = Math.atan2(ny, nx) + 0.2;
            for (const a of [angle1, angle2]) {
                freeBalls.push({
                    x: cueBall.x + Math.cos(a) * 20,
                    y: cueBall.y + Math.sin(a) * 20,
                    vx: Math.cos(a) * p * 0.8,
                    vy: Math.sin(a) * p * 0.8,
                    r: CUE_R * 0.8, num: 0, mass: 0.8,
                    isCue: true, isExtra: true
                });
            }
        }
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

    function spawnMushroomDebris(x, y, golden) {
        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = randRange(1.5, 3.5);
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                r: randRange(3, 6),
                color: golden ? CLR_MUSH_GOLD : CLR_MUSH_CAP,
                life: randRange(30, 50),
                maxLife: 50,
                isDebris: true,
                sprite: golden ? 'starGold' : ['debris1', 'debris2', 'debris3'][randInt(0, 2)]
            });
        }
    }

    function spawnExplosion(x, y) {
        explosions.push({
            x, y, r: 5, maxR: 50,
            life: 30, maxLife: 30
        });
        screenShake = 12;
        spawnParticles(x, y, 20, '#F97316');
        spawnParticles(x, y, 10, '#EF4444');
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
        scorePopups.push({
            x, y, text: '+' + pts,
            life: 50, vy: -1.5,
            color: pts >= 300 ? '#FBBF24' : pts >= 200 ? '#F97316' : '#FFF'
        });
    }

    // ═══════════════════════════════════════════
    //  LEVEL SETUP
    // ═══════════════════════════════════════════
    function startLevel() {
        const segCount = clamp(12 + level * 2, 12, 32);
        totalSegments = segCount;
        segmentsCleared = 0;
        comboCount = 0;
        frameCount = 0;
        freeBalls = [];
        particles = [];
        scorePopups = [];
        powerups = [];
        explosions = [];
        activePowerup = null;
        powerupTimer = 0;

        pocketAnims = [];
        createPockets();
        createMushrooms();

        // Create initial chain(s)
        chains = [];
        if (level <= 3) {
            chains.push(createChain(segCount, RAIL_W + 40, RAIL_W + 40, 1));
        } else if (level <= 6) {
            const half = Math.floor(segCount / 2);
            chains.push(createChain(half, RAIL_W + 40, RAIL_W + 40, 1));
            chains.push(createChain(segCount - half, GAME_W - RAIL_W - 40, RAIL_W + 70, -1));
        } else {
            const third = Math.floor(segCount / 3);
            chains.push(createChain(third, RAIL_W + 40, RAIL_W + 40, 1));
            chains.push(createChain(third, GAME_W - RAIL_W - 40, RAIL_W + 70, -1));
            chains.push(createChain(segCount - 2 * third, GAME_W / 2, RAIL_W + 100, 1));
        }

        totalSegments = chains.reduce((s, c) => s + c.segs.length, 0);

        resetCueBall();
        state = ST_AIMING;
    }

    // ═══════════════════════════════════════════
    //  UPDATE
    // ═══════════════════════════════════════════
    function update(dt) {
        frameCount++;

        // Powerup timer
        if (activePowerup !== null) {
            powerupTimer -= dt * 1000;
            if (powerupTimer <= 0) {
                activePowerup = null;
                if (cueBall) { cueBall.r = CUE_R; cueBall.mass = 1; }
            }
        }

        if (state === ST_AIMING) {
            // Chains still move while aiming
            for (const chain of chains) updateChain(chain, dt);
            // Keyboard aiming
            if (keys_pressed['ArrowLeft'] || keys_pressed['a']) mouseX -= 3;
            if (keys_pressed['ArrowRight'] || keys_pressed['d']) mouseX += 3;
            if (keys_pressed['ArrowUp'] || keys_pressed['w']) mouseY -= 3;
            if (keys_pressed['ArrowDown'] || keys_pressed['s']) mouseY += 3;
            mouseX = clamp(mouseX, RAIL_W, GAME_W - RAIL_W);
            mouseY = clamp(mouseY, RAIL_W, GAME_H - RAIL_W);
        }

        if (state === ST_SHOOTING || state === ST_RESOLVING) {
            // Update chains
            for (const chain of chains) updateChain(chain, dt);

            // Update cue ball
            if (cueBall && !cueScratch) {
                cueBall.x += cueBall.vx;
                cueBall.y += cueBall.vy;
                applyFriction(cueBall);
                wallBounce(cueBall);
                mushroomBounce(cueBall);
                checkBallChainCollisions(cueBall);

                // Check pocket (scratch)
                const p = checkPocket(cueBall);
                if (p) {
                    sfxScratch();
                    cueScratch = true;
                    spawnPocketSwirl(p.x, p.y, CLR_CUE);
                    addPocketAnim(p.x, p.y, 0, true);
                    addScore(-50, p.x, p.y);
                }
            }

            // Update free balls
            for (let i = freeBalls.length - 1; i >= 0; i--) {
                const b = freeBalls[i];
                b.x += b.vx;
                b.y += b.vy;
                applyFriction(b);
                wallBounce(b);
                mushroomBounce(b);

                // Free ball hits chain = CHAIN REACTION
                if (b.fromChain && ballSpeed(b) > 1) {
                    checkBallChainCollisions(b);
                }

                // Ball-ball collisions among free balls
                for (let j = i + 1; j < freeBalls.length; j++) {
                    const b2 = freeBalls[j];
                    if (dist(b.x, b.y, b2.x, b2.y) < b.r + b2.r) {
                        resolveCollision(b, b2, BALL_COR);
                        sfxBallClick();
                    }
                }

                // Cue ball vs free ball collision
                if (cueBall && !cueScratch && dist(b.x, b.y, cueBall.x, cueBall.y) < b.r + cueBall.r) {
                    resolveCollision(cueBall, b, BALL_COR);
                    sfxBallClick();
                }

                // Check pocket
                const p = checkPocket(b);
                if (p) {
                    sfxPocketThud();
                    addScore(200, b.x, b.y);
                    spawnPocketSwirl(p.x, p.y, BALL_COLORS[b.num] || '#FFF');
                    addPocketAnim(p.x, p.y, b.num, false);
                    freeBalls.splice(i, 1);
                    continue;
                }

                // Collect powerups
                for (let pi = powerups.length - 1; pi >= 0; pi--) {
                    const pu = powerups[pi];
                    if (dist(b.x, b.y, pu.x, pu.y) < b.r + pu.r) {
                        collectPowerup(pu);
                        powerups.splice(pi, 1);
                    }
                }
            }

            // Cue ball collects powerups
            if (cueBall && !cueScratch) {
                for (let pi = powerups.length - 1; pi >= 0; pi--) {
                    const pu = powerups[pi];
                    if (dist(cueBall.x, cueBall.y, pu.x, pu.y) < cueBall.r + pu.r) {
                        collectPowerup(pu);
                        powerups.splice(pi, 1);
                        if (activePowerup === PW_MEGA) {
                            cueBall.r = CUE_R * 1.5;
                            cueBall.mass = 2.0;
                        }
                    }
                }
            }

            // Check if all balls have stopped
            let anyMoving = false;
            if (cueBall && !cueScratch && ballMoving(cueBall)) anyMoving = true;
            for (const b of freeBalls) { if (ballMoving(b)) { anyMoving = true; break; } }

            if (!anyMoving && state === ST_SHOOTING) {
                state = ST_RESOLVING;
            }

            if (state === ST_RESOLVING && !anyMoving) {
                // Clean up stopped free balls (remove them from play)
                freeBalls = freeBalls.filter(b => ballMoving(b));

                // Check level clear
                const totalRemaining = chains.reduce((s, c) => s + c.segs.length, 0);
                if (totalRemaining === 0) {
                    state = ST_LEVEL_CLEAR;
                    levelClearTimer = 180;
                    sfxLevelClear();
                    addScore(500 + level * 200, GAME_W / 2, GAME_H / 2);
                } else {
                    // Return cue ball for next shot
                    if (cueScratch) {
                        lives--;
                        if (lives <= 0) {
                            state = ST_GAMEOVER;
                            return;
                        }
                    }
                    freeBalls = [];
                    resetCueBall();
                    state = ST_AIMING;
                }
            }
        }

        if (state === ST_LEVEL_CLEAR) {
            levelClearTimer--;
            if (levelClearTimer <= 0) {
                level++;
                if (level > 10) {
                    // Victory — restart with higher score base
                    level = 1;
                    addScore(5000, GAME_W / 2, GAME_H / 2);
                }
                startLevel();
            }
        }

        // Update powerups (float/bob)
        for (let i = powerups.length - 1; i >= 0; i--) {
            const pu = powerups[i];
            pu.y += pu.vy;
            pu.bobT += 0.08;
            pu.life--;
            if (pu.life <= 0 || pu.y > GAME_H - RAIL_W) {
                powerups.splice(i, 1);
            }
        }

        // Update explosions
        for (let i = explosions.length - 1; i >= 0; i--) {
            const e = explosions[i];
            e.r += (e.maxR - e.r) * 0.15;
            e.life--;
            if (e.life <= 0) explosions.splice(i, 1);
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

        // Mushroom hit flash decay
        for (const m of mushrooms) {
            if (m.hitFlash > 0) m.hitFlash--;
            m.shakeX *= 0.8; m.shakeY *= 0.8;
        }

        // Update pocket animations
        updatePocketAnims();

        // Screen shake decay
        if (screenShake > 0) screenShake *= 0.88;
        if (screenShake < 0.5) screenShake = 0;
    }

    // ═══════════════════════════════════════════
    //  DRAW
    // ═══════════════════════════════════════════
    function draw() {
        ctx.save();
        ctx.setTransform(SCALE * DPR, 0, 0, SCALE * DPR, 0, 0);

        // Screen shake
        if (screenShake > 0) {
            ctx.translate(randRange(-screenShake, screenShake), randRange(-screenShake, screenShake));
        }

        drawTable();
        drawFeltLines();
        drawPockets();
        drawPocketAnims();
        drawMushrooms();
        drawBallTrails();
        drawChains();
        drawFreeBalls();
        drawExplosions();
        drawPowerups();
        if (cueBall && !cueScratch) drawCueBall();
        if (state === ST_AIMING) drawAimLine();
        drawParticles();
        drawScorePopups();
        drawComboText();
        drawLevelIntro();
        drawHUD();

        if (state === ST_TITLE) drawTitleScreen();
        if (state === ST_LEVEL_CLEAR) drawLevelClear();
        if (state === ST_GAMEOVER) drawGameOver();

        ctx.restore();
    }

    function drawTable() {
        // Felt background with gradient
        const feltGrd = ctx.createRadialGradient(GAME_W / 2, GAME_H / 2, 50, GAME_W / 2, GAME_H / 2, 400);
        feltGrd.addColorStop(0, CLR_FELT);
        feltGrd.addColorStop(1, CLR_FELT2);
        ctx.fillStyle = feltGrd;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Felt texture (subtle dots)
        ctx.fillStyle = 'rgba(0,0,0,0.03)';
        for (let i = 0; i < 200; i++) {
            const fx = (i * 97.3) % GAME_W;
            const fy = (i * 143.7) % GAME_H;
            ctx.fillRect(fx, fy, 1, 1);
        }

        // Rails
        ctx.fillStyle = CLR_RAIL;
        // Top
        roundRect(ctx, 0, 0, GAME_W, RAIL_W, 4); ctx.fill();
        // Bottom
        roundRect(ctx, 0, GAME_H - RAIL_W, GAME_W, RAIL_W, 4); ctx.fill();
        // Left
        roundRect(ctx, 0, 0, RAIL_W, GAME_H, 4); ctx.fill();
        // Right
        roundRect(ctx, GAME_W - RAIL_W, 0, RAIL_W, GAME_H, 4); ctx.fill();

        // Rail inner edge highlight
        ctx.strokeStyle = CLR_RAIL_EDGE;
        ctx.lineWidth = 2;
        ctx.strokeRect(RAIL_W, RAIL_W, GAME_W - 2 * RAIL_W, GAME_H - 2 * RAIL_W);

        // Rail bevel highlights (wood grain effect)
        ctx.strokeStyle = 'rgba(255,220,150,0.15)';
        ctx.lineWidth = 1;
        // Top rail bevel
        ctx.beginPath(); ctx.moveTo(RAIL_W, 3); ctx.lineTo(GAME_W - RAIL_W, 3); ctx.stroke();
        // Bottom rail bevel
        ctx.beginPath(); ctx.moveTo(RAIL_W, GAME_H - 3); ctx.lineTo(GAME_W - RAIL_W, GAME_H - 3); ctx.stroke();
        // Left rail bevel
        ctx.beginPath(); ctx.moveTo(3, RAIL_W); ctx.lineTo(3, GAME_H - RAIL_W); ctx.stroke();
        // Right rail bevel
        ctx.beginPath(); ctx.moveTo(GAME_W - 3, RAIL_W); ctx.lineTo(GAME_W - 3, GAME_H - RAIL_W); ctx.stroke();

        // Inner cushion rubber (green rubber under the rail lip)
        ctx.fillStyle = '#2D8B4E';
        ctx.fillRect(RAIL_W, RAIL_W, GAME_W - 2 * RAIL_W, 3); // top
        ctx.fillRect(RAIL_W, GAME_H - RAIL_W - 3, GAME_W - 2 * RAIL_W, 3); // bottom
        ctx.fillRect(RAIL_W, RAIL_W, 3, GAME_H - 2 * RAIL_W); // left
        ctx.fillRect(GAME_W - RAIL_W - 3, RAIL_W, 3, GAME_H - 2 * RAIL_W); // right

        // Diamond sights on rails
        ctx.fillStyle = '#D4A54A';
        const diamonds = [0.2, 0.35, 0.5, 0.65, 0.8];
        for (const d of diamonds) {
            // Top rail
            drawDiamond(GAME_W * d, RAIL_W / 2, 3);
            // Bottom rail
            drawDiamond(GAME_W * d, GAME_H - RAIL_W / 2, 3);
            // Left rail
            drawDiamond(RAIL_W / 2, GAME_H * d, 3);
            // Right rail
            drawDiamond(GAME_W - RAIL_W / 2, GAME_H * d, 3);
        }

        // Corner ornaments
        ctx.fillStyle = '#D4A54A';
        const cornerR = 5;
        ctx.beginPath(); ctx.arc(RAIL_W + 8, RAIL_W + 8, cornerR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(GAME_W - RAIL_W - 8, RAIL_W + 8, cornerR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(RAIL_W + 8, GAME_H - RAIL_W - 8, cornerR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(GAME_W - RAIL_W - 8, GAME_H - RAIL_W - 8, cornerR, 0, Math.PI * 2); ctx.fill();
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
            // Pocket shadow
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R + 3, 0, Math.PI * 2);
            ctx.fill();

            // Pocket hole
            const pGrd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, POCKET_R);
            pGrd.addColorStop(0, '#000');
            pGrd.addColorStop(0.8, '#111');
            pGrd.addColorStop(1, '#333');
            ctx.fillStyle = pGrd;
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R, 0, Math.PI * 2);
            ctx.fill();

            // Pocket rim
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    function drawMushrooms() {
        for (const m of mushrooms) {
            const ox = m.shakeX, oy = m.shakeY;
            const flash = m.hitFlash > 0;
            const hpRatio = m.hp / MUSH_HP_MAX;

            ctx.save();
            ctx.translate(m.x + ox, m.y + oy);

            // Mushroom body (stem)
            ctx.fillStyle = flash ? '#FFF' : CLR_MUSH_STEM;
            roundRect(ctx, -5, -2, 10, m.r, 3);
            ctx.fill();

            // Mushroom cap
            const capColor = m.golden ? CLR_MUSH_GOLD : (flash ? '#FFF' : CLR_MUSH_CAP);
            ctx.fillStyle = capColor;
            ctx.beginPath();
            ctx.arc(0, -2, m.r * 0.85, Math.PI, 0);
            ctx.closePath();
            ctx.fill();

            // Cap spots
            if (!m.golden) {
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.beginPath(); ctx.arc(-3, -6, 2.5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(4, -4, 2, 0, Math.PI * 2); ctx.fill();
            } else {
                // Golden shimmer
                ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + 0.2 * Math.sin(frameCount * 0.1)) + ')';
                ctx.beginPath(); ctx.arc(0, -5, 4, 0, Math.PI * 2); ctx.fill();
            }

            // HP indicator (darken as damaged)
            if (hpRatio < 1) {
                ctx.fillStyle = `rgba(0,0,0,${0.3 * (1 - hpRatio)})`;
                ctx.beginPath();
                ctx.arc(0, -2, m.r * 0.85, Math.PI, 0);
                ctx.closePath();
                ctx.fill();
            }

            // Hit glow
            if (flash) {
                ctx.fillStyle = `rgba(255,255,255,${m.hitFlash / 10})`;
                ctx.beginPath();
                ctx.arc(0, 0, m.r + 4, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
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

        // White ball with subtle blue tint
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

    function drawBilliardBall(bx, by, r, num, highlight) {
        const cached = ballCanvasCache[num];
        if (!cached) return;

        const drawSize = r * 2;
        ctx.save();
        ctx.translate(bx, by);

        // Subtle rolling rotation
        if (num > 0) {
            ctx.rotate(Math.sin((bx + by) * 0.04) * 0.05);
        }

        ctx.drawImage(cached, -drawSize / 2 - 0.5, -drawSize / 2 - 0.5, drawSize + 1, drawSize + 1);

        // Head highlight for chain leader
        if (highlight) {
            ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.2 * Math.sin(frameCount * 0.1)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
            ctx.stroke();
        }

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

    function drawChains() {
        for (const chain of chains) {
            // Draw connecting links
            ctx.strokeStyle = CLR_CHAIN_LINK;
            ctx.lineWidth = 2;
            for (let i = 1; i < chain.segs.length; i++) {
                const a = chain.segs[i - 1], b = chain.segs[i];
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
            // Draw balls
            for (let i = chain.segs.length - 1; i >= 0; i--) {
                const s = chain.segs[i];
                drawBilliardBall(s.x, s.y, s.r, s.num, i === 0);
            }
        }
    }

    function drawFreeBalls() {
        for (const b of freeBalls) {
            if (b.isCue && b.isExtra) {
                drawCueBallAt(b.x, b.y, b.r);
            } else {
                drawBilliardBall(b.x, b.y, b.r, b.num, false);
            }
            // Motion trail
            if (ballSpeed(b) > 2) {
                const alpha = clamp(ballSpeed(b) / 15, 0.05, 0.3);
                ctx.fillStyle = `rgba(255,255,255,${alpha})`;
                ctx.beginPath();
                ctx.arc(b.x - b.vx * 2, b.y - b.vy * 2, b.r * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function drawCueBall() {
        drawCueBallAt(cueBall.x, cueBall.y, cueBall.r);
    }

    function drawCueBallAt(bx, by, r) {
        const cached = ballCanvasCache['cue'];
        if (!cached) return;

        const drawSize = r * 2;
        ctx.save();
        ctx.translate(bx, by);
        ctx.drawImage(cached, -drawSize / 2 - 0.5, -drawSize / 2 - 0.5, drawSize + 1, drawSize + 1);

        // Mega glow
        if (activePowerup === PW_MEGA) {
            ctx.strokeStyle = `rgba(249,115,22,${0.5 + 0.3 * Math.sin(frameCount * 0.15)})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
            ctx.stroke();
        }

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

        // Project line forward
        const projLen = 200;
        const endX = cueBall.x + nx * projLen;
        const endY = cueBall.y + ny * projLen;
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Aim direction indicator (arrowhead)
        const arrowDist = 40;
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

            // Cue stick
            ctx.strokeStyle = '#C4956A';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(stickStartX, stickStartY);
            ctx.lineTo(stickEndX, stickEndY);
            ctx.stroke();

            // Tip
            ctx.strokeStyle = '#E8DFD0';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(stickStartX, stickStartY);
            ctx.lineTo(stickStartX - nx * 8, stickStartY - ny * 8);
            ctx.stroke();
        }
    }

    function drawExplosions() {
        for (const e of explosions) {
            const alpha = e.life / e.maxLife;
            const grd = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);
            grd.addColorStop(0, `rgba(255,200,50,${alpha * 0.8})`);
            grd.addColorStop(0.5, `rgba(255,100,20,${alpha * 0.5})`);
            grd.addColorStop(1, `rgba(200,30,0,0)`);
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
            ctx.fill();

            // Fire sprites
            if (sprites.fire0 && sprites.fire0.complete) {
                const fireSprites = [sprites.fire0, sprites.fire1, sprites.fire2, sprites.fire3];
                const fi = Math.floor((1 - e.life / e.maxLife) * fireSprites.length);
                const fs = fireSprites[clamp(fi, 0, 3)];
                if (fs && fs.complete) {
                    ctx.globalAlpha = alpha;
                    ctx.drawImage(fs, e.x - e.r * 0.6, e.y - e.r * 0.6, e.r * 1.2, e.r * 1.2);
                    ctx.globalAlpha = 1;
                }
            }
        }
    }

    function drawPowerups() {
        for (const pu of powerups) {
            const bob = Math.sin(pu.bobT) * 3;
            const alpha = pu.life < 60 ? pu.life / 60 : 1;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(pu.x, pu.y + bob);

            // Glow
            ctx.fillStyle = PW_COLORS[pu.type] + '40';
            ctx.beginPath();
            ctx.arc(0, 0, pu.r + 5, 0, Math.PI * 2);
            ctx.fill();

            // Icon
            const gemSprites = [sprites.gemRed, sprites.gemBlue, sprites.gemYellow, sprites.gemGreen];
            const gs = gemSprites[pu.type];
            if (gs && gs.complete) {
                ctx.drawImage(gs, -pu.r, -pu.r, pu.r * 2, pu.r * 2);
            } else {
                ctx.fillStyle = PW_COLORS[pu.type];
                ctx.beginPath();
                ctx.arc(0, 0, pu.r, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = p.life / (p.maxLife || 40);
            if (p.isDebris && p.sprite && sprites[p.sprite] && sprites[p.sprite].complete) {
                ctx.globalAlpha = alpha;
                ctx.drawImage(sprites[p.sprite], p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
                ctx.globalAlpha = 1;
            } else {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }
    }

    function drawScorePopups() {
        for (const sp of scorePopups) {
            const alpha = sp.life / 50;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = sp.color;
            ctx.font = `bold ${sp.text.includes('500') || sp.text.includes('1000') ? 18 : 14}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(sp.text, sp.x, sp.y);
            ctx.globalAlpha = 1;
        }
    }

    function drawHUD() {
        const pad = 6;
        // Top bar background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, RAIL_W + 2, RAIL_W + 2, GAME_W - 2 * RAIL_W - 4, 22, 4);
        ctx.fill();

        ctx.font = 'bold 12px Arial, sans-serif';
        ctx.textBaseline = 'middle';
        const ty = RAIL_W + 13;

        // Score
        ctx.fillStyle = CLR_HUD;
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE: ${score}`, RAIL_W + pad + 4, ty);

        // Level
        ctx.textAlign = 'center';
        ctx.fillText(`LEVEL ${level}`, GAME_W / 2, ty);

        // Lives (hearts)
        ctx.textAlign = 'right';
        const livesStr = '\u2764'.repeat(Math.max(lives, 0));
        ctx.fillStyle = '#EF4444';
        ctx.fillText(livesStr, GAME_W - RAIL_W - pad - 4, ty);

        // Hi Score
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '9px Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`HI: ${highScore}`, GAME_W - RAIL_W - pad - 4, ty + 14);

        // Active powerup indicator
        if (activePowerup !== null) {
            const ptLeft = RAIL_W + 4;
            const ptTop = GAME_H - RAIL_W - 24;
            ctx.fillStyle = PW_COLORS[activePowerup] + '80';
            roundRect(ctx, ptLeft, ptTop, 80, 18, 4);
            ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.font = 'bold 10px Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(PW_NAMES[activePowerup] + ' ' + Math.ceil(powerupTimer / 1000) + 's', ptLeft + 6, ptTop + 10);
        }

        // Segments remaining
        const remaining = chains.reduce((s, c) => s + c.segs.length, 0);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '9px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Segments: ${remaining}`, RAIL_W + pad + 4, ty + 14);
    }

    function drawTitleScreen() {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Title
        ctx.fillStyle = '#FBBF24';
        ctx.font = 'bold 42px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CENTIBALLS', GAME_W / 2, GAME_H * 0.25);

        // Subtitle
        ctx.fillStyle = '#94A3B8';
        ctx.font = '16px Arial, sans-serif';
        ctx.fillText('Centipede urgency + pool satisfaction', GAME_W / 2, GAME_H * 0.33);

        // Decorative balls
        const demoNums = [1, 3, 5, 8, 11, 14];
        for (let i = 0; i < demoNums.length; i++) {
            const angle = frameCount * 0.01 + (i / demoNums.length) * Math.PI * 2;
            const bx = GAME_W / 2 + Math.cos(angle) * 80;
            const by = GAME_H * 0.48 + Math.sin(angle) * 30;
            drawBilliardBall(bx, by, 14, demoNums[i], false);
        }

        // Instructions
        ctx.fillStyle = '#E0E7FF';
        ctx.font = '13px Arial, sans-serif';
        const instructions = [
            'The chain descends \u2014 stop it before it reaches you!',
            'Shoot the cue ball to break segments loose',
            'Pot freed balls into pockets for bonus points',
            'Mushrooms deflect balls AND turn the chain',
            '',
            'Click/drag to aim \u2014 release to shoot',
            'Arrow keys or WASD to fine-tune aim'
        ];
        instructions.forEach((line, i) => {
            ctx.fillText(line, GAME_W / 2, GAME_H * 0.62 + i * 20);
        });

        // Start prompt
        const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.06);
        ctx.fillStyle = `rgba(251,191,36,${pulse})`;
        ctx.font = 'bold 18px Arial, sans-serif';
        ctx.fillText('CLICK TO START', GAME_W / 2, GAME_H * 0.88);
    }

    function drawLevelClear() {
        const alpha = clamp(1 - levelClearTimer / 180, 0, 1);
        ctx.fillStyle = `rgba(0,0,0,${alpha * 0.5})`;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.fillStyle = '#22C55E';
        ctx.font = 'bold 36px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = alpha;
        ctx.fillText('LEVEL CLEAR!', GAME_W / 2, GAME_H * 0.4);

        ctx.fillStyle = '#FBBF24';
        ctx.font = '20px Arial, sans-serif';
        ctx.fillText(`+${500 + level * 200} BONUS`, GAME_W / 2, GAME_H * 0.5);

        ctx.globalAlpha = 1;
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 40px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GAME OVER', GAME_W / 2, GAME_H * 0.3);

        ctx.fillStyle = '#E0E7FF';
        ctx.font = '20px Arial, sans-serif';
        ctx.fillText(`Score: ${score}`, GAME_W / 2, GAME_H * 0.4);
        ctx.fillText(`Level: ${level}`, GAME_W / 2, GAME_H * 0.47);
        ctx.fillText(`Shots Fired: ${shotsFired}`, GAME_W / 2, GAME_H * 0.54);

        // Accuracy stat
        if (shotsFired > 0) {
            const acc = Math.round((segmentsCleared / Math.max(shotsFired, 1)) * 100);
            ctx.fillStyle = '#94A3B8';
            ctx.font = '14px Arial, sans-serif';
            ctx.fillText(`Accuracy: ${acc}% segments/shot`, GAME_W / 2, GAME_H * 0.60);
        }

        if (score >= highScore && score > 0) {
            ctx.fillStyle = '#FBBF24';
            ctx.font = 'bold 16px Arial, sans-serif';
            const shimmer = 0.7 + 0.3 * Math.sin(frameCount * 0.1);
            ctx.globalAlpha = shimmer;
            ctx.fillText('NEW HIGH SCORE!', GAME_W / 2, GAME_H * 0.67);
            ctx.globalAlpha = 1;
        }

        const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.06);
        ctx.fillStyle = `rgba(251,191,36,${pulse})`;
        ctx.font = 'bold 18px Arial, sans-serif';
        ctx.fillText('CLICK TO RESTART', GAME_W / 2, GAME_H * 0.80);
    }

    // Level names for flavor text
    const LEVEL_NAMES = [
        '', 'The Break', 'Corner Pocket', 'Mushroom Mayhem',
        'Double Trouble', 'Chain Lightning', 'Full Rack',
        'Bumper Frenzy', 'Split Decision', 'Eight Ball',
        'The Final Table'
    ];

    function drawComboText() {
        if (comboCount > 1 && (state === ST_SHOOTING || state === ST_RESOLVING)) {
            const alpha = Math.min(1, comboCount * 0.3);
            const size = 24 + comboCount * 4;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = comboCount >= 4 ? '#EF4444' : comboCount >= 3 ? '#F97316' : '#FBBF24';
            ctx.font = `bold ${clamp(size, 24, 48)}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const bounce = Math.sin(frameCount * 0.15) * 5;
            ctx.fillText(`${comboCount}x COMBO!`, GAME_W / 2, GAME_H * 0.2 + bounce);
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    function drawLevelIntro() {
        // Brief level name flash during first frames of aiming
        if (state === ST_AIMING && frameCount < 120) {
            const alpha = clamp(1 - frameCount / 120, 0, 1);
            ctx.save();
            ctx.globalAlpha = alpha * 0.8;
            ctx.fillStyle = '#FBBF24';
            ctx.font = 'bold 28px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Level ${level}`, GAME_W / 2, GAME_H * 0.4);
            if (LEVEL_NAMES[level]) {
                ctx.fillStyle = '#E0E7FF';
                ctx.font = '16px Arial, sans-serif';
                ctx.fillText(LEVEL_NAMES[level], GAME_W / 2, GAME_H * 0.46);
            }
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    function drawBallTrails() {
        // Draw motion trails for fast-moving balls
        const allBalls = [...freeBalls];
        if (cueBall && !cueScratch) allBalls.push(cueBall);
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

    // Pocket swallow animations (balls spiraling into pocket)
    let pocketAnims = [];
    function addPocketAnim(x, y, num, isCue) {
        pocketAnims.push({
            x, y, num, isCue,
            r: isCue ? CUE_R : BALL_R,
            angle: 0, shrink: 1,
            life: 25, maxLife: 25
        });
    }

    function updatePocketAnims() {
        for (let i = pocketAnims.length - 1; i >= 0; i--) {
            const pa = pocketAnims[i];
            pa.life--;
            pa.angle += 0.4;
            pa.shrink = pa.life / pa.maxLife;
            if (pa.life <= 0) pocketAnims.splice(i, 1);
        }
    }

    function drawPocketAnims() {
        for (const pa of pocketAnims) {
            const ox = Math.cos(pa.angle) * POCKET_R * 0.3 * pa.shrink;
            const oy = Math.sin(pa.angle) * POCKET_R * 0.3 * pa.shrink;
            const drawR = pa.r * pa.shrink;
            if (drawR < 1) continue;
            ctx.globalAlpha = pa.shrink;
            if (pa.isCue) {
                drawCueBallAt(pa.x + ox, pa.y + oy, drawR);
            } else {
                drawBilliardBall(pa.x + ox, pa.y + oy, drawR, pa.num, false);
            }
            ctx.globalAlpha = 1;
        }
    }

    function drawFeltLines() {
        // Subtle diamond/guide markings on felt (like a real table)
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 0.5;
        // Headstring line
        const headY = GAME_H - RAIL_W - 120;
        ctx.beginPath();
        ctx.moveTo(RAIL_W + 10, headY);
        ctx.lineTo(GAME_W - RAIL_W - 10, headY);
        ctx.stroke();
        // Center spot
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.arc(GAME_W / 2, GAME_H / 2, 3, 0, Math.PI * 2);
        ctx.fill();
        // Foot spot
        ctx.beginPath();
        ctx.arc(GAME_W / 2, RAIL_W + 120, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // ═══════════════════════════════════════════
    //  GAME LOOP
    // ═══════════════════════════════════════════
    function gameLoop(ts) {
        if (!gameActive) return;
        const dt = Math.min((ts - (lastTime || ts)) / 1000, 0.05);
        lastTime = ts;

        if (state !== ST_TITLE && state !== ST_GAMEOVER) {
            update(dt);
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
        const cx = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const cy = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
        return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
    }

    function onMouseDown(e) {
        e.preventDefault();
        ensureAudio();
        const pos = getCanvasPos(e);
        mouseX = pos.x; mouseY = pos.y;

        if (state === ST_TITLE) {
            score = 0; level = 1; lives = 3; shotsFired = 0;
            startLevel();
            return;
        }
        if (state === ST_GAMEOVER) {
            if (gameOverCB) gameOverCB(score);
            score = 0; level = 1; lives = 3; shotsFired = 0;
            startLevel();
            return;
        }
        if (state === ST_AIMING && cueBall) {
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
        if (!isAiming || state !== ST_AIMING || !cueBall) {
            isAiming = false;
            return;
        }
        isAiming = false;
        const pos = getCanvasPos(e);
        const dx = cueBall.x - pos.x;
        const dy = cueBall.y - pos.y;
        const pullDist = Math.sqrt(dx * dx + dy * dy);
        if (pullDist < 10) return; // too small, ignore

        const power = clamp(pullDist / 30, MIN_SHOT_POWER / MAX_SHOT_POWER, 1) * MAX_SHOT_POWER;
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
        // Use changedTouches for the end position
        const touch = e.changedTouches ? e.changedTouches[0] : e;
        onMouseUp(touch);
    }

    function onKeyDown(e) {
        keys_pressed[e.key] = true;
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (state === ST_TITLE) {
                score = 0; level = 1; lives = 3; shotsFired = 0;
                startLevel();
            } else if (state === ST_GAMEOVER) {
                if (gameOverCB) gameOverCB(score);
                score = 0; level = 1; lives = 3; shotsFired = 0;
                startLevel();
            } else if (state === ST_AIMING && cueBall) {
                // Shoot in aim direction with medium power
                const dx = cueBall.x - mouseX;
                const dy = cueBall.y - mouseY;
                shoot(dx, dy, MAX_SHOT_POWER * 0.6);
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
        level = 1;
        lives = 3;
        shotsFired = 0;
        frameCount = 0;
        screenShake = 0;
        comboCount = 0;
        activePowerup = null;
        powerupTimer = 0;
        chains = [];
        freeBalls = [];
        mushrooms = [];
        particles = [];
        scorePopups = [];
        powerups = [];
        explosions = [];
        pockets = [];
        cueBall = null;
        cueScratch = false;
        isAiming = false;
        keys_pressed = {};

        playerColor = (player && player.color) || '#3B82F6';

        // Theme integration
        const _t = (window.ThemeEngine && ThemeEngine.getCurrentTheme) ? ThemeEngine.getCurrentTheme() : null;
        if (_t && _t.colors && _t.colors.length >= 4) {
            playerColor = _t.colors[0] || playerColor;
        }

        loadSprites();

        // Pre-render hi-res ball sprites
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
        chains = [];
        freeBalls = [];
        particles = [];
        scorePopups = [];
        powerups = [];
        explosions = [];
        pocketAnims = [];
    }

    return { init, destroy };
})();
