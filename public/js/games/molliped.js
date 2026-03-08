/* Molliped — Theme-aware Centipede for Your World Arcade */
window.Molliped = (() => {
    // ── Constants ──
    const W = 480, H = 640;
    const COLS = 30, ROWS = 40, CELL = 16;
    const BG = '#0F1117';
    const GRID_LINE = 'rgba(255,255,255,0.03)';
    const HUD_COLOR = '#E0E7FF';
    const PLAYER_ZONE_ROWS = 8;
    const FIRE_RATE = 160;           // ms between shots (~6/sec)
    const BULLET_SPEED = 8;
    const PLAYER_SPEED = 3.2;
    const INITIAL_LIVES = 3;
    const INITIAL_SEGMENTS = 12;
    const MAX_SEGMENTS = 16;
    const INITIAL_MUSHROOMS = 35;
    const BONUS_LIFE_SCORE = 12000;
    const DEATH_ANIM_MS = 1500;
    const SPIDER_INTERVAL_MIN = 15000;
    const SPIDER_INTERVAL_MAX = 20000;
    const FLEA_THRESHOLD = 5;        // mushrooms in lower half to trigger flea

    // ── Colors (theme-overridable) ──
    let HEAD_COLOR = '#F43F5E';
    let BODY_COLORS = ['#EC4899', '#A855F7'];
    let MUSH_COLORS = ['#22C55E', '#3B82F6', '#F59E0B', '#06B6D4'];
    let POISON_TINT = '#84CC16';
    let SPIDER_COLOR = '#EF4444';
    let FLEA_COLOR = '#F59E0B';
    let SCORPION_COLOR = '#8B5CF6';
    let BULLET_COLOR = '#38BDF8';
    const DEFAULT_PLAYER = '#38BDF8';
    let BG_THEME = '#0F1117';

    // ── States ──
    const ST_TITLE = 0, ST_PLAYING = 1, ST_DYING = 2, ST_GAMEOVER = 3;

    // ── Module state ──
    let canvas, ctx, audioCtx;
    let animFrame, lastTime, state;
    let score, level, lives, gameActive, startTime;
    let totalKills, maxCombo, combo;
    let nextBonusAt;
    let playerColor;
    let gameOverCB;

    // Entities
    let player, bullets, centipedes, mushrooms, particles;
    let spider, flea, scorpion;
    let spiderTimer, scorpionTimer;

    // Input
    let keys = {};
    let mouseX = -1, mouseY = -1, mouseDown = false;
    let touchActive = false;
    let lastFireTime = 0;

    // Title demo
    let titleCentipede = [];
    let titleTick = 0;

    // Death anim
    let deathTimer = 0;

    // ═══════════════════════════════════════════
    //  SOUND — Web Audio synthesis
    // ═══════════════════════════════════════════
    function ensureAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function playTone(freq, dur, type, vol, slide) {
        try {
            ensureAudio();
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = type || 'square';
            o.frequency.setValueAtTime(freq, audioCtx.currentTime);
            if (slide) o.frequency.linearRampToValueAtTime(slide, audioCtx.currentTime + dur);
            g.gain.setValueAtTime(vol || 0.08, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            o.connect(g).connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + dur);
        } catch (_) {}
    }

    function playShoot()        { playTone(880, 0.06, 'square', 0.06); }
    function playHitMushroom()  { playTone(220, 0.08, 'triangle', 0.05); }
    function playHitCentipede() { playTone(520 + combo * 40, 0.12, 'square', 0.09, 800 + combo * 60); }
    function playSpiderBounce() { playTone(120, 0.15, 'sawtooth', 0.06, 80); }
    function playDeath()        { playTone(440, 0.5, 'sawtooth', 0.1, 80); }
    function playLevelUp() {
        [523, 659, 784, 1047].forEach((f, i) => {
            setTimeout(() => playTone(f, 0.15, 'square', 0.07), i * 100);
        });
    }

    // ═══════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════
    function rng(a, b) { return Math.random() * (b - a) + a; }
    function rngInt(a, b) { return Math.floor(rng(a, b + 1)); }
    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
    function mushKey(col, row) { return col + ',' + row; }

    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < (count || 8); i++) {
            particles.push({
                x, y,
                vx: rng(-2, 2), vy: rng(-2, 2),
                life: rng(0.3, 0.7),
                maxLife: 0.7,
                color,
                r: rng(1.5, 3.5)
            });
        }
    }

    // ═══════════════════════════════════════════
    //  MUSHROOM GRID
    // ═══════════════════════════════════════════
    function initMushrooms(count) {
        mushrooms = {};
        for (let i = 0; i < count; i++) {
            let col, row;
            do {
                col = rngInt(0, COLS - 1);
                row = rngInt(1, ROWS - PLAYER_ZONE_ROWS - 1);
            } while (mushrooms[mushKey(col, row)]);
            mushrooms[mushKey(col, row)] = {
                col, row, hp: 4,
                color: MUSH_COLORS[rngInt(0, MUSH_COLORS.length - 1)],
                poisoned: false
            };
        }
    }

    function mushAt(col, row) { return mushrooms[mushKey(col, row)]; }

    function setMush(col, row, hp, poisoned) {
        const k = mushKey(col, row);
        if (hp <= 0) {
            delete mushrooms[k];
            return;
        }
        if (!mushrooms[k]) {
            mushrooms[k] = {
                col, row, hp,
                color: MUSH_COLORS[rngInt(0, MUSH_COLORS.length - 1)],
                poisoned: !!poisoned
            };
        } else {
            mushrooms[k].hp = hp;
            if (poisoned !== undefined) mushrooms[k].poisoned = poisoned;
        }
    }

    function countMushroomsInLowerHalf() {
        let n = 0;
        const midRow = Math.floor(ROWS / 2);
        for (const k in mushrooms) {
            if (mushrooms[k].row >= midRow) n++;
        }
        return n;
    }

    // ═══════════════════════════════════════════
    //  PLAYER
    // ═══════════════════════════════════════════
    function initPlayer() {
        player = {
            x: W / 2,
            y: H - CELL * 3,
            w: CELL - 2,
            h: CELL - 2,
            alive: true,
            invuln: 0
        };
    }

    function updatePlayer(dt) {
        if (!player.alive) return;
        const spd = PLAYER_SPEED * dt * 60;
        let dx = 0, dy = 0;
        if (keys['ArrowLeft'] || keys['a']) dx -= 1;
        if (keys['ArrowRight'] || keys['d']) dx += 1;
        if (keys['ArrowUp'] || keys['w']) dy -= 1;
        if (keys['ArrowDown'] || keys['s']) dy += 1;

        if (mouseDown || touchActive) {
            const tx = mouseX, ty = mouseY;
            const ddx = tx - player.x, ddy = ty - player.y;
            const d = Math.hypot(ddx, ddy);
            if (d > 2) {
                dx = ddx / d;
                dy = ddy / d;
            }
        }

        player.x += dx * spd;
        player.y += dy * spd;

        const minY = H - PLAYER_ZONE_ROWS * CELL;
        player.x = clamp(player.x, CELL / 2, W - CELL / 2);
        player.y = clamp(player.y, minY, H - CELL / 2);

        if (player.invuln > 0) player.invuln -= dt;

        // Auto-fire on touch/mouse
        if ((mouseDown || touchActive) && Date.now() - lastFireTime >= FIRE_RATE) {
            fireBullet();
        }
        // Keyboard fire (space held)
        if (keys[' '] && Date.now() - lastFireTime >= FIRE_RATE) {
            fireBullet();
        }
    }

    function fireBullet() {
        if (!player.alive) return;
        bullets.push({ x: player.x, y: player.y - player.h / 2, r: 3 });
        lastFireTime = Date.now();
        playShoot();
    }

    function killPlayer() {
        if (player.invuln > 0) return;
        player.alive = false;
        lives--;
        playDeath();
        spawnParticles(player.x, player.y, playerColor || DEFAULT_PLAYER, 15);
        state = ST_DYING;
        deathTimer = DEATH_ANIM_MS / 1000;

        // Regenerate mushrooms in player zone
        for (let c = 0; c < COLS; c++) {
            for (let r = ROWS - PLAYER_ZONE_ROWS; r < ROWS; r++) {
                const k = mushKey(c, r);
                if (mushrooms[k] && mushrooms[k].hp < 4) {
                    mushrooms[k].hp = 4;
                    mushrooms[k].poisoned = false;
                }
            }
        }
    }

    // ═══════════════════════════════════════════
    //  BULLETS
    // ═══════════════════════════════════════════
    function updateBullets(dt) {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.y -= BULLET_SPEED * dt * 60;
            if (b.y < -10) { bullets.splice(i, 1); continue; }

            // Hit mushroom
            const mc = Math.floor(b.x / CELL);
            const mr = Math.floor(b.y / CELL);
            const m = mushAt(mc, mr);
            if (m) {
                m.hp--;
                if (m.hp <= 0) {
                    score += 1;
                    spawnParticles(mc * CELL + CELL / 2, mr * CELL + CELL / 2, m.color, 5);
                    delete mushrooms[mushKey(mc, mr)];
                } else {
                    playHitMushroom();
                }
                bullets.splice(i, 1);
                continue;
            }

            // Hit centipede segments
            let hitSeg = false;
            for (let ci = centipedes.length - 1; ci >= 0; ci--) {
                const centi = centipedes[ci];
                for (let si = centi.length - 1; si >= 0; si--) {
                    const seg = centi[si];
                    if (dist(b.x, b.y, seg.x, seg.y) < CELL * 0.7) {
                        // Score: head=100, body=10
                        const pts = si === 0 ? 100 : 10;
                        score += pts;
                        combo++;
                        if (combo > maxCombo) maxCombo = combo;
                        totalKills++;
                        playHitCentipede();

                        // Segment becomes mushroom
                        const sc = clamp(Math.floor(seg.x / CELL), 0, COLS - 1);
                        const sr = clamp(Math.floor(seg.y / CELL), 0, ROWS - 1);
                        setMush(sc, sr, 4, false);

                        spawnParticles(seg.x, seg.y, si === 0 ? HEAD_COLOR : BODY_COLORS[si % 2], 10);

                        // Split centipede: segments before si become one, segments after si become another
                        const before = centi.slice(0, si);
                        const after = centi.slice(si + 1);
                        centipedes.splice(ci, 1);

                        if (before.length > 0) {
                            centipedes.push(before);
                        }
                        if (after.length > 0) {
                            // New head inherits direction
                            after[0].isHead = true;
                            centipedes.push(after);
                        }

                        hitSeg = true;
                        break;
                    }
                }
                if (hitSeg) break;
            }
            if (hitSeg) { bullets.splice(i, 1); continue; }

            // Hit spider
            if (spider && dist(b.x, b.y, spider.x, spider.y) < CELL) {
                const d = dist(player.x, player.y, spider.x, spider.y);
                const pts = d < CELL * 3 ? 900 : d < CELL * 6 ? 600 : 300;
                score += pts;
                totalKills++;
                spawnParticles(spider.x, spider.y, SPIDER_COLOR, 12);
                spider = null;
                bullets.splice(i, 1);
                continue;
            }

            // Hit flea
            if (flea && dist(b.x, b.y, flea.x, flea.y) < CELL * 0.6) {
                flea.hp--;
                if (flea.hp <= 0) {
                    score += 200;
                    totalKills++;
                    spawnParticles(flea.x, flea.y, FLEA_COLOR, 8);
                    flea = null;
                }
                bullets.splice(i, 1);
                continue;
            }

            // Hit scorpion
            if (scorpion && dist(b.x, b.y, scorpion.x, scorpion.y) < CELL) {
                score += 1000;
                totalKills++;
                spawnParticles(scorpion.x, scorpion.y, SCORPION_COLOR, 12);
                scorpion = null;
                bullets.splice(i, 1);
                continue;
            }
        }

        // Bonus life
        if (score >= nextBonusAt) {
            lives++;
            nextBonusAt += BONUS_LIFE_SCORE;
            playLevelUp();
        }
    }

    // ═══════════════════════════════════════════
    //  CENTIPEDE
    // ═══════════════════════════════════════════
    function spawnCentipede() {
        const segs = Math.min(INITIAL_SEGMENTS + level - 1, MAX_SEGMENTS);
        const centi = [];
        const startX = CELL / 2;
        const startY = CELL / 2;
        for (let i = 0; i < segs; i++) {
            centi.push({
                x: startX - i * CELL,
                y: startY,
                col: -i,
                row: 0,
                dir: 1,        // 1=right, -1=left
                dropping: false,
                dropTarget: 0,
                isHead: i === 0,
                speed: 1.2 + level * 0.1
            });
        }
        centipedes = [centi];
    }

    function updateCentipedes(dt) {
        const spd60 = dt * 60;
        for (let ci = 0; ci < centipedes.length; ci++) {
            const centi = centipedes[ci];
            if (!centi || centi.length === 0) continue;

            for (let si = 0; si < centi.length; si++) {
                const seg = centi[si];
                const baseSpeed = seg.speed * CELL * 0.12 * spd60;

                if (seg.dropping) {
                    // Move down toward drop target
                    seg.y += baseSpeed;
                    if (seg.y >= seg.dropTarget) {
                        seg.y = seg.dropTarget;
                        seg.row = Math.floor(seg.y / CELL);
                        seg.dropping = false;
                    }
                    continue;
                }

                if (si === 0) {
                    // Head logic
                    seg.x += seg.dir * baseSpeed;
                    seg.col = Math.floor(seg.x / CELL);
                    seg.row = Math.floor(seg.y / CELL);

                    // Check if we should drop: wall or mushroom ahead
                    let shouldDrop = false;

                    // Wall check
                    if (seg.x <= CELL * 0.3 && seg.dir < 0) shouldDrop = true;
                    if (seg.x >= W - CELL * 0.3 && seg.dir > 0) shouldDrop = true;

                    // Mushroom ahead check
                    const nextCol = seg.col + seg.dir;
                    if (nextCol >= 0 && nextCol < COLS) {
                        const m = mushAt(nextCol, seg.row);
                        if (m) {
                            // Poisoned mushroom: dive straight down
                            if (m.poisoned) {
                                seg.dropping = true;
                                seg.dropTarget = H - CELL / 2;
                                seg.dir = -seg.dir;
                                continue;
                            }
                            shouldDrop = true;
                        }
                    }

                    if (shouldDrop) {
                        seg.dir = -seg.dir;
                        seg.dropping = true;
                        seg.dropTarget = seg.y + CELL;
                        // Bounce back up at bottom
                        if (seg.row >= ROWS - 1) {
                            seg.dropTarget = seg.y - CELL;
                            seg.y = Math.max(seg.y, CELL / 2);
                        }
                    }
                } else {
                    // Body follows previous segment
                    const prev = centi[si - 1];
                    const dx = prev.x - seg.x;
                    const dy = prev.y - seg.y;
                    const d = Math.hypot(dx, dy);
                    const targetDist = CELL * 0.85;
                    if (d > targetDist) {
                        const ratio = baseSpeed / d;
                        seg.x += dx * ratio;
                        seg.y += dy * ratio;
                    }
                    seg.col = Math.floor(seg.x / CELL);
                    seg.row = Math.floor(seg.y / CELL);
                    seg.dir = prev.dir;
                }
            }

            // Check collision with player
            if (player.alive && player.invuln <= 0) {
                for (const seg of centi) {
                    if (dist(player.x, player.y, seg.x, seg.y) < CELL * 0.8) {
                        killPlayer();
                        break;
                    }
                }
            }
        }

        // Clean empty centipedes
        centipedes = centipedes.filter(c => c && c.length > 0);

        // All centipedes cleared = next level
        if (centipedes.length === 0 && state === ST_PLAYING) {
            levelUp();
        }
    }

    function levelUp() {
        level++;
        combo = 0;
        playLevelUp();
        // Add some mushrooms
        let added = 0;
        while (added < 5 + level) {
            const col = rngInt(0, COLS - 1);
            const row = rngInt(1, ROWS - PLAYER_ZONE_ROWS - 1);
            if (!mushAt(col, row)) {
                setMush(col, row, 4, false);
                added++;
            }
        }
        spawnCentipede();
    }

    // ═══════════════════════════════════════════
    //  SPIDER
    // ═══════════════════════════════════════════
    function spawnSpider() {
        const fromLeft = Math.random() < 0.5;
        spider = {
            x: fromLeft ? -CELL : W + CELL,
            y: H - rng(2, PLAYER_ZONE_ROWS) * CELL,
            vx: (fromLeft ? 1 : -1) * rng(1.5, 2.5),
            vy: rng(-2, 2),
            bounceTimer: 0
        };
    }

    function updateSpider(dt) {
        if (!spider) {
            spiderTimer -= dt * 1000;
            if (spiderTimer <= 0) {
                spawnSpider();
                spiderTimer = rng(SPIDER_INTERVAL_MIN, SPIDER_INTERVAL_MAX);
            }
            return;
        }

        const spd = dt * 60;
        spider.bounceTimer -= dt;
        if (spider.bounceTimer <= 0) {
            spider.vy = rng(-3, 3);
            spider.bounceTimer = rng(0.2, 0.6);
            if (Math.random() < 0.3) playSpiderBounce();
        }

        spider.x += spider.vx * spd;
        spider.y += spider.vy * spd;

        // Clamp to player zone vertically
        const minY = H - PLAYER_ZONE_ROWS * CELL;
        if (spider.y < minY) { spider.y = minY; spider.vy = Math.abs(spider.vy); }
        if (spider.y > H - CELL) { spider.y = H - CELL; spider.vy = -Math.abs(spider.vy); }

        // Eat mushrooms it touches
        const sc = Math.floor(spider.x / CELL);
        const sr = Math.floor(spider.y / CELL);
        if (mushAt(sc, sr) && Math.random() < 0.05) {
            delete mushrooms[mushKey(sc, sr)];
        }

        // Off screen = gone
        if (spider.x < -CELL * 3 || spider.x > W + CELL * 3) {
            spider = null;
            return;
        }

        // Hit player
        if (player.alive && player.invuln <= 0 && dist(player.x, player.y, spider.x, spider.y) < CELL) {
            killPlayer();
        }
    }

    // ═══════════════════════════════════════════
    //  FLEA
    // ═══════════════════════════════════════════
    function maybeSpawnFlea() {
        if (flea) return;
        if (countMushroomsInLowerHalf() < FLEA_THRESHOLD) {
            flea = {
                x: rng(CELL * 2, W - CELL * 2),
                y: -CELL,
                speed: rng(2.5, 4),
                hp: 2
            };
        }
    }

    function updateFlea(dt) {
        if (!flea) return;
        flea.y += flea.speed * dt * 60;

        // Leave mushroom trail
        const fc = Math.floor(flea.x / CELL);
        const fr = Math.floor(flea.y / CELL);
        if (fr >= 0 && fr < ROWS && !mushAt(fc, fr) && Math.random() < 0.15) {
            setMush(fc, fr, 4, false);
        }

        // Off bottom
        if (flea.y > H + CELL) { flea = null; return; }

        // Hit player
        if (player.alive && player.invuln <= 0 && dist(player.x, player.y, flea.x, flea.y) < CELL * 0.8) {
            killPlayer();
        }
    }

    // ═══════════════════════════════════════════
    //  SCORPION
    // ═══════════════════════════════════════════
    function maybeSpawnScorpion() {
        if (scorpion) return;
        scorpionTimer -= 1;
        if (scorpionTimer <= 0) {
            const fromLeft = Math.random() < 0.5;
            const row = rngInt(4, ROWS - PLAYER_ZONE_ROWS - 2);
            scorpion = {
                x: fromLeft ? -CELL : W + CELL,
                y: row * CELL + CELL / 2,
                dir: fromLeft ? 1 : -1,
                speed: 1.8 + level * 0.15
            };
            scorpionTimer = rng(20, 35) * 60; // in frames
        }
    }

    function updateScorpion(dt) {
        if (!scorpion) return;
        scorpion.x += scorpion.dir * scorpion.speed * dt * 60;

        // Poison mushrooms it passes
        const sc = Math.floor(scorpion.x / CELL);
        const sr = Math.floor(scorpion.y / CELL);
        const m = mushAt(sc, sr);
        if (m) m.poisoned = true;

        // Off screen
        if ((scorpion.dir > 0 && scorpion.x > W + CELL * 2) ||
            (scorpion.dir < 0 && scorpion.x < -CELL * 2)) {
            scorpion = null;
            return;
        }

        // Hit player
        if (player.alive && player.invuln <= 0 && dist(player.x, player.y, scorpion.x, scorpion.y) < CELL) {
            killPlayer();
        }
    }

    // ═══════════════════════════════════════════
    //  PARTICLES
    // ═══════════════════════════════════════════
    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt * 60;
            p.y += p.vy * dt * 60;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    // ═══════════════════════════════════════════
    //  DRAWING
    // ═══════════════════════════════════════════
    function drawBackground() {
        ctx.fillStyle = BG_THEME;
        ctx.fillRect(0, 0, W, H);

        // Faint grid
        ctx.strokeStyle = GRID_LINE;
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= W; x += CELL) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = 0; y <= H; y += CELL) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        // Player zone line
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        const zoneY = H - PLAYER_ZONE_ROWS * CELL;
        ctx.beginPath(); ctx.moveTo(0, zoneY); ctx.lineTo(W, zoneY); ctx.stroke();
    }

    function drawMushrooms() {
        for (const k in mushrooms) {
            const m = mushrooms[k];
            const cx = m.col * CELL + CELL / 2;
            const cy = m.row * CELL + CELL / 2;
            const sizeRatio = m.hp / 4;
            const r = CELL * 0.4 * (0.4 + 0.6 * sizeRatio);

            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            if (m.poisoned) {
                ctx.fillStyle = POISON_TINT;
            } else {
                ctx.fillStyle = m.color;
            }
            ctx.fill();

            // Shiny highlight
            ctx.beginPath();
            ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fill();
        }
    }

    function drawCentipedes() {
        for (const centi of centipedes) {
            // Draw body connections
            ctx.strokeStyle = 'rgba(236,72,153,0.3)';
            ctx.lineWidth = 3;
            if (centi.length > 1) {
                ctx.beginPath();
                ctx.moveTo(centi[0].x, centi[0].y);
                for (let i = 1; i < centi.length; i++) {
                    ctx.lineTo(centi[i].x, centi[i].y);
                }
                ctx.stroke();
            }

            // Draw segments
            for (let i = centi.length - 1; i >= 0; i--) {
                const seg = centi[i];
                const isHead = i === 0;
                const r = isHead ? CELL * 0.5 : CELL * 0.38;
                const color = isHead ? HEAD_COLOR : BODY_COLORS[i % 2];

                // Body glow
                ctx.beginPath();
                ctx.arc(seg.x, seg.y, r + 2, 0, Math.PI * 2);
                ctx.fillStyle = color + '33';
                ctx.fill();

                // Main body
                ctx.beginPath();
                ctx.arc(seg.x, seg.y, r, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();

                // Highlight
                ctx.beginPath();
                ctx.arc(seg.x - r * 0.25, seg.y - r * 0.25, r * 0.35, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.fill();

                // Head eyes
                if (isHead) {
                    const eyeOff = r * 0.3;
                    const eyeR = 2.5;
                    ctx.fillStyle = '#FFF';
                    ctx.beginPath(); ctx.arc(seg.x - eyeOff, seg.y - eyeOff, eyeR, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(seg.x + eyeOff, seg.y - eyeOff, eyeR, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#111';
                    ctx.beginPath(); ctx.arc(seg.x - eyeOff + seg.dir, seg.y - eyeOff, 1.2, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(seg.x + eyeOff + seg.dir, seg.y - eyeOff, 1.2, 0, Math.PI * 2); ctx.fill();
                }
            }
        }
    }

    function drawPlayer() {
        if (!player.alive) return;
        // Blink during invuln
        if (player.invuln > 0 && Math.floor(player.invuln * 10) % 2 === 0) return;

        const px = player.x, py = player.y;
        const col = playerColor || DEFAULT_PLAYER;

        // Glow
        ctx.beginPath();
        ctx.arc(px, py, CELL * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = col + '22';
        ctx.fill();

        // Arrow/triangle pointing up
        ctx.beginPath();
        ctx.moveTo(px, py - CELL * 0.5);
        ctx.lineTo(px - CELL * 0.4, py + CELL * 0.35);
        ctx.lineTo(px + CELL * 0.4, py + CELL * 0.35);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();

        // Inner highlight
        ctx.beginPath();
        ctx.moveTo(px, py - CELL * 0.25);
        ctx.lineTo(px - CELL * 0.15, py + CELL * 0.15);
        ctx.lineTo(px + CELL * 0.15, py + CELL * 0.15);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fill();
    }

    function drawBullets() {
        for (const b of bullets) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fillStyle = BULLET_COLOR;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r + 2, 0, Math.PI * 2);
            ctx.fillStyle = BULLET_COLOR + '44';
            ctx.fill();
        }
    }

    function drawSpider() {
        if (!spider) return;
        const sx = spider.x, sy = spider.y;

        // Body
        ctx.beginPath();
        ctx.arc(sx, sy, CELL * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = SPIDER_COLOR;
        ctx.fill();

        // 8 legs
        ctx.strokeStyle = SPIDER_COLOR;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + Math.sin(Date.now() * 0.01 + i) * 0.3;
            const legLen = CELL * 0.6;
            const ex = sx + Math.cos(angle) * legLen;
            const ey = sy + Math.sin(angle) * legLen;
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        }

        // Eyes
        ctx.fillStyle = '#FFF';
        ctx.beginPath(); ctx.arc(sx - 3, sy - 3, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sx + 3, sy - 3, 2, 0, Math.PI * 2); ctx.fill();
    }

    function drawFlea() {
        if (!flea) return;
        const fx = flea.x, fy = flea.y;

        // Trailing line
        ctx.strokeStyle = FLEA_COLOR + '66';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(fx, fy - CELL); ctx.lineTo(fx, fy); ctx.stroke();

        // Body
        ctx.beginPath();
        ctx.arc(fx, fy, CELL * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = FLEA_COLOR;
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(fx, fy, CELL * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = FLEA_COLOR + '33';
        ctx.fill();
    }

    function drawScorpion() {
        if (!scorpion) return;
        const sx = scorpion.x, sy = scorpion.y;

        // Body (oval)
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1.4, 1);
        ctx.beginPath();
        ctx.arc(0, 0, CELL * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = SCORPION_COLOR;
        ctx.fill();
        ctx.restore();

        // Tail (curved line)
        ctx.strokeStyle = SCORPION_COLOR;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        const tailDir = -scorpion.dir;
        ctx.moveTo(sx + tailDir * CELL * 0.4, sy);
        ctx.quadraticCurveTo(sx + tailDir * CELL * 0.8, sy - CELL * 0.6,
                             sx + tailDir * CELL * 0.5, sy - CELL * 0.8);
        ctx.stroke();

        // Stinger
        ctx.beginPath();
        ctx.arc(sx + tailDir * CELL * 0.5, sy - CELL * 0.8, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#FDE047';
        ctx.fill();

        // Pincers
        ctx.strokeStyle = SCORPION_COLOR;
        ctx.lineWidth = 2;
        const pDir = scorpion.dir;
        ctx.beginPath();
        ctx.moveTo(sx + pDir * CELL * 0.4, sy - 3);
        ctx.lineTo(sx + pDir * CELL * 0.7, sy - 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx + pDir * CELL * 0.4, sy + 3);
        ctx.lineTo(sx + pDir * CELL * 0.7, sy + 6);
        ctx.stroke();

        // Legs
        for (let i = -2; i <= 2; i++) {
            if (i === 0) continue;
            const lx = sx + i * 4;
            const wobble = Math.sin(Date.now() * 0.015 + i) * 2;
            ctx.beginPath();
            ctx.moveTo(lx, sy);
            ctx.lineTo(lx, sy + CELL * 0.35 + wobble);
            ctx.stroke();
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawHUD() {
        ctx.fillStyle = HUD_COLOR;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('SCORE ' + score, 8, 16);
        ctx.textAlign = 'center';
        ctx.fillText('LEVEL ' + level, W / 2, 16);
        ctx.textAlign = 'right';

        // Lives as small triangles
        for (let i = 0; i < lives; i++) {
            const lx = W - 12 - i * 18;
            const ly = 10;
            ctx.beginPath();
            ctx.moveTo(lx, ly - 5);
            ctx.lineTo(lx - 5, ly + 4);
            ctx.lineTo(lx + 5, ly + 4);
            ctx.closePath();
            ctx.fillStyle = playerColor || DEFAULT_PLAYER;
            ctx.fill();
        }
    }

    // ═══════════════════════════════════════════
    //  TITLE SCREEN
    // ═══════════════════════════════════════════
    function initTitle() {
        titleCentipede = [];
        for (let i = 0; i < 14; i++) {
            titleCentipede.push({
                x: -i * CELL * 0.9,
                y: H * 0.48,
                phase: i * 0.4
            });
        }
        titleTick = 0;
    }

    function updateTitle(dt) {
        titleTick += dt;
        for (let i = 0; i < titleCentipede.length; i++) {
            const seg = titleCentipede[i];
            seg.x += 1.8 * dt * 60;
            if (seg.x > W + CELL * 2) seg.x = -CELL * 2;
            seg.y = H * 0.48 + Math.sin(titleTick * 3 + seg.phase) * 15;
        }
    }

    function drawTitle() {
        drawBackground();

        // Animated demo centipede
        if (titleCentipede.length > 1) {
            ctx.strokeStyle = 'rgba(236,72,153,0.25)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(titleCentipede[0].x, titleCentipede[0].y);
            for (let i = 1; i < titleCentipede.length; i++) {
                ctx.lineTo(titleCentipede[i].x, titleCentipede[i].y);
            }
            ctx.stroke();
        }

        for (let i = titleCentipede.length - 1; i >= 0; i--) {
            const seg = titleCentipede[i];
            const isHead = i === 0;
            const r = isHead ? 9 : 7;
            const color = isHead ? HEAD_COLOR : BODY_COLORS[i % 2];

            ctx.beginPath();
            ctx.arc(seg.x, seg.y, r + 2, 0, Math.PI * 2);
            ctx.fillStyle = color + '33';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(seg.x, seg.y, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();

            if (isHead) {
                ctx.fillStyle = '#FFF';
                ctx.beginPath(); ctx.arc(seg.x - 3, seg.y - 3, 2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(seg.x + 3, seg.y - 3, 2, 0, Math.PI * 2); ctx.fill();
            }
        }

        // Title text
        ctx.textAlign = 'center';

        // "MOLLIPED" with gradient
        ctx.font = 'bold 48px monospace';
        const titleY = H * 0.28;
        const grad = ctx.createLinearGradient(W * 0.2, titleY, W * 0.8, titleY);
        grad.addColorStop(0, '#F43F5E');
        grad.addColorStop(0.5, '#EC4899');
        grad.addColorStop(1, '#A855F7');
        ctx.fillStyle = grad;
        ctx.fillText('CENTIPEDE', W / 2, titleY);

        // Glow behind title
        ctx.shadowColor = '#EC4899';
        ctx.shadowBlur = 20;
        ctx.fillText('CENTIPEDE', W / 2, titleY);
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.font = '14px monospace';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText('A Classic Arcade Shooter', W / 2, titleY + 30);

        // Start prompt (pulsing)
        const alpha = 0.5 + Math.sin(titleTick * 3) * 0.5;
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#E0E7FF';
        ctx.fillText('Tap or Space to Play', W / 2, H * 0.7);
        ctx.globalAlpha = 1;

        // Controls hint
        ctx.font = '12px monospace';
        ctx.fillStyle = '#64748B';
        ctx.fillText('Arrow Keys / Mouse to Move', W / 2, H * 0.78);
        ctx.fillText('Space / Click to Fire', W / 2, H * 0.82);
    }

    // ═══════════════════════════════════════════
    //  GAME OVER SCREEN
    // ═══════════════════════════════════════════
    function drawGameOver() {
        // Darken
        ctx.fillStyle = 'rgba(15,17,23,0.75)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';

        ctx.font = 'bold 40px monospace';
        ctx.fillStyle = '#F43F5E';
        ctx.fillText('GAME OVER', W / 2, H * 0.32);

        ctx.font = 'bold 24px monospace';
        ctx.fillStyle = HUD_COLOR;
        ctx.fillText('Score: ' + score, W / 2, H * 0.42);

        ctx.font = '16px monospace';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText('Level ' + level, W / 2, H * 0.48);
        ctx.fillText('Enemies Popped: ' + totalKills, W / 2, H * 0.53);
        ctx.fillText('Max Combo: ' + maxCombo, W / 2, H * 0.58);

        const alpha = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#E0E7FF';
        ctx.fillText('Tap or Space to Restart', W / 2, H * 0.68);
        ctx.globalAlpha = 1;
    }

    // ═══════════════════════════════════════════
    //  MAIN UPDATE & RENDER
    // ═══════════════════════════════════════════
    function update(dt) {
        switch (state) {
            case ST_TITLE:
                updateTitle(dt);
                break;

            case ST_PLAYING:
                updatePlayer(dt);
                updateBullets(dt);
                updateCentipedes(dt);
                updateSpider(dt);
                updateFlea(dt);
                updateScorpion(dt);
                updateParticles(dt);
                maybeSpawnFlea();
                maybeSpawnScorpion();
                break;

            case ST_DYING:
                deathTimer -= dt;
                updateParticles(dt);
                updateCentipedes(dt);
                if (deathTimer <= 0) {
                    if (lives <= 0) {
                        state = ST_GAMEOVER;
                        if (gameOverCB) {
                            gameOverCB({
                                score: score,
                                level: level,
                                duration: Math.floor((Date.now() - startTime) / 1000),
                                totalPopped: totalKills,
                                maxCombo: maxCombo
                            });
                        }
                    } else {
                        // Respawn
                        initPlayer();
                        player.invuln = 2;
                        bullets = [];
                        state = ST_PLAYING;
                    }
                }
                break;

            case ST_GAMEOVER:
                updateParticles(dt);
                break;
        }
    }

    function render() {
        switch (state) {
            case ST_TITLE:
                drawTitle();
                break;

            case ST_PLAYING:
            case ST_DYING:
                drawBackground();
                drawMushrooms();
                drawCentipedes();
                drawBullets();
                drawSpider();
                drawFlea();
                drawScorpion();
                drawPlayer();
                drawParticles();
                drawHUD();
                if (state === ST_DYING) {
                    ctx.fillStyle = 'rgba(15,17,23,' + (0.3 * (1 - deathTimer / (DEATH_ANIM_MS / 1000))) + ')';
                    ctx.fillRect(0, 0, W, H);
                }
                break;

            case ST_GAMEOVER:
                drawBackground();
                drawMushrooms();
                drawCentipedes();
                drawParticles();
                drawHUD();
                drawGameOver();
                break;
        }
    }

    // ═══════════════════════════════════════════
    //  GAME LOOP
    // ═══════════════════════════════════════════
    function gameLoop(now) {
        if (!gameActive) return;
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        update(dt);

        // Handle canvas scaling
        const rect = canvas.getBoundingClientRect();
        const scaleX = W / rect.width;
        const scaleY = H / rect.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        render();

        animFrame = requestAnimationFrame(gameLoop);
    }

    // ═══════════════════════════════════════════
    //  START GAME
    // ═══════════════════════════════════════════
    function startGame() {
        score = 0;
        level = 1;
        lives = INITIAL_LIVES;
        totalKills = 0;
        maxCombo = 0;
        combo = 0;
        nextBonusAt = BONUS_LIFE_SCORE;
        bullets = [];
        particles = [];
        spider = null;
        flea = null;
        scorpion = null;
        spiderTimer = rng(SPIDER_INTERVAL_MIN, SPIDER_INTERVAL_MAX);
        scorpionTimer = rng(20, 35) * 60;
        startTime = Date.now();

        initMushrooms(INITIAL_MUSHROOMS);
        initPlayer();
        spawnCentipede();

        state = ST_PLAYING;
    }

    // ═══════════════════════════════════════════
    //  INPUT HANDLERS
    // ═══════════════════════════════════════════
    function onKeyDown(e) {
        keys[e.key] = true;

        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            ensureAudio();
            if (state === ST_TITLE) startGame();
            else if (state === ST_GAMEOVER) {
                state = ST_TITLE;
                initTitle();
            }
        }
    }

    function onKeyUp(e) {
        keys[e.key] = false;
    }

    function canvasCoords(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) * (W / rect.width),
            y: (clientY - rect.top) * (H / rect.height)
        };
    }

    function onMouseMove(e) {
        const c = canvasCoords(e.clientX, e.clientY);
        mouseX = c.x;
        mouseY = c.y;
    }

    function onMouseDown(e) {
        e.preventDefault();
        const c = canvasCoords(e.clientX, e.clientY);
        mouseX = c.x;
        mouseY = c.y;
        mouseDown = true;
        ensureAudio();

        if (state === ST_TITLE) startGame();
        else if (state === ST_GAMEOVER) {
            state = ST_TITLE;
            initTitle();
        }
    }

    function onMouseUp() {
        mouseDown = false;
    }

    function onTouchStart(e) {
        e.preventDefault();
        const t = e.touches[0];
        const c = canvasCoords(t.clientX, t.clientY);
        mouseX = c.x;
        mouseY = c.y;
        touchActive = true;
        ensureAudio();

        if (state === ST_TITLE) startGame();
        else if (state === ST_GAMEOVER) {
            state = ST_TITLE;
            initTitle();
        }
    }

    function onTouchMove(e) {
        e.preventDefault();
        const t = e.touches[0];
        const c = canvasCoords(t.clientX, t.clientY);
        mouseX = c.x;
        mouseY = c.y;
    }

    function onTouchEnd(e) {
        e.preventDefault();
        touchActive = false;
    }

    // ── Resize: keep design res, CSS-scale to fill container ──
    function fitCanvas() {
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (cw < 10 || ch < 10) return;
        const aspect = W / H;
        let drawW, drawH;
        if (cw / ch > aspect) { drawH = ch; drawW = ch * aspect; }
        else { drawW = cw; drawH = cw / aspect; }
        canvas.style.width  = drawW + 'px';
        canvas.style.height = drawH + 'px';
    }

    // ═══════════════════════════════════════════
    //  INIT & DESTROY
    // ═══════════════════════════════════════════
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        canvas.width = W;
        canvas.height = H;
        gameOverCB = gameOverCallback || null;
        playerColor = (activePlayer && activePlayer.color) ? activePlayer.color : DEFAULT_PLAYER;
        gameActive = true;

        // Load player theme
        const themeId = activePlayer?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            HEAD_COLOR   = _t.colors[0] || HEAD_COLOR;
            BODY_COLORS  = [_t.colors[1] || BODY_COLORS[0], _t.colors[2] || BODY_COLORS[1]];
            MUSH_COLORS  = [_t.colors[3] || MUSH_COLORS[0], _t.colors[4] || MUSH_COLORS[1],
                            _t.colors[5] || MUSH_COLORS[2], _t.colors[2] || MUSH_COLORS[3]];
            BULLET_COLOR = _t.colors[4] || BULLET_COLOR;
            BG_THEME     = (_t.bgGradient && _t.bgGradient[0]) || BG_THEME;
        }

        // Reset all state
        score = 0;
        level = 1;
        lives = INITIAL_LIVES;
        totalKills = 0;
        maxCombo = 0;
        combo = 0;
        nextBonusAt = BONUS_LIFE_SCORE;
        bullets = [];
        particles = [];
        centipedes = [];
        mushrooms = {};
        spider = null;
        flea = null;
        scorpion = null;
        keys = {};
        mouseDown = false;
        touchActive = false;
        lastFireTime = 0;
        spiderTimer = rng(SPIDER_INTERVAL_MIN, SPIDER_INTERVAL_MAX);
        scorpionTimer = rng(20, 35) * 60;

        state = ST_TITLE;
        initTitle();
        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        // Bind input
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        window.addEventListener('resize', fitCanvas);

        lastTime = performance.now();
        animFrame = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        if (audioCtx) {
            try { audioCtx.close(); } catch (_) {}
            audioCtx = null;
        }
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', fitCanvas);
        if (canvas) {
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        keys = {};
        bullets = [];
        particles = [];
        centipedes = [];
        mushrooms = {};
        spider = null;
        flea = null;
        scorpion = null;
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return level; },
        isActive() { return gameActive; }
    };
})();
