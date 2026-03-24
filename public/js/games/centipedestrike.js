/* YWA Centipede Strike — Centipede + Missile Command mashup.
   Centipede enemies descend through a mushroom field; you fight them with
   Missile Command–style interceptors that explode on target. */
window.CentipedeStrike = (() => {
    // ── Design Constants ──
    const GAME_W = 480, GAME_H = 640;
    const COLS = 24, ROWS = 32;
    const CELL = GAME_W / COLS; // 20
    const BASE_COUNT = 3;
    const MAX_AMMO = 10; // per base
    const INTERCEPTOR_SPEED = 3.5;
    const EXPLOSION_GROW = 2.8;
    const EXPLOSION_MAX_R = 40;
    const EXPLOSION_LINGER = 0.8; // seconds at full size
    const EXPLOSION_FADE = 0.6; // seconds to fade
    const MUSH_REGEN_DELAY = 5000; // ms between regen ticks between waves
    const MUSH_HP = 4;
    const CENTIPEDE_SPEED_BASE = 0.65;
    const SPIDER_SPEED = 1.2;
    const FLEA_SPEED = 1.5;
    const SCORPION_SPEED = 1.5;
    const SEG_SIZE = 14;
    const SPIDER_SIZE = 16;
    const FLEA_SIZE = 12;
    const POWERUP_FALL_SPEED = 1.0;
    const POWERUP_SIZE = 14;
    const SCORE_HEAD = 100;
    const SCORE_SEG = 10;
    const SCORE_SPIDER = 300;
    const SCORE_FLEA = 200;
    const SCORE_SCORPION = 500;
    const BOSS_HP = 3;
    const SLOW_MO_DUR = 5000;
    const CHAIN_REACT_R = 24;
    const DEATH_ANIM_MS = 1800;

    // Power-up types
    const PW_MEGA = 0, PW_AMMO = 1, PW_SLOW = 2, PW_CHAIN = 3;
    const PW_COLORS = ['#F97316', '#3B82F6', '#A855F7', '#EF4444'];
    const PW_LABELS = ['MEGA', 'AMMO', 'SLOW', 'CHAIN'];

    // States
    const ST_TITLE = 0, ST_PLAYING = 1, ST_WAVE_CLEAR = 2, ST_DYING = 3, ST_GAMEOVER = 4;

    // Theme-aware colors (defaults)
    let CLR_BG1 = '#0A1628', CLR_BG2 = '#162033';
    let CLR_MUSH_CAP = '#22C55E', CLR_MUSH_STEM = '#166534';
    let CLR_MUSH_POISON = '#A855F7';
    let CLR_BASE = '#06B6D4', CLR_BASE_GLOW = '#22D3EE';
    let CLR_HEAD = '#EF4444', CLR_SEG = '#3B82F6', CLR_JOINT = '#60A5FA';
    let CLR_SPIDER = '#FBBF24', CLR_FLEA = '#F472B6', CLR_SCORPION = '#F97316';
    let CLR_TRAIL = '#94A3B8', CLR_CROSSHAIR = '#E0E7FF';
    let CLR_HUD = '#E0E7FF';
    let CLR_EXPL = ['#FFFFFF', '#FBBF24', '#F97316', '#EF4444', '#991B1B'];

    // ── State ──
    let canvas, ctx, audioCtx;
    let W, H, SCALE, DPR;
    let animFrame, lastTime, state, gameActive = false;
    let score, wave, lives;
    let activePlayer, gameOverCB, playerColor;
    let highScore = parseInt(localStorage.getItem('ywa_centipedestrike_hi') || '0');
    let frameCount = 0, screenShake = 0;
    let mouseX = GAME_W / 2, mouseY = GAME_H / 2;
    let keys = {};

    // Game entities
    let bases, interceptors, explosions;
    let mushrooms; // 2d array [col][row] = { hp, poisoned }
    let centipedes, spiders, fleas, scorpions;
    let particles, scorePopups, powerups;
    let deathTimer, waveClearTimer;
    let slowMoTimer, chainReactActive;
    let selectedBase; // index or null (auto)

    // ═══════════════════════════════════════════
    //  AUDIO
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
            const bufSize = audioCtx.sampleRate * dur;
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
    function sfxLaunch() { playTone(300, 0.15, 'sawtooth', 0.07, 600); }
    function sfxExplode(big) {
        playNoise(big ? 0.5 : 0.3, big ? 0.14 : 0.1);
        playTone(80, big ? 0.4 : 0.25, 'sine', big ? 0.12 : 0.08, 30);
    }
    function sfxSegPop() { playTone(440, 0.08, 'square', 0.07, 880); }
    function sfxSpider() { playTone(600, 0.12, 'sawtooth', 0.08, 200); }
    function sfxFlea() { playTone(900, 0.06, 'triangle', 0.06, 400); }
    function sfxMushCrunch() { playNoise(0.06, 0.04); }
    function sfxPowerUp() { playTone(880, 0.08, 'sine', 0.1); setTimeout(() => playTone(1320, 0.12, 'sine', 0.1), 80); }
    function sfxWaveClear() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'sine', 0.1), i * 120)); }
    function sfxLowAmmo() { playTone(220, 0.08, 'square', 0.06); }
    function sfxDeath() { playTone(120, 0.6, 'sawtooth', 0.15, 40); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const gx = v => v * SCALE;
    const gy = v => v * SCALE;
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
    const lerp = (a, b, t) => a + (b - a) * t;

    const HAS_TOUCH = ('ontouchstart' in window);

    // ═══════════════════════════════════════════
    //  MUSHROOM GRID
    // ═══════════════════════════════════════════
    function initMushrooms() {
        mushrooms = [];
        for (let c = 0; c < COLS; c++) {
            mushrooms[c] = [];
            for (let r = 0; r < ROWS; r++) mushrooms[c][r] = null;
        }
        // populate — avoid very top 2 rows and bottom 4 rows (base area)
        const density = 0.07 + wave * 0.008;
        for (let c = 0; c < COLS; c++) {
            for (let r = 2; r < ROWS - 4; r++) {
                if (Math.random() < Math.min(density, 0.15)) {
                    mushrooms[c][r] = { hp: MUSH_HP, poisoned: false };
                }
            }
        }
    }
    function mushAt(c, r) {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
        return mushrooms[c][r];
    }
    function damageMush(c, r, amt) {
        const m = mushAt(c, r);
        if (!m) return;
        m.hp -= (amt || 1);
        if (m.hp <= 0) {
            mushrooms[c][r] = null;
            spawnDebris(c * CELL + CELL / 2, r * CELL + CELL / 2, CLR_MUSH_CAP, 4);
            sfxMushCrunch();
        }
    }

    // ═══════════════════════════════════════════
    //  BASES
    // ═══════════════════════════════════════════
    function initBases() {
        bases = [];
        const y = GAME_H - 20;
        const positions = [GAME_W * 0.2, GAME_W * 0.5, GAME_W * 0.8];
        for (let i = 0; i < BASE_COUNT; i++) {
            bases.push({ x: positions[i], y, ammo: MAX_AMMO, alive: true, recoil: 0 });
        }
    }
    function closestBase(tx, ty) {
        if (selectedBase !== null && bases[selectedBase] && bases[selectedBase].alive && bases[selectedBase].ammo > 0) {
            return selectedBase;
        }
        let best = -1, bestD = Infinity;
        for (let i = 0; i < bases.length; i++) {
            if (!bases[i].alive || bases[i].ammo <= 0) continue;
            const d = dist(bases[i].x, bases[i].y, tx, ty);
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    }
    function totalAmmo() { return bases.reduce((s, b) => s + (b.alive ? b.ammo : 0), 0); }

    // ═══════════════════════════════════════════
    //  INTERCEPTORS & EXPLOSIONS
    // ═══════════════════════════════════════════
    function fireInterceptor(tx, ty) {
        const bi = closestBase(tx, ty);
        if (bi < 0) { sfxLowAmmo(); return; }
        const b = bases[bi];
        b.ammo--;
        b.recoil = 6;
        const angle = Math.atan2(ty - b.y, tx - b.x);
        interceptors.push({
            x: b.x, y: b.y, tx, ty,
            vx: Math.cos(angle) * INTERCEPTOR_SPEED,
            vy: Math.sin(angle) * INTERCEPTOR_SPEED,
            trail: [],
            alive: true
        });
        sfxLaunch();
        if (b.ammo <= 3 && b.ammo > 0) sfxLowAmmo();
    }

    function spawnExplosion(x, y, maxR, chain) {
        explosions.push({
            x, y, r: 0, maxR: maxR || EXPLOSION_MAX_R,
            phase: 'grow', timer: 0, chain: !!chain
        });
        sfxExplode(maxR > EXPLOSION_MAX_R);
        screenShake = Math.max(screenShake, maxR > 50 ? 8 : 4);
    }

    function updateInterceptors(dt) {
        for (let i = interceptors.length - 1; i >= 0; i--) {
            const m = interceptors[i];
            if (!m.alive) continue;
            m.trail.push({ x: m.x, y: m.y, a: 1 });
            if (m.trail.length > 20) m.trail.shift();
            m.x += m.vx * dt * 60;
            m.y += m.vy * dt * 60;
            const d = dist(m.x, m.y, m.tx, m.ty);
            if (d < INTERCEPTOR_SPEED * 1.5) {
                m.alive = false;
                spawnExplosion(m.tx, m.ty);
            }
            // off-screen safety
            if (m.y < -20 || m.y > GAME_H + 20 || m.x < -20 || m.x > GAME_W + 20) {
                m.alive = false;
            }
        }
        // fade trails
        interceptors.forEach(m => {
            m.trail.forEach(t => t.a -= dt * 3);
            m.trail = m.trail.filter(t => t.a > 0);
        });
        interceptors = interceptors.filter(m => m.alive || m.trail.length > 0);
    }

    function updateExplosions(dt) {
        const speed = slowMoTimer > 0 ? 0.5 : 1;
        for (let i = explosions.length - 1; i >= 0; i--) {
            const e = explosions[i];
            e.timer += dt * speed;
            if (e.phase === 'grow') {
                e.r += EXPLOSION_GROW * dt * 60 * speed;
                if (e.r >= e.maxR) {
                    e.r = e.maxR;
                    e.phase = 'linger';
                    e.timer = 0;
                }
                // Collision checks during grow
                checkExplosionHits(e);
            } else if (e.phase === 'linger') {
                checkExplosionHits(e);
                if (e.timer >= EXPLOSION_LINGER) {
                    e.phase = 'fade';
                    e.timer = 0;
                }
            } else if (e.phase === 'fade') {
                if (e.timer >= EXPLOSION_FADE) {
                    explosions.splice(i, 1);
                    continue;
                }
            }
        }
    }

    function checkExplosionHits(e) {
        // Centipede segments
        centipedes.forEach(centi => {
            centi.segments.forEach(seg => {
                if (seg.dead) return;
                if (dist(e.x, e.y, seg.x, seg.y) < e.r + SEG_SIZE / 2) {
                    if (seg.boss) {
                        seg.bossHp = (seg.bossHp || BOSS_HP) - 1;
                        if (seg.bossHp > 0) {
                            spawnDebris(seg.x, seg.y, CLR_HEAD, 2);
                            return;
                        }
                    }
                    killSegment(centi, seg);
                }
            });
        });
        // Spiders
        for (let i = spiders.length - 1; i >= 0; i--) {
            const s = spiders[i];
            if (dist(e.x, e.y, s.x, s.y) < e.r + SPIDER_SIZE / 2) {
                addScore(SCORE_SPIDER, s.x, s.y);
                spawnDebris(s.x, s.y, CLR_SPIDER, 6);
                sfxSpider();
                maybePowerup(s.x, s.y);
                spiders.splice(i, 1);
            }
        }
        // Fleas
        for (let i = fleas.length - 1; i >= 0; i--) {
            const f = fleas[i];
            if (dist(e.x, e.y, f.x, f.y) < e.r + FLEA_SIZE / 2) {
                addScore(SCORE_FLEA, f.x, f.y);
                spawnDebris(f.x, f.y, CLR_FLEA, 5);
                sfxFlea();
                maybePowerup(f.x, f.y);
                fleas.splice(i, 1);
            }
        }
        // Scorpions
        for (let i = scorpions.length - 1; i >= 0; i--) {
            const sc = scorpions[i];
            if (dist(e.x, e.y, sc.x, sc.y) < e.r + 14) {
                addScore(SCORE_SCORPION, sc.x, sc.y);
                spawnDebris(sc.x, sc.y, CLR_SCORPION, 6);
                scorpions.splice(i, 1);
            }
        }
        // Mushrooms
        const cMin = Math.max(0, Math.floor((e.x - e.r) / CELL));
        const cMax = Math.min(COLS - 1, Math.floor((e.x + e.r) / CELL));
        const rMin = Math.max(0, Math.floor((e.y - e.r) / CELL));
        const rMax = Math.min(ROWS - 1, Math.floor((e.y + e.r) / CELL));
        for (let c = cMin; c <= cMax; c++) {
            for (let r = rMin; r <= rMax; r++) {
                if (!mushrooms[c][r]) continue;
                const mx = c * CELL + CELL / 2, my = r * CELL + CELL / 2;
                if (dist(e.x, e.y, mx, my) < e.r + CELL / 2) {
                    damageMush(c, r, 2);
                }
            }
        }
        // Chain reaction
        if (chainReactActive && e.phase === 'grow' && !e.chain && e.r >= e.maxR * 0.9) {
            // secondary explosions around
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
                const nx = e.x + Math.cos(a) * CHAIN_REACT_R;
                const ny = e.y + Math.sin(a) * CHAIN_REACT_R;
                if (nx > 0 && nx < GAME_W && ny > 0 && ny < GAME_H) {
                    spawnExplosion(nx, ny, EXPLOSION_MAX_R * 0.6, true);
                }
            }
            chainReactActive = false;
        }
        // Powerup collection by explosion
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            if (dist(e.x, e.y, p.x, p.y) < e.r + POWERUP_SIZE) {
                collectPowerup(p);
                powerups.splice(i, 1);
            }
        }
    }

    // ═══════════════════════════════════════════
    //  CENTIPEDE
    // ═══════════════════════════════════════════
    function spawnCentipede(length, isBoss) {
        const segs = [];
        const startX = rand(CELL * 4, GAME_W - CELL * 4);
        const dir = Math.random() < 0.5 ? 1 : -1;
        for (let i = 0; i < length; i++) {
            const sx = clamp(startX - i * CELL * dir, CELL, GAME_W - CELL);
            const sy = CELL * 2;
            segs.push({
                x: sx, y: sy,
                prevX: sx, prevY: sy,   // lerp origin
                nextX: sx, nextY: sy,   // lerp target
                lerpT: 1,               // 0→1 progress between grid cells
                dx: dir, dy: 1,
                head: i === 0,
                boss: i === 0 && isBoss,
                bossHp: isBoss ? BOSS_HP : 0,
                dead: false,
                moveTimer: 0,
                legPhase: Math.random() * Math.PI * 2,
                row: 0
            });
        }
        centipedes.push({ segments: segs, speed: CENTIPEDE_SPEED_BASE + wave * 0.08 });
    }

    function updateCentipedes(dt) {
        const speed = slowMoTimer > 0 ? 0.5 : 1;
        centipedes.forEach(centi => {
            const spd = centi.speed * speed;
            centi.segments.forEach((seg, idx) => {
                if (seg.dead) return;
                seg.legPhase += dt * 12;

                // If mid-lerp, keep interpolating toward nextX/nextY
                if (seg.lerpT < 1) {
                    seg.lerpT += dt * spd * 60 * 0.06; // tune: lower = smoother/slower slide
                    if (seg.lerpT >= 1) seg.lerpT = 1;
                    seg.x = lerp(seg.prevX, seg.nextX, seg.lerpT);
                    seg.y = lerp(seg.prevY, seg.nextY, seg.lerpT);
                    return;
                }

                // Arrived at grid cell — compute next target
                seg.moveTimer += dt * spd * 60;
                if (seg.moveTimer < 1) return;
                seg.moveTimer = 0;

                const col = Math.round(seg.x / CELL);
                const row = Math.round(seg.y / CELL);
                const nextCol = col + seg.dx;

                // Check if need to turn: wall or mushroom ahead
                let shouldTurn = false;
                if (nextCol < 0 || nextCol >= COLS) shouldTurn = true;
                else {
                    const m = mushAt(nextCol, row);
                    if (m && !m.poisoned) shouldTurn = true;
                }

                // Check poisoned mushrooms — drop straight through
                const mBelow = mushAt(col, row);
                if (mBelow && mBelow.poisoned && seg.dy > 0) {
                    seg.prevX = seg.x; seg.prevY = seg.y;
                    seg.nextX = seg.x; seg.nextY = seg.y + CELL;
                    seg.lerpT = 0;
                    seg.row++;
                    if (seg.nextY > GAME_H - CELL * 3) {
                        seg.dy = -1; // bounce back up at bottom
                    }
                    return;
                }

                // Store current pos as lerp origin
                seg.prevX = seg.x; seg.prevY = seg.y;

                if (shouldTurn) {
                    seg.nextX = seg.x;
                    seg.nextY = seg.y + CELL * seg.dy;
                    seg.row += seg.dy;
                    seg.dx = -seg.dx;
                    if (seg.nextY > GAME_H - CELL * 3) seg.dy = -1;
                    if (seg.nextY < CELL * 2) seg.dy = 1;
                } else {
                    seg.nextX = seg.x + CELL * seg.dx;
                    seg.nextY = seg.y;
                }

                // Clamp targets
                seg.nextX = clamp(seg.nextX, CELL / 2, GAME_W - CELL / 2);
                seg.nextY = clamp(seg.nextY, CELL, GAME_H);
                seg.lerpT = 0; // begin interpolation
            });
        });

        // Check if centipede segments reach base area — damage player
        centipedes.forEach(centi => {
            centi.segments.forEach(seg => {
                if (seg.dead) return;
                if (seg.y >= GAME_H - CELL * 2) {
                    bases.forEach(b => {
                        if (b.alive && dist(seg.x, seg.y, b.x, b.y) < CELL * 1.5) {
                            destroyBase(b);
                        }
                    });
                }
            });
        });
    }

    function killSegment(centi, seg) {
        seg.dead = true;
        const pts = seg.head ? SCORE_HEAD : SCORE_SEG;
        addScore(pts * (seg.boss ? 5 : 1), seg.x, seg.y);
        spawnDebris(seg.x, seg.y, seg.head ? CLR_HEAD : CLR_SEG, 5);
        sfxSegPop();
        if (Math.random() < 0.15) maybePowerup(seg.x, seg.y);

        // Drop a mushroom where segment died (sometimes)
        if (Math.random() < 0.3) {
            const c = Math.floor(seg.x / CELL), r = Math.floor(seg.y / CELL);
            if (c >= 0 && c < COLS && r >= 2 && r < ROWS - 4 && !mushrooms[c][r]) {
                mushrooms[c][r] = { hp: MUSH_HP, poisoned: false };
            }
        }

        // Split centipede: remaining segments after dead one become new head
        const idx = centi.segments.indexOf(seg);
        if (idx >= 0 && idx < centi.segments.length - 1) {
            const remaining = centi.segments.slice(idx + 1).filter(s => !s.dead);
            if (remaining.length > 0) {
                remaining[0].head = true;
                // Create a new centipede from the tail
                centipedes.push({ segments: remaining, speed: centi.speed });
                // Remove them from original
                centi.segments = centi.segments.slice(0, idx + 1);
            }
        }
    }

    function allCentipedesDead() {
        return centipedes.every(c => c.segments.every(s => s.dead));
    }

    // ═══════════════════════════════════════════
    //  SPIDER / FLEA / SCORPION
    // ═══════════════════════════════════════════
    function spawnSpider() {
        const side = Math.random() < 0.5 ? 0 : GAME_W;
        spiders.push({
            x: side, y: rand(GAME_H * 0.5, GAME_H - CELL * 4),
            vx: side === 0 ? SPIDER_SPEED : -SPIDER_SPEED,
            vy: 0, bounceTimer: 0, legPhase: 0
        });
    }
    function updateSpiders(dt) {
        const speed = slowMoTimer > 0 ? 0.5 : 1;
        spiders.forEach(s => {
            s.legPhase += dt * 10;
            s.bounceTimer += dt * speed;
            if (s.bounceTimer > 0.3) {
                s.bounceTimer = 0;
                s.vy = rand(-3, 3) * speed;
                s.vx = (s.vx > 0 ? 1 : -1) * rand(1.5, 3) * speed;
            }
            s.x += s.vx * dt * 60 * speed;
            s.y += s.vy * dt * 60 * speed;
            s.y = clamp(s.y, GAME_H * 0.4, GAME_H - CELL * 2);
            // Eat mushrooms it passes over
            const c = Math.floor(s.x / CELL), r = Math.floor(s.y / CELL);
            if (mushAt(c, r) && Math.random() < 0.05) damageMush(c, r, MUSH_HP);
        });
        // Spider hits base
        spiders.forEach(s => {
            bases.forEach(b => {
                if (b.alive && dist(s.x, s.y, b.x, b.y) < SPIDER_SIZE + 10) {
                    destroyBase(b);
                }
            });
        });
        // Remove off-screen
        spiders = spiders.filter(s => s.x > -30 && s.x < GAME_W + 30);
    }

    function spawnFlea() {
        fleas.push({
            x: rand(CELL * 2, GAME_W - CELL * 2), y: -10,
            dropTimer: 0
        });
    }
    function updateFleas(dt) {
        const speed = slowMoTimer > 0 ? 0.5 : 1;
        for (let i = fleas.length - 1; i >= 0; i--) {
            const f = fleas[i];
            f.y += FLEA_SPEED * dt * 60 * speed;
            f.dropTimer += dt;
            if (f.dropTimer > 0.25) {
                f.dropTimer = 0;
                const c = Math.floor(f.x / CELL), r = Math.floor(f.y / CELL);
                if (c >= 0 && c < COLS && r >= 2 && r < ROWS - 4 && !mushrooms[c][r] && Math.random() < 0.6) {
                    mushrooms[c][r] = { hp: MUSH_HP, poisoned: false };
                }
            }
            if (f.y > GAME_H + 20) fleas.splice(i, 1);
        }
    }

    function spawnScorpion() {
        const side = Math.random() < 0.5 ? -20 : GAME_W + 20;
        const dir = side < 0 ? 1 : -1;
        scorpions.push({
            x: side, y: rand(CELL * 3, GAME_H * 0.5),
            dx: dir, legPhase: 0
        });
    }
    function updateScorpions(dt) {
        const speed = slowMoTimer > 0 ? 0.5 : 1;
        scorpions.forEach(sc => {
            sc.legPhase += dt * 8;
            sc.x += sc.dx * SCORPION_SPEED * dt * 60 * speed;
            // Poison mushrooms it passes
            const c = Math.floor(sc.x / CELL), r = Math.floor(sc.y / CELL);
            if (mushAt(c, r)) mushrooms[c][r].poisoned = true;
        });
        scorpions = scorpions.filter(sc => sc.x > -40 && sc.x < GAME_W + 40);
    }

    // ═══════════════════════════════════════════
    //  POWER-UPS
    // ═══════════════════════════════════════════
    function maybePowerup(x, y) {
        if (Math.random() > 0.2) return;
        const type = Math.floor(Math.random() * 4);
        powerups.push({ x, y, type, vy: POWERUP_FALL_SPEED });
    }
    function collectPowerup(p) {
        sfxPowerUp();
        switch (p.type) {
            case PW_MEGA:
                spawnExplosion(p.x, p.y, EXPLOSION_MAX_R * 2.5, false);
                break;
            case PW_AMMO:
                bases.forEach(b => { if (b.alive) b.ammo = Math.min(b.ammo + 10, MAX_AMMO); });
                addScore(0, p.x, p.y, '+AMMO');
                break;
            case PW_SLOW:
                slowMoTimer = SLOW_MO_DUR;
                addScore(0, p.x, p.y, 'SLOW-MO');
                break;
            case PW_CHAIN:
                chainReactActive = true;
                addScore(0, p.x, p.y, 'CHAIN!');
                break;
        }
    }
    function updatePowerups(dt) {
        for (let i = powerups.length - 1; i >= 0; i--) {
            powerups[i].y += powerups[i].vy * dt * 60;
            if (powerups[i].y > GAME_H + 20) powerups.splice(i, 1);
        }
    }

    // ═══════════════════════════════════════════
    //  PARTICLES & SCORE POPUPS
    // ═══════════════════════════════════════════
    function spawnDebris(x, y, color, count) {
        for (let i = 0; i < (count || 4); i++) {
            particles.push({
                x, y, vx: rand(-3, 3), vy: rand(-4, 1),
                life: rand(0.3, 0.7), maxLife: rand(0.3, 0.7),
                r: rand(1.5, 3.5), color
            });
        }
    }
    function addScore(pts, x, y, label) {
        if (pts > 0) score += pts;
        scorePopups.push({
            x, y, text: label || (pts > 0 ? `+${pts}` : ''), life: 1.2, vy: -1.5
        });
    }
    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt * 60; p.y += p.vy * dt * 60;
            p.vy += 4 * dt; // gravity
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }
    function updatePopups(dt) {
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const p = scorePopups[i];
            p.y += p.vy * dt * 60;
            p.life -= dt;
            if (p.life <= 0) scorePopups.splice(i, 1);
        }
    }

    // ═══════════════════════════════════════════
    //  BASE DESTRUCTION / LIVES
    // ═══════════════════════════════════════════
    function destroyBase(b) {
        if (!b.alive) return;
        b.alive = false;
        spawnDebris(b.x, b.y, CLR_BASE, 10);
        sfxDeath();
        screenShake = 10;
        lives--;
        if (lives <= 0 && bases.every(bb => !bb.alive)) {
            state = ST_DYING;
            deathTimer = DEATH_ANIM_MS;
        }
    }

    // ═══════════════════════════════════════════
    //  WAVE MANAGEMENT
    // ═══════════════════════════════════════════
    function startWave() {
        interceptors = []; explosions = [];
        spiders = []; fleas = []; scorpions = [];
        powerups = [];
        slowMoTimer = 0; chainReactActive = false;
        centipedes = [];

        const isBossWave = wave % 5 === 0 && wave > 0;
        const segCount = Math.min(8 + wave * 2, 30);

        if (isBossWave) {
            spawnCentipede(segCount, true);
        } else {
            const numCentipedes = wave >= 4 ? Math.min(1 + Math.floor(wave / 3), 4) : 1;
            const perCenti = Math.floor(segCount / numCentipedes);
            for (let i = 0; i < numCentipedes; i++) {
                setTimeout(() => spawnCentipede(perCenti, false), i * 800);
            }
        }

        // Refill ammo
        bases.forEach(b => {
            if (b.alive) b.ammo = MAX_AMMO;
        });

        // Revive one dead base per wave (if lives > 0)
        if (lives > 0) {
            const dead = bases.filter(b => !b.alive);
            if (dead.length > 0 && dead.length < BASE_COUNT) {
                dead[0].alive = true;
                dead[0].ammo = MAX_AMMO;
            }
        }

        // Regen some mushrooms
        for (let c = 0; c < COLS; c++) {
            for (let r = 2; r < ROWS - 4; r++) {
                if (!mushrooms[c][r] && Math.random() < 0.04) {
                    mushrooms[c][r] = { hp: MUSH_HP, poisoned: false };
                }
                // Heal poisoned
                if (mushrooms[c][r] && mushrooms[c][r].poisoned) {
                    mushrooms[c][r].poisoned = false;
                }
            }
        }

        state = ST_PLAYING;
    }

    // ═══════════════════════════════════════════
    //  ENEMY SPAWN TIMERS
    // ═══════════════════════════════════════════
    let spiderTimer = 0, fleaTimer = 0, scorpionTimer = 0;

    function updateSpawnTimers(dt) {
        if (wave >= 2) {
            spiderTimer += dt;
            if (spiderTimer > rand(6, 12) && spiders.length < 2) {
                spawnSpider();
                spiderTimer = 0;
            }
        }
        if (wave >= 3) {
            fleaTimer += dt;
            if (fleaTimer > rand(8, 15) && fleas.length < 2) {
                spawnFlea();
                fleaTimer = 0;
            }
        }
        if (wave >= 4) {
            scorpionTimer += dt;
            if (scorpionTimer > rand(12, 20) && scorpions.length < 1) {
                spawnScorpion();
                scorpionTimer = 0;
            }
        }
    }

    // ═══════════════════════════════════════════
    //  MAIN UPDATE
    // ═══════════════════════════════════════════
    function update(dt) {
        frameCount++;
        if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 30);

        if (state === ST_TITLE) return;

        if (state === ST_DYING) {
            deathTimer -= dt * 1000;
            updateParticles(dt);
            updatePopups(dt);
            if (deathTimer <= 0) {
                state = ST_GAMEOVER;
                if (score > highScore) { highScore = score; try { localStorage.setItem('ywa_centipedestrike_hi', String(highScore)); } catch {} }
            }
            return;
        }

        if (state === ST_GAMEOVER) {
            updateParticles(dt);
            return;
        }

        if (state === ST_WAVE_CLEAR) {
            waveClearTimer -= dt * 1000;
            updateParticles(dt);
            updatePopups(dt);
            if (waveClearTimer <= 0) {
                wave++;
                startWave();
            }
            return;
        }

        // ST_PLAYING
        if (slowMoTimer > 0) slowMoTimer -= dt * 1000;

        // Base recoil
        bases.forEach(b => { if (b.recoil > 0) b.recoil -= dt * 30; });

        updateInterceptors(dt);
        updateExplosions(dt);
        updateCentipedes(dt);
        updateSpiders(dt);
        updateFleas(dt);
        updateScorpions(dt);
        updatePowerups(dt);
        updateParticles(dt);
        updatePopups(dt);
        updateSpawnTimers(dt);

        // Check wave clear
        if (allCentipedesDead() && centipedes.length > 0) {
            state = ST_WAVE_CLEAR;
            waveClearTimer = 2000;
            sfxWaveClear();
            // Bonus points for remaining ammo
            const ammoBonus = totalAmmo() * 10;
            if (ammoBonus > 0) addScore(ammoBonus, GAME_W / 2, GAME_H / 2, `AMMO BONUS +${ammoBonus}`);
        }

        // All bases dead check
        if (bases.every(b => !b.alive) && state === ST_PLAYING) {
            state = ST_DYING;
            deathTimer = DEATH_ANIM_MS;
        }
    }

    // ═══════════════════════════════════════════
    //  DRAW
    // ═══════════════════════════════════════════
    function draw() {
        ctx.save();
        // Apply screen shake
        if (screenShake > 0) {
            const sx = (Math.random() - 0.5) * screenShake;
            const sy = (Math.random() - 0.5) * screenShake;
            ctx.translate(gx(sx), gy(sy));
        }

        // Background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, CLR_BG1);
        bgGrad.addColorStop(1, CLR_BG2);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Subtle grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.02)';
        ctx.lineWidth = 1;
        for (let c = 0; c <= COLS; c++) {
            ctx.beginPath(); ctx.moveTo(gx(c * CELL), 0); ctx.lineTo(gx(c * CELL), H); ctx.stroke();
        }
        for (let r = 0; r <= ROWS; r++) {
            ctx.beginPath(); ctx.moveTo(0, gy(r * CELL)); ctx.lineTo(W, gy(r * CELL)); ctx.stroke();
        }

        drawMushrooms();
        drawPowerups();
        drawCentipedes();
        drawSpiders();
        drawFleas();
        drawScorpions();
        drawInterceptors();
        drawExplosions();
        drawBases();
        drawParticles();
        drawPopups();
        drawCrosshair();
        drawHUD();

        // Vignette overlay
        const vigGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
        vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vigGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, W, H);

        // Slow-mo tint
        if (slowMoTimer > 0) {
            ctx.fillStyle = 'rgba(100,50,200,0.08)';
            ctx.fillRect(0, 0, W, H);
        }

        ctx.restore();

        // Title / Game Over overlays
        if (state === ST_TITLE) drawTitleScreen();
        if (state === ST_GAMEOVER) drawGameOver();
        if (state === ST_WAVE_CLEAR) drawWaveClear();
    }

    function drawMushrooms() {
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                const m = mushrooms[c][r];
                if (!m) continue;
                const cx = gx(c * CELL + CELL / 2), cy = gy(r * CELL + CELL / 2);
                const sz = gs(CELL * 0.4) * (m.hp / MUSH_HP * 0.3 + 0.7);

                // Stem
                ctx.fillStyle = CLR_MUSH_STEM;
                ctx.fillRect(cx - sz * 0.25, cy, sz * 0.5, sz * 0.8);

                // Cap
                const capColor = m.poisoned ? CLR_MUSH_POISON : CLR_MUSH_CAP;
                const capGrad = ctx.createRadialGradient(cx - sz * 0.2, cy - sz * 0.3, 0, cx, cy, sz);
                capGrad.addColorStop(0, '#fff');
                capGrad.addColorStop(0.3, capColor);
                capGrad.addColorStop(1, m.poisoned ? '#7C3AED' : '#166534');
                ctx.fillStyle = capGrad;
                ctx.beginPath();
                ctx.arc(cx, cy, sz, Math.PI, 0, false);
                ctx.fill();

                // Spots
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.beginPath(); ctx.arc(cx - sz * 0.3, cy - sz * 0.3, sz * 0.15, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(cx + sz * 0.2, cy - sz * 0.15, sz * 0.1, 0, Math.PI * 2); ctx.fill();

                // Poison glow
                if (m.poisoned) {
                    ctx.save();
                    ctx.shadowColor = CLR_MUSH_POISON;
                    ctx.shadowBlur = gs(6);
                    ctx.globalAlpha = 0.3 + 0.2 * Math.sin(frameCount * 0.1);
                    ctx.beginPath(); ctx.arc(cx, cy, sz * 1.2, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
            }
        }
    }

    function drawCentipedes() {
        centipedes.forEach(centi => {
            const segs = centi.segments.filter(s => !s.dead);
            // Draw connecting joints between segments
            ctx.strokeStyle = CLR_JOINT;
            ctx.lineWidth = gs(2);
            for (let i = 1; i < segs.length; i++) {
                ctx.beginPath();
                ctx.moveTo(gx(segs[i - 1].x), gy(segs[i - 1].y));
                ctx.lineTo(gx(segs[i].x), gy(segs[i].y));
                ctx.stroke();
            }
            // Draw segments
            segs.forEach(seg => {
                const sx = gx(seg.x), sy = gy(seg.y), sr = gs(SEG_SIZE / 2);

                // Legs
                ctx.strokeStyle = seg.head ? CLR_HEAD : CLR_SEG;
                ctx.lineWidth = gs(1.5);
                const lPhase = seg.legPhase;
                for (let side = -1; side <= 1; side += 2) {
                    for (let l = 0; l < 3; l++) {
                        const la = lPhase + l * 1.2;
                        const lx = sx + Math.cos(la) * sr * 0.6 * side;
                        const ly = sy + Math.sin(la) * sr * 0.4 + sr * 0.3;
                        ctx.beginPath();
                        ctx.moveTo(sx + sr * 0.3 * side, sy);
                        ctx.lineTo(lx, ly);
                        ctx.stroke();
                    }
                }

                // Body
                const bodyGrad = ctx.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, 0, sx, sy, sr);
                bodyGrad.addColorStop(0, '#fff');
                bodyGrad.addColorStop(0.4, seg.head ? CLR_HEAD : CLR_SEG);
                bodyGrad.addColorStop(1, seg.head ? '#991B1B' : '#1E40AF');
                ctx.fillStyle = bodyGrad;
                ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();

                // Boss armor
                if (seg.boss) {
                    ctx.strokeStyle = '#FBBF24';
                    ctx.lineWidth = gs(2);
                    ctx.beginPath(); ctx.arc(sx, sy, sr + gs(2), 0, Math.PI * 2); ctx.stroke();
                    // HP pips
                    for (let h = 0; h < (seg.bossHp || 0); h++) {
                        ctx.fillStyle = '#FBBF24';
                        ctx.beginPath();
                        ctx.arc(sx + (h - 1) * gs(5), sy - sr - gs(4), gs(2), 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                // Eyes on head
                if (seg.head) {
                    const eyeOfs = sr * 0.35;
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.arc(sx - eyeOfs, sy - sr * 0.2, sr * 0.22, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(sx + eyeOfs, sy - sr * 0.2, sr * 0.22, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#000';
                    ctx.beginPath(); ctx.arc(sx - eyeOfs + sr * 0.05 * seg.dx, sy - sr * 0.2, sr * 0.1, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(sx + eyeOfs + sr * 0.05 * seg.dx, sy - sr * 0.2, sr * 0.1, 0, Math.PI * 2); ctx.fill();
                }
            });
        });
    }

    function drawSpiders() {
        spiders.forEach(s => {
            const sx = gx(s.x), sy = gy(s.y), sr = gs(SPIDER_SIZE / 2);
            // Legs
            ctx.strokeStyle = CLR_SPIDER;
            ctx.lineWidth = gs(1.5);
            for (let i = 0; i < 4; i++) {
                for (let side = -1; side <= 1; side += 2) {
                    const angle = -0.8 + i * 0.5 + Math.sin(s.legPhase + i) * 0.3;
                    const len = sr * 1.8;
                    const knee = sr * 0.9;
                    const kx = sx + Math.cos(angle) * knee * side;
                    const ky = sy + Math.sin(angle) * knee * 0.5 + sr * 0.3;
                    const ex = sx + Math.cos(angle + 0.3) * len * side;
                    const ey = sy + Math.abs(Math.sin(angle)) * len * 0.4 + sr * 0.6;
                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.quadraticCurveTo(kx, ky, ex, ey);
                    ctx.stroke();
                }
            }
            // Body
            ctx.fillStyle = CLR_SPIDER;
            ctx.beginPath(); ctx.ellipse(sx, sy, sr, sr * 0.7, 0, 0, Math.PI * 2); ctx.fill();
            // Eyes
            ctx.fillStyle = '#EF4444';
            ctx.beginPath(); ctx.arc(sx - sr * 0.3, sy - sr * 0.2, gs(2), 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(sx + sr * 0.3, sy - sr * 0.2, gs(2), 0, Math.PI * 2); ctx.fill();
        });
    }

    function drawFleas() {
        fleas.forEach(f => {
            const fx = gx(f.x), fy = gy(f.y);
            ctx.fillStyle = CLR_FLEA;
            ctx.beginPath(); ctx.ellipse(fx, fy, gs(FLEA_SIZE / 2), gs(FLEA_SIZE / 3), 0, 0, Math.PI * 2); ctx.fill();
            // Wings
            ctx.globalAlpha = 0.5;
            const wingW = gs(8), wingH = gs(4);
            const flap = Math.sin(frameCount * 0.5) * gs(3);
            ctx.beginPath(); ctx.ellipse(fx - gs(5), fy - flap, wingW, wingH, -0.3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(fx + gs(5), fy - flap, wingW, wingH, 0.3, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
        });
    }

    function drawScorpions() {
        scorpions.forEach(sc => {
            const sx = gx(sc.x), sy = gy(sc.y), sr = gs(10);
            // Body
            ctx.fillStyle = CLR_SCORPION;
            ctx.beginPath(); ctx.ellipse(sx, sy, sr, sr * 0.5, 0, 0, Math.PI * 2); ctx.fill();
            // Tail (curved arc)
            ctx.strokeStyle = CLR_SCORPION;
            ctx.lineWidth = gs(3);
            ctx.beginPath();
            ctx.moveTo(sx - sr * sc.dx, sy);
            ctx.quadraticCurveTo(sx - sr * 1.5 * sc.dx, sy - sr * 1.5, sx - sr * 0.8 * sc.dx, sy - sr * 2);
            ctx.stroke();
            // Stinger
            ctx.fillStyle = '#EF4444';
            ctx.beginPath(); ctx.arc(sx - sr * 0.8 * sc.dx, sy - sr * 2, gs(2.5), 0, Math.PI * 2); ctx.fill();
            // Legs
            ctx.strokeStyle = CLR_SCORPION;
            ctx.lineWidth = gs(1);
            for (let i = 0; i < 4; i++) {
                for (let side = -1; side <= 1; side += 2) {
                    const phase = sc.legPhase + i * 0.8;
                    const lx = sx + (i - 1.5) * sr * 0.4;
                    const ly = sy + sr * 0.5 + Math.sin(phase) * gs(3);
                    ctx.beginPath(); ctx.moveTo(lx, sy + sr * 0.3); ctx.lineTo(lx + side * gs(4), ly); ctx.stroke();
                }
            }
            // Claws
            ctx.lineWidth = gs(2);
            const clawDir = sc.dx;
            ctx.beginPath();
            ctx.moveTo(sx + sr * clawDir, sy - sr * 0.2);
            ctx.lineTo(sx + sr * 1.4 * clawDir, sy - sr * 0.5);
            ctx.lineTo(sx + sr * 1.2 * clawDir, sy - sr * 0.1);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx + sr * clawDir, sy + sr * 0.2);
            ctx.lineTo(sx + sr * 1.4 * clawDir, sy + sr * 0.5);
            ctx.lineTo(sx + sr * 1.2 * clawDir, sy + sr * 0.1);
            ctx.stroke();
        });
    }

    function drawInterceptors() {
        interceptors.forEach(m => {
            // Trail
            ctx.lineWidth = gs(2);
            m.trail.forEach((t, i) => {
                const a = t.a * 0.6;
                ctx.fillStyle = `rgba(148,163,184,${a})`;
                ctx.beginPath();
                ctx.arc(gx(t.x), gy(t.y), gs(1.5 + i * 0.1), 0, Math.PI * 2);
                ctx.fill();
            });
            // Interceptor head
            if (m.alive) {
                ctx.fillStyle = '#FFF';
                ctx.shadowColor = '#FFF';
                ctx.shadowBlur = gs(6);
                ctx.beginPath();
                ctx.arc(gx(m.x), gy(m.y), gs(3), 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        });
    }

    function drawExplosions() {
        explosions.forEach(e => {
            let alpha = 1;
            if (e.phase === 'fade') alpha = 1 - e.timer / EXPLOSION_FADE;
            const r = gs(e.r);
            const cx = gx(e.x), cy = gy(e.y);

            // Outer ring
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            grad.addColorStop(0, `rgba(255,255,255,${alpha * 0.9})`);
            grad.addColorStop(0.3, `rgba(251,191,36,${alpha * 0.7})`);
            grad.addColorStop(0.6, `rgba(249,115,22,${alpha * 0.5})`);
            grad.addColorStop(0.85, `rgba(239,68,68,${alpha * 0.3})`);
            grad.addColorStop(1, `rgba(153,27,27,0)`);
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

            // Bright core
            ctx.fillStyle = `rgba(255,255,255,${alpha * 0.6})`;
            ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.fill();

            // Ring outline
            ctx.strokeStyle = `rgba(251,191,36,${alpha * 0.5})`;
            ctx.lineWidth = gs(2);
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        });
    }

    function drawBases() {
        bases.forEach((b, i) => {
            if (!b.alive) {
                // Draw rubble
                ctx.fillStyle = 'rgba(100,100,100,0.4)';
                ctx.fillRect(gx(b.x - 12), gy(b.y - 4), gs(24), gs(8));
                return;
            }
            const bx = gx(b.x), by = gy(b.y - Math.max(0, b.recoil));
            const bw = gs(24), bh = gs(16);

            // Base body
            const baseGrad = ctx.createLinearGradient(bx, by - bh, bx, by + bh / 2);
            baseGrad.addColorStop(0, CLR_BASE_GLOW);
            baseGrad.addColorStop(1, CLR_BASE);
            ctx.fillStyle = baseGrad;
            ctx.beginPath();
            ctx.moveTo(bx - bw / 2, by + bh / 2);
            ctx.lineTo(bx - bw / 3, by - bh / 3);
            ctx.lineTo(bx, by - bh / 2);
            ctx.lineTo(bx + bw / 3, by - bh / 3);
            ctx.lineTo(bx + bw / 2, by + bh / 2);
            ctx.closePath();
            ctx.fill();

            // Barrel
            ctx.fillStyle = '#E0E7FF';
            ctx.fillRect(bx - gs(1.5), by - bh / 2 - gs(6), gs(3), gs(6));

            // Glow
            ctx.save();
            ctx.shadowColor = CLR_BASE_GLOW;
            ctx.shadowBlur = gs(8);
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = CLR_BASE_GLOW;
            ctx.beginPath(); ctx.arc(bx, by, gs(14), 0, Math.PI * 2); ctx.fill();
            ctx.restore();

            // Ammo pips
            drawAmmoPips(b, i);
        });
    }

    function drawAmmoPips(b, idx) {
        const pipY = gy(GAME_H - 6);
        const startX = gx(b.x - MAX_AMMO * 2);
        for (let a = 0; a < MAX_AMMO; a++) {
            ctx.fillStyle = a < b.ammo ?
                (b.ammo <= 3 ? '#EF4444' : CLR_BASE_GLOW) :
                'rgba(255,255,255,0.1)';
            ctx.fillRect(startX + a * gs(4), pipY, gs(3), gs(4));
        }
        // Base label
        ctx.fillStyle = CLR_HUD;
        ctx.font = `bold ${gs(8)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(['A', 'S', 'D'][idx] || '', gx(b.x), gy(GAME_H - 1));
    }

    function drawCrosshair() {
        if (state !== ST_PLAYING) return;
        const cx = gx(mouseX), cy = gy(mouseY);
        const s = gs(10) + Math.sin(frameCount * 0.15) * gs(2);

        ctx.strokeStyle = CLR_CROSSHAIR;
        ctx.lineWidth = gs(1.5);
        ctx.globalAlpha = 0.7;
        // Crosshair lines
        ctx.beginPath(); ctx.moveTo(cx - s, cy); ctx.lineTo(cx - s * 0.4, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + s, cy); ctx.lineTo(cx + s * 0.4, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy - s * 0.4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy + s); ctx.lineTo(cx, cy + s * 0.4); ctx.stroke();
        // Circle
        ctx.beginPath(); ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2); ctx.stroke();
        // Center dot
        ctx.fillStyle = CLR_CROSSHAIR;
        ctx.beginPath(); ctx.arc(cx, cy, gs(1.5), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawParticles() {
        particles.forEach(p => {
            const a = p.life / p.maxLife;
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(gx(p.x), gy(p.y), gs(p.r), 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    function drawPopups() {
        ctx.textAlign = 'center';
        scorePopups.forEach(p => {
            const a = Math.min(1, p.life);
            ctx.globalAlpha = a;
            ctx.fillStyle = '#FBBF24';
            ctx.font = `bold ${gs(10)}px monospace`;
            ctx.fillText(p.text, gx(p.x), gy(p.y));
        });
        ctx.globalAlpha = 1;
    }

    function drawPowerups() {
        powerups.forEach(p => {
            const px = gx(p.x), py = gy(p.y), sz = gs(POWERUP_SIZE);
            const pulse = 1 + Math.sin(frameCount * 0.15) * 0.15;
            ctx.save();
            ctx.shadowColor = PW_COLORS[p.type];
            ctx.shadowBlur = gs(8);
            ctx.fillStyle = PW_COLORS[p.type];
            ctx.beginPath();
            ctx.arc(px, py, sz / 2 * pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${gs(6)}px monospace`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(PW_LABELS[p.type], px, py);
            ctx.restore();
        });
    }

    function drawHUD() {
        ctx.save();
        ctx.textAlign = 'left';
        ctx.fillStyle = CLR_HUD;
        ctx.font = `bold ${gs(12)}px monospace`;
        ctx.fillText(`SCORE: ${score}`, gs(8), gs(16));
        ctx.textAlign = 'right';
        ctx.fillText(`WAVE ${wave}`, W - gs(8), gs(16));

        // Lives
        ctx.textAlign = 'center';
        ctx.fillStyle = CLR_HUD;
        ctx.font = `${gs(10)}px monospace`;
        const livesText = lives > 0 ? `LIVES: ${lives}` : '';
        ctx.fillText(livesText, W / 2, gs(16));

        // Total ammo bar
        const ta = totalAmmo();
        const maxTA = BASE_COUNT * MAX_AMMO;
        const barW = gs(60), barH = gs(5);
        const barX = W / 2 - barW / 2, barY = gs(22);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = ta <= 9 ? '#EF4444' : CLR_BASE_GLOW;
        ctx.fillRect(barX, barY, barW * (ta / maxTA), barH);

        // Slow-mo indicator
        if (slowMoTimer > 0) {
            ctx.fillStyle = '#A855F7';
            ctx.font = `bold ${gs(10)}px monospace`;
            ctx.fillText(`SLOW-MO ${(slowMoTimer / 1000).toFixed(1)}s`, W / 2, gs(38));
        }
        if (chainReactActive) {
            ctx.fillStyle = '#EF4444';
            ctx.font = `bold ${gs(10)}px monospace`;
            ctx.fillText('CHAIN READY', W / 2, gs(50));
        }
        ctx.restore();
    }

    function drawTitleScreen() {
        ctx.save();
        // Darken
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';

        // Title
        const pulse = 1 + Math.sin(frameCount * 0.04) * 0.05;
        ctx.save();
        ctx.translate(W / 2, H * 0.28);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#FBBF24';
        ctx.font = `bold ${gs(28)}px monospace`;
        ctx.fillText('CENTIPEDE', 0, 0);
        ctx.fillStyle = '#EF4444';
        ctx.font = `bold ${gs(22)}px monospace`;
        ctx.fillText('STRIKE', 0, gs(28));
        ctx.restore();

        // Subtitle
        ctx.fillStyle = CLR_HUD;
        ctx.font = `${gs(10)}px monospace`;
        ctx.globalAlpha = 0.7;
        ctx.fillText('CENTIPEDE + MISSILE COMMAND', W / 2, H * 0.42);
        ctx.globalAlpha = 1;

        // Instructions
        ctx.fillStyle = '#94A3B8';
        ctx.font = `${gs(9)}px monospace`;
        const instructions = [
            'CLICK / TAP to launch interceptors',
            'Explosions destroy enemies & mushrooms',
            'A / S / D — select a specific base',
            'Conserve ammo — 10 per base per wave'
        ];
        instructions.forEach((line, i) => {
            ctx.fillText(line, W / 2, H * 0.52 + i * gs(16));
        });

        // Blink prompt
        if (Math.floor(frameCount / 30) % 2 === 0) {
            ctx.fillStyle = CLR_CROSSHAIR;
            ctx.font = `bold ${gs(12)}px monospace`;
            ctx.fillText(HAS_TOUCH ? 'TAP TO START' : 'CLICK TO START', W / 2, H * 0.78);
        }

        ctx.restore();
    }

    function drawGameOver() {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#EF4444';
        ctx.shadowColor = '#EF4444'; ctx.shadowBlur = gs(12);
        ctx.font = `bold ${gs(30)}px monospace`;
        ctx.fillText('GAME OVER', W / 2, H * 0.30);
        ctx.shadowBlur = 0;

        ctx.fillStyle = CLR_HUD;
        ctx.font = `bold ${gs(16)}px monospace`;
        ctx.fillText(`SCORE: ${score.toLocaleString()}`, W / 2, H * 0.41);
        if (score >= highScore && score > 0) {
            ctx.fillStyle = '#FBBF24'; ctx.font = `bold ${gs(11)}px monospace`;
            ctx.fillText('\u2605 NEW HIGH SCORE! \u2605', W / 2, H * 0.47);
        } else {
            ctx.fillStyle = '#666'; ctx.font = `${gs(10)}px monospace`;
            ctx.fillText(`BEST: ${highScore.toLocaleString()}`, W / 2, H * 0.47);
        }
        ctx.fillStyle = '#94A3B8';
        ctx.font = `${gs(12)}px monospace`;
        ctx.fillText(`WAVE ${wave}`, W / 2, H * 0.54);

        if (Math.floor(frameCount / 30) % 2 === 0) {
            ctx.fillStyle = '#06B6D4';
            ctx.font = `${gs(12)}px monospace`;
            ctx.fillText(HAS_TOUCH ? 'TAP TO PLAY AGAIN' : 'CLICK TO PLAY AGAIN', W / 2, H * 0.65);
        }
        ctx.restore();
    }

    function drawWaveClear() {
        ctx.save();
        ctx.textAlign = 'center';
        const flash = Math.sin(frameCount * 0.15) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(251,191,36,${flash})`;
        ctx.font = `bold ${gs(24)}px monospace`;
        ctx.fillText(`WAVE ${wave} CLEAR!`, W / 2, H * 0.4);
        ctx.fillStyle = CLR_HUD;
        ctx.font = `${gs(12)}px monospace`;
        ctx.fillText(`WAVE ${wave + 1} INCOMING...`, W / 2, H * 0.48);
        ctx.restore();
    }

    // ═══════════════════════════════════════════
    //  INPUT
    // ═══════════════════════════════════════════
    function canvasCoord(e) {
        const rect = canvas.getBoundingClientRect();
        const sx = (e.clientX - rect.left) / rect.width * GAME_W;
        const sy = (e.clientY - rect.top) / rect.height * GAME_H;
        return { x: sx, y: sy };
    }
    function handleClick(gx, gy) {
        if (state === ST_TITLE) {
            startGame();
            return;
        }
        if (state === ST_GAMEOVER) {
            if (gameOverCB) gameOverCB(score);
            return;
        }
        if (state === ST_PLAYING) {
            fireInterceptor(gx, gy);
        }
    }

    function onMouseMove(e) {
        const c = canvasCoord(e);
        mouseX = c.x; mouseY = c.y;
    }
    function onMouseDown(e) {
        e.preventDefault();
        ensureAudio();
        const c = canvasCoord(e);
        mouseX = c.x; mouseY = c.y;
        handleClick(c.x, c.y);
    }
    function onTouchStart(e) {
        e.preventDefault();
        ensureAudio();
        const t = e.touches[0];
        const c = canvasCoord(t);
        mouseX = c.x; mouseY = c.y;
        handleClick(c.x, c.y);
    }
    function onTouchMove(e) {
        e.preventDefault();
        const t = e.touches[0];
        const c = canvasCoord(t);
        mouseX = c.x; mouseY = c.y;
    }
    function onKeyDown(e) {
        keys[e.key] = true;
        if (e.key === 'a' || e.key === 'A') selectedBase = 0;
        else if (e.key === 's' || e.key === 'S') selectedBase = 1;
        else if (e.key === 'd' || e.key === 'D') selectedBase = 2;
        else selectedBase = null;

        if (e.key === ' ' || e.key === 'Enter') {
            if (state === ST_TITLE) { ensureAudio(); startGame(); }
            else if (state === ST_GAMEOVER && gameOverCB) gameOverCB(score);
        }
    }
    function onKeyUp(e) {
        keys[e.key] = false;
        if (['a', 'A', 's', 'S', 'd', 'D'].includes(e.key)) selectedBase = null;
    }

    // ═══════════════════════════════════════════
    //  GAME LOOP
    // ═══════════════════════════════════════════
    function gameLoop(ts) {
        if (!gameActive) return;
        if (!lastTime) lastTime = ts;
        const dt = Math.min((ts - lastTime) / 1000, 0.05);
        lastTime = ts;

        update(dt);
        draw();
        animFrame = requestAnimationFrame(gameLoop);
    }

    // ═══════════════════════════════════════════
    //  START / RESET
    // ═══════════════════════════════════════════
    function startGame() {
        score = 0;
        wave = 1;
        lives = 3;
        state = ST_PLAYING;
        frameCount = 0;
        screenShake = 0;
        slowMoTimer = 0;
        chainReactActive = false;
        selectedBase = null;
        centipedes = [];
        spiders = [];
        fleas = [];
        scorpions = [];
        interceptors = [];
        explosions = [];
        particles = [];
        scorePopups = [];
        powerups = [];
        spiderTimer = 0;
        fleaTimer = 0;
        scorpionTimer = 0;

        initMushrooms();
        initBases();
        startWave();
    }

    // ═══════════════════════════════════════════
    //  FIT CANVAS
    // ═══════════════════════════════════════════
    function fitCanvas() {
        if (!canvas) return;
        let pw = canvas.width || 480;
        let ph = canvas.height || 640;
        const parent = canvas.parentElement;
        if (parent && parent.clientWidth > 50 && parent.clientHeight > 50) {
            pw = parent.clientWidth;
            ph = parent.clientHeight;
        }
        const aspect = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > aspect) { ch = ph; cw = ch * aspect; }
        else { cw = pw; ch = cw / aspect; }
        cw = Math.max(cw, 320);
        ch = Math.max(ch, 400);
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = Math.round(cw * DPR);
        canvas.height = Math.round(ch * DPR);
        canvas.style.width = `${Math.round(cw)}px`;
        canvas.style.height = `${Math.round(ch)}px`;
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
    }

    // ═══════════════════════════════════════════
    //  INIT / DESTROY
    // ═══════════════════════════════════════════
    function init(cvs, pl, cb) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = pl;
        gameOverCB = cb;
        gameActive = true;
        lastTime = 0;
        state = ST_TITLE;
        score = 0;
        wave = 1;
        lives = 3;
        particles = [];
        scorePopups = [];
        interceptors = [];
        explosions = [];
        centipedes = [];
        spiders = [];
        fleas = [];
        scorpions = [];
        powerups = [];
        mushrooms = [];

        // Theme colors
        const _t = (window.ThemeEngine && ThemeEngine.getCurrentTheme) ? ThemeEngine.getCurrentTheme() : null;
        if (_t && _t.colors && _t.colors.length >= 4) {
            CLR_BASE = _t.colors[0] || CLR_BASE;
            CLR_BASE_GLOW = _t.colors[1] || CLR_BASE_GLOW;
            CLR_MUSH_CAP = _t.colors[2] || CLR_MUSH_CAP;
            CLR_HEAD = _t.colors[3] || CLR_HEAD;
            playerColor = _t.colors[0] || playerColor;
        }

        initMushrooms();
        initBases();

        W = canvas.width || 480;
        H = canvas.height || 640;
        SCALE = W / GAME_W;
        DPR = Math.min(window.devicePixelRatio || 1, 3);

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
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
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
        }
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', fitCanvas);
        keys = {};
        particles = [];
        centipedes = [];
        interceptors = [];
        explosions = [];
        spiders = [];
        fleas = [];
        scorpions = [];
        powerups = [];
    }

    return { init, destroy };
})();
