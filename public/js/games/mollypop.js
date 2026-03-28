/* MollyPop — Theme-aware Toon Blast-style block popping game
 * LEVEL 10 GRAPHICS: Emoji blocks, themed colors, 3D effects, shine,
 * Toon Blast celebrations, special blocks, premium particles
 * Blocks use the active player's theme (dinos, candy, space, etc.) */
window.MollyPop = (() => {
    // ── Constants ──
    const ROWS = 10, COLS = 8;

    // ── Theme-driven block config (set in init) ──
    let theme = null;        // ArcadeThemes theme object
    let BLOCK_COLORS = [];   // [{hex, light, dark, emoji}] built from theme
    let BG_GRAD = ['#0A0015', '#050010']; // background gradient from theme
    const CANDIES = [];          // Sprite-based candy rendering removed — using emoji blocks
    const SPRITE_BASE = '/images/candy/pack1-candy-pack/yaycandies/size2/';
    const EXPLOSION_COLORS = ['red', 'blue', 'green', 'pink'];
    const EXPLOSION_FRAMES = 5;
    const MIN_GROUP = 2;
    const GRAVITY_SPEED = 0.16;
    const POP_DURATION = 350;
    const COMBO_WINDOW = 2500;
    const BOUNCE_STRENGTH = 0.35;

    // ── Visual upgrade constants ──
    const BG_HUE_SPEED = 0.08;        // Background gradient hue drift per frame
    const TRAIL_LENGTH = 10;           // Particle trail history length (longer = more dramatic)
    const VIGNETTE_STRENGTH = 0.45;    // Edge darkening intensity
    let bgHueOffset = 0;              // Animated background hue shift

    // High score tracking
    const LS_KEY = 'mollypop_highscore';
    function loadHighScore() { try { return parseInt(localStorage.getItem(LS_KEY)) || 0; } catch { return 0; } }
    function saveHighScore(s) { try { localStorage.setItem(LS_KEY, s); } catch {} }
    let highScore = 0;

    // ── State ──
    let canvas, ctx;
    let grid = [];
    let blockSize = 0;
    let gridOffsetX = 0, gridOffsetY = 0;
    let score = 0, level = 1, target = 500;
    let combo = 0, lastPopTime = 0;
    let totalPopped = 0, maxCombo = 0;
    let animating = false;
    let gameActive = false;
    let animFrame = null;
    let player = null;
    let startTime = 0;
    let frameCount = 0;
    let hoveredGroup = [];
    let particles = [];
    let floatingTexts = [];
    let shakeAmount = 0;
    let onGameOver = null;
    let bgStars = [];           // Background sparkles
    let levelUpAnim = null;     // Toon Blast-style level up state
    let boardGlow = 0;          // Board pulse glow
    let comboFlashAlpha = 0;    // Screen flash on big combos
    let spriteImages = {};      // Loaded candy sprite images (candy theme only)
    let explosionImages = {};   // Loaded explosion sprite frames
    let spritesLoaded = false;  // True when all sprites ready
    let emojiCache = {};        // Pre-rendered emoji canvases for performance

    // ── Audio Context (reuse) ──
    let audioCtx = null;
    function getAudioCtx() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
        }
        return audioCtx;
    }

    // ── Sound helpers ──
    function playPop(groupSize) {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.frequency.value = 400 + Math.min(groupSize, 15) * 80;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.12, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
            osc.start(ac.currentTime);
            osc.stop(ac.currentTime + 0.18);
            // Harmonic for richer candy sound
            if (groupSize >= 4) {
                const osc2 = ac.createOscillator();
                const gain2 = ac.createGain();
                osc2.connect(gain2); gain2.connect(ac.destination);
                osc2.frequency.value = (400 + groupSize * 80) * 1.5;
                osc2.type = 'triangle';
                gain2.gain.setValueAtTime(0.06, ac.currentTime);
                gain2.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
                osc2.start(ac.currentTime + 0.03);
                osc2.stop(ac.currentTime + 0.15);
            }
        } catch {}
    }

    function playCombo(comboLevel) {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const notes = [523, 659, 784, 1047, 1319];
            notes.slice(0, Math.min(comboLevel, 5)).forEach((freq, i) => {
                const osc = ac.createOscillator();
                const gain = ac.createGain();
                osc.connect(gain); gain.connect(ac.destination);
                osc.frequency.value = freq;
                osc.type = 'triangle';
                const t = ac.currentTime + i * 0.07;
                gain.gain.setValueAtTime(0.08, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                osc.start(t); osc.stop(t + 0.1);
            });
        } catch {}
    }

    function playLevelUp() {
        const ac = getAudioCtx(); if (!ac) return;
        try {
            const melody = [523, 659, 784, 1047, 784, 1047, 1319];
            melody.forEach((freq, i) => {
                const osc = ac.createOscillator();
                const gain = ac.createGain();
                osc.connect(gain); gain.connect(ac.destination);
                osc.frequency.value = freq;
                osc.type = i % 2 === 0 ? 'sine' : 'triangle';
                const t = ac.currentTime + i * 0.12;
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                osc.start(t); osc.stop(t + 0.25);
            });
        } catch {}
    }

    // ── Sprite Loading ──
    function loadSprites() {
        let loaded = 0;
        const totalSprites = CANDIES.length + EXPLOSION_COLORS.length * EXPLOSION_FRAMES;
        function onLoad() {
            loaded++;
            if (loaded >= totalSprites) spritesLoaded = true;
        }
        function onError() { loaded++; if (loaded >= totalSprites) spritesLoaded = true; }

        // Load candy sprites
        CANDIES.forEach(candy => {
            const img = new Image();
            img.onload = onLoad;
            img.onerror = onError;
            img.src = SPRITE_BASE + candy.sprite;
            spriteImages[candy.name] = img;
        });

        // Load explosion sprites
        EXPLOSION_COLORS.forEach(color => {
            explosionImages[color] = [];
            for (let i = 1; i <= EXPLOSION_FRAMES; i++) {
                const img = new Image();
                img.onload = onLoad;
                img.onerror = onError;
                img.src = `${SPRITE_BASE}explosion${color}0${i}.png`;
                explosionImages[color].push(img);
            }
        });
    }

    // ── Build theme block config ──
    function buildBlockColors() {
        if (!theme) {
            // Fallback to retro defaults
            BLOCK_COLORS = [
                { hex: '#F43F5E', light: '#FF8DA0', dark: '#CC2244', emoji: '👾' },
                { hex: '#8B5CF6', light: '#D4A0FF', dark: '#7C3AED', emoji: '🕹️' },
                { hex: '#3B82F6', light: '#93C5FD', dark: '#1D4ED8', emoji: '💎' },
                { hex: '#10B981', light: '#6EE7B7', dark: '#059669', emoji: '🔶' },
                { hex: '#F59E0B', light: '#FCD34D', dark: '#D97706', emoji: '🟣' },
                { hex: '#06B6D4', light: '#67E8F9', dark: '#0891B2', emoji: '🟢' },
                { hex: '#EC4899', light: '#F9A8D4', dark: '#BE185D', emoji: '🔴' },
            ];
            BG_GRAD = ['#0A0A1A', '#1A0A2E'];
            return;
        }
        const colors = theme.colors || [];
        const emojis = theme.blockEmoji || theme.particleEmoji || ['⭐'];
        BLOCK_COLORS = [];
        for (let i = 0; i < Math.max(colors.length, emojis.length, 6); i++) {
            const hex = colors[i % colors.length] || '#888';
            // Generate light/dark variants
            BLOCK_COLORS.push({
                hex,
                light: (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.lighten(hex, 40) : hex,
                dark:  (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.darken(hex, 30)  : hex,
                emoji: emojis[i % emojis.length],
            });
        }
        BG_GRAD = theme.bgGradient || ['#0A0015', '#050010'];
    }

    // Color helpers delegated to shared ArcadeThemes (lighten/darken removed — use ArcadeThemes.lighten/darken)

    // Pre-render emoji to offscreen canvases for fast drawing
    function buildEmojiCache(size) {
        emojiCache = {};
        BLOCK_COLORS.forEach((bc, i) => {
            const oc = document.createElement('canvas');
            oc.width = size; oc.height = size;
            const octx = oc.getContext('2d');
            octx.font = `${Math.round(size * 0.7)}px sans-serif`;
            octx.textAlign = 'center';
            octx.textBaseline = 'middle';
            octx.fillText(bc.emoji, size/2, size/2 + 2);
            emojiCache[i] = oc;
        });
    }

    // ── Background Stars Init (more stars, varied layers) ──
    function initBgStars() {
        bgStars = [];
        const starColors = ['#FFD700','#FF6B9D','#A78BFA','#67E8F9','#FFF','#FF9FF3','#54E3FF','#FFB8D0'];
        for (let i = 0; i < 80; i++) {
            bgStars.push({
                x: Math.random() * 2000,
                y: Math.random() * 2000,
                size: Math.random() * 2.8 + 0.4,
                speed: Math.random() * 0.4 + 0.08,
                twinkle: Math.random() * Math.PI * 2,
                twinkleSpeed: Math.random() * 0.06 + 0.015,
                color: starColors[Math.floor(Math.random() * starColors.length)],
            });
        }
    }

    // ── Grid Logic ──
    function numColors() { return Math.min(3 + Math.floor(level / 2), BLOCK_COLORS.length); }

    function generateGrid() {
        grid = [];
        const nc = numColors();
        for (let r = 0; r < ROWS; r++) {
            grid[r] = [];
            for (let c = 0; c < COLS; c++) {
                grid[r][c] = {
                    colorIdx: Math.floor(Math.random() * nc),
                    x: 0, y: 0, targetY: 0,
                    scale: 1, opacity: 1,
                    popping: false,
                    bounceVel: 0,     // Landing bounce
                    wobble: 0,        // Hover wobble
                    shine: Math.random() * Math.PI * 2, // Sparkle phase offset
                };
            }
        }
        updatePositions();
    }

    function updatePositions() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c]) {
                    grid[r][c].x = gridOffsetX + c * blockSize;
                    grid[r][c].targetY = gridOffsetY + r * blockSize;
                    if (!grid[r][c].y) grid[r][c].y = grid[r][c].targetY;
                }
            }
        }
    }

    function findGroup(row, col) {
        if (!grid[row] || !grid[row][col]) return [];
        const colorIdx = grid[row][col].colorIdx;
        const visited = new Set();
        const group = [];
        const stack = [[row, col]];
        while (stack.length) {
            const [r, c] = stack.pop();
            const key = `${r},${c}`;
            if (visited.has(key)) continue;
            if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
            if (!grid[r][c] || grid[r][c].colorIdx !== colorIdx) continue;
            visited.add(key);
            group.push([r, c]);
            stack.push([r-1,c],[r+1,c],[r,c-1],[r,c+1]);
        }
        return group;
    }

    function calcPoints(n) { return n * (n - 1) * 10; }

    function popGroup(cells) {
        if (cells.length < MIN_GROUP || animating) return;
        animating = true;
        const points = calcPoints(cells.length);
        const now = Date.now();

        // Combo
        if (now - lastPopTime < COMBO_WINDOW) { combo++; } else { combo = 1; }
        lastPopTime = now;
        maxCombo = Math.max(maxCombo, combo);

        const multiplier = Math.min(combo, 5);
        const totalPoints = points * multiplier;
        score += totalPoints;
        totalPopped += cells.length;

        // Center of group
        let cx = 0, cy = 0;
        cells.forEach(([r,c]) => { cx += grid[r][c].x + blockSize/2; cy += grid[r][c].y + blockSize/2; });
        cx /= cells.length; cy /= cells.length;

        playPop(cells.length);
        if (combo > 1) playCombo(combo);

        // ── PREMIUM THEMED EXPLOSION PARTICLES (more, with trails) ──
        cells.forEach(([r,c]) => {
            const block = grid[r][c];
            const col = BLOCK_COLORS[block.colorIdx] || BLOCK_COLORS[0];
            const bx = block.x + blockSize/2, by = block.y + blockSize/2;

            // Candy shards (more, bigger, colorful, with trails)
            const shardCount = 8 + Math.min(cells.length, 6);
            for (let i = 0; i < shardCount; i++) {
                const angle = (Math.PI * 2 / shardCount) * i + Math.random() * 0.5;
                const speed = 3.5 + Math.random() * 7;
                particles.push({
                    x: bx, y: by,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 2.5,
                    color: i % 3 === 0 ? col.light : i % 3 === 1 ? col.hex : col.dark,
                    size: 4 + Math.random() * 6,
                    life: 1, decay: 0.015 + Math.random() * 0.008,
                    type: 'shard', rotation: Math.random() * Math.PI * 2,
                    rotSpeed: (Math.random() - 0.5) * 0.35,
                    trail: [],  // position history for trail effect
                });
            }
            // Sugar sparkles (more, with glow)
            for (let i = 0; i < 7; i++) {
                particles.push({
                    x: bx + (Math.random()-0.5)*blockSize*0.6,
                    y: by + (Math.random()-0.5)*blockSize*0.6,
                    vx: (Math.random()-0.5) * 4,
                    vy: -Math.random() * 5 - 1.5,
                    color: ['#FFF','#FFD700','#FBBF24','#FFF5F5','#FF9FF3'][Math.floor(Math.random()*5)],
                    size: 2 + Math.random() * 3.5,
                    life: 1, decay: 0.02 + Math.random() * 0.015,
                    type: 'sparkle',
                    trail: [],
                });
            }
            // Ring burst particle (expands outward)
            particles.push({
                x: bx, y: by,
                vx: 0, vy: 0,
                color: col.hex,
                size: 2, maxSize: blockSize * 0.8,
                life: 1, decay: 0.04,
                type: 'ring',
            });
        });

        // Themed emoji burst for big groups
        if (cells.length >= 7) {
            const emojis = theme ? [...theme.particleEmoji, '⭐', '✨', '💥'] : ['👾','💎','⭐','✨','💥','🕹️'];
            for (let i = 0; i < Math.min(cells.length, 12); i++) {
                const angle = (Math.PI * 2 / 8) * i;
                particles.push({
                    x: cx, y: cy,
                    vx: Math.cos(angle) * (4 + Math.random() * 3),
                    vy: Math.sin(angle) * (4 + Math.random() * 3) - 3,
                    text: emojis[Math.floor(Math.random() * emojis.length)],
                    size: 18 + Math.random() * 12,
                    life: 1, decay: 0.012,
                    type: 'emoji',
                });
            }
        }

        // Floating score text (with glow)
        const label = combo > 1 ? `+${totalPoints.toLocaleString()} ×${multiplier}` : `+${totalPoints.toLocaleString()}`;
        floatingTexts.push({
            text: label,
            x: cx, y: cy - 10,
            opacity: 1, vy: -2.5,
            size: cells.length >= 7 ? 42 : cells.length >= 5 ? 34 : combo > 2 ? 28 : 22,
            color: combo > 1 ? '#FFD700' : '#FFF',
            outline: combo > 1 ? '#FF6B00' : '#F43F5E',
            glow: combo > 1 ? '#FFD700' : (BLOCK_COLORS[0]?.hex || '#F43F5E'),
            glowSize: cells.length >= 7 ? 25 : cells.length >= 5 ? 18 : combo > 2 ? 14 : 8,
            scale: combo > 2 ? 1.8 : 1.4,
        });

        // Themed pop words for big groups
        const pw = theme ? theme.popWords : ['Sweet!', 'Awesome!', 'Amazing!', 'MEGA POP!'];
        const tIcon = theme ? theme.icon : '⭐';
        if (cells.length >= 10) {
            floatingTexts.push({ text: `${tIcon} ${pw[3] || 'MEGA!'} ${tIcon}`, x: cx, y: cy - 50, opacity: 1, vy: -3.5, size: 32, color: '#FFD700', outline: '#FF0080', glow: '#FFD700', glowSize: 20, scale: 1.6 });
        } else if (cells.length >= 7) {
            floatingTexts.push({ text: `✨ ${pw[2] || 'Amazing!'} ✨`, x: cx, y: cy - 45, opacity: 1, vy: -3, size: 28, color: '#FFD700', outline: '#A855F7', glow: '#A855F7', glowSize: 16, scale: 1.4 });
        } else if (cells.length >= 5) {
            floatingTexts.push({ text: `${tIcon} ${pw[0] || 'Nice!'}`, x: cx, y: cy - 40, opacity: 1, vy: -2.5, size: 24, color: '#FFF', outline: BLOCK_COLORS[0]?.hex || '#F43F5E', glow: BLOCK_COLORS[0]?.hex || '#F43F5E', glowSize: 10, scale: 1.3 });
        }

        // Screen effects — bigger shakes for bigger combos
        if (cells.length >= 5) shakeAmount = Math.min(cells.length * 3 + combo * 3.5, 35);
        else if (cells.length >= 3) shakeAmount = Math.max(shakeAmount, cells.length * 2 + combo);
        if (combo >= 3) comboFlashAlpha = Math.min(0.2 + combo * 0.08, 0.55);
        if (cells.length >= 4) boardGlow = Math.min(1 + combo * 0.15, 1.5);

        // Confetti
        if (cells.length >= 10 && window.Confetti) {
            Confetti.burst(cx, cy, 50, { speed: 10, colors: ['#FF4D6A','#FFD700','#A855F7','#3B82F6','#10B981'] });
        } else if (cells.length >= 5 && window.Confetti) {
            Confetti.burst(cx, cy, 20);
        }

        // Mark popping
        cells.forEach(([r,c]) => { grid[r][c].popping = true; });

        setTimeout(() => {
            cells.forEach(([r,c]) => { grid[r][c] = null; });
            applyGravity();
        }, POP_DURATION);
    }

    function applyGravity() {
        for (let c = 0; c < COLS; c++) {
            let writeRow = ROWS - 1;
            for (let r = ROWS - 1; r >= 0; r--) {
                if (grid[r][c]) {
                    if (writeRow !== r) {
                        grid[writeRow][c] = grid[r][c];
                        grid[writeRow][c].bounceVel = 0;
                        grid[r][c] = null;
                    }
                    writeRow--;
                }
            }
        }
        let writeCol = 0;
        for (let c = 0; c < COLS; c++) {
            let hasBlock = false;
            for (let r = 0; r < ROWS; r++) { if (grid[r][c]) { hasBlock = true; break; } }
            if (hasBlock) {
                if (writeCol !== c) {
                    for (let r = 0; r < ROWS; r++) { grid[r][writeCol] = grid[r][c]; grid[r][c] = null; }
                }
                writeCol++;
            }
        }
        updatePositions();
        setTimeout(() => {
            animating = false;
            if (score >= target) { levelUp(); return; }
            if (checkGameOver()) { endGame(); }
        }, 450);
    }

    function checkGameOver() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (!grid[r][c]) continue;
                if (findGroup(r, c).length >= MIN_GROUP) return false;
            }
        }
        return true;
    }

    // ══════════════════════════════════════════════════
    // TOON BLAST LEVEL-UP CELEBRATION
    // ══════════════════════════════════════════════════
    function levelUp() {
        level++;
        target = Math.round(target * 1.6);
        combo = 0;

        playLevelUp();
        if (window.SFX?.levelUp) SFX.levelUp();
        if (window.Confetti) {
            Confetti.rain(3000);
            setTimeout(() => {
                const cx = canvas.width/2, cy = canvas.height/2;
                const themeColors = theme ? theme.colors : ['#FFD700','#FF4D6A','#A855F7','#3B82F6','#10B981','#F59E0B'];
                Confetti.burst(cx, cy, 80, { speed: 12, colors: themeColors });
                const celebEmoji = theme ? [...theme.particleEmoji, '⭐', '🎉'] : ['🎮','💎','⭐','🎉','👾','🕹️'];
                Confetti.emoji(cx, cy, celebEmoji, 30);
            }, 300);
        }

        // Start Toon Blast-style level up animation
        levelUpAnim = {
            phase: 0,            // 0=zoom-in, 1=hold, 2=zoom-out
            timer: 0,
            starAngle: 0,
            textScale: 0,
            bgAlpha: 0,
            starParticles: [],
        };
        // Generate star burst particles
        for (let i = 0; i < 30; i++) {
            const angle = (Math.PI * 2 / 30) * i;
            levelUpAnim.starParticles.push({
                angle, dist: 0, targetDist: 120 + Math.random() * 80,
                size: 8 + Math.random() * 12,
                color: ['#FFD700','#FF4D6A','#A855F7','#FFF','#67E8F9'][Math.floor(Math.random()*5)],
                rotation: Math.random() * Math.PI,
                rotSpeed: (Math.random()-0.5) * 0.1,
            });
        }

        // After celebration, refill
        setTimeout(() => {
            levelUpAnim = null;
            generateGrid();
            animating = false;
        }, 3200);
    }

    function endGame() {
        gameActive = false;
        const duration = Math.round((Date.now() - startTime) / 1000);
        if (score > highScore) { highScore = score; saveHighScore(highScore); }
        if (window.Confetti) Confetti.highScore();
        if (player?.id) {
            API.submitOriginalScore(player.id, 'mollypop', score, level, {
                blocks_popped: totalPopped, max_combo: maxCombo, duration,
            }).then(result => {
                if (result?.is_personal_best && window.Confetti) Confetti.celebrate();
            }).catch(() => {});
        }
        if (onGameOver) onGameOver({ score, level, totalPopped, maxCombo, duration });
    }

    // ══════════════════════════════════════════════════
    // RENDERING — LEVEL 10 CANDY GRAPHICS
    // ══════════════════════════════════════════════════
    function render() {
        if (!ctx) return;
        animFrame = requestAnimationFrame(render);
        frameCount++;

        const w = canvas.width, h = canvas.height;

        // ── Background ──
        drawBackground(w, h);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        ctx.save();
        // Screen shake (oscillating with decay for smoother feel)
        if (shakeAmount > 0) {
            const shakeAngle = frameCount * 0.8;
            const sx = Math.sin(shakeAngle) * shakeAmount * (0.5 + Math.random() * 0.5);
            const sy = Math.cos(shakeAngle * 1.3) * shakeAmount * (0.5 + Math.random() * 0.5);
            ctx.translate(sx, sy);
            shakeAmount *= 0.88;
            if (shakeAmount < 0.4) shakeAmount = 0;
        }

        // Combo flash
        if (comboFlashAlpha > 0) {
            ctx.fillStyle = `rgba(255,215,0,${comboFlashAlpha})`;
            ctx.fillRect(0, 0, w, h);
            comboFlashAlpha *= 0.9;
            if (comboFlashAlpha < 0.01) comboFlashAlpha = 0;
        }

        drawHUD(w, h);

        // Board glow
        if (boardGlow > 0) {
            ctx.save();
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 30 * boardGlow;
            ctx.fillStyle = 'rgba(255,215,0,0)';
            ctx.fillRect(gridOffsetX, gridOffsetY, COLS * blockSize, ROWS * blockSize);
            ctx.restore();
            boardGlow *= 0.93;
            if (boardGlow < 0.01) boardGlow = 0;
        }

        // ── Draw Blocks ──
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const block = grid[r][c];
                if (!block) continue;

                // Smooth gravity animation with ease-out and elastic bounce
                const dy = block.targetY - block.y;
                if (Math.abs(dy) > 0.3) {
                    // Ease-out cubic: accelerates then decelerates smoothly
                    const t = Math.min(GRAVITY_SPEED * 1.3, 1);
                    const eased = 1 - Math.pow(1 - t, 3);
                    block.y += dy * eased;
                    // Trigger bounce when nearly settled
                    if (Math.abs(dy) < 3 && block.bounceVel === 0) {
                        block.bounceVel = -BOUNCE_STRENGTH * Math.min(Math.abs(dy), 8);
                    }
                } else {
                    block.y = block.targetY;
                    if (block.bounceVel !== 0) {
                        // Elastic bounce with damping
                        block.bounceVel += 0.18;
                        block.bounceVel *= 0.92; // damping
                        block.y += block.bounceVel;
                        if (block.y >= block.targetY && block.bounceVel > 0) {
                            block.bounceVel *= -0.35; // reverse with energy loss
                            block.y = block.targetY;
                            if (Math.abs(block.bounceVel) < 0.3) block.bounceVel = 0;
                        }
                    }
                }

                // Pop animation
                if (block.popping) {
                    block.scale += (1.25 - block.scale) * 0.15;
                    block.opacity -= 0.07;
                    if (block.opacity <= 0) continue;
                }

                // Hover wobble
                const isHovered = hoveredGroup.some(([hr,hc]) => hr === r && hc === c);
                if (isHovered && !block.popping) {
                    block.wobble += 0.15;
                } else {
                    block.wobble *= 0.85;
                }

                drawCandy(block, r, c, isHovered);
            }
        }

        // ── Particles ──
        drawParticles();

        // ── Floating Texts ──
        drawFloatingTexts();

        ctx.restore();

        // ── Level Up Overlay ──
        if (levelUpAnim) drawLevelUpOverlay(w, h);
    }

    // ── Premium Background (themed) with animated gradient shift ──
    function drawBackground(w, h) {
        bgHueOffset += BG_HUE_SPEED;

        // Deep gradient from theme with subtle animated color shift
        const bg = ctx.createLinearGradient(0, 0, w * 0.3, h);
        bg.addColorStop(0, BG_GRAD[0] || '#0A0015');
        bg.addColorStop(0.5, BG_GRAD[1] || '#050010');
        bg.addColorStop(1, BG_GRAD[0] || '#0A0015');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        // Animated color wash overlay (slow shifting hue)
        const washAlpha = 0.03 + Math.sin(bgHueOffset * 0.3) * 0.015;
        const washHue = (bgHueOffset * 8) % 360;
        ctx.fillStyle = `hsla(${washHue}, 60%, 40%, ${washAlpha})`;
        ctx.fillRect(0, 0, w, h);

        // Animated sparkle stars with parallax drift
        bgStars.forEach(star => {
            star.twinkle += star.twinkleSpeed;
            star.x += star.speed * 0.3;
            star.y += star.speed * 0.1;
            if (star.x > w + 10) star.x = -10;
            if (star.y > h + 10) star.y = -10;
            const alpha = 0.3 + Math.sin(star.twinkle) * 0.35;
            const sx = star.x % w;
            const sy = star.y % h;

            // Soft glow halo behind larger stars
            if (star.size > 1.2) {
                const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, star.size * 4);
                // Approximate glow with semi-transparent circle
                ctx.globalAlpha = alpha * 0.25;
                ctx.fillStyle = star.color;
                ctx.beginPath();
                ctx.arc(sx, sy, star.size * 3, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
            ctx.fillStyle = star.color;
            ctx.globalAlpha = alpha;
            ctx.fill();
            // Cross sparkle for bigger stars
            if (star.size > 1.5) {
                ctx.globalAlpha = alpha * 0.6;
                ctx.strokeStyle = star.color;
                ctx.lineWidth = 0.5;
                const len = star.size * 2.5;
                const rot = star.twinkle * 0.5;
                ctx.beginPath();
                ctx.moveTo(sx - len * Math.cos(rot), sy - len * Math.sin(rot));
                ctx.lineTo(sx + len * Math.cos(rot), sy + len * Math.sin(rot));
                ctx.moveTo(sx - len * Math.sin(rot), sy + len * Math.cos(rot));
                ctx.lineTo(sx + len * Math.sin(rot), sy - len * Math.cos(rot));
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        });

        // Pulsing radial glow behind grid
        const pulseIntensity = 0.06 + Math.sin(bgHueOffset * 0.5) * 0.02;
        const gcx = gridOffsetX + COLS * blockSize / 2;
        const gcy = gridOffsetY + ROWS * blockSize / 2;
        const grd = ctx.createRadialGradient(gcx, gcy, 50, gcx, gcy, COLS * blockSize);
        grd.addColorStop(0, `rgba(168, 85, 247, ${pulseIntensity})`);
        grd.addColorStop(0.5, `rgba(244, 63, 94, ${pulseIntensity * 0.5})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);

        // ── Vignette overlay ──
        drawVignette(w, h);
    }

    // ── Vignette: darkened edges for cinematic depth ──
    function drawVignette(w, h) {
        const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(0.7, 'rgba(0,0,0,0)');
        vg.addColorStop(1, `rgba(0,0,0,${VIGNETTE_STRENGTH})`);
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);
    }

    // ── Helper: rounded rect path (works even if roundRect is missing) ──
    function roundRectPath(ctx, x, y, w, h, r) {
        if (typeof r === 'number') r = [r, r, r, r];
        const [tl, tr, br, bl] = r;
        ctx.beginPath();
        ctx.moveTo(x + tl, y);
        ctx.lineTo(x + w - tr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
        ctx.lineTo(x + w, y + h - br);
        ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
        ctx.lineTo(x + bl, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
        ctx.lineTo(x, y + tl);
        ctx.quadraticCurveTo(x, y, x + tl, y);
        ctx.closePath();
    }

    // ══════════════════════════════════════════════════
    // DRAW BLOCK — Gradient-filled with shine, glow, rounded corners
    // ══════════════════════════════════════════════════
    function drawCandy(block, r, c, isHovered) {
        const col = BLOCK_COLORS[block.colorIdx] || BLOCK_COLORS[0];
        const padding = 2;
        const size = blockSize - padding * 2;
        const x = block.x + padding;
        const y = block.y + padding;
        const cx = x + size / 2;
        const cy = y + size / 2;
        const radius = size * 0.22;

        ctx.save();
        ctx.globalAlpha = block.opacity;

        // Wobble + hover transform
        const wobbleAngle = Math.sin(block.wobble) * 0.06;
        const hoverScale = isHovered ? 1.08 : 1;
        ctx.translate(cx, cy);
        ctx.rotate(wobbleAngle);
        ctx.scale(block.scale * hoverScale, block.scale * hoverScale);
        ctx.translate(-cx, -cy);

        // ── Pulsing radial glow for hovered blocks (about to be popped) ──
        if (isHovered && !block.popping) {
            const glowPulse = 0.4 + Math.sin(frameCount * 0.12) * 0.2;
            const glowR = size * 0.65;
            const hoverGlow = ctx.createRadialGradient(cx, cy, size * 0.15, cx, cy, glowR);
            hoverGlow.addColorStop(0, col.hex.replace('#', 'rgba(') ? `rgba(${parseInt(col.hex.slice(1,3),16)},${parseInt(col.hex.slice(3,5),16)},${parseInt(col.hex.slice(5,7),16)},${glowPulse})` : `rgba(255,100,100,${glowPulse})`);
            hoverGlow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = hoverGlow;
            ctx.beginPath();
            ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Drop shadow for depth ──
        if (!block.popping) {
            ctx.shadowColor = 'rgba(0,0,0,0.35)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 3;
        }

        // Background shape (themed: round or sharp) — all with rounded corners
        const style = theme ? theme.blockStyle : 'round';
        ctx.beginPath();
        if (style === 'round') {
            ctx.arc(cx, cy, size * 0.44, 0, Math.PI * 2);
        } else if (style === 'jagged') {
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 6;
                const px = cx + Math.cos(angle) * size * 0.44;
                const py = cy + Math.sin(angle) * size * 0.44;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
        } else if (style === 'pixel') {
            roundRectPath(ctx, x + 2, y + 2, size - 4, size - 4, 4);
        } else {
            roundRectPath(ctx, x + 1, y + 1, size - 2, size - 2, radius);
        }

        // Multi-stop gradient fill for richer 3D appearance
        const grad = ctx.createRadialGradient(cx - size * 0.15, cy - size * 0.15, 0, cx + size * 0.05, cy + size * 0.05, size * 0.55);
        grad.addColorStop(0, col.light);
        grad.addColorStop(0.35, col.hex);
        grad.addColorStop(0.75, col.dark);
        grad.addColorStop(1, darken(col.dark, 0.3));
        ctx.fillStyle = grad;
        ctx.fill();

        // ── Colored inner glow border ──
        ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = `rgba(255,255,255,0.15)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // ── Draw emoji from cache ──
        const cached = emojiCache[block.colorIdx];
        if (cached) {
            const emojiSize = size * 0.9;
            ctx.drawImage(cached, cx - emojiSize / 2, cy - emojiSize / 2, emojiSize, emojiSize);
        } else {
            ctx.font = `${Math.round(size * 0.55)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(col.emoji, cx, cy + 2);
        }

        // ── Premium glossy shine highlight (top-left ellipse) ──
        if (!block.popping) {
            ctx.beginPath();
            ctx.ellipse(cx - size * 0.06, cy - size * 0.16, size * 0.3, size * 0.13, -0.25, 0, Math.PI * 2);
            const shineGrad = ctx.createRadialGradient(cx - size * 0.08, cy - size * 0.22, 0, cx - size * 0.06, cy - size * 0.16, size * 0.3);
            shineGrad.addColorStop(0, 'rgba(255,255,255,0.45)');
            shineGrad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
            shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = shineGrad;
            ctx.fill();

            // Bottom edge highlight for 3D rim
            ctx.beginPath();
            ctx.ellipse(cx + size * 0.02, cy + size * 0.22, size * 0.25, size * 0.06, 0, 0, Math.PI);
            const rimGrad = ctx.createLinearGradient(cx, cy + size * 0.16, cx, cy + size * 0.28);
            rimGrad.addColorStop(0, 'rgba(255,255,255,0)');
            rimGrad.addColorStop(1, 'rgba(255,255,255,0.1)');
            ctx.fillStyle = rimGrad;
            ctx.fill();
        }

        // ── Animated sparkle ──
        if (!block.popping) {
            block.shine += 0.03;
            const sparkleAlpha = (Math.sin(block.shine + c * 0.7 + r * 0.5) + 1) * 0.18;
            if (sparkleAlpha > 0.1) {
                const sx = x + size * 0.7 + Math.sin(block.shine * 1.3) * size * 0.12;
                const sy = y + size * 0.25 + Math.cos(block.shine * 0.9) * size * 0.06;
                drawStar(sx, sy, 3, 7, 4, `rgba(255,255,255,${sparkleAlpha})`);
                // Extra micro-sparkle
                const sx2 = x + size * 0.25 + Math.cos(block.shine * 0.7) * size * 0.08;
                const sy2 = y + size * 0.65 + Math.sin(block.shine * 1.1) * size * 0.05;
                const a2 = (Math.sin(block.shine * 1.5 + 2) + 1) * 0.1;
                if (a2 > 0.08) drawStar(sx2, sy2, 1.5, 3.5, 4, `rgba(255,255,255,${a2})`);
            }
        }

        // ── Hover glow ring + pulsing outline ──
        if (isHovered && !block.popping) {
            const pulseW = 2.5 + Math.sin(frameCount * 0.15) * 1;
            ctx.beginPath();
            ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,255,255,${0.7 + Math.sin(frameCount * 0.12) * 0.3})`;
            ctx.lineWidth = pulseW;
            ctx.shadowColor = col.light;
            ctx.shadowBlur = 16 + Math.sin(frameCount * 0.1) * 4;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Hover group count badge
            if (hoveredGroup.length >= 3) {
                const firstCell = hoveredGroup[0];
                if (firstCell[0] === r && firstCell[1] === c) {
                    const pts = calcPoints(hoveredGroup.length) * Math.min(combo + 1, 5);
                    const badge = `${hoveredGroup.length} = +${pts}`;
                    // Badge background pill
                    ctx.font = 'bold 13px "Segoe UI", system-ui';
                    ctx.textAlign = 'center';
                    const badgeW = ctx.measureText(badge).width + 12;
                    roundRectPath(ctx, cx - badgeW / 2, y - 22, badgeW, 18, 6);
                    ctx.fillStyle = 'rgba(0,0,0,0.65)';
                    ctx.fill();
                    ctx.fillStyle = '#FFD700';
                    ctx.shadowColor = '#FFD700';
                    ctx.shadowBlur = 4;
                    ctx.fillText(badge, cx, y - 10);
                    ctx.shadowBlur = 0;
                }
            }
        }

        ctx.restore();
    }

    // ── Draw star shape ──
    function drawStar(cx, cy, innerR, outerR, points, color) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const angle = (Math.PI / points) * i - Math.PI / 2;
            const r = i % 2 === 0 ? outerR : innerR;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // ── Particles (with trails, ring bursts, enhanced glow) ──
    function drawParticles() {
        particles = particles.filter(p => {
            p.life -= p.decay;
            if (p.life <= 0) return false;

            // Store trail history before moving
            if (p.trail) {
                p.trail.push({ x: p.x, y: p.y });
                if (p.trail.length > TRAIL_LENGTH) p.trail.shift();
            }

            p.x += p.vx;
            p.y += p.vy;
            if (p.type !== 'ring') p.vy += 0.15; // gravity (not for rings)

            ctx.save();
            ctx.globalAlpha = p.life;

            if (p.type === 'ring') {
                // Expanding ring burst
                p.size += (p.maxSize - p.size) * 0.12;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2.5 * p.life;
                ctx.globalAlpha = p.life * 0.5;
                ctx.stroke();
            } else if (p.type === 'emoji') {
                ctx.font = `${p.size * p.life}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(p.text, p.x, p.y);
            } else if (p.type === 'shard') {
                // Draw trail first (fading behind)
                if (p.trail && p.trail.length > 1) {
                    for (let i = 0; i < p.trail.length - 1; i++) {
                        const t = p.trail[i];
                        const trailAlpha = (i / p.trail.length) * p.life * 0.4;
                        const trailSize = p.size * (i / p.trail.length) * 0.6;
                        ctx.globalAlpha = trailAlpha;
                        ctx.fillStyle = p.color;
                        ctx.beginPath();
                        ctx.arc(t.x, t.y, trailSize, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.globalAlpha = p.life;
                }

                p.rotation += p.rotSpeed;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillStyle = p.color;
                ctx.beginPath();
                // Candy shard shape (irregular polygon)
                ctx.moveTo(-p.size*0.5, -p.size*0.3);
                ctx.lineTo(p.size*0.3, -p.size*0.5);
                ctx.lineTo(p.size*0.5, p.size*0.2);
                ctx.lineTo(-p.size*0.1, p.size*0.5);
                ctx.closePath();
                ctx.fill();
                // Shard inner highlight
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.beginPath();
                ctx.moveTo(-p.size*0.3, -p.size*0.2);
                ctx.lineTo(p.size*0.1, -p.size*0.35);
                ctx.lineTo(p.size*0.2, p.size*0.05);
                ctx.closePath();
                ctx.fill();
            } else if (p.type === 'sparkle') {
                // Draw sparkle trail
                if (p.trail && p.trail.length > 1) {
                    for (let i = 0; i < p.trail.length; i++) {
                        const t = p.trail[i];
                        const ta = (i / p.trail.length) * p.life * 0.3;
                        ctx.globalAlpha = ta;
                        ctx.fillStyle = p.color;
                        ctx.beginPath();
                        ctx.arc(t.x, t.y, p.size * p.life * 0.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.globalAlpha = p.life;
                }

                // Glowing spark with radial gradient
                const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * p.life * 2);
                gradient.addColorStop(0, '#FFF');
                gradient.addColorStop(0.3, p.color);
                gradient.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * p.life * 2.5, 0, Math.PI * 2);
                ctx.fill();
                // Cross sparkle
                drawStar(p.x, p.y, 1.5, p.size * p.life * 1.2, 4, p.color);
            } else {
                // Legacy circle particle
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();
            }

            ctx.restore();
            return true;
        });
    }

    // ── Floating Score Texts with glow ──
    function drawFloatingTexts() {
        floatingTexts = floatingTexts.filter(t => {
            t.y += t.vy;
            t.opacity -= 0.012;
            if (t.scale > 1) t.scale *= 0.96;
            if (t.opacity <= 0) return false;

            ctx.save();
            ctx.globalAlpha = t.opacity;
            const fontSize = t.size * (t.scale || 1);
            ctx.font = `bold ${fontSize}px "Segoe UI", system-ui`;
            ctx.textAlign = 'center';

            // Glow halo behind text
            if (t.glow) {
                const glowRadius = fontSize * 1.2;
                const glowGrad = ctx.createRadialGradient(t.x, t.y - fontSize * 0.2, 0, t.x, t.y - fontSize * 0.2, glowRadius);
                glowGrad.addColorStop(0, t.glow.replace(')', `,${t.opacity * 0.3})`).replace('rgb', 'rgba') || `rgba(255,215,0,${t.opacity * 0.3})`);
                glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
                // Simple colored glow circle
                ctx.globalAlpha = t.opacity * 0.35;
                ctx.fillStyle = t.glow;
                ctx.beginPath();
                ctx.arc(t.x, t.y - fontSize * 0.2, glowRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = t.opacity;
            }

            // Colored glow shadow on text
            if (t.glow) {
                ctx.shadowColor = t.glow;
                ctx.shadowBlur = t.glowSize || 10;
            }

            // Outline text for premium look
            if (t.outline) {
                ctx.strokeStyle = t.outline;
                ctx.lineWidth = 4;
                ctx.lineJoin = 'round';
                ctx.strokeText(t.text, t.x, t.y);
            }
            ctx.fillStyle = t.color;
            if (!t.glow) {
                ctx.shadowColor = 'rgba(0,0,0,0.6)';
                ctx.shadowBlur = 6;
            }
            ctx.fillText(t.text, t.x, t.y);

            ctx.restore();
            return true;
        });
    }

    // ══════════════════════════════════════════════════
    // TOON BLAST LEVEL-UP OVERLAY
    // ══════════════════════════════════════════════════
    function drawLevelUpOverlay(w, h) {
        const anim = levelUpAnim;
        anim.timer++;
        anim.starAngle += 0.02;

        // Phase management
        if (anim.timer < 20) { anim.bgAlpha = Math.min(anim.bgAlpha + 0.04, 0.75); anim.textScale += 0.06; }
        else if (anim.timer < 140) { anim.phase = 1; } // hold
        else { anim.phase = 2; anim.bgAlpha -= 0.03; anim.textScale -= 0.03; }

        anim.textScale = Math.max(0, Math.min(anim.textScale, 1.2));

        ctx.save();

        // Dark overlay
        ctx.fillStyle = `rgba(10, 0, 30, ${anim.bgAlpha})`;
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2, cy = h / 2;

        // Rotating star burst behind text
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(anim.starAngle);
        // Draw burst rays
        for (let i = 0; i < 12; i++) {
            const angle = (Math.PI * 2 / 12) * i;
            const rayGrad = ctx.createLinearGradient(0, 0, Math.cos(angle) * 300, Math.sin(angle) * 300);
            rayGrad.addColorStop(0, `rgba(255, 215, 0, ${0.3 * anim.textScale})`);
            rayGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
            ctx.fillStyle = rayGrad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle - 0.12) * 350, Math.sin(angle - 0.12) * 350);
            ctx.lineTo(Math.cos(angle + 0.12) * 350, Math.sin(angle + 0.12) * 350);
            ctx.fill();
        }
        ctx.restore();

        // Orbiting star particles
        anim.starParticles.forEach(sp => {
            sp.dist += (sp.targetDist - sp.dist) * 0.06;
            sp.rotation += sp.rotSpeed;
            const px = cx + Math.cos(sp.angle + anim.starAngle * 0.5) * sp.dist;
            const py = cy + Math.sin(sp.angle + anim.starAngle * 0.5) * sp.dist;
            ctx.globalAlpha = anim.textScale;
            drawStar(px, py, sp.size * 0.3, sp.size, 4, sp.color);
            ctx.globalAlpha = 1;
        });

        // Giant level number
        const scale = anim.textScale;
        ctx.save();
        ctx.translate(cx, cy - 20);
        ctx.scale(scale, scale);

        // "LEVEL" text
        ctx.font = 'bold 28px "Orbitron", "Press Start 2P", sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#FF4D6A';
        ctx.lineWidth = 4;
        ctx.strokeText('LEVEL', 0, -50);
        ctx.fillStyle = '#FFF';
        ctx.fillText('LEVEL', 0, -50);

        // Big level number
        ctx.font = `bold 80px "Orbitron", "Press Start 2P", sans-serif`;
        // Gold gradient text
        const numGrad = ctx.createLinearGradient(-40, -30, 40, 30);
        numGrad.addColorStop(0, '#FFD700');
        numGrad.addColorStop(0.5, '#FFF5C2');
        numGrad.addColorStop(1, '#FFD700');
        ctx.strokeStyle = '#FF6B00';
        ctx.lineWidth = 6;
        ctx.lineJoin = 'round';
        ctx.strokeText(level.toString(), 0, 30);
        ctx.fillStyle = numGrad;
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 20;
        ctx.fillText(level.toString(), 0, 30);
        ctx.shadowBlur = 0;

        // "COMPLETE!" / subtitle
        const lvlIcon = theme ? theme.icon : '🎮';
        ctx.font = 'bold 18px "Segoe UI", sans-serif';
        ctx.fillStyle = '#67E8F9';
        ctx.fillText(`${lvlIcon} Keep Going! ${lvlIcon}`, 0, 70);

        // Target display
        ctx.font = '14px "Segoe UI", sans-serif';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(`Next target: ${target.toLocaleString()}`, 0, 100);

        ctx.restore();
        ctx.restore();
    }

    // ══════════════════════════════════════════════════
    // PREMIUM HUD — Glass-effect backdrop with glow
    // ══════════════════════════════════════════════════
    function drawHUD(w, h) {
        const hudH = gridOffsetY - 8;

        // Glass-effect HUD background
        const hudGrad = ctx.createLinearGradient(0, 0, 0, hudH);
        hudGrad.addColorStop(0, 'rgba(10, 3, 25, 0.92)');
        hudGrad.addColorStop(0.5, 'rgba(15, 5, 30, 0.85)');
        hudGrad.addColorStop(1, 'rgba(20, 8, 40, 0.6)');
        ctx.fillStyle = hudGrad;
        ctx.fillRect(0, 0, w, hudH);

        // Inner light strip (top)
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(0, 0, w, 1);

        // Animated bottom border glow (pulses subtly)
        const borderPulse = 0.5 + Math.sin(frameCount * 0.04) * 0.15;
        const borderGrad = ctx.createLinearGradient(0, 0, w, 0);
        borderGrad.addColorStop(0, 'rgba(168, 85, 247, 0)');
        borderGrad.addColorStop(0.2, `rgba(168, 85, 247, ${borderPulse * 0.5})`);
        borderGrad.addColorStop(0.5, `rgba(244, 63, 94, ${borderPulse * 0.7})`);
        borderGrad.addColorStop(0.8, `rgba(168, 85, 247, ${borderPulse * 0.5})`);
        borderGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
        ctx.fillStyle = borderGrad;
        ctx.fillRect(0, hudH - 3, w, 3);
        // Extra glow bloom on border
        ctx.fillStyle = borderGrad;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(0, hudH - 8, w, 8);
        ctx.globalAlpha = 1;

        // Player info (left) with text shadow
        ctx.font = 'bold 17px "Segoe UI", system-ui';
        ctx.textAlign = 'left';
        const pEmoji = player?.emoji || '🎮';
        const pName = player?.name || 'Player';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = player?.color || '#A855F7';
        ctx.fillText(`${pEmoji} ${pName}`, 14, hudH / 2 + 5);
        ctx.shadowBlur = 0;

        // ── Score (center, big & gold with enhanced glow) ──
        ctx.font = 'bold 26px "Orbitron", "Segoe UI", system-ui';
        ctx.textAlign = 'center';
        // Score outer glow
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 12;
        const scoreGrad = ctx.createLinearGradient(w/2 - 60, 0, w/2 + 60, 0);
        scoreGrad.addColorStop(0, '#FFD700');
        scoreGrad.addColorStop(0.3, '#FFF5C2');
        scoreGrad.addColorStop(0.5, '#FFFFFF');
        scoreGrad.addColorStop(0.7, '#FFF5C2');
        scoreGrad.addColorStop(1, '#FFD700');
        // Score outline for depth
        ctx.strokeStyle = 'rgba(200,150,0,0.4)';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeText(score.toLocaleString(), w / 2, hudH / 2 + 8);
        ctx.fillStyle = scoreGrad;
        ctx.fillText(score.toLocaleString(), w / 2, hudH / 2 + 8);
        ctx.shadowBlur = 0;

        // ── Level + Target (right) ──
        ctx.font = 'bold 13px "Segoe UI", system-ui';
        ctx.textAlign = 'right';
        ctx.shadowColor = '#67E8F9';
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#67E8F9';
        ctx.fillText(`Level ${level}`, w - 14, hudH / 2 - 8);
        ctx.shadowBlur = 0;
        ctx.font = '12px "Segoe UI", system-ui';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(`Target: ${target.toLocaleString()}`, w - 14, hudH / 2 + 6);

        // Progress bar with glow
        const barW = 130, barH = 8;
        const barX = w - 14 - barW;
        const barY = hudH / 2 + 14;
        const progress = Math.min(score / target, 1);
        // Bar background
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        roundRectPath(ctx, barX, barY, barW, barH, 4); ctx.fill();
        // Bar border
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        roundRectPath(ctx, barX, barY, barW, barH, 4); ctx.stroke();
        // Bar fill with candy gradient + glow
        if (progress > 0) {
            const fillW = barW * progress;
            const fillGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
            fillGrad.addColorStop(0, '#FF4D6A');
            fillGrad.addColorStop(0.5, '#F43F5E');
            fillGrad.addColorStop(1, '#FFD700');
            ctx.shadowColor = '#FF4D6A';
            ctx.shadowBlur = 6;
            ctx.fillStyle = fillGrad;
            roundRectPath(ctx, barX, barY, fillW, barH, 4); ctx.fill();
            ctx.shadowBlur = 0;
            // Shine on progress bar
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            roundRectPath(ctx, barX, barY, fillW, barH / 2, [4,4,0,0]); ctx.fill();
            // Animated shine sweep
            const sweepX = barX + ((frameCount * 1.5) % (fillW + 20)) - 10;
            if (sweepX < barX + fillW) {
                const sweepGrad = ctx.createLinearGradient(sweepX - 10, 0, sweepX + 10, 0);
                sweepGrad.addColorStop(0, 'rgba(255,255,255,0)');
                sweepGrad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
                sweepGrad.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = sweepGrad;
                ctx.fillRect(Math.max(barX, sweepX - 10), barY, 20, barH);
            }
        }

        // ── Combo indicator (below score, with glow backdrop) ──
        if (combo > 1) {
            const comboColors = ['','','#FFD700','#FF6B00','#FF4D6A','#A855F7'];
            const cColor = comboColors[Math.min(combo, 5)] || '#FFD700';
            ctx.font = `bold 15px "Segoe UI", system-ui`;
            ctx.textAlign = 'center';

            // Combo glow backdrop
            const comboText = combo >= 5 ? `🔥 ×${combo} FEVER! 🔥` : combo >= 3 ? `🔥 ×${combo} Combo!` : `×${combo} Combo`;
            const comboW = ctx.measureText(comboText).width + 16;
            roundRectPath(ctx, w / 2 - comboW / 2, hudH - 16, comboW, 18, 6);
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fill();

            ctx.fillStyle = cColor;
            ctx.shadowColor = cColor;
            ctx.shadowBlur = 8;
            ctx.fillText(comboText, w / 2, hudH - 2);
            ctx.shadowBlur = 0;
        }
    }

    // ── Color helpers ──
    function darken(hex, amount) {
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        return `rgb(${Math.round(r*(1-amount))},${Math.round(g*(1-amount))},${Math.round(b*(1-amount))})`;
    }

    // ── Input ──
    function getGridPos(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const mx = (clientX - rect.left) * scaleX;
        const my = (clientY - rect.top) * scaleY;
        return { row: Math.floor((my - gridOffsetY) / blockSize), col: Math.floor((mx - gridOffsetX) / blockSize) };
    }

    function handleClick(e) {
        if (animating || !gameActive || levelUpAnim) return;
        const { clientX, clientY } = e.touches ? e.touches[0] : e;
        const { row, col } = getGridPos(clientX, clientY);
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS || !grid[row][col]) return;
        const group = findGroup(row, col);
        if (group.length >= MIN_GROUP) { hoveredGroup = []; popGroup(group); }
    }

    function handleMove(e) {
        if (animating || !gameActive || levelUpAnim) return;
        const { clientX, clientY } = e.touches ? e.touches[0] : e;
        const { row, col } = getGridPos(clientX, clientY);
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS || !grid[row][col]) { hoveredGroup = []; return; }
        hoveredGroup = findGroup(row, col);
        if (hoveredGroup.length < MIN_GROUP) hoveredGroup = [];
    }

    function handleLeave() { hoveredGroup = []; }

    // ── Canvas sizing ──
    function fitCanvas() {
        if (!canvas) return;
        // Use current canvas size (set by app.js) or fall back to parent
        const pw = canvas.width || (canvas.parentElement ? Math.max(320, canvas.parentElement.clientWidth || 480) : 480);
        const ph = canvas.height || (canvas.parentElement ? Math.max(400, canvas.parentElement.clientHeight || 640) : 640);
        if (canvas.width !== pw) canvas.width = pw;
        if (canvas.height !== ph) canvas.height = ph;
        const hudSpace = 60;
        const availH = canvas.height - hudSpace - 20;
        const availW = canvas.width - 20;
        blockSize = Math.floor(Math.min(availW / COLS, availH / ROWS));
        gridOffsetX = Math.round((canvas.width - blockSize * COLS) / 2);
        gridOffsetY = hudSpace;
        if (blockSize > 0) buildEmojiCache(blockSize);
        if (grid.length > 0) updatePositions();
    }

    // ── Public API ──
    function init(canvasEl, activePlayer, gameOverCallback) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        player = activePlayer;
        onGameOver = gameOverCallback;

        // ── Load player's theme ──
        const themeId = activePlayer?.theme || 'retro';
        theme = (typeof ArcadeThemes !== 'undefined') ? ArcadeThemes.get(themeId) : null;
        buildBlockColors();

        highScore = loadHighScore();
        score = 0; level = 1; target = 500;
        combo = 0; lastPopTime = 0;
        totalPopped = 0; maxCombo = 0;
        animating = false; gameActive = true;
        particles = []; floatingTexts = [];
        shakeAmount = 0; hoveredGroup = [];
        startTime = Date.now(); frameCount = 0;
        boardGlow = 0; comboFlashAlpha = 0;
        levelUpAnim = null;

        fitCanvas();
        requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });

        loadSprites();
        initBgStars();
        generateGrid();

        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('mousemove', handleMove);
        canvas.addEventListener('mouseleave', handleLeave);
        canvas.addEventListener('touchstart', handleClick, { passive: true });
        canvas.addEventListener('touchmove', handleMove, { passive: true });
        window.addEventListener('resize', fitCanvas);

        render();
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        window.removeEventListener('resize', fitCanvas);
        if (canvas) {
            canvas.removeEventListener('click', handleClick);
            canvas.removeEventListener('mousemove', handleMove);
            canvas.removeEventListener('mouseleave', handleLeave);
            canvas.removeEventListener('touchstart', handleClick);
            canvas.removeEventListener('touchmove', handleMove);
        }
        canvas = null; ctx = null;
        spriteImages = {}; explosionImages = {}; spritesLoaded = false;
        emojiCache = {}; theme = null; BLOCK_COLORS = [];
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
    }

    return { init, destroy, getScore() { return score; }, getLevel() { return level; }, isActive() { return gameActive; } };
})();
