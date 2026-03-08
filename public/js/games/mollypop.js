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

    // ── Background Stars Init ──
    function initBgStars() {
        bgStars = [];
        for (let i = 0; i < 50; i++) {
            bgStars.push({
                x: Math.random() * 2000,
                y: Math.random() * 2000,
                size: Math.random() * 2.5 + 0.5,
                speed: Math.random() * 0.3 + 0.1,
                twinkle: Math.random() * Math.PI * 2,
                twinkleSpeed: Math.random() * 0.05 + 0.02,
                color: ['#FFD700','#FF6B9D','#A78BFA','#67E8F9','#FFF'][Math.floor(Math.random()*5)],
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

        // ── THEMED EXPLOSION PARTICLES ──
        cells.forEach(([r,c]) => {
            const block = grid[r][c];
            const col = BLOCK_COLORS[block.colorIdx] || BLOCK_COLORS[0];
            const bx = block.x + blockSize/2, by = block.y + blockSize/2;

            // Candy shards (bigger, colorful)
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI * 2 / 6) * i + Math.random() * 0.5;
                const speed = 3 + Math.random() * 6;
                particles.push({
                    x: bx, y: by,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 2,
                    color: i % 2 === 0 ? col.hex : col.light,
                    size: 4 + Math.random() * 5,
                    life: 1, decay: 0.018 + Math.random() * 0.01,
                    type: 'shard', rotation: Math.random() * Math.PI * 2,
                    rotSpeed: (Math.random() - 0.5) * 0.3,
                });
            }
            // Sugar sparkles (tiny white/gold)
            for (let i = 0; i < 4; i++) {
                particles.push({
                    x: bx + (Math.random()-0.5)*blockSize*0.6,
                    y: by + (Math.random()-0.5)*blockSize*0.6,
                    vx: (Math.random()-0.5) * 3,
                    vy: -Math.random() * 4 - 1,
                    color: ['#FFF','#FFD700','#FBBF24','#FFF5F5'][Math.floor(Math.random()*4)],
                    size: 2 + Math.random() * 3,
                    life: 1, decay: 0.025 + Math.random() * 0.02,
                    type: 'sparkle',
                });
            }
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

        // Floating score text (fancier)
        const label = combo > 1 ? `+${totalPoints.toLocaleString()} ×${multiplier}` : `+${totalPoints.toLocaleString()}`;
        floatingTexts.push({
            text: label,
            x: cx, y: cy - 10,
            opacity: 1, vy: -2.5,
            size: cells.length >= 7 ? 34 : cells.length >= 5 ? 28 : 20,
            color: combo > 1 ? '#FFD700' : '#FFF',
            outline: combo > 1 ? '#FF6B00' : '#F43F5E',
            scale: 1.3, // Start big, shrink to 1
        });

        // Themed pop words for big groups
        const pw = theme ? theme.popWords : ['Sweet!', 'Awesome!', 'Amazing!', 'MEGA POP!'];
        const tIcon = theme ? theme.icon : '⭐';
        if (cells.length >= 10) {
            floatingTexts.push({ text: `${tIcon} ${pw[3] || 'MEGA!'} ${tIcon}`, x: cx, y: cy - 50, opacity: 1, vy: -3.5, size: 32, color: '#FFD700', outline: '#FF0080', scale: 1.6 });
        } else if (cells.length >= 7) {
            floatingTexts.push({ text: `✨ ${pw[2] || 'Amazing!'} ✨`, x: cx, y: cy - 45, opacity: 1, vy: -3, size: 28, color: '#FFD700', outline: '#A855F7', scale: 1.4 });
        } else if (cells.length >= 5) {
            floatingTexts.push({ text: `${tIcon} ${pw[0] || 'Nice!'}`, x: cx, y: cy - 40, opacity: 1, vy: -2.5, size: 24, color: '#FFF', outline: BLOCK_COLORS[0]?.hex || '#F43F5E', scale: 1.3 });
        }

        // Screen effects
        if (cells.length >= 7) shakeAmount = Math.min(cells.length * 2, 18);
        if (combo >= 3) comboFlashAlpha = 0.3;
        if (cells.length >= 5) boardGlow = 1;

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

        ctx.save();
        // Screen shake
        if (shakeAmount > 0) {
            ctx.translate((Math.random()-0.5)*shakeAmount, (Math.random()-0.5)*shakeAmount);
            shakeAmount *= 0.85;
            if (shakeAmount < 0.5) shakeAmount = 0;
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

                // Gravity animation with bounce
                const dy = block.targetY - block.y;
                if (Math.abs(dy) > 0.5) {
                    block.y += dy * GRAVITY_SPEED;
                    if (Math.abs(dy) < 2 && block.bounceVel === 0) {
                        block.bounceVel = -BOUNCE_STRENGTH * Math.abs(dy);
                    }
                } else {
                    block.y = block.targetY;
                    if (block.bounceVel !== 0) {
                        block.bounceVel += 0.15;
                        block.y += block.bounceVel;
                        if (block.y >= block.targetY) {
                            block.y = block.targetY;
                            block.bounceVel = 0;
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

    // ── Premium Background (themed) ──
    function drawBackground(w, h) {
        // Deep gradient from theme
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, BG_GRAD[0] || '#0A0015');
        bg.addColorStop(0.5, BG_GRAD[1] || '#050010');
        bg.addColorStop(1, BG_GRAD[0] || '#0A0015');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        // Animated sparkle stars
        bgStars.forEach(star => {
            star.twinkle += star.twinkleSpeed;
            const alpha = 0.3 + Math.sin(star.twinkle) * 0.3;
            const sx = star.x % w;
            const sy = star.y % h;
            ctx.beginPath();
            ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
            ctx.fillStyle = star.color;
            ctx.globalAlpha = alpha;
            ctx.fill();
            // Cross sparkle for bigger stars
            if (star.size > 1.5) {
                ctx.globalAlpha = alpha * 0.5;
                ctx.strokeStyle = star.color;
                ctx.lineWidth = 0.5;
                const len = star.size * 2;
                ctx.beginPath();
                ctx.moveTo(sx - len, sy); ctx.lineTo(sx + len, sy);
                ctx.moveTo(sx, sy - len); ctx.lineTo(sx, sy + len);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        });

        // Subtle radial glow behind grid
        const grd = ctx.createRadialGradient(
            gridOffsetX + COLS*blockSize/2, gridOffsetY + ROWS*blockSize/2,
            50,
            gridOffsetX + COLS*blockSize/2, gridOffsetY + ROWS*blockSize/2,
            COLS*blockSize
        );
        grd.addColorStop(0, 'rgba(168, 85, 247, 0.06)');
        grd.addColorStop(0.5, 'rgba(244, 63, 94, 0.03)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
    }

    // ══════════════════════════════════════════════════
    // DRAW BLOCK — Theme emoji with colored glow
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

        // ── Colored background circle/square with glow ──
        if (!block.popping) {
            ctx.shadowColor = col.hex;
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 2;
        }

        // Background shape (themed: round or sharp)
        const style = theme ? theme.blockStyle : 'round';
        ctx.beginPath();
        if (style === 'round') {
            ctx.arc(cx, cy, size * 0.44, 0, Math.PI * 2);
        } else if (style === 'jagged') {
            // Hexagonal shape for dinos/fire
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 6;
                const px = cx + Math.cos(angle) * size * 0.44;
                const py = cy + Math.sin(angle) * size * 0.44;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
        } else if (style === 'pixel') {
            ctx.roundRect(x + 2, y + 2, size - 4, size - 4, 4);
        } else {
            // sharp = diamond
            ctx.roundRect(x + 1, y + 1, size - 2, size - 2, radius);
        }

        // Fill with gradient
        const grad = ctx.createRadialGradient(cx - size*0.1, cy - size*0.1, 0, cx, cy, size*0.5);
        grad.addColorStop(0, col.light);
        grad.addColorStop(0.6, col.hex);
        grad.addColorStop(1, col.dark);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // ── Draw emoji from cache ──
        const cached = emojiCache[block.colorIdx];
        if (cached) {
            const emojiSize = size * 0.9;
            ctx.drawImage(cached, cx - emojiSize/2, cy - emojiSize/2, emojiSize, emojiSize);
        } else {
            // Direct emoji draw fallback
            ctx.font = `${Math.round(size * 0.55)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(col.emoji, cx, cy + 2);
        }

        // ── Glossy shine overlay ──
        if (!block.popping) {
            ctx.beginPath();
            ctx.ellipse(cx - size * 0.05, cy - size * 0.15, size * 0.28, size * 0.12, -0.2, 0, Math.PI * 2);
            const shineGrad = ctx.createRadialGradient(cx - size * 0.05, cy - size * 0.2, 0, cx - size * 0.05, cy - size * 0.15, size * 0.28);
            shineGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
            shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = shineGrad;
            ctx.fill();
        }

        // ── Animated sparkle ──
        if (!block.popping) {
            block.shine += 0.03;
            const sparkleAlpha = (Math.sin(block.shine + c * 0.7 + r * 0.5) + 1) * 0.15;
            if (sparkleAlpha > 0.1) {
                const sx = x + size * 0.7 + Math.sin(block.shine * 1.3) * size * 0.1;
                const sy = y + size * 0.25 + Math.cos(block.shine * 0.9) * size * 0.05;
                drawStar(sx, sy, 3, 6, 4, `rgba(255,255,255,${sparkleAlpha})`);
            }
        }

        // ── Hover glow ring ──
        if (isHovered && !block.popping) {
            ctx.beginPath();
            ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
            ctx.strokeStyle = '#FFF';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = col.hex;
            ctx.shadowBlur = 14;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Hover group count badge
            if (hoveredGroup.length >= 3) {
                const firstCell = hoveredGroup[0];
                if (firstCell[0] === r && firstCell[1] === c) {
                    const pts = calcPoints(hoveredGroup.length) * Math.min(combo + 1, 5);
                    const badge = `${hoveredGroup.length} = +${pts}`;
                    ctx.font = 'bold 13px "Segoe UI", system-ui';
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#FFD700';
                    ctx.shadowColor = 'rgba(0,0,0,0.8)';
                    ctx.shadowBlur = 4;
                    ctx.fillText(badge, cx, y - 8);
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

    // ── Particles ──
    function drawParticles() {
        particles = particles.filter(p => {
            p.life -= p.decay;
            if (p.life <= 0) return false;

            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15; // gravity

            ctx.save();
            ctx.globalAlpha = p.life;

            if (p.type === 'emoji') {
                ctx.font = `${p.size * p.life}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(p.text, p.x, p.y);
            } else if (p.type === 'shard') {
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
            } else if (p.type === 'sparkle') {
                // Tiny glowing spark
                const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * p.life);
                gradient.addColorStop(0, p.color);
                gradient.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * p.life * 2, 0, Math.PI * 2);
                ctx.fill();
                // Cross sparkle
                drawStar(p.x, p.y, 1, p.size * p.life, 4, p.color);
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

    // ── Floating Score Texts ──
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

            // Outline text for premium look
            if (t.outline) {
                ctx.strokeStyle = t.outline;
                ctx.lineWidth = 4;
                ctx.lineJoin = 'round';
                ctx.strokeText(t.text, t.x, t.y);
            }
            ctx.fillStyle = t.color;
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 6;
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
    // PREMIUM HUD
    // ══════════════════════════════════════════════════
    function drawHUD(w, h) {
        const hudH = gridOffsetY - 8;

        // HUD background with gradient
        const hudGrad = ctx.createLinearGradient(0, 0, 0, hudH);
        hudGrad.addColorStop(0, 'rgba(15, 5, 30, 0.9)');
        hudGrad.addColorStop(1, 'rgba(15, 5, 30, 0.4)');
        ctx.fillStyle = hudGrad;
        ctx.fillRect(0, 0, w, hudH);

        // Bottom border glow
        const borderGrad = ctx.createLinearGradient(0, 0, w, 0);
        borderGrad.addColorStop(0, 'rgba(168, 85, 247, 0)');
        borderGrad.addColorStop(0.3, 'rgba(168, 85, 247, 0.5)');
        borderGrad.addColorStop(0.5, 'rgba(244, 63, 94, 0.6)');
        borderGrad.addColorStop(0.7, 'rgba(168, 85, 247, 0.5)');
        borderGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
        ctx.fillStyle = borderGrad;
        ctx.fillRect(0, hudH - 2, w, 2);

        // Player info (left)
        ctx.font = 'bold 17px "Segoe UI", system-ui';
        ctx.fillStyle = player?.color || '#A855F7';
        ctx.textAlign = 'left';
        const pEmoji = player?.emoji || '🎮';
        const pName = player?.name || 'Player';
        ctx.fillText(`${pEmoji} ${pName}`, 14, hudH / 2 + 5);

        // ── Score (center, big & gold) ──
        ctx.font = 'bold 26px "Orbitron", "Segoe UI", system-ui';
        ctx.textAlign = 'center';
        // Score glow
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 8;
        const scoreGrad = ctx.createLinearGradient(w/2 - 60, 0, w/2 + 60, 0);
        scoreGrad.addColorStop(0, '#FFD700');
        scoreGrad.addColorStop(0.5, '#FFF5C2');
        scoreGrad.addColorStop(1, '#FFD700');
        ctx.fillStyle = scoreGrad;
        ctx.fillText(score.toLocaleString(), w / 2, hudH / 2 + 8);
        ctx.shadowBlur = 0;

        // ── Level + Target (right) ──
        ctx.font = 'bold 13px "Segoe UI", system-ui';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#67E8F9';
        ctx.fillText(`Level ${level}`, w - 14, hudH / 2 - 8);
        ctx.font = '12px "Segoe UI", system-ui';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(`Target: ${target.toLocaleString()}`, w - 14, hudH / 2 + 6);

        // Progress bar
        const barW = 130, barH = 8;
        const barX = w - 14 - barW;
        const barY = hudH / 2 + 14;
        const progress = Math.min(score / target, 1);
        // Bar background
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 4); ctx.fill();
        // Bar fill with candy gradient
        if (progress > 0) {
            const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW * progress, 0);
            fillGrad.addColorStop(0, '#FF4D6A');
            fillGrad.addColorStop(0.5, '#F43F5E');
            fillGrad.addColorStop(1, '#FFD700');
            ctx.fillStyle = fillGrad;
            ctx.beginPath(); ctx.roundRect(barX, barY, barW * progress, barH, 4); ctx.fill();
            // Shine on progress bar
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.beginPath(); ctx.roundRect(barX, barY, barW * progress, barH / 2, [4,4,0,0]); ctx.fill();
        }

        // ── Combo indicator (below score) ──
        if (combo > 1) {
            const comboColors = ['','','#FFD700','#FF6B00','#FF4D6A','#A855F7'];
            const cColor = comboColors[Math.min(combo, 5)] || '#FFD700';
            ctx.font = `bold 15px "Segoe UI", system-ui`;
            ctx.textAlign = 'center';
            ctx.fillStyle = cColor;
            ctx.shadowColor = cColor;
            ctx.shadowBlur = 6;
            const comboText = combo >= 5 ? `🔥 ×${combo} FEVER! 🔥` : combo >= 3 ? `🔥 ×${combo} Combo!` : `×${combo} Combo`;
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

        const container = canvas.parentElement;
        canvas.width = Math.max(320, container.clientWidth || 480);
        canvas.height = Math.max(400, container.clientHeight || 640);

        const hudSpace = 60;
        const availH = canvas.height - hudSpace - 20;
        const availW = canvas.width - 20;
        blockSize = Math.floor(Math.min(availW / COLS, availH / ROWS));
        gridOffsetX = Math.round((canvas.width - blockSize * COLS) / 2);
        gridOffsetY = hudSpace;

        score = 0; level = 1; target = 500;
        combo = 0; lastPopTime = 0;
        totalPopped = 0; maxCombo = 0;
        animating = false; gameActive = true;
        particles = []; floatingTexts = [];
        shakeAmount = 0; hoveredGroup = [];
        startTime = Date.now(); frameCount = 0;
        boardGlow = 0; comboFlashAlpha = 0;
        levelUpAnim = null;

        // Build emoji cache at block size for fast rendering
        buildEmojiCache(blockSize);
        loadSprites();
        initBgStars();
        generateGrid();

        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('mousemove', handleMove);
        canvas.addEventListener('mouseleave', handleLeave);
        canvas.addEventListener('touchstart', handleClick, { passive: true });
        canvas.addEventListener('touchmove', handleMove, { passive: true });

        render();
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
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
