/* 8-Ball Pool — Kenney Physics Pack Edition for Your World Arcade */
window.Pool = (() => {

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

    // ══════════════════════════════════════════════════════════
    //  SPRITE PRELOADER — Kenney Physics Pack
    // ══════════════════════════════════════════════════════════
    const ASSET_BASE = '/img/game-assets/kenney-physics';
    const spriteCache = {};
    let spritesLoaded = 0;
    let spritesTotal  = 0;
    let allSpritesReady = false;

    const SPRITE_MANIFEST = {
        // Wood sprites for rails
        woodPlankH:   `${ASSET_BASE}/wood/elementWood011.png`,
        woodPlankV:   `${ASSET_BASE}/wood/elementWood012.png`,
        woodSquare:   `${ASSET_BASE}/wood/elementWood010.png`,
        woodBlock:    `${ASSET_BASE}/wood/elementWood013.png`,
        woodCorner:   `${ASSET_BASE}/wood/elementWood003.png`,
        woodThin:     `${ASSET_BASE}/wood/elementWood018.png`,
        woodWide:     `${ASSET_BASE}/wood/elementWood015.png`,
        woodDark:     `${ASSET_BASE}/wood/elementWood042.png`,
        woodLight:    `${ASSET_BASE}/wood/elementWood040.png`,
        // Metal sprites for pockets
        metalCircle:  `${ASSET_BASE}/metal/elementMetal000.png`,
        metalRing:    `${ASSET_BASE}/metal/elementMetal004.png`,
        metalPlate:   `${ASSET_BASE}/metal/elementMetal010.png`,
        metalBolt:    `${ASSET_BASE}/metal/elementMetal029.png`,
        metalHalf:    `${ASSET_BASE}/metal/elementMetal015.png`,
        metalSquare:  `${ASSET_BASE}/metal/elementMetal020.png`,
        metalNarrow:  `${ASSET_BASE}/metal/elementMetal017.png`,
        // Backgrounds
        bgDesert:     `${ASSET_BASE}/backgrounds/colored_desert.png`,
        bgGrass:      `${ASSET_BASE}/backgrounds/colored_grass.png`,
        bgLand:       `${ASSET_BASE}/backgrounds/colored_land.png`,
        bgShroom:     `${ASSET_BASE}/backgrounds/blue_shroom.png`,
        // Debris/particles for collisions
        debrisWood1:  `${ASSET_BASE}/debris/debrisWood_1.png`,
        debrisWood2:  `${ASSET_BASE}/debris/debrisWood_2.png`,
        debrisWood3:  `${ASSET_BASE}/debris/debrisWood_3.png`,
        debrisStone1: `${ASSET_BASE}/debris/debrisStone_1.png`,
        debrisStone2: `${ASSET_BASE}/debris/debrisStone_2.png`,
        debrisGlass1: `${ASSET_BASE}/debris/debrisGlass_1.png`,
        debrisGlass2: `${ASSET_BASE}/debris/debrisGlass_2.png`,
        // Stars for rating/scoring
        starGold:     `${ASSET_BASE}/other/starGold.png`,
        starSilver:   `${ASSET_BASE}/other/starSilver.png`,
        starBronze:   `${ASSET_BASE}/other/starBronze.png`,
        starDiamond:  `${ASSET_BASE}/other/starDiamond.png`,
        // Explosive for power shots
        explosive1:   `${ASSET_BASE}/explosive/elementExplosive009.png`,
        explosive2:   `${ASSET_BASE}/explosive/elementExplosive018.png`,
        explosive3:   `${ASSET_BASE}/explosive/elementExplosive027.png`,
        // Glass for ghost ball
        glassCircle:  `${ASSET_BASE}/glass/elementGlass000.png`,
        glassSmall:   `${ASSET_BASE}/glass/elementGlass004.png`,
        // Stone for table trim
        stoneBlock:   `${ASSET_BASE}/stone/elementStone010.png`,
        stoneThin:    `${ASSET_BASE}/stone/elementStone017.png`,
        // Coins for potting FX
        coinGold:     `${ASSET_BASE}/other/coinGold.png`,
        coinSilver:   `${ASSET_BASE}/other/coinSilver.png`,
        coinBronze:   `${ASSET_BASE}/other/coinBronze.png`,
        coinDiamond:  `${ASSET_BASE}/other/coinDiamond.png`,
    };

    function preloadSprites(onComplete) {
        const keys = Object.keys(SPRITE_MANIFEST);
        spritesTotal = keys.length;
        spritesLoaded = 0;
        if (spritesTotal === 0) { allSpritesReady = true; onComplete(); return; }

        keys.forEach(key => {
            const img = new Image();
            img.onload = () => {
                spriteCache[key] = img;
                spritesLoaded++;
                if (spritesLoaded >= spritesTotal) {
                    allSpritesReady = true;
                    if (onComplete) onComplete();
                }
            };
            img.onerror = () => {
                spriteCache[key] = null;
                spritesLoaded++;
                if (spritesLoaded >= spritesTotal) {
                    allSpritesReady = true;
                    if (onComplete) onComplete();
                }
            };
            img.src = SPRITE_MANIFEST[key];
        });
    }

    function spr(name) { return spriteCache[name] || null; }

    // Helper: draw sprite scaled or fallback to color
    function drawSprite(name, x, y, w, h, fallbackColor) {
        const img = spr(name);
        if (img) {
            ctx.drawImage(img, x, y, w, h);
        } else if (fallbackColor) {
            ctx.fillStyle = fallbackColor;
            ctx.fillRect(x, y, w, h);
        }
    }

    // Helper: draw tiled sprite along a region
    function drawTiledSprite(name, rx, ry, rw, rh, tileW, tileH, fallbackColor) {
        const img = spr(name);
        if (!img) {
            if (fallbackColor) { ctx.fillStyle = fallbackColor; ctx.fillRect(rx, ry, rw, rh); }
            return;
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();
        for (let tx = rx; tx < rx + rw; tx += tileW) {
            for (let ty = ry; ty < ry + rh; ty += tileH) {
                ctx.drawImage(img, tx, ty, tileW, tileH);
            }
        }
        ctx.restore();
    }

    // ══════════════════════════════════════════════════════════
    //  CONSTANTS
    // ══════════════════════════════════════════════════════════
    const GAME_W = 640, GAME_H = 400;
    const RAIL = 30;
    const POCKET_R = 17;
    const BALL_R = 9;
    const COR = 0.95;
    const FRICTION = 0.993;
    const ROLL_FRICTION = 0.998;
    const MIN_SPEED = 0.08;
    const MAX_POWER = 18;
    const AIM_LINE_LEN = 200;

    // Table dimensions (inside rails)
    const TABLE_L = RAIL;
    const TABLE_T = RAIL;
    const TABLE_R = GAME_W - RAIL;
    const TABLE_B = GAME_H - RAIL;
    const TABLE_W = TABLE_R - TABLE_L;
    const TABLE_H = TABLE_B - TABLE_T;

    // Pocket positions (6 pockets)
    const POCKETS = [
        { x: TABLE_L - 2,               y: TABLE_T - 2 },
        { x: (TABLE_L + TABLE_R) / 2,   y: TABLE_T - 4 },
        { x: TABLE_R + 2,               y: TABLE_T - 2 },
        { x: TABLE_L - 2,               y: TABLE_B + 2 },
        { x: (TABLE_L + TABLE_R) / 2,   y: TABLE_B + 4 },
        { x: TABLE_R + 2,               y: TABLE_B + 2 },
    ];

    // Ball colors (solids 1-7, 8=black, stripes 9-15)
    const BALL_COLORS = {
        1:  '#FFD700', 2:  '#2563EB', 3:  '#DC2626', 4:  '#7C3AED',
        5:  '#F97316', 6:  '#16A34A', 7:  '#7C2D12', 8:  '#111111',
        9:  '#FFD700', 10: '#2563EB', 11: '#DC2626', 12: '#7C3AED',
        13: '#F97316', 14: '#16A34A', 15: '#7C2D12',
    };

    // Richer secondary tones for depth
    const BALL_HIGHLIGHT = {
        1:  '#FFF5B0', 2:  '#93B8FF', 3:  '#FF8A8A', 4:  '#C4A0FF',
        5:  '#FFB870', 6:  '#6EE7A0', 7:  '#B8744A', 8:  '#444444',
        9:  '#FFF5B0', 10: '#93B8FF', 11: '#FF8A8A', 12: '#C4A0FF',
        13: '#FFB870', 14: '#6EE7A0', 15: '#B8744A',
    };

    const BALL_SHADOW = {
        1:  '#B89800', 2:  '#1A40A0', 3:  '#9B1010', 4:  '#5320A0',
        5:  '#C05200', 6:  '#0D7030', 7:  '#4A1808', 8:  '#000000',
        9:  '#B89800', 10: '#1A40A0', 11: '#9B1010', 12: '#5320A0',
        13: '#C05200', 14: '#0D7030', 15: '#4A1808',
    };

    // Game states
    const ST_TITLE    = 0;
    const ST_AIMING   = 1;
    const ST_POWER    = 2;
    const ST_ROLLING  = 3;
    const ST_AI_THINK = 4;
    const ST_OVER     = 5;
    const ST_LOADING  = 6;

    // ══════════════════════════════════════════════════════════
    //  MODULE STATE
    // ══════════════════════════════════════════════════════════
    let canvas, ctx, W, H, scale;
    let state, gameActive;
    let animFrame = null;
    let audioCtx  = null;
    let player    = null;
    let onGameOver = null;
    let frameCount = 0;

    // Theme colors
    let FELT_CLR       = '#1B5E20';
    let FELT_CLR2      = '#14472A';
    let RAIL_CLR       = '#5C3A1E';
    let RAIL_HIGHLIGHT = '#8B6914';
    let BG_CLR         = '#1A1A2E';
    let ACCENT_CLR     = '#F472B6';
    let TEXT_CLR       = '#FFFFFF';

    // Sprite load confirmation
    let spriteLoadFlash = 0;

    // Ball data
    let balls = [];
    let cueBall = null;

    // Players
    let currentPlayer = 0;
    let playerType = [-1, -1];
    let playerPotted = [[], []];
    let gamesWon = [0, 0];
    let turnFoul = false;
    let firstPotThisTurn = false;

    // Aiming
    let aimAngle = 0;
    let aimPower = 0;
    let aimDragging = false;
    let aimStartX = 0, aimStartY = 0;
    let mouseX = 0, mouseY = 0;

    // AI
    let aiTimer = 0;
    let aiShotAngle = 0;
    let aiShotPower = 0;

    // Effects
    let particles = [];
    let spriteParticles = [];
    let messages = [];
    let starEffects = [];
    let score = 0;
    let startTime = 0;
    let totalPotted = 0;

    // Input
    let keys = {};

    // Pre-rendered ball canvases (offscreen) for performance
    let ballCanvasCache = {};

    // ══════════════════════════════════════════════════════════
    //  AUDIO HELPERS
    // ══════════════════════════════════════════════════════════
    function ensureAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch { audioCtx = null; }
        }
        return audioCtx;
    }

    function tone(freq, dur, type, vol, when) {
        const ac = ensureAudio();
        if (!ac) return;
        try {
            const t = when || ac.currentTime;
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = type || 'square';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(vol || 0.10, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.1));
            o.connect(g); g.connect(ac.destination);
            o.start(t); o.stop(t + (dur || 0.1));
        } catch { /* swallow */ }
    }

    function noise(dur, vol) {
        const ac = ensureAudio();
        if (!ac) return;
        try {
            const t = ac.currentTime;
            const bufferSize = ac.sampleRate * dur;
            const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
            const src = ac.createBufferSource();
            src.buffer = buffer;
            const g = ac.createGain();
            g.gain.setValueAtTime(vol || 0.05, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            const filt = ac.createBiquadFilter();
            filt.type = 'lowpass'; filt.frequency.value = 300;
            src.connect(filt); filt.connect(g); g.connect(ac.destination);
            src.start(t); src.stop(t + dur);
        } catch { /* swallow */ }
    }

    function playBallClick()    { tone(1200, 0.04, 'sine', 0.12); tone(800, 0.03, 'triangle', 0.06); }
    function playCueStrike()    { tone(900, 0.06, 'sine', 0.15); tone(1400, 0.03, 'triangle', 0.08); }
    function playPocketThud()   { tone(120, 0.15, 'sine', 0.12); noise(0.12, 0.06); }
    function playCushionBounce(){ tone(400, 0.05, 'triangle', 0.08); noise(0.04, 0.04); }
    function playWin() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'sine', 0.12, t + i * 0.12));
    }
    function playLose() {
        const ac = ensureAudio(); if (!ac) return;
        const t = ac.currentTime;
        tone(330, 0.2, 'sawtooth', 0.08, t);
        tone(260, 0.3, 'sawtooth', 0.08, t + 0.18);
    }

    // ══════════════════════════════════════════════════════════
    //  PARTICLE SYSTEM (enhanced with sprite particles)
    // ══════════════════════════════════════════════════════════
    function spawnBurst(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 3.5 + 1;
            particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 1.0,
                decay: Math.random() * 0.03 + 0.015,
                r: Math.random() * 3 + 1.5,
                color: color || '#FFD700',
            });
        }
    }

    function spawnSpriteParticles(x, y, count, type) {
        const debrisNames = type === 'wood'
            ? ['debrisWood1', 'debrisWood2', 'debrisWood3']
            : type === 'glass'
            ? ['debrisGlass1', 'debrisGlass2']
            : ['debrisStone1', 'debrisStone2'];

        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 4 + 1.5;
            spriteParticles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s - 1.5,
                life: 1.0,
                decay: Math.random() * 0.02 + 0.012,
                size: Math.random() * 12 + 6,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.2,
                sprite: debrisNames[Math.floor(Math.random() * debrisNames.length)],
            });
        }
    }

    function spawnStarEffect(x, y, type) {
        const starName = type === 'gold' ? 'starGold' : type === 'silver' ? 'starSilver'
            : type === 'diamond' ? 'starDiamond' : 'starBronze';
        starEffects.push({
            x, y, startY: y,
            life: 1.0,
            decay: 0.015,
            size: 24,
            sprite: starName,
            vy: -1.2,
            scale: 0,
        });
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x  += p.vx;
            p.y  += p.vy;
            p.vy += 0.03;
            p.vx *= 0.97;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = spriteParticles.length - 1; i >= 0; i--) {
            const p = spriteParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.06;
            p.vx *= 0.96;
            p.rotation += p.rotSpeed;
            p.life -= p.decay;
            if (p.life <= 0) spriteParticles.splice(i, 1);
        }
        for (let i = starEffects.length - 1; i >= 0; i--) {
            const s = starEffects[i];
            s.y += s.vy;
            s.life -= s.decay;
            s.scale = Math.min(1, s.scale + 0.08);
            if (s.life <= 0) starEffects.splice(i, 1);
        }
    }

    function drawParticles() {
        // Simple circle particles
        for (const p of particles) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Sprite-based debris particles
        for (const p of spriteParticles) {
            const img = spr(p.sprite);
            if (!img) continue;
            ctx.save();
            ctx.globalAlpha = p.life * 0.9;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.drawImage(img, -p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        // Star effects
        for (const s of starEffects) {
            const img = spr(s.sprite);
            if (!img) continue;
            ctx.save();
            ctx.globalAlpha = s.life;
            const sz = s.size * s.scale;
            ctx.drawImage(img, s.x - sz / 2, s.y - sz / 2, sz, sz);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    // ══════════════════════════════════════════════════════════
    //  MESSAGES
    // ══════════════════════════════════════════════════════════
    function addMessage(text, x, y, color) {
        messages.push({ text, x, y, life: 1.0, color: color || '#FFD700' });
    }

    function updateMessages() {
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            m.y -= 0.5;
            m.life -= 0.012;
            if (m.life <= 0) messages.splice(i, 1);
        }
    }

    function drawMessages() {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const m of messages) {
            ctx.globalAlpha = m.life;
            ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
            ctx.fillStyle = m.color;
            ctx.shadowColor = m.color;
            ctx.shadowBlur = 10;
            ctx.fillText(m.text, m.x, m.y);
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
    }

    // ══════════════════════════════════════════════════════════
    //  PRE-RENDERED BALL CACHE
    // ══════════════════════════════════════════════════════════
    function buildBallCanvas(num) {
        // Render at 4x resolution for crispness
        const sz = BALL_R * 8;
        const cen = sz / 2;
        const r = sz / 2 - 2;
        const c = document.createElement('canvas');
        c.width = sz; c.height = sz;
        const cx = c.getContext('2d');

        const color = num === 0 ? '#F5F5F0' : (BALL_COLORS[num] || '#888');
        const highlight = num === 0 ? '#FFFFFF' : (BALL_HIGHLIGHT[num] || '#CCC');
        const shadow = num === 0 ? '#C0C0B8' : (BALL_SHADOW[num] || '#333');
        const isStripe = num >= 9 && num <= 15;

        // (Shadows now drawn separately in drawAllBalls for proper offset)

        if (isStripe) {
            // WHITE BASE with rich gradient
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

            // Colored stripe BAND across center
            cx.save();
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.clip();

            const bandH = r * 1.1;
            const bandGrad = cx.createLinearGradient(cen - r, cen - bandH / 2, cen + r, cen + bandH / 2);
            bandGrad.addColorStop(0, shadow);
            bandGrad.addColorStop(0.15, color);
            bandGrad.addColorStop(0.35, highlight);
            bandGrad.addColorStop(0.5, color);
            bandGrad.addColorStop(0.65, highlight);
            bandGrad.addColorStop(0.85, color);
            bandGrad.addColorStop(1, shadow);
            cx.fillStyle = bandGrad;
            cx.fillRect(cen - r, cen - bandH / 2, r * 2, bandH);

            // Subtle edge darkening on stripe edges
            const edgeFade = cx.createLinearGradient(0, cen - bandH / 2, 0, cen + bandH / 2);
            edgeFade.addColorStop(0, 'rgba(0,0,0,0.2)');
            edgeFade.addColorStop(0.12, 'rgba(0,0,0,0)');
            edgeFade.addColorStop(0.88, 'rgba(0,0,0,0)');
            edgeFade.addColorStop(1, 'rgba(0,0,0,0.2)');
            cx.fillStyle = edgeFade;
            cx.fillRect(cen - r, cen - bandH / 2, r * 2, bandH);

            cx.restore();
        } else {
            // SOLID ball with rich multi-stop radial gradient
            const grad = cx.createRadialGradient(
                cen - r * 0.3, cen - r * 0.3, r * 0.05,
                cen + r * 0.05, cen + r * 0.05, r
            );
            if (num === 0) {
                grad.addColorStop(0, '#FFFFFF');
                grad.addColorStop(0.3, '#FCFCF8');
                grad.addColorStop(0.6, '#F0F0E8');
                grad.addColorStop(0.85, '#D8D8D0');
                grad.addColorStop(1, '#B8B8B0');
            } else {
                grad.addColorStop(0, highlight);
                grad.addColorStop(0.25, lightenColor(color, 15));
                grad.addColorStop(0.55, color);
                grad.addColorStop(0.8, darkenColor(color, 20));
                grad.addColorStop(1, shadow);
            }
            cx.fillStyle = grad;
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.fill();
        }

        // Subsurface / depth glow on colored balls
        if (num > 0 && num !== 8) {
            cx.save();
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.clip();
            const glowGrad = cx.createRadialGradient(
                cen + r * 0.15, cen + r * 0.2, 0,
                cen, cen, r
            );
            glowGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
            glowGrad.addColorStop(1, 'rgba(0,0,0,0.12)');
            cx.fillStyle = glowGrad;
            cx.beginPath();
            cx.arc(cen, cen, r, 0, Math.PI * 2);
            cx.fill();
            cx.restore();
        }

        // Number circle (all balls except cue)
        if (num > 0) {
            const ncr = r * 0.42;
            // White circle with subtle shadow
            cx.shadowColor = 'rgba(0,0,0,0.3)';
            cx.shadowBlur = 3;
            cx.fillStyle = '#FFFFFF';
            cx.beginPath();
            cx.arc(cen, cen, ncr, 0, Math.PI * 2);
            cx.fill();
            cx.shadowBlur = 0;

            // Inner white circle lighter edge
            const ncGrad = cx.createRadialGradient(cen - ncr * 0.2, cen - ncr * 0.2, 0, cen, cen, ncr);
            ncGrad.addColorStop(0, '#FFFFFF');
            ncGrad.addColorStop(0.7, '#F8F8F4');
            ncGrad.addColorStop(1, '#E8E8E0');
            cx.fillStyle = ncGrad;
            cx.beginPath();
            cx.arc(cen, cen, ncr - 0.5, 0, Math.PI * 2);
            cx.fill();

            // Number text
            cx.fillStyle = '#111111';
            cx.font = `bold ${r * 0.58}px "Segoe UI", system-ui, sans-serif`;
            cx.textAlign = 'center';
            cx.textBaseline = 'middle';
            cx.fillText(num.toString(), cen, cen + 1);
        }

        // PRIMARY specular highlight (large, soft)
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

        // SECONDARY specular dot (sharp, tiny)
        cx.fillStyle = 'rgba(255,255,255,0.85)';
        cx.beginPath();
        cx.arc(cen - r * 0.28, cen - r * 0.32, r * 0.1, 0, Math.PI * 2);
        cx.fill();

        // Rim light (bottom edge catch light)
        cx.save();
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.clip();
        const rimGrad = cx.createRadialGradient(
            cen + r * 0.1, cen + r * 0.5, r * 0.3,
            cen, cen, r
        );
        rimGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
        rimGrad.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = rimGrad;
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.fill();
        cx.restore();

        // Edge ring (subtle dark outline)
        cx.strokeStyle = 'rgba(0,0,0,0.18)';
        cx.lineWidth = 1.2;
        cx.beginPath();
        cx.arc(cen, cen, r, 0, Math.PI * 2);
        cx.stroke();

        return c;
    }

    function prebuildBallCanvases() {
        ballCanvasCache = {};
        for (let n = 0; n <= 15; n++) {
            ballCanvasCache[n] = buildBallCanvas(n);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  BALL SETUP
    // ══════════════════════════════════════════════════════════
    function rackBalls() {
        balls = [];
        cueBall = { x: TABLE_L + TABLE_W * 0.25, y: TABLE_T + TABLE_H / 2, vx: 0, vy: 0, num: 0, potted: false, rollAngle: 0 };
        balls.push(cueBall);

        const rackX = TABLE_L + TABLE_W * 0.72;
        const rackY = TABLE_T + TABLE_H / 2;
        const spacing = BALL_R * 2.05;

        const solids = [1, 2, 3, 4, 5, 6, 7];
        const stripes = [9, 10, 11, 12, 13, 14, 15];
        for (let i = solids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [solids[i], solids[j]] = [solids[j], solids[i]];
        }
        for (let i = stripes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [stripes[i], stripes[j]] = [stripes[j], stripes[i]];
        }

        const rackOrder = [];
        rackOrder.push(solids.pop());
        rackOrder.push(stripes.pop());
        rackOrder.push(solids.pop());
        rackOrder.push(solids.pop());
        rackOrder.push(8);
        rackOrder.push(stripes.pop());
        rackOrder.push(stripes.pop());
        rackOrder.push(solids.pop());
        rackOrder.push(stripes.pop());
        rackOrder.push(solids.pop());
        rackOrder.push(solids.pop());
        rackOrder.push(stripes.pop());
        rackOrder.push(solids.pop());
        rackOrder.push(stripes.pop());
        rackOrder.push(stripes.pop());

        let idx = 0;
        for (let row = 0; row < 5; row++) {
            const count = row + 1;
            const startY = rackY - (count - 1) * spacing * 0.5;
            for (let col = 0; col < count; col++) {
                const bx = rackX + row * spacing * Math.cos(Math.PI / 6);
                const by = startY + col * spacing;
                const num = rackOrder[idx++];
                balls.push({ x: bx, y: by, vx: 0, vy: 0, num, potted: false, rollAngle: 0 });
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  PHYSICS
    // ══════════════════════════════════════════════════════════
    function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }
    function ballSpeed(b) { return Math.sqrt(b.vx ** 2 + b.vy ** 2); }

    function anyBallMoving() {
        for (const b of balls) {
            if (!b.potted && ballSpeed(b) > MIN_SPEED) return true;
        }
        return false;
    }

    function updatePhysics() {
        const activeBalls = balls.filter(b => !b.potted);

        // Move balls & apply rolling animation
        for (const b of activeBalls) {
            b.x += b.vx;
            b.y += b.vy;

            // Rolling angle for number rotation effect
            const spd = ballSpeed(b);
            if (spd > MIN_SPEED) {
                const moveAngle = Math.atan2(b.vy, b.vx);
                b.rollAngle += spd * 0.03;
                b.vx *= FRICTION;
                b.vy *= FRICTION;
                if (spd < 1.0) {
                    b.vx *= ROLL_FRICTION;
                    b.vy *= ROLL_FRICTION;
                }
            } else {
                b.vx = 0;
                b.vy = 0;
            }
        }

        // Ball-ball collisions
        for (let i = 0; i < activeBalls.length; i++) {
            for (let j = i + 1; j < activeBalls.length; j++) {
                const a = activeBalls[i];
                const b = activeBalls[j];
                const d = dist(a, b);
                const minDist = BALL_R * 2;

                if (d < minDist && d > 0.01) {
                    const nx = (b.x - a.x) / d;
                    const ny = (b.y - a.y) / d;
                    const overlap = minDist - d;
                    a.x -= nx * overlap * 0.5;
                    a.y -= ny * overlap * 0.5;
                    b.x += nx * overlap * 0.5;
                    b.y += ny * overlap * 0.5;

                    const dvx = a.vx - b.vx;
                    const dvy = a.vy - b.vy;
                    const dvDotN = dvx * nx + dvy * ny;

                    if (dvDotN > 0) {
                        const impulse = dvDotN * COR;
                        a.vx -= impulse * nx;
                        a.vy -= impulse * ny;
                        b.vx += impulse * nx;
                        b.vy += impulse * ny;

                        const hitSpeed = Math.abs(dvDotN);
                        if (hitSpeed > 0.5) playBallClick();

                        const cx = (a.x + b.x) / 2;
                        const cy = (a.y + b.y) / 2;
                        if (hitSpeed > 2) {
                            spawnBurst(cx, cy, 5, '#FFF');
                            spawnSpriteParticles(cx, cy, 2, 'glass');
                        }
                        if (hitSpeed > 6) {
                            spawnSpriteParticles(cx, cy, 3, 'stone');
                        }
                    }
                }
            }
        }

        // Cushion collisions
        for (const b of activeBalls) {
            let bounced = false;
            if (b.x - BALL_R < TABLE_L) { b.x = TABLE_L + BALL_R; b.vx = Math.abs(b.vx) * COR; bounced = true; }
            if (b.x + BALL_R > TABLE_R) { b.x = TABLE_R - BALL_R; b.vx = -Math.abs(b.vx) * COR; bounced = true; }
            if (b.y - BALL_R < TABLE_T) { b.y = TABLE_T + BALL_R; b.vy = Math.abs(b.vy) * COR; bounced = true; }
            if (b.y + BALL_R > TABLE_B) { b.y = TABLE_B - BALL_R; b.vy = -Math.abs(b.vy) * COR; bounced = true; }

            if (bounced) {
                const spd = ballSpeed(b);
                if (spd > 0.8) playCushionBounce();
                if (spd > 3) spawnSpriteParticles(b.x, b.y, 2, 'wood');
            }
        }

        // Pocket detection
        for (const b of activeBalls) {
            for (const p of POCKETS) {
                const pd = Math.sqrt((b.x - p.x) ** 2 + (b.y - p.y) ** 2);
                const isCorner = (p.y === POCKETS[0].y || p.y === POCKETS[3].y) && (p.x !== POCKETS[1].x);
                const pRad = isCorner ? POCKET_R + 3 : POCKET_R;
                if (pd < pRad) { potBall(b); break; }
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  BALL POTTING LOGIC
    // ══════════════════════════════════════════════════════════
    function potBall(b) {
        b.potted = true;
        b.vx = 0; b.vy = 0;
        playPocketThud();
        spawnBurst(b.x, b.y, 18, BALL_COLORS[b.num] || '#FFF');
        spawnSpriteParticles(b.x, b.y, 4, 'glass');

        if (b.num === 0) {
            turnFoul = true;
            addMessage('SCRATCH!', b.x, b.y, '#F43F5E');
            return;
        }

        totalPotted++;

        // Star effect on pot
        if (b.num === 8) {
            spawnStarEffect(b.x, b.y, 'diamond');
        } else if (b.num <= 7) {
            spawnStarEffect(b.x, b.y, 'gold');
        } else {
            spawnStarEffect(b.x, b.y, 'silver');
        }

        if (b.num === 8) { handle8BallPotted(); return; }

        const isSolid = b.num >= 1 && b.num <= 7;
        const isStripe = b.num >= 9 && b.num <= 15;

        if (playerType[currentPlayer] === -1) {
            if (isSolid) {
                playerType[currentPlayer] = 0;
                playerType[1 - currentPlayer] = 1;
                addMessage(currentPlayer === 0 ? 'You: Solids!' : 'AI: Solids!', GAME_W / 2, GAME_H / 2 - 20, '#FFD700');
            } else if (isStripe) {
                playerType[currentPlayer] = 1;
                playerType[1 - currentPlayer] = 0;
                addMessage(currentPlayer === 0 ? 'You: Stripes!' : 'AI: Stripes!', GAME_W / 2, GAME_H / 2 - 20, '#FFD700');
            }
        }

        playerPotted[currentPlayer].push(b.num);
        firstPotThisTurn = true;

        const myType = playerType[currentPlayer];
        const isMyBall = (myType === 0 && isSolid) || (myType === 1 && isStripe);

        if (isMyBall) {
            score += 100;
            addMessage('+100', b.x, b.y - 15, '#34D399');
        } else {
            if (myType !== -1) {
                turnFoul = true;
                addMessage('Wrong ball!', b.x, b.y - 15, '#F43F5E');
            }
        }
    }

    function handle8BallPotted() {
        const cp = currentPlayer;
        const myType = playerType[cp];

        let allPotted = true;
        if (myType === -1) {
            allPotted = false;
        } else {
            const range = myType === 0 ? [1, 7] : [9, 15];
            for (let n = range[0]; n <= range[1]; n++) {
                const ball = balls.find(b => b.num === n);
                if (ball && !ball.potted) { allPotted = false; break; }
            }
        }

        if (allPotted && !turnFoul) {
            if (cp === 0) {
                gamesWon[0]++;
                addMessage('YOU WIN!', GAME_W / 2, GAME_H / 2, '#34D399');
                playWin();
                score += 500;
                for (let i = 0; i < 5; i++) spawnStarEffect(GAME_W / 2 - 60 + i * 30, GAME_H / 2 - 40, 'gold');
            } else {
                addMessage('AI WINS!', GAME_W / 2, GAME_H / 2, '#F43F5E');
                playLose();
            }
        } else {
            if (cp === 0) {
                addMessage('8-BALL FOUL - YOU LOSE!', GAME_W / 2, GAME_H / 2, '#F43F5E');
                playLose();
                gamesWon[1]++;
            } else {
                addMessage('AI POTS 8 EARLY - YOU WIN!', GAME_W / 2, GAME_H / 2, '#34D399');
                playWin();
                gamesWon[0]++;
                score += 500;
            }
        }

        spawnBurst(GAME_W / 2, GAME_H / 2, 50, '#FFD700');
        spawnSpriteParticles(GAME_W / 2, GAME_H / 2, 8, 'glass');
        state = ST_OVER;
        gameActive = false;

        setTimeout(() => {
            if (onGameOver) {
                onGameOver({
                    score,
                    level: gamesWon[0],
                    duration: Math.floor((Date.now() - startTime) / 1000),
                    totalPopped: totalPotted,
                    maxCombo: gamesWon[0]
                });
            }
        }, 2000);
    }

    // ══════════════════════════════════════════════════════════
    //  TURN MANAGEMENT
    // ══════════════════════════════════════════════════════════
    function endTurn() {
        if (turnFoul) resetCueBall();

        const myType = playerType[currentPlayer];
        let pottedOwnBall = false;
        if (firstPotThisTurn && myType !== -1) {
            for (const num of playerPotted[currentPlayer]) {
                if (myType === 0 && num >= 1 && num <= 7) pottedOwnBall = true;
                if (myType === 1 && num >= 9 && num <= 15) pottedOwnBall = true;
            }
        }

        if (turnFoul || !pottedOwnBall) currentPlayer = 1 - currentPlayer;

        turnFoul = false;
        firstPotThisTurn = false;
        playerPotted[0] = [];
        playerPotted[1] = [];

        if (state === ST_OVER) return;

        if (currentPlayer === 0) {
            state = ST_AIMING;
        } else {
            state = ST_AI_THINK;
            aiTimer = Date.now() + 800 + Math.random() * 600;
        }
    }

    function resetCueBall() {
        cueBall.potted = false;
        cueBall.x = TABLE_L + TABLE_W * 0.25;
        cueBall.y = TABLE_T + TABLE_H / 2;
        cueBall.vx = 0; cueBall.vy = 0;

        let overlap = true, attempts = 0;
        while (overlap && attempts < 50) {
            overlap = false;
            for (const b of balls) {
                if (b === cueBall || b.potted) continue;
                if (dist(cueBall, b) < BALL_R * 2.5) {
                    cueBall.y += BALL_R * 2;
                    if (cueBall.y > TABLE_B - BALL_R * 2) {
                        cueBall.y = TABLE_T + BALL_R * 2;
                        cueBall.x += BALL_R * 3;
                    }
                    overlap = true; break;
                }
            }
            attempts++;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  AI LOGIC
    // ══════════════════════════════════════════════════════════
    function aiThink() {
        let bestScore = -Infinity;
        let bestAngle = 0;
        let bestPower = 8;

        const targetBalls = balls.filter(b => {
            if (b.potted || b.num === 0) return false;
            if (playerType[1] === -1) return b.num !== 8;
            if (playerType[1] === 0) return b.num >= 1 && b.num <= 7;
            return b.num >= 9 && b.num <= 15;
        });

        let shouldTarget8 = false;
        if (playerType[1] !== -1) {
            const range = playerType[1] === 0 ? [1, 7] : [9, 15];
            let allDone = true;
            for (let n = range[0]; n <= range[1]; n++) {
                const ball = balls.find(b => b.num === n);
                if (ball && !ball.potted) { allDone = false; break; }
            }
            if (allDone) shouldTarget8 = true;
        }

        const targets = shouldTarget8 ? balls.filter(b => b.num === 8 && !b.potted) : targetBalls;

        for (const target of targets) {
            for (const pocket of POCKETS) {
                const toPocketAngle = Math.atan2(pocket.y - target.y, pocket.x - target.x);
                const aimX = target.x - Math.cos(toPocketAngle) * BALL_R * 2;
                const aimY = target.y - Math.sin(toPocketAngle) * BALL_R * 2;
                const angle = Math.atan2(aimY - cueBall.y, aimX - cueBall.x);
                const distToTarget = dist(cueBall, target);

                let shotScore = 0;
                shotScore += (400 - Math.min(distToTarget, 400)) / 400 * 30;
                const distToPocket = dist(target, pocket);
                shotScore += (300 - Math.min(distToPocket, 300)) / 300 * 50;

                let pathClear = true;
                for (const ob of balls) {
                    if (ob.potted || ob === cueBall || ob === target) continue;
                    const dx = aimX - cueBall.x;
                    const dy = aimY - cueBall.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    if (len < 1) continue;
                    const t = Math.max(0, Math.min(1, ((ob.x - cueBall.x) * dx + (ob.y - cueBall.y) * dy) / (len * len)));
                    const closestX = cueBall.x + t * dx;
                    const closestY = cueBall.y + t * dy;
                    const obDist = Math.sqrt((ob.x - closestX) ** 2 + (ob.y - closestY) ** 2);
                    if (obDist < BALL_R * 2.5) { pathClear = false; break; }
                }

                if (pathClear) shotScore += 30; else shotScore -= 20;
                shotScore += Math.random() * 15;

                if (shotScore > bestScore) {
                    bestScore = shotScore;
                    bestAngle = angle;
                    bestPower = Math.min(MAX_POWER, 5 + distToTarget * 0.03);
                }
            }
        }

        if (bestScore <= 0 && targets.length > 0) {
            const t = targets[Math.floor(Math.random() * targets.length)];
            bestAngle = Math.atan2(t.y - cueBall.y, t.x - cueBall.x);
            bestPower = 6 + Math.random() * 5;
        }

        bestAngle += (Math.random() - 0.5) * 0.08;
        bestPower *= 0.85 + Math.random() * 0.3;

        aiShotAngle = bestAngle;
        aiShotPower = Math.min(MAX_POWER, Math.max(3, bestPower));
    }

    function executeAIShot() {
        cueBall.vx = Math.cos(aiShotAngle) * aiShotPower;
        cueBall.vy = Math.sin(aiShotAngle) * aiShotPower;
        playCueStrike();
        spawnBurst(cueBall.x, cueBall.y, 10, '#FFF');
        if (aiShotPower > 12) spawnSpriteParticles(cueBall.x, cueBall.y, 3, 'stone');
        state = ST_ROLLING;
    }

    function shootCueBall() {
        const power = Math.min(aimPower, MAX_POWER);
        cueBall.vx = Math.cos(aimAngle) * power;
        cueBall.vy = Math.sin(aimAngle) * power;
        playCueStrike();
        spawnBurst(cueBall.x, cueBall.y, 10, '#FFF');
        if (power > 12) spawnSpriteParticles(cueBall.x, cueBall.y, 3, 'stone');
        state = ST_ROLLING;
    }

    // ══════════════════════════════════════════════════════════
    //  DRAWING — TABLE with Kenney Sprites
    // ══════════════════════════════════════════════════════════
    function drawTable() {
        // ── POOL HALL BACKGROUND (dark wood paneling) ──
        const bgGrad = ctx.createLinearGradient(0, 0, 0, GAME_H);
        bgGrad.addColorStop(0, '#0D0806');
        bgGrad.addColorStop(0.3, '#1A110A');
        bgGrad.addColorStop(0.5, '#1E140C');
        bgGrad.addColorStop(0.7, '#1A110A');
        bgGrad.addColorStop(1, '#0D0806');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Wood paneling lines (vertical slats)
        ctx.strokeStyle = 'rgba(60,35,15,0.35)';
        ctx.lineWidth = 1;
        for (let wx = 0; wx < GAME_W; wx += 32) {
            ctx.beginPath();
            ctx.moveTo(wx, 0);
            ctx.lineTo(wx, GAME_H);
            ctx.stroke();
        }
        // Horizontal grain on paneling
        ctx.strokeStyle = 'rgba(80,50,20,0.12)';
        for (let wy = 0; wy < GAME_H; wy += 8 + Math.sin(wy) * 3) {
            ctx.beginPath();
            ctx.moveTo(0, wy);
            ctx.lineTo(GAME_W, wy);
            ctx.stroke();
        }

        // ── TABLE DROP SHADOW (lifts table off background) ──
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 25;
        ctx.shadowOffsetX = 6;
        ctx.shadowOffsetY = 6;
        ctx.fillStyle = '#2A1808';
        ctx.fillRect(-2, -2, GAME_W + 4, GAME_H + 4);
        ctx.restore();

        // ── OUTER TABLE FRAME ──
        ctx.fillStyle = '#1A0E08';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // ── THICK WOOD RAILS with manual grain ──
        // Base wood color for all rails
        const railColors = ['#6B3A1E', '#5C3018', '#7A4422', '#6B3A1E'];

        // TOP RAIL
        let rGrad = ctx.createLinearGradient(0, 0, 0, RAIL);
        rGrad.addColorStop(0, '#8B6B40');   // lighter bevel top
        rGrad.addColorStop(0.08, '#7A5428');
        rGrad.addColorStop(0.3, '#6B3A1E');
        rGrad.addColorStop(0.7, '#5C3018');
        rGrad.addColorStop(0.92, '#4A2510');
        rGrad.addColorStop(1, '#3A1A0A');   // darker bevel bottom
        ctx.fillStyle = rGrad;
        ctx.fillRect(0, 0, GAME_W, RAIL);

        // BOTTOM RAIL
        rGrad = ctx.createLinearGradient(0, GAME_H - RAIL, 0, GAME_H);
        rGrad.addColorStop(0, '#8B6B40');
        rGrad.addColorStop(0.08, '#7A5428');
        rGrad.addColorStop(0.3, '#6B3A1E');
        rGrad.addColorStop(0.7, '#5C3018');
        rGrad.addColorStop(0.92, '#4A2510');
        rGrad.addColorStop(1, '#3A1A0A');
        ctx.fillStyle = rGrad;
        ctx.fillRect(0, GAME_H - RAIL, GAME_W, RAIL);

        // LEFT RAIL
        rGrad = ctx.createLinearGradient(0, 0, RAIL, 0);
        rGrad.addColorStop(0, '#8B6B40');
        rGrad.addColorStop(0.08, '#7A5428');
        rGrad.addColorStop(0.3, '#6B3A1E');
        rGrad.addColorStop(0.7, '#5C3018');
        rGrad.addColorStop(0.92, '#4A2510');
        rGrad.addColorStop(1, '#3A1A0A');
        ctx.fillStyle = rGrad;
        ctx.fillRect(0, RAIL, RAIL, GAME_H - RAIL * 2);

        // RIGHT RAIL
        rGrad = ctx.createLinearGradient(GAME_W - RAIL, 0, GAME_W, 0);
        rGrad.addColorStop(0, '#3A1A0A');
        rGrad.addColorStop(0.08, '#4A2510');
        rGrad.addColorStop(0.3, '#5C3018');
        rGrad.addColorStop(0.7, '#6B3A1E');
        rGrad.addColorStop(0.92, '#7A5428');
        rGrad.addColorStop(1, '#8B6B40');
        ctx.fillStyle = rGrad;
        ctx.fillRect(GAME_W - RAIL, RAIL, RAIL, GAME_H - RAIL * 2);

        // ── WOOD GRAIN LINES on rails ──
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = '#2A1508';
        ctx.lineWidth = 0.8;
        // Horizontal grain on top/bottom rails
        for (let gy = 3; gy < RAIL - 2; gy += 3 + Math.sin(gy * 1.7) * 2) {
            ctx.beginPath();
            ctx.moveTo(RAIL, gy);
            ctx.bezierCurveTo(GAME_W * 0.25, gy + Math.sin(gy * 0.5) * 1.5, GAME_W * 0.75, gy - Math.sin(gy * 0.3) * 1.5, GAME_W - RAIL, gy);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(RAIL, GAME_H - RAIL + gy);
            ctx.bezierCurveTo(GAME_W * 0.25, GAME_H - RAIL + gy + Math.sin(gy * 0.5) * 1.5, GAME_W * 0.75, GAME_H - RAIL + gy - Math.sin(gy * 0.3) * 1.5, GAME_W - RAIL, GAME_H - RAIL + gy);
            ctx.stroke();
        }
        // Vertical grain on left/right rails
        for (let gx = 3; gx < RAIL - 2; gx += 3 + Math.sin(gx * 1.7) * 2) {
            ctx.beginPath();
            ctx.moveTo(gx, RAIL);
            ctx.bezierCurveTo(gx + Math.sin(gx * 0.5) * 1.5, GAME_H * 0.25, gx - Math.sin(gx * 0.3) * 1.5, GAME_H * 0.75, gx, GAME_H - RAIL);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(GAME_W - RAIL + gx, RAIL);
            ctx.bezierCurveTo(GAME_W - RAIL + gx + Math.sin(gx * 0.5) * 1.5, GAME_H * 0.25, GAME_W - RAIL + gx - Math.sin(gx * 0.3) * 1.5, GAME_H * 0.75, GAME_W - RAIL + gx, GAME_H - RAIL);
            ctx.stroke();
        }
        ctx.restore();

        // ── RAIL BEVEL (inner light edge, outer dark edge) ──
        // Inner bevel (light)
        ctx.fillStyle = '#A07840';
        ctx.fillRect(RAIL - 4, RAIL - 4, TABLE_W + 8, 3);
        ctx.fillRect(RAIL - 4, RAIL - 4, 3, TABLE_H + 8);
        // Outer bevel (dark)
        ctx.fillStyle = '#2A1508';
        ctx.fillRect(RAIL - 4, TABLE_B + 1, TABLE_W + 8, 3);
        ctx.fillRect(TABLE_R + 1, RAIL - 4, 3, TABLE_H + 8);

        // Top edge highlight
        ctx.fillStyle = 'rgba(200,170,120,0.25)';
        ctx.fillRect(RAIL, 1, TABLE_W, 2);
        ctx.fillRect(1, RAIL, 2, TABLE_H);
        // Bottom edge shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(RAIL, GAME_H - 3, TABLE_W, 2);
        ctx.fillRect(GAME_W - 3, RAIL, 2, TABLE_H);

        // ── DIAMOND SIGHTS / MARKERS on rails ──
        ctx.save();
        const diamondSize = 4;
        // Top rail diamonds (3 markers)
        for (let di = 1; di <= 3; di++) {
            const dx = RAIL + TABLE_W * (di / 4);
            const dy = RAIL / 2;
            ctx.fillStyle = '#C8A860';
            ctx.beginPath();
            ctx.moveTo(dx, dy - diamondSize);
            ctx.lineTo(dx + diamondSize * 0.6, dy);
            ctx.lineTo(dx, dy + diamondSize);
            ctx.lineTo(dx - diamondSize * 0.6, dy);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#E8D090';
            ctx.beginPath();
            ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        // Bottom rail diamonds (3 markers)
        for (let di = 1; di <= 3; di++) {
            const dx = RAIL + TABLE_W * (di / 4);
            const dy = GAME_H - RAIL / 2;
            ctx.fillStyle = '#C8A860';
            ctx.beginPath();
            ctx.moveTo(dx, dy - diamondSize);
            ctx.lineTo(dx + diamondSize * 0.6, dy);
            ctx.lineTo(dx, dy + diamondSize);
            ctx.lineTo(dx - diamondSize * 0.6, dy);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#E8D090';
            ctx.beginPath();
            ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        // Left rail diamond (1 marker)
        {
            const dx = RAIL / 2;
            const dy = RAIL + TABLE_H / 2;
            ctx.fillStyle = '#C8A860';
            ctx.beginPath();
            ctx.moveTo(dx, dy - diamondSize);
            ctx.lineTo(dx + diamondSize * 0.6, dy);
            ctx.lineTo(dx, dy + diamondSize);
            ctx.lineTo(dx - diamondSize * 0.6, dy);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#E8D090';
            ctx.beginPath();
            ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        // Right rail diamond (1 marker)
        {
            const dx = GAME_W - RAIL / 2;
            const dy = RAIL + TABLE_H / 2;
            ctx.fillStyle = '#C8A860';
            ctx.beginPath();
            ctx.moveTo(dx, dy - diamondSize);
            ctx.lineTo(dx + diamondSize * 0.6, dy);
            ctx.lineTo(dx, dy + diamondSize);
            ctx.lineTo(dx - diamondSize * 0.6, dy);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#E8D090';
            ctx.beginPath();
            ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Rail decorative bolts using Kenney metal bolt sprites
        const boltImg = spr('metalBolt');
        if (boltImg) {
            const boltPositions = [
                [RAIL + TABLE_W * 0.15, 10], [RAIL + TABLE_W * 0.35, 10],
                [RAIL + TABLE_W * 0.65, 10], [RAIL + TABLE_W * 0.85, 10],
                [RAIL + TABLE_W * 0.15, GAME_H - 18], [RAIL + TABLE_W * 0.35, GAME_H - 18],
                [RAIL + TABLE_W * 0.65, GAME_H - 18], [RAIL + TABLE_W * 0.85, GAME_H - 18],
                [8, RAIL + TABLE_H * 0.25], [8, RAIL + TABLE_H * 0.75],
                [GAME_W - 18, RAIL + TABLE_H * 0.25], [GAME_W - 18, RAIL + TABLE_H * 0.75],
            ];
            for (const [bx, by] of boltPositions) {
                ctx.drawImage(boltImg, bx, by, 10, 10);
            }
        }

        // ── FELT (playing surface) — deep billiard green ──
        ctx.fillStyle = '#1B5E20';
        ctx.fillRect(TABLE_L, TABLE_T, TABLE_W, TABLE_H);

        // ── FELT WOVEN TEXTURE (diagonal cross-hatch) ──
        ctx.save();
        ctx.beginPath();
        ctx.rect(TABLE_L, TABLE_T, TABLE_W, TABLE_H);
        ctx.clip();

        // Diagonal lines NW-SE
        ctx.strokeStyle = 'rgba(0,40,0,0.12)';
        ctx.lineWidth = 0.7;
        for (let d = -TABLE_H; d < TABLE_W + TABLE_H; d += 6) {
            ctx.beginPath();
            ctx.moveTo(TABLE_L + d, TABLE_T);
            ctx.lineTo(TABLE_L + d - TABLE_H, TABLE_B);
            ctx.stroke();
        }
        // Diagonal lines NE-SW
        ctx.strokeStyle = 'rgba(30,80,30,0.08)';
        for (let d = -TABLE_H; d < TABLE_W + TABLE_H; d += 6) {
            ctx.beginPath();
            ctx.moveTo(TABLE_L + d, TABLE_T);
            ctx.lineTo(TABLE_L + d + TABLE_H, TABLE_B);
            ctx.stroke();
        }

        // Noise / grain effect (scattered dark/light dots)
        ctx.globalAlpha = 1;
        for (let i = 0; i < 400; i++) {
            const fx = TABLE_L + ((i * 137.5 + 7) % TABLE_W);
            const fy = TABLE_T + ((i * 89.3 + 23) % TABLE_H);
            const isDark = (i % 3) !== 0;
            ctx.fillStyle = isDark ? 'rgba(0,20,0,0.06)' : 'rgba(40,100,40,0.05)';
            ctx.beginPath();
            ctx.arc(fx, fy, 0.5 + (i % 3) * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // ── AMBIENT OVERHEAD LIGHT (pool hall lamp cone) ──
        ctx.save();
        ctx.beginPath();
        ctx.rect(TABLE_L, TABLE_T, TABLE_W, TABLE_H);
        ctx.clip();
        const lightGrad = ctx.createRadialGradient(
            GAME_W / 2, GAME_H / 2, 20,
            GAME_W / 2, GAME_H / 2, TABLE_W * 0.55
        );
        lightGrad.addColorStop(0, 'rgba(255,240,200,0.10)');
        lightGrad.addColorStop(0.3, 'rgba(255,240,200,0.06)');
        lightGrad.addColorStop(0.6, 'rgba(0,0,0,0)');
        lightGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
        ctx.fillStyle = lightGrad;
        ctx.fillRect(TABLE_L, TABLE_T, TABLE_W, TABLE_H);
        ctx.restore();

        // ── Head string ──
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(TABLE_L + TABLE_W * 0.25, TABLE_T + 5);
        ctx.lineTo(TABLE_L + TABLE_W * 0.25, TABLE_B - 5);
        ctx.stroke();
        ctx.setLineDash([]);

        // Foot spot
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.arc(TABLE_L + TABLE_W * 0.72, TABLE_T + TABLE_H / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Center spot
        ctx.beginPath();
        ctx.arc(TABLE_L + TABLE_W * 0.5, TABLE_T + TABLE_H / 2, 2, 0, Math.PI * 2);
        ctx.fill();

        // ── GREEN CUSHION BUMPERS (inner edge) ──
        ctx.fillStyle = '#2E7D32';
        // Top cushion
        ctx.fillRect(TABLE_L + POCKET_R + 8, TABLE_T, TABLE_W / 2 - POCKET_R * 2 - 8, 3);
        ctx.fillRect(TABLE_L + TABLE_W / 2 + POCKET_R + 2, TABLE_T, TABLE_W / 2 - POCKET_R * 2 - 8, 3);
        // Bottom cushion
        ctx.fillRect(TABLE_L + POCKET_R + 8, TABLE_B - 3, TABLE_W / 2 - POCKET_R * 2 - 8, 3);
        ctx.fillRect(TABLE_L + TABLE_W / 2 + POCKET_R + 2, TABLE_B - 3, TABLE_W / 2 - POCKET_R * 2 - 8, 3);
        // Left cushion
        ctx.fillRect(TABLE_L, TABLE_T + POCKET_R + 8, 3, TABLE_H - POCKET_R * 2 - 16);
        // Right cushion
        ctx.fillRect(TABLE_R - 3, TABLE_T + POCKET_R + 8, 3, TABLE_H - POCKET_R * 2 - 16);

        // Cushion highlight
        ctx.fillStyle = 'rgba(100,200,100,0.15)';
        ctx.fillRect(TABLE_L + POCKET_R + 8, TABLE_T, TABLE_W / 2 - POCKET_R * 2 - 8, 1);
        ctx.fillRect(TABLE_L + TABLE_W / 2 + POCKET_R + 2, TABLE_T, TABLE_W / 2 - POCKET_R * 2 - 8, 1);
        ctx.fillRect(TABLE_L, TABLE_T + POCKET_R + 8, 1, TABLE_H - POCKET_R * 2 - 16);

        // Inner edge line
        ctx.strokeStyle = '#1A5C30';
        ctx.lineWidth = 1;
        ctx.strokeRect(TABLE_L, TABLE_T, TABLE_W, TABLE_H);
    }

    function drawPockets() {
        for (const p of POCKETS) {
            // ── LAYER 1: Outer dark ring (the pocket cut in the rail) ──
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#0A0604';
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R + 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Metal pocket surround
            const metalImg = spr('metalCircle');
            if (metalImg) {
                const pocketSize = (POCKET_R + 7) * 2;
                ctx.save();
                ctx.globalAlpha = 0.5;
                ctx.drawImage(metalImg, p.x - pocketSize / 2, p.y - pocketSize / 2, pocketSize, pocketSize);
                ctx.restore();
            }

            // ── LAYER 2: Middle dark ring ──
            const midGrad = ctx.createRadialGradient(p.x, p.y, POCKET_R * 0.1, p.x, p.y, POCKET_R + 4);
            midGrad.addColorStop(0, '#020202');
            midGrad.addColorStop(0.6, '#050404');
            midGrad.addColorStop(0.85, '#1A1008');
            midGrad.addColorStop(1, '#2A1A0C');
            ctx.fillStyle = midGrad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R + 4, 0, Math.PI * 2);
            ctx.fill();

            // ── LAYER 3: Center void (pure black with depth gradient) ──
            const voidGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, POCKET_R);
            voidGrad.addColorStop(0, '#000000');
            voidGrad.addColorStop(0.5, '#010101');
            voidGrad.addColorStop(0.85, '#040303');
            voidGrad.addColorStop(1, '#0A0806');
            ctx.fillStyle = voidGrad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R, 0, Math.PI * 2);
            ctx.fill();

            // Metal rim ring sprite overlay
            const ringImg = spr('metalRing');
            if (ringImg) {
                const ringSize = (POCKET_R + 5) * 2;
                ctx.save();
                ctx.globalAlpha = 0.45;
                ctx.drawImage(ringImg, p.x - ringSize / 2, p.y - ringSize / 2, ringSize, ringSize);
                ctx.restore();
            }

            // ── Bright rim highlight (top-left catch light) ──
            ctx.strokeStyle = 'rgba(160,130,80,0.3)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R + 3, Math.PI * 1.1, Math.PI * 1.8);
            ctx.stroke();

            // Dark rim (bottom-right shadow)
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, POCKET_R + 3, Math.PI * 0.1, Math.PI * 0.8);
            ctx.stroke();

            // Inner reflection (subtle gleam)
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(p.x - 2, p.y - 2, POCKET_R - 4, Math.PI * 1.1, Math.PI * 1.7);
            ctx.stroke();
        }
    }

    // ══════════════════════════════════════════════════════════
    //  DRAWING — INCREDIBLE BALLS
    // ══════════════════════════════════════════════════════════
    function drawBall(b) {
        if (b.potted) return;
        const { x, y, num, rollAngle } = b;
        const cachedCanvas = ballCanvasCache[num];
        if (!cachedCanvas) return;

        const drawSize = BALL_R * 2 + 1;

        // Render pre-cached ball with slight rotation for rolling feel
        ctx.save();
        ctx.translate(x, y);

        // Subtle rotation based on rolling (only the number rotates perceptibly)
        if (ballSpeed(b) > 0.3 && num > 0) {
            ctx.rotate(Math.sin(rollAngle) * 0.06);
        }

        ctx.drawImage(cachedCanvas, -drawSize / 2 - 0.5, -drawSize / 2 - 0.5, drawSize + 1, drawSize + 1);
        ctx.restore();
    }

    function drawAllBalls() {
        // Sort so cue ball drawn last (on top when overlapping)
        const sorted = [...balls].filter(b => !b.potted).sort((a, b) => {
            if (a.num === 0) return 1;
            if (b.num === 0) return -1;
            return a.num - b.num;
        });

        // ── BALL SHADOWS (drawn first, under all balls) ──
        for (const b of sorted) {
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath();
            ctx.ellipse(b.x + 3, b.y + 3, BALL_R * 0.95, BALL_R * 0.7, 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        for (const b of sorted) drawBall(b);
    }

    function drawCueStick(time) {
        if (cueBall.potted || state === ST_ROLLING || state === ST_AI_THINK || state === ST_OVER) return;

        const angle = aimAngle;
        let pullBack = 0;
        if (state === ST_POWER || state === ST_AIMING) pullBack = aimPower * 1.8;

        const stickLen = 180;
        const stickStart = BALL_R + 4 + pullBack;
        const stickEnd = stickStart + stickLen;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const tipX = cueBall.x - cos * stickStart;
        const tipY = cueBall.y - sin * stickStart;
        const buttX = cueBall.x - cos * stickEnd;
        const buttY = cueBall.y - sin * stickEnd;

        // Perpendicular direction for width
        const px = -sin;
        const py = cos;

        // ── CUE SHADOW ──
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tipX + 3, tipY + 3);
        ctx.lineTo(buttX + 3, buttY + 3);
        ctx.stroke();
        ctx.restore();

        // ── TAPERED CUE BODY (drawn as polygon for taper) ──
        const tipWidth = 2.2;    // narrow at tip
        const buttWidth = 5.0;   // wide at butt

        // Draw segments for smooth taper with gradient colors
        const segments = 12;
        for (let i = 0; i < segments; i++) {
            const t0 = i / segments;
            const t1 = (i + 1) / segments;
            const w0 = tipWidth + (buttWidth - tipWidth) * t0;
            const w1 = tipWidth + (buttWidth - tipWidth) * t1;

            const x0 = tipX + (buttX - tipX) * t0;
            const y0 = tipY + (buttY - tipY) * t0;
            const x1 = tipX + (buttX - tipX) * t1;
            const y1 = tipY + (buttY - tipY) * t1;

            // Color: light shaft -> dark butt (like maple to dark wrap)
            let r, g, b;
            if (t0 < 0.15) {
                // Ferrule zone (ivory white)
                r = 240; g = 235; b = 220;
            } else if (t0 < 0.55) {
                // Shaft (light maple)
                const p = (t0 - 0.15) / 0.4;
                r = Math.floor(245 - p * 40);
                g = Math.floor(220 - p * 50);
                b = Math.floor(170 - p * 60);
            } else {
                // Butt (dark wood with wrap)
                const p = (t0 - 0.55) / 0.45;
                r = Math.floor(140 - p * 60);
                g = Math.floor(90 - p * 40);
                b = Math.floor(50 - p * 30);
            }

            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.beginPath();
            ctx.moveTo(x0 + px * w0, y0 + py * w0);
            ctx.lineTo(x1 + px * w1, y1 + py * w1);
            ctx.lineTo(x1 - px * w1, y1 - py * w1);
            ctx.lineTo(x0 - px * w0, y0 - py * w0);
            ctx.closePath();
            ctx.fill();
        }

        // ── WOOD GRAIN LINES along cue ──
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = '#5A3A10';
        ctx.lineWidth = 0.5;
        for (let g = -2; g <= 2; g += 1.3) {
            ctx.beginPath();
            ctx.moveTo(tipX + px * g * 0.5, tipY + py * g * 0.5);
            ctx.lineTo(buttX + px * g * 1.2, buttY + py * g * 1.2);
            ctx.stroke();
        }
        ctx.restore();

        // ── Edge highlight (top edge of cue catches light) ──
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = 'rgba(255,245,220,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tipX + px * tipWidth * 0.8, tipY + py * tipWidth * 0.8);
        ctx.lineTo(buttX + px * buttWidth * 0.6, buttY + py * buttWidth * 0.6);
        ctx.stroke();
        ctx.restore();

        // ── WRAP BAND (dark section near butt) ──
        const wrapStart = 0.65;
        const wrapEnd = 0.72;
        const wx0 = tipX + (buttX - tipX) * wrapStart;
        const wy0 = tipY + (buttY - tipY) * wrapStart;
        const wx1 = tipX + (buttX - tipX) * wrapEnd;
        const wy1 = tipY + (buttY - tipY) * wrapEnd;
        const ww = tipWidth + (buttWidth - tipWidth) * wrapStart + 0.5;
        ctx.fillStyle = '#1A1A1A';
        ctx.beginPath();
        ctx.moveTo(wx0 + px * ww, wy0 + py * ww);
        ctx.lineTo(wx1 + px * ww, wy1 + py * ww);
        ctx.lineTo(wx1 - px * ww, wy1 - py * ww);
        ctx.lineTo(wx0 - px * ww, wy0 - py * ww);
        ctx.closePath();
        ctx.fill();

        // ── FERRULE (white/ivory band) ──
        const ferrDist = stickStart + 10;
        const ferrX = cueBall.x - cos * ferrDist;
        const ferrY = cueBall.y - sin * ferrDist;
        ctx.strokeStyle = '#F0EBE0';
        ctx.lineWidth = tipWidth * 2 + 1;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(ferrX, ferrY);
        ctx.stroke();

        // Ferrule edge ring
        ctx.strokeStyle = 'rgba(180,170,150,0.5)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(ferrX + px * (tipWidth + 0.8), ferrY + py * (tipWidth + 0.8));
        ctx.lineTo(ferrX - px * (tipWidth + 0.8), ferrY - py * (tipWidth + 0.8));
        ctx.stroke();

        // ── TIP (blue chalk) ──
        ctx.fillStyle = '#3A7BD5';
        ctx.beginPath();
        ctx.arc(tipX, tipY, 2.8, 0, Math.PI * 2);
        ctx.fill();
        // Chalk texture dots
        ctx.fillStyle = '#5A9BE5';
        ctx.beginPath();
        ctx.arc(tipX - 0.5, tipY - 0.8, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2A5BA5';
        ctx.beginPath();
        ctx.arc(tipX + 0.8, tipY + 0.3, 0.8, 0, Math.PI * 2);
        ctx.fill();

        // ── Power indicator glow at tip ──
        if (state === ST_POWER && aimPower > 2) {
            const glowAlpha = Math.min(0.5, aimPower / MAX_POWER * 0.6);
            ctx.save();
            ctx.globalAlpha = glowAlpha;
            ctx.shadowColor = '#FF6B35';
            ctx.shadowBlur = aimPower * 1.5;
            ctx.fillStyle = '#FF6B35';
            ctx.beginPath();
            ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function drawAimLine() {
        if (state !== ST_AIMING && state !== ST_POWER) return;
        if (cueBall.potted) return;

        const angle = aimAngle;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        let hitDist = AIM_LINE_LEN;
        let hitBall = null;

        for (const b of balls) {
            if (b.potted || b === cueBall) continue;
            const dx = b.x - cueBall.x;
            const dy = b.y - cueBall.y;
            const a2 = cos * cos + sin * sin;
            const b2 = 2 * (cos * (-dx) + sin * (-dy));
            const c2 = dx * dx + dy * dy - (BALL_R * 2) ** 2;
            const disc = b2 * b2 - 4 * a2 * c2;
            if (disc >= 0) {
                const t = (-b2 - Math.sqrt(disc)) / (2 * a2);
                if (t > 0 && t < hitDist) { hitDist = t; hitBall = b; }
            }
        }

        let wallDist = AIM_LINE_LEN;
        if (cos > 0) wallDist = Math.min(wallDist, (TABLE_R - BALL_R - cueBall.x) / cos);
        if (cos < 0) wallDist = Math.min(wallDist, (TABLE_L + BALL_R - cueBall.x) / cos);
        if (sin > 0) wallDist = Math.min(wallDist, (TABLE_B - BALL_R - cueBall.y) / sin);
        if (sin < 0) wallDist = Math.min(wallDist, (TABLE_T + BALL_R - cueBall.y) / sin);

        const effectiveDist = Math.min(hitDist, wallDist);

        // Dotted aim line with fade
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(cueBall.x + cos * (BALL_R + 2), cueBall.y + sin * (BALL_R + 2));
        ctx.lineTo(cueBall.x + cos * effectiveDist, cueBall.y + sin * effectiveDist);
        ctx.stroke();
        ctx.setLineDash([]);

        // Ghost ball at hit point (use glass sprite)
        if (hitBall && hitDist < wallDist) {
            const gx = cueBall.x + cos * hitDist;
            const gy = cueBall.y + sin * hitDist;

            const glassImg = spr('glassCircle');
            if (glassImg) {
                ctx.save();
                ctx.globalAlpha = 0.25;
                ctx.drawImage(glassImg, gx - BALL_R * 1.2, gy - BALL_R * 1.2, BALL_R * 2.4, BALL_R * 2.4);
                ctx.restore();
            } else {
                ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(gx, gy, BALL_R, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Predicted path
            const hitAngle = Math.atan2(hitBall.y - gy, hitBall.x - gx);
            ctx.strokeStyle = 'rgba(255,200,100,0.2)';
            ctx.setLineDash([3, 5]);
            ctx.beginPath();
            ctx.moveTo(hitBall.x, hitBall.y);
            ctx.lineTo(hitBall.x + Math.cos(hitAngle) * 50, hitBall.y + Math.sin(hitAngle) * 50);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Wall bounce prediction
        if (wallDist < hitDist && wallDist < AIM_LINE_LEN) {
            const wx = cueBall.x + cos * wallDist;
            const wy = cueBall.y + sin * wallDist;
            let rx = cos, ry = sin;
            if (wx <= TABLE_L + BALL_R + 1 || wx >= TABLE_R - BALL_R - 1) rx = -rx;
            if (wy <= TABLE_T + BALL_R + 1 || wy >= TABLE_B - BALL_R - 1) ry = -ry;
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.setLineDash([3, 5]);
            ctx.beginPath();
            ctx.moveTo(wx, wy);
            ctx.lineTo(wx + rx * 60, wy + ry * 60);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    function drawPowerMeter() {
        if (state !== ST_POWER && state !== ST_AIMING) return;

        const meterW = 120, meterH = 10;
        const meterX = GAME_W / 2 - meterW / 2;
        const meterY = GAME_H - 20;

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(meterX - 2, meterY - 2, meterW + 4, meterH + 4, 4);
        ctx.fill();

        const pct = aimPower / MAX_POWER;
        const grad = ctx.createLinearGradient(meterX, 0, meterX + meterW, 0);
        grad.addColorStop(0, '#34D399');
        grad.addColorStop(0.5, '#FBBF24');
        grad.addColorStop(1, '#F43F5E');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(meterX, meterY, meterW * pct, meterH, 3);
        ctx.fill();

        // Power explosive icon at high power
        if (pct > 0.7) {
            const expImg = spr('explosive1');
            if (expImg) {
                ctx.save();
                ctx.globalAlpha = (pct - 0.7) * 3;
                ctx.drawImage(expImg, meterX + meterW * pct - 6, meterY - 8, 16, 16);
                ctx.restore();
            }
        }

        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '10px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('POWER', GAME_W / 2, meterY + meterH + 3);
    }

    function drawHUD() {
        ctx.save();
        ctx.textBaseline = 'top';
        ctx.font = '12px "Segoe UI", system-ui, sans-serif';

        // Player info left
        ctx.textAlign = 'left';
        const pName = (player?.emoji || '') + ' ' + (player?.name || 'Player');
        const pType = playerType[0] === 0 ? ' (Solids)' : playerType[0] === 1 ? ' (Stripes)' : '';
        ctx.fillStyle = currentPlayer === 0 ? '#FFD700' : 'rgba(255,255,255,0.4)';
        ctx.fillText(pName.trim() + pType, 6, 4);

        // AI info right
        ctx.textAlign = 'right';
        const aiType = playerType[1] === 0 ? ' (Solids)' : playerType[1] === 1 ? ' (Stripes)' : '';
        ctx.fillStyle = currentPlayer === 1 ? '#FFD700' : 'rgba(255,255,255,0.4)';
        ctx.fillText('AI' + aiType, GAME_W - 6, 4);

        // Score with star icon
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        const starImg = spr('starGold');
        if (starImg) {
            ctx.drawImage(starImg, GAME_W / 2 - 34, 1, 12, 12);
        }
        ctx.fillText('Score: ' + score, GAME_W / 2 + 4, 4);

        // Turn indicator
        if (state !== ST_OVER && state !== ST_TITLE && state !== ST_LOADING) {
            const turnText = currentPlayer === 0 ? 'YOUR TURN' : 'AI THINKING...';
            ctx.fillStyle = currentPlayer === 0 ? '#34D399' : '#F59E0B';
            ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
            ctx.fillText(turnText, GAME_W / 2, GAME_H - 38);
        }

        drawPottedBalls();
        ctx.restore();
    }

    function drawPottedBalls() {
        let px = 8;
        const py = GAME_H - 14;

        for (const b of balls) {
            if (!b.potted || b.num === 0 || b.num > 7) continue;
            // Mini solid ball
            const miniCanvas = ballCanvasCache[b.num];
            if (miniCanvas) {
                ctx.drawImage(miniCanvas, px - 5, py - 5, 10, 10);
            } else {
                ctx.fillStyle = BALL_COLORS[b.num];
                ctx.beginPath();
                ctx.arc(px, py, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            px += 13;
        }

        let sx = GAME_W - 8;
        for (const b of balls) {
            if (!b.potted || b.num === 0 || b.num < 9) continue;
            const miniCanvas = ballCanvasCache[b.num];
            if (miniCanvas) {
                ctx.drawImage(miniCanvas, sx - 5, py - 5, 10, 10);
            } else {
                ctx.fillStyle = '#F5F5F0';
                ctx.beginPath();
                ctx.arc(sx, py, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            sx -= 13;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  SCREENS
    // ══════════════════════════════════════════════════════════
    function drawLoadingScreen() {
        ctx.fillStyle = '#1A1A2E';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 24px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('Loading Assets...', GAME_W / 2, GAME_H * 0.4);

        // Progress bar
        const pct = spritesTotal > 0 ? spritesLoaded / spritesTotal : 0;
        const barW = 200, barH = 12;
        const barX = GAME_W / 2 - barW / 2;
        const barY = GAME_H * 0.55;

        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 6);
        ctx.fill();

        const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, '#FFD700');
        grad.addColorStop(1, '#F97316');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * pct, barH, 6);
        ctx.fill();

        ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(`${spritesLoaded} / ${spritesTotal} sprites`, GAME_W / 2, barY + barH + 16);
    }

    function drawTitleScreen(time) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        // Decorative stars
        const starG = spr('starGold');
        const starS = spr('starSilver');
        if (starG) {
            ctx.save();
            ctx.globalAlpha = 0.3 + Math.sin(time * 0.002) * 0.15;
            ctx.drawImage(starG, GAME_W / 2 - 120, GAME_H * 0.25 - 12, 28, 28);
            ctx.drawImage(starG, GAME_W / 2 + 92, GAME_H * 0.25 - 12, 28, 28);
            ctx.restore();
        }
        if (starS) {
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.drawImage(starS, GAME_W / 2 - 150, GAME_H * 0.30, 20, 20);
            ctx.drawImage(starS, GAME_W / 2 + 130, GAME_H * 0.30, 20, 20);
            ctx.restore();
        }

        ctx.font = 'bold 40px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 20;
        ctx.fillText('8-BALL POOL', GAME_W / 2, GAME_H * 0.3);
        ctx.shadowBlur = 0;

        ctx.font = '16px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('Pot your balls, then the 8-ball to win', GAME_W / 2, GAME_H * 0.42);

        ctx.font = '13px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('Drag from cue ball to aim & shoot', GAME_W / 2, GAME_H * 0.54);
        ctx.fillText('Pull back = more power', GAME_W / 2, GAME_H * 0.60);

        // Rating stars at bottom
        const ratingY = GAME_H * 0.68;
        const starTypes = ['starBronze', 'starSilver', 'starGold', 'starDiamond', 'starGold'];
        for (let i = 0; i < 5; i++) {
            const si = spr(starTypes[i]);
            if (si) {
                ctx.save();
                ctx.globalAlpha = 0.4 + Math.sin(time * 0.003 + i * 0.6) * 0.2;
                ctx.drawImage(si, GAME_W / 2 - 56 + i * 26, ratingY, 20, 20);
                ctx.restore();
            }
        }

        const pulse = 0.4 + Math.sin(time * 0.005) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 8;
        ctx.fillText('Tap or Space to Start', GAME_W / 2, GAME_H * 0.82);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    function drawGameOverScreen(time) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        const won = gamesWon[0] > gamesWon[1];
        const title = won ? 'YOU WIN!' : 'GAME OVER';
        const clr = won ? '#34D399' : '#F43F5E';

        ctx.font = 'bold 38px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = clr;
        ctx.shadowColor = clr;
        ctx.shadowBlur = 20;
        ctx.fillText(title, GAME_W / 2, GAME_H * 0.28);
        ctx.shadowBlur = 0;

        // Star rating based on score
        const stars = score >= 800 ? 5 : score >= 500 ? 4 : score >= 300 ? 3 : score >= 100 ? 2 : 1;
        const starNames = ['starBronze', 'starBronze', 'starSilver', 'starGold', 'starDiamond'];
        for (let i = 0; i < 5; i++) {
            const sName = i < stars ? starNames[Math.min(i, starNames.length - 1)] : 'starBronze';
            const si = spr(sName);
            if (si) {
                ctx.save();
                ctx.globalAlpha = i < stars ? (0.7 + Math.sin(time * 0.004 + i) * 0.3) : 0.15;
                const sSize = i < stars ? 28 : 22;
                ctx.drawImage(si, GAME_W / 2 - 72 + i * 32, GAME_H * 0.36, sSize, sSize);
                ctx.restore();
            }
        }

        ctx.font = '18px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(`Score: ${score}  |  Balls Potted: ${totalPotted}`, GAME_W / 2, GAME_H * 0.50);

        const dur = Math.floor((Date.now() - startTime) / 1000);
        ctx.font = '14px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillText(`Duration: ${dur}s`, GAME_W / 2, GAME_H * 0.58);

        // Coin rewards display
        const coinImg = spr(score >= 500 ? 'coinGold' : score >= 200 ? 'coinSilver' : 'coinBronze');
        if (coinImg) {
            ctx.save();
            ctx.globalAlpha = 0.6 + Math.sin(time * 0.004) * 0.3;
            ctx.drawImage(coinImg, GAME_W / 2 - 10, GAME_H * 0.62, 20, 20);
            ctx.restore();
        }

        const pulse = 0.35 + Math.sin(time * 0.005) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 8;
        ctx.fillText('Tap or Space to Play Again', GAME_W / 2, GAME_H * 0.78);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    // ══════════════════════════════════════════════════════════
    //  COLOR HELPERS
    // ══════════════════════════════════════════════════════════
    function lightenColor(hex, pct) {
        const num = parseInt(hex.slice(1), 16);
        let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
        r = Math.min(255, r + Math.floor((255 - r) * pct / 100));
        g = Math.min(255, g + Math.floor((255 - g) * pct / 100));
        b = Math.min(255, b + Math.floor((255 - b) * pct / 100));
        return `rgb(${r},${g},${b})`;
    }

    function darkenColor(hex, pct) {
        const num = parseInt(hex.slice(1), 16);
        let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
        r = Math.max(0, Math.floor(r * (1 - pct / 100)));
        g = Math.max(0, Math.floor(g * (1 - pct / 100)));
        b = Math.max(0, Math.floor(b * (1 - pct / 100)));
        return `rgb(${r},${g},${b})`;
    }

    // ══════════════════════════════════════════════════════════
    //  UPDATE
    // ══════════════════════════════════════════════════════════
    function update(time) {
        frameCount++;
        updateParticles();
        updateMessages();

        if (state === ST_LOADING || state === ST_TITLE || state === ST_OVER) return;

        if (state === ST_ROLLING) {
            updatePhysics();
            if (!anyBallMoving()) endTurn();
            return;
        }

        if (state === ST_AI_THINK) {
            if (Date.now() >= aiTimer) { aiThink(); executeAIShot(); }
            return;
        }

        if (state === ST_AIMING || state === ST_POWER) {
            if (!cueBall.potted) {
                aimAngle = Math.atan2(mouseY - cueBall.y, mouseX - cueBall.x);
                if (aimDragging) {
                    const dx = mouseX - aimStartX;
                    const dy = mouseY - aimStartY;
                    const pullDist = Math.sqrt(dx * dx + dy * dy);
                    aimAngle = Math.atan2(aimStartY - mouseY, aimStartX - mouseX);
                    aimPower = Math.min(MAX_POWER, pullDist * 0.15);
                }
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  DRAW
    // ══════════════════════════════════════════════════════════
    function draw(time) {
        ctx.clearRect(0, 0, GAME_W, GAME_H);

        if (state === ST_LOADING) { drawLoadingScreen(); return; }

        drawTable();
        drawPockets();
        drawAimLine();
        drawAllBalls();
        drawCueStick(time);
        drawPowerMeter();
        drawParticles();
        drawMessages();
        drawHUD();

        if (state === ST_TITLE) drawTitleScreen(time);
        if (state === ST_OVER)  drawGameOverScreen(time);

        // ── SPRITE LOAD CONFIRMATION FLASH ──
        if (spriteLoadFlash > 0) {
            spriteLoadFlash--;
            const flashAlpha = Math.min(1, spriteLoadFlash / 30) * 0.9;
            if (flashAlpha > 0.01) {
                ctx.save();
                ctx.globalAlpha = flashAlpha;
                const loaded = Object.values(spriteCache).filter(v => v !== null).length;
                const txt = `SPRITES LOADED: ${loaded}/${spritesTotal}`;
                ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = '#00FF88';
                ctx.shadowColor = '#00FF88';
                ctx.shadowBlur = 6;
                ctx.fillText(txt, GAME_W - 8, GAME_H - 4);
                ctx.shadowBlur = 0;
                ctx.restore();
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  MAIN LOOP
    // ══════════════════════════════════════════════════════════
    function loop(time) {
        if (!canvas) return;
        update(time);
        draw(time);
        animFrame = requestAnimationFrame(loop);
    }

    // ══════════════════════════════════════════════════════════
    //  RESIZE
    // ══════════════════════════════════════════════════════════
    function fitCanvas() {
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;

        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const aspect = GAME_W / GAME_H;
        let w, h;
        if (cw / ch > aspect) { h = ch; w = ch * aspect; }
        else { w = cw; h = cw / aspect; }

        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';
        canvas.width  = GAME_W;
        canvas.height = GAME_H;

        W     = GAME_W;
        H     = GAME_H;
        scale = w / GAME_W;
    }

    // ══════════════════════════════════════════════════════════
    //  START GAME
    // ══════════════════════════════════════════════════════════
    function startGame() {
        ensureAudio();
        rackBalls();
        currentPlayer = 0;
        playerType = [-1, -1];
        playerPotted = [[], []];
        turnFoul = false;
        firstPotThisTurn = false;
        score = 0;
        totalPotted = 0;
        startTime = Date.now();
        particles = [];
        spriteParticles = [];
        starEffects = [];
        messages = [];
        gameActive = true;
        state = ST_AIMING;
    }

    // ══════════════════════════════════════════════════════════
    //  EVENT HANDLERS
    // ══════════════════════════════════════════════════════════
    function onKeyDown(e) {
        keys[e.key] = true;
        if (e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            if (state === ST_TITLE) startGame();
            else if (state === ST_OVER) state = ST_TITLE;
        }
    }

    function onKeyUp(e) { keys[e.key] = false; }

    function getCanvasPos(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
    }

    function onMouseDown(e) {
        ensureAudio();
        const pos = getCanvasPos(e.clientX, e.clientY);
        mouseX = pos.x; mouseY = pos.y;

        if (state === ST_TITLE)  { startGame(); return; }
        if (state === ST_OVER)   { state = ST_TITLE; return; }

        if (state === ST_AIMING && currentPlayer === 0 && !cueBall.potted) {
            const d = Math.sqrt((pos.x - cueBall.x) ** 2 + (pos.y - cueBall.y) ** 2);
            if (d < BALL_R * 6) {
                aimDragging = true;
                aimStartX = cueBall.x;
                aimStartY = cueBall.y;
                aimPower = 0;
                state = ST_POWER;
            }
        }
    }

    function onMouseMove(e) {
        const pos = getCanvasPos(e.clientX, e.clientY);
        mouseX = pos.x; mouseY = pos.y;
    }

    function onMouseUp(e) {
        if (aimDragging && state === ST_POWER && aimPower > 0.5) {
            shootCueBall();
        } else if (aimDragging) {
            state = ST_AIMING;
        }
        aimDragging = false;
    }

    function onTouchStart(e) {
        ensureAudio();
        if (e.touches.length === 0) return;
        const pos = getCanvasPos(e.touches[0].clientX, e.touches[0].clientY);
        mouseX = pos.x; mouseY = pos.y;

        if (state === ST_TITLE)  { startGame(); return; }
        if (state === ST_OVER)   { state = ST_TITLE; return; }

        if (state === ST_AIMING && currentPlayer === 0 && !cueBall.potted) {
            aimDragging = true;
            aimStartX = cueBall.x;
            aimStartY = cueBall.y;
            aimPower = 0;
            state = ST_POWER;
        }
    }

    function onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 0) return;
        const pos = getCanvasPos(e.touches[0].clientX, e.touches[0].clientY);
        mouseX = pos.x; mouseY = pos.y;
    }

    function onTouchEnd(e) {
        if (aimDragging && state === ST_POWER && aimPower > 0.5) {
            shootCueBall();
        } else if (aimDragging) {
            state = ST_AIMING;
        }
        aimDragging = false;
    }

    function onResize() { fitCanvas(); }

    // ══════════════════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════════════════
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas     = canvasEl;
        ctx        = canvas.getContext('2d');
        player     = activePlayer || null;
        onGameOver = gameOverCallback || null;

        const themeId = activePlayer?.theme || 'retro';
        const _t = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        if (_t) {
            BG_CLR     = _t.bgGradient[0] || BG_CLR;
            ACCENT_CLR = _t.colors[0]      || ACCENT_CLR;
        }

        keys = {};
        particles = [];
        spriteParticles = [];
        starEffects = [];
        messages = [];
        gameActive = false;
        frameCount = 0;
        state = ST_LOADING;

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        rackBalls();

        // Pre-build ball canvases for incredible rendering
        prebuildBallCanvases();

        // Load sprites then transition to title
        preloadSprites(() => {
            spriteLoadFlash = 120; // flash for ~2 seconds
            state = ST_TITLE;
        });

        // Bind events
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup',   onKeyUp);
        window.addEventListener('resize',  onResize);
        canvas.addEventListener('mousemove',  onMouseMove);
        canvas.addEventListener('mousedown',  onMouseDown);
        canvas.addEventListener('mouseup',    onMouseUp);
        canvas.addEventListener('touchstart', onTouchStart, { passive: true });
        canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
        canvas.addEventListener('touchend',   onTouchEnd,   { passive: true });

        animFrame = requestAnimationFrame(loop);
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;

        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup',   onKeyUp);
        window.removeEventListener('resize',  onResize);

        if (canvas) {
            canvas.removeEventListener('mousemove',  onMouseMove);
            canvas.removeEventListener('mousedown',  onMouseDown);
            canvas.removeEventListener('mouseup',    onMouseUp);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove',  onTouchMove);
            canvas.removeEventListener('touchend',   onTouchEnd);
        }
        canvas = null;
        ctx    = null;
        ballCanvasCache = {};

        if (audioCtx) {
            try { audioCtx.close(); } catch { /* ignore */ }
            audioCtx = null;
        }
    }

    return {
        init,
        destroy,
        getScore()  { return score; },
        getLevel()  { return gamesWon[0]; },
        isActive()  { return gameActive; }
    };
})();
