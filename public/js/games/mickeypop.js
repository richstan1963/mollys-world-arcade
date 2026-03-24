/* YWA Mickey Pop — Side-scrolling bubble shooter
   Mickey shoots bubbles at balloon enemies, collects patterns of coins/stars/notes.
   Environments: Toy Shop → Candy Land → Cloud City → Castle
   Saturday morning cartoon vibe — bright, charming, non-violent */
window.MickeyPop = (() => {

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
    const GAME_W = 960, GAME_H = 540;
    const GRAVITY = 0.48, JUMP_VEL = -10.5, MAX_FALL = 11;
    const PLAYER_SPEED = 3.2, PLAYER_W = 30, PLAYER_H = 44;
    const BUBBLE_SPEED = 8, BUBBLE_SIZE = 8;
    const FIRE_COOLDOWN_MS = 220;
    const SCROLL_SPEED = 1.0;
    const LEVEL_LENGTH = 8400;

    const BUBBLE_COLORS = ['#FF6B9D','#48D1CC','#FFD700','#87CEEB','#FF69B4','#98FB98'];
    const ENV_NAMES = ['Toy Shop','Candy Land','Cloud City','Castle'];
    const ENV_COLORS = [
        { bg1:'#FFE4E1', bg2:'#FFDAB9', bg3:'#FFB6C1', ground:'#DEB887', plat:'#CD853F', accent:'#FF6347' },
        { bg1:'#FFF0F5', bg2:'#FFE4EC', bg3:'#FFD1DC', ground:'#FFB7CE', plat:'#FF69B4', accent:'#FF1493' },
        { bg1:'#E0F0FF', bg2:'#B8D8F8', bg3:'#87CEEB', ground:'#F0F8FF', plat:'#ADD8E6', accent:'#4169E1' },
        { bg1:'#F5E6CC', bg2:'#E8D5B7', bg3:'#D2B48C', ground:'#8B7355', plat:'#A0522D', accent:'#B22222' },
    ];

    // States
    const ST_TITLE = 0, ST_PLAY = 1, ST_DEAD = 2, ST_GAMEOVER = 3, ST_WIN = 4;

    // Game state
    let canvas, ctx, W, H, SCALE, DPR, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor;
    let state, frameCount, lastTime, keys = {};
    let score, lives, level, cameraX, envIndex, bestScore;
    let player, bubbles, enemies, particles, scorePopups, powerups;
    let lastFireTime, bubblePower, bubblePowerTimer;
    let screenShake;
    let bgLayers, platforms, collectibles, patterns;
    let spawnTimer, spawnRate;
    let bossActive, boss;
    let deathTimer;
    let stars; // background decorative stars
    let patternBonus; // current pattern tracking
    let comboCount, comboTimer;

    // Audio
    let audioCtx;
    function getAudio() { if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); return audioCtx; }
    function playSound(freq, dur, type='square', vol=0.12) {
        try {
            const a = getAudio(), o = a.createOscillator(), g = a.createGain();
            o.type = type; o.frequency.value = freq;
            g.gain.setValueAtTime(vol, a.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
            o.connect(g); g.connect(a.destination);
            o.start(); o.stop(a.currentTime + dur);
        } catch {}
    }
    function sfxBubbleShoot() { playSound(600, 0.08, 'sine', 0.1); playSound(900, 0.06, 'sine', 0.06); }
    function sfxBubblePop() { playSound(1200, 0.1, 'sine', 0.12); playSound(800, 0.05, 'triangle', 0.08); }
    function sfxCoinCollect() { playSound(1047, 0.08, 'sine', 0.1); setTimeout(() => playSound(1319, 0.1, 'sine', 0.1), 60); }
    function sfxPatternComplete() {
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playSound(f, 0.15, 'sine', 0.12), i * 80));
    }
    function sfxHitDizzy() { playSound(300, 0.3, 'sawtooth', 0.1); playSound(250, 0.2, 'triangle', 0.08); }
    function sfxJump() { playSound(500, 0.1, 'triangle', 0.08); playSound(700, 0.06, 'sine', 0.05); }
    function sfxPowerUp() { playSound(880, 0.1, 'sine', 0.12); setTimeout(() => playSound(1320, 0.12, 'sine', 0.12), 80); }
    function sfxBossHit() { playSound(200, 0.2, 'sawtooth', 0.1); }
    function sfxBossDefeat() { [262,330,392,523,659,784].forEach((f,i) => setTimeout(() => playSound(f, 0.2, 'sine', 0.15), i*100)); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const gx = v => (v - cameraX) * SCALE;
    const gy = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const lerp = (a, b, t) => a + (b - a) * t;

    const HAS_TOUCH = ('ontouchstart' in window);
    function drawOnScreenControls() {
        if (!HAS_TOUCH) return;
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + gs(14) + 'px monospace';
        const padX = gs(60), padY = H - gs(70);
        const bs = gs(36), gap = gs(4);
        // D-pad
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.roundRect(padX - bs/2, padY - bs - gap, bs, bs, gs(6)); ctx.fill();
        ctx.fillStyle = '#000'; ctx.fillText('\u25B2', padX, padY - bs/2 - gap);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.roundRect(padX - bs - gap - bs/2, padY - bs/2, bs, bs, gs(6)); ctx.fill();
        ctx.fillStyle = '#000'; ctx.fillText('\u25C0', padX - bs - gap, padY);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.roundRect(padX + gap + bs/2, padY - bs/2, bs, bs, gs(6)); ctx.fill();
        ctx.fillStyle = '#000'; ctx.fillText('\u25B6', padX + bs + gap, padY);
        // Buttons
        const bx = W - gs(60);
        ['SHOOT','JUMP'].forEach((label, i) => {
            const bw = Math.max(gs(50), gs(14) * label.length + gs(16));
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.roundRect(bx - bw/2 - i * (bw + gs(10)), H - gs(55), bw, gs(40), gs(8)); ctx.fill();
            ctx.fillStyle = '#000'; ctx.fillText(label, bx - i * (bw + gs(10)), H - gs(35));
        });
        ctx.restore();
    }

    // ── Environment helpers ──
    function getEnv() { return ENV_COLORS[envIndex] || ENV_COLORS[0]; }
    function getEnvForX(x) { return ENV_COLORS[Math.min(3, Math.floor(x / (LEVEL_LENGTH / 4)))] || ENV_COLORS[0]; }
    function getEnvName() { return ENV_NAMES[envIndex] || ENV_NAMES[0]; }

    // ── Level Generation ──
    function generateLevel() {
        platforms = [];
        collectibles = [];
        patterns = [];

        // Ground (continuous with themed segments)
        platforms.push({ x: 0, y: GAME_H - 40, w: LEVEL_LENGTH + 200, h: 40, type: 'ground' });

        let px = 180;
        let patternId = 0;
        while (px < LEVEL_LENGTH - 400) {
            const seg = Math.floor(px / (LEVEL_LENGTH / 4));
            const pw = rng(70, 180);
            const py = rng(GAME_H - 200, GAME_H - 100);
            platforms.push({ x: px, y: py, w: pw, h: 16, type: 'platform', env: seg });

            // Higher platforms
            if (Math.random() < 0.35) {
                platforms.push({ x: px + rng(0, 80), y: rng(GAME_H - 310, GAME_H - 220), w: rng(50, 110), h: 16, type: 'platform', env: seg });
            }

            // Collectible patterns between platforms
            if (Math.random() < 0.5) {
                const patType = pick(['arc','diamond','wave']);
                const patItems = generatePattern(px + pw + 40, GAME_H - 160, patType, patternId);
                collectibles.push(...patItems);
                patterns.push({ id: patternId, type: patType, total: patItems.length, collected: 0, complete: false, x: px + pw + 40 });
                patternId++;
            }

            // Standalone collectibles
            if (Math.random() < 0.3) {
                collectibles.push({ x: px + rng(10, pw - 10), y: py - 25, type: pick(['coin','star','note']), collected: false, patternId: -1 });
            }

            px += pw + rng(100, 220);
        }

        // Power-up crates at intervals
        for (let i = 600; i < LEVEL_LENGTH - 500; i += rng(500, 900)) {
            const puType = pick(['big','rapid','rainbow']);
            powerups.push({ x: i, y: GAME_H - 40 - 30, w: 22, h: 22, type: puType, active: true, bobPhase: rng(0, Math.PI * 2) });
        }
    }

    function generatePattern(baseX, baseY, type, patId) {
        const items = [];
        const itemType = type === 'arc' ? 'coin' : type === 'diamond' ? 'star' : 'note';
        if (type === 'arc') {
            for (let i = 0; i < 7; i++) {
                const angle = Math.PI * (0.2 + i * 0.086);
                items.push({ x: baseX + i * 18, y: baseY - Math.sin(angle) * 50, type: itemType, collected: false, patternId: patId });
            }
        } else if (type === 'diamond') {
            const pts = [[0,0],[-1,-1],[1,-1],[-2,0],[2,0],[-1,1],[1,1],[0,2]];
            pts.forEach(([dx, dy]) => {
                items.push({ x: baseX + dx * 18, y: baseY + dy * 18, type: itemType, collected: false, patternId: patId });
            });
        } else { // wave
            for (let i = 0; i < 8; i++) {
                items.push({ x: baseX + i * 20, y: baseY + Math.sin(i * 0.8) * 30, type: itemType, collected: false, patternId: patId });
            }
        }
        return items;
    }

    function createStars() {
        stars = [];
        for (let i = 0; i < 60; i++) stars.push({ x: rng(0, GAME_W * 2), y: rng(0, GAME_H * 0.5), s: rng(1, 3), b: rng(0.3, 1), twinkle: rng(0, Math.PI * 2) });
    }

    function createBgLayers() {
        bgLayers = [
            { speed: 0.08, elements: [] },
            { speed: 0.2, elements: [] },
            { speed: 0.4, elements: [] },
        ];
        for (const layer of bgLayers) {
            let lx = 0;
            while (lx < LEVEL_LENGTH + GAME_W) {
                layer.elements.push({ x: lx, w: rng(80, 250), h: rng(50, 150), shape: pick(['hill','cloud','building']) });
                lx += rng(70, 180);
            }
        }
    }

    // ── Player (Mickey) ──
    function resetPlayer() {
        player = {
            x: 80, y: GAME_H - 100, vx: 0, vy: 0,
            grounded: false, facing: 1,
            invincible: 0, flash: 0,
            runPhase: 0, dizzy: 0, dizzyAngle: 0,
            earBounce: 0,
        };
    }

    // ── Collision ──
    function rectOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function isOnGround(x, y, w, h) {
        for (const p of platforms) {
            if (p.type === 'gap') continue;
            if (x + w > p.x && x < p.x + p.w && y + h >= p.y && y + h <= p.y + 8) return p.y;
        }
        return null;
    }

    // ── Enemies (whimsical balloon creatures) ──
    function spawnEnemy() {
        const ex = cameraX + GAME_W + rng(20, 80);
        const roll = Math.random();
        let type, ey, hp, spd;
        if (roll < 0.3) {
            type = 'balloon'; hp = 1; spd = rng(1.5, 3); ey = rng(GAME_H - 280, GAME_H - 120);
        } else if (roll < 0.55) {
            type = 'toysoldier'; hp = 2; spd = rng(0.8, 1.8); ey = GAME_H - 40 - 30;
        } else if (roll < 0.75) {
            type = 'bounceball'; hp = 1; spd = rng(1, 2.5); ey = GAME_H - 80;
        } else if (roll < 0.9) {
            type = 'balloonanimal'; hp = 3; spd = rng(0.5, 1.5); ey = rng(GAME_H - 250, GAME_H - 150);
        } else {
            type = 'jackbox'; hp = 2; spd = rng(0.3, 1); ey = GAME_H - 40 - 35;
        }
        const color = pick(BUBBLE_COLORS);
        enemies.push({
            x: ex, y: ey, w: type === 'balloonanimal' ? 36 : 26, h: type === 'balloonanimal' ? 36 : 28,
            vx: -spd, vy: 0, type, color, hp,
            alive: true, phase: rng(0, Math.PI * 2), popScale: 1,
            bounceVy: type === 'bounceball' ? -6 : 0,
        });
    }

    // ── Boss: Giant Teddy Bear ──
    function spawnBoss() {
        bossActive = true;
        boss = {
            x: LEVEL_LENGTH - 180, y: GAME_H - 40 - 120, w: 100, h: 120,
            hp: 25, maxHp: 25,
            phase: 0, phaseTimer: 0, fireTimer: 0,
            alive: true, flash: 0,
            throwTimer: 60, armAngle: 0,
            projectiles: [],
        };
        sfxBossHit();
    }

    // ── Bubbles (projectiles) ──
    function fireBubble() {
        const now = performance.now();
        let cooldown = FIRE_COOLDOWN_MS;
        if (bubblePower === 'rapid') cooldown = 100;
        if (now - lastFireTime < cooldown) return;
        lastFireTime = now;

        const bx = player.x + (player.facing > 0 ? PLAYER_W + 2 : -6);
        const by = player.y + PLAYER_H * 0.4;
        sfxBubbleShoot();

        if (bubblePower === 'big') {
            bubbles.push({ x: bx, y: by, vx: player.facing * BUBBLE_SPEED * 0.8, vy: -1, size: 16, color: pick(BUBBLE_COLORS), life: 80, big: true });
        } else if (bubblePower === 'rainbow') {
            for (let i = -1; i <= 1; i++) {
                bubbles.push({ x: bx, y: by, vx: player.facing * BUBBLE_SPEED, vy: i * 2, size: 10, color: BUBBLE_COLORS[(frameCount + i) % BUBBLE_COLORS.length], life: 60, rainbow: true });
            }
        } else {
            bubbles.push({ x: bx, y: by, vx: player.facing * BUBBLE_SPEED, vy: rng(-0.5, 0.5), size: BUBBLE_SIZE, color: pick(BUBBLE_COLORS), life: 70 });
        }
    }

    // ── Particles ──
    function spawnParticles(x, y, color, count, spread = 3) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x, y, vx: rng(-spread, spread), vy: rng(-spread, spread),
                color, size: rng(2, 5), life: rng(15, 40), maxLife: 40,
            });
        }
    }

    function spawnBubblePopParticles(x, y, color) {
        // Ring of small circles expanding outward
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            particles.push({
                x, y, vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3,
                color, size: rng(3, 6), life: 20, maxLife: 20, type: 'bubble',
            });
        }
        // Shimmer sparkles
        for (let i = 0; i < 5; i++) {
            particles.push({
                x: x + rng(-8, 8), y: y + rng(-8, 8), vx: rng(-1, 1), vy: rng(-2, 0),
                color: '#FFD700', size: rng(2, 4), life: 25, maxLife: 25, type: 'sparkle',
            });
        }
    }

    function spawnCollectSparkle(x, y, color) {
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            particles.push({
                x, y, vx: Math.cos(angle) * 2, vy: Math.sin(angle) * 2 - 1,
                color, size: rng(2, 4), life: 20, maxLife: 20, type: 'sparkle',
            });
        }
    }

    function addScorePopup(x, y, text, color = '#FFD700') {
        scorePopups.push({ x, y, text, life: 70, maxLife: 70, color });
    }

    // ── Update ──
    function update(dt) {
        frameCount++;
        const env = getEnv();

        // ── Player Input ──
        player.vx = 0;
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) { player.vx = -PLAYER_SPEED; player.facing = -1; }
        if (keys['ArrowRight'] || keys['d'] || keys['D']) { player.vx = PLAYER_SPEED; player.facing = 1; }

        // Jump
        if ((keys[' '] || keys['ArrowUp'] || keys['w'] || keys['W']) && player.grounded) {
            player.vy = JUMP_VEL;
            player.grounded = false;
            sfxJump();
        }

        // Fire
        if (keys['z'] || keys['Z'] || keys['x'] || keys['X'] || keys['j'] || keys['J']) {
            fireBubble();
        }

        // ── Player Physics ──
        player.vy += GRAVITY;
        if (player.vy > MAX_FALL) player.vy = MAX_FALL;
        player.x += player.vx;
        player.y += player.vy;

        if (player.x < cameraX - 10) player.x = cameraX - 10;
        if (player.x > LEVEL_LENGTH) player.x = LEVEL_LENGTH;

        const groundY = isOnGround(player.x, player.y, PLAYER_W, PLAYER_H);
        if (groundY !== null && player.vy >= 0) {
            player.y = groundY - PLAYER_H;
            player.vy = 0;
            player.grounded = true;
        } else {
            player.grounded = false;
        }

        if (player.y > GAME_H + 60) hitPlayer();

        if (player.invincible > 0) player.invincible--;
        if (player.dizzy > 0) player.dizzy--;

        // Running animation
        if (Math.abs(player.vx) > 0.5 && player.grounded) {
            player.runPhase += 0.2;
            player.earBounce = Math.sin(player.runPhase * 2) * 2;
        } else {
            player.earBounce *= 0.9;
        }

        // Bubble power timer
        if (bubblePowerTimer > 0) {
            bubblePowerTimer--;
            if (bubblePowerTimer <= 0) bubblePower = 'normal';
        }

        // ── Camera ──
        envIndex = Math.min(3, Math.floor(player.x / (LEVEL_LENGTH / 4)));
        const targetCam = player.x - GAME_W * 0.35;
        cameraX += (targetCam - cameraX) * 0.08;
        if (cameraX < 0) cameraX = 0;
        if (cameraX > LEVEL_LENGTH - GAME_W) cameraX = LEVEL_LENGTH - GAME_W;

        // ── Bubbles ──
        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];
            b.x += b.vx;
            b.y += b.vy;
            b.vy += 0.02; // slight float up/down wobble
            b.life--;
            if (b.life <= 0 || b.x < cameraX - 30 || b.x > cameraX + GAME_W + 30 || b.y < -30 || b.y > GAME_H + 30) {
                if (b.life <= 0) spawnBubblePopParticles(b.x, b.y, b.color);
                bubbles.splice(i, 1);
                continue;
            }
            // Hit enemies
            let hitSomething = false;
            for (const e of enemies) {
                if (!e.alive) continue;
                if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
                    e.hp--;
                    sfxBubblePop();
                    spawnBubblePopParticles(b.x, b.y, b.color);
                    if (e.hp <= 0) {
                        e.alive = false;
                        const pts = e.type === 'balloonanimal' ? 300 : e.type === 'toysoldier' ? 200 : 100;
                        score += pts;
                        addScorePopup(e.x, e.y - 10, `+${pts}`);
                        // Pop animation particles
                        spawnParticles(e.x + e.w/2, e.y + e.h/2, e.color, 15, 4);
                        comboCount++;
                        comboTimer = 90;
                        if (comboCount >= 3) {
                            const bonus = comboCount * 50;
                            score += bonus;
                            addScorePopup(e.x, e.y - 30, `COMBO ${comboCount}x +${bonus}`, '#FF69B4');
                        }
                    }
                    hitSomething = true;
                    if (!b.rainbow) break; // rainbow pierces
                }
            }
            // Hit boss
            if (bossActive && boss && boss.alive) {
                if (b.x > boss.x && b.x < boss.x + boss.w && b.y > boss.y && b.y < boss.y + boss.h) {
                    boss.hp--;
                    boss.flash = 8;
                    sfxBossHit();
                    spawnBubblePopParticles(b.x, b.y, b.color);
                    hitSomething = true;
                    if (boss.hp <= 0) {
                        boss.alive = false;
                        sfxBossDefeat();
                        score += 5000;
                        addScorePopup(boss.x + boss.w/2, boss.y - 20, '+5000', '#FFD700');
                        spawnParticles(boss.x + boss.w/2, boss.y + boss.h/2, '#FFD700', 40, 8);
                        state = ST_WIN;
                        deathTimer = 180;
                    }
                }
            }
            if (hitSomething && !b.rainbow) {
                bubbles.splice(i, 1);
            }
        }

        // ── Enemies ──
        spawnTimer--;
        if (spawnTimer <= 0 && !bossActive) {
            spawnEnemy();
            spawnTimer = Math.max(30, spawnRate - Math.floor(player.x / 200));
        }

        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (!e.alive) { enemies.splice(i, 1); continue; }
            e.phase += 0.05;

            if (e.type === 'balloon') {
                e.x += e.vx;
                e.y += Math.sin(e.phase) * 1.2;
            } else if (e.type === 'toysoldier') {
                e.x += e.vx;
                // March animation via phase
            } else if (e.type === 'bounceball') {
                e.x += e.vx;
                e.vy += 0.3;
                e.y += e.vy;
                const gy2 = isOnGround(e.x, e.y, e.w, e.h);
                if (gy2 !== null && e.vy > 0) {
                    e.y = gy2 - e.h;
                    e.vy = -6;
                }
            } else if (e.type === 'balloonanimal') {
                e.x += e.vx;
                e.y += Math.sin(e.phase * 0.7) * 0.8;
            } else if (e.type === 'jackbox') {
                e.x += e.vx;
                // Pop up periodically
                if (Math.sin(e.phase * 2) > 0.8) e.y = GAME_H - 40 - 55;
                else e.y = GAME_H - 40 - 35;
            }

            // Off screen cleanup
            if (e.x < cameraX - 100) { enemies.splice(i, 1); continue; }

            // Hit player
            if (player.invincible <= 0 && player.dizzy <= 0) {
                if (rectOverlap({ x: player.x + 4, y: player.y + 4, w: PLAYER_W - 8, h: PLAYER_H - 8 },
                    { x: e.x, y: e.y, w: e.w, h: e.h })) {
                    hitPlayer();
                }
            }
        }

        // ── Boss update ──
        if (bossActive && boss && boss.alive) {
            boss.phaseTimer++;
            if (boss.flash > 0) boss.flash--;
            boss.armAngle = Math.sin(boss.phaseTimer * 0.03) * 0.3;

            // Throw toys at player
            boss.throwTimer--;
            if (boss.throwTimer <= 0) {
                boss.throwTimer = Math.max(30, 70 - (boss.maxHp - boss.hp) * 2);
                const dx = player.x - boss.x;
                const dy = player.y - boss.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                boss.projectiles.push({
                    x: boss.x + 20, y: boss.y + 30,
                    vx: (dx / dist) * 4, vy: (dy / dist) * 4 - 2,
                    type: pick(['teddybear','block','ball']),
                    life: 200, size: 14,
                });
            }

            // Update boss projectiles
            for (let i = boss.projectiles.length - 1; i >= 0; i--) {
                const p = boss.projectiles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.12;
                p.life--;
                if (p.life <= 0 || p.y > GAME_H + 20) { boss.projectiles.splice(i, 1); continue; }
                // Hit player
                if (player.invincible <= 0 && player.dizzy <= 0) {
                    const pr = p.size;
                    if (rectOverlap({ x: player.x + 4, y: player.y + 4, w: PLAYER_W - 8, h: PLAYER_H - 8 },
                        { x: p.x - pr, y: p.y - pr, w: pr * 2, h: pr * 2 })) {
                        hitPlayer();
                        boss.projectiles.splice(i, 1);
                    }
                }
            }
        }

        // Trigger boss near end of level
        if (!bossActive && player.x > LEVEL_LENGTH - 400) {
            spawnBoss();
        }

        // ── Collectibles ──
        for (const c of collectibles) {
            if (c.collected) continue;
            const cx = c.x, cy = c.y;
            if (Math.abs(cx - (player.x + PLAYER_W/2)) < 18 && Math.abs(cy - (player.y + PLAYER_H/2)) < 18) {
                c.collected = true;
                const pts = c.type === 'coin' ? 50 : c.type === 'star' ? 75 : 100;
                score += pts;
                sfxCoinCollect();
                const col = c.type === 'coin' ? '#FFD700' : c.type === 'star' ? '#87CEEB' : '#FF69B4';
                spawnCollectSparkle(cx, cy, col);
                addScorePopup(cx, cy - 10, `+${pts}`, col);

                // Check pattern completion
                if (c.patternId >= 0) {
                    const pat = patterns.find(p => p.id === c.patternId);
                    if (pat && !pat.complete) {
                        pat.collected++;
                        if (pat.collected >= pat.total) {
                            pat.complete = true;
                            const bonus = pat.total * 100;
                            score += bonus;
                            sfxPatternComplete();
                            addScorePopup(pat.x, GAME_H - 200, `PATTERN! +${bonus}`, '#FF1493');
                            // Big sparkle burst
                            spawnParticles(pat.x, GAME_H - 200, '#FFD700', 25, 6);
                        }
                    }
                }
            }
        }

        // ── Power-ups ──
        for (const pu of powerups) {
            if (!pu.active) continue;
            pu.bobPhase += 0.04;
            const puY = pu.y + Math.sin(pu.bobPhase) * 4;
            if (rectOverlap({ x: player.x, y: player.y, w: PLAYER_W, h: PLAYER_H },
                { x: pu.x, y: puY, w: pu.w, h: pu.h })) {
                pu.active = false;
                bubblePower = pu.type;
                bubblePowerTimer = 600; // ~10 seconds
                sfxPowerUp();
                const label = pu.type === 'big' ? 'BIG BUBBLES!' : pu.type === 'rapid' ? 'RAPID FIRE!' : 'RAINBOW POWER!';
                addScorePopup(pu.x, pu.y - 20, label, '#FF69B4');
                spawnParticles(pu.x + pu.w/2, puY + pu.h/2, '#FFD700', 12, 4);
            }
        }

        // ── Particles ──
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            if (p.type !== 'sparkle') p.vy += 0.1;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // ── Score Popups ──
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            scorePopups[i].y -= 0.8;
            scorePopups[i].life--;
            if (scorePopups[i].life <= 0) scorePopups.splice(i, 1);
        }

        // ── Combo Timer ──
        if (comboTimer > 0) {
            comboTimer--;
            if (comboTimer <= 0) comboCount = 0;
        }

        // ── Screen Shake ──
        if (screenShake > 0) screenShake--;
    }

    // ── Hit / Death ──
    function hitPlayer() {
        if (player.invincible > 0 || player.dizzy > 0) return;
        lives--;
        sfxHitDizzy();
        player.dizzy = 60;
        player.dizzyAngle = 0;
        player.invincible = 120;
        screenShake = 15;
        spawnParticles(player.x + PLAYER_W/2, player.y + PLAYER_H/2, '#FFD700', 8, 3);
        if (lives <= 0) {
            state = ST_GAMEOVER;
            deathTimer = 120;
        }
    }

    function respawn() {
        player.dizzy = 0;
        player.invincible = 120;
        state = ST_PLAY;
    }

    // ── Drawing ──

    // Draw Mickey Mouse
    function drawMickey(px, py, facing, runPhase, dizzy, invincible, earBounce) {
        ctx.save();
        const cx = gx(px + PLAYER_W/2);
        const cy = gy(py + PLAYER_H/2);

        // Invincibility blink
        if (invincible > 0 && Math.floor(invincible / 4) % 2) { ctx.restore(); return; }

        // Dizzy spin
        if (dizzy > 0) {
            ctx.translate(cx, cy);
            ctx.rotate(Math.sin(dizzy * 0.3) * 0.5);
            ctx.translate(-cx, -cy);
        }

        const s = gs(1);
        const headR = s * 11;
        const earR = s * 7;
        const earBob = gy(earBounce);

        // ── Legs (yellow shoes) ──
        const legOffset = player.grounded && Math.abs(player.vx) > 0.5 ? Math.sin(runPhase) * s * 5 : 0;
        // Left leg
        ctx.fillStyle = '#000';
        ctx.fillRect(cx - s * 6, cy + s * 8, s * 5, s * 10 + legOffset * 0.5);
        // Right leg
        ctx.fillRect(cx + s * 1, cy + s * 8, s * 5, s * 10 - legOffset * 0.5);
        // Yellow shoes
        ctx.fillStyle = '#FFD700';
        const shoeW = s * 9, shoeH = s * 5;
        ctx.beginPath();
        ctx.ellipse(cx - s * 5 + (facing > 0 ? s * 1 : -s * 1), cy + s * 19 + legOffset * 0.5, shoeW/2, shoeH/2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + s * 5 + (facing > 0 ? s * 1 : -s * 1), cy + s * 19 - legOffset * 0.5, shoeW/2, shoeH/2, 0, 0, Math.PI * 2);
        ctx.fill();

        // ── Body (red shorts) ──
        ctx.fillStyle = '#E11D48';
        ctx.beginPath();
        ctx.ellipse(cx, cy + s * 4, s * 9, s * 8, 0, 0, Math.PI * 2);
        ctx.fill();
        // White buttons on shorts
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(cx - s * 3, cy + s * 3, s * 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + s * 3, cy + s * 3, s * 1.5, 0, Math.PI * 2); ctx.fill();

        // ── Arms ──
        // Back arm
        ctx.fillStyle = '#000';
        const armBack = facing > 0 ? -1 : 1;
        ctx.fillRect(cx + armBack * s * 8, cy - s * 2, s * 4, s * 10);
        // White glove (back)
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(cx + armBack * s * 10, cy + s * 8, s * 4, 0, Math.PI * 2); ctx.fill();

        // Front arm (shooting arm)
        ctx.fillStyle = '#000';
        const armX = cx + facing * s * 8;
        const armAngle = Math.sin(frameCount * 0.1) * 0.1;
        ctx.save();
        ctx.translate(armX, cy);
        ctx.rotate(armAngle);
        ctx.fillRect(-s * 2, -s * 2, s * 4, s * 10);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, s * 10, s * 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // ── Head ──
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(cx, cy - s * 8, headR, 0, Math.PI * 2);
        ctx.fill();

        // ── Ears ──
        ctx.beginPath();
        ctx.arc(cx - s * 10, cy - s * 16 + earBob, earR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + s * 10, cy - s * 16 - earBob, earR, 0, Math.PI * 2);
        ctx.fill();

        // ── Face ──
        // Skin-color face area
        ctx.fillStyle = '#FDBCB4';
        ctx.beginPath();
        ctx.ellipse(cx, cy - s * 6, s * 7, s * 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(cx - s * 3, cy - s * 9, s * 3, s * 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + s * 3, cy - s * 9, s * 3, s * 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Pupils (looking in facing direction)
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(cx - s * 3 + facing * s * 1, cy - s * 9, s * 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + s * 3 + facing * s * 1, cy - s * 9, s * 1.5, 0, Math.PI * 2); ctx.fill();

        // Nose
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.ellipse(cx, cy - s * 5, s * 2.5, s * 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Smile
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = s * 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy - s * 3, s * 4, 0.2, Math.PI - 0.2);
        ctx.stroke();

        // Dizzy stars
        if (dizzy > 0) {
            ctx.fillStyle = '#FFD700';
            for (let i = 0; i < 3; i++) {
                const da = (dizzy * 0.15) + i * (Math.PI * 2 / 3);
                const dx = cx + Math.cos(da) * s * 16;
                const dy = cy - s * 20 + Math.sin(da) * s * 6;
                drawStar4(dx, dy, s * 3);
            }
        }

        ctx.restore();
    }

    function drawStar4(x, y, r) {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
            const dist = i % 2 === 0 ? r : r * 0.4;
            const sx = x + Math.cos(angle) * dist;
            const sy = y + Math.sin(angle) * dist;
            if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();
    }

    // Draw balloon enemy
    function drawBalloon(e) {
        const cx = gx(e.x + e.w/2), cy = gy(e.y + e.h/2);
        const r = gs(e.w/2);
        // Balloon body
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.2, r, r * 1.2, 0, 0, Math.PI * 2); ctx.fill();
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.5, r * 0.25, r * 0.35, -0.3, 0, Math.PI * 2); ctx.fill();
        // String
        ctx.strokeStyle = '#888';
        ctx.lineWidth = gs(1);
        ctx.beginPath(); ctx.moveTo(cx, cy + r); ctx.quadraticCurveTo(cx + gs(3), cy + r + gs(10), cx - gs(2), cy + r + gs(18)); ctx.stroke();
        // Knot
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(cx, cy + r, gs(2), 0, Math.PI * 2); ctx.fill();
    }

    function drawToySoldier(e) {
        const cx = gx(e.x + e.w/2), cy = gy(e.y + e.h/2);
        const s = gs(1);
        // Body (blue uniform)
        ctx.fillStyle = '#4169E1';
        ctx.fillRect(cx - s * 8, cy - s * 4, s * 16, s * 16);
        // Head
        ctx.fillStyle = '#FDBCB4';
        ctx.beginPath(); ctx.arc(cx, cy - s * 8, s * 6, 0, Math.PI * 2); ctx.fill();
        // Hat
        ctx.fillStyle = '#DC143C';
        ctx.fillRect(cx - s * 6, cy - s * 15, s * 12, s * 4);
        ctx.fillRect(cx - s * 4, cy - s * 19, s * 8, s * 5);
        // Eyes
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(cx - s * 2, cy - s * 8, s * 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + s * 2, cy - s * 8, s * 1.5, 0, Math.PI * 2); ctx.fill();
        // Legs (marching)
        const legOff = Math.sin(e.phase * 3) * s * 4;
        ctx.fillStyle = '#222';
        ctx.fillRect(cx - s * 6, cy + s * 12, s * 5, s * 6 + legOff);
        ctx.fillRect(cx + s * 1, cy + s * 12, s * 5, s * 6 - legOff);
    }

    function drawBounceBall(e) {
        const cx = gx(e.x + e.w/2), cy = gy(e.y + e.h/2);
        const r = gs(e.w/2);
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        // Stripe
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = gs(2);
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2); ctx.stroke();
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
    }

    function drawBalloonAnimal(e) {
        const cx = gx(e.x + e.w/2), cy = gy(e.y + e.h/2);
        const s = gs(1);
        ctx.fillStyle = e.color;
        // Body segments (twisted balloon dog shape)
        ctx.beginPath(); ctx.ellipse(cx, cy, s * 14, s * 8, 0, 0, Math.PI * 2); ctx.fill();
        // Head
        ctx.beginPath(); ctx.ellipse(cx + s * 14 * e.vx / Math.abs(e.vx || 1) * -1, cy - s * 6, s * 8, s * 7, 0, 0, Math.PI * 2); ctx.fill();
        // Legs
        ctx.beginPath(); ctx.ellipse(cx - s * 8, cy + s * 10, s * 3, s * 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + s * 8, cy + s * 10, s * 3, s * 6, 0, 0, Math.PI * 2); ctx.fill();
        // Tail
        ctx.beginPath(); ctx.arc(cx + s * 16 * e.vx / Math.abs(e.vx || 1), cy, s * 4, 0, Math.PI * 2); ctx.fill();
        // Eyes
        ctx.fillStyle = '#000';
        const headX = cx + s * 14 * (e.vx < 0 ? 1 : -1);
        ctx.beginPath(); ctx.arc(headX - s * 2, cy - s * 8, s * 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(headX + s * 2, cy - s * 8, s * 1.5, 0, Math.PI * 2); ctx.fill();
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.ellipse(cx - s * 4, cy - s * 4, s * 4, s * 3, 0, 0, Math.PI * 2); ctx.fill();
    }

    function drawJackBox(e) {
        const cx = gx(e.x + e.w/2), cy = gy(e.y + e.h/2);
        const s = gs(1);
        // Box
        ctx.fillStyle = '#FF6347';
        ctx.fillRect(cx - s * 10, cy, s * 20, s * 14);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = s * 1.5;
        ctx.strokeRect(cx - s * 10, cy, s * 20, s * 14);
        // Star on box
        ctx.fillStyle = '#FFD700';
        drawStar4(cx, cy + s * 7, s * 4);
        // Spring & head (pops up)
        const popUp = Math.sin(e.phase * 2) > 0.8;
        if (popUp) {
            ctx.strokeStyle = '#888';
            ctx.lineWidth = s * 1.5;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const sx = cx + Math.sin(i * 1.2) * s * 4;
                const sy = cy - i * s * 3;
                if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
            }
            ctx.stroke();
            // Clown head
            ctx.fillStyle = '#FDBCB4';
            ctx.beginPath(); ctx.arc(cx, cy - s * 18, s * 7, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#FF0000';
            ctx.beginPath(); ctx.arc(cx, cy - s * 15, s * 3, 0, Math.PI * 2); ctx.fill(); // nose
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(cx - s * 3, cy - s * 20, s * 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + s * 3, cy - s * 20, s * 1.5, 0, Math.PI * 2); ctx.fill();
        }
    }

    // Draw boss (Giant Teddy Bear)
    function drawBoss() {
        if (!boss || !boss.alive) return;
        const bx = gx(boss.x + boss.w/2), by = gy(boss.y + boss.h/2);
        const s = gs(1);

        ctx.save();
        if (boss.flash > 0 && boss.flash % 2) { ctx.globalAlpha = 0.5; }

        // Body
        ctx.fillStyle = '#D2691E';
        ctx.beginPath(); ctx.ellipse(bx, by + s * 15, s * 40, s * 45, 0, 0, Math.PI * 2); ctx.fill();
        // Belly
        ctx.fillStyle = '#DEB887';
        ctx.beginPath(); ctx.ellipse(bx, by + s * 20, s * 25, s * 30, 0, 0, Math.PI * 2); ctx.fill();
        // Head
        ctx.fillStyle = '#D2691E';
        ctx.beginPath(); ctx.arc(bx, by - s * 30, s * 28, 0, Math.PI * 2); ctx.fill();
        // Ears
        ctx.beginPath(); ctx.arc(bx - s * 24, by - s * 50, s * 12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx + s * 24, by - s * 50, s * 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#DEB887';
        ctx.beginPath(); ctx.arc(bx - s * 24, by - s * 50, s * 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx + s * 24, by - s * 50, s * 7, 0, Math.PI * 2); ctx.fill();
        // Face
        ctx.fillStyle = '#DEB887';
        ctx.beginPath(); ctx.ellipse(bx, by - s * 26, s * 16, s * 12, 0, 0, Math.PI * 2); ctx.fill();
        // Eyes
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(bx - s * 10, by - s * 35, s * 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx + s * 10, by - s * 35, s * 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(bx - s * 9, by - s * 36, s * 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx + s * 11, by - s * 36, s * 2, 0, Math.PI * 2); ctx.fill();
        // Nose
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(bx, by - s * 26, s * 5, s * 3.5, 0, 0, Math.PI * 2); ctx.fill();
        // Mouth
        ctx.strokeStyle = '#000';
        ctx.lineWidth = s * 1.5;
        ctx.beginPath(); ctx.arc(bx, by - s * 22, s * 8, 0.2, Math.PI - 0.2); ctx.stroke();
        // Arms
        ctx.fillStyle = '#D2691E';
        ctx.save();
        ctx.translate(bx - s * 38, by);
        ctx.rotate(-0.3 + boss.armAngle);
        ctx.beginPath(); ctx.ellipse(0, 0, s * 12, s * 25, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.translate(bx + s * 38, by);
        ctx.rotate(0.3 - boss.armAngle);
        ctx.beginPath(); ctx.ellipse(0, 0, s * 12, s * 25, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // Legs
        ctx.beginPath(); ctx.ellipse(bx - s * 16, by + s * 52, s * 14, s * 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(bx + s * 16, by + s * 52, s * 14, s * 10, 0, 0, Math.PI * 2); ctx.fill();
        // Bow tie
        ctx.fillStyle = '#FF1493';
        ctx.beginPath(); ctx.moveTo(bx, by - s * 10); ctx.lineTo(bx - s * 10, by - s * 16); ctx.lineTo(bx - s * 10, by - s * 4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(bx, by - s * 10); ctx.lineTo(bx + s * 10, by - s * 16); ctx.lineTo(bx + s * 10, by - s * 4); ctx.closePath(); ctx.fill();

        ctx.restore();

        // HP bar
        const hpW = gs(80);
        const hpH = gs(8);
        const hpX = bx - hpW / 2;
        const hpY = by - gs(70);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(hpX, hpY, hpW, hpH);
        ctx.fillStyle = boss.hp > boss.maxHp * 0.3 ? '#22C55E' : '#EF4444';
        ctx.fillRect(hpX, hpY, hpW * (boss.hp / boss.maxHp), hpH);

        // Boss projectiles
        for (const p of boss.projectiles) {
            const px2 = gx(p.x), py2 = gy(p.y);
            const ps = gs(p.size);
            if (p.type === 'teddybear') {
                ctx.fillStyle = '#8B4513';
                ctx.beginPath(); ctx.arc(px2, py2, ps, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#DEB887';
                ctx.beginPath(); ctx.arc(px2, py2, ps * 0.5, 0, Math.PI * 2); ctx.fill();
            } else if (p.type === 'block') {
                ctx.fillStyle = '#FF6347';
                ctx.fillRect(px2 - ps, py2 - ps, ps * 2, ps * 2);
                ctx.fillStyle = '#FFD700';
                ctx.font = `bold ${ps}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('A', px2, py2);
            } else {
                ctx.fillStyle = pick(BUBBLE_COLORS);
                ctx.beginPath(); ctx.arc(px2, py2, ps, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.beginPath(); ctx.arc(px2 - ps * 0.3, py2 - ps * 0.3, ps * 0.3, 0, Math.PI * 2); ctx.fill();
            }
        }
    }

    // Draw bubble projectile
    function drawBubble(b) {
        const bx = gx(b.x), by = gy(b.y), r = gs(b.size);
        // Outer bubble
        ctx.fillStyle = b.color;
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // Rainbow shimmer ring
        ctx.strokeStyle = b.rainbow ? `hsl(${(frameCount * 8 + b.x) % 360}, 80%, 70%)` : b.color;
        ctx.lineWidth = gs(1.5);
        ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.stroke();
        // Shine highlight
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.arc(bx - r * 0.3, by - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
    }

    // Draw collectible
    function drawCollectible(c) {
        if (c.collected) return;
        const cx = gx(c.x), cy = gy(c.y);
        const bob = Math.sin(frameCount * 0.06 + c.x * 0.1) * gs(3);
        const s = gs(1);

        if (c.type === 'coin') {
            ctx.fillStyle = '#FFD700';
            ctx.beginPath(); ctx.arc(cx, cy + bob, s * 7, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#DAA520';
            ctx.beginPath(); ctx.arc(cx, cy + bob, s * 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#FFD700';
            ctx.font = `bold ${s * 8}px sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('$', cx, cy + bob);
        } else if (c.type === 'star') {
            ctx.fillStyle = '#87CEEB';
            drawStar4(cx, cy + bob, s * 7);
            ctx.fillStyle = '#E0F0FF';
            drawStar4(cx, cy + bob, s * 3.5);
        } else { // note
            ctx.fillStyle = '#FF69B4';
            ctx.font = `${s * 14}px serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('\u266A', cx, cy + bob);
        }

        // Sparkle
        if (frameCount % 20 < 5) {
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath(); ctx.arc(cx + s * 4, cy + bob - s * 4, s * 2, 0, Math.PI * 2); ctx.fill();
        }
    }

    // Draw power-up crate
    function drawPowerUpCrate(pu) {
        if (!pu.active) return;
        const px2 = gx(pu.x), py2 = gy(pu.y + Math.sin(pu.bobPhase) * 4);
        const s = gs(1);
        const w = gs(pu.w), h = gs(pu.h);
        // Crate
        ctx.fillStyle = pu.type === 'big' ? '#4169E1' : pu.type === 'rapid' ? '#22C55E' : '#FF1493';
        ctx.fillRect(px2, py2, w, h);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = s * 1.5;
        ctx.strokeRect(px2, py2, w, h);
        // Icon
        ctx.fillStyle = '#FFD700';
        ctx.font = `bold ${s * 12}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const icon = pu.type === 'big' ? 'B' : pu.type === 'rapid' ? 'R' : '\u2605';
        ctx.fillText(icon, px2 + w/2, py2 + h/2);
        // Glow
        ctx.fillStyle = `rgba(255,215,0,${0.15 + Math.sin(pu.bobPhase * 2) * 0.1})`;
        ctx.beginPath(); ctx.arc(px2 + w/2, py2 + h/2, w, 0, Math.PI * 2); ctx.fill();
    }

    // ── Main Draw ──
    function draw() {
        const env = getEnv();
        ctx.save();

        // Screen shake
        if (screenShake > 0) {
            ctx.translate(rng(-gs(3), gs(3)), rng(-gs(3), gs(3)));
        }

        // ── Background ──
        // Sky gradient per environment
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, env.bg1);
        grad.addColorStop(0.5, env.bg2);
        grad.addColorStop(1, env.bg3);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Decorative stars/sparkles in sky
        for (const st of stars) {
            const sx = ((st.x - cameraX * 0.02) % (GAME_W * 2) + GAME_W * 2) % (GAME_W * 2);
            const twinkle = Math.sin(frameCount * 0.05 + st.twinkle) * 0.3 + 0.7;
            ctx.fillStyle = `rgba(255,255,255,${st.b * twinkle})`;
            drawStar4(gs(sx * 0.5), gs(st.y), gs(st.s));
        }

        // Parallax background layers
        for (let li = 0; li < bgLayers.length; li++) {
            const layer = bgLayers[li];
            const envL = getEnvForX(cameraX + GAME_W/2);
            ctx.fillStyle = li === 0 ? envL.bg2 + '60' : li === 1 ? envL.bg3 + '80' : envL.accent + '40';
            for (const el of layer.elements) {
                const sx = (el.x - cameraX * layer.speed) * SCALE;
                if (sx > W + gs(200) || sx + gs(el.w) < -gs(200)) continue;
                const sy = H - gs(40) - gs(el.h);
                if (el.shape === 'hill') {
                    ctx.beginPath();
                    ctx.moveTo(sx, H - gs(40));
                    ctx.quadraticCurveTo(sx + gs(el.w/2), sy, sx + gs(el.w), H - gs(40));
                    ctx.fill();
                } else if (el.shape === 'cloud') {
                    const cy2 = gs(el.h * 0.3);
                    ctx.beginPath();
                    ctx.ellipse(sx + gs(el.w/2), cy2, gs(el.w/2), gs(el.h * 0.3), 0, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillRect(sx, sy, gs(el.w * 0.4), gs(el.h));
                    ctx.fillRect(sx + gs(el.w * 0.3), sy + gs(el.h * 0.2), gs(el.w * 0.4), gs(el.h * 0.8));
                }
            }
        }

        // ── Platforms ──
        for (const p of platforms) {
            const px2 = gx(p.x), py2 = gy(p.y);
            if (px2 > W + gs(20) || px2 + gs(p.w) < -gs(20)) continue;
            const pEnv = getEnvForX(p.x);
            if (p.type === 'ground') {
                ctx.fillStyle = pEnv.ground;
                ctx.fillRect(px2, py2, gs(p.w), gs(p.h));
                // Ground decoration (grass/candy/clouds/bricks depending on env)
                ctx.fillStyle = pEnv.accent + '60';
                for (let gx2 = p.x; gx2 < p.x + p.w; gx2 += 30) {
                    const gsx = gx(gx2);
                    if (gsx > W + 10 || gsx < -10) continue;
                    ctx.fillRect(gsx, py2, gs(2), gs(6));
                }
            } else {
                ctx.fillStyle = pEnv.plat;
                ctx.fillRect(px2, py2, gs(p.w), gs(p.h));
                // Platform top highlight
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.fillRect(px2, py2, gs(p.w), gs(3));
                // Block pattern
                ctx.strokeStyle = 'rgba(0,0,0,0.15)';
                ctx.lineWidth = gs(1);
                for (let bx2 = 0; bx2 < p.w; bx2 += 20) {
                    ctx.strokeRect(px2 + gs(bx2), py2, gs(20), gs(p.h));
                }
            }
        }

        // ── Collectibles ──
        for (const c of collectibles) {
            if (c.collected) continue;
            const cx = c.x;
            if (cx < cameraX - 30 || cx > cameraX + GAME_W + 30) continue;
            drawCollectible(c);
        }

        // ── Power-ups ──
        for (const pu of powerups) {
            if (!pu.active) continue;
            if (pu.x < cameraX - 30 || pu.x > cameraX + GAME_W + 30) continue;
            drawPowerUpCrate(pu);
        }

        // ── Enemies ──
        for (const e of enemies) {
            if (!e.alive) continue;
            if (e.x < cameraX - 50 || e.x > cameraX + GAME_W + 50) continue;
            if (e.type === 'balloon') drawBalloon(e);
            else if (e.type === 'toysoldier') drawToySoldier(e);
            else if (e.type === 'bounceball') drawBounceBall(e);
            else if (e.type === 'balloonanimal') drawBalloonAnimal(e);
            else if (e.type === 'jackbox') drawJackBox(e);
        }

        // ── Boss ──
        if (bossActive) drawBoss();

        // ── Bubbles ──
        for (const b of bubbles) {
            drawBubble(b);
        }

        // ── Player (Mickey) ──
        drawMickey(player.x, player.y, player.facing, player.runPhase, player.dizzy, player.invincible, player.earBounce);

        // ── Particles ──
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            if (p.type === 'sparkle') {
                ctx.fillStyle = p.color;
                drawStar4(gx(p.x), gy(p.y), gs(p.size));
            } else if (p.type === 'bubble') {
                ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(gx(p.x), gy(p.y), gs(p.size), 0, Math.PI * 2); ctx.fill();
            } else {
                ctx.fillStyle = p.color;
                ctx.fillRect(gx(p.x), gy(p.y), gs(p.size), gs(p.size));
            }
            ctx.globalAlpha = 1;
        }

        // ── Score Popups ──
        ctx.textAlign = 'center';
        for (const sp of scorePopups) {
            const alpha = sp.life / sp.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = sp.color;
            ctx.font = `bold ${gs(14)}px sans-serif`;
            ctx.fillText(sp.text, gx(sp.x), gy(sp.y));
        }
        ctx.globalAlpha = 1;

        // ── HUD ──
        drawHUD();

        // ── On-screen controls ──
        drawOnScreenControls();

        // ── Environment label (on zone change) ──
        const envShowTimer = Math.max(0, 120 - ((player.x % (LEVEL_LENGTH / 4)) / 2));
        if (envShowTimer > 80) {
            const alpha = Math.min(1, (envShowTimer - 80) / 20);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(W/2 - gs(100), gs(80), gs(200), gs(36));
            ctx.fillStyle = '#FFD700';
            ctx.font = `bold ${gs(18)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(getEnvName(), W/2, gs(104));
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    function drawHUD() {
        const s = gs(1);
        const pad = gs(12);

        // Score
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(pad - s * 4, pad - s * 4, gs(160), gs(28));
        ctx.fillStyle = '#FFD700';
        ctx.font = `bold ${gs(16)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE: ${score}`, pad, pad + gs(14));

        // Lives (mickey heads)
        for (let i = 0; i < lives; i++) {
            const lx = pad + i * gs(28);
            const ly = pad + gs(34);
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(lx + gs(8), ly + gs(8), gs(7), 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(lx + gs(2), ly, gs(4), 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(lx + gs(14), ly, gs(4), 0, Math.PI * 2); ctx.fill();
        }

        // Power-up indicator
        if (bubblePower !== 'normal') {
            const puLabel = bubblePower === 'big' ? 'BIG' : bubblePower === 'rapid' ? 'RAPID' : 'RAINBOW';
            const puColor = bubblePower === 'big' ? '#4169E1' : bubblePower === 'rapid' ? '#22C55E' : '#FF1493';
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(W - gs(120) - pad, pad - s * 4, gs(120), gs(28));
            ctx.fillStyle = puColor;
            ctx.font = `bold ${gs(14)}px sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText(puLabel, W - pad, pad + gs(14));
            // Timer bar
            const timerW = gs(100) * (bubblePowerTimer / 600);
            ctx.fillStyle = puColor;
            ctx.fillRect(W - gs(110) - pad + gs(100) - timerW, pad + gs(20), timerW, gs(4));
        }

        // Combo indicator
        if (comboCount >= 2 && comboTimer > 0) {
            ctx.fillStyle = '#FF69B4';
            ctx.font = `bold ${gs(16)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(`COMBO x${comboCount}`, W / 2, gs(30));
        }
    }

    // ── Title Screen ──
    function drawTitle() {
        ctx.fillStyle = '#1a1a3e';
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#2a1a4e');
        grad.addColorStop(1, '#0a0a2e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Floating bubbles in background
        for (let i = 0; i < 15; i++) {
            const bx2 = (Math.sin(frameCount * 0.01 + i * 2) * 0.5 + 0.5) * W;
            const by2 = ((frameCount * 0.3 + i * 80) % (H + 40)) - 20;
            const br = gs(rng(8, 20));
            ctx.fillStyle = BUBBLE_COLORS[i % BUBBLE_COLORS.length] + '40';
            ctx.beginPath(); ctx.arc(bx2, H - by2, br, 0, Math.PI * 2); ctx.fill();
        }

        // Title
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700';
        ctx.font = `bold ${gs(48)}px sans-serif`;
        const titleBounce = Math.sin(frameCount * 0.05) * gs(5);
        ctx.fillText('MICKEY POP', W/2, H * 0.3 + titleBounce);

        // Subtitle
        ctx.fillStyle = '#FF69B4';
        ctx.font = `${gs(18)}px sans-serif`;
        ctx.fillText('Bubble Blasting Adventure!', W/2, H * 0.38);

        // Mini Mickey silhouette
        const mcx = W/2, mcy = H * 0.55;
        const ms = gs(2);
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(mcx, mcy, ms * 14, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mcx - ms * 12, mcy - ms * 14, ms * 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mcx + ms * 12, mcy - ms * 14, ms * 8, 0, Math.PI * 2); ctx.fill();

        // Controls hint
        ctx.fillStyle = '#aaa';
        ctx.font = `${gs(13)}px sans-serif`;
        ctx.fillText('Arrow Keys = Move/Jump    Z = Shoot Bubbles', W/2, H * 0.75);

        // Start prompt
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${gs(18)}px sans-serif`;
            ctx.fillText('PRESS SPACE TO START', W/2, H * 0.85);
        }
    }

    // ── Game Over / Win Screen ──
    function drawGameOver() {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';

        if (state === ST_WIN) {
            ctx.fillStyle = '#FFD700';
            ctx.font = `bold ${gs(36)}px sans-serif`;
            ctx.fillText('YOU DID IT!', W/2, H * 0.35);
            ctx.fillStyle = '#FF69B4';
            ctx.font = `${gs(20)}px sans-serif`;
            ctx.fillText('The Toy Kingdom is saved!', W/2, H * 0.44);
        } else {
            ctx.fillStyle = '#FF6B9D';
            ctx.font = `bold ${gs(36)}px sans-serif`;
            ctx.fillText('OH NO!', W/2, H * 0.35);
        }

        ctx.fillStyle = '#fff';
        ctx.font = `${gs(20)}px sans-serif`;
        ctx.fillText(`SCORE: ${score}`, W/2, H * 0.55);

        if (bestScore > 0) {
            ctx.font = `${gs(14)}px sans-serif`;
            ctx.fillStyle = score >= bestScore ? '#FFD700' : '#888';
            ctx.fillText(score >= bestScore ? `NEW BEST: ${bestScore}` : `BEST: ${bestScore}`, W/2, H * 0.63);
        }

        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink && deathTimer <= 0) {
            ctx.fillStyle = '#aaa';
            ctx.font = `${gs(14)}px sans-serif`;
            ctx.fillText('PRESS SPACE TO CONTINUE', W/2, H * 0.7);
        }
    }

    // ── Canvas Sizing ──
    function fitCanvas() {
        if (!canvas) return;
        let pw = canvas.width || 960;
        let ph = canvas.height || 540;
        const parent = canvas.parentElement;
        if (parent && parent.clientWidth > 50 && parent.clientHeight > 50) {
            pw = parent.clientWidth;
            ph = parent.clientHeight;
        }
        const aspect = GAME_W / GAME_H;
        let drawW, drawH;
        if (pw / ph > aspect) { drawH = ph; drawW = Math.floor(ph * aspect); }
        else { drawW = pw; drawH = Math.floor(pw / aspect); }
        drawW = Math.max(drawW, 480);
        drawH = Math.max(drawH, 270);
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
        const dt = Math.min((ts - (lastTime || ts)) / 16.67, 3);
        lastTime = ts;
        frameCount++;

        if (state === ST_TITLE) {
            drawTitle();
        } else if (state === ST_PLAY) {
            update(dt);
            draw();
        } else if (state === ST_DEAD) {
            draw();
            deathTimer--;
            if (deathTimer <= 0) respawn();
        } else if (state === ST_GAMEOVER || state === ST_WIN) {
            if (state === ST_WIN) draw();
            drawGameOver();
            deathTimer--;
        }

        animFrame = requestAnimationFrame(gameLoop);
    }

    function startGame() {
        score = 0; lives = 3; level = 1;
        cameraX = 0; envIndex = 0;
        bubblePower = 'normal'; bubblePowerTimer = 0;
        lastFireTime = 0;
        comboCount = 0; comboTimer = 0;
        bubbles = []; enemies = []; particles = []; scorePopups = []; powerups = [];
        screenShake = 0;
        bossActive = false; boss = null;
        spawnTimer = 60; spawnRate = 80;
        deathTimer = 0;
        generateLevel();
        createBgLayers();
        resetPlayer();
        state = ST_PLAY;
    }

    function endGame() {
        if (score > bestScore) {
            bestScore = score;
            try { localStorage.setItem('ywa_mickeypop_best', bestScore); } catch(e) {}
        }
        const duration = 0;
        if (gameOverCB) gameOverCB({ score, level, duration, lives });
    }

    // ── Input ──
    function onKeyDown(e) {
        keys[e.key] = true;
        if (state === ST_TITLE && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); startGame(); }
        if ((state === ST_GAMEOVER || state === ST_WIN) && deathTimer <= 0 && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); endGame(); }
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    }
    function onKeyUp(e) { keys[e.key] = false; }

    // Touch controls
    function onTouchStart(e) {
        e.preventDefault();
        handleTouch(e.touches);
        if (state === ST_TITLE) startGame();
        if ((state === ST_GAMEOVER || state === ST_WIN) && deathTimer <= 0) endGame();
    }
    function onTouchMove(e) { e.preventDefault(); handleTouch(e.touches); }
    function onTouchEnd(e) {
        e.preventDefault();
        if (e.touches.length === 0) keys = {};
        else handleTouch(e.touches);
    }
    function handleTouch(touches) {
        keys = {};
        const rect = canvas.getBoundingClientRect();
        for (const t of touches) {
            const tx = (t.clientX - rect.left) / rect.width;
            const ty = (t.clientY - rect.top) / rect.height;
            if (ty < 0.4) { keys[' '] = true; } // jump
            else if (ty > 0.6 && tx < 0.25) { keys['ArrowLeft'] = true; }
            else if (ty > 0.6 && tx > 0.75) { keys['ArrowRight'] = true; }
            else { keys['z'] = true; } // shoot
        }
    }

    // ── Init / Destroy ──
    function init(cvs, playerData, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOver;
        gameActive = true;
        playerColor = playerData?.color || '#FF69B4';

        const themeId = playerData?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) playerColor = _t.colors[0] || playerColor;

        state = ST_TITLE;
        frameCount = 0;
        lastTime = 0;
        keys = {};
        cameraX = 0;
        score = 0; lives = 3; level = 1;
        bestScore = parseInt(localStorage.getItem('ywa_mickeypop_best') || '0', 10);
        envIndex = 0;
        screenShake = 0;
        bubblePower = 'normal'; bubblePowerTimer = 0;
        comboCount = 0; comboTimer = 0;

        W = canvas.width || 960;
        H = canvas.height || 540;
        SCALE = W / GAME_W;
        DPR = Math.min(window.devicePixelRatio || 1, 3);

        createStars();

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
