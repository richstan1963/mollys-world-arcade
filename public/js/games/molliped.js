/* Molliped — Sprite-based Centipede for Your World Arcade
   Uses Kenney platformer + space sprite sheets */
window.Molliped = (() => {
    // ── Constants ──
    const W = 480, H = 640;
    const COLS = 30, ROWS = 40, CELL = 16;
    const HUD_COLOR = '#E0E7FF';
    const PLAYER_ZONE_ROWS = 8;
    const FIRE_RATE = 160;
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
    const FLEA_THRESHOLD = 5;

    // ── Colors (theme-overridable, used as fallback) ──
    let HEAD_COLOR = '#F43F5E';
    let BODY_COLORS = ['#EC4899', '#A855F7'];
    let MUSH_COLORS = ['#22C55E', '#3B82F6', '#F59E0B', '#06B6D4'];
    let POISON_TINT = '#84CC16';
    let SPIDER_COLOR = '#EF4444';
    let FLEA_COLOR = '#F59E0B';
    let SCORPION_COLOR = '#8B5CF6';
    let BULLET_COLOR = '#38BDF8';
    const DEFAULT_PLAYER = '#38BDF8';

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

    // Visual state
    let scorePopups = [];
    let screenShake = 0;
    let bgStars = [];
    let bgGrassTufts = [];
    let animTick = 0;          // global frame counter for sprite animation
    let explosions = [];       // {x, y, frame, timer}

    // ═══════════════════════════════════════════
    //  SPRITE SYSTEM
    // ═══════════════════════════════════════════
    const SPRITE_BASE = '/img/game-assets';
    let sprites = {};          // name -> Image
    let spritesLoaded = false;
    let spriteLoadProgress = 0;
    let spriteLoadTotal = 0;

    const SPRITE_MANIFEST = {
        // Centipede
        head:           `${SPRITE_BASE}/kenney-platform/enemies/wormGreen.png`,
        headMove:       `${SPRITE_BASE}/kenney-platform/enemies/wormGreen_move.png`,
        body:           `${SPRITE_BASE}/kenney-platform/enemies/slimeGreen.png`,
        bodyMove:       `${SPRITE_BASE}/kenney-platform/enemies/slimeGreen_move.png`,
        bodyDead:       `${SPRITE_BASE}/kenney-platform/enemies/slimeGreen_dead.png`,
        // Spider
        spider:         `${SPRITE_BASE}/kenney-platform/enemies/ladybug.png`,
        spiderMove:     `${SPRITE_BASE}/kenney-platform/enemies/ladybug_move.png`,
        // Flea
        flea:           `${SPRITE_BASE}/kenney-platform/enemies/fly.png`,
        fleaMove:       `${SPRITE_BASE}/kenney-platform/enemies/fly_move.png`,
        fleaDead:       `${SPRITE_BASE}/kenney-platform/enemies/fly_dead.png`,
        // Scorpion
        scorpion:       `${SPRITE_BASE}/kenney-platform/enemies/snail.png`,
        scorpionMove:   `${SPRITE_BASE}/kenney-platform/enemies/snail_move.png`,
        // Mushrooms
        mushroom:       `${SPRITE_BASE}/kenney-platform/enemies/slimePurple.png`,
        mushroomHit:    `${SPRITE_BASE}/kenney-platform/enemies/slimePurple_hit.png`,
        mushroomPoison: `${SPRITE_BASE}/kenney-platform/enemies/slimePurple_dead.png`,
        // Player
        ship:           `${SPRITE_BASE}/kenney-space/ships/playerShip1_blue.png`,
        // Bullet
        laser:          `${SPRITE_BASE}/kenney-space/lasers/laserBlue01.png`,
        // Items
        coinGold:       `${SPRITE_BASE}/kenney-platform/items/coinGold.png`,
        star:           `${SPRITE_BASE}/kenney-platform/items/star.png`,
        // Ground
        grass:          `${SPRITE_BASE}/kenney-platform/ground/Grass/grass.png`,
        grassCenter:    `${SPRITE_BASE}/kenney-platform/ground/Grass/grassCenter.png`,
        // Explosion frames (key frames)
        fire00:         `${SPRITE_BASE}/kenney-space/effects/fire00.png`,
        fire04:         `${SPRITE_BASE}/kenney-space/effects/fire04.png`,
        fire08:         `${SPRITE_BASE}/kenney-space/effects/fire08.png`,
        fire12:         `${SPRITE_BASE}/kenney-space/effects/fire12.png`,
        fire16:         `${SPRITE_BASE}/kenney-space/effects/fire16.png`,
        fire19:         `${SPRITE_BASE}/kenney-space/effects/fire19.png`,
        // Particles
        particle1:      `${SPRITE_BASE}/kenney-particles/particleWhite_1.png`,
        particle2:      `${SPRITE_BASE}/kenney-particles/particleWhite_2.png`,
        particle3:      `${SPRITE_BASE}/kenney-particles/particleWhite_3.png`,
        particle4:      `${SPRITE_BASE}/kenney-particles/particleWhite_4.png`,
        particle5:      `${SPRITE_BASE}/kenney-particles/particleWhite_5.png`,
        particle6:      `${SPRITE_BASE}/kenney-particles/particleWhite_6.png`,
        particle7:      `${SPRITE_BASE}/kenney-particles/particleWhite_7.png`,
    };

    const EXPLOSION_FRAMES = ['fire00', 'fire04', 'fire08', 'fire12', 'fire16', 'fire19'];
    const PARTICLE_SPRITES = ['particle1', 'particle2', 'particle3', 'particle4',
                              'particle5', 'particle6', 'particle7'];

    function loadSprites() {
        return new Promise((resolve) => {
            const keys = Object.keys(SPRITE_MANIFEST);
            spriteLoadTotal = keys.length;
            spriteLoadProgress = 0;
            let loaded = 0;

            keys.forEach(key => {
                const img = new Image();
                img.onload = () => {
                    sprites[key] = img;
                    loaded++;
                    spriteLoadProgress = loaded;
                    if (loaded >= keys.length) {
                        spritesLoaded = true;
                        resolve();
                    }
                };
                img.onerror = () => {
                    // Graceful fallback: mark as null so we use canvas shapes
                    sprites[key] = null;
                    loaded++;
                    spriteLoadProgress = loaded;
                    if (loaded >= keys.length) {
                        spritesLoaded = true;
                        resolve();
                    }
                };
                img.src = SPRITE_MANIFEST[key];
            });
        });
    }

    /** Draw a sprite centered at (x,y) fitting in w x h, with optional rotation.
     *  Falls back to colored circle if sprite is null. */
    function drawSprite(name, x, y, w, h, opts) {
        const img = sprites[name];
        opts = opts || {};
        const rot = opts.rotation || 0;
        const flipX = opts.flipX || false;
        const alpha = opts.alpha !== undefined ? opts.alpha : 1;
        const tint = opts.tint || null;

        if (img) {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(x, y);
            if (rot) ctx.rotate(rot);
            if (flipX) ctx.scale(-1, 1);
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            // Color tint overlay (multiply-style)
            if (tint) {
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fillStyle = tint;
                ctx.fillRect(-w / 2, -h / 2, w, h);
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.restore();
        } else {
            // Fallback: colored shape
            const fallback = opts.fallbackColor || '#FF00FF';
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = fallback;
            ctx.beginPath();
            ctx.arc(x, y, Math.min(w, h) / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    /** Draw sprite with tint using offscreen canvas trick */
    function drawTintedSprite(name, x, y, w, h, tintColor, alpha) {
        const img = sprites[name];
        if (!img) {
            ctx.save();
            ctx.globalAlpha = alpha || 1;
            ctx.fillStyle = tintColor || '#FFF';
            ctx.beginPath();
            ctx.arc(x, y, Math.min(w, h) / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }
        ctx.save();
        ctx.globalAlpha = alpha || 1;
        ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
        ctx.restore();
    }

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
            const angle = rng(0, Math.PI * 2);
            const speed = rng(1, 4);
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: rng(0.4, 0.9),
                maxLife: 0.9,
                color,
                r: rng(1.5, 4.5),
                spark: Math.random() < 0.3,
                gravity: rng(0.5, 1.5),
                spriteIdx: rngInt(0, PARTICLE_SPRITES.length - 1)
            });
        }
    }

    function spawnExplosion(x, y) {
        explosions.push({ x, y, frame: 0, timer: 0 });
    }

    function spawnScorePopup(x, y, pts, color) {
        scorePopups.push({
            x, y, text: '+' + pts,
            color: color || '#FDE047',
            life: 1.0, maxLife: 1.0
        });
    }

    function triggerScreenShake(dur) {
        screenShake = Math.max(screenShake, dur || 0.3);
    }

    function initBackgroundDetails() {
        bgStars = [];
        for (let i = 0; i < 40; i++) {
            bgStars.push({
                x: rng(0, W), y: rng(0, H),
                r: rng(0.5, 1.5),
                speed: rng(0.1, 0.4),
                phase: rng(0, Math.PI * 2),
                alpha: rng(0.1, 0.35)
            });
        }
        bgGrassTufts = [];
        for (let i = 0; i < 30; i++) {
            bgGrassTufts.push({ x: i * 16 });
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

        if ((mouseDown || touchActive) && Date.now() - lastFireTime >= FIRE_RATE) {
            fireBullet();
        }
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
        spawnParticles(player.x, player.y, playerColor || DEFAULT_PLAYER, 25);
        spawnExplosion(player.x, player.y);
        triggerScreenShake(0.4);
        state = ST_DYING;
        deathTimer = DEATH_ANIM_MS / 1000;

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
                        const pts = si === 0 ? 100 : 10;
                        score += pts;
                        combo++;
                        if (combo > maxCombo) maxCombo = combo;
                        totalKills++;
                        playHitCentipede();

                        const sc = clamp(Math.floor(seg.x / CELL), 0, COLS - 1);
                        const sr = clamp(Math.floor(seg.y / CELL), 0, ROWS - 1);
                        setMush(sc, sr, 4, false);

                        const segColor = si === 0 ? HEAD_COLOR : BODY_COLORS[si % 2];
                        spawnParticles(seg.x, seg.y, segColor, 14);
                        spawnExplosion(seg.x, seg.y);
                        spawnScorePopup(seg.x, seg.y, pts, segColor);

                        const before = centi.slice(0, si);
                        const after = centi.slice(si + 1);
                        centipedes.splice(ci, 1);

                        if (before.length > 0) {
                            centipedes.push(before);
                        }
                        if (after.length > 0) {
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
                spawnParticles(spider.x, spider.y, SPIDER_COLOR, 16);
                spawnExplosion(spider.x, spider.y);
                spawnScorePopup(spider.x, spider.y, pts, SPIDER_COLOR);
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
                    spawnParticles(flea.x, flea.y, FLEA_COLOR, 12);
                    spawnExplosion(flea.x, flea.y);
                    spawnScorePopup(flea.x, flea.y, 200, FLEA_COLOR);
                    flea = null;
                }
                bullets.splice(i, 1);
                continue;
            }

            // Hit scorpion
            if (scorpion && dist(b.x, b.y, scorpion.x, scorpion.y) < CELL) {
                score += 1000;
                totalKills++;
                spawnParticles(scorpion.x, scorpion.y, SCORPION_COLOR, 16);
                spawnExplosion(scorpion.x, scorpion.y);
                spawnScorePopup(scorpion.x, scorpion.y, 1000, SCORPION_COLOR);
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
                dir: 1,
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
                    seg.y += baseSpeed;
                    if (seg.y >= seg.dropTarget) {
                        seg.y = seg.dropTarget;
                        seg.row = Math.floor(seg.y / CELL);
                        seg.dropping = false;
                    }
                    continue;
                }

                if (si === 0) {
                    seg.x += seg.dir * baseSpeed;
                    seg.col = Math.floor(seg.x / CELL);
                    seg.row = Math.floor(seg.y / CELL);

                    let shouldDrop = false;

                    if (seg.x <= CELL * 0.3 && seg.dir < 0) shouldDrop = true;
                    if (seg.x >= W - CELL * 0.3 && seg.dir > 0) shouldDrop = true;

                    const nextCol = seg.col + seg.dir;
                    if (nextCol >= 0 && nextCol < COLS) {
                        const m = mushAt(nextCol, seg.row);
                        if (m) {
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
                        if (seg.row >= ROWS - 1) {
                            seg.dropTarget = seg.y - CELL;
                            seg.y = Math.max(seg.y, CELL / 2);
                        }
                    }
                } else {
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

            if (player.alive && player.invuln <= 0) {
                for (const seg of centi) {
                    if (dist(player.x, player.y, seg.x, seg.y) < CELL * 0.8) {
                        killPlayer();
                        break;
                    }
                }
            }
        }

        centipedes = centipedes.filter(c => c && c.length > 0);

        if (centipedes.length === 0 && state === ST_PLAYING) {
            levelUp();
        }
    }

    function levelUp() {
        level++;
        combo = 0;
        playLevelUp();
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

        const minY = H - PLAYER_ZONE_ROWS * CELL;
        if (spider.y < minY) { spider.y = minY; spider.vy = Math.abs(spider.vy); }
        if (spider.y > H - CELL) { spider.y = H - CELL; spider.vy = -Math.abs(spider.vy); }

        const sc = Math.floor(spider.x / CELL);
        const sr = Math.floor(spider.y / CELL);
        if (mushAt(sc, sr) && Math.random() < 0.05) {
            delete mushrooms[mushKey(sc, sr)];
        }

        if (spider.x < -CELL * 3 || spider.x > W + CELL * 3) {
            spider = null;
            return;
        }

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

        const fc = Math.floor(flea.x / CELL);
        const fr = Math.floor(flea.y / CELL);
        if (fr >= 0 && fr < ROWS && !mushAt(fc, fr) && Math.random() < 0.15) {
            setMush(fc, fr, 4, false);
        }

        if (flea.y > H + CELL) { flea = null; return; }

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
            scorpionTimer = rng(20, 35) * 60;
        }
    }

    function updateScorpion(dt) {
        if (!scorpion) return;
        scorpion.x += scorpion.dir * scorpion.speed * dt * 60;

        const sc = Math.floor(scorpion.x / CELL);
        const sr = Math.floor(scorpion.y / CELL);
        const m = mushAt(sc, sr);
        if (m) m.poisoned = true;

        if ((scorpion.dir > 0 && scorpion.x > W + CELL * 2) ||
            (scorpion.dir < 0 && scorpion.x < -CELL * 2)) {
            scorpion = null;
            return;
        }

        if (player.alive && player.invuln <= 0 && dist(player.x, player.y, scorpion.x, scorpion.y) < CELL) {
            killPlayer();
        }
    }

    // ═══════════════════════════════════════════
    //  PARTICLES & EXPLOSIONS
    // ═══════════════════════════════════════════
    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt * 60;
            p.y += p.vy * dt * 60;
            if (p.gravity) p.vy += p.gravity * dt;
            p.vx *= 0.98;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function updateExplosions(dt) {
        for (let i = explosions.length - 1; i >= 0; i--) {
            const e = explosions[i];
            e.timer += dt;
            // Each frame lasts ~0.06s, 6 frames total = ~0.36s
            const frameIdx = Math.floor(e.timer / 0.06);
            if (frameIdx >= EXPLOSION_FRAMES.length) {
                explosions.splice(i, 1);
            } else {
                e.frame = frameIdx;
            }
        }
    }

    // ═══════════════════════════════════════════
    //  DRAWING
    // ═══════════════════════════════════════════
    function drawBackground() {
        // Dark garden gradient
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, '#050810');
        bgGrad.addColorStop(0.5, '#0A0F1A');
        bgGrad.addColorStop(0.85, '#0D1520');
        bgGrad.addColorStop(1, '#0F1A12');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Ambient floating spores
        const now = Date.now() * 0.001;
        for (const s of bgStars) {
            const drift = Math.sin(now * s.speed + s.phase) * 8;
            const yy = (s.y + now * s.speed * 15) % H;
            ctx.globalAlpha = s.alpha * (0.6 + 0.4 * Math.sin(now * 2 + s.phase));
            ctx.beginPath();
            ctx.arc(s.x + drift, yy, s.r, 0, Math.PI * 2);
            ctx.fillStyle = '#88CC88';
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Ground texture at bottom
        const groundGrad = ctx.createLinearGradient(0, H - 24, 0, H);
        groundGrad.addColorStop(0, 'rgba(30,20,10,0)');
        groundGrad.addColorStop(1, 'rgba(30,20,10,0.3)');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, H - 24, W, 24);

        // Kenney grass tiles at bottom
        const grassImg = sprites.grass;
        const grassCenterImg = sprites.grassCenter;
        if (grassImg) {
            for (let gx = 0; gx < W; gx += 16) {
                ctx.drawImage(grassImg, gx, H - 16, 16, 16);
            }
        }
        if (grassCenterImg) {
            for (let gx = 0; gx < W; gx += 16) {
                ctx.globalAlpha = 0.3;
                ctx.drawImage(grassCenterImg, gx, H - 32, 16, 16);
                ctx.globalAlpha = 1;
            }
        }

        // Faint grid
        ctx.strokeStyle = 'rgba(100,180,100,0.02)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= W; x += CELL) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = 0; y <= H; y += CELL) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        // Player zone line
        const zoneY = H - PLAYER_ZONE_ROWS * CELL;
        ctx.strokeStyle = 'rgba(100,200,100,0.05)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, zoneY); ctx.lineTo(W, zoneY); ctx.stroke();
        ctx.strokeStyle = 'rgba(100,200,100,0.02)';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(0, zoneY); ctx.lineTo(W, zoneY); ctx.stroke();
    }

    function drawMushrooms() {
        for (const k in mushrooms) {
            const m = mushrooms[k];
            const cx = m.col * CELL + CELL / 2;
            const cy = m.row * CELL + CELL / 2;
            const sizeRatio = m.hp / 4;
            const sz = CELL * (0.5 + 0.5 * sizeRatio);

            // Shadow
            ctx.beginPath();
            ctx.ellipse(cx, cy + sz * 0.35, sz * 0.4, sz * 0.12, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fill();

            // Pick sprite based on state
            let spriteName;
            if (m.poisoned) {
                spriteName = 'mushroomPoison';
            } else if (m.hp < 4) {
                spriteName = 'mushroomHit';
            } else {
                spriteName = 'mushroom';
            }

            const spr = sprites[spriteName];
            if (spr) {
                ctx.drawImage(spr, cx - sz / 2, cy - sz / 2, sz, sz);
            } else {
                // Fallback: colored circle
                const baseColor = m.poisoned ? POISON_TINT : m.color;
                ctx.beginPath();
                ctx.arc(cx, cy, sz * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = baseColor;
                ctx.fill();
            }

            // Damage cracks overlay when hp < 3
            if (m.hp < 3 && !m.poisoned) {
                ctx.strokeStyle = 'rgba(0,0,0,0.35)';
                ctx.lineWidth = 1;
                for (let c = 0; c < (4 - m.hp); c++) {
                    const ca = Math.PI + c * 0.7;
                    const r = sz * 0.3;
                    ctx.beginPath();
                    ctx.moveTo(cx + Math.cos(ca) * r * 0.2, cy + Math.sin(ca) * r * 0.2);
                    ctx.lineTo(cx + Math.cos(ca + 0.3) * r, cy + Math.sin(ca) * r * 0.7);
                    ctx.stroke();
                }
            }
        }
    }

    function drawCentipedes() {
        const now = Date.now() * 0.001;
        const animFrame15 = Math.floor(animTick / 15) % 2 === 0;

        for (const centi of centipedes) {
            if (!centi || centi.length === 0) continue;

            // Draw connecting line between segments
            if (centi.length > 1) {
                ctx.strokeStyle = 'rgba(100,200,100,0.3)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(centi[0].x, centi[0].y);
                for (let i = 1; i < centi.length; i++) {
                    ctx.lineTo(centi[i].x, centi[i].y);
                }
                ctx.stroke();
            }

            // Draw segments (back to front)
            for (let i = centi.length - 1; i >= 0; i--) {
                const seg = centi[i];
                const isHead = i === 0;

                // Sine wave bob per segment
                const bob = Math.sin(now * 6 + i * 0.8) * 2;
                const drawY = seg.y + bob;
                const sz = isHead ? CELL * 1.1 : CELL * 0.9;

                if (isHead) {
                    // Head: worm sprite, rotated to face direction
                    const spriteName = animFrame15 ? 'head' : 'headMove';
                    const spr = sprites[spriteName];
                    if (spr) {
                        ctx.save();
                        ctx.translate(seg.x, drawY);
                        // Rotate toward movement direction
                        if (seg.dir < 0) ctx.scale(-1, 1);
                        ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
                        ctx.restore();
                    } else {
                        // Fallback
                        ctx.beginPath();
                        ctx.arc(seg.x, drawY, sz * 0.45, 0, Math.PI * 2);
                        ctx.fillStyle = HEAD_COLOR;
                        ctx.fill();
                    }

                    // Glow around head
                    ctx.beginPath();
                    ctx.arc(seg.x, drawY, sz * 0.6, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(100,255,100,0.08)';
                    ctx.fill();
                } else {
                    // Body: slime sprite
                    const spriteName = animFrame15 ? 'body' : 'bodyMove';
                    const spr = sprites[spriteName];
                    if (spr) {
                        ctx.drawImage(spr, seg.x - sz / 2, drawY - sz / 2, sz, sz);
                    } else {
                        // Fallback
                        ctx.beginPath();
                        ctx.arc(seg.x, drawY, sz * 0.38, 0, Math.PI * 2);
                        ctx.fillStyle = BODY_COLORS[i % 2];
                        ctx.fill();
                    }
                }
            }
        }
    }

    function drawPlayer() {
        if (!player.alive) return;
        if (player.invuln > 0 && Math.floor(player.invuln * 10) % 2 === 0) return;

        const px = player.x, py = player.y;
        const col = playerColor || DEFAULT_PLAYER;
        const now = Date.now() * 0.001;

        // Thrust glow
        const thrustFlicker = 0.6 + Math.sin(now * 20) * 0.3;
        const thrustGrad = ctx.createRadialGradient(px, py + CELL * 0.5, 0, px, py + CELL * 0.5, CELL * 0.6);
        thrustGrad.addColorStop(0, 'rgba(255,200,50,' + (0.5 * thrustFlicker) + ')');
        thrustGrad.addColorStop(0.4, 'rgba(255,100,20,' + (0.3 * thrustFlicker) + ')');
        thrustGrad.addColorStop(1, 'rgba(255,50,0,0)');
        ctx.fillStyle = thrustGrad;
        ctx.beginPath();
        ctx.arc(px, py + CELL * 0.5, CELL * 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Thrust flame
        const flameH = CELL * (0.3 + Math.sin(now * 25) * 0.12);
        ctx.beginPath();
        ctx.moveTo(px - CELL * 0.12, py + CELL * 0.3);
        ctx.lineTo(px, py + CELL * 0.3 + flameH);
        ctx.lineTo(px + CELL * 0.12, py + CELL * 0.3);
        ctx.closePath();
        ctx.fillStyle = '#FDE047';
        ctx.fill();

        // Ship sprite
        const shipSize = CELL * 1.5;
        const shipSpr = sprites.ship;
        if (shipSpr) {
            ctx.drawImage(shipSpr, px - shipSize / 2, py - shipSize / 2, shipSize, shipSize);
        } else {
            // Fallback triangle
            const shipGrad = ctx.createLinearGradient(px, py - CELL * 0.5, px, py + CELL * 0.35);
            shipGrad.addColorStop(0, '#FFF');
            shipGrad.addColorStop(0.3, col);
            shipGrad.addColorStop(1, 'rgba(0,0,0,0.3)');
            ctx.beginPath();
            ctx.moveTo(px, py - CELL * 0.55);
            ctx.lineTo(px - CELL * 0.42, py + CELL * 0.32);
            ctx.lineTo(px + CELL * 0.42, py + CELL * 0.32);
            ctx.closePath();
            ctx.fillStyle = shipGrad;
            ctx.fill();
        }

        // Ship glow
        ctx.beginPath();
        ctx.arc(px, py, CELL * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = col + '12';
        ctx.fill();
    }

    function drawBullets() {
        const laserSpr = sprites.laser;
        for (const b of bullets) {
            if (laserSpr) {
                // Glow behind laser
                ctx.beginPath();
                ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = BULLET_COLOR + '33';
                ctx.fill();

                // Trail
                const trailGrad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + CELL * 0.6);
                trailGrad.addColorStop(0, BULLET_COLOR + '88');
                trailGrad.addColorStop(1, BULLET_COLOR + '00');
                ctx.fillStyle = trailGrad;
                ctx.fillRect(b.x - 2, b.y, 4, CELL * 0.6);

                // Laser sprite
                ctx.save();
                ctx.translate(b.x, b.y);
                ctx.rotate(-Math.PI / 2);  // Point upward
                ctx.drawImage(laserSpr, -CELL * 0.3, -CELL * 0.15, CELL * 0.6, CELL * 0.3);
                ctx.restore();
            } else {
                // Fallback
                const trailGrad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + CELL * 0.8);
                trailGrad.addColorStop(0, BULLET_COLOR + 'AA');
                trailGrad.addColorStop(1, BULLET_COLOR + '00');
                ctx.fillStyle = trailGrad;
                ctx.fillRect(b.x - 1.5, b.y, 3, CELL * 0.8);

                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
                ctx.fillStyle = BULLET_COLOR;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r * 0.5, 0, Math.PI * 2);
                ctx.fillStyle = '#FFF';
                ctx.fill();
            }
        }
    }

    function drawSpider() {
        if (!spider) return;
        const sx = spider.x, sy = spider.y;
        const now = Date.now() * 0.001;
        const animFrame15 = Math.floor(animTick / 15) % 2 === 0;

        // Shadow
        ctx.beginPath();
        ctx.ellipse(sx, sy + CELL * 0.5, CELL * 0.5, CELL * 0.15, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();

        // Bounce offset (spiders bounce erratically)
        const bounceY = Math.sin(now * 8) * 3 + Math.sin(now * 13) * 2;
        const drawY = sy + bounceY;

        // Spider sprite (ladybug)
        const spriteName = animFrame15 ? 'spider' : 'spiderMove';
        const spr = sprites[spriteName];
        const sz = CELL * 1.5;

        if (spr) {
            ctx.save();
            ctx.translate(sx, drawY);
            if (spider.vx < 0) ctx.scale(-1, 1);
            ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
            ctx.restore();
        } else {
            // Fallback: spider shape
            ctx.beginPath();
            ctx.arc(sx, drawY, CELL * 0.45, 0, Math.PI * 2);
            ctx.fillStyle = SPIDER_COLOR;
            ctx.fill();
            // 8 legs fallback
            ctx.strokeStyle = SPIDER_COLOR;
            ctx.lineWidth = 1.5;
            for (let side = -1; side <= 1; side += 2) {
                for (let li = 0; li < 4; li++) {
                    const angle = (side === -1 ? Math.PI : 0) + (li - 1.5) * 0.35;
                    const wobble = Math.sin(now * 10 + li * 1.8) * 0.25;
                    const kx = sx + Math.cos(angle + wobble) * CELL * 0.5;
                    const ky = drawY + Math.sin(angle * 0.3 + 0.5) * CELL * 0.3;
                    ctx.beginPath();
                    ctx.moveTo(sx + side * CELL * 0.15, drawY + (li - 1.5) * 3);
                    ctx.lineTo(kx, ky);
                    ctx.stroke();
                }
            }
        }

        // Glow around spider
        ctx.beginPath();
        ctx.arc(sx, drawY, CELL * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,50,50,0.06)';
        ctx.fill();
    }

    function drawFlea() {
        if (!flea) return;
        const fx = flea.x, fy = flea.y;
        const animFrame15 = Math.floor(animTick / 15) % 2 === 0;

        // Speed trail
        const trailGrad = ctx.createLinearGradient(fx, fy - CELL * 1.2, fx, fy);
        trailGrad.addColorStop(0, FLEA_COLOR + '00');
        trailGrad.addColorStop(0.5, FLEA_COLOR + '22');
        trailGrad.addColorStop(1, FLEA_COLOR + '55');
        ctx.fillStyle = trailGrad;
        ctx.fillRect(fx - 3, fy - CELL * 1.2, 6, CELL * 1.2);

        // Trail particles (small dots behind)
        const now = Date.now() * 0.001;
        for (let i = 0; i < 4; i++) {
            const ty = fy - CELL * 0.3 - i * CELL * 0.25;
            const tx = fx + Math.sin(now * 12 + i * 1.5) * 2;
            const tAlpha = 1 - i / 4;
            ctx.globalAlpha = tAlpha * 0.4;
            ctx.beginPath();
            ctx.arc(tx, ty, 2 - i * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = FLEA_COLOR;
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Flea sprite (fly)
        const spriteName = animFrame15 ? 'flea' : 'fleaMove';
        const spr = sprites[spriteName];
        const sz = CELL * 1.2;

        if (spr) {
            ctx.drawImage(spr, fx - sz / 2, fy - sz / 2, sz, sz);
        } else {
            // Fallback
            ctx.beginPath();
            ctx.arc(fx, fy, CELL * 0.32, 0, Math.PI * 2);
            ctx.fillStyle = FLEA_COLOR;
            ctx.fill();
        }

        // Glow
        ctx.beginPath();
        ctx.arc(fx, fy, CELL * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = FLEA_COLOR + '10';
        ctx.fill();
    }

    function drawScorpion() {
        if (!scorpion) return;
        const sx = scorpion.x, sy = scorpion.y;
        const animFrame15 = Math.floor(animTick / 15) % 2 === 0;

        // Shadow
        ctx.beginPath();
        ctx.ellipse(sx, sy + CELL * 0.45, CELL * 0.6, CELL * 0.15, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();

        // Scorpion sprite (snail)
        const spriteName = animFrame15 ? 'scorpion' : 'scorpionMove';
        const spr = sprites[spriteName];
        const sz = CELL * 1.4;

        if (spr) {
            ctx.save();
            ctx.translate(sx, sy);
            if (scorpion.dir < 0) ctx.scale(-1, 1);
            ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
            ctx.restore();
        } else {
            // Fallback
            ctx.save();
            ctx.translate(sx, sy);
            ctx.scale(1.4, 1);
            ctx.beginPath();
            ctx.arc(0, 0, CELL * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = SCORPION_COLOR;
            ctx.fill();
            ctx.restore();

            // Tail fallback
            const tailDir = -scorpion.dir;
            const now = Date.now() * 0.001;
            const tailWave = Math.sin(now * 3) * 3;
            ctx.strokeStyle = SCORPION_COLOR;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            let tx = sx + tailDir * CELL * 0.45;
            let ty = sy;
            ctx.moveTo(tx, ty);
            for (let ts = 1; ts <= 4; ts++) {
                const frac = ts / 4;
                tx = sx + tailDir * (CELL * 0.45 + frac * CELL * 0.5);
                ty = sy - frac * CELL * 0.7 + tailWave * frac;
                ctx.lineTo(tx, ty);
            }
            ctx.stroke();
        }

        // Poison trail hint (glow behind)
        ctx.beginPath();
        ctx.arc(sx, sy, CELL * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(139,92,246,0.06)';
        ctx.fill();
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            const pSpriteName = PARTICLE_SPRITES[p.spriteIdx || 0];
            const pSpr = sprites[pSpriteName];
            const sz = p.r * alpha * 2.5;

            if (pSpr && !p.spark) {
                // Tinted particle sprite
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.drawImage(pSpr, p.x - sz, p.y - sz, sz * 2, sz * 2);
                ctx.restore();
            } else if (p.spark) {
                // Bright spark — cross shape
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = '#FFF';
                ctx.lineWidth = 1;
                const s = p.r * alpha;
                ctx.beginPath();
                ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x + s, p.y);
                ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x, p.y + s);
                ctx.stroke();
            } else {
                // Fallback glow particle
                ctx.globalAlpha = alpha;
                const pGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * alpha + 2);
                pGrad.addColorStop(0, '#FFF');
                pGrad.addColorStop(0.3, p.color);
                pGrad.addColorStop(1, p.color + '00');
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * alpha + 2, 0, Math.PI * 2);
                ctx.fillStyle = pGrad;
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawExplosions() {
        for (const e of explosions) {
            const frameName = EXPLOSION_FRAMES[e.frame] || EXPLOSION_FRAMES[0];
            const spr = sprites[frameName];
            if (spr) {
                const progress = e.frame / (EXPLOSION_FRAMES.length - 1);
                const sz = CELL * (1.5 + progress * 1.0);
                const alpha = 1 - progress * 0.6;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.drawImage(spr, e.x - sz / 2, e.y - sz / 2, sz, sz);
                ctx.restore();
            } else {
                // Fallback: expanding circle
                const progress = e.frame / (EXPLOSION_FRAMES.length - 1);
                const sz = CELL * (0.5 + progress * 1.5);
                ctx.globalAlpha = 1 - progress;
                ctx.beginPath();
                ctx.arc(e.x, e.y, sz, 0, Math.PI * 2);
                ctx.fillStyle = '#FF6600';
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }
    }

    function drawScorePopups() {
        for (const sp of scorePopups) {
            const alpha = sp.life / sp.maxLife;
            const yOff = (1 - alpha) * 25;
            ctx.globalAlpha = alpha;
            ctx.font = 'bold 13px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#000';
            ctx.fillText(sp.text, sp.x + 1, sp.y - yOff + 1);
            ctx.fillStyle = sp.color;
            ctx.fillText(sp.text, sp.x, sp.y - yOff);
        }
        ctx.globalAlpha = 1;
    }

    function updateScorePopups(dt) {
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            scorePopups[i].life -= dt;
            if (scorePopups[i].life <= 0) scorePopups.splice(i, 1);
        }
    }

    function drawVignette() {
        const vigGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
        vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vigGrad.addColorStop(0.7, 'rgba(0,0,0,0)');
        vigGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, W, H);
    }

    function drawHUD() {
        // HUD background bar
        const hudGrad = ctx.createLinearGradient(0, 0, 0, 22);
        hudGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
        hudGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = hudGrad;
        ctx.fillRect(0, 0, W, 22);

        // Score
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#000';
        ctx.fillText('SCORE ' + score, 9, 17);
        ctx.fillStyle = HUD_COLOR;
        ctx.fillText('SCORE ' + score, 8, 16);

        // Level
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText('LEVEL ' + level, W / 2 + 1, 17);
        ctx.fillStyle = HUD_COLOR;
        ctx.fillText('LEVEL ' + level, W / 2, 16);

        // Combo
        if (combo > 1) {
            ctx.font = 'bold 11px monospace';
            ctx.fillStyle = '#FDE047';
            ctx.textAlign = 'center';
            ctx.fillText('x' + combo + ' COMBO', W / 2, 30);
        }

        // Lives as mini ship sprites or triangles
        ctx.textAlign = 'right';
        const col = playerColor || DEFAULT_PLAYER;
        const shipSpr = sprites.ship;
        for (let i = 0; i < lives; i++) {
            const lx = W - 12 - i * 18;
            const ly = 10;
            if (shipSpr) {
                ctx.drawImage(shipSpr, lx - 7, ly - 7, 14, 14);
            } else {
                ctx.beginPath();
                ctx.arc(lx, ly, 7, 0, Math.PI * 2);
                ctx.fillStyle = col + '22';
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(lx, ly - 6);
                ctx.lineTo(lx - 5, ly + 4);
                ctx.lineTo(lx + 5, ly + 4);
                ctx.closePath();
                ctx.fillStyle = col;
                ctx.fill();
            }
        }
    }

    // ═══════════════════════════════════════════
    //  LOADING SCREEN
    // ═══════════════════════════════════════════
    function drawLoadingScreen() {
        ctx.fillStyle = '#0A0F1A';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.font = 'bold 28px monospace';
        ctx.fillStyle = '#E0E7FF';
        ctx.fillText('LOADING...', W / 2, H * 0.42);

        // Progress bar
        const barW = W * 0.6;
        const barH = 12;
        const barX = (W - barW) / 2;
        const barY = H * 0.5;
        const progress = spriteLoadTotal > 0 ? spriteLoadProgress / spriteLoadTotal : 0;

        // Bar background
        ctx.fillStyle = '#1A1F2E';
        ctx.fillRect(barX, barY, barW, barH);

        // Bar fill
        const fillGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
        fillGrad.addColorStop(0, '#38BDF8');
        fillGrad.addColorStop(0.5, '#A855F7');
        fillGrad.addColorStop(1, '#EC4899');
        ctx.fillStyle = fillGrad;
        ctx.fillRect(barX, barY, barW * progress, barH);

        // Bar border
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        // Percentage
        ctx.font = '12px monospace';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(Math.floor(progress * 100) + '%', W / 2, barY + barH + 20);
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
        if (bgStars.length === 0) initBackgroundDetails();
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

        const animFrame15 = Math.floor(animTick / 15) % 2 === 0;

        // Demo centipede chain line
        if (titleCentipede.length > 1) {
            ctx.strokeStyle = 'rgba(100,200,100,0.25)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(titleCentipede[0].x, titleCentipede[0].y);
            for (let i = 1; i < titleCentipede.length; i++) {
                ctx.lineTo(titleCentipede[i].x, titleCentipede[i].y);
            }
            ctx.stroke();
        }

        // Draw demo centipede with sprites
        for (let i = titleCentipede.length - 1; i >= 0; i--) {
            const seg = titleCentipede[i];
            const isHead = i === 0;
            const sz = isHead ? CELL * 1.3 : CELL * 1.0;

            if (isHead) {
                const spr = sprites[animFrame15 ? 'head' : 'headMove'];
                if (spr) {
                    ctx.drawImage(spr, seg.x - sz / 2, seg.y - sz / 2, sz, sz);
                } else {
                    ctx.beginPath();
                    ctx.arc(seg.x, seg.y, 9, 0, Math.PI * 2);
                    ctx.fillStyle = HEAD_COLOR;
                    ctx.fill();
                }
            } else {
                const spr = sprites[animFrame15 ? 'body' : 'bodyMove'];
                if (spr) {
                    ctx.drawImage(spr, seg.x - sz / 2, seg.y - sz / 2, sz, sz);
                } else {
                    ctx.beginPath();
                    ctx.arc(seg.x, seg.y, 7, 0, Math.PI * 2);
                    ctx.fillStyle = BODY_COLORS[i % 2];
                    ctx.fill();
                }
            }
        }

        // Title text
        ctx.textAlign = 'center';

        ctx.font = 'bold 48px monospace';
        const titleY = H * 0.28;
        const grad = ctx.createLinearGradient(W * 0.2, titleY, W * 0.8, titleY);
        grad.addColorStop(0, '#F43F5E');
        grad.addColorStop(0.5, '#EC4899');
        grad.addColorStop(1, '#A855F7');
        ctx.fillStyle = grad;
        ctx.fillText('CENTIPEDE', W / 2, titleY);

        ctx.shadowColor = '#EC4899';
        ctx.shadowBlur = 20;
        ctx.fillText('CENTIPEDE', W / 2, titleY);
        ctx.shadowBlur = 0;

        ctx.font = '14px monospace';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText('A Classic Arcade Shooter', W / 2, titleY + 30);

        const alpha = 0.5 + Math.sin(titleTick * 3) * 0.5;
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#E0E7FF';
        ctx.fillText('Tap or Space to Play', W / 2, H * 0.7);
        ctx.globalAlpha = 1;

        ctx.font = '12px monospace';
        ctx.fillStyle = '#64748B';
        ctx.fillText('Arrow Keys / Mouse to Move', W / 2, H * 0.78);
        ctx.fillText('Space / Click to Fire', W / 2, H * 0.82);
    }

    // ═══════════════════════════════════════════
    //  GAME OVER SCREEN
    // ═══════════════════════════════════════════
    function drawGameOver() {
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
        animTick++;
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
                updateExplosions(dt);
                updateScorePopups(dt);
                if (screenShake > 0) screenShake -= dt;
                maybeSpawnFlea();
                maybeSpawnScorpion();
                break;

            case ST_DYING:
                deathTimer -= dt;
                updateParticles(dt);
                updateExplosions(dt);
                updateScorePopups(dt);
                if (screenShake > 0) screenShake -= dt;
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
                        initPlayer();
                        player.invuln = 2;
                        bullets = [];
                        state = ST_PLAYING;
                    }
                }
                break;

            case ST_GAMEOVER:
                updateParticles(dt);
                updateExplosions(dt);
                break;
        }
    }

    function render() {
        switch (state) {
            case ST_TITLE:
                drawTitle();
                drawVignette();
                break;

            case ST_PLAYING:
            case ST_DYING:
                ctx.save();
                if (screenShake > 0) {
                    const intensity = screenShake * 12;
                    ctx.translate(
                        (Math.random() - 0.5) * intensity,
                        (Math.random() - 0.5) * intensity
                    );
                }
                drawBackground();
                drawMushrooms();
                drawCentipedes();
                drawBullets();
                drawSpider();
                drawFlea();
                drawScorpion();
                drawPlayer();
                drawExplosions();
                drawParticles();
                drawScorePopups();
                ctx.restore();
                drawHUD();
                drawVignette();
                if (state === ST_DYING) {
                    ctx.fillStyle = 'rgba(15,17,23,' + (0.3 * (1 - deathTimer / (DEATH_ANIM_MS / 1000))) + ')';
                    ctx.fillRect(0, 0, W, H);
                }
                break;

            case ST_GAMEOVER:
                drawBackground();
                drawMushrooms();
                drawCentipedes();
                drawExplosions();
                drawParticles();
                drawHUD();
                drawVignette();
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

        if (!spritesLoaded) {
            drawLoadingScreen();
            animFrame = requestAnimationFrame(gameLoop);
            return;
        }

        update(dt);

        const rect = canvas.getBoundingClientRect();
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
        scorePopups = [];
        explosions = [];
        screenShake = 0;
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

    // ── Resize ──
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
        scorePopups = [];
        explosions = [];
        screenShake = 0;
        centipedes = [];
        mushrooms = {};
        spider = null;
        flea = null;
        scorpion = null;
        animTick = 0;
        initBackgroundDetails();
        keys = {};
        mouseDown = false;
        touchActive = false;
        lastFireTime = 0;
        spiderTimer = rng(SPIDER_INTERVAL_MIN, SPIDER_INTERVAL_MAX);
        scorpionTimer = rng(20, 35) * 60;

        state = ST_TITLE;

        // Load sprites asynchronously, show loading screen while waiting
        spritesLoaded = false;
        spriteLoadProgress = 0;
        loadSprites().then(() => {
            spritesLoaded = true;
        });

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
        scorePopups = [];
        explosions = [];
        centipedes = [];
        mushrooms = {};
        spider = null;
        flea = null;
        scorpion = null;
        screenShake = 0;
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return level; },
        isActive() { return gameActive; }
    };
})();
