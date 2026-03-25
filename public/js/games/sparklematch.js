/* Sparkle Match — Magical match-3 gem puzzle for Your World Arcade
   Sprite-based rendering with real gem PNG assets */
window.SparkleMatch = (() => {

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
    // ── Constants ──
    const GAME_W = 480, GAME_H = 640;
    const COLS = 8, ROWS = 8;
    const CELL = 48;
    const GRID_X = (GAME_W - COLS * CELL) / 2;
    const GRID_Y = 100;
    const SWAP_MS = 180;
    const FALL_SPEED = 12;
    const MATCH_FLASH_MS = 300;
    const COMBO_DISPLAY_MS = 1200;
    const MAGIC_FILL_PER_COMBO = 0.08;
    const MAGIC_FILL_PER_MATCH = 0.02;
    const TIME_LIMIT = 90;
    const BASE_GEM_COLORS = 5;
    const MAX_GEM_COLORS = 7;
    const LEVEL_SCORE_BASE = 2000;
    const LEVEL_SCORE_MULT = 1.5;
    const FROZEN_START_LEVEL = 4;

    // Gem types
    const GEM_RUBY = 0, GEM_SAPPHIRE = 1, GEM_EMERALD = 2, GEM_AMETHYST = 3;
    const GEM_TOPAZ = 4, GEM_DIAMOND = 5, GEM_ROSE = 6;
    const GEM_NAMES = ['Ruby', 'Sapphire', 'Emerald', 'Amethyst', 'Topaz', 'Diamond', 'Rose'];
    const GEM_COLORS = [
        { base: '#E31B3C', light: '#FF6B8A', dark: '#8B0020', glow: '#FF2050', facet: '#FF4060' },
        { base: '#2563EB', light: '#60A5FA', dark: '#1E3A6E', glow: '#4090FF', facet: '#5080FF' },
        { base: '#16A34A', light: '#4ADE80', dark: '#0A5C2B', glow: '#30E060', facet: '#30C050' },
        { base: '#9333EA', light: '#C084FC', dark: '#5B1D99', glow: '#B050FF', facet: '#A040EE' },
        { base: '#EAB308', light: '#FDE047', dark: '#8B6D08', glow: '#FFD030', facet: '#FFCC20' },
        { base: '#E0E7FF', light: '#FFFFFF', dark: '#9CA3C0', glow: '#F0F4FF', facet: '#D0D8F0' },
        { base: '#F472B6', light: '#FBCFE8', dark: '#9D1760', glow: '#FF80C0', facet: '#FF70B0' },
    ];

    // Special gem types
    const SP_NONE = 0, SP_STAR = 1, SP_RAINBOW = 2, SP_BOMB = 3;

    // Game states
    const ST_TITLE = 0, ST_PLAY = 1, ST_SWAP = 2, ST_MATCH = 3, ST_FALL = 4, ST_GAMEOVER = 5;

    // ── Sprite system ──
    const SPRITES = {};
    let spritesLoaded = false;
    const SPRITE_PATHS = {
        gem1:       '/img/game-assets/gems/gem1.png',
        gem2:       '/img/game-assets/gems/gem2.png',
        gem3:       '/img/game-assets/gems/gem3.png',
        gem4:       '/img/game-assets/gems/gem4.png',
        gem5:       '/img/game-assets/gems/gem5.png',
        bg:         '/img/game-assets/match3-candy/PNG/bg.png',
        star:       '/img/game-assets/kenney-ui/star.png',
        particle1:  '/img/game-assets/kenney-particles/particleWhite_1.png',
        particle2:  '/img/game-assets/kenney-particles/particleWhite_2.png',
        particle3:  '/img/game-assets/kenney-particles/particleWhite_3.png',
        particle4:  '/img/game-assets/kenney-particles/particleWhite_4.png',
        particle5:  '/img/game-assets/kenney-particles/particleWhite_5.png',
        particle6:  '/img/game-assets/kenney-particles/particleWhite_6.png',
        particle7:  '/img/game-assets/kenney-particles/particleWhite_7.png',
    };
    const SPRITE_LOADED = {};

    // Map gem color index to sprite key
    // 0-4 map to gem1-gem5 directly; 5,6 reuse gem sprites with tinting
    const GEM_SPRITE_MAP = ['gem1', 'gem2', 'gem3', 'gem4', 'gem5', 'gem1', 'gem2'];
    // Tint colors for gem indices 5 (Diamond) and 6 (Rose) that reuse sprites
    const GEM_TINT = [null, null, null, null, null, '#E0E7FF', '#F472B6'];

    // Tinted sprite cache for gems 5 and 6
    const TINTED_CACHE = {};

    function preloadSprites(callback) {
        let loaded = 0;
        const keys = Object.keys(SPRITE_PATHS);
        const total = keys.length;
        if (total === 0) { spritesLoaded = true; callback(); return; }
        for (const key of keys) {
            const img = new Image();
            img.onload = () => {
                SPRITE_LOADED[key] = true;
                loaded++;
                if (loaded >= total) { spritesLoaded = true; buildTintedGems(); callback(); }
            };
            img.onerror = () => {
                SPRITE_LOADED[key] = false;
                loaded++;
                if (loaded >= total) { spritesLoaded = true; buildTintedGems(); callback(); }
            };
            img.src = SPRITE_PATHS[key];
            SPRITES[key] = img;
        }
    }

    function hasSprite(key) {
        return SPRITE_LOADED[key] === true;
    }

    function buildTintedGems() {
        // Create tinted versions for Diamond (5) and Rose (6)
        for (let i = 5; i <= 6; i++) {
            const baseKey = GEM_SPRITE_MAP[i];
            const tint = GEM_TINT[i];
            if (!tint || !hasSprite(baseKey)) continue;
            try {
                const src = SPRITES[baseKey];
                const offC = document.createElement('canvas');
                offC.width = src.naturalWidth || src.width;
                offC.height = src.naturalHeight || src.height;
                const offCtx = offC.getContext('2d');
                offCtx.drawImage(src, 0, 0);
                offCtx.globalCompositeOperation = 'source-atop';
                offCtx.fillStyle = tint;
                offCtx.globalAlpha = 0.45;
                offCtx.fillRect(0, 0, offC.width, offC.height);
                TINTED_CACHE[i] = offC;
            } catch (e) {
                // Fallback to untinted
            }
        }
    }

    function getGemImage(colorIdx) {
        if (colorIdx < 0 || colorIdx >= GEM_SPRITE_MAP.length) return null;
        // Check tinted cache first for gem 5 and 6
        if (TINTED_CACHE[colorIdx]) return TINTED_CACHE[colorIdx];
        const key = GEM_SPRITE_MAP[colorIdx];
        if (hasSprite(key)) return SPRITES[key];
        return null;
    }

    function getParticleImage() {
        const idx = Math.floor(Math.random() * 7) + 1;
        const key = 'particle' + idx;
        if (hasSprite(key)) return SPRITES[key];
        return null;
    }

    // High score tracking
    const LS_KEY = 'sparklematch_highscore';
    function loadHighScore() { try { return parseInt(localStorage.getItem(LS_KEY)) || 0; } catch { return 0; } }
    function saveHighScore(s) { try { localStorage.setItem(LS_KEY, s); } catch {} }
    let highScore = 0;

    // ── State ──
    let canvas, ctx, W, H, SCALE, DPR, animFrame, gameActive = false;
    let activePlayer, gameOverCB, playerColor;
    let state, frameCount, lastTime, deltaTime;
    let score, level, combo, comboTimer, comboText;
    let timeLeft, timerStart;
    let magicMeter, magicReady;
    let grid; // 2D array of {color, special, frozen, y, targetY, alpha, removing, sparkle}
    let selected; // {row, col} or null
    let cursor; // {row, col} for keyboard
    let swapAnim; // {r1,c1,r2,c2, progress, reverting}
    let particles;
    let bgSparkles;
    let scorePopups;
    let gemCount;
    let levelTarget;
    let matchesFound;
    let processing; // true during match/fall cascade
    let touchStart;
    let audioCtx;
    let shakeTimer, shakeIntensity;

    // ── Helpers ──
    const gs = v => v * SCALE;
    const rng = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    // Overshoot bounce for gem swap — goes to ~1.1 then settles
    const easeOutBounceSwap = t => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };
    const HAS_TOUCH = ('ontouchstart' in window);

    // ── Audio ──
    function ensureAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, dur, type, vol, slide) {
        try {
            ensureAudio();
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, audioCtx.currentTime);
            if (slide) o.frequency.linearRampToValueAtTime(slide, audioCtx.currentTime + dur);
            g.gain.setValueAtTime(vol || 0.08, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + dur);
        } catch {}
    }
    function playChord(freqs, dur, type, vol) {
        freqs.forEach((f, i) => setTimeout(() => playTone(f, dur, type, vol), i * 30));
    }
    function sfxSwap() { playTone(600, 0.06, 'sine', 0.08); setTimeout(() => playTone(800, 0.06, 'sine', 0.08), 40); }
    function sfxMatch() { playTone(880, 0.1, 'sine', 0.1); setTimeout(() => playTone(1100, 0.08, 'sine', 0.1), 60); }
    function sfxCascade(n) {
        const base = 660 + n * 110;
        playTone(base, 0.12, 'sine', 0.1); setTimeout(() => playTone(base * 1.25, 0.1, 'sine', 0.1), 50);
    }
    function sfxSpecialCreate() {
        playChord([523, 659, 784], 0.2, 'sine', 0.12);
    }
    function sfxSpecialActivate() {
        playChord([784, 988, 1175, 1318], 0.3, 'sine', 0.14);
    }
    function sfxCombo(n) {
        const base = 440 + n * 80;
        for (let i = 0; i < Math.min(n + 1, 5); i++) {
            setTimeout(() => playTone(base + i * 120, 0.08, 'triangle', 0.1), i * 50);
        }
    }
    function sfxMagicBurst() {
        for (let i = 0; i < 8; i++) {
            setTimeout(() => playTone(400 + i * 150, 0.15, 'sine', 0.12 - i * 0.01), i * 40);
        }
    }
    function sfxLevelUp() {
        playChord([523, 659, 784, 1047], 0.3, 'sine', 0.14);
    }
    function sfxNoMatch() { playTone(300, 0.12, 'square', 0.06, 200); }
    function sfxSelect() { playTone(660, 0.04, 'sine', 0.06); }

    // ── Grid logic ──
    function makeGem(color, special) {
        return {
            color: color, special: special || SP_NONE,
            frozen: false, y: 0, targetY: 0, alpha: 1,
            removing: false, sparkle: 0, bounceY: 0
        };
    }

    function randomColor() {
        return Math.floor(Math.random() * gemCount);
    }

    function initGrid() {
        grid = [];
        for (let r = 0; r < ROWS; r++) {
            grid[r] = [];
            for (let c = 0; c < COLS; c++) {
                let color;
                do {
                    color = randomColor();
                } while (wouldMatch(r, c, color));
                grid[r][c] = makeGem(color);
                grid[r][c].y = r * CELL;
                grid[r][c].targetY = r * CELL;
            }
        }
        // Add frozen gems for higher levels
        if (level >= FROZEN_START_LEVEL) {
            const frozenCount = Math.min(level - FROZEN_START_LEVEL + 2, 10);
            for (let i = 0; i < frozenCount; i++) {
                const r = Math.floor(Math.random() * ROWS);
                const c = Math.floor(Math.random() * COLS);
                grid[r][c].frozen = true;
            }
        }
    }

    function wouldMatch(row, col, color) {
        if (col >= 2 && grid[row][col - 1] && grid[row][col - 2] &&
            grid[row][col - 1].color === color && grid[row][col - 2].color === color) return true;
        if (row >= 2 && grid[row - 1] && grid[row - 2] &&
            grid[row - 1][col] && grid[row - 2][col] &&
            grid[row - 1][col].color === color && grid[row - 2][col].color === color) return true;
        return false;
    }

    function findMatches() {
        const matched = [];
        // Horizontal
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS - 2; c++) {
                if (grid[r][c].color < 0) continue;
                const col = grid[r][c].color;
                let len = 1;
                while (c + len < COLS && grid[r][c + len].color === col) len++;
                if (len >= 3) {
                    const cells = [];
                    for (let i = 0; i < len; i++) cells.push({ r: r, c: c + i });
                    matched.push({ cells, len, dir: 'h', startR: r, startC: c });
                    c += len - 1;
                }
            }
        }
        // Vertical
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS - 2; r++) {
                if (grid[r][c].color < 0) continue;
                const col = grid[r][c].color;
                let len = 1;
                while (r + len < ROWS && grid[r + len][c].color === col) len++;
                if (len >= 3) {
                    const cells = [];
                    for (let i = 0; i < len; i++) cells.push({ r: r + i, c: c });
                    matched.push({ cells, len, dir: 'v', startR: r, startC: c });
                    r += len - 1;
                }
            }
        }
        return matched;
    }

    function detectSpecial(matches) {
        const cellMap = {};
        matches.forEach((m, mi) => {
            m.cells.forEach(cell => {
                const key = cell.r + ',' + cell.c;
                if (!cellMap[key]) cellMap[key] = [];
                cellMap[key].push(mi);
            });
        });
        const specials = [];
        const usedMatches = new Set();

        // L/T shape detection
        for (const key in cellMap) {
            if (cellMap[key].length >= 2) {
                const [r, c] = key.split(',').map(Number);
                specials.push({ r, c, type: SP_BOMB });
                cellMap[key].forEach(mi => usedMatches.add(mi));
            }
        }

        // Remaining single matches
        matches.forEach((m, mi) => {
            if (usedMatches.has(mi)) return;
            if (m.len >= 5) {
                const mid = Math.floor(m.len / 2);
                specials.push({ r: m.cells[mid].r, c: m.cells[mid].c, type: SP_RAINBOW });
            } else if (m.len === 4) {
                specials.push({ r: m.cells[1].r, c: m.cells[1].c, type: SP_STAR });
            }
        });

        return specials;
    }

    function processMatches() {
        const matches = findMatches();
        if (matches.length === 0) return false;

        matchesFound = true;
        combo++;
        comboTimer = COMBO_DISPLAY_MS;

        const specials = detectSpecial(matches);
        const allCells = new Set();
        let points = 0;

        // Collect all matched cells
        matches.forEach(m => {
            m.cells.forEach(cell => {
                allCells.add(cell.r + ',' + cell.c);
                points += 10 * combo;
            });
        });

        // Process special gem activations
        allCells.forEach(key => {
            const [r, c] = key.split(',').map(Number);
            const gem = grid[r][c];
            if (gem.special !== SP_NONE) {
                activateSpecial(gem, r, c, allCells);
            }
        });

        // Handle frozen gems adjacent to matches
        allCells.forEach(key => {
            const [r, c] = key.split(',').map(Number);
            [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([nr, nc]) => {
                if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && grid[nr][nc].frozen) {
                    grid[nr][nc].frozen = false;
                    spawnParticles(nc * CELL + GRID_X + CELL/2, nr * CELL + GRID_Y + CELL/2, '#88DDFF', 8);
                }
            });
        });

        // Remove matched gems and spawn particles
        allCells.forEach(key => {
            const [r, c] = key.split(',').map(Number);
            const gem = grid[r][c];
            const px = c * CELL + GRID_X + CELL / 2;
            const py = gem.y + GRID_Y + CELL / 2;
            const gc = GEM_COLORS[gem.color] || GEM_COLORS[0];
            spawnParticles(px, py, gc.glow, 12);
            spawnParticles(px, py, gc.light, 6);
            gem.removing = true;
            gem.color = -1;
        });

        // Better approach: place specials after clearing
        const specialPlacements = specials.map(sp => ({
            r: sp.r, c: sp.c, type: sp.type,
            color: findMatchColor(matches, sp.r, sp.c)
        }));

        // Mark score
        score += points;
        magicMeter = Math.min(1, magicMeter + MAGIC_FILL_PER_MATCH * matches.length + MAGIC_FILL_PER_COMBO * combo);
        if (magicMeter >= 1) magicReady = true;

        // Combo text
        if (combo >= 4) comboText = 'MAGICAL!';
        else if (combo >= 3) comboText = combo + 'x SPARKLE!';
        else if (combo >= 2) comboText = combo + 'x COMBO!';
        else comboText = '';

        if (combo >= 2) { sfxCombo(combo); if (combo >= 3) cascadeFlashAlpha = 1; }
        else sfxMatch();

        // Score popup
        if (points > 0) {
            scorePopups.push({
                x: GAME_W / 2, y: GRID_Y + ROWS * CELL / 2,
                text: '+' + points, timer: 1.0, color: combo >= 3 ? '#FFD700' : '#FFFFFF'
            });
        }

        // Apply removals and place specials
        setTimeout(() => {
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (grid[r][c].removing) {
                        grid[r][c] = makeGem(-1);
                        grid[r][c].y = r * CELL;
                        grid[r][c].targetY = r * CELL;
                    }
                }
            }
            // Place specials
            specialPlacements.forEach(sp => {
                if (sp.color >= 0) {
                    grid[sp.r][sp.c] = makeGem(sp.color, sp.type);
                    grid[sp.r][sp.c].y = sp.r * CELL;
                    grid[sp.r][sp.c].targetY = sp.r * CELL;
                    grid[sp.r][sp.c].sparkle = 1.0;
                    sfxSpecialCreate();
                    const px = sp.c * CELL + GRID_X + CELL / 2;
                    const py = sp.r * CELL + GRID_Y + CELL / 2;
                    spawnParticles(px, py, '#FFD700', 20);
                }
            });
            applyGravity();
        }, MATCH_FLASH_MS);

        return true;
    }

    function findMatchColor(matches, r, c) {
        for (const m of matches) {
            for (const cell of m.cells) {
                if (cell.r === r && cell.c === c) {
                    for (const cell2 of m.cells) {
                        const g = grid[cell2.r][cell2.c];
                        if (g.color >= 0) return g.color;
                    }
                }
            }
        }
        return randomColor();
    }

    function activateSpecial(gem, r, c, allCells) {
        const px = c * CELL + GRID_X + CELL / 2;
        const py = r * CELL + GRID_Y + CELL / 2;

        sfxSpecialActivate();
        shakeTimer = 0.3;
        shakeIntensity = gem.special === SP_RAINBOW ? 6 : 4;

        if (gem.special === SP_STAR) {
            for (let i = 0; i < COLS; i++) allCells.add(r + ',' + i);
            for (let i = 0; i < ROWS; i++) allCells.add(i + ',' + c);
            for (let i = 0; i < COLS; i++) {
                spawnParticles(i * CELL + GRID_X + CELL/2, r * CELL + GRID_Y + CELL/2, '#FFD700', 4);
            }
            for (let i = 0; i < ROWS; i++) {
                spawnParticles(c * CELL + GRID_X + CELL/2, i * CELL + GRID_Y + CELL/2, '#FFD700', 4);
            }
        } else if (gem.special === SP_RAINBOW) {
            const targetColor = gem.color;
            for (let rr = 0; rr < ROWS; rr++) {
                for (let cc = 0; cc < COLS; cc++) {
                    if (grid[rr][cc].color === targetColor) {
                        allCells.add(rr + ',' + cc);
                    }
                }
            }
            for (let i = 0; i < 30; i++) {
                spawnParticles(rng(GRID_X, GRID_X + COLS * CELL), rng(GRID_Y, GRID_Y + ROWS * CELL),
                    pick(['#FF0000','#FF8800','#FFFF00','#00FF00','#0088FF','#8800FF']), 3);
            }
        } else if (gem.special === SP_BOMB) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                        allCells.add(nr + ',' + nc);
                        spawnParticles(nc * CELL + GRID_X + CELL/2, nr * CELL + GRID_Y + CELL/2, '#FF6600', 4);
                    }
                }
            }
        }
    }

    function activateSpecialCombo(gem1, r1, c1, gem2, r2, c2) {
        const allCells = new Set();
        sfxSpecialActivate();
        shakeTimer = 0.5;
        shakeIntensity = 8;

        if (gem1.special === SP_STAR && gem2.special === SP_STAR) {
            for (let i = 0; i < COLS; i++) { allCells.add(r1 + ',' + i); allCells.add(r2 + ',' + i); }
            for (let i = 0; i < ROWS; i++) { allCells.add(i + ',' + c1); allCells.add(i + ',' + c2); }
        } else if (gem1.special === SP_RAINBOW && gem2.special === SP_RAINBOW) {
            for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) allCells.add(r + ',' + c);
        } else if ((gem1.special === SP_STAR && gem2.special === SP_RAINBOW) ||
                   (gem1.special === SP_RAINBOW && gem2.special === SP_STAR)) {
            const star = gem1.special === SP_STAR ? gem1 : gem2;
            const targetColor = star.color;
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (grid[r][c].color === targetColor) {
                        allCells.add(r + ',' + c);
                        for (let i = 0; i < COLS; i++) allCells.add(r + ',' + i);
                        for (let i = 0; i < ROWS; i++) allCells.add(i + ',' + c);
                    }
                }
            }
        } else if ((gem1.special === SP_BOMB && gem2.special === SP_BOMB)) {
            const cr = Math.round((r1 + r2) / 2), cc = Math.round((c1 + c2) / 2);
            for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
                const nr = cr + dr, nc = cc + dc;
                if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) allCells.add(nr + ',' + nc);
            }
        } else if ((gem1.special === SP_STAR && gem2.special === SP_BOMB) ||
                   (gem1.special === SP_BOMB && gem2.special === SP_STAR)) {
            for (let d = -1; d <= 1; d++) {
                const rr = clamp(r1 + d, 0, ROWS - 1);
                for (let i = 0; i < COLS; i++) allCells.add(rr + ',' + i);
                const cc = clamp(c1 + d, 0, COLS - 1);
                for (let i = 0; i < ROWS; i++) allCells.add(i + ',' + cc);
            }
        } else if ((gem1.special === SP_RAINBOW && gem2.special === SP_BOMB) ||
                   (gem1.special === SP_BOMB && gem2.special === SP_RAINBOW)) {
            const bomb = gem1.special === SP_BOMB ? gem1 : gem2;
            const targetColor = bomb.color;
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (grid[r][c].color === targetColor) {
                        allCells.add(r + ',' + c);
                        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                            const nr = r + dr, nc = c + dc;
                            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) allCells.add(nr + ',' + nc);
                        }
                    }
                }
            }
        }

        // Apply destruction
        let points = 0;
        allCells.forEach(key => {
            const [r, c] = key.split(',').map(Number);
            const gem = grid[r][c];
            if (gem.color >= 0) {
                const px = c * CELL + GRID_X + CELL / 2;
                const py = gem.y + GRID_Y + CELL / 2;
                const gc = GEM_COLORS[gem.color] || GEM_COLORS[0];
                spawnParticles(px, py, gc.glow, 8);
                gem.removing = true;
                gem.color = -1;
                points += 20 * combo;
            }
        });

        score += points;
        if (points > 0) {
            scorePopups.push({
                x: GAME_W / 2, y: GRID_Y + ROWS * CELL / 2,
                text: 'SUPER! +' + points, timer: 1.5, color: '#FFD700'
            });
        }

        setTimeout(() => {
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (grid[r][c].removing) {
                        grid[r][c] = makeGem(-1);
                        grid[r][c].y = r * CELL;
                        grid[r][c].targetY = r * CELL;
                    }
                }
            }
            applyGravity();
        }, MATCH_FLASH_MS);

        return allCells.size > 0;
    }

    function applyGravity() {
        let moved = false;
        for (let c = 0; c < COLS; c++) {
            let emptyRow = ROWS - 1;
            for (let r = ROWS - 1; r >= 0; r--) {
                if (grid[r][c].color >= 0) {
                    if (r !== emptyRow) {
                        grid[emptyRow][c] = grid[r][c];
                        grid[emptyRow][c].targetY = emptyRow * CELL;
                        grid[r][c] = makeGem(-1);
                        grid[r][c].y = r * CELL;
                        grid[r][c].targetY = r * CELL;
                        moved = true;
                    }
                    emptyRow--;
                }
            }
            // Fill from top
            for (let r = emptyRow; r >= 0; r--) {
                const newGem = makeGem(randomColor());
                newGem.y = (r - emptyRow - 1) * CELL;
                newGem.targetY = r * CELL;
                grid[r][c] = newGem;
                moved = true;
            }
        }
        if (moved) {
            state = ST_FALL;
            processing = true;
        } else {
            checkPostFall();
        }
    }

    function checkPostFall() {
        const matches = findMatches();
        if (matches.length > 0) {
            sfxCascade(combo);
            processMatches();
        } else {
            combo = 0;
            processing = false;
            state = ST_PLAY;
            if (score >= levelTarget) {
                advanceLevel();
            }
            if (!hasValidMoves()) {
                shuffleBoard();
            }
        }
    }

    function hasValidMoves() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (c < COLS - 1) {
                    swapGems(r, c, r, c + 1);
                    const has = findMatches().length > 0;
                    swapGems(r, c, r, c + 1);
                    if (has) return true;
                }
                if (r < ROWS - 1) {
                    swapGems(r, c, r + 1, c);
                    const has = findMatches().length > 0;
                    swapGems(r, c, r + 1, c);
                    if (has) return true;
                }
            }
        }
        return false;
    }

    function shuffleBoard() {
        const gems = [];
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c].special === SP_NONE) gems.push(grid[r][c].color);
            }
        }
        for (let i = gems.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [gems[i], gems[j]] = [gems[j], gems[i]];
        }
        let idx = 0;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c].special === SP_NONE) {
                    grid[r][c].color = gems[idx++];
                    grid[r][c].sparkle = 0.5;
                }
            }
        }
        scorePopups.push({
            x: GAME_W / 2, y: GAME_H / 2,
            text: 'SHUFFLE!', timer: 1.5, color: '#88DDFF'
        });
        if (!hasValidMoves()) initGrid();
    }

    function swapGems(r1, c1, r2, c2) {
        const tmp = grid[r1][c1];
        grid[r1][c1] = grid[r2][c2];
        grid[r2][c2] = tmp;
    }

    function trySwap(r1, c1, r2, c2) {
        if (r2 < 0 || r2 >= ROWS || c2 < 0 || c2 >= COLS) return;
        if (grid[r1][c1].frozen || grid[r2][c2].frozen) {
            sfxNoMatch();
            return;
        }

        const g1 = grid[r1][c1], g2 = grid[r2][c2];
        if (g1.special !== SP_NONE && g2.special !== SP_NONE) {
            state = ST_SWAP;
            swapAnim = { r1, c1, r2, c2, progress: 0, reverting: false };
            combo = 1;
            setTimeout(() => {
                swapGems(r1, c1, r2, c2);
                activateSpecialCombo(grid[r1][c1], r1, c1, grid[r2][c2], r2, c2);
            }, SWAP_MS);
            sfxSwap();
            return;
        }

        swapGems(r1, c1, r2, c2);
        const matches = findMatches();
        if (matches.length > 0) {
            state = ST_SWAP;
            swapAnim = { r1, c1, r2, c2, progress: 0, reverting: false };
            swapGems(r1, c1, r2, c2);
            sfxSwap();
        } else {
            swapGems(r1, c1, r2, c2);
            state = ST_SWAP;
            swapAnim = { r1, c1, r2, c2, progress: 0, reverting: true };
            sfxNoMatch();
        }
    }

    function advanceLevel() {
        level++;
        gemCount = Math.min(BASE_GEM_COLORS + Math.floor((level - 1) / 2), MAX_GEM_COLORS);
        levelTarget = Math.floor(LEVEL_SCORE_BASE * Math.pow(LEVEL_SCORE_MULT, level - 1));
        sfxLevelUp();
        scorePopups.push({
            x: GAME_W / 2, y: GAME_H / 2,
            text: 'LEVEL ' + level + '!', timer: 2.0, color: '#FFD700'
        });
        shakeTimer = 0.3;
        shakeIntensity = 4;
        if (level >= FROZEN_START_LEVEL) {
            const frozenCount = Math.min(level - FROZEN_START_LEVEL + 1, 5);
            for (let i = 0; i < frozenCount; i++) {
                const r = Math.floor(Math.random() * ROWS);
                const c = Math.floor(Math.random() * COLS);
                if (!grid[r][c].frozen && grid[r][c].special === SP_NONE) {
                    grid[r][c].frozen = true;
                    spawnParticles(c * CELL + GRID_X + CELL/2, r * CELL + GRID_Y + CELL/2, '#88DDFF', 10);
                }
            }
        }
    }

    function doMagicBurst() {
        if (!magicReady) return;
        magicReady = false;
        magicMeter = 0;
        sfxMagicBurst();
        shakeTimer = 0.6;
        shakeIntensity = 10;
        combo = 1;

        const cells = [];
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c].color >= 0) cells.push({ r, c });
            }
        }
        for (let i = cells.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cells[i], cells[j]] = [cells[j], cells[i]];
        }
        const toRemove = cells.slice(0, Math.floor(cells.length * 0.6));
        let pts = 0;
        toRemove.forEach(({ r, c }) => {
            const gem = grid[r][c];
            const px = c * CELL + GRID_X + CELL / 2;
            const py = gem.y + GRID_Y + CELL / 2;
            spawnParticles(px, py, pick(['#FF80C0','#FFD700','#80FFFF','#FF6060','#80FF80','#C080FF']), 10);
            gem.color = -1;
            gem.removing = true;
            pts += 15;
        });
        score += pts;
        scorePopups.push({
            x: GAME_W / 2, y: GAME_H / 2 - 30,
            text: 'MAGIC BURST! +' + pts, timer: 2.0, color: '#FF80FF'
        });

        setTimeout(() => {
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (grid[r][c].removing) {
                        grid[r][c] = makeGem(-1);
                        grid[r][c].y = r * CELL;
                        grid[r][c].targetY = r * CELL;
                    }
                }
            }
            applyGravity();
        }, MATCH_FLASH_MS + 100);
    }

    // ── Particles ──
    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x, y,
                vx: rng(-3, 3), vy: rng(-4, 1),
                life: rng(0.4, 1.0),
                maxLife: rng(0.4, 1.0),
                size: rng(2, 5),
                color: color,
                sparkle: Math.random() > 0.5,
                spriteImg: getParticleImage(),
                rotation: rng(0, Math.PI * 2),
                rotSpeed: rng(-3, 3)
            });
        }
    }

    // ── Drawing ──

    // Fallback canvas-drawn gem (used when sprites fail to load)
    function drawGemCanvas(x, y, size, color, alpha) {
        if (color < 0 || color >= GEM_COLORS.length) return;
        const gc = GEM_COLORS[color];
        const s = size * 0.42;
        const cx = x + size / 2;
        const cy = y + size / 2;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Outer glow
        const glowGrad = ctx.createRadialGradient(cx, cy, s * 0.3, cx, cy, s * 1.2);
        glowGrad.addColorStop(0, gc.glow + '40');
        glowGrad.addColorStop(1, gc.glow + '00');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Main gem body
        ctx.beginPath();
        const facets = 8;
        for (let i = 0; i < facets; i++) {
            const angle = (Math.PI * 2 * i / facets) - Math.PI / 8;
            const r = s * (i % 2 === 0 ? 1 : 0.92);
            const px = cx + Math.cos(angle) * r;
            const py = cy + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();

        const bodyGrad = ctx.createRadialGradient(cx - s * 0.3, cy - s * 0.3, 0, cx, cy, s);
        bodyGrad.addColorStop(0, gc.light);
        bodyGrad.addColorStop(0.4, gc.base);
        bodyGrad.addColorStop(1, gc.dark);
        ctx.fillStyle = bodyGrad;
        ctx.fill();

        // Facet highlights
        ctx.strokeStyle = gc.facet + '60';
        ctx.lineWidth = gs(1);
        for (let i = 0; i < facets; i++) {
            const angle = (Math.PI * 2 * i / facets) - Math.PI / 8;
            const outerR = s * (i % 2 === 0 ? 1 : 0.92);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * outerR * 0.6, cy + Math.sin(angle) * outerR * 0.6);
            ctx.stroke();
        }

        // Inner facet ring
        ctx.beginPath();
        for (let i = 0; i < facets; i++) {
            const angle = (Math.PI * 2 * i / facets) - Math.PI / 8;
            const r = s * 0.5;
            const px = cx + Math.cos(angle) * r;
            const py = cy + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = gc.light + '30';
        ctx.lineWidth = gs(0.5);
        ctx.stroke();

        // Shine
        const shineGrad = ctx.createRadialGradient(cx - s * 0.25, cy - s * 0.25, 0, cx - s * 0.2, cy - s * 0.2, s * 0.5);
        shineGrad.addColorStop(0, '#FFFFFF80');
        shineGrad.addColorStop(1, '#FFFFFF00');
        ctx.fillStyle = shineGrad;
        ctx.beginPath();
        ctx.arc(cx - s * 0.2, cy - s * 0.2, s * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function drawGem(x, y, size, color, special, alpha, sparkleAmt, frozen) {
        if (color < 0 || color >= GEM_COLORS.length) return;
        const gc = GEM_COLORS[color];
        const cx = x + size / 2;
        const cy = y + size / 2;
        const s = size * 0.42;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Try sprite rendering; fall back to canvas if sprite unavailable
        const gemImg = getGemImage(color);
        if (gemImg) {
            // Subtle glow behind sprite
            const glowGrad = ctx.createRadialGradient(cx, cy, size * 0.15, cx, cy, size * 0.55);
            glowGrad.addColorStop(0, gc.glow + '30');
            glowGrad.addColorStop(1, gc.glow + '00');
            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, size * 0.55, 0, Math.PI * 2);
            ctx.fill();

            // Draw the gem sprite centered in the cell with padding
            const pad = size * 0.08;
            ctx.drawImage(gemImg, x + pad, y + pad, size - pad * 2, size - pad * 2);

            // Tiny animated sparkle dot on the gem
            const sparkTime = (frameCount * 0.05 + color * 0.7) % (Math.PI * 2);
            const sparkAlpha = (Math.sin(sparkTime) * 0.5 + 0.5) * 0.6;
            ctx.globalAlpha = alpha * sparkAlpha;
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(cx - size * 0.12, cy - size * 0.18, gs(1.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = alpha;
        } else {
            // Fallback: full canvas-drawn gem
            drawGemCanvas(x, y, size, color, alpha);
        }

        // Sparkle animation (when newly created/special)
        if (sparkleAmt > 0) {
            ctx.globalAlpha = alpha * sparkleAmt;
            for (let i = 0; i < 4; i++) {
                const sa = (frameCount * 0.1 + i * Math.PI / 2) % (Math.PI * 2);
                const sr = s * 0.6 + Math.sin(frameCount * 0.15 + i) * s * 0.2;
                ctx.fillStyle = '#FFFFFF';
                drawStarShape(cx + Math.cos(sa) * sr, cy + Math.sin(sa) * sr, gs(2), 4);
            }
            ctx.globalAlpha = alpha;
        }

        // Special gem overlays (drawn on top of sprite)
        if (special === SP_STAR) {
            ctx.globalAlpha = alpha * 0.7;
            const rayAngle = frameCount * 0.04;
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = gs(1.5);
            for (let i = 0; i < 4; i++) {
                const a = rayAngle + i * Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * s * 0.3, cy + Math.sin(a) * s * 0.3);
                ctx.lineTo(cx + Math.cos(a) * s * 1.1, cy + Math.sin(a) * s * 1.1);
                ctx.stroke();
            }
            // Center star — use sprite if available
            ctx.globalAlpha = alpha * 0.9;
            if (hasSprite('star')) {
                const starSize = s * 0.7;
                ctx.drawImage(SPRITES.star, cx - starSize, cy - starSize, starSize * 2, starSize * 2);
            } else {
                ctx.fillStyle = '#FFD700';
                drawStarShape(cx, cy, s * 0.3, 4);
            }
            ctx.globalAlpha = alpha;
        } else if (special === SP_RAINBOW) {
            const hue = (frameCount * 3) % 360;
            ctx.strokeStyle = `hsl(${hue}, 100%, 70%)`;
            ctx.lineWidth = gs(2);
            ctx.beginPath();
            ctx.arc(cx, cy, s * 0.85, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = alpha * 0.5;
            try {
                const rGrad = ctx.createConicGradient(frameCount * 0.05, cx, cy);
                rGrad.addColorStop(0, '#FF0000');
                rGrad.addColorStop(0.17, '#FF8800');
                rGrad.addColorStop(0.33, '#FFFF00');
                rGrad.addColorStop(0.5, '#00FF00');
                rGrad.addColorStop(0.67, '#0088FF');
                rGrad.addColorStop(0.83, '#8800FF');
                rGrad.addColorStop(1, '#FF0000');
                ctx.fillStyle = rGrad;
            } catch (e) {
                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            }
            ctx.beginPath();
            ctx.arc(cx, cy, s * 0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = alpha;
        } else if (special === SP_BOMB) {
            const pulse = Math.sin(frameCount * 0.1) * 0.2 + 0.8;
            ctx.globalAlpha = alpha * 0.6;
            ctx.strokeStyle = '#FF6600';
            ctx.lineWidth = gs(2);
            ctx.beginPath();
            ctx.arc(cx, cy, s * pulse, 0, Math.PI * 2);
            ctx.stroke();
            const ring = (frameCount * 0.03) % 1;
            ctx.globalAlpha = alpha * (1 - ring) * 0.4;
            ctx.strokeStyle = '#FF8800';
            ctx.lineWidth = gs(1);
            ctx.beginPath();
            ctx.arc(cx, cy, s * ring, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = alpha;
        }

        // Frozen overlay
        if (frozen) {
            ctx.globalAlpha = alpha * 0.5;
            ctx.fillStyle = '#AADDFF';
            const facets = 8;
            ctx.beginPath();
            for (let i = 0; i < facets; i++) {
                const angle = (Math.PI * 2 * i / facets) - Math.PI / 8;
                const r = s * (i % 2 === 0 ? 1 : 0.92);
                const px = cx + Math.cos(angle) * r;
                const py = cy + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            // Ice crystal lines
            ctx.strokeStyle = '#FFFFFF80';
            ctx.lineWidth = gs(1);
            for (let i = 0; i < 3; i++) {
                const a = i * Math.PI / 3 + 0.3;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * s * 0.2, cy + Math.sin(a) * s * 0.2);
                ctx.lineTo(cx + Math.cos(a) * s * 0.7, cy + Math.sin(a) * s * 0.7);
                ctx.stroke();
                const bx = cx + Math.cos(a) * s * 0.5;
                const by = cy + Math.sin(a) * s * 0.5;
                ctx.beginPath();
                ctx.moveTo(bx, by);
                ctx.lineTo(bx + Math.cos(a + 0.8) * s * 0.2, by + Math.sin(a + 0.8) * s * 0.2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(bx, by);
                ctx.lineTo(bx + Math.cos(a - 0.8) * s * 0.2, by + Math.sin(a - 0.8) * s * 0.2);
                ctx.stroke();
            }
            ctx.globalAlpha = alpha;
        }

        ctx.restore();
    }

    function drawStarShape(cx, cy, r, points) {
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const angle = (Math.PI * i / points) - Math.PI / 2;
            const rad = i % 2 === 0 ? r : r * 0.4;
            const px = cx + Math.cos(angle) * rad;
            const py = cy + Math.sin(angle) * rad;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
    }

    // Draw a star rating using star sprites or fallback
    function drawStarRating(cx, cy, count, maxCount, size) {
        const totalW = maxCount * size * 1.2;
        const startX = cx - totalW / 2 + size * 0.6;
        for (let i = 0; i < maxCount; i++) {
            const sx = startX + i * size * 1.2;
            const filled = i < count;
            ctx.globalAlpha = filled ? 1 : 0.25;
            if (hasSprite('star')) {
                ctx.drawImage(SPRITES.star, sx - size / 2, cy - size / 2, size, size);
            } else {
                ctx.fillStyle = filled ? '#FFD700' : '#555555';
                drawStarShape(sx, cy, size * 0.4, 5);
            }
        }
        ctx.globalAlpha = 1;
    }

    // Cascade screen flash state
    let cascadeFlashAlpha = 0;

    function drawBackground() {
        // Try to draw the bg sprite if available
        if (hasSprite('bg')) {
            ctx.drawImage(SPRITES.bg, 0, 0, W, H);
            // Warm color tint that shifts with level
            const levelHue = (level * 30) % 360;
            ctx.fillStyle = `hsla(${levelHue}, 30%, 15%, 0.5)`;
            ctx.fillRect(0, 0, W, H);
        } else {
            // Fallback rich gradient
            const bgGrad = ctx.createLinearGradient(0, 0, W * 0.5, H);
            bgGrad.addColorStop(0, '#1a0533');
            bgGrad.addColorStop(0.5, '#0d1b3e');
            bgGrad.addColorStop(1, '#1a0533');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, W, H);
        }

        // Floating sparkle particles in background
        bgSparkles.forEach(p => {
            p.y -= p.speed * SCALE;
            p.x += Math.sin(frameCount * 0.02 + p.phase) * 0.3 * SCALE;
            if (p.y < -10) { p.y = H + 10; p.x = rng(0, W); }
            const twinkle = Math.sin(frameCount * 0.05 + p.phase) * 0.4 + 0.6;
            ctx.globalAlpha = p.alpha * twinkle;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * SCALE, 0, Math.PI * 2);
            ctx.fill();
            if (p.size > 1.5) {
                ctx.strokeStyle = p.color;
                ctx.lineWidth = gs(0.5);
                ctx.globalAlpha = p.alpha * twinkle * 0.5;
                const ss = p.size * 2 * SCALE;
                ctx.beginPath();
                ctx.moveTo(p.x - ss, p.y); ctx.lineTo(p.x + ss, p.y);
                ctx.moveTo(p.x, p.y - ss); ctx.lineTo(p.x, p.y + ss);
                ctx.stroke();
            }
        });
        ctx.globalAlpha = 1;

        // Vignette
        const vigGrad = ctx.createRadialGradient(W/2, H/2, H * 0.3, W/2, H/2, H * 0.8);
        vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vigGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, W, H);

        // Cascade screen-wide flash (triggered on combo 3+)
        if (cascadeFlashAlpha > 0) {
            ctx.fillStyle = `rgba(255,215,0,${cascadeFlashAlpha * 0.12})`;
            ctx.fillRect(0, 0, W, H);
            cascadeFlashAlpha = Math.max(0, cascadeFlashAlpha - 0.03);
        }
    }

    function drawGrid() {
        const ox = gs(GRID_X), oy = gs(GRID_Y);
        const cellS = gs(CELL);

        // Grid background with subtle golden border
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.roundRect(ox - gs(4), oy - gs(4), gs(COLS * CELL) + gs(8), gs(ROWS * CELL) + gs(8), gs(6));
        ctx.fill();

        ctx.strokeStyle = 'rgba(200,170,80,0.3)';
        ctx.lineWidth = gs(1.5);
        ctx.beginPath();
        ctx.roundRect(ox - gs(4), oy - gs(4), gs(COLS * CELL) + gs(8), gs(ROWS * CELL) + gs(8), gs(6));
        ctx.stroke();

        // Grid lines
        ctx.strokeStyle = 'rgba(200,170,80,0.08)';
        ctx.lineWidth = gs(0.5);
        for (let r = 0; r <= ROWS; r++) {
            ctx.beginPath();
            ctx.moveTo(ox, oy + r * cellS);
            ctx.lineTo(ox + COLS * cellS, oy + r * cellS);
            ctx.stroke();
        }
        for (let c = 0; c <= COLS; c++) {
            ctx.beginPath();
            ctx.moveTo(ox + c * cellS, oy);
            ctx.lineTo(ox + c * cellS, oy + ROWS * cellS);
            ctx.stroke();
        }
    }

    function drawGems() {
        const ox = gs(GRID_X), oy = gs(GRID_Y);
        const cellS = gs(CELL);

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const gem = grid[r][c];
                if (gem.color < 0) continue;

                let drawX = ox + c * cellS;
                let drawY = oy + gs(gem.y) + gs(gem.bounceY);

                // Swap animation offset with overshoot bounce
                if (swapAnim && state === ST_SWAP) {
                    const raw = swapAnim.progress;
                    // Overshoot bounce: goes to ~1.12 then settles to 1.0
                    const t = swapAnim.reverting ? easeInOut(raw) : easeOutBounceSwap(raw);
                    if (r === swapAnim.r1 && c === swapAnim.c1) {
                        const dx = (swapAnim.c2 - swapAnim.c1) * cellS * t;
                        const dy = (swapAnim.r2 - swapAnim.r1) * cellS * t;
                        if (swapAnim.reverting) {
                            drawX += dx * (1 - raw);
                            drawY += dy * (1 - raw);
                        } else {
                            drawX += dx;
                            drawY += dy;
                        }
                    } else if (r === swapAnim.r2 && c === swapAnim.c2) {
                        const dx = (swapAnim.c1 - swapAnim.c2) * cellS * t;
                        const dy = (swapAnim.r1 - swapAnim.r2) * cellS * t;
                        if (swapAnim.reverting) {
                            drawX += dx * (1 - raw);
                            drawY += dy * (1 - raw);
                        } else {
                            drawX += dx;
                            drawY += dy;
                        }
                    }
                }

                // Selection highlight
                if (selected && selected.row === r && selected.col === c) {
                    const pulse = Math.sin(frameCount * 0.15) * 0.15 + 0.85;
                    ctx.strokeStyle = playerColor || '#FFD700';
                    ctx.lineWidth = gs(2.5);
                    ctx.globalAlpha = pulse;
                    ctx.beginPath();
                    ctx.roundRect(drawX + gs(2), drawY + gs(2), cellS - gs(4), cellS - gs(4), gs(4));
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                }

                // Remove flash
                let alpha = gem.alpha;
                if (gem.removing) {
                    alpha *= (Math.sin(frameCount * 0.5) * 0.3 + 0.7);
                }

                // Clip to grid area
                ctx.save();
                ctx.beginPath();
                ctx.rect(ox, oy, gs(COLS * CELL), gs(ROWS * CELL));
                ctx.clip();

                drawGem(drawX + gs(2), drawY + gs(2), cellS - gs(4), gem.color, gem.special, alpha, gem.sparkle, gem.frozen);

                ctx.restore();
            }
        }

        // Keyboard cursor
        if (cursor && state === ST_PLAY) {
            const pulse = Math.sin(frameCount * 0.12) * 0.2 + 0.8;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = gs(2);
            ctx.globalAlpha = pulse;
            ctx.setLineDash([gs(4), gs(4)]);
            ctx.beginPath();
            ctx.roundRect(
                ox + cursor.col * cellS + gs(1),
                oy + cursor.row * cellS + gs(1),
                cellS - gs(2), cellS - gs(2), gs(4)
            );
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        }
    }

    function drawHUD() {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Title area
        ctx.font = 'bold ' + gs(16) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = gs(8);
        ctx.fillText('SPARKLE MATCH', W / 2, gs(8));
        ctx.shadowBlur = 0;

        // Score with bounce on increase
        const sBounce = (combo > 0 && comboTimer > COMBO_DISPLAY_MS * 0.7) ? 1 + Math.sin(frameCount * 0.3) * 0.08 : 1;
        ctx.save();
        ctx.translate(W / 2, gs(28));
        ctx.scale(sBounce, sBounce);
        ctx.font = 'bold ' + gs(20) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = gs(6);
        ctx.fillText(score.toLocaleString(), 0, 0);
        ctx.shadowBlur = 0;
        ctx.restore();

        // Level & Target
        ctx.font = gs(11) + 'px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#C8B8FF';
        ctx.fillText('Level ' + level, gs(GRID_X), gs(56));
        ctx.textAlign = 'right';
        ctx.fillText('Target: ' + levelTarget.toLocaleString(), gs(GRID_X + COLS * CELL), gs(56));

        // Timer bar
        const barX = gs(GRID_X), barY = gs(72);
        const barW = gs(COLS * CELL), barH = gs(10);
        const timeFrac = Math.max(0, timeLeft / TIME_LIMIT);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, gs(5));
        ctx.fill();

        const timeColor = timeFrac > 0.3 ? '#4ADE80' : timeFrac > 0.1 ? '#FBBF24' : '#EF4444';
        const timerGrad = ctx.createLinearGradient(barX, 0, barX + barW * timeFrac, 0);
        timerGrad.addColorStop(0, timeColor);
        timerGrad.addColorStop(1, timeColor + '80');
        ctx.fillStyle = timerGrad;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * timeFrac, barH, gs(5));
        ctx.fill();

        ctx.font = 'bold ' + gs(8) + 'px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(Math.ceil(timeLeft) + 's', barX + barW / 2, barY + gs(1));

        // Magic meter
        const mBarX = gs(GRID_X), mBarY = gs(GRID_Y + ROWS * CELL + 12);
        const mBarW = gs(COLS * CELL), mBarH = gs(16);

        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.roundRect(mBarX - gs(2), mBarY - gs(2), mBarW + gs(4), mBarH + gs(4), gs(8));
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,170,80,0.5)';
        ctx.lineWidth = gs(1);
        ctx.beginPath();
        ctx.roundRect(mBarX - gs(2), mBarY - gs(2), mBarW + gs(4), mBarH + gs(4), gs(8));
        ctx.stroke();

        if (magicMeter > 0) {
            const mGrad = ctx.createLinearGradient(mBarX, 0, mBarX + mBarW * magicMeter, 0);
            mGrad.addColorStop(0, '#C084FC');
            mGrad.addColorStop(0.5, '#FF80C0');
            mGrad.addColorStop(1, '#FFD700');
            ctx.fillStyle = mGrad;
            ctx.beginPath();
            ctx.roundRect(mBarX, mBarY, mBarW * magicMeter, mBarH, gs(6));
            ctx.fill();

            // Shimmer highlight moving across the meter
            const shimmerX = ((frameCount * 2) % (mBarW * magicMeter + gs(40))) + mBarX - gs(20);
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(mBarX, mBarY, mBarW * magicMeter, mBarH, gs(6));
            ctx.clip();
            const shimGrad = ctx.createLinearGradient(shimmerX - gs(15), 0, shimmerX + gs(15), 0);
            shimGrad.addColorStop(0, 'rgba(255,255,255,0)');
            shimGrad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
            shimGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = shimGrad;
            ctx.fillRect(shimmerX - gs(15), mBarY, gs(30), mBarH);
            ctx.restore();

            if (magicReady) {
                // Pulsing golden glow when ready
                const glowPulse = Math.sin(frameCount * 0.12) * 0.4 + 0.6;
                ctx.save();
                ctx.shadowColor = '#FFD700';
                ctx.shadowBlur = gs(14) * glowPulse;
                ctx.globalAlpha = glowPulse;
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = gs(2);
                ctx.beginPath();
                ctx.roundRect(mBarX - gs(1), mBarY - gs(1), mBarW + gs(2), mBarH + gs(2), gs(7));
                ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.globalAlpha = glowPulse * 0.3;
                ctx.fillStyle = '#FFD700';
                ctx.beginPath();
                ctx.roundRect(mBarX, mBarY, mBarW, mBarH, gs(6));
                ctx.fill();
                ctx.restore();
            }
        }

        ctx.font = 'bold ' + gs(9) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = magicReady ? '#FFD700' : '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(magicReady ? 'PRESS SPACE \u2014 MAGIC BURST!' : 'Magic', mBarX + mBarW / 2, mBarY + gs(1));

        // Combo display
        if (comboTimer > 0 && comboText) {
            const comboAlpha = Math.min(1, comboTimer / 300);
            const comboScale = 1 + (1 - comboAlpha) * 0.3;
            ctx.save();
            ctx.globalAlpha = comboAlpha;
            ctx.translate(W / 2, gs(GRID_Y + ROWS * CELL / 2));
            ctx.scale(comboScale, comboScale);
            ctx.font = 'bold ' + gs(28) + 'px "Segoe UI", sans-serif';
            ctx.fillStyle = '#FFD700';
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = gs(12);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(comboText, 0, 0);
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        ctx.restore();
    }

    function drawParticles() {
        particles.forEach(p => {
            const lifeRatio = p.life / p.maxLife;
            ctx.globalAlpha = lifeRatio;
            const pSize = p.size * SCALE * lifeRatio;

            // Try to draw with sprite particle, fall back to colored shapes
            if (p.spriteImg) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                // Tint the white particle sprite using the particle color
                ctx.drawImage(p.spriteImg, -pSize, -pSize, pSize * 2, pSize * 2);
                // Overlay with color blend
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fillStyle = p.color;
                ctx.globalAlpha = lifeRatio * 0.7;
                ctx.fillRect(-pSize, -pSize, pSize * 2, pSize * 2);
                ctx.globalCompositeOperation = 'source-over';
                ctx.restore();
            } else if (p.sparkle) {
                ctx.fillStyle = p.color;
                drawStarShape(p.x, p.y, pSize, 4);
            } else {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, pSize, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        ctx.globalAlpha = 1;
    }

    function drawScorePopups() {
        scorePopups.forEach(p => {
            const alpha = Math.min(1, p.timer * 2);
            const scale = 1 + (1 - Math.min(1, p.timer * 3)) * 0.2;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(gs(p.x), gs(p.y) - (1 - p.timer) * gs(40));
            ctx.scale(scale, scale);
            ctx.font = 'bold ' + gs(16) + 'px "Segoe UI", sans-serif';
            ctx.fillStyle = p.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = p.color;
            ctx.shadowBlur = gs(6);
            ctx.fillText(p.text, 0, 0);
            ctx.shadowBlur = 0;
            ctx.restore();
        });
    }

    function drawTitle() {
        drawBackground();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Title with glow
        const titlePulse = Math.sin(frameCount * 0.03) * 0.1 + 0.9;
        ctx.font = 'bold ' + gs(36) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = gs(20 * titlePulse);
        ctx.fillText('SPARKLE', W / 2, H * 0.28);
        ctx.font = 'bold ' + gs(28) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = '#FF80C0';
        ctx.shadowColor = '#FF80C0';
        ctx.fillText('MATCH', W / 2, H * 0.35);
        ctx.shadowBlur = 0;

        // Decorative gems on title screen
        const gemPreviewSize = gs(40);
        const startX = W / 2 - gemPreviewSize * 3.5;
        for (let i = 0; i < 7; i++) {
            const bobY = Math.sin(frameCount * 0.04 + i * 0.8) * gs(6);
            drawGem(startX + i * gemPreviewSize, H * 0.42 + bobY, gemPreviewSize, i, SP_NONE, 1, 0, false);
        }

        // Instructions
        ctx.font = gs(14) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = '#C8B8FF';
        ctx.shadowBlur = 0;
        ctx.fillText('Match 3 or more gems to score!', W / 2, H * 0.56);
        ctx.fillText('4 in a row = Star Gem', W / 2, H * 0.61);
        ctx.fillText('5 in a row = Rainbow Gem', W / 2, H * 0.65);
        ctx.fillText('L or T shape = Bomb Gem', W / 2, H * 0.69);

        // Start prompt
        const blink = Math.sin(frameCount * 0.06) * 0.3 + 0.7;
        ctx.globalAlpha = blink;
        ctx.font = 'bold ' + gs(18) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(HAS_TOUCH ? 'TAP TO START' : 'CLICK OR PRESS ENTER', W / 2, H * 0.82);
        ctx.globalAlpha = 1;

        // Controls hint
        ctx.font = gs(10) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = '#8888AA';
        ctx.fillText('Arrow keys + Space to play with keyboard', W / 2, H * 0.9);

        ctx.restore();
    }

    function drawGameOver() {
        // Dim overlay
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Game Over text
        ctx.font = 'bold ' + gs(32) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = '#FF80C0';
        ctx.shadowColor = '#FF80C0';
        ctx.shadowBlur = gs(15);
        ctx.fillText('TIME\'S UP!', W / 2, H * 0.30);
        ctx.shadowBlur = 0;

        // Final score
        ctx.font = 'bold ' + gs(24) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = gs(8);
        ctx.fillText(score.toLocaleString(), W / 2, H * 0.40);
        ctx.shadowBlur = 0;

        ctx.font = gs(14) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = '#C8B8FF';
        ctx.fillText('Level ' + level, W / 2, H * 0.47);

        // Star rating display
        let stars = 1;
        if (score >= 10000) stars = 5;
        else if (score >= 7000) stars = 4;
        else if (score >= 4000) stars = 3;
        else if (score >= 2000) stars = 2;

        drawStarRating(W / 2, H * 0.54, stars, 5, gs(22));

        // Rating text
        let rating = 'Nice Try!';
        if (score >= 10000) rating = 'LEGENDARY!';
        else if (score >= 7000) rating = 'AMAZING!';
        else if (score >= 4000) rating = 'GREAT!';
        else if (score >= 2000) rating = 'Good Job!';

        ctx.font = 'bold ' + gs(18) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(rating, W / 2, H * 0.62);

        // High score
        if (highScore > 0) {
            ctx.font = gs(13) + 'px "Segoe UI", sans-serif';
            ctx.fillStyle = score >= highScore ? '#FFD700' : 'rgba(255,255,255,0.5)';
            ctx.fillText(score >= highScore ? '\u2B50 NEW HIGH SCORE!' : 'Best: ' + highScore.toLocaleString(), W / 2, H * 0.68);
        }

        // Restart
        const blink = Math.sin(frameCount * 0.06) * 0.3 + 0.7;
        ctx.globalAlpha = blink;
        ctx.font = gs(14) + 'px "Segoe UI", sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(HAS_TOUCH ? 'TAP TO PLAY AGAIN' : 'CLICK OR PRESS ENTER', W / 2, H * 0.74);
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    // ── Canvas scaling ──
    function fitCanvas() {
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;
        const pw = parent.clientWidth, ph = parent.clientHeight;
        DPR = window.devicePixelRatio || 1;
        const aspect = GAME_W / GAME_H;
        let cw, ch;
        if (pw / ph > aspect) { ch = ph; cw = ch * aspect; }
        else { cw = pw; ch = cw / aspect; }
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        canvas.width = cw * DPR;
        canvas.height = ch * DPR;
        W = canvas.width;
        H = canvas.height;
        SCALE = W / GAME_W;
    }

    // ── Input ──
    function getGridPos(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) * (W / rect.width) / SCALE;
        const y = (clientY - rect.top) * (H / rect.height) / SCALE;
        const col = Math.floor((x - GRID_X) / CELL);
        const row = Math.floor((y - GRID_Y) / CELL);
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
        return { row, col };
    }

    function onMouseDown(e) {
        e.preventDefault();
        if (state === ST_TITLE) { startGame(); return; }
        if (state === ST_GAMEOVER) { startGame(); return; }
        if (state !== ST_PLAY) return;

        const pos = getGridPos(e.clientX, e.clientY);
        if (!pos) return;

        ensureAudio();

        if (!selected) {
            selected = pos;
            sfxSelect();
        } else {
            const dr = Math.abs(pos.row - selected.row);
            const dc = Math.abs(pos.col - selected.col);
            if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
                trySwap(selected.row, selected.col, pos.row, pos.col);
                selected = null;
            } else {
                selected = pos;
                sfxSelect();
            }
        }
    }

    function onTouchStart(e) {
        e.preventDefault();
        const t = e.touches[0];
        if (state === ST_TITLE) { ensureAudio(); startGame(); return; }
        if (state === ST_GAMEOVER) { startGame(); return; }
        if (state !== ST_PLAY) return;

        touchStart = { x: t.clientX, y: t.clientY, pos: getGridPos(t.clientX, t.clientY) };
        ensureAudio();
    }

    function onTouchEnd(e) {
        e.preventDefault();
        if (state !== ST_PLAY || !touchStart || !touchStart.pos) { touchStart = null; return; }

        const t = e.changedTouches[0];
        const dx = t.clientX - touchStart.x;
        const dy = t.clientY - touchStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 20) {
            let dr = 0, dc = 0;
            if (Math.abs(dx) > Math.abs(dy)) dc = dx > 0 ? 1 : -1;
            else dr = dy > 0 ? 1 : -1;
            trySwap(touchStart.pos.row, touchStart.pos.col, touchStart.pos.row + dr, touchStart.pos.col + dc);
            selected = null;
        } else {
            const pos = touchStart.pos;
            if (!selected) {
                selected = pos;
                sfxSelect();
            } else {
                const ddr = Math.abs(pos.row - selected.row);
                const ddc = Math.abs(pos.col - selected.col);
                if ((ddr === 1 && ddc === 0) || (ddr === 0 && ddc === 1)) {
                    trySwap(selected.row, selected.col, pos.row, pos.col);
                    selected = null;
                } else {
                    selected = pos;
                    sfxSelect();
                }
            }
        }
        touchStart = null;
    }

    function onKeyDown(e) {
        if (state === ST_TITLE || state === ST_GAMEOVER) {
            if (e.key === 'Enter' || e.key === ' ') { ensureAudio(); startGame(); }
            return;
        }
        if (state !== ST_PLAY) return;

        ensureAudio();

        if (!cursor) cursor = { row: 0, col: 0 };

        if (e.key === 'ArrowUp') { cursor.row = Math.max(0, cursor.row - 1); e.preventDefault(); }
        else if (e.key === 'ArrowDown') { cursor.row = Math.min(ROWS - 1, cursor.row + 1); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { cursor.col = Math.max(0, cursor.col - 1); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { cursor.col = Math.min(COLS - 1, cursor.col + 1); e.preventDefault(); }
        else if (e.key === 'Enter') {
            if (!selected) {
                selected = { row: cursor.row, col: cursor.col };
                sfxSelect();
            } else {
                const dr = Math.abs(cursor.row - selected.row);
                const dc = Math.abs(cursor.col - selected.col);
                if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
                    trySwap(selected.row, selected.col, cursor.row, cursor.col);
                    selected = null;
                } else {
                    selected = { row: cursor.row, col: cursor.col };
                    sfxSelect();
                }
            }
            e.preventDefault();
        }
        else if (e.key === ' ' || e.key === 'Spacebar') {
            if (magicReady) doMagicBurst();
            else if (!selected) {
                selected = { row: cursor.row, col: cursor.col };
                sfxSelect();
            } else {
                const dr = Math.abs(cursor.row - selected.row);
                const dc = Math.abs(cursor.col - selected.col);
                if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
                    trySwap(selected.row, selected.col, cursor.row, cursor.col);
                    selected = null;
                } else {
                    selected = { row: cursor.row, col: cursor.col };
                    sfxSelect();
                }
            }
            e.preventDefault();
        }
    }

    // ── Game flow ──
    function startGame() {
        score = 0;
        level = 1;
        combo = 0;
        comboTimer = 0;
        comboText = '';
        timeLeft = TIME_LIMIT;
        magicMeter = 0;
        magicReady = false;
        gemCount = BASE_GEM_COLORS;
        levelTarget = LEVEL_SCORE_BASE;
        selected = null;
        swapAnim = null;
        processing = false;
        particles = [];
        scorePopups = [];
        shakeTimer = 0;
        shakeIntensity = 0;
        matchesFound = false;
        cursor = null;

        initGrid();
        state = ST_PLAY;
        timerStart = performance.now();
    }

    function endGame() {
        state = ST_GAMEOVER;
        if (score > highScore) { highScore = score; saveHighScore(highScore); }
        if (gameOverCB) gameOverCB(score);
    }

    // ── Update ──
    function update(dt) {
        frameCount++;

        if (state === ST_PLAY || state === ST_SWAP || state === ST_MATCH || state === ST_FALL) {
            timeLeft -= dt;
            if (timeLeft <= 0) {
                timeLeft = 0;
                endGame();
                return;
            }
        }

        // Swap animation
        if (state === ST_SWAP && swapAnim) {
            swapAnim.progress += dt / (SWAP_MS / 1000);
            if (swapAnim.progress >= 1) {
                swapAnim.progress = 1;
                if (swapAnim.reverting) {
                    state = ST_PLAY;
                    swapAnim = null;
                } else {
                    swapGems(swapAnim.r1, swapAnim.c1, swapAnim.r2, swapAnim.c2);
                    swapAnim = null;
                    combo = 0;
                    if (!processMatches()) {
                        state = ST_PLAY;
                    }
                }
            }
        }

        // Falling animation
        if (state === ST_FALL) {
            let allSettled = true;
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const gem = grid[r][c];
                    if (Math.abs(gem.y - gem.targetY) > 0.5) {
                        gem.y += (gem.targetY - gem.y) * 0.25;
                        if (Math.abs(gem.y - gem.targetY) < 0.5) {
                            gem.y = gem.targetY;
                            gem.bounceY = -3;
                        }
                        allSettled = false;
                    }
                    if (gem.bounceY !== 0) {
                        gem.bounceY *= 0.85;
                        if (Math.abs(gem.bounceY) < 0.1) gem.bounceY = 0;
                    }
                }
            }
            if (allSettled) {
                checkPostFall();
            }
        }

        // Sparkle decay
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c].sparkle > 0) {
                    grid[r][c].sparkle -= dt * 2;
                    if (grid[r][c].sparkle < 0) grid[r][c].sparkle = 0;
                }
            }
        }

        // Combo timer
        if (comboTimer > 0) {
            comboTimer -= dt * 1000;
        }

        // Shake decay
        if (shakeTimer > 0) {
            shakeTimer -= dt;
        }

        // Particles
        particles.forEach(p => {
            p.x += p.vx * SCALE;
            p.y += p.vy * SCALE;
            p.vy += 0.15;
            p.life -= dt;
            if (p.rotation !== undefined) p.rotation += p.rotSpeed * dt;
        });
        particles = particles.filter(p => p.life > 0);

        // Score popups
        scorePopups.forEach(p => {
            p.timer -= dt;
            p.y -= dt * 20;
        });
        scorePopups = scorePopups.filter(p => p.timer > 0);
    }

    // ── Main loop ──
    function gameLoop(timestamp) {
        if (!gameActive) return;

        if (!lastTime) lastTime = timestamp;
        deltaTime = Math.min((timestamp - lastTime) / 1000, 0.05);
        lastTime = timestamp;

        update(deltaTime);

        // Draw
        ctx.clearRect(0, 0, W, H);

        if (state === ST_TITLE) {
            drawTitle();
        } else if (state === ST_GAMEOVER) {
            ctx.save();
            if (shakeTimer > 0) {
                const sx = (Math.random() - 0.5) * shakeIntensity * SCALE;
                const sy = (Math.random() - 0.5) * shakeIntensity * SCALE;
                ctx.translate(sx, sy);
            }
            drawBackground();
            drawGrid();
            drawGems();
            drawHUD();
            drawParticles();
            drawScorePopups();
            ctx.restore();
            drawGameOver();
        } else {
            ctx.save();
            if (shakeTimer > 0) {
                const sx = (Math.random() - 0.5) * shakeIntensity * SCALE;
                const sy = (Math.random() - 0.5) * shakeIntensity * SCALE;
                ctx.translate(sx, sy);
            }
            drawBackground();
            drawGrid();
            drawGems();
            drawHUD();
            drawParticles();
            drawScorePopups();
            ctx.restore();
        }

        animFrame = requestAnimationFrame(gameLoop);
    }

    // ── Init / Destroy ──
    function init(cvs, playerData, onGameOverCB) {
        canvas = cvs;
        ctx = canvas.getContext('2d');
        activePlayer = playerData;
        gameOverCB = onGameOverCB;
        playerColor = (playerData && playerData.color) || '#FFD700';
        gameActive = true;
        highScore = loadHighScore();
        frameCount = 0;
        lastTime = null;
        state = ST_TITLE;
        particles = [];
        scorePopups = [];
        bgSparkles = [];

        // Events
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', fitCanvas);

        fitCanvas();
        // Create bg sparkles in pixel space after fitCanvas sets W/H
        for (let i = 0; i < 50; i++) {
            bgSparkles.push({
                x: rng(0, W || GAME_W),
                y: rng(0, H || GAME_H),
                speed: rng(0.2, 0.8),
                size: rng(0.5, 2.5),
                alpha: rng(0.15, 0.5),
                phase: rng(0, Math.PI * 2),
                color: pick(['#FFFFFF', '#FFD700', '#FF80C0', '#80DDFF', '#C080FF'])
            });
        }

        // Preload sprites then start game loop
        preloadSprites(() => {
            requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });
            animFrame = requestAnimationFrame(gameLoop);
        });
    }

    function destroy() {
        gameActive = false;
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = null;
        if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
        if (canvas) {
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchend', onTouchEnd);
        }
        document.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', fitCanvas);
    }

    return { init, destroy };
})();
