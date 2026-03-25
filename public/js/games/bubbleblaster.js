/* YWA Bubble Blaster — Bubble Bobble meets shooter with Kenney CC0 sprites: trap enemies, chain-pop for combos */
window.BubbleBlaster = (() => {
    // ── Sprite Atlas (Kenney CC0) ──
    const __sprites = {};
    let __spritesLoaded = 0, __spritesTotal = 0, __allSpritesReady = false;
    const __SPRITE_MANIFEST = {
        bubbleRed: '/img/game-assets/kenney-physics/aliens/alienPink_round.png',
        bubbleBlue: '/img/game-assets/kenney-physics/aliens/alienBlue_round.png',
        bubbleGreen: '/img/game-assets/kenney-physics/aliens/alienGreen_round.png',
        bubbleYellow: '/img/game-assets/kenney-physics/aliens/alienYellow_round.png',
        enemyBee: '/img/game-assets/kenney-platform/enemies/bee.png',
        enemySlime: '/img/game-assets/kenney-platform/enemies/slimeGreen.png',
        enemyFly: '/img/game-assets/kenney-platform/enemies/fly.png',
        enemyFrog: '/img/game-assets/kenney-platform/enemies/frog.png',
        fruit: '/img/game-assets/kenney-platform/items/coinGold.png',
        coin: '/img/game-assets/kenney-coins/coin_01.png',
        playerStand: '/img/game-assets/kenney-platform/players/Green/alienGreen_stand.png',
        playerWalk: '/img/game-assets/kenney-platform/players/Green/alienGreen_walk1.png',
        playerJump: '/img/game-assets/kenney-platform/players/Green/alienGreen_jump.png',
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
    const GRAVITY = 0.38, JUMP_VEL = -8.5, MAX_FALL = 9;
    const PLAYER_SPEED = 2.8, PLAYER_W = 22, PLAYER_H = 28;
    const BUBBLE_SPEED = 5, BUBBLE_R = 14, BUBBLE_FLOAT_SPD = 0.3;
    const BUBBLE_TRAP_TIME = 480; // frames before enemy escapes
    const CHAIN_MIN = 3;
    const COLORS = ['#EF4444','#3B82F6','#22C55E','#FBBF24']; // red, blue, green, yellow
    const COLOR_NAMES = ['red','blue','green','yellow'];
    const FRUIT_SCORES = [100, 200, 300, 500, 800, 1000, 1500, 2000];
    const FRUIT_TYPES = ['cherry','apple','melon','star','diamond','crown','cake','gem'];
    const INITIAL_LIVES = 3;
    const WAVES_PER_LEVEL = 10;
    const COMBO_TIMER_MAX = 120; // 2 seconds at 60fps
    const MERGE_RADIUS_MULT = 1.6; // merged bubble is this much bigger

    // Biome definitions for background transitions
    const BIOMES = [
        { name: 'forest',     bgTop: [120, 35, 15], bgBot: [140, 45, 8],  ambient: [120, 50, 60] },
        { name: 'cave',       bgTop: [270, 20, 10], bgBot: [280, 25, 5],  ambient: [270, 30, 50] },
        { name: 'sky',        bgTop: [200, 50, 25], bgBot: [210, 60, 15], ambient: [200, 60, 70] },
        { name: 'underwater', bgTop: [190, 55, 12], bgBot: [200, 65, 6],  ambient: [190, 50, 55] },
    ];

    // States
    const ST_TITLE = 0, ST_PLAY = 1, ST_DEAD = 2, ST_GAMEOVER = 3, ST_WAVE_INTRO = 4, ST_WIN = 5;

    // Game state
    let canvas, ctx, W, H, SCALE, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor, themeHue, startTime = 0;
    let state, frameCount, lastTime, keys = {};
    let score, lives, wave, level, combo;
    let player, bubbles, enemies, particles, scorePopups, fruits, ambientBubbles;
    let platforms, waveIntroTimer, deathTimer;
    let screenShake, chainFlash;
    let touchLeft, touchRight, touchJump, touchShoot, touchPop;
    let comboTimer, comboMultiplier; // combo timer system
    let thunderBubbleReady, thunderBubbleCooldown; // thunder bubble power-up
    let biomeTransition, currentBiome, targetBiome; // biome transitions

    // Audio
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
    function sfxShoot() { playSound(660, 0.08, 'sine', 0.1); playSound(880, 0.06, 'sine', 0.06); }
    function sfxTrap() { playSound(520, 0.15, 'sine', 0.12); setTimeout(() => playSound(780, 0.1, 'sine', 0.1), 80); }
    function sfxPop() { playSound(1000, 0.12, 'sine', 0.1); }
    function sfxChain(n) {
        for (let i = 0; i < Math.min(n, 6); i++)
            setTimeout(() => playSound(600 + i * 200, 0.2, 'sine', 0.15), i * 60);
    }
    function sfxDeath() { playSound(200, 0.4, 'sawtooth', 0.12); playSound(100, 0.5, 'sawtooth', 0.08); }
    function sfxJump() { playSound(400, 0.08, 'triangle', 0.07); }
    function sfxFruit() { playSound(1200, 0.1, 'sine', 0.1); }
    function sfxWave() { playSound(440, 0.15, 'sine', 0.1); setTimeout(() => playSound(660, 0.2, 'sine', 0.1), 120); }
    function sfxBoss() { playSound(80, 0.6, 'sawtooth', 0.15); }
    function sfxMerge() { playSound(800, 0.15, 'sine', 0.1); playSound(1000, 0.1, 'sine', 0.08); }
    function sfxThunder() {
        playSound(100, 0.5, 'sawtooth', 0.15);
        setTimeout(() => playSound(150, 0.3, 'sawtooth', 0.12), 100);
        setTimeout(() => playSound(1200, 0.2, 'sine', 0.1), 200);
    }
    function sfxBossAttack() { playSound(150, 0.3, 'sawtooth', 0.1); playSound(80, 0.4, 'triangle', 0.08); }
    function sfxSplit() { playSound(600, 0.1, 'sine', 0.08); playSound(800, 0.08, 'sine', 0.06); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const lerp = (a, b, t) => a + (b - a) * t;
    const rnd = (a, b) => Math.random() * (b - a) + a;
    const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const overlap = (ax, ay, aw, ah, bx, by, bw, bh) =>
        ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

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



    function hsl(h, s, l, a = 1) { return `hsla(${h},${s}%,${l}%,${a})`; }

    // ── Platform Generation ──
    function buildPlatforms() {
        platforms = [];
        // Floor
        platforms.push({ x: 0, y: GAME_H - 16, w: GAME_W, h: 16, floor: true });
        // Walls (thin, for bounce)
        platforms.push({ x: 0, y: 0, w: 8, h: GAME_H, wall: true });
        platforms.push({ x: GAME_W - 8, y: 0, w: 8, h: GAME_H, wall: true });
        // Ceiling
        platforms.push({ x: 0, y: 0, w: GAME_W, h: 12, ceiling: true });
        // Gameplay platforms — 4 rows, varied layouts per wave
        const seed = wave % 5;
        const layouts = [
            // Layout 0: symmetric shelves
            [[60,440,160,10],[260,440,160,10],[100,330,120,10],[260,330,120,10],[140,220,200,10]],
            // Layout 1: staircase
            [[40,450,100,10],[140,380,100,10],[260,310,100,10],[360,240,80,10],[160,170,160,10]],
            // Layout 2: U-shape
            [[40,420,100,10],[340,420,100,10],[80,300,320,10],[160,190,160,10]],
            // Layout 3: scattered
            [[60,460,80,10],[200,400,80,10],[340,460,80,10],[120,310,80,10],[280,310,80,10],[200,210,80,10]],
            // Layout 4: wide shelves
            [[40,430,400,10],[100,320,280,10],[160,210,160,10]]
        ];
        for (const [x, y, w, h] of layouts[seed]) {
            platforms.push({ x, y, w, h });
        }
    }

    // ── Player ──
    function resetPlayer() {
        player = {
            x: GAME_W / 2 - PLAYER_W / 2, y: GAME_H - 16 - PLAYER_H,
            vx: 0, vy: 0, w: PLAYER_W, h: PLAYER_H,
            onGround: false, facing: 1, shootCool: 0,
            invincible: 0, blinkTimer: 0, bubbleColor: 0,
            stunTimer: 0 // boss ground-pound stun
        };
    }

    function updatePlayer(dt) {
        if (player.stunTimer > 0) {
            player.stunTimer--;
            player.vy += GRAVITY;
            if (player.vy > MAX_FALL) player.vy = MAX_FALL;
            player.y += player.vy;
            // Still do platform collision while stunned
            player.onGround = false;
            for (const p of platforms) {
                if (p.wall || p.ceiling) continue;
                if (player.vy >= 0 &&
                    player.x + player.w > p.x && player.x < p.x + p.w &&
                    player.y + player.h >= p.y && player.y + player.h <= p.y + p.h + 8) {
                    player.y = p.y - player.h;
                    player.vy = 0;
                    player.onGround = true;
                }
            }
            return;
        }

        const spd = PLAYER_SPEED;
        player.vx = 0;
        if (keys['ArrowLeft'] || touchLeft) { player.vx = -spd; player.facing = -1; }
        if (keys['ArrowRight'] || touchRight) { player.vx = spd; player.facing = 1; }
        if ((keys['ArrowUp'] || touchJump) && player.onGround) {
            player.vy = JUMP_VEL;
            player.onGround = false;
            sfxJump();
        }
        if ((keys[' '] || touchShoot) && player.shootCool <= 0) {
            shootBubble();
            player.shootCool = 14;
        }
        if (keys['z'] || keys['Z'] || touchPop) popNearestBubble();
        // Thunder bubble (X key)
        if ((keys['x'] || keys['X']) && thunderBubbleReady && thunderBubbleCooldown <= 0) {
            activateThunderBubble();
        }

        player.vy += GRAVITY;
        if (player.vy > MAX_FALL) player.vy = MAX_FALL;
        player.x += player.vx;
        player.y += player.vy;
        player.shootCool--;
        if (player.invincible > 0) player.invincible--;
        player.blinkTimer++;

        // Wrap around sides
        if (player.x + player.w < 8) player.x = GAME_W - 8 - 1;
        if (player.x > GAME_W - 8) player.x = 8;

        // Platform collision
        player.onGround = false;
        for (const p of platforms) {
            if (p.wall || p.ceiling) continue;
            if (player.vy >= 0 &&
                player.x + player.w > p.x && player.x < p.x + p.w &&
                player.y + player.h >= p.y && player.y + player.h <= p.y + p.h + 8) {
                player.y = p.y - player.h;
                player.vy = 0;
                player.onGround = true;
            }
        }
    }

    // ── Thunder Bubble Power-Up ──
    function activateThunderBubble() {
        thunderBubbleReady = false;
        thunderBubbleCooldown = 600; // 10 second cooldown
        sfxThunder();
        screenShake = 15;
        chainFlash = 20;

        // Pick the most common bubble color on screen
        const counts = [0, 0, 0, 0];
        for (const b of bubbles) {
            if (b.floating) counts[b.color]++;
        }
        let bestColor = 0, bestCount = 0;
        for (let i = 0; i < 4; i++) {
            if (counts[i] > bestCount) { bestCount = counts[i]; bestColor = i; }
        }

        // Pop ALL bubbles of that color
        let popped = 0;
        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];
            if (b.color === bestColor && b.floating) {
                // Lightning bolt particle to each bubble
                for (let j = 0; j < 3; j++) {
                    particles.push({
                        x: b.x, y: b.y,
                        vx: rnd(-3, 3), vy: rnd(-4, 1),
                        life: rnd(20, 40), maxLife: 40,
                        r: rnd(2, 5), color: '#FBBF24', type: 'lightning'
                    });
                }
                spawnPopExplosion(b.x, b.y, COLORS[b.color]);
                const pts = b.trapped ? 400 : 100;
                score += pts;
                addScorePopup(b.x, b.y, pts, 0);
                bubbles.splice(i, 1);
                popped++;
            }
        }

        // Bonus for mass pop
        if (popped >= 3) {
            const bonus = popped * 200;
            score += bonus;
            addScorePopup(GAME_W / 2, GAME_H / 3, bonus, popped);
        }
    }

    // ── Bubbles ──
    function shootBubble() {
        const colorIdx = player.bubbleColor;
        bubbles.push({
            x: player.x + player.w / 2 + player.facing * 14,
            y: player.y + 6,
            vx: player.facing * BUBBLE_SPEED,
            vy: -1,
            r: BUBBLE_R,
            color: colorIdx,
            life: 600, // frames
            trapped: null,
            trapTimer: 0,
            floating: false,
            shimmer: rnd(0, 6.28),
            wobble: rnd(0, 6.28),
            mergeLevel: 0, // 0=normal, 1=merged (bigger, more points)
            popAnim: 0 // for pop animation
        });
        player.bubbleColor = (player.bubbleColor + 1) % COLORS.length;
        sfxShoot();
    }

    function updateBubbles(dt) {
        // Merge check: same-color floating bubbles touching
        for (let i = 0; i < bubbles.length; i++) {
            const a = bubbles[i];
            if (!a.floating || a.mergeLevel >= 1) continue;
            for (let j = i + 1; j < bubbles.length; j++) {
                const b = bubbles[j];
                if (!b.floating || b.mergeLevel >= 1 || b.color !== a.color) continue;
                if (dist(a, b) < (a.r + b.r) * 0.9) {
                    // Merge b into a
                    a.r = Math.min(a.r * MERGE_RADIUS_MULT, BUBBLE_R * 2.2);
                    a.mergeLevel = 1;
                    a.x = (a.x + b.x) / 2;
                    a.y = (a.y + b.y) / 2;
                    // If b had a trapped enemy, transfer
                    if (b.trapped && !a.trapped) {
                        a.trapped = b.trapped;
                        a.trapTimer = b.trapTimer;
                    } else if (b.trapped) {
                        // Release the extra enemy
                        const e = b.trapped;
                        e.x = b.x - e.w / 2;
                        e.y = b.y - e.h / 2;
                        e.trapped = false;
                        enemies.push(e);
                    }
                    spawnParticles(b.x, b.y, COLORS[b.color], 8);
                    sfxMerge();
                    bubbles.splice(j, 1);
                    j--;
                }
            }
        }

        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];
            b.shimmer += 0.08;
            b.wobble += 0.05;

            if (b.floating) {
                // Floating upward with wobble
                b.y -= BUBBLE_FLOAT_SPD;
                b.x += Math.sin(b.wobble) * 0.5;
                b.trapTimer++;
                if (b.y < -b.r * 2 || b.trapTimer > BUBBLE_TRAP_TIME) {
                    if (b.trapped) {
                        // Enemy escapes — angry!
                        const e = b.trapped;
                        e.x = b.x - e.w / 2;
                        e.y = b.y - e.h / 2;
                        e.angry = true;
                        e.speed *= 1.4;
                        e.trapped = false;
                        enemies.push(e);
                    }
                    bubbles.splice(i, 1);
                    continue;
                }
                // Wall bounce
                if (b.x - b.r < 8) b.x = 8 + b.r;
                if (b.x + b.r > GAME_W - 8) b.x = GAME_W - 8 - b.r;
            } else {
                b.x += b.vx;
                b.y += b.vy;
                b.vx *= 0.96;
                b.vy *= 0.96;
                b.life--;

                // Check enemy collisions
                for (let j = enemies.length - 1; j >= 0; j--) {
                    const e = enemies[j];
                    if (dist(b, { x: e.x + e.w / 2, y: e.y + e.h / 2 }) < b.r + 10) {
                        // Trap enemy
                        b.trapped = e;
                        b.floating = true;
                        b.trapTimer = 0;
                        b.vx = 0; b.vy = 0;
                        e.trapped = true;
                        enemies.splice(j, 1);
                        sfxTrap();
                        spawnParticles(b.x, b.y, COLORS[b.color], 6);
                        break;
                    }
                }
                // Wall/ceiling bounce
                if (b.x - b.r < 8 || b.x + b.r > GAME_W - 8) b.vx *= -0.5;
                if (b.y - b.r < 12) { b.vy = Math.abs(b.vy) * 0.3; b.y = 12 + b.r; }
                // Become floating after slowing down
                if (Math.abs(b.vx) < 0.3 && Math.abs(b.vy) < 0.3 && !b.trapped) {
                    b.floating = true;
                }
                if (b.life <= 0 && !b.trapped) { bubbles.splice(i, 1); continue; }
            }
        }
    }

    // ── Combo Timer System ──
    function updateComboTimer() {
        if (comboTimer > 0) {
            comboTimer--;
            if (comboTimer <= 0) {
                comboMultiplier = 1;
            }
        }
        if (thunderBubbleCooldown > 0) thunderBubbleCooldown--;
    }

    function registerPop() {
        if (comboTimer > 0) {
            comboMultiplier = Math.min(comboMultiplier + 1, 8);
        } else {
            comboMultiplier = 1;
        }
        comboTimer = COMBO_TIMER_MAX;
    }

    // ── Pop Mechanics & Chain System ──
    let lastPopColor = -1, chainCount = 0;

    function popNearestBubble() {
        let nearest = null, bestDist = 80;
        for (const b of bubbles) {
            if (!b.floating) continue;
            const d = dist(b, { x: player.x + player.w / 2, y: player.y + player.h / 2 });
            if (d < bestDist) { bestDist = d; nearest = b; }
        }
        if (!nearest) return;
        popBubble(nearest);
    }

    function popBubble(b) {
        const idx = bubbles.indexOf(b);
        if (idx === -1) return;

        sfxPop();
        spawnPopExplosion(b.x, b.y, COLORS[b.color]);
        registerPop();

        // Chain tracking
        if (b.color === lastPopColor) {
            chainCount++;
        } else {
            chainCount = 1;
            lastPopColor = b.color;
        }

        let pts = 50 * comboMultiplier;
        if (b.mergeLevel > 0) pts *= 2; // merged bubbles worth double
        if (b.trapped) {
            pts = 200 * comboMultiplier;
            if (b.mergeLevel > 0) pts *= 2;
            // Check for chain explosion
            if (chainCount >= CHAIN_MIN) {
                triggerChainExplosion(b.x, b.y, b.color, chainCount);
                pts = 500 * chainCount * comboMultiplier;
            }
        }
        score += pts;
        addScorePopup(b.x, b.y, pts, chainCount >= CHAIN_MIN ? chainCount : (comboMultiplier > 1 ? comboMultiplier : 0));
        bubbles.splice(idx, 1);
    }

    // ── Pop Explosion (liquid splash effect) ──
    function spawnPopExplosion(cx, cy, color) {
        // Stretch-then-burst: ring of droplets
        for (let i = 0; i < 12; i++) {
            const angle = (Math.PI * 2 / 12) * i + rnd(-0.3, 0.3);
            const speed = rnd(1.5, 4.5);
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1,
                life: rnd(25, 50), maxLife: 50,
                r: rnd(2, 5), color, type: 'splash'
            });
        }
        // Central flash
        particles.push({
            x: cx, y: cy, vx: 0, vy: 0,
            life: 12, maxLife: 12,
            r: BUBBLE_R * 1.5, color: '#FFF', type: 'flash'
        });
        // Liquid drip particles
        for (let i = 0; i < 5; i++) {
            particles.push({
                x: cx + rnd(-8, 8), y: cy,
                vx: rnd(-0.5, 0.5), vy: rnd(1, 3),
                life: rnd(30, 60), maxLife: 60,
                r: rnd(1.5, 3), color, type: 'drip'
            });
        }
    }

    function triggerChainExplosion(cx, cy, colorIdx, count) {
        sfxChain(count);
        screenShake = 12 + count * 3;
        chainFlash = 15;

        // Pop all same-color trapped bubbles nearby
        const radius = 80 + count * 30;
        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];
            if (b.color === colorIdx && b.floating && dist(b, { x: cx, y: cy }) < radius) {
                spawnPopExplosion(b.x, b.y, COLORS[b.color]);
                const pts = 300 * comboMultiplier;
                score += pts;
                addScorePopup(b.x, b.y, pts, count);
                bubbles.splice(i, 1);
            }
        }

        // Massive particle burst
        for (let i = 0; i < 30 + count * 10; i++) {
            const angle = rnd(0, Math.PI * 2);
            const speed = rnd(1, 6);
            const c = i % 2 === 0 ? COLORS[colorIdx] : ['#FFF','#FFD700','#FF69B4','#00FFFF'][i % 4];
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2,
                life: rnd(30, 70), maxLife: 70,
                r: rnd(2, 6), color: c, type: 'burst'
            });
        }

        // Drop fruits
        const fruitCount = Math.min(count, 4);
        for (let i = 0; i < fruitCount; i++) {
            fruits.push({
                x: cx + rnd(-40, 40), y: cy + rnd(-20, 10),
                vy: rnd(-3, -1), type: rndInt(0, Math.min(wave, 7)),
                life: 360, collected: false
            });
        }

        // Thunder bubble power-up drops on big chains
        if (count >= 4 && !thunderBubbleReady) {
            thunderBubbleReady = true;
        }

        // Reset chain
        chainCount = 0;
        lastPopColor = -1;
    }

    // ── Enemies ──
    function spawnWaveEnemies() {
        enemies = [];
        const count = 3 + Math.floor(wave * 0.8);
        const isBoss = wave % WAVES_PER_LEVEL === 0 && wave > 0;

        if (isBoss) {
            sfxBoss();
            enemies.push({
                x: GAME_W / 2 - 20, y: 60, w: 40, h: 40,
                vx: 1.5, vy: 0, type: 'boss', hp: 8 + wave,
                speed: 1.5, facing: 1, angry: false, trapped: false,
                animTimer: 0, jumpTimer: rndInt(60, 120),
                // Boss attack phases
                phase: 'patrol', // patrol, charge, jump, groundpound
                phaseTimer: rndInt(120, 200),
                chargeDir: 1, groundPoundY: 0
            });
            return;
        }

        for (let i = 0; i < count; i++) {
            const typeRoll = Math.random();
            let type = 'walker';
            if (typeRoll > 0.85 && wave > 6) type = 'splitter';
            else if (typeRoll > 0.7 && wave > 4) type = 'charger';
            else if (typeRoll > 0.55 && wave > 3) type = 'floater';
            else if (typeRoll > 0.4 && wave > 2) type = 'jumper';
            else if (typeRoll > 0.25 && wave > 5) type = 'flyer';

            const spd = 0.8 + wave * 0.08 + rnd(0, 0.3);
            enemies.push({
                x: rnd(40, GAME_W - 60), y: rnd(40, 200),
                w: type === 'splitter' ? 22 : 18,
                h: type === 'splitter' ? 24 : 20,
                vx: (Math.random() > 0.5 ? 1 : -1) * spd, vy: 0,
                type, speed: spd, facing: 1, angry: false, trapped: false,
                animTimer: 0, jumpTimer: rndInt(60, 180),
                // Charger specific
                chargeTimer: type === 'charger' ? rndInt(90, 200) : 0,
                charging: false,
                // Floater specific
                floatPhase: rnd(0, 6.28),
                // Splitter specific
                splitCount: type === 'splitter' ? 1 : 0 // splits once
            });
        }
    }

    function updateEnemies(dt) {
        for (let ei = enemies.length - 1; ei >= 0; ei--) {
            const e = enemies[ei];
            if (e.trapped) continue;
            e.animTimer++;

            if (e.type === 'floater') {
                // Sine wave flying pattern
                e.floatPhase += 0.04;
                e.x += e.vx;
                e.y += Math.sin(e.floatPhase) * 1.2;
                if (e.x < 12 || e.x + e.w > GAME_W - 12) e.vx *= -1;
                e.facing = e.vx > 0 ? 1 : -1;
            } else if (e.type === 'charger') {
                // Charges at player periodically
                e.chargeTimer--;
                if (e.chargeTimer <= 0 && !e.charging) {
                    e.charging = true;
                    e.chargeTimer = 60; // charge duration
                    const dx = player.x - e.x;
                    e.vx = (dx > 0 ? 1 : -1) * (e.speed * 3.5);
                    e.facing = e.vx > 0 ? 1 : -1;
                }
                if (e.charging) {
                    e.chargeTimer--;
                    if (e.chargeTimer <= 0) {
                        e.charging = false;
                        e.chargeTimer = rndInt(90, 200);
                        e.vx = e.facing * e.speed;
                    }
                }
                e.x += e.vx;
                e.vy += GRAVITY;
                if (e.vy > MAX_FALL) e.vy = MAX_FALL;
                e.y += e.vy;

                // Platform collisions
                for (const p of platforms) {
                    if (p.wall || p.ceiling) continue;
                    if (e.vy >= 0 && e.x + e.w > p.x && e.x < p.x + p.w &&
                        e.y + e.h >= p.y && e.y + e.h <= p.y + p.h + 8) {
                        e.y = p.y - e.h; e.vy = 0;
                    }
                }
                if (e.x + e.w < 8) e.x = GAME_W - 8;
                if (e.x > GAME_W - 8) e.x = 8;
            } else if (e.type === 'flyer') {
                e.x += e.vx;
                e.y += Math.sin(e.animTimer * 0.04) * 0.8;
                if (e.x < 12 || e.x + e.w > GAME_W - 12) e.vx *= -1;
                e.facing = e.vx > 0 ? 1 : -1;
            } else if (e.type === 'boss') {
                updateBoss(e);
            } else {
                // Walker/Jumper/Splitter
                e.x += e.vx;
                e.vy += GRAVITY;
                if (e.vy > MAX_FALL) e.vy = MAX_FALL;
                e.y += e.vy;

                // Platform collisions
                let onGround = false;
                for (const p of platforms) {
                    if (p.wall || p.ceiling) continue;
                    if (e.vy >= 0 && e.x + e.w > p.x && e.x < p.x + p.w &&
                        e.y + e.h >= p.y && e.y + e.h <= p.y + p.h + 8) {
                        e.y = p.y - e.h; e.vy = 0; onGround = true;
                    }
                }

                // Wrap sides
                if (e.x + e.w < 8) e.x = GAME_W - 8;
                if (e.x > GAME_W - 8) e.x = 8;

                // Edge detection — turn around at platform edges (walkers/splitters)
                if ((e.type === 'walker' || e.type === 'splitter') && onGround) {
                    let hasFloor = false;
                    for (const p of platforms) {
                        if (p.wall || p.ceiling) continue;
                        if (e.x + e.w / 2 + e.vx * 10 > p.x && e.x + e.w / 2 + e.vx * 10 < p.x + p.w &&
                            Math.abs((e.y + e.h) - p.y) < 12) hasFloor = true;
                    }
                    if (!hasFloor) e.vx *= -1;
                }

                // Jumpers jump
                if (e.type === 'jumper' && onGround) {
                    e.jumpTimer--;
                    if (e.jumpTimer <= 0) {
                        e.vy = -6 - (e.angry ? 2 : 0);
                        e.jumpTimer = rndInt(40, 100);
                    }
                }

                e.facing = e.vx > 0 ? 1 : -1;
            }

            // Hit player
            if (player.invincible <= 0 && player.stunTimer <= 0 &&
                overlap(player.x, player.y, player.w, player.h, e.x, e.y, e.w, e.h)) {
                playerHit();
            }
        }
    }

    // ── Boss Attack Phases ──
    function updateBoss(e) {
        e.phaseTimer--;

        if (e.phase === 'patrol') {
            e.x += e.vx;
            e.vy += GRAVITY * 0.5;
            e.y += e.vy;
            if (e.x < 12 || e.x + e.w > GAME_W - 12) e.vx *= -1;
            // Land on platforms
            for (const p of platforms) {
                if (p.wall || p.ceiling) continue;
                if (e.vy >= 0 && e.x + e.w > p.x && e.x < p.x + p.w &&
                    e.y + e.h >= p.y && e.y + e.h <= p.y + p.h + 8) {
                    e.y = p.y - e.h; e.vy = 0;
                }
            }
            e.facing = e.vx > 0 ? 1 : -1;
            if (e.phaseTimer <= 0) {
                // Pick next attack
                const roll = Math.random();
                if (roll < 0.35) {
                    e.phase = 'charge';
                    e.phaseTimer = 90;
                    e.chargeDir = player.x > e.x ? 1 : -1;
                    sfxBossAttack();
                } else if (roll < 0.7) {
                    e.phase = 'jump';
                    e.phaseTimer = 80;
                    e.vy = -12;
                    sfxBossAttack();
                } else {
                    e.phase = 'groundpound';
                    e.phaseTimer = 60;
                    e.vy = -10;
                    e.groundPoundY = e.y;
                    sfxBossAttack();
                }
            }
        } else if (e.phase === 'charge') {
            e.vx = e.chargeDir * 4;
            e.x += e.vx;
            e.vy += GRAVITY * 0.5;
            e.y += e.vy;
            for (const p of platforms) {
                if (p.wall || p.ceiling) continue;
                if (e.vy >= 0 && e.x + e.w > p.x && e.x < p.x + p.w &&
                    e.y + e.h >= p.y && e.y + e.h <= p.y + p.h + 8) {
                    e.y = p.y - e.h; e.vy = 0;
                }
            }
            if (e.x < 12 || e.x + e.w > GAME_W - 12) e.vx *= -1;
            e.facing = e.vx > 0 ? 1 : -1;
            // Trail particles
            if (frameCount % 3 === 0) {
                particles.push({
                    x: e.x + e.w / 2 - e.chargeDir * 15, y: e.y + e.h / 2,
                    vx: -e.chargeDir * rnd(0.5, 2), vy: rnd(-1, 1),
                    life: 20, maxLife: 20, r: rnd(3, 6), color: '#E67E22', type: 'normal'
                });
            }
            if (e.phaseTimer <= 0) {
                e.phase = 'patrol';
                e.phaseTimer = rndInt(100, 180);
                e.vx = e.speed * e.facing;
            }
        } else if (e.phase === 'jump') {
            e.x += e.vx * 0.5;
            e.vy += GRAVITY * 0.6;
            e.y += e.vy;
            if (e.x < 12 || e.x + e.w > GAME_W - 12) e.vx *= -1;
            for (const p of platforms) {
                if (p.wall || p.ceiling) continue;
                if (e.vy >= 0 && e.x + e.w > p.x && e.x < p.x + p.w &&
                    e.y + e.h >= p.y && e.y + e.h <= p.y + p.h + 8) {
                    e.y = p.y - e.h; e.vy = 0;
                }
            }
            e.facing = e.vx > 0 ? 1 : -1;
            if (e.phaseTimer <= 0) {
                e.phase = 'patrol';
                e.phaseTimer = rndInt(80, 150);
                e.vx = e.speed * e.facing;
            }
        } else if (e.phase === 'groundpound') {
            if (e.phaseTimer > 30) {
                // Rising
                e.vy += GRAVITY * 0.3;
                e.y += e.vy;
            } else {
                // Slamming down fast
                e.vy = 8;
                e.y += e.vy;
                let landed = false;
                for (const p of platforms) {
                    if (p.wall || p.ceiling) continue;
                    if (e.y + e.h >= p.y && e.y + e.h <= p.y + p.h + 12 &&
                        e.x + e.w > p.x && e.x < p.x + p.w) {
                        e.y = p.y - e.h; e.vy = 0;
                        landed = true;
                    }
                }
                if (landed) {
                    // Ground pound stun effect
                    screenShake = 15;
                    sfxBossAttack();
                    // Stun player if nearby and on ground
                    const dx = Math.abs((player.x + player.w / 2) - (e.x + e.w / 2));
                    if (dx < 80 && player.onGround && player.invincible <= 0) {
                        player.stunTimer = 45;
                    }
                    // Shockwave particles
                    for (let i = 0; i < 20; i++) {
                        const dir = i < 10 ? -1 : 1;
                        particles.push({
                            x: e.x + e.w / 2 + dir * rnd(10, 60),
                            y: e.y + e.h,
                            vx: dir * rnd(1, 4), vy: rnd(-2, -0.5),
                            life: 25, maxLife: 25, r: rnd(2, 5),
                            color: '#E67E22', type: 'normal'
                        });
                    }
                    e.phase = 'patrol';
                    e.phaseTimer = rndInt(120, 200);
                    e.vx = e.speed * e.facing;
                }
            }
            if (e.phaseTimer <= 0 && e.phase === 'groundpound') {
                e.phase = 'patrol';
                e.phaseTimer = rndInt(80, 150);
            }
        }
    }

    // ── Handle splitter enemies when trapped ──
    function handleSplitterTrap(b) {
        const e = b.trapped;
        if (e && e.type === 'splitter' && e.splitCount > 0) {
            // When popped, spawn 2 smaller enemies
            e.splitCount = 0;
            sfxSplit();
            for (let i = 0; i < 2; i++) {
                const dir = i === 0 ? -1 : 1;
                enemies.push({
                    x: b.x + dir * 15, y: b.y,
                    w: 12, h: 14,
                    vx: dir * (e.speed * 1.2), vy: -3,
                    type: 'walker', speed: e.speed * 1.2,
                    facing: dir, angry: true, trapped: false,
                    animTimer: 0, jumpTimer: rndInt(60, 120),
                    chargeTimer: 0, charging: false,
                    floatPhase: 0, splitCount: 0
                });
            }
        }
    }

    // ── Fruits ──
    function updateFruits(dt) {
        for (let i = fruits.length - 1; i >= 0; i--) {
            const f = fruits[i];
            f.vy += 0.15;
            f.y += f.vy;
            f.life--;

            // Land on platforms
            for (const p of platforms) {
                if (p.wall || p.ceiling) continue;
                if (f.vy >= 0 && f.y + 12 >= p.y && f.y + 12 <= p.y + p.h + 6 &&
                    f.x > p.x && f.x < p.x + p.w) {
                    f.y = p.y - 12; f.vy = 0;
                }
            }

            // Collect
            if (dist(f, { x: player.x + player.w / 2, y: player.y + player.h / 2 }) < 24) {
                const pts = (FRUIT_SCORES[f.type] || 100) * comboMultiplier;
                score += pts;
                addScorePopup(f.x, f.y, pts, 0);
                sfxFruit();
                spawnParticles(f.x, f.y, '#FFD700', 8);
                fruits.splice(i, 1);
                continue;
            }
            if (f.life <= 0) { fruits.splice(i, 1); }
        }
    }

    // ── Particles & Effects ──
    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = rnd(0, Math.PI * 2);
            const speed = rnd(0.5, 3.5);
            particles.push({
                x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1.5,
                life: rnd(20, 45), maxLife: 45, r: rnd(1.5, 4), color, type: 'normal'
            });
        }
    }

    function addScorePopup(x, y, pts, chain) {
        scorePopups.push({
            x, y, text: chain > 0 ? `${pts} x${chain}!` : `${pts}`,
            life: 60, maxLife: 60, chain: chain > 0
        });
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            if (p.type === 'drip') {
                p.vy += 0.12; // drips fall faster
            } else if (p.type === 'lightning') {
                p.vx += rnd(-0.5, 0.5); // jitter
            } else {
                p.vy += 0.05;
            }
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            scorePopups[i].y -= 0.8;
            scorePopups[i].life--;
            if (scorePopups[i].life <= 0) scorePopups.splice(i, 1);
        }
    }

    function updateAmbientBubbles() {
        if (ambientBubbles.length < 12 && Math.random() < 0.02) {
            ambientBubbles.push({
                x: rnd(20, GAME_W - 20), y: GAME_H + 10,
                r: rnd(3, 10), speed: rnd(0.2, 0.6), wobble: rnd(0, 6.28), alpha: rnd(0.08, 0.2)
            });
        }
        for (let i = ambientBubbles.length - 1; i >= 0; i--) {
            const b = ambientBubbles[i];
            b.y -= b.speed;
            b.wobble += 0.03;
            b.x += Math.sin(b.wobble) * 0.3;
            if (b.y < -20) ambientBubbles.splice(i, 1);
        }
    }

    // ── Player Damage ──
    function playerHit() {
        if (player.invincible > 0) return;
        lives--;
        sfxDeath();
        screenShake = 10;
        spawnParticles(player.x + player.w / 2, player.y + player.h / 2, playerColor, 15);
        if (lives <= 0) {
            state = ST_GAMEOVER;
            deathTimer = 120;
        } else {
            state = ST_DEAD;
            deathTimer = 60;
        }
    }

    // ── Wave Management ──
    function startWave() {
        wave++;
        buildPlatforms();
        spawnWaveEnemies();
        bubbles = [];
        fruits = [];
        lastPopColor = -1;
        chainCount = 0;
        waveIntroTimer = 90;
        state = ST_WAVE_INTRO;
        sfxWave();
        // Update biome every set of levels
        targetBiome = Math.floor((wave - 1) / WAVES_PER_LEVEL) % BIOMES.length;
        if (targetBiome !== currentBiome) {
            biomeTransition = 0;
        }
    }

    function checkWaveComplete() {
        if (enemies.length === 0 && bubbles.every(b => !b.trapped)) {
            if (wave >= 99) {
                state = ST_WIN;
                deathTimer = 180;
            } else {
                startWave();
            }
        }
    }

    // ── Biome Transition ──
    function updateBiomeTransition() {
        if (currentBiome !== targetBiome) {
            biomeTransition = Math.min(biomeTransition + 0.005, 1);
            if (biomeTransition >= 1) {
                currentBiome = targetBiome;
                biomeTransition = 0;
            }
        }
    }

    function getBiomeColors() {
        const biomeA = BIOMES[currentBiome] || BIOMES[0];
        const biomeB = BIOMES[targetBiome] || BIOMES[0];
        const t = (currentBiome !== targetBiome) ? biomeTransition : 0;
        return {
            bgTopH: lerp(biomeA.bgTop[0], biomeB.bgTop[0], t),
            bgTopS: lerp(biomeA.bgTop[1], biomeB.bgTop[1], t),
            bgTopL: lerp(biomeA.bgTop[2], biomeB.bgTop[2], t),
            bgBotH: lerp(biomeA.bgBot[0], biomeB.bgBot[0], t),
            bgBotS: lerp(biomeA.bgBot[1], biomeB.bgBot[1], t),
            bgBotL: lerp(biomeA.bgBot[2], biomeB.bgBot[2], t),
            ambH: lerp(biomeA.ambient[0], biomeB.ambient[0], t),
            ambS: lerp(biomeA.ambient[1], biomeB.ambient[1], t),
            ambL: lerp(biomeA.ambient[2], biomeB.ambient[2], t),
        };
    }

    // ── Drawing ──
    function drawBackground() {
        updateBiomeTransition();
        const bc = getBiomeColors();
        // Gradient bg
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, hsl(bc.bgTopH, bc.bgTopS, bc.bgTopL));
        grad.addColorStop(1, hsl(bc.bgBotH, bc.bgBotS, bc.bgBotL));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Biome-specific decorations
        const biomeName = BIOMES[currentBiome]?.name || 'forest';
        drawBiomeDecor(biomeName);

        // Ambient floating bubbles
        for (const b of ambientBubbles) {
            ctx.beginPath();
            ctx.arc(gs(b.x), gs(b.y), gs(b.r), 0, Math.PI * 2);
            ctx.fillStyle = hsl(bc.ambH, bc.ambS, bc.ambL, b.alpha);
            ctx.fill();
        }
    }

    function drawBiomeDecor(biome) {
        ctx.save();
        ctx.globalAlpha = 0.14;
        if (biome === 'forest') {
            // Distant trees
            ctx.fillStyle = '#1A5C1A';
            for (let i = 0; i < 8; i++) {
                const tx = (i * 65 + frameCount * 0.02) % (GAME_W + 40) - 20;
                ctx.beginPath();
                ctx.moveTo(gs(tx), gs(GAME_H - 16));
                ctx.lineTo(gs(tx + 12), gs(GAME_H - 80 - i * 10));
                ctx.lineTo(gs(tx + 24), gs(GAME_H - 16));
                ctx.fill();
            }
        } else if (biome === 'cave') {
            // Stalactites
            ctx.fillStyle = '#4A3B5C';
            for (let i = 0; i < 10; i++) {
                const sx = (i * 50 + 20) % GAME_W;
                const sh = 30 + Math.sin(i * 1.5) * 20;
                ctx.beginPath();
                ctx.moveTo(gs(sx - 8), gs(12));
                ctx.lineTo(gs(sx), gs(12 + sh));
                ctx.lineTo(gs(sx + 8), gs(12));
                ctx.fill();
            }
        } else if (biome === 'sky') {
            // Clouds
            ctx.fillStyle = '#FFF';
            ctx.globalAlpha = 0.06;
            for (let i = 0; i < 5; i++) {
                const cx = ((i * 100 + frameCount * 0.05) % (GAME_W + 80)) - 40;
                const cy = 60 + i * 80;
                ctx.beginPath();
                ctx.ellipse(gs(cx), gs(cy), gs(40), gs(15), 0, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (biome === 'underwater') {
            // Seaweed
            ctx.strokeStyle = '#1A8C5C';
            ctx.lineWidth = gs(3);
            ctx.globalAlpha = 0.1;
            for (let i = 0; i < 6; i++) {
                const sx = 30 + i * 80;
                ctx.beginPath();
                ctx.moveTo(gs(sx), gs(GAME_H - 16));
                for (let y = GAME_H - 16; y > GAME_H - 100; y -= 10) {
                    ctx.lineTo(gs(sx + Math.sin((y + frameCount) * 0.03) * 10), gs(y));
                }
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    function drawPlatforms() {
        const bc = getBiomeColors();
        const hue = bc.ambH;
        for (const p of platforms) {
            if (p.wall || p.ceiling) {
                ctx.fillStyle = hsl(hue, 30, 20);
                ctx.fillRect(gs(p.x), gs(p.y), gs(p.w), gs(p.h));
                continue;
            }
            const grd = ctx.createLinearGradient(gs(p.x), gs(p.y), gs(p.x), gs(p.y + p.h));
            grd.addColorStop(0, hsl(hue, 40, 50, 0.9));
            grd.addColorStop(1, hsl(hue, 50, 30, 0.9));
            ctx.fillStyle = grd;
            ctx.fillRect(gs(p.x), gs(p.y), gs(p.w), gs(p.h));
            // Highlight edge
            ctx.fillStyle = hsl(hue, 50, 70, 0.5);
            ctx.fillRect(gs(p.x), gs(p.y), gs(p.w), gs(1.5));
        }
    }

    function drawPlayer() {
        // Sprite player
        const _psz = gs(PLAYER_W * 1.3);
        const _ppx = gx(player.x), _ppy = gy(player.y);
        const _pk = player.vy < -1 ? 'playerJump' : (Math.abs(player.vx) > 0.5 ? 'playerWalk' : 'playerStand');
        if (__sprites[_pk]) {
            ctx.save();
            if (player.facingLeft) { ctx.translate(_ppx, 0); ctx.scale(-1, 1); ctx.drawImage(__sprites[_pk], -_psz/2, _ppy - _psz/2, _psz, _psz); }
            else ctx.drawImage(__sprites[_pk], _ppx - _psz/2, _ppy - _psz/2, _psz, _psz);
            ctx.restore();
            return;
        }
        if (state === ST_DEAD || (player.invincible > 0 && Math.floor(player.blinkTimer / 3) % 2)) return;
        const x = gs(player.x), y = gs(player.y), w = gs(player.w), h = gs(player.h);
        const cx = x + w / 2, cy = y + h / 2;
        const f = player.facing;

        ctx.save();
        // Stun visual
        if (player.stunTimer > 0) {
            ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.5) * 0.3;
        }
        // Body
        ctx.fillStyle = playerColor;
        ctx.beginPath();
        ctx.ellipse(cx, cy + gs(2), w * 0.42, h * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        // Head
        ctx.fillStyle = playerColor;
        ctx.beginPath();
        ctx.arc(cx, y + gs(7), gs(9), 0, Math.PI * 2);
        ctx.fill();
        // Eyes
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(cx + f * gs(3), y + gs(5), gs(3), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = player.stunTimer > 0 ? '#FF0' : '#111';
        ctx.beginPath();
        ctx.arc(cx + f * gs(4), y + gs(5.5), gs(1.5), 0, Math.PI * 2);
        ctx.fill();
        // Stun stars
        if (player.stunTimer > 0) {
            for (let i = 0; i < 3; i++) {
                const sa = (frameCount * 0.1 + i * 2.09);
                const sr = gs(14);
                ctx.fillStyle = '#FFD700';
                ctx.font = `${gs(8)}px monospace`;
                ctx.fillText('*', cx + Math.cos(sa) * sr, y - gs(2) + Math.sin(sa) * gs(5));
            }
        }
        // Bubble gun
        ctx.fillStyle = '#AAA';
        ctx.fillRect(cx + f * gs(8), cy - gs(2), f * gs(10), gs(4));
        ctx.fillStyle = COLORS[player.bubbleColor];
        ctx.beginPath();
        ctx.arc(cx + f * gs(19), cy, gs(3), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawBubble(b) {
        const x = gs(b.x), y = gs(b.y), r = gs(b.r);
        const col = COLORS[b.color];

        ctx.save();
        // Outer glow
        const glowGrad = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.3);
        glowGrad.addColorStop(0, col.replace(')', ',0.15)').replace('rgb', 'rgba'));
        glowGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.3, 0, Math.PI * 2);
        ctx.fill();

        // Main bubble — translucent
        ctx.globalAlpha = 0.5;
        const bubGrad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        bubGrad.addColorStop(0, '#FFFFFF');
        bubGrad.addColorStop(0.3, col);
        bubGrad.addColorStop(1, col.replace(')', ',0.3)').replace('rgb', 'rgba'));
        ctx.fillStyle = bubGrad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        // Rainbow shimmer reflection — more visible with brighter colors
        ctx.globalAlpha = 0.3 + Math.sin(b.shimmer) * 0.15;
        const shimmerAngle = b.shimmer * 0.7;
        const shimmerX = x + Math.cos(shimmerAngle) * r * 0.35;
        const shimmerY = y + Math.sin(shimmerAngle) * r * 0.35;
        const shimGrad = ctx.createRadialGradient(shimmerX, shimmerY, 0, shimmerX, shimmerY, r * 0.9);
        shimGrad.addColorStop(0, `hsla(${(frameCount * 5 + b.shimmer * 60) % 360},100%,80%,0.5)`);
        shimGrad.addColorStop(0.4, `hsla(${(frameCount * 5 + b.shimmer * 60 + 120) % 360},90%,75%,0.3)`);
        shimGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = shimGrad;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
        ctx.fill();

        // Merged bubble indicator (double ring)
        if (b.mergeLevel > 0) {
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = gs(1.5);
            ctx.beginPath();
            ctx.arc(x, y, r * 1.05, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Specular highlight
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.ellipse(x - r * 0.3, y - r * 0.3, r * 0.25, r * 0.15, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Trapped enemy inside — with struggle animation
        if (b.trapped) {
            drawTrappedEnemy(x, y, r * 0.6, b.trapped, b.trapTimer);
        }

        ctx.restore();
    }

    function drawTrappedEnemy(x, y, size, enemy, trapTimer) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        const colors = { walker: '#E74C3C', jumper: '#9B59B6', flyer: '#3498DB',
                         boss: '#E67E22', charger: '#FF6B35', floater: '#4CC9F0', splitter: '#C77DFF' };
        ctx.fillStyle = colors[enemy.type] || '#E74C3C';

        // Struggle animation — more pronounced shake and push
        const struggle = Math.sin(trapTimer * 0.18) * size * 0.25;
        const pushX = Math.sin(trapTimer * 0.1) * size * 0.3;
        const pushY = Math.cos(trapTimer * 0.14) * size * 0.15;

        // Squished body with struggle offset
        ctx.beginPath();
        ctx.ellipse(x + pushX, y + size * 0.15 + pushY,
                    size * 0.7 + Math.abs(struggle) * 0.3,
                    size * 0.55 - Math.abs(struggle) * 0.15,
                    struggle * 0.1, 0, Math.PI * 2);
        ctx.fill();

        // Distressed eyes — spiral/dizzy
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(x + pushX - size * 0.2, y - size * 0.1 + pushY, size * 0.18, 0, Math.PI * 2);
        ctx.arc(x + pushX + size * 0.2, y - size * 0.1 + pushY, size * 0.18, 0, Math.PI * 2);
        ctx.fill();

        // Angry/distressed expression — spiral eyes
        ctx.strokeStyle = '#333';
        ctx.lineWidth = gs(1);
        const ePhase = trapTimer * 0.1;
        for (let ei = 0; ei < 2; ei++) {
            const ex = x + pushX + (ei === 0 ? -size * 0.2 : size * 0.2);
            const ey = y - size * 0.1 + pushY;
            const es = size * 0.1;
            // Spiral instead of X
            ctx.beginPath();
            for (let a = 0; a < 4; a += 0.3) {
                const sr = es * (a / 4);
                ctx.lineTo(ex + Math.cos(a + ePhase) * sr, ey + Math.sin(a + ePhase) * sr);
            }
            ctx.stroke();
        }

        // Hands pushing against bubble wall
        ctx.strokeStyle = colors[enemy.type] || '#E74C3C';
        ctx.lineWidth = gs(1.5);
        const handAngle = trapTimer * 0.06;
        for (let i = 0; i < 2; i++) {
            const ha = handAngle + i * Math.PI;
            const hx = x + Math.cos(ha) * size * 0.85;
            const hy = y + Math.sin(ha) * size * 0.7;
            ctx.beginPath();
            ctx.arc(hx, hy, size * 0.12, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawEnemy(e) {
        const x = gs(e.x), y = gs(e.y), w = gs(e.w), h = gs(e.h);
        const cx = x + w / 2, cy = y + h / 2;
        const colors = { walker: '#E74C3C', jumper: '#9B59B6', flyer: '#3498DB',
                         boss: '#E67E22', charger: '#FF6B35', floater: '#4CC9F0', splitter: '#C77DFF' };
        const col = e.angry ? '#FF2222' : (colors[e.type] || '#E74C3C');

        ctx.save();
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(cx, y + h + gs(2), w * 0.4, gs(2), 0, 0, Math.PI * 2);
        ctx.fill();

        if (e.type === 'boss') {
            // Boss: larger, horned, with phase indicator
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.ellipse(cx, cy, w * 0.55, h * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            // Horns
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.moveTo(cx - w * 0.3, y + gs(4)); ctx.lineTo(cx - w * 0.15, y - gs(6));
            ctx.lineTo(cx - w * 0.05, y + gs(4)); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(cx + w * 0.3, y + gs(4)); ctx.lineTo(cx + w * 0.15, y - gs(6));
            ctx.lineTo(cx + w * 0.05, y + gs(4)); ctx.fill();
            // Phase glow
            if (e.phase === 'charge') {
                ctx.shadowColor = '#FF4444';
                ctx.shadowBlur = gs(10);
                ctx.strokeStyle = '#FF4444';
                ctx.lineWidth = gs(2);
                ctx.stroke();
            } else if (e.phase === 'groundpound' && e.phaseTimer <= 30) {
                ctx.shadowColor = '#FBBF24';
                ctx.shadowBlur = gs(15);
            }
        } else if (e.type === 'charger') {
            // Charger: angular, aggressive look
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(cx, y);
            ctx.lineTo(cx + w * 0.5, cy);
            ctx.lineTo(cx + w * 0.3, y + h);
            ctx.lineTo(cx - w * 0.3, y + h);
            ctx.lineTo(cx - w * 0.5, cy);
            ctx.closePath();
            ctx.fill();
            // Charging trail effect
            if (e.charging) {
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = '#FF6B35';
                ctx.beginPath();
                ctx.ellipse(cx - e.facing * w * 0.6, cy, w * 0.3, h * 0.2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        } else if (e.type === 'floater') {
            // Floater: jellyfish-like
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(cx, cy - h * 0.1, w * 0.45, Math.PI, 0);
            ctx.quadraticCurveTo(cx + w * 0.45, cy + h * 0.2, cx, cy + h * 0.3);
            ctx.quadraticCurveTo(cx - w * 0.45, cy + h * 0.2, cx - w * 0.45, cy - h * 0.1);
            ctx.fill();
            // Tentacles
            ctx.strokeStyle = col;
            ctx.lineWidth = gs(1.5);
            ctx.globalAlpha = 0.6;
            for (let t = 0; t < 3; t++) {
                const tx = cx + (t - 1) * w * 0.25;
                ctx.beginPath();
                ctx.moveTo(tx, cy + h * 0.2);
                ctx.quadraticCurveTo(tx + Math.sin(e.floatPhase + t) * 5, cy + h * 0.5, tx, cy + h * 0.7);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        } else if (e.type === 'splitter') {
            // Splitter: blob with visible split line
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.ellipse(cx, cy, w * 0.48, h * 0.46, 0, 0, Math.PI * 2);
            ctx.fill();
            // Split line
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = gs(1);
            ctx.beginPath();
            ctx.moveTo(cx, y + h * 0.15);
            ctx.lineTo(cx, y + h * 0.85);
            ctx.stroke();
        } else {
            // Normal enemies (walker/jumper)
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.ellipse(cx, cy, w * 0.5, h * 0.48, 0, 0, Math.PI * 2);
            ctx.fill();
            // Type features
            if (e.type === 'flyer') {
                // Wings
                const wingY = cy - gs(2);
                const wingPhase = Math.sin(e.animTimer * 0.15) * gs(4);
                ctx.fillStyle = `${col}99`;
                ctx.beginPath();
                ctx.ellipse(cx - w * 0.5, wingY + wingPhase, gs(6), gs(3), -0.3, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(cx + w * 0.5, wingY + wingPhase, gs(6), gs(3), 0.3, 0, Math.PI * 2);
                ctx.fill();
            }
            if (e.type === 'jumper') {
                // Springy feet
                ctx.fillStyle = '#FFD700';
                ctx.fillRect(cx - w * 0.25, y + h - gs(2), gs(4), gs(4));
                ctx.fillRect(cx + w * 0.1, y + h - gs(2), gs(4), gs(4));
            }
        }

        // Eyes
        ctx.fillStyle = '#FFF';
        const ef = e.facing;
        ctx.beginPath();
        ctx.arc(cx + ef * w * 0.1, cy - h * 0.12, gs(3.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = e.angry ? '#FF0000' : (e.charging ? '#FFAA00' : '#111');
        ctx.beginPath();
        ctx.arc(cx + ef * w * 0.15, cy - h * 0.1, gs(2), 0, Math.PI * 2);
        ctx.fill();
        // Angry brows
        if (e.angry || e.charging) {
            ctx.strokeStyle = e.charging ? '#FF6B35' : '#FF0000';
            ctx.lineWidth = gs(1.5);
            ctx.beginPath();
            ctx.moveTo(cx - w * 0.15, cy - h * 0.3);
            ctx.lineTo(cx + w * 0.05, cy - h * 0.22);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawFruit(f) {
        const x = gs(f.x), y = gs(f.y), s = gs(10);
        const alpha = f.life < 60 ? f.life / 60 : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        const hues = [0, 120, 130, 50, 200, 280, 30, 300];
        const hue = hues[f.type] || 0;
        // Fruit body
        ctx.fillStyle = hsl(hue, 80, 55);
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
        // Highlight
        ctx.fillStyle = hsl(hue, 60, 80, 0.6);
        ctx.beginPath();
        ctx.arc(x - s * 0.25, y - s * 0.25, s * 0.35, 0, Math.PI * 2);
        ctx.fill();
        // Stem (for apple-like fruits)
        if (f.type < 3) {
            ctx.fillStyle = '#5D4037';
            ctx.fillRect(x - gs(1), y - s - gs(3), gs(2), gs(5));
        }
        // Sparkle on star/gem types
        if (f.type >= 3) {
            ctx.fillStyle = '#FFF';
            ctx.globalAlpha = alpha * (0.5 + Math.sin(frameCount * 0.15) * 0.3);
            const ss = s * 0.4;
            ctx.beginPath();
            ctx.moveTo(x, y - ss); ctx.lineTo(x + ss * 0.3, y - ss * 0.3);
            ctx.lineTo(x + ss, y); ctx.lineTo(x + ss * 0.3, y + ss * 0.3);
            ctx.lineTo(x, y + ss); ctx.lineTo(x - ss * 0.3, y + ss * 0.3);
            ctx.lineTo(x - ss, y); ctx.lineTo(x - ss * 0.3, y - ss * 0.3);
            ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            ctx.save();
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha;

            if (p.type === 'flash') {
                // Expanding flash circle
                const expand = 1 + (1 - alpha) * 2;
                ctx.beginPath();
                ctx.arc(gs(p.x), gs(p.y), gs(p.r) * expand, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'splash') {
                // Elongated droplet shape
                const speed = Math.hypot(p.vx, p.vy);
                const angle = Math.atan2(p.vy, p.vx);
                ctx.translate(gs(p.x), gs(p.y));
                ctx.rotate(angle);
                ctx.beginPath();
                ctx.ellipse(0, 0, gs(p.r) * alpha * (1 + speed * 0.3), gs(p.r) * alpha * 0.5, 0, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'drip') {
                // Teardrop
                ctx.beginPath();
                ctx.arc(gs(p.x), gs(p.y), gs(p.r) * alpha, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(gs(p.x - p.r * 0.5), gs(p.y));
                ctx.lineTo(gs(p.x), gs(p.y - p.r * 2));
                ctx.lineTo(gs(p.x + p.r * 0.5), gs(p.y));
                ctx.fill();
            } else if (p.type === 'lightning') {
                ctx.strokeStyle = p.color;
                ctx.lineWidth = gs(2);
                ctx.globalAlpha = alpha * 0.8;
                ctx.beginPath();
                ctx.moveTo(gs(p.x), gs(p.y));
                ctx.lineTo(gs(p.x + p.vx * 3), gs(p.y + p.vy * 3));
                ctx.stroke();
                ctx.fillStyle = '#FFF';
                ctx.beginPath();
                ctx.arc(gs(p.x), gs(p.y), gs(1.5), 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(gs(p.x), gs(p.y), gs(p.r) * alpha, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    function drawScorePopups() {
        for (const s of scorePopups) {
            const alpha = s.life / s.maxLife;
            const sz = s.chain ? 16 : 11;
            ctx.font = `bold ${gs(sz)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillStyle = s.chain ? `rgba(255,215,0,${alpha})` : `rgba(255,255,255,${alpha})`;
            ctx.fillText(s.text, gs(s.x), gs(s.y));
            if (s.chain) {
                ctx.strokeStyle = `rgba(255,100,0,${alpha * 0.6})`;
                ctx.lineWidth = gs(1);
                ctx.strokeText(s.text, gs(s.x), gs(s.y));
            }
        }
    }

    function drawHUD() {
        const pad = gs(8);
        ctx.font = `bold ${gs(12)}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFF';
        ctx.fillText(`SCORE ${score}`, pad, pad + gs(12));
        ctx.fillText(`WAVE ${wave}`, pad, pad + gs(26));
        ctx.textAlign = 'right';
        // Lives as hearts
        for (let i = 0; i < lives; i++) {
            const hx = W - pad - i * gs(18), hy = pad + gs(6);
            ctx.fillStyle = '#EF4444';
            ctx.beginPath();
            ctx.arc(hx - gs(4), hy, gs(5), Math.PI, 0);
            ctx.arc(hx + gs(4), hy, gs(5), Math.PI, 0);
            ctx.lineTo(hx, hy + gs(10));
            ctx.closePath();
            ctx.fill();
        }
        // Current bubble color indicator
        ctx.fillStyle = COLORS[player.bubbleColor];
        ctx.beginPath();
        ctx.arc(W - pad - gs(4), pad + gs(28), gs(6), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = gs(1);
        ctx.stroke();

        // Combo timer bar
        if (comboTimer > 0) {
            const barW = gs(60);
            const barH = gs(5);
            const barX = W / 2 - barW / 2;
            const barY = pad + gs(2);
            const fill = comboTimer / COMBO_TIMER_MAX;
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = comboMultiplier >= 4 ? '#FF4444' : (comboMultiplier >= 2 ? '#FBBF24' : '#22C55E');
            ctx.fillRect(barX, barY, barW * fill, barH);
        }

        // Combo multiplier
        if (comboMultiplier > 1) {
            ctx.font = `bold ${gs(14)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillStyle = comboMultiplier >= 4 ? '#FF4444' : '#FBBF24';
            ctx.fillText(`COMBO x${comboMultiplier}`, W / 2, pad + gs(20));
        }

        // Chain counter
        if (chainCount >= 2) {
            ctx.font = `bold ${gs(10)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FBBF24';
            ctx.fillText(`CHAIN x${chainCount}`, W / 2, pad + gs(32));
        }

        // Thunder bubble indicator
        if (thunderBubbleReady) {
            ctx.font = `bold ${gs(9)}px monospace`;
            ctx.textAlign = 'left';
            ctx.fillStyle = '#FBBF24';
            const pulse = 0.6 + Math.sin(frameCount * 0.1) * 0.4;
            ctx.globalAlpha = pulse;
            ctx.fillText('THUNDER [X]', pad, pad + gs(40));
            ctx.globalAlpha = 1;
        } else if (thunderBubbleCooldown > 0) {
            ctx.font = `${gs(8)}px monospace`;
            ctx.textAlign = 'left';
            ctx.fillStyle = '#888';
            ctx.fillText(`Thunder ${Math.ceil(thunderBubbleCooldown / 60)}s`, pad, pad + gs(40));
        }

        // Biome name
        const biomeName = BIOMES[currentBiome]?.name || 'forest';
        ctx.font = `${gs(8)}px monospace`;
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText(biomeName.toUpperCase(), W - pad, H - pad);
    }

    function drawVignette() {
        const grad = ctx.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.75);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    function drawTitle() {
        drawBackground();
        drawPlatforms();
        drawVignette();

        const pulse = Math.sin(frameCount * 0.04) * 0.1 + 1;
        ctx.save();
        ctx.textAlign = 'center';
        // Title
        ctx.font = `bold ${gs(36 * pulse)}px monospace`;
        ctx.fillStyle = '#FFF';
        ctx.fillText('BUBBLE', W / 2, H * 0.3);
        ctx.fillStyle = COLORS[Math.floor(frameCount / 20) % 4];
        ctx.fillText('BLASTER', W / 2, H * 0.3 + gs(40));
        // Subtitle
        ctx.font = `${gs(11)}px monospace`;
        ctx.fillStyle = '#AAA';
        ctx.fillText('Trap enemies in bubbles!', W / 2, H * 0.50);
        ctx.fillText('Pop 3+ same color = CHAIN EXPLOSION!', W / 2, H * 0.56);
        ctx.fillText('Merge 2 same-color = MEGA BUBBLE!', W / 2, H * 0.62);
        // Controls
        ctx.font = `${gs(10)}px monospace`;
        ctx.fillStyle = '#888';
        ctx.fillText('ARROWS: Move/Jump | SPACE: Shoot', W / 2, H * 0.72);
        ctx.fillText('Z: Pop | X: Thunder Bubble', W / 2, H * 0.78);
        // Start prompt
        ctx.font = `bold ${gs(14)}px monospace`;
        ctx.globalAlpha = 0.5 + Math.sin(frameCount * 0.08) * 0.5;
        ctx.fillStyle = '#FFF';
        ctx.fillText('PRESS SPACE TO START', W / 2, H * 0.88);
        ctx.restore();
    }

    function drawWaveIntro() {
        const alpha = waveIntroTimer / 90;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = `bold ${gs(28)}px monospace`;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillText(`WAVE ${wave}`, W / 2, H * 0.35);
        // Biome name
        const biomeName = BIOMES[targetBiome]?.name || 'forest';
        ctx.font = `bold ${gs(14)}px monospace`;
        ctx.fillStyle = `rgba(200,200,255,${alpha * 0.7})`;
        ctx.fillText(biomeName.toUpperCase(), W / 2, H * 0.43);
        if (wave % WAVES_PER_LEVEL === 0 && wave > 0) {
            ctx.font = `bold ${gs(18)}px monospace`;
            ctx.fillStyle = `rgba(255,100,100,${alpha})`;
            ctx.fillText('BOSS!', W / 2, H * 0.52);
        }
        ctx.restore();
    }

    function drawGameOver() {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.font = `bold ${gs(32)}px monospace`;
        ctx.fillStyle = '#EF4444';
        ctx.fillText('GAME OVER', W / 2, H * 0.4);
        ctx.font = `${gs(16)}px monospace`;
        ctx.fillStyle = '#FFF';
        ctx.fillText(`SCORE: ${score}`, W / 2, H * 0.52);
        ctx.fillText(`WAVE: ${wave}`, W / 2, H * 0.6);
        ctx.font = `${gs(11)}px monospace`;
        ctx.fillStyle = '#AAA';
        ctx.globalAlpha = deathTimer < 30 ? 1 : 0;
        ctx.fillText('PRESS SPACE TO CONTINUE', W / 2, H * 0.75);
        ctx.restore();
    }

    function drawWin() {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.font = `bold ${gs(28)}px monospace`;
        ctx.fillStyle = '#FFD700';
        ctx.fillText('YOU WIN!', W / 2, H * 0.4);
        ctx.font = `${gs(16)}px monospace`;
        ctx.fillStyle = '#FFF';
        ctx.fillText(`FINAL SCORE: ${score}`, W / 2, H * 0.52);
        ctx.restore();
    }

    // ── Chain Flash Overlay ──
    function drawChainFlash() {
        if (chainFlash > 0) {
            ctx.fillStyle = `rgba(255,255,255,${chainFlash / 30})`;
            ctx.fillRect(0, 0, W, H);
            chainFlash--;
        }
    }

    // ── Touch Controls ──
    function processTouches(touches) {
        touchLeft = false; touchRight = false; touchJump = false;
        touchShoot = false; touchPop = false;
        for (let i = 0; i < touches.length; i++) {
            const rect = canvas.getBoundingClientRect();
            const tx = (touches[i].clientX - rect.left) / rect.width;
            const ty = (touches[i].clientY - rect.top) / rect.height;
            if (ty > 0.7) {
                // Bottom zone: move
                if (tx < 0.3) touchLeft = true;
                else if (tx > 0.7) touchRight = true;
                else touchPop = true;
            } else {
                // Upper zone: jump/shoot
                if (tx < 0.5) touchJump = true;
                else touchShoot = true;
            }
        }
    }
    function onTouchStart(e) {
        e.preventDefault();
        processTouches(e.touches);
        if (state === ST_TITLE) { startGame(); }
        if (state === ST_GAMEOVER && deathTimer <= 0) { endGame(); }
    }
    function onTouchMove(e) { e.preventDefault(); processTouches(e.touches); }
    function onTouchEnd(e) {
        e.preventDefault();
        processTouches(e.touches);
        if (e.touches.length === 0) {
            touchLeft = touchRight = touchJump = touchShoot = touchPop = false;
        }
    }

    // ── Keyboard ──
    function onKeyDown(e) {
        keys[e.key] = true;
        if (state === ST_TITLE && e.key === ' ') { e.preventDefault(); startGame(); }
        if (state === ST_GAMEOVER && e.key === ' ' && deathTimer <= 0) { e.preventDefault(); endGame(); }
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    }
    function onKeyUp(e) { keys[e.key] = false; }

    // ── Game Flow ──
    function startGame() {
        score = 0;
        startTime = Date.now();
        lives = INITIAL_LIVES;
        wave = 0;
        level = 1;
        combo = 0;
        bubbles = [];
        enemies = [];
        particles = [];
        scorePopups = [];
        fruits = [];
        ambientBubbles = [];
        screenShake = 0;
        chainFlash = 0;
        chainCount = 0;
        lastPopColor = -1;
        comboTimer = 0;
        comboMultiplier = 1;
        thunderBubbleReady = false;
        thunderBubbleCooldown = 0;
        currentBiome = 0;
        targetBiome = 0;
        biomeTransition = 0;
        resetPlayer();
        startWave();
    }

    function endGame() {
        const duration = Math.floor((Date.now() - (startTime || Date.now())) / 1000);
        if (gameOverCB) gameOverCB({ score, waves: wave, level, duration });
        state = ST_TITLE;
    }

    // ── Fit Canvas ──
    function fitCanvas() {
        if (!canvas || !canvas.parentElement) return;
        const parent = canvas.parentElement;
        const pw = parent.clientWidth || 480;
        const ph = parent.clientHeight || 560;
        const ratio = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > ratio) { ch = ph; cw = ch * ratio; }
        else { cw = pw; ch = cw / ratio; }
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        canvas.style.width = `${Math.round(cw)}px`;
        canvas.style.height = `${Math.round(ch)}px`;
        W = canvas.width; H = canvas.height;
        SCALE = W / GAME_W;
    }

    // ── Main Loop ──
    function gameLoop(ts) {
        if (!gameActive) return;
        // Loading screen
        if (!__allSpritesReady) {
            __drawLoadingScreen(canvas, ctx, 'BUBBLE BLASTER', '#3B82F6');
            animFrame = requestAnimationFrame(gameLoop);
            return;
        }
        const dt = Math.min((ts - (lastTime || ts)) / 16.667, 3);
        lastTime = ts;
        frameCount++;

        // Screen shake transform
        ctx.save();
        if (screenShake > 0) {
            ctx.translate(rnd(-screenShake, screenShake) * SCALE * 0.5,
                          rnd(-screenShake, screenShake) * SCALE * 0.5);
            screenShake -= 0.5;
            if (screenShake < 0) screenShake = 0;
        }

        if (state === ST_TITLE) {
            updateAmbientBubbles();
            drawTitle();
        } else if (state === ST_WAVE_INTRO) {
            updateAmbientBubbles();
            updateParticles(dt);
            drawBackground();
            drawPlatforms();
            drawPlayer();
            for (const e of enemies) drawEnemy(e);
            drawParticles();
            drawVignette();
            drawHUD();
            drawWaveIntro();
            waveIntroTimer--;
            if (waveIntroTimer <= 0) state = ST_PLAY;
        } else if (state === ST_PLAY) {
            // Update
            updatePlayer(dt);
            updateBubbles(dt);
            updateEnemies(dt);
            updateFruits(dt);
            updateParticles(dt);
            updateAmbientBubbles();
            updateComboTimer();
            checkWaveComplete();

            // Draw
            drawBackground();
            drawPlatforms();
            for (const f of fruits) drawFruit(f);
            for (const b of bubbles) drawBubble(b);
            for (const e of enemies) drawEnemy(e);
            drawPlayer();
            drawParticles();
            drawScorePopups();
            drawVignette();
            drawChainFlash();
            drawHUD();
        if (state === ST_PLAY) drawOnScreenControls(ctx, W, H, gs, ['JUMP', 'SHOOT', 'POP'], 'LR');

        } else if (state === ST_DEAD) {
            updateParticles(dt);
            updateAmbientBubbles();
            drawBackground();
            drawPlatforms();
            for (const b of bubbles) drawBubble(b);
            for (const e of enemies) drawEnemy(e);
            drawParticles();
            drawVignette();
            drawHUD();
            deathTimer--;
            if (deathTimer <= 0) {
                resetPlayer();
                player.invincible = 120;
                state = ST_PLAY;
            }
        } else if (state === ST_GAMEOVER) {
            updateParticles(dt);
            drawBackground();
            drawPlatforms();
            drawParticles();
            drawVignette();
            drawGameOver();
            if (deathTimer > 0) deathTimer--;
        } else if (state === ST_WIN) {
            updateParticles(dt);
            updateAmbientBubbles();
            drawBackground();
            drawParticles();
            drawVignette();
            drawWin();
            deathTimer--;
            if (deathTimer <= 0 && (keys[' '] || touchShoot)) endGame();
        }

        ctx.restore();
        animFrame = requestAnimationFrame(gameLoop);
    }

    // ── Init / Destroy ──
    function init(cvs, playerData, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOver;
        gameActive = true;
        playerColor = playerData?.color || '#06B6D4';

        const themeId = playerData?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) playerColor = _t.colors[0] || playerColor;

        // Derive theme hue from player color
        themeHue = 200;
        try {
            const tmp = document.createElement('canvas').getContext('2d');
            tmp.fillStyle = playerColor;
            const hex = tmp.fillStyle;
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            if (max !== min) {
                let h;
                if (max === r) h = 60 * (((g - b) / (max - min)) % 6);
                else if (max === g) h = 60 * ((b - r) / (max - min) + 2);
                else h = 60 * ((r - g) / (max - min) + 4);
                if (h < 0) h += 360;
                themeHue = Math.round(h);
            }
        } catch {}

        state = ST_TITLE;
        frameCount = 0;
        lastTime = 0;
        keys = {};
        ambientBubbles = [];
        particles = [];
        scorePopups = [];
        bubbles = [];
        enemies = [];
        fruits = [];
        screenShake = 0;
        chainFlash = 0;
        wave = 0;
        score = 0;
        lives = INITIAL_LIVES;
        comboTimer = 0;
        comboMultiplier = 1;
        thunderBubbleReady = false;
        thunderBubbleCooldown = 0;
        currentBiome = 0;
        targetBiome = 0;
        biomeTransition = 0;
        resetPlayer();
        buildPlatforms();

        touchLeft = touchRight = touchJump = touchShoot = touchPop = false;

        W = canvas.width || 480;
        H = canvas.height || 560;
        SCALE = W / GAME_W;

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
    }

    return { init, destroy };
})();
