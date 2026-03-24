/* YWA Defender — Horizontal scrolling shooter with humanoid rescue */
window.Defender = (() => {

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
    const WORLD_W = GAME_W * 6; // wrap-around world width
    const TERRAIN_H = 60; // terrain height at bottom
    const MINIMAP_H = 28, MINIMAP_Y = 4;
    const SHIP_W = 32, SHIP_H = 16;
    const PLAYER_SPEED = 5, THRUST_ACCEL = 0.35, FRICTION = 0.96;
    const MAX_VX = 7, MAX_VY = 4.5;
    const LASER_SPEED = 14, LASER_LEN = 18;
    const FIRE_COOLDOWN = 120; // ms
    const SMART_BOMB_RADIUS = 300;
    const INITIAL_LIVES = 3, INITIAL_BOMBS = 3;

    // Enemy types
    const EN_LANDER = 0, EN_MUTANT = 1, EN_BOMBER = 2, EN_POD = 3, EN_SWARMER = 4, EN_BAITER = 5;
    const ENEMY_NAMES = ['LANDER','MUTANT','BOMBER','POD','SWARMER','BAITER'];
    const ENEMY_SCORES = [150, 200, 250, 1000, 200, 400];
    const ENEMY_COLORS = ['#22C55E','#EF4444','#A855F7','#F59E0B','#EC4899','#FF6347'];
    const BONUS_LIFE_INTERVAL = 10000;
    const HYPERSPACE_DEATH_CHANCE = 0.10;
    const BAITER_SPAWN_DELAY = 1200; // frames before baiter appears

    // States
    const ST_TITLE = 0, ST_PLAY = 1, ST_DEAD = 2, ST_GAMEOVER = 3, ST_EXPLODE = 4;

    // Game state
    let canvas, ctx, W, H, SCALE, DPR, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor, themeAccent;
    let highScore = parseInt(localStorage.getItem('ywa_defender_hi') || '0');
    let state, frameCount, lastTime, keys = {};
    let score, lives, level, bombs;
    let ship, lasers, enemies, particles, scorePopups;
    let humanoids, terrain;
    let screenShake, deathTimer, explodeTimer;
    let stars;
    let planetExploded;
    let waveEnemiesLeft, waveTotal;
    let lastFireTime;
    let audioCtx;
    let waveFrameCount; // frames elapsed in current wave (for baiter spawn)
    let nextBonusScore; // threshold for next bonus life
    let shockwaves; // explosion shockwave rings
    let terrainGlow; // smart bomb terrain glow timer
    let rescueParticles; // humanoid rescue celebration particles

    // ── Audio ──
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
    function playSweep(f1, f2, dur, type = 'sawtooth', vol = 0.1) {
        try {
            const a = getAudio(), o = a.createOscillator(), g = a.createGain();
            o.type = type; o.frequency.setValueAtTime(f1, a.currentTime);
            o.frequency.linearRampToValueAtTime(f2, a.currentTime + dur);
            g.gain.setValueAtTime(vol, a.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
            o.connect(g); g.connect(a.destination);
            o.start(); o.stop(a.currentTime + dur);
        } catch {}
    }
    function sfxShoot() { playSweep(1200, 200, 0.08, 'square', 0.08); }
    function sfxHit() { playSweep(400, 80, 0.2, 'sawtooth', 0.12); }
    function sfxBomb() { playSweep(100, 30, 0.6, 'sawtooth', 0.18); playSound(60, 0.8, 'sine', 0.15); }
    function sfxDeath() { playSweep(600, 40, 0.5, 'sawtooth', 0.15); }
    function sfxCatch() { playSound(880, 0.1, 'sine', 0.12); setTimeout(() => playSound(1320, 0.15, 'sine', 0.12), 80); }
    function sfxAbduct() { playSweep(300, 800, 0.3, 'triangle', 0.06); }
    function sfxMutate() { playSweep(200, 1400, 0.25, 'sawtooth', 0.1); }
    function sfxExplode() { playSweep(80, 20, 1.2, 'sawtooth', 0.2); }
    function sfxWave() { playSound(660, 0.15, 'sine', 0.1); setTimeout(() => playSound(880, 0.2, 'sine', 0.1), 120); }
    function sfxHyperspace() { playSweep(2000, 100, 0.3, 'sine', 0.12); }
    function sfxBonusLife() { [0,80,160,240].forEach((d,i) => setTimeout(() => playSound(660 + i*110, 0.15, 'sine', 0.15), d)); }
    function sfxBaiter() { playSweep(800, 400, 0.15, 'square', 0.06); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const gx = v => v * SCALE;
    const gy = v => v * SCALE;
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));

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



    function wrapX(x) {
        while (x < 0) x += WORLD_W;
        while (x >= WORLD_W) x -= WORLD_W;
        return x;
    }
    function worldDistX(ax, bx) {
        let d = bx - ax;
        if (d > WORLD_W / 2) d -= WORLD_W;
        if (d < -WORLD_W / 2) d += WORLD_W;
        return d;
    }
    function toScreen(wx) {
        let d = wx - ship.x;
        if (d > WORLD_W / 2) d -= WORLD_W;
        if (d < -WORLD_W / 2) d += WORLD_W;
        return GAME_W / 2 + d;
    }
    function onScreen(wx, margin = 60) {
        const sx = toScreen(wx);
        return sx > -margin && sx < GAME_W + margin;
    }

    function darken(hex, f) {
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        return `rgb(${Math.floor(r*f)},${Math.floor(g*f)},${Math.floor(b*f)})`;
    }
    function lighten(hex, amt) {
        const r = Math.min(255, parseInt(hex.slice(1,3),16) + 255*amt);
        const g = Math.min(255, parseInt(hex.slice(3,5),16) + 255*amt);
        const b = Math.min(255, parseInt(hex.slice(5,7),16) + 255*amt);
        return `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
    }

    // ── Terrain generation ──
    function generateTerrain() {
        terrain = [];
        const segments = 200;
        const segW = WORLD_W / segments;
        let h = 30 + Math.random() * 20;
        for (let i = 0; i <= segments; i++) {
            h += (Math.random() - 0.5) * 8;
            h = Math.max(15, Math.min(TERRAIN_H, h));
            terrain.push({ x: i * segW, h });
        }
    }

    function terrainHeightAt(wx) {
        const segW = WORLD_W / (terrain.length - 1);
        const idx = wrapX(wx) / segW;
        const i = Math.floor(idx);
        const t = idx - i;
        const a = terrain[i % terrain.length].h;
        const b = terrain[(i + 1) % terrain.length].h;
        return a + (b - a) * t;
    }

    function createStars() {
        stars = [];
        for (let i = 0; i < 180; i++) {
            stars.push({ x: Math.random() * WORLD_W, y: Math.random() * (GAME_H - TERRAIN_H - 40),
                s: rand(0.5, 2.2), b: rand(0.3, 1), layer: randInt(0, 2) });
        }
    }

    function createHumanoids() {
        humanoids = [];
        const count = 10;
        for (let i = 0; i < count; i++) {
            humanoids.push({
                x: rand(100, WORLD_W - 100),
                grounded: true, vy: 0,
                alive: true, captured: false, captor: null,
                falling: false, walkDir: Math.random() < 0.5 ? -1 : 1,
                walkTimer: randInt(60, 200)
            });
        }
    }

    function spawnWave() {
        level++;
        waveFrameCount = 0;
        const landerCount = Math.min(5 + level * 2, 24);
        const bomberCount = Math.min(Math.floor(level / 2), 6);
        const podCount = Math.min(Math.floor(level / 3), 4);
        waveTotal = landerCount + bomberCount + podCount;
        waveEnemiesLeft = waveTotal;
        for (let i = 0; i < landerCount; i++) spawnEnemy(EN_LANDER);
        for (let i = 0; i < bomberCount; i++) spawnEnemy(EN_BOMBER);
        for (let i = 0; i < podCount; i++) spawnEnemy(EN_POD);
        sfxWave();
    }

    function spawnEnemy(type, x, y) {
        const ex = x !== undefined ? x : rand(0, WORLD_W);
        const ey = y !== undefined ? y : rand(40, GAME_H * 0.4);
        const e = { type, x: ex, y: ey, vx: rand(-1, 1), vy: rand(-0.5, 0.5),
            alive: true, hp: 1, timer: randInt(60, 180),
            target: null, carrying: null, phase: 0 };
        if (type === EN_MUTANT) { e.hp = 2; e.vx = rand(-3, 3); e.vy = rand(-2, 2); }
        if (type === EN_BOMBER) { e.hp = 1; e.vx = rand(-1.5, 1.5); e.bombTimer = randInt(90, 200); }
        if (type === EN_POD) { e.hp = 3; e.vx = rand(-0.8, 0.8); }
        if (type === EN_SWARMER) { e.hp = 1; e.vx = rand(-2.5, 2.5); e.vy = rand(-2, 2); }
        if (type === EN_BAITER) { e.hp = 2; e.vx = rand(-4, 4); e.vy = rand(-3, 3); }
        enemies.push(e);
    }

    // ── Particles & score popups ──
    function spawnParticles(x, y, count, color, sizeMin = 1, sizeMax = 4, speedMax = 4) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = rand(0.5, speedMax);
            particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                size: rand(sizeMin, sizeMax), life: rand(20, 50), maxLife: 50,
                color: Math.random() < 0.3 ? '#fff' : color });
        }
    }
    function addScorePopup(x, y, text) {
        scorePopups.push({ x, y, text: String(text), life: 50, maxLife: 50 });
    }

    // ── Ship reset ──
    function resetShip() {
        ship = { x: WORLD_W / 2, y: GAME_H * 0.4, vx: 0, vy: 0,
            facing: 1, thrust: false, invincible: 90 };
    }

    // ── Update ──
    function update(dt) {
        // Ship movement
        if (keys['ArrowLeft'] || keys['a']) { ship.vx -= THRUST_ACCEL * dt; ship.facing = -1; }
        if (keys['ArrowRight'] || keys['d']) { ship.vx += THRUST_ACCEL * dt; ship.facing = 1; }
        if (keys['ArrowUp'] || keys['w']) ship.vy -= THRUST_ACCEL * dt;
        if (keys['ArrowDown'] || keys['s']) ship.vy += THRUST_ACCEL * dt;
        ship.thrust = !!(keys['ArrowLeft'] || keys['ArrowRight'] || keys['a'] || keys['d']);
        ship.vx *= FRICTION; ship.vy *= FRICTION;
        ship.vx = Math.max(-MAX_VX, Math.min(MAX_VX, ship.vx));
        ship.vy = Math.max(-MAX_VY, Math.min(MAX_VY, ship.vy));
        ship.x = wrapX(ship.x + ship.vx * dt);
        ship.y = Math.max(MINIMAP_H + MINIMAP_Y + 10, Math.min(GAME_H - TERRAIN_H - SHIP_H - 5, ship.y + ship.vy * dt));
        if (ship.invincible > 0) ship.invincible--;

        // Shooting
        const now = performance.now();
        if ((keys[' '] || keys['x']) && now - lastFireTime > FIRE_COOLDOWN) {
            lastFireTime = now;
            lasers.push({ x: ship.x + ship.facing * SHIP_W / 2, y: ship.y + SHIP_H / 2 - 1,
                vx: LASER_SPEED * ship.facing, life: 60 });
            sfxShoot();
        }
        // Smart bomb
        if ((keys['z'] || keys['Z']) && bombs > 0) {
            keys['z'] = false; keys['Z'] = false;
            bombs--;
            sfxBomb();
            screenShake = 15;
            terrainGlow = 30; // terrain glow on smart bomb
            // Expanding shockwave
            shockwaves.push({ x: ship.x, y: ship.y, radius: 0, maxRadius: SMART_BOMB_RADIUS * 1.5, life: 40 });
            // Destroy all on-screen enemies
            for (const e of enemies) {
                if (!e.alive) continue;
                if (onScreen(e.x, 50)) {
                    killEnemy(e);
                }
            }
        }

        // Hyperspace (H key)
        if (keys['h'] || keys['H']) {
            keys['h'] = false; keys['H'] = false;
            sfxHyperspace();
            // Random teleport with 10% death chance
            if (Math.random() < HYPERSPACE_DEATH_CHANCE) {
                playerDeath();
            } else {
                ship.x = wrapX(rand(0, WORLD_W));
                ship.y = rand(MINIMAP_H + MINIMAP_Y + 30, GAME_H * 0.5);
                ship.vx = 0; ship.vy = 0;
                ship.invincible = 60;
                spawnParticles(ship.x, ship.y, 20, '#FFF', 1, 3, 5);
            }
        }

        // Baiter spawn (if wave takes too long)
        waveFrameCount += dt;
        if (waveFrameCount > BAITER_SPAWN_DELAY && enemies.filter(e => e.alive && e.type === EN_BAITER).length === 0 && enemies.filter(e => e.alive).length > 0) {
            spawnEnemy(EN_BAITER, wrapX(ship.x + (Math.random() < 0.5 ? -1 : 1) * GAME_W * 0.6), rand(60, GAME_H * 0.4));
            sfxBaiter();
            waveFrameCount = BAITER_SPAWN_DELAY - 400; // next baiter in ~400 frames
        }

        // Bonus life every 10,000 points
        if (score >= nextBonusScore) {
            lives++;
            nextBonusScore += BONUS_LIFE_INTERVAL;
            sfxBonusLife();
            addScorePopup(toScreen(ship.x), ship.y - 20, 'EXTRA LIFE!');
        }

        // Lasers
        for (const l of lasers) {
            l.x += l.vx * dt;
            l.life -= dt;
        }
        lasers = lasers.filter(l => l.life > 0);

        // Enemy AI
        for (const e of enemies) {
            if (!e.alive) continue;
            e.timer -= dt;
            switch (e.type) {
                case EN_LANDER: updateLander(e, dt); break;
                case EN_MUTANT: updateMutant(e, dt); break;
                case EN_BOMBER: updateBomber(e, dt); break;
                case EN_POD: updatePod(e, dt); break;
                case EN_SWARMER: updateSwarmer(e, dt); break;
                case EN_BAITER: updateBaiter(e, dt); break;
            }
            e.x = wrapX(e.x + e.vx * dt);
            e.y += e.vy * dt;
            e.y = Math.max(MINIMAP_H + MINIMAP_Y + 8, Math.min(GAME_H - 20, e.y));
        }

        // Humanoid updates
        for (const h of humanoids) {
            if (!h.alive) continue;
            if (h.captured && h.captor) {
                // Being carried up
                h.x = h.captor.x;
                if (h.captor.y < MINIMAP_H + MINIMAP_Y + 20) {
                    // Reached top: mutate!
                    h.alive = false; h.captured = false;
                    const captor = h.captor;
                    captor.carrying = null;
                    // Transform captor into mutant
                    captor.type = EN_MUTANT; captor.hp = 2;
                    captor.vx = rand(-3, 3); captor.vy = rand(-2, 2);
                    sfxMutate();
                    spawnParticles(captor.x, captor.y, 12, '#EF4444', 2, 5);
                    checkPlanetState();
                }
            } else if (h.falling) {
                h.vy += 0.15 * dt;
                h.x = wrapX(h.x);
                const groundY = GAME_H - terrainHeightAt(h.x) - 6;
                h.y = (h.y || GAME_H * 0.3) + h.vy * dt;
                if (h.y >= groundY) {
                    // Survived the fall if dropped from reasonable height
                    h.y = groundY; h.falling = false; h.grounded = true; h.vy = 0;
                }
                // Check if player catches
                if (!h.grounded) {
                    const dx = Math.abs(worldDistX(ship.x, h.x));
                    const dy = Math.abs(ship.y - h.y);
                    if (dx < 20 && dy < 20 && ship.invincible <= 60) {
                        h.falling = false; h.grounded = false;
                        // Carry to ground
                        h.captured = false;
                        h.y = GAME_H - terrainHeightAt(h.x) - 6;
                        h.grounded = true;
                        score += 500;
                        addScorePopup(toScreen(h.x), ship.y, '+500 RESCUE');
                        sfxCatch();
                        // Celebration particles around rescued humanoid
                        const colors = ['#FBBF24','#22C55E','#F472B6','#60A5FA','#FFF'];
                        for (let j = 0; j < 15; j++) {
                            const angle = Math.random() * Math.PI * 2;
                            const speed = rand(0.5, 3);
                            rescueParticles.push({
                                x: h.x, y: ship.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1,
                                color: colors[randInt(0, colors.length - 1)], size: rand(1.5, 4), life: rand(25, 55), maxLife: 55
                            });
                        }
                    }
                }
            } else if (h.grounded) {
                // Walk around
                h.walkTimer -= dt;
                if (h.walkTimer <= 0) {
                    h.walkDir *= -1;
                    h.walkTimer = randInt(80, 250);
                }
                h.x = wrapX(h.x + h.walkDir * 0.15 * dt);
                h.y = GAME_H - terrainHeightAt(h.x) - 6;
            }
        }

        // Collision: lasers vs enemies
        for (const l of lasers) {
            for (const e of enemies) {
                if (!e.alive) continue;
                const dx = Math.abs(worldDistX(l.x, e.x));
                const dy = Math.abs(l.y - e.y);
                if (dx < 14 && dy < 14) {
                    e.hp--;
                    l.life = 0;
                    spawnParticles(e.x, e.y, 6, ENEMY_COLORS[e.type], 1, 3, 3);
                    if (e.hp <= 0) killEnemy(e);
                    else sfxHit();
                    break;
                }
            }
        }

        // Collision: enemies vs ship
        if (ship.invincible <= 0) {
            for (const e of enemies) {
                if (!e.alive) continue;
                const dx = Math.abs(worldDistX(ship.x, e.x));
                const dy = Math.abs(ship.y + SHIP_H / 2 - e.y);
                if (dx < 18 && dy < 14) {
                    playerDeath();
                    break;
                }
            }
        }

        // Particles
        for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.vy += 0.03; }
        particles = particles.filter(p => p.life > 0);
        // Score popups
        for (const p of scorePopups) { p.y -= 0.5 * dt; p.life -= dt; }
        scorePopups = scorePopups.filter(p => p.life > 0);

        // Screen shake decay
        if (screenShake > 0) screenShake -= dt;
        if (terrainGlow > 0) terrainGlow -= dt;

        // Shockwaves
        for (let i = shockwaves.length - 1; i >= 0; i--) {
            const sw = shockwaves[i];
            sw.radius += 8 * dt;
            sw.life -= dt;
            if (sw.life <= 0 || sw.radius > sw.maxRadius) shockwaves.splice(i, 1);
        }

        // Rescue celebration particles
        for (let i = rescueParticles.length - 1; i >= 0; i--) {
            const rp = rescueParticles[i];
            rp.x += rp.vx * dt; rp.y += rp.vy * dt; rp.vy += 0.02;
            rp.life -= dt;
            if (rp.life <= 0) rescueParticles.splice(i, 1);
        }

        // Wave completion
        enemies = enemies.filter(e => e.alive);
        if (enemies.length === 0 && state === ST_PLAY) {
            spawnWave();
        }
    }

    function updateLander(e, dt) {
        if (!e.carrying && !e.target) {
            // Look for a humanoid to grab
            e.phase = 0;
            const available = humanoids.filter(h => h.alive && h.grounded && !h.captured);
            if (available.length && e.timer <= 0) {
                e.target = available[randInt(0, available.length - 1)];
                e.timer = randInt(120, 300);
            }
            // Float around
            e.vx += (Math.random() - 0.5) * 0.1;
            e.vy += (Math.random() - 0.5) * 0.1;
            e.vx = Math.max(-1.2, Math.min(1.2, e.vx));
            e.vy = Math.max(-0.8, Math.min(0.8, e.vy));
        } else if (e.target && !e.carrying) {
            // Descend toward target humanoid
            const dx = worldDistX(e.x, e.target.x);
            const dy = (GAME_H - terrainHeightAt(e.target.x) - 12) - e.y;
            e.vx = dx * 0.02;
            e.vy = dy * 0.02;
            // Check grab
            if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && e.target.alive && !e.target.captured) {
                e.carrying = e.target;
                e.target.captured = true;
                e.target.captor = e;
                e.target.grounded = false;
                e.target = null;
                sfxAbduct();
            }
            if (e.target && !e.target.alive) e.target = null;
        } else if (e.carrying) {
            // Ascend with humanoid
            e.vx *= 0.95;
            e.vy = -1.0;
        }
    }

    function updateMutant(e, dt) {
        // Aggressively chase player
        const dx = worldDistX(e.x, ship.x);
        const dy = ship.y - e.y;
        e.vx += dx * 0.008 * dt;
        e.vy += dy * 0.008 * dt;
        e.vx = Math.max(-3.5, Math.min(3.5, e.vx));
        e.vy = Math.max(-2.5, Math.min(2.5, e.vy));
    }

    function updateBomber(e, dt) {
        // Move in sine wave, drop bombs
        e.phase += 0.02 * dt;
        e.vy = Math.sin(e.phase) * 1.2;
        e.vx = Math.max(-1.5, Math.min(1.5, e.vx));
        e.bombTimer -= dt;
        if (e.bombTimer <= 0 && onScreen(e.x)) {
            e.bombTimer = randInt(80, 160);
            // Drop a mine (small particle that drifts down)
            spawnParticles(e.x, e.y + 8, 1, '#A855F7', 3, 5, 0.5);
        }
    }

    function updatePod(e, dt) {
        // Drift slowly
        e.vx += (Math.random() - 0.5) * 0.05;
        e.vy += (Math.random() - 0.5) * 0.05;
        e.vx = Math.max(-0.8, Math.min(0.8, e.vx));
        e.vy = Math.max(-0.5, Math.min(0.5, e.vy));
    }

    function updateSwarmer(e, dt) {
        // Erratic fast movement toward player
        const dx = worldDistX(e.x, ship.x);
        const dy = ship.y - e.y;
        e.vx += dx * 0.005 * dt + (Math.random() - 0.5) * 0.5;
        e.vy += dy * 0.005 * dt + (Math.random() - 0.5) * 0.5;
        e.vx = Math.max(-3, Math.min(3, e.vx));
        e.vy = Math.max(-2.5, Math.min(2.5, e.vy));
    }

    function updateBaiter(e, dt) {
        // Very fast, aggressive pursuit of player
        const dx = worldDistX(e.x, ship.x);
        const dy = ship.y - e.y;
        e.vx += dx * 0.012 * dt + (Math.random() - 0.5) * 0.3;
        e.vy += dy * 0.012 * dt + (Math.random() - 0.5) * 0.3;
        e.vx = Math.max(-5, Math.min(5, e.vx));
        e.vy = Math.max(-3.5, Math.min(3.5, e.vy));
    }

    function killEnemy(e) {
        e.alive = false;
        const sx = toScreen(e.x);
        score += ENEMY_SCORES[e.type];
        addScorePopup(sx, e.y, '+' + ENEMY_SCORES[e.type]);
        spawnParticles(e.x, e.y, 18, ENEMY_COLORS[e.type], 1, 5, 5);
        sfxHit();
        screenShake = Math.max(screenShake, 4);
        // Release carried humanoid
        if (e.carrying) {
            const h = e.carrying;
            h.captured = false; h.captor = null;
            h.falling = true; h.vy = 0; h.y = e.y;
            e.carrying = null;
        }
        // Pod splits into swarmers
        if (e.type === EN_POD) {
            for (let i = 0; i < 4; i++) spawnEnemy(EN_SWARMER, e.x + rand(-15, 15), e.y + rand(-15, 15));
        }
    }

    function checkPlanetState() {
        const aliveCount = humanoids.filter(h => h.alive).length;
        if (aliveCount === 0 && !planetExploded) {
            planetExploded = true;
            sfxExplode();
            screenShake = 30;
            // All enemies become mutants
            for (const e of enemies) {
                if (!e.alive) continue;
                e.type = EN_MUTANT; e.hp = 2;
                e.vx = rand(-3, 3); e.vy = rand(-2, 2);
            }
            // Big explosion particles
            for (let i = 0; i < 80; i++) {
                spawnParticles(rand(0, WORLD_W), GAME_H - TERRAIN_H, 1, '#F59E0B', 2, 6, 6);
            }
        }
    }

    function playerDeath() {
        sfxDeath();
        spawnParticles(ship.x, ship.y + SHIP_H / 2, 35, playerColor, 1, 5, 6);
        screenShake = 20;
        lives--;
        if (lives < 0) {
            state = ST_GAMEOVER;
            deathTimer = 120;
            if (score > highScore) { highScore = score; try { localStorage.setItem('ywa_defender_hi', String(highScore)); } catch {} }
        } else {
            state = ST_DEAD;
            deathTimer = 90;
        }
    }

    function respawn() {
        resetShip();
        state = ST_PLAY;
    }

    // ── Draw ──
    function draw() {
        ctx.save();
        // Screen shake
        if (screenShake > 0) {
            const sx = (Math.random() - 0.5) * screenShake * 1.5;
            const sy = (Math.random() - 0.5) * screenShake * 1.5;
            ctx.translate(sx * SCALE, sy * SCALE);
        }

        // Background gradient
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, '#020210');
        bgGrad.addColorStop(0.5, '#060618');
        bgGrad.addColorStop(0.85, '#0a0820');
        bgGrad.addColorStop(1, '#120a10');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Stars (parallax)
        for (const s of stars) {
            const parallax = 1 - s.layer * 0.25;
            let sx = s.x - ship.x * parallax;
            sx = ((sx % WORLD_W) + WORLD_W) % WORLD_W;
            sx = (sx / WORLD_W) * GAME_W;
            const flicker = s.b + Math.sin(frameCount * 0.02 + s.x * 0.1) * 0.15;
            ctx.globalAlpha = Math.max(0.1, Math.min(1, flicker));
            ctx.fillStyle = s.layer === 0 ? '#E0E7FF' : (s.layer === 1 ? '#A5B4FC' : '#6366F1');
            ctx.fillRect(gs(sx), gs(s.y), gs(s.s), gs(s.s));
        }
        ctx.globalAlpha = 1;

        // Terrain
        drawTerrain();

        // Abduction beams
        for (const e of enemies) {
            if (!e.alive) continue;
            if (e.type === EN_LANDER && (e.target || e.carrying)) {
                const sx = toScreen(e.x);
                if (sx > -60 && sx < GAME_W + 60) {
                    const beamTop = e.y + 8;
                    const beamBot = GAME_H - terrainHeightAt(e.x);
                    const grad = ctx.createLinearGradient(gs(sx), gs(beamTop), gs(sx), gs(beamBot));
                    grad.addColorStop(0, 'rgba(34,197,94,0.35)');
                    grad.addColorStop(0.5, 'rgba(34,197,94,0.15)');
                    grad.addColorStop(1, 'rgba(34,197,94,0.02)');
                    ctx.fillStyle = grad;
                    const bw = 12 + Math.sin(frameCount * 0.15) * 4;
                    ctx.fillRect(gs(sx - bw / 2), gs(beamTop), gs(bw), gs(beamBot - beamTop));
                }
            }
        }

        // Humanoids
        for (const h of humanoids) {
            if (!h.alive) continue;
            const sx = toScreen(h.x);
            if (sx < -20 || sx > GAME_W + 20) continue;
            const hy = h.grounded ? GAME_H - terrainHeightAt(h.x) - 6 : (h.y || GAME_H * 0.5);
            // Stick figure
            ctx.fillStyle = '#F59E0B';
            ctx.beginPath();
            ctx.arc(gs(sx), gs(hy - 5), gs(2.5), 0, Math.PI * 2); // head
            ctx.fill();
            ctx.strokeStyle = '#F59E0B';
            ctx.lineWidth = gs(1.2);
            ctx.beginPath();
            ctx.moveTo(gs(sx), gs(hy - 2.5));
            ctx.lineTo(gs(sx), gs(hy + 3)); // body
            ctx.stroke();
            // Arms
            ctx.beginPath();
            const armWave = h.captured ? Math.sin(frameCount * 0.3) * 2 : 0;
            ctx.moveTo(gs(sx - 3), gs(hy - 1 + armWave));
            ctx.lineTo(gs(sx + 3), gs(hy - 1 - armWave));
            ctx.stroke();
            // Legs
            ctx.beginPath();
            const legAnim = h.grounded ? Math.sin(frameCount * 0.1 + h.x) * 1.5 : 0;
            ctx.moveTo(gs(sx), gs(hy + 3));
            ctx.lineTo(gs(sx - 2 + legAnim), gs(hy + 7));
            ctx.moveTo(gs(sx), gs(hy + 3));
            ctx.lineTo(gs(sx + 2 - legAnim), gs(hy + 7));
            ctx.stroke();
        }

        // Enemies
        for (const e of enemies) {
            if (!e.alive) continue;
            const sx = toScreen(e.x);
            if (sx < -30 || sx > GAME_W + 30) continue;
            drawEnemy(e, sx);
        }

        // Lasers
        for (const l of lasers) {
            const sx = toScreen(l.x);
            if (sx < -30 || sx > GAME_W + 30) continue;
            const alpha = Math.min(1, l.life / 15);
            // Trail
            ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.3})`;
            ctx.lineWidth = gs(3);
            ctx.beginPath();
            ctx.moveTo(gs(sx - (l.vx > 0 ? LASER_LEN : -LASER_LEN)), gs(l.y));
            ctx.lineTo(gs(sx), gs(l.y));
            ctx.stroke();
            // Core
            ctx.strokeStyle = playerColor;
            ctx.shadowColor = playerColor;
            ctx.shadowBlur = gs(6);
            ctx.lineWidth = gs(2);
            ctx.beginPath();
            ctx.moveTo(gs(sx - (l.vx > 0 ? LASER_LEN * 0.5 : -LASER_LEN * 0.5)), gs(l.y));
            ctx.lineTo(gs(sx), gs(l.y));
            ctx.stroke();
            // Bright tip
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(gs(sx), gs(l.y), gs(1.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Ship
        if (state !== ST_DEAD && state !== ST_GAMEOVER) {
            drawShip();
        }

        // Particles
        for (const p of particles) {
            const sx = toScreen(p.x);
            if (sx < -20 || sx > GAME_W + 20) continue;
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(gs(sx - p.size / 2), gs(p.y - p.size / 2), gs(p.size), gs(p.size));
        }
        ctx.globalAlpha = 1;

        // Score popups
        for (const p of scorePopups) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#FBBF24';
            ctx.shadowColor = '#FBBF24';
            ctx.shadowBlur = gs(5);
            ctx.font = `bold ${gs(11)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(p.text, gs(p.x), gs(p.y));
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;

        // Shockwave rings
        for (const sw of shockwaves) {
            const sx = toScreen(sw.x);
            const alpha = sw.life / 40;
            ctx.globalAlpha = alpha * 0.6;
            ctx.strokeStyle = '#FFF';
            ctx.lineWidth = gs(3 * alpha);
            ctx.shadowColor = '#F59E0B';
            ctx.shadowBlur = gs(10);
            ctx.beginPath();
            ctx.arc(gs(sx), gs(sw.y), gs(sw.radius), 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;

        // Rescue celebration particles
        for (const rp of rescueParticles) {
            const rpsx = toScreen(rp.x);
            if (rpsx < -20 || rpsx > GAME_W + 20) continue;
            const alpha = rp.life / rp.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = rp.color;
            const twinkle = Math.sin(frameCount * 0.3 + rp.x) > 0 ? rp.size : rp.size * 0.6;
            ctx.beginPath();
            ctx.arc(gs(rpsx), gs(rp.y), gs(twinkle), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Minimap
        drawMinimap();

        // HUD
        drawHUD();

        // Vignette
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.9);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);

        if (state === ST_PLAY) drawOnScreenControls(ctx, W, H, gs, ['FIRE', 'BOMB'], 'LRUD');

        ctx.restore();
    }

    function drawShip() {
        const sx = GAME_W / 2; // ship always centered
        const sy = ship.y;
        const f = ship.facing;

        if (ship.invincible > 0 && Math.floor(ship.invincible / 3) % 2) return; // blink

        // Engine thrust flame that scales with thrust intensity
        const thrustIntensity = Math.abs(ship.vx) / MAX_VX;
        if (ship.thrust || thrustIntensity > 0.2) {
            const intensity = Math.max(thrustIntensity, 0.3);
            const flameLen = (6 + intensity * 14) + Math.random() * 6 * intensity;
            const flameW = (3 + intensity * 5) + Math.random() * 2;
            // Outer flame
            ctx.fillStyle = '#F97316';
            ctx.shadowColor = '#F97316';
            ctx.shadowBlur = gs(6 + intensity * 10);
            ctx.beginPath();
            ctx.moveTo(gs(sx - f * SHIP_W / 2), gs(sy + SHIP_H / 2 - flameW / 2));
            ctx.lineTo(gs(sx - f * (SHIP_W / 2 + flameLen)), gs(sy + SHIP_H / 2));
            ctx.lineTo(gs(sx - f * SHIP_W / 2), gs(sy + SHIP_H / 2 + flameW / 2));
            ctx.fill();
            // Mid flame
            ctx.fillStyle = '#F59E0B';
            const midLen = flameLen * 0.7;
            const midW = flameW * 0.7;
            ctx.beginPath();
            ctx.moveTo(gs(sx - f * SHIP_W / 2), gs(sy + SHIP_H / 2 - midW / 2));
            ctx.lineTo(gs(sx - f * (SHIP_W / 2 + midLen)), gs(sy + SHIP_H / 2));
            ctx.lineTo(gs(sx - f * SHIP_W / 2), gs(sy + SHIP_H / 2 + midW / 2));
            ctx.fill();
            // Inner white-hot core
            ctx.fillStyle = '#FEF3C7';
            const coreLen = flameLen * 0.35;
            const coreW = flameW * 0.35;
            ctx.beginPath();
            ctx.moveTo(gs(sx - f * SHIP_W / 2), gs(sy + SHIP_H / 2 - coreW / 2));
            ctx.lineTo(gs(sx - f * (SHIP_W / 2 + coreLen)), gs(sy + SHIP_H / 2));
            ctx.lineTo(gs(sx - f * SHIP_W / 2), gs(sy + SHIP_H / 2 + coreW / 2));
            ctx.fill();
            ctx.shadowBlur = 0;
            // Exhaust particles at high thrust
            if (intensity > 0.5 && Math.random() < 0.4) {
                spawnParticles(ship.x - f * SHIP_W / 2, ship.y + SHIP_H / 2, 1,
                    Math.random() < 0.5 ? '#F59E0B' : '#FEF3C7', 0.5, 2, 2);
            }
        }

        // Ship body
        ctx.fillStyle = playerColor;
        ctx.shadowColor = playerColor;
        ctx.shadowBlur = gs(4);
        ctx.beginPath();
        // Pointed nose, wide body
        ctx.moveTo(gs(sx + f * SHIP_W / 2), gs(sy + SHIP_H / 2)); // nose
        ctx.lineTo(gs(sx - f * SHIP_W / 3), gs(sy + 2));           // top back
        ctx.lineTo(gs(sx - f * SHIP_W / 2), gs(sy + 3));           // top fin
        ctx.lineTo(gs(sx - f * SHIP_W / 2), gs(sy + SHIP_H - 3)); // bottom fin
        ctx.lineTo(gs(sx - f * SHIP_W / 3), gs(sy + SHIP_H - 2)); // bottom back
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Cockpit
        ctx.fillStyle = lighten(playerColor, 0.25);
        ctx.beginPath();
        ctx.ellipse(gs(sx + f * 4), gs(sy + SHIP_H / 2), gs(5), gs(3), 0, 0, Math.PI * 2);
        ctx.fill();

        // Accent stripe
        ctx.strokeStyle = themeAccent;
        ctx.lineWidth = gs(1.5);
        ctx.beginPath();
        ctx.moveTo(gs(sx + f * SHIP_W * 0.35), gs(sy + SHIP_H / 2));
        ctx.lineTo(gs(sx - f * SHIP_W * 0.35), gs(sy + SHIP_H / 2));
        ctx.stroke();

        // Wing detail
        ctx.fillStyle = darken(playerColor, 0.6);
        ctx.fillRect(gs(sx - f * SHIP_W / 2 + (f > 0 ? 0 : -3)), gs(sy + 1), gs(6), gs(3));
        ctx.fillRect(gs(sx - f * SHIP_W / 2 + (f > 0 ? 0 : -3)), gs(sy + SHIP_H - 4), gs(6), gs(3));
    }

    function drawEnemy(e, sx) {
        const color = ENEMY_COLORS[e.type];
        const pulse = 0.8 + Math.sin(frameCount * 0.1 + e.x) * 0.2;

        switch (e.type) {
            case EN_LANDER: {
                // UFO shape
                ctx.fillStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur = gs(4);
                ctx.beginPath();
                ctx.ellipse(gs(sx), gs(e.y), gs(10), gs(5), 0, 0, Math.PI * 2);
                ctx.fill();
                // Dome
                ctx.fillStyle = lighten(color, 0.3);
                ctx.beginPath();
                ctx.ellipse(gs(sx), gs(e.y - 3), gs(5), gs(4), 0, Math.PI, 0);
                ctx.fill();
                // Lights
                ctx.fillStyle = '#fff';
                for (let i = -1; i <= 1; i++) {
                    ctx.beginPath();
                    ctx.arc(gs(sx + i * 5), gs(e.y + 2), gs(1), 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
                break;
            }
            case EN_MUTANT: {
                // Angry mutated form
                ctx.fillStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur = gs(6 * pulse);
                ctx.beginPath();
                const spikes = 6;
                for (let i = 0; i < spikes; i++) {
                    const a = (i / spikes) * Math.PI * 2 + frameCount * 0.05;
                    const r = i % 2 === 0 ? 10 : 5;
                    ctx.lineTo(gs(sx + Math.cos(a) * r), gs(e.y + Math.sin(a) * r));
                }
                ctx.closePath();
                ctx.fill();
                // Eye
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(gs(sx), gs(e.y), gs(3), 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(gs(sx + 1), gs(e.y), gs(1.5), 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                break;
            }
            case EN_BOMBER: {
                // Diamond shape
                ctx.fillStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur = gs(4);
                ctx.beginPath();
                ctx.moveTo(gs(sx), gs(e.y - 8));
                ctx.lineTo(gs(sx + 8), gs(e.y));
                ctx.lineTo(gs(sx), gs(e.y + 8));
                ctx.lineTo(gs(sx - 8), gs(e.y));
                ctx.closePath();
                ctx.fill();
                // Inner glow
                ctx.fillStyle = lighten(color, 0.4);
                ctx.beginPath();
                ctx.moveTo(gs(sx), gs(e.y - 4));
                ctx.lineTo(gs(sx + 4), gs(e.y));
                ctx.lineTo(gs(sx), gs(e.y + 4));
                ctx.lineTo(gs(sx - 4), gs(e.y));
                ctx.closePath();
                ctx.fill();
                ctx.shadowBlur = 0;
                break;
            }
            case EN_POD: {
                // Large sphere
                ctx.fillStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur = gs(5);
                ctx.beginPath();
                ctx.arc(gs(sx), gs(e.y), gs(12 * pulse), 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = darken(color, 0.5);
                ctx.beginPath();
                ctx.arc(gs(sx), gs(e.y), gs(8), 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(gs(sx - 2), gs(e.y - 2), gs(4), 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                break;
            }
            case EN_SWARMER: {
                // Tiny fast dot
                ctx.fillStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur = gs(4);
                ctx.beginPath();
                ctx.arc(gs(sx), gs(e.y), gs(4), 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(gs(sx - 1), gs(e.y - 1), gs(1.5), 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                break;
            }
            case EN_BAITER: {
                // Fast wedge shape with afterburner trail
                ctx.fillStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur = gs(8 * pulse);
                const bDir = e.vx > 0 ? 1 : -1;
                ctx.beginPath();
                ctx.moveTo(gs(sx + bDir * 14), gs(e.y));
                ctx.lineTo(gs(sx - bDir * 8), gs(e.y - 7));
                ctx.lineTo(gs(sx - bDir * 4), gs(e.y));
                ctx.lineTo(gs(sx - bDir * 8), gs(e.y + 7));
                ctx.closePath();
                ctx.fill();
                // Bright core
                ctx.fillStyle = lighten(color, 0.4);
                ctx.beginPath();
                ctx.moveTo(gs(sx + bDir * 8), gs(e.y));
                ctx.lineTo(gs(sx - bDir * 2), gs(e.y - 3));
                ctx.lineTo(gs(sx - bDir * 2), gs(e.y + 3));
                ctx.closePath();
                ctx.fill();
                // Speed trail
                ctx.strokeStyle = `rgba(255,99,71,${0.3 + Math.random() * 0.2})`;
                ctx.lineWidth = gs(2);
                ctx.beginPath();
                ctx.moveTo(gs(sx - bDir * 8), gs(e.y));
                ctx.lineTo(gs(sx - bDir * (16 + Math.random() * 8)), gs(e.y + (Math.random() - 0.5) * 4));
                ctx.stroke();
                ctx.shadowBlur = 0;
                break;
            }
        }
    }

    function drawTerrain() {
        if (planetExploded) return; // No terrain after explosion
        const groundY = GAME_H - TERRAIN_H;
        // Gradient fill
        const grad = ctx.createLinearGradient(0, gs(groundY - 10), 0, gs(GAME_H));
        grad.addColorStop(0, '#1a3a1a');
        grad.addColorStop(0.3, '#0d2a0d');
        grad.addColorStop(1, '#050f05');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, gs(GAME_H));
        const segW = WORLD_W / (terrain.length - 1);
        for (let i = 0; i < terrain.length; i++) {
            const wx = terrain[i].x;
            const sx = toScreen(wx);
            const th = terrain[i].h;
            ctx.lineTo(gs(sx), gs(GAME_H - th));
        }
        ctx.lineTo(gs(GAME_W + 50), gs(GAME_H));
        ctx.closePath();
        ctx.fill();

        // Horizon glow line
        const horizonColor = (terrainGlow > 0) ? '#FBBF24' : '#22C55E';
        const horizonGlow = (terrainGlow > 0) ? 12 + terrainGlow * 2 : 6;
        ctx.strokeStyle = horizonColor;
        ctx.lineWidth = gs(2);
        ctx.shadowColor = horizonColor;
        ctx.shadowBlur = gs(horizonGlow);
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < terrain.length; i++) {
            const sx = toScreen(terrain[i].x);
            const ty = GAME_H - terrain[i].h;
            if (!started) { ctx.moveTo(gs(sx), gs(ty)); started = true; }
            else ctx.lineTo(gs(sx), gs(ty));
        }
        ctx.stroke();
        // Secondary dimmer glow line for depth
        ctx.strokeStyle = (terrainGlow > 0) ? 'rgba(251,191,36,0.3)' : 'rgba(34,197,94,0.15)';
        ctx.lineWidth = gs(4);
        ctx.shadowBlur = gs(horizonGlow * 1.5);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    function drawMinimap() {
        const mmW = GAME_W * 0.6, mmX = (GAME_W - mmW) / 2;
        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(gs(mmX - 2), gs(MINIMAP_Y - 2), gs(mmW + 4), gs(MINIMAP_H + 4));
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = gs(1);
        ctx.strokeRect(gs(mmX - 2), gs(MINIMAP_Y - 2), gs(mmW + 4), gs(MINIMAP_H + 4));

        // Terrain on minimap
        if (!planetExploded) {
            ctx.strokeStyle = '#22C55E';
            ctx.lineWidth = gs(0.5);
            ctx.beginPath();
            for (let i = 0; i <= terrain.length; i++) {
                const t = terrain[i % terrain.length];
                const mx = mmX + (t.x / WORLD_W) * mmW;
                const my = MINIMAP_Y + MINIMAP_H - (t.h / TERRAIN_H) * (MINIMAP_H * 0.4);
                if (i === 0) ctx.moveTo(gs(mx), gs(my));
                else ctx.lineTo(gs(mx), gs(my));
            }
            ctx.stroke();
        }

        // Humanoids on minimap
        for (const h of humanoids) {
            if (!h.alive) continue;
            const mx = mmX + (wrapX(h.x) / WORLD_W) * mmW;
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(gs(mx - 0.5), gs(MINIMAP_Y + MINIMAP_H - 5), gs(1.5), gs(3));
        }

        // Enemies on minimap
        for (const e of enemies) {
            if (!e.alive) continue;
            const mx = mmX + (wrapX(e.x) / WORLD_W) * mmW;
            const my = MINIMAP_Y + 2 + (e.y / GAME_H) * (MINIMAP_H - 4);
            ctx.fillStyle = ENEMY_COLORS[e.type];
            ctx.fillRect(gs(mx - 0.5), gs(my - 0.5), gs(1.5), gs(1.5));
        }

        // Player on minimap
        const pmx = mmX + (wrapX(ship.x) / WORLD_W) * mmW;
        ctx.fillStyle = '#fff';
        ctx.fillRect(gs(pmx - 1.5), gs(MINIMAP_Y + MINIMAP_H / 2 - 1.5), gs(3), gs(3));

        // Viewport indicator
        const viewFrac = GAME_W / WORLD_W;
        const viewStart = mmX + (wrapX(ship.x - GAME_W / 2) / WORLD_W) * mmW;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = gs(0.8);
        ctx.strokeRect(gs(viewStart), gs(MINIMAP_Y), gs(mmW * viewFrac), gs(MINIMAP_H));
    }

    function drawHUD() {
        // Score
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${gs(14)}px monospace`;
        ctx.fillText(`SCORE`, gs(8), gs(MINIMAP_Y + MINIMAP_H + 22));
        ctx.fillStyle = '#FBBF24';
        ctx.fillText(`${score}`, gs(70), gs(MINIMAP_Y + MINIMAP_H + 22));

        // Wave
        ctx.fillStyle = '#888';
        ctx.font = `${gs(10)}px monospace`;
        ctx.fillText(`WAVE ${level}`, gs(8), gs(MINIMAP_Y + MINIMAP_H + 38));

        // Lives as ship icons
        ctx.fillStyle = '#fff';
        ctx.font = `${gs(10)}px monospace`;
        ctx.textAlign = 'right';
        ctx.fillText('LIVES', gs(GAME_W - 60), gs(MINIMAP_Y + MINIMAP_H + 22));
        for (let i = 0; i < Math.max(0, lives); i++) {
            const lx = GAME_W - 50 + i * 18;
            ctx.fillStyle = playerColor;
            ctx.beginPath();
            ctx.moveTo(gs(lx + 8), gs(MINIMAP_Y + MINIMAP_H + 16));
            ctx.lineTo(gs(lx), gs(MINIMAP_Y + MINIMAP_H + 12));
            ctx.lineTo(gs(lx), gs(MINIMAP_Y + MINIMAP_H + 20));
            ctx.closePath();
            ctx.fill();
        }

        // Smart bombs
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'right';
        ctx.font = `${gs(10)}px monospace`;
        ctx.fillText('BOMBS', gs(GAME_W - 60), gs(MINIMAP_Y + MINIMAP_H + 38));
        for (let i = 0; i < bombs; i++) {
            const bx = GAME_W - 50 + i * 14;
            ctx.fillStyle = '#F43F5E';
            ctx.beginPath();
            ctx.arc(gs(bx + 4), gs(MINIMAP_Y + MINIMAP_H + 34), gs(4), 0, Math.PI * 2);
            ctx.fill();
        }

        // Humanoid count
        const aliveH = humanoids.filter(h => h.alive).length;
        ctx.textAlign = 'center';
        ctx.fillStyle = aliveH > 3 ? '#22C55E' : (aliveH > 0 ? '#F59E0B' : '#EF4444');
        ctx.font = `bold ${gs(10)}px monospace`;
        ctx.fillText(`HUMANS: ${aliveH}`, gs(GAME_W / 2), gs(MINIMAP_Y + MINIMAP_H + 22));

        if (planetExploded) {
            ctx.fillStyle = '#EF4444';
            ctx.font = `bold ${gs(10)}px monospace`;
            ctx.fillText('PLANET DESTROYED', gs(GAME_W / 2), gs(MINIMAP_Y + MINIMAP_H + 38));
        }
    }

    function drawTitle() {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, '#020210');
        bgGrad.addColorStop(0.5, '#060618');
        bgGrad.addColorStop(1, '#0a0820');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Stars
        for (const s of stars) {
            const flicker = s.b + Math.sin(frameCount * 0.02 + s.x) * 0.15;
            ctx.globalAlpha = Math.max(0, Math.min(1, flicker));
            ctx.fillStyle = '#E0E7FF';
            ctx.fillRect(gs(s.x % GAME_W), gs(s.y), gs(s.s), gs(s.s));
        }
        ctx.globalAlpha = 1;

        // Title glow
        const titleY = GAME_H * 0.25;
        ctx.fillStyle = playerColor;
        ctx.shadowColor = playerColor;
        ctx.shadowBlur = gs(30);
        ctx.globalAlpha = 0.08;
        ctx.beginPath();
        ctx.arc(gs(GAME_W / 2), gs(titleY), gs(120), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // Title
        ctx.textAlign = 'center';
        ctx.font = `bold ${gs(52)}px monospace`;
        ctx.fillStyle = darken(playerColor, 0.4);
        ctx.fillText('DEFENDER', gs(GAME_W / 2 + 3), gs(titleY + 3));
        ctx.fillStyle = playerColor;
        ctx.shadowColor = playerColor;
        ctx.shadowBlur = gs(12);
        ctx.fillText('DEFENDER', gs(GAME_W / 2), gs(titleY));
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#666';
        ctx.font = `${gs(11)}px monospace`;
        ctx.fillText('YOUR WORLD ARCADE', gs(GAME_W / 2), gs(titleY + 22));

        // Divider
        ctx.strokeStyle = `${playerColor}55`;
        ctx.lineWidth = gs(1);
        ctx.beginPath();
        ctx.moveTo(gs(GAME_W / 2 - 140), gs(titleY + 35));
        ctx.lineTo(gs(GAME_W / 2 + 140), gs(titleY + 35));
        ctx.stroke();

        // Info
        ctx.fillStyle = '#888';
        ctx.font = `${gs(11)}px monospace`;
        const infoY = GAME_H * 0.48;
        ctx.fillText('PROTECT THE HUMANOIDS FROM ALIEN ABDUCTION', gs(GAME_W / 2), gs(infoY));
        ctx.fillStyle = '#666';
        ctx.font = `${gs(10)}px monospace`;
        ctx.fillText('Shoot landers before they carry humans to the top', gs(GAME_W / 2), gs(infoY + 18));
        ctx.fillText('Catch falling humanoids for 500 point bonus', gs(GAME_W / 2), gs(infoY + 33));

        // Enemy legend
        const legY = GAME_H * 0.62;
        ctx.fillStyle = '#555';
        ctx.font = `${gs(9)}px monospace`;
        const types = [
            { name: 'LANDER', col: ENEMY_COLORS[0], desc: 'Abducts humans' },
            { name: 'MUTANT', col: ENEMY_COLORS[1], desc: 'Fast & aggressive' },
            { name: 'BOMBER', col: ENEMY_COLORS[2], desc: 'Drops mines' },
            { name: 'POD', col: ENEMY_COLORS[3], desc: 'Splits into swarmers' },
        ];
        const legW = types.length * 120;
        for (let i = 0; i < types.length; i++) {
            const lx = GAME_W / 2 - legW / 2 + i * 120 + 60;
            ctx.fillStyle = types[i].col;
            ctx.beginPath();
            ctx.arc(gs(lx), gs(legY), gs(5), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#999';
            ctx.fillText(types[i].name, gs(lx), gs(legY + 14));
            ctx.fillStyle = '#555';
            ctx.fillText(types[i].desc, gs(lx), gs(legY + 26));
        }

        // Controls
        ctx.fillStyle = '#555';
        ctx.font = `${gs(10)}px monospace`;
        ctx.fillText('ARROWS: Move    SPACE: Fire    Z: Smart Bomb    H: Hyperspace', gs(GAME_W / 2), gs(GAME_H * 0.78));

        // Start prompt
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink) {
            ctx.fillStyle = '#fff';
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = gs(6);
            ctx.font = `bold ${gs(16)}px monospace`;
            ctx.fillText('PRESS SPACE TO START', gs(GAME_W / 2), gs(GAME_H * 0.88));
            ctx.shadowBlur = 0;
        }

        // Vignette
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#EF4444';
        ctx.shadowColor = '#EF4444'; ctx.shadowBlur = gs(12);
        ctx.font = `bold ${gs(36)}px monospace`;
        ctx.fillText('GAME OVER', gs(GAME_W / 2), gs(GAME_H * 0.32));
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${gs(20)}px monospace`;
        ctx.fillText(`SCORE: ${score.toLocaleString()}`, gs(GAME_W / 2), gs(GAME_H * 0.43));
        if (score >= highScore && score > 0) {
            ctx.fillStyle = '#FBBF24'; ctx.font = `bold ${gs(12)}px monospace`;
            ctx.fillText('\u2605 NEW HIGH SCORE! \u2605', gs(GAME_W / 2), gs(GAME_H * 0.49));
        } else {
            ctx.fillStyle = '#666'; ctx.font = `${gs(11)}px monospace`;
            ctx.fillText(`BEST: ${highScore.toLocaleString()}`, gs(GAME_W / 2), gs(GAME_H * 0.49));
        }
        ctx.fillStyle = '#888';
        ctx.font = `${gs(14)}px monospace`;
        ctx.fillText(`WAVE ${level}`, gs(GAME_W / 2), gs(GAME_H * 0.57));
        const rescued = humanoids.filter(h => h.alive).length;
        ctx.fillText(`HUMANOIDS SAVED: ${rescued}`, gs(GAME_W / 2), gs(GAME_H * 0.63));
        const blink = Math.sin(frameCount * 0.08) > 0;
        if (blink && deathTimer <= 0) {
            ctx.fillStyle = '#06B6D4';
            ctx.font = `${gs(14)}px monospace`;
            ctx.fillText(HAS_TOUCH ? 'TAP TO PLAY AGAIN' : 'PRESS SPACE TO PLAY AGAIN', gs(GAME_W / 2), gs(GAME_H * 0.76));
        }
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
            deathTimer -= dt;
            if (deathTimer <= 0) respawn();
        } else if (state === ST_GAMEOVER) {
            draw();
            drawGameOver();
            deathTimer -= dt;
        }

        animFrame = requestAnimationFrame(gameLoop);
    }

    function startGame() {
        score = 0; lives = INITIAL_LIVES; level = 0; bombs = INITIAL_BOMBS;
        lasers = []; enemies = []; particles = []; scorePopups = [];
        screenShake = 0; deathTimer = 0; lastFireTime = 0;
        planetExploded = false;
        nextBonusScore = BONUS_LIFE_INTERVAL;
        waveFrameCount = 0;
        shockwaves = [];
        terrainGlow = 0;
        rescueParticles = [];
        generateTerrain();
        createHumanoids();
        resetShip();
        spawnWave();
        state = ST_PLAY;
    }

    function endGame() {
        if (gameOverCB) gameOverCB({ score, level, duration: 0, lives });
    }

    // ── Input ──
    function onKeyDown(e) {
        keys[e.key] = true;
        if (state === ST_TITLE && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); startGame(); }
        if (state === ST_GAMEOVER && deathTimer <= 0 && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); endGame(); }
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
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
        if (e.touches.length === 0) keys = {};
        else handleTouch(e.touches);
    }
    function handleTouch(touches) {
        keys = {};
        const rect = canvas.getBoundingClientRect();
        for (const t of touches) {
            const tx = (t.clientX - rect.left) / rect.width;
            const ty = (t.clientY - rect.top) / rect.height;
            // Left third: move left, right third: move right
            if (tx < 0.25) keys['ArrowLeft'] = true;
            else if (tx > 0.75) keys['ArrowRight'] = true;
            // Top half: up, bottom half: down
            if (ty < 0.35) keys['ArrowUp'] = true;
            else if (ty > 0.65) keys['ArrowDown'] = true;
            // Center tap: fire
            if (tx > 0.3 && tx < 0.7 && ty > 0.3 && ty < 0.7) keys[' '] = true;
            // Double-finger = bomb
            if (touches.length >= 2) keys['z'] = true;
        }
    }

    // ── Canvas sizing ──
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

    // ── Init / Destroy ──
    function init(cvs, playerData, onGameOver) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOver;
        gameActive = true;
        playerColor = playerData?.color || '#06B6D4';
        themeAccent = '#F59E0B';

        const themeId = playerData?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            playerColor = _t.colors[0] || playerColor;
            themeAccent = _t.colors[1] || themeAccent;
        }

        state = ST_TITLE;
        frameCount = 0;
        lastTime = 0;
        lastFireTime = 0;
        keys = {};
        shockwaves = [];
        terrainGlow = 0;
        rescueParticles = [];
        nextBonusScore = BONUS_LIFE_INTERVAL;
        waveFrameCount = 0;

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
