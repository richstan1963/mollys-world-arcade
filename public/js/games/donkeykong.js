/* YWA Donkey Kong — Classic barrel-dodging platformer — Kenney Platform CC0 sprites */
window.DonkeyKong = (() => {

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
    const GRAVITY = 0.38, JUMP_VEL = -7.5, MAX_FALL = 8;
    const PLAYER_SPEED = 2.2, CLIMB_SPEED = 1.6;
    const PLAYER_W = 16, PLAYER_H = 22;
    const BARREL_R = 8, BARREL_SPEED = 1.8;
    const HAMMER_DURATION = 8000;
    const FIRE_SPEED = 0.6;
    const INITIAL_LIVES = 3;
    const BARREL_INTERVAL_BASE = 2200;
    const BONUS_ITEM_INTERVAL = 12000;
    const GIRDER_H = 6;
    const CONVEYOR_SPEED = 0.8;
    const SPRING_BOUNCE_VEL = -10;

    // States
    const ST_LOADING = -1, ST_TITLE = 0, ST_PLAY = 1, ST_DYING = 2, ST_GAMEOVER = 3, ST_WIN = 4, ST_LEVEL_INTRO = 5;
    const LS_KEY = 'ywa_donkeykong_hiscore';

    // ── Sprite Atlas (Kenney Platform CC0) ──
    const SPRITE_BASE = '/img/game-assets/kenney-platform';
    const sprites = {};
    let spritesLoaded = 0, spritesTotal = 0, allSpritesReady = false;

    const SPRITE_MANIFEST = {
        // Player (Mario equivalent)
        playerStand:  `${SPRITE_BASE}/players/Pink/alienPink_stand.png`,
        playerWalk1:  `${SPRITE_BASE}/players/Pink/alienPink_walk1.png`,
        playerWalk2:  `${SPRITE_BASE}/players/Pink/alienPink_walk2.png`,
        playerJump:   `${SPRITE_BASE}/players/Pink/alienPink_jump.png`,
        playerClimb1: `${SPRITE_BASE}/players/Pink/alienPink_climb1.png`,
        playerClimb2: `${SPRITE_BASE}/players/Pink/alienPink_climb2.png`,
        playerHit:    `${SPRITE_BASE}/players/Pink/alienPink_hit.png`,
        // DK (large enemy)
        enemySlimeB:  `${SPRITE_BASE}/enemies/slimeBlock.png`,
        enemySlimeBM: `${SPRITE_BASE}/enemies/slimeBlock_move.png`,
        // Barrels
        boxCrate:     `${SPRITE_BASE}/tiles/boxCrate.png`,
        boxCrateD:    `${SPRITE_BASE}/tiles/boxCrate_double.png`,
        // Girders
        stoneMid:     `${SPRITE_BASE}/ground/Stone/stoneMid.png`,
        stoneLeft:    `${SPRITE_BASE}/ground/Stone/stoneLeft.png`,
        stoneRight:   `${SPRITE_BASE}/ground/Stone/stoneRight.png`,
        // Ladder
        ladderMid:    `${SPRITE_BASE}/tiles/ladderMid.png`,
        ladderTop:    `${SPRITE_BASE}/tiles/ladderTop.png`,
        // Items
        coinGold:     `${SPRITE_BASE}/items/coinGold.png`,
        star:         `${SPRITE_BASE}/items/star.png`,
        gemRed:       `${SPRITE_BASE}/items/gemRed.png`,
        keyRed:       `${SPRITE_BASE}/items/keyRed.png`,
        // HUD
        hudHeart:     `${SPRITE_BASE}/hud/hudHeart_full.png`,
        hudCoin:      `${SPRITE_BASE}/hud/hudCoin.png`,
        // Fire
        fireball:     `${SPRITE_BASE}/particles/fireball.png`,
        // Pauline
        playerYStand: `${SPRITE_BASE}/players/Yellow/alienYellow_stand.png`,
        playerYFront: `${SPRITE_BASE}/players/Yellow/alienYellow_front.png`,
        // Spring
        spring:       `${SPRITE_BASE}/tiles/spring.png`,
        sprung:       `${SPRITE_BASE}/tiles/sprung.png`,
    };

    function loadSprites(onProgress, onDone) {
        const keys = Object.keys(SPRITE_MANIFEST);
        spritesTotal = keys.length;
        spritesLoaded = 0;
        let done = 0;
        keys.forEach(key => {
            const img = new Image();
            img.onload = () => {
                sprites[key] = img;
                done++; spritesLoaded = done;
                if (onProgress) onProgress(done, spritesTotal);
                if (done === spritesTotal) { allSpritesReady = true; if (onDone) onDone(); }
            };
            img.onerror = () => {
                sprites[key] = null;
                done++; spritesLoaded = done;
                if (onProgress) onProgress(done, spritesTotal);
                if (done === spritesTotal) { allSpritesReady = true; if (onDone) onDone(); }
            };
            img.src = SPRITE_MANIFEST[key];
        });
    }

    function drawSprite(img, x, y, w, h, flipX) {
        if (!img) return false;
        ctx.save();
        if (flipX) {
            ctx.translate(gx(x + w), gy(y));
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0, gs(w), gs(h));
        } else {
            ctx.drawImage(img, gx(x), gy(y), gs(w), gs(h));
        }
        ctx.restore();
        return true;
    }

    function drawLoading() {
        ctx.fillStyle = '#0a0a1e';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#F59E0B';
        ctx.shadowColor = '#F59E0B'; ctx.shadowBlur = gs(10);
        ctx.font = `bold ${gs(36)}px monospace`;
        ctx.fillText('DONKEY KONG', gs(GAME_W / 2), gs(GAME_H / 2 - 50));
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#E0E7FF'; ctx.font = `${gs(13)}px monospace`;
        ctx.fillText('LOADING SPRITES...', gs(GAME_W / 2), gs(GAME_H / 2));
        const barW = 200, barH = 8;
        const pct = spritesTotal > 0 ? spritesLoaded / spritesTotal : 0;
        ctx.fillStyle = '#333';
        ctx.fillRect(gs(GAME_W / 2 - barW / 2), gs(GAME_H / 2 + 20), gs(barW), gs(barH));
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(gs(GAME_W / 2 - barW / 2), gs(GAME_H / 2 + 20), gs(barW * pct), gs(barH));
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `${gs(10)}px monospace`;
        ctx.fillText(`${spritesLoaded} / ${spritesTotal}`, gs(GAME_W / 2), gs(GAME_H / 2 + 45));
    }

    // Game state
    let canvas, ctx, W, H, SCALE, DPR, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor, themeColor;
    let state, frameCount, lastTime, keys = {};
    let score, lives, level, hiScore;
    let player, barrels, fires, particles, scorePopups, bonusItems;
    let dk, platforms, ladders, hammerPickup, oilDrum;
    let barrelTimer, bonusTimer, deathTimer, introTimer, winTimer;
    let hammerActive, hammerTimer;
    let screenShake;
    let stars;
    let pauline;
    let conveyors; // conveyor belt sections
    let springs;   // bouncing spring barrels
    let dkPoundTimer, dkPoundRow; // DK ground pound
    let touchLeft, touchRight, touchUp, touchDown, touchJump;

    // Audio
    let audioCtx;
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
            const src = audioCtx.createBufferSource(), g = audioCtx.createGain();
            src.buffer = buf;
            g.gain.setValueAtTime(vol || 0.06, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            src.connect(g); g.connect(audioCtx.destination);
            src.start();
        } catch {}
    }

    function sfxJump() { playTone(300, 0.12, 'triangle', 0.1, 500); }
    function sfxBarrelSmash() { playNoise(0.2, 0.12); playTone(600, 0.15, 'square', 0.1); }
    function sfxDeath() { playTone(400, 0.1, 'sawtooth', 0.1, 80); setTimeout(() => playTone(200, 0.4, 'sawtooth', 0.12, 60), 120); }
    function sfxHammer() { playTone(880, 0.08, 'square', 0.08); playTone(1100, 0.08, 'sine', 0.06); }
    function sfxBonus() { playTone(660, 0.08, 'sine', 0.1); setTimeout(() => playTone(880, 0.12, 'sine', 0.1), 80); }
    function sfxBarrelThrow() { playTone(120, 0.15, 'sawtooth', 0.06); }
    function sfxStep() { playTone(200, 0.03, 'triangle', 0.03); }
    function sfxClimb() { playTone(350, 0.04, 'triangle', 0.03); }
    function sfxWin() { [0, 100, 200, 300, 400].forEach((d, i) => setTimeout(() => playTone(440 + i * 110, 0.15, 'sine', 0.1), d)); }
    function sfxSpring() { playTone(200, 0.15, 'triangle', 0.08, 800); }
    function sfxConveyor() { playTone(100, 0.03, 'sawtooth', 0.02); }
    function sfxPound() { playNoise(0.3, 0.15); playTone(60, 0.4, 'sawtooth', 0.12); }

    // ── Helpers ──
    const gs = v => v * SCALE;
    const gx = v => v * SCALE;
    const gy = v => v * SCALE;
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => (Math.random() * (b - a + 1) + a) | 0;
    const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
    const rectHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

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



    // ═══════════════════════════════════════════
    //  LEVEL LAYOUT
    // ═══════════════════════════════════════════
    function buildLevel() {
        platforms = [];
        ladders = [];
        // 6 girder rows from bottom to top, alternating slant direction
        const rows = [
            { y: 520, x1: 20, x2: 460, slant: 0 },      // ground
            { y: 438, x1: 30, x2: 450, slant: 12 },      // 1st platform (slopes right-to-left)
            { y: 356, x1: 30, x2: 450, slant: -12 },     // 2nd (slopes left-to-right)
            { y: 274, x1: 30, x2: 450, slant: 12 },      // 3rd
            { y: 192, x1: 30, x2: 450, slant: -12 },     // 4th
            { y: 120, x1: 100, x2: 320, slant: 0 },      // DK platform (top)
        ];
        rows.forEach((r, i) => {
            const segs = 12;
            const segW = (r.x2 - r.x1) / segs;
            for (let s = 0; s < segs; s++) {
                const xL = r.x1 + s * segW;
                const xR = xL + segW;
                const frac1 = s / segs, frac2 = (s + 1) / segs;
                const yL = r.y + r.slant * frac1;
                const yR = r.y + r.slant * frac2;
                platforms.push({ x: xL, y: yL, w: segW + 1, h: GIRDER_H, yR, row: i, slant: r.slant });
            }
        });

        // Ladders connecting platforms
        const ladderDefs = [
            // row 0→1
            { x: 420, y1: 438 + 12 * 0.93, y2: 520 },
            { x: 100, y1: 438, y2: 520 },
            // row 1→2
            { x: 60, y1: 356, y2: 438 },
            { x: 350, y1: 356 - 12 * (350 - 30) / 420, y2: 438 + 12 * (350 - 30) / 420 },
            // row 2→3
            { x: 420, y1: 274 + 12 * 0.93, y2: 356 - 12 * 0.93 },
            { x: 140, y1: 274 + 12 * (140 - 30) / 420, y2: 356 - 12 * (140 - 30) / 420 },
            // row 3→4
            { x: 60, y1: 192, y2: 274 },
            { x: 300, y1: 192 - 12 * (300 - 30) / 420, y2: 274 + 12 * (300 - 30) / 420 },
            // row 4→5 (to DK)
            { x: 160, y1: 120, y2: 192 },
        ];
        ladderDefs.forEach(l => {
            ladders.push({ x: l.x, y: l.y1, w: 14, h: l.y2 - l.y1 });
        });

        // Oil drum at bottom left
        oilDrum = { x: 36, y: 492, w: 24, h: 28, flameFrame: 0 };

        // Hammer pickup on 2nd platform
        hammerPickup = { x: 60, y: 328, w: 14, h: 14, active: true };

        // Pauline at top
        pauline = { x: 190, y: 88, frame: 0, helpBubble: 0 };

        // DK position
        dk = { x: 110, y: 72, frame: 0, throwTimer: 0, armAngle: 0, chestBeat: 0, chestBeatAnim: 0 };

        // Conveyor belts on rows 2 and 4 (level 2+)
        conveyors = [];
        if (level >= 2) {
            conveyors.push({ row: 2, x1: 120, x2: 300, dir: 1, speed: CONVEYOR_SPEED });
            conveyors.push({ row: 4, x1: 150, x2: 350, dir: -1, speed: CONVEYOR_SPEED });
        }

        // Springs array (spawned during gameplay)
        springs = [];

        // DK ground pound state
        dkPoundTimer = 0;
        dkPoundRow = -1;
    }

    function getPlatformYAt(px, row) {
        for (const p of platforms) {
            if (p.row === row && px >= p.x && px < p.x + p.w) {
                const frac = (px - p.x) / p.w;
                return p.y + (p.yR - p.y) * frac;
            }
        }
        return null;
    }

    function getRowAt(px, py) {
        for (let row = 0; row <= 5; row++) {
            const y = getPlatformYAt(px, row);
            if (y !== null && Math.abs(py - (y - PLAYER_H)) < 10) return row;
        }
        return -1;
    }

    function findPlatformBelow(x, y) {
        let best = null, bestY = 9999;
        for (const p of platforms) {
            if (x >= p.x && x < p.x + p.w) {
                const frac = (x - p.x) / p.w;
                const py = p.y + (p.yR - p.y) * frac;
                if (py >= y && py < bestY) { bestY = py; best = p; }
            }
        }
        return best ? { platform: best, y: bestY } : null;
    }

    function isOnLadder(x, y, h) {
        for (const l of ladders) {
            if (x + 4 > l.x && x + PLAYER_W - 4 < l.x + l.w && y + h > l.y && y < l.y + l.h) return l;
        }
        return null;
    }

    // ═══════════════════════════════════════════
    //  DRAWING ROUTINES
    // ═══════════════════════════════════════════
    function drawBackground() {
        // Starry construction-site sky
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#0a0a1e');
        grad.addColorStop(0.5, '#121230');
        grad.addColorStop(1, '#1a0a10');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Stars
        stars.forEach(s => {
            const twinkle = 0.5 + 0.5 * Math.sin(frameCount * 0.02 * s.speed + s.phase);
            ctx.globalAlpha = twinkle * 0.8;
            ctx.fillStyle = s.color;
            ctx.fillRect(gx(s.x), gy(s.y), gs(s.size), gs(s.size));
        });
        ctx.globalAlpha = 1;
    }

    function drawGirder(p) {
        const x = gx(p.x), y = gy(p.y), w = gs(p.w), h = gs(GIRDER_H);
        const yr = gy(p.yR);
        // Try sprite tile
        if (allSpritesReady && sprites['stoneMid']) {
            ctx.drawImage(sprites['stoneMid'], x, y, w, h + gs(4));
            return;
        }
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, yr);
        ctx.lineTo(x + w, yr + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        const beamGrad = ctx.createLinearGradient(x, y, x, y + h);
        beamGrad.addColorStop(0, '#C44');
        beamGrad.addColorStop(0.3, '#E66');
        beamGrad.addColorStop(0.5, '#D55');
        beamGrad.addColorStop(1, '#933');
        ctx.fillStyle = beamGrad;
        ctx.fill();
        if (Math.floor(p.x) % 40 < 2) {
            const rivetY = (y + yr) / 2 + h * 0.3;
            ctx.fillStyle = '#F88';
            ctx.beginPath();
            ctx.arc(x + w / 2, rivetY, gs(1.5), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawLadder(l) {
        const x = gx(l.x), y = gy(l.y), w = gs(l.w), h = gs(l.h);
        // Try sprite ladder
        if (allSpritesReady && sprites['ladderMid']) {
            const tileH = gs(20);
            if (sprites['ladderTop']) ctx.drawImage(sprites['ladderTop'], x - gs(1), y, w + gs(2), tileH);
            for (let ty = y + tileH; ty < y + h; ty += tileH) {
                ctx.drawImage(sprites['ladderMid'], x - gs(1), ty, w + gs(2), tileH);
            }
            return;
        }
        // Rails fallback
        ctx.fillStyle = '#7CF';
        ctx.fillRect(x, y, gs(2), h);
        ctx.fillRect(x + w - gs(2), y, gs(2), h);
        const rungCount = Math.floor(l.h / 10);
        for (let i = 0; i <= rungCount; i++) {
            const ry = y + (h / rungCount) * i;
            ctx.fillStyle = '#9DF';
            ctx.fillRect(x + gs(1), ry, w - gs(2), gs(2));
            ctx.fillStyle = '#5AB';
            ctx.fillRect(x + gs(1), ry + gs(1.5), w - gs(2), gs(0.5));
        }
    }

    function drawConveyor(conv) {
        // Get y position at the start of the conveyor for this row
        const y1 = getPlatformYAt(conv.x1, conv.row);
        const y2 = getPlatformYAt(conv.x2, conv.row);
        if (!y1 || !y2) return;
        const beltY = gy(y1 - 3);
        const beltW = gx(conv.x2) - gx(conv.x1);
        const beltH = gs(3);
        // Belt surface
        ctx.fillStyle = '#555';
        ctx.fillRect(gx(conv.x1), beltY, beltW, beltH);
        // Animated arrows showing direction
        ctx.fillStyle = '#FF0';
        ctx.font = `${gs(6)}px monospace`;
        ctx.textAlign = 'center';
        const arrowChar = conv.dir > 0 ? '\u25B6' : '\u25C0';
        const offset = (frameCount * conv.dir * 2) % 30;
        for (let ax = conv.x1 + 10 + offset; ax < conv.x2 - 5; ax += 30) {
            ctx.fillText(arrowChar, gx(ax), beltY + beltH - gs(0.5));
        }
        // End posts
        ctx.fillStyle = '#888';
        ctx.fillRect(gx(conv.x1 - 3), beltY - gs(4), gs(6), gs(8));
        ctx.fillRect(gx(conv.x2 - 3), beltY - gs(4), gs(6), gs(8));
        // Roller dots
        ctx.fillStyle = '#777';
        const rollerOffset = (frameCount * conv.dir * 0.1) % 8;
        for (let rx = conv.x1 + rollerOffset; rx < conv.x2; rx += 8) {
            ctx.beginPath();
            ctx.arc(gx(rx), beltY + beltH / 2, gs(1), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawOilDrum() {
        const x = gx(oilDrum.x), y = gy(oilDrum.y), w = gs(oilDrum.w), h = gs(oilDrum.h);
        // Barrel body
        const drumGrad = ctx.createLinearGradient(x, y, x + w, y);
        drumGrad.addColorStop(0, '#444');
        drumGrad.addColorStop(0.3, '#666');
        drumGrad.addColorStop(0.7, '#666');
        drumGrad.addColorStop(1, '#333');
        ctx.fillStyle = drumGrad;
        ctx.fillRect(x, y, w, h);
        // Label
        ctx.fillStyle = '#F44';
        ctx.font = `bold ${gs(8)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('OIL', x + w / 2, y + h / 2 + gs(3));
        // Flame on top
        if (fires.length > 0 || oilDrum.flameFrame > 0) {
            oilDrum.flameFrame = (oilDrum.flameFrame + 0.15) % 1;
            drawFlame(x + w / 2, y - gs(4), gs(10), gs(14));
        }
    }

    function drawFlame(cx, cy, w, h) {
        const t = frameCount * 0.1;
        // Ambient fire glow underneath
        ctx.save();
        ctx.globalAlpha = 0.15;
        const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 2.5);
        glowGrad.addColorStop(0, '#FF6600');
        glowGrad.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, w * 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Flame tongues — more of them, brighter
        for (let i = 0; i < 7; i++) {
            const ox = Math.sin(t + i * 1.1) * w * 0.35;
            const oy = -Math.random() * h * 0.4;
            const r = w * (0.22 + 0.18 * Math.sin(t * 2 + i));
            ctx.save();
            ctx.shadowColor = '#FF6600';
            ctx.shadowBlur = r * 1.5;
            const grad = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
            grad.addColorStop(0, i < 2 ? '#FFF' : '#FFE066');
            grad.addColorStop(0.3, '#FF8800');
            grad.addColorStop(1, 'rgba(255,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function drawDK() {
        const x = gx(dk.x), y = gy(dk.y), s = gs(1);
        // Try sprite DK (large enemy block)
        if (allSpritesReady) {
            const dkImg = sprites[frameCount % 60 < 30 ? 'enemySlimeB' : 'enemySlimeBM'];
            if (dkImg) {
                ctx.drawImage(dkImg, x - 5 * s, y - 5 * s, 60 * s, 55 * s);
                return;
            }
        }
        // Body fallback
        const bodyGrad = ctx.createRadialGradient(x + 25 * s, y + 20 * s, 5 * s, x + 25 * s, y + 20 * s, 30 * s);
        bodyGrad.addColorStop(0, '#A0522D');
        bodyGrad.addColorStop(0.6, '#8B4513');
        bodyGrad.addColorStop(1, '#5C2E0E');
        ctx.fillStyle = bodyGrad;
        // Torso
        ctx.beginPath();
        ctx.ellipse(x + 25 * s, y + 22 * s, 22 * s, 18 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        // Head
        ctx.beginPath();
        ctx.ellipse(x + 25 * s, y + 2 * s, 14 * s, 11 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        // Face
        ctx.fillStyle = '#D2A06D';
        ctx.beginPath();
        ctx.ellipse(x + 25 * s, y + 5 * s, 9 * s, 7 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        // Eyes
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.ellipse(x + 21 * s, y + 2 * s, 3 * s, 3.5 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 29 * s, y + 2 * s, 3 * s, 3.5 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(x + 22 * s, y + 2 * s, 1.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 30 * s, y + 2 * s, 1.5 * s, 0, Math.PI * 2);
        ctx.fill();
        // Mouth
        ctx.strokeStyle = '#333';
        ctx.lineWidth = s;
        ctx.beginPath();
        ctx.arc(x + 25 * s, y + 7 * s, 4 * s, 0.1, Math.PI - 0.1);
        ctx.stroke();
        // Arms - animated throwing
        const armAngle = dk.armAngle;
        ctx.save();
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 6 * s;
        ctx.lineCap = 'round';
        // Left arm
        ctx.beginPath();
        ctx.moveTo(x + 6 * s, y + 18 * s);
        ctx.lineTo(x + 6 * s - Math.cos(armAngle) * 14 * s, y + 18 * s + Math.sin(armAngle) * 14 * s);
        ctx.stroke();
        // Right arm
        ctx.beginPath();
        ctx.moveTo(x + 44 * s, y + 18 * s);
        ctx.lineTo(x + 44 * s + Math.cos(armAngle) * 14 * s, y + 18 * s + Math.sin(armAngle) * 14 * s);
        ctx.stroke();
        // Hands
        ctx.fillStyle = '#D2A06D';
        ctx.beginPath();
        ctx.arc(x + 6 * s - Math.cos(armAngle) * 14 * s, y + 18 * s + Math.sin(armAngle) * 14 * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 44 * s + Math.cos(armAngle) * 14 * s, y + 18 * s + Math.sin(armAngle) * 14 * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Legs
        ctx.fillStyle = '#5C2E0E';
        ctx.fillRect(x + 14 * s, y + 36 * s, 8 * s, 10 * s);
        ctx.fillRect(x + 28 * s, y + 36 * s, 8 * s, 10 * s);
        // Tie
        ctx.fillStyle = '#E44';
        ctx.beginPath();
        ctx.moveTo(x + 25 * s, y + 12 * s);
        ctx.lineTo(x + 22 * s, y + 20 * s);
        ctx.lineTo(x + 28 * s, y + 20 * s);
        ctx.closePath();
        ctx.fill();
        // Chest beat visual (pulsing chest lines during chest beat)
        if (dk.chestBeatAnim > 0) {
            ctx.strokeStyle = '#FFA500';
            ctx.lineWidth = 1.5 * s;
            ctx.globalAlpha = dk.chestBeatAnim;
            for (let ring = 1; ring <= 3; ring++) {
                const r = ring * 6 * s * (1 - dk.chestBeatAnim * 0.3);
                ctx.beginPath();
                ctx.arc(x + 25 * s, y + 20 * s, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
    }

    function drawPauline() {
        const x = gx(pauline.x), y = gy(pauline.y), s = gs(1);
        pauline.frame = (pauline.frame + 0.04) % 2;
        pauline.helpBubble = (pauline.helpBubble || 0) + 0.03;
        const wave = Math.sin(pauline.frame * Math.PI) * 3;
        // Dress
        ctx.fillStyle = '#F47';
        ctx.beginPath();
        ctx.moveTo(x, y + 28 * s);
        ctx.lineTo(x + 6 * s, y + 10 * s);
        ctx.lineTo(x + 14 * s, y + 10 * s);
        ctx.lineTo(x + 20 * s, y + 28 * s);
        ctx.closePath();
        ctx.fill();
        // Dress highlight
        ctx.fillStyle = '#F69';
        ctx.beginPath();
        ctx.moveTo(x + 6 * s, y + 14 * s);
        ctx.lineTo(x + 14 * s, y + 14 * s);
        ctx.lineTo(x + 16 * s, y + 22 * s);
        ctx.lineTo(x + 4 * s, y + 22 * s);
        ctx.closePath();
        ctx.fill();
        // Head
        ctx.fillStyle = '#FDBCB4';
        ctx.beginPath();
        ctx.arc(x + 10 * s, y + 6 * s, 6 * s, 0, Math.PI * 2);
        ctx.fill();
        // Hair
        ctx.fillStyle = '#E8C838';
        ctx.beginPath();
        ctx.arc(x + 10 * s, y + 3 * s, 6 * s, Math.PI, Math.PI * 2);
        ctx.fill();
        // Hair strands
        ctx.strokeStyle = '#D4B020';
        ctx.lineWidth = s;
        ctx.beginPath();
        ctx.moveTo(x + 4 * s, y + 3 * s); ctx.quadraticCurveTo(x + 1 * s, y + 10 * s, x + 3 * s, y + 14 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 16 * s, y + 3 * s); ctx.quadraticCurveTo(x + 19 * s, y + 10 * s, x + 17 * s, y + 14 * s);
        ctx.stroke();
        // Eyes
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.arc(x + 8 * s, y + 5 * s, 1.2 * s, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 12 * s, y + 5 * s, 1.2 * s, 0, Math.PI * 2); ctx.fill();
        // Arms waving
        ctx.strokeStyle = '#FDBCB4';
        ctx.lineWidth = 2 * s;
        ctx.lineCap = 'round';
        const armWave = Math.sin(frameCount * 0.15) * 5;
        ctx.beginPath();
        ctx.moveTo(x + 4 * s, y + 14 * s);
        ctx.lineTo(x - 2 * s, y + 8 * s + armWave * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 16 * s, y + 14 * s);
        ctx.lineTo(x + 22 * s, y + 8 * s - armWave * s);
        ctx.stroke();
        // Speech bubble with "HELP!" — more visible with glow
        const bubbleAlpha = 0.85 + Math.sin(pauline.helpBubble * 3) * 0.15;
        const bubbleY = y - 20 * s + Math.sin(pauline.helpBubble * 2) * 3 * s;
        const bubbleScale = 0.95 + Math.sin(pauline.helpBubble * 4) * 0.12;
        ctx.save();
        ctx.globalAlpha = bubbleAlpha;
        ctx.shadowColor = '#FF4477';
        ctx.shadowBlur = 8 * s;
        ctx.translate(x + 10 * s, bubbleY);
        ctx.scale(bubbleScale, bubbleScale);
        // Bubble shape
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.ellipse(0, 0, 22 * s, 10 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        // Bubble tail
        ctx.beginPath();
        ctx.moveTo(-3 * s, 8 * s);
        ctx.lineTo(2 * s, 14 * s);
        ctx.lineTo(5 * s, 7 * s);
        ctx.closePath();
        ctx.fill();
        // Border
        ctx.strokeStyle = '#333';
        ctx.lineWidth = s;
        ctx.beginPath();
        ctx.ellipse(0, 0, 22 * s, 10 * s, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Text
        ctx.fillStyle = '#E44';
        ctx.font = `bold ${gs(8)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HELP!', 0, -1 * s);
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    function drawPlayer() {
        if (state === ST_DYING && Math.floor(deathTimer / 100) % 2 === 0) return;
        const x = gx(player.x), y = gy(player.y), s = gs(1);
        const dir = player.facing;
        const walking = player.onGround && (keys['ArrowLeft'] || keys['ArrowRight']);
        const climbing = player.climbing;
        const legPhase = walking ? Math.sin(frameCount * 0.3) * 4 : 0;
        const climbPhase = climbing ? Math.sin(frameCount * 0.25) * 3 : 0;

        // Try sprite player
        if (allSpritesReady) {
            let sprKey;
            if (climbing) sprKey = (Math.floor(frameCount / 10) % 2 === 0) ? 'playerClimb1' : 'playerClimb2';
            else if (!player.onGround) sprKey = 'playerJump';
            else if (walking) sprKey = (Math.floor(frameCount / 8) % 2 === 0) ? 'playerWalk1' : 'playerWalk2';
            else sprKey = 'playerStand';
            if (state === ST_DYING) sprKey = 'playerHit';
            const spr = sprites[sprKey];
            if (spr) {
                drawSprite(spr, player.x - 4, player.y - 6, PLAYER_W + 8, PLAYER_H + 8, dir < 0);
                // Still draw hammer overlay if active
                if (hammerActive) {
                    const swing = Math.sin(frameCount * 0.4) * 0.8;
                    ctx.save();
                    ctx.translate(gx(player.x + 8), gy(player.y + 2));
                    ctx.rotate(swing);
                    ctx.fillStyle = '#8B4513';
                    ctx.fillRect(-gs(2), -gs(12), gs(4), gs(12));
                    ctx.fillStyle = '#666';
                    ctx.fillRect(-gs(5), -gs(18), gs(10), gs(7));
                    ctx.restore();
                }
                return;
            }
        }

        ctx.save();
        // Hammer glow
        if (hammerActive) {
            ctx.shadowColor = themeColor || '#FF0';
            ctx.shadowBlur = gs(8);
        }
        // Body
        ctx.fillStyle = playerColor || '#E44';
        ctx.fillRect(x + 3 * s, y + 8 * s, 10 * s, 10 * s);
        // Head
        ctx.fillStyle = '#FDBCB4';
        ctx.beginPath();
        ctx.arc(x + 8 * s, y + 4 * s, 5 * s, 0, Math.PI * 2);
        ctx.fill();
        // Hard hat
        ctx.fillStyle = themeColor || '#44F';
        ctx.fillRect(x + 2 * s, y - 1 * s, 12 * s, 4 * s);
        ctx.fillRect(x + 4 * s, y - 3 * s, 8 * s, 3 * s);
        // Eyes
        ctx.fillStyle = '#111';
        ctx.fillRect(x + (dir > 0 ? 9 : 5) * s, y + 3 * s, 2 * s, 2 * s);
        // Legs
        ctx.fillStyle = '#44A';
        if (climbing) {
            ctx.fillRect(x + 4 * s, y + 18 * s + climbPhase * s, 4 * s, 6 * s);
            ctx.fillRect(x + 9 * s, y + 18 * s - climbPhase * s, 4 * s, 6 * s);
        } else {
            ctx.fillRect(x + 3 * s, y + 18 * s, 4 * s, 5 * s + legPhase * s * 0.3);
            ctx.fillRect(x + 9 * s, y + 18 * s, 4 * s, 5 * s - legPhase * s * 0.3);
        }
        // Arms
        ctx.fillStyle = playerColor || '#E44';
        if (hammerActive) {
            // Swinging hammer arm
            const swing = Math.sin(frameCount * 0.4) * 0.8;
            ctx.save();
            ctx.translate(x + 8 * s, y + 10 * s);
            ctx.rotate(swing);
            ctx.fillRect(-2 * s, -12 * s, 4 * s, 12 * s);
            // Hammer head
            ctx.fillStyle = '#888';
            ctx.fillRect(-5 * s, -16 * s, 10 * s, 6 * s);
            // Sparks
            if (Math.random() < 0.3) {
                spawnParticle(player.x + 8 + Math.sin(swing) * 12, player.y - 6 + Math.cos(swing) * 12, rand(-1, 1), rand(-2, 0), '#FF0', 0.3);
            }
            ctx.restore();
        } else if (climbing) {
            ctx.fillRect(x + 1 * s, y + 9 * s + climbPhase * s, 3 * s, 6 * s);
            ctx.fillRect(x + 13 * s, y + 9 * s - climbPhase * s, 3 * s, 6 * s);
        } else {
            ctx.fillRect(x + (dir > 0 ? 12 : -2) * s, y + 9 * s, 4 * s, 3 * s);
        }
        ctx.restore();
    }

    function drawBarrel(b) {
        const cx = gx(b.x), cy = gy(b.y), r = gs(BARREL_R), s = gs(1);
        // Fire glow around rolling barrel
        if (b.onFire || Math.abs(b.vx) > 0.5) {
            ctx.save();
            ctx.globalAlpha = 0.12 + Math.sin(frameCount * 0.15 + b.x) * 0.06;
            const fireGlow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2.2);
            fireGlow.addColorStop(0, '#FF6600');
            fireGlow.addColorStop(1, 'rgba(255,60,0,0)');
            ctx.fillStyle = fireGlow;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        // Try sprite barrel
        if (allSpritesReady && sprites['boxCrate']) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(b.rotation);
            ctx.drawImage(sprites['boxCrate'], -r, -r, r * 2, r * 2);
            ctx.restore();
            return;
        }
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(b.rotation);
        // Barrel body with wood grain
        const bGrad = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
        bGrad.addColorStop(0, '#E8B868');
        bGrad.addColorStop(0.3, '#D4A053');
        bGrad.addColorStop(0.6, '#B87830');
        bGrad.addColorStop(1, '#7A4A14');
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        // Wood grain rings (curved lines that rotate with barrel)
        ctx.strokeStyle = '#6B3A0A';
        ctx.lineWidth = 0.8 * s;
        for (let g = 0; g < 5; g++) {
            const angle = (g / 5) * Math.PI;
            ctx.beginPath();
            ctx.arc(0, 0, r * (0.3 + g * 0.14), angle - 0.4, angle + 0.4);
            ctx.stroke();
        }
        // Cross-grain lines
        ctx.lineWidth = 0.6 * s;
        ctx.strokeStyle = '#8B5A1B';
        ctx.beginPath(); ctx.moveTo(-r * 0.9, 0); ctx.lineTo(r * 0.9, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(0, r * 0.9); ctx.stroke();
        // Metal bands with rivets
        ctx.strokeStyle = '#C0C0C0';
        ctx.lineWidth = 2 * s;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2); ctx.stroke();
        // Rivets on outer band
        ctx.fillStyle = '#DDD';
        for (let rv = 0; rv < 4; rv++) {
            const a = (rv / 4) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * r * 0.68, Math.sin(a) * r * 0.68, 1.2 * s, 0, Math.PI * 2);
            ctx.fill();
        }
        // Rolling motion blur
        if (Math.abs(b.vx) > 1) {
            ctx.globalAlpha = 0.15;
            ctx.strokeStyle = '#FFE0A0';
            ctx.lineWidth = 3 * s;
            ctx.beginPath(); ctx.arc(0, 0, r + 2 * s, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    }

    function drawSpring(sp) {
        const cx = gx(sp.x), cy = gy(sp.y), s = gs(1);
        ctx.save();
        ctx.translate(cx, cy);
        // Spring body
        const squash = sp.vy < -2 ? 0.7 : (sp.vy > 2 ? 1.3 : 1.0);
        ctx.scale(1 / squash, squash);
        // Coils
        ctx.strokeStyle = '#C0C0C0';
        ctx.lineWidth = 2.5 * s;
        const coils = 5;
        const height = 14 * s;
        const width = 10 * s;
        ctx.beginPath();
        for (let i = 0; i <= coils * 10; i++) {
            const t = i / (coils * 10);
            const x = Math.sin(t * coils * Math.PI * 2) * width / 2;
            const y = -height / 2 + t * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // Highlight
        ctx.strokeStyle = '#E8E8E8';
        ctx.lineWidth = 1 * s;
        ctx.beginPath();
        for (let i = 0; i <= coils * 10; i++) {
            const t = i / (coils * 10);
            const x = Math.sin(t * coils * Math.PI * 2) * width / 2 - 1 * s;
            const y = -height / 2 + t * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // Top/bottom caps
        ctx.fillStyle = '#888';
        ctx.fillRect(-width / 2 - 2 * s, -height / 2 - 2 * s, width + 4 * s, 3 * s);
        ctx.fillRect(-width / 2 - 2 * s, height / 2 - 1 * s, width + 4 * s, 3 * s);
        ctx.restore();
    }

    function drawFire(f) {
        const x = gx(f.x), y = gy(f.y), s = gs(1);
        // Body glow
        drawFlame(x + 5 * s, y + 2 * s, gs(8), gs(12));
        // Eyes
        ctx.fillStyle = '#FFF';
        ctx.fillRect(x + 2 * s, y + 3 * s, 3 * s, 3 * s);
        ctx.fillRect(x + 7 * s, y + 3 * s, 3 * s, 3 * s);
        ctx.fillStyle = '#F00';
        ctx.fillRect(x + 3 * s, y + 4 * s, 1.5 * s, 1.5 * s);
        ctx.fillRect(x + 8 * s, y + 4 * s, 1.5 * s, 1.5 * s);
    }

    function drawHammerPickup() {
        if (!hammerPickup.active || hammerActive) return;
        const x = gx(hammerPickup.x), y = gy(hammerPickup.y), s = gs(1);
        const bob = Math.sin(frameCount * 0.08) * 2;
        // Glow
        ctx.save();
        ctx.shadowColor = '#FF0';
        ctx.shadowBlur = gs(6);
        // Handle
        ctx.fillStyle = '#A67C52';
        ctx.fillRect(x + 5 * s, (y + bob * s) + 4 * s, 3 * s, 10 * s);
        // Head
        ctx.fillStyle = '#888';
        ctx.fillRect(x + 1 * s, (y + bob * s), 12 * s, 6 * s);
        ctx.restore();
    }

    function drawBonusItem(item) {
        const x = gx(item.x), y = gy(item.y), s = gs(1);
        const bob = Math.sin(frameCount * 0.06 + item.phase) * 2 * s;
        ctx.save();
        ctx.shadowColor = '#FFF';
        ctx.shadowBlur = gs(4);
        if (item.type === 'umbrella') {
            ctx.fillStyle = '#F4A';
            ctx.beginPath();
            ctx.arc(x + 6 * s, y + 3 * s + bob, 6 * s, Math.PI, 0);
            ctx.fill();
            ctx.fillStyle = '#A67C52';
            ctx.fillRect(x + 5 * s, y + 3 * s + bob, 2 * s, 10 * s);
        } else if (item.type === 'hat') {
            ctx.fillStyle = '#E8C838';
            ctx.fillRect(x + 1 * s, y + 7 * s + bob, 12 * s, 3 * s);
            ctx.fillRect(x + 3 * s, y + 2 * s + bob, 8 * s, 6 * s);
        } else {
            ctx.fillStyle = '#F47';
            ctx.beginPath();
            ctx.ellipse(x + 6 * s, y + 5 * s + bob, 6 * s, 5 * s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#C35';
            ctx.fillRect(x + 4 * s, y + bob, 4 * s, 5 * s);
        }
        ctx.restore();
    }

    function drawHUD() {
        const s = gs(1);
        ctx.fillStyle = '#FFF';
        ctx.font = `bold ${gs(10)}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE`, gx(10), gy(12));
        ctx.fillStyle = themeColor || '#0FF';
        ctx.fillText(`${score}`, gx(10), gy(24));
        // Hi score
        ctx.fillStyle = '#F44';
        ctx.textAlign = 'center';
        ctx.fillText('HIGH', gx(GAME_W / 2), gy(12));
        ctx.fillText(`${hiScore}`, gx(GAME_W / 2), gy(24));
        // Level
        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'right';
        ctx.fillText(`L=${level}`, gx(GAME_W - 10), gy(12));
        // Lives
        for (let i = 0; i < lives; i++) {
            const lx = gx(GAME_W - 60 + i * 18);
            const ly = gy(17);
            ctx.fillStyle = playerColor || '#E44';
            ctx.fillRect(lx, ly, gs(12), gs(8));
            ctx.fillStyle = themeColor || '#44F';
            ctx.fillRect(lx + gs(1), ly - gs(3), gs(10), gs(4));
        }
        // Hammer timer bar
        if (hammerActive) {
            const pct = hammerTimer / HAMMER_DURATION;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(gx(150), gy(30), gs(180), gs(6));
            ctx.fillStyle = pct > 0.3 ? '#FF0' : '#F44';
            ctx.fillRect(gx(150), gy(30), gs(180 * pct), gs(6));
            ctx.fillStyle = '#FFF';
            ctx.font = `${gs(7)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('HAMMER', gx(240), gy(37));
        }
    }

    function drawVignette() {
        const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    // ═══════════════════════════════════════════
    //  PARTICLES & EFFECTS
    // ═══════════════════════════════════════════
    function spawnParticle(x, y, vx, vy, color, life) {
        particles.push({ x, y, vx, vy, color, life, maxLife: life, size: rand(1, 3) });
    }

    function spawnBarrelSmashFX(x, y) {
        for (let i = 0; i < 15; i++) {
            spawnParticle(x, y, rand(-3, 3), rand(-4, 1), ['#D4A053', '#B87830', '#FF0', '#F80'][randInt(0, 3)], rand(0.4, 0.8));
        }
    }

    function addScorePopup(x, y, text) {
        scorePopups.push({ x, y, text, life: 1.2 });
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy; p.vy += 0.1;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = scorePopups.length - 1; i >= 0; i--) {
            const s = scorePopups[i];
            s.y -= 0.5; s.life -= dt;
            if (s.life <= 0) scorePopups.splice(i, 1);
        }
    }

    function drawParticles() {
        particles.forEach(p => {
            ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
            ctx.fillStyle = p.color;
            ctx.fillRect(gx(p.x), gy(p.y), gs(p.size), gs(p.size));
        });
        ctx.globalAlpha = 1;
        scorePopups.forEach(s => {
            ctx.globalAlpha = clamp(s.life, 0, 1);
            ctx.fillStyle = '#FFF';
            ctx.font = `bold ${gs(9)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(s.text, gx(s.x), gy(s.y));
        });
        ctx.globalAlpha = 1;
    }

    // ═══════════════════════════════════════════
    //  GAME LOGIC
    // ═══════════════════════════════════════════
    function resetPlayer() {
        player = {
            x: 50, y: 520 - PLAYER_H, vx: 0, vy: 0,
            onGround: false, climbing: false, facing: 1,
            row: 0, jumpGrace: 0
        };
    }

    function initLevel() {
        buildLevel();
        resetPlayer();
        barrels = [];
        fires = [];
        particles = [];
        scorePopups = [];
        bonusItems = [];
        springs = [];
        hammerActive = false;
        hammerTimer = 0;
        hammerPickup.active = true;
        barrelTimer = 0;
        bonusTimer = 0;
        dk.armAngle = 0.5;
        dk.throwTimer = 0;
        dk.chestBeatAnim = 0;
        screenShake = 0;
        dkPoundTimer = 0;
    }

    function startGame() {
        score = 0;
        lives = INITIAL_LIVES;
        level = 1;
        state = ST_LEVEL_INTRO;
        introTimer = 2000;
        initLevel();
    }

    function spawnBarrel() {
        sfxBarrelThrow();
        dk.armAngle = -0.5;
        dk.throwTimer = 300;
        // 15% chance of spring barrel (level 2+)
        if (level >= 2 && Math.random() < 0.15) {
            springs.push({
                x: dk.x + 25, y: dk.y + 40,
                vx: 1.2, vy: 0, rotation: 0,
                onGround: false, row: 5, falling: true,
                bouncePhase: 0
            });
            sfxSpring();
        } else {
            barrels.push({
                x: dk.x + 25, y: dk.y + 40,
                vx: 1.5, vy: 0, rotation: 0,
                onGround: false, row: 5, falling: true
            });
        }
    }

    function spawnFire() {
        fires.push({
            x: oilDrum.x + 4, y: oilDrum.y - 14,
            vx: (Math.random() < 0.5 ? -1 : 1) * FIRE_SPEED,
            row: 0, onGround: true, frame: 0
        });
    }

    function updateDK(dt) {
        dk.throwTimer -= dt * 1000;
        if (dk.throwTimer <= 0) {
            dk.armAngle += (0.5 - dk.armAngle) * 0.05;
        }
        // Chest beat animation between throws
        dk.chestBeat = (dk.chestBeat + dt) % 5;
        if (dk.chestBeat > 3 && dk.chestBeat < 3.8) {
            // Chest-beating: arms pump inward
            const beatPhase = (dk.chestBeat - 3) * 12;
            dk.armAngle = 0.1 + Math.abs(Math.sin(beatPhase)) * 0.6;
            dk.chestBeatAnim = Math.abs(Math.sin(beatPhase));
        } else {
            dk.chestBeatAnim = Math.max(0, (dk.chestBeatAnim || 0) - dt * 3);
        }
        // Ground pound (level 2+): DK pounds every 8 seconds, shakes screen and tilts a girder
        if (level >= 2) {
            dkPoundTimer = (dkPoundTimer || 0) + dt * 1000;
            if (dkPoundTimer > 8000) {
                dkPoundTimer = 0;
                dkPoundRow = randInt(1, 4);
                screenShake = Math.max(screenShake, 500);
                sfxPound();
                // Spawn shockwave particles at DK position
                for (let i = 0; i < 8; i++) {
                    spawnParticle(dk.x + 25, dk.y + 45, rand(-2, 2), rand(0, 3), '#FA0', rand(0.3, 0.6));
                }
            }
        }
    }

    function updateBarrels(dt) {
        const interval = Math.max(800, BARREL_INTERVAL_BASE - level * 200);
        barrelTimer += dt * 1000;
        if (barrelTimer > interval) {
            barrelTimer = 0;
            spawnBarrel();
        }
        for (let i = barrels.length - 1; i >= 0; i--) {
            const b = barrels[i];
            b.rotation += b.vx * 0.08;
            if (b.falling) {
                b.vy += GRAVITY;
                b.vy = Math.min(b.vy, MAX_FALL);
                b.y += b.vy;
                b.x += b.vx * 0.3;
                // Check landing on platform
                const landing = findPlatformBelow(b.x, b.y - 4);
                if (landing && b.y >= landing.y - BARREL_R) {
                    b.y = landing.y - BARREL_R;
                    b.vy = 0;
                    b.falling = false;
                    b.row = landing.platform.row;
                    // Set direction based on platform slant
                    b.vx = landing.platform.slant > 0 ? -BARREL_SPEED : BARREL_SPEED;
                    b.vx *= (1 + level * 0.1);
                }
            } else {
                // Roll along platform
                b.x += b.vx;
                const py = getPlatformYAt(b.x, b.row);
                if (py !== null) {
                    b.y = py - BARREL_R;
                } else {
                    // Fell off edge — decide: take ladder or fall
                    b.falling = true;
                    b.vy = 0;
                }
                // Random ladder descent
                for (const l of ladders) {
                    if (Math.abs(b.x - l.x - 4) < 6 && Math.abs(b.y + BARREL_R - l.y) < 8 && Math.random() < 0.015) {
                        b.falling = true;
                        b.vy = 1;
                        b.vx = 0;
                        break;
                    }
                }
            }
            // Off-screen or into oil drum
            if (b.y > GAME_H + 20) {
                barrels.splice(i, 1);
                continue;
            }
            if (b.row === 0 && b.x < oilDrum.x + oilDrum.w + 5 && b.x > oilDrum.x - 5) {
                barrels.splice(i, 1);
                if (fires.length < 3 + level) spawnFire();
                oilDrum.flameFrame = 1;
                continue;
            }
            // Collision with player
            if (state === ST_PLAY) {
                const px = player.x + PLAYER_W / 2, py_c = player.y + PLAYER_H / 2;
                if (dist({ x: b.x, y: b.y }, { x: px, y: py_c }) < BARREL_R + 8) {
                    if (hammerActive) {
                        sfxBarrelSmash();
                        spawnBarrelSmashFX(b.x, b.y);
                        const pts = 300;
                        score += pts;
                        addScorePopup(b.x, b.y, `${pts}`);
                        barrels.splice(i, 1);
                    } else {
                        killPlayer();
                        return;
                    }
                }
                // Jump over barrel bonus
                if (player.vy < 0 && !player.climbing && Math.abs(px - b.x) < 20 && py_c < b.y - 8 && !b.jumped) {
                    b.jumped = true;
                    score += 100;
                    addScorePopup(b.x, b.y - 10, '100');
                }
            }
        }
    }

    function updateFires(dt) {
        fires.forEach(f => {
            f.frame += dt;
            if (f.onGround) {
                f.x += f.vx * (1 + level * 0.05);
                const py = getPlatformYAt(f.x, f.row);
                if (py !== null) {
                    f.y = py - 14;
                } else {
                    f.vx = -f.vx;
                    f.x += f.vx * 4;
                }
                // Chase player slightly
                if (Math.random() < 0.01) {
                    f.vx = player.x > f.x ? Math.abs(f.vx) : -Math.abs(f.vx);
                }
                // Try climbing ladders toward player
                if (player.row > f.row && Math.random() < 0.008) {
                    for (const l of ladders) {
                        if (Math.abs(f.x - l.x) < 12 && Math.abs(f.y + 14 - l.y) < 10) {
                            f.onGround = false;
                            f.climbTarget = l.y;
                            f.climbLadder = l;
                            break;
                        }
                    }
                }
            } else {
                // Climbing
                f.y -= CLIMB_SPEED * 0.5;
                if (f.climbLadder && f.y <= f.climbLadder.y) {
                    f.onGround = true;
                    f.row = Math.min(f.row + 1, 4);
                    const py = getPlatformYAt(f.x, f.row);
                    if (py) f.y = py - 14;
                }
            }
            // Collision with player
            if (state === ST_PLAY) {
                if (rectHit({ x: f.x, y: f.y, w: 12, h: 14 }, { x: player.x, y: player.y, w: PLAYER_W, h: PLAYER_H })) {
                    if (hammerActive) {
                        sfxBarrelSmash();
                        spawnBarrelSmashFX(f.x, f.y);
                        score += 500;
                        addScorePopup(f.x, f.y, '500');
                        f.dead = true;
                    } else {
                        killPlayer();
                    }
                }
            }
        });
        fires = fires.filter(f => !f.dead);
    }

    function updateBonusItems(dt) {
        bonusTimer += dt * 1000;
        if (bonusTimer > BONUS_ITEM_INTERVAL && bonusItems.length < 2) {
            bonusTimer = 0;
            const types = ['umbrella', 'hat', 'purse'];
            const row = randInt(1, 4);
            const px = rand(60, 400);
            const py = getPlatformYAt(px, row);
            if (py) {
                bonusItems.push({ x: px, y: py - 16, type: types[randInt(0, 2)], phase: Math.random() * 6, life: 10 });
            }
        }
        for (let i = bonusItems.length - 1; i >= 0; i--) {
            const item = bonusItems[i];
            item.life -= dt;
            if (item.life <= 0) { bonusItems.splice(i, 1); continue; }
            if (state === ST_PLAY && rectHit({ x: item.x, y: item.y, w: 14, h: 14 }, { x: player.x, y: player.y, w: PLAYER_W, h: PLAYER_H })) {
                sfxBonus();
                const pts = item.type === 'purse' ? 800 : item.type === 'hat' ? 500 : 300;
                score += pts;
                addScorePopup(item.x, item.y, `${pts}`);
                bonusItems.splice(i, 1);
            }
        }
    }

    function updateSprings(dt) {
        for (let i = springs.length - 1; i >= 0; i--) {
            const sp = springs[i];
            sp.bouncePhase += dt * 3;
            if (sp.falling) {
                sp.vy += GRAVITY;
                sp.vy = Math.min(sp.vy, MAX_FALL);
                sp.y += sp.vy;
                sp.x += sp.vx * 0.3;
                const landing = findPlatformBelow(sp.x, sp.y - 4);
                if (landing && sp.y >= landing.y - BARREL_R) {
                    sp.y = landing.y - BARREL_R;
                    // Springs bounce unpredictably
                    sp.vy = SPRING_BOUNCE_VEL * (0.6 + Math.random() * 0.6);
                    sp.vx = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2);
                    sp.row = landing.platform.row;
                    sfxSpring();
                }
            }
            // Off screen
            if (sp.y > GAME_H + 30 || sp.x < -20 || sp.x > GAME_W + 20) {
                springs.splice(i, 1);
                continue;
            }
            // Collision with player
            if (state === ST_PLAY) {
                const px = player.x + PLAYER_W / 2, py_c = player.y + PLAYER_H / 2;
                if (dist({ x: sp.x, y: sp.y }, { x: px, y: py_c }) < BARREL_R + 8) {
                    if (hammerActive) {
                        sfxBarrelSmash();
                        spawnBarrelSmashFX(sp.x, sp.y);
                        score += 500;
                        addScorePopup(sp.x, sp.y, '500');
                        springs.splice(i, 1);
                    } else {
                        killPlayer();
                        return;
                    }
                }
                // Jump over spring bonus
                if (player.vy < 0 && !player.climbing && Math.abs(px - sp.x) < 20 && py_c < sp.y - 8 && !sp.jumped) {
                    sp.jumped = true;
                    score += 200;
                    addScorePopup(sp.x, sp.y - 10, '200');
                }
            }
        }
    }

    function updateConveyors(dt) {
        if (!conveyors || conveyors.length === 0) return;
        for (const conv of conveyors) {
            // Push player if on this row and within conveyor range
            if (player.onGround && player.row === conv.row) {
                const px = player.x + PLAYER_W / 2;
                if (px >= conv.x1 && px <= conv.x2) {
                    player.x += conv.dir * conv.speed * (1 + level * 0.1);
                    if (frameCount % 10 === 0) sfxConveyor();
                }
            }
            // Push barrels on conveyors
            for (const b of barrels) {
                if (!b.falling && b.row === conv.row && b.x >= conv.x1 && b.x <= conv.x2) {
                    b.x += conv.dir * conv.speed * 0.5;
                }
            }
        }
    }

    function updatePlayer(dt) {
        if (state !== ST_PLAY) return;
        const onLadder = isOnLadder(player.x, player.y, PLAYER_H);
        const wantUp = keys['ArrowUp'] || touchUp;
        const wantDown = keys['ArrowDown'] || touchDown;
        const wantLeft = keys['ArrowLeft'] || touchLeft;
        const wantRight = keys['ArrowRight'] || touchRight;
        const wantJump = keys[' '] || keys['Space'] || touchJump;

        // Climbing
        if (onLadder && (wantUp || wantDown) && !player.jumping) {
            player.climbing = true;
            player.vy = 0;
            player.vx = 0;
            player.x = onLadder.x + (onLadder.w - PLAYER_W) / 2;
            if (wantUp) { player.y -= CLIMB_SPEED; sfxClimb(); }
            if (wantDown) { player.y += CLIMB_SPEED; sfxClimb(); }
        } else {
            player.climbing = false;
        }

        if (!player.climbing) {
            // Horizontal movement
            if (wantLeft) { player.vx = -PLAYER_SPEED; player.facing = -1; }
            else if (wantRight) { player.vx = PLAYER_SPEED; player.facing = 1; }
            else { player.vx *= 0.6; }
            player.x += player.vx;
            player.x = clamp(player.x, 10, GAME_W - PLAYER_W - 10);

            // Jumping
            if (wantJump && (player.onGround || player.jumpGrace > 0) && !player.jumping) {
                player.vy = JUMP_VEL;
                player.onGround = false;
                player.jumping = true;
                player.jumpGrace = 0;
                sfxJump();
            }
            if (!wantJump) player.jumping = false;

            // Gravity
            player.vy += GRAVITY;
            player.vy = Math.min(player.vy, MAX_FALL);
            player.y += player.vy;

            // Platform collision
            player.onGround = false;
            const below = findPlatformBelow(player.x + PLAYER_W / 2, player.y + PLAYER_H - 2);
            if (below && player.vy >= 0 && player.y + PLAYER_H >= below.y && player.y + PLAYER_H < below.y + 12) {
                player.y = below.y - PLAYER_H;
                player.vy = 0;
                player.onGround = true;
                player.row = below.platform.row;
                player.jumpGrace = 80;
            }

            if (player.jumpGrace > 0) player.jumpGrace -= dt * 1000;

            // Fall death
            if (player.y > GAME_H + 20) { killPlayer(); return; }
        }

        // Hammer pickup
        if (hammerPickup.active && !hammerActive) {
            if (rectHit({ x: player.x, y: player.y, w: PLAYER_W, h: PLAYER_H }, { x: hammerPickup.x, y: hammerPickup.y, w: 14, h: 14 })) {
                hammerActive = true;
                hammerTimer = HAMMER_DURATION;
                hammerPickup.active = false;
                sfxHammer();
            }
        }

        // Hammer timer
        if (hammerActive) {
            hammerTimer -= dt * 1000;
            if (hammerTimer <= 0) { hammerActive = false; }
        }

        // Win condition: reach top platform near Pauline
        if (player.row >= 5 || (player.y < 130 && player.x > 140 && player.x < 280)) {
            winLevel();
        }
    }

    function killPlayer() {
        if (state !== ST_PLAY) return;
        state = ST_DYING;
        deathTimer = 1500;
        sfxDeath();
        screenShake = 300;
        for (let i = 0; i < 20; i++) {
            spawnParticle(player.x + PLAYER_W / 2, player.y + PLAYER_H / 2, rand(-3, 3), rand(-4, 1),
                ['#F44', '#FF0', '#FFF', '#F80'][randInt(0, 3)], rand(0.4, 1));
        }
    }

    function winLevel() {
        state = ST_WIN;
        winTimer = 3000;
        sfxWin();
        const bonusPts = 1000 + level * 500;
        score += bonusPts;
        addScorePopup(player.x, player.y - 20, `LEVEL BONUS ${bonusPts}`);
        for (let i = 0; i < 30; i++) {
            spawnParticle(pauline.x + 10, pauline.y + 10, rand(-4, 4), rand(-5, 0),
                ['#F4A', '#FF0', '#0FF', '#FFF'][randInt(0, 3)], rand(0.5, 1.5));
        }
    }

    // ═══════════════════════════════════════════
    //  MAIN LOOP
    // ═══════════════════════════════════════════
    function update(dt) {
        frameCount++;
        if (screenShake > 0) screenShake -= dt * 1000;

        switch (state) {
            case ST_TITLE:
                if (keys[' '] || keys['Enter'] || touchJump) startGame();
                break;

            case ST_LEVEL_INTRO:
                introTimer -= dt * 1000;
                if (introTimer <= 0) state = ST_PLAY;
                break;

            case ST_PLAY:
                updateDK(dt);
                updatePlayer(dt);
                updateBarrels(dt);
                updateSprings(dt);
                updateConveyors(dt);
                updateFires(dt);
                updateBonusItems(dt);
                updateParticles(dt);
                break;

            case ST_DYING:
                deathTimer -= dt * 1000;
                updateParticles(dt);
                if (deathTimer <= 0) {
                    lives--;
                    if (lives <= 0) {
                        state = ST_GAMEOVER;
                        hiScore = Math.max(hiScore, score);
                        try { localStorage.setItem(LS_KEY, hiScore); } catch {}
                        if (gameOverCB) gameOverCB(score);
                    } else {
                        resetPlayer();
                        hammerActive = false;
                        state = ST_PLAY;
                    }
                }
                break;

            case ST_WIN:
                winTimer -= dt * 1000;
                updateParticles(dt);
                if (winTimer <= 0) {
                    level++;
                    state = ST_LEVEL_INTRO;
                    introTimer = 2000;
                    initLevel();
                }
                break;

            case ST_GAMEOVER:
                if (keys[' '] || keys['Enter'] || touchJump) startGame();
                break;
        }
    }

    function render() {
        ctx.save();
        // Screen shake
        if (screenShake > 0) {
            const mag = screenShake / 300 * 4;
            ctx.translate(rand(-mag, mag) * SCALE, rand(-mag, mag) * SCALE);
        }

        drawBackground();

        // Platforms
        platforms.forEach(drawGirder);
        // Conveyor belts
        if (conveyors) conveyors.forEach(drawConveyor);
        ladders.forEach(drawLadder);

        // Oil drum
        drawOilDrum();

        // Hammer pickup
        drawHammerPickup();

        // Bonus items
        bonusItems.forEach(drawBonusItem);

        // Barrels
        barrels.forEach(drawBarrel);
        // Springs
        if (springs) springs.forEach(drawSpring);

        // Fires
        fires.forEach(drawFire);

        // DK
        drawDK();

        // Pauline
        drawPauline();

        // Player
        if (state !== ST_GAMEOVER) drawPlayer();

        // Particles
        drawParticles();

        if (state === ST_PLAY) drawOnScreenControls(ctx, W, H, gs, ['JUMP'], 'LR');

        ctx.restore();

        // HUD (no shake)
        drawHUD();

        // Vignette
        drawVignette();

        // State overlays
        if (state === ST_TITLE) drawTitleScreen();
        else if (state === ST_LEVEL_INTRO) drawLevelIntro();
        else if (state === ST_GAMEOVER) drawGameOver();
        else if (state === ST_WIN) drawWinOverlay();
    }

    function drawTitleScreen() {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        // Title
        ctx.fillStyle = '#E44';
        ctx.font = `bold ${gs(28)}px monospace`;
        ctx.fillText('DONKEY', W / 2, H * 0.28);
        ctx.fillStyle = themeColor || '#4AF';
        ctx.fillText('KONG', W / 2, H * 0.36);
        // Subtitle
        ctx.fillStyle = '#FFF';
        ctx.font = `${gs(10)}px monospace`;
        ctx.fillText('PRESS SPACE TO START', W / 2, H * 0.52);
        // Controls
        ctx.fillStyle = '#AAA';
        ctx.font = `${gs(8)}px monospace`;
        ctx.fillText('ARROWS: Move / Climb', W / 2, H * 0.62);
        ctx.fillText('SPACE: Jump', W / 2, H * 0.67);
        ctx.fillText('Grab the hammer to smash barrels!', W / 2, H * 0.74);
        // Animated DK
        const bounce = Math.sin(frameCount * 0.05) * 5;
        ctx.fillStyle = '#8B4513';
        ctx.beginPath();
        ctx.arc(W / 2, H * 0.45 + bounce * SCALE, gs(18), 0, Math.PI * 2);
        ctx.fill();
    }

    function drawLevelIntro() {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFF';
        ctx.font = `bold ${gs(18)}px monospace`;
        ctx.fillText(`LEVEL ${level}`, W / 2, H * 0.4);
        ctx.fillStyle = themeColor || '#4AF';
        ctx.font = `${gs(10)}px monospace`;
        ctx.fillText('GET READY!', W / 2, H * 0.5);
        ctx.fillStyle = '#F4A';
        ctx.fillText('Rescue Pauline!', W / 2, H * 0.58);
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#F44';
        ctx.font = `bold ${gs(22)}px monospace`;
        ctx.fillText('GAME OVER', W / 2, H * 0.35);
        ctx.fillStyle = '#FFF';
        ctx.font = `${gs(12)}px monospace`;
        ctx.fillText(`SCORE: ${score}`, W / 2, H * 0.48);
        ctx.fillStyle = '#FF0';
        ctx.fillText(`HIGH SCORE: ${hiScore}`, W / 2, H * 0.55);
        ctx.fillStyle = '#AAA';
        ctx.font = `${gs(9)}px monospace`;
        ctx.fillText('PRESS SPACE TO RETRY', W / 2, H * 0.68);
    }

    function drawWinOverlay() {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FF0';
        ctx.font = `bold ${gs(18)}px monospace`;
        const bounce = Math.sin(frameCount * 0.1) * 3;
        ctx.fillText('RESCUED!', W / 2, H * 0.4 + bounce * SCALE);
        ctx.fillStyle = '#FFF';
        ctx.font = `${gs(10)}px monospace`;
        ctx.fillText(`Level ${level} Complete!`, W / 2, H * 0.5);
    }

    // ═══════════════════════════════════════════
    //  INPUT
    // ═══════════════════════════════════════════
    function onKeyDown(e) {
        keys[e.key] = true;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }
    function onKeyUp(e) { keys[e.key] = false; }

    function onTouchStart(e) {
        e.preventDefault();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        handleTouches(e.touches);
    }
    function onTouchMove(e) { e.preventDefault(); handleTouches(e.touches); }
    function onTouchEnd(e) {
        e.preventDefault();
        touchLeft = touchRight = touchUp = touchDown = touchJump = false;
        if (e.touches.length > 0) handleTouches(e.touches);
    }

    function handleTouches(touches) {
        touchLeft = touchRight = touchUp = touchDown = touchJump = false;
        const rect = canvas.getBoundingClientRect();
        for (let i = 0; i < touches.length; i++) {
            const tx = (touches[i].clientX - rect.left) / rect.width;
            const ty = (touches[i].clientY - rect.top) / rect.height;
            if (tx < 0.25) touchLeft = true;
            else if (tx > 0.75) touchRight = true;
            if (ty < 0.33) touchUp = true;
            else if (ty > 0.66) {
                if (tx > 0.35 && tx < 0.65) touchJump = true;
                else touchDown = true;
            }
            // Center tap = jump / start
            if (tx > 0.3 && tx < 0.7 && ty > 0.3 && ty < 0.7) touchJump = true;
        }
    }

    // ═══════════════════════════════════════════
    //  CANVAS SCALING
    // ═══════════════════════════════════════════
    function fitCanvas() {
        if (!canvas) return;
        DPR = Math.min(window.devicePixelRatio || 1, 3);
        let pw = canvas.width || 480, ph = canvas.height || 560;
        const parent = canvas.parentElement;
        if (parent && parent.clientWidth > 50 && parent.clientHeight > 50) {
            pw = parent.clientWidth; ph = parent.clientHeight;
        }
        const aspect = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > aspect) { ch = ph; cw = ch * aspect; }
        else { cw = pw; ch = cw / aspect; }
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        canvas.width = Math.round(cw * DPR);
        canvas.height = Math.round(ch * DPR);
        W = canvas.width; H = canvas.height;
        SCALE = W / GAME_W;
        ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
    }

    // ═══════════════════════════════════════════
    //  GAME LOOP
    // ═══════════════════════════════════════════
    function gameLoop(ts) {
        if (!gameActive) return;
        if (!lastTime) lastTime = ts;
        const dt = Math.min((ts - lastTime) / 1000, 0.05);
        lastTime = ts;

        if (state === ST_LOADING) {
            drawLoading();
            if (allSpritesReady) state = ST_TITLE;
        } else {
            update(dt);
            render();
        }

        animFrame = requestAnimationFrame(gameLoop);
    }

    // ═══════════════════════════════════════════
    //  INIT / DESTROY
    // ═══════════════════════════════════════════
    function init(cvs, playerData, onGameOverFn) {
        canvas = cvs;
        activePlayer = playerData || {};
        gameOverCB = onGameOverFn;

        // Theme colors
        playerColor = activePlayer.color || '#E44';
        themeColor = activePlayer.theme_color || activePlayer.color || '#4AF';

        // State init
        try { hiScore = parseInt(localStorage.getItem(LS_KEY)) || 0; } catch { hiScore = 0; }
        score = 0;
        lives = INITIAL_LIVES;
        level = 1;
        frameCount = 0;
        lastTime = 0;
        keys = {};
        barrels = [];
        fires = [];
        particles = [];
        scorePopups = [];
        bonusItems = [];
        touchLeft = touchRight = touchUp = touchDown = touchJump = false;
        screenShake = 0;
        hammerActive = false;
        springs = [];
        conveyors = [];
        dkPoundTimer = 0;
        dkPoundRow = -1;

        // Stars
        stars = [];
        for (let i = 0; i < 60; i++) {
            stars.push({ x: rand(0, GAME_W), y: rand(0, GAME_H * 0.4), size: rand(0.5, 2), speed: rand(0.5, 2), phase: rand(0, 6.28), color: ['#FFF', '#CCF', '#FFC'][randInt(0, 2)] });
        }

        state = ST_LOADING;
        if (!allSpritesReady) loadSprites();
        buildLevel();
        resetPlayer();

        // Events
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        window.addEventListener('resize', fitCanvas);

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        gameActive = true;
        animFrame = requestAnimationFrame(gameLoop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        if (audioCtx) {
            try { audioCtx.close(); } catch {}
            audioCtx = null;
        }
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        if (canvas) {
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        window.removeEventListener('resize', fitCanvas);
        keys = {};
        particles = [];
        barrels = [];
        fires = [];
        bonusItems = [];
        scorePopups = [];
        springs = [];
        conveyors = [];
    }

    return {
        init,
        destroy,
        getScore() { return score; },
        getLevel() { return level; },
        isActive() { return gameActive; },
    };
})();
